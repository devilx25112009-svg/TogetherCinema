import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  formatS3ErrorMessage,
  parseByteRangeHeader,
  resolveExpectedPartBytes,
  resolveMinioConfig,
  validateMinioConfig,
  type MinioEnvConfig,
} from './minioConfig';

export interface StorageConfigStatus {
  provider: 'local' | 's3' | 'gcs';
  configured: boolean;
  quotaBytes: number;
  usedBytes: number;
  cdnBaseUrl: string | null;
  message: string;
  endpoint?: string;
  bucket?: string;
}

export interface CreateUploadSessionInput {
  sessionId: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  chunkSizeBytes: number;
  totalChunks: number;
}

export interface StoredUploadSession {
  sessionId: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  chunkSizeBytes: number;
  totalChunks: number;
  uploadedParts: number[];
  uploadedBytes: number;
  status: 'uploading' | 'paused' | 'completed' | 'aborted' | 'failed';
  storageKey: string;
  provider: 'local' | 's3' | 'gcs';
  s3UploadId?: string;
  partSizes?: Record<number, number>;
  partETags?: Record<number, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectStreamResult {
  stream: Readable;
  statusCode: 200 | 206;
  contentType: string;
  contentLength: number;
  contentRange?: string;
  totalSize: number;
}

export interface StorageProvider {
  getConfigStatus(): Promise<StorageConfigStatus>;
  createUploadSession(input: CreateUploadSessionInput): Promise<StoredUploadSession>;
  uploadPart(
    sessionId: string,
    partNumber: number,
    stream: Readable,
    byteLength: number
  ): Promise<StoredUploadSession>;
  getUploadStatus(sessionId: string): Promise<StoredUploadSession | null>;
  listSessions(ownerId?: string): Promise<StoredUploadSession[]>;
  resumeUpload(sessionId: string): Promise<StoredUploadSession | null>;
  completeUpload(sessionId: string): Promise<{ session: StoredUploadSession; verifiedBytes: number }>;
  abortUpload(sessionId: string): Promise<void>;
  getSignedPlaybackUrl(storageKey: string, ttlSeconds?: number): string;
  verifyPlaybackToken(storageKey: string, expires: string, sig: string): boolean;
  getInspectionTarget(storageKey: string): Promise<string | null>;
  openObjectStream(storageKey: string, rangeHeader?: string): Promise<ObjectStreamResult | null>;
  getObjectPath(storageKey: string): string | null;
  deleteObject(storageKey: string): Promise<void>;
}

function getSigningSecret(): string {
  return process.env.MEDIA_SIGNING_SECRET || 'together-cinema-dev-signing-secret';
}

function inferContentTypeFromKey(storageKey: string): string {
  const ext = path.extname(storageKey).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.ogv') return 'video/ogg';
  if (ext === '.avi') return 'video/x-msvideo';
  if (ext === '.wmv') return 'video/x-ms-wmv';
  return 'video/mp4';
}

function signPlaybackPath(storageKey: string, ttlSeconds = 7200, cdnBaseUrl?: string | null): string {
  const expires = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  const payload = `${storageKey}:${expires}`;
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  const base = (cdnBaseUrl || process.env.CDN_PLAYBACK_BASE_URL || '').replace(/\/$/, '');
  return `${base}/api/media/stream/${encodeURIComponent(storageKey)}?expires=${expires}&sig=${sig}`;
}

function verifyHmacPlaybackToken(storageKey: string, expires: string, sig: string): boolean {
  const expNum = Number(expires);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${storageKey}:${expires}`)
    .digest('hex');
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function createSessionMutex() {
  const tails = new Map<string, Promise<void>>();
  return async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = tails.get(sessionId) || Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((res) => {
      release = res;
    });
    tails.set(sessionId, next);
    try {
      await prev;
      return await fn();
    } finally {
      release();
      if (tails.get(sessionId) === next) {
        tails.delete(sessionId);
      }
    }
  };
}

// =============================================================================
// 1. Primary Storage Adapter: Self-Hosted MinIO / S3-Compatible Object Storage
// =============================================================================
export class MinioS3StorageAdapter implements StorageProvider {
  private config: MinioEnvConfig;
  private sessionsDir: string;
  private s3: S3Client | null = null;
  private withSessionLock = createSessionMutex();

  constructor(env: Record<string, string | undefined> = process.env, clientOverride?: S3Client) {
    this.config = resolveMinioConfig(env);
    const metaRoot = path.resolve(env.LOCAL_STORAGE_DIR || '.cinema-storage');
    this.sessionsDir = path.join(metaRoot, 's3-sessions');
    fs.mkdirSync(this.sessionsDir, { recursive: true });

    if (clientOverride) {
      this.s3 = clientOverride;
      return;
    }

    const validation = validateMinioConfig(this.config);
    if (validation.ok) {
      this.s3 = new S3Client({
        endpoint: this.config.endpoint,
        region: this.config.region,
        forcePathStyle: this.config.forcePathStyle,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        maxAttempts: 3,
      });
    }
  }

  private getClient(): S3Client {
    if (this.s3) return this.s3;
    const validation = validateMinioConfig(this.config);
    throw new Error(validation.message);
  }

  private sessionMetaPath(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(this.sessionsDir, `${safe}.json`);
  }

  private async readSession(sessionId: string): Promise<StoredUploadSession | null> {
    try {
      const raw = await fsp.readFile(this.sessionMetaPath(sessionId), 'utf8');
      return JSON.parse(raw) as StoredUploadSession;
    } catch {
      return null;
    }
  }

  private async writeSession(session: StoredUploadSession): Promise<void> {
    await fsp.writeFile(this.sessionMetaPath(session.sessionId), JSON.stringify(session, null, 2), 'utf8');
  }

  private async ensureBucketExists(client: S3Client): Promise<void> {
    try {
      await client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
        { abortSignal: AbortSignal.timeout(3500) }
      );
    } catch (err) {
      const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
      if (e?.Code === 'NoSuchBucket' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) {
        await client.send(
          new CreateBucketCommand({ Bucket: this.config.bucket }),
          { abortSignal: AbortSignal.timeout(3500) }
        );
      } else {
        throw err;
      }
    }
  }

  private async listAllMinioParts(
    client: S3Client,
    storageKey: string,
    uploadId: string
  ): Promise<Array<{ PartNumber: number; ETag: string; Size: number }>> {
    const collected: Array<{ PartNumber: number; ETag: string; Size: number }> = [];
    let marker: string | undefined;

    for (let page = 0; page < 50; page++) {
      const res = await client.send(
        new ListPartsCommand({
          Bucket: this.config.bucket,
          Key: storageKey,
          UploadId: uploadId,
          PartNumberMarker: marker,
        })
      );
      for (const p of res.Parts || []) {
        if (p.PartNumber && p.ETag) {
          collected.push({
            PartNumber: p.PartNumber,
            ETag: p.ETag,
            Size: Number(p.Size || 0),
          });
        }
      }
      if (!res.IsTruncated || !res.NextPartNumberMarker) break;
      marker = String(res.NextPartNumberMarker);
    }

    collected.sort((a, b) => a.PartNumber - b.PartNumber);
    return collected;
  }

  async getConfigStatus(): Promise<StorageConfigStatus> {
    const validation = validateMinioConfig(this.config);
    if (!validation.ok || !this.s3) {
      return {
        provider: 's3',
        configured: false,
        quotaBytes: this.config.quotaBytes,
        usedBytes: 0,
        cdnBaseUrl: this.config.cdnBaseUrl,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket,
        message: validation.message,
      };
    }

    try {
      await this.ensureBucketExists(this.s3);

      let usedBytes = 0;
      let continuationToken: string | undefined;
      for (let page = 0; page < 10; page++) {
        const listed = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            ContinuationToken: continuationToken,
          }),
          { abortSignal: AbortSignal.timeout(3500) }
        );
        for (const obj of listed.Contents || []) {
          usedBytes += Number(obj.Size || 0);
        }
        if (!listed.IsTruncated || !listed.NextContinuationToken) break;
        continuationToken = listed.NextContinuationToken;
      }

      return {
        provider: 's3',
        configured: true,
        quotaBytes: this.config.quotaBytes,
        usedBytes,
        cdnBaseUrl: this.config.cdnBaseUrl,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket,
        message: `MinIO S3 storage active (${this.config.endpoint}/${this.config.bucket}).`,
      };
    } catch (err) {
      return {
        provider: 's3',
        configured: false,
        quotaBytes: this.config.quotaBytes,
        usedBytes: 0,
        cdnBaseUrl: this.config.cdnBaseUrl,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket,
        message: formatS3ErrorMessage(err, this.config.endpoint, this.config.bucket),
      };
    }
  }

  async createUploadSession(input: CreateUploadSessionInput): Promise<StoredUploadSession> {
    const client = this.getClient();
    const safeId = input.sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeOwner = input.ownerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFileName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${this.config.keyPrefix}movies-${safeOwner}-${safeId}_${safeFileName}`;

    try {
      await this.ensureBucketExists(client);
      const created = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: storageKey,
          ContentType: input.mimeType || inferContentTypeFromKey(safeFileName),
          Metadata: {
            ownerid: input.ownerId,
            sessionid: safeId,
          },
        })
      );

      if (!created.UploadId) {
        throw new Error('MinIO did not return an UploadId for multipart upload.');
      }

      const now = new Date().toISOString();
      const session: StoredUploadSession = {
        sessionId: safeId,
        ownerId: input.ownerId,
        fileName: input.fileName,
        mimeType: input.mimeType || inferContentTypeFromKey(safeFileName),
        fileSizeBytes: input.fileSizeBytes,
        chunkSizeBytes: input.chunkSizeBytes,
        totalChunks: input.totalChunks,
        uploadedParts: [],
        uploadedBytes: 0,
        status: 'uploading',
        storageKey,
        provider: 's3',
        s3UploadId: created.UploadId,
        createdAt: now,
        updatedAt: now,
      };

      await this.writeSession(session);
      return session;
    } catch (err) {
      throw new Error(formatS3ErrorMessage(err, this.config.endpoint, this.config.bucket));
    }
  }

  async uploadPart(
    sessionId: string,
    partNumber: number,
    stream: Readable,
    byteLength: number
  ): Promise<StoredUploadSession> {
    const client = this.getClient();
    const session = await this.readSession(sessionId);
    if (!session || !session.s3UploadId) {
      throw new Error('Upload session not found.');
    }
    if (session.status === 'aborted' || session.status === 'completed') {
      throw new Error(`Cannot upload part when session is ${session.status}.`);
    }
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.totalChunks) {
      throw new Error(`Invalid part number ${partNumber}. Expected 1..${session.totalChunks}.`);
    }
    const resolvedLength = resolveExpectedPartBytes(
      session.fileSizeBytes,
      session.chunkSizeBytes,
      session.totalChunks,
      partNumber,
      byteLength
    );
    if (!Number.isFinite(resolvedLength) || resolvedLength <= 0) {
      throw new Error('Missing or invalid Content-Length for streamed MinIO chunk part.');
    }

    try {
      // Stream this single chunk straight to MinIO without loading the full video into server RAM
      const uploadRes = await client.send(
        new UploadPartCommand({
          Bucket: this.config.bucket,
          Key: session.storageKey,
          UploadId: session.s3UploadId,
          PartNumber: partNumber,
          Body: stream,
          ContentLength: resolvedLength,
        })
      );

      return await this.withSessionLock(sessionId, async () => {
        const latest = (await this.readSession(sessionId)) || session;
        const partSizes = { ...(latest.partSizes || {}), [partNumber]: resolvedLength };
        const partETags = { ...(latest.partETags || {}) };
        if (uploadRes.ETag) {
          partETags[partNumber] = uploadRes.ETag;
        }
        const uploadedParts = Object.keys(partSizes)
          .map((n) => Number(n))
          .sort((a, b) => a - b);
        const uploadedBytes = Object.values(partSizes).reduce((acc, s) => acc + Number(s || 0), 0);

        latest.partSizes = partSizes;
        latest.partETags = partETags;
        latest.uploadedParts = uploadedParts;
        latest.uploadedBytes = uploadedBytes;
        latest.status = 'uploading';
        latest.updatedAt = new Date().toISOString();
        await this.writeSession(latest);
        return latest;
      });
    } catch (err) {
      throw new Error(formatS3ErrorMessage(err, this.config.endpoint, this.config.bucket));
    }
  }

  async getUploadStatus(sessionId: string): Promise<StoredUploadSession | null> {
    const session = await this.readSession(sessionId);
    if (!session) return null;

    if ((session.status === 'uploading' || session.status === 'paused') && session.s3UploadId && this.s3) {
      try {
        const parts = await this.listAllMinioParts(this.s3, session.storageKey, session.s3UploadId);
        session.uploadedParts = parts.map((p) => p.PartNumber);
        session.uploadedBytes = parts.reduce((acc, p) => acc + p.Size, 0);
        session.updatedAt = new Date().toISOString();
        await this.writeSession(session);
      } catch {
        // Keep last persisted session snapshot if MinIO is momentarily unreachable
      }
    }
    return session;
  }

  async listSessions(ownerId?: string): Promise<StoredUploadSession[]> {
    try {
      const files = await fsp.readdir(this.sessionsDir);
      const list: StoredUploadSession[] = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const raw = await fsp.readFile(path.join(this.sessionsDir, f), 'utf8').catch(() => '');
        if (!raw) continue;
        const parsed = JSON.parse(raw) as StoredUploadSession;
        if (!ownerId || parsed.ownerId === ownerId) {
          list.push(parsed);
        }
      }
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  async resumeUpload(sessionId: string): Promise<StoredUploadSession | null> {
    const session = await this.getUploadStatus(sessionId);
    if (!session) return null;
    if (session.status === 'paused') {
      session.status = 'uploading';
      session.updatedAt = new Date().toISOString();
      await this.writeSession(session);
    }
    return session;
  }

  async completeUpload(sessionId: string): Promise<{ session: StoredUploadSession; verifiedBytes: number }> {
    const client = this.getClient();
    const session = await this.readSession(sessionId);
    if (!session || !session.s3UploadId) {
      throw new Error('Upload session not found.');
    }

    try {
      const partETags = session.partETags || {};
      let parts: Array<{ PartNumber: number; ETag: string; Size: number }> = [];
      let allCached = true;
      for (let i = 1; i <= session.totalChunks; i++) {
        const etag = partETags[i];
        if (!etag) {
          allCached = false;
          break;
        }
        parts.push({
          PartNumber: i,
          ETag: etag,
          Size: Number(session.partSizes?.[i] || 0),
        });
      }

      if (!allCached) {
        parts = await this.listAllMinioParts(client, session.storageKey, session.s3UploadId);
      }

      const partMap = new Map(parts.map((p) => [p.PartNumber, p]));
      const missing: number[] = [];
      for (let i = 1; i <= session.totalChunks; i++) {
        if (!partMap.has(i)) missing.push(i);
      }
      if (missing.length > 0) {
        throw new Error(
          `Cannot complete MinIO upload: missing ${missing.length} part(s) (first missing: #${missing[0]}).`
        );
      }

      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: session.storageKey,
          UploadId: session.s3UploadId,
          MultipartUpload: {
            Parts: parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
          },
        })
      );

      const head = await client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: session.storageKey,
        })
      );
      const verifiedBytes = Number(head.ContentLength ?? session.fileSizeBytes);
      if (verifiedBytes !== session.fileSizeBytes) {
        throw new Error(
          `Integrity check failed: MinIO object size ${verifiedBytes} bytes does not match expected ${session.fileSizeBytes} bytes.`
        );
      }

      session.status = 'completed';
      session.uploadedParts = parts.map((p) => p.PartNumber);
      session.uploadedBytes = verifiedBytes;
      session.updatedAt = new Date().toISOString();
      await this.writeSession(session);

      return { session, verifiedBytes };
    } catch (err) {
      throw new Error(formatS3ErrorMessage(err, this.config.endpoint, this.config.bucket));
    }
  }

  async abortUpload(sessionId: string): Promise<void> {
    const session = await this.readSession(sessionId);
    if (!session) return;

    if (session.s3UploadId && this.s3 && session.status !== 'completed') {
      await this.s3
        .send(
          new AbortMultipartUploadCommand({
            Bucket: this.config.bucket,
            Key: session.storageKey,
            UploadId: session.s3UploadId,
          })
        )
        .catch(() => {});
    }

    session.status = 'aborted';
    session.updatedAt = new Date().toISOString();
    await this.writeSession(session);
  }

  getSignedPlaybackUrl(storageKey: string, ttlSeconds = 7200): string {
    return signPlaybackPath(storageKey, ttlSeconds, this.config.cdnBaseUrl);
  }

  verifyPlaybackToken(storageKey: string, expires: string, sig: string): boolean {
    return verifyHmacPlaybackToken(storageKey, expires, sig);
  }

  async getInspectionTarget(storageKey: string): Promise<string | null> {
    if (!this.s3) return null;
    try {
      // Short-lived AWS SigV4 presigned URL lets ffprobe read only the header atoms over HTTP range
      return await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: storageKey,
        }),
        { expiresIn: 600 }
      );
    } catch {
      return null;
    }
  }

  async openObjectStream(storageKey: string, rangeHeader?: string): Promise<ObjectStreamResult | null> {
    const client = this.getClient();
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: storageKey,
      })
    );
    const totalSize = Number(head.ContentLength || 0);
    const contentType = head.ContentType || inferContentTypeFromKey(storageKey);

    if (rangeHeader) {
      const parsed = parseByteRangeHeader(rangeHeader, totalSize);
      if (!parsed.valid) {
        throw Object.assign(new Error('Requested range not satisfiable'), { statusCode: 416, totalSize });
      }
      const res = await client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: storageKey,
          Range: `bytes=${parsed.start}-${parsed.end}`,
        })
      );
      if (!res.Body) return null;
      return {
        stream: res.Body as Readable,
        statusCode: 206,
        contentType,
        contentLength: parsed.chunkSize,
        contentRange: `bytes ${parsed.start}-${parsed.end}/${totalSize}`,
        totalSize,
      };
    }

    const res = await client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: storageKey,
      })
    );
    if (!res.Body) return null;
    return {
      stream: res.Body as Readable,
      statusCode: 200,
      contentType,
      contentLength: totalSize,
      totalSize,
    };
  }

  getObjectPath(): string | null {
    return null;
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (!this.s3) return;
    await this.s3
      .send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: storageKey,
        })
      )
      .catch(() => {});
  }
}

