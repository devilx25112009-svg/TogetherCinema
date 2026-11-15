import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Compass, Film, SkipForward } from 'lucide-react';
import { CinematicIntroScene } from '../components/three/CinematicIntroScene';

export function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autostart = searchParams.get('autostart') === '1';
  const [skipIntro, setSkipIntro] = useState(autostart);
  const [phase, setPhase] = useState<'approaching' | 'doors' | 'auditorium' | 'seated'>(
    autostart ? 'seated' : 'approaching'
  );

  useEffect(() => {
    if (autostart) {
      navigate('/home', { replace: true });
    }
  }, [autostart, navigate]);

  const showFinalOverlay = skipIntro || phase === 'seated' || phase === 'auditorium';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080810] text-white select-none">
      {/* 3D Luxury Cinema Opening Sequence */}
      <div className="absolute inset-0 z-0">
        <CinematicIntroScene skipIntro={skipIntro} onPhaseChange={setPhase} />
      </div>

      {/* Subtle contrast vignette */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#080810]/90 via-transparent to-[#080810]/65" />

      {/* Top minimal header */}
      <header className="relative z-20 flex items-center justify-between px-6 sm:px-12 py-6">
        <div className="flex items-center gap-3">
          <Film className="w-5 h-5 text-[#C4B5FD]" />
          <span className="font-display font-bold text-lg tracking-tight text-white">Together Cinema</span>
        </div>
        {!skipIntro && phase !== 'seated' && (
          <button
            type="button"
            onClick={() => setSkipIntro(true)}
            className="px-4 py-2 rounded-lg bg-[#151126]/90 border border-[#C4B5FD]/25 text-xs font-medium text-[#C4B5FD] hover:text-white hover:border-[#8B5CF6] flex items-center gap-2 transition-colors cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>Skip Intro</span>
          </button>
        )}
      </header>

      {/* Center / Bottom Editorial Narrative */}
      <div className="relative z-20 h-[calc(100vh-88px)] flex flex-col justify-end pb-14 sm:pb-20 px-6 sm:px-12 max-w-5xl mx-auto text-center items-center">
        {!showFinalOverlay ? (
          <div className="space-y-3 transition-opacity duration-500">
            <p className="text-xs sm:text-sm font-mono-tabular tracking-[0.22em] text-[#C4B5FD] uppercase">
              Entering Private Screening Room
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white text-balance">
              The world can wait. Our movie night can&apos;t.
            </h1>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl">
            <p className="text-xs sm:text-sm font-medium tracking-[0.2em] text-[#F472B6] uppercase">
              The world can wait. Our movie night can&apos;t.
            </p>
            <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-white text-balance">
              Together Cinema
            </h1>
            <p className="font-mono-tabular text-sm sm:text-base tracking-[0.18em] text-[#C4B5FD] uppercase">
              Miles apart. One screen. Together.
            </p>
            <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
              Your private luxury 3D theatre for two—featuring 50GB+ resumable uploads, front-seat IMAX &amp; ScreenX auditoriums, real-time synced playback, and live couple reactions.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="px-7 py-3.5 rounded-xl bg-[#8B5CF6] hover:bg-[#9167FF] text-white font-semibold text-sm sm:text-base flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <span>Enter Your Cinema</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/lobby')}
                className="px-7 py-3.5 rounded-xl bg-[#1C1930]/95 hover:bg-[#211B32] border border-[#C4B5FD]/25 text-slate-100 font-semibold text-sm sm:text-base flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Compass className="w-4 h-4 text-[#C4B5FD]" />
                <span>Explore 3D Lobby</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
