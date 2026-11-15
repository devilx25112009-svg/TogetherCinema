import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type {
  ChatMessageRecord,
  CinemaRoomRecord,
  MemoryItemRecord,
  MovieRecord,
  PlaybackState,
  RoomParticipant,
  SnackItemRecord,
  WatchlistItemRecord,
} from '../../types/cinema';
import { normalizeLegacyAssetPath, resolveCinemaStorageDir } from '../runtimeEnv';

export interface PartnerLinkState {
  code: string;
  creatorId: string;
  creatorName: string;
  partnerId?: string;
  partnerName?: string;
  status: 'pending' | 'connected' | 'disconnected';
  updatedAt: string;
}

export interface StoreSnapshot {
  movies: MovieRecord[];
  rooms: CinemaRoomRecord[];
  playbackStates: Record<string, PlaybackState>;
  participants: Record<string, RoomParticipant[]>;
  chats: Record<string, ChatMessageRecord[]>;
  watchlist: WatchlistItemRecord[];
  memories: MemoryItemRecord[];
  snacks: SnackItemRecord[];
  invitations: Record<string, PartnerLinkState>;
  connections: Record<string, { partnerId: string; partnerName: string; connectionId: string }>;
}

const DEFAULT_MOVIES: MovieRecord[] = [
  {
    id: 'mov-midnight-orbit',
    ownerId: 'demo-partner-a',
    sharedWithPartnerId: 'demo-partner-b',
    title: 'Midnight Orbit',
    description:
      'Two deep-space cartographers separated across orbital stations discover an encrypted acoustic signal linking their observatories across 400 million kilometers.',
    genre: 'Sci-Fi Romance',
    durationSeconds: 6840,
    fileSizeBytes: 38_450_000_000,
    resolution: '4K UHD (2160p)',
    sourceHeight: 2160,
    stereoscopicFormat: 'sbs',
    videoFormat: 'HEVC / H.265',
    audioFormat: 'Dolby Atmos 7.1.4',
    subtitles: [
      { id: 'sub-en', label: 'English (SDH)', language: 'en' },
      { id: 'sub-fr', label: 'French', language: 'fr' },
    ],
    audioTracks: [
      { id: 'aud-atmos', label: 'English · Dolby Atmos Master', language: 'en', channels: 'Atmos' },
      { id: 'aud-51', label: 'English · 5.1 Surround', language: 'en', channels: '5.1' },
      { id: 'aud-stereo', label: 'English · Midnight Stereo', language: 'en', channels: '2.0' },
    ],
    chapters: [
      { id: 'ch-1', title: '01. Orbital Dawn', timeSeconds: 0 },
      { id: 'ch-2', title: '02. Frequency Across Silence', timeSeconds: 1420 },
      { id: 'ch-3', title: '03. The Violet Nebula Crossing', timeSeconds: 3240 },
      { id: 'ch-4', title: '04. Docking at Perigee', timeSeconds: 5110 },
    ],
    thumbnailUrl: '/images/poster_midnight_orbit_1794680182030.jpg',
    streamUrl: 'procedural://midnight-orbit',
    processingStatus: 'ready',
    collectionName: 'Late Night Favorites',
    playbackProgress: 1420,
    isFavourite: true,
    createdAt: '2026-10-18T20:00:00.000Z',
    updatedAt: '2026-11-12T21:15:00.000Z',
  },
  {
    id: 'mov-velvet-rain',
    ownerId: 'demo-partner-a',
    sharedWithPartnerId: 'demo-partner-b',
    title: 'Velvet Rain on Rue Saint-Denis',
    description:
      'A nocturnal jazz pianist and an architectural photographer cross paths aboard the last midnight tram during an endless autumn downpour.',
    genre: 'Noir Drama',
    durationSeconds: 5920,
    fileSizeBytes: 24_180_000_000,
    resolution: '4K UHD (2160p)',
    sourceHeight: 2160,
    stereoscopicFormat: 'none',
    videoFormat: 'ProRes / MP4',
    audioFormat: '5.1 Surround DTS-HD',
    subtitles: [
      { id: 'sub-en', label: 'English', language: 'en' },
      { id: 'sub-jp', label: 'Japanese', language: 'ja' },
    ],
    audioTracks: [
      { id: 'aud-51', label: 'French / English · 5.1 Master', language: 'fr', channels: '5.1' },
      { id: 'aud-stereo', label: 'Stereo Night Mix', language: 'en', channels: '2.0' },
    ],
    chapters: [
      { id: 'ch-1', title: '01. Last Tram at 00:40', timeSeconds: 0 },
      { id: 'ch-2', title: '02. Reflections on Cobblestone', timeSeconds: 1280 },
      { id: 'ch-3', title: '03. Encore Under Rain', timeSeconds: 4050 },
    ],
    thumbnailUrl: '/images/poster_velvet_rain_1794680183387.jpg',
    streamUrl: 'procedural://velvet-rain',
    processingStatus: 'ready',
    collectionName: 'Arthouse & Rain',
    playbackProgress: 640,
    isFavourite: true,
    createdAt: '2026-10-25T19:00:00.000Z',
    updatedAt: '2026-11-11T22:00:00.000Z',
  },
  {
    id: 'mov-paper-lanterns',
    ownerId: 'demo-partner-a',
    sharedWithPartnerId: 'demo-partner-b',
    title: 'Paper Lanterns Over Lake Aoi',
    description:
      'After five winters writing letters across oceans, two childhood friends reunite at the lakeside lantern festival before sunrise.',
    genre: 'Romantic Drama',
    durationSeconds: 6180,
    fileSizeBytes: 49_720_000_000,
    resolution: '1080p Full HD',
    sourceHeight: 1080,
    stereoscopicFormat: 'none',
    videoFormat: 'MKV Remux',
    audioFormat: 'Stereo PCM',
    subtitles: [{ id: 'sub-en', label: 'English', language: 'en' }],
    audioTracks: [{ id: 'aud-stereo', label: 'Original Japanese Stereo', language: 'ja', channels: '2.0' }],
    chapters: [
      { id: 'ch-1', title: '01. Letters by Twilight', timeSeconds: 0 },
      { id: 'ch-2', title: '02. Drift of a Thousand Lights', timeSeconds: 2150 },
      { id: 'ch-3', title: '03. Pier at Dawn', timeSeconds: 4720 },
    ],
    thumbnailUrl: '/images/poster_paper_lanterns_1794680183501.jpg',
    streamUrl: 'procedural://paper-lanterns',
    processingStatus: 'ready',
    collectionName: 'Comfort Classics',
    playbackProgress: 0,
    isFavourite: false,
    createdAt: '2026-11-01T18:30:00.000Z',
    updatedAt: '2026-11-10T20:10:00.000Z',
  },
];

