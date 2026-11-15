import * as THREE from 'three';

export interface CinemaMaterialSet {
  velvet: THREE.MeshPhysicalMaterial;
  velvetDark: THREE.MeshStandardMaterial;
  walnut: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  glowViolet: THREE.MeshStandardMaterial;
  glowRose: THREE.MeshStandardMaterial;
  obsidian: THREE.MeshStandardMaterial;
}

export function createCinemaMaterialSet(velvetBump: THREE.Texture): CinemaMaterialSet {
  return {
    velvet: new THREE.MeshPhysicalMaterial({
      color: 0x28144a,
      roughness: 0.88,
      metalness: 0.04,
      sheen: 0.72,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color(0x8b5cf6),
      bumpMap: velvetBump,
      bumpScale: 0.03,
    }),
    velvetDark: new THREE.MeshStandardMaterial({
      color: 0x180c2e,
      roughness: 0.9,
      metalness: 0.04,
      bumpMap: velvetBump,
      bumpScale: 0.025,
    }),
    walnut: new THREE.MeshStandardMaterial({
      color: 0x231618,
      roughness: 0.42,
      metalness: 0.12,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xd4af6a,
      roughness: 0.22,
      metalness: 0.88,
    }),
    glowViolet: new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      emissive: 0x8b5cf6,
      emissiveIntensity: 1.8,
      roughness: 0.25,
    }),
    glowRose: new THREE.MeshStandardMaterial({
      color: 0xf472b6,
      emissive: 0xf472b6,
      emissiveIntensity: 1.6,
      roughness: 0.25,
    }),
    obsidian: new THREE.MeshStandardMaterial({
      color: 0x100e1c,
      roughness: 0.35,
      metalness: 0.35,
    }),
  };
}

/**
 * Composite luxury purple velvet reclining loveseat (bottom-center pivot at y=0).
 */
export function createVelvetLoveseatGroup(mats: CinemaMaterialSet, withGlowTrim = true): THREE.Group {
  const group = new THREE.Group();

  // 1. Brushed pedestal plinth
  const baseGeo = new THREE.BoxGeometry(2.4, 0.14, 1.12);
  const base = new THREE.Mesh(baseGeo, mats.obsidian);
  base.position.set(0, 0.07, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2. Dual seat cushions
  const cushionGeo = new THREE.BoxGeometry(1.06, 0.28, 1.0);
  const cushionL = new THREE.Mesh(cushionGeo, mats.velvet);
  cushionL.position.set(-0.56, 0.28, 0.04);
  const cushionR = new THREE.Mesh(cushionGeo, mats.velvet);
  cushionR.position.set(0.56, 0.28, 0.04);
  cushionL.castShadow = true;
  cushionR.castShadow = true;
  group.add(cushionL, cushionR);

  // 3. Dual contoured theatre backrests (distinct left/right seat silhouettes)
  const backGeo = new THREE.BoxGeometry(1.02, 0.84, 0.24);
  const backL = new THREE.Mesh(backGeo, mats.velvet);
  backL.position.set(-0.56, 0.78, 0.44);
  backL.rotation.x = 0.16;
  backL.castShadow = true;
  const backR = new THREE.Mesh(backGeo, mats.velvet);
  backR.position.set(0.56, 0.78, 0.44);
  backR.rotation.x = 0.16;
  backR.castShadow = true;
  group.add(backL, backR);

  // 4. Sculpted curved headrests
  const headGeo = new THREE.BoxGeometry(0.84, 0.22, 0.18);
  const headL = new THREE.Mesh(headGeo, mats.velvetDark);
  headL.position.set(-0.56, 1.24, 0.49);
  headL.rotation.x = 0.12;
  const headR = new THREE.Mesh(headGeo, mats.velvetDark);
  headR.position.set(0.56, 1.24, 0.49);
  headR.rotation.x = 0.12;
  group.add(headL, headR);

  // 5. Left & right sculpted armrests with walnut tray tops
  const armGeo = new THREE.BoxGeometry(0.24, 0.56, 1.12);
  const armL = new THREE.Mesh(armGeo, mats.velvetDark);
  armL.position.set(-1.24, 0.44, 0.04);
  const armR = new THREE.Mesh(armGeo, mats.velvetDark);
  armR.position.set(1.24, 0.44, 0.04);
  group.add(armL, armR);

  const trayGeo = new THREE.BoxGeometry(0.26, 0.04, 0.72);
  const trayL = new THREE.Mesh(trayGeo, mats.walnut);
  trayL.position.set(-1.24, 0.74, -0.02);
  const trayR = new THREE.Mesh(trayGeo, mats.walnut);
  trayR.position.set(1.24, 0.74, -0.02);
  group.add(trayL, trayR);

  // 6. Brass cupholders
  const cupGeo = new THREE.CylinderGeometry(0.06, 0.055, 0.05, 16);
  const cupL = new THREE.Mesh(cupGeo, mats.brass);
  cupL.position.set(-1.24, 0.76, -0.26);
  const cupR = new THREE.Mesh(cupGeo, mats.brass);
  cupR.position.set(1.24, 0.76, -0.26);
  group.add(cupL, cupR);

  // 7. Recessed violet under-glow strip
  if (withGlowTrim) {
    const stripGeo = new THREE.BoxGeometry(2.36, 0.03, 0.04);
    const strip = new THREE.Mesh(stripGeo, mats.glowViolet);
    strip.position.set(0, 0.03, -0.57);
    group.add(strip);
  }

  return group;
}

/**
 * Composite 5-part curved reception counter for the 3D Cinema Lobby.
 */
export function createReceptionCounter(mats: CinemaMaterialSet): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.14, 1.5), mats.obsidian);
  plinth.position.set(0, 0.07, 0);

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.96, 1.3), mats.velvetDark);
  body.position.set(0, 0.62, 0);
  body.castShadow = true;
  body.receiveShadow = true;

  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.08, 1.55), mats.walnut);
  counterTop.position.set(0, 1.14, 0);
  counterTop.castShadow = true;

  const brassTrim = new THREE.Mesh(new THREE.BoxGeometry(4.72, 0.03, 0.04), mats.brass);
  brassTrim.position.set(0, 1.07, 0.68);

  const neonCove = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.04, 0.04), mats.glowViolet);
  neonCove.position.set(0, 0.16, 0.67);

  group.add(plinth, body, counterTop, brassTrim, neonCove);
  return group;
}