// =============================================================================
// 2. Zero-Config Chunked Multipart Storage Adapter (Auto-active without S3 keys)
// =============================================================================
export class LocalChunkedStorageAdapter implements StorageProvider {
  private baseDir: string;
  private sessionsDir: string;
  private objectsDir: string;
  private quotaBytes: number;
  private withSessionLock = createSessionMutex();

  constructor(baseDir?: string, quotaBytes?: number) {
    this.baseDir = path.resolve(baseDir || process.env.LOCAL_STORAGE_DIR || '.cinema-storage');
    this.sessionsDir = path.join(this.baseDir, 'sessions');
    this.objectsDir = path.join(this.baseDir, 'objects');
    this.quotaBytes = Number(quotaBytes || process.env.STORAGE_QUOTA_BYTES || 53_687_091_200);
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    fs.mkdirSync(this.objectsDir, { recursive: true });
  }

  private sessionMetaPath(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(this.sessionsDir, safe, 'session.json');
  }

  private partPath(sessionId: string, partNumber: number): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(this.sessionsDir, safe, `part-${String(partNumber).padStart(6, '0')}`);
  }

  async getUsedBytes(): Promise<number> {
    try {
      const files = await fsp.readdir(this.objectsDir);
      let total = 0;
      for (const file of files) {
        const stat = await fsp.stat(path.join(this.objectsDir, file));
        if (stat.isFile()) total += stat.size;
      }
      return total;
    } catch {
      return 0;
    }
  }

  async getConfigStatus(): Promise<StorageConfigStatus> {
    const usedBytes = await this.getUsedBytes();
    return {
      provider: 'local',
      configured: true,
      quotaBytes: this.quotaBytes,
      usedBytes,
      cdnBaseUrl: process.env.CDN_PLAYBACK_BASE_URL || null,
      message: 'Local chunked multipart storage adapter active (supports byte-range streaming and resumable uploads).',
    };
  }

  async createUploadSession(input: CreateUploadSessionInput): Promise<StoredUploadSession> {
    const safeId = input.sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
    const sessionDir = path.join(this.sessionsDir, safeId);
    await fsp.mkdir(sessionDir, { recursive: true });

    const safeFileName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${safeId}_${safeFileName}`;
    const now = new Date().toISOString();

    const session: StoredUploadSession = {
      sessionId: safeId,
      ownerId: input.ownerId,
      fileName: input.fileName,
      mimeType: input.mimeType || 'video/mp4',
      fileSizeBytes: input.fileSizeBytes,
      chunkSizeBytes: input.chunkSizeBytes,
      totalChunks: input.totalChunks,
      uploadedParts: [],
      uploadedBytes: 0,
      status: 'uploading',
      storageKey,
      provider: 'local',
      createdAt: now,
      updatedAt: now,
    };

    await fsp.writeFile(this.sessionMetaPath(safeId), JSON.stringify(session, null, 2), 'utf8');
    return session;
  }

  async getUploadStatus(sessionId: string): Promise<StoredUploadSession | null> {
    try {
      const raw = await fsp.readFile(this.sessionMetaPath(sessionId), 'utf8');
      return JSON.parse(raw) as StoredUploadSession;
    } catch {
      return null;
    }
  }

  async listSessions(ownerId?: string): Promise<StoredUploadSession[]> {
    try {
      const dirs = await fsp.readdir(this.sessionsDir);
      const list: StoredUploadSession[] = [];
      for (const dir of dirs) {
        const s = await this.getUploadStatus(dir);
        if (s && (!ownerId || s.ownerId === ownerId)) {
          list.push(s);
        }
      }
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  async uploadPart(
    sessionId: string,
    partNumber: number,
    stream: Readable,
    _byteLength: number
  ): Promise<StoredUploadSession> {
    const session = await this.getUploadStatus(sessionId);
    if (!session) {
      throw new Error('Upload session not found.');
    }
    if (session.status === 'aborted' || session.status === 'completed') {
      throw new Error(`Cannot upload part when session is ${session.status}.`);
    }
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.totalChunks) {
      throw new Error(`Invalid part number ${partNumber}. Expected 1..${session.totalChunks}.`);
    }

    const targetFile = this.partPath(sessionId, partNumber);
    const writeStream = fs.createWriteStream(targetFile);
    await pipeline(stream, writeStream);
    const stat = await fsp.stat(targetFile);

    return await this.withSessionLock(sessionId, async () => {
      const latest = (await this.getUploadStatus(sessionId)) || session;
      const partSizes = { ...(latest.partSizes || {}), [partNumber]: stat.size };
      const uploadedParts = Object.keys(partSizes)
        .map((n) => Number(n))
        .sort((a, b) => a - b);
      const uploadedBytes = Object.values(partSizes).reduce((acc, s) => acc + Number(s || 0), 0);

      latest.partSizes = partSizes;
      latest.uploadedParts = uploadedParts;
      latest.uploadedBytes = uploadedBytes;
      latest.status = 'uploading';
      latest.updatedAt = new Date().toISOString();

      await fsp.writeFile(this.sessionMetaPath(sessionId), JSON.stringify(latest, null, 2), 'utf8');
      return latest;
    });
  }

  async resumeUpload(sessionId: string): Promise<StoredUploadSession | null> {
    const session = await this.getUploadStatus(sessionId);
    if (!session) return null;
    if (session.status === 'paused') {
      session.status = 'uploading';
      session.updatedAt = new Date().toISOString();
      await fsp.writeFile(this.sessionMetaPath(sessionId), JSON.stringify(session, null, 2), 'utf8');
    }
    return session;
  }

  async completeUpload(sessionId: string): Promise<{ session: StoredUploadSession; verifiedBytes: number }> {
    const session = await this.getUploadStatus(sessionId);
    if (!session) {
      throw new Error('Upload session not found.');
    }

    const missing: number[] = [];
    const uploadedSet = new Set(session.uploadedParts);
    for (let i = 1; i <= session.totalChunks; i++) {
      if (!uploadedSet.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      throw new Error(`Cannot complete upload: missing ${missing.length} part(s) (first missing: #${missing[0]}).`);
    }

    const destPath = path.join(this.objectsDir, session.storageKey);
    const out = fs.createWriteStream(destPath);

    try {
      for (let i = 1; i <= session.totalChunks; i++) {
        const partFile = this.partPath(sessionId, i);
        await new Promise<void>((resolve, reject) => {
          const rs = fs.createReadStream(partFile);
          rs.on('error', reject);
          rs.on('end', resolve);
          rs.pipe(out, { end: false });
        });
      }
      await new Promise<void>((resolve, reject) => {
        out.on('error', reject);
        out.end(() => resolve());
      });
    } catch (err) {
      out.destroy();
      throw err;
    }

    const finalStat = await fsp.stat(destPath);
    if (finalStat.size !== session.fileSizeBytes) {
      throw new Error(
        `Integrity check failed: assembled size ${finalStat.size} bytes does not match expected ${session.fileSizeBytes} bytes.`
      );
    }

    for (let i = 1; i <= session.totalChunks; i++) {
      await fsp.rm(this.partPath(sessionId, i), { force: true });
    }

    session.status = 'completed';
    session.uploadedBytes = finalStat.size;
    session.updatedAt = new Date().toISOString();
    await fsp.writeFile(this.sessionMetaPath(sessionId), JSON.stringify(session, null, 2), 'utf8');

    return { session, verifiedBytes: finalStat.size };
  }

  async abortUpload(sessionId: string): Promise<void> {
    const session = await this.getUploadStatus(sessionId);
    if (!session) return;
    const sessionDir = path.dirname(this.sessionMetaPath(sessionId));
    const entries = await fsp.readdir(sessionDir).catch(() => []);
    for (const entry of entries) {
      if (entry.startsWith('part-')) {
        await fsp.rm(path.join(sessionDir, entry), { force: true });
      }
    }
    session.status = 'aborted';
    session.updatedAt = new Date().toISOString();
    await fsp.writeFile(this.sessionMetaPath(sessionId), JSON.stringify(session, null, 2), 'utf8');
  }

  getSignedPlaybackUrl(storageKey: string, ttlSeconds = 7200): string {
    return signPlaybackPath(storageKey, ttlSeconds);
  }

  verifyPlaybackToken(storageKey: string, expires: string, sig: string): boolean {
    return verifyHmacPlaybackToken(storageKey, expires, sig);
  }

  async getInspectionTarget(storageKey: string): Promise<string | null> {
    return this.getObjectPath(storageKey);
  }

  async openObjectStream(storageKey: string, rangeHeader?: string): Promise<ObjectStreamResult | null> {
    const filePath = this.getObjectPath(storageKey);
    if (!filePath || !fs.existsSync(filePath)) return null;

    const stat = await fsp.stat(filePath);
    const totalSize = stat.size;
    const contentType = inferContentTypeFromKey(filePath);

    if (rangeHeader) {
      const parsed = parseByteRangeHeader(rangeHeader, totalSize);
      if (!parsed.valid) {
        throw Object.assign(new Error('Requested range not satisfiable'), { statusCode: 416, totalSize });
      }
      return {
        stream: fs.createReadStream(filePath, { start: parsed.start, end: parsed.end }),
        statusCode: 206,
        contentType,
        contentLength: parsed.chunkSize,
        contentRange: `bytes ${parsed.start}-${parsed.end}/${totalSize}`,
        totalSize,
      };
    }

    return {
      stream: fs.createReadStream(filePath),
      statusCode: 200,
      contentType,
      contentLength: totalSize,
      totalSize,
    };
  }

  getObjectPath(storageKey: string): string | null {
    const safe = path.basename(storageKey);
    const full = path.join(this.objectsDir, safe);
    return fs.existsSync(full) ? full : null;
  }

  async deleteObject(storageKey: string): Promise<void> {
    const safe = path.basename(storageKey);
    await fsp.rm(path.join(this.objectsDir, safe), { force: true });
  }
}

