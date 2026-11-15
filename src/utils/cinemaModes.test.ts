import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_PRESETS,
  checkAudioModeSupport,
  checkScreenModeCompatibility,
  SCREEN_MODE_SPECS,
} from './cinemaModes';

test('all requested screen modes exist and IMAX is significantly larger than Normal Cinema', () => {
  const requiredModes = ['Normal Cinema', '3D', 'IMAX', 'IMAX 3D', 'Dolby Cinema', 'Screen X', '4DX'] as const;
  for (const mode of requiredModes) {
    assert.ok(SCREEN_MODE_SPECS[mode], `Missing spec for ${mode}`);
  }
  assert.ok(SCREEN_MODE_SPECS['IMAX'].screenWidth3D > SCREEN_MODE_SPECS['Normal Cinema'].screenWidth3D);
  assert.ok(SCREEN_MODE_SPECS['IMAX'].screenHeight3D > SCREEN_MODE_SPECS['Normal Cinema'].screenHeight3D);
  assert.equal(SCREEN_MODE_SPECS['Screen X'].isPanoramicSideWalls, true);
  assert.ok(SCREEN_MODE_SPECS['Screen X'].screenWidth3D >= 36);
  assert.ok(SCREEN_MODE_SPECS['Screen X'].cameraFov >= 84);
  assert.equal(SCREEN_MODE_SPECS['4DX'].isMotion4DX, true);
});

test('compatibility checks accurately warn on unsupported 3D or Atmos hardware/source', () => {
  const non3dCheck = checkScreenModeCompatibility('IMAX 3D', { stereoscopicFormat: 'none', sourceHeight: 2160 });
  assert.equal(non3dCheck.compatible, false);
  assert.ok(non3dCheck.notice?.includes('Side-by-Side'));

  const sbsCheck = checkScreenModeCompatibility('3D', { stereoscopicFormat: 'sbs', sourceHeight: 2160 });
  assert.equal(sbsCheck.compatible, true);

  const atmosCheck = checkAudioModeSupport('Dolby Atmos', {
    audioTracks: [{ id: 'a1', label: 'English Stereo', language: 'en', channels: '2.0' }],
  });
  assert.equal(atmosCheck.compatible, false);
});

test('Front Row camera preset is positioned close to the screen for front-seat immersion', () => {
  assert.ok(CAMERA_PRESETS['Front Row'].pos[2] < CAMERA_PRESETS['Centre Seating'].pos[2]);
  assert.ok(CAMERA_PRESETS['Centre Seating'].pos[2] < CAMERA_PRESETS['Back Row'].pos[2]);
});
