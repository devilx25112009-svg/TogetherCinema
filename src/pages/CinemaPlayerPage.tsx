import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';
import {
  AlertTriangle,
  Armchair,
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Compass,
  Copy,
  Eye,
  Film,
  FolderOpen,
  HandHeart,
  Headphones,
  Heart,
  Link2,
  Lock,
  Maximize,
  MessageSquare,
  Mic,
  Monitor,
  Music,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Send,
  Settings2,
  Smile,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
  X,
  Youtube,
} from 'lucide-react';
import { CoupleInteractionsPanel } from '../components/cinema/CoupleInteractionsPanel';
import { CoupleReactionOverlay } from '../components/cinema/CoupleReactionOverlay';
import { SeatMapModal } from '../components/cinema/SeatMapModal';
import { YouTubeTheatreStage } from '../components/cinema/YouTubeTheatreStage';
import { CinemaAuditoriumScene } from '../components/three/CinemaAuditoriumScene';
import { useAuth } from '../context/AuthContext';
import { cinemaApi } from '../lib/api';
import {
  getLocalAudioStreamUrl,
  getLocalMediaFileInfo,
  getLocalMediaStreamUrl,
  registerLocalAudioForRoom,
  registerLocalFileForRoom,
} from '../lib/localMediaRegistry';
import {
  analyzeLocalVideoFile,
  buildFfmpegRemuxCommandHint,
  buildTheatreDspProfile,
  TheatreAudioEngine,
  type ContainerAudioAnalysis,
} from '../utils/theatreAudio';
import type {
  AudioMode,
  ChatMessageRecord,
  CinemaRoomRecord,
  CoupleInteractionKind,
  CoupleReactionEvent,
  MovieRecord,
  PlaybackState,
  QualityOption,
  RoomParticipant,
  ScreenMode,
} from '../types/cinema';
import {
  checkAudioModeSupport,
  checkScreenModeCompatibility,
  SCREEN_MODE_SPECS,
} from '../utils/cinemaModes';
import {
  applyAuthoritativeCommand,
  evaluatePlaybackDrift,
  formatTimestamp,
  projectAuthoritativeTime,
  shouldApplyMediaDriftCorrection,
  type PlaybackCommandInput,
} from '../utils/playbackSync';
import { COUPLE_INTERACTION_OPTIONS } from '../utils/coupleInteractions';
import { computeAvailableRenditions } from '../utils/uploadLogic';
import {
  resolveCoupleSeats,
  resolveDefaultViewerRole,
  type ViewerSeatRole,
} from '../utils/seatMap';
import {
  buildPartnerAuditoriumLink,
  buildShortPartnerJoinLink,
  isPartnerInviteValid,
  resolveAuditoriumOnlyMode,
} from '../utils/partnerInvite';
import { extractYouTubeVideoInfo, parseYouTubeUrl } from '../utils/youtube';

const ALL_SCREEN_MODES: ScreenMode[] = [
  'Normal Cinema',
  '3D',
  'IMAX',
  'IMAX 3D',
  'Dolby Cinema',
  'Screen X',
  '4DX',
  'UltraWide',
  'Theatre Mode',
  'Fullscreen',
];

