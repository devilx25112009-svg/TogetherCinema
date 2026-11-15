import type { CoupleInteractionKind } from '../types/cinema';

export type InteractionCategory = 'kisses' | 'affection' | 'playful' | 'moments';

export type InteractionEffectType =
  | 'lip_kiss'
  | 'forehead_kiss'
  | 'cheek_kiss'
  | 'neck_kiss'
  | 'warm_hug'
  | 'cozy_cuddle'
  | 'hand_clasp'
  | 'whisper_wave'
  | 'bonk_stars'
  | 'cheek_pinch'
  | 'tickle_sparks'
  | 'headpat_halo'
  | 'rose_petals'
  | 'popcorn_toss'
  | 'heart_glow'
  | 'heart_burst'
  | 'starlight'
  | 'gift_box'
  | 'wave_sparkles';

export type ArmPoseStyle =
  | 'rest'
  | 'hug_both'
  | 'cradle_face'
  | 'cheek_touch'
  | 'cup_mouth_whisper'
  | 'bonk_strike'
  | 'pinch_reach'
  | 'tickle_flutter'
  | 'pat_receive'
  | 'offer_rose'
  | 'offer_gift'
  | 'scoop_popcorn'
  | 'hand_hold'
  | 'wave_hi';

export type FirstPersonArmPose =
  | 'none'
  | 'hug_wrap'
  | 'cheek_caress'
  | 'hold_hand'
  | 'playful_bonk'
  | 'pinch'
  | 'headpat'
  | 'give_gift'
  | 'give_rose'
  | 'popcorn';

export interface CoupleInteractionOption {
  kind: CoupleInteractionKind;
  label: string;
  shortLabel: string;
  badgeTitle: string;
  subtitle: string;
  accentHex: string;
  category: InteractionCategory;
  durationMs: number;
}

