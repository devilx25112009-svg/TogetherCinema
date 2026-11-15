// Keeps browser-local File object URLs in memory across SPA navigation
// so 35 GB - 50 GB PC video files can stream instantaneously in the 3D auditorium
// directly from disk via browser byte-range reads without buffering into RAM.

interface RegisteredLocalMedia {
  movieId?: string;
  fileName: string;
  fileSizeBytes: number;
  blobUrl: string;
}

const byMovieId = new Map<string, RegisteredLocalMedia>();
const byRoomId = new Map<string, RegisteredLocalMedia>();
const audioByRoomId = new Map<string, RegisteredLocalMedia>();

export function registerLocalFileForMovie(movieId: string, file: File): string {
  const existing = byMovieId.get(movieId);
  if (existing && existing.fileName === file.name && existing.fileSizeBytes === file.size) {
    return existing.blobUrl;
  }
  const blobUrl = URL.createObjectURL(file);
  byMovieId.set(movieId, {
    movieId,
    fileName: file.name,
    fileSizeBytes: file.size,
    blobUrl,
  });
  return blobUrl;
}

export function registerLocalFileForRoom(roomId: string, file: File): string {
  const existing = byRoomId.get(roomId);
  if (existing) {
    if (existing.fileName === file.name && existing.fileSizeBytes === file.size) {
      return existing.blobUrl;
    }
    URL.revokeObjectURL(existing.blobUrl);
  }
  const blobUrl = URL.createObjectURL(file);
  byRoomId.set(roomId, {
    fileName: file.name,
    fileSizeBytes: file.size,
    blobUrl,
  });
  return blobUrl;
}

export function registerLocalAudioForRoom(roomId: string, file: File): string {
  const existing = audioByRoomId.get(roomId);
  if (existing) {
    if (existing.fileName === file.name && existing.fileSizeBytes === file.size) {
      return existing.blobUrl;
    }
    URL.revokeObjectURL(existing.blobUrl);
  }
  const blobUrl = URL.createObjectURL(file);
  audioByRoomId.set(roomId, {
    fileName: file.name,
    fileSizeBytes: file.size,
    blobUrl,
  });
  return blobUrl;
}

export function getLocalAudioStreamUrl(roomId?: string): RegisteredLocalMedia | null {
  if (roomId && audioByRoomId.has(roomId)) return audioByRoomId.get(roomId)!;
  return null;
}

export function getLocalMediaStreamUrl(movieId?: string, roomId?: string): string | null {
  if (roomId) {
    const roomMatch = byRoomId.get(roomId);
    if (roomMatch) return roomMatch.blobUrl;
  }
  if (movieId) {
    const movieMatch = byMovieId.get(movieId);
    if (movieMatch) return movieMatch.blobUrl;
  }
  return null;
}

export function getLocalMediaFileInfo(movieId?: string, roomId?: string): RegisteredLocalMedia | null {
  if (roomId && byRoomId.has(roomId)) return byRoomId.get(roomId)!;
  if (movieId && byMovieId.has(movieId)) return byMovieId.get(movieId)!;
  return null;
}
