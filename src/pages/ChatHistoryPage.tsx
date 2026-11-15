import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Play, Search } from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { cinemaApi } from '../lib/api';
import type { ChatMessageRecord } from '../types/cinema';

interface RoomThread {
  roomId: string;
  roomName: string;
  messages: ChatMessageRecord[];
}

export default function ChatHistoryPage() {
  const [threads, setThreads] = useState<RoomThread[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cinemaApi
      .getChatThreads()
      .then((res) => {
        setThreads(res.threads);
        if (res.threads.length > 0) setSelectedRoomId(res.threads[0].roomId);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeThread = useMemo(
    () => threads.find((t) => t.roomId === selectedRoomId) || threads[0] || null,
    [threads, selectedRoomId]
  );

  const visibleMessages = useMemo(() => {
    if (!activeThread) return [];
    const q = query.trim().toLowerCase();
    if (!q) return activeThread.messages;
    return activeThread.messages.filter(
      (m) => m.text.toLowerCase().includes(q) || m.senderName.toLowerCase().includes(q)
    );
  }, [activeThread, query]);

  return (
    <CinemaLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#C4B5FD]/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD] mb-2">Auditorium Archive</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Conversation History</h1>
            <p className="text-sm text-slate-300 mt-1">
              Revisit every whispered note, GIF, and reaction saved across your private cinema rooms.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search conversation history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-[#151126] border border-[#C4B5FD]/20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 py-10">Loading room transcripts...</p>
        ) : threads.length === 0 ? (
          <div className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-10 text-center">
            <MessageSquare className="w-8 h-8 text-[#C4B5FD]/60 mx-auto mb-3" />
            <p className="text-sm text-slate-300">No cinema room conversations recorded yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <aside className="lg:col-span-4 space-y-2">
              {threads.map((thread) => {
                const active = thread.roomId === activeThread?.roomId;
                return (
                  <button
                    key={thread.roomId}
                    type="button"
                    onClick={() => setSelectedRoomId(thread.roomId)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-white'
                        : 'bg-[#151126] border-[#C4B5FD]/15 text-slate-300 hover:bg-[#1C1930]'
                    }`}
                  >
                    <p className="font-display font-semibold text-sm">{thread.roomName}</p>
                    <p className="text-xs font-mono text-[#C4B5FD] mt-1">
                      {thread.messages.length} messages · {thread.roomId}
                    </p>
                  </button>
                );
              })}
            </aside>

            <section className="lg:col-span-8 rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 flex flex-col min-h-[420px]">
              {activeThread && (
                <>
                  <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-[#C4B5FD]/10">
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">{activeThread.roomName}</h2>
                      <p className="text-xs text-slate-400">{visibleMessages.length} matching messages</p>
                    </div>
                    <Link
                      to={`/cinema/${activeThread.roomId}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-white text-xs font-semibold"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Re-enter Room
                    </Link>
                  </div>

                  {visibleMessages.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                      No messages in this room match your search.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                      {visibleMessages.map((msg) => (
                        <div key={msg.id} className="rounded-xl bg-[#0B1020] border border-[#C4B5FD]/10 p-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-semibold text-[#C4B5FD]">{msg.senderName}</span>
                            <span className="font-mono text-slate-400">
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {msg.replyPreview && (
                            <p className="text-xs text-slate-400 italic mb-1.5">Replying to: {msg.replyPreview}</p>
                          )}
                          <p className="text-sm text-slate-100">{msg.text}</p>
                          {msg.gifUrl && (
                            <img
                              src={msg.gifUrl}
                              alt="Shared cinema GIF"
                              className="mt-2 rounded-lg max-h-40 object-cover"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </CinemaLayout>
  );
}
