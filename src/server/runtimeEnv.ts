import os from 'node:os';
import path from 'node:path';

export function isVercelRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.VERCEL || env.VERCEL_ENV);
}

export function resolveCinemaStorageDir(
  env: Record<string, string | undefined> = process.env,
  explicitDir?: string
): string {
  if (explicitDir && explicitDir.trim()) {
    return path.resolve(explicitDir);
  }
  if (env.LOCAL_STORAGE_DIR && env.LOCAL_STORAGE_DIR.trim()) {
    return path.resolve(env.LOCAL_STORAGE_DIR);
  }
  if (isVercelRuntime(env)) {
    return path.join(os.tmpdir(), 'together-cinema-storage');
  }
  return path.resolve('.cinema-storage');
}

export function normalizeLegacyAssetPath(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('/src/assets/images/')) {
    return `/images/${url.slice('/src/assets/images/'.length)}`;
  }
  return url;
}
