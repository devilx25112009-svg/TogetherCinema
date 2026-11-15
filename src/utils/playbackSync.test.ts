import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAuthoritativeCommand,
  evaluatePlaybackDrift,
  formatTimestamp,
  projectAuthoritativeTime,
  shouldApplyMediaDriftCorrection,
} from './playbackSync';
import type { PlaybackState } from '../types/cinema';

const baseState: PlaybackState = {
  roomId: 'room-1',
  movieId: 'mov-1',
  currentTime: 100,
  playing: true,
  playbackRate: 1.0,
  updatedAt: 10000,
  hostId: 'user-a',
  revision: 1,
  quality: '1080p',
  audioMode: 'Original Audio',
  screenMode: 'IMAX',
};

test('projectAuthoritativeTime advances when playing and stays fixed when paused', () => {
  const projected = projectAuthoritativeTime(baseState, 15000);
  assert.equal(projected, 105);

  const pausedState: PlaybackState = { ...baseState, playing: false };
  assert.equal(projectAuthoritativeTime(pausedState, 25000), 100);
});

test('evaluatePlaybackDrift chooses none, soft rate nudge, or hard seek accurately', () => {
  assert.equal(evaluatePlaybackDrift(100.05, 100.1, 1.0).action, 'none');
  const nudge = evaluatePlaybackDrift(100.0, 100.4, 1.0);
  assert.equal(nudge.action, 'rate_nudge');
  assert.equal(nudge.suggestedRate, 1.05);

  const seek = evaluatePlaybackDrift(100.0, 102.5, 1.0);
  assert.equal(seek.action, 'seek');
  assert.equal(seek.targetTime, 102.5);
});

test('applyAuthoritativeCommand increments revision and preserves projected time on pause/seek', () => {
  const paused = applyAuthoritativeCommand(baseState, { action: 'pause' }, 14000);
  assert.equal(paused.playing, false);
  assert.equal(paused.currentTime, 104);
  assert.equal(paused.revision, 2);

  const sought = applyAuthoritativeCommand(paused, { action: 'seek', time: 520 }, 15000);
  assert.equal(sought.currentTime, 520);
  assert.equal(sought.revision, 3);
});

test('formatTimestamp formats mm:ss and hh:mm:ss cleanly', () => {
  assert.equal(formatTimestamp(75), '01:15');
  assert.equal(formatTimestamp(3665), '1:01:05');
});

test('shouldApplyMediaDriftCorrection blocks drift seeks while buffering, seeking, or playing solo', () => {
  assert.equal(
    shouldApplyMediaDriftCorrection({ readyState: 2, seeking: false, ended: false, playing: true, onlineParticipantCount: 2 }),
    false
  );
  assert.equal(
    shouldApplyMediaDriftCorrection({ readyState: 4, seeking: true, ended: false, playing: true, onlineParticipantCount: 2 }),
    false
  );
  assert.equal(
    shouldApplyMediaDriftCorrection({ readyState: 4, seeking: false, ended: false, playing: true, onlineParticipantCount: 1 }),
    false
  );
  assert.equal(
    shouldApplyMediaDriftCorrection({ readyState: 4, seeking: false, ended: false, playing: true, onlineParticipantCount: 2 }),
    true
  );
  assert.equal(
    shouldApplyMediaDriftCorrection({ readyState: 4, seeking: false, ended: false, playing: false, onlineParticipantCount: 1 }),
    true
  );
});
