import React, { useEffect, useState } from 'react';
import { Box, Camera, ChevronLeft, ChevronRight, Grid, Plus, Trash2 } from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { MemoriesGallery3D } from '../components/three/MemoriesGallery3D';
import { useAuth } from '../context/AuthContext';
import { cinemaApi } from '../lib/api';
import type { MemoryItemRecord } from '../types/cinema';

const MEMORY_ARTWORKS = [
  { label: 'Velvet Couple Theatre', url: '/images/cinema_hero_couple_1794680184863.jpg' },
  { label: 'Midnight Orbit Frame', url: '/images/poster_midnight_orbit_1794680182030.jpg' },
  { label: 'Velvet Rain Scene', url: '/images/poster_velvet_rain_1794680183387.jpg' },
  { label: 'Paper Lanterns Still', url: '/images/poster_paper_lanterns_1794680183501.jpg' },
];

export default function MemoriesPage() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<MemoryItemRecord[]>([]);
  const [viewMode, setViewMode] = useState<'3d' | 'grid'>('3d');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add moment form
  const [movieTitle, setMovieTitle] = useState('');
  const [timestampLabel, setTimestampLabel] = useState('01:12:40');
  const [movieDate, setMovieDate] = useState(new Date().toISOString().slice(0, 10));
  const [mood, setMood] = useState('Romantic');
  const [note, setNote] = useState('');
  const [imageUrl, setImageUrl] = useState(MEMORY_ARTWORKS[0].url);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    cinemaApi
      .listMemories()
      .then((res) => setMemories(res.memories))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load memories'))
      .finally(() => setLoading(false));
  }, []);

  const currentMemory = memories[activeIndex] || null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movieTitle.trim() || !note.trim()) {
      setError('Movie title and personal memory note are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { memory } = await cinemaApi.addMemory(
        {
          movieTitle: movieTitle.trim(),
          timestampLabel: timestampLabel.trim() || '00:00:00',
          movieDate,
          mood,
          note: note.trim(),
          imageUrl,
        },
        user
      );
      setMemories((prev) => [memory, ...prev]);
      setActiveIndex(0);
      setMovieTitle('');
      setNote('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save moment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await cinemaApi.deleteMemory(id);
    setMemories((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (activeIndex >= next.length) setActiveIndex(Math.max(0, next.length - 1));
      return next;
    });
  };

  return (
    <CinemaLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#C4B5FD]/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#F472B6] mb-2">Private Archive</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Our Movie Memories</h1>
            <p className="text-sm text-slate-300 mt-1">
              Bookmark favourite timestamps, whispered notes, and milestone movie nights in 3D or gallery view.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-[#151126] border border-[#C4B5FD]/15 p-1">
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  viewMode === '3d' ? 'bg-[#8B5CF6] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                3D Gallery
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  viewMode === 'grid' ? 'bg-[#8B5CF6] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                Editorial Grid
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Save Moment
            </button>
          </div>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/20 p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label htmlFor="mem-title" className="block text-xs font-medium text-slate-300 mb-1.5">
                Movie Title
              </label>
              <input
                id="mem-title"
                type="text"
                value={movieTitle}
                onChange={(e) => setMovieTitle(e.target.value)}
                placeholder="e.g. Midnight Orbit"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="mem-time" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Timestamp
                </label>
                <input
                  id="mem-time"
                  type="text"
                  value={timestampLabel}
                  onChange={(e) => setTimestampLabel(e.target.value)}
                  placeholder="01:12:40"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm font-mono text-white focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <div>
                <label htmlFor="mem-date" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Date
                </label>
                <input
                  id="mem-date"
                  type="date"
                  value={movieDate}
                  onChange={(e) => setMovieDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <div>
                <label htmlFor="mem-mood" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Mood
                </label>
                <select
                  id="mem-mood"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                >
                  <option value="Romantic">Romantic</option>
                  <option value="Cozy">Cozy</option>
                  <option value="Nostalgic">Nostalgic</option>
                  <option value="Magical">Magical</option>
                  <option value="Tears & Laughs">Tears &amp; Laughs</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="mem-artwork" className="block text-xs font-medium text-slate-300 mb-1.5">
                Scene Still
              </label>
              <select
                id="mem-artwork"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              >
                {MEMORY_ARTWORKS.map((art) => (
                  <option key={art.url} value={art.url}>
                    {art.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="mem-note" className="block text-xs font-medium text-slate-300 mb-1.5">
                Memory Note
              </label>
              <input
                id="mem-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened at this exact scene..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            {error && <p className="md:col-span-2 text-xs text-[#F472B6]">{error}</p>}

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg bg-[#1C1930] text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white cursor-pointer"
              >
                {submitting ? 'Saving...' : 'Preserve Memory'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading your shared cinema memories...</div>
        ) : memories.length === 0 ? (
          <div className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-12 text-center">
            <Camera className="w-8 h-8 text-[#C4B5FD]/60 mx-auto mb-3" />
            <p className="text-sm text-slate-300">No saved moments yet. Capture your first movie night memory above.</p>
          </div>
        ) : viewMode === '3d' ? (
          <div className="space-y-4">
            <div className="relative h-[440px] sm:h-[520px] rounded-2xl overflow-hidden border border-[#C4B5FD]/20 bg-[#090814]">
              <MemoriesGallery3D
                memories={memories}
                activeIndex={activeIndex}
                onSelectMemory={setActiveIndex}
              />

              {/* Gallery Navigation Controls */}
              <div className="absolute inset-x-4 bottom-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4 pointer-events-none">
                {currentMemory && (
                  <div className="pointer-events-auto max-w-xl rounded-xl bg-[#151126]/92 border border-[#C4B5FD]/20 p-4">
                    <p className="text-xs font-mono text-[#F472B6]">
                      {currentMemory.timestampLabel} · {currentMemory.movieDate} · {currentMemory.mood}
                    </p>
                    <h2 className="font-display text-lg font-bold text-white mt-1">
                      {currentMemory.movieTitle}
                    </h2>
                    <p className="text-sm text-slate-200 mt-1">{currentMemory.note}</p>
                  </div>
                )}

                <div className="pointer-events-auto flex items-center gap-2 self-end">
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                    disabled={activeIndex === 0}
                    aria-label="Previous memory frame"
                    className="p-2.5 rounded-lg bg-[#151126]/92 border border-[#C4B5FD]/20 text-white disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-2 rounded-lg bg-[#151126]/92 border border-[#C4B5FD]/20 text-xs font-mono text-[#C4B5FD]">
                    {activeIndex + 1} / {memories.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => Math.min(memories.length - 1, i + 1))}
                    disabled={activeIndex >= memories.length - 1}
                    aria-label="Next memory frame"
                    className="p-2.5 rounded-lg bg-[#151126]/92 border border-[#C4B5FD]/20 text-white disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {memories.map((mem) => (
              <article
                key={mem.id}
                className="rounded-2xl overflow-hidden bg-[#151126] border border-[#C4B5FD]/15 flex flex-col"
              >
                <div className="aspect-video bg-[#0B1020] overflow-hidden">
                  <img src={mem.imageUrl} alt={mem.movieTitle} className="w-full h-full object-cover" />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono text-[#F472B6]">
                      {mem.timestampLabel} · {mem.movieDate} · {mem.mood}
                    </p>
                    <h2 className="font-display text-lg font-bold text-white mt-1.5">{mem.movieTitle}</h2>
                    <p className="text-sm text-slate-300 mt-2 leading-relaxed">{mem.note}</p>
                  </div>
                  <div className="flex justify-end pt-2 border-t border-[#C4B5FD]/10">
                    <button
                      type="button"
                      onClick={() => handleDelete(mem.id)}
                      aria-label={`Delete memory for ${mem.movieTitle}`}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#F472B6] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </CinemaLayout>
  );
}
