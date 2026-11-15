import {
  Crown,
  Flame,
  Flower2,
  Gift,
  Hand,
  HandHeart,
  Heart,
  HeartHandshake,
  HeartPulse,
  Laugh,
  MessageCircleHeart,
  Popcorn,
  Smile,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react';
import type { CoupleInteractionKind, CoupleReactionEvent } from '../../types/cinema';
import { COUPLE_INTERACTION_OPTIONS } from '../../utils/coupleInteractions';

interface CoupleReactionOverlayProps {
  events: CoupleReactionEvent[];
  enabled: boolean;
}

const OPTION_BY_KIND = new Map(COUPLE_INTERACTION_OPTIONS.map((o) => [o.kind, o]));

function renderIcon(kind: CoupleInteractionKind) {
  switch (kind) {
    case 'kiss_lips':
    case 'kiss':
      return <HeartPulse className="w-6 h-6 text-rose-400 shrink-0" />;
    case 'kiss_forehead':
      return <Crown className="w-6 h-6 text-pink-300 shrink-0" />;
    case 'kiss_cheek':
      return <Smile className="w-6 h-6 text-[#F472B6] shrink-0" />;
    case 'kiss_neck':
      return <Flame className="w-6 h-6 text-fuchsia-400 shrink-0" />;
    case 'hug':
      return <HeartHandshake className="w-6 h-6 text-purple-300 shrink-0" />;
    case 'cuddle':
      return <Heart className="w-6 h-6 text-violet-300 fill-violet-300 shrink-0" />;
    case 'hold_hands':
      return <HandHeart className="w-6 h-6 text-amber-300 shrink-0" />;
    case 'whisper_ily':
      return <MessageCircleHeart className="w-6 h-6 text-[#F472B6] shrink-0" />;
    case 'playful_beat':
      return <Zap className="w-6 h-6 text-amber-300 shrink-0" />;
    case 'pinch_cheek':
      return <Smile className="w-6 h-6 text-orange-300 shrink-0" />;
    case 'tickle':
      return <Laugh className="w-6 h-6 text-emerald-300 shrink-0" />;
    case 'headpat':
      return <Hand className="w-6 h-6 text-sky-300 shrink-0" />;
    case 'give_rose':
      return <Flower2 className="w-6 h-6 text-rose-400 shrink-0" />;
    case 'popcorn':
      return <Popcorn className="w-6 h-6 text-yellow-300 shrink-0" />;
    case 'heart_explosion':
      return <Flame className="w-6 h-6 text-pink-400 shrink-0" />;
    case 'surprise_gift':
      return <Gift className="w-6 h-6 text-[#F472B6] shrink-0" />;
    case 'wave':
      return <Waves className="w-6 h-6 text-sky-400 shrink-0" />;
    case 'heart':
      return <Heart className="w-6 h-6 text-rose-400 fill-rose-400 shrink-0" />;
    default:
      return <Sparkles className="w-6 h-6 text-[#C4B5FD] shrink-0" />;
  }
}

export function CoupleReactionOverlay({ events, enabled }: CoupleReactionOverlayProps) {
  if (!enabled || events.length === 0) return null;

  return (
    <div
      data-testid="couple-reaction-overlay"
      className="pointer-events-none fixed inset-x-0 top-14 sm:top-20 z-40 flex flex-col items-center gap-2 px-4 pt-2"
      aria-live="polite"
    >
      {events.slice(-2).map((ev) => {
        const meta = OPTION_BY_KIND.get(ev.kind);
        const accent = meta?.accentHex || '#F472B6';
        const badgeTitle = meta?.badgeTitle || ev.kind.replace(/_/g, ' ').toUpperCase();
        return (
          <div
            key={ev.id}
            style={{
              borderColor: `${accent}88`,
            }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#151126]/95 border shadow-xl"
          >
            <div
              style={{ backgroundColor: `${accent}22` }}
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            >
              {renderIcon(ev.kind)}
            </div>
            <div className="text-left">
              <p
                style={{ color: accent }}
                className="text-[10px] font-bold tracking-wider uppercase whitespace-nowrap"
              >
                {badgeTitle}
              </p>
              <p className="text-xs font-semibold text-white whitespace-nowrap">{ev.senderName}</p>
              <p className="text-[11px] text-slate-200 whitespace-nowrap">{ev.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
