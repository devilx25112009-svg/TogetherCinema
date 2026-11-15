import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Heart, Popcorn, Settings, Sparkles } from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import {
  CinemaLobbyScene,
  LOBBY_DESTINATIONS,
  type LobbyDestination,
} from '../components/three/CinemaLobbyScene';

export function LobbyPage() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<LobbyDestination | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const handleNavigate = (dest: LobbyDestination) => {
    setTransitioning(dest.title);
    window.setTimeout(() => {
      navigate(dest.route);
    }, 260);
  };

  const icons: Record<string, typeof Film> = {
    movies: Film,
    rooms: Heart,
    food: Popcorn,
    memories: Sparkles,
    settings: Settings,
  };

  return (
    <CinemaLayout fullBleed>
      <div className="relative w-full h-[calc(100vh-64px)] overflow-hidden bg-[#0B1020]">
        {/* Isolated 3D Canvas */}
        <CinemaLobbyScene onSelectDestination={handleNavigate} onHoverDestination={setHovered} />

        {/* Top-left subtle label (no backdrop-blur over WebGL!) */}
        <div className="pointer-events-none absolute top-5 left-5 sm:left-8 z-10 max-w-md bg-[#080810]/88 border border-[#C4B5FD]/20 rounded-xl px-4 py-3">
          <h1 className="font-display text-lg font-bold text-white">3D Grand Cinema Lobby</h1>
          <p className="text-xs text-slate-300 mt-0.5">
            {transitioning
              ? `Entering ${transitioning}...`
              : hovered
              ? `${hovered.title} — ${hovered.subtitle}`
              : 'Click any illuminated portal in 3D or choose a destination below.'}
          </p>
        </div>

        {/* Accessible Bottom Destination Dock (zero viewport center occlusion) */}
        <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-20 w-[94vw] max-w-4xl">
          <div className="bg-[#080810]/92 border border-[#C4B5FD]/20 rounded-2xl p-2 flex flex-wrap sm:flex-nowrap items-center justify-center gap-1.5">
            {LOBBY_DESTINATIONS.map((dest) => {
              const Icon = icons[dest.id] || Film;
              const isHover = hovered?.id === dest.id;
              return (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => handleNavigate(dest)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    isHover
                      ? 'bg-[#8B5CF6] text-white'
                      : 'bg-[#151126] text-slate-200 hover:bg-[#211B32] hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 text-[#C4B5FD]" />
                  <span>{dest.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </CinemaLayout>
  );
}
