import * as THREE from 'three';
import type { CoupleInteractionKind } from '../types/cinema';
import {
  resolveInteractionChoreography,
  type FirstPersonArmPose,
} from '../utils/coupleInteractions';

export interface RealisticHumanRig {
  root: THREE.Group;
  torsoPivot: THREE.Group;
  neckPivot: THREE.Group;
  headGroup: THREE.Group;
  eyelidL: THREE.Mesh;
  eyelidR: THREE.Mesh;
  lipsMesh: THREE.Mesh;
  blushMat: THREE.MeshStandardMaterial;
  armLPivot: THREE.Group;
  armRPivot: THREE.Group;
  forearmLPivot: THREE.Group;
  forearmRPivot: THREE.Group;
  roseProp: THREE.Group;
  giftProp: THREE.Group;
  dispose: () => void;
}

export interface FirstPersonCoupleArms {
  root: THREE.Group;
  armLPivot: THREE.Group;
  armRPivot: THREE.Group;
  forearmLPivot: THREE.Group;
  forearmRPivot: THREE.Group;
  roseProp: THREE.Group;
  giftProp: THREE.Group;
  dispose: () => void;
}

/**
 * Builds an articulated, realistically proportioned seated human character rig (`host` or `gf`)
 * grounded at y = 0 (seat row floor level), with sculpted cranium, jawline, nose, eyes,
 * closing eyelids, dynamic puckering lips, styled layered hair, tailored cinema attire,
 * seated legs/knees, expressive articulated arms, rose prop, and gift box prop.
 */
