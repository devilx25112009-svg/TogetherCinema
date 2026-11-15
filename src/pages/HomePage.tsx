import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Compass,
  Film,
  Heart,
  Play,
  Popcorn,
  Sparkles,
  UploadCloud,
  Users,
} from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { MoviePosterCard } from '../components/cinema/MoviePosterCard';
import { useAuth } from '../context/AuthContext';
import { cinemaApi } from '../lib/api';
import type {
  CinemaRoomRecord,
  MemoryItemRecord,
  MovieRecord,
  WatchlistItemRecord,
} from '../types/cinema';
import { formatTimestamp } from '../utils/playbackSync';

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [rooms, setRooms] = useState<CinemaRoomRecord[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItemRecord[]>([]);
  const [memories, setMemories] = useState<MemoryItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      cinemaApi.listMovies(),
      cinemaApi.listRooms(),
      cinemaApi.listWatchlist(),
      cinemaApi.listMemories(),
    ])
      .then(([mRes, rRes, wRes, memRes]) => {
        if (!active) return;
        setMovies(mRes.movies);
        setRooms(rRes.rooms);
        setWatchlist(wRes.items);
        setMemories(memRes.memories);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load cinema home.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleToggleFav = async (movie: MovieRecord) => {
    try {
      const { movie: updated } = await cinemaApi.updateMovie(
        movie.id,
        { isFavourite: !movie.isFavourite },
        user
      );
      setMovies((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {
      // handled silently
    }
  };

  const handleStartMovie = async (movie: MovieRecord) => {
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
    } catch {
      navigate('/rooms/create');
    }
  };

  const activeRoom = rooms[0] || null;
  const currentMovie = movies.find((m) => m.id === activeRoom?.movieId) || movies[0];
  const continueWatching = movies.filter((m) => m.playbackProgress > 0);
  const upcomingNights = watchlist.filter((w) => w.plannedDate);

  return (
    <CinemaLayout>
      <div className="space-y-12">
        {/* Hero Split */}
        <section className="grid lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 cinema-surface rounded-2xl p-8 sm:p-10 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <p className="text-xs font-medium text-[#C4B5FD]">
                {user?.partnerName
                  ? `Connected with ${user.partnerName} · ${user.partnerOnline ? 'Partner Online' : 'Ready for Tonight'}`
                  : 'Private Two-Person Theatre'}
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.1] text-balance">
                Your little cinema. Just for two.
              </h1>
              <p className="text-base text-slate-300 leading-relaxed max-w-xl">
                Bring your favourite movies, invite your favourite person and create unforgettable movie nights.
              </p>
            </div>

            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/rooms/create')}
                  className="px-6 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#9167FF] text-white font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Movie Night</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/movies')}
                  className="px-6 py-3 rounded-xl bg-[#211B32] hover:bg-[#2a2240] border border-[#C4B5FD]/20 text-white font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Film className="w-4 h-4 text-[#C4B5FD]" />
                  <span>Explore My Movies</span>
                </button>
              </div>

              <div className="pt-4 border-t border-white/10 flex flex-wrap items-center gap-6 text-xs text-slate-400">
                <Link to="/lobby" className="hover:text-white flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[#C4B5FD]" />
                  <span>Enter 3D Lobby</span>
                </Link>
                <Link to="/upload" className="hover:text-white flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5 text-[#83A9FF]" />
                  <span>Upload 50GB+ Film</span>
                </Link>
                <Link to="/food" className="hover:text-white flex items-center gap-1.5">
                  <Popcorn className="w-3.5 h-3.5 text-[#F472B6]" />
                  <span>Virtual Snack Tray</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 relative rounded-2xl overflow-hidden min-h-[320px] border border-[#C4B5FD]/15">
            <img
              src="/src/assets/images/cinema_hero_couple_1794680184863.jpg"
              alt="Private 3D cinema auditorium for two"
              referrerPolicy="no-referrer"
              className="w-full h-full lg:h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080810] via-[#080810]/35 to-transparent" />
            {activeRoom && currentMovie && (
              <div className="absolute bottom-5 inset-x-5 p-5 rounded-xl bg-[#151126]/92 border border-[#C4B5FD]/20 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[#F472B6] font-medium">
                    Current Screening · Code {activeRoom.inviteCode}
                  </p>
                  <h2 className="font-display font-bold text-lg text-white mt-0.5">{currentMovie.title}</h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {activeRoom.defaultScreenMode} · {activeRoom.defaultQuality} · {activeRoom.defaultAudio}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/cinema/${activeRoom.roomId}`)}
                  className="px-4 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Take Front Seat</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Continue Watching */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">Continue Watching</h2>
              <p className="text-xs text-slate-400 mt-0.5">Resume right from your last synchronized timestamp</p>
            </div>
            <Link to="/movies" className="text-xs font-medium text-[#C4B5FD] hover:text-white">
              View library →
            </Link>
          </div>
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-80 rounded-xl bg-[#1C1930]/60 animate-pulse" />
              ))}
            </div>
          ) : continueWatching.length === 0 ? (
            <div className="cinema-surface rounded-xl p-6 text-sm text-slate-400">
              No films in progress yet. Start a screening from your movie library below.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {continueWatching.map((movie) => (
                <MoviePosterCard
                  key={movie.id}
                  movie={movie}
                  onToggleFavourite={handleToggleFav}
                  onStartWatch={handleStartMovie}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recently Uploaded Movies */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">Recently Uploaded Movies</h2>
              <p className="text-xs text-slate-400 mt-0.5">Personal 4K &amp; archival films stored in your private vault</p>
            </div>
            <Link to="/upload" className="text-xs font-medium text-[#C4B5FD] hover:text-white">
              Upload new film →
            </Link>
          </div>
          {movies.length === 0 && !loading ? (
            <div className="cinema-surface rounded-xl p-8 text-center text-sm text-slate-400">
              Your movie library is empty. Upload your first film to start watching together.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {movies.slice(0, 3).map((movie) => (
                <MoviePosterCard
                  key={movie.id}
                  movie={movie}
                  onToggleFavourite={handleToggleFav}
                  onStartWatch={handleStartMovie}
                />
              ))}
            </div>
          )}
        </section>

        {/* Shared Watchlist, Upcoming Movie Nights, Favourite Scenes & Recent Memories */}
        <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="cinema-surface rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-[#C4B5FD]" />
                <span>Shared Watchlist</span>
              </h3>
              <Link to="/watchlist" className="text-xs text-[#C4B5FD] hover:underline">
                Manage
              </Link>
            </div>
            <div className="space-y-3">
              {watchlist.slice(0, 3).map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-[#151126] border border-white/5">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {item.genre} · Suggested by {item.suggestedBy} · {item.votes} votes
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="cinema-surface rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#83A9FF]" />
                <span>Upcoming Movie Nights</span>
              </h3>
              <Link to="/rooms/join" className="text-xs text-[#C4B5FD] hover:underline">
                Join Code
              </Link>
            </div>
            <div className="space-y-3">
              {upcomingNights.length === 0 ? (
                <p className="text-xs text-slate-400">No scheduled dates yet. Plan one in your shared watchlist.</p>
              ) : (
                upcomingNights.slice(0, 3).map((night) => (
                  <div key={night.id} className="p-3 rounded-lg bg-[#151126] border border-white/5">
                    <p className="text-sm font-medium text-white">{night.title}</p>
                    <p className="text-xs text-[#F472B6] font-mono-tabular mt-1">
                      Planned: {night.plannedDate}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="cinema-surface rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F472B6]" />
                <span>Favourite Scenes &amp; Memories</span>
              </h3>
              <Link to="/memories" className="text-xs text-[#C4B5FD] hover:underline">
                3D Gallery
              </Link>
            </div>
            <div className="space-y-3">
              {memories.slice(0, 3).map((mem) => (
                <div key={mem.id} className="p-3 rounded-lg bg-[#151126] border border-white/5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{mem.movieTitle}</span>
                    <span className="font-mono-tabular text-[#F472B6]">{mem.timestampLabel}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{mem.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quick Favourite Scenes strip */}
        {movies.some((m) => m.chapters.length > 1) && (
          <section className="cinema-surface rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#F472B6]" />
                <span>Jump to a Favourite Scene</span>
              </h3>
              <p className="text-xs text-slate-400">
                {movies[0]?.title} — {movies[0]?.chapters[2]?.title || movies[0]?.chapters[0]?.title} (
                {formatTimestamp(movies[0]?.chapters[2]?.timeSeconds || 0)})
              </p>
            </div>
            <button
              type="button"
              onClick={() => activeRoom && navigate(`/cinema/${activeRoom.roomId}`)}
              className="px-4 py-2 rounded-lg bg-[#211B32] hover:bg-[#8B5CF6] text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Open in 3D Cinema
            </button>
          </section>
        )}
      </div>
    </CinemaLayout>
  );
}