const DEFAULT_ROOMS: CinemaRoomRecord[] = [
  {
    roomId: 'room-tonight',
    hostId: 'demo-partner-a',
    hostName: 'Aayush',
    guestId: 'demo-partner-b',
    guestLabel: 'Maya',
    hostPartnerRole: 'bf',
    guestPartnerRole: 'gf',
    hostSeatId: 'D6',
    guestSeatId: 'D7',
    inviteCode: 'LOVE-2026',
    name: 'Midnight IMAX Screening for Two',
    movieId: 'mov-midnight-orbit',
    theme: 'midnight_velvet',
    privacy: 'invite_code',
    defaultQuality: '2160p',
    defaultAudio: 'Original Audio',
    defaultScreenMode: 'IMAX',
    status: 'ready',
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
  },
];

const DEFAULT_WATCHLIST: WatchlistItemRecord[] = [
  {
    id: 'wl-1',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    title: 'In the Mood for Love (4K Restoration)',
    genre: 'Romance / Drama',
    year: 2000,
    notes: 'Save for Sunday rainy evening with caramel popcorn.',
    priority: 'high',
    plannedDate: '2026-11-17',
    suggestedBy: 'Maya',
    votes: 4,
    isFavourite: true,
    status: 'scheduled',
    createdAt: '2026-11-08T18:00:00.000Z',
    updatedAt: '2026-11-12T19:00:00.000Z',
  },
  {
    id: 'wl-2',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    title: 'Arrival — IMAX Audio Master',
    genre: 'Sci-Fi',
    year: 2016,
    notes: 'Watch in Dolby Cinema mode with headphones.',
    priority: 'high',
    plannedDate: '2026-11-21',
    suggestedBy: 'Aayush',
    votes: 3,
    isFavourite: true,
    status: 'queued',
    createdAt: '2026-11-09T14:00:00.000Z',
    updatedAt: '2026-11-10T14:00:00.000Z',
  },
];

