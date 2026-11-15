import type { AudioMode } from '../types/cinema';

export interface ContainerAudioAnalysis {
  container: 'MP4/MOV' | 'MKV/WebM' | 'TS/M2TS' | 'Other';
  detectedCodecs: string[];
  hasBrowserPlayableAudio: boolean;
  hasUnsupportedSurroundCodec: boolean;
  unsupportedCodecLabel: string | null;
  summary: string;
}

export interface TheatreDspProfile {
  mode: AudioMode;
  lfeGainDb: number;
  dialogueGainDb: number;
  airGainDb: number;
  reverbWet: number;
  stereoWidthMs: number;
  makeupGain: number;
  label: string;
}

const UNSUPPORTED_FFMPEG_CODECS = new Set([
  'ac3',
  'eac3',
  'dts',
  'dca',
  'truehd',
  'mlp',
  'wmapro',
  'wmav2',
]);

export function isBrowserUnsupportedAudioCodec(codecName?: string | null): boolean {
  if (!codecName) return false;
  return UNSUPPORTED_FFMPEG_CODECS.has(codecName.trim().toLowerCase());
}

export function analyzeContainerAudioBytes(
  headerBytes: Uint8Array,
  fileName: string
): ContainerAudioAnalysis {
  const lowerName = fileName.toLowerCase();
  const container: ContainerAudioAnalysis['container'] = lowerName.endsWith('.mkv') || lowerName.endsWith('.webm')
    ? 'MKV/WebM'
    : lowerName.endsWith('.ts') || lowerName.endsWith('.m2ts')
    ? 'TS/M2TS'
    : lowerName.endsWith('.mp4') || lowerName.endsWith('.m4v') || lowerName.endsWith('.mov')
    ? 'MP4/MOV'
    : 'Other';

  // Scan up to 1 MB of combined container header + tail bytes for codec FourCCs / EBML CodecIDs
  const scanLen = Math.min(headerBytes.length, 1_048_576);
  let text = '';
  for (let i = 0; i < scanLen; i += 4096) {
    const end = Math.min(scanLen, i + 4096);
    let chunk = '';
    for (let j = i; j < end; j++) {
      const b = headerBytes[j];
      chunk += b >= 32 && b <= 126 ? String.fromCharCode(b) : ' ';
    }
    text += chunk;
  }

  const codecs = new Set<string>();
  let hasPlayable = false;
  let unsupportedLabel: string | null = null;

  if (text.includes('mp4a') || text.includes('A_AAC')) {
    codecs.add('AAC');
    hasPlayable = true;
  }
  if (text.includes('A_OPUS') || text.includes('OpusHead')) {
    codecs.add('Opus');
    hasPlayable = true;
  }
  if (text.includes('A_VORBIS') || text.includes('vorbis')) {
    codecs.add('Vorbis');
    hasPlayable = true;
  }
  if (text.includes('A_FLAC') || text.includes('fLaC')) {
    codecs.add('FLAC');
    hasPlayable = true;
  }
  if (text.includes('A_MPEG/L3') || text.includes('.mp3')) {
    codecs.add('MP3');
    hasPlayable = true;
  }

  if (text.includes('A_TRUEHD') || text.includes('mlpa')) {
    codecs.add('Dolby TrueHD');
    unsupportedLabel = unsupportedLabel || 'Dolby TrueHD';
  }
  if (text.includes('A_DTS') || text.includes('dtsc') || text.includes('dtsh') || text.includes('dtsl') || text.includes('dtse')) {
    codecs.add('DTS / DTS-HD');
    unsupportedLabel = unsupportedLabel || 'DTS / DTS-HD';
  }
  if (text.includes('A_EAC3') || text.includes('ec-3')) {
    codecs.add('Dolby Digital Plus (E-AC-3)');
    unsupportedLabel = unsupportedLabel || 'Dolby Digital Plus (E-AC-3)';
  }
  if (text.includes('A_AC3') || text.includes('ac-3')) {
    codecs.add('Dolby Digital (AC-3)');
    unsupportedLabel = unsupportedLabel || 'Dolby Digital (AC-3)';
  }

  const hasUnsupported = Boolean(unsupportedLabel) && !hasPlayable;
  let summary = 'Browser-native stereo/surround audio ready';
  if (hasUnsupported && unsupportedLabel) {
    summary = `${unsupportedLabel} audio detected — browsers play the video track natively but cannot decode ${unsupportedLabel} without AAC compatibility remuxing.`;
  } else if (unsupportedLabel && hasPlayable) {
    summary = `Multiple audio tracks detected (${Array.from(codecs).join(', ')}). Select an AAC/Stereo track if primary surround track is silent.`;
  }

  return {
    container,
    detectedCodecs: Array.from(codecs),
    hasBrowserPlayableAudio: hasPlayable,
    hasUnsupportedSurroundCodec: hasUnsupported,
    unsupportedCodecLabel: unsupportedLabel,
    summary,
  };
}

