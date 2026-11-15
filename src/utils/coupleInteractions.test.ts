import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUPLE_INTERACTION_OPTIONS,
  resolveInteractionChoreography,
} from './coupleInteractions';
import type { CoupleInteractionKind } from '../types/cinema';

test('COUPLE_INTERACTION_OPTIONS covers all kisses, hug, playful beat, and moments with distinct badge titles', () => {
  const kinds = new Set(COUPLE_INTERACTION_OPTIONS.map((o) => o.kind));
  const badgeTitles = new Set(COUPLE_INTERACTION_OPTIONS.map((o) => o.badgeTitle));
  const required: CoupleInteractionKind[] = [
    'kiss_lips',
    'kiss_forehead',
    'kiss_cheek',
    'kiss_neck',
    'hug',
    'playful_beat',
    'cuddle',
    'hold_hands',
    'headpat',
    'pinch_cheek',
    'tickle',
    'give_rose',
    'whisper_ily',
    'popcorn',
    'heart',
    'surprise_gift',
  ];
  for (const kind of required) {
    assert.ok(kinds.has(kind), `Missing interaction option: ${kind}`);
  }
  // Every option has its own distinct badge title
  assert.equal(badgeTitles.size, COUPLE_INTERACTION_OPTIONS.length);
  for (const opt of COUPLE_INTERACTION_OPTIONS) {
    assert.ok(opt.label.length >= 2);
    assert.ok(opt.durationMs >= 1500 && opt.durationMs <= 3200);
  }
});

test('resolveInteractionChoreography produces distinct anatomical poses and bounded values for every reaction', () => {
  const effectTypes = new Set<string>();
  for (const opt of COUPLE_INTERACTION_OPTIONS) {
    const pose = resolveInteractionChoreography(opt.kind);
    effectTypes.add(pose.effectType);
    assert.ok(pose.torsoLeanTowardPartner >= 0 && pose.torsoLeanTowardPartner <= 1);
    assert.ok(pose.headTurnWeight >= 0 && pose.headTurnWeight <= 1);
    assert.ok(pose.cameraGlanceWeight >= 0 && pose.cameraGlanceWeight <= 0.96);
    assert.ok(Number.isFinite(pose.torsoForwardPitch) && Number.isFinite(pose.headPitchTarget));
  }

  // Every reaction has a unique 3D effect type
  assert.equal(effectTypes.size, COUPLE_INTERACTION_OPTIONS.length);

  // Specific anatomical distinctions across kisses, hug, gift, rose, beat
  const lipKiss = resolveInteractionChoreography('kiss_lips');
  const cheekKiss = resolveInteractionChoreography('kiss_cheek');
  const foreheadKiss = resolveInteractionChoreography('kiss_forehead');
  const neckKiss = resolveInteractionChoreography('kiss_neck');
  const hug = resolveInteractionChoreography('hug');

  assert.ok(lipKiss.lipPucker > 0.8 && lipKiss.eyeCloseAmount > 0.8);
  assert.ok(cheekKiss.cameraTargetXBias > 0 && cheekKiss.headRollTarget > lipKiss.headRollTarget);
  assert.ok(foreheadKiss.headPitchTarget < 0 && foreheadKiss.cameraTargetYOffset > lipKiss.cameraTargetYOffset);
  assert.ok(neckKiss.headYawMultiplier < 0 && neckKiss.cameraTargetYOffset < lipKiss.cameraTargetYOffset);
  assert.ok(hug.hugArmsStrength > 0.9 && hug.firstPersonArmPose === 'hug_wrap');
  assert.equal(resolveInteractionChoreography('give_rose').showRoseProp, true);
  assert.equal(resolveInteractionChoreography('surprise_gift').showGiftProp, true);
  assert.ok(resolveInteractionChoreography('playful_beat').beatPulse > 0.8);
});
