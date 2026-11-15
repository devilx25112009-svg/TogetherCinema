import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, Calendar, CheckCircle2, Heart, Plus, ThumbsUp, Trash2 } from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { useAuth } from '../context/AuthContext';
import { cinemaApi } from '../lib/api';
import type { WatchlistItemRecord } from '../types/cinema';

type StatusFilter = 'all' | 'queued' | 'scheduled' | 'watched' | 'favourites';

export default function WatchlistPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchlistItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('Sci-Fi');
  const [year, setYear] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('high');
  const [plannedDate, setPlannedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    cinemaApi
      .listWatchlist()
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load watchlist'))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'favourites') return item.isFavourite;
      if (filter === 'all') return true;
      return item.status === filter;
    });
  }, [items, filter]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a movie title for the shared watchlist.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { item } = await cinemaApi.addWatchlistItem(
        {
          title: title.trim(),
          genre,
          year: year ? Number(year) : undefined,
          priority,
          plannedDate: plannedDate || undefined,
          notes: notes.trim() || undefined,
        },
        user
      );
      setItems((prev) => [item, ...prev]);
      setTitle('');
      setYear('');
      setPlannedDate('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add movie to watchlist.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (item: WatchlistItemRecord) => {
    const { item: updated } = await cinemaApi.updateWatchlistItem(item.id, { incrementVote: true }, user);
    setItems((prev) => prev.map((w) => (w.id === item.id ? updated : w)));
  };

  const handleToggleFavourite = async (item: WatchlistItemRecord) => {
    const { item: updated } = await cinemaApi.updateWatchlistItem(
      item.id,
      { isFavourite: !item.isFavourite },
      user
    );
    setItems((prev) => prev.map((w) => (w.id === item.id ? updated : w)));
  };

  const handleStatusChange = async (item: WatchlistItemRecord, status: WatchlistItemRecord['status']) => {
    const { item: updated } = await cinemaApi.updateWatchlistItem(item.id, { status }, user);
    setItems((prev) => prev.map((w) => (w.id === item.id ? updated : w)));
  };

  const handlePriorityChange = async (item: WatchlistItemRecord, nextPriority: WatchlistItemRecord['priority']) => {
    const { item: updated } = await cinemaApi.updateWatchlistItem(item.id, { priority: nextPriority }, user);
    setItems((prev) => prev.map((w) => (w.id === item.id ? updated : w)));
  };

  const handlePlannedDateChange = async (item: WatchlistItemRecord, nextDate: string) => {
    const { item: updated } = await cinemaApi.updateWatchlistItem(
      item.id,
      { plannedDate: nextDate, status: nextDate ? 'scheduled' : item.status },
      user
    );
    setItems((prev) => prev.map((w) => (w.id === item.id ? updated : w)));
  };

  const handleDelete = async (item: WatchlistItemRecord) => {
    await cinemaApi.deleteWatchlistItem(item.id);
    setItems((prev) => prev.filter((w) => w.id !== item.id));
  };

  return (
    <CinemaLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#C4B5FD]/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD] mb-2">Shared Queue</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Shared Watchlist</h1>
            <p className="text-sm text-slate-300 mt-1">
              Suggest future double features, vote on tonight&apos;s pick, and schedule upcoming date nights.
            </p>
          </div>
          <div className="text-xs font-mono text-[#C4B5FD]">
            {items.length} titles · {items.filter((i) => i.status === 'scheduled').length} scheduled ·{' '}
            {items.filter((i) => i.status === 'watched').length} watched
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Suggest Movie Form */}
          <section className="lg:col-span-4 rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 h-fit">
            <h2 className="font-display text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#8B5CF6]" />
              Suggest a Film
            </h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label htmlFor="wl-title" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Movie Title
                </label>
                <input
                  id="wl-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Arrival"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="wl-genre" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Genre
                  </label>
                  <select
                    id="wl-genre"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="Sci-Fi">Sci-Fi</option>
                    <option value="Romance">Romance</option>
                    <option value="Drama">Drama</option>
                    <option value="Animation">Animation</option>
                    <option value="Thriller">Thriller</option>
                    <option value="Documentary">Documentary</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="wl-year" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Release Year
                  </label>
                  <input
                    id="wl-year"
                    type="number"
                    min="1920"
                    max="2035"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2016"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="wl-priority" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Priority
                  </label>
                  <select
                    id="wl-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="wl-date" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Planned Date
                  </label>
                  <input
                    id="wl-date"
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="wl-notes" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Couple Note
                </label>
                <textarea
                  id="wl-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why this film belongs on our screen..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              {error && <p className="text-xs text-[#F472B6]">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {submitting ? 'Adding to Queue...' : 'Add to Shared Watchlist'}
              </button>
            </form>
          </section>

          {/* Watchlist Queue */}
          <section className="lg:col-span-8 space-y-5">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#C4B5FD]/10 pb-3">
              {(
                [
                  { id: 'all', label: 'All Titles' },
                  { id: 'queued', label: 'Queued' },
                  { id: 'scheduled', label: 'Scheduled' },
                  { id: 'watched', label: 'Watched' },
                  { id: 'favourites', label: 'Favourites' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    filter === tab.id
                      ? 'bg-[#8B5CF6] text-white'
                      : 'bg-[#1C1930] text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-400">Loading shared watchlist...</div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-10 text-center">
                <Bookmark className="w-8 h-8 text-[#C4B5FD]/60 mx-auto mb-3" />
                <p className="text-sm text-slate-300">No watchlist titles match this filter yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredItems.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-5 flex flex-col gap-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-display text-xl font-bold text-white">{item.title}</h3>
                          {item.year && <span className="text-xs font-mono text-slate-400">{item.year}</span>}
                        </div>
                        <p className="text-xs text-[#C4B5FD] mt-1">
                          {item.genre} · {item.priority.toUpperCase()} priority · Suggested by {item.suggestedBy}
                          {item.plannedDate ? ` · Planned ${item.plannedDate}` : ''}
                        </p>
                        {item.notes && <p className="text-sm text-slate-300 mt-3 leading-relaxed">{item.notes}</p>}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleVote(item)}
                          aria-label={`Vote up ${item.title}`}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1C1930] hover:bg-[#211B32] border border-[#C4B5FD]/20 text-xs font-mono text-white cursor-pointer"
                        >
                          <ThumbsUp className="w-3.5 h-3.5 text-[#83A9FF]" />
                          <span>{item.votes}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleFavourite(item)}
                          aria-label={
                            item.isFavourite ? `Remove ${item.title} from favourites` : `Favourite ${item.title}`
                          }
                          className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                            item.isFavourite
                              ? 'bg-[#F472B6]/20 border-[#F472B6]/50 text-[#F472B6]'
                              : 'bg-[#1C1930] border-[#C4B5FD]/15 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Heart className="w-4 h-4" fill={item.isFavourite ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          aria-label={`Delete ${item.title} from watchlist`}
                          className="p-2 rounded-lg bg-[#1C1930] border border-[#C4B5FD]/15 text-slate-400 hover:text-[#F472B6] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#C4B5FD]/10">
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <span className="text-slate-400 shrink-0">Status</span>
                        <select
                          aria-label={`Status for ${item.title}`}
                          value={item.status}
                          onChange={(e) =>
                            handleStatusChange(item, e.target.value as WatchlistItemRecord['status'])
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/15 text-xs text-white"
                        >
                          <option value="queued">Queued</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="watched">Watched</option>
                        </select>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <span className="text-slate-400 shrink-0">Priority</span>
                        <select
                          aria-label={`Priority for ${item.title}`}
                          value={item.priority}
                          onChange={(e) =>
                            handlePriorityChange(item, e.target.value as WatchlistItemRecord['priority'])
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/15 text-xs text-white"
                        >
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-[#C4B5FD] shrink-0" />
                        <input
                          aria-label={`Planned date for ${item.title}`}
                          type="date"
                          value={item.plannedDate || ''}
                          onChange={(e) => handlePlannedDateChange(item, e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/15 text-xs text-white"
                        />
                      </label>
                    </div>

                    {item.status === 'watched' && (
                      <div className="flex items-center gap-2 text-xs text-emerald-300">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Watched together</span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </CinemaLayout>
  );
}
