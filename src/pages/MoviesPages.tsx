import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit3,
  Film,
  Heart,
  Play,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { MoviePosterCard } from '../components/cinema/MoviePosterCard';
import { useAuth } from '../context/AuthContext';
import { cinemaApi } from '../lib/api';
import type { MovieRecord } from '../types/cinema';
import { formatTimestamp } from '../utils/playbackSync';
import { computeAvailableRenditions, formatBytes } from '../utils/uploadLogic';
import { parseYouTubeUrl } from '../utils/youtube';

export function MoviesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('All');
  const [collectionFilter, setCollectionFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'size' | 'favourites'>('recent');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Movie modal fields
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('Sci-Fi Romance');
  const [newCollection, setNewCollection] = useState('Curated Nights');
  const [newDesc, setNewDesc] = useState('');
  const [newStreamUrl, setNewStreamUrl] = useState('');
  const [newThumbUrl, setNewThumbUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    cinemaApi
      .listMovies()
      .then((res) => setMovies(res.movies))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load movies.'))
      .finally(() => setLoading(false));
  }, []);

  const genres = useMemo(() => ['All', ...Array.from(new Set(movies.map((m) => m.genre)))], [movies]);
  const collections = useMemo(
    () => ['All', ...Array.from(new Set(movies.map((m) => m.collectionName)))],
    [movies]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = movies.filter((m) => {
      if (genreFilter !== 'All' && m.genre !== genreFilter) return false;
      if (collectionFilter !== 'All' && m.collectionName !== collectionFilter) return false;
      if (
        q &&
        !m.title.toLowerCase().includes(q) &&
        !m.genre.toLowerCase().includes(q) &&
        !m.collectionName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    if (sortBy === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'size') list.sort((a, b) => b.fileSizeBytes - a.fileSizeBytes);
    else if (sortBy === 'favourites') list.sort((a, b) => Number(b.isFavourite) - Number(a.isFavourite));
    else list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [movies, search, genreFilter, collectionFilter, sortBy]);

  const handleToggleFavourite = async (movie: MovieRecord) => {
    const { movie: updated } = await cinemaApi.updateMovie(
      movie.id,
      { isFavourite: !movie.isFavourite },
      user
    );
    setMovies((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  const handleStartWatch = async (movie: MovieRecord) => {
    const { room } = await cinemaApi.createRoom(
      {
        name: `${movie.title} — Private Screening`,
        movieId: movie.id,
        defaultScreenMode: 'Screen X',
      },
      user
    );
    navigate(`/cinema/${room.roomId}?theatre=1`);
  };

  const handleStreamUrlChange = async (val: string) => {
    setNewStreamUrl(val);
    const yt = parseYouTubeUrl(val);
    if (yt) {
      setNewThumbUrl(yt.thumbnailUrl);
      try {
        const meta = await cinemaApi.resolveYouTubeMetadata(val);
        if (!newTitle.trim()) setNewTitle(meta.title);
        setNewThumbUrl(meta.thumbnailUrl);
      } catch {
        // fallback handled cleanly
      }
    }
  };

  const handleCreateMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    const yt = parseYouTubeUrl(newStreamUrl.trim());
    const finalTitle = newTitle.trim() || (yt ? `YouTube Cinema (${yt.videoId})` : '');
    if (!finalTitle) return;
    setSaving(true);
    try {
      const { movie } = await cinemaApi.createMovie(
        {
          title: finalTitle,
          genre: newGenre,
          collectionName: newCollection,
          description: newDesc.trim() || (yt ? `YouTube stream (${yt.watchUrl})` : 'Added to private cinema collection.'),
          streamUrl: newStreamUrl.trim() || 'procedural://midnight-orbit',
          thumbnailUrl: newThumbUrl || undefined,
        },
        user
      );
      setMovies((prev) => [movie, ...prev]);
      setNewTitle('');
      setNewDesc('');
      setNewStreamUrl('');
      setNewThumbUrl('');
      setShowAddModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <CinemaLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Personal Movie Library</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your personal 4K films, HLS streams, collections, and playback progress
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 rounded-lg bg-[#211B32] border border-white/10 hover:border-[#8B5CF6]/50 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#C4B5FD]" />
              <span>Add Stream / Entry</span>
            </button>
            <Link
              to="/upload"
              className="px-4 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white flex items-center gap-2"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload from PC</span>
            </Link>
          </div>
        </div>

        {/* Search, Filter & Sort Toolbar */}
        <div className="cinema-surface rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles, genres..."
              aria-label="Search movies"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            aria-label="Filter by genre"
            className="px-3 py-2 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
          >
            {genres.map((g) => (
              <option key={g} value={g}>
                Genre: {g}
              </option>
            ))}
          </select>
          <select
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value)}
            aria-label="Filter by collection"
            className="px-3 py-2 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
          >
            {collections.map((c) => (
              <option key={c} value={c}>
                Collection: {c}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Sort movies"
            className="px-3 py-2 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
          >
            <option value="recent">Sort: Recently Updated</option>
            <option value="title">Sort: Title (A–Z)</option>
            <option value="size">Sort: Largest File Size</option>
            <option value="favourites">Sort: Favourites First</option>
          </select>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-96 rounded-xl bg-[#1C1930]/60 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="cinema-surface rounded-2xl p-12 text-center space-y-3">
            <Film className="w-10 h-10 text-[#C4B5FD] mx-auto" />
            <h2 className="font-display text-lg font-bold text-white">Your movie library is empty.</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Upload a personal video file up to 50GB+ or adjust your search filters.
            </p>
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#8B5CF6] text-white text-xs font-semibold"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Your First Movie</span>
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((movie) => (
              <MoviePosterCard
                key={movie.id}
                movie={movie}
                onToggleFavourite={handleToggleFavourite}
                onStartWatch={handleStartWatch}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Movie Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-lg cinema-surface-elevated rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-white">Add Movie Entry / HLS Stream</h2>
            <form onSubmit={handleCreateMovie} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Movie Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Moonlight Serenade"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Genre</label>
                  <input
                    type="text"
                    value={newGenre}
                    onChange={(e) => setNewGenre(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Collection</label>
                  <input
                    type="text"
                    value={newCollection}
                    onChange={(e) => setNewCollection(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Stream URL (YouTube Link / MP4 / HLS .m3u8)
                </label>
                <input
                  type="text"
                  value={newStreamUrl}
                  onChange={(e) => void handleStreamUrlChange(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or https://.../*.m3u8"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-[#151126] text-xs font-medium text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save to Library'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </CinemaLayout>
  );
}

export function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<MovieRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    cinemaApi
      .getMovie(id)
      .then((res) => {
        setMovie(res.movie);
        setEditTitle(res.movie.title);
        setEditDesc(res.movie.description);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Movie not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movie) return;
    const { movie: updated } = await cinemaApi.updateMovie(
      movie.id,
      { title: editTitle, description: editDesc },
      user
    );
    setMovie(updated);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!movie) return;
    await cinemaApi.deleteMovie(movie.id, user);
    navigate('/movies');
  };

  const handleLaunchRoom = async () => {
    if (!movie) return;
    const { room } = await cinemaApi.createRoom(
      {
        name: `${movie.title} — Private Screening`,
        movieId: movie.id,
        defaultScreenMode: 'IMAX',
      },
      user
    );
    navigate(`/cinema/${room.roomId}`);
  };

  if (loading) {
    return (
      <CinemaLayout>
        <div className="h-96 rounded-2xl bg-[#1C1930]/60 animate-pulse" />
      </CinemaLayout>
    );
  }

  if (error || !movie) {
    return (
      <CinemaLayout>
        <div className="cinema-surface rounded-2xl p-10 text-center space-y-3">
          <h1 className="font-display text-2xl font-bold text-white">Movie Not Found</h1>
          <p className="text-sm text-slate-400">{error || 'This title could not be located in your vault.'}</p>
          <Link to="/movies" className="inline-block text-sm text-[#C4B5FD] hover:underline">
            ← Return to Movie Library
          </Link>
        </div>
      </CinemaLayout>
    );
  }

  const renditions = computeAvailableRenditions(movie.sourceHeight);

  return (
    <CinemaLayout>
      <div className="space-y-8">
        <Link to="/movies" className="inline-flex items-center gap-2 text-xs font-medium text-[#C4B5FD] hover:text-white">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Movie Library</span>
        </Link>

        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-4 rounded-2xl overflow-hidden bg-[#151126] border border-white/10">
            <img
              src={movie.thumbnailUrl}
              alt={movie.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover max-h-[540px]"
            />
          </div>

          <div className="lg:col-span-8 cinema-surface rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6">
            {editing ? (
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-lg font-bold text-white"
                />
                <textarea
                  rows={4}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white"
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-[#8B5CF6] text-xs font-semibold text-white cursor-pointer"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 rounded-lg bg-[#151126] text-xs text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-[#C4B5FD]">
                      {movie.genre} · {movie.collectionName} · {movie.resolution}
                    </p>
                    <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white mt-1">
                      {movie.title}
                    </h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      aria-label="Edit movie metadata"
                      className="p-2.5 rounded-lg bg-[#151126] hover:bg-[#211B32] text-slate-300 hover:text-white cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      aria-label="Delete movie"
                      className="p-2.5 rounded-lg bg-[#151126] hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{movie.description}</p>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-lg bg-[#151126] border border-white/5">
                    <span className="text-slate-400 block">File Size</span>
                    <span className="font-mono-tabular text-white font-semibold mt-0.5 block">
                      {formatBytes(movie.fileSizeBytes)}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#151126] border border-white/5">
                    <span className="text-slate-400 block">Duration</span>
                    <span className="font-mono-tabular text-white font-semibold mt-0.5 block">
                      {movie.durationSeconds > 0 ? formatTimestamp(movie.durationSeconds) : 'Variable'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#151126] border border-white/5">
                    <span className="text-slate-400 block">Codec &amp; Audio</span>
                    <span className="text-white font-semibold mt-0.5 block">
                      {movie.videoFormat} · {movie.audioFormat}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#151126] border border-white/5">
                    <span className="text-slate-400 block">Available Qualities</span>
                    <span className="font-mono-tabular text-[#C4B5FD] font-semibold mt-0.5 block">
                      {renditions.join(', ')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleLaunchRoom}
                  className="px-6 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#9167FF] text-white font-semibold text-sm flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Watch Together in 3D Cinema</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const { movie: updated } = await cinemaApi.updateMovie(
                      movie.id,
                      { isFavourite: !movie.isFavourite },
                      user
                    );
                    setMovie(updated);
                  }}
                  className="px-4 py-3 rounded-xl bg-[#211B32] border border-white/10 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
                >
                  <Heart className={`w-4 h-4 ${movie.isFavourite ? 'fill-[#F472B6] text-[#F472B6]' : ''}`} />
                  <span>{movie.isFavourite ? 'Favourited' : 'Add to Favourites'}</span>
                </button>
              </div>

              {confirmDelete && (
                <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-rose-200">
                    Permanently delete &ldquo;{movie.title}&rdquo; and its stored object?
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-1.5 rounded bg-[#151126] text-xs text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-3 py-1.5 rounded bg-rose-600 text-xs font-semibold text-white cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chapters & Tracks */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="cinema-surface rounded-xl p-6 space-y-3">
            <h2 className="font-display text-lg font-bold text-white">Chapters</h2>
            <div className="space-y-2">
              {movie.chapters.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[#151126] border border-white/5 text-xs"
                >
                  <span className="text-white font-medium">{ch.title}</span>
                  <span className="font-mono-tabular text-[#C4B5FD]">{formatTimestamp(ch.timeSeconds)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cinema-surface rounded-xl p-6 space-y-3">
            <h2 className="font-display text-lg font-bold text-white">Audio &amp; Subtitle Tracks</h2>
            <div className="space-y-2 text-xs">
              {movie.audioTracks.map((a) => (
                <div key={a.id} className="p-3 rounded-lg bg-[#151126] border border-white/5 flex justify-between">
                  <span className="text-white">{a.label}</span>
                  <span className="font-mono-tabular text-[#83A9FF]">{a.channels}</span>
                </div>
              ))}
              {movie.subtitles.length === 0 ? (
                <p className="text-slate-400">No embedded subtitle tracks detected.</p>
              ) : (
                movie.subtitles.map((s) => (
                  <div key={s.id} className="p-3 rounded-lg bg-[#151126] border border-white/5 flex justify-between">
                    <span className="text-slate-300">Subtitles · {s.label}</span>
                    <span className="font-mono-tabular text-slate-400 uppercase">{s.language}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </CinemaLayout>
  );
}
