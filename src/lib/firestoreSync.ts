import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  ChatMessageRecord,
  CinemaRoomRecord,
  CoupleReactionEvent,
  MovieRecord,
  PartnerGenderRole,
  PlaybackState,
  RoomParticipant,
} from '../types/cinema';
import { formatSeatLabel, resolveCoupleRoles, resolveCoupleSeats } from '../utils/seatMap';

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function sanitizeId(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return clean || 'doc_default';
}

function toMsTimestamp(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function buildFirestorePlaybackDoc(
  room: CinemaRoomRecord,
  state: PlaybackState,
  movie?: MovieRecord | null
): Record<string, unknown> {
  const nowMs = Date.now();
  return stripUndefined({
    roomId: room.roomId,
    movieId: state.movieId,
    currentTime: Math.max(0, Number(state.currentTime || 0)),
    playing: Boolean(state.playing),
    playbackRate: Math.min(2.5, Math.max(0.25, Number(state.playbackRate || 1))),
    hostId: state.hostId || room.hostId,
    revision: Math.max(0, Number(state.revision || 1)),
    quality: state.quality || room.defaultQuality,
    audioMode: state.audioMode || room.defaultAudio,
    screenMode: state.screenMode || room.defaultScreenMode,
    activeChapterId: state.activeChapterId,
    updatedById: state.updatedById,
    updatedByName: state.updatedByName ? state.updatedByName.slice(0, 80) : undefined,
    lastAction: state.lastAction,
    activeMovieTitle: (state.activeMovieTitle || movie?.title)?.slice(0, 160),
    activeMovieStreamUrl: (state.activeMovieStreamUrl || movie?.streamUrl)?.slice(0, 500),
    activeMovieThumbnailUrl: (state.activeMovieThumbnailUrl || movie?.thumbnailUrl)?.slice(0, 500),
    activeMovieDurationSeconds: state.activeMovieDurationSeconds ?? movie?.durationSeconds,
    updatedAtMs: state.updatedAt || nowMs,
    updatedAt: new Date(state.updatedAt || nowMs).toISOString(),
  });
}

function parseFirestorePlaybackDoc(roomId: string, raw: Record<string, unknown>): PlaybackState {
  const updatedAtMs =
    typeof raw.updatedAtMs === 'number' && Number.isFinite(raw.updatedAtMs)
      ? raw.updatedAtMs
      : toMsTimestamp(raw.updatedAt);

  return {
    roomId: String(raw.roomId || roomId),
    movieId: String(raw.movieId || 'mov-midnight-orbit'),
    currentTime: Math.max(0, Number(raw.currentTime || 0)),
    playing: Boolean(raw.playing),
    playbackRate: Math.min(2.5, Math.max(0.25, Number(raw.playbackRate || 1))),
    updatedAt: updatedAtMs,
    hostId: String(raw.hostId || ''),
    revision: Number(raw.revision || 1),
    quality: (raw.quality as PlaybackState['quality']) || '2160p',
    audioMode: (raw.audioMode as PlaybackState['audioMode']) || 'Original Audio',
    screenMode: (raw.screenMode as PlaybackState['screenMode']) || 'IMAX',
    activeChapterId: typeof raw.activeChapterId === 'string' ? raw.activeChapterId : undefined,
    updatedById: typeof raw.updatedById === 'string' ? raw.updatedById : undefined,
    updatedByName: typeof raw.updatedByName === 'string' ? raw.updatedByName : undefined,
    lastAction: raw.lastAction as PlaybackState['lastAction'],
    activeMovieTitle: typeof raw.activeMovieTitle === 'string' ? raw.activeMovieTitle : undefined,
    activeMovieStreamUrl: typeof raw.activeMovieStreamUrl === 'string' ? raw.activeMovieStreamUrl : undefined,
    activeMovieThumbnailUrl: typeof raw.activeMovieThumbnailUrl === 'string' ? raw.activeMovieThumbnailUrl : undefined,
    activeMovieDurationSeconds:
      typeof raw.activeMovieDurationSeconds === 'number' ? raw.activeMovieDurationSeconds : undefined,
  };
}

export async function ensureCloudRoomJoined(
  room: CinemaRoomRecord,
  movie: MovieRecord | null,
  playbackState: PlaybackState | null,
  fbUser: User
): Promise<{ roomHostId: string; roomGuestId?: string } | null> {
  const roomRef = doc(db, 'cinemaRooms', room.roomId);
  const nowIso = new Date().toISOString();
  try {
    const snap = await getDoc(roomRef);
    let roomHostId = room.hostId;
    let roomGuestId = room.guestId;

    if (!snap.exists()) {
      const roles = resolveCoupleRoles(room.hostPartnerRole, room.guestPartnerRole);
      const seats = resolveCoupleSeats(room.hostSeatId, room.guestSeatId);
      // If seeding a demo room for the first time in Firestore, bind the signed-in user as host so rules allow creation
      roomHostId = room.hostId.startsWith('demo-') ? fbUser.uid : room.hostId;
      if (roomHostId !== fbUser.uid) {
        roomHostId = fbUser.uid;
      }
      roomGuestId = room.guestId && !room.guestId.startsWith('demo-') ? room.guestId : undefined;
      const roomPayload = stripUndefined({
        roomId: room.roomId,
        hostId: roomHostId,
        hostName: (room.hostName || fbUser.displayName || 'Partner A').slice(0, 80),
        guestId: roomGuestId,
        guestLabel: (room.guestLabel || 'My GF').slice(0, 40),
        hostPartnerRole: roles.hostPartnerRole,
        guestPartnerRole: roles.guestPartnerRole,
        hostSeatId: seats.hostSeat.id,
        guestSeatId: seats.guestSeat.id,
        inviteCode: sanitizeId(room.inviteCode),
        name: room.name.slice(0, 120),
        movieId: room.movieId,
        theme: room.theme,
        privacy: room.privacy,
        defaultQuality: room.defaultQuality,
        defaultAudio: room.defaultAudio,
        defaultScreenMode: room.defaultScreenMode,
        status: room.status,
        createdAt: room.createdAt || nowIso,
        updatedAt: nowIso,
      });
      await setDoc(roomRef, roomPayload);

      const pbRef = doc(db, 'cinemaRooms', room.roomId, 'playbackStates', 'current');
      const baseState: PlaybackState = playbackState || {
        roomId: room.roomId,
        movieId: room.movieId,
        currentTime: 0,
        playing: false,
        playbackRate: 1,
        updatedAt: Date.now(),
        hostId: roomHostId,
        revision: 1,
        quality: room.defaultQuality,
        audioMode: room.defaultAudio,
        screenMode: room.defaultScreenMode,
      };
      await setDoc(pbRef, buildFirestorePlaybackDoc({ ...room, hostId: roomHostId }, baseState, movie));
    } else {
      const existing = snap.data() as CinemaRoomRecord;
      roomHostId = existing.hostId;
      roomGuestId = existing.guestId;
      if (
        existing.hostId !== fbUser.uid &&
        existing.guestId !== fbUser.uid &&
        existing.privacy === 'invite_code' &&
        existing.status !== 'ended'
      ) {
        await updateDoc(roomRef, {
          guestId: fbUser.uid,
          status: existing.status,
          updatedAt: nowIso,
        });
        roomGuestId = fbUser.uid;
      }
    }

    const amHost = roomHostId === fbUser.uid;
    const seats = resolveCoupleSeats(room.hostSeatId, room.guestSeatId);
    const roles = resolveCoupleRoles(room.hostPartnerRole, room.guestPartnerRole);
    const seatId = amHost ? seats.hostSeat.id : seats.guestSeat.id;
    const partnerRole: PartnerGenderRole = amHost ? roles.hostPartnerRole : roles.guestPartnerRole;

    const participantRef = doc(db, 'cinemaRooms', room.roomId, 'participants', sanitizeId(fbUser.uid));
    await setDoc(
      participantRef,
      stripUndefined({
        userId: fbUser.uid,
        displayName: (fbUser.displayName || 'Cinema Guest').slice(0, 80),
        avatarUrl: fbUser.photoURL || undefined,
        role: amHost ? 'host' : 'guest',
        partnerRole,
        seatId,
        seatLabel: formatSeatLabel(seatId),
        roomHostId,
        roomGuestId: roomGuestId || (amHost ? undefined : fbUser.uid),
        online: true,
        joinedAt: nowIso,
        updatedAt: nowIso,
      })
    );

    return { roomHostId, roomGuestId };
  } catch (err) {
    console.warn('Cloud Firestore room bootstrap warning:', err);
    return null;
  }
}

export interface CloudRoomCallbacks {
  onRoom: (room: Partial<CinemaRoomRecord>) => void;
  onPlayback: (state: PlaybackState) => void;
  onParticipants: (participants: RoomParticipant[]) => void;
  onChats: (messages: ChatMessageRecord[]) => void;
  onInteraction: (ev: CoupleReactionEvent) => void;
}

export function subscribeToCloudRoom(
  roomId: string,
  fbUser: User,
  roomMembership: { roomHostId: string; roomGuestId?: string },
  callbacks: CloudRoomCallbacks
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  const memberField = roomMembership.roomHostId === fbUser.uid ? 'roomHostId' : 'roomGuestId';

  unsubs.push(
    onSnapshot(
      doc(db, 'cinemaRooms', roomId),
      (snap) => {
        if (!snap.exists()) return;
        callbacks.onRoom(snap.data() as CinemaRoomRecord);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `cinemaRooms/${roomId}`);
        } catch {
          // logged by handleFirestoreError
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'cinemaRooms', roomId, 'playbackStates', 'current'),
      (snap) => {
        if (!snap.exists()) return;
        const parsed = parseFirestorePlaybackDoc(roomId, snap.data() as Record<string, unknown>);
        callbacks.onPlayback(parsed);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `cinemaRooms/${roomId}/playbackStates/current`);
        } catch {
          // logged
        }
      }
    )
  );

  const pQuery = query(collection(db, 'cinemaRooms', roomId, 'participants'), where(memberField, '==', fbUser.uid));
  unsubs.push(
    onSnapshot(
      pQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as RoomParticipant);
        if (list.length > 0) callbacks.onParticipants(list);
      },
      (err) => {
        console.warn('Participants cloud sync skipped:', err?.message);
      }
    )
  );

  const chatQuery = query(
    collection(db, 'cinemaRooms', roomId, 'chatMessages'),
    where(memberField, '==', fbUser.uid),
    orderBy('createdAt', 'asc'),
    limit(150)
  );
  unsubs.push(
    onSnapshot(
      chatQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ChatMessageRecord);
        if (list.length > 0) callbacks.onChats(list);
      },
      (err) => {
        console.warn('Chat cloud sync skipped:', err?.message);
      }
    )
  );

  const seenInteractions = new Set<string>();
  const interQuery = query(
    collection(db, 'cinemaRooms', roomId, 'interactions'),
    where(memberField, '==', fbUser.uid),
    orderBy('createdAtMs', 'desc'),
    limit(12)
  );
  let initialBatch = true;
  unsubs.push(
    onSnapshot(
      interQuery,
      (snap) => {
        if (initialBatch) {
          for (const d of snap.docs) seenInteractions.add(d.id);
          initialBatch = false;
          return;
        }
        for (const change of snap.docChanges()) {
          if (change.type === 'added' && !seenInteractions.has(change.doc.id)) {
            seenInteractions.add(change.doc.id);
            const raw = change.doc.data() as {
              id: string;
              roomId: string;
              senderId: string;
              senderName: string;
              kind: CoupleReactionEvent['kind'];
              label: string;
              createdAtMs: number;
            };
            callbacks.onInteraction({
              id: raw.id,
              roomId: raw.roomId,
              senderId: raw.senderId,
              senderName: raw.senderName,
              kind: raw.kind,
              label: raw.label,
              createdAt: raw.createdAtMs,
            });
          }
        }
      },
      (err) => {
        console.warn('Interaction cloud sync skipped:', err?.message);
      }
    )
  );

  return () => {
    for (const u of unsubs) u();
  };
}

