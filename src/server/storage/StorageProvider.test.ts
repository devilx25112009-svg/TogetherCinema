import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import { AutoHybridStorageProvider, LocalChunkedStorageAdapter, MinioS3StorageAdapter, createStorageProvider } from './StorageProvider';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tc-minio-test-'));
}

test('createStorageProvider returns AutoHybridStorageProvider ready immediately without external setup', async () => {
  const tmpDir = createTempDir();
  try {
    const adapter = createStorageProvider({ LOCAL_STORAGE_DIR: tmpDir });
    assert.ok(adapter instanceof AutoHybridStorageProvider);
    const status = await adapter.getConfigStatus();
    assert.equal(status.configured, true);
    assert.equal(status.provider, 'local');
    assert.equal(status.quotaBytes, 53_687_091_200);
    assert.match(status.message, /Zero-Config Chunked Vault ready/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('LocalChunkedStorageAdapter handles concurrent parallel chunk uploads without losing parts', async () => {
  const tmpDir = createTempDir();
  try {
    const adapter = new LocalChunkedStorageAdapter(tmpDir);
    const p1 = Buffer.from('CHUNK-ONE-DATA-');
    const p2 = Buffer.from('CHUNK-TWO-DATA-');
    const p3 = Buffer.from('CHUNK-THREE-DATA');
    const total = p1.length + p2.length + p3.length;

    const session = await adapter.createUploadSession({
      sessionId: 'up_parallel_1',
      ownerId: 'demo-partner-a',
      fileName: 'Huge35GBTest.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: total,
      chunkSizeBytes: p1.length,
      totalChunks: 3,
    });

    await Promise.all([
      adapter.uploadPart(session.sessionId, 1, Readable.from(p1), p1.length),
      adapter.uploadPart(session.sessionId, 2, Readable.from(p2), p2.length),
      adapter.uploadPart(session.sessionId, 3, Readable.from(p3), p3.length),
    ]);

    const status = await adapter.getUploadStatus(session.sessionId);
    assert.ok(status);
    assert.deepEqual(status.uploadedParts, [1, 2, 3]);
    assert.equal(status.uploadedBytes, total);

    const completed = await adapter.completeUpload(session.sessionId);
    assert.equal(completed.verifiedBytes, total);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MinioS3StorageAdapter reports unreachable MinIO endpoint without throwing', async () => {
  const tmpDir = createTempDir();
  const mockS3 = {
    send: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9000'), { code: 'ECONNREFUSED' });
    },
  } as unknown as S3Client;

  try {
    const adapter = new MinioS3StorageAdapter(
      {
        LOCAL_STORAGE_DIR: tmpDir,
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'together-cinema-media',
        S3_ACCESS_KEY_ID: 'minioadmin',
        S3_SECRET_ACCESS_KEY: 'minioadmin123',
      },
      mockS3
    );
    const status = await adapter.getConfigStatus();
    assert.equal(status.provider, 's3');
    assert.equal(status.configured, false);
    assert.match(status.message, /Unable to reach MinIO server/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MinioS3StorageAdapter executes multipart upload, playback signing, and byte-range streaming', async () => {
  const tmpDir = createTempDir();
  const uploadedChunks = new Map<number, Buffer>();
  let completedObject = Buffer.alloc(0);

  const mockS3 = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const cmdName = cmd.constructor.name;
      if (cmdName === 'HeadBucketCommand') {
        return {};
      }
      if (cmdName === 'ListObjectsV2Command') {
        return { Contents: [{ Size: completedObject.length }], IsTruncated: false };
      }
      if (cmdName === 'CreateMultipartUploadCommand') {
        return { UploadId: 'minio-upload-42' };
      }
      if (cmdName === 'UploadPartCommand') {
        const partNum = Number(cmd.input.PartNumber);
        const body = cmd.input.Body as Readable;
        const bufs: Buffer[] = [];
        for await (const chunk of body) {
          bufs.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buf = Buffer.concat(bufs);
        uploadedChunks.set(partNum, buf);
        return { ETag: `"etag-${partNum}"` };
      }
      if (cmdName === 'ListPartsCommand') {
        return {
          IsTruncated: false,
          Parts: Array.from(uploadedChunks.entries()).map(([PartNumber, buf]) => ({
            PartNumber,
            ETag: `"etag-${PartNumber}"`,
            Size: buf.length,
          })),
        };
      }
      if (cmdName === 'CompleteMultipartUploadCommand') {
        const ordered = Array.from(uploadedChunks.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, b]) => b);
        completedObject = Buffer.concat(ordered);
        return { Location: 'http://localhost:9000/together-cinema-media/obj' };
      }
      if (cmdName === 'HeadObjectCommand') {
        return { ContentLength: completedObject.length, ContentType: 'video/mp4' };
      }
      if (cmdName === 'GetObjectCommand') {
        const range = String(cmd.input.Range || '');
        const match = /^bytes=(\d+)-(\d+)$/.exec(range);
        if (match) {
          const start = Number(match[1]);
          const end = Number(match[2]);
          return { Body: Readable.from(completedObject.subarray(start, end + 1)) };
        }
        return { Body: Readable.from(completedObject) };
      }
      return {};
    },
  } as unknown as S3Client;

  try {
    const adapter = new MinioS3StorageAdapter(
      {
        LOCAL_STORAGE_DIR: tmpDir,
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'together-cinema-media',
        S3_ACCESS_KEY_ID: 'minioadmin',
        S3_SECRET_ACCESS_KEY: 'super-secret-minio-key',
      },
      mockS3
    );

    const payloadA = Buffer.from('PART1-HEADER-BYTES-');
    const payloadB = Buffer.from('PART2-FOOTER-BYTES');
    const totalSize = payloadA.length + payloadB.length;

    const session = await adapter.createUploadSession({
      sessionId: 'up_test_1',
      ownerId: 'demo-partner-a',
      fileName: 'Our Movie.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: totalSize,
      chunkSizeBytes: payloadA.length,
      totalChunks: 2,
    });

    assert.equal(session.provider, 's3');
    assert.equal(session.s3UploadId, 'minio-upload-42');
    assert.ok(!session.storageKey.includes('/'), 'Default storageKey should be proxy-safe without slashes');

    await adapter.uploadPart(session.sessionId, 1, Readable.from(payloadA), payloadA.length);
    await adapter.uploadPart(session.sessionId, 2, Readable.from(payloadB), payloadB.length);

    const completed = await adapter.completeUpload(session.sessionId);
    assert.equal(completed.verifiedBytes, totalSize);
    assert.equal(completed.session.status, 'completed');

    const signedUrl = adapter.getSignedPlaybackUrl(session.storageKey, 3600);
    assert.ok(!signedUrl.includes('super-secret-minio-key'), 'Signed URL must never expose S3 secrets');
    const urlObj = new URL(`http://localhost:3000${signedUrl}`);
    const expires = urlObj.searchParams.get('expires') || '';
    const sig = urlObj.searchParams.get('sig') || '';
    assert.equal(adapter.verifyPlaybackToken(session.storageKey, expires, sig), true);
    assert.equal(adapter.verifyPlaybackToken(session.storageKey, expires, 'tampered'), false);

    const rangeStream = await adapter.openObjectStream(session.storageKey, 'bytes=6-11');
    assert.ok(rangeStream);
    assert.equal(rangeStream.statusCode, 206);
    assert.equal(rangeStream.contentRange, `bytes 6-11/${totalSize}`);
    const chunks: Buffer[] = [];
    for await (const c of rangeStream.stream) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    }
    assert.equal(Buffer.concat(chunks).toString('utf8'), 'HEADER');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