/**
 * Generates an illuminated 3D marquee / portal sign texture using CanvasTexture.
 */
export function createPortalCanvasTexture(
  title: string,
  subtitle: string,
  accentColor: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 640);
  grad.addColorStop(0, '#18122b');
  grad.addColorStop(0.6, '#0d0b1a');
  grad.addColorStop(1, '#1d1436');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 640);

  // Outer brass/accent border
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, 472, 600);

  // Subtle decorative glow circle
  const rad = ctx.createRadialGradient(256, 260, 10, 256, 260, 170);
  rad.addColorStop(0, accentColor + '66');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(40, 60, 432, 400);

  ctx.fillStyle = '#f8f7ff';
  ctx.font = 'bold 42px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 300);

  ctx.fillStyle = '#c4b5fd';
  ctx.font = '24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(subtitle, 256, 360);

  ctx.fillStyle = accentColor;
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.fillText('ENTER DESTINATION →', 256, 540);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface AuditoriumSeatInstances {
  group: THREE.Group;
  updateCoupleSeats: (hostSeatId: string, guestSeatId: string) => void;
  setMotionSeatOffset: (seatId: string, yDelta: number, rollZ: number) => void;
  dispose: () => void;
}

const _seatColorDefault = new THREE.Color(0x1e1138);
const _seatColorVip = new THREE.Color(0x28174b);
const _seatColorHost = new THREE.Color(0x6d28d9);
const _seatColorGuest = new THREE.Color(0xdb2777);
const _armDefault = new THREE.Color(0x130b24);
const _armHost = new THREE.Color(0x4c1d95);
const _armGuest = new THREE.Color(0x9d174d);
const _instDummy = new THREE.Object3D();

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const radius = Math.min(r, hw, hh);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + radius, -hh);
  shape.lineTo(hw - radius, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + radius);
  shape.lineTo(hw, hh - radius);
  shape.quadraticCurveTo(hw, hh, hw - radius, hh);
  shape.lineTo(-hw + radius, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - radius);
  shape.lineTo(-hw, -hh + radius);
  shape.quadraticCurveTo(-hw, -hh, -hw + radius, -hh);
  return shape;
}