export function createRealisticHumanRig(role: 'host' | 'bf' | 'gf'): RealisticHumanRig {
  const isGf = role === 'gf';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0xe7b99e : 0xdba88b,
      roughness: 0.52,
      metalness: 0.02,
      envMapIntensity: 0.16,
    })
  );
  const blushMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0xd98a82 : 0xc98a76,
      roughness: 0.58,
      metalness: 0.01,
      envMapIntensity: 0.14,
    })
  );
  const lipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0xc85576 : 0xa5625c,
      roughness: 0.34,
      metalness: 0.04,
      envMapIntensity: 0.22,
    })
  );
  const scleraMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4f1ee,
      roughness: 0.25,
      envMapIntensity: 0.2,
    })
  );
  const irisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0x2f1d14 : 0x241610,
      roughness: 0.18,
      envMapIntensity: 0.3,
    })
  );
  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0x261614 : 0x161214,
      roughness: isGf ? 0.62 : 0.68,
      metalness: 0.03,
      envMapIntensity: 0.14,
    })
  );
  const outfitMainMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0x6b2152 : 0x1e1938,
      roughness: 0.78,
      metalness: 0.05,
      envMapIntensity: 0.14,
    })
  );
  const outfitInnerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0x9d4479 : 0x3b2f68,
      roughness: 0.72,
      metalness: 0.04,
      envMapIntensity: 0.14,
    })
  );
  const trousersMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0x1a1529 : 0x111222,
      roughness: 0.85,
      metalness: 0.04,
      envMapIntensity: 0.1,
    })
  );
  const shoeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x15141c,
      roughness: 0.45,
      metalness: 0.12,
      envMapIntensity: 0.18,
    })
  );
  const goldAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf0c975,
      roughness: 0.24,
      metalness: 0.85,
      envMapIntensity: 0.4,
    })
  );

  const root = new THREE.Group();
  const scaleMod = isGf ? 0.94 : 1.0;

  // ── 1. Seated Pelvis, Thighs, Knees & Lower Legs resting flush on auditorium floor ──
  const pelvis = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.165 * scaleMod, 16, 12)), trousersMat);
  pelvis.scale.set(1.18, 0.72, 1.0);
  pelvis.position.set(0, 0.35, 0.02);
  root.add(pelvis);

  const thighGeo = trackGeo(new THREE.CapsuleGeometry(0.078 * scaleMod, 0.28, 8, 12));
  const shinGeo = trackGeo(new THREE.CapsuleGeometry(0.058 * scaleMod, 0.26, 8, 12));
  const shoeGeo = trackGeo(new THREE.BoxGeometry(0.105 * scaleMod, 0.065, 0.21));

  [-1, 1].forEach((side) => {
    const legX = side * (isGf ? 0.095 : 0.115);
    const thigh = new THREE.Mesh(thighGeo, trousersMat);
    thigh.rotation.x = Math.PI / 2 - 0.1;
    thigh.rotation.z = side * (isGf ? -0.02 : 0.04);
    thigh.position.set(legX, 0.37, -0.17);
    root.add(thigh);

    const shin = new THREE.Mesh(shinGeo, trousersMat);
    shin.rotation.x = 0.08;
    shin.position.set(legX, 0.2, -0.36);
    root.add(shin);

    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(legX, 0.036, -0.42);
    root.add(shoe);
  });

  // ── 2. Articulated Torso Pivot ──
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.39, 0.05);
  root.add(torsoPivot);

  const waist = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(isGf ? 0.13 : 0.155, isGf ? 0.125 : 0.145, 0.22, 16)),
    outfitMainMat
  );
  waist.scale.set(1.15, 1, 0.78);
  waist.position.set(0, 0.11, 0);
  torsoPivot.add(waist);

  const chest = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(isGf ? 0.148 : 0.185, isGf ? 0.128 : 0.155, 0.28, 18)),
    outfitMainMat
  );
  chest.scale.set(1.22, 1, 0.8);
  chest.position.set(0, 0.32, 0.01);
  chest.castShadow = true;
  torsoPivot.add(chest);

  const innerChest = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.11 * scaleMod, 0.1 * scaleMod, 0.12, 14)),
    outfitInnerMat
  );
  innerChest.position.set(0, 0.43, -0.035);
  torsoPivot.add(innerChest);

  const shoulderBridge = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(isGf ? 0.072 : 0.085, isGf ? 0.24 : 0.31, 8, 12)),
    outfitMainMat
  );
  shoulderBridge.rotation.z = Math.PI / 2;
  shoulderBridge.position.set(0, 0.435, 0.01);
  torsoPivot.add(shoulderBridge);

  if (isGf) {
    const pendant = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.016, 0)), goldAccentMat);
    pendant.position.set(0, 0.43, -0.115);
    torsoPivot.add(pendant);
  }

  // ── 3. Articulated Neck & Sculpted Head ──
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.49, -0.01);
  torsoPivot.add(neckPivot);

  const neck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.05 * scaleMod, 0.058 * scaleMod, 0.12, 14)),
    skinMat
  );
  neck.position.set(0, 0.05, 0);
  neckPivot.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.17, -0.015);
  neckPivot.add(headGroup);

  const cranium = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.116 * scaleMod, 22, 18)), skinMat);
  cranium.scale.set(0.92, 1.08, 1.02);
  cranium.position.set(0, 0.025, 0.005);
  cranium.castShadow = true;
  headGroup.add(cranium);

  const jaw = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.086 * scaleMod, 18, 14)), skinMat);
  jaw.scale.set(0.84, 0.96, 0.95);
  jaw.position.set(0, -0.032, -0.02);
  headGroup.add(jaw);

  const nose = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.017 * scaleMod, 0.044 * scaleMod, 8)), skinMat);
  nose.rotation.x = -Math.PI / 2 + 0.25;
  nose.position.set(0, -0.002, -0.118 * scaleMod);
  headGroup.add(nose);

  const lipsMesh = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.01 * scaleMod, 0.028 * scaleMod, 6, 10)),
    lipMat
  );
  lipsMesh.rotation.z = Math.PI / 2;
  lipsMesh.position.set(0, -0.048 * scaleMod, -0.102 * scaleMod);
  headGroup.add(lipsMesh);

  const eyeWhiteGeo = trackGeo(new THREE.SphereGeometry(0.016 * scaleMod, 10, 10));
  const irisGeo = trackGeo(new THREE.SphereGeometry(0.0095 * scaleMod, 8, 8));
  const eyelidGeo = trackGeo(new THREE.SphereGeometry(0.0175 * scaleMod, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
  const browGeo = trackGeo(new THREE.BoxGeometry(0.034 * scaleMod, 0.007, 0.012));
  const earGeo = trackGeo(new THREE.SphereGeometry(0.022 * scaleMod, 10, 10));
  const cheekGeo = trackGeo(new THREE.SphereGeometry(0.024 * scaleMod, 10, 10));

  const eyelids: THREE.Mesh[] = [];
  [-1, 1].forEach((side) => {
    const eyeWhite = new THREE.Mesh(eyeWhiteGeo, scleraMat);
    eyeWhite.scale.set(1.1, 0.78, 0.6);
    eyeWhite.position.set(side * 0.038 * scaleMod, 0.02 * scaleMod, -0.101 * scaleMod);
    headGroup.add(eyeWhite);

    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(side * 0.038 * scaleMod, 0.02 * scaleMod, -0.109 * scaleMod);
    headGroup.add(iris);

    const eyelid = new THREE.Mesh(eyelidGeo, skinMat);
    eyelid.scale.set(1.12, 0.92, 0.75);
    eyelid.position.set(side * 0.038 * scaleMod, 0.022 * scaleMod, -0.101 * scaleMod);
    eyelid.rotation.x = -0.55; // open position; slides forward to +0.55 when closed
    headGroup.add(eyelid);
    eyelids.push(eyelid);

    const brow = new THREE.Mesh(browGeo, hairMat);
    brow.position.set(side * 0.038 * scaleMod, 0.042 * scaleMod, -0.103 * scaleMod);
    brow.rotation.z = side * -0.08;
    headGroup.add(brow);

    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.scale.set(0.45, 1.15, 0.7);
    ear.position.set(side * 0.106 * scaleMod, 0.005, 0.01);
    headGroup.add(ear);

    if (isGf) {
      const cheek = new THREE.Mesh(cheekGeo, blushMat);
      cheek.scale.set(1.1, 0.7, 0.4);
      cheek.position.set(side * 0.055 * scaleMod, -0.015 * scaleMod, -0.088 * scaleMod);
      headGroup.add(cheek);
    }
  });

  // ── 4. Styled Hair ──
  const crown = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.121 * scaleMod, 20, 16)), hairMat);
  crown.scale.set(0.95, 1.02, 1.03);
  crown.position.set(0, 0.034, 0.015);
  headGroup.add(crown);

  if (isGf) {
    const backHair = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.118, 18, 16)), hairMat);
    backHair.scale.set(1.04, 1.85, 0.56);
    backHair.position.set(0, -0.085, 0.048);
    backHair.rotation.x = 0.12;
    headGroup.add(backHair);

    const lockGeo = trackGeo(new THREE.CapsuleGeometry(0.025, 0.19, 8, 12));
    [-1, 1].forEach((side) => {
      const sideLock = new THREE.Mesh(lockGeo, hairMat);
      sideLock.scale.set(0.9, 1, 0.72);
      sideLock.position.set(side * 0.09, -0.075, 0.018);
      sideLock.rotation.z = side * 0.12;
      sideLock.rotation.x = 0.04;
      headGroup.add(sideLock);
    });
  } else {
    const quiff = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.085, 14, 12)), hairMat);
    quiff.scale.set(1.15, 0.65, 1.05);
    quiff.position.set(0.01, 0.105, -0.035);
    quiff.rotation.x = -0.22;
    headGroup.add(quiff);

    const backTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.175, 0.12, 0.09)), hairMat);
    backTrim.position.set(0, -0.01, 0.082);
    headGroup.add(backTrim);
  }

  // ── 5. Articulated Upper Arms, Forearms & Hands ──
  const armLPivot = new THREE.Group();
  armLPivot.position.set(-(isGf ? 0.172 : 0.212), 0.42, 0.01);
  torsoPivot.add(armLPivot);

  const armRPivot = new THREE.Group();
  armRPivot.position.set(isGf ? 0.172 : 0.212, 0.42, 0.01);
  torsoPivot.add(armRPivot);

  const upperArmGeo = trackGeo(new THREE.CapsuleGeometry(0.043 * scaleMod, 0.21, 8, 12));
  const forearmGeo = trackGeo(new THREE.CapsuleGeometry(0.034 * scaleMod, 0.19, 8, 12));
  const handGeo = trackGeo(new THREE.SphereGeometry(0.032 * scaleMod, 12, 10));

  const buildArmBranch = (shoulderPivot: THREE.Group) => {
    const upper = new THREE.Mesh(upperArmGeo, outfitMainMat);
    upper.position.set(0, -0.125, 0);
    shoulderPivot.add(upper);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, -0.25, 0);
    shoulderPivot.add(forearmPivot);

    const fore = new THREE.Mesh(forearmGeo, skinMat);
    fore.position.set(0, -0.115, 0);
    forearmPivot.add(fore);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.scale.set(0.75, 1.05, 0.52);
    hand.position.set(0, -0.235, -0.008);
    forearmPivot.add(hand);

    return forearmPivot;
  };

  const forearmLPivot = buildArmBranch(armLPivot);
  const forearmRPivot = buildArmBranch(armRPivot);

  // Midnight Rose prop
  const roseProp = new THREE.Group();
  const stem = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 6)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.7 }))
  );
  stem.position.set(0, 0.13, 0);
  const bloom = new THREE.Mesh(
    trackGeo(new THREE.DodecahedronGeometry(0.042, 0)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xe11d48, emissive: 0x9f1239, emissiveIntensity: 0.45, roughness: 0.38 }))
  );
  bloom.position.set(0, 0.265, 0);
  roseProp.add(stem, bloom);
  roseProp.position.set(0, -0.25, -0.04);
  roseProp.rotation.x = -0.95;
  roseProp.visible = false;
  forearmRPivot.add(roseProp);

  // Velvet Gift Box prop for `surprise_gift`
  const giftProp = new THREE.Group();
  const boxMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.11, 0.085, 0.11)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xdb2777, roughness: 0.4, metalness: 0.15 }))
  );
  const ribbonA = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.116, 0.09, 0.022)),
    goldAccentMat
  );
  const ribbonB = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.022, 0.09, 0.116)),
    goldAccentMat
  );
  giftProp.add(boxMesh, ribbonA, ribbonB);
  giftProp.position.set(0, -0.25, -0.06);
  giftProp.visible = false;
  forearmRPivot.add(giftProp);

  return {
    root,
    torsoPivot,
    neckPivot,
    headGroup,
    eyelidL: eyelids[0],
    eyelidR: eyelids[1],
    lipsMesh,
    blushMat,
    armLPivot,
    armRPivot,
    forearmLPivot,
    forearmRPivot,
    roseProp,
    giftProp,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

const _baseBlushColor = new THREE.Color(0xd98a82);
const _warmBlushColor = new THREE.Color(0xf4728c);

/**
 * Animates a seated human rig smoothly (zero heap allocations):
 * drives individual pose choreography for all 19 reactions (lip kiss, cheek kiss,
 * forehead kiss, neck kiss, warm hug, cuddle, hold hands, whisper, playful beat,
 * pinch cheek, tickle, headpat, rose, gift, popcorn, hearts, sparkles, wave).
 */
export function updateHumanRigAnimation(
  rig: RealisticHumanRig,
  activeKind: CoupleInteractionKind | null,
  interactionProgress: number,
  partnerDirX: number,
  dt: number,
  elapsed: number
): void {
  const damp = (curr: number, target: number, speed = 8) => THREE.MathUtils.damp(curr, target, speed, dt);

  const envelope =
    activeKind && interactionProgress > 0 && interactionProgress < 1
      ? Math.sin(Math.pow(interactionProgress, 0.8) * Math.PI)
      : 0;

  const choreo = activeKind && envelope > 0.01 ? resolveInteractionChoreography(activeKind) : null;
  const sideSign = partnerDirX !== 0 ? Math.sign(partnerDirX) : 1;

  const idleBreath = Math.sin(elapsed * 1.9) * 0.012;
  const idleHeadSway = Math.sin(elapsed * 0.7) * 0.025;

  let targetTorsoRoll = -sideSign * 0.06;
  let targetTorsoPitch = 0.04 + idleBreath;
  let targetHeadYaw = -sideSign * 0.08 + idleHeadSway;
  let targetHeadPitch = 0.04;
  let targetHeadRoll = 0;

  let armLRoll = -0.06;
  let armRRoll = 0.06;
  let armLPitch = 0.18;
  let armRPitch = 0.18;
  let armLYaw = 0.14;
  let armRYaw = -0.14;
  let forearmLPitch = 0.68;
  let forearmRPitch = 0.68;

  let targetEyeClose = 0;
  let targetLipPucker = 0;
  let targetBlush = 0;

  if (choreo) {
    targetTorsoRoll = -sideSign * (0.06 + choreo.torsoLeanTowardPartner * 0.24 * envelope);
    targetTorsoPitch += choreo.torsoForwardPitch * envelope;

    const bonkOsc =
      choreo.beatPulse > 0
        ? Math.sin(interactionProgress * Math.PI * 4.5) * choreo.beatPulse * envelope
        : 0;
    const tickleOsc =
      choreo.tickleWiggle > 0
        ? Math.sin(interactionProgress * Math.PI * 9.0) * 0.11 * choreo.tickleWiggle * envelope
        : 0;

    targetTorsoRoll += tickleOsc;
    // Three.js +Y rotation turns -Z forward toward -X, so negate sideSign to face the partner
    targetHeadYaw = -sideSign * (0.08 + choreo.headYawMultiplier * envelope) + tickleOsc * 0.55;
    targetHeadPitch = choreo.headPitchTarget * envelope + Math.abs(bonkOsc) * 0.14;
    targetHeadRoll = sideSign * choreo.headRollTarget * envelope;

    // Gentle joyful nod on headpat
    if (choreo.armPoseStyle === 'pat_receive') {
      targetHeadPitch += Math.sin(interactionProgress * Math.PI * 5.0) * 0.08 * envelope;
    }

    targetEyeClose = choreo.eyeCloseAmount * envelope;
    targetLipPucker = choreo.lipPucker * envelope;
    targetBlush = choreo.blushBoost * envelope;

    const p = envelope;
    switch (choreo.armPoseStyle) {
      case 'hug_both': {
        armLPitch = THREE.MathUtils.lerp(armLPitch, 0.92, p);
        armRPitch = THREE.MathUtils.lerp(armRPitch, 0.92, p);
        armLRoll = THREE.MathUtils.lerp(armLRoll, 0.34, p);
        armRRoll = THREE.MathUtils.lerp(armRRoll, -0.34, p);
        armLYaw = THREE.MathUtils.lerp(armLYaw, 0.68, p);
        armRYaw = THREE.MathUtils.lerp(armRYaw, -0.68, p);
        forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 1.18, p);
        forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 1.18, p);
        break;
      }
      case 'cradle_face':
      case 'cheek_touch': {
        // Partner-facing arm lifts tenderly to cradle cheek/jaw while opposite rests gently
        if (sideSign < 0) {
          armLPitch = THREE.MathUtils.lerp(armLPitch, 1.05, p);
          armLRoll = THREE.MathUtils.lerp(armLRoll, -0.25, p);
          armLYaw = THREE.MathUtils.lerp(armLYaw, -0.45, p);
          forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 1.15, p);
        } else {
          armRPitch = THREE.MathUtils.lerp(armRPitch, 1.05, p);
          armRRoll = THREE.MathUtils.lerp(armRRoll, 0.25, p);
          armRYaw = THREE.MathUtils.lerp(armRYaw, 0.45, p);
          forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 1.15, p);
        }
        break;
      }
      case 'cup_mouth_whisper': {
        if (sideSign < 0) {
          armLPitch = THREE.MathUtils.lerp(armLPitch, 1.15, p);
          armLRoll = THREE.MathUtils.lerp(armLRoll, 0.25, p);
          forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 1.45, p);
        } else {
          armRPitch = THREE.MathUtils.lerp(armRPitch, 1.15, p);
          armRRoll = THREE.MathUtils.lerp(armRRoll, -0.25, p);
          forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 1.45, p);
        }
        break;
      }
      case 'bonk_strike': {
        const swing = bonkOsc * 0.72;
        if (sideSign < 0) {
          armLPitch = THREE.MathUtils.lerp(armLPitch, 1.12 + swing, p);
          armLRoll = THREE.MathUtils.lerp(armLRoll, -0.48, p);
          forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 0.85 - Math.abs(swing) * 0.45, p);
        } else {
          armRPitch = THREE.MathUtils.lerp(armRPitch, 1.12 + swing, p);
          armRRoll = THREE.MathUtils.lerp(armRRoll, 0.48, p);
          forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 0.85 - Math.abs(swing) * 0.45, p);
        }
        break;
      }
      case 'pinch_reach': {
        const wiggle = Math.sin(elapsed * 14) * 0.08 * p;
        if (sideSign < 0) {
          armLPitch = THREE.MathUtils.lerp(armLPitch, 0.98, p);
          armLRoll = THREE.MathUtils.lerp(armLRoll, -0.4 + wiggle, p);
          armLYaw = THREE.MathUtils.lerp(armLYaw, -0.4, p);
          forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 0.65, p);
        } else {
          armRPitch = THREE.MathUtils.lerp(armRPitch, 0.98, p);
          armRRoll = THREE.MathUtils.lerp(armRRoll, 0.4 + wiggle, p);
          armRYaw = THREE.MathUtils.lerp(armRYaw, 0.4, p);
          forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 0.65, p);
        }
        break;
      }
      case 'tickle_flutter': {
        const flutterA = Math.sin(elapsed * 22) * 0.22 * p;
        const flutterB = -flutterA;
        armLPitch = THREE.MathUtils.lerp(armLPitch, 0.88 + flutterA, p);
        armRPitch = THREE.MathUtils.lerp(armRPitch, 0.88 + flutterB, p);
        armLRoll = THREE.MathUtils.lerp(armLRoll, -0.25, p);
        armRRoll = THREE.MathUtils.lerp(armRRoll, 0.25, p);
        forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 0.9 + flutterB, p);
        forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 0.9 + flutterA, p);
        break;
      }
      case 'pat_receive': {
        const pat = Math.sin(elapsed * 9) * 0.16 * p;
        if (sideSign < 0) {
          armLPitch = THREE.MathUtils.lerp(armLPitch, 1.32 + pat, p);
          armLRoll = THREE.MathUtils.lerp(armLRoll, -0.28, p);
          forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 0.72, p);
        } else {
          armRPitch = THREE.MathUtils.lerp(armRPitch, 1.32 + pat, p);
          armRRoll = THREE.MathUtils.lerp(armRRoll, 0.28, p);
          forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 0.72, p);
        }
        break;
      }
      case 'offer_rose':
      case 'offer_gift': {
        armRPitch = THREE.MathUtils.lerp(armRPitch, 0.98, p);
        armRRoll = THREE.MathUtils.lerp(armRRoll, sideSign > 0 ? 0.32 : -0.18, p);
        armRYaw = THREE.MathUtils.lerp(armRYaw, sideSign * 0.42, p);
        forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 0.58, p);
        break;
      }
      case 'scoop_popcorn': {
        const toss = Math.max(0, Math.sin(interactionProgress * Math.PI * 2.5)) * 0.25 * p;
        armLPitch = THREE.MathUtils.lerp(armLPitch, 0.78 + toss, p);
        armLRoll = THREE.MathUtils.lerp(armLRoll, -0.35, p);
        forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 0.95, p);
        break;
      }
      case 'hand_hold': {
        if (sideSign < 0) {
          armLPitch = THREE.MathUtils.lerp(armLPitch, 0.42, p);
          armLRoll = THREE.MathUtils.lerp(armLRoll, -0.45, p);
          forearmLPitch = THREE.MathUtils.lerp(forearmLPitch, 0.6, p);
        } else {
          armRPitch = THREE.MathUtils.lerp(armRPitch, 0.42, p);
          armRRoll = THREE.MathUtils.lerp(armRRoll, 0.45, p);
          forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 0.6, p);
        }
        break;
      }
      case 'wave_hi': {
        const w = (choreo.waveMotion || 0.7) * p;
        const waveOsc = Math.sin(elapsed * 10) * 0.28;
        armRPitch = THREE.MathUtils.lerp(armRPitch, 1.72, w);
        armRRoll = THREE.MathUtils.lerp(armRRoll, 0.42 + waveOsc, w);
        forearmRPitch = THREE.MathUtils.lerp(forearmRPitch, 0.72, w);
        break;
      }
      case 'rest':
      default:
        break;
    }

    rig.roseProp.visible = choreo.showRoseProp && envelope > 0.08;
    rig.giftProp.visible = choreo.showGiftProp && envelope > 0.08;
  } else {
    rig.roseProp.visible = false;
    rig.giftProp.visible = false;
  }

  rig.torsoPivot.rotation.z = damp(rig.torsoPivot.rotation.z, targetTorsoRoll, 9);
  rig.torsoPivot.rotation.x = damp(rig.torsoPivot.rotation.x, targetTorsoPitch, 9);
  rig.neckPivot.rotation.y = damp(rig.neckPivot.rotation.y, targetHeadYaw, 10);
  rig.headGroup.rotation.x = damp(rig.headGroup.rotation.x, targetHeadPitch, 10);
  rig.headGroup.rotation.z = damp(rig.headGroup.rotation.z, targetHeadRoll, 10);

  const eyeRot = damp(rig.eyelidL.rotation.x, THREE.MathUtils.lerp(-0.55, 0.55, targetEyeClose), 12);
  rig.eyelidL.rotation.x = eyeRot;
  rig.eyelidR.rotation.x = eyeRot;

  const lipScale = damp(rig.lipsMesh.scale.z, 1 + targetLipPucker * 0.65, 12);
  rig.lipsMesh.scale.set(1 - targetLipPucker * 0.14, 1 + targetLipPucker * 0.22, lipScale);
  rig.blushMat.color.lerpColors(_baseBlushColor, _warmBlushColor, targetBlush);

  rig.armLPivot.rotation.x = damp(rig.armLPivot.rotation.x, armLPitch, 11);
  rig.armLPivot.rotation.y = damp(rig.armLPivot.rotation.y, armLYaw, 11);
  rig.armLPivot.rotation.z = damp(rig.armLPivot.rotation.z, armLRoll, 11);
  rig.armRPivot.rotation.x = damp(rig.armRPivot.rotation.x, armRPitch, 11);
  rig.armRPivot.rotation.y = damp(rig.armRPivot.rotation.y, armRYaw, 11);
  rig.armRPivot.rotation.z = damp(rig.armRPivot.rotation.z, armRRoll, 11);

  rig.forearmLPivot.rotation.x = damp(rig.forearmLPivot.rotation.x, forearmLPitch, 12);
  rig.forearmRPivot.rotation.x = damp(rig.forearmRPivot.rotation.x, forearmRPitch, 12);
}

