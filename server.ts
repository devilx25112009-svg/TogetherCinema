import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import type {
  CinemaRoomRecord,
  MemoryItemRecord,
  MovieRecord,
  SnackItemRecord,
  WatchlistItemRecord,
} from './src/types/cinema';
import { calculateOptimalChunkPlan, validateVideoUpload } from './src/utils/uploadLogic';
import { formatSeatLabel, getSeatById, resolveCoupleSeats } from './src/utils/seatMap';
import { parseYouTubeUrl } from './src/utils/youtube';
import {
  checkFfmpegInstalled,
  inspectVideoObject,
  spawnFfmpegAudioCompatStream,
} from './src/server/processing/VideoProcessor';
import { createStorageProvider } from './src/server/storage/StorageProvider';
import { CinemaStore } from './src/server/store/cinemaStore';
import { attachCinemaWebSocket } from './src/server/ws/cinemaWs';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  const httpServer = http.createServer(app);
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 120_000;
  httpServer.keepAliveTimeout = 65_000;
  const storage = createStorageProvider();
  const store = new CinemaStore();
  const wsHub = attachCinemaWebSocket(httpServer, store);

  // Basic security headers & CORS
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-User-Name');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Simple in-memory rate limiter for standard API endpoints
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/uploads/sessions/') && req.method === 'PUT') {
      next();
      return;
    }
    const key = req.ip || 'local';
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > 400) {
      res.status(429).json({ error: 'Too many requests. Please slow down briefly.' });
      return;
    }
    next();
  });

  // Parse JSON for non-chunk-binary routes
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.includes('/parts/') && req.method === 'PUT') {
      next();
      return;
    }
    express.json({ limit: '2mb' })(req, res, next);
  });

  const getActor = (req: Request) => ({
    uid: String(req.headers['x-user-id'] || 'demo-partner-a').slice(0, 128),
    displayName: String(req.headers['x-user-name'] || 'Aayush').slice(0, 80),
  });

  // ---------------------------------------------------------------------------
  // Health & Infrastructure Capabilities
  // ---------------------------------------------------------------------------
  app.get('/api/health', async (_req: Request, res: Response) => {
    const [storageStatus, ffmpegTools] = await Promise.all([
      storage.getConfigStatus(),
      checkFfmpegInstalled(),
    ]);
    const snap = store.getSnapshot();
    res.json({
      ok: true,
      storage: storageStatus,
      processing: {
        ffmpegAvailable: ffmpegTools.ffmpeg,
        ffprobeAvailable: ffmpegTools.ffprobe,
      },
      gifProviderConfigured: Boolean(process.env.GIPHY_API_KEY),
      roomsCount: snap.rooms.length,
      moviesCount: snap.movies.length,
    });
  });

  // ---------------------------------------------------------------------------
  // Large Video Resumable Multipart Upload Architecture (35GB - 50GB+)
  // ---------------------------------------------------------------------------
  app.get('/api/uploads/sessions', async (req: Request, res: Response) => {
    const { uid } = getActor(req);
    const sessions = await storage.listSessions(uid);
    res.json({ sessions });
  });

  app.post('/api/uploads/sessions', async (req: Request, res: Response) => {
    try {
      const { uid } = getActor(req);
      const { fileName, fileSizeBytes, mimeType } = req.body as {
        fileName?: string;
        fileSizeBytes?: number;
        mimeType?: string;
      };

      const status = await storage.getConfigStatus();
      if (!status.configured) {
        res.status(503).json({
          error: status.message,
          code: 'STORAGE_NOT_CONFIGURED',
        });
        return;
      }

      const remaining = Math.max(0, status.quotaBytes - status.usedBytes);
      const validation = validateVideoUpload(String(fileName || ''), Number(fileSizeBytes || 0), remaining);
      if (!validation.valid) {
        res.status(400).json({ error: validation.reason });
        return;
      }

      const plan = calculateOptimalChunkPlan(Number(fileSizeBytes));
      const sessionId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const session = await storage.createUploadSession({
        sessionId,
        ownerId: uid,
        fileName: String(fileName),
        mimeType: String(mimeType || 'video/mp4'),
        fileSizeBytes: Number(fileSizeBytes),
        chunkSizeBytes: plan.chunkSizeBytes,
        totalChunks: plan.totalChunks,
      });

      res.status(201).json({ session });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create upload session.' });
    }
  });

  app.get('/api/uploads/sessions/:id', async (req: Request, res: Response) => {
    const session = await storage.getUploadStatus(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'Upload session not found.' });
      return;
    }
    res.json({ session });
  });

  app.put('/api/uploads/sessions/:id/parts/:partNumber', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.id);
      const partNumber = Number(req.params.partNumber);
      const contentLength = Number(req.headers['content-length'] || 0);
      const session = await storage.uploadPart(sessionId, partNumber, req, contentLength);
      res.json({ session });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOSPC') {
        res.status(507).json({
          error:
            'Server disk space is full for this multi-gigabyte file. Use "Watch Instantly in 3D" directly from your PC file, or point S3_ENDPOINT to your MinIO drive.',
        });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Chunk upload failed.' });
    }
  });

  app.post('/api/uploads/sessions/:id/resume', async (req: Request, res: Response) => {
    const session = await storage.resumeUpload(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'Upload session not found.' });
      return;
    }
    res.json({ session });
  });

  app.post('/api/uploads/sessions/:id/complete', async (req: Request, res: Response) => {
    try {
      const { uid } = getActor(req);
      const sessionId = String(req.params.id);
      const { title, description, genre, collectionName } = (req.body || {}) as {
        title?: string;
        description?: string;
        genre?: string;
        collectionName?: string;
      };

      const { session, verifiedBytes } = await storage.completeUpload(sessionId);
      const inspectionTarget = await storage.getInspectionTarget(session.storageKey);
      const inspection = await inspectVideoObject(inspectionTarget);
      const signedUrl = storage.getSignedPlaybackUrl(session.storageKey, 86400);
      const compatUrl = signedUrl.replace('/api/media/stream/', '/api/media/stream-compat/');

      const cleanTitle =
        (title && title.trim()) || session.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');

      const snap = store.getSnapshot();
      const partner = snap.connections[uid]?.partnerId;
      const now = new Date().toISOString();

      const movie: MovieRecord = {
        id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerId: uid,
        sharedWithPartnerId: partner,
        title: cleanTitle.slice(0, 160),
        description:
          (description && description.trim()) ||
          `Personal upload (${inspection.resolutionLabel}) stored in private MinIO cinema vault.`,
        genre: (genre && genre.trim()) || 'Personal Collection',
        durationSeconds: inspection.durationSeconds || 0,
        fileSizeBytes: verifiedBytes,
        resolution: inspection.resolutionLabel,
        sourceHeight: inspection.height,
        stereoscopicFormat: 'none',
        videoFormat: inspection.videoFormat,
        audioFormat: inspection.audioFormat,
        subtitles: inspection.subtitles,
        audioTracks: inspection.audioTracks,
        chapters: [{ id: 'ch-start', title: '01. Opening Frame', timeSeconds: 0 }],
        thumbnailUrl: '/src/assets/images/cinema_hero_couple_1794680184863.jpg',
        streamUrl: signedUrl,
        streamCompatUrl: compatUrl,
        audioNeedsCompat: inspection.audioNeedsCompat,
        storageKey: session.storageKey,
        processingStatus: inspection.processingStatus,
        collectionName: (collectionName && collectionName.trim()) || 'Uploaded Films',
        playbackProgress: 0,
        isFavourite: false,
        createdAt: now,
        updatedAt: now,
      };

      snap.movies.unshift(movie);
      await store.save();

      res.json({ session, movie, inspection });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to finalize upload.' });
    }
  });

  app.delete('/api/uploads/sessions/:id', async (req: Request, res: Response) => {
    await storage.abortUpload(String(req.params.id));
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Signed Byte-Range Video Streaming (streams from MinIO/S3 without RAM load)
  // ---------------------------------------------------------------------------
  app.get(/^\/api\/media\/stream\/(.+)$/, async (req: Request, res: Response) => {
    const rawKey = String(req.params[0] || '');
    const storageKey = decodeURIComponent(rawKey);
    const expires = String(req.query.expires || '');
    const sig = String(req.query.sig || '');

    if (!storage.verifyPlaybackToken(storageKey, expires, sig)) {
      res.status(403).json({ error: 'Invalid or expired signed playback URL.' });
      return;
    }

    try {
      const result = await storage.openObjectStream(storageKey, req.headers.range);
      if (!result) {
        res.status(404).json({ error: 'Media object not found in storage.' });
        return;
      }

      const headers: Record<string, string | number> = {
        'Accept-Ranges': 'bytes',
        'Content-Length': result.contentLength,
        'Content-Type': result.contentType,
        'Cache-Control': 'private, max-age=300',
      };
      if (result.statusCode === 206 && result.contentRange) {
        headers['Content-Range'] = result.contentRange;
      }

      res.writeHead(result.statusCode, headers);
      req.on('close', () => {
        result.stream.destroy();
      });
      result.stream.on('error', () => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Stream interrupted while reading from MinIO storage.' });
        } else {
          res.end();
        }
      });
      result.stream.pipe(res);
    } catch (err) {
      const e = err as { statusCode?: number; totalSize?: number; message?: string };
      if (e?.statusCode === 416 && typeof e.totalSize === 'number') {
        res.status(416).setHeader('Content-Range', `bytes */${e.totalSize}`).end();
        return;
      }
      res.status(502).json({ error: e?.message || 'Unable to stream media from storage.' });
    }
  });

  app.get(/^\/api\/media\/(stream-compat|audio-compat)\/(.+)$/, async (req: Request, res: Response) => {
    const mode = req.params[0];
    const storageKey = decodeURIComponent(String(req.params[1] || ''));
    const expires = String(req.query.expires || '');
    const sig = String(req.query.sig || '');
    const seekSeconds = Math.max(0, Number(req.query.t || 0));
    const audioIndex = Math.max(0, Number(req.query.a || 0));

    if (!storage.verifyPlaybackToken(storageKey, expires, sig)) {
      res.status(403).json({ error: 'Invalid or expired signed compatibility URL.' });
      return;
    }

    const inputTarget = await storage.getInspectionTarget(storageKey);
    if (!inputTarget) {
      res.status(404).json({ error: 'Media object not found for compatibility audio remux.' });
      return;
    }

    const ffmpegTools = await checkFfmpegInstalled();
    if (!ffmpegTools.ffmpeg) {
      res.status(503).json({ error: 'FFmpeg is unavailable for live audio compatibility transcoding.' });
      return;
    }

    const audioOnly = mode === 'audio-compat';
    const ff = spawnFfmpegAudioCompatStream(inputTarget, { seekSeconds, audioIndex, audioOnly });
    res.writeHead(200, {
      'Content-Type': audioOnly ? 'audio/mp4' : 'video/mp4',
      'Cache-Control': 'private, no-store',
    });

    ff.stdout.pipe(res);
    req.on('close', () => {
      if (!ff.killed) ff.kill('SIGKILL');
    });
    ff.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.end();
    });
  });

  // ---------------------------------------------------------------------------
  // Movies Library API
  // ---------------------------------------------------------------------------
  const hydrateMovieForPlayback = (m: MovieRecord): MovieRecord => {
    if (!m.storageKey) return m;
    const streamUrl = storage.getSignedPlaybackUrl(m.storageKey, 7200);
    return {
      ...m,
      streamUrl,
      streamCompatUrl: streamUrl.replace('/api/media/stream/', '/api/media/stream-compat/'),
    };
  };

  app.get('/api/movies', (req: Request, res: Response) => {
    const snap = store.getSnapshot();
    const q = String(req.query.q || '').toLowerCase().trim();
    const genre = String(req.query.genre || '').trim();

    let movies = snap.movies.map(hydrateMovieForPlayback);

    if (q) {
      movies = movies.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.genre.toLowerCase().includes(q) ||
          m.collectionName.toLowerCase().includes(q)
      );
    }
    if (genre && genre !== 'All') {
      movies = movies.filter((m) => m.genre === genre);
    }
    res.json({ movies });
  });

  app.get('/api/movies/:id', (req: Request, res: Response) => {
    const snap = store.getSnapshot();
    const movie = snap.movies.find((m) => m.id === req.params.id);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found.' });
      return;
    }
    res.json({ movie: hydrateMovieForPlayback(movie) });
  });

  // ---------------------------------------------------------------------------
  // YouTube Link Metadata Resolver (oEmbed + Clean Fallback)
  // ---------------------------------------------------------------------------
  app.get('/api/youtube/metadata', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    const parsed = parseYouTubeUrl(rawUrl);
    if (!parsed) {
      res.status(400).json({
        error: 'Please enter a valid YouTube video URL (youtube.com/watch?v=... or youtu.be/...).',
      });
      return;
    }

    let title = `YouTube Cinema (${parsed.videoId})`;
    let authorName = 'YouTube';
    let thumbnailUrl = parsed.thumbnailUrl;
    let resolvedFromOembed = false;

    try {
      const oembedResp = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.watchUrl)}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oembedResp.ok) {
        const data = (await oembedResp.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        if (data.title?.trim()) title = data.title.trim();
        if (data.author_name?.trim()) authorName = data.author_name.trim();
        if (data.thumbnail_url?.trim()) thumbnailUrl = data.thumbnail_url.trim();
        resolvedFromOembed = true;
      }
    } catch {
      // Offline / blocked oEmbed falls back gracefully to deterministic thumbnail & ID
    }

    res.json({
      videoId: parsed.videoId,
      title,
      authorName,
      thumbnailUrl,
      watchUrl: parsed.watchUrl,
      embedUrl: parsed.embedUrl,
      streamUrl: parsed.streamUrl,
      startSeconds: parsed.startSeconds,
      resolvedFromOembed,
    });
  });

  app.post('/api/movies', async (req: Request, res: Response) => {
    const { uid } = getActor(req);
    const body = req.body as Partial<MovieRecord>;
    if (!body.title?.trim()) {
      res.status(400).json({ error: 'Movie title is required.' });
      return;
    }
    const yt = parseYouTubeUrl(body.streamUrl);
    const snap = store.getSnapshot();
    const now = new Date().toISOString();
    const created: MovieRecord = {
      id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: uid,
      sharedWithPartnerId: snap.connections[uid]?.partnerId,
      title: body.title.trim().slice(0, 160),
      description: (
        body.description ||
        (yt ? `YouTube Cinema stream (${yt.watchUrl})` : 'Added to private cinema collection.')
      ).slice(0, 2000),
      genre: (body.genre || (yt ? 'YouTube Cinema' : 'Drama')).slice(0, 60),
      durationSeconds: Number(body.durationSeconds || (yt ? 600 : 5400)),
      fileSizeBytes: Number(body.fileSizeBytes ?? (yt ? 0 : 4_200_000_000)),
      resolution: body.resolution || (yt ? '1080p Full HD' : '4K UHD (2160p)'),
      sourceHeight: Number(body.sourceHeight || (yt ? 1080 : 2160)),
      stereoscopicFormat: body.stereoscopicFormat || 'none',
      videoFormat: body.videoFormat || (yt ? 'YouTube Stream' : 'MP4 / H.265'),
      audioFormat: body.audioFormat || (yt ? 'YouTube Stereo' : '5.1 Surround'),
      subtitles: body.subtitles || [{ id: 'sub-en', label: 'English', language: 'en' }],
      audioTracks: body.audioTracks || [{ id: 'aud-1', label: 'Original Audio', language: 'en', channels: '2.0' }],
      chapters: body.chapters || [{ id: 'ch-1', title: '01. Start', timeSeconds: yt?.startSeconds || 0 }],
      thumbnailUrl: body.thumbnailUrl || (yt ? yt.thumbnailUrl : '/src/assets/images/poster_midnight_orbit_1794680182030.jpg'),
      streamUrl: yt ? yt.streamUrl : body.streamUrl || 'procedural://midnight-orbit',
      processingStatus: 'ready',
      collectionName: body.collectionName || (yt ? 'YouTube Links' : 'Curated Nights'),
      playbackProgress: 0,
      isFavourite: Boolean(body.isFavourite),
      createdAt: now,
      updatedAt: now,
    };
    snap.movies.unshift(created);
    await store.save();
    res.status(201).json({ movie: created });
  });

  app.patch('/api/movies/:id', async (req: Request, res: Response) => {
    const snap = store.getSnapshot();
    const movie = snap.movies.find((m) => m.id === req.params.id);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found.' });
      return;
    }
    const patch = req.body as Partial<MovieRecord>;
    if (typeof patch.title === 'string' && patch.title.trim()) movie.title = patch.title.trim().slice(0, 160);
    if (typeof patch.description === 'string') movie.description = patch.description.slice(0, 2000);
    if (typeof patch.genre === 'string') movie.genre = patch.genre.slice(0, 60);
    if (typeof patch.collectionName === 'string') movie.collectionName = patch.collectionName.slice(0, 80);
    if (typeof patch.isFavourite === 'boolean') movie.isFavourite = patch.isFavourite;
    if (typeof patch.playbackProgress === 'number') movie.playbackProgress = Math.max(0, patch.playbackProgress);
    movie.updatedAt = new Date().toISOString();
    await store.save();
    res.json({ movie });
  });

  app.delete('/api/movies/:id', async (req: Request, res: Response) => {
    const snap = store.getSnapshot();
    const idx = snap.movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Movie not found.' });
      return;
    }
    const [removed] = snap.movies.splice(idx, 1);
    if (removed.storageKey) {
      await storage.deleteObject(removed.storageKey);
    }
    await store.save();
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Cinema Rooms API
  // ---------------------------------------------------------------------------
  app.get('/api/rooms', (_req: Request, res: Response) => {
    const snap = store.getSnapshot();
    res.json({
      rooms: snap.rooms,
      participants: snap.participants,
      playbackStates: snap.playbackStates,
    });
  });

  app.post('/api/rooms', async (req: Request, res: Response) => {
    const { uid, displayName } = getActor(req);
    const body = req.body as Partial<CinemaRoomRecord>;
    if (!body.name?.trim()) {
      res.status(400).json({ error: 'Room name is required.' });
      return;
    }
    const snap = store.getSnapshot();
    const movieId = body.movieId || snap.movies[0]?.id || 'mov-midnight-orbit';
    const roomId = `room_${Date.now().toString(36)}`;
    const inviteCode = `CIN-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    const resolvedSeats = resolveCoupleSeats(body.hostSeatId, body.guestSeatId);

    const room: CinemaRoomRecord = {
      roomId,
      hostId: uid,
      hostName: displayName,
      guestId: snap.connections[uid]?.partnerId,
      guestLabel:
        (typeof body.guestLabel === 'string' && body.guestLabel.trim().slice(0, 40)) ||
        (snap.connections[uid]?.partnerName ? `${snap.connections[uid].partnerName} (GF)` : 'My GF'),
      hostSeatId: resolvedSeats.hostSeat.id,
      guestSeatId: resolvedSeats.guestSeat.id,
      inviteCode,
      name: body.name.trim().slice(0, 120),
      movieId,
      theme: body.theme || 'midnight_velvet',
      privacy: body.privacy || 'invite_code',
      defaultQuality: body.defaultQuality || '2160p',
      defaultAudio: body.defaultAudio || 'Original Audio',
      defaultScreenMode: body.defaultScreenMode || 'IMAX',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    };

    snap.rooms.unshift(room);
    snap.playbackStates[roomId] = {
      roomId,
      movieId,
      currentTime: 0,
      playing: false,
      playbackRate: 1.0,
      updatedAt: Date.now(),
      hostId: uid,
      revision: 1,
      quality: room.defaultQuality,
      audioMode: room.defaultAudio,
      screenMode: room.defaultScreenMode,
    };
    snap.participants[roomId] = [
      {
        userId: uid,
        displayName,
        role: 'host',
        online: true,
        seatId: resolvedSeats.hostSeat.id,
        seatLabel: formatSeatLabel(resolvedSeats.hostSeat.id),
        joinedAt: now,
      },
    ];
    snap.chats[roomId] = [];

    await store.save();
    res.status(201).json({ room });
  });

  app.post('/api/rooms/join', async (req: Request, res: Response) => {
    const { uid, displayName } = getActor(req);
    const code = String((req.body as { inviteCode?: string })?.inviteCode || '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Please enter an invitation code.' });
      return;
    }
    const snap = store.getSnapshot();
    const room = snap.rooms.find((r) => r.inviteCode.toUpperCase() === code || r.roomId === code);
    if (!room) {
      res.status(404).json({ error: 'No cinema room found with that invitation code.' });
      return;
    }
    const presentedExactCode = room.inviteCode.toUpperCase() === code;
    if (room.privacy === 'partner_only' && room.hostId !== uid && room.guestId !== uid && !presentedExactCode) {
      res.status(403).json({ error: 'This private room is restricted to connected partners only.' });
      return;
    }
    if (!room.guestId && room.hostId !== uid) {
      room.guestId = uid;
    }
    if (!snap.participants[room.roomId]) snap.participants[room.roomId] = [];
    const resolvedSeats = resolveCoupleSeats(room.hostSeatId, room.guestSeatId);
    const joinRole = room.hostId === uid ? 'host' : 'guest';
    const assignedSeatId = joinRole === 'host' ? resolvedSeats.hostSeat.id : resolvedSeats.guestSeat.id;
    if (!snap.participants[room.roomId].some((p) => p.userId === uid)) {
      snap.participants[room.roomId].push({
        userId: uid,
        displayName,
        role: joinRole,
        online: true,
        seatId: assignedSeatId,
        seatLabel: formatSeatLabel(assignedSeatId),
        joinedAt: new Date().toISOString(),
      });
    }
    await store.save();
    res.json({ room });
  });

  app.get('/api/rooms/:roomId', (req: Request, res: Response) => {
    const snap = store.getSnapshot();
    const room = snap.rooms.find((r) => r.roomId === req.params.roomId);
    if (!room) {
      res.status(404).json({ error: 'No cinema room found.' });
      return;
    }
    const movie = snap.movies.find((m) => m.id === room.movieId) || snap.movies[0] || null;
    const hydratedMovie = movie ? hydrateMovieForPlayback(movie) : null;

    res.json({
      room,
      movie: hydratedMovie,
      playbackState: snap.playbackStates[room.roomId],
      participants: snap.participants[room.roomId] || [],
      chatHistory: snap.chats[room.roomId] || [],
    });
  });

  app.post('/api/rooms/:roomId/source', async (req: Request, res: Response) => {
    const { uid } = getActor(req);
    const snap = store.getSnapshot();
    const room = snap.rooms.find((r) => r.roomId === req.params.roomId);
    if (!room) {
      res.status(404).json({ error: 'Cinema room not found.' });
      return;
    }

    const { movieId, youtubeUrl, title, thumbnailUrl } = (req.body || {}) as {
      movieId?: string;
      youtubeUrl?: string;
      title?: string;
      thumbnailUrl?: string;
    };

    let targetMovie: MovieRecord | undefined;
    let startSeconds = 0;

    if (youtubeUrl) {
      const parsed = parseYouTubeUrl(youtubeUrl);
      if (!parsed) {
        res.status(400).json({ error: 'Invalid YouTube video URL.' });
        return;
      }
      startSeconds = parsed.startSeconds;
      const now = new Date().toISOString();
      targetMovie = {
        id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerId: uid,
        sharedWithPartnerId: snap.connections[uid]?.partnerId,
        title: (title && title.trim()) || `YouTube Cinema (${parsed.videoId})`,
        description: `YouTube Cinema stream (${parsed.watchUrl})`,
        genre: 'YouTube Cinema',
        durationSeconds: 600,
        fileSizeBytes: 0,
        resolution: '1080p Full HD',
        sourceHeight: 1080,
        stereoscopicFormat: 'none',
        videoFormat: 'YouTube Stream',
        audioFormat: 'YouTube Stereo',
        subtitles: [{ id: 'sub-en', label: 'YouTube Captions', language: 'en' }],
        audioTracks: [{ id: 'aud-1', label: 'YouTube Audio', language: 'und', channels: '2.0' }],
        chapters: [{ id: 'ch-1', title: '01. Start', timeSeconds: startSeconds }],
        thumbnailUrl: thumbnailUrl || parsed.thumbnailUrl,
        streamUrl: parsed.streamUrl,
        processingStatus: 'ready',
        collectionName: 'YouTube Links',
        playbackProgress: 0,
        isFavourite: false,
        createdAt: now,
        updatedAt: now,
      };
      snap.movies.unshift(targetMovie);
    } else if (movieId) {
      targetMovie = snap.movies.find((m) => m.id === movieId);
    }

    if (!targetMovie) {
      res.status(400).json({ error: 'Provide a valid youtubeUrl or movieId.' });
      return;
    }

    room.movieId = targetMovie.id;
    room.status = 'ready';
    room.updatedAt = new Date().toISOString();

    const prevState = snap.playbackStates[room.roomId];
    const nextState = {
      roomId: room.roomId,
      movieId: targetMovie.id,
      currentTime: startSeconds,
      playing: false,
      playbackRate: 1.0,
      updatedAt: Date.now(),
      hostId: prevState?.hostId || room.hostId,
      revision: (prevState?.revision || 0) + 1,
      quality: prevState?.quality || room.defaultQuality,
      audioMode: prevState?.audioMode || room.defaultAudio,
      screenMode: prevState?.screenMode || room.defaultScreenMode,
    };
    snap.playbackStates[room.roomId] = nextState;
    await store.save();

    const hydratedMovie = hydrateMovieForPlayback(targetMovie);
    wsHub.broadcastToRoom(room.roomId, {
      type: 'room:source',
      room,
      movie: hydratedMovie,
      playbackState: nextState,
    });

    res.json({ room, movie: hydratedMovie, playbackState: nextState });
  });

  app.post('/api/rooms/:roomId/seats', async (req: Request, res: Response) => {
    const snap = store.getSnapshot();
    const room = snap.rooms.find((r) => r.roomId === req.params.roomId);
    if (!room) {
      res.status(404).json({ error: 'Cinema room not found.' });
      return;
    }

    const body = (req.body || {}) as {
      hostSeatId?: string;
      guestSeatId?: string;
      guestLabel?: string;
    };

    if (body.hostSeatId && !getSeatById(body.hostSeatId)) {
      res.status(400).json({ error: `Unknown auditorium seat "${body.hostSeatId}".` });
      return;
    }
    if (body.guestSeatId && !getSeatById(body.guestSeatId)) {
      res.status(400).json({ error: `Unknown auditorium seat "${body.guestSeatId}".` });
      return;
    }

    const resolved = resolveCoupleSeats(
      body.hostSeatId || room.hostSeatId,
      body.guestSeatId || room.guestSeatId
    );
    room.hostSeatId = resolved.hostSeat.id;
    room.guestSeatId = resolved.guestSeat.id;
    if (typeof body.guestLabel === 'string' && body.guestLabel.trim()) {
      room.guestLabel = body.guestLabel.trim().slice(0, 40);
    }
    room.updatedAt = new Date().toISOString();

    if (!snap.participants[room.roomId]) snap.participants[room.roomId] = [];
    for (const participant of snap.participants[room.roomId]) {
      const nextId = participant.role === 'host' ? resolved.hostSeat.id : resolved.guestSeat.id;
      participant.seatId = nextId;
      participant.seatLabel = formatSeatLabel(nextId);
    }

    await store.save();
    wsHub.broadcastToRoom(room.roomId, {
      type: 'room:seats',
      room,
      participants: snap.participants[room.roomId],
    });

    res.json({ room, participants: snap.participants[room.roomId] });
  });

  // ---------------------------------------------------------------------------
  // Partner Connection API
  // ---------------------------------------------------------------------------
  app.get('/api/partners/status', (req: Request, res: Response) => {
    const { uid } = getActor(req);
    const snap = store.getSnapshot();
    const conn = snap.connections[uid];
    const pendingInvite = Object.values(snap.invitations).find(
      (i) => i.creatorId === uid && i.status === 'pending'
    );
    res.json({
      connected: Boolean(conn),
      connection: conn || null,
      activeInviteCode: pendingInvite?.code || null,
    });
  });

  app.post('/api/partners/invite', async (req: Request, res: Response) => {
    const { uid, displayName } = getActor(req);
    const snap = store.getSnapshot();
    const code = `DUET-${Math.floor(1000 + Math.random() * 9000)}`;
    snap.invitations[code] = {
      code,
      creatorId: uid,
      creatorName: displayName,
      status: 'pending',
      updatedAt: new Date().toISOString(),
    };
    await store.save();
    res.status(201).json({ invitation: snap.invitations[code] });
  });

  app.post('/api/partners/accept', async (req: Request, res: Response) => {
    const { uid, displayName } = getActor(req);
    const code = String((req.body as { code?: string })?.code || '').trim().toUpperCase();
    const snap = store.getSnapshot();
    const invite = snap.invitations[code];
    if (!invite || invite.status !== 'pending') {
      res.status(404).json({ error: 'Invitation code is invalid or already redeemed.' });
      return;
    }
    if (invite.creatorId === uid) {
      res.status(400).json({ error: 'You cannot connect your account to your own invitation code.' });
      return;
    }
    const connectionId = `conn_${Date.now().toString(36)}`;
    invite.status = 'connected';
    invite.partnerId = uid;
    invite.partnerName = displayName;
    invite.updatedAt = new Date().toISOString();

    snap.connections[invite.creatorId] = {
      partnerId: uid,
      partnerName: displayName,
      connectionId,
    };
    snap.connections[uid] = {
      partnerId: invite.creatorId,
      partnerName: invite.creatorName,
      connectionId,
    };

    await store.save();
    res.json({ connection: snap.connections[uid] });
  });

  app.post('/api/partners/disconnect', async (req: Request, res: Response) => {
    const { uid } = getActor(req);
    const snap = store.getSnapshot();
    const conn = snap.connections[uid];
    if (conn) {
      delete snap.connections[conn.partnerId];
      delete snap.connections[uid];
      await store.save();
    }
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Watchlist, Memories, Snacks, Chat History & GIF Proxy
  // ---------------------------------------------------------------------------
  app.get('/api/watchlist', (_req: Request, res: Response) => {
    res.json({ items: store.getSnapshot().watchlist });
  });

  app.post('/api/watchlist', async (req: Request, res: Response) => {
    const { uid, displayName } = getActor(req);
    const body = req.body as Partial<WatchlistItemRecord>;
    if (!body.title?.trim()) {
      res.status(400).json({ error: 'Movie title is required.' });
      return;
    }
    const now = new Date().toISOString();
    const item: WatchlistItemRecord = {
      id: `wl_${Date.now()}`,
      ownerId: uid,
      title: body.title.trim().slice(0, 160),
      genre: (body.genre || 'Drama').slice(0, 60),
      year: body.year ? Number(body.year) : undefined,
      notes: body.notes?.slice(0, 500),
      priority: body.priority || 'medium',
      plannedDate: body.plannedDate,
      suggestedBy: displayName,
      votes: 1,
      isFavourite: false,
      status: body.plannedDate ? 'scheduled' : 'queued',
      createdAt: now,
      updatedAt: now,
    };
    store.getSnapshot().watchlist.unshift(item);
    await store.save();
    res.status(201).json({ item });
  });

  app.patch('/api/watchlist/:id', async (req: Request, res: Response) => {
    const item = store.getSnapshot().watchlist.find((w) => w.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Watchlist item not found.' });
      return;
    }
    const patch = req.body as Partial<WatchlistItemRecord> & { incrementVote?: boolean };
    if (patch.incrementVote) item.votes += 1;
    if (typeof patch.isFavourite === 'boolean') item.isFavourite = patch.isFavourite;
    if (patch.priority) item.priority = patch.priority;
    if (patch.status) item.status = patch.status;
    if (typeof patch.plannedDate === 'string') item.plannedDate = patch.plannedDate;
    item.updatedAt = new Date().toISOString();
    await store.save();
    res.json({ item });
  });

  app.delete('/api/watchlist/:id', async (req: Request, res: Response) => {
    const list = store.getSnapshot().watchlist;
    const idx = list.findIndex((w) => w.id === req.params.id);
    if (idx >= 0) {
      list.splice(idx, 1);
      await store.save();
    }
    res.json({ ok: true });
  });

  app.get('/api/memories', (_req: Request, res: Response) => {
    res.json({ memories: store.getSnapshot().memories });
  });

  app.post('/api/memories', async (req: Request, res: Response) => {
    const { uid } = getActor(req);
    const body = req.body as Partial<MemoryItemRecord>;
    if (!body.movieTitle?.trim() || !body.note?.trim()) {
      res.status(400).json({ error: 'Movie title and personal memory note are required.' });
      return;
    }
    const mem: MemoryItemRecord = {
      id: `mem_${Date.now()}`,
      ownerId: uid,
      movieTitle: body.movieTitle.trim().slice(0, 160),
      timestampLabel: (body.timestampLabel || '00:00').slice(0, 30),
      note: body.note.trim().slice(0, 1000),
      mood: (body.mood || 'Romantic').slice(0, 40),
      imageUrl: body.imageUrl || '/src/assets/images/cinema_hero_couple_1794680184863.jpg',
      movieDate: body.movieDate || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    store.getSnapshot().memories.unshift(mem);
    await store.save();
    res.status(201).json({ memory: mem });
  });

  app.delete('/api/memories/:id', async (req: Request, res: Response) => {
    const list = store.getSnapshot().memories;
    const idx = list.findIndex((m) => m.id === req.params.id);
    if (idx >= 0) {
      list.splice(idx, 1);
      await store.save();
    }
    res.json({ ok: true });
  });

  app.get('/api/snacks', (_req: Request, res: Response) => {
    res.json({ snacks: store.getSnapshot().snacks });
  });

  app.post('/api/snacks', async (req: Request, res: Response) => {
    const { uid } = getActor(req);
    const body = req.body as Partial<SnackItemRecord>;
    if (!body.name?.trim()) {
      res.status(400).json({ error: 'Snack name is required.' });
      return;
    }
    const snack: SnackItemRecord = {
      id: `snk_${Date.now()}`,
      ownerId: uid,
      name: body.name.trim().slice(0, 120),
      category: body.category || 'Popcorn',
      description: (body.description || 'Custom cinema treat').slice(0, 300),
      imageUrl: '/src/assets/images/snack_cinema_feast_1794680184354.jpg',
      inTray: Boolean(body.inTray ?? true),
      inWishlist: Boolean(body.inWishlist),
      sentToPartner: false,
      createdAt: new Date().toISOString(),
    };
    store.getSnapshot().snacks.unshift(snack);
    await store.save();
    res.status(201).json({ snack });
  });

  app.patch('/api/snacks/:id', async (req: Request, res: Response) => {
    const { displayName } = getActor(req);
    const snack = store.getSnapshot().snacks.find((s) => s.id === req.params.id);
    if (!snack) {
      res.status(404).json({ error: 'Snack not found.' });
      return;
    }
    const patch = req.body as Partial<SnackItemRecord>;
    if (typeof patch.inTray === 'boolean') snack.inTray = patch.inTray;
    if (typeof patch.inWishlist === 'boolean') snack.inWishlist = patch.inWishlist;
    if (typeof patch.sentToPartner === 'boolean') {
      snack.sentToPartner = patch.sentToPartner;
      if (patch.sentToPartner) snack.sentBy = displayName;
    }
    await store.save();
    res.json({ snack });
  });

  app.get('/api/chat/history', (_req: Request, res: Response) => {
    const snap = store.getSnapshot();
    const threads = snap.rooms.map((r) => ({
      roomId: r.roomId,
      roomName: r.name,
      messages: snap.chats[r.roomId] || [],
    }));
    res.json({ threads });
  });

  app.get('/api/gifs/search', async (req: Request, res: Response) => {
    const key = process.env.GIPHY_API_KEY;
    const q = String(req.query.q || 'cinema love').trim();
    if (!key) {
      res.json({
        configured: false,
        message: 'GIF search provider is not configured (set GIPHY_API_KEY in .env to enable live GIF search).',
        results: [],
      });
      return;
    }
    try {
      const resp = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=8&rating=pg`
      );
      const data = (await resp.json()) as {
        data?: Array<{ id: string; title: string; images?: { fixed_height?: { url: string } } }>;
      };
      res.json({
        configured: true,
        results: (data.data || []).map((g) => ({
          id: g.id,
          title: g.title,
          url: g.images?.fixed_height?.url || '',
        })),
      });
    } catch {
      res.json({ configured: true, results: [] });
    }
  });

  // ---------------------------------------------------------------------------
  // Vite Dev Middleware or Production Static Serving
  // ---------------------------------------------------------------------------
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Together Cinema server listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start Together Cinema server:', err);
  process.exit(1);
});
