import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areSeatsAdjacent,
  assignCoupleSeats,
  AUDITORIUM_ROWS,
  AUDITORIUM_SEATS,
  computeSeatPovCamera,
  DEFAULT_GUEST_SEAT_ID,
  DEFAULT_HOST_SEAT_ID,
  findAdjacentPartnerSeat,
  formatSeatLabel,
  getSeatById,
  resolveCoupleSeats,
  resolveDefaultViewerRole,
} from './seatMap';

test('auditorium contains 6 tiered rows x 12 seats = 72 seats with strictly increasing Z and Y', () => {
  assert.equal(AUDITORIUM_SEATS.length, 72);
  const rowA = getSeatById('A6');
  const rowD = getSeatById('D6');
  const rowF = getSeatById('F6');
  assert.ok(rowA && rowD && rowF);
  assert.ok(rowA.position[2] < rowD.position[2] && rowD.position[2] < rowF.position[2]);
  assert.ok(rowA.position[1] < rowD.position[1] && rowD.position[1] < rowF.position[1]);
});

test('move my GF places girlfriend on target seat without moving host, or swaps if picking host seat', () => {
  const moved = assignCoupleSeats('D6', 'D7', 'B5', 'guest');
  assert.deepEqual(moved, { hostSeatId: 'D6', guestSeatId: 'B5' });

  const swapped = assignCoupleSeats('D6', 'B5', 'D6', 'guest');
  assert.deepEqual(swapped, { hostSeatId: 'B5', guestSeatId: 'D6' });
});

test('move me places host on target seat cleanly and swaps when picking GF seat', () => {
  const moved = assignCoupleSeats('D6', 'D7', 'E4', 'host');
  assert.deepEqual(moved, { hostSeatId: 'E4', guestSeatId: 'D7' });

  const swapped = assignCoupleSeats('E4', 'D7', 'D7', 'host');
  assert.deepEqual(swapped, { hostSeatId: 'D7', guestSeatId: 'E4' });
});

test('sit together keeps both seats adjacent inside the same row and wing without crossing aisles', () => {
  // Rightmost seat of left wing (col 3) pairs with col 2 (not col 4 across the aisle)
  const leftWing = assignCoupleSeats('D6', 'D7', 'C3', 'together');
  assert.deepEqual(leftWing, { hostSeatId: 'C2', guestSeatId: 'C3' });
  assert.equal(areSeatsAdjacent(leftWing.hostSeatId, leftWing.guestSeatId), true);

  // Center sweet-spot
  const center = assignCoupleSeats('D6', 'D7', 'B5', 'together');
  assert.deepEqual(center, { hostSeatId: 'B5', guestSeatId: 'B6' });
  assert.equal(areSeatsAdjacent(center.hostSeatId, center.guestSeatId), true);
});

test('resolveCoupleSeats falls back to defaults and prevents duplicate seat collision', () => {
  const fallback = resolveCoupleSeats(undefined, undefined);
  assert.equal(fallback.hostSeat.id, DEFAULT_HOST_SEAT_ID);
  assert.equal(fallback.guestSeat.id, DEFAULT_GUEST_SEAT_ID);

  const collided = resolveCoupleSeats('C5', 'C5');
  assert.equal(collided.hostSeat.id, 'C5');
  assert.notEqual(collided.guestSeat.id, 'C5');
  assert.equal(findAdjacentPartnerSeat('C5').id, collided.guestSeat.id);
  assert.match(formatSeatLabel('D7'), /Row D · Seat 7 \(Center\)/);
});

test('resolveDefaultViewerRole locks host to host seat and guest/GF to guest seat', () => {
  assert.equal(resolveDefaultViewerRole({ userId: 'demo-partner-a', roomHostId: 'demo-partner-a' }), 'host');
  assert.equal(resolveDefaultViewerRole({ userId: 'demo-partner-b', roomHostId: 'demo-partner-a' }), 'guest');
  assert.equal(
    resolveDefaultViewerRole({ userId: 'demo-partner-a', roomHostId: 'demo-partner-a', seatParam: 'gf' }),
    'guest'
  );
  assert.equal(
    resolveDefaultViewerRole({ userId: 'demo-partner-b', roomHostId: 'demo-partner-a', seatParam: 'host' }),
    'host'
  );
});

test('computeSeatPovCamera anchors eye position strictly inside the assigned seat and clears rows in front', () => {
  const b2 = getSeatById('B2')!;
  const f10 = getSeatById('F10')!;
  const poseB2 = computeSeatPovCamera(b2, 14.8, 84, 16 / 10);
  const poseF10 = computeSeatPovCamera(f10, 14.8, 84, 16 / 10);

  assert.equal(poseB2.eyePos[0], b2.position[0]);
  assert.ok(Math.abs(poseB2.eyePos[1] - (b2.position[1] + 1.24)) < 0.001);
  assert.ok(Math.abs(poseB2.eyePos[2] - (b2.position[2] + 0.04)) < 0.001);

  assert.equal(poseF10.eyePos[0], f10.position[0]);
  assert.ok(poseF10.eyePos[1] > poseB2.eyePos[1]);
  assert.ok(poseF10.eyePos[2] > poseB2.eyePos[2]);

  // Every tiered row B..F has unobstructed sightline above the preceding row's headrest to screen bottom (y=0.35)
  for (let i = 1; i < AUDITORIUM_ROWS.length; i++) {
    const frontRow = AUDITORIUM_ROWS[i - 1];
    const viewerSeat = getSeatById(`${AUDITORIUM_ROWS[i].row}6`)!;
    const pose = computeSeatPovCamera(viewerSeat, 14.8, 70, 16 / 10);
    const frontHeadrestTopY = frontRow.riserTopY + 0.985;
    const frontHeadrestZ = frontRow.z + 0.39;
    const slopeOverHeadrest = (frontHeadrestTopY - pose.eyePos[1]) / (pose.eyePos[2] - frontHeadrestZ);
    const rayAtScreenY = pose.eyePos[1] + slopeOverHeadrest * (pose.eyePos[2] + 14.5);
    assert.ok(rayAtScreenY < 0.35, `Row ${viewerSeat.row} sightline obstructed screen bottom: ${rayAtScreenY}`);
  }
});

