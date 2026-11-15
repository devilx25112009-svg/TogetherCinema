import type { AudioMode, CameraMode, MovieRecord, ScreenMode } from '../types/cinema';

export interface ScreenModeSpec {
  mode: ScreenMode;
  aspectRatio: string;
  screenWidth3D: number;
  screenHeight3D: number;
  curveRadius3D: number;
  frontSeatCameraZ: number;
  cameraFov: number;
  isStereoscopic: boolean;
  isPanoramicSideWalls: boolean;
  isMotion4DX: boolean;
  tagline: string;
}

export const SCREEN_MODE_SPECS: Record<ScreenMode, ScreenModeSpec> = {
  'Normal Cinema': {
    mode: 'Normal Cinema',
    aspectRatio: '16 / 9',
    screenWidth3D: 24,
    screenHeight3D: 13.5,
    curveRadius3D: 38,
    frontSeatCameraZ: 3.4,
    cameraFov: 60,
    isStereoscopic: false,
    isPanoramicSideWalls: false,
    isMotion4DX: false,
    tagline: 'Signature curved 16:9 private luxury screen',
  },
  '3D': {
    mode: '3D',
    aspectRatio: '16 / 9',
    screenWidth3D: 25,
    screenHeight3D: 14.0,
    curveRadius3D: 32,
    frontSeatCameraZ: 3.1,
    cameraFov: 62,
    isStereoscopic: true,
    isPanoramicSideWalls: false,
    isMotion4DX: false,
    tagline: 'Stereoscopic depth projection with dual-parallax framing',
  },
  'IMAX': {
    mode: 'IMAX',
    aspectRatio: '1.90 / 1',
    screenWidth3D: 31,
    screenHeight3D: 19.5,
    curveRadius3D: 26,
    frontSeatCameraZ: 2.0,
    cameraFov: 68,
    isStereoscopic: false,
    isPanoramicSideWalls: false,
    isMotion4DX: false,
    tagline: 'Colossal floor-to-ceiling towering curved auditorium screen',
  },
  'IMAX 3D': {
    mode: 'IMAX 3D',
    aspectRatio: '1.90 / 1',
    screenWidth3D: 31,
    screenHeight3D: 19.5,
    curveRadius3D: 25,
    frontSeatCameraZ: 2.0,
    cameraFov: 68,
    isStereoscopic: true,
    isPanoramicSideWalls: false,
    isMotion4DX: false,
    tagline: 'Towering IMAX canvas with dual-projector stereoscopic depth',
  },
  'Dolby Cinema': {
    mode: 'Dolby Cinema',
    aspectRatio: '16 / 9',
    screenWidth3D: 27,
    screenHeight3D: 15.2,
    curveRadius3D: 30,
    frontSeatCameraZ: 2.8,
    cameraFov: 62,
    isStereoscopic: false,
    isPanoramicSideWalls: false,
    isMotion4DX: false,
    tagline: 'Obsidian light-trap theatre with dual-laser contrast framing',
  },
  'Screen X': {
    mode: 'Screen X',
    aspectRatio: '21 / 9',
    screenWidth3D: 36.4,
    screenHeight3D: 14.8,
    curveRadius3D: 120,
    frontSeatCameraZ: 3.8,
    cameraFov: 84,
    isStereoscopic: false,
    isPanoramicSideWalls: true,
    isMotion4DX: false,
    tagline: 'Original 270-degree flush three-wall panoramic wraparound projection',
  },
  '4DX': {
    mode: '4DX',
    aspectRatio: '16 / 9',
    screenWidth3D: 26,
    screenHeight3D: 14.6,
    curveRadius3D: 30,
    frontSeatCameraZ: 3.1,
    cameraFov: 64,
    isStereoscopic: false,
    isPanoramicSideWalls: false,
    isMotion4DX: true,
    tagline: 'Motion-synced front loveseat pitch, wind mist, and dynamic lighting',
  },
  'UltraWide': {
    mode: 'UltraWide',
    aspectRatio: '2.39 / 1',
    screenWidth3D: 29,
    screenHeight3D: 12.2,
    curveRadius3D: 30,
    frontSeatCameraZ: 2.9,
    cameraFov: 64,
    isStereoscopic: false,
    isPanoramicSideWalls: false,
    isMotion4DX: false,
    tagline: 'Anamorphic 2.39:1 wide cinemascope presentation',
  },
  'Theatre Mode': {
    mode: 'Theatre Mode',
    aspectRatio: '16 / 9',
    screenWidth3D: 26,
    screenHeight3D: 14.6,
    curveRadius3D: 36,
    frontSeatCameraZ: 2.8,
    cameraFov: 60,
    isStereoscopic: false,
    isPanoramicSideWalls: false,
    isMotion4DX: false,
    tagline: 'Dimmed house lights focused purely on the cinema canvas',
  },
  'Fullscreen': {
    mode: 'Fullscreen',
    aspectRatio: '16 / 9',
    screenWidth3D: 28,
    screenHeight3D: 15.8,
    curveRadius3D: 40,
    frontSeatCameraZ: 1.4,
    cameraFov: 60,
    isStereoscopic: false,
    isPanoramicSideWalls: false,
    isMotion4DX: false,
    tagline: 'Edge-to-edge full display cinema',
  },
};