// =============================================================================
// 3. Auto-Ready Hybrid Provider: Uses MinIO S3 when configured & reachable,
//    and seamlessly keeps 35GB+ uploads ready immediately with zero setup
// =============================================================================
export class AutoHybridStorageProvider implements StorageProvider {
  private minio: MinioS3StorageAdapter;
  private local: LocalChunkedStorageAdapter;

  constructor(
    env: Record<string, string | undefined> = process.env,
    minioAdapter?: MinioS3StorageAdapter,
    localAdapter?: LocalChunkedStorageAdapter
  ) {
    this.minio = minioAdapter || new MinioS3StorageAdapter(env);
    this.local = localAdapter || new LocalChunkedStorageAdapter(env.LOCAL_STORAGE_DIR, Number(env.STORAGE_QUOTA_BYTES || 53_687_091_200));
  }

  private async isMinioActive(): Promise<{ active: boolean; minioStatus: StorageConfigStatus }> {
    const minioStatus = await this.minio.getConfigStatus();
    return { active: minioStatus.configured, minioStatus };
  }

  async getConfigStatus(): Promise<StorageConfigStatus> {
    const { active, minioStatus } = await this.isMinioActive();
    if (active) {
      return minioStatus;
    }
    const localStatus = await this.local.getConfigStatus();
    return {
      ...localStatus,
      configured: true,
      endpoint: minioStatus.endpoint,
      bucket: minioStatus.bucket,
      message: `Zero-Config Chunked Vault ready for up to 50 GB uploads immediately (no setup needed). MinIO S3 (${minioStatus.endpoint}) will auto-activate once reachable with credentials.`,
    };
  }