export function CinemaPlayerPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const initialTheatreMode = searchParams.get('theatre') === '1';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    setVideoEl(el);
  }, []);
  const companionAudioRef = useRef<HTMLAudioElement | null>(null);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const companionAudioInputRef = useRef<HTMLInputElement | null>(null);
  const audioEngineRef = useRef<TheatreAudioEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const [room, setRoom] = useState<CinemaRoomRecord | null>(null);
  const [movie, setMovie] = useState<MovieRecord | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [reactions, setReactions] = useState<CoupleReactionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // Local player & UI states
  const [displayTime, setDisplayTime] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [muted, setMuted] = useState(false);
  const inviteParam = searchParams.get('invite');
  const auditoriumOnly = resolveAuditoriumOnlyMode({
    auditoriumOnlyParam: searchParams.get('auditoriumOnly'),
    inviteParam,
  });
  const [viewerRoleOverride, setViewerRoleOverride] = useState<ViewerSeatRole | null>(() => {
    if (auditoriumOnly) return 'guest';
    const param = searchParams.get('seat')?.trim().toLowerCase();
    if (param === 'gf' || param === 'guest') return 'guest';
    if (param === 'me' || param === 'host') return 'host';
    return null;
  });
  const [screenMode, setScreenMode] = useState<ScreenMode>('Screen X');
  const [audioMode, setAudioMode] = useState<AudioMode>('Original Audio');
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<string>('');
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>('off');
  const [subtitleSize, setSubtitleSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<'none' | 'screens' | 'audio' | 'chapters' | 'interactions'>('none');
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [momentSavedToast, setMomentSavedToast] = useState(false);
  const [localOverrideUrl, setLocalOverrideUrl] = useState<string | null>(null);
  const [localFileLabel, setLocalFileLabel] = useState<string | null>(null);
  const [companionAudioUrl, setCompanionAudioUrl] = useState<string | null>(null);
  const [companionAudioLabel, setCompanionAudioLabel] = useState<string | null>(null);
  const [containerAudioInfo, setContainerAudioInfo] = useState<ContainerAudioAnalysis | null>(null);
  const [theatreDspEnabled, setTheatreDspEnabled] = useState(false);
  const [dspActive, setDspActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [silentAudioDetected, setSilentAudioDetected] = useState(false);
  const [useCompatStream, setUseCompatStream] = useState(false);
  const [browserTrackCount, setBrowserTrackCount] = useState(0);
  const [activeBrowserTrackIdx, setActiveBrowserTrackIdx] = useState(0);
  const [theatreImmersion, setTheatreImmersion] = useState(initialTheatreMode);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [detectedDuration, setDetectedDuration] = useState<number>(0);
  const [ytModalOpen, setYtModalOpen] = useState(false);
  const [ytUrlInput, setYtUrlInput] = useState('');
  const [ytBusy, setYtBusy] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [seatMapOpen, setSeatMapOpen] = useState(false);
  const [savingSeats, setSavingSeats] = useState(false);

  const [viewportSize, setViewportSize] = useState(() =>
    typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 1280, h: 800 }
  );
  const isMobileViewport = viewportSize.w < 768;
  const isPortraitViewport = viewportSize.h > viewportSize.w;

  // Chat states (collapsed by default on mobile phones so full auditorium screen & seats stay visible)
  const [chatOpen, setChatOpen] = useState(
    !initialTheatreMode && (typeof window === 'undefined' || window.innerWidth >= 768)
  );
  const [chatInput, setChatInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessageRecord | null>(null);
  const [partnerTyping, setPartnerTyping] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [gifDrawerOpen, setGifDrawerOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifNotice, setGifNotice] = useState<string | null>(null);
  const [gifResults, setGifResults] = useState<Array<{ id: string; title: string; url: string }>>([]);

  // Optional Webcam Gesture Mode
  const [cameraGestureActive, setCameraGestureActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const playbackRef = useRef<PlaybackState | null>(null);
  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const participantsRef = useRef<RoomParticipant[]>([]);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    const engine = new TheatreAudioEngine();
    audioEngineRef.current = engine;
    return () => {
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!noticeBanner) return;
    const t = window.setTimeout(() => setNoticeBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [noticeBanner]);

  useEffect(() => {
    const onResize = () => {
      const nextW = window.innerWidth;
      const nextH = window.innerHeight;
      setViewportSize((prev) => {
        if (prev.w >= 768 && nextW < 768) {
          setChatOpen(false);
        }
        return { w: nextW, h: nextH };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Initial HTTP room load
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    cinemaApi
      .getRoom(roomId)
      .then((res) => {
        if (!active) return;
        setRoom(res.room);
        setMovie(res.movie);
        setPlayback(res.playbackState);
        setParticipants(res.participants);
        setMessages(res.chatHistory);
        setScreenMode(res.playbackState?.screenMode || res.room.defaultScreenMode);
        setAudioMode(res.playbackState?.audioMode || res.room.defaultAudio);
        if (res.movie?.audioTracks[0]) setSelectedAudioTrack(res.movie.audioTracks[0].id);
        setDisplayTime(res.playbackState?.currentTime || 0);
        if (inviteParam && isPartnerInviteValid(inviteParam, res.room.inviteCode)) {
          cinemaApi.joinRoom(inviteParam, user).catch(() => {});
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to connect to the cinema.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [roomId, inviteParam, user]);

  // WebSocket real-time synchronization & chat
  useEffect(() => {
    if (!roomId) return;
    let closedByUnmount = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setReconnecting(false);
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomId,
            userId: user?.uid || 'guest-viewer',
            displayName: user?.displayName || 'Cinema Guest',
          })
        );
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as { type: string; [key: string]: unknown };
          if (data.type === 'room:init') {
            if (data.room) setRoom(data.room as CinemaRoomRecord);
            const pState = data.playbackState as PlaybackState;
            setPlayback(pState);
            setScreenMode(pState.screenMode);
            setAudioMode(pState.audioMode);
            setParticipants(data.participants as RoomParticipant[]);
            setMessages(data.chatHistory as ChatMessageRecord[]);
          } else if (data.type === 'room:seats') {
            if (data.room) setRoom(data.room as CinemaRoomRecord);
            if (data.participants) setParticipants(data.participants as RoomParticipant[]);
          } else if (data.type === 'playback:state') {
            const pState = data.playbackState as PlaybackState;
            setPlayback(pState);
            setDisplayTime(pState.currentTime || 0);
            setScreenMode(pState.screenMode);
            setAudioMode(pState.audioMode);
          } else if (data.type === 'room:source') {
            if (data.room) setRoom(data.room as CinemaRoomRecord);
            if (data.movie) setMovie(data.movie as MovieRecord);
            if (data.playbackState) {
              const pState = data.playbackState as PlaybackState;
              setPlayback(pState);
              setDisplayTime(pState.currentTime || 0);
            }
            setLocalOverrideUrl(null);
            setLocalFileLabel(null);
            setCompanionAudioUrl(null);
            setCompanionAudioLabel(null);
            setContainerAudioInfo(null);
            setSilentAudioDetected(false);
            setUseCompatStream(false);
            setDetectedDuration(0);
          } else if (data.type === 'room:participants') {
            setParticipants(data.participants as RoomParticipant[]);
          } else if (data.type === 'chat:message') {
            const msg = data.message as ChatMessageRecord;
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            setChatOpen((open) => {
              if (!open) setUnreadCount((u) => u + 1);
              return open;
            });
          } else if (data.type === 'chat:updated') {
            const updated = data.message as ChatMessageRecord;
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          } else if (data.type === 'chat:typing') {
            if (data.userId !== user?.uid) {
              setPartnerTyping(data.isTyping ? String(data.displayName || 'Partner') : null);
            }
          } else if (data.type === 'couple:interaction') {
            const evItem = data.event as CoupleReactionEvent;
            setReactions((prev) => [...prev.slice(-8), evItem]);
            window.setTimeout(() => {
              setReactions((prev) => prev.filter((r) => r.id !== evItem.id));
            }, 3000);
          }
        } catch {
          // ignore malformed event
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByUnmount) {
          setReconnecting(true);
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();
    return () => {
      closedByUnmount = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [roomId, user?.uid, user?.displayName]);

  // Attach real video source, server FFmpeg compat stream, instant local 35GB+ PC file, or HLS.js stream
  const registryLocalUrl = getLocalMediaStreamUrl(movie?.id, roomId);
  const effectiveRawUrl =
    localOverrideUrl ||
    registryLocalUrl ||
    ((useCompatStream || movie?.audioNeedsCompat) && movie?.streamCompatUrl
      ? movie.streamCompatUrl
      : movie?.streamUrl) ||
    '';
  const effectiveStreamUrl = effectiveRawUrl;
  const youtubeInfo = extractYouTubeVideoInfo(effectiveStreamUrl);
  const isYouTube = Boolean(youtubeInfo);
  const isLocalFileNeeded = effectiveStreamUrl.startsWith('local://');
  const isProceduralVideo =
    !effectiveStreamUrl ||
    effectiveStreamUrl.startsWith('procedural://') ||
    effectiveStreamUrl.startsWith('local://') ||
    isYouTube;

  useEffect(() => {
    const info = getLocalMediaFileInfo(movie?.id, roomId);
    if (info) {
      setLocalFileLabel(info.fileName);
    }
    const audioInfo = getLocalAudioStreamUrl(roomId);
    if (audioInfo) {
      setCompanionAudioUrl(audioInfo.blobUrl);
      setCompanionAudioLabel(audioInfo.fileName);
    }
  }, [movie?.id, roomId, localOverrideUrl]);

  const unlockTheatreAudio = useCallback(async () => {
    const engine = audioEngineRef.current;
    const targetMedia = companionAudioUrl ? companionAudioRef.current : videoElRef.current;
    // Keep pure Original Audio 100% native/bitstream untouched unless the user explicitly enables Surround DSP or a surround mix
    const wantsDspGraph = theatreDspEnabled || audioMode !== 'Original Audio';
    if (engine && wantsDspGraph) {
      const ok = await engine.attachAndUnlock(targetMedia, audioMode, theatreDspEnabled);
      setDspActive(ok);
    } else {
      setDspActive(false);
    }
    const vid = videoElRef.current;
    const comp = companionAudioRef.current;
    if (vid && !companionAudioUrl) {
      vid.muted = muted;
      vid.volume = muted ? 0 : volume;
    } else if (vid && companionAudioUrl) {
      vid.muted = true;
    }
    if (comp && companionAudioUrl) {
      comp.muted = muted;
      comp.volume = muted ? 0 : volume;
    }
    setAutoplayBlocked(false);
  }, [audioMode, companionAudioUrl, muted, theatreDspEnabled, volume]);

  useEffect(() => {
    if (theatreDspEnabled || audioMode !== 'Original Audio') {
      audioEngineRef.current?.applyProfile(audioMode, theatreDspEnabled);
    }
  }, [audioMode, theatreDspEnabled]);

  useEffect(() => {
    const vid = videoEl || videoElRef.current;
    if (!vid) return;
    if (isProceduralVideo) {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      return;
    }

    hlsRef.current?.destroy();
    hlsRef.current = null;
    setSilentAudioDetected(false);

    const handleLoadedMeta = () => {
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        setDetectedDuration(Math.round(vid.duration));
      }
      const tracks = (vid as unknown as { audioTracks?: { length: number; [k: number]: { enabled: boolean } } })
        .audioTracks;
      if (tracks && typeof tracks.length === 'number') {
        setBrowserTrackCount(tracks.length);
      } else {
        setBrowserTrackCount(0);
      }
    };
    vid.addEventListener('loadedmetadata', handleLoadedMeta);

    if (effectiveStreamUrl.endsWith('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(effectiveStreamUrl);
      hls.attachMedia(vid);
      hlsRef.current = hls;
    } else {
      vid.src = effectiveStreamUrl;
      vid.load();
    }

    return () => {
      vid.removeEventListener('loadedmetadata', handleLoadedMeta);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [effectiveStreamUrl, isProceduralVideo, videoEl, loading]);

  useEffect(() => {
    const comp = companionAudioRef.current;
    if (!comp) return;
    if (companionAudioUrl) {
      comp.src = companionAudioUrl;
      comp.load();
    } else {
      comp.removeAttribute('src');
    }
  }, [companionAudioUrl, loading]);

  // Drift-correction, companion audio sync, & silent-audio detection loop
  useEffect(() => {
    const timer = window.setInterval(() => {
      const pState = playbackRef.current;
      if (!pState) return;

      const authoritative = projectAuthoritativeTime(pState, Date.now());
      const vid = videoElRef.current;
      const knownDur =
        vid && Number.isFinite(vid.duration) && vid.duration > 0
          ? vid.duration
          : detectedDuration || movie?.durationSeconds || 0;

      const engine = audioEngineRef.current;
      if (engine?.isRunning() && openDrawer === 'audio') {
        setAudioLevel(engine.sampleOutputLevel());
      }

      if (!vid || isProceduralVideo) {
        setDisplayTime(knownDur > 0 ? Math.min(knownDur, authoritative) : authoritative);
        return;
      }

      const onlineParticipantCount = participantsRef.current.filter((p) => p.online).length || 1;
      // When playing smoothly solo, track real <video> time passively so buffering never fights the seek bar
      if (pState.playing && !vid.paused && onlineParticipantCount <= 1 && vid.readyState >= 2) {
        setDisplayTime(knownDur > 0 ? Math.min(knownDur, vid.currentTime) : vid.currentTime);
      } else {
        setDisplayTime(knownDur > 0 ? Math.min(knownDur, authoritative) : authoritative);
      }

      const comp = companionAudioRef.current;
      const usingCompanion = Boolean(companionAudioUrl && comp);
      vid.muted = usingCompanion ? true : muted;
      vid.volume = usingCompanion ? 0 : muted ? 0 : volume;
      if (comp && usingCompanion) {
        comp.muted = muted;
        comp.volume = muted ? 0 : volume;
      }

      if (pState.playing && vid.paused && !vid.ended) {
        vid
          .play()
          .then(() => setAutoplayBlocked(false))
          .catch((err: unknown) => {
            const name = (err as { name?: string })?.name;
            if (name === 'NotAllowedError') {
              setAutoplayBlocked(true);
              vid.muted = true;
              vid.play().catch(() => {});
            }
          });
      } else if (!pState.playing && !vid.paused) {
        vid.pause();
      }

      const allowDriftAdjust = shouldApplyMediaDriftCorrection({
        readyState: vid.readyState,
        seeking: vid.seeking,
        ended: vid.ended,
        playing: pState.playing,
        onlineParticipantCount,
      });

      if (allowDriftAdjust) {
        const drift = evaluatePlaybackDrift(vid.currentTime, authoritative, pState.playbackRate, 2.0, 0.45);
        if (drift.action === 'seek') {
          vid.currentTime = knownDur > 0 ? Math.min(knownDur, drift.targetTime) : drift.targetTime;
          vid.playbackRate = pState.playbackRate;
        } else if (drift.action === 'rate_nudge') {
          vid.playbackRate = drift.suggestedRate;
        } else if (vid.playbackRate !== pState.playbackRate) {
          vid.playbackRate = pState.playbackRate;
        }
      } else if (!vid.seeking && vid.playbackRate !== pState.playbackRate) {
        vid.playbackRate = pState.playbackRate;
      }

      // Sync optional companion audio track sample-tightly to video
      if (comp && usingCompanion) {
        if (pState.playing && comp.paused && !vid.ended) {
          comp.currentTime = vid.currentTime;
          comp.play().catch(() => {});
        } else if (!pState.playing && !comp.paused) {
          comp.pause();
        }
        if (Math.abs(comp.currentTime - vid.currentTime) > 0.25) {
          comp.currentTime = vid.currentTime;
        }
        comp.playbackRate = vid.playbackRate;
      }

      // Detect 32+ GB AC-3 / DTS / TrueHD silent video-only playback automatically
      if (!usingCompanion && !muted && vid.readyState >= 2 && (vid.currentTime > 1.0 || vid.ended)) {
        const webkitDecoded = (vid as unknown as { webkitAudioDecodedByteCount?: number })
          .webkitAudioDecodedByteCount;
        const mozHasAudio = (vid as unknown as { mozHasAudio?: boolean }).mozHasAudio;
        const tracksLen = (vid as unknown as { audioTracks?: { length: number } }).audioTracks?.length;
        const isSilentInBrowser =
          (typeof webkitDecoded === 'number' && webkitDecoded === 0) ||
          mozHasAudio === false ||
          tracksLen === 0;

        if (isSilentInBrowser) {
          if (movie?.streamCompatUrl && !useCompatStream) {
            setUseCompatStream(true);
            setNoticeBanner(
              'Surround audio track required compatibility decoding — switched automatically to live FFmpeg 384kbps AAC theatre stream.'
            );
          } else {
            setSilentAudioDetected(true);
          }
        } else if (typeof webkitDecoded === 'number' && webkitDecoded > 0) {
          setSilentAudioDetected(false);
        }
      }
    }, 450);

    return () => clearInterval(timer);
  }, [isProceduralVideo, volume, muted, companionAudioUrl, movie?.streamCompatUrl, movie?.durationSeconds, detectedDuration, useCompatStream, openDrawer]);

  const sendPlaybackCommand = useCallback(
    (command: Record<string, unknown>) => {
      void unlockTheatreAudio();
      const vid = videoElRef.current;
      const comp = companionAudioRef.current;

      // Apply optimistic local update immediately so scrubbing/jumping inside YouTube or timeline never snaps back
      if (playbackRef.current) {
        const optimistic = applyAuthoritativeCommand(
          playbackRef.current,
          command as unknown as PlaybackCommandInput,
          Date.now()
        );
        playbackRef.current = optimistic;
        setPlayback(optimistic);
        if (
          command.action === 'seek' ||
          command.action === 'chapter' ||
          command.action === 'play' ||
          command.action === 'pause'
        ) {
          setDisplayTime(optimistic.currentTime);
        }
      }

      // Trigger native media play/pause/seek synchronously inside click gesture so browsers never block sound
      if (vid && !isProceduralVideo) {
        if (command.action === 'play') {
          vid.muted = Boolean(companionAudioUrl) || muted;
          vid.volume = companionAudioUrl ? 0 : muted ? 0 : volume;
          vid.play().catch(() => {});
          if (comp && companionAudioUrl) {
            comp.muted = muted;
            comp.volume = muted ? 0 : volume;
            comp.play().catch(() => {});
          }
        } else if (command.action === 'pause') {
          vid.pause();
          comp?.pause();
        } else if ((command.action === 'seek' || command.action === 'chapter') && typeof command.time === 'number') {
          vid.currentTime = Math.max(0, command.time);
          if (comp && companionAudioUrl) {
            comp.currentTime = Math.max(0, command.time);
          }
        }
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'playback:command', command }));
      }
    },
    [companionAudioUrl, isProceduralVideo, muted, unlockTheatreAudio, volume]
  );

  // Theatre keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        sendPlaybackCommand({ action: playbackRef.current?.playing ? 'pause' : 'play', time: displayTime });
      } else if (e.key === 'ArrowRight') {
        sendPlaybackCommand({ action: 'seek', time: displayTime + 10 });
      } else if (e.key === 'ArrowLeft') {
        sendPlaybackCommand({ action: 'seek', time: Math.max(0, displayTime - 10) });
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((m) => !m);
      } else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else containerRef.current?.requestFullscreen?.().catch(() => {});
      } else if (e.key === 'r' || e.key === 'R') {
        setRecenterSignal((s) => s + 1);
      } else if (e.key === 't' || e.key === 'T') {
        setTheatreImmersion((v) => {
          const next = !v;
          setChatOpen(!next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [displayTime, sendPlaybackCommand]);

  const handleSelectScreenMode = (nextMode: ScreenMode) => {
    setScreenMode(nextMode);
    sendPlaybackCommand({ action: 'screenMode', screenMode: nextMode });
    const compat = checkScreenModeCompatibility(nextMode, movie);
    setNoticeBanner(compat.notice || null);
    if (nextMode === 'Fullscreen') {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  const handleSelectAudioMode = (nextAudio: AudioMode) => {
    setAudioMode(nextAudio);
    void unlockTheatreAudio();
    sendPlaybackCommand({ action: 'audio', audioMode: nextAudio });
    const compat = checkAudioModeSupport(nextAudio, movie);
    setNoticeBanner(compat.notice || null);
  };

  const handleSwitchBrowserAudioTrack = () => {
    const vid = videoElRef.current;
    const tracks = (vid as unknown as { audioTracks?: { length: number; [k: number]: { enabled: boolean } } })
      ?.audioTracks;
    if (!tracks || tracks.length < 2) return;
    const nextIdx = (activeBrowserTrackIdx + 1) % tracks.length;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].enabled = i === nextIdx;
    }
    setActiveBrowserTrackIdx(nextIdx);
    setSilentAudioDetected(false);
    setNoticeBanner(`Switched to embedded browser audio track #${nextIdx + 1}.`);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:message',
          text: chatInput.trim(),
          messageType: 'text',
          replyToId: replyTo?.id,
          replyPreview: replyTo ? `${replyTo.senderName}: ${replyTo.text.slice(0, 48)}` : undefined,
        })
      );
      wsRef.current.send(JSON.stringify({ type: 'chat:typing', isTyping: false }));
    }
    setChatInput('');
    setReplyTo(null);
  };

  const handleCoupleInteraction = (kind: CoupleInteractionKind) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'couple:interaction', kind }));
    } else if (roomId) {
      const opt = COUPLE_INTERACTION_OPTIONS.find((o) => o.kind === kind);
      const localEv: CoupleReactionEvent = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        roomId,
        senderId: user?.uid || 'guest-viewer',
        senderName: user?.displayName || 'You',
        kind,
        label: opt?.label || 'Sent love',
        createdAt: Date.now(),
      };
      setReactions((prev) => [...prev.slice(-8), localEv]);
      window.setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== localEv.id));
      }, 3000);
    }
  };

  const handleSearchGifs = async () => {
    const res = await cinemaApi.searchGifs(gifQuery || 'cinema love');
    if (!res.configured) {
      setGifNotice(res.message || 'GIF provider unconfigured.');
      setGifResults([]);
    } else {
      setGifNotice(null);
      setGifResults(res.results);
    }
  };

  const handleSaveMoment = async () => {
    if (!movie) return;
    await cinemaApi.addMemory(
      {
        movieTitle: movie.title,
        timestampLabel: formatTimestamp(displayTime),
        note: `Saved together during "${room?.name || 'Movie Night'}" (${screenMode}).`,
        mood: 'Memorable Scene',
        imageUrl: movie.thumbnailUrl,
      },
      user
    );
    setMomentSavedToast(true);
    setTimeout(() => setMomentSavedToast(false), 2400);
  };

  const toggleWebcamGesture = async () => {
    if (cameraGestureActive) {
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
      setCameraGestureActive(false);
      return;
    }
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
      setCameraGestureActive(true);
    } catch {
      setCameraError('Camera permission was declined or unavailable. Use the clickable reaction buttons instead.');
    }
  };

  useEffect(() => {
    return () => {
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center text-slate-300 text-sm">
        Opening private 3D auditorium...
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Film className="w-10 h-10 text-[#C4B5FD]" />
        <h1 className="font-display text-2xl font-bold text-white">Unable to Connect to the Cinema</h1>
        <p className="text-sm text-slate-400">{error || 'No cinema room found.'}</p>
        {!auditoriumOnly && (
          <Link to="/rooms" className="px-5 py-2.5 rounded-xl bg-[#8B5CF6] text-white text-sm font-semibold">
            Return to Rooms
          </Link>
        )}
      </div>
    );
  }

  if (inviteParam && !isPartnerInviteValid(inviteParam, room.inviteCode)) {
    return (
      <div
        data-testid="invalid-auditorium-invite"
        className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-6 text-center space-y-4"
      >
        <Lock className="w-10 h-10 text-[#F472B6]" />
        <h1 className="font-display text-2xl font-bold text-white">Invalid Auditorium Invite Link</h1>
        <p className="text-sm text-slate-400 max-w-md">
          This private screening link does not match this auditorium&apos;s invitation token. Ask your partner to share a fresh link.
        </p>
      </div>
    );
  }

  const duration = detectedDuration || movie?.durationSeconds || 6000;
  const renditions = computeAvailableRenditions(movie?.sourceHeight || 1080);

  const handleAttachLocalFile = async (file: File) => {
    if (!roomId) return;
    const blobUrl = registerLocalFileForRoom(roomId, file);
    setLocalOverrideUrl(blobUrl);
    setLocalFileLabel(file.name);
    setSilentAudioDetected(false);
    void unlockTheatreAudio();
    try {
      const analysis = await analyzeLocalVideoFile(file);
      setContainerAudioInfo(analysis);
      if (analysis.hasUnsupportedSurroundCodec) {
        setNoticeBanner(null);
      } else {
        setNoticeBanner(`Instant PC Stream active: "${file.name}" (${analysis.summary}).`);
      }
    } catch {
      setContainerAudioInfo(null);
      setNoticeBanner(`Instant PC Stream active: "${file.name}" (plays directly from disk with zero upload wait).`);
    }
  };

  const handleAttachCompanionAudio = (file: File) => {
    if (!roomId) return;
    const blobUrl = registerLocalAudioForRoom(roomId, file);
    setCompanionAudioUrl(blobUrl);
    setCompanionAudioLabel(file.name);
    setSilentAudioDetected(false);
    void unlockTheatreAudio();
    setNoticeBanner(`Synced companion audio track active: "${file.name}".`);
  };

  const isLocalBlobSource = effectiveStreamUrl.startsWith('blob:');
  const activeDspProfile = buildTheatreDspProfile(audioMode);
  const coupleSeats = resolveCoupleSeats(room.hostSeatId, room.guestSeatId);
  const defaultViewerRole = resolveDefaultViewerRole({
    userId: user?.uid,
    roomHostId: room.hostId,
    seatParam: searchParams.get('seat'),
  });
  const viewerSeatRole: ViewerSeatRole = viewerRoleOverride ?? defaultViewerRole;
  const activeViewerSeat = viewerSeatRole === 'guest' ? coupleSeats.guestSeat : coupleSeats.hostSeat;

  const handleUpdateCoupleSeats = async (next: {
    hostSeatId: string;
    guestSeatId: string;
    guestLabel?: string;
  }) => {
    if (!roomId) return;
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            hostSeatId: next.hostSeatId,
            guestSeatId: next.guestSeatId,
            guestLabel: next.guestLabel ?? prev.guestLabel,
          }
        : prev
    );
    setSavingSeats(true);
    try {
      const res = await cinemaApi.updateRoomSeats(roomId, next, user);
      setRoom(res.room);
      setParticipants(res.participants);
    } catch (err) {
      setNoticeBanner(err instanceof Error ? err.message : 'Unable to save auditorium seat update.');
    } finally {
      setSavingSeats(false);
    }
  };

  const handleLoadYouTubeIntoRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId) return;
    const parsed = parseYouTubeUrl(ytUrlInput);
    if (!parsed) {
      setYtError('Enter a valid YouTube URL (youtube.com/watch?v=..., youtu.be/..., /shorts/..., or /live/...).');
      return;
    }
    setYtBusy(true);
    setYtError(null);
    try {
      let resolvedTitle = `YouTube Video (${parsed.videoId})`;
      let resolvedThumb = parsed.thumbnailUrl;
      try {
        const meta = await cinemaApi.resolveYouTubeMetadata(ytUrlInput);
        resolvedTitle = meta.title || resolvedTitle;
        resolvedThumb = meta.thumbnailUrl || resolvedThumb;
      } catch {
        // Fallback to URL-derived title & thumbnail when offline
      }
      const res = await cinemaApi.setRoomSource(
        roomId,
        {
          youtubeUrl: ytUrlInput.trim(),
          title: resolvedTitle,
          thumbnailUrl: resolvedThumb,
        },
        user
      );
      setRoom(res.room);
      setMovie(res.movie);
      setPlayback(res.playbackState);
      setDisplayTime(res.playbackState.currentTime || 0);
      setLocalOverrideUrl(null);
      setLocalFileLabel(null);
      setCompanionAudioUrl(null);
      setCompanionAudioLabel(null);
      setContainerAudioInfo(null);
      setSilentAudioDetected(false);
      setUseCompatStream(false);
      setDetectedDuration(0);
      setYtModalOpen(false);
      setYtUrlInput('');
      setNoticeBanner(`YouTube loaded in 3D theatre: "${res.movie.title}".`);
    } catch (err) {
      setYtError(err instanceof Error ? err.message : 'Unable to switch room to YouTube link.');
    } finally {
      setYtBusy(false);
    }
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const partnerAuditoriumUrl = buildPartnerAuditoriumLink(originUrl, room.roomId, room.inviteCode);
  const partnerShortJoinUrl = buildShortPartnerJoinLink(originUrl, room.inviteCode);

  const handleCopyPartnerLink = (urlToCopy: string) => {
    navigator.clipboard?.writeText(urlToCopy).catch(() => {});
    setCopiedShareLink(true);
    window.setTimeout(() => setCopiedShareLink(false), 2200);
  };

  return (
    <div
      ref={containerRef}
      data-auditorium-only={auditoriumOnly ? 'true' : 'false'}
      className="relative w-screen h-screen overflow-hidden bg-[#06060c] text-white select-none"
    >
      {/* Offscreen active HTML5 video + synced companion audio elements backing the 3D auditorium */}
      <video
        ref={handleVideoRef}
        className="fixed -left-[9999px] top-0 w-px h-px opacity-0 pointer-events-none"
        crossOrigin={isLocalBlobSource ? undefined : 'anonymous'}
        playsInline
        preload="auto"
      />
      <audio ref={companionAudioRef} className="hidden" preload="auto" />
      <input
        ref={localFileInputRef}
        type="file"
        accept="video/*,.mkv,.m2ts,.ts,.avi,.mov,.wmv,.flv,.mpg,.mpeg,.3gp,.ogv"
        className="hidden"
        aria-label="Load local video file from PC"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleAttachLocalFile(file);
          e.target.value = '';
        }}
      />
      <input
        ref={companionAudioInputRef}
        type="file"
        accept="audio/*,.aac,.m4a,.mp3,.wav,.ogg,.opus,.flac"
        className="hidden"
        aria-label="Load companion audio track from PC"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleAttachCompanionAudio(file);
          e.target.value = '';
        }}
      />

      {/* Massive Full-Hall 3D Auditorium Viewport (strictly locked to viewer's occupied seat) */}
      <div
        className="absolute inset-0 z-0"
        data-viewer-seat={activeViewerSeat.id}
        data-viewer-role={viewerSeatRole}
      >
        <CinemaAuditoriumScene
          videoEl={videoEl}
          movieTitle={movie?.title || room.name}
          screenMode={screenMode}
          playing={Boolean(playback?.playing)}
          participants={participants}
          activeReactions={reactions}
          isProceduralVideo={isProceduralVideo}
          currentTimeSeconds={displayTime}
          recenterSignal={recenterSignal}
          suppressScreenLabel={isYouTube}
          hostSeatId={coupleSeats.hostSeat.id}
          guestSeatId={coupleSeats.guestSeat.id}
          viewerSeatRole={viewerSeatRole}
        />
      </div>

      {/* Interactive YouTube Player framed inside the 3D Screen Zone */}
      {youtubeInfo && (
        <YouTubeTheatreStage
          videoId={youtubeInfo.videoId}
          startSeconds={youtubeInfo.startSeconds}
          title={movie?.title || room.name}
          screenMode={screenMode}
          playing={Boolean(playback?.playing)}
          authoritativeTime={displayTime}
          playbackRevision={playback?.revision || 1}
          playbackRate={playback?.playbackRate || 1}
          volume={volume}
          muted={muted}
          chatOpen={chatOpen}
          controlsCollapsed={controlsCollapsed}
          isMobileViewport={isMobileViewport}
          isPortraitViewport={isPortraitViewport}
          activeSeat={activeViewerSeat}
          onDurationDetected={(sec) => {
            if (sec > 0) setDetectedDuration(sec);
          }}
          onTimeSample={(sec) => {
            if (Number.isFinite(sec)) {
              setDisplayTime(sec);
            }
          }}
          onPlayerStateSync={(shouldPlay, currentTime) => {
            sendPlaybackCommand({ action: shouldPlay ? 'play' : 'pause', time: currentTime });
          }}
          onUserSeek={(seconds) => {
            sendPlaybackCommand({ action: 'seek', time: seconds });
          }}
        />
      )}

      {/* Non-blocking Floating Couple Reactions */}
      <CoupleReactionOverlay events={reactions} enabled={reactionsEnabled} />

      {/* Top Bar: Mobile shows slim Exit + Title + Toggle Chat ONLY; Laptop shows full cinema toolbar */}
      <header
        className={`relative z-20 flex flex-nowrap items-center justify-between gap-2 sm:gap-3 border-b border-white/10 transition-opacity ${
          isMobileViewport ? 'h-12 px-3 py-1.5' : 'px-4 sm:px-6 py-3'
        } ${theatreImmersion ? 'bg-[#080810]/60 opacity-85 hover:opacity-100' : 'bg-[#080810]/90'}`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {auditoriumOnly ? (
            <span
              data-testid="auditorium-only-badge"
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#151126] border border-[#F472B6]/35 text-[11px] font-semibold text-[#F472B6] flex items-center gap-1.5 shrink-0"
              title="Locked strictly to this private couple auditorium"
            >
              <Lock className="w-3 h-3" />
              <span>Private Hall</span>
            </span>
          ) : (
            <Link
              to="/rooms"
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#151126] text-xs text-[#C4B5FD] hover:text-white shrink-0"
            >
              ← Exit
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xs sm:text-base font-bold text-white truncate">
              {room.name}
            </h1>
            {!isMobileViewport && (
              <p className="text-[11px] text-[#C4B5FD] truncate" data-testid="seat-pov-status">
                {localFileLabel || movie?.title} · {screenMode} · Seat {activeViewerSeat.id} (
                {viewerSeatRole === 'guest' ? room.guestLabel || 'My GF' : 'Your Seat'})
                {dspActive && theatreDspEnabled ? ' · Theatre Surround DSP' : ''} · Sync Rev #{playback?.revision || 1}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isMobileViewport && (
            <>
              {reconnecting ? (
                <span className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-1.5">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Reconnecting to partner...</span>
                </span>
              ) : (
                <span className="px-3 py-1.5 rounded-lg bg-[#151126] border border-white/10 text-xs text-slate-200 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-[#F472B6]" />
                  <span>
                    {participants.filter((p) => p.online).length || 1} seated
                    {wsConnected ? ' · Live Sync' : ''}
                  </span>
                </span>
              )}

              {!auditoriumOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => localFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-[#1C1930] border border-[#C4B5FD]/25 text-xs text-slate-100 hover:border-[#8B5CF6] flex items-center gap-1.5 cursor-pointer"
                    title="Play any 35 GB+ video straight from your PC in sync without uploading"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#F472B6]" />
                    <span>{localFileLabel ? 'Change PC File' : 'Load PC Video'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setYtError(null);
                      setYtModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1C1930] border border-[#F472B6]/35 text-xs text-slate-100 hover:border-[#F472B6] flex items-center gap-1.5 cursor-pointer"
                    title="Play any YouTube link together inside the 3D auditorium"
                  >
                    <Youtube className="w-3.5 h-3.5 text-[#F472B6]" />
                    <span>YouTube Link</span>
                  </button>

                  <button
                    type="button"
                    data-testid="open-seat-map-btn"
                    onClick={() => setSeatMapOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-[#1C1930] border border-[#8B5CF6]/40 text-xs text-slate-100 hover:border-[#F472B6] flex items-center gap-1.5 cursor-pointer"
                    title="Open 72-seat auditorium map to choose where you and your GF sit"
                  >
                    <Armchair className="w-3.5 h-3.5 text-[#F472B6]" />
                    <span>
                      Seats ({coupleSeats.hostSeat.id}·{coupleSeats.guestSeat.id})
                    </span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setTheatreImmersion((v) => {
                    const next = !v;
                    setChatOpen(!next);
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 cursor-pointer ${
                  theatreImmersion
                    ? 'bg-[#8B5CF6]/25 border-[#8B5CF6] text-white'
                    : 'bg-[#1C1930] border-white/10 text-slate-200'
                }`}
                title="Toggle distraction-free Full Theatre View (Shortcut: T)"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
                <span className="hidden md:inline">{theatreImmersion ? 'Full Theatre' : 'Theatre View'}</span>
              </button>

              <button
                type="button"
                onClick={() => setRecenterSignal((s) => s + 1)}
                aria-label="Recenter theatre camera"
                title="Recenter 270° view (Shortcut: R)"
                className="p-1.5 rounded-lg bg-[#1C1930] border border-white/10 text-[#C4B5FD] hover:text-white cursor-pointer"
              >
                <Compass className="w-4 h-4" />
              </button>

              {!auditoriumOnly && (
                <>
                  <button
                    type="button"
                    data-testid="share-partner-link-btn"
                    onClick={() => {
                      handleCopyPartnerLink(partnerAuditoriumUrl);
                      setShareModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#F472B6] hover:bg-[#f472b6]/90 text-xs font-bold text-[#080810] flex items-center gap-1.5 cursor-pointer"
                    title="Generate & copy a private link that brings your partner straight into this auditorium only"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Share Link</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(room.inviteCode).catch(() => {});
                      setCopiedInvite(true);
                      setTimeout(() => setCopiedInvite(false), 1800);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#1C1930] border border-[#C4B5FD]/20 text-xs font-mono-tabular text-[#C4B5FD] hover:text-white flex items-center gap-1.5 cursor-pointer"
                    title="Copy short invite code"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedInvite ? 'Copied!' : room.inviteCode}</span>
                  </button>
                </>
              )}
            </>
          )}

          <button
            type="button"
            data-testid="toggle-chat-btn"
            onClick={() => {
              setChatOpen((o) => !o);
              setUnreadCount(0);
            }}
            className="px-3 py-1.5 rounded-lg bg-[#8B5CF6] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{chatOpen && isMobileViewport ? 'Hide Chat' : 'Chat'}</span>
            {unreadCount > 0 && <span className="font-mono-tabular">({unreadCount})</span>}
          </button>
        </div>
      </header>

      {autoplayBlocked && (
        <div className="relative z-30 mx-auto mt-3 max-w-xl px-4 py-3 rounded-xl bg-[#8B5CF6] text-xs font-semibold text-white flex items-center justify-between gap-4 shadow-lg">
          <span className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 shrink-0" />
            <span>Browser muted synced autoplay until clicked — tap to unlock Full Theatre Sound.</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setMuted(false);
              void unlockTheatreAudio();
            }}
            className="px-3.5 py-1.5 rounded-lg bg-[#080810] text-white font-bold shrink-0 cursor-pointer"
          >
            Enable Theatre Sound
          </button>
        </div>
      )}

      {(silentAudioDetected || containerAudioInfo?.hasUnsupportedSurroundCodec) && !companionAudioUrl && (
        <div className="relative z-20 mx-auto mt-3 max-w-3xl px-4 py-3 rounded-xl bg-[#151126]/95 border border-amber-400/50 text-xs text-slate-100 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200">
                  {containerAudioInfo?.unsupportedCodecLabel
                    ? `${containerAudioInfo.unsupportedCodecLabel} Audio Track Detected — Browser Playing Video Only`
                    : 'Video Track Active with Zero Decoded Audio Frames'}
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Large 32+ GB films often embed Dolby AC-3 / E-AC-3 / DTS / TrueHD audio which Chrome drops natively.
                  Attach an extracted AAC/MP3 audio file, switch tracks, or upload to our FFmpeg vault for automatic live AAC transcoding.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {browserTrackCount > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchBrowserAudioTrack}
                  className="px-3 py-1.5 rounded-lg bg-[#211B32] border border-white/15 text-[11px] font-semibold text-white cursor-pointer"
                >
                  Switch Embedded Track ({activeBrowserTrackIdx + 1}/{browserTrackCount})
                </button>
              )}
              {movie?.streamCompatUrl && (
                <button
                  type="button"
                  onClick={() => setUseCompatStream(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-[11px] font-semibold text-white cursor-pointer"
                >
                  Use FFmpeg AAC Stream
                </button>
              )}
              <button
                type="button"
                onClick={() => companionAudioInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-[#F472B6] text-[#080810] text-[11px] font-bold cursor-pointer"
              >
                Attach Audio Track (.m4a/.mp3/.aac)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSilentAudioDetected(false);
                  setContainerAudioInfo(null);
                }}
                className="text-slate-400 hover:text-white text-[11px] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
          {localFileLabel && (
            <div className="px-2.5 py-1.5 rounded bg-[#0B1020] font-mono text-[10px] text-[#C4B5FD] flex items-center justify-between gap-2 overflow-x-auto">
              <span className="truncate">{buildFfmpegRemuxCommandHint(localFileLabel)}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(buildFfmpegRemuxCommandHint(localFileLabel))}
                className="px-2 py-0.5 rounded bg-[#1C1930] text-white shrink-0 cursor-pointer"
              >
                Copy 25s Remux Command
              </button>
            </div>
          )}
        </div>
      )}

      {isLocalFileNeeded && (
        <div className="relative z-20 mx-auto mt-3 max-w-2xl px-4 py-2.5 rounded-xl bg-[#151126]/95 border border-[#F472B6]/40 text-xs text-slate-100 flex items-center justify-between gap-4">
          <span>
            This screening is configured for direct PC playback. Select the movie file on your computer to stream it
            instantly in 3D sync.
          </span>
          <button
            type="button"
            onClick={() => localFileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-[#F472B6] text-[#080810] font-bold shrink-0 cursor-pointer"
          >
            Select PC Video
          </button>
        </div>
      )}

      {/* Compatibility / Info Notice */}
      {noticeBanner && (
        <div className="relative z-20 mx-auto mt-3 max-w-2xl px-4 py-2.5 rounded-xl bg-[#151126]/95 border border-[#8B5CF6]/40 text-xs text-[#C4B5FD] flex items-center justify-between gap-4">
          <span>{noticeBanner}</span>
          <button
            type="button"
            onClick={() => setNoticeBanner(null)}
            className="text-white hover:underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {momentSavedToast && (
        <div className="relative z-20 mx-auto mt-2 max-w-sm px-4 py-2 rounded-lg bg-emerald-600/90 text-xs font-semibold text-white text-center">
          Saved moment at {formatTimestamp(displayTime)} to Our Memories!
        </div>
      )}

      {shareModalOpen && !auditoriumOnly && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div
            data-testid="share-partner-link-modal"
            className="w-full max-w-lg rounded-2xl bg-[#151126] border border-[#F472B6]/35 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-[#F472B6]" />
                <h2 className="font-display text-base font-bold text-white">
                  Share Private Auditorium Link for Partner
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                aria-label="Close share partner link modal"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Send this private link to your partner. When opened on phone or laptop, she joins{' '}
              <span className="text-white font-semibold">{room.name}</span> directly in her assigned seat (
              <span className="text-[#F472B6] font-semibold">
                Seat {coupleSeats.guestSeat.id} · {room.guestLabel || 'My GF'}
              </span>
              ) — locked strictly to this auditorium only.
            </p>

            <div className="space-y-2">
              <label htmlFor="partner-share-url" className="block text-[11px] font-semibold text-[#C4B5FD]">
                Auditorium-Only Direct Link
              </label>
              <div className="flex gap-2">
                <input
                  id="partner-share-url"
                  data-testid="partner-share-url-input"
                  type="text"
                  readOnly
                  value={partnerAuditoriumUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#080810] border border-white/15 font-mono text-xs text-slate-200 select-all"
                />
                <button
                  type="button"
                  data-testid="copy-partner-link-btn"
                  onClick={() => handleCopyPartnerLink(partnerAuditoriumUrl)}
                  className="px-3.5 py-2 rounded-lg bg-[#F472B6] hover:bg-[#f472b6]/90 text-[#080810] text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedShareLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedShareLink ? 'Link Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-[#0B1020] border border-white/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="text-[11px] text-slate-400">Short Join URL &amp; Code</p>
                <p className="font-mono text-[#C4B5FD] text-xs truncate">{partnerShortJoinUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopyPartnerLink(partnerShortJoinUrl)}
                className="px-3 py-1.5 rounded-lg bg-[#1C1930] hover:bg-[#2A2246] text-xs text-white cursor-pointer"
              >
                Copy Short Link ({room.inviteCode})
              </button>
            </div>
          </div>
        </div>
      )}

      {ytModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleLoadYouTubeIntoRoom}
            className="w-full max-w-md rounded-2xl bg-[#151126] border border-[#C4B5FD]/30 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-[#F472B6]" />
                <h2 className="font-display text-base font-bold text-white">Watch YouTube Link Together</h2>
              </div>
              <button
                type="button"
                onClick={() => setYtModalOpen(false)}
                aria-label="Close YouTube link dialog"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Paste any YouTube video, Shorts, or live link. Both partners will sync immediately inside the 3D cinema room.
            </p>
            <input
              type="url"
              required
              autoFocus
              value={ytUrlInput}
              onChange={(e) => setYtUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
              aria-label="YouTube video link"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#080810] border border-white/15 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
            {ytError && <p className="text-xs text-rose-300">{ytError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setYtModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#1C1930] text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={ytBusy}
                className="px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {ytBusy ? 'Loading Link...' : 'Play in 3D Theatre'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Subtitle Overlay when enabled */}
      {selectedSubtitle !== 'off' && playback?.playing && (
        <div className="pointer-events-none fixed bottom-36 inset-x-0 z-20 flex justify-center px-4">
          <p
            className={`px-4 py-1.5 rounded-lg bg-black/75 text-white text-center ${
              subtitleSize === 'lg' ? 'text-lg' : subtitleSize === 'sm' ? 'text-xs' : 'text-sm'
            }`}
          >
            [{selectedSubtitle}] Synchronized cinema captions active
          </p>
        </div>
      )}

      {/* Integrated Live Chat Panel: bottom sheet below video on mobile, right-side drawer on laptop */}
      {chatOpen && (
        <aside
          data-testid="theatre-chat-panel"
          className={
            isMobileViewport
              ? 'fixed inset-x-3 bottom-3 top-[52%] z-30 rounded-2xl bg-[#151126]/95 border border-[#C4B5FD]/25 flex flex-col overflow-hidden'
              : 'fixed right-5 top-20 bottom-32 z-20 w-80 rounded-2xl bg-[#151126]/92 border border-[#C4B5FD]/20 flex flex-col overflow-hidden'
          }
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold text-white">Theatre Chat</h2>
              <p className="text-[11px] text-[#C4B5FD] truncate">
                {partnerTyping ? `${partnerTyping} is typing...` : 'Private room conversation'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!auditoriumOnly && (
                <button
                  type="button"
                  data-testid="chat-seat-map-btn"
                  onClick={() => setSeatMapOpen(true)}
                  className="px-2 py-1 rounded-lg bg-[#1C1930] border border-[#F472B6]/35 text-[11px] font-medium text-[#F472B6] hover:text-white flex items-center gap-1 cursor-pointer"
                  title="Open auditorium seat map"
                >
                  <Armchair className="w-3 h-3" />
                  <span>
                    {coupleSeats.hostSeat.id}·{coupleSeats.guestSeat.id}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Collapse chat panel"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                Say hello to your partner or send a snack from the tray.
              </p>
            ) : (
              messages.map((m) => {
                const isMe = m.senderId === user?.uid;
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl p-2.5 text-xs space-y-1 ${
                      isMe ? 'bg-[#8B5CF6]/25 border border-[#8B5CF6]/35 ml-4' : 'bg-[#1C1930] mr-4'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-semibold text-[#C4B5FD]">{m.senderName}</span>
                      <span className="font-mono-tabular">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {m.replyPreview && (
                      <div className="px-2 py-1 rounded bg-black/30 text-[10px] text-slate-300 truncate">
                        ↩ {m.replyPreview}
                      </div>
                    )}
                    {m.gifUrl ? (
                      <img src={m.gifUrl} alt={m.text || 'GIF'} className="rounded-lg max-h-32 w-full object-cover" />
                    ) : (
                      <p className="text-slate-100 leading-relaxed">{m.text}</p>
                    )}
                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        {['❤️', '🍿', '✨'].map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() =>
                              wsRef.current?.send(JSON.stringify({ type: 'chat:react', messageId: m.id, emoji: em }))
                            }
                            className="hover:text-white cursor-pointer"
                          >
                            {em} {m.reactions[em]?.length || ''}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyTo(m)}
                        className="hover:text-white cursor-pointer"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {gifDrawerOpen && (
            <div className="p-2.5 border-t border-white/10 bg-[#0B1020] space-y-2">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={gifQuery}
                  onChange={(e) => setGifQuery(e.target.value)}
                  placeholder="Search GIFs..."
                  className="flex-1 px-2.5 py-1.5 rounded bg-[#151126] text-xs text-white border border-white/10"
                />
                <button
                  type="button"
                  onClick={handleSearchGifs}
                  className="px-2.5 py-1.5 rounded bg-[#8B5CF6] text-xs font-semibold text-white cursor-pointer"
                >
                  Find
                </button>
              </div>
              {gifNotice && <p className="text-[11px] text-amber-200">{gifNotice}</p>}
              {gifResults.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 max-h-28 overflow-y-auto">
                  {gifResults.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        wsRef.current?.send(
                          JSON.stringify({ type: 'chat:message', text: g.title, gifUrl: g.url, messageType: 'gif' })
                        );
                        setGifDrawerOpen(false);
                      }}
                      className="rounded overflow-hidden cursor-pointer"
                    >
                      <img src={g.url} alt={g.title} className="w-full h-14 object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSendChat} className="p-2.5 border-t border-white/10 space-y-2 bg-[#0B1020]">
            {replyTo && (
              <div className="flex items-center justify-between text-[11px] text-[#C4B5FD] bg-[#151126] px-2 py-1 rounded">
                <span className="truncate">Replying to {replyTo.senderName}</span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-white cursor-pointer">
                  ×
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setChatInput((v) => v + ' ❤️')}
                aria-label="Insert heart emoji"
                className="p-2 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
              >
                <Smile className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setGifDrawerOpen((v) => !v)}
                aria-label="Toggle GIF picker"
                className="px-2 py-1 rounded-lg hover:bg-white/10 text-[10px] font-mono-tabular text-[#C4B5FD] cursor-pointer"
              >
                GIF
              </button>
              <button
                type="button"
                onClick={() => {
                  wsRef.current?.send(
                    JSON.stringify({
                      type: 'chat:message',
                      text: 'Voice memo (0:04) — "Love this scene!"',
                      messageType: 'voice',
                      voiceDurationSec: 4,
                    })
                  );
                }}
                aria-label="Send quick voice note"
                className="p-2 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
              >
                <Mic className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  wsRef.current?.send(JSON.stringify({ type: 'chat:typing', isTyping: e.target.value.length > 0 }));
                }}
                placeholder="Whisper in theatre..."
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#151126] border border-white/10 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="p-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-white cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </aside>
      )}

      {/* Collapsible Unified Bottom Cinema Dock (Desktop/Laptop only — mobile keeps seats & full auditorium open) */}
      {!isMobileViewport && (
        <div
          data-testid="cinema-controls-dock"
          className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[96vw] max-w-4xl flex flex-col items-center gap-2"
        >
        {/* Popover Sub-Menus above the dock */}
        {openDrawer === 'screens' && (
          <div className="pointer-events-auto w-full max-w-3xl p-4 rounded-2xl bg-[#151126]/95 border border-[#C4B5FD]/25 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Cinema Screen Presentation Modes</span>
              <span className="text-[#C4B5FD]">{SCREEN_MODE_SPECS[screenMode].tagline}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ALL_SCREEN_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelectScreenMode(m)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    screenMode === m
                      ? 'bg-[#8B5CF6] text-white'
                      : 'bg-[#1C1930] text-slate-300 hover:text-white'
                  }`}
                >
                  {m === 'Screen X' ? 'Screen X (270°)' : m}
                </button>
              ))}
            </div>
            {!auditoriumOnly && (
              <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400 mr-1">Seated View Only:</span>
                  <button
                    type="button"
                    onClick={() => setViewerRoleOverride('host')}
                    className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
                      viewerSeatRole === 'host'
                        ? 'bg-[#8B5CF6] text-white font-semibold'
                        : 'bg-[#0B1020] text-slate-300 hover:text-white'
                    }`}
                  >
                    Your Seat ({coupleSeats.hostSeat.id})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewerRoleOverride('guest')}
                    className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
                      viewerSeatRole === 'guest'
                        ? 'bg-[#F472B6] text-[#080810] font-semibold'
                        : 'bg-[#0B1020] text-slate-300 hover:text-white'
                    }`}
                  >
                    {room.guestLabel || 'My GF'} ({coupleSeats.guestSeat.id})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpenDrawer('none');
                    setSeatMapOpen(true);
                  }}
                  className="px-3 py-1 rounded-lg bg-[#8B5CF6] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Armchair className="w-3.5 h-3.5" />
                  <span>Manage Seat Map ({coupleSeats.hostSeat.id}·{coupleSeats.guestSeat.id})</span>
                </button>
              </div>
            )}
          </div>
        )}

        {openDrawer === 'audio' && (
          <div className="pointer-events-auto w-full max-w-3xl p-4 rounded-2xl bg-[#151126]/95 border border-[#C4B5FD]/25 space-y-4 text-xs">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <p className="font-semibold text-white">Audio Mix</p>
                {(['Original Audio', 'Stereo', '5.1', '7.1', 'Dolby Atmos'] as AudioMode[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => handleSelectAudioMode(a)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg cursor-pointer ${
                      audioMode === a ? 'bg-[#8B5CF6] text-white' : 'bg-[#0B1020] text-slate-300'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-white">Quality &amp; Speed</p>
                <select
                  value={playback?.quality || 'Original'}
                  onChange={(e) => sendPlaybackCommand({ action: 'quality', quality: e.target.value as QualityOption })}
                  aria-label="Video quality"
                  className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-white/10 text-white"
                >
                  {renditions.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
                <select
                  value={playback?.playbackRate || 1}
                  onChange={(e) => sendPlaybackCommand({ action: 'rate', playbackRate: Number(e.target.value) })}
                  aria-label="Playback speed"
                  className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-white/10 text-white"
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <option key={r} value={r}>
                      Speed: {r}x
                    </option>
                  ))}
                </select>
                <select
                  value={selectedAudioTrack}
                  onChange={(e) => setSelectedAudioTrack(e.target.value)}
                  aria-label="Source audio track"
                  className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-white/10 text-white"
                >
                  {(movie?.audioTracks || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-white">Subtitles</p>
                <select
                  value={selectedSubtitle}
                  onChange={(e) => setSelectedSubtitle(e.target.value)}
                  aria-label="Subtitle track"
                  className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-white/10 text-white"
                >
                  <option value="off">Subtitles: Off</option>
                  {(movie?.subtitles || []).map((s) => (
                    <option key={s.id} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1.5 pt-1">
                  {(['sm', 'md', 'lg'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSubtitleSize(sz)}
                      className={`flex-1 py-1.5 rounded uppercase cursor-pointer ${
                        subtitleSize === sz ? 'bg-[#8B5CF6] text-white' : 'bg-[#0B1020] text-slate-300'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Web Audio Theatre DSP + Companion Audio Controls */}
            <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 min-w-[220px] flex-1">
                <div className="flex items-center gap-2">
                  <Headphones className="w-3.5 h-3.5 text-[#F472B6]" />
                  <span className="font-semibold text-white">{activeDspProfile.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 max-w-xs rounded bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#8B5CF6] transition-all duration-100"
                      style={{ width: `${Math.round(audioLevel * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-[#C4B5FD]">
                    {dspActive ? 'DSP ARMED' : 'CLICK PLAY TO ARM DSP'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTheatreDspEnabled((v) => !v);
                    void unlockTheatreAudio();
                  }}
                  className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                    theatreDspEnabled ? 'bg-[#8B5CF6] text-white' : 'bg-[#0B1020] text-slate-300'
                  }`}
                >
                  Theatre Surround EQ: {theatreDspEnabled ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => companionAudioInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-[#C4B5FD] hover:text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>{companionAudioLabel ? `Audio: ${companionAudioLabel}` : 'Attach Companion Audio'}</span>
                </button>
                {movie?.streamCompatUrl && (
                  <button
                    type="button"
                    onClick={() => setUseCompatStream((u) => !u)}
                    className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                      useCompatStream ? 'bg-emerald-600 text-white' : 'bg-[#0B1020] text-slate-300'
                    }`}
                  >
                    FFmpeg Audio Remux: {useCompatStream ? 'On' : 'Auto'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {openDrawer === 'chapters' && (
          <div className="pointer-events-auto w-full max-w-2xl p-4 rounded-2xl bg-[#151126]/95 border border-[#C4B5FD]/25 space-y-2">
            <p className="text-xs font-semibold text-white">Synchronized Chapters</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {(movie?.chapters || []).map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    sendPlaybackCommand({ action: 'chapter', chapterId: ch.id, time: ch.timeSeconds });
                    setOpenDrawer('none');
                  }}
                  className="p-2.5 rounded-lg bg-[#0B1020] hover:bg-[#8B5CF6]/30 text-left flex items-center justify-between text-xs cursor-pointer"
                >
                  <span className="text-white">{ch.title}</span>
                  <span className="font-mono-tabular text-[#C4B5FD]">{formatTimestamp(ch.timeSeconds)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {openDrawer === 'interactions' && (
          <div
            data-testid="laptop-actions-drawer"
            className="pointer-events-auto w-full max-w-3xl p-4 rounded-2xl bg-[#151126]/95 border border-[#F472B6]/30 space-y-3 max-h-[58vh] overflow-y-auto"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <HandHeart className="w-4 h-4 text-[#F472B6]" />
                <span>Couple Actions, Kisses &amp; Snacks</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReactionsEnabled((v) => !v)}
                  className="text-[#C4B5FD] hover:text-white cursor-pointer"
                >
                  Animations: {reactionsEnabled ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={toggleWebcamGesture}
                  className={`px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer ${
                    cameraGestureActive ? 'bg-rose-600 text-white' : 'bg-[#0B1020] text-slate-300'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{cameraGestureActive ? 'Camera Active (Stop)' : 'Webcam Gestures'}</span>
                </button>
              </div>
            </div>

            {cameraError && <p className="text-xs text-amber-200">{cameraError}</p>}
            {cameraGestureActive && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-[#0B1020]">
                <video ref={webcamVideoRef} autoPlay muted playsInline className="w-20 h-14 rounded object-cover" />
                <p className="text-xs text-slate-300">
                  Camera active locally. Click any action below or wave to send a live gesture.
                </p>
              </div>
            )}

            <CoupleInteractionsPanel
              onTrigger={(kind) => {
                handleCoupleInteraction(kind);
                setOpenDrawer('none');
              }}
            />
          </div>
        )}

        {/* Collapse / Expand Handle */}
        <button
          type="button"
          onClick={() => setControlsCollapsed((v) => !v)}
          className="pointer-events-auto px-3.5 py-1 rounded-lg bg-[#151126]/95 border border-white/15 text-[11px] font-medium text-[#C4B5FD] hover:text-white flex items-center gap-1 cursor-pointer"
        >
          {controlsCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{controlsCollapsed ? 'Show Cinema Controls' : 'Hide Controls'}</span>
        </button>

        {/* Main Transport & Mode Dock */}
        {!controlsCollapsed && (
          <div className="pointer-events-auto w-full rounded-2xl bg-[#151126]/94 border border-[#C4B5FD]/20 px-4 py-3 space-y-2.5">
            {/* Synchronized Timeline */}
            <div className="flex items-center gap-3 text-xs font-mono-tabular">
              <span className="text-[#C4B5FD] w-14 text-right">{formatTimestamp(displayTime)}</span>
              <input
                type="range"
                min={0}
                max={duration}
                value={Math.min(duration, displayTime)}
                onChange={(e) => sendPlaybackCommand({ action: 'seek', time: Number(e.target.value) })}
                aria-label="Synchronized movie timeline"
                className="flex-1 accent-[#8B5CF6] cursor-pointer"
              />
              <span className="text-slate-400 w-14">{formatTimestamp(duration)}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Left Playback Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => sendPlaybackCommand({ action: 'seek', time: Math.max(0, displayTime - 10) })}
                  aria-label="Rewind 10 seconds"
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-200 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    sendPlaybackCommand({ action: playback?.playing ? 'pause' : 'play', time: displayTime })
                  }
                  aria-label={playback?.playing ? 'Pause movie' : 'Play movie'}
                  className="px-4 py-2 rounded-xl bg-[#8B5CF6] hover:bg-[#9167FF] text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {playback?.playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{playback?.playing ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendPlaybackCommand({ action: 'seek', time: Math.min(duration, displayTime + 10) })}
                  aria-label="Forward 10 seconds"
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-200 cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <div className="hidden sm:flex items-center gap-1.5 ml-2">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-300 cursor-pointer"
                  >
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      setMuted(false);
                      setVolume(Number(e.target.value));
                    }}
                    aria-label="Volume"
                    className="w-16 accent-[#C4B5FD]"
                  />
                </div>
              </div>

              {/* Right Cinema Modes, Interactions, Save Moment, Fullscreen */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setOpenDrawer((d) => (d === 'screens' ? 'none' : 'screens'))}
                  className={`px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer ${
                    openDrawer === 'screens' ? 'bg-[#8B5CF6] text-white' : 'bg-[#1C1930] text-slate-200'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5 text-[#C4B5FD]" />
                  <span>{screenMode}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOpenDrawer((d) => (d === 'audio' ? 'none' : 'audio'))}
                  className={`px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer ${
                    openDrawer === 'audio' ? 'bg-[#8B5CF6] text-white' : 'bg-[#1C1930] text-slate-200'
                  }`}
                >
                  <Settings2 className="w-3.5 h-3.5 text-[#83A9FF]" />
                  <span className="hidden sm:inline">Audio &amp; Quality</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOpenDrawer((d) => (d === 'chapters' ? 'none' : 'chapters'))}
                  className={`px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer ${
                    openDrawer === 'chapters' ? 'bg-[#8B5CF6] text-white' : 'bg-[#1C1930] text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 text-[#C4B5FD]" />
                  <span className="hidden md:inline">Chapters</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOpenDrawer((d) => (d === 'interactions' ? 'none' : 'interactions'))}
                  className={`px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer ${
                    openDrawer === 'interactions' ? 'bg-[#F472B6] text-[#080810]' : 'bg-[#1C1930] text-[#F472B6]'
                  }`}
                >
                  <Heart className="w-3.5 h-3.5" />
                  <span>Reactions</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveMoment}
                  aria-label="Save favourite moment"
                  className="p-2 rounded-lg bg-[#1C1930] hover:bg-[#211B32] text-[#C4B5FD] cursor-pointer"
                  title="Save moment to Memories"
                >
                  <Bookmark className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (document.fullscreenElement) document.exitFullscreen?.();
                    else containerRef.current?.requestFullscreen?.().catch(() => {});
                  }}
                  aria-label="Toggle fullscreen"
                  className="p-2 rounded-lg bg-[#1C1930] hover:bg-[#211B32] text-slate-200 cursor-pointer"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Mobile Floating Couple Actions Toggle & Compact Sheet (zero cinema-control clutter) */}
      {isMobileViewport && !chatOpen && (
        <>
          {mobileActionsOpen && (
            <div
              data-testid="mobile-actions-sheet"
              className="fixed inset-x-3 bottom-16 z-30 rounded-2xl bg-[#151126]/95 border border-[#F472B6]/35 p-3.5 max-h-[50vh] overflow-y-auto shadow-2xl space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-[#F472B6] fill-[#F472B6]" />
                  <span>Couple Actions</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMobileActionsOpen(false)}
                  aria-label="Close couple actions"
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <CoupleInteractionsPanel
                compact
                onTrigger={(kind) => {
                  handleCoupleInteraction(kind);
                  setMobileActionsOpen(false);
                }}
              />
            </div>
          )}

          <button
            type="button"
            data-testid="mobile-actions-btn"
            onClick={() => setMobileActionsOpen((v) => !v)}
            className="fixed bottom-4 right-3 z-30 px-3.5 py-2.5 rounded-xl bg-[#F472B6] hover:bg-[#f472b6]/90 text-[#080810] text-xs font-bold shadow-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>{mobileActionsOpen ? 'Close' : 'Actions'}</span>
          </button>
        </>
      )}

      <SeatMapModal
        open={seatMapOpen}
        hostSeatId={coupleSeats.hostSeat.id}
        guestSeatId={coupleSeats.guestSeat.id}
        hostLabel={room.hostName || 'You'}
        guestLabel={room.guestLabel || 'My GF'}
        viewerSeatRole={viewerSeatRole}
        screenMode={screenMode}
        saving={savingSeats}
        onChangeSeats={(next) => void handleUpdateCoupleSeats(next)}
        onChangeViewerRole={(role) => setViewerRoleOverride(role)}
        onClose={() => setSeatMapOpen(false)}
      />
    </div>
  );
}
