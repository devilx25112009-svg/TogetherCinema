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
import type { CoupleInteractionKind } from '../../types/cinema';
import {
  COUPLE_INTERACTION_OPTIONS,
  type InteractionCategory,
} from '../../utils/coupleInteractions';

interface CoupleInteractionsPanelProps {
  onTrigger: (kind: CoupleInteractionKind) => void;
  compact?: boolean;
}

const CATEGORY_TITLES: Record<InteractionCategory, string> = {
  kisses: 'Specific Kisses (Each Has Its Own 3D Pose)',
  affection: 'Hug & Close Embrace',
  playful: 'Playful Beat & Tease',
  moments: 'Sweet Moments & Gifts',
};

const CATEGORIES: InteractionCategory[] = ['kisses', 'affection', 'playful', 'moments'];

function renderOptionIcon(kind: CoupleInteractionKind) {
  switch (kind) {
    case 'kiss_lips':
    case 'kiss':
      return <HeartPulse className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    case 'kiss_forehead':
      return <Crown className="w-3.5 h-3.5 text-pink-300 shrink-0" />;
    case 'kiss_cheek':
      return <Smile className="w-3.5 h-3.5 text-[#F472B6] shrink-0" />;
    case 'kiss_neck':
      return <Flame className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />;
    case 'hug':
      return <HeartHandshake className="w-3.5 h-3.5 text-purple-300 shrink-0" />;
    case 'cuddle':
      return <Heart className="w-3.5 h-3.5 text-violet-300 fill-violet-300 shrink-0" />;
    case 'hold_hands':
      return <HandHeart className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    case 'whisper_ily':
      return <MessageCircleHeart className="w-3.5 h-3.5 text-[#F472B6] shrink-0" />;
    case 'playful_beat':
      return <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    case 'pinch_cheek':
      return <Smile className="w-3.5 h-3.5 text-orange-300 shrink-0" />;
    case 'tickle':
      return <Laugh className="w-3.5 h-3.5 text-emerald-300 shrink-0" />;
    case 'headpat':
      return <Hand className="w-3.5 h-3.5 text-sky-300 shrink-0" />;
    case 'give_rose':
      return <Flower2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    case 'popcorn':
      return <Popcorn className="w-3.5 h-3.5 text-yellow-300 shrink-0" />;
    case 'heart_explosion':
      return <Flame className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
    case 'surprise_gift':
      return <Gift className="w-3.5 h-3.5 text-[#F472B6] shrink-0" />;
    case 'wave':
      return <Waves className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    case 'sparkles':
      return <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD] shrink-0" />;
    case 'heart':
    default:
      return <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400 shrink-0" />;
  }
}

export function CoupleInteractionsPanel({ onTrigger, compact = false }: CoupleInteractionsPanelProps) {
  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      {CATEGORIES.map((cat) => {
        const items = COUPLE_INTERACTION_OPTIONS.filter((o) => o.category === cat);
        return (
          <div key={cat} className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C4B5FD]/80">
              {CATEGORY_TITLES[cat]}
            </p>
            <div className={compact ? 'grid grid-cols-2 gap-1.5' : 'grid grid-cols-2 sm:grid-cols-4 gap-2'}>
              {items.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  data-testid={`action-${item.kind}`}
                  title={item.subtitle}
                  onClick={() => onTrigger(item.kind)}
                  style={{ borderColor: `${item.accentHex}44` }}
                  className={`rounded-lg bg-[#1C1930] hover:bg-[#2A2246] active:scale-[0.98] border font-medium text-white flex items-center justify-start gap-2 transition cursor-pointer ${
                    compact ? 'px-2.5 py-2 text-[11px] min-h-[38px]' : 'px-3 py-2 text-xs'
                  }`}
                >
                  {renderOptionIcon(item.kind)}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
