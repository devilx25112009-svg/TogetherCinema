import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { MemoryItemRecord } from '../../types/cinema';
import { createCinemaMaterialSet } from '../../three/cinemaModels';
import {
  attachStudioEnvironment,
  createCinemaRenderer,
  createMarbleTexture,
  createPacedLoop,
  createVelvetBumpTexture,
  detectSoftwareWebGL,
  isWebGLAvailable,
} from '../../three/rendererSetup';

interface MemoriesGallery3DProps {
  memories: MemoryItemRecord[];
  activeIndex: number;
  onSelectMemory: (index: number) => void;
}

const _camPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();

export function MemoriesGallery3D({ memories, activeIndex, onSelectMemory }: MemoriesGallery3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const activeIdxRef = useRef(activeIndex);
  const selectRef = useRef(onSelectMemory);
  const [webglSupported] = useState(() => isWebGLAvailable());

  useEffect(() => {
    activeIdxRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    selectRef.current = onSelectMemory;
  }, [onSelectMemory]);

  useEffect(() => {
    if (!webglSupported || !mountRef.current || memories.length === 0) return;
    const container = mountRef.current;
    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = createCinemaRenderer(container, isSoftwareGl);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090814);
    scene.fog = new THREE.FogExp2(0x090814, 0.03);
    const envTex = attachStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      52,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      100
    );
    const spacing = 5.4;
    const initX = activeIdxRef.current * spacing;
    camera.position.set(initX, 2.65, 3.1);
    camera.lookAt(initX, 2.65, -3.5);

    const velvetBump = createVelvetBumpTexture();
    const marbleTex = createMarbleTexture(renderer.capabilities.getMaxAnisotropy());
    const mats = createCinemaMaterialSet(velvetBump);

    scene.add(new THREE.HemisphereLight(0xc4b5fd, 0x0b1020, 0.85));
    const galleryKey = new THREE.DirectionalLight(0xfef3c7, 1.0);
    galleryKey.position.set(4, 10, 8);
    scene.add(galleryKey);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 28),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: marbleTex, roughness: 0.25, metalness: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const loader = new THREE.TextureLoader();
    const loadedTextures: THREE.Texture[] = [];
    const interactables: THREE.Mesh[] = [];

    memories.forEach((mem, idx) => {
      const x = idx * spacing;
      const frameGroup = new THREE.Group();
      frameGroup.position.set(x, 2.7, -3.5);

      const backing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.0, 0.22), mats.obsidian);
      const brassRim = new THREE.Mesh(new THREE.BoxGeometry(3.96, 3.16, 0.14), mats.brass);
      brassRim.position.z = -0.02;

      // Procedural fallback card texture
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 384;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#151126';
      ctx.fillRect(0, 0, 512, 384);
      ctx.fillStyle = '#C4B5FD';
      ctx.font = 'bold 26px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mem.movieTitle.slice(0, 26), 256, 180);
      ctx.fillStyle = '#F472B6';
      ctx.font = '18px "JetBrains Mono", monospace';
      ctx.fillText(`${mem.timestampLabel} · ${mem.movieDate}`, 256, 224);
      const fallbackTex = new THREE.CanvasTexture(c);
      fallbackTex.colorSpace = THREE.SRGBColorSpace;
      loadedTextures.push(fallbackTex);

      const artMat = new THREE.MeshBasicMaterial({ map: fallbackTex });
      if (mem.imageUrl) {
        loader.load(mem.imageUrl, (imgTex) => {
          imgTex.colorSpace = THREE.SRGBColorSpace;
          loadedTextures.push(imgTex);
          artMat.map = imgTex;
          artMat.needsUpdate = true;
        });
      }

      const art = new THREE.Mesh(new THREE.PlaneGeometry(3.45, 2.6), artMat);
      art.position.z = 0.12;
      art.userData.index = idx;
      interactables.push(art);

      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.6), mats.velvetDark);
      pedestal.position.set(0, -2.25, 0.2);

      frameGroup.add(brassRim, backing, art, pedestal);
      scene.add(frameGroup);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactables, false);
      if (hits.length > 0) {
        selectRef.current(hits[0].object.userData.index as number);
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    const loop = createPacedLoop(renderer, scene, camera, isSoftwareGl, (dt) => {
      const targetX = activeIdxRef.current * spacing;
      _camPos.set(targetX, 2.65, 3.1);
      _lookAt.set(targetX, 2.65, -3.5);
      const damp = 1 - Math.exp(-5 * dt);
      camera.position.lerp(_camPos, damp);
      camera.lookAt(_lookAt);
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
      renderer.domElement.removeEventListener('click', onClick);
      velvetBump.dispose();
      marbleTex.dispose();
      loadedTextures.forEach((t) => t.dispose());
      envTex.dispose();
      renderer.dispose();
    };
  }, [webglSupported, memories]);

  if (!webglSupported) {
    return (
      <div className="w-full h-full bg-[#090814] flex items-center justify-center">
        <p className="text-sm text-[#C4B5FD]">2D Gallery Mode Active</p>
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full" data-testid="memories-3d-canvas" />;
}
