import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeVideoInfo,
  isYouTubeStreamUrl,
  parseYouTubeTimeParam,
  parseYouTubeUrl,
} from './youtube';

test('parseYouTubeUrl handles watch, youtu.be, shorts, live, embed, and internal youtube:// links', () => {
  const watch = parseYouTubeUrl('https://www.youtube.com/watch?v=LXb3EKWsInQ&t=1m30s');
  assert.ok(watch);
  assert.equal(watch.videoId, 'LXb3EKWsInQ');
  assert.equal(watch.startSeconds, 90);
  assert.equal(watch.streamUrl, 'youtube://LXb3EKWsInQ?t=90');

  const shortLink = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?si=abc123');
  assert.ok(shortLink);
  assert.equal(shortLink.videoId, 'dQw4w9WgXcQ');
  assert.equal(shortLink.streamUrl, 'youtube://dQw4w9WgXcQ');

  const shorts = parseYouTubeUrl('youtube.com/shorts/aqz-KE-bpKQ');
  assert.ok(shorts);
  assert.equal(shorts.videoId, 'aqz-KE-bpKQ');

  const live = parseYouTubeUrl('https://www.youtube.com/live/jfKfPfyJRdk?feature=share');
  assert.ok(live);
  assert.equal(live.videoId, 'jfKfPfyJRdk');

  const internal = parseYouTubeUrl('youtube://LXb3EKWsInQ');
  assert.ok(internal);
  assert.equal(internal.videoId, 'LXb3EKWsInQ');
});

test('parseYouTubeUrl rejects non-YouTube URLs cleanly', () => {
  assert.equal(parseYouTubeUrl('https://vimeo.com/123456789'), null);
  assert.equal(parseYouTubeUrl('not a link'), null);
  assert.equal(parseYouTubeUrl('https://www.youtube.com/watch?v=short'), null);
});

test('extractYouTubeVideoInfo preserves timestamps from internal streamUrl', () => {
  const info = extractYouTubeVideoInfo('youtube://LXb3EKWsInQ?t=125');
  assert.deepEqual(info, { videoId: 'LXb3EKWsInQ', startSeconds: 125 });
  assert.equal(isYouTubeStreamUrl('youtube://LXb3EKWsInQ?t=125'), true);
  assert.equal(isYouTubeStreamUrl('procedural://midnight-orbit'), false);
});

test('parseYouTubeTimeParam parses numeric, s, m, and h combinations', () => {
  assert.equal(parseYouTubeTimeParam('45'), 45);
  assert.equal(parseYouTubeTimeParam('45s'), 45);
  assert.equal(parseYouTubeTimeParam('2m15s'), 135);
  assert.equal(parseYouTubeTimeParam('1h1m1s'), 3661);
});
