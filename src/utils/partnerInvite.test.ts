import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPartnerAuditoriumLink,
  buildShortPartnerJoinLink,
  isPartnerInviteValid,
  resolveAuditoriumOnlyMode,
} from './partnerInvite';

test('buildPartnerAuditoriumLink encodes room, invite, gf seat, and auditoriumOnly lock', () => {
  const link = buildPartnerAuditoriumLink('https://cinema.example.com/', 'room-tonight', 'love-2026');
  assert.equal(
    link,
    'https://cinema.example.com/cinema/room-tonight?invite=LOVE-2026&seat=gf&auditoriumOnly=1'
  );
  assert.equal(
    buildShortPartnerJoinLink('https://cinema.example.com', 'cin-ab12'),
    'https://cinema.example.com/join/CIN-AB12'
  );
});

test('isPartnerInviteValid validates case-insensitive matching codes cleanly', () => {
  assert.equal(isPartnerInviteValid('love-2026', 'LOVE-2026'), true);
  assert.equal(isPartnerInviteValid('  CIN-99AA ', 'CIN-99AA'), true);
  assert.equal(isPartnerInviteValid('WRONG', 'LOVE-2026'), false);
  assert.equal(isPartnerInviteValid('', 'LOVE-2026'), false);
});

test('resolveAuditoriumOnlyMode enables lock when auditoriumOnly or invite token is passed', () => {
  assert.equal(resolveAuditoriumOnlyMode({ auditoriumOnlyParam: '1', inviteParam: null }), true);
  assert.equal(resolveAuditoriumOnlyMode({ auditoriumOnlyParam: null, inviteParam: 'LOVE-2026' }), true);
  assert.equal(resolveAuditoriumOnlyMode({ auditoriumOnlyParam: null, inviteParam: null }), false);
});
