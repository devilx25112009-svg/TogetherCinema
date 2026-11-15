import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ChatMessageRecord,
  CinemaRoomRecord,
  CoupleReactionEvent,
  MovieRecord,
  PlaybackState,
  RoomParticipant,
} from '../../types/cinema';
import { shouldAcceptIncomingPlaybackState } from '../../utils/playbackSync';
import type { CinemaStore } from './cinemaStore';

export interface CloudRoomBundle {
  room: CinemaRoomRecord;
  movie?: MovieRecord | null;
  playbackState?: PlaybackState;
  participants?: RoomParticipant[];
  chatHistory?: ChatMessageRecord[];
  reactions?: CoupleReactionEvent[];
  savedAtMs: number;
}

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedFirebaseConfig: FirebaseAppletConfig | null = null;
function getFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(process.cwd(), '../firebase-applet-config.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        cachedFirebaseConfig = JSON.parse(fs.readFileSync(p, 'utf8')) as FirebaseAppletConfig;
        return cachedFirebaseConfig;
      }
    } catch {
      // try next path
    }
  }
  cachedFirebaseConfig = {};
  return cachedFirebaseConfig;
}

let cachedServiceToken: { token: string; expiresAtMs: number } | null = null;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getServiceAccountAccessToken(): Promise<string | null> {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawJson) return null;

  if (cachedServiceToken && Date.now() < cachedServiceToken.expiresAtMs - 60_000) {
    return cachedServiceToken.token;
  }

  try {
    const sa = JSON.parse(rawJson) as ServiceAccountJson;
    if (!sa.client_email || !sa.private_key) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
        exp: nowSec + 3600,
        iat: nowSec,
      })
    );
    const signingInput = `${header}.${claims}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    const signature = base64Url(signer.sign(sa.private_key.replace(/\\n/g, '\n')));
    const assertion = `${signingInput}.${signature}`;

    const resp = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    cachedServiceToken = {
      token: json.access_token,
      expiresAtMs: Date.now() + (json.expires_in || 3600) * 1000,
    };
    return cachedServiceToken.token;
  } catch {
    return null;
  }
}

function getKvConfig(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url, token };
}

async function kvGet(key: string): Promise<string | null> {
  const kv = getKvConfig();
  if (!kv) return null;
  try {
    const resp = await fetch(`${kv.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { result?: string | null };
    return typeof data.result === 'string' ? data.result : null;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: string, exSeconds = 86400 * 14): Promise<void> {
  const kv = getKvConfig();
  if (!kv) return;
  try {
    await fetch(`${kv.url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value, ex: exSeconds }),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // non-fatal cloud write
  }
}

function toFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: Record<string, unknown> | undefined): unknown {
  if (!val) return undefined;
  if ('nullValue' in val) return undefined;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = (val.arrayValue as { values?: Record<string, unknown>[] })?.values || [];
    return arr.map((v) => fromFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const fields = (val.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields || {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      const parsed = fromFirestoreValue(v);
      if (parsed !== undefined) out[k] = parsed;
    }
    return out;
  }
  return undefined;
}

function parseFirestoreDoc(docJson: { fields?: Record<string, Record<string, unknown>> }): Record<string, unknown> {
  const fields = docJson.fields || {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const parsed = fromFirestoreValue(v);
    if (parsed !== undefined) out[k] = parsed;
  }
  return out;
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const fields: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function getFirestoreDocUrl(docPath: string): string | null {
  const cfg = getFirebaseAppletConfig();
  if (!cfg.projectId) return null;
  const dbId = cfg.firestoreDatabaseId || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/${encodeURIComponent(
    dbId
  )}/documents/${docPath}`;
}

export async function resolveCloudAuthToken(bearerToken?: string | null): Promise<string | null> {
  const saToken = await getServiceAccountAccessToken();
  if (saToken) return saToken;
  return bearerToken?.trim() || null;
}

export function isCloudServerStorageConfigured(): { kv: boolean; firestoreServiceAccount: boolean } {
  return {
    kv: Boolean(getKvConfig()),
    firestoreServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()),
  };
}

export async function pushRoomBundleToCloud(
  bundle: CloudRoomBundle,
  bearerToken?: string | null
): Promise<void> {
  const roomId = bundle.room.roomId;
  const tasks: Promise<unknown>[] = [];

  if (getKvConfig()) {
    tasks.push(kvSet(`cinema:room:${roomId}`, JSON.stringify(bundle)));
    if (bundle.room.inviteCode) {
      tasks.push(kvSet(`cinema:invite:${bundle.room.inviteCode.toUpperCase()}`, roomId));
    }
  }

  const token = await resolveCloudAuthToken(bearerToken);
  if (token) {
    const roomUrl = getFirestoreDocUrl(`cinemaRooms/${encodeURIComponent(roomId)}`);
    if (roomUrl) {
      const roomPayload: Record<string, unknown> = {
        roomId: bundle.room.roomId,
        hostId: bundle.room.hostId,
        hostName: bundle.room.hostName,
        guestId: bundle.room.guestId,
        guestLabel: bundle.room.guestLabel,
        hostPartnerRole: bundle.room.hostPartnerRole,
        guestPartnerRole: bundle.room.guestPartnerRole,
        hostSeatId: bundle.room.hostSeatId,
        guestSeatId: bundle.room.guestSeatId,
        inviteCode: bundle.room.inviteCode,
        name: bundle.room.name,
        movieId: bundle.room.movieId,
        theme: bundle.room.theme,
        privacy: bundle.room.privacy,
        defaultQuality: bundle.room.defaultQuality,
        defaultAudio: bundle.room.defaultAudio,
        defaultScreenMode: bundle.room.defaultScreenMode,
        status: bundle.room.status,
        createdAt: bundle.room.createdAt,
        updatedAt: bundle.room.updatedAt,
      };
      tasks.push(
        fetch(roomUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fields: toFirestoreFields(roomPayload) }),
          signal: AbortSignal.timeout(3000),
        }).catch(() => {})
      );
    }

    if (bundle.playbackState) {
      const pbUrl = getFirestoreDocUrl(`cinemaRooms/${encodeURIComponent(roomId)}/playbackStates/current`);
      if (pbUrl) {
        const pb = bundle.playbackState;
        const pbPayload: Record<string, unknown> = {
          roomId: pb.roomId,
          movieId: pb.movieId,
          currentTime: pb.currentTime,
          playing: pb.playing,
          playbackRate: pb.playbackRate,
          hostId: pb.hostId,
          revision: pb.revision,
          quality: pb.quality,
          audioMode: pb.audioMode,
          screenMode: pb.screenMode,
          activeChapterId: pb.activeChapterId,
          updatedById: pb.updatedById,
          updatedByName: pb.updatedByName,
          lastAction: pb.lastAction,
          activeMovieTitle: pb.activeMovieTitle || bundle.movie?.title,
          activeMovieStreamUrl: pb.activeMovieStreamUrl || bundle.movie?.streamUrl,
          activeMovieThumbnailUrl: pb.activeMovieThumbnailUrl || bundle.movie?.thumbnailUrl,
          activeMovieDurationSeconds: pb.activeMovieDurationSeconds ?? bundle.movie?.durationSeconds,
          updatedAtMs: pb.updatedAt,
          updatedAt: new Date(pb.updatedAt || Date.now()).toISOString(),
        };
        tasks.push(
          fetch(pbUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fields: toFirestoreFields(pbPayload) }),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {})
        );
      }
    }
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