export async function pushCloudPlaybackState(
  room: CinemaRoomRecord,
  state: PlaybackState,
  movie?: MovieRecord | null
): Promise<void> {
  const pbRef = doc(db, 'cinemaRooms', room.roomId, 'playbackStates', 'current');
  await setDoc(pbRef, buildFirestorePlaybackDoc(room, state, movie), { merge: true });
}

export async function pushCloudRoomSeatsAndRoles(
  room: CinemaRoomRecord,
  patch: {
    hostSeatId: string;
    guestSeatId: string;
    hostName?: string;
    guestLabel?: string;
    hostPartnerRole: PartnerGenderRole;
    guestPartnerRole: PartnerGenderRole;
  }
): Promise<void> {
  const roomRef = doc(db, 'cinemaRooms', room.roomId);
  await updateDoc(
    roomRef,
    stripUndefined({
      hostSeatId: patch.hostSeatId,
      guestSeatId: patch.guestSeatId,
      hostName: patch.hostName?.slice(0, 80),
      guestLabel: patch.guestLabel?.slice(0, 40),
      hostPartnerRole: patch.hostPartnerRole,
      guestPartnerRole: patch.guestPartnerRole,
      updatedAt: new Date().toISOString(),
    })
  );
}

export async function pushCloudRoomSource(
  room: CinemaRoomRecord,
  movie: MovieRecord,
  nextState: PlaybackState
): Promise<void> {
  const roomRef = doc(db, 'cinemaRooms', room.roomId);
  await updateDoc(roomRef, {
    movieId: movie.id,
    status: 'ready',
    updatedAt: new Date().toISOString(),
  });
  await pushCloudPlaybackState(room, nextState, movie);
}

