import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MINIO_QUOTA_BYTES,
  formatS3ErrorMessage,
  parseByteRangeHeader,
  resolveMinioConfig,
  validateMinioConfig,
} from './minioConfig';

test('resolveMinioConfig defaults to MinIO s3 provider and 50 GiB quota', () => {
  const cfg = resolveMinioConfig({});
  assert.equal(cfg.provider, 's3');
  assert.equal(cfg.endpoint, 'http://localhost:9000');
  assert.equal(cfg.region, 'us-east-1');
  assert.equal(cfg.bucket, 'together-cinema-media');
  assert.equal(cfg.forcePathStyle, true);
  assert.equal(cfg.quotaBytes, DEFAULT_MINIO_QUOTA_BYTES);
});

test('resolveMinioConfig supports remote MinIO endpoint and custom env overrides', () => {
  const cfg = resolveMinioConfig({
    STORAGE_PROVIDER: 's3',
    S3_ENDPOINT: 'https://minio.couplevault.example.com/',
    S3_REGION: 'ap-south-1',
    S3_BUCKET: 'remote-cinema-vault',
    S3_ACCESS_KEY_ID: 'minio-app-key',
    S3_SECRET_ACCESS_KEY: 'minio-app-secret',
    S3_FORCE_PATH_STYLE: 'false',
    STORAGE_QUOTA_BYTES: '107374182400',
  });

  assert.equal(cfg.endpoint, 'https://minio.couplevault.example.com');
  assert.equal(cfg.region, 'ap-south-1');
  assert.equal(cfg.bucket, 'remote-cinema-vault');
  assert.equal(cfg.forcePathStyle, false);
  assert.equal(cfg.quotaBytes, 107_374_182_400);

  const check = validateMinioConfig(cfg);
  assert.equal(check.ok, true);
  assert.deepEqual(check.missingFields, []);
});

test('validateMinioConfig rejects missing credentials cleanly without throwing', () => {
  const cfg = resolveMinioConfig({
    STORAGE_PROVIDER: 's3',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'together-cinema-media',
  });
  const check = validateMinioConfig(cfg);
  assert.equal(check.ok, false);
  assert.deepEqual(check.missingFields, ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']);
});

test('parseByteRangeHeader handles large 50GB ranges and rejects out-of-bounds seeks', () => {
  const fiftyGb = 50 * 1024 * 1024 * 1024;
  const openEnded = parseByteRangeHeader('bytes=1048576-', fiftyGb);
  assert.equal(openEnded.valid, true);
  assert.equal(openEnded.start, 1048576);
  assert.equal(openEnded.chunkSize, 8 * 1024 * 1024);

  const explicit = parseByteRangeHeader('bytes=0-1023', fiftyGb);
  assert.equal(explicit.valid, true);
  assert.equal(explicit.end, 1023);
  assert.equal(explicit.chunkSize, 1024);

  const invalid = parseByteRangeHeader(`bytes=${fiftyGb + 10}-`, fiftyGb);
  assert.equal(invalid.valid, false);
});

test('formatS3ErrorMessage produces clear actionable MinIO error diagnostics', () => {
  const connErr = formatS3ErrorMessage(
    { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:9000' },
    'http://localhost:9000',
    'together-cinema-media'
  );
  assert.match(connErr, /Unable to reach MinIO server/);

  const authErr = formatS3ErrorMessage(
    { Code: 'SignatureDoesNotMatch', message: 'bad sig' },
    'http://localhost:9000',
    'together-cinema-media'
  );
  assert.match(authErr, /MinIO rejected S3 credentials/);
});
