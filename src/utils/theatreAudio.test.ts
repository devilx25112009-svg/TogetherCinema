import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeContainerAudioBytes,
  buildFfmpegRemuxCommandHint,
  buildTheatreDspProfile,
  isBrowserUnsupportedAudioCodec,
} from './theatreAudio';

test('analyzeContainerAudioBytes detects AC-3 / DTS / TrueHD vs browser-playable AAC tracks', () => {
  const mkvDtsHeader = new TextEncoder().encode('....matroska....V_MPEGH/ISO/HEVC....A_DTS....');
  const dtsRes = analyzeContainerAudioBytes(mkvDtsHeader, 'Blade.Runner.2049.32.8GB.mkv');
  assert.equal(dtsRes.container, 'MKV/WebM');
  assert.equal(dtsRes.hasUnsupportedSurroundCodec, true);
  assert.equal(dtsRes.unsupportedCodecLabel, 'DTS / DTS-HD');

  const mp4AacHeader = new TextEncoder().encode('ftypisom....moov....avc1....mp4a....');
  const aacRes = analyzeContainerAudioBytes(mp4AacHeader, 'MidnightOrbit_4K.mp4');
  assert.equal(aacRes.container, 'MP4/MOV');
  assert.equal(aacRes.hasBrowserPlayableAudio, true);
  assert.equal(aacRes.hasUnsupportedSurroundCodec, false);

  const dualTrackHeader = new TextEncoder().encode('ftypmp42....hev1....ac-3....mp4a....');
  const dualRes = analyzeContainerAudioBytes(dualTrackHeader, 'Dune_DualTrack.mp4');
  assert.equal(dualRes.hasUnsupportedSurroundCodec, false);
  assert.equal(dualRes.hasBrowserPlayableAudio, true);
  assert.ok(dualRes.detectedCodecs.includes('Dolby Digital (AC-3)'));
  assert.ok(dualRes.detectedCodecs.includes('AAC'));
});

test('isBrowserUnsupportedAudioCodec flags Dolby/DTS surround codecs accurately', () => {
  assert.equal(isBrowserUnsupportedAudioCodec('ac3'), true);
  assert.equal(isBrowserUnsupportedAudioCodec('eac3'), true);
  assert.equal(isBrowserUnsupportedAudioCodec('dts'), true);
  assert.equal(isBrowserUnsupportedAudioCodec('truehd'), true);
  assert.equal(isBrowserUnsupportedAudioCodec('aac'), false);
  assert.equal(isBrowserUnsupportedAudioCodec('opus'), false);
});

test('buildTheatreDspProfile scales LFE bass, dialogue focus, and spatial reverb for Atmos/7.1', () => {
  const stereo = buildTheatreDspProfile('Stereo');
  const atmos = buildTheatreDspProfile('Dolby Atmos');
  assert.ok(atmos.lfeGainDb > stereo.lfeGainDb);
  assert.ok(atmos.reverbWet > stereo.reverbWet);
  assert.ok(atmos.stereoWidthMs > 0);
});

test('buildFfmpegRemuxCommandHint preserves video copy while converting audio to 384k AAC', () => {
  const cmd = buildFfmpegRemuxCommandHint('Inception.32.8GB.mkv');
  assert.ok(cmd.includes('-c:v copy'));
  assert.ok(cmd.includes('-c:a aac'));
  assert.ok(cmd.includes('384k'));
});
