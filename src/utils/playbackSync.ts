import type { AudioMode, ChapterMark, PlaybackState, QualityOption, ScreenMode } from '../types/cinema';

export interface PlaybackCommandInput {
  action: 'play' | 'pause' | 'seek' | 'rate' | 'chapter' | 'quality' | 'audio' | 'screenMode';
  time?: number;
  playbackRate?: number;
  chapterId?: string;
  quality?: QualityOption;
  audioMode?: AudioMode;
  screenMode?: ScreenMode;
}

export interface DriftEvaluation {
  action: 'none' | 'rate_nudge' | 'seek';
  targetTime: number;
  driftSeconds: number;
  suggestedRate: number;
}

export function projectAuthoritativeTime(state: PlaybackState, nowMs: number): number {
  if (!state.playing) {
    return Math.max(0, state.currentTime);
  }
  const elapsedSec = Math.max(0, (nowMs - state.updatedAt) / 1000);
  return Math.max(0, state.currentTime + elapsedSec * state.playbackRate);
}

export function evaluatePlaybackDrift(
  localTime: number,
  authoritativeTime: number,
  baseRate: number,
  hardSeekThresholdSec = 0.85,
  softNudgeThresholdSec = 0.18
): DriftEvaluation {
  const drift = authoritativeTime - localTime;
  const absDrift = Math.abs(drift);

  if (absDrift >= hardSeekThresholdSec) {
    return {
      action: 'seek',
      targetTime: authoritativeTime,
      driftSeconds: drift,
      suggestedRate: baseRate,
    };
  }

  if (absDrift >= softNudgeThresholdSec) {
    const nudge = drift > 0 ? 0.05 : -0.05;
    return {
      action: 'rate_nudge',
      targetTime: authoritativeTime,
      driftSeconds: drift,
      suggestedRate: Number((baseRate + nudge).toFixed(2)),
    };
  }

  return {
    action: 'none',
    targetTime: authoritativeTime,
    driftSeconds: drift,
    suggestedRate: baseRate,
  };
}

export function applyAuthoritativeCommand(
  prev: PlaybackState,
  cmd: PlaybackCommandInput,
  nowMs: number,
  actor?: { userId?: string; displayName?: string }
): PlaybackState {
  const projectedTime = projectAuthoritativeTime(prev, nowMs);
  const next: PlaybackState = {
    ...prev,
    updatedAt: nowMs,
    revision: prev.revision + 1,
    lastAction: cmd.action,
    ...(actor?.userId ? { updatedById: actor.userId } : {}),
    ...(actor?.displayName ? { updatedByName: actor.displayName } : {}),
  };

  switch (cmd.action) {
    case 'play':
      next.playing = true;
      next.currentTime = typeof cmd.time === 'number' && Number.isFinite(cmd.time)
        ? Math.max(0, cmd.time)
        : projectedTime;
      break;
    case 'pause':
      next.playing = false;
      next.currentTime = typeof cmd.time === 'number' && Number.isFinite(cmd.time)
        ? Math.max(0, cmd.time)
        : projectedTime;
      break;
    case 'seek':
      next.currentTime = typeof cmd.time === 'number' && Number.isFinite(cmd.time)
        ? Math.max(0, cmd.time)
        : projectedTime;
      break;
    case 'rate':
      next.currentTime = projectedTime;
      if (typeof cmd.playbackRate === 'number' && cmd.playbackRate >= 0.25 && cmd.playbackRate <= 2.5) {
        next.playbackRate = cmd.playbackRate;
      }
      break;
    case 'chapter':
      next.currentTime = typeof cmd.time === 'number' && Number.isFinite(cmd.time)
        ? Math.max(0, cmd.time)
        : projectedTime;
      next.activeChapterId = cmd.chapterId;
      break;
    case 'quality':
      next.currentTime = projectedTime;
      if (cmd.quality) next.quality = cmd.quality;
      break;
    case 'audio':
      next.currentTime = projectedTime;
      if (cmd.audioMode) next.audioMode = cmd.audioMode;
      break;
    case 'screenMode':
      next.currentTime = projectedTime;
      if (cmd.screenMode) next.screenMode = cmd.screenMode;
      break;
  }

  return next;
}

export function resolveActiveChapter(
  chapters: ChapterMark[] | undefined,
  currentTimeSeconds: number
): ChapterMark | null {
  if (!chapters || chapters.length === 0) return null;
  const sorted = [...chapters].sort((a, b) => a.timeSeconds - b.timeSeconds);
  let active: ChapterMark = sorted[0];
  for (const ch of sorted) {
    if (ch.timeSeconds <= currentTimeSeconds + 0.5) {
      active = ch;
    } else {
      break;
    }
  }
  return active;
}

export function shouldAcceptIncomingPlaybackState(
  current: PlaybackState | null | undefined,
  incoming: PlaybackState | null | undefined
): boolean {
  if (!incoming) return false;
  if (!current) return true;
  if (incoming.movieId !== current.movieId) return true;
  if (incoming.revision > current.revision) return true;
  if (incoming.revision === current.revision && incoming.updatedAt > current.updatedAt) {
    return true;
  }
  return false;
}

export function shouldForceImmediateSyncSeek(
  currentMediaTime: number,
  targetTime: number,
  incomingAction?: PlaybackState['lastAction']
): boolean {
  const delta = Math.abs(currentMediaTime - targetTime);
  if (incomingAction === 'seek' || incomingAction === 'chapter' || incomingAction === 'source') {
    return delta > 0.45;
  }
  return delta > 0.9;
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface MediaDriftGateInput {
  readyState: number;
  seeking: boolean;
  ended: boolean;
  playing: boolean;
  onlineParticipantCount: number;
}

/**
 * Prevents playback jitter/stutter on huge 4K / 35 GB local or streamed videos:
 * never micro-seek or warp playbackRate while the media element is buffering (`readyState < 3`),
 * actively seeking, or playing smoothly solo unless paused/explicitly seeking.
 */
export function shouldApplyMediaDriftCorrection(input: MediaDriftGateInput): boolean {
  if (input.seeking || input.ended) return false;
  if (input.readyState < 3) return false;
  if (input.playing && input.onlineParticipantCount <= 1) return false;
  return true;
}
