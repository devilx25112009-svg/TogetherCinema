import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createCinemaMaterialSet,
  createPortalCanvasTexture,
  createReceptionCounter,
  createVelvetLoveseatGroup,
} from '../../three/cinemaModels';
import {
  attachStudioEnvironment,
  createCinemaRenderer,
  createMarbleTexture,
  createPacedLoop,
  createVelvetBumpTexture,
  detectSoftwareWebGL,
  isWebGLAvailable,
} from '../../three/rendererSetup';

export interface LobbyDestination {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  accentHex: string;
  position: [number, number, number];
  rotationY: number;
}

export const LOBBY_DESTINATIONS: LobbyDestination[] = [
  {
    id: 'movies',
    title: 'Movie Library',
    subtitle: 'Personal 4K & 50GB Vault',
    route: '/movies',
    accentHex: '#8B5CF6',
    position: [-8.3, 2.7, -4.1],
    rotationY: 0.4,
  },
  {
    id: 'rooms',
    title: 'Watch Together',
    subtitle: 'Private Synced Auditoriums',
    route: '/rooms',
    accentHex: '#9167FF',
    position: [-4.2, 2.7, -7.2],
    rotationY: 0.16,
  },
  {
    id: 'food',
    title: 'Food & Snacks',
    subtitle: 'Popcorn, Truffles & Shared Tray',
    route: '/food',
    accentHex: '#F472B6',
    position: [0, 2.7, -8.5],
    rotationY: 0,
  },
  {
    id: 'memories',
    title: 'Our Memories',
    subtitle: '3D Moment Gallery & Notes',
    route: '/memories',
    accentHex: '#83A9FF',
    position: [4.2, 2.7, -7.2],
    rotationY: -0.16,
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'Storage, Partner & Privacy',
    route: '/settings',
    accentHex: '#C4B5FD',
    position: [8.3, 2.7, -4.1],
    rotationY: -0.4,
  },
];

interface CinemaLobbySceneProps {
  onSelectDestination: (dest: LobbyDestination) => void;
  onHoverDestination?: (dest: LobbyDestination | null) => void;
}

const _camTarget = new THREE.Vector3(0, 2.8, 10.6);
const _lookTarget = new THREE.Vector3(0, 2.6, -7);

