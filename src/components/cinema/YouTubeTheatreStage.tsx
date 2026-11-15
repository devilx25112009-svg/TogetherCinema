import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Youtube } from 'lucide-react';
import type { ScreenMode } from '../../types/cinema';
import type { AuditoriumSeat } from '../../utils/seatMap';
import { evaluatePlaybackDrift } from '../../utils/playbackSync';

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setPlaybackRate: (rate: number) => void;
  getIframe?: () => HTMLIFrameElement | null;
  destroy: () => void;
}

interface YTGlobalNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (ev: { target: YTPlayerInstance }) => void;
        onStateChange?: (ev: { data: number; target: YTPlayerInstance }) => void;
        onError?: (ev: { data: number }) => void;
      };
    }
  ) => YTPlayerInstance;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}

declare global {
  interface Window {
    YT?: YTGlobalNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTGlobalNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YTGlobalNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTGlobalNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const timeout = window.setTimeout(() => {
      ytApiPromise = null;
      reject(new Error('YouTube Player API timed out'));
    }, 8000);

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (prevReady) prevReady();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube Player API unavailable'));
    };

    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        ytApiPromise = null;
        reject(new Error('Unable to load YouTube Player API'));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

export interface YouTubeTheatreStageProps {
  videoId: string;
  startSeconds?: number;
  title: string;
  screenMode: ScreenMode;
  playing: boolean;
  authoritativeTime: number;
  playbackRevision: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  chatOpen: boolean;
  controlsCollapsed: boolean;
  isMobileViewport: boolean;
  isPortraitViewport: boolean;
  activeSeat?: AuditoriumSeat;
  onDurationDetected: (seconds: number) => void;
  onTimeSample: (seconds: number) => void;
  onPlayerStateSync: (playing: boolean, currentTime: number) => void;
  onUserSeek: (seconds: number) => void;
}

export function YouTubeTheatreStage({
  videoId,
  startSeconds = 0,
  title,
  screenMode,
  playing,
  authoritativeTime,
  playbackRevision,
  playbackRate,
  volume,
  muted,
  chatOpen,
  controlsCollapsed,
  isMobileViewport,
  isPortraitViewport,
  activeSeat,
  onDurationDetected,
  onTimeSample,
  onPlayerStateSync,
  onUserSeek,
}: YouTubeTheatreStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const readyRef = useRef(false);
  const ignoreEventsUntilRef = useRef(0);
  const suppressDriftCheckUntilRef = useRef(0);
  const lastSampledTimeRef = useRef(Math.max(0, startSeconds, authoritativeTime));
  const lastSyncedRevisionRef = useRef(playbackRevision);

  const latestPropsRef = useRef({
    playing,
    authoritativeTime,
    playbackRate,
    volume,
    muted,
    onDurationDetected,
    onTimeSample,
    onPlayerStateSync,
    onUserSeek,
  });
  latestPropsRef.current = {
    playing,
    authoritativeTime,
    playbackRate,
    volume,
    muted,
    onDurationDetected,
    onTimeSample,
    onPlayerStateSync,
    onUserSeek,
  };

  const [apiFailed, setApiFailed] = useState(false);
  const [embedBlockedError, setEmbedBlockedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    setApiFailed(false);
    setEmbedBlockedError(null);

    const mountPlayer = async () => {
      try {
        const YT = await loadYouTubeIframeApi();
        if (cancelled || !hostRef.current) return;

        hostRef.current.innerHTML = '';
        const targetEl = document.createElement('div');
        targetEl.className = 'w-full h-full';
        hostRef.current.appendChild(targetEl);

        const initialTime = Math.max(0, Math.floor(latestPropsRef.current.authoritativeTime || startSeconds));
        lastSampledTimeRef.current = initialTime;

        const player = new YT.Player(targetEl, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: latestPropsRef.current.playing ? 1 : 0,
            controls: 1,
            fs: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            start: initialTime,
            origin: window.location.origin,
          },
          events: {
            onReady: (ev) => {
              if (cancelled) return;
              readyRef.current = true;
              const p = ev.target;
              const dur = p.getDuration?.();
              if (Number.isFinite(dur) && dur > 0) {
                latestPropsRef.current.onDurationDetected(Math.round(dur));
              }
              p.setVolume(Math.round(latestPropsRef.current.volume * 100));
              if (latestPropsRef.current.muted) p.mute();
              else p.unMute();
              const targetT = latestPropsRef.current.authoritativeTime;
              if (targetT > 1) {
                suppressDriftCheckUntilRef.current = Date.now() + 1400;
                lastSampledTimeRef.current = targetT;
                p.seekTo(targetT, true);
              }
              if (latestPropsRef.current.playing) {
                ignoreEventsUntilRef.current = Date.now() + 700;
                p.playVideo();
              }
            },
            onStateChange: (ev) => {
              if (cancelled) return;
              const dur = ev.target.getDuration?.();
              if (Number.isFinite(dur) && dur > 0) {
                latestPropsRef.current.onDurationDetected(Math.round(dur));
              }

              const currentT = Number(ev.target.getCurrentTime?.() || 0);
              if (Number.isFinite(currentT) && Math.abs(currentT - lastSampledTimeRef.current) > 2.2) {
                // Capture rapid seek inside YouTube iframe before any drift check can counteract it
                suppressDriftCheckUntilRef.current = Date.now() + 1600;
                lastSampledTimeRef.current = currentT;
                latestPropsRef.current.onUserSeek(currentT);
              }

              if (Date.now() < ignoreEventsUntilRef.current) return;

              if (ev.data === 1 && !latestPropsRef.current.playing) {
                latestPropsRef.current.onPlayerStateSync(true, currentT);
              } else if (ev.data === 2 && latestPropsRef.current.playing) {
                latestPropsRef.current.onPlayerStateSync(false, currentT);
              }
            },
            onError: (ev) => {
              if (cancelled) return;
              if (ev.data === 101 || ev.data === 150) {
                setEmbedBlockedError(
                  'This YouTube creator disabled embedded playback outside YouTube.com. Try another video link or open it directly on YouTube.'
                );
              } else if (ev.data === 100) {
                setEmbedBlockedError('This YouTube video could not be found or is private.');
              } else {
                setEmbedBlockedError('Unable to play this YouTube stream in embedded mode.');
              }
            },
          },
        });

        playerRef.current = player;
      } catch {
        if (!cancelled) {
          setApiFailed(true);
        }
      }
    };

    void mountPlayer();

    return () => {
      cancelled = true;
      readyRef.current = false;
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore YT cleanup errors
      }
      playerRef.current = null;
    };
  }, [videoId, startSeconds]);

  // Synchronize authoritative room state -> YouTube player (volume/mute/speed)
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current || (p.getIframe && !p.getIframe()?.isConnected)) return;

    try {
      p.setVolume(Math.round(volume * 100));
      if (muted) p.mute();
      else p.unMute();
      p.setPlaybackRate(playbackRate);
    } catch {
      // ignore transient YT API readiness
    }
  }, [volume, muted, playbackRate]);

  // Respond immediately when an external seek / chapter jump / play-pause increments playbackRevision
  useEffect(() => {
    if (playbackRevision === lastSyncedRevisionRef.current) return;
    lastSyncedRevisionRef.current = playbackRevision;

    const p = playerRef.current;
    if (!p || !readyRef.current || (p.getIframe && !p.getIframe()?.isConnected)) return;

    try {
      const cur = Number(p.getCurrentTime?.() || 0);
      if (Math.abs(cur - authoritativeTime) > 1.2) {
        suppressDriftCheckUntilRef.current = Date.now() + 1500;
        ignoreEventsUntilRef.current = Date.now() + 700;
        lastSampledTimeRef.current = authoritativeTime;
        p.seekTo(authoritativeTime, true);
      }
      const state = p.getPlayerState?.();
      if (playing && state !== 1 && state !== 3) {
        ignoreEventsUntilRef.current = Date.now() + 700;
        p.playVideo();
      } else if (!playing && state === 1) {
        ignoreEventsUntilRef.current = Date.now() + 700;
        p.pauseVideo();
      }
    } catch {
      // ignore transient YT API state
    }
  }, [playbackRevision, authoritativeTime, playing]);

  // Bidirectional sync loop: detects inside-iframe jumps cleanly without reverting user seeks
  useEffect(() => {
    const timer = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || !readyRef.current || (p.getIframe && !p.getIframe()?.isConnected)) return;

      try {
        const dur = p.getDuration?.();
        if (Number.isFinite(dur) && dur > 0) {
          latestPropsRef.current.onDurationDetected(Math.round(dur));
        }

        const state = p.getPlayerState?.();
        const desiredPlay = latestPropsRef.current.playing;
        if (desiredPlay && state !== 1 && state !== 3) {
          ignoreEventsUntilRef.current = Date.now() + 700;
          p.playVideo();
        } else if (!desiredPlay && state === 1) {
          ignoreEventsUntilRef.current = Date.now() + 700;
          p.pauseVideo();
        }

        const cur = Number(p.getCurrentTime?.() || 0);
        if (!Number.isFinite(cur)) return;

        const now = Date.now();
        if (now > suppressDriftCheckUntilRef.current || Math.abs(cur - latestPropsRef.current.authoritativeTime) <= 1.5) {
          latestPropsRef.current.onTimeSample(cur);
        }
        const expectedLocalProgress = desiredPlay ? 0.35 * latestPropsRef.current.playbackRate : 0;
        const localJumpDelta = Math.abs(cur - (lastSampledTimeRef.current + expectedLocalProgress));
        lastSampledTimeRef.current = cur;

        // If user scrubbed or double-tapped inside the YouTube player, commit the jump to the room!
        if (now > suppressDriftCheckUntilRef.current && localJumpDelta > 2.2) {
          suppressDriftCheckUntilRef.current = now + 1800;
          latestPropsRef.current.onUserSeek(cur);
          return;
        }

        // Otherwise gently align with authoritative partner timeline when out of sync
        if (now > suppressDriftCheckUntilRef.current) {
          const drift = evaluatePlaybackDrift(
            cur,
            latestPropsRef.current.authoritativeTime,
            latestPropsRef.current.playbackRate
          );
          if (drift.action === 'seek' && Math.abs(cur - drift.targetTime) > 2.2) {
            suppressDriftCheckUntilRef.current = now + 1500;
            ignoreEventsUntilRef.current = now + 700;
            lastSampledTimeRef.current = drift.targetTime;
            p.seekTo(drift.targetTime, true);
          }
        }
      } catch {
        // ignore transient iframe poll error
      }
    }, 350);

    return () => clearInterval(timer);
  }, []);

  // Responsive stage placement & theatre screen styling per ScreenMode + Mobile/Laptop viewport
  let wrapperClass = '';
  let frameClass = '';

  if (isMobileViewport && isPortraitViewport) {
    // Mobile Portrait: maximize video stage size in the upper auditorium while keeping velvet seats visible at lowest position
    wrapperClass = 'fixed inset-x-0 top-[56px] bottom-[40vh] z-10 flex items-center justify-center px-1.5 pointer-events-none';
    frameClass =
      screenMode === 'IMAX' || screenMode === 'IMAX 3D'
        ? 'w-full max-w-[98vw] aspect-[1.5/1] max-h-full'
        : screenMode === 'UltraWide'
        ? 'w-full max-w-[98vw] aspect-[21/9] max-h-full'
        : 'w-full max-w-[98vw] aspect-video max-h-full';
  } else if (isMobileViewport) {
    // Mobile Landscape: maximize screen cleanly while keeping front seat silhouettes visible at bottom edge
    wrapperClass = 'fixed inset-x-0 top-12 bottom-10 z-10 flex items-center justify-center px-3 pointer-events-none';
    frameClass =
      screenMode === 'UltraWide'
        ? 'w-full max-w-[94vw] aspect-[21/9] max-h-full'
        : screenMode === 'IMAX' || screenMode === 'IMAX 3D'
        ? 'w-full max-w-[94vw] aspect-[1.90/1] max-h-full'
        : 'w-full max-w-[94vw] aspect-video max-h-full';
  } else {
    // Laptop / Desktop: frame cleanly inside upper auditorium screen area above the foreground velvet seats & couple
    const bottomInset =
      screenMode === 'Fullscreen'
        ? controlsCollapsed
          ? 'bottom-6'
          : 'bottom-24'
        : controlsCollapsed
        ? 'bottom-[21vh]'
        : 'bottom-[28vh]';
    wrapperClass = `pointer-events-none fixed inset-x-0 top-[68px] ${bottomInset} z-10 flex items-center justify-center px-4 sm:px-8 transition-all ${
      chatOpen ? 'lg:pr-[22rem]' : ''
    }`;

    frameClass =
      screenMode === 'UltraWide'
        ? 'w-full aspect-[21/9] max-w-[min(84vw,1220px)] max-h-full'
        : screenMode === 'Screen X'
        ? 'w-full aspect-video max-w-[min(64vw,940px)] max-h-full'
        : screenMode === 'IMAX' || screenMode === 'IMAX 3D'
        ? 'w-full aspect-[1.90/1] max-w-[min(86vw,1220px)] max-h-full'
        : screenMode === 'Fullscreen'
        ? 'w-full aspect-video max-w-[94vw] max-h-full'
        : 'w-full aspect-video max-w-[min(76vw,1080px)] max-h-full';
  }

  const frameAtmosphereClass =
    screenMode === 'Dolby Cinema'
      ? 'border-sky-400/40 shadow-[0_0_115px_rgba(56,189,248,0.34)]'
      : screenMode === '3D' || screenMode === 'IMAX 3D'
      ? 'border-[#C4B5FD]/40 shadow-[-10px_0_48px_rgba(56,189,248,0.28),10px_0_48px_rgba(244,114,182,0.28)]'
      : screenMode === 'Screen X'
      ? 'border-[#8B5CF6]/45 shadow-[0_0_110px_rgba(139,92,246,0.42)]'
      : screenMode === 'IMAX'
      ? 'border-[#C4B5FD]/40 shadow-[0_0_120px_rgba(145,103,255,0.46)]'
      : 'border-[#C4B5FD]/30 shadow-[0_0_95px_rgba(139,92,246,0.34)]';

  const seatRowScale = activeSeat ? Math.max(0.82, 1.03 - activeSeat.rowIndex * 0.04) : 1;
  const seatWingRotateY = activeSeat ? Number((-activeSeat.position[0] * 0.42).toFixed(2)) : 0;
  const seatShiftX = activeSeat
    ? Number((-activeSeat.position[0] * (isMobileViewport ? 0.5 : 1.1)).toFixed(1))
    : 0;
  const seatTransform = activeSeat
    ? `perspective(1150px) translateX(${seatShiftX}px) rotateY(${seatWingRotateY}deg) scale(${seatRowScale})`
    : undefined;

  return (
    <div data-testid="youtube-theatre-stage" className={wrapperClass}>
      <div
        style={seatTransform ? { transform: seatTransform } : undefined}
        className={`pointer-events-auto relative ${frameClass} rounded-xl overflow-hidden bg-black border transition-all duration-300 ${frameAtmosphereClass}`}
      >
        {embedBlockedError ? (
          <div
            key="yt-blocked"
            className="w-full h-full flex flex-col items-center justify-center p-5 text-center bg-[#0B1020] space-y-3"
          >
            <Youtube className="w-10 h-10 text-[#F472B6]" />
            <div className="space-y-1 max-w-md">
              <p className="font-display text-base sm:text-lg font-bold text-white">{title}</p>
              <p className="text-xs text-slate-300 leading-relaxed">{embedBlockedError}</p>
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-lg bg-[#8B5CF6] text-xs font-semibold text-white inline-flex items-center gap-1.5"
            >
              <span>Watch on YouTube.com</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : apiFailed ? (
          <iframe
            key="yt-fallback"
            title={title}
            src={`https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1&fs=1&start=${Math.max(
              0,
              Math.floor(authoritativeTime || startSeconds)
            )}`}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div key="yt-host" ref={hostRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
