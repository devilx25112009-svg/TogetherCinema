import * as THREE from 'three';
import type { InteractionEffectType } from '../utils/coupleInteractions';

export interface CoupleInteractionEffects {
  group: THREE.Group;
  dispose: () => void;
}

interface PooledParticle {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  seed: number;
}

function createHeartGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.035);
  s.bezierCurveTo(0, 0.06, -0.045, 0.065, -0.045, 0.025);
  s.bezierCurveTo(-0.045, -0.005, -0.012, -0.03, 0, -0.052);
  s.bezierCurveTo(0.012, -0.03, 0.045, -0.005, 0.045, 0.025);
  s.bezierCurveTo(0.045, 0.065, 0, 0.06, 0, 0.035);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

export function createCoupleInteractionEffects(scene: THREE.Scene): CoupleInteractionEffects {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const heartGeo = createHeartGeometry();
  const starGeo = new THREE.OctahedronGeometry(0.034, 0);
  const orbGeo = new THREE.SphereGeometry(0.026, 10, 8);
  const ringGeo = new THREE.TorusGeometry(0.24, 0.012, 8, 32);

  const hearts: PooledParticle[] = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf472b6,
      emissive: 0xdb2777,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(heartGeo, mat);
    mesh.visible = false;
    group.add(mesh);
    hearts.push({ mesh, mat, seed: i * 1.17 + 0.3 });
  }

  const bursts: PooledParticle[] = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.9,
      roughness: 0.22,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(starGeo, mat);
    mesh.visible = false;
    group.add(mesh);
    bursts.push({ mesh, mat, seed: i * 1.43 + 0.7 });
  }

  const orbs: PooledParticle[] = [];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.65,
      roughness: 0.35,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(orbGeo, mat);
    mesh.visible = false;
    group.add(mesh);
    orbs.push({ mesh, mat, seed: i * 0.91 + 0.5 });
  }

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf472b6,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const auraRing = new THREE.Mesh(ringGeo, ringMat);
  auraRing.visible = false;
  group.add(auraRing);

  return {
    group,
    dispose() {
      scene.remove(group);
      heartGeo.dispose();
      starGeo.dispose();
      orbGeo.dispose();
      ringGeo.dispose();
      hearts.forEach((h) => h.mat.dispose());
      bursts.forEach((b) => b.mat.dispose());
      orbs.forEach((o) => o.mat.dispose());
      ringMat.dispose();
    },
  };
}

