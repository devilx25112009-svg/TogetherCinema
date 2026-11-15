import React, { useEffect, useMemo, useState } from 'react';
import { Check, Heart, Info, Plus, Popcorn, Send, ShoppingBag } from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { useAuth } from '../context/AuthContext';
import { cinemaApi } from '../lib/api';
import type { SnackItemRecord } from '../types/cinema';

const SNACK_CATEGORIES: Array<SnackItemRecord['category']> = [
  'Popcorn',
  'Nachos',
  'Pizza',
  'Burgers',
  'Fries',
  'Chocolate',
  'Ice Cream',
  'Soft Drinks',
  'Coffee',
  'Desserts',
];

export default function FoodPage() {
  const { user } = useAuth();
  const [snacks, setSnacks] = useState<SnackItemRecord[]>([]);
  const [category, setCategory] = useState<'All' | SnackItemRecord['category']>('All');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  // Custom snack form
  const [name, setName] = useState('');
  const [customCategory, setCustomCategory] = useState<SnackItemRecord['category']>('Popcorn');
  const [description, setDescription] = useState('');

  useEffect(() => {
    cinemaApi
      .listSnacks()
      .then((res) => setSnacks(res.snacks))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (category === 'All' ? snacks : snacks.filter((s) => s.category === category)),
    [snacks, category]
  );

  const trayItems = useMemo(() => snacks.filter((s) => s.inTray), [snacks]);

  const patchSnack = async (snack: SnackItemRecord, patch: Partial<SnackItemRecord>) => {
    const { snack: updated } = await cinemaApi.updateSnack(snack.id, patch, user);
    setSnacks((prev) => prev.map((s) => (s.id === snack.id ? updated : s)));
  };

  const handleSendToPartner = async (snack: SnackItemRecord) => {
    await patchSnack(snack, { sentToPartner: true, inTray: true });
    setNotice(
      `Sent virtual "${snack.name}" to ${user?.partnerName || 'your partner'}'s cinema cupholder tray.`
    );
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const { snack } = await cinemaApi.createSnack(
      {
        name: name.trim(),
        category: customCategory,
        description: description.trim() || 'Shared cinema treat',
        inTray: true,
      },
      user
    );
    setSnacks((prev) => [snack, ...prev]);
    setName('');
    setDescription('');
  };

  return (
    <CinemaLayout>
      <div className="space-y-8">
        {/* Header Hero Banner */}
        <section className="relative overflow-hidden rounded-2xl border border-[#C4B5FD]/15 bg-[#151126]">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
            <div className="lg:col-span-7 p-6 sm:p-10 space-y-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD]">Virtual Concession Stand</p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
                Cinema Food &amp; Shared Snacks
              </h1>
              <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
                Stock your shared cupholder tray, bookmark cravings to your date-night wishlist, and send virtual
                popcorn or desserts straight to {user?.partnerName || 'your partner'}&apos;s auditorium seat.
              </p>
              <div className="flex items-start gap-2.5 rounded-xl bg-[#0B1020] border border-[#83A9FF]/25 p-3.5 text-xs text-slate-300">
                <Info className="w-4 h-4 text-[#83A9FF] shrink-0 mt-0.5" />
                <span>
                  Physical delivery integration is not connected in this environment. Virtual snacks sync live to
                  your cinema tray; real-world delivery requires configuring an external food-delivery API adapter.
                </span>
              </div>
            </div>
            <div className="lg:col-span-5 h-56 lg:h-full">
              <img
                src="/src/assets/images/snack_cinema_feast_1794680184354.jpg"
                alt="Luxury cinema popcorn and concession spread"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        {notice && (
          <div className="rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 px-4 py-3 text-sm text-[#C4B5FD] flex items-center justify-between">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice('')}
              className="text-xs text-white hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory('All')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              category === 'All' ? 'bg-[#8B5CF6] text-white' : 'bg-[#151126] text-slate-300 hover:text-white'
            }`}
          >
            All Categories ({snacks.length})
          </button>
          {SNACK_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                category === cat ? 'bg-[#8B5CF6] text-white' : 'bg-[#151126] text-slate-300 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Snack Catalog */}
          <div className="lg:col-span-8">
            {loading ? (
              <p className="text-sm text-slate-400 py-10">Opening concession stand...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.map((snack) => (
                  <article
                    key={snack.id}
                    className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <p className="text-xs font-mono text-[#C4B5FD]">
                        {snack.category}
                        {snack.calories ? ` · ${snack.calories}` : ''}
                        {snack.sentToPartner ? ` · Shared with ${user?.partnerName || 'Partner'}` : ''}
                      </p>
                      <h2 className="font-display text-lg font-bold text-white mt-1">{snack.name}</h2>
                      <p className="text-sm text-slate-300 mt-1.5">{snack.description}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#C4B5FD]/10">
                      <button
                        type="button"
                        onClick={() => patchSnack(snack, { inTray: !snack.inTray })}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                          snack.inTray
                            ? 'bg-[#8B5CF6] text-white'
                            : 'bg-[#1C1930] text-slate-200 hover:bg-[#211B32]'
                        }`}
                      >
                        {snack.inTray ? <Check className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                        {snack.inTray ? 'In Shared Tray' : 'Add to Tray'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendToPartner(snack)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1C1930] hover:bg-[#211B32] border border-[#F472B6]/30 text-xs font-medium text-[#F472B6] cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send to Partner
                      </button>

                      <button
                        type="button"
                        onClick={() => patchSnack(snack, { inWishlist: !snack.inWishlist })}
                        aria-label={`Toggle ${snack.name} wishlist`}
                        className={`p-2 rounded-lg border cursor-pointer ml-auto ${
                          snack.inWishlist
                            ? 'bg-[#F472B6]/15 border-[#F472B6]/40 text-[#F472B6]'
                            : 'bg-[#1C1930] border-[#C4B5FD]/15 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Heart className="w-3.5 h-3.5" fill={snack.inWishlist ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Shared Tray & Custom Treat */}
          <aside className="lg:col-span-4 space-y-6">
            <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                  <Popcorn className="w-5 h-5 text-[#F472B6]" />
                  Shared Snack Tray
                </h2>
                <span className="text-xs font-mono text-[#C4B5FD]">{trayItems.length} items</span>
              </div>
              {trayItems.length === 0 ? (
                <p className="text-xs text-slate-400">Your auditorium cupholder tray is empty.</p>
              ) : (
                <ul className="space-y-2.5">
                  {trayItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-[#0B1020] px-3 py-2.5 text-xs"
                    >
                      <div>
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="text-slate-400">{item.category}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => patchSnack(item, { inTray: false })}
                        className="text-slate-400 hover:text-[#F472B6] cursor-pointer"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6">
              <h2 className="font-display text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#8B5CF6]" />
                Create Custom Treat
              </h2>
              <form onSubmit={handleAddCustom} className="space-y-3">
                <div>
                  <label htmlFor="snack-name" className="block text-xs text-slate-300 mb-1">
                    Treat Name
                  </label>
                  <input
                    id="snack-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Matcha Tiramisu"
                    className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div>
                  <label htmlFor="snack-cat" className="block text-xs text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    id="snack-cat"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value as SnackItemRecord['category'])}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  >
                    {SNACK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="snack-desc" className="block text-xs text-slate-300 mb-1">
                    Description
                  </label>
                  <input
                    id="snack-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Homemade dessert for intermission"
                    className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-white text-xs font-semibold cursor-pointer"
                >
                  Add Custom Snack
                </button>
              </form>
            </section>
          </aside>
        </div>
      </div>
    </CinemaLayout>
  );
}
