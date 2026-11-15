import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let cachedSoftwareGl: boolean | null = null;

export function detectSoftwareWebGL(): boolean {
  if (cachedSoftwareGl !== null) return cachedSoftwareGl;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cachedSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedSoftwareGl;
  } catch {
    cachedSoftwareGl = true;
    return true;
  }
}

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function createCinemaRenderer(container: HTMLElement, isSoftwareGl: boolean): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);
  return renderer;
}

export function attachStudioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();
  return envTex;
}

export interface LoopController {
  start: () => void;
  stop: () => void;
}

export function createPacedLoop(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  isSoftwareGl: boolean,
  onTick: (dt: number, elapsed: number) => void
): LoopController {
  let active = false;
  let frameId = 0;
  let lastTime = performance.now();
  const startTime = lastTime;

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      frameId = window.setTimeout(cb, 16);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (!active) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 16);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function tick() {
    if (!active) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    const elapsed = (now - startTime) / 1000;
    lastTime = now;

    onTick(dt, elapsed);
    renderer.render(scene, camera);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      lastTime = performance.now();
      tick();
    },
    stop() {
      active = false;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    },
  };
}

export function createMarbleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0c0b16';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle tile seams and veined marble strokes
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.14)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  for (let v = 0; v < 22; v++) {
    ctx.beginPath();
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 140;
      y += (Math.random() - 0.5) * 140;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = v % 3 === 0 ? 'rgba(196, 181, 253, 0.08)' : 'rgba(131, 169, 255, 0.06)';
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  return tex;
}

export function createVelvetBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 110 + Math.floor(Math.random() * 45);
    img.data[i] = n;
    img.data[i + 1] = n;
    img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export function createAcousticRibBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = '#222222';
    ctx.fillRect(x, 0, 6, 256);
    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(x + 6, 0, 10, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  return tex;
}

export function createCinemaCarpetTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich deep burgundy-plum auditorium carpet base
  ctx.fillStyle = '#140b1d';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle geometric diamond lattice inspired by luxury multiplex carpets
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.12)';
  ctx.lineWidth = 2;
  const step = 64;
  for (let y = -step; y < 512 + step; y += step) {
    for (let x = -step; x < 512 + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + step / 2, y);
      ctx.lineTo(x + step, y + step / 2);
      ctx.lineTo(x + step / 2, y + step);
      ctx.lineTo(x, y + step / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Fine woven fiber speckles & warm gold/rose threads
  for (let i = 0; i < 4200; i++) {
    const px = (i * 73) % 512;
    const py = ((i * 197) + Math.floor(i / 8) * 19) % 512;
    ctx.fillStyle =
      i % 23 === 0
        ? 'rgba(244, 114, 182, 0.10)'
        : i % 17 === 0
        ? 'rgba(217, 119, 6, 0.08)'
        : i % 2 === 0
        ? 'rgba(255, 255, 255, 0.028)'
        : 'rgba(6, 4, 12, 0.35)';
    ctx.fillRect(px, py, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 16);
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  return tex;
}