/**
 * Builds all auditorium cinema seats as GPU-efficient InstancedMeshes (9 draw calls total for 72 seats),
 * using contoured beveled ExtrudeGeometry cushions, lumbar backrests, headrests, and armrests grounded flush on row risers.
 */
export function createAuditoriumInstancedSeats(
  mats: CinemaMaterialSet,
  seats: ReadonlyArray<{ id: string; section: string; position: [number, number, number] }>
): AuditoriumSeatInstances {
  const count = seats.length;
  const group = new THREE.Group();

  const plinthGeo = new THREE.BoxGeometry(1.1, 0.11, 0.9);

  // Contoured plush seat cushion (horizontal bolster extruded vertically)
  const cushionGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(0.9, 0.78, 0.14), {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
  });
  cushionGeo.center();
  cushionGeo.rotateX(Math.PI / 2);

  // Contoured ergonomic lumbar backrest
  const backGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(0.88, 0.54, 0.16), {
    depth: 0.13,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
  backGeo.center();

  // Plush rounded headrest pillow
  const headGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(0.68, 0.17, 0.065), {
    depth: 0.11,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  headGeo.center();

  // Sculpted armrest profile (side-extruded curved arm)
  const armShape = new THREE.Shape();
  armShape.moveTo(-0.42, -0.2);
  armShape.lineTo(0.42, -0.2);
  armShape.lineTo(0.42, 0.18);
  armShape.quadraticCurveTo(0.4, 0.23, 0.3, 0.23);
  armShape.lineTo(-0.34, 0.2);
  armShape.quadraticCurveTo(-0.44, 0.18, -0.42, 0.06);
  armShape.closePath();

  const armGeo = new THREE.ExtrudeGeometry(armShape, {
    depth: 0.13,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.015,
    bevelThickness: 0.015,
  });
  armGeo.center();
  armGeo.rotateY(Math.PI / 2);

  const walnutCapGeo = new THREE.BoxGeometry(0.16, 0.026, 0.62);
  const cupGeo = new THREE.CylinderGeometry(0.044, 0.038, 0.042, 12);

  // Neutral white base materials with restrained envMapIntensity so setColorAt renders rich midnight theatre velvet
  const cushionMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.04,
    envMapIntensity: 0.15,
    sheen: 0.62,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0x8b5cf6),
    bumpMap: mats.velvet.bumpMap,
    bumpScale: 0.03,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.04,
    envMapIntensity: 0.14,
    bumpMap: mats.velvet.bumpMap,
    bumpScale: 0.025,
  });

  const plinthInst = new THREE.InstancedMesh(plinthGeo, mats.obsidian, count);
  const cushionInst = new THREE.InstancedMesh(cushionGeo, cushionMat, count);
  const backInst = new THREE.InstancedMesh(backGeo, cushionMat, count);
  const headInst = new THREE.InstancedMesh(headGeo, headMat, count);
  const armLInst = new THREE.InstancedMesh(armGeo, headMat, count);
  const armRInst = new THREE.InstancedMesh(armGeo, headMat, count);
  const capLInst = new THREE.InstancedMesh(walnutCapGeo, mats.walnut, count);
  const capRInst = new THREE.InstancedMesh(walnutCapGeo, mats.walnut, count);
  const cupInst = new THREE.InstancedMesh(cupGeo, mats.brass, count);

  const allInsts = [
    plinthInst,
    cushionInst,
    backInst,
    headInst,
    armLInst,
    armRInst,
    capLInst,
    capRInst,
    cupInst,
  ];
  for (const inst of allInsts) {
    inst.receiveShadow = true;
    inst.castShadow = true;
  }

  const writeSeatMatrices = (i: number, x: number, y: number, z: number, rollZ = 0) => {
    const placePart = (
      inst: THREE.InstancedMesh,
      ox: number,
      oy: number,
      oz: number,
      rx = 0
    ) => {
      _instDummy.position.set(x + ox, y + oy, z + oz);
      _instDummy.rotation.set(rx, 0, rollZ);
      _instDummy.scale.set(1, 1, 1);
      _instDummy.updateMatrix();
      inst.setMatrixAt(i, _instDummy.matrix);
    };

    placePart(plinthInst, 0, 0.055, 0);
    placePart(cushionInst, 0, 0.22, -0.02);
    placePart(backInst, 0, 0.58, 0.34, 0.17);
    placePart(headInst, 0, 0.92, 0.4, 0.1);
    placePart(armLInst, -0.53, 0.36, 0.02);
    placePart(armRInst, 0.53, 0.36, 0.02);
    placePart(capLInst, -0.53, 0.595, -0.03);
    placePart(capRInst, 0.53, 0.595, -0.03);
    placePart(cupInst, 0.53, 0.62, -0.24);
  };

  seats.forEach((s, i) => {
    writeSeatMatrices(i, s.position[0], s.position[1], s.position[2], 0);
    const baseCol = s.section === 'center' ? _seatColorVip : _seatColorDefault;
    cushionInst.setColorAt(i, baseCol);
    backInst.setColorAt(i, baseCol);
    headInst.setColorAt(i, _armDefault);
    armLInst.setColorAt(i, _armDefault);
    armRInst.setColorAt(i, _armDefault);
  });

  for (const inst of allInsts) {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }

  const indexMap = new Map<string, number>(seats.map((s, idx) => [s.id, idx]));
  let activeHostIdx = -1;
  let activeGuestIdx = -1;

  const updateCoupleSeats = (hostSeatId: string, guestSeatId: string) => {
    const nextHostIdx = indexMap.get(hostSeatId) ?? -1;
    const nextGuestIdx = indexMap.get(guestSeatId) ?? -1;

    const resetIdx = (idx: number) => {
      if (idx < 0 || idx >= count) return;
      const baseCol = seats[idx].section === 'center' ? _seatColorVip : _seatColorDefault;
      cushionInst.setColorAt(idx, baseCol);
      backInst.setColorAt(idx, baseCol);
      headInst.setColorAt(idx, _armDefault);
      armLInst.setColorAt(idx, _armDefault);
      armRInst.setColorAt(idx, _armDefault);
    };

    if (activeHostIdx !== nextHostIdx) resetIdx(activeHostIdx);
    if (activeGuestIdx !== nextGuestIdx) resetIdx(activeGuestIdx);

    if (nextHostIdx >= 0) {
      cushionInst.setColorAt(nextHostIdx, _seatColorHost);
      backInst.setColorAt(nextHostIdx, _seatColorHost);
      headInst.setColorAt(nextHostIdx, _armHost);
      armLInst.setColorAt(nextHostIdx, _armHost);
      armRInst.setColorAt(nextHostIdx, _armHost);
    }
    if (nextGuestIdx >= 0) {
      cushionInst.setColorAt(nextGuestIdx, _seatColorGuest);
      backInst.setColorAt(nextGuestIdx, _seatColorGuest);
      headInst.setColorAt(nextGuestIdx, _armGuest);
      armLInst.setColorAt(nextGuestIdx, _armGuest);
      armRInst.setColorAt(nextGuestIdx, _armGuest);
    }

    activeHostIdx = nextHostIdx;
    activeGuestIdx = nextGuestIdx;

    for (const inst of [cushionInst, backInst, headInst, armLInst, armRInst]) {
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  };

  const setMotionSeatOffset = (seatId: string, yDelta: number, rollZ: number) => {
    const idx = indexMap.get(seatId);
    if (idx === undefined) return;
    const s = seats[idx];
    writeSeatMatrices(idx, s.position[0], s.position[1] + yDelta, s.position[2], rollZ);
    for (const inst of allInsts) {
      inst.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = () => {
    plinthGeo.dispose();
    cushionGeo.dispose();
    backGeo.dispose();
    headGeo.dispose();
    armGeo.dispose();
    walnutCapGeo.dispose();
    cupGeo.dispose();
    cushionMat.dispose();
    headMat.dispose();
    for (const inst of allInsts) {
      inst.dispose();
    }
  };

  return { group, updateCoupleSeats, setMotionSeatOffset, dispose };
}

