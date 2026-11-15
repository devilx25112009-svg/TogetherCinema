export interface ParsedYouTubeUrl {
  videoId: string;
  watchUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  streamUrl: string;
  startSeconds: number;
}

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Parses YouTube timestamp query strings such as "90", "90s", "1m30s", or "1h2m3s".
 */
export function parseYouTubeTimeParam(raw?: string | null): number {
  if (!raw) return 0;
  const trimmed = raw.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return Math.max(0, Number(trimmed));
  if (/^\d+s$/.test(trimmed)) return Math.max(0, Number(trimmed.slice(0, -1)));
  const match = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return 0;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  return Math.max(0, h * 3600 + m * 60 + s);
}

/**
 * Parses any standard YouTube URL or internal `youtube://<id>` URI into normalized playback metadata.
 */
export function parseYouTubeUrl(input?: string | null): ParsedYouTubeUrl | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('youtube://')) {
    const rest = trimmed.slice('youtube://'.length).split(/[/?#]/)[0];
    if (!YOUTUBE_ID_REGEX.test(rest)) return null;
    return {
      videoId: rest,
      watchUrl: `https://www.youtube.com/watch?v=${rest}`,
      embedUrl: `https://www.youtube.com/embed/${rest}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${rest}/hqdefault.jpg`,
      streamUrl: `youtube://${rest}`,
      startSeconds: 0,
    };
  }

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
    if (/^(www\.|m\.|music\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return null;
    }
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    const seg = url.pathname.split('/').filter(Boolean)[0] || '';
    if (YOUTUBE_ID_REGEX.test(seg)) videoId = seg;
  } else if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const vParam = url.searchParams.get('v');
    if (vParam && YOUTUBE_ID_REGEX.test(vParam)) {
      videoId = vParam;
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      // Support /shorts/:id, /embed/:id, /live/:id, /v/:id
      if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
        if (YOUTUBE_ID_REGEX.test(parts[1])) {
          videoId = parts[1];
        }
      }
    }
  }

  if (!videoId) return null;

  const startSeconds = parseYouTubeTimeParam(url.searchParams.get('t') || url.searchParams.get('start'));

  return {
    videoId,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    streamUrl: startSeconds > 0 ? `youtube://${videoId}?t=${startSeconds}` : `youtube://${videoId}`,
    startSeconds,
  };
}

export function isYouTubeStreamUrl(streamUrl?: string | null): boolean {
  return Boolean(parseYouTubeUrl(streamUrl));
}

export function extractYouTubeVideoInfo(streamUrl?: string | null): { videoId: string; startSeconds: number } | null {
  if (!streamUrl) return null;
  const trimmed = streamUrl.trim();
  if (trimmed.startsWith('youtube://')) {
    const [idPart, queryPart] = trimmed.slice('youtube://'.length).split('?');
    if (!YOUTUBE_ID_REGEX.test(idPart)) return null;
    const params = new URLSearchParams(queryPart || '');
    return {
      videoId: idPart,
      startSeconds: parseYouTubeTimeParam(params.get('t') || params.get('start')),
    };
  }
  const parsed = parseYouTubeUrl(trimmed);
  if (!parsed) return null;
  return {
    videoId: parsed.videoId,
    startSeconds: parsed.startSeconds,
  };
}
