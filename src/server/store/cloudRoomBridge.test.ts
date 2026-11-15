import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CinemaStore } from './cinemaStore';
import { mergeCloudBundleIntoStore } from './cloudRoomBridge';

test('mergeCloudBundleIntoStore hydrates room, playback, movie, participants, and chat into a cold server store', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-cloud-bridge-'));
  try {
    const coldStore = new CinemaStore(tmpDir);
    mergeCloudBundleIntoStore(coldStore, {
      room: {
        roomId: 'room-cloud-42',
        hostId: 'host-u1',
        hostName: 'Rohan',
        guestId: 'guest-u2',
        guestLabel: 'Ananya',
        hostPartnerRole: 'gf',
        guestPartnerRole: 'bf',
        hostSeatId: 'C4',
        guestSeatId: 'C5',
        inviteCode: 'CLOUD-42',
        name: 'Cloud Serverless Night',
        movieId: 'mov-cloud-1',
        theme: 'midnight_velvet',
        privacy: 'invite_code',
        defaultQuality: '2160p',
        defaultAudio: 'Dolby Atmos',
        defaultScreenMode: 'Dolby Cinema',
        status: 'playing',
        createdAt: '2026-11-15T10:00:00.000Z',
        updatedAt: '2026-11-15T10:05:00.000Z',
      },
      movie: {
        id: 'mov-cloud-1',
        ownerId: 'host-u1',
        title: 'Starlight Crossing',
        description: 'Cloud synced custom title',
        genre: 'Sci-Fi',
        durationSeconds: 3600,
        fileSizeBytes: 12_000_000_000,
        resolution: '4K UHD',
        sourceHeight: 2160,
        stereoscopicFormat: 'none',
        videoFormat: 'MP4',
        audioFormat: 'AAC',
        subtitles: [],
        audioTracks: [],
        chapters: [{ id: 'ch-2', title: '02. Orbit', timeSeconds: 1200 }],
        thumbnailUrl: '/images/poster_midnight_orbit_1794680182030.jpg',
        streamUrl: 'procedural://midnight-orbit',
        processingStatus: 'ready',
        collectionName: 'Cloud Premieres',
        playbackProgress: 0,
        isFavourite: false,
        createdAt: '2026-11-15T10:00:00.000Z',
        updatedAt: '2026-11-15T10:00:00.000Z',
      },
      playbackState: {
        roomId: 'room-cloud-42',
        movieId: 'mov-cloud-1',
        currentTime: 1245,
        playing: true,
        playbackRate: 1,
        updatedAt: Date.now(),
        hostId: 'host-u1',
        revision: 7,
        quality: '2160p',
        audioMode: 'Dolby Atmos',
        screenMode: 'Dolby Cinema',
        activeChapterId: 'ch-2',
        lastAction: 'seek',
      },
      participants: [
        {
          userId: 'host-u1',
          displayName: 'Rohan',
          role: 'host',
          partnerRole: 'gf',
          online: true,
          seatId: 'C4',
          seatLabel: 'Row C · Seat 4 (Center)',
          joinedAt: '2026-11-15T10:00:00.000Z',
        },
      ],
      chatHistory: [
        {
          id: 'msg-cloud-1',
          roomId: 'room-cloud-42',
          senderId: 'host-u1',
          senderName: 'Rohan',
          type: 'text',
          text: 'Synced across cloud servers!',
          reactions: {},
          readBy: ['host-u1'],
          createdAt: '2026-11-15T10:01:00.000Z',
        },
      ],
      savedAtMs: Date.now(),
    });

    const snap = coldStore.getSnapshot();
    const room = snap.rooms.find((r) => r.roomId === 'room-cloud-42');
    assert.ok(room);
    assert.equal(room.hostPartnerRole, 'gf');
    assert.equal(room.guestPartnerRole, 'bf');
    assert.equal(snap.playbackStates['room-cloud-42']?.revision, 7);
    assert.equal(snap.playbackStates['room-cloud-42']?.activeChapterId, 'ch-2');
    assert.equal(snap.movies.some((m) => m.id === 'mov-cloud-1'), true);
    assert.equal(snap.participants['room-cloud-42']?.[0]?.partnerRole, 'gf');
    assert.equal(snap.chats['room-cloud-42']?.[0]?.text, 'Synced across cloud servers!');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('mergeCloudBundleIntoStore ignores stale playback revisions and older room metadata', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-cloud-stale-'));
  try {
    const store = new CinemaStore(tmpDir);
    const snap = store.getSnapshot();
    const room = snap.rooms.find((r) => r.roomId === 'room-tonight')!;
    room.hostPartnerRole = 'gf';
    room.guestPartnerRole = 'bf';
    room.updatedAt = '2026-11-15T12:00:00.000Z';
    snap.playbackStates['room-tonight'] = {
      ...snap.playbackStates['room-tonight'],
      revision: 9,
      currentTime: 3300,
      activeChapterId: 'ch-3',
      updatedAt: 2_000_000_000_000,
    };

    mergeCloudBundleIntoStore(store, {
      room: {
        ...room,
        hostPartnerRole: 'bf',
        guestPartnerRole: 'gf',
        updatedAt: '2026-11-15T11:00:00.000Z',
      },
      playbackState: {
        ...snap.playbackStates['room-tonight'],
        revision: 4,
        currentTime: 100,
        activeChapterId: 'ch-1',
        updatedAt: 1_900_000_000_000,
      },
      savedAtMs: Date.now(),
    });

    assert.equal(room.hostPartnerRole, 'gf');
    assert.equal(snap.playbackStates['room-tonight'].revision, 9);
    assert.equal(snap.playbackStates['room-tonight'].activeChapterId, 'ch-3');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
