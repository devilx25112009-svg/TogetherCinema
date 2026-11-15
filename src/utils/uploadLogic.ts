import type { QualityOption } from '../types/cinema';

export interface ChunkPlan {
  chunkSizeBytes: number;
  totalChunks: number;
}

export interface UploadValidationResult {
  valid: boolean;
  reason?: string;
}

export interface UploadMetrics {
  percent: number;
  speedBytesPerSec: number;
  remainingBytes: number;
  etaSeconds: number | null;
}

const ALLOWED_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.mov',
  '.webm',
  '.m4v',
  '.avi',
  '.ts',
  '.m2ts',
  '.mpg',
  '.mpeg',
  '.wmv',
  '.flv',
  '.ogv',
  '.3gp',
]);

const BROWSER_NATIVE_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']);

export function isBrowserPlayableExtension(fileName: string): boolean {
  const dotIdx = fileName.trim().lastIndexOf('.');
  const ext = dotIdx >= 0 ? fileName.trim().slice(dotIdx).toLowerCase() : '';
  return BROWSER_NATIVE_EXTENSIONS.has(ext);
}

export function calculateOptimalChunkPlan(fileSizeBytes: number): ChunkPlan {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return { chunkSizeBytes: 8 * 1024 * 1024, totalChunks: 1 };
  }
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  // Stay safely under Cloud Run / proxy 32 MiB request body limit,
  // above MinIO/S3 5 MiB minimum part size, and well below 10,000 parts.
  let chunkSizeBytes = 8 * MB;
  if (fileSizeBytes > 100 * GB) {
    chunkSizeBytes = 24 * MB;
  } else if (fileSizeBytes >= 5 * GB) {
    chunkSizeBytes = 16 * MB; // 35GB = 2,240 parts; 50GB = 3,200 parts
  }

  const totalChunks = Math.max(1, Math.ceil(fileSizeBytes / chunkSizeBytes));
  return { chunkSizeBytes, totalChunks };
}

export function validateVideoUpload(
  fileName: string,
  fileSizeBytes: number,
  quotaRemainingBytes: number
): UploadValidationResult {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Please choose a video file.' };
  }
  const dotIdx = trimmed.lastIndexOf('.');
  const ext = dotIdx >= 0 ? trimmed.slice(dotIdx).toLowerCase() : '';
  if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason: `Unsupported file format "${ext || 'unknown'}". Supported formats: MP4, MKV, MOV, WebM, M4V, AVI, TS, MPG, WMV.`,
    };
  }
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return { valid: false, reason: 'Video file appears to be empty (0 bytes).' };
  }
  if (fileSizeBytes > quotaRemainingBytes) {
    return {
      valid: false,
      reason: `Insufficient storage quota. File requires ${formatBytes(fileSizeBytes)}, but only ${formatBytes(Math.max(0, quotaRemainingBytes))} remains.`,
    };
  }
  return { valid: true };
}

export function computeUploadMetrics(
  uploadedBytes: number,
  totalBytes: number,
  elapsedMs: number
): UploadMetrics {
  const safeTotal = Math.max(1, totalBytes);
  const clampedUploaded = Math.max(0, Math.min(uploadedBytes, safeTotal));
  const percent = Number(((clampedUploaded / safeTotal) * 100).toFixed(1));
  const remainingBytes = Math.max(0, safeTotal - clampedUploaded);
  const speedBytesPerSec = elapsedMs > 200 ? (clampedUploaded / elapsedMs) * 1000 : 0;
  const etaSeconds =
    speedBytesPerSec > 0 && remainingBytes > 0
      ? Math.ceil(remainingBytes / speedBytesPerSec)
      : remainingBytes === 0
      ? 0
      : null;

  return {
    percent,
    speedBytesPerSec,
    remainingBytes,
    etaSeconds,
  };
}

export function findMissingParts(totalChunks: number, uploadedParts: number[]): number[] {
  const uploaded = new Set(uploadedParts);
  const missing: number[] = [];
  for (let part = 1; part <= totalChunks; part++) {
    if (!uploaded.has(part)) missing.push(part);
  }
  return missing;
}

/**
 * Never upscale low-resolution sources and claim native 4K/8K.
 */
export function computeAvailableRenditions(sourceHeight: number): QualityOption[] {
  const options: QualityOption[] = ['Original'];
  const ladder: Array<{ height: number; label: QualityOption }> = [
    { height: 4320, label: '4320p' },
    { height: 2160, label: '2160p' },
    { height: 1440, label: '1440p' },
    { height: 1080, label: '1080p' },
    { height: 720, label: '720p' },
    { height: 480, label: '480p' },
  ];
  for (const step of ladder) {
    if (sourceHeight >= step.height) {
      options.push(step.label);
    }
  }
  return options;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value >= 100 || idx === 0 ? value.toFixed(0) : value.toFixed(2)} ${units[idx]}`;
}