export interface CompatibilityNotice {
  compatible: boolean;
  notice?: string;
}

export function checkScreenModeCompatibility(
  mode: ScreenMode,
  movie?: Pick<MovieRecord, 'stereoscopicFormat' | 'sourceHeight'> | null
): CompatibilityNotice {
  if (mode === '3D' || mode === 'IMAX 3D') {
    if (!movie || movie.stereoscopicFormat === 'none' || !movie.stereoscopicFormat) {
      return {
        compatible: false,
        notice:
          `${mode} simulates stereoscopic depth framing in the 3D auditorium. True stereoscopic 3D requires a Side-by-Side (SBS) or Top-and-Bottom source file and compatible 3D display hardware.`,
      };
    }
    return { compatible: true };
  }

  if (mode === 'IMAX' && movie && movie.sourceHeight < 1080) {
    return {
      compatible: false,
      notice: 'Source video is below 1080p; IMAX scale preserves native source pixels without synthetic 4K/8K upscaling.',
    };
  }

  if (mode === 'Screen X') {
    return {
      compatible: true,
      notice:
        'Original ScreenX 270° active — flush three-wall projection wraps left, center, and right walls. Drag anywhere on the theatre to look around (double-click to recenter).',
    };
  }

  if (mode === '4DX') {
    return {
      compatible: true,
      notice: '4DX enables subtle motion-seat camera kinematics and atmospheric mist particles inside the 3D auditorium.',
    };
  }

  return { compatible: true };
}

export function checkAudioModeSupport(
  audioMode: AudioMode,
  movie?: Pick<MovieRecord, 'audioTracks'> | null
): CompatibilityNotice {
  if (audioMode === 'Dolby Atmos') {
    const hasAtmosTrack = movie?.audioTracks?.some((t) => t.channels === 'Atmos');
    if (!hasAtmosTrack) {
      return {
        compatible: false,
        notice:
          'Dolby Atmos output requires both an Atmos-encoded source track and browser/OS spatial audio hardware support. Falling back to available Stereo/Original track.',
      };
    }
  }
  if ((audioMode === '5.1' || audioMode === '7.1') && movie?.audioTracks) {
    const hasSurround = movie.audioTracks.some((t) => t.channels === audioMode || t.channels === 'Atmos');
    if (!hasSurround) {
      return {
        compatible: false,
        notice: `${audioMode} surround track is not embedded in this file; using Original Audio stream.`,
      };
    }
  }
  return { compatible: true };
}

export const CAMERA_PRESETS: Record<
  CameraMode,
  { pos: [number, number, number]; lookAt: [number, number, number]; fovDelta: number }
> = {
  'Front Row': { pos: [0, 4.95, 15.6], lookAt: [0, 3.85, -13.5], fovDelta: 3 },
  'Centre Seating': { pos: [0, 5.55, 17.2], lookAt: [0, 4.15, -13.5], fovDelta: 2 },
  'Back Row': { pos: [0, 6.25, 18.8], lookAt: [0, 4.5, -13.5], fovDelta: 0 },
  'Wide View': { pos: [11.6, 6.4, 15.8], lookAt: [0, 4.1, -10.5], fovDelta: 8 },
  'Player Focus': { pos: [0, 4.4, 9.6], lookAt: [0, 4.6, -13.5], fovDelta: 0 },
};
