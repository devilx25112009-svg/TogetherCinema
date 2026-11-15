import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createCinemaMaterialSet, createVelvetLoveseatGroup } from '../../three/cinemaModels';
import {
  attachStudioEnvironment,
  createAcousticRibBumpTexture,
  createCinemaRenderer,
  createMarbleTexture,
  createPacedLoop,
  createVelvetBumpTexture,
  detectSoftwareWebGL,
  isWebGLAvailable,
} from '../../three/rendererSetup';

interface CinematicIntroSceneProps {
  skipIntro?: boolean;
  onPhaseChange?: (phase: 'approaching' | 'doors' | 'auditorium' | 'seated') => void;
}

const _camPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();

export function CinematicIntroScene({ skipIntro = false, onPhaseChange }: CinematicIntroSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const skipRef = useRef(skipIntro);
  const onPhaseRef = useRef(onPhaseChange);
  const [webglSupported] = useState(() => isWebGLAvailable());
  const [prefersReducedMotion] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  );

  useEffect(() => {
    skipRef.current = skipIntro;
  }, [skipIntro]);

  useEffect(() => {
    onPhaseRef.current = onPhaseChange;
  }, [onPhaseChange]);

  useEffect(() => {
    if (!webglSupported || prefersReducedMotion || !mountRef.current) return;
    const container = mountRef.current;
    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = createCinemaRenderer(container, isSoftwareGl);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080810);
    scene.fog = new THREE.FogExp2(0x080810, 0.022);
    const envTex = attachStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      140
    );
    camera.position.set(0, 2.3, 24);
    camera.lookAt(0, 3.2, -16);

    const velvetBump = createVelvetBumpTexture();
    const ribBump = createAcousticRibBumpTexture();
    const marbleTex = createMarbleTexture(renderer.capabilities.getMaxAnisotropy());
    const mats = createCinemaMaterialSet(velvetBump);

    // Lighting rig: warm brass key + cool indigo hemisphere + screen glow
    const hemi = new THREE.HemisphereLight(0x83a9ff, 0x151126, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfde68a, 1.1);
    keyLight.position.set(6, 12, 18);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const screenGlow = new THREE.PointLight(0x8b5cf6, 14, 38, 1.4);
    screenGlow.position.set(0, 6.5, -13);
    scene.add(screenGlow);

    const roseAccent = new THREE.PointLight(0xf472b6, 5, 22, 1.5);
    roseAccent.position.set(0, 3.6, 17);
    scene.add(roseAccent);

    // Floor: Carpeted auditorium + marble foyer entrance
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: marbleTex,
      roughness: 0.32,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 56), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Center aisle runner slightly raised to avoid Z-fighting
    const aisle = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 38),
      new THREE.MeshStandardMaterial({ color: 0x24103e, roughness: 0.9 })
    );
    aisle.rotation.x = -Math.PI / 2;
    aisle.position.set(0, 0.02, -1);
    scene.add(aisle);

    // Aisle floor guide lights
    const guideGeo = new THREE.BoxGeometry(0.12, 0.03, 0.35);
    for (let z = 12; z >= -10; z -= 2.2) {
      const gL = new THREE.Mesh(guideGeo, mats.glowViolet);
      gL.position.set(-1.75, 0.035, z);
      const gR = new THREE.Mesh(guideGeo, mats.glowViolet);
      gR.position.set(1.75, 0.035, z);
      scene.add(gL, gR);
    }

    // Acoustic dark walls & ceiling
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x110e1f,
      roughness: 0.78,
      bumpMap: ribBump,
      bumpScale: 0.06,
    });
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 16, 46), wallMat);
    wallL.position.set(-15, 8, -4);
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 16, 46), wallMat);
    wallR.position.set(15, 8, -4);
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(31, 0.6, 46), mats.obsidian);
    ceiling.position.set(0, 16, -4);
    scene.add(wallL, wallR, ceiling);

    // Wall cove light strips
    const coveGeo = new THREE.BoxGeometry(0.08, 0.14, 34);
    const coveL = new THREE.Mesh(coveGeo, mats.glowViolet);
    coveL.position.set(-14.6, 12.2, -3);
    const coveR = new THREE.Mesh(coveGeo, mats.glowViolet);
    coveR.position.set(14.6, 12.2, -3);
    scene.add(coveL, coveR);

    // Entrance wall with double hinged luxury cinema doors at z = 14
    const portalHeader = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 0.8), wallMat);
    portalHeader.position.set(0, 11, 14);
    const jambL = new THREE.Mesh(new THREE.BoxGeometry(11.5, 6.2, 0.8), wallMat);
    jambL.position.set(-9.25, 3.1, 14);
    const jambR = new THREE.Mesh(new THREE.BoxGeometry(11.5, 6.2, 0.8), wallMat);
    jambR.position.set(9.25, 3.1, 14);
    scene.add(portalHeader, jambL, jambR);

    // Hinged doors
    const leftDoorPivot = new THREE.Group();
    leftDoorPivot.position.set(-3.4, 0, 14);
    const rightDoorPivot = new THREE.Group();
    rightDoorPivot.position.set(3.4, 0, 14);

    const doorPanelGeo = new THREE.BoxGeometry(3.35, 6.0, 0.22);
    const doorLeftMesh = new THREE.Mesh(doorPanelGeo, mats.walnut);
    doorLeftMesh.position.set(1.68, 3.0, 0);
    const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.34), mats.brass);
    handleL.position.set(3.05, 2.7, 0);
    leftDoorPivot.add(doorLeftMesh, handleL);

    const doorRightMesh = new THREE.Mesh(doorPanelGeo, mats.walnut);
    doorRightMesh.position.set(-1.68, 3.0, 0);
    const handleR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.34), mats.brass);
    handleR.position.set(-3.05, 2.7, 0);
    rightDoorPivot.add(doorRightMesh, handleR);
    scene.add(leftDoorPivot, rightDoorPivot);

    // Purple velvet recliner rows (tiered seating)
    const rows = [
      { z: 8.5, y: 0.45 },
      { z: 4.5, y: 0.22 },
      { z: 0.5, y: 0.0 },
    ];
    rows.forEach((row) => {
      [-6.2, 0, 6.2].forEach((x) => {
        if (row.z === 0.5 && x === 0) {
          // Hero central couple loveseat
          const heroSeat = createVelvetLoveseatGroup(mats, true);
          heroSeat.position.set(0, 0.02, 0.5);
          scene.add(heroSeat);
        } else {
          const seat = createVelvetLoveseatGroup(mats, true);
          seat.position.set(x, row.y, row.z);
          scene.add(seat);
        }
      });
    });

    // MASSIVE curved projection screen at front
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 1024;
    screenCanvas.height = 576;
    const sCtx = screenCanvas.getContext('2d')!;
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;

    const screenGeo = new THREE.CylinderGeometry(32, 32, 13.8, 36, 1, true, Math.PI - 0.42, 0.84);
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, side: THREE.DoubleSide });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 7.6, 15.5);
    scene.add(screenMesh);

    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(26.8, 0.35, 0.4), mats.obsidian);
    frameTop.position.set(0, 14.6, -16.2);
    const frameBot = new THREE.Mesh(new THREE.BoxGeometry(26.8, 0.35, 0.4), mats.obsidian);
    frameBot.position.set(0, 0.6, -16.2);
    scene.add(frameTop, frameBot);

    // Floating atmospheric particles
    const particleCount = isSoftwareGl ? 60 : 160;
    const pPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 24;
      pPositions[i * 3 + 1] = 0.8 + Math.random() * 12;
      pPositions[i * 3 + 2] = -14 + Math.random() * 34;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xc4b5fd,
      size: 0.08,
      transparent: true,
      opacity: 0.55,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let animProgress = skipRef.current ? 1 : 0;
    let lastReportedPhase = '';

    const drawScreenFrame = (t: number) => {
      const grad = sCtx.createRadialGradient(512, 288, 30, 512, 288, 560);
      grad.addColorStop(0, '#3b1f78');
      grad.addColorStop(0.45, '#191233');
      grad.addColorStop(1, '#07060d');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 1024, 576);

      // Subtle drifting starlight arcs
      sCtx.strokeStyle = 'rgba(244, 114, 182, 0.35)';
      sCtx.lineWidth = 2;
      sCtx.beginPath();
      sCtx.arc(512, 288, 120 + Math.sin(t * 0.8) * 18, 0, Math.PI * 2);
      sCtx.stroke();

      sCtx.fillStyle = 'rgba(255,255,255,0.92)';
      sCtx.font = '700 44px Manrope, sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText('TOGETHER CINEMA', 512, 275);

      sCtx.fillStyle = '#C4B5FD';
      sCtx.font = '500 20px "JetBrains Mono", monospace';
      sCtx.fillText('PRIVATE SCREENING FOR TWO', 512, 322);
      screenTex.needsUpdate = true;
    };

    drawScreenFrame(0);

    const loop = createPacedLoop(renderer, scene, camera, isSoftwareGl, (dt, elapsed) => {
      if (skipRef.current) {
        animProgress = 1;
      } else {
        animProgress = Math.min(1, animProgress + dt * 0.125);
      }

      // Doors open between progress 0.16 and 0.42
      const doorT = THREE.MathUtils.clamp((animProgress - 0.16) / 0.26, 0, 1);
      const doorEase = 1 - Math.pow(1 - doorT, 3);
      leftDoorPivot.rotation.y = -doorEase * (Math.PI * 0.48);
      rightDoorPivot.rotation.y = doorEase * (Math.PI * 0.48);

      // Camera glide from outside (z=24) -> foyer (z=16) -> down aisle -> front-center loveseat (z=2.2)
      if (animProgress < 0.35) {
        const p = animProgress / 0.35;
        _camPos.set(0, THREE.MathUtils.lerp(2.4, 2.6, p), THREE.MathUtils.lerp(24, 15.5, p));
        _lookAt.set(0, 3.2, -14);
        if (lastReportedPhase !== 'approaching') {
          lastReportedPhase = 'approaching';
          onPhaseRef.current?.('approaching');
        }
      } else if (animProgress < 0.72) {
        const p = (animProgress - 0.35) / 0.37;
        _camPos.set(0, THREE.MathUtils.lerp(2.6, 3.1, p), THREE.MathUtils.lerp(15.5, 4.2, p));
        _lookAt.set(0, THREE.MathUtils.lerp(3.2, 6.8, p), -15);
        if (lastReportedPhase !== 'auditorium') {
          lastReportedPhase = 'auditorium';
          onPhaseRef.current?.('auditorium');
        }
      } else {
        const p = (animProgress - 0.72) / 0.28;
        _camPos.set(
          Math.sin(elapsed * 0.2) * 0.15,
          THREE.MathUtils.lerp(3.1, 2.15, p),
          THREE.MathUtils.lerp(4.2, 1.85, p)
        );
        _lookAt.set(0, 6.8, -15.5);
        if (lastReportedPhase !== 'seated') {
          lastReportedPhase = 'seated';
          onPhaseRef.current?.('seated');
        }
      }

      const dampFactor = 1 - Math.exp(-5 * dt);
      camera.position.lerp(_camPos, skipRef.current ? 1 : dampFactor);
      camera.lookAt(_lookAt);

      particles.rotation.y = elapsed * 0.015;
      screenGlow.intensity = 12 + Math.sin(elapsed * 1.4) * 2;
      drawScreenFrame(elapsed);
    });

    loop.start();

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      loop.stop();
      window.removeEventListener('resize', handleResize);
      velvetBump.dispose();
      ribBump.dispose();
      marbleTex.dispose();
      screenTex.dispose();
      envTex.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
    };
  }, [webglSupported, prefersReducedMotion]);

  if (!webglSupported || prefersReducedMotion) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-[#080810]" data-testid="intro-2d-fallback">
        <img
          src="/images/cinema_hero_couple_1794680184863.jpg"
          alt="Luxury private 3D cinema auditorium"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080810] via-[#080810]/45 to-[#080810]/70" />
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full" data-testid="intro-3d-canvas" />;
}