  async createUploadSession(input: CreateUploadSessionInput): Promise<StoredUploadSession> {
    const { active } = await this.isMinioActive();
    if (active) {
      return this.minio.createUploadSession(input);
    }
    return this.local.createUploadSession(input);
  }

  private async resolveOwnerAdapter(sessionId: string): Promise<StorageProvider> {
    const s3Session = await this.minio.getUploadStatus(sessionId);
    if (s3Session) return this.minio;
    const localSession = await this.local.getUploadStatus(sessionId);
    if (localSession) return this.local;
    const { active } = await this.isMinioActive();
    return active ? this.minio : this.local;
  }

  async uploadPart(
    sessionId: string,
    partNumber: number,
    stream: Readable,
    byteLength: number
  ): Promise<StoredUploadSession> {
    const adapter = await this.resolveOwnerAdapter(sessionId);
    return adapter.uploadPart(sessionId, partNumber, stream, byteLength);
  }

  async getUploadStatus(sessionId: string): Promise<StoredUploadSession | null> {
    return (await this.minio.getUploadStatus(sessionId)) || (await this.local.getUploadStatus(sessionId));
  }

  async listSessions(ownerId?: string): Promise<StoredUploadSession[]> {
    const [s3List, localList] = await Promise.all([
      this.minio.listSessions(ownerId),
      this.local.listSessions(ownerId),
    ]);
    return [...s3List, ...localList].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async resumeUpload(sessionId: string): Promise<StoredUploadSession | null> {
    const adapter = await this.resolveOwnerAdapter(sessionId);
    return adapter.resumeUpload(sessionId);
  }

  async completeUpload(sessionId: string): Promise<{ session: StoredUploadSession; verifiedBytes: number }> {
    const adapter = await this.resolveOwnerAdapter(sessionId);
    return adapter.completeUpload(sessionId);
  }

  async abortUpload(sessionId: string): Promise<void> {
    const adapter = await this.resolveOwnerAdapter(sessionId);
    await adapter.abortUpload(sessionId);
  }

  getSignedPlaybackUrl(storageKey: string, ttlSeconds?: number): string {
    return this.minio.getSignedPlaybackUrl(storageKey, ttlSeconds);
  }

  verifyPlaybackToken(storageKey: string, expires: string, sig: string): boolean {
    return this.minio.verifyPlaybackToken(storageKey, expires, sig);
  }

  async getInspectionTarget(storageKey: string): Promise<string | null> {
    const localPath = this.local.getObjectPath(storageKey);
    if (localPath) return localPath;
    return this.minio.getInspectionTarget(storageKey);
  }

  async openObjectStream(storageKey: string, rangeHeader?: string): Promise<ObjectStreamResult | null> {
    const localStream = await this.local.openObjectStream(storageKey, rangeHeader);
    if (localStream) return localStream;
    return this.minio.openObjectStream(storageKey, rangeHeader);
  }

  getObjectPath(storageKey: string): string | null {
    return this.local.getObjectPath(storageKey);
  }

  async deleteObject(storageKey: string): Promise<void> {
    await Promise.all([this.local.deleteObject(storageKey), this.minio.deleteObject(storageKey)]);
  }
}

export function createStorageProvider(env: Record<string, string | undefined> = process.env): StorageProvider {
  return new AutoHybridStorageProvider(env);
}