const DEFAULT_MEMORIES: MemoryItemRecord[] = [
  {
    id: 'mem-1',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    movieTitle: 'Midnight Orbit',
    timestampLabel: '23:40',
    note: 'You paused right when the violet nebula filled the IMAX dome because we both said the exact same line.',
    mood: 'Starry-Eyed',
    imageUrl: '/images/poster_midnight_orbit_1794680182030.jpg',
    movieDate: '2026-11-04',
    createdAt: '2026-11-04T23:15:00.000Z',
  },
  {
    id: 'mem-2',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    movieTitle: 'Paper Lanterns Over Lake Aoi',
    timestampLabel: '35:50',
    note: 'First movie night after moving timezones. Virtual caramel popcorn and three hours of talking over the credits.',
    mood: 'Warm & Cozy',
    imageUrl: '/images/poster_paper_lanterns_1794680183501.jpg',
    movieDate: '2026-10-28',
    createdAt: '2026-10-28T21:40:00.000Z',
  },
  {
    id: 'mem-3',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    movieTitle: 'Velvet Rain on Rue Saint-Denis',
    timestampLabel: '18:12',
    note: 'Tested ScreenX side-wall rain reflections for the first time together.',
    mood: 'Nostalgic',
    imageUrl: '/images/poster_velvet_rain_1794680183387.jpg',
    movieDate: '2026-10-19',
    createdAt: '2026-10-19T22:05:00.000Z',
  },
];

