import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, KeyRound, Play, Plus, Users, Youtube, Armchair } from 'lucide-react';
import { AuditoriumSeatMap } from '../components/cinema/SeatMapModal';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { useAuth } from '../context/AuthContext';
import { cinemaApi } from '../lib/api';
import {
  registerLocalAudioForRoom,
  registerLocalFileForMovie,
  registerLocalFileForRoom,
} from '../lib/localMediaRegistry';
import type {
  AudioMode,
  CinemaRoomRecord,
  MovieRecord,
  PartnerGenderRole,
  QualityOption,
  ScreenMode,
} from '../types/cinema';
import { SCREEN_MODE_SPECS } from '../utils/cinemaModes';
import {
  DEFAULT_GUEST_SEAT_ID,
  DEFAULT_HOST_SEAT_ID,
  formatPartnerRoleBadge,
  resolveCoupleRoles,
} from '../utils/seatMap';
import { analyzeLocalVideoFile, type ContainerAudioAnalysis } from '../utils/theatreAudio';
import { formatBytes, validateVideoUpload } from '../utils/uploadLogic';
import { parseYouTubeUrl } from '../utils/youtube';

export function RoomsPage() {
  const [rooms, setRooms] = useState<CinemaRoomRecord[]>([]);
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([cinemaApi.listRooms(), cinemaApi.listMovies()])
      .then(([rRes, mRes]) => {
        setRooms(rRes.rooms);
        setMovies(mRes.movies);
      })
      .finally(() => setLoading(false));
  }, []);

  const copyCode = (room: CinemaRoomRecord) => {
    navigator.clipboard?.writeText(room.inviteCode);
    setCopiedId(room.roomId);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <CinemaLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Private Cinema Rooms</h1>
            <p className="text-sm text-slate-400 mt-1">
              Create synchronized 3D screening rooms or join your partner using an invitation code
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/rooms/join"
              className="px-4 py-2.5 rounded-lg bg-[#211B32] border border-white/10 text-xs font-semibold text-white flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4 text-[#C4B5FD]" />
              <span>Join with Code</span>
            </Link>
            <Link
              to="/rooms/create"
              className="px-4 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Cinema Room</span>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="h-44 rounded-xl bg-[#1C1930]/60 animate-pulse" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="cinema-surface rounded-2xl p-12 text-center space-y-3">
            <Users className="w-10 h-10 text-[#C4B5FD] mx-auto" />
            <h2 className="font-display text-lg font-bold text-white">No cinema room found.</h2>
            <p className="text-sm text-slate-400">Create a private room and invite your partner to start watching.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {rooms.map((room) => {
              const movie = movies.find((m) => m.id === room.movieId);
              return (
                <article key={room.roomId} className="cinema-surface rounded-xl p-6 flex flex-col justify-between gap-5">
                  <div>
                    <div className="flex items-center justify-between gap-3 text-xs text-[#C4B5FD]">
                      <span className="uppercase font-mono-tabular">
                        {room.defaultScreenMode} · {room.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyCode(room)}
                        className="flex items-center gap-1.5 font-mono-tabular text-slate-300 hover:text-white cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedId === room.roomId ? 'Copied!' : room.inviteCode}</span>
                      </button>
                    </div>
                    <h2 className="font-display text-xl font-bold text-white mt-2">{room.name}</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Screening: {movie?.title || room.movieId} · Host: {room.hostName}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs">
                    <span className="text-slate-400">
                      {room.defaultQuality} · {room.defaultAudio}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/cinema/${room.roomId}`)}
                      className="px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Enter Auditorium</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </CinemaLayout>
  );
}

export function CreateRoomPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pcVideoInputRef = React.useRef<HTMLInputElement | null>(null);
  const pcAudioInputRef = React.useRef<HTMLInputElement | null>(null);

  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [name, setName] = useState('Midnight Screening for Two');
  const [movieId, setMovieId] = useState('');
  const [pcVideoFile, setPcVideoFile] = useState<File | null>(null);
  const [pcAudioFile, setPcAudioFile] = useState<File | null>(null);
  const [pcAudioAnalysis, setPcAudioAnalysis] = useState<ContainerAudioAnalysis | null>(null);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubePreview, setYoutubePreview] = useState<{
    videoId: string;
    title: string;
    authorName: string;
    thumbnailUrl: string;
    watchUrl: string;
    streamUrl: string;
    startSeconds: number;
  } | null>(null);
  const [startFullTheatreMode, setStartFullTheatreMode] = useState(true);
  const [theme, setTheme] = useState<'midnight_velvet' | 'dolby_obsidian' | 'starlight_imax' | 'rose_lounge'>(
    'midnight_velvet'
  );
  const [privacy, setPrivacy] = useState<'invite_code' | 'partner_only'>('invite_code');
  const [defaultQuality, setDefaultQuality] = useState<QualityOption>('2160p');
  const [defaultAudio, setDefaultAudio] = useState<AudioMode>('Original Audio');
  const [defaultScreenMode, setDefaultScreenMode] = useState<ScreenMode>('Screen X');
  const [hostSeatId, setHostSeatId] = useState(DEFAULT_HOST_SEAT_ID);
  const [guestSeatId, setGuestSeatId] = useState(DEFAULT_GUEST_SEAT_ID);
  const [hostName, setHostName] = useState(user?.displayName || 'You');
  const [guestLabel, setGuestLabel] = useState('Maya');
  const [hostPartnerRole, setHostPartnerRole] = useState<PartnerGenderRole>('bf');
  const [guestPartnerRole, setGuestPartnerRole] = useState<PartnerGenderRole>('gf');
  const [showSeatPicker, setShowSeatPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cinemaApi.listMovies().then((res) => {
      setMovies(res.movies);
      if (res.movies[0]) setMovieId(res.movies[0].id);
    });
  }, []);

  const handleSelectPcVideo = async (file: File) => {
    setError(null);
    setYoutubePreview(null);
    setYoutubeInput('');
    const validation = validateVideoUpload(file.name, file.size, Number.MAX_SAFE_INTEGER);
    if (!validation.valid) {
      setError(validation.reason || 'Unsupported video file.');
      return;
    }
    setPcVideoFile(file);
    const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[_.-]+/g, ' ').trim();
    if (cleanName) {
      setName(`${cleanName} — Theatre Night`);
    }
    try {
      const analysis = await analyzeLocalVideoFile(file);
      setPcAudioAnalysis(analysis);
    } catch {
      setPcAudioAnalysis(null);
    }
  };

  const handleLoadYoutubeLink = async (rawUrl?: string) => {
    const candidate = (rawUrl ?? youtubeInput).trim();
    if (!candidate) return;
    const parsed = parseYouTubeUrl(candidate);
    if (!parsed) {
      setError('Please enter a valid YouTube link (youtube.com/watch?v=... or youtu.be/...).');
      return;
    }
    setError(null);
    setYoutubeLoading(true);
    setPcVideoFile(null);
    setPcAudioAnalysis(null);
    setPcAudioFile(null);
    try {
      const meta = await cinemaApi.resolveYouTubeMetadata(candidate);
      setYoutubePreview(meta);
      setName(`${meta.title.slice(0, 64)} — YouTube Theatre`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load YouTube video metadata.');
    } finally {
      setYoutubeLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a room name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let targetMovieId = movieId;
      let resolvedYoutube = youtubePreview;
      if (!resolvedYoutube && youtubeInput.trim()) {
        const parsed = parseYouTubeUrl(youtubeInput.trim());
        if (!parsed) {
          throw new Error('Please enter a valid YouTube link or clear the YouTube URL field.');
        }
        resolvedYoutube = await cinemaApi.resolveYouTubeMetadata(youtubeInput.trim());
      }

      if (pcVideoFile) {
        const createdMovie = await cinemaApi.createMovie(
          {
            title: pcVideoFile.name.replace(/\.[^.]+$/, '').replace(/[_.-]+/g, ' ').trim() || pcVideoFile.name,
            description: `Direct PC Theatre File (${formatBytes(pcVideoFile.size)})${
              pcAudioAnalysis?.detectedCodecs.length
                ? ` · Detected audio: ${pcAudioAnalysis.detectedCodecs.join(', ')}`
                : ''
            }`,
            genre: 'Personal Cinema',
            collectionName: 'Direct Room Screenings',
            fileSizeBytes: pcVideoFile.size,
            resolution: 'Original Source',
            sourceHeight: 2160,
            videoFormat: pcVideoFile.name.split('.').pop()?.toUpperCase() || 'MP4',
            audioFormat: pcAudioAnalysis?.detectedCodecs.join(' / ') || 'Original Audio',
            streamUrl: 'local://instant',
          },
          user
        );
        targetMovieId = createdMovie.movie.id;
        registerLocalFileForMovie(targetMovieId, pcVideoFile);
      } else if (resolvedYoutube) {
        const createdMovie = await cinemaApi.createMovie(
          {
            title: resolvedYoutube.title,
            description: `YouTube Cinema (${resolvedYoutube.authorName}) · ${resolvedYoutube.watchUrl}`,
            genre: 'YouTube Cinema',
            collectionName: 'YouTube Links',
            fileSizeBytes: 0,
            resolution: '1080p Full HD',
            sourceHeight: 1080,
            videoFormat: 'YouTube Stream',
            audioFormat: 'YouTube Stereo',
            thumbnailUrl: resolvedYoutube.thumbnailUrl,
            streamUrl: resolvedYoutube.streamUrl,
          },
          user
        );
        targetMovieId = createdMovie.movie.id;
      }

      const roles = resolveCoupleRoles(hostPartnerRole, guestPartnerRole);
      const { room } = await cinemaApi.createRoom(
        {
          name: name.trim(),
          movieId: targetMovieId,
          theme,
          privacy,
          defaultQuality,
          defaultAudio,
          defaultScreenMode,
          hostSeatId,
          guestSeatId,
          hostName: hostName.trim() || user?.displayName || 'You',
          guestLabel,
          hostPartnerRole: roles.hostPartnerRole,
          guestPartnerRole: roles.guestPartnerRole,
        },
        user
      );

      if (pcVideoFile) {
        registerLocalFileForRoom(room.roomId, pcVideoFile);
      }
      if (pcAudioFile) {
        registerLocalAudioForRoom(room.roomId, pcAudioFile);
      }

      navigate(startFullTheatreMode ? `/cinema/${room.roomId}?theatre=1` : `/cinema/${room.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create cinema room.');
      setBusy(false);
    }
  };

  return (
    <CinemaLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Create Private Cinema Room</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure your 3D auditorium screen presentation, surround audio mix, or load a 32+ GB film straight from your PC
          </p>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-sm text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="cinema-surface rounded-2xl p-6 sm:p-8 space-y-5">
          <div>
            <label htmlFor="room-name" className="block text-xs font-medium text-slate-300 mb-1.5">
              Room Name
            </label>
            <input
              id="room-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
            />
          </div>

          <div className="rounded-xl bg-[#0B1020]/90 border border-[#C4B5FD]/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white">
                  Direct PC Movie File (Instant 32+ GB Playback, Zero Upload Wait)
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Stream directly from disk into the 3D theatre, or choose an existing library movie below.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={pcVideoInputRef}
                  type="file"
                  accept="video/*,.mkv,.m2ts,.ts,.avi,.mov,.wmv,.flv,.mpg,.mpeg,.3gp,.ogv"
                  className="hidden"
                  aria-label="Choose video file from PC for new room"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSelectPcVideo(f);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={pcAudioInputRef}
                  type="file"
                  accept="audio/*,.aac,.m4a,.mp3,.wav,.ogg,.opus,.flac"
                  className="hidden"
                  aria-label="Attach companion theatre audio track"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPcAudioFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => pcVideoInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white cursor-pointer"
                >
                  {pcVideoFile ? 'Change PC Video' : 'Select Video from PC'}
                </button>
                {pcVideoFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setPcVideoFile(null);
                      setPcAudioAnalysis(null);
                      setPcAudioFile(null);
                    }}
                    className="px-3 py-2 rounded-lg bg-[#1C1930] text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    Use Library Movie
                  </button>
                )}
              </div>
            </div>

            {pcVideoFile && (
              <div className="p-3 rounded-lg bg-[#151126] border border-[#C4B5FD]/15 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white truncate">{pcVideoFile.name}</span>
                  <span className="font-mono text-[#C4B5FD]">{formatBytes(pcVideoFile.size)}</span>
                </div>
                {pcAudioAnalysis && (
                  <p
                    className={
                      pcAudioAnalysis.hasUnsupportedSurroundCodec ? 'text-amber-200' : 'text-emerald-300'
                    }
                  >
                    {pcAudioAnalysis.summary}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => pcAudioInputRef.current?.click()}
                    className="px-3 py-1.5 rounded bg-[#211B32] border border-white/10 text-[11px] text-[#C4B5FD] hover:text-white cursor-pointer"
                  >
                    {pcAudioFile ? `Companion Audio: ${pcAudioFile.name}` : 'Optional: Attach Synced Audio Track (.m4a/.mp3/.aac)'}
                  </button>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={startFullTheatreMode}
                      onChange={(e) => setStartFullTheatreMode(e.target.checked)}
                      className="accent-[#8B5CF6]"
                    />
                    <span>Open in Full Theatre Immersion</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* YouTube Video Link Source */}
          <div className="rounded-xl bg-[#0B1020]/90 border border-[#C4B5FD]/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Youtube className="w-4 h-4 text-[#F472B6]" />
                <p className="text-xs font-semibold text-white">YouTube Video Link (Watch in 3D Theatre Sync)</p>
              </div>
              {youtubePreview && (
                <button
                  type="button"
                  onClick={() => {
                    setYoutubePreview(null);
                    setYoutubeInput('');
                  }}
                  className="text-[11px] text-slate-300 hover:text-white cursor-pointer"
                >
                  Clear Link
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                aria-label="YouTube video URL"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleLoadYoutubeLink();
                  }
                }}
                placeholder="Paste YouTube link: https://www.youtube.com/watch?v=... or https://youtu.be/..."
                className="flex-1 px-3 py-2 rounded-lg bg-[#151126] border border-white/10 text-xs text-white"
              />
              <button
                type="button"
                disabled={youtubeLoading || !youtubeInput.trim()}
                onClick={() => void handleLoadYoutubeLink()}
                className="px-4 py-2 rounded-lg bg-[#F472B6] hover:bg-[#f472b6]/90 disabled:opacity-50 text-[#080810] text-xs font-bold shrink-0 cursor-pointer"
              >
                {youtubeLoading ? 'Loading...' : 'Load YouTube Link'}
              </button>
            </div>

            {youtubePreview && (
              <div className="p-3 rounded-lg bg-[#151126] border border-[#C4B5FD]/20 flex items-center gap-3">
                <img
                  src={youtubePreview.thumbnailUrl}
                  alt={youtubePreview.title}
                  className="w-24 h-14 rounded object-cover shrink-0 bg-black"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs font-semibold text-white truncate">{youtubePreview.title}</p>
                  <p className="text-[11px] text-[#C4B5FD] truncate">
                    {youtubePreview.authorName} · ID: {youtubePreview.videoId}
                    {youtubePreview.startSeconds > 0 ? ` · Starts at ${youtubePreview.startSeconds}s` : ''}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={startFullTheatreMode}
                    onChange={(e) => setStartFullTheatreMode(e.target.checked)}
                    className="accent-[#8B5CF6]"
                  />
                  <span>Full Theatre</span>
                </label>
              </div>
            )}
          </div>

          {!pcVideoFile && !youtubePreview && (
            <div>
              <label htmlFor="room-movie" className="block text-xs font-medium text-slate-300 mb-1.5">
                Selected Movie
              </label>
              <select
                id="room-movie"
                value={movieId}
                onChange={(e) => setMovieId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
              >
                {movies.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({m.resolution})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="room-screen" className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Screen Mode
              </label>
              <select
                id="room-screen"
                value={defaultScreenMode}
                onChange={(e) => setDefaultScreenMode(e.target.value as ScreenMode)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
              >
                {(Object.keys(SCREEN_MODE_SPECS) as ScreenMode[]).map((m) => (
                  <option key={m} value={m}>
                    {m === 'Screen X' ? 'Screen X (270° Three-Wall)' : m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="room-theme" className="block text-xs font-medium text-slate-300 mb-1.5">
                Auditorium Theme
              </label>
              <select
                id="room-theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value as typeof theme)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
              >
                <option value="midnight_velvet">Midnight Velvet</option>
                <option value="dolby_obsidian">Dolby Obsidian</option>
                <option value="starlight_imax">Starlight IMAX</option>
                <option value="rose_lounge">Rose Lounge</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="room-privacy" className="block text-xs font-medium text-slate-300 mb-1.5">
                Privacy
              </label>
              <select
                id="room-privacy"
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
              >
                <option value="invite_code">Invitation Code</option>
                <option value="partner_only">Connected Partner Only</option>
              </select>
            </div>

            <div>
              <label htmlFor="room-quality" className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Quality
              </label>
              <select
                id="room-quality"
                value={defaultQuality}
                onChange={(e) => setDefaultQuality(e.target.value as QualityOption)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
              >
                <option value="Original">Original Source</option>
                <option value="2160p">2160p 4K</option>
                <option value="1440p">1440p</option>
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
              </select>
            </div>

            <div>
              <label htmlFor="room-audio" className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Audio
              </label>
              <select
                id="room-audio"
                value={defaultAudio}
                onChange={(e) => setDefaultAudio(e.target.value as AudioMode)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
              >
                <option value="Original Audio">Original Audio</option>
                <option value="Stereo">Stereo</option>
                <option value="5.1">5.1 Surround</option>
                <option value="7.1">7.1 Surround</option>
                <option value="Dolby Atmos">Dolby Atmos</option>
              </select>
            </div>
          </div>

          {/* Auditorium Couple Seat Map Picker */}
          <div className="rounded-xl bg-[#0B1020]/90 border border-[#C4B5FD]/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Armchair className="w-4 h-4 text-[#F472B6]" />
                <div>
                  <p className="text-xs font-semibold text-white">
                    Auditorium Seats &amp; Couple Roles — {formatPartnerRoleBadge(hostPartnerRole)}: {hostSeatId} ·{' '}
                    {formatPartnerRoleBadge(guestPartnerRole)} ({guestLabel}): {guestSeatId}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Pick seats and choose who is BF and who is GF (can be adjusted anytime inside the hall).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSeatPicker((s) => !s)}
                className="px-3 py-1.5 rounded-lg bg-[#1C1930] border border-[#C4B5FD]/25 text-xs font-semibold text-[#C4B5FD] hover:text-white cursor-pointer"
              >
                {showSeatPicker ? 'Hide Seat Map' : 'Choose Seats & BF/GF'}
              </button>
            </div>
            {showSeatPicker && (
              <AuditoriumSeatMap
                compact
                hostSeatId={hostSeatId}
                guestSeatId={guestSeatId}
                hostLabel={hostName}
                guestLabel={guestLabel}
                hostPartnerRole={hostPartnerRole}
                guestPartnerRole={guestPartnerRole}
                screenMode={defaultScreenMode}
                onChangeSeats={(next) => {
                  setHostSeatId(next.hostSeatId);
                  setGuestSeatId(next.guestSeatId);
                  if (next.hostName) setHostName(next.hostName);
                  if (next.guestLabel) setGuestLabel(next.guestLabel);
                  if (next.hostPartnerRole) setHostPartnerRole(next.hostPartnerRole);
                  if (next.guestPartnerRole) setGuestPartnerRole(next.guestPartnerRole);
                }}
              />
            )}
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Link to="/rooms" className="px-4 py-2.5 rounded-xl bg-[#151126] text-xs font-medium text-slate-300">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#9167FF] text-sm font-semibold text-white cursor-pointer"
            >
              {busy ? 'Opening Auditorium...' : 'Create & Enter Auditorium'}
            </button>
          </div>
        </form>
      </div>
    </CinemaLayout>
  );
}

export function JoinRoomPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('LOVE-2026');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter a room invitation code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { room } = await cinemaApi.joinRoom(code.trim(), user);
      const needsGuestSeatParam = !user?.uid || room.hostId === user.uid;
      const partnerSeatParam = room.guestPartnerRole || 'gf';
      navigate(needsGuestSeatParam ? `/cinema/${room.roomId}?seat=${partnerSeatParam}` : `/cinema/${room.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join room.');
      setBusy(false);
    }
  };

  return (
    <CinemaLayout>
      <div className="max-w-lg mx-auto cinema-surface rounded-2xl p-6 sm:p-8 space-y-5 mt-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Join Private Cinema Room</h1>
          <p className="text-sm text-slate-400 mt-1">
            Enter your partner&apos;s room invitation code (example: <span className="font-mono-tabular text-[#C4B5FD]">LOVE-2026</span>)
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label htmlFor="invite-code" className="block text-xs font-medium text-slate-300 mb-1.5">
              Invitation Code
            </label>
            <input
              id="invite-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LOVE-2026"
              className="w-full px-4 py-3 rounded-xl bg-[#0B1020] border border-white/10 font-mono-tabular text-base text-white tracking-wider uppercase"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#9167FF] text-sm font-semibold text-white cursor-pointer"
          >
            {busy ? 'Connecting...' : 'Join Cinema Room'}
          </button>
        </form>
      </div>
    </CinemaLayout>
  );
}

export function JoinByLinkPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = (inviteCode || '').trim();
    if (!code) {
      setError('Missing auditorium invitation link code.');
      return;
    }
    let active = true;
    cinemaApi
      .joinRoom(code, user)
      .then(({ room }) => {
        if (!active) return;
        const partnerSeatParam = room.guestPartnerRole || 'gf';
        navigate(
          `/cinema/${encodeURIComponent(room.roomId)}?invite=${encodeURIComponent(room.inviteCode)}&seat=${partnerSeatParam}&auditoriumOnly=1`,
          { replace: true }
        );
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to open this private auditorium link.');
        }
      });
    return () => {
      active = false;
    };
  }, [inviteCode, navigate, user]);

  return (
    <div className="min-h-screen bg-[#080810] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full cinema-surface rounded-2xl p-6 text-center space-y-3 border border-[#C4B5FD]/25">
        {error ? (
          <>
            <h1 className="font-display text-xl font-bold text-white">Invalid Auditorium Link</h1>
            <p className="text-xs text-rose-200">{error}</p>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-bold text-white">Entering Private Auditorium...</p>
            <p className="text-xs text-[#C4B5FD]">Taking you straight to your partner seat.</p>
          </>
        )}
      </div>
    </div>
  );
}