export const COUPLE_INTERACTION_OPTIONS: ReadonlyArray<CoupleInteractionOption> = [
  // Specific Kisses
  {
    kind: 'kiss_lips',
    label: 'Lip Kiss',
    shortLabel: 'Lip Kiss',
    badgeTitle: 'PROPER LIP KISS',
    subtitle: 'Close face-to-face kiss on the lips',
    accentHex: '#FB7185',
    category: 'kisses',
    durationMs: 2500,
  },
  {
    kind: 'kiss_forehead',
    label: 'Forehead Kiss',
    shortLabel: 'Forehead',
    badgeTitle: 'FOREHEAD KISS',
    subtitle: 'Tender gentle kiss on the forehead',
    accentHex: '#F9A8D4',
    category: 'kisses',
    durationMs: 2300,
  },
  {
    kind: 'kiss_cheek',
    label: 'Cheek Kiss',
    shortLabel: 'Cheek',
    badgeTitle: 'CHEEK KISS',
    subtitle: 'Sweet side kiss softly on your cheek',
    accentHex: '#F472B6',
    category: 'kisses',
    durationMs: 2200,
  },
  {
    kind: 'kiss_neck',
    label: 'Neck Kiss',
    shortLabel: 'Neck',
    badgeTitle: 'NECK KISS',
    subtitle: 'Close tilted kiss along the neck',
    accentHex: '#E879F9',
    category: 'kisses',
    durationMs: 2500,
  },

  // Hug & Close Affection
  {
    kind: 'hug',
    label: 'Warm Hug',
    shortLabel: 'Hug',
    badgeTitle: 'WARM HUG',
    subtitle: 'Full two-arm embrace pulled right in',
    accentHex: '#C084FC',
    category: 'affection',
    durationMs: 2700,
  },
  {
    kind: 'cuddle',
    label: 'Cuddle Close',
    shortLabel: 'Cuddle',
    badgeTitle: 'COZY CUDDLE',
    subtitle: 'Head resting softly on shoulder',
    accentHex: '#A78BFA',
    category: 'affection',
    durationMs: 2800,
  },
  {
    kind: 'hold_hands',
    label: 'Hold Hands',
    shortLabel: 'Hold Hands',
    badgeTitle: 'HANDS INTERTWINED',
    subtitle: 'Warm fingers clasped across the armrest',
    accentHex: '#FBBF24',
    category: 'affection',
    durationMs: 2400,
  },
  {
    kind: 'whisper_ily',
    label: 'Whisper ILY',
    shortLabel: 'Whisper ILY',
    badgeTitle: 'WHISPERED I LOVE YOU',
    subtitle: 'Leaning close beside your ear',
    accentHex: '#F472B6',
    category: 'affection',
    durationMs: 2300,
  },

  // Playful Beat & Tease
  {
    kind: 'playful_beat',
    label: 'Playful Beat',
    shortLabel: 'Beat',
    badgeTitle: 'PLAYFUL BONK!',
    subtitle: 'Two cheeky playful thumps with comic stars',
    accentHex: '#FBBF24',
    category: 'playful',
    durationMs: 1850,
  },
  {
    kind: 'pinch_cheek',
    label: 'Pinch Cheek',
    shortLabel: 'Pinch',
    badgeTitle: 'CHEEK PINCH',
    subtitle: 'Playful gentle pinch with a cute squint',
    accentHex: '#FB923C',
    category: 'playful',
    durationMs: 1950,
  },
  {
    kind: 'tickle',
    label: 'Tickle',
    shortLabel: 'Tickle',
    badgeTitle: 'TICKLE ATTACK!',
    subtitle: 'Rapid two-hand tickle wiggle',
    accentHex: '#34D399',
    category: 'playful',
    durationMs: 2050,
  },
  {
    kind: 'headpat',
    label: 'Headpat',
    shortLabel: 'Headpat',
    badgeTitle: 'GENTLE HEADPAT',
    subtitle: 'Affectionate pat with happy nod',
    accentHex: '#93C5FD',
    category: 'playful',
    durationMs: 2050,
  },

  // Sweet Moments & Gifts
  {
    kind: 'give_rose',
    label: 'Give Rose',
    shortLabel: 'Rose',
    badgeTitle: 'MIDNIGHT ROSE',
    subtitle: 'Handing over a glowing crimson rose',
    accentHex: '#F43F5E',
    category: 'moments',
    durationMs: 2500,
  },
  {
    kind: 'popcorn',
    label: 'Share Popcorn',
    shortLabel: 'Popcorn',
    badgeTitle: 'SHARED POPCORN',
    subtitle: 'Passing warm buttered popcorn beside you',
    accentHex: '#FDE047',
    category: 'moments',
    durationMs: 2100,
  },
  {
    kind: 'heart',
    label: 'Warm Heart',
    shortLabel: 'Heart',
    badgeTitle: 'WARM HEART',
    subtitle: 'Glowing heart float between seats',
    accentHex: '#FB7185',
    category: 'moments',
    durationMs: 1950,
  },
  {
    kind: 'heart_explosion',
    label: 'Heart Burst',
    shortLabel: 'Burst',
    badgeTitle: 'HEART BURST',
    subtitle: 'Cascade of rising 3D hearts',
    accentHex: '#EC4899',
    category: 'moments',
    durationMs: 2250,
  },
  {
    kind: 'sparkles',
    label: 'Sparkles',
    shortLabel: 'Sparkles',
    badgeTitle: 'STARLIGHT SPARKLES',
    subtitle: 'Shimmering theatre starlight aura',
    accentHex: '#C4B5FD',
    category: 'moments',
    durationMs: 1950,
  },
  {
    kind: 'surprise_gift',
    label: 'Surprise Gift',
    shortLabel: 'Gift',
    badgeTitle: 'SURPRISE GIFT',
    subtitle: 'Holding out a ribbon-wrapped gift box',
    accentHex: '#F472B6',
    category: 'moments',
    durationMs: 2350,
  },
  {
    kind: 'wave',
    label: 'Wave',
    shortLabel: 'Wave',
    badgeTitle: 'SWEET WAVE',
    subtitle: 'Friendly wave from beside you',
    accentHex: '#60A5FA',
    category: 'moments',
    durationMs: 1900,
  },
];