export async function analyzeLocalVideoFile(file: File): Promise<ContainerAudioAnalysis> {
  const headLen = Math.min(file.size, 262_144);
  const headBytes = new Uint8Array(await file.slice(0, headLen).arrayBuffer());
  if (file.size <= 262_144) {
    return analyzeContainerAudioBytes(headBytes, file.name);
  }
  const tailStart = Math.max(headLen, file.size - 524_288);
  const tailBytes = new Uint8Array(await file.slice(tailStart, file.size).arrayBuffer());
  const combined = new Uint8Array(headBytes.length + tailBytes.length);
  combined.set(headBytes, 0);
  combined.set(tailBytes, headBytes.length);
  return analyzeContainerAudioBytes(combined, file.name);
}

export function buildTheatreDspProfile(audioMode: AudioMode): TheatreDspProfile {
  switch (audioMode) {
    case 'Dolby Atmos':
      return {
        mode: audioMode,
        lfeGainDb: 6.0,
        dialogueGainDb: 3.2,
        airGainDb: 2.8,
        reverbWet: 0.24,
        stereoWidthMs: 16,
        makeupGain: 1.38,
        label: 'Dolby Atmos Spatial Theatre Engine (Sub-Bass + Hall Reverb + Wide Stage)',
      };
    case '7.1':
      return {
        mode: audioMode,
        lfeGainDb: 5.2,
        dialogueGainDb: 2.8,
        airGainDb: 2.2,
        reverbWet: 0.18,
        stereoWidthMs: 12,
        makeupGain: 1.32,
        label: '7.1 Auditorium Surround DSP (Deep LFE + Wide Rear Imaging)',
      };
    case '5.1':
      return {
        mode: audioMode,
        lfeGainDb: 4.5,
        dialogueGainDb: 2.4,
        airGainDb: 1.8,
        reverbWet: 0.13,
        stereoWidthMs: 9,
        makeupGain: 1.26,
        label: '5.1 Cinema Acoustics (Warm Sub-Bass + Centre Voice Focus)',
      };
    case 'Stereo':
      return {
        mode: audioMode,
        lfeGainDb: 2.4,
        dialogueGainDb: 1.8,
        airGainDb: 1.2,
        reverbWet: 0.05,
        stereoWidthMs: 0,
        makeupGain: 1.18,
        label: 'Enhanced Cinema Stereo (Dynamic Dialogue Boost)',
      };
    case 'Original Audio':
    default:
      return {
        mode: audioMode,
        lfeGainDb: 1.5,
        dialogueGainDb: 1.2,
        airGainDb: 0.8,
        reverbWet: 0.02,
        stereoWidthMs: 0,
        makeupGain: 1.12,
        label: 'Original Master Audio + Cinema Loudness Normalization',
      };
  }
}