export async function pushCloudChatMessage(
  room: CinemaRoomRecord,
  msg: ChatMessageRecord
): Promise<void> {
  const cleanId = sanitizeId(msg.id);
  const ref = doc(db, 'cinemaRooms', room.roomId, 'chatMessages', cleanId);
  await setDoc(
    ref,
    stripUndefined({
      id: cleanId,
      roomId: room.roomId,
      roomHostId: room.hostId,
      roomGuestId: room.guestId,
      senderId: msg.senderId,
      senderName: msg.senderName.slice(0, 80),
      text: msg.text.slice(0, 1200),
      type: msg.type,
      gifUrl: msg.gifUrl,
      voiceDurationSec: msg.voiceDurationSec,
      replyToId: msg.replyToId,
      replyPreview: msg.replyPreview?.slice(0, 160),
      reactions: msg.reactions || {},
      readBy: msg.readBy || [msg.senderId],
      createdAt: msg.createdAt,
    })
  );
}

export async function pushCloudCoupleInteraction(
  room: CinemaRoomRecord,
  event: CoupleReactionEvent
): Promise<void> {
  const cleanId = sanitizeId(event.id);
  const ref = doc(db, 'cinemaRooms', room.roomId, 'interactions', cleanId);
  await setDoc(
    ref,
    stripUndefined({
      id: cleanId,
      roomId: room.roomId,
      roomHostId: room.hostId,
      roomGuestId: room.guestId,
      senderId: event.senderId,
      senderName: event.senderName.slice(0, 80),
      kind: event.kind.slice(0, 40),
      label: event.label.slice(0, 120),
      createdAtMs: event.createdAt,
    })
  );
}
