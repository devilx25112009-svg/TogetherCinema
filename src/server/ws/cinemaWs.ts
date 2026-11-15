import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ChatMessageRecord,
  CoupleInteractionKind,
  CoupleReactionEvent,
  PlaybackState,
  RoomParticipant,
} from '../../types/cinema';
import { applyAuthoritativeCommand, type PlaybackCommandInput } from '../../utils/playbackSync';
import { formatSeatLabel, resolveCoupleSeats } from '../../utils/seatMap';
import type { CinemaStore } from '../store/cinemaStore';

interface ClientMeta {
  ws: WebSocket;
  roomId: string;
  userId: string;
  displayName: string;
}

const INTERACTION_LABELS: Record<CoupleInteractionKind, string> = {
  heart: 'Sent a warm heart',
  kiss: 'Gave a sweet kiss',
  kiss_lips: 'Kissed your lips softly',
  kiss_forehead: 'Gave a warm forehead kiss',
  kiss_cheek: 'Kissed your cheek',
  kiss_neck: 'Gave a tender neck kiss',
  hug: 'Wrapped you in a warm hug',
  cuddle: 'Cuddled up close beside you',
  hold_hands: 'Held your hand tightly',
  headpat: 'Gave gentle headpats',
  playful_beat: 'Playfully bonked you!',
  pinch_cheek: 'Pinched your cute cheek',
  tickle: 'Tickled you in your seat!',
  give_rose: 'Handed you a midnight rose',
  whisper_ily: 'Whispered "I love you"',
  wave: 'Waved from the seat beside you',
  popcorn: 'Shared warm popcorn',
  heart_explosion: 'Heart explosion!',
  sparkles: 'Sent starlight sparkles',
  surprise_gift: 'Sent a surprise gift',
};