/**
 * First-person embodied arms visible in peripheral lower view ONLY during active tactile
 * interactions (Warm Hug wrap, Gentle Cheek Caress, Hold Hands, Playful Bonk, Headpat, Rose/Gift),
 * so hugs & touches feel real and physical without blocking normal film viewing.
 */
export function createFirstPersonCoupleArms(role: 'host' | 'bf' | 'gf'): FirstPersonCoupleArms {
  const isGf = role === 'gf';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const sleeveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0x6b2152 : 0x1e1938,
      roughness: 0.78,
      metalness: 0.05,
    })
  );
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGf ? 0xe7b99e : 0xdba88b,
      roughness: 0.52,
      metalness: 0.02,
    })
  );

  const root = new THREE.Group();
  root.visible = false;

  const armLPivot = new THREE.Group();
  armLPivot.position.set(-0.34, 0.9, -0.06);
  const armRPivot = new THREE.Group();
  armRPivot.position.set(0.34, 0.9, -0.06);
  root.add(armLPivot, armRPivot);

  const sleeveGeo = trackGeo(new THREE.CapsuleGeometry(0.044, 0.22, 6, 10));
  const forearmGeo = trackGeo(new THREE.CapsuleGeometry(0.032, 0.2, 6, 10));
  const handGeo = trackGeo(new THREE.SphereGeometry(0.03, 10, 8));

  const buildBranch = (pivot: THREE.Group) => {
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(0, -0.04, -0.14);
    pivot.add(sleeve);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, -0.04, -0.26);
    pivot.add(forearmPivot);

    const fore = new THREE.Mesh(forearmGeo, skinMat);
    fore.rotation.x = Math.PI / 2;
    fore.position.set(0, 0, -0.12);
    forearmPivot.add(fore);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.scale.set(0.82, 0.52, 1.15);
    hand.position.set(0, 0, -0.24);
    forearmPivot.add(hand);

    return forearmPivot;
  };

  const forearmLPivot = buildBranch(armLPivot);
  const forearmRPivot = buildBranch(armRPivot);

  const roseProp = new THREE.Group();
  const fpStem = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.7 }))
  );
  fpStem.position.set(0, 0.11, 0);
  const fpBloom = new THREE.Mesh(
    trackGeo(new THREE.DodecahedronGeometry(0.042, 0)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xe11d48, emissive: 0x9f1239, emissiveIntensity: 0.5 }))
  );
  fpBloom.position.set(0, 0.22, 0);
  roseProp.add(fpStem, fpBloom);
  roseProp.position.set(0, 0.02, -0.25);
  roseProp.rotation.x = -0.35;
  roseProp.visible = false;
  forearmRPivot.add(roseProp);

  const giftProp = new THREE.Group();
  const gBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.11, 0.08, 0.11)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xdb2777, roughness: 0.4 }))
  );
  const gRibbon = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.116, 0.085, 0.022)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xf0c975, roughness: 0.25, metalness: 0.8 }))
  );
  giftProp.add(gBox, gRibbon);
  giftProp.position.set(0, 0.02, -0.26);
  giftProp.visible = false;
  forearmRPivot.add(giftProp);

  return {
    root,
    armLPivot,
    armRPivot,
    forearmLPivot,
    forearmRPivot,
    roseProp,
    giftProp,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export function updateFirstPersonCoupleArms(
  fp: FirstPersonCoupleArms,
  _pose: FirstPersonArmPose | null,
  _partnerDirX: number,
  _envelope: number,
  _interactionProgress: number,
  _dt: number
): void {
  // Keep foreground lens clean & free of disembodied sleeve geometry; full partner rig carries poses & props cleanly
  fp.root.visible = false;
  fp.roseProp.visible = false;
  fp.giftProp.visible = false;
}
