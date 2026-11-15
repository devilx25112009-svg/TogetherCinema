import { auth } from './firebase';
import type {
  ChatMessageRecord,
  CinemaRoomRecord,
  MemoryItemRecord,
  MovieRecord,
  PartnerGenderRole,
  PartnerProfile,
  PlaybackState,
  RoomParticipant,
  SnackItemRecord,
  UploadSessionRecord,
  WatchlistItemRecord,
} from '../types/cinema';

async function buildHeaders(user?: PartnerProfile | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (user) {
    headers['X-User-Id'] = user.uid;
    headers['X-User-Name'] = user.displayName;
  }
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // fallback without Firebase ID token in demo mode
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
  createMovie: async (payload: Partial<MovieRecord>, user?: PartnerProfile | null) =>
    fetch('/api/movies', {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ movie: MovieRecord }>(r)),
  updateMovie: async (id: string, patch: Partial<MovieRecord>, user?: PartnerProfile | null) =>
    fetch(`/api/movies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: await buildHeaders(user),
      body: JSON.stringify(patch),
    }).then((r) => handleJson<{ movie: MovieRecord }>(r)),
  deleteMovie: async (id: string, user?: PartnerProfile | null) =>
    fetch(`/api/movies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await buildHeaders(user),
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
  listUploadSessions: async (user?: PartnerProfile | null) =>
    fetch('/api/uploads/sessions', { headers: await buildHeaders(user) }).then((r) =>
      handleJson<{ sessions: UploadSessionRecord[] }>(r)
    ),
  createUploadSession: async (
    payload: { fileName: string; fileSizeBytes: number; mimeType: string },
    user?: PartnerProfile | null
  ) =>
    fetch('/api/uploads/sessions', {
      method: 'POST',
      headers: await buildHeaders(user),
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
  completeUploadSession: async (
    sessionId: string,
    metadata: { title?: string; description?: string; genre?: string; collectionName?: string },
    user?: PartnerProfile | null
  ) =>
    fetch(`/api/uploads/sessions/${encodeURIComponent(sessionId)}/complete`, {
      method: 'POST',
      headers: await buildHeaders(user),
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
  createRoom: async (payload: Partial<CinemaRoomRecord>, user?: PartnerProfile | null) =>
    fetch('/api/rooms', {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ room: CinemaRoomRecord }>(r)),
  joinRoom: async (inviteCode: string, user?: PartnerProfile | null) =>
    fetch('/api/rooms/join', {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify({ inviteCode }),
    }).then((r) => handleJson<{ room: CinemaRoomRecord }>(r)),
  getRoom: async (roomId: string, user?: PartnerProfile | null) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
      headers: await buildHeaders(user),
    }).then((r) =>
      handleJson<{
        room: CinemaRoomRecord;
        movie: MovieRecord | null;
        playbackState: PlaybackState;
        participants: RoomParticipant[];
        chatHistory: ChatMessageRecord[];
        serverTime?: number;
      }>(r)
    ),
  syncRoom: async (roomId: string, since = 0, user?: PartnerProfile | null) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/sync?since=${encodeURIComponent(String(since))}`, {
      headers: await buildHeaders(user),
    }).then((r) =>
      handleJson<{
        room: CinemaRoomRecord;
        movie: MovieRecord | null;
        playbackState: PlaybackState;
        participants: RoomParticipant[];
        chatHistory: ChatMessageRecord[];
        reactions: Array<{
          id: string;
          roomId: string;
          senderId: string;
          senderName: string;
          kind: string;
          label: string;
          createdAt: number;
        }>;
        serverTime: number;
      }>(r)
    ),
  postRoomEvent: async (roomId: string, payload: Record<string, unknown>, user?: PartnerProfile | null) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/events`, {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) =>
      handleJson<{ ok: boolean; playbackState?: PlaybackState; message?: ChatMessageRecord; room?: CinemaRoomRecord }>(r)
    ),
  setRoomSource: async (
    roomId: string,
    payload: { movieId?: string; youtubeUrl?: string; title?: string; thumbnailUrl?: string },
    user?: PartnerProfile | null
  ) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/source`, {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) =>
      handleJson<{
        room: CinemaRoomRecord;
        movie: MovieRecord;
        playbackState: PlaybackState;
      }>(r)
    ),
  updateRoomSeats: async (
    roomId: string,
    payload: {
      hostSeatId?: string;
      guestSeatId?: string;
      hostName?: string;
      guestLabel?: string;
      hostPartnerRole?: PartnerGenderRole;
      guestPartnerRole?: PartnerGenderRole;
    },
    user?: PartnerProfile | null
  ) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/seats`, {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) =>
      handleJson<{
        room: CinemaRoomRecord;
        participants: RoomParticipant[];
      }>(r)
    ),

  // Partner Connection
  createPartnerInvite: async (user?: PartnerProfile | null) =>
    fetch('/api/partners/invite', {
      method: 'POST',
      headers: await buildHeaders(user),
    }).then((r) => handleJson<{ invitation: { code: string } }>(r)),
  acceptPartnerInvite: async (code: string, user?: PartnerProfile | null) =>
    fetch('/api/partners/accept', {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify({ code }),
    }).then((r) => handleJson<{ connection: { partnerId: string; partnerName: string } }>(r)),
  disconnectPartner: async (user?: PartnerProfile | null) =>
    fetch('/api/partners/disconnect', {
      method: 'POST',
      headers: await buildHeaders(user),
    }).then((r) => handleJson<{ ok: boolean }>(r)),

  // Watchlist
  listWatchlist: () => fetch('/api/watchlist').then((r) => handleJson<{ items: WatchlistItemRecord[] }>(r)),
  addWatchlistItem: async (payload: Partial<WatchlistItemRecord>, user?: PartnerProfile | null) =>
    fetch('/api/watchlist', {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ item: WatchlistItemRecord }>(r)),
  updateWatchlistItem: async (id: string, patch: Record<string, unknown>, user?: PartnerProfile | null) =>
    fetch(`/api/watchlist/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: await buildHeaders(user),
      body: JSON.stringify(patch),
    }).then((r) => handleJson<{ item: WatchlistItemRecord }>(r)),
  deleteWatchlistItem: (id: string) =>
    fetch(`/api/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) =>
      handleJson<{ ok: boolean }>(r)
    ),

  // Memories
  listMemories: () => fetch('/api/memories').then((r) => handleJson<{ memories: MemoryItemRecord[] }>(r)),
  addMemory: async (payload: Partial<MemoryItemRecord>, user?: PartnerProfile | null) =>
    fetch('/api/memories', {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ memory: MemoryItemRecord }>(r)),
  deleteMemory: (id: string) =>
    fetch(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) =>
      handleJson<{ ok: boolean }>(r)
    ),

  // Snacks
  listSnacks: () => fetch('/api/snacks').then((r) => handleJson<{ snacks: SnackItemRecord[] }>(r)),
  createSnack: async (payload: Partial<SnackItemRecord>, user?: PartnerProfile | null) =>
    fetch('/api/snacks', {
      method: 'POST',
      headers: await buildHeaders(user),
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ snack: SnackItemRecord }>(r)),
  updateSnack: async (id: string, patch: Partial<SnackItemRecord>, user?: PartnerProfile | null) =>
    fetch(`/api/snacks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: await buildHeaders(user),
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
