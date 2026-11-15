export type ScreenMode =
  | 'Normal Cinema'
  | '3D'
  | 'IMAX'
  | 'IMAX 3D'
  | 'Dolby Cinema'
  | 'Screen X'
  | '4DX'
  | 'UltraWide'
  | 'Theatre Mode'
  | 'Fullscreen';

export type CameraMode =
  | 'Front Row'
  | 'Centre Seating'
  | 'Back Row'
  | 'Wide View'
  | 'Player Focus';

export type AudioMode =
  | 'Original Audio'
  | 'Stereo'
  | '5.1'
  | '7.1'
  | 'Dolby Atmos';

export type QualityOption =
  | 'Original'
  | '4320p'
  | '2160p'
  | '1440p'
  | '1080p'
  | '720p'
  | '480p';

export type CoupleInteractionKind =
  | 'heart'
  | 'kiss'
  | 'kiss_lips'
  | 'kiss_forehead'
  | 'kiss_cheek'
  | 'kiss_neck'
  | 'hug'
  | 'cuddle'
  | 'hold_hands'
  | 'headpat'
  | 'playful_beat'
  | 'pinch_cheek'
  | 'tickle'
  | 'give_rose'
  | 'whisper_ily'
  | 'wave'
  | 'popcorn'
  | 'heart_explosion'
  | 'sparkles'
  | 'surprise_gift';

export interface ChapterMark {
  id: string;
  title: string;
  timeSeconds: number;
}

export interface AudioTrackInfo {
  id: string;
  label: string;
  language: string;
  channels: '2.0' | '5.1' | '7.1' | 'Atmos';
  codec?: string;
}

export interface SubtitleTrackInfo {
  id: string;
  label: string;
  language: string;
}

export interface MovieRecord {
  id: string;
  ownerId: string;
  sharedWithPartnerId?: string;
  title: string;
  description: string;
  genre: string;
  durationSeconds: number;
  fileSizeBytes: number;
  resolution: string;
  sourceHeight: number;
  stereoscopicFormat?: 'none' | 'sbs' | 'tab';
  videoFormat: string;
  audioFormat: string;
  subtitles: SubtitleTrackInfo[];
  audioTracks: AudioTrackInfo[];
  chapters: ChapterMark[];
  thumbnailUrl: string;
  streamUrl: string;
  streamCompatUrl?: string;
  audioNeedsCompat?: boolean;
  storageKey?: string;
  hlsManifestUrl?: string;
  processingStatus: 'pending' | 'processing' | 'ready' | 'ffmpeg_unavailable' | 'failed';
  collectionName: string;
  playbackProgress: number;
  isFavourite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadSessionRecord {
  sessionId: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  chunkSizeBytes: number;
  totalChunks: number;
  uploadedParts: number[];
  uploadedBytes: number;
  status: 'uploading' | 'paused' | 'completed' | 'aborted' | 'failed';
  storageKey: string;
  provider: 'local' | 's3' | 'gcs';
  createdAt: string;
  updatedAt: string;
}

export type PartnerGenderRole = 'bf' | 'gf';

export interface PlaybackState {
  roomId: string;
  movieId: string;
  currentTime: number;
  playing: boolean;
  playbackRate: number;
  updatedAt: number;
  hostId: string;
  revision: number;
  quality: QualityOption;
  audioMode: AudioMode;
  screenMode: ScreenMode;
  activeChapterId?: string;
  updatedById?: string;
  updatedByName?: string;
  lastAction?: 'play' | 'pause' | 'seek' | 'chapter' | 'rate' | 'quality' | 'audio' | 'screenMode' | 'source';
  activeMovieTitle?: string;
  activeMovieStreamUrl?: string;
  activeMovieThumbnailUrl?: string;
  activeMovieDurationSeconds?: number;
  activeMovieChapters?: ChapterMark[];
}

export interface RoomParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: 'host' | 'guest';
  partnerRole?: PartnerGenderRole;
  online: boolean;
  seatId?: string;
  seatLabel: string;
  joinedAt: string;
}

export interface CinemaRoomRecord {
  roomId: string;
  hostId: string;
  hostName: string;
  guestId?: string;
  guestLabel?: string;
  hostPartnerRole?: PartnerGenderRole;
  guestPartnerRole?: PartnerGenderRole;
  hostSeatId?: string;
  guestSeatId?: string;
  inviteCode: string;
  name: string;
  movieId: string;
  theme: 'midnight_velvet' | 'dolby_obsidian' | 'starlight_imax' | 'rose_lounge';
  privacy: 'partner_only' | 'invite_code';
  defaultQuality: QualityOption;
  defaultAudio: AudioMode;
  defaultScreenMode: ScreenMode;
  status: 'waiting' | 'ready' | 'playing' | 'paused' | 'ended';
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: 'text' | 'gif' | 'voice' | 'snack';
  text: string;
  gifUrl?: string;
  voiceDurationSec?: number;
  replyToId?: string;
  replyPreview?: string;
  reactions: Record<string, string[]>;
  readBy: string[];
  createdAt: string;
}

export interface CoupleReactionEvent {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  kind: CoupleInteractionKind;
  label: string;
  createdAt: number;
}

export interface WatchlistItemRecord {
  id: string;
  ownerId: string;
  partnerId?: string;
  title: string;
  genre: string;
  year?: number;
  notes?: string;
  priority: 'high' | 'medium' | 'low';
  plannedDate?: string;
  suggestedBy: string;
  votes: number;
  isFavourite: boolean;
  status: 'queued' | 'scheduled' | 'watched';
  createdAt: string;
  updatedAt: string;
}

export interface MemoryItemRecord {
  id: string;
  ownerId: string;
  partnerId?: string;
  movieTitle: string;
  timestampLabel: string;
  note: string;
  mood: string;
  imageUrl: string;
  movieDate: string;
  createdAt: string;
}

export interface SnackItemRecord {
  id: string;
  ownerId: string;
  partnerId?: string;
  name: string;
  category:
    | 'Popcorn'
    | 'Nachos'
    | 'Pizza'
    | 'Burgers'
    | 'Fries'
    | 'Chocolate'
    | 'Ice Cream'
    | 'Soft Drinks'
    | 'Coffee'
    | 'Desserts';
  description: string;
  calories?: string;
  imageUrl?: string;
  inTray: boolean;
  inWishlist: boolean;
  sentToPartner: boolean;
  sentBy?: string;
  createdAt: string;
}

export interface PartnerProfile {
  uid: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  partnerId?: string;
  partnerName?: string;
  connectionId?: string;
  connectionStatus: 'connected' | 'disconnected' | 'pending';
  partnerOnline?: boolean;
  inviteCode?: string;
  subscriptionTier: 'free' | 'duet_plus' | 'imax_vault';
  storageUsedBytes: number;
  storageQuotaBytes: number;
}
