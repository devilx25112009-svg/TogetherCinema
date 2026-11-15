import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, HardDrive, Heart, Play, UploadCloud, Users } from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { useAuth } from '../context/AuthContext';
import { cinemaApi, type HealthResponse } from '../lib/api';
import type { CinemaRoomRecord, MovieRecord } from '../types/cinema';
import { formatBytes } from '../utils/uploadLogic';

export function DashboardPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [rooms, setRooms] = useState<CinemaRoomRecord[]>([]);

  useEffect(() => {
    cinemaApi.getHealth().then(setHealth).catch(() => {});
    cinemaApi.listMovies().then((r) => setMovies(r.movies)).catch(() => {});
    cinemaApi.listRooms().then((r) => setRooms(r.rooms)).catch(() => {});
  }, []);

  const totalLibraryBytes = movies.reduce((acc, m) => acc + (m.fileSizeBytes || 0), 0);
  const quota = health?.storage.quotaBytes || 214748364800;
  const pct = Math.min(100, Math.round(((health?.storage.usedBytes || totalLibraryBytes) / quota) * 100));

  return (
    <CinemaLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Personal Cinema Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">
              Welcome, {user?.displayName || 'Guest'} · Overview of your private theatre, storage, and active rooms
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/upload"
              className="px-4 py-2.5 rounded-lg bg-[#211B32] border border-white/10 hover:border-[#8B5CF6]/50 text-xs font-semibold text-white flex items-center gap-2"
            >
              <UploadCloud className="w-4 h-4 text-[#C4B5FD]" />
              <span>Upload Movie</span>
            </Link>
            <Link
              to="/rooms/create"
              className="px-4 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Create Room</span>
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="cinema-surface rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Partner Connection</span>
              <Heart className="w-4 h-4 text-[#F472B6]" />
            </div>
            <p className="font-display text-xl font-bold text-white">
              {user?.partnerName ? user.partnerName : 'Not Connected'}
            </p>
            <Link to="/profile" className="text-xs text-[#C4B5FD] hover:underline inline-block">
              {user?.partnerName ? 'Manage partner link' : 'Generate invite code'}
            </Link>
          </div>

          <div className="cinema-surface rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Personal Movie Vault</span>
              <Film className="w-4 h-4 text-[#C4B5FD]" />
            </div>
            <p className="font-display text-xl font-bold text-white tabular-nums">{movies.length} Films</p>
            <p className="text-xs text-slate-400 tabular-nums">{formatBytes(totalLibraryBytes)} catalogued</p>
          </div>

          <div className="cinema-surface rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Active Screening Rooms</span>
              <Users className="w-4 h-4 text-[#83A9FF]" />
            </div>
            <p className="font-display text-xl font-bold text-white tabular-nums">{rooms.length} Rooms</p>
            <Link to="/rooms" className="text-xs text-[#C4B5FD] hover:underline inline-block">
              Open room manager
            </Link>
          </div>

          <div className="cinema-surface rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Storage Quota</span>
              <HardDrive className="w-4 h-4 text-[#8B5CF6]" />
            </div>
            <p className="font-display text-xl font-bold text-white tabular-nums">
              {formatBytes(health?.storage.usedBytes || 0)} / {formatBytes(quota)}
            </p>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-[#8B5CF6]" style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="cinema-surface rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-white">Recent Watch History</h2>
            <div className="space-y-3">
              {movies.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#151126] border border-white/5"
                >
                  <div>
                    <Link to={`/movies/${m.id}`} className="text-sm font-semibold text-white hover:text-[#C4B5FD]">
                      {m.title}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {m.resolution} · {m.videoFormat} · {m.collectionName}
                    </p>
                  </div>
                  <Link
                    to={`/movies/${m.id}`}
                    className="px-3 py-1.5 rounded-md bg-[#211B32] text-xs text-white hover:bg-[#8B5CF6] transition-colors shrink-0"
                  >
                    Inspect
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="cinema-surface rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-white">Infrastructure &amp; Processing Status</h2>
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-lg bg-[#151126] border border-white/5 flex items-center justify-between">
                <span className="text-slate-300">Object Storage Adapter</span>
                <span className="font-mono-tabular text-[#C4B5FD] uppercase">
                  {health?.storage.provider || 'local'} ({health?.storage.configured ? 'Configured' : 'Unconfigured'})
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-[#151126] border border-white/5 flex items-center justify-between">
                <span className="text-slate-300">FFmpeg Processing Worker</span>
                <span className="font-mono-tabular text-slate-200">
                  {health?.processing.ffmpegAvailable ? 'Available' : 'Not Installed (Direct Original Stream)'}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-[#151126] border border-white/5 flex items-center justify-between">
                <span className="text-slate-300">Live GIF Provider</span>
                <span className="font-mono-tabular text-slate-200">
                  {health?.gifProviderConfigured ? 'GIPHY Active' : 'Unconfigured (Optional)'}
                </span>
              </div>
            </div>
            <Link to="/settings/storage" className="text-xs text-[#C4B5FD] hover:underline inline-block">
              Configure storage &amp; processing settings →
            </Link>
          </div>
        </div>
      </div>
    </CinemaLayout>
  );
}