export function attachCinemaWebSocket(httpServer: HttpServer, store: CinemaStore) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const roomClients = new Map<string, Set<ClientMeta>>();

  const broadcast = (roomId: string, payload: unknown, excludeWs?: WebSocket) => {
    const set = roomClients.get(roomId);
    if (!set) return;
    const raw = JSON.stringify(payload);
    for (const client of set) {
      if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
      }
    }
  };

  wss.on('connection', (ws) => {
    let meta: ClientMeta | null = null;

    ws.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(String(rawData)) as { type: string; [key: string]: unknown };
        const snap = store.getSnapshot();

        if (msg.type === 'room:join') {
          const roomId = String(msg.roomId || '');
          const userId = String(msg.userId || 'guest');
          const displayName = String(msg.displayName || 'Cinema Guest').slice(0, 80);

          const room = snap.rooms.find((r) => r.roomId === roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Cinema room not found.' }));
            return;
          }

          meta = { ws, roomId, userId, displayName };
          if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
          roomClients.get(roomId)!.add(meta);

          const resolvedSeats = resolveCoupleSeats(room.hostSeatId, room.guestSeatId);
          room.hostSeatId = resolvedSeats.hostSeat.id;
          room.guestSeatId = resolvedSeats.guestSeat.id;

          if (!snap.participants[roomId]) snap.participants[roomId] = [];
          const existingP = snap.participants[roomId].find((p) => p.userId === userId);
          const role = room.hostId === userId ? 'host' : 'guest';
          const assignedSeatId = role === 'host' ? resolvedSeats.hostSeat.id : resolvedSeats.guestSeat.id;
          if (existingP) {
            existingP.online = true;
            existingP.displayName = displayName;
            if (!existingP.seatId) {
              existingP.seatId = assignedSeatId;
              existingP.seatLabel = formatSeatLabel(assignedSeatId);
            }
          } else {
            const p: RoomParticipant = {
              userId,
              displayName,
              role,
              online: true,
              seatId: assignedSeatId,
              seatLabel: formatSeatLabel(assignedSeatId),
              joinedAt: new Date().toISOString(),
            };
            snap.participants[roomId].push(p);
          }

          if (!snap.playbackStates[roomId]) {
            snap.playbackStates[roomId] = {
              roomId,
              movieId: room.movieId,
              currentTime: 0,
              playing: false,
              playbackRate: 1.0,
              updatedAt: Date.now(),
              hostId: room.hostId,
              revision: 1,
              quality: room.defaultQuality,
              audioMode: room.defaultAudio,
              screenMode: room.defaultScreenMode,
            };
          }

          await store.save();

          ws.send(
            JSON.stringify({
              type: 'room:init',
              room,
              playbackState: snap.playbackStates[roomId],
              participants: snap.participants[roomId],
              chatHistory: snap.chats[roomId] || [],
            })
          );

          broadcast(
            roomId,
            {
              type: 'room:participants',
              participants: snap.participants[roomId],
            },
            ws
          );
          return;
        }

        if (!meta) return;
        const { roomId, userId, displayName } = meta;

        if (msg.type === 'playback:command') {
          const current: PlaybackState | undefined = snap.playbackStates[roomId];
          if (!current) return;
          const cmd = msg.command as PlaybackCommandInput;
          const next = applyAuthoritativeCommand(current, cmd, Date.now());
          snap.playbackStates[roomId] = next;

          const room = snap.rooms.find((r) => r.roomId === roomId);
          if (room) {
            room.status = next.playing ? 'playing' : 'paused';
            room.updatedAt = new Date().toISOString();
          }
          await store.save();

          broadcast(roomId, {
            type: 'playback:state',
            playbackState: next,
            triggeredBy: { userId, displayName },
          });
          return;
        }

        if (msg.type === 'room:seats') {
          const room = snap.rooms.find((r) => r.roomId === roomId);
          if (!room) return;
          const resolved = resolveCoupleSeats(
            typeof msg.hostSeatId === 'string' ? msg.hostSeatId : room.hostSeatId,
            typeof msg.guestSeatId === 'string' ? msg.guestSeatId : room.guestSeatId
          );
          room.hostSeatId = resolved.hostSeat.id;
          room.guestSeatId = resolved.guestSeat.id;
          if (typeof msg.guestLabel === 'string' && msg.guestLabel.trim()) {
            room.guestLabel = msg.guestLabel.trim().slice(0, 40);
          }
          room.updatedAt = new Date().toISOString();

          const list = snap.participants[roomId] || [];
          for (const p of list) {
            const nextId = p.role === 'host' ? resolved.hostSeat.id : resolved.guestSeat.id;
            p.seatId = nextId;
            p.seatLabel = formatSeatLabel(nextId);
          }
          await store.save();

          broadcast(roomId, {
            type: 'room:seats',
            room,
            participants: list,
          });
          return;
        }

        if (msg.type === 'chat:message') {
          const text = String(msg.text || '').trim().slice(0, 1200);
          if (!text && !msg.gifUrl) return;
          const entry: ChatMessageRecord = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            roomId,
            senderId: userId,
            senderName: displayName,
            type: (msg.messageType as ChatMessageRecord['type']) || 'text',
            text,
            gifUrl: typeof msg.gifUrl === 'string' ? msg.gifUrl : undefined,
            voiceDurationSec: typeof msg.voiceDurationSec === 'number' ? msg.voiceDurationSec : undefined,
            replyToId: typeof msg.replyToId === 'string' ? msg.replyToId : undefined,
            replyPreview: typeof msg.replyPreview === 'string' ? msg.replyPreview : undefined,
            reactions: {},
            readBy: [userId],
            createdAt: new Date().toISOString(),
          };
          if (!snap.chats[roomId]) snap.chats[roomId] = [];
          snap.chats[roomId].push(entry);
          if (snap.chats[roomId].length > 200) {
            snap.chats[roomId] = snap.chats[roomId].slice(-200);
          }
          await store.save();

          broadcast(roomId, { type: 'chat:message', message: entry });
          return;
        }

        if (msg.type === 'chat:react') {
          const messageId = String(msg.messageId || '');
          const emoji = String(msg.emoji || '').slice(0, 8);
          const list = snap.chats[roomId] || [];
          const target = list.find((m) => m.id === messageId);
          if (target && emoji) {
            const arr = target.reactions[emoji] || [];
            if (arr.includes(userId)) {
              target.reactions[emoji] = arr.filter((id) => id !== userId);
            } else {
              target.reactions[emoji] = [...arr, userId];
            }
            await store.save();
            broadcast(roomId, { type: 'chat:updated', message: target });
          }
          return;
        }

        if (msg.type === 'chat:typing') {
          broadcast(
            roomId,
            {
              type: 'chat:typing',
              userId,
              displayName,
              isTyping: Boolean(msg.isTyping),
            },
            ws
          );
          return;
        }

        if (msg.type === 'couple:interaction') {
          const kind = String(msg.kind || 'heart') as CoupleInteractionKind;
          const event: CoupleReactionEvent = {
            id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            roomId,
            senderId: userId,
            senderName: displayName,
            kind,
            label: INTERACTION_LABELS[kind] || 'Sent love',
            createdAt: Date.now(),
          };
          broadcast(roomId, { type: 'couple:interaction', event });
          return;
        }

        if (msg.type === 'snack:send') {
          const snackName = String(msg.snackName || 'Warm Popcorn');
          const entry: ChatMessageRecord = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            roomId,
            senderId: userId,
            senderName: displayName,
            type: 'snack',
            text: `${displayName} passed you ${snackName} in the auditorium.`,
            reactions: {},
            readBy: [userId],
            createdAt: new Date().toISOString(),
          };
          if (!snap.chats[roomId]) snap.chats[roomId] = [];
          snap.chats[roomId].push(entry);
          await store.save();
          broadcast(roomId, { type: 'chat:message', message: entry });
          broadcast(roomId, {
            type: 'couple:interaction',
            event: {
              id: `snack-${Date.now()}`,
              roomId,
              senderId: userId,
              senderName: displayName,
              kind: 'popcorn',
              label: `Shared ${snackName}`,
              createdAt: Date.now(),
            } satisfies CoupleReactionEvent,
          });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', async () => {
      if (!meta) return;
      const { roomId, userId } = meta;
      const set = roomClients.get(roomId);
      if (set) {
        set.delete(meta);
        if (set.size === 0) roomClients.delete(roomId);
      }
      const snap = store.getSnapshot();
      const participant = snap.participants[roomId]?.find((p) => p.userId === userId);
      if (participant) {
        participant.online = false;
        await store.save();
        broadcast(roomId, {
          type: 'room:participants',
          participants: snap.participants[roomId],
        });
      }
    });
  });

  return { wss, broadcastToRoom: broadcast };
}