export function updateCoupleInteractionEffects(
  fx: CoupleInteractionEffects & {
    _internals?: never;
  },
  effectType: InteractionEffectType | null,
  originX: number,
  originY: number,
  originZ: number,
  progress: number,
  envelope: number,
  elapsed: number
): void {
  const children = fx.group.children;
  if (!effectType || envelope <= 0.02) {
    fx.group.visible = false;
    return;
  }

  fx.group.visible = true;
  fx.group.position.set(originX, originY, originZ);

  // Child layout matches createCoupleInteractionEffects: 0..9 hearts, 10..19 bursts, 20..27 orbs, 28 auraRing
  const hideAll = () => {
    for (let i = 0; i < children.length; i++) {
      children[i].visible = false;
    }
  };
  hideAll();

  const auraRing = children[28] as THREE.Mesh;
  const auraMat = auraRing.material as THREE.MeshBasicMaterial;

  const showHearts = (count: number, hexColor: number, spreadX: number, riseHeight: number, baseScale: number) => {
    for (let i = 0; i < Math.min(count, 10); i++) {
      const m = children[i] as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial;
      m.visible = true;
      mat.color.setHex(hexColor);
      mat.emissive.setHex(hexColor);
      const phase = (progress * 1.35 + i * 0.13) % 1;
      const angle = i * 1.9 + elapsed * 1.5;
      m.position.set(
        Math.cos(angle) * spreadX * (0.3 + phase * 0.9),
        0.15 + phase * riseHeight,
        Math.sin(angle) * 0.14 - 0.12
      );
      m.rotation.y = elapsed * 2.1 + i;
      const s = baseScale * (0.7 + 0.5 * Math.sin(phase * Math.PI));
      m.scale.setScalar(s);
      mat.opacity = Math.min(0.95, envelope * Math.sin(phase * Math.PI) * 1.15);
    }
  };

  const showStars = (count: number, hexColor: number, radius: number, speed: number) => {
    for (let i = 0; i < Math.min(count, 10); i++) {
      const m = children[10 + i] as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial;
      m.visible = true;
      mat.color.setHex(hexColor);
      mat.emissive.setHex(hexColor);
      const a = (i / count) * Math.PI * 2 + elapsed * speed;
      const r = radius * (0.35 + progress * 0.85);
      m.position.set(Math.cos(a) * r, 0.28 + Math.sin(a * 2) * 0.16, -0.14 + Math.sin(a) * 0.12);
      m.rotation.set(elapsed * 4 + i, elapsed * 3, 0);
      m.scale.setScalar(0.8 + envelope * 0.65);
      mat.opacity = Math.min(0.95, envelope * 1.1);
    }
  };

  const showOrbs = (count: number, hexColor: number, scale: number, popSpeed: number) => {
    for (let i = 0; i < Math.min(count, 8); i++) {
      const m = children[20 + i] as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial;
      m.visible = true;
      mat.color.setHex(hexColor);
      mat.emissive.setHex(hexColor);
      const t = (progress * popSpeed + i * 0.17) % 1;
      const a = i * 2.3 + elapsed * 2.2;
      m.position.set(
        Math.cos(a) * (0.12 + t * 0.25),
        0.18 + Math.sin(t * Math.PI) * 0.48,
        -0.1 + Math.sin(a) * 0.16
      );
      m.scale.setScalar(scale * Math.sin(t * Math.PI));
      mat.opacity = Math.min(0.92, envelope * Math.sin(t * Math.PI) * 1.2);
    }
  };

  const showRing = (hexColor: number, yOff: number, tiltX: number, scale: number) => {
    auraRing.visible = true;
    auraMat.color.setHex(hexColor);
    auraMat.opacity = 0.62 * envelope;
    auraRing.position.set(0, yOff, -0.14);
    auraRing.rotation.set(tiltX, 0, elapsed * 0.8);
    auraRing.scale.setScalar(scale * (0.75 + 0.35 * envelope));
  };

  switch (effectType) {
    case 'lip_kiss':
      showHearts(6, 0xfb7185, 0.24, 0.55, 1.15);
      showRing(0xfb7185, 0.22, 0.15, 0.85);
      break;
    case 'cheek_kiss':
      showHearts(4, 0xf472b6, 0.28, 0.42, 0.95);
      showStars(4, 0xf9a8d4, 0.26, 2.5);
      break;
    case 'forehead_kiss':
      showHearts(3, 0xf9a8d4, 0.2, 0.45, 0.9);
      showRing(0xc4b5fd, 0.38, Math.PI / 2 - 0.15, 0.95);
      break;
    case 'neck_kiss':
      showHearts(5, 0xe879f9, 0.22, 0.48, 1.0);
      showOrbs(6, 0xf472b6, 0.85, 1.5);
      break;
    case 'warm_hug':
      showHearts(6, 0xc084fc, 0.36, 0.5, 1.05);
      showRing(0xf472b6, 0.12, Math.PI / 2, 1.55);
      break;
    case 'cozy_cuddle':
      showHearts(4, 0xa78bfa, 0.28, 0.36, 0.9);
      showRing(0xa78bfa, 0.16, Math.PI / 2, 1.35);
      break;
    case 'hand_clasp':
      showOrbs(5, 0xfbbf24, 0.9, 1.4);
      showRing(0xfbbf24, -0.05, Math.PI / 2, 0.65);
      break;
    case 'whisper_wave':
      showOrbs(6, 0xf472b6, 0.75, 1.8);
      showRing(0xc4b5fd, 0.24, 0, 0.75);
      break;
    case 'bonk_stars':
      showStars(8, 0xfbbf24, 0.38, 6.2);
      showRing(0xf59e0b, 0.25, 0.35, 1.05);
      break;
    case 'cheek_pinch':
      showStars(5, 0xfb923c, 0.25, 3.8);
      showOrbs(4, 0xfda4af, 0.85, 1.6);
      break;
    case 'tickle_sparks':
      showStars(7, 0x34d399, 0.34, 5.4);
      showOrbs(6, 0xfde047, 0.8, 2.2);
      break;
    case 'headpat_halo':
      showRing(0x93c5fd, 0.42, Math.PI / 2, 0.9);
      showStars(5, 0xbfdbfe, 0.28, 2.8);
      break;
    case 'rose_petals':
      showOrbs(8, 0xf43f5e, 1.15, 1.3);
      showHearts(4, 0xfb7185, 0.3, 0.55, 0.95);
      break;
    case 'popcorn_toss':
      showOrbs(8, 0xfde047, 1.3, 2.0);
      break;
    case 'heart_burst':
      showHearts(10, 0xec4899, 0.48, 0.75, 1.3);
      break;
    case 'gift_box':
      showStars(6, 0xfbbf24, 0.34, 3.0);
      showHearts(3, 0xf472b6, 0.26, 0.48, 0.95);
      break;
    case 'starlight':
    case 'wave_sparkles':
      showStars(7, 0xc4b5fd, 0.36, 3.4);
      break;
    case 'heart_glow':
    default:
      showHearts(5, 0xfb7185, 0.3, 0.58, 1.1);
      break;
  }
}