export interface InteractionChoreography {
  effectType: InteractionEffectType;
  armPoseStyle: ArmPoseStyle;
  firstPersonArmPose: FirstPersonArmPose;
  torsoLeanTowardPartner: number; // 0..1 lateral glide/lean toward partner seat
  torsoForwardPitch: number;      // radians (negative leans chest forward)
  headTurnWeight: number;         // 0..1 (or negative to bare neck away)
  headYawMultiplier: number;      // radians scaled by sideSign
  headPitchTarget: number;        // radians (+ up, - down)
  headRollTarget: number;         // radians scaled by sideSign
  contactPullX: number;           // 0..1 seat-gap closure during active peak
  contactForwardZ: number;        // meters forward toward screen/camera line
  contactHeightOffset: number;    // meters vertical head/body shift (-0.08..+0.12)
  cameraTargetYOffset: number;    // vertical camera look point shift at partner face
  cameraTargetXBias: number;      // lateral eye focus bias toward cheek/ear
  hugArmsStrength: number;        // 0..1
  reachArmStrength: number;       // 0..1
  beatPulse: number;              // 0..1
  tickleWiggle: number;           // 0..1
  waveMotion: number;             // 0..1
  eyeCloseAmount: number;         // 0..1
  lipPucker: number;              // 0..1
  blushBoost: number;             // 0..1
  showRoseProp: boolean;
  showGiftProp: boolean;
  cameraGlanceWeight: number;     // 0..0.96
}