export async function fetchRoomBundleFromCloud(
  roomId: string,
  bearerToken?: string | null
): Promise<CloudRoomBundle | null> {
  // 1. Prefer full KV bundle if configured (single atomic read with chat/participants/movie)
  if (getKvConfig()) {
    const raw = await kvGet(`cinema:room:${roomId}`);
    if (raw) {
      try {
        return JSON.parse(raw) as CloudRoomBundle;
      } catch {
        // ignore corrupt KV entry
      }
    }
  }

  // 2. Fallback to Cloud Firestore REST API
  const token = await resolveCloudAuthToken(bearerToken);
  if (!token) return null;

  const roomUrl = getFirestoreDocUrl(`cinemaRooms/${encodeURIComponent(roomId)}`);
  const pbUrl = getFirestoreDocUrl(`cinemaRooms/${encodeURIComponent(roomId)}/playbackStates/current`);
  if (!roomUrl || !pbUrl) return null;

  try {
    const [roomResp, pbResp] = await Promise.all([
      fetch(roomUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      }),
      fetch(pbUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      }),
    ]);

    if (!roomResp.ok) return null;
    const roomDoc = (await roomResp.json()) as { fields?: Record<string, Record<string, unknown>> };
    const room = parseFirestoreDoc(roomDoc) as unknown as CinemaRoomRecord;
    if (!room?.roomId) return null;

    let playbackState: PlaybackState | undefined;
    if (pbResp.ok) {
      const pbDoc = (await pbResp.json()) as { fields?: Record<string, Record<string, unknown>> };
      const parsed = parseFirestoreDoc(pbDoc);
      if (parsed.movieId) {
        const updatedAtMs =
          typeof parsed.updatedAtMs === 'number'
            ? parsed.updatedAtMs
            : Date.parse(String(parsed.updatedAt || '')) || Date.now();
        playbackState = {
          roomId,
          movieId: String(parsed.movieId),
          currentTime: Number(parsed.currentTime || 0),
          playing: Boolean(parsed.playing),
          playbackRate: Number(parsed.playbackRate || 1),
          updatedAt: updatedAtMs,
          hostId: String(parsed.hostId || room.hostId),
          revision: Number(parsed.revision || 1),
          quality: (parsed.quality as PlaybackState['quality']) || room.defaultQuality,
          audioMode: (parsed.audioMode as PlaybackState['audioMode']) || room.defaultAudio,
          screenMode: (parsed.screenMode as PlaybackState['screenMode']) || room.defaultScreenMode,
          activeChapterId: typeof parsed.activeChapterId === 'string' ? parsed.activeChapterId : undefined,
          updatedById: typeof parsed.updatedById === 'string' ? parsed.updatedById : undefined,
          updatedByName: typeof parsed.updatedByName === 'string' ? parsed.updatedByName : undefined,
          lastAction: parsed.lastAction as PlaybackState['lastAction'],
          activeMovieTitle: typeof parsed.activeMovieTitle === 'string' ? parsed.activeMovieTitle : undefined,
          activeMovieStreamUrl:
            typeof parsed.activeMovieStreamUrl === 'string' ? parsed.activeMovieStreamUrl : undefined,
          activeMovieThumbnailUrl:
            typeof parsed.activeMovieThumbnailUrl === 'string' ? parsed.activeMovieThumbnailUrl : undefined,
          activeMovieDurationSeconds:
            typeof parsed.activeMovieDurationSeconds === 'number'
              ? parsed.activeMovieDurationSeconds
              : undefined,
        };
      }
    }

    return {
      room,
      playbackState,
      savedAtMs: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function lookupRoomIdByInviteInCloud(inviteCode: string): Promise<string | null> {
  if (!getKvConfig()) return null;
  return kvGet(`cinema:invite:${inviteCode.trim().toUpperCase()}`);
}

export function mergeCloudBundleIntoStore(store: CinemaStore, bundle: CloudRoomBundle): void {
  const snap = store.getSnapshot();
  const roomId = bundle.room.roomId;

  const existingRoomIdx = snap.rooms.findIndex((r) => r.roomId === roomId);
  if (existingRoomIdx === -1) {
    snap.rooms.unshift(bundle.room);
  } else {
    const existingRoom = snap.rooms[existingRoomIdx];
    const incomingUpdated = Date.parse(bundle.room.updatedAt || '') || 0;
    const existingUpdated = Date.parse(existingRoom.updatedAt || '') || 0;
    if (incomingUpdated >= existingUpdated) {
      snap.rooms[existingRoomIdx] = { ...existingRoom, ...bundle.room };
    }
  }

  if (bundle.movie && !snap.movies.some((m) => m.id === bundle.movie!.id)) {
    snap.movies.unshift(bundle.movie);
  }

  if (bundle.playbackState) {
    const currentPb = snap.playbackStates[roomId];
    if (shouldAcceptIncomingPlaybackState(currentPb, bundle.playbackState)) {
      snap.playbackStates[roomId] = bundle.playbackState;
    }
  }

  if (bundle.participants && bundle.participants.length > 0) {
    const currentList = snap.participants[roomId] || [];
    const byId = new Map<string, RoomParticipant>(currentList.map((p) => [p.userId, p]));
    for (const incomingP of bundle.participants) {
      byId.set(incomingP.userId, incomingP);
    }
    snap.participants[roomId] = Array.from(byId.values());
  }

  if (bundle.chatHistory && bundle.chatHistory.length > 0) {
    const currentChats = snap.chats[roomId] || [];
    const seen = new Set(currentChats.map((m) => m.id));
    for (const msg of bundle.chatHistory) {
      if (!seen.has(msg.id)) {
        currentChats.push(msg);
        seen.add(msg.id);
      }
    }
    snap.chats[roomId] = currentChats.slice(-200);
  }
}

export async function hydrateRoomFromCloud(
  roomId: string,
  store: CinemaStore,
  bearerToken?: string | null
): Promise<CloudRoomBundle | null> {
  const bundle = await fetchRoomBundleFromCloud(roomId, bearerToken);
  if (bundle) {
    mergeCloudBundleIntoStore(store, bundle);
  }
  return bundle;
}