const DEFAULT_SNACKS: SnackItemRecord[] = [
  {
    id: 'snk-popcorn',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Salted Caramel & Sea Salt Popcorn',
    category: 'Popcorn',
    description: 'Warm theater-kettle glaze served in a matte obsidian bowl.',
    calories: '380 kcal',
    imageUrl: '/images/snack_cinema_feast_1794680184354.jpg',
    inTray: true,
    inWishlist: false,
    sentToPartner: true,
    sentBy: 'Aayush',
    createdAt: '2026-11-12T18:00:00.000Z',
  },
  {
    id: 'snk-chocolate',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Dark Hazelnut Velvet Truffles',
    category: 'Chocolate',
    description: '72% cacao ganache dusted with roasted Piedmont hazelnut.',
    calories: '240 kcal',
    imageUrl: '/images/snack_cinema_feast_1794680184354.jpg',
    inTray: true,
    inWishlist: true,
    sentToPartner: false,
    createdAt: '2026-11-12T18:05:00.000Z',
  },
  {
    id: 'snk-nachos',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Loaded Smoked Cheddar Nachos',
    category: 'Nachos',
    description: 'Crisp blue corn tortilla chips with aged cheddar and charred salsa.',
    calories: '510 kcal',
    inTray: false,
    inWishlist: false,
    sentToPartner: false,
    createdAt: '2026-11-12T18:10:00.000Z',
  },
  {
    id: 'snk-pizza',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Truffle Margherita Flatbread',
    category: 'Pizza',
    description: 'San Marzano tomato, fior di latte, and black truffle oil.',
    calories: '620 kcal',
    inTray: false,
    inWishlist: true,
    sentToPartner: false,
    createdAt: '2026-11-12T18:15:00.000Z',
  },
  {
    id: 'snk-coffee',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Iced Vanilla Velvet Espresso',
    category: 'Coffee',
    description: 'Double ristretto over crystal ice with Madagascar vanilla cream.',
    calories: '140 kcal',
    inTray: false,
    inWishlist: false,
    sentToPartner: false,
    createdAt: '2026-11-12T18:20:00.000Z',
  },
  {
    id: 'snk-icecream',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Midnight Berry & Mascarpone Gelato',
    category: 'Ice Cream',
    description: 'Silky small-batch gelato swirled with wild blackberry compote.',
    calories: '290 kcal',
    inTray: false,
    inWishlist: false,
    sentToPartner: false,
    createdAt: '2026-11-12T18:25:00.000Z',
  },
  {
    id: 'snk-burgers',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Wagyu Brioche Cinema Sliders',
    category: 'Burgers',
    description: 'Two miniature seared sliders with caramelized shallots.',
    calories: '540 kcal',
    inTray: false,
    inWishlist: false,
    sentToPartner: false,
    createdAt: '2026-11-12T18:30:00.000Z',
  },
  {
    id: 'snk-fries',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Rosemary Parmesan Shoestring Fries',
    category: 'Fries',
    description: 'Double-fried crisp shoestrings tossed in sea salt and rosemary.',
    calories: '360 kcal',
    inTray: false,
    inWishlist: false,
    sentToPartner: false,
    createdAt: '2026-11-12T18:35:00.000Z',
  },
  {
    id: 'snk-drinks',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Sparkling Blood Orange Spritz',
    category: 'Soft Drinks',
    description: 'Zero-proof botanical citrus fizz with chilled rosemary sprig.',
    calories: '80 kcal',
    inTray: false,
    inWishlist: false,
    sentToPartner: false,
    createdAt: '2026-11-12T18:40:00.000Z',
  },
  {
    id: 'snk-desserts',
    ownerId: 'demo-partner-a',
    partnerId: 'demo-partner-b',
    name: 'Warm Molten Rosewater Lava Cake',
    category: 'Desserts',
    description: 'Shared dark chocolate cake with warm raspberry coulis center.',
    calories: '420 kcal',
    inTray: false,
    inWishlist: true,
    sentToPartner: false,
    createdAt: '2026-11-12T18:45:00.000Z',
  },
];

export class CinemaStore {
  private filePath: string;
  private data: StoreSnapshot;