export function buildFfmpegRemuxCommandHint(fileName: string): string {
  const safeName = fileName.replace(/"/g, '\\"');
  const outName = safeName.replace(/\.[^.]+$/, '') + '_theatre_aac.mp4';
  return `ffmpeg -i "${safeName}" -c:v copy -c:a aac -ac 2 -b:a 384k -movflags +faststart "${outName}"`;
}

/**
 * Web Audio Theatre Sound Engine:
 * Applies sub-bass LFE warmth, dialogue clarity EQ, dynamic cinema loudness leveling,
 * spatial Haas widening, and synthetic luxury auditorium reverb without ever muting playback
 * prior to user gesture activation.
 */
export class TheatreAudioEngine {
  private ctx: AudioContext | null = null;
  private connectedElements = new WeakSet<HTMLMediaElement>();
  private inputGain: GainNode | null = null;
  private lfeFilter: BiquadFilterNode | null = null;
  private dialogueFilter: BiquadFilterNode | null = null;
  private airFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private sideDelay: DelayNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBins: Uint8Array<ArrayBuffer> | null = null;
  private enabled = true;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.buildGraph(this.ctx);
    }
    return this.ctx;
  }

  private buildGraph(ctx: AudioContext) {
    this.inputGain = ctx.createGain();
    this.lfeFilter = ctx.createBiquadFilter();
    this.lfeFilter.type = 'lowshelf';
    this.lfeFilter.frequency.value = 82;

    this.dialogueFilter = ctx.createBiquadFilter();
    this.dialogueFilter.type = 'peaking';
    this.dialogueFilter.frequency.value = 2800;
    this.dialogueFilter.Q.value = 1.1;

    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'highshelf';
    this.airFilter.frequency.value = 10500;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;

    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.createAuditoriumImpulse(ctx, 1.35, 2.8);

    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);
    this.sideDelay = ctx.createDelay(0.05);
    this.sideDelay.delayTime.value = 0;

    this.masterGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyserBins = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    // Chain: input -> LFE -> dialogue -> air -> compressor
    this.inputGain.connect(this.lfeFilter);
    this.lfeFilter.connect(this.dialogueFilter);
    this.dialogueFilter.connect(this.airFilter);
    this.airFilter.connect(this.compressor);

    // Dry stereo spatial stage
    this.compressor.connect(this.splitter);
    this.splitter.connect(this.merger, 0, 0);
    this.splitter.connect(this.sideDelay, 1);
    this.sideDelay.connect(this.merger, 0, 1);
    this.merger.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);

    // Warm auditorium hall reverb branch
    this.compressor.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.masterGain);

    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  private createAuditoriumImpulse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Skip first ~12ms for crisp direct-sound separation, then velvet hall tail
        if (i < ctx.sampleRate * 0.012) {
          data[i] = 0;
        } else {
          const t = i / length;
          const env = Math.pow(1 - t, decay);
          data[i] = (Math.random() * 2 - 1) * env * 0.45;
        }
      }
    }
    return impulse;
  }

  public async attachAndUnlock(mediaEl: HTMLMediaElement | null, mode: AudioMode, theatreEnhanced: boolean): Promise<boolean> {
    this.enabled = theatreEnhanced;
    const ctx = this.ensureContext();
    if (!ctx) return false;

    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch {
      return false;
    }

    // Only capture MediaElementSource AFTER AudioContext is running so we never silence native <video> audio
    if (mediaEl && ctx.state === 'running' && !this.connectedElements.has(mediaEl) && this.inputGain) {
      try {
        const src = ctx.createMediaElementSource(mediaEl);
        src.connect(this.inputGain);
        this.connectedElements.add(mediaEl);
      } catch {
        // Ignore if cross-origin/already captured by browser
      }
    }

    this.applyProfile(mode, theatreEnhanced);
    return ctx.state === 'running';
  }

  public applyProfile(mode: AudioMode, theatreEnhanced: boolean) {
    this.enabled = theatreEnhanced;
    if (!this.ctx || !this.lfeFilter || !this.dialogueFilter || !this.airFilter || !this.dryGain || !this.wetGain || !this.sideDelay || !this.masterGain) {
      return;
    }
    const profile = theatreEnhanced
      ? buildTheatreDspProfile(mode)
      : {
          lfeGainDb: 0,
          dialogueGainDb: 0,
          airGainDb: 0,
          reverbWet: 0,
          stereoWidthMs: 0,
          makeupGain: 1,
        };

    const now = this.ctx.currentTime;
    this.lfeFilter.gain.setTargetAtTime(profile.lfeGainDb, now, 0.08);
    this.dialogueFilter.gain.setTargetAtTime(profile.dialogueGainDb, now, 0.08);
    this.airFilter.gain.setTargetAtTime(profile.airGainDb, now, 0.08);
    this.wetGain.gain.setTargetAtTime(profile.reverbWet, now, 0.08);
    this.dryGain.gain.setTargetAtTime(1.0, now, 0.08);
    this.sideDelay.delayTime.setTargetAtTime(profile.stereoWidthMs / 1000, now, 0.08);
    this.masterGain.gain.setTargetAtTime(profile.makeupGain, now, 0.08);
  }

  public sampleOutputLevel(): number {
    if (!this.analyser || !this.analyserBins || this.ctx?.state !== 'running') return 0;
    this.analyser.getByteTimeDomainData(this.analyserBins);
    let peak = 0;
    for (let i = 0; i < this.analyserBins.length; i++) {
      const dev = Math.abs(this.analyserBins[i] - 128) / 128;
      if (dev > peak) peak = dev;
    }
    return Math.min(1, peak * 2.2);
  }

  public isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  public isAttached(mediaEl: HTMLMediaElement | null): boolean {
    return Boolean(mediaEl && this.connectedElements.has(mediaEl));
  }

  public dispose() {
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
