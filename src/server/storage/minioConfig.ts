export interface MinioEnvConfig {
  provider: 's3' | 'local' | 'gcs';
  endpoint: string;
  region: string;
  bucket: string;
  keyPrefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  quotaBytes: number;
  cdnBaseUrl: string | null;
}

export interface MinioConfigValidation {
  ok: boolean;
  missingFields: string[];
  message: string;
}

export interface ParsedByteRange {
  valid: boolean;
  start: number;
  end: number;
  chunkSize: number;
}

export const DEFAULT_MINIO_QUOTA_BYTES = 53_687_091_200; // 50 GiB
export const MAX_STREAM_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB range window

export function resolveMinioConfig(env: Record<string, string | undefined>): MinioEnvConfig {
  const rawProvider = (env.STORAGE_PROVIDER || 's3').trim().toLowerCase();
  const provider: 's3' | 'local' | 'gcs' =
    env.USE_LOCAL_STORAGE_FALLBACK === 'true'
      ? 'local'
      : rawProvider === 'gcs'
      ? 'gcs'
      : 's3';

  const quotaParsed = Number(env.STORAGE_QUOTA_BYTES);
  const quotaBytes =
    Number.isFinite(quotaParsed) && quotaParsed > 0 ? quotaParsed : DEFAULT_MINIO_QUOTA_BYTES;

  const forcePathStyleRaw = (env.S3_FORCE_PATH_STYLE || 'true').trim().toLowerCase();
  const forcePathStyle = forcePathStyleRaw !== 'false' && forcePathStyleRaw !== '0';

  const rawPrefix = (env.S3_KEY_PREFIX || '').trim().replace(/^\/+|\/+$/g, '');

  return {
    provider,
    endpoint: (env.S3_ENDPOINT || 'http://localhost:9000').trim().replace(/\/+$/, ''),
    region: (env.S3_REGION || 'us-east-1').trim(),
    bucket: (env.S3_BUCKET || 'together-cinema-media').trim(),
    keyPrefix: rawPrefix ? `${rawPrefix}/` : '',
    accessKeyId: (env.S3_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (env.S3_SECRET_ACCESS_KEY || '').trim(),
    forcePathStyle,
    quotaBytes,
    cdnBaseUrl: env.CDN_PLAYBACK_BASE_URL?.trim().replace(/\/+$/, '') || null,
  };
}

export function resolveExpectedPartBytes(
  fileSizeBytes: number,
  chunkSizeBytes: number,
  totalChunks: number,
  partNumber: number,
  headerContentLength: number
): number {
  if (Number.isFinite(headerContentLength) && headerContentLength > 0) {
    return headerContentLength;
  }
  if (partNumber < totalChunks) {
    return chunkSizeBytes;
  }
  const remaining = fileSizeBytes - (totalChunks - 1) * chunkSizeBytes;
  return remaining > 0 ? remaining : 0;
}

export function validateMinioConfig(config: MinioEnvConfig): MinioConfigValidation {
  const missingFields: string[] = [];
  if (!config.endpoint) missingFields.push('S3_ENDPOINT');
  if (!config.region) missingFields.push('S3_REGION');
  if (!config.bucket) missingFields.push('S3_BUCKET');
  if (!config.accessKeyId) missingFields.push('S3_ACCESS_KEY_ID');
  if (!config.secretAccessKey) missingFields.push('S3_SECRET_ACCESS_KEY');

  if (missingFields.length > 0) {
    return {
      ok: false,
      missingFields,
      message: `MinIO S3 storage is selected (${config.endpoint || 'no endpoint'}) but requires environment secret(s): ${missingFields.join(', ')}.`,
    };
  }

  try {
    const parsed = new URL(config.endpoint);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        missingFields: ['S3_ENDPOINT'],
        message: 'S3_ENDPOINT must start with http:// or https://.',
      };
    }
  } catch {
    return {
      ok: false,
      missingFields: ['S3_ENDPOINT'],
      message: `S3_ENDPOINT "${config.endpoint}" is not a valid URL.`,
    };
  }

  return {
    ok: true,
    missingFields: [],
    message: `MinIO S3 storage configured (${config.endpoint}/${config.bucket}).`,
  };
}

export function parseByteRangeHeader(rangeHeader: string | undefined, totalSize: number): ParsedByteRange {
  if (!rangeHeader || !Number.isFinite(totalSize) || totalSize <= 0) {
    return {
      valid: true,
      start: 0,
      end: Math.max(0, totalSize - 1),
      chunkSize: Math.max(0, totalSize),
    };
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return { valid: false, start: 0, end: 0, chunkSize: 0 };
  }

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (!rawStart && rawEnd) {
    // Suffix byte range: bytes=-500
    const suffixLen = parseInt(rawEnd, 10);
    if (Number.isNaN(suffixLen) || suffixLen <= 0) {
      return { valid: false, start: 0, end: 0, chunkSize: 0 };
    }
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else {
    start = parseInt(rawStart, 10);
    if (Number.isNaN(start) || start < 0 || start >= totalSize) {
      return { valid: false, start: 0, end: 0, chunkSize: 0 };
    }
    if (rawEnd) {
      end = Math.min(parseInt(rawEnd, 10), totalSize - 1);
    } else {
      end = Math.min(start + MAX_STREAM_CHUNK_BYTES - 1, totalSize - 1);
    }
  }

  if (Number.isNaN(end) || start > end || end >= totalSize) {
    return { valid: false, start: 0, end: 0, chunkSize: 0 };
  }

  return {
    valid: true,
    start,
    end,
    chunkSize: end - start + 1,
  };
}

export function formatS3ErrorMessage(err: unknown, endpoint: string, bucket: string): string {
  const e = err as { name?: string; code?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const code = e?.Code || e?.code || e?.name || '';
  const msg = e?.message || 'Unknown S3/MinIO error';
  const status = e?.$metadata?.httpStatusCode;

  if (code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed|connect ETIMEDOUT|ENOTFOUND/i.test(msg)) {
    return `Unable to reach MinIO server at ${endpoint}. Verify MinIO is running and reachable from this backend.`;
  }
  if (code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch' || status === 403) {
    return `MinIO rejected S3 credentials or bucket permissions for "${bucket}". Verify S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.`;
  }
  if (code === 'NoSuchBucket' || status === 404) {
    return `MinIO bucket "${bucket}" was not found at ${endpoint}. Create the bucket or grant s3:CreateBucket permission.`;
  }
  if (code === 'EntityTooSmall') {
    return 'Chunk part is smaller than MinIO minimum 5 MiB part size for non-final parts.';
  }
  return `MinIO S3 storage error (${code || status || 'error'}): ${msg}`;
}
