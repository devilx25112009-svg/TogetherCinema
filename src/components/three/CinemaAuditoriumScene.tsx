import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type {
  CoupleReactionEvent,
  PartnerGenderRole,
  RoomParticipant,
  ScreenMode,
} from '../../types/cinema';
import { SCREEN_MODE_SPECS } from '../../utils/cinemaModes';
import {
  AISLE_X_POSITIONS,
  areSeatsAdjacent,
  AUDITORIUM_ROWS,
  AUDITORIUM_SEATS,
  computeSeatPovCamera,
  DEFAULT_GUEST_SEAT_ID,
  DEFAULT_HOST_SEAT_ID,
  resolveCoupleRoles,
  resolveCoupleSeats,
  type ViewerSeatRole,
} from '../../utils/seatMap';
import {
  COUPLE_INTERACTION_OPTIONS,
  resolveInteractionChoreography,
} from '../../utils/coupleInteractions';
import { createAuditoriumInstancedSeats, createCinemaMaterialSet } from '../../three/cinemaModels';
import {
  createFirstPersonCoupleArms,
  createRealisticHumanRig,
  updateFirstPersonCoupleArms,
  updateHumanRigAnimation,
} from '../../three/coupleAvatars';
import {
  createCoupleInteractionEffects,
  updateCoupleInteractionEffects,
} from '../../three/interactionEffects';
import {
  attachStudioEnvironment,
  createAcousticRibBumpTexture,
  createCinemaCarpetTexture,
  createCinemaRenderer,
  createMarbleTexture,
  createPacedLoop,
  createVelvetBumpTexture,
  detectSoftwareWebGL,
  isWebGLAvailable,
} from '../../three/rendererSetup';

interface CinemaAuditoriumSceneProps {
  videoEl: HTMLVideoElement | null;
  movieTitle: string;
  screenMode: ScreenMode;
  playing: boolean;
  participants: RoomParticipant[];
  activeReactions: CoupleReactionEvent[];
  isProceduralVideo: boolean;
  suppressScreenLabel?: boolean;
  currentTimeSeconds: number;
  recenterSignal?: number;
  hostSeatId?: string;
  guestSeatId?: string;
  hostPartnerRole?: PartnerGenderRole;
  guestPartnerRole?: PartnerGenderRole;
  viewerSeatRole?: ViewerSeatRole;
}

const _camPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _screenDir = new THREE.Vector3();
const _partnerDir = new THREE.Vector3();
const _partnerEyeTarget = new THREE.Vector3();
const _yawPitchQuat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _archDummy = new THREE.Object3D();

const INTERACTION_DURATION_MAP = new Map(
  COUPLE_INTERACTION_OPTIONS.map((o) => [o.kind, o.durationMs])
);

function createExitSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#07140f';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 84);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 48px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createScreenXWingMaterial(initialMap: THREE.Texture, side: -1 | 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: initialMap },
      uSide: { value: side },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uSide;
      varying vec2 vUv;

      void main() {
        // cornerDist = 0.0 at the front screen corner, 1.0 toward the rear auditorium wall
        float cornerDist = uSide < 0.0 ? (1.0 - vUv.x) : vUv.x;

        // Sample seamlessly from the outer edges inward [0.01..0.29] / [0.99..0.71], clear of centered titles
        float sampleX = uSide < 0.0
          ? (0.01 + cornerDist * 0.28)
          : (0.99 - cornerDist * 0.28);

        vec4 texel = texture2D(uMap, vec2(clamp(sampleX, 0.004, 0.996), vUv.y));

        // Subtle acoustic theatre wall ribs + vertical edge framing + gentle rear falloff
        float rib = 0.94 + 0.06 * sin(cornerDist * 140.0);
        float verticalMask = smoothstep(0.0, 0.025, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
        float depthFade = 1.0 - smoothstep(0.65, 1.0, cornerDist) * 0.34;
        float cornerBlend = 0.95 + 0.05 * smoothstep(0.0, 0.04, cornerDist);

        vec3 color = texel.rgb * 1.14 * rib * verticalMask * depthFade * cornerBlend;
        gl_FragColor = vec4(color, 0.98 * verticalMask);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export function CinemaAuditoriumScene({
  videoEl,
  movieTitle,
  screenMode,
  playing,
  participants,
  activeReactions,
  isProceduralVideo,
  suppressScreenLabel = false,
  currentTimeSeconds,
  recenterSignal = 0,
  hostSeatId = DEFAULT_HOST_SEAT_ID,
  guestSeatId = DEFAULT_GUEST_SEAT_ID,
  hostPartnerRole = 'bf',
  guestPartnerRole = 'gf',
  viewerSeatRole = 'host',
}: CinemaAuditoriumSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef(videoEl);
  const screenModeRef = useRef(screenMode);
  const playingRef = useRef(playing);
  const titleRef = useRef(movieTitle);
  const proceduralRef = useRef(isProceduralVideo);
  const suppressLabelRef = useRef(suppressScreenLabel);
  const timeRef = useRef(currentTimeSeconds);
  const reactionsRef = useRef(activeReactions);
  const participantsRef = useRef(participants);
  const hostSeatIdRef = useRef(hostSeatId);
  const guestSeatIdRef = useRef(guestSeatId);
  const hostPartnerRoleRef = useRef<PartnerGenderRole>(hostPartnerRole);
  const guestPartnerRoleRef = useRef<PartnerGenderRole>(guestPartnerRole);
  const viewerSeatRoleRef = useRef<ViewerSeatRole>(viewerSeatRole);
  const lookOffsetRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });

  const [webglSupported] = useState(() => isWebGLAvailable());

  useEffect(() => {
    videoRef.current = videoEl;
  }, [videoEl]);
  useEffect(() => {
    screenModeRef.current = screenMode;
  }, [screenMode]);
  useEffect(() => {
    lookOffsetRef.current = { yaw: 0, pitch: 0 };
  }, [recenterSignal, viewerSeatRole, hostSeatId, guestSeatId]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    titleRef.current = movieTitle;
  }, [movieTitle]);
  useEffect(() => {
    proceduralRef.current = isProceduralVideo;
  }, [isProceduralVideo]);
  useEffect(() => {
    suppressLabelRef.current = suppressScreenLabel;
  }, [suppressScreenLabel]);
  useEffect(() => {
    timeRef.current = currentTimeSeconds;
  }, [currentTimeSeconds]);
  useEffect(() => {
    reactionsRef.current = activeReactions;
  }, [activeReactions]);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);
  useEffect(() => {
    hostSeatIdRef.current = hostSeatId;
    guestSeatIdRef.current = guestSeatId;
  }, [hostSeatId, guestSeatId]);
  useEffect(() => {
    hostPartnerRoleRef.current = hostPartnerRole;
    guestPartnerRoleRef.current = guestPartnerRole;
  }, [hostPartnerRole, guestPartnerRole]);
  useEffect(() => {
    viewerSeatRoleRef.current = viewerSeatRole;
  }, [viewerSeatRole]);

  useEffect(() => {
    if (!webglSupported || !mountRef.current) return;
    const container = mountRef.current;
    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = createCinemaRenderer(container, isSoftwareGl);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06060c);
    scene.fog = new THREE.FogExp2(0x06060c, 0.015);
    const envTex = attachStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      68,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      150
    );
    const startPair = resolveCoupleSeats(hostSeatIdRef.current, guestSeatIdRef.current);
    const startSeat = viewerSeatRoleRef.current === 'guest' ? startPair.guestSeat : startPair.hostSeat;
    const startScreenSpec = SCREEN_MODE_SPECS[screenModeRef.current];
    const startPose = computeSeatPovCamera(
      startSeat,
      startScreenSpec.screenHeight3D,
      startScreenSpec.cameraFov,
      camera.aspect
    );
    camera.fov = startPose.fov;
    camera.updateProjectionMatrix();
    camera.position.set(startPose.eyePos[0], startPose.eyePos[1], startPose.eyePos[2]);
    camera.lookAt(startPose.lookAt[0], startPose.lookAt[1], startPose.lookAt[2]);

    const velvetBump = createVelvetBumpTexture();
    const ribBump = createAcousticRibBumpTexture();
    const marbleTex = createMarbleTexture(renderer.capabilities.getMaxAnisotropy());
    const carpetTex = createCinemaCarpetTexture(renderer.capabilities.getMaxAnisotropy());
    const mats = createCinemaMaterialSet(velvetBump);

    // Lighting
    const hemi = new THREE.HemisphereLight(0x83a9ff, 0x0b0816, 0.72);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xc4b5fd, 0.6);
    keyLight.position.set(0, 14, 16);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
    }
    scene.add(keyLight);

    const screenBounceLight = new THREE.PointLight(0x9167ff, 18, 45, 1.3);
    screenBounceLight.position.set(0, 6.8, -11);
    scene.add(screenBounceLight);

    const sideBounceL = new THREE.PointLight(0x8b5cf6, 0, 32, 1.4);
    sideBounceL.position.set(-14, 7, -1);
    const sideBounceR = new THREE.PointLight(0x8b5cf6, 0, 32, 1.4);
    sideBounceR.position.set(14, 7, -1);
    scene.add(sideBounceL, sideBounceR);

    const dolbyBlueLight = new THREE.PointLight(0x38bdf8, 0, 40, 1.5);
    dolbyBlueLight.position.set(0, 14, -4);
    scene.add(dolbyBlueLight);

    // Floor & Tiered Auditorium Deck (rich luxury woven multiplex carpet finish)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: carpetTex,
      roughness: 0.94,
      metalness: 0.02,
      envMapIntensity: 0.08,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(42, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0e0b1a,
      roughness: 0.82,
      bumpMap: ribBump,
      bumpScale: 0.07,
      envMapIntensity: 0.14,
    });
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 22, 44), wallMat);
    wallL.position.set(-18.5, 11, -2);
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 22, 44), wallMat);
    wallR.position.set(18.5, 11, -2);
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(38, 22, 0.6), wallMat);
    backWall.position.set(0, 11, 20);
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(38, 0.6, 44), mats.obsidian);
    ceiling.position.set(0, 21.5, -2);
    scene.add(wallL, wallR, backWall, ceiling);

    // Architectural Proscenium Stage Apron & Soft Amber Stage Footlights
    const stageApronGeo = new THREE.BoxGeometry(34, 0.42, 3.6);
    const stageApronMat = new THREE.MeshStandardMaterial({
      color: 0x100c1e,
      map: marbleTex,
      roughness: 0.52,
      metalness: 0.14,
      envMapIntensity: 0.16,
    });
    const stageApron = new THREE.Mesh(stageApronGeo, stageApronMat);
    stageApron.position.set(0, 0.21, -13.4);
    stageApron.receiveShadow = true;
    scene.add(stageApron);

    const stageFootStripGeo = new THREE.BoxGeometry(31.5, 0.035, 0.06);
    const stageFootStripMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      roughness: 0.3,
    });
    const stageFootStrip = new THREE.Mesh(stageFootStripGeo, stageFootStripMat);
    stageFootStrip.position.set(0, 0.42, -11.62);
    scene.add(stageFootStrip);

    // Acoustic wall cove lights
    const coveMatL = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      emissive: 0x8b5cf6,
      emissiveIntensity: 1.4,
    });
    const coveL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 34), coveMatL);
    coveL.position.set(-18.1, 15.5, -2);
    const coveR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 34), coveMatL);
    coveR.position.set(18.1, 15.5, -2);
    scene.add(coveL, coveR);

    // Fluted Side-Wall Architectural Acoustic Pilasters (InstancedMesh, 1 draw call)
    const pilasterGeo = new THREE.BoxGeometry(0.32, 16.5, 0.65);
    const pilasterMat = new THREE.MeshStandardMaterial({
      color: 0x17122a,
      roughness: 0.62,
      metalness: 0.18,
      envMapIntensity: 0.18,
    });
    const pilasterZ = [-10.5, -4.75, 1.0, 6.75, 12.5, 17.2];
    const pilasterInst = new THREE.InstancedMesh(pilasterGeo, pilasterMat, pilasterZ.length * 2);
    pilasterZ.forEach((zp, idx) => {
      _archDummy.position.set(-18.08, 8.25, zp);
      _archDummy.rotation.set(0, 0, 0);
      _archDummy.scale.set(1, 1, 1);
      _archDummy.updateMatrix();
      pilasterInst.setMatrixAt(idx * 2, _archDummy.matrix);

      _archDummy.position.set(18.08, 8.25, zp);
      _archDummy.updateMatrix();
      pilasterInst.setMatrixAt(idx * 2 + 1, _archDummy.matrix);
    });
    pilasterInst.instanceMatrix.needsUpdate = true;
    scene.add(pilasterInst);

    // Ceiling Acoustic Baffles & Recessed Warm Downlight Halos
    const baffleGeo = new THREE.BoxGeometry(31, 0.45, 0.55);
    const baffleZ = [-9, -3, 3, 9, 15];
    const baffleInst = new THREE.InstancedMesh(baffleGeo, pilasterMat, baffleZ.length);
    baffleZ.forEach((zp, idx) => {
      _archDummy.position.set(0, 20.9, zp);
      _archDummy.rotation.set(0, 0, 0);
      _archDummy.scale.set(1, 1, 1);
      _archDummy.updateMatrix();
      baffleInst.setMatrixAt(idx, _archDummy.matrix);
    });
    baffleInst.instanceMatrix.needsUpdate = true;
    scene.add(baffleInst);

    // Subtle Illuminated Auditorium Corner EXIT Signs (with real EXIT lettering)
    const exitTex = createExitSignTexture();
    const exitSignGeo = new THREE.BoxGeometry(0.92, 0.34, 0.08);
    const exitFrameMat = new THREE.MeshStandardMaterial({ color: 0x0b0a12, roughness: 0.4, metalness: 0.5 });
    const exitFaceMat = new THREE.MeshBasicMaterial({ map: exitTex });
    const exitL = new THREE.Mesh(exitSignGeo, [exitFrameMat, exitFrameMat, exitFrameMat, exitFrameMat, exitFaceMat, exitFrameMat]);
    exitL.position.set(-17.4, 3.2, -11.4);
    exitL.rotation.y = 0.25;
    const exitR = new THREE.Mesh(exitSignGeo, [exitFrameMat, exitFrameMat, exitFrameMat, exitFrameMat, exitFaceMat, exitFrameMat]);
    exitR.position.set(17.4, 3.2, -11.4);
    exitR.rotation.y = -0.25;
    scene.add(exitL, exitR);

    // 6-Tier Stadium Auditorium Risers (Rows A..F) + Continuous Warm Amber Step-Nosing + Aisle Lights
    const riserMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: carpetTex,
      roughness: 0.94,
      metalness: 0.02,
      envMapIntensity: 0.08,
    });
    const stepLightMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0xb45309,
      emissiveIntensity: 0.72,
    });
    const riserGeos: THREE.BufferGeometry[] = [];
    const nosingGeo = new THREE.BoxGeometry(29.8, 0.022, 0.04);
    AUDITORIUM_ROWS.forEach((rowSpec) => {
      if (rowSpec.riserHeight <= 0.04) return;
      const geo = new THREE.BoxGeometry(30, rowSpec.riserHeight, rowSpec.riserDepth);
      riserGeos.push(geo);
      const riserMesh = new THREE.Mesh(geo, riserMat);
      riserMesh.position.set(0, rowSpec.riserHeight / 2, rowSpec.z);
      riserMesh.receiveShadow = true;
      scene.add(riserMesh);

      const nosing = new THREE.Mesh(nosingGeo, stepLightMat);
      nosing.position.set(0, rowSpec.riserTopY + 0.008, rowSpec.z - rowSpec.riserDepth / 2 + 0.03);
      scene.add(nosing);
    });

    const stepGeo = new THREE.BoxGeometry(0.16, 0.03, 0.48);
    AISLE_X_POSITIONS.forEach((aisleX) => {
      AUDITORIUM_ROWS.forEach((rowSpec) => {
        const step = new THREE.Mesh(stepGeo, stepLightMat);
        step.position.set(aisleX, rowSpec.riserTopY + 0.015, rowSpec.z);
        scene.add(step);
      });
    });

    // Architectural side wall vertical sconces with obsidian mounting housing
    const sconceHousingGeo = new THREE.BoxGeometry(0.18, 3.8, 0.44);
    const sconceGeo = new THREE.BoxGeometry(0.1, 3.2, 0.2);
    const sconceMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.85,
      roughness: 0.35,
    });
    [-8, -1.5, 5, 11.5].forEach((zPos) => {
      const hL = new THREE.Mesh(sconceHousingGeo, exitFrameMat);
      hL.position.set(-18.18, 4.4, zPos);
      const sL = new THREE.Mesh(sconceGeo, sconceMat);
      sL.position.set(-18.08, 4.4, zPos);
      const hR = new THREE.Mesh(sconceHousingGeo, exitFrameMat);
      hR.position.set(18.18, 4.4, zPos);
      const sR = new THREE.Mesh(sconceGeo, sconceMat);
      sR.position.set(18.08, 4.4, zPos);
      scene.add(hL, sL, hR, sR);
    });

    // Soft warm intimacy fill light near the couple's seating area so facial features & hair read naturally
    const coupleFillLight = new THREE.PointLight(0xffd7c2, 2.2, 9, 1.5);
    coupleFillLight.position.set(0, 3.2, 2.2);
    scene.add(coupleFillLight);

    // Overhead Projection Booth Window & Soft Atmospheric Upper Light Beam
    const boothGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xc4b5fd })
    );
    boothGlass.position.set(0, 16.5, 19.65);
    boothGlass.rotation.y = Math.PI;
    scene.add(boothGlass);

    const projBeamGeo = new THREE.ConeGeometry(4.4, 24, 24, 1, true);
    projBeamGeo.translate(0, -12, 0);
    projBeamGeo.rotateX(Math.PI / 2 - 0.11);
    const projBeamMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x9167ff) },
        uOpacity: { value: 0.05 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float fade = pow(vUv.y, 1.8) * smoothstep(0.0, 0.35, vUv.y);
          gl_FragColor = vec4(uColor, uOpacity * fade);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const projBeamMesh = new THREE.Mesh(projBeamGeo, projBeamMat);
    projBeamMesh.position.set(0, 16.4, 19.3);
    scene.add(projBeamMesh);

    // 72 Instanced Luxury Velvet Theatre Seats across 6 Stadium Tiers (Rows A..F, Left/Center/Right)
    const auditoriumSeats = createAuditoriumInstancedSeats(mats, AUDITORIUM_SEATS);
    scene.add(auditoriumSeats.group);

    // Glowing Reserved Seat Floor Halo Rings for You (Violet) and Your GF (Rose)
    const seatHaloGeo = new THREE.RingGeometry(0.46, 0.62, 24);
    seatHaloGeo.rotateX(-Math.PI / 2);
    const hostHaloMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const guestHaloMat = new THREE.MeshBasicMaterial({
      color: 0xf472b6,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    const hostSeatHalo = new THREE.Mesh(seatHaloGeo, hostHaloMat);
    const guestSeatHalo = new THREE.Mesh(seatHaloGeo, guestHaloMat);
    scene.add(hostSeatHalo, guestSeatHalo);

    // Realistic Articulated Seated 3D Human Couple Rigs (BF/GF variants) + First-Person Arms + 3D Effects
    const hostRigBf = createRealisticHumanRig('bf');
    const hostRigGf = createRealisticHumanRig('gf');
    const partnerRigBf = createRealisticHumanRig('bf');
    const partnerRigGf = createRealisticHumanRig('gf');
    const fpHostArms = createFirstPersonCoupleArms('bf');
    const fpGuestArms = createFirstPersonCoupleArms('gf');
    const interactionFx = createCoupleInteractionEffects(scene);
    scene.add(
      hostRigBf.root,
      hostRigGf.root,
      partnerRigBf.root,
      partnerRigGf.root,
      fpHostArms.root,
      fpGuestArms.root
    );

    // Shared Popcorn Tub & Rose Cup resting on the armrest beside Host's seat
    const snackProps = new THREE.Group();
    const tubGeo = new THREE.CylinderGeometry(0.1, 0.075, 0.18, 14);
    const tubMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.45, envMapIntensity: 0.2 });
    const popcornMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.85, envMapIntensity: 0.2 });
    const popcornTub = new THREE.Mesh(tubGeo, tubMat);
    popcornTub.position.set(0.53, 0.71, -0.02);
    const popcornTop = new THREE.Mesh(new THREE.SphereGeometry(0.092, 10, 8), popcornMat);
    popcornTop.scale.set(1, 0.55, 1);
    popcornTop.position.set(0.53, 0.8, -0.02);
    const cupDrinkL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.036, 0.14, 12),
      new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.25, metalness: 0.2, envMapIntensity: 0.2 })
    );
    cupDrinkL.position.set(0.53, 0.7, -0.24);
    snackProps.add(popcornTub, popcornTop, cupDrinkL);
    scene.add(snackProps);

    // Initialize immediate seat placement before first draw so frame 1 already shows exact seats
    const initialPair = resolveCoupleSeats(hostSeatIdRef.current, guestSeatIdRef.current);
    const initialRoles = resolveCoupleRoles(hostPartnerRoleRef.current, guestPartnerRoleRef.current);
    let lastAppliedHostSeat = initialPair.hostSeat.id;
    let lastAppliedGuestSeat = initialPair.guestSeat.id;
    auditoriumSeats.updateCoupleSeats(initialPair.hostSeat.id, initialPair.guestSeat.id);
    hostRigBf.root.position.set(...initialPair.hostSeat.position);
    hostRigGf.root.position.set(...initialPair.hostSeat.position);
    partnerRigBf.root.position.set(...initialPair.guestSeat.position);
    partnerRigGf.root.position.set(...initialPair.guestSeat.position);
    hostHaloMat.color.setHex(initialRoles.hostPartnerRole === 'bf' ? 0x8b5cf6 : 0xf472b6);
    guestHaloMat.color.setHex(initialRoles.guestPartnerRole === 'bf' ? 0x8b5cf6 : 0xf472b6);
    snackProps.position.set(...initialPair.hostSeat.position);
    hostSeatHalo.position.set(
      initialPair.hostSeat.position[0],
      initialPair.hostSeat.position[1] + 0.025,
      initialPair.hostSeat.position[2]
    );
    guestSeatHalo.position.set(
      initialPair.guestSeat.position[0],
      initialPair.guestSeat.position[1] + 0.025,
      initialPair.guestSeat.position[2]
    );

    // Offscreen 8x4 ambient sampler canvas for real-time movie scene lighting bounce
    const ambCanvas = document.createElement('canvas');
    ambCanvas.width = 8;
    ambCanvas.height = 4;
    const ambCtx = ambCanvas.getContext('2d', { willReadFrequently: true });
    let lastAmbientSampleAt = 0;
    const targetBounceColor = new THREE.Color(0x9167ff);

    // Fallback/procedural cinema canvas texture when streamUrl is procedural://
    const procCanvas = document.createElement('canvas');
    procCanvas.width = 1280;
    procCanvas.height = 720;
    const pCtx = procCanvas.getContext('2d')!;
    const procTex = new THREE.CanvasTexture(procCanvas);
    procTex.colorSpace = THREE.SRGBColorSpace;

    let liveVideoTex: THREE.VideoTexture | null = null;
    let attachedVideo: HTMLVideoElement | null = null;

    // Massive Curved Main Cinema Screen + Stereoscopic 3D depth ghost layer + ScreenX left/right wings
    const screenGroup = new THREE.Group();
    scene.add(screenGroup);

    const createCurvedScreenGeo = (width: number, height: number, radius: number) => {
      const arcAngle = width / radius;
      const geo = new THREE.CylinderGeometry(
        radius,
        radius,
        height,
        40,
        1,
        true,
        Math.PI - arcAngle / 2,
        arcAngle
      );
      // Invert UVs horizontally so inner concave side reads left-to-right!
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, 1 - uv.getX(i));
      }
      uv.needsUpdate = true;
      return geo;
    };

    let currentSpecMode: ScreenMode = screenModeRef.current;
    const initialSpec = SCREEN_MODE_SPECS[currentSpecMode];
    const mainScreenMat = new THREE.MeshBasicMaterial({ map: procTex, side: THREE.BackSide });
    const mainScreenMesh = new THREE.Mesh(
      createCurvedScreenGeo(initialSpec.screenWidth3D, initialSpec.screenHeight3D, initialSpec.curveRadius3D),
      mainScreenMat
    );
    mainScreenMesh.position.set(0, initialSpec.screenHeight3D / 2 + 0.35, initialSpec.curveRadius3D - 14.5);
    screenGroup.add(mainScreenMesh);

    // Stereoscopic 3D parallax ghost layer (subtle dual-eye depth offset when 3D or IMAX 3D active)
    const stereoMat = new THREE.MeshBasicMaterial({
      map: procTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      color: 0x83a9ff,
      blending: THREE.AdditiveBlending,
    });
    const stereoMesh = new THREE.Mesh(mainScreenMesh.geometry, stereoMat);
    stereoMesh.position.copy(mainScreenMesh.position);
    stereoMesh.position.z += 0.25;
    stereoMesh.position.x += 0.14;
    screenGroup.add(stereoMesh);

    // ScreenX 270-degree Flush Side-Wall Projection Wings (meet main screen edges at ±18.12, z=-13.12)
    const wingMatL = createScreenXWingMaterial(procTex, -1);
    const wingMatR = createScreenXWingMaterial(procTex, 1);
    const wingGeo = new THREE.PlaneGeometry(28, 14.8);
    const wingL = new THREE.Mesh(wingGeo, wingMatL);
    wingL.position.set(-18.12, 7.75, 0.88);
    wingL.rotation.y = Math.PI / 2;
    const wingR = new THREE.Mesh(wingGeo, wingMatR);
    wingR.position.set(18.12, 7.75, 0.88);
    wingR.rotation.y = -Math.PI / 2;
    wingL.visible = false;
    wingR.visible = false;
    scene.add(wingL, wingR);

    // Luxury Velvet Proscenium Curtains framing non-ScreenX theatre presentations
    const curtainMat = new THREE.MeshStandardMaterial({
      color: 0x3b1332,
      roughness: 0.86,
      metalness: 0.06,
      bumpMap: velvetBump,
      bumpScale: 0.08,
    });
    const curtainGeo = new THREE.BoxGeometry(3.2, 19.5, 0.9);
    const curtainL = new THREE.Mesh(curtainGeo, curtainMat);
    curtainL.position.set(-16.6, 9.75, -13.2);
    const curtainR = new THREE.Mesh(curtainGeo, curtainMat);
    curtainR.position.set(16.6, 9.75, -13.2);
    scene.add(curtainL, curtainR);

    // 4DX Wind / Mist atmospheric particle system
    const pCount = isSoftwareGl ? 70 : 180;
    const pArr = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pArr[i * 3] = (Math.random() - 0.5) * 32;
      pArr[i * 3 + 1] = 1 + Math.random() * 14;
      pArr[i * 3 + 2] = -14 + Math.random() * 28;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xc4b5fd,
      size: 0.1,
      transparent: true,
      opacity: 0.35,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const drawProceduralMovieFrame = (t: number, mode: ScreenMode, isPlaying: boolean) => {
      const spec = SCREEN_MODE_SPECS[mode];
      const grad = pCtx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, '#120d2a');
      grad.addColorStop(0.5, '#2b1757');
      grad.addColorStop(1, '#101b3d');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 1280, 720);

      // Full-width panoramic cinema aurora & nebula clouds extending smoothly into both ScreenX side wings
      for (let i = 0; i < 6; i++) {
        const cx = 120 + i * 210 + Math.cos(t * 0.4 + i * 1.3) * 110;
        const cy = 280 + Math.sin(t * 0.5 + i * 0.9) * 120;
        const rad = pCtx.createRadialGradient(cx, cy, 12, cx, cy, 300);
        rad.addColorStop(
          0,
          i % 3 === 0
            ? 'rgba(139, 92, 246, 0.52)'
            : i % 3 === 1
              ? 'rgba(244, 114, 182, 0.42)'
              : 'rgba(56, 189, 248, 0.36)'
        );
        rad.addColorStop(1, 'rgba(0,0,0,0)');
        pCtx.fillStyle = rad;
        pCtx.fillRect(0, 0, 1280, 720);
      }

      // Sweeping orbital horizon rings spanning the full 1280px width (wraps continuously onto side walls)
      pCtx.strokeStyle = 'rgba(196, 181, 253, 0.38)';
      pCtx.lineWidth = 3;
      pCtx.beginPath();
      for (let x = 0; x <= 1280; x += 24) {
        const y = 445 + Math.sin(x * 0.008 + t * 0.6) * 38;
        if (x === 0) pCtx.moveTo(x, y);
        else pCtx.lineTo(x, y);
      }
      pCtx.stroke();

      pCtx.strokeStyle = 'rgba(244, 114, 182, 0.32)';
      pCtx.lineWidth = 2;
      pCtx.beginPath();
      for (let x = 0; x <= 1280; x += 24) {
        const y = 475 + Math.cos(x * 0.006 - t * 0.45) * 28;
        if (x === 0) pCtx.moveTo(x, y);
        else pCtx.lineTo(x, y);
      }
      pCtx.stroke();

      // Starlight & peripheral motion streaks across full canvas width
      for (let s = 0; s < 36; s++) {
        const sx = ((s * 173 + t * (s % 2 === 0 ? 18 : -14)) % 1280 + 1280) % 1280;
        const sy = 56 + ((s * 97) % 410);
        const radius = (s % 3) + 1.2;
        pCtx.fillStyle = s % 4 === 0 ? 'rgba(244, 114, 182, 0.78)' : 'rgba(226, 232, 240, 0.72)';
        pCtx.beginPath();
        pCtx.arc(sx, sy, radius, 0, Math.PI * 2);
        pCtx.fill();
      }

      // Continuous mountain/cityline silhouette horizon across main + left/right wings
      pCtx.fillStyle = 'rgba(8, 8, 18, 0.68)';
      pCtx.beginPath();
      pCtx.moveTo(0, 720);
      for (let x = 0; x <= 1280; x += 40) {
        const ridge = 515 - Math.abs(Math.sin(x * 0.011)) * 42 - Math.abs(Math.cos(x * 0.023)) * 18;
        pCtx.lineTo(x, ridge);
      }
      pCtx.lineTo(1280, 720);
      pCtx.closePath();
      pCtx.fill();

      // Glowing horizon rim line across all 3 walls
      pCtx.strokeStyle = 'rgba(145, 103, 255, 0.55)';
      pCtx.lineWidth = 2;
      pCtx.beginPath();
      for (let x = 0; x <= 1280; x += 40) {
        const ridge = 515 - Math.abs(Math.sin(x * 0.011)) * 42 - Math.abs(Math.cos(x * 0.023)) * 18;
        if (x === 0) pCtx.moveTo(x, ridge);
        else pCtx.lineTo(x, ridge);
      }
      pCtx.stroke();

      // Anaglyph 3D subtle horizontal offset visual cue when 3D or IMAX 3D
      if (spec.isStereoscopic) {
        pCtx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        pCtx.lineWidth = 3;
        pCtx.beginPath();
        pCtx.arc(632, 340, 130 + Math.sin(t) * 12, 0, Math.PI * 2);
        pCtx.stroke();

        pCtx.strokeStyle = 'rgba(244, 114, 182, 0.55)';
        pCtx.beginPath();
        pCtx.arc(648, 340, 130 + Math.sin(t) * 12, 0, Math.PI * 2);
        pCtx.stroke();
      }

      if (!suppressLabelRef.current) {
        pCtx.fillStyle = 'rgba(255,255,255,0.96)';
        pCtx.font = '700 44px Manrope, sans-serif';
        pCtx.textAlign = 'center';
        pCtx.fillText(titleRef.current.toUpperCase(), 640, 328, 360);

        pCtx.fillStyle = '#C4B5FD';
        pCtx.font = '500 20px "JetBrains Mono", monospace';
        const statusText = isPlaying ? 'NOW SCREENING IN SYNC' : 'PAUSED · READY FOR TWO';
        pCtx.fillText(`${mode.toUpperCase()} · ${statusText}`, 640, 376, 360);
      }

      procTex.needsUpdate = true;
    };

    const loop = createPacedLoop(renderer, scene, camera, isSoftwareGl, (dt, elapsed) => {
      const mode = screenModeRef.current;
      const spec = SCREEN_MODE_SPECS[mode];

      // Rebuild curved screen geometry if screen mode changed
      if (mode !== currentSpecMode) {
        currentSpecMode = mode;
        const nextGeo = createCurvedScreenGeo(spec.screenWidth3D, spec.screenHeight3D, spec.curveRadius3D);
        mainScreenMesh.geometry.dispose();
        mainScreenMesh.geometry = nextGeo;
        stereoMesh.geometry = nextGeo;

        const baseY = spec.screenHeight3D / 2 + 0.35;
        const baseZ = spec.curveRadius3D - 14.5;
        mainScreenMesh.position.set(0, baseY, baseZ);
        stereoMesh.position.set(0.14, baseY, baseZ + 0.28);
      }

      // Bind live HTML5 <video> VideoTexture when real video is ready, else procedural animated reel
      const vid = videoRef.current;
      const hasLiveVideoFrame = Boolean(vid && !proceduralRef.current && vid.readyState >= 2);
      if (hasLiveVideoFrame && vid) {
        if (attachedVideo !== vid) {
          liveVideoTex?.dispose();
          liveVideoTex = new THREE.VideoTexture(vid);
          liveVideoTex.colorSpace = THREE.SRGBColorSpace;
          liveVideoTex.minFilter = THREE.LinearFilter;
          liveVideoTex.magFilter = THREE.LinearFilter;
          liveVideoTex.generateMipmaps = false;
          attachedVideo = vid;
        }
        if (mainScreenMat.map !== liveVideoTex) {
          mainScreenMat.map = liveVideoTex;
          stereoMat.map = liveVideoTex;
          wingMatL.uniforms.uMap.value = liveVideoTex;
          wingMatR.uniforms.uMap.value = liveVideoTex;
          mainScreenMat.needsUpdate = true;
          stereoMat.needsUpdate = true;
        }
      } else {
        drawProceduralMovieFrame(
          playingRef.current ? timeRef.current + elapsed * 0.45 : timeRef.current * 0.1 + elapsed * 0.12,
          mode,
          playingRef.current
        );
        if (mainScreenMat.map !== procTex) {
          mainScreenMat.map = procTex;
          stereoMat.map = procTex;
          wingMatL.uniforms.uMap.value = procTex;
          wingMatR.uniforms.uMap.value = procTex;
          mainScreenMat.needsUpdate = true;
          stereoMat.needsUpdate = true;
        }
      }

      // ScreenX 270-degree 3-wall wings & stage curtains toggle
      wingL.visible = spec.isPanoramicSideWalls;
      wingR.visible = spec.isPanoramicSideWalls;
      curtainL.visible = !spec.isPanoramicSideWalls && mode !== 'Fullscreen';
      curtainR.visible = !spec.isPanoramicSideWalls && mode !== 'Fullscreen';
      sideBounceL.intensity = THREE.MathUtils.damp(sideBounceL.intensity, spec.isPanoramicSideWalls ? 11 : 0, 5, dt);
      sideBounceR.intensity = THREE.MathUtils.damp(sideBounceR.intensity, spec.isPanoramicSideWalls ? 11 : 0, 5, dt);

      // Stereoscopic 3D depth layer
      stereoMat.opacity = spec.isStereoscopic ? 0.32 : 0;

      // Dolby Cinema vs Theatre vs ScreenX vs Normal ambient lighting
      const isDolby = mode === 'Dolby Cinema';
      const isTheatre = mode === 'Theatre Mode' || mode === 'Fullscreen' || mode === 'Screen X';
      dolbyBlueLight.intensity = THREE.MathUtils.damp(dolbyBlueLight.intensity, isDolby ? 8 : 0, 5, dt);
      hemi.intensity = THREE.MathUtils.damp(hemi.intensity, isDolby || isTheatre ? 0.36 : 0.68, 5, dt);
      coveMatL.emissiveIntensity = THREE.MathUtils.damp(
        coveMatL.emissiveIntensity,
        isDolby ? 2.2 : isTheatre ? 0.25 : 1.2,
        5,
        dt
      );
      coveMatL.color.setHex(isDolby ? 0x38bdf8 : 0x8b5cf6);
      coveMatL.emissive.setHex(isDolby ? 0x38bdf8 : 0x8b5cf6);

      // Update 3D couple seat highlights + smooth avatar gliding to assigned seats
      const couple = resolveCoupleSeats(hostSeatIdRef.current, guestSeatIdRef.current);
      if (couple.hostSeat.id !== lastAppliedHostSeat || couple.guestSeat.id !== lastAppliedGuestSeat) {
        lastAppliedHostSeat = couple.hostSeat.id;
        lastAppliedGuestSeat = couple.guestSeat.id;
        auditoriumSeats.updateCoupleSeats(couple.hostSeat.id, couple.guestSeat.id);
      }

      // 4DX motion seat & wind particle intensity
      let motionX = 0;
      let motionY = 0;
      let motionRoll = 0;
      if (spec.isMotion4DX && playingRef.current) {
        motionX = Math.sin(elapsed * 2.4) * 0.12;
        motionY = Math.sin(elapsed * 4.2) * 0.08;
        motionRoll = Math.sin(elapsed * 1.9) * 0.015;
        auditoriumSeats.setMotionSeatOffset(couple.hostSeat.id, Math.max(0, motionY * 0.55), motionRoll);
        auditoriumSeats.setMotionSeatOffset(couple.guestSeat.id, Math.max(0, motionY * 0.55), motionRoll);
        particleMat.opacity = 0.72;
        particles.position.z = (elapsed * 4.5) % 12;
      } else {
        auditoriumSeats.setMotionSeatOffset(couple.hostSeat.id, 0, 0);
        auditoriumSeats.setMotionSeatOffset(couple.guestSeat.id, 0, 0);
        particleMat.opacity = reactionsRef.current.length > 0 ? 0.65 : 0.28;
        particles.rotation.y = elapsed * 0.02;
      }

      const seatDamp = 1 - Math.exp(-12 * dt);
      const adjacentCouple = areSeatsAdjacent(couple.hostSeat.id, couple.guestSeat.id);
      const guestLeanDir = adjacentCouple ? Math.sign(couple.hostSeat.position[0] - couple.guestSeat.position[0]) : 0;

      // Active couple interaction animation state (each reaction has distinct anatomical contact & 3D effect)
      const nowMs = Date.now();
      const latestReaction = reactionsRef.current[reactionsRef.current.length - 1] || null;
      const reactionDur = latestReaction ? INTERACTION_DURATION_MAP.get(latestReaction.kind) || 2200 : 2200;
      const reactionAgeMs = latestReaction ? Math.max(0, nowMs - latestReaction.createdAt) : Infinity;
      const hasActiveInteraction = Boolean(latestReaction && reactionAgeMs <= reactionDur);
      const activeKind = hasActiveInteraction && latestReaction ? latestReaction.kind : null;
      const interactionProgress = hasActiveInteraction ? Math.min(1, reactionAgeMs / reactionDur) : 0;
      const attack = Math.min(1, interactionProgress / 0.16);
      const release =
        interactionProgress > 0.72
          ? Math.max(0, Math.cos(((interactionProgress - 0.72) / 0.28) * (Math.PI / 2)))
          : 1;
      const interactionEnv =
        activeKind && interactionProgress > 0 && interactionProgress < 1 ? attack * release : 0;
      const activeChoreo = activeKind ? resolveInteractionChoreography(activeKind) : null;

      // Measure actual distance between occupied couple seats so kisses & hugs close the gap smoothly
      const seatGapX = Math.abs(couple.hostSeat.position[0] - couple.guestSeat.position[0]);
      const pullFraction = activeChoreo ? activeChoreo.contactPullX * interactionEnv : 0;
      const maxContactSlide = adjacentCouple ? Math.min(0.76, Math.max(0.32, seatGapX * 0.62)) : 0;
      const extraLeanShift = adjacentCouple ? pullFraction * maxContactSlide : 0;
      const forwardLeanZ = activeChoreo ? activeChoreo.contactForwardZ * interactionEnv : 0;
      const verticalContactY = activeChoreo ? activeChoreo.contactHeightOffset * interactionEnv : 0;

      const currentRoles = resolveCoupleRoles(hostPartnerRoleRef.current, guestPartnerRoleRef.current);
      hostHaloMat.color.setHex(currentRoles.hostPartnerRole === 'bf' ? 0x8b5cf6 : 0xf472b6);
      guestHaloMat.color.setHex(currentRoles.guestPartnerRole === 'bf' ? 0x8b5cf6 : 0xf472b6);
      const activeHostRig = currentRoles.hostPartnerRole === 'gf' ? hostRigGf : hostRigBf;
      const inactiveHostRig = currentRoles.hostPartnerRole === 'gf' ? hostRigBf : hostRigGf;
      const activePartnerRig = currentRoles.guestPartnerRole === 'bf' ? partnerRigBf : partnerRigGf;
      const inactivePartnerRig = currentRoles.guestPartnerRole === 'bf' ? partnerRigGf : partnerRigBf;
      inactiveHostRig.root.visible = false;
      inactivePartnerRig.root.visible = false;
      const hostAvatar = activeHostRig.root;
      const partnerAvatar = activePartnerRig.root;

      const hostTargetX = couple.hostSeat.position[0] + (adjacentCouple ? -guestLeanDir * (0.08 + extraLeanShift * 0.25) : 0);
      const hostTargetY =
        couple.hostSeat.position[1] +
        (spec.isMotion4DX && playingRef.current ? Math.max(0, motionY * 0.55) : 0) +
        verticalContactY * 0.35;
      const hostTargetZ = couple.hostSeat.position[2] - 0.1 - forwardLeanZ * 0.45;
      hostRigBf.root.position.set(
        THREE.MathUtils.lerp(hostRigBf.root.position.x, hostTargetX, seatDamp),
        THREE.MathUtils.lerp(hostRigBf.root.position.y, hostTargetY, seatDamp),
        THREE.MathUtils.lerp(hostRigBf.root.position.z, hostTargetZ, seatDamp)
      );
      hostRigGf.root.position.copy(hostRigBf.root.position);

      const guestTargetX = couple.guestSeat.position[0] + (adjacentCouple ? guestLeanDir * (0.14 + extraLeanShift) : 0);
      const guestTargetY =
        couple.guestSeat.position[1] +
        (spec.isMotion4DX && playingRef.current ? Math.max(0, motionY * 0.55) : 0) +
        verticalContactY;
      const guestTargetZ = couple.guestSeat.position[2] - 0.12 - forwardLeanZ;
      partnerRigGf.root.position.set(
        THREE.MathUtils.lerp(partnerRigGf.root.position.x, guestTargetX, seatDamp),
        THREE.MathUtils.lerp(partnerRigGf.root.position.y, guestTargetY, seatDamp),
        THREE.MathUtils.lerp(partnerRigGf.root.position.z, guestTargetZ, seatDamp)
      );
      partnerRigBf.root.position.copy(partnerRigGf.root.position);

      // Animate articulated torso, neck, head, eyelids, lips, blush, arms & props for both active rigs
      const hostToGuestDir = Math.sign(couple.guestSeat.position[0] - couple.hostSeat.position[0]) || 1;
      const guestToHostDir = -hostToGuestDir;
      updateHumanRigAnimation(activeHostRig, activeKind, interactionProgress, adjacentCouple ? hostToGuestDir : 0, dt, elapsed);
      updateHumanRigAnimation(activePartnerRig, activeKind, interactionProgress, adjacentCouple ? guestToHostDir : 0, dt, elapsed);

      snackProps.position.set(hostTargetX, hostTargetY, couple.hostSeat.position[2]);
      hostSeatHalo.position.set(
        couple.hostSeat.position[0],
        couple.hostSeat.position[1] + 0.025,
        couple.hostSeat.position[2]
      );
      guestSeatHalo.position.set(
        couple.guestSeat.position[0],
        couple.guestSeat.position[1] + 0.025,
        couple.guestSeat.position[2]
      );

      // First-person Seat-Locked POV: hide only the viewer's own avatar so their head never blocks the lens,
      // while keeping their partner's avatar visible + activating peripheral embodied arms for hugs/touches.
      const viewingAsGuest = viewerSeatRoleRef.current === 'guest';
      hostAvatar.visible = viewingAsGuest;
      partnerAvatar.visible = !viewingAsGuest;

      const activeSeat = viewingAsGuest ? couple.guestSeat : couple.hostSeat;
      const activeAvatarPos = viewingAsGuest ? partnerAvatar.position : hostAvatar.position;
      const otherAvatarPos = viewingAsGuest ? hostAvatar.position : partnerAvatar.position;
      const viewerToPartnerDir = viewingAsGuest ? guestToHostDir : hostToGuestDir;

      // Sync first-person peripheral embodied arms to viewer's active seat
      const activeFpArms = viewingAsGuest ? fpGuestArms : fpHostArms;
      const inactiveFpArms = viewingAsGuest ? fpHostArms : fpGuestArms;
      inactiveFpArms.root.visible = false;
      activeFpArms.root.position.set(activeSeat.position[0], activeSeat.position[1], activeSeat.position[2] - 0.08);
      updateFirstPersonCoupleArms(
        activeFpArms,
        activeChoreo ? activeChoreo.firstPersonArmPose : null,
        viewerToPartnerDir,
        interactionEnv,
        interactionProgress,
        dt
      );

      // Pooled 3D reaction effects anchored directly at the active anatomical target (lips, cheek, crown, hands)
      const fxOriginX = THREE.MathUtils.lerp(activeAvatarPos.x, otherAvatarPos.x, 0.78);
      const fxOriginY = otherAvatarPos.y + (activeChoreo ? activeChoreo.cameraTargetYOffset : 0.98) - 0.14;
      const fxOriginZ = otherAvatarPos.z - 0.16;
      updateCoupleInteractionEffects(
        interactionFx,
        activeChoreo ? activeChoreo.effectType : null,
        fxOriginX,
        fxOriginY,
        fxOriginZ,
        interactionProgress,
        interactionEnv,
        elapsed
      );

      coupleFillLight.position.set(
        (couple.hostSeat.position[0] + couple.guestSeat.position[0]) * 0.5,
        Math.max(couple.hostSeat.position[1], couple.guestSeat.position[1]) + 2.3,
        Math.min(couple.hostSeat.position[2], couple.guestSeat.position[2]) - 1.6
      );
      const seatPose = computeSeatPovCamera(activeSeat, spec.screenHeight3D, spec.cameraFov, camera.aspect);

      // Brief affectionate seated camera glance & playful bonk impulse when interaction fires (never leaves seat!)
      let beatShakeX = 0;
      let beatShakeY = 0;
      if (activeChoreo && activeChoreo.beatPulse > 0 && interactionEnv > 0.05) {
        beatShakeX = Math.sin(interactionProgress * Math.PI * 6) * 0.062 * interactionEnv;
        beatShakeY = Math.cos(interactionProgress * Math.PI * 5) * 0.045 * interactionEnv;
      }

      _camPos.set(
        seatPose.eyePos[0] + motionX + beatShakeX,
        seatPose.eyePos[1] + motionY + beatShakeY,
        seatPose.eyePos[2]
      );
      _lookAt.set(seatPose.lookAt[0], seatPose.lookAt[1], seatPose.lookAt[2]);

      if (activeChoreo && interactionEnv > 0.02) {
        // Direction-vector spherical blend aimed precisely at each interaction's anatomical zone
        _screenDir.copy(_lookAt).sub(_camPos).normalize();
        const targetY = otherAvatarPos.y + activeChoreo.cameraTargetYOffset;
        const targetX = otherAvatarPos.x + viewerToPartnerDir * activeChoreo.cameraTargetXBias;
        _partnerEyeTarget.set(targetX, targetY, otherAvatarPos.z - 0.12);
        _partnerDir.copy(_partnerEyeTarget).sub(_camPos).normalize();
        const glanceBlend = Math.min(0.96, activeChoreo.cameraGlanceWeight * interactionEnv);
        _screenDir.lerp(_partnerDir, glanceBlend).normalize();
        _lookAt.copy(_camPos).addScaledVector(_screenDir, 12);
      }

      const { yaw, pitch } = lookOffsetRef.current;
      if (Math.abs(yaw) > 0.001 || Math.abs(pitch) > 0.001) {
        _lookDir.copy(_lookAt).sub(_camPos);
        _euler.set(pitch, yaw, 0, 'YXZ');
        _yawPitchQuat.setFromEuler(_euler);
        _lookDir.applyQuaternion(_yawPitchQuat);
        _lookAt.copy(_camPos).add(_lookDir);
      }

      const damp = 1 - Math.exp(-10.5 * dt);
      camera.position.lerp(_camPos, damp);
      camera.lookAt(_lookAt);
      camera.rotation.z += motionRoll;

      if (Math.abs(camera.fov - seatPose.fov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, seatPose.fov, 6, dt);
        camera.updateProjectionMatrix();
      }

      // Real-time ambient scene color extraction from live video frame
      if (hasLiveVideoFrame && vid && ambCtx && elapsed - lastAmbientSampleAt > 0.22) {
        lastAmbientSampleAt = elapsed;
        try {
          ambCtx.drawImage(vid, 0, 0, 8, 4);
          const pixels = ambCtx.getImageData(0, 0, 8, 4).data;
          let rSum = 0;
          let gSum = 0;
          let bSum = 0;
          const count = pixels.length / 4;
          for (let i = 0; i < pixels.length; i += 4) {
            rSum += pixels[i];
            gSum += pixels[i + 1];
            bSum += pixels[i + 2];
          }
          const avgR = Math.max(24, rSum / count) / 255;
          const avgG = Math.max(18, gSum / count) / 255;
          const avgB = Math.max(36, bSum / count) / 255;
          targetBounceColor.setRGB(avgR, avgG, avgB);
        } catch {
          targetBounceColor.setHex(0x9167ff);
        }
      } else if (!hasLiveVideoFrame) {
        targetBounceColor.setHex(0x9167ff);
      }

      screenBounceLight.color.lerp(targetBounceColor, 0.12);
      sideBounceL.color.lerp(targetBounceColor, 0.12);
      sideBounceR.color.lerp(targetBounceColor, 0.12);
      projBeamMat.uniforms.uColor.value.lerp(targetBounceColor, 0.1);
      projBeamMat.uniforms.uOpacity.value = THREE.MathUtils.damp(
        projBeamMat.uniforms.uOpacity.value,
        playingRef.current ? 0.075 : 0.025,
        4,
        dt
      );
      screenBounceLight.intensity = playingRef.current ? 18 + Math.sin(elapsed * 3) * 2.5 : 11;
    });

    loop.start();

    // Pointer-drag look-around inside the 3D auditorium (pan across left, center, and right ScreenX walls)
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const domEl = renderer.domElement;
    domEl.style.cursor = 'grab';

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      domEl.style.cursor = 'grabbing';
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      lookOffsetRef.current = {
        yaw: THREE.MathUtils.clamp(lookOffsetRef.current.yaw - dx * 0.0042, -1.65, 1.65),
        pitch: THREE.MathUtils.clamp(lookOffsetRef.current.pitch + dy * 0.003, -0.35, 0.35),
      };
    };
    const onPointerUp = () => {
      dragging = false;
      domEl.style.cursor = 'grab';
    };
    const onDoubleClick = () => {
      lookOffsetRef.current = { yaw: 0, pitch: 0 };
    };

    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('dblclick', onDoubleClick);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      loop.stop();
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('resize', onResize);
      wingGeo.dispose();
      wingMatL.dispose();
      wingMatR.dispose();
      curtainGeo.dispose();
      curtainMat.dispose();
      stageApronGeo.dispose();
      stageApronMat.dispose();
      stageFootStripGeo.dispose();
      stageFootStripMat.dispose();
      pilasterGeo.dispose();
      pilasterMat.dispose();
      pilasterInst.dispose();
      baffleGeo.dispose();
      baffleInst.dispose();
      exitSignGeo.dispose();
      exitFrameMat.dispose();
      exitFaceMat.dispose();
      exitTex.dispose();
      nosingGeo.dispose();
      floorMat.dispose();
      riserGeos.forEach((g) => g.dispose());
      riserMat.dispose();
      stepGeo.dispose();
      stepLightMat.dispose();
      sconceHousingGeo.dispose();
      sconceGeo.dispose();
      sconceMat.dispose();
      auditoriumSeats.dispose();
      hostRigBf.dispose();
      hostRigGf.dispose();
      partnerRigBf.dispose();
      partnerRigGf.dispose();
      fpHostArms.dispose();
      fpGuestArms.dispose();
      interactionFx.dispose();
      seatHaloGeo.dispose();
      hostHaloMat.dispose();
      guestHaloMat.dispose();
      projBeamGeo.dispose();
      projBeamMat.dispose();
      tubGeo.dispose();
      tubMat.dispose();
      popcornMat.dispose();
      mainScreenMesh.geometry.dispose();
      mainScreenMat.dispose();
      stereoMat.dispose();
      velvetBump.dispose();
      ribBump.dispose();
      marbleTex.dispose();
      carpetTex.dispose();
      procTex.dispose();
      liveVideoTex?.dispose();
      envTex.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
    };
  }, [webglSupported]);

  if (!webglSupported) {
    return (
      <div className="w-full h-full bg-[#06060c] flex items-center justify-center">
        <p className="text-sm text-[#C4B5FD]">2D Cinema Mode Active (WebGL unavailable)</p>
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full" data-testid="auditorium-3d-canvas" />;
}
