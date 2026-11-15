import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOptimalChunkPlan,
  computeAvailableRenditions,
  computeUploadMetrics,
  findMissingParts,
  isBrowserPlayableExtension,
  validateVideoUpload,
} from './uploadLogic';

test('calculateOptimalChunkPlan keeps 35GB and 50GB uploads under proxy and multipart part limits', () => {
  const thirtyFiveGb = 35 * 1024 * 1024 * 1024;
  const plan35 = calculateOptimalChunkPlan(thirtyFiveGb);
  assert.equal(plan35.chunkSizeBytes, 16 * 1024 * 1024);
  assert.equal(plan35.totalChunks, 2240);
  assert.ok(plan35.chunkSizeBytes < 32 * 1024 * 1024);

  const fiftyGb = 50 * 1024 * 1024 * 1024;
  const plan50 = calculateOptimalChunkPlan(fiftyGb);
  assert.equal(plan50.chunkSizeBytes, 16 * 1024 * 1024);
  assert.equal(plan50.totalChunks, 3200);
  assert.ok(plan50.totalChunks < 10000);
});

test('validateVideoUpload rejects invalid formats and quota overflow', () => {
  const badExt = validateVideoUpload('notes.pdf', 1024, 100_000);
  assert.equal(badExt.valid, false);

  const overQuota = validateVideoUpload('film.mkv', 50_000, 10_000);
  assert.equal(overQuota.valid, false);

  const ok = validateVideoUpload('our_movie_4k.mp4', 35_000_000_000, 100_000_000_000);
  assert.equal(ok.valid, true);

  const wmvOk = validateVideoUpload('anniversary_clip.wmv', 2_000_000, 100_000_000_000);
  assert.equal(wmvOk.valid, true);

  assert.equal(isBrowserPlayableExtension('our_movie_4k.mp4'), true);
  assert.equal(isBrowserPlayableExtension('archive.mkv'), false);
});

test('computeUploadMetrics and findMissingParts calculate progress and resume gaps', () => {
  const metrics = computeUploadMetrics(500_000_000, 1_000_000_000, 10_000);
  assert.equal(metrics.percent, 50);
  assert.equal(metrics.remainingBytes, 500_000_000);
  assert.equal(metrics.etaSeconds, 10);

  assert.deepEqual(findMissingParts(5, [1, 2, 4]), [3, 5]);
});

test('computeAvailableRenditions never upscales 1080p to 4K or 8K', () => {
  assert.deepEqual(computeAvailableRenditions(1080), ['Original', '1080p', '720p', '480p']);
  assert.deepEqual(computeAvailableRenditions(2160), ['Original', '2160p', '1440p', '1080p', '720p', '480p']);
  assert.deepEqual(computeAvailableRenditions(4320), ['Original', '4320p', '2160p', '1440p', '1080p', '720p', '480p']);
});
