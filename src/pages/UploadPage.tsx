import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  FolderOpen,
  MonitorPlay,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  UploadCloud,
  XCircle,
  Youtube,
} from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { useAuth } from '../context/AuthContext';
import { cinemaApi, type HealthResponse } from '../lib/api';
import { registerLocalFileForMovie } from '../lib/localMediaRegistry';
import type { MovieRecord, UploadSessionRecord } from '../types/cinema';
import {
  calculateOptimalChunkPlan,
  computeUploadMetrics,
  findMissingParts,
  formatBytes,
  isBrowserPlayableExtension,
  validateVideoUpload,
} from '../utils/uploadLogic';
import { formatTimestamp } from '../utils/playbackSync';
import { parseYouTubeUrl } from '../utils/youtube';

const ACTIVE_UPLOAD_KEY = 'together_cinema_active_upload_session';
const CHUNK_CONCURRENCY = 4;

interface QueueUploadItem {
  localId: string;
  file: File | null;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  title: string;
  genre: string;
  collectionName: string;
  session: UploadSessionRecord | null;
  status: 'queued' | 'uploading' | 'paused' | 'finalizing' | 'completed' | 'error';
  error: string | null;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  percent: number;
  completedMovie: MovieRecord | null;
}

function cleanMovieTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_.-]+/g, ' ').trim() || fileName;
}

