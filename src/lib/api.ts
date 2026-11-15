import type {
  ChatMessageRecord,
  CinemaRoomRecord,
  MemoryItemRecord,
  MovieRecord,
  PartnerProfile,
  PlaybackState,
  RoomParticipant,
  SnackItemRecord,
  UploadSessionRecord,
  WatchlistItemRecord,
} from '../types/cinema';

function buildHeaders(user?: PartnerProfile | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (user) {
    headers['X-User-Id'] = user.uid;
    headers['X-User-Name'] = user.displayName;
  }
  return headers;
}

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface HealthResponse {
  ok: boolean;
  storage: {
    provider: 'local' | 's3' | 'gcs';
    configured: boolean;
    quotaBytes: number;
    usedBytes: number;
    cdnBaseUrl: string | null;
    message: string;
    endpoint?: string;
    bucket?: string;
  };
  processing: {
    ffmpegAvailable: boolean;
    ffprobeAvailable: boolean;
  };
  gifProviderConfigured: boolean;
  roomsCount: number;
  moviesCount: number;
}

export const cinemaApi = {
  getHealth: () => fetch('/api/health').then((r) => handleJson<HealthResponse>(r)),

  // Movies
  listMovies: (q = '', genre = 'All') =>
    fetch(`/api/movies?q=${encodeURIComponent(q)}&genre=${encodeURIComponent(genre)}`).then((r) =>
      handleJson<{ movies: MovieRecord[] }>(r)
    ),
  getMovie: (id: string) =>
    fetch(`/api/movies/${encodeURIComponent(id)}`).then((r) => handleJson<{ movie: MovieRecord }>(r)),
  createMovie: (payload: Partial<MovieRecord>, user?: PartnerProfile | null) =>
    fetch('/api/movies', {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ movie: MovieRecord }>(r)),
  updateMovie: (id: string, patch: Partial<MovieRecord>, user?: PartnerProfile | null) =>
    fetch(`/api/movies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(user),
      body: JSON.stringify(patch),
    }).then((r) => handleJson<{ movie: MovieRecord }>(r)),
  deleteMovie: (id: string, user?: PartnerProfile | null) =>
    fetch(`/api/movies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(user),
    }).then((r) => handleJson<{ ok: boolean }>(r)),
  resolveYouTubeMetadata: (url: string) =>
    fetch(`/api/youtube/metadata?url=${encodeURIComponent(url)}`).then((r) =>
      handleJson<{
        videoId: string;
        title: string;
        authorName: string;
        thumbnailUrl: string;
        watchUrl: string;
        embedUrl: string;
        streamUrl: string;
        startSeconds: number;
        resolvedFromOembed: boolean;
      }>(r)
    ),

  // Large Resumable Uploads
  listUploadSessions: (user?: PartnerProfile | null) =>
    fetch('/api/uploads/sessions', { headers: buildHeaders(user) }).then((r) =>
      handleJson<{ sessions: UploadSessionRecord[] }>(r)
    ),
  createUploadSession: (
    payload: { fileName: string; fileSizeBytes: number; mimeType: string },
    user?: PartnerProfile | null
  ) =>
    fetch('/api/uploads/sessions', {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ session: UploadSessionRecord }>(r)),
  getUploadSession: (sessionId: string) =>
    fetch(`/api/uploads/sessions/${encodeURIComponent(sessionId)}`).then((r) =>
      handleJson<{ session: UploadSessionRecord }>(r)
    ),
  uploadChunk: (
    sessionId: string,
    partNumber: number,
    chunk: Blob,
    user?: PartnerProfile | null,
    signal?: AbortSignal
  ) =>
    fetch(`/api/uploads/sessions/${encodeURIComponent(sessionId)}/parts/${partNumber}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(user ? { 'X-User-Id': user.uid, 'X-User-Name': user.displayName } : {}),
      },
      body: chunk,
      signal,
    }).then((r) => handleJson<{ session: UploadSessionRecord }>(r)),
  resumeUploadSession: (sessionId: string) =>
    fetch(`/api/uploads/sessions/${encodeURIComponent(sessionId)}/resume`, { method: 'POST' }).then((r) =>
      handleJson<{ session: UploadSessionRecord }>(r)
    ),
  completeUploadSession: (
    sessionId: string,
    metadata: { title?: string; description?: string; genre?: string; collectionName?: string },
    user?: PartnerProfile | null
  ) =>
    fetch(`/api/uploads/sessions/${encodeURIComponent(sessionId)}/complete`, {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(metadata),
    }).then((r) => handleJson<{ session: UploadSessionRecord; movie: MovieRecord }>(r)),
  abortUploadSession: (sessionId: string) =>
    fetch(`/api/uploads/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).then((r) =>
      handleJson<{ ok: boolean }>(r)
    ),

  // Cinema Rooms
  listRooms: () =>
    fetch('/api/rooms').then((r) =>
      handleJson<{
        rooms: CinemaRoomRecord[];
        participants: Record<string, RoomParticipant[]>;
        playbackStates: Record<string, PlaybackState>;
      }>(r)
    ),
  createRoom: (payload: Partial<CinemaRoomRecord>, user?: PartnerProfile | null) =>
    fetch('/api/rooms', {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ room: CinemaRoomRecord }>(r)),
  joinRoom: (inviteCode: string, user?: PartnerProfile | null) =>
    fetch('/api/rooms/join', {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify({ inviteCode }),
    }).then((r) => handleJson<{ room: CinemaRoomRecord }>(r)),
  getRoom: (roomId: string) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}`).then((r) =>
      handleJson<{
        room: CinemaRoomRecord;
        movie: MovieRecord | null;
        playbackState: PlaybackState;
        participants: RoomParticipant[];
        chatHistory: ChatMessageRecord[];
      }>(r)
    ),
  setRoomSource: (
    roomId: string,
    payload: { movieId?: string; youtubeUrl?: string; title?: string; thumbnailUrl?: string },
    user?: PartnerProfile | null
  ) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/source`, {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) =>
      handleJson<{
        room: CinemaRoomRecord;
        movie: MovieRecord;
        playbackState: PlaybackState;
      }>(r)
    ),
  updateRoomSeats: (
    roomId: string,
    payload: { hostSeatId?: string; guestSeatId?: string; guestLabel?: string },
    user?: PartnerProfile | null
  ) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/seats`, {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) =>
      handleJson<{
        room: CinemaRoomRecord;
        participants: RoomParticipant[];
      }>(r)
    ),

  // Partner Connection
  createPartnerInvite: (user?: PartnerProfile | null) =>
    fetch('/api/partners/invite', {
      method: 'POST',
      headers: buildHeaders(user),
    }).then((r) => handleJson<{ invitation: { code: string } }>(r)),
  acceptPartnerInvite: (code: string, user?: PartnerProfile | null) =>
    fetch('/api/partners/accept', {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify({ code }),
    }).then((r) => handleJson<{ connection: { partnerId: string; partnerName: string } }>(r)),
  disconnectPartner: (user?: PartnerProfile | null) =>
    fetch('/api/partners/disconnect', {
      method: 'POST',
      headers: buildHeaders(user),
    }).then((r) => handleJson<{ ok: boolean }>(r)),

  // Watchlist
  listWatchlist: () => fetch('/api/watchlist').then((r) => handleJson<{ items: WatchlistItemRecord[] }>(r)),
  addWatchlistItem: (payload: Partial<WatchlistItemRecord>, user?: PartnerProfile | null) =>
    fetch('/api/watchlist', {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ item: WatchlistItemRecord }>(r)),
  updateWatchlistItem: (id: string, patch: Record<string, unknown>, user?: PartnerProfile | null) =>
    fetch(`/api/watchlist/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(user),
      body: JSON.stringify(patch),
    }).then((r) => handleJson<{ item: WatchlistItemRecord }>(r)),
  deleteWatchlistItem: (id: string) =>
    fetch(`/api/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) =>
      handleJson<{ ok: boolean }>(r)
    ),

  // Memories
  listMemories: () => fetch('/api/memories').then((r) => handleJson<{ memories: MemoryItemRecord[] }>(r)),
  addMemory: (payload: Partial<MemoryItemRecord>, user?: PartnerProfile | null) =>
    fetch('/api/memories', {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ memory: MemoryItemRecord }>(r)),
  deleteMemory: (id: string) =>
    fetch(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) =>
      handleJson<{ ok: boolean }>(r)
    ),

  // Snacks
  listSnacks: () => fetch('/api/snacks').then((r) => handleJson<{ snacks: SnackItemRecord[] }>(r)),
  createSnack: (payload: Partial<SnackItemRecord>, user?: PartnerProfile | null) =>
    fetch('/api/snacks', {
      method: 'POST',
      headers: buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ snack: SnackItemRecord }>(r)),
  updateSnack: (id: string, patch: Partial<SnackItemRecord>, user?: PartnerProfile | null) =>
    fetch(`/api/snacks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(user),
      body: JSON.stringify(patch),
    }).then((r) => handleJson<{ snack: SnackItemRecord }>(r)),

  // Chat History & GIFs
  getChatThreads: () =>
    fetch('/api/chat/history').then((r) =>
      handleJson<{ threads: Array<{ roomId: string; roomName: string; messages: ChatMessageRecord[] }> }>(r)
    ),
  searchGifs: (q: string) =>
    fetch(`/api/gifs/search?q=${encodeURIComponent(q)}`).then((r) =>
      handleJson<{
        configured: boolean;
        message?: string;
        results: Array<{ id: string; title: string; url: string }>;
      }>(r)
    ),
};