export function resolveInteractionChoreography(kind: CoupleInteractionKind): InteractionChoreography {
  switch (kind) {
    case 'kiss_lips':
    case 'kiss':
      return {
        effectType: 'lip_kiss',
        armPoseStyle: 'cradle_face',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.98,
        torsoForwardPitch: -0.16,
        headTurnWeight: 0.98,
        headYawMultiplier: 1.05,
        headPitchTarget: 0.05,
        headRollTarget: 0.24, // romantic 14deg tilt so lips align cleanly
        contactPullX: 0.96,
        contactForwardZ: 0.42,
        contactHeightOffset: 0.02,
        cameraTargetYOffset: 1.0, // focus squarely at lips
        cameraTargetXBias: 0,
        hugArmsStrength: 0.35,
        reachArmStrength: 0.85,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 1.0,
        lipPucker: 1.0,
        blushBoost: 0.92,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.92,
      };
    case 'kiss_forehead':
      return {
        effectType: 'forehead_kiss',
        armPoseStyle: 'hug_both',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.92,
        torsoForwardPitch: -0.18,
        headTurnWeight: 0.92,
        headYawMultiplier: 0.92,
        headPitchTarget: -0.26, // bows forehead tenderly upward/forward
        headRollTarget: 0.1,
        contactPullX: 0.92,
        contactForwardZ: 0.38,
        contactHeightOffset: -0.04,
        cameraTargetYOffset: 1.11, // focus on brow/forehead
        cameraTargetXBias: 0,
        hugArmsStrength: 0.55,
        reachArmStrength: 0.4,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 1.0,
        lipPucker: 0.25,
        blushBoost: 0.78,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.9,
      };
    case 'kiss_cheek':
      return {
        effectType: 'cheek_kiss',
        armPoseStyle: 'cheek_touch',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.92,
        torsoForwardPitch: -0.12,
        headTurnWeight: 0.9,
        headYawMultiplier: 0.78, // angled slightly sideways toward your cheek
        headPitchTarget: 0.02,
        headRollTarget: 0.32,
        contactPullX: 0.9,
        contactForwardZ: 0.36,
        contactHeightOffset: 0.01,
        cameraTargetYOffset: 1.02,
        cameraTargetXBias: 0.08, // aimed warmly toward side cheek
        hugArmsStrength: 0.2,
        reachArmStrength: 0.72,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 0.9,
        lipPucker: 0.8,
        blushBoost: 1.0,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.88,
      };
    case 'kiss_neck':
      return {
        effectType: 'neck_kiss',
        armPoseStyle: 'cradle_face',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.96,
        torsoForwardPitch: -0.17,
        headTurnWeight: 0.84,
        headYawMultiplier: -0.42, // turns head away smoothly to bare neck toward partner
        headPitchTarget: 0.22,   // chin lifted gently
        headRollTarget: -0.34,
        contactPullX: 0.94,
        contactForwardZ: 0.38,
        contactHeightOffset: -0.02,
        cameraTargetYOffset: 0.91, // lower focus cleanly onto neck/collarbone curve
        cameraTargetXBias: 0.03,
        hugArmsStrength: 0.4,
        reachArmStrength: 0.65,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 1.0,
        lipPucker: 0.3,
        blushBoost: 0.95,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.9,
      };
    case 'hug':
      return {
        effectType: 'warm_hug',
        armPoseStyle: 'hug_both',
        firstPersonArmPose: 'hug_wrap',
        torsoLeanTowardPartner: 1.0,
        torsoForwardPitch: -0.16,
        headTurnWeight: 0.88,
        headYawMultiplier: 0.72,
        headPitchTarget: -0.12,
        headRollTarget: 0.26, // cheek tucked affectionately against shoulder
        contactPullX: 1.0,
        contactForwardZ: 0.42,
        contactHeightOffset: 0,
        cameraTargetYOffset: 0.96,
        cameraTargetXBias: 0,
        hugArmsStrength: 1.0,
        reachArmStrength: 0,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 0.95,
        lipPucker: 0,
        blushBoost: 0.72,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.92,
      };
    case 'cuddle':
      return {
        effectType: 'cozy_cuddle',
        armPoseStyle: 'hug_both',
        firstPersonArmPose: 'hug_wrap',
        torsoLeanTowardPartner: 0.9,
        torsoForwardPitch: 0.04,
        headTurnWeight: 0.62,
        headYawMultiplier: 0.42,
        headPitchTarget: -0.06,
        headRollTarget: 0.42, // deep cozy shoulder rest
        contactPullX: 0.88,
        contactForwardZ: 0.3,
        contactHeightOffset: -0.03,
        cameraTargetYOffset: 0.97,
        cameraTargetXBias: 0,
        hugArmsStrength: 0.72,
        reachArmStrength: 0.15,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 0.85,
        lipPucker: 0,
        blushBoost: 0.6,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.82,
      };
    case 'hold_hands':
      return {
        effectType: 'hand_clasp',
        armPoseStyle: 'hand_hold',
        firstPersonArmPose: 'hold_hand',
        torsoLeanTowardPartner: 0.52,
        torsoForwardPitch: -0.02,
        headTurnWeight: 0.5,
        headYawMultiplier: 0.55,
        headPitchTarget: -0.08,
        headRollTarget: 0.08,
        contactPullX: 0.44,
        contactForwardZ: 0.24,
        contactHeightOffset: 0,
        cameraTargetYOffset: 0.78, // glance down briefly toward clasped hands on armrest
        cameraTargetXBias: -0.06,
        hugArmsStrength: 0.1,
        reachArmStrength: 0.88,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 0.25,
        lipPucker: 0,
        blushBoost: 0.5,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.78,
      };
    case 'whisper_ily':
      return {
        effectType: 'whisper_wave',
        armPoseStyle: 'cup_mouth_whisper',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.86,
        torsoForwardPitch: -0.08,
        headTurnWeight: 0.92,
        headYawMultiplier: 0.96,
        headPitchTarget: 0.03,
        headRollTarget: 0.14,
        contactPullX: 0.84,
        contactForwardZ: 0.34,
        contactHeightOffset: 0.03,
        cameraTargetYOffset: 1.03,
        cameraTargetXBias: 0.09, // leaning close beside ear
        hugArmsStrength: 0.1,
        reachArmStrength: 0.8,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 0.35,
        lipPucker: 0.2,
        blushBoost: 0.65,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.88,
      };
    case 'playful_beat':
      return {
        effectType: 'bonk_stars',
        armPoseStyle: 'bonk_strike',
        firstPersonArmPose: 'playful_bonk',
        torsoLeanTowardPartner: 0.74,
        torsoForwardPitch: -0.1,
        headTurnWeight: 0.85,
        headYawMultiplier: 0.82,
        headPitchTarget: 0.08,
        headRollTarget: -0.14, // cheeky mock-shock tilt
        contactPullX: 0.64,
        contactForwardZ: 0.34,
        contactHeightOffset: 0.02,
        cameraTargetYOffset: 1.02,
        cameraTargetXBias: 0,
        hugArmsStrength: 0,
        reachArmStrength: 0.98,
        beatPulse: 1.0,
        tickleWiggle: 0.35,
        waveMotion: 0,
        eyeCloseAmount: 0.1,
        lipPucker: 0,
        blushBoost: 0.4,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.86,
      };
    case 'pinch_cheek':
      return {
        effectType: 'cheek_pinch',
        armPoseStyle: 'pinch_reach',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.72,
        torsoForwardPitch: -0.06,
        headTurnWeight: 0.86,
        headYawMultiplier: 0.84,
        headPitchTarget: 0.04,
        headRollTarget: 0.18,
        contactPullX: 0.68,
        contactForwardZ: 0.32,
        contactHeightOffset: 0.01,
        cameraTargetYOffset: 1.02,
        cameraTargetXBias: 0.04,
        hugArmsStrength: 0,
        reachArmStrength: 0.95,
        beatPulse: 0,
        tickleWiggle: 0.45,
        waveMotion: 0,
        eyeCloseAmount: 0.45,
        lipPucker: 0,
        blushBoost: 1.0,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.86,
      };
    case 'tickle':
      return {
        effectType: 'tickle_sparks',
        armPoseStyle: 'tickle_flutter',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.78,
        torsoForwardPitch: -0.08,
        headTurnWeight: 0.78,
        headYawMultiplier: 0.74,
        headPitchTarget: 0.1,
        headRollTarget: -0.18,
        contactPullX: 0.72,
        contactForwardZ: 0.34,
        contactHeightOffset: 0.02,
        cameraTargetYOffset: 0.98,
        cameraTargetXBias: 0,
        hugArmsStrength: 0.25,
        reachArmStrength: 0.92,
        beatPulse: 0,
        tickleWiggle: 1.0,
        waveMotion: 0,
        eyeCloseAmount: 0.3,
        lipPucker: 0,
        blushBoost: 0.75,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.86,
      };
    case 'headpat':
      return {
        effectType: 'headpat_halo',
        armPoseStyle: 'pat_receive',
        firstPersonArmPose: 'headpat',
        torsoLeanTowardPartner: 0.68,
        torsoForwardPitch: -0.04,
        headTurnWeight: 0.75,
        headYawMultiplier: 0.65,
        headPitchTarget: -0.08,
        headRollTarget: 0.15,
        contactPullX: 0.62,
        contactForwardZ: 0.3,
        contactHeightOffset: -0.03,
        cameraTargetYOffset: 1.08, // slightly above crown for pat arc
        cameraTargetXBias: 0,
        hugArmsStrength: 0,
        reachArmStrength: 0.96,
        beatPulse: 0,
        tickleWiggle: 0.25,
        waveMotion: 0,
        eyeCloseAmount: 0.8,
        lipPucker: 0,
        blushBoost: 0.85,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.84,
      };
    case 'give_rose':
      return {
        effectType: 'rose_petals',
        armPoseStyle: 'offer_rose',
        firstPersonArmPose: 'give_rose',
        torsoLeanTowardPartner: 0.62,
        torsoForwardPitch: -0.07,
        headTurnWeight: 0.78,
        headYawMultiplier: 0.76,
        headPitchTarget: 0.02,
        headRollTarget: 0.12,
        contactPullX: 0.52,
        contactForwardZ: 0.34,
        contactHeightOffset: 0,
        cameraTargetYOffset: 0.94,
        cameraTargetXBias: 0,
        hugArmsStrength: 0,
        reachArmStrength: 0.95,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 0,
        eyeCloseAmount: 0.2,
        lipPucker: 0,
        blushBoost: 0.7,
        showRoseProp: true,
        showGiftProp: false,
        cameraGlanceWeight: 0.84,
      };
    case 'surprise_gift':
      return {
        effectType: 'gift_box',
        armPoseStyle: 'offer_gift',
        firstPersonArmPose: 'give_gift',
        torsoLeanTowardPartner: 0.58,
        torsoForwardPitch: -0.06,
        headTurnWeight: 0.72,
        headYawMultiplier: 0.72,
        headPitchTarget: 0.05,
        headRollTarget: -0.1,
        contactPullX: 0.48,
        contactForwardZ: 0.34,
        contactHeightOffset: 0,
        cameraTargetYOffset: 0.92,
        cameraTargetXBias: 0,
        hugArmsStrength: 0,
        reachArmStrength: 0.9,
        beatPulse: 0,
        tickleWiggle: 0.15,
        waveMotion: 0,
        eyeCloseAmount: 0,
        lipPucker: 0,
        blushBoost: 0.6,
        showRoseProp: false,
        showGiftProp: true,
        cameraGlanceWeight: 0.84,
      };
    case 'popcorn':
      return {
        effectType: 'popcorn_toss',
        armPoseStyle: 'scoop_popcorn',
        firstPersonArmPose: 'popcorn',
        torsoLeanTowardPartner: 0.46,
        torsoForwardPitch: -0.05,
        headTurnWeight: 0.62,
        headYawMultiplier: 0.62,
        headPitchTarget: 0.02,
        headRollTarget: 0.06,
        contactPullX: 0.36,
        contactForwardZ: 0.28,
        contactHeightOffset: 0,
        cameraTargetYOffset: 0.88,
        cameraTargetXBias: 0,
        hugArmsStrength: 0,
        reachArmStrength: 0.78,
        beatPulse: 0,
        tickleWiggle: 0.1,
        waveMotion: 0,
        eyeCloseAmount: 0,
        lipPucker: 0,
        blushBoost: 0.2,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.78,
      };
    case 'wave':
      return {
        effectType: 'wave_sparkles',
        armPoseStyle: 'wave_hi',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.32,
        torsoForwardPitch: 0,
        headTurnWeight: 0.7,
        headYawMultiplier: 0.72,
        headPitchTarget: 0.06,
        headRollTarget: 0.14,
        contactPullX: 0.2,
        contactForwardZ: 0.24,
        contactHeightOffset: 0,
        cameraTargetYOffset: 1.04,
        cameraTargetXBias: 0,
        hugArmsStrength: 0,
        reachArmStrength: 0,
        beatPulse: 0,
        tickleWiggle: 0,
        waveMotion: 1.0,
        eyeCloseAmount: 0,
        lipPucker: 0,
        blushBoost: 0.3,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.78,
      };
    case 'heart_explosion':
      return {
        effectType: 'heart_burst',
        armPoseStyle: 'hug_both',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.54,
        torsoForwardPitch: -0.05,
        headTurnWeight: 0.68,
        headYawMultiplier: 0.68,
        headPitchTarget: 0.08,
        headRollTarget: 0.12,
        contactPullX: 0.42,
        contactForwardZ: 0.28,
        contactHeightOffset: 0.02,
        cameraTargetYOffset: 1.02,
        cameraTargetXBias: 0,
        hugArmsStrength: 0.35,
        reachArmStrength: 0.45,
        beatPulse: 0,
        tickleWiggle: 0.2,
        waveMotion: 0,
        eyeCloseAmount: 0.3,
        lipPucker: 0.2,
        blushBoost: 0.8,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.78,
      };
    case 'sparkles':
      return {
        effectType: 'starlight',
        armPoseStyle: 'wave_hi',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.38,
        torsoForwardPitch: 0,
        headTurnWeight: 0.58,
        headYawMultiplier: 0.6,
        headPitchTarget: 0.07,
        headRollTarget: -0.1,
        contactPullX: 0.26,
        contactForwardZ: 0.24,
        contactHeightOffset: 0.01,
        cameraTargetYOffset: 1.03,
        cameraTargetXBias: 0,
        hugArmsStrength: 0.1,
        reachArmStrength: 0.35,
        beatPulse: 0,
        tickleWiggle: 0.1,
        waveMotion: 0.55,
        eyeCloseAmount: 0,
        lipPucker: 0,
        blushBoost: 0.4,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.74,
      };
    case 'heart':
    default:
      return {
        effectType: 'heart_glow',
        armPoseStyle: 'hand_hold',
        firstPersonArmPose: 'none',
        torsoLeanTowardPartner: 0.44,
        torsoForwardPitch: -0.02,
        headTurnWeight: 0.62,
        headYawMultiplier: 0.62,
        headPitchTarget: 0.04,
        headRollTarget: 0.1,
        contactPullX: 0.3,
        contactForwardZ: 0.24,
        contactHeightOffset: 0,
        cameraTargetYOffset: 1.0,
        cameraTargetXBias: 0,
        hugArmsStrength: 0.18,
        reachArmStrength: 0.3,
        beatPulse: 0,
        tickleWiggle: 0.12,
        waveMotion: 0,
        eyeCloseAmount: 0.25,
        lipPucker: 0.15,
        blushBoost: 0.6,
        showRoseProp: false,
        showGiftProp: false,
        cameraGlanceWeight: 0.74,
      };
  }
}