export function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const activeControllersRef = useRef<Set<AbortController>>(new Set());
  const pausedIdsRef = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [history, setHistory] = useState<UploadSessionRecord[]>([]);
  const [queue, setQueue] = useState<QueueUploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [defaultGenre, setDefaultGenre] = useState('Personal Collection');
  const [defaultCollection, setDefaultCollection] = useState('Uploaded Films');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [launchingRoomId, setLaunchingRoomId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [youtubeSavedMovie, setYoutubeSavedMovie] = useState<MovieRecord | null>(null);

  const queueRef = useRef<QueueUploadItem[]>(queue);
  queueRef.current = queue;

  const updateQueueItem = useCallback((localId: string, updater: (item: QueueUploadItem) => QueueUploadItem) => {
    setQueue((prev) => prev.map((it) => (it.localId === localId ? updater(it) : it)));
  }, []);

  useEffect(() => {
    cinemaApi.getHealth().then(setHealth).catch(() => {});
    cinemaApi
      .listUploadSessions(user)
      .then((r) => setHistory(r.sessions))
      .catch(() => {});

    // Check for interrupted upload session from before browser refresh
    const savedId = localStorage.getItem(ACTIVE_UPLOAD_KEY);
    if (savedId) {
      cinemaApi
        .getUploadSession(savedId)
        .then(({ session }) => {
          if (session.status === 'uploading' || session.status === 'paused') {
            setQueue([
              {
                localId: `recover_${session.sessionId}`,
                file: null,
                fileName: session.fileName,
                fileSizeBytes: session.fileSizeBytes,
                mimeType: session.mimeType,
                title: cleanMovieTitle(session.fileName),
                genre: 'Personal Collection',
                collectionName: 'Uploaded Films',
                session,
                status: 'paused',
                error:
                  'Session recovered after page refresh. Select the same file from your PC again to resume remaining chunks.',
                speedBytesPerSec: 0,
                etaSeconds: null,
                percent: Math.round((session.uploadedBytes / Math.max(1, session.fileSizeBytes)) * 100),
                completedMovie: null,
              },
            ]);
          } else {
            localStorage.removeItem(ACTIVE_UPLOAD_KEY);
          }
        })
        .catch(() => localStorage.removeItem(ACTIVE_UPLOAD_KEY));
    }
  }, [user]);

  const uploadSingleItem = useCallback(
    async (itemId: string) => {
      const current = queueRef.current.find((q) => q.localId === itemId);
      if (!current || !current.file) return;

      pausedIdsRef.current.delete(itemId);
      const file = current.file;

      let activeSession = current.session;
      if (!activeSession) {
        updateQueueItem(itemId, (it) => ({ ...it, status: 'uploading', error: null }));
        try {
          const { session } = await cinemaApi.createUploadSession(
            {
              fileName: file.name,
              fileSizeBytes: file.size,
              mimeType: file.type || 'video/mp4',
            },
            user
          );
          activeSession = session;
          localStorage.setItem(ACTIVE_UPLOAD_KEY, session.sessionId);
          updateQueueItem(itemId, (it) => ({ ...it, session }));
        } catch (err) {
          updateQueueItem(itemId, (it) => ({
            ...it,
            status: 'error',
            error: err instanceof Error ? err.message : 'Could not create upload session.',
          }));
          return;
        }
      } else {
        updateQueueItem(itemId, (it) => ({ ...it, status: 'uploading', error: null }));
        await cinemaApi.resumeUploadSession(activeSession.sessionId).catch(() => {});
      }

      const startMs = Date.now();
      const missingParts = findMissingParts(activeSession.totalChunks, activeSession.uploadedParts);
      let cursor = 0;
      let abortedOrPaused = false;
      let failureMessage: string | null = null;

      const worker = async () => {
        while (!abortedOrPaused && !failureMessage) {
          if (pausedIdsRef.current.has(itemId)) {
            abortedOrPaused = true;
            return;
          }
          const idx = cursor++;
          if (idx >= missingParts.length) return;
          const partNum = missingParts[idx];

          const startByte = (partNum - 1) * activeSession!.chunkSizeBytes;
          const endByte = Math.min(startByte + activeSession!.chunkSizeBytes, file.size);
          // Stream slice ONLY — never loads 35 GB files into browser RAM
          const chunkBlob = file.slice(startByte, endByte);

          let uploaded = false;
          let attempts = 0;
          while (!uploaded && attempts < 5 && !abortedOrPaused && !failureMessage) {
            attempts += 1;
            const ctrl = new AbortController();
            activeControllersRef.current.add(ctrl);
            try {
              const { session: updated } = await cinemaApi.uploadChunk(
                activeSession!.sessionId,
                partNum,
                chunkBlob,
                user,
                ctrl.signal
              );
              activeSession = updated;
              uploaded = true;

              const metrics = computeUploadMetrics(
                updated.uploadedBytes,
                updated.fileSizeBytes,
                Date.now() - startMs
              );
              updateQueueItem(itemId, (it) => ({
                ...it,
                session: updated,
                status: 'uploading',
                error: null,
                speedBytesPerSec: metrics.speedBytesPerSec,
                etaSeconds: metrics.etaSeconds,
                percent: metrics.percent,
              }));
            } catch (err) {
              if (pausedIdsRef.current.has(itemId) || (err instanceof DOMException && err.name === 'AbortError')) {
                abortedOrPaused = true;
                return;
              }
              if (attempts >= 5) {
                failureMessage = `Interrupted at part #${partNum}: ${err instanceof Error ? err.message : 'Network error'}. Click Resume to retry.`;
                return;
              }
              await new Promise((r) => setTimeout(r, Math.min(4000, 600 * attempts)));
            } finally {
              activeControllersRef.current.delete(ctrl);
            }
          }
        }
      };

      const workerCount = Math.min(CHUNK_CONCURRENCY, Math.max(1, missingParts.length));
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (pausedIdsRef.current.has(itemId) || abortedOrPaused) {
        updateQueueItem(itemId, (it) => ({ ...it, status: 'paused' }));
        return;
      }
      if (failureMessage) {
        updateQueueItem(itemId, (it) => ({ ...it, status: 'paused', error: failureMessage }));
        return;
      }

      // Finalize uploaded file & inspect metadata
      const latestItem = queueRef.current.find((q) => q.localId === itemId) || current;
      updateQueueItem(itemId, (it) => ({ ...it, status: 'finalizing' }));
      try {
        const { session: completedSession, movie } = await cinemaApi.completeUploadSession(
          activeSession.sessionId,
          {
            title: latestItem.title.trim() || undefined,
            genre: latestItem.genre,
            collectionName: latestItem.collectionName,
          },
          user
        );
        registerLocalFileForMovie(movie.id, file);
        localStorage.removeItem(ACTIVE_UPLOAD_KEY);
        updateQueueItem(itemId, (it) => ({
          ...it,
          session: completedSession,
          status: 'completed',
          percent: 100,
          etaSeconds: 0,
          completedMovie: movie,
        }));
        setHistory((prev) => [completedSession, ...prev.filter((s) => s.sessionId !== completedSession.sessionId)]);
        cinemaApi.getHealth().then(setHealth).catch(() => {});
      } catch (err) {
        updateQueueItem(itemId, (it) => ({
          ...it,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to finalize upload.',
        }));
      }
    },
    [updateQueueItem, user]
  );

  // Automatically process queued files sequentially
  useEffect(() => {
    if (processingRef.current) return;
    const nextQueued = queue.find((item) => item.status === 'queued' && item.file);
    if (!nextQueued) return;

    processingRef.current = true;
    uploadSingleItem(nextQueued.localId).finally(() => {
      processingRef.current = false;
      // Trigger re-evaluation for any additional queued files
      setQueue((prev) => [...prev]);
    });
  }, [queue, uploadSingleItem]);

  const handleFilesSelected = (fileList: FileList | File[]) => {
    setValidationError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const quotaRemaining = health
      ? Math.max(0, health.storage.quotaBytes - health.storage.usedBytes)
      : 214_748_364_800;

    const errors: string[] = [];
    const additions: QueueUploadItem[] = [];
    let recoveredId: string | null = null;

    for (const file of files) {
      // Check if this file matches an interrupted session recovered after refresh
      const matchRecovery = queueRef.current.find(
        (q) => !q.file && q.fileName === file.name && q.fileSizeBytes === file.size
      );
      if (matchRecovery && matchRecovery.session) {
        recoveredId = matchRecovery.localId;
        updateQueueItem(matchRecovery.localId, (it) => ({
          ...it,
          file,
          status: 'queued',
          error: null,
        }));
        continue;
      }

      const validation = validateVideoUpload(file.name, file.size, quotaRemaining);
      if (!validation.valid) {
        errors.push(`${file.name}: ${validation.reason}`);
        continue;
      }

      additions.push({
        localId: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type || 'video/mp4',
        title: cleanMovieTitle(file.name),
        genre: defaultGenre,
        collectionName: defaultCollection,
        session: null,
        status: 'queued',
        error: null,
        speedBytesPerSec: 0,
        etaSeconds: null,
        percent: 0,
        completedMovie: null,
      });
    }

    if (errors.length > 0) {
      setValidationError(errors.join(' '));
    }

    if (additions.length > 0) {
      setQueue((prev) => [...prev, ...additions]);
    } else if (recoveredId) {
      setQueue((prev) => [...prev]);
    }
  };

  const abortAllControllers = () => {
    activeControllersRef.current.forEach((c) => c.abort());
    activeControllersRef.current.clear();
  };

  const handlePause = (item: QueueUploadItem) => {
    pausedIdsRef.current.add(item.localId);
    abortAllControllers();
    updateQueueItem(item.localId, (it) => ({ ...it, status: 'paused' }));
  };

  const handleResume = (item: QueueUploadItem) => {
    if (!item.file) {
      fileInputRef.current?.click();
      return;
    }
    pausedIdsRef.current.delete(item.localId);
    updateQueueItem(item.localId, (it) => ({ ...it, status: 'queued', error: null }));
  };

  const handleCancelAndRemove = async (item: QueueUploadItem) => {
    pausedIdsRef.current.add(item.localId);
    if (item.status === 'uploading') {
      abortAllControllers();
    }
    if (item.session && item.status !== 'completed') {
      await cinemaApi.abortUploadSession(item.session.sessionId).catch(() => {});
      if (localStorage.getItem(ACTIVE_UPLOAD_KEY) === item.session.sessionId) {
        localStorage.removeItem(ACTIVE_UPLOAD_KEY);
      }
    }
    setQueue((prev) => prev.filter((q) => q.localId !== item.localId));
  };

  const handleWatchTogether = async (movie: MovieRecord) => {
    setLaunchingRoomId(movie.id);
    try {
      const { room } = await cinemaApi.createRoom(
        {
          name: `${movie.title} — Private Screening`,
          movieId: movie.id,
          defaultScreenMode: 'IMAX',
        },
        user
      );
      navigate(`/cinema/${room.roomId}`);
    } finally {
      setLaunchingRoomId(null);
    }
  };

  const handleInstantLocalScreening = async (item: QueueUploadItem) => {
    if (!item.file) return;
    setLaunchingRoomId(item.localId);
    try {
      let movie = item.completedMovie;
      if (!movie) {
        const res = await cinemaApi.createMovie(
          {
            title: item.title.trim() || cleanMovieTitle(item.fileName),
            description: `Direct local PC screening (${formatBytes(item.fileSizeBytes)}) with zero upload wait.`,
            genre: item.genre || 'Personal Collection',
            collectionName: item.collectionName || 'Instant PC Screening',
            fileSizeBytes: item.fileSizeBytes,
            resolution: 'Original Source',
            sourceHeight: 2160,
            videoFormat: item.fileName.split('.').pop()?.toUpperCase() || 'MP4',
            streamUrl: 'local://instant',
          },
          user
        );
        movie = res.movie;
      }
      registerLocalFileForMovie(movie.id, item.file);
      const { room } = await cinemaApi.createRoom(
        {
          name: `${movie.title} — Instant 3D Screening`,
          movieId: movie.id,
          defaultScreenMode: 'IMAX',
        },
        user
      );
      navigate(`/cinema/${room.roomId}`);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to start instant 3D screening.');
    } finally {
      setLaunchingRoomId(null);
    }
  };

  const thirtyFiveGbPlan = calculateOptimalChunkPlan(35 * 1024 * 1024 * 1024);

  return (
    <CinemaLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD] mb-2">Personal Vault</p>
          <h1 className="font-display text-3xl font-bold text-white">Upload &amp; Stream 35 GB+ Videos from PC</h1>
          <p className="text-sm text-slate-300 mt-1">
            Select single movies, multiple files, or a whole folder. Stream directly in 3D with zero wait, or upload
            across 4 parallel 16 MiB multipart streams with automatic pause/resume—no setup required.
          </p>
        </div>

        {/* Storage & Processing Configuration Status */}
        <div className="rounded-xl bg-[#151126] border border-[#C4B5FD]/15 p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <p className="text-white font-semibold">
              Storage Adapter:{' '}
              <span className="text-[#C4B5FD] uppercase">
                {health?.storage.provider === 's3'
                  ? 'MINIO (S3)'
                  : health?.storage.provider === 'local'
                  ? 'ZERO-CONFIG VAULT'
                  : 'READY'}
              </span>{' '}
              ({health?.storage.configured !== false ? 'Ready for 35 GB+ PC Videos' : 'Requires Setup'})
            </p>
            <p className="text-slate-400">
              {health?.storage.message || 'Checking storage provider...'}
              {health?.storage.provider === 's3' && health?.storage.endpoint && health?.storage.bucket
                ? ` · ${health.storage.endpoint} (${health.storage.bucket})`
                : ''}{' '}
              · Free space:{' '}
              <span className="text-slate-200 font-mono">
                {health ? formatBytes(Math.max(0, health.storage.quotaBytes - health.storage.usedBytes)) : '...'}
              </span>
            </p>
          </div>
          <div className="font-mono text-right text-slate-300">
            <span className="block">
              35 GB Plan: {thirtyFiveGbPlan.totalChunks} parts × {formatBytes(thirtyFiveGbPlan.chunkSizeBytes)} (4× parallel)
            </span>
            <span className="text-slate-400">
              FFmpeg / FFprobe: {health?.processing.ffmpegAvailable ? 'Active' : 'Original Stream Mode'}
            </span>
          </div>
        </div>

        {validationError && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-[#F472B6]/15 border border-[#F472B6]/40 text-sm text-rose-200 flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-[#F472B6]" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Multi-File PC Drag & Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) {
              handleFilesSelected(e.dataTransfer.files);
            }
          }}
          className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-colors ${
            dragOver
              ? 'border-[#8B5CF6] bg-[#8B5CF6]/10'
              : 'border-[#C4B5FD]/25 bg-[#151126]/70 hover:border-[#8B5CF6]/60'
          }`}
        >
          <UploadCloud className="w-12 h-12 text-[#C4B5FD] mx-auto mb-4" />
          <h2 className="font-display text-xl font-bold text-white">
            Drag &amp; drop movie files from your PC
          </h2>
          <p className="text-sm text-slate-300 mt-1 max-w-xl mx-auto">
            Select one or multiple files (MP4, WebM, MOV, M4V, MKV, AVI, TS, MPG, WMV). MP4/WebM/MOV stream natively
            onto the 3D auditorium screen immediately after upload.
          </p>

          <div className="mt-5 grid sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
            <div>
              <label htmlFor="upload-default-genre" className="block text-[11px] text-slate-400 mb-1">
                Default Genre for Queued Files
              </label>
              <input
                id="upload-default-genre"
                type="text"
                value={defaultGenre}
                onChange={(e) => setDefaultGenre(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>
            <div>
              <label htmlFor="upload-default-collection" className="block text-[11px] text-slate-400 mb-1">
                Default Collection
              </label>
              <input
                id="upload-default-collection"
                type="text"
                value={defaultCollection}
                onChange={(e) => setDefaultCollection(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,.mkv,.m2ts,.ts,.avi,.mov,.wmv,.flv,.mpg,.mpeg,.3gp,.ogv"
            className="hidden"
            aria-label="Choose video files from PC"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleFilesSelected(e.target.files);
              }
              e.target.value = '';
            }}
          />

          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            className="hidden"
            aria-label="Choose a folder of videos from PC"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleFilesSelected(e.target.files);
              }
              e.target.value = '';
            }}
          />

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#9167FF] text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Select Files from PC</span>
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="px-5 py-3 rounded-xl bg-[#1C1930] hover:bg-[#211B32] border border-[#C4B5FD]/20 text-slate-100 text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-[#C4B5FD]" />
              <span>Select Folder</span>
            </button>
          </div>
        </div>

        {/* Direct YouTube Link Import & Screening */}
        <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Youtube className="w-5 h-5 text-[#F472B6]" />
              <div>
                <h2 className="font-display text-lg font-bold text-white">Add Movie via YouTube Link</h2>
                <p className="text-xs text-slate-400">
                  Paste any YouTube watch, Shorts, or share URL to save to your library or launch immediately in 3D Screen X.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              aria-label="YouTube link to add"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
            <button
              type="button"
              disabled={youtubeBusy || !youtubeUrl.trim()}
              onClick={async () => {
                setValidationError(null);
                const parsed = parseYouTubeUrl(youtubeUrl);
                if (!parsed) {
                  setValidationError('Please enter a valid YouTube link (youtube.com/watch?v=... or youtu.be/...).');
                  return;
                }
                setYoutubeBusy(true);
                try {
                  const meta = await cinemaApi.resolveYouTubeMetadata(youtubeUrl);
                  const { movie } = await cinemaApi.createMovie(
                    {
                      title: meta.title,
                      description: `YouTube Cinema (${meta.authorName}) · ${meta.watchUrl}`,
                      genre: defaultGenre || 'YouTube Cinema',
                      collectionName: defaultCollection || 'YouTube Links',
                      fileSizeBytes: 0,
                      resolution: '1080p Full HD',
                      sourceHeight: 1080,
                      videoFormat: 'YouTube Stream',
                      audioFormat: 'YouTube Stereo',
                      thumbnailUrl: meta.thumbnailUrl,
                      streamUrl: meta.streamUrl,
                    },
                    user
                  );
                  setYoutubeSavedMovie(movie);
                  setYoutubeUrl('');
                } catch (err) {
                  setValidationError(err instanceof Error ? err.message : 'Unable to add YouTube video.');
                } finally {
                  setYoutubeBusy(false);
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-[#F472B6] hover:bg-[#f472b6]/90 disabled:opacity-50 text-[#080810] text-xs font-bold shrink-0 cursor-pointer"
            >
              {youtubeBusy ? 'Adding...' : 'Save YouTube Link'}
            </button>
          </div>

          {youtubeSavedMovie && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={youtubeSavedMovie.thumbnailUrl}
                  alt={youtubeSavedMovie.title}
                  className="w-16 h-10 rounded object-cover shrink-0 bg-black"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{youtubeSavedMovie.title}</p>
                  <p className="text-xs text-emerald-200">Saved to library · Ready for 3D screening</p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const { room } = await cinemaApi.createRoom(
                    {
                      name: `${youtubeSavedMovie.title.slice(0, 60)} — YouTube Night`,
                      movieId: youtubeSavedMovie.id,
                      defaultScreenMode: 'Screen X',
                    },
                    user
                  );
                  navigate(`/cinema/${room.roomId}?theatre=1`);
                }}
                className="px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                <span>Watch Together in 3D</span>
              </button>
            </div>
          )}
        </section>

        {/* Active Multi-File Upload Queue */}
        {queue.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                PC Upload Queue ({queue.length} {queue.length === 1 ? 'file' : 'files'})
              </h2>
              <span className="text-xs font-mono text-[#C4B5FD]">
                {queue.filter((q) => q.status === 'completed').length} completed ·{' '}
                {queue.filter((q) => q.status === 'uploading' || q.status === 'queued').length} active
              </span>
            </div>

            {queue.map((item) => {
              const nativeStreamable = isBrowserPlayableExtension(item.fileName);
              return (
                <article
                  key={item.localId}
                  className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 flex-1 min-w-[220px]">
                      <p className="text-xs font-mono text-[#C4B5FD]">
                        {formatBytes(item.fileSizeBytes)} ·{' '}
                        {item.session
                          ? `${item.session.uploadedParts.length}/${item.session.totalChunks} chunks (${formatBytes(item.session.chunkSizeBytes)} each)`
                          : 'Waiting in queue'}{' '}
                        · {item.status.toUpperCase()}
                      </p>

                      {item.status === 'queued' || item.status === 'paused' ? (
                        <input
                          type="text"
                          aria-label={`Movie title for ${item.fileName}`}
                          value={item.title}
                          onChange={(e) =>
                            updateQueueItem(item.localId, (it) => ({ ...it, title: e.target.value }))
                          }
                          className="w-full max-w-md px-3 py-1.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 font-display text-base font-bold text-white"
                        />
                      ) : (
                        <h3 className="font-display text-lg font-bold text-white">{item.title}</h3>
                      )}

                      <p className="text-xs text-slate-400">Source file: {item.fileName}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.file && item.status !== 'completed' && (
                        <button
                          type="button"
                          disabled={launchingRoomId === item.localId}
                          onClick={() => handleInstantLocalScreening(item)}
                          className="px-3.5 py-2 rounded-lg bg-[#F472B6] hover:bg-[#f472b6]/90 text-[#080810] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <MonitorPlay className="w-3.5 h-3.5" />
                          <span>
                            {launchingRoomId === item.localId ? 'Opening 3D...' : 'Watch Instantly in 3D'}
                          </span>
                        </button>
                      )}
                      {item.status === 'uploading' && (
                        <button
                          type="button"
                          onClick={() => handlePause(item)}
                          className="px-3.5 py-2 rounded-lg bg-[#211B32] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </button>
                      )}
                      {(item.status === 'paused' || item.status === 'error') && (
                        <button
                          type="button"
                          onClick={() => handleResume(item)}
                          className="px-3.5 py-2 rounded-lg bg-[#8B5CF6] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>{item.file ? 'Resume' : 'Re-select File to Resume'}</span>
                        </button>
                      )}
                      {item.status !== 'completed' ? (
                        <button
                          type="button"
                          onClick={() => handleCancelAndRemove(item)}
                          aria-label={`Cancel upload for ${item.fileName}`}
                          className="px-3.5 py-2 rounded-lg bg-rose-500/20 text-xs font-semibold text-rose-200 flex items-center gap-1.5 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCancelAndRemove(item)}
                          aria-label={`Dismiss ${item.fileName} from queue`}
                          className="p-2 rounded-lg bg-[#1C1930] text-slate-400 hover:text-white cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {!nativeStreamable && item.status !== 'completed' && (
                    <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      Note: {item.fileName.split('.').pop()?.toUpperCase()} containers can be uploaded and archived,
                      though browsers stream MP4, WebM, and MOV most reliably for instant 3D playback.
                    </p>
                  )}

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[#8B5CF6] transition-all duration-200"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap justify-between text-xs font-mono text-slate-300">
                      <span>
                        {formatBytes(item.session?.uploadedBytes || 0)} uploaded ·{' '}
                        {formatBytes(Math.max(0, item.fileSizeBytes - (item.session?.uploadedBytes || 0)))} remaining
                      </span>
                      <span>
                        {item.percent}% ·{' '}
                        {item.speedBytesPerSec > 0
                          ? `${formatBytes(item.speedBytesPerSec)}/s`
                          : item.status === 'queued'
                          ? 'Queued'
                          : 'Preparing...'}{' '}
                        · ETA: {item.etaSeconds !== null ? formatTimestamp(item.etaSeconds) : '--:--'}
                      </span>
                    </div>
                  </div>

                  {item.error && (
                    <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 shrink-0" />
                      <span>{item.error}</span>
                    </div>
                  )}

                  {item.completedMovie && (
                    <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-white">
                            Ready in Private Vault: {item.completedMovie.title}
                          </p>
                          <p className="text-xs text-emerald-200">
                            {item.completedMovie.resolution} · {item.completedMovie.videoFormat} ·{' '}
                            {item.completedMovie.processingStatus}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={launchingRoomId === item.completedMovie.id}
                          onClick={() => handleWatchTogether(item.completedMovie!)}
                          className="px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <MonitorPlay className="w-3.5 h-3.5" />
                          <span>
                            {launchingRoomId === item.completedMovie.id
                              ? 'Opening Auditorium...'
                              : 'Watch Together in 3D'}
                          </span>
                        </button>
                        <Link
                          to={`/movies/${item.completedMovie.id}`}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                        >
                          Movie Details
                        </Link>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {/* Upload History */}
        <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">Upload History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">No multipart upload sessions recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {history.map((s) => (
                <div
                  key={s.sessionId}
                  className="p-3.5 rounded-xl bg-[#0B1020] border border-[#C4B5FD]/10 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <Film className="w-4 h-4 text-[#C4B5FD]" />
                    <div>
                      <p className="font-semibold text-white">{s.fileName}</p>
                      <p className="text-slate-400 font-mono">
                        {formatBytes(s.uploadedBytes)} / {formatBytes(s.fileSizeBytes)} · {s.totalChunks} parts
                      </p>
                    </div>
                  </div>
                  <span className="font-mono uppercase text-[#C4B5FD]">{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </CinemaLayout>
  );
}