  constructor(storageDir?: string) {
    const dir = resolveCinemaStorageDir(process.env, storageDir);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Fallback to in-memory only if filesystem is strictly read-only
    }
    this.filePath = path.join(dir, 'cinema-store.json');
    this.data = this.loadInitial();
  }

  private normalizeSnapshot(snapshot: StoreSnapshot): StoreSnapshot {
    for (const m of snapshot.movies || []) {
      m.thumbnailUrl = normalizeLegacyAssetPath(m.thumbnailUrl) || '/images/poster_midnight_orbit_1794680182030.jpg';
    }
    for (const mem of snapshot.memories || []) {
      mem.imageUrl = normalizeLegacyAssetPath(mem.imageUrl) || '/images/cinema_hero_couple_1794680184863.jpg';
    }
    for (const snk of snapshot.snacks || []) {
      snk.imageUrl = normalizeLegacyAssetPath(snk.imageUrl) || '/images/snack_cinema_feast_1794680184354.jpg';
    }
    return snapshot;
  }

  private loadInitial(): StoreSnapshot {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as StoreSnapshot;
        const tonightRoom = parsed.rooms?.find((r) => r.roomId === 'room-tonight');
        const tonightPb = parsed.playbackStates?.['room-tonight'];
        if (tonightRoom && tonightRoom.defaultAudio === 'Dolby Atmos' && (!tonightPb || tonightPb.revision <= 1)) {
          tonightRoom.defaultAudio = 'Original Audio';
          if (tonightPb) tonightPb.audioMode = 'Original Audio';
        }
        if (tonightRoom && !tonightRoom.hostPartnerRole) {
          tonightRoom.hostPartnerRole = 'bf';
          tonightRoom.guestPartnerRole = 'gf';
        }
        if (tonightRoom && tonightRoom.guestLabel === 'Maya (GF)') {
          tonightRoom.guestLabel = 'Maya';
        }
        return this.normalizeSnapshot(parsed);
      }
    } catch {
      // Fallback to clean seeded state if file corrupted
    }

    const now = Date.now();
    const initialPlayback: Record<string, PlaybackState> = {
      'room-tonight': {
        roomId: 'room-tonight',
        movieId: 'mov-midnight-orbit',
        currentTime: 24,
        playing: false,
        playbackRate: 1.0,
        updatedAt: now,
        hostId: 'demo-partner-a',
        revision: 1,
        quality: '2160p',
        audioMode: 'Original Audio',
        screenMode: 'IMAX',
      },
    };

    const initialChats: Record<string, ChatMessageRecord[]> = {
      'room-tonight': [
        {
          id: 'chat-seed-1',
          roomId: 'room-tonight',
          senderId: 'demo-partner-b',
          senderName: 'Maya',
          type: 'text',
          text: 'Got my headphones and caramel popcorn ready! Switch to IMAX Front Row whenever you start.',
          reactions: { '❤️': ['demo-partner-a'] },
          readBy: ['demo-partner-a', 'demo-partner-b'],
          createdAt: new Date(now - 120_000).toISOString(),
        },
      ],
    };

    const snapshot: StoreSnapshot = {
      movies: DEFAULT_MOVIES,
      rooms: DEFAULT_ROOMS,
      playbackStates: initialPlayback,
      participants: {
        'room-tonight': [
          {
            userId: 'demo-partner-a',
            displayName: 'Aayush',
            role: 'host',
            partnerRole: 'bf',
            online: true,
            seatId: 'D6',
            seatLabel: 'Row D · Seat 6 (Center)',
            joinedAt: new Date(now - 300_000).toISOString(),
          },
          {
            userId: 'demo-partner-b',
            displayName: 'Maya',
            role: 'guest',
            partnerRole: 'gf',
            online: true,
            seatId: 'D7',
            seatLabel: 'Row D · Seat 7 (Center)',
            joinedAt: new Date(now - 240_000).toISOString(),
          },
        ],
      },
      chats: initialChats,
      watchlist: DEFAULT_WATCHLIST,
      memories: DEFAULT_MEMORIES,
      snacks: DEFAULT_SNACKS,
      invitations: {
        'DUET-7721': {
          code: 'DUET-7721',
          creatorId: 'demo-partner-a',
          creatorName: 'Aayush',
          status: 'pending',
          updatedAt: new Date(now).toISOString(),
        },
      },
      connections: {
        'demo-partner-a': {
          partnerId: 'demo-partner-b',
          partnerName: 'Maya',
          connectionId: 'conn-demo-couple',
        },
        'demo-partner-b': {
          partnerId: 'demo-partner-a',
          partnerName: 'Aayush',
          connectionId: 'conn-demo-couple',
        },
      },
    };

    try {
      fs.writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch {
      // Safe no-op on strictly read-only environments
    }
    return snapshot;
  }

  private async persist(): Promise<void> {
    try {
      await fsp.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {
      // Keep in-memory state if persistence fails on read-only FS
    }
  }

  getSnapshot(): StoreSnapshot {
    return this.data;
  }

  async save(): Promise<void> {
    await this.persist();
  }
}