export function CinemaLobbyScene({ onSelectDestination, onHoverDestination }: CinemaLobbySceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef(onSelectDestination);
  const hoverRef = useRef(onHoverDestination);
  const [webglSupported] = useState(() => isWebGLAvailable());

  useEffect(() => {
    selectRef.current = onSelectDestination;
  }, [onSelectDestination]);

  useEffect(() => {
    hoverRef.current = onHoverDestination;
  }, [onHoverDestination]);

  useEffect(() => {
    if (!webglSupported || !mountRef.current) return;
    const container = mountRef.current;
    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = createCinemaRenderer(container, isSoftwareGl);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);
    scene.fog = new THREE.FogExp2(0x0b1020, 0.025);
    const envTex = attachStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      58,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      120
    );
    camera.position.set(0, 2.8, 10.6);
    camera.lookAt(0, 2.6, -7);

    const velvetBump = createVelvetBumpTexture();
    const marbleTex = createMarbleTexture(renderer.capabilities.getMaxAnisotropy());
    const mats = createCinemaMaterialSet(velvetBump);

    // Lighting
    scene.add(new THREE.HemisphereLight(0xc4b5fd, 0x0b1020, 0.9));
    const key = new THREE.DirectionalLight(0xfef3c7, 1.15);
    key.position.set(8, 12, 10);
    if (!isSoftwareGl) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
    }
    scene.add(key);

    const lobbyGlow = new THREE.PointLight(0x8b5cf6, 12, 30, 1.4);
    lobbyGlow.position.set(0, 6.8, -3);
    scene.add(lobbyGlow);

    // Veined dark marble lobby floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: marbleTex,
        roughness: 0.22,
        metalness: 0.18,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Architectural ceiling & columns positioned cleanly outside portal arc
    const colGeo = new THREE.CylinderGeometry(0.45, 0.55, 10, 20);
    [
      [-12.8, 5, 1.5],
      [12.8, 5, 1.5],
      [-13.5, 5, -7.5],
      [13.5, 5, -7.5],
    ].forEach(([x, y, z]) => {
      const col = new THREE.Mesh(colGeo, mats.obsidian);
      col.position.set(x, y, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 10, 24), mats.brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.6, z);
      scene.add(col, ring);
    });

    // Illuminated Together Cinema arch marquee
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024;
    signCanvas.height = 192;
    const ctx = signCanvas.getContext('2d')!;
    ctx.fillStyle = '#151126';
    ctx.fillRect(0, 0, 1024, 192);
    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 1008, 176);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 62px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TOGETHER CINEMA', 512, 105);
    ctx.fillStyle = '#F472B6';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText('MILES APART · ONE SCREEN · TOGETHER', 512, 152);

    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const marquee = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 2.2, 0.35),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    marquee.position.set(0, 6.8, -8.5);
    scene.add(marquee);

    // Reception counter & lounge loveseats
    const desk = createReceptionCounter(mats);
    desk.position.set(0, 0, -1.6);
    scene.add(desk);

    const loungeL = createVelvetLoveseatGroup(mats, true);
    loungeL.position.set(-6.5, 0, 3.2);
    loungeL.rotation.y = 0.55;
    const loungeR = createVelvetLoveseatGroup(mats, true);
    loungeR.position.set(6.5, 0, 3.2);
    loungeR.rotation.y = -0.55;
    scene.add(loungeL, loungeR);

    // Interactive 3D Destination Portals
    const interactables: THREE.Mesh[] = [];
    const portalTextures: THREE.Texture[] = [];
    const portalGroups = new Map<string, { group: THREE.Group; rim: THREE.Mesh; baseScale: number }>();

    LOBBY_DESTINATIONS.forEach((dest) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(...dest.position);
      pGroup.rotation.y = dest.rotationY;

      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.4, 0.24), mats.obsidian);
      const tex = createPortalCanvasTexture(dest.title, dest.subtitle, dest.accentHex);
      portalTextures.push(tex);
      const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(3.0, 3.9),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      poster.position.z = 0.14;

      const rimMat = new THREE.MeshStandardMaterial({
        color: dest.accentHex,
        emissive: dest.accentHex,
        emissiveIntensity: 0.7,
        roughness: 0.2,
      });
      const rim = new THREE.Mesh(new THREE.BoxGeometry(3.52, 4.52, 0.16), rimMat);
      rim.position.z = -0.02;

      const hitProxy = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 4.6, 0.6),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitProxy.userData.destination = dest;
      interactables.push(hitProxy);

      pGroup.add(rim, frame, poster, hitProxy);
      scene.add(pGroup);
      portalGroups.set(dest.id, { group: pGroup, rim, baseScale: 1 });
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredId: string | null = null;
    let pointerX = 0;
    let pointerY = 0;
    let lastCast = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerX = pointer.x;
      pointerY = pointer.y;

      const now = performance.now();
      if (now - lastCast < 45) return;
      lastCast = now;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactables, false);
      const nextDest = hits.length > 0 ? (hits[0].object.userData.destination as LobbyDestination) : null;
      const nextId = nextDest?.id || null;
      if (nextId !== hoveredId) {
        hoveredId = nextId;
        renderer.domElement.style.cursor = nextId ? 'pointer' : 'default';
        hoverRef.current?.(nextDest);
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactables, false);
      if (hits.length > 0) {
        const dest = hits[0].object.userData.destination as LobbyDestination;
        selectRef.current(dest);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    const loop = createPacedLoop(renderer, scene, camera, isSoftwareGl, (dt) => {
      const damp = 1 - Math.exp(-5 * dt);
      _camTarget.set(pointerX * 1.2, 2.8 + pointerY * 0.45, 10.6);
      _lookTarget.set(pointerX * 0.7, 2.6, -7);
      camera.position.lerp(_camTarget, damp);
      camera.lookAt(_lookTarget);

      portalGroups.forEach((entry, id) => {
        const isHovered = id === hoveredId;
        const targetScale = isHovered ? 1.07 : 1.0;
        const nextScale = THREE.MathUtils.damp(entry.group.scale.x, targetScale, 8, dt);
        entry.group.scale.setScalar(nextScale);
        const rimMat = entry.rim.material as THREE.MeshStandardMaterial;
        rimMat.emissiveIntensity = THREE.MathUtils.damp(rimMat.emissiveIntensity, isHovered ? 2.4 : 0.65, 8, dt);
      });
    });

    loop.start();

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
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      velvetBump.dispose();
      marbleTex.dispose();
      signTex.dispose();
      portalTextures.forEach((t) => t.dispose());
      envTex.dispose();
      renderer.dispose();
    };
  }, [webglSupported]);

  if (!webglSupported) {
    return (
      <div className="w-full h-full bg-[#0B1020] relative overflow-hidden">
        <img
          src="/images/cinema_hero_couple_1794680184863.jpg"
          alt="Together Cinema 3D Lobby"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-50"
        />
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full" data-testid="lobby-3d-canvas" />;
}
