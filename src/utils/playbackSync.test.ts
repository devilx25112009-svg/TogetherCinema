import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAuthoritativeCommand,
  evaluatePlaybackDrift,
  formatTimestamp,
  projectAuthoritativeTime,
  resolveActiveChapter,
  shouldAcceptIncomingPlaybackState,
  shouldApplyMediaDriftCorrection,
  shouldForceImmediateSyncSeek,
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

test('applyAuthoritativeCommand increments revision, records lastAction/actor, and preserves projected time on pause/seek', () => {
  const paused = applyAuthoritativeCommand(baseState, { action: 'pause' }, 14000, {
    userId: 'user-b',
    displayName: 'Maya',
  });
  assert.equal(paused.playing, false);
  assert.equal(paused.currentTime, 104);
  assert.equal(paused.revision, 2);
  assert.equal(paused.lastAction, 'pause');
  assert.equal(paused.updatedByName, 'Maya');

  const sought = applyAuthoritativeCommand(paused, { action: 'seek', time: 520 }, 15000);
  assert.equal(sought.currentTime, 520);
  assert.equal(sought.revision, 3);
  assert.equal(sought.lastAction, 'seek');
});

test('shouldAcceptIncomingPlaybackState prevents stale revisions from reverting skips or scene changes', () => {
  const rev5: PlaybackState = { ...baseState, revision: 5, updatedAt: 50000 };
  const rev4: PlaybackState = { ...baseState, revision: 4, updatedAt: 60000 };
  const rev6: PlaybackState = { ...baseState, revision: 6, updatedAt: 51000 };
  const movieSwitch: PlaybackState = { ...baseState, movieId: 'mov-2', revision: 1, updatedAt: 52000 };

  assert.equal(shouldAcceptIncomingPlaybackState(rev5, rev4), false);
  assert.equal(shouldAcceptIncomingPlaybackState(rev5, rev6), true);
  assert.equal(shouldAcceptIncomingPlaybackState(rev5, movieSwitch), true);
});

test('shouldForceImmediateSyncSeek reacts immediately to skips, chapter jumps, and source changes', () => {
  assert.equal(shouldForceImmediateSyncSeek(100, 100.8, 'seek'), true);
  assert.equal(shouldForceImmediateSyncSeek(100, 100.2, 'seek'), false);
  assert.equal(shouldForceImmediateSyncSeek(100, 100.7, 'play'), false);
  assert.equal(shouldForceImmediateSyncSeek(100, 101.5, 'play'), true);
});

test('resolveActiveChapter selects matching part by current playback timestamp', () => {
  const chapters = [
    { id: 'ch-1', title: 'Part 1', timeSeconds: 0 },
    { id: 'ch-2', title: 'Part 2', timeSeconds: 120 },
    { id: 'ch-3', title: 'Part 3', timeSeconds: 300 },
  ];
  assert.equal(resolveActiveChapter(chapters, 10)?.id, 'ch-1');
  assert.equal(resolveActiveChapter(chapters, 120)?.id, 'ch-2');
  assert.equal(resolveActiveChapter(chapters, 450)?.id, 'ch-3');
  assert.equal(resolveActiveChapter([], 10), null);
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
