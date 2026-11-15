import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { promisify } from 'node:util';
import type { AudioTrackInfo, QualityOption, SubtitleTrackInfo } from '../../types/cinema';
import { computeAvailableRenditions } from '../../utils/uploadLogic';
import { isBrowserUnsupportedAudioCodec } from '../../utils/theatreAudio';

const execFileAsync = promisify(execFile);

export interface VideoInspectionResult {
  ffmpegAvailable: boolean;
  processingStatus: 'ready' | 'ffmpeg_unavailable' | 'failed';
  durationSeconds: number;
  width: number;
  height: number;
  resolutionLabel: string;
  videoFormat: string;
  audioFormat: string;
  audioNeedsCompat: boolean;
  audioTracks: AudioTrackInfo[];
  subtitles: SubtitleTrackInfo[];
  availableRenditions: QualityOption[];
  note: string;
}

export async function checkFfmpegInstalled(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
  const ffprobeBin = process.env.FFPROBE_BIN || 'ffprobe';

  const check = async (bin: string) => {
    try {
      await execFileAsync(bin, ['-version'], { timeout: 2500 });
      return true;
    } catch {
      return false;
    }
  };

  const [ffmpeg, ffprobe] = await Promise.all([check(ffmpegBin), check(ffprobeBin)]);
  return { ffmpeg, ffprobe };
}

export async function inspectVideoObject(filePath: string | null): Promise<VideoInspectionResult> {
  const tools = await checkFfmpegInstalled();

  if (!tools.ffprobe || !filePath) {
    return {
      ffmpegAvailable: false,
      processingStatus: 'ffmpeg_unavailable',
      durationSeconds: 0,
      width: 1920,
      height: 1080,
      resolutionLabel: 'Original Source',
      videoFormat: 'HTML5 Stream',
      audioFormat: 'Original Audio',
      audioNeedsCompat: false,
      audioTracks: [{ id: 'orig-1', label: 'Original Audio', language: 'en', channels: '2.0' }],
      subtitles: [],
      availableRenditions: ['Original'],
      note: 'FFmpeg/FFprobe binary is not configured in this environment. Original source streaming is enabled without server-side HLS transcoding.',
    };
  }

  try {
    const ffprobeBin = process.env.FFPROBE_BIN || 'ffprobe';
    const { stdout } = await execFileAsync(
      ffprobeBin,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 15000 }
    );

    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string; format_name?: string };
      streams?: Array<{
        index: number;
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        channels?: number;
        tags?: { language?: string; title?: string };
      }>;
    };

    const streams = parsed.streams || [];
    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStreams = streams.filter((s) => s.codec_type === 'audio');
    const subStreams = streams.filter((s) => s.codec_type === 'subtitle');

    const height = videoStream?.height || 1080;
    const width = videoStream?.width || 1920;
    const durationSeconds = Math.round(Number(parsed.format?.duration || 0));

    const resolutionLabel =
      height >= 4320
        ? '8K UHD (4320p)'
        : height >= 2160
        ? '4K UHD (2160p)'
        : height >= 1440
        ? '1440p QHD'
        : height >= 1080
        ? '1080p Full HD'
        : `${height}p`;

    const audioTracks: AudioTrackInfo[] =
      audioStreams.length > 0
        ? audioStreams.map((a, idx) => ({
            id: `audio-${a.index}`,
            label: a.tags?.title || `Track ${idx + 1} (${(a.codec_name || 'AAC').toUpperCase()})`,
            language: a.tags?.language || 'und',
            channels: a.channels && a.channels >= 8 ? '7.1' : a.channels && a.channels >= 6 ? '5.1' : '2.0',
            codec: a.codec_name || undefined,
          }))
        : [{ id: 'orig-1', label: 'Original Audio', language: 'en', channels: '2.0' }];

    const primaryAudioCodec = audioStreams[0]?.codec_name;
    const hasPlayableBrowserTrack = audioStreams.some((a) => !isBrowserUnsupportedAudioCodec(a.codec_name));
    const audioNeedsCompat = Boolean(primaryAudioCodec && isBrowserUnsupportedAudioCodec(primaryAudioCodec) && !hasPlayableBrowserTrack);

    const subtitles: SubtitleTrackInfo[] = subStreams.map((sub, idx) => ({
      id: `sub-${sub.index}`,
      label: sub.tags?.title || `Subtitle ${idx + 1}`,
      language: sub.tags?.language || 'und',
    }));

    return {
      ffmpegAvailable: tools.ffmpeg,
      processingStatus: 'ready',
      durationSeconds,
      width,
      height,
      resolutionLabel,
      videoFormat: (videoStream?.codec_name || parsed.format?.format_name || 'MP4').toUpperCase(),
      audioFormat: audioTracks[0]?.channels === '5.1'
        ? `5.1 Surround (${(primaryAudioCodec || 'AAC').toUpperCase()})`
        : `${(primaryAudioCodec || 'Stereo').toUpperCase()}`,
      audioNeedsCompat,
      audioTracks,
      subtitles,
      availableRenditions: computeAvailableRenditions(height),
      note: audioNeedsCompat
        ? `Detected ${primaryAudioCodec?.toUpperCase()} surround track; live FFmpeg AAC compatibility stream enabled.`
        : 'Inspected via FFprobe. Adaptive renditions capped at native source resolution.',
    };
  } catch (err) {
    return {
      ffmpegAvailable: tools.ffmpeg,
      processingStatus: 'failed',
      durationSeconds: 0,
      width: 1920,
      height: 1080,
      resolutionLabel: 'Original Source',
      videoFormat: 'Unknown',
      audioFormat: 'Original Audio',
      audioNeedsCompat: false,
      audioTracks: [{ id: 'orig-1', label: 'Original Audio', language: 'en', channels: '2.0' }],
      subtitles: [],
      availableRenditions: ['Original'],
      note: `Inspection failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export function spawnFfmpegAudioCompatStream(
  inputTarget: string,
  options?: { seekSeconds?: number; audioIndex?: number; audioOnly?: boolean }
): ChildProcessByStdio<null, Readable, Readable> {
  const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
  const seek = Math.max(0, Number(options?.seekSeconds || 0));
  const audioIdx = Math.max(0, Number(options?.audioIndex || 0));
  const args: string[] = ['-hide_banner', '-loglevel', 'error'];

  if (seek > 0) {
    args.push('-ss', seek.toFixed(2));
  }
  args.push('-i', inputTarget);

  if (options?.audioOnly) {
    args.push(
      '-vn',
      '-map',
      `0:a:${audioIdx}?`,
      '-c:a',
      'aac',
      '-ac',
      '2',
      '-b:a',
      '320k',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1'
    );
  } else {
    args.push(
      '-map',
      '0:v:0',
      '-map',
      `0:a:${audioIdx}?`,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-ac',
      '2',
      '-b:a',
      '384k',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1'
    );
  }

  return spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}
