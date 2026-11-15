export type AuditoriumRowId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type AuditoriumSection = 'left' | 'center' | 'right';
export type SeatAssignMode = 'guest' | 'host' | 'together';

export interface AuditoriumSeat {
  id: string;
  row: AuditoriumRowId;
  rowIndex: number;
  column: number; // 1..12
  section: AuditoriumSection;
  tierLabel: 'Front Immersion' | 'VIP Center' | 'Stadium Balcony';
  /** World-space position of seat floor pivot (resting on top of its row riser) */
  position: [number, number, number];
}

export const AUDITORIUM_ROWS: ReadonlyArray<{
  row: AuditoriumRowId;
  rowIndex: number;
  z: number;
  riserTopY: number;
  riserHeight: number;
  riserDepth: number;
  tierLabel: AuditoriumSeat['tierLabel'];
}> = [
  { row: 'A', rowIndex: 0, z: -5.4, riserTopY: 0.02, riserHeight: 0.02, riserDepth: 2.8, tierLabel: 'Front Immersion' },
  { row: 'B', rowIndex: 1, z: -2.3, riserTopY: 0.24, riserHeight: 0.24, riserDepth: 3.0, tierLabel: 'Front Immersion' },
  { row: 'C', rowIndex: 2, z: 0.8, riserTopY: 0.52, riserHeight: 0.52, riserDepth: 3.0, tierLabel: 'VIP Center' },
  { row: 'D', rowIndex: 3, z: 3.9, riserTopY: 0.86, riserHeight: 0.86, riserDepth: 3.0, tierLabel: 'VIP Center' },
  { row: 'E', rowIndex: 4, z: 7.0, riserTopY: 1.24, riserHeight: 1.24, riserDepth: 3.0, tierLabel: 'Stadium Balcony' },
  { row: 'F', rowIndex: 5, z: 10.1, riserTopY: 1.66, riserHeight: 1.66, riserDepth: 3.4, tierLabel: 'Stadium Balcony' },
];

export const COLUMN_LAYOUT: ReadonlyArray<{
  column: number;
  x: number;
  section: AuditoriumSection;
}> = [
  { column: 1, x: -10.65, section: 'left' },
  { column: 2, x: -9.15, section: 'left' },
  { column: 3, x: -7.65, section: 'left' },
  // Left walking aisle at x = -5.7
  { column: 4, x: -3.75, section: 'center' },
  { column: 5, x: -2.25, section: 'center' },
  { column: 6, x: -0.75, section: 'center' },
  { column: 7, x: 0.75, section: 'center' },
  { column: 8, x: 2.25, section: 'center' },
  { column: 9, x: 3.75, section: 'center' },
  // Right walking aisle at x = +5.7
  { column: 10, x: 7.65, section: 'right' },
  { column: 11, x: 9.15, section: 'right' },
  { column: 12, x: 10.65, section: 'right' },
];

export const AISLE_X_POSITIONS = [-5.7, 5.7] as const;

export const DEFAULT_HOST_SEAT_ID = 'D6';
export const DEFAULT_GUEST_SEAT_ID = 'D7';

export const AUDITORIUM_SEATS: AuditoriumSeat[] = AUDITORIUM_ROWS.flatMap((rowSpec) =>
  COLUMN_LAYOUT.map((colSpec) => ({
    id: `${rowSpec.row}${colSpec.column}`,
    row: rowSpec.row,
    rowIndex: rowSpec.rowIndex,
    column: colSpec.column,
    section: colSpec.section,
    tierLabel: rowSpec.tierLabel,
    position: [colSpec.x, rowSpec.riserTopY, rowSpec.z] as [number, number, number],
  }))
);

const SEAT_MAP = new Map<string, AuditoriumSeat>(AUDITORIUM_SEATS.map((seat) => [seat.id, seat]));

export function normalizeSeatId(seatId?: string | null): string | null {
  if (!seatId || typeof seatId !== 'string') return null;
  const clean = seatId.trim().toUpperCase();
  return SEAT_MAP.has(clean) ? clean : null;
}

export function getSeatById(seatId?: string | null): AuditoriumSeat | undefined {
  const normalized = normalizeSeatId(seatId);
  return normalized ? SEAT_MAP.get(normalized) : undefined;
}

export function resolveCoupleSeats(hostSeatId?: string | null, guestSeatId?: string | null): {
  hostSeat: AuditoriumSeat;
  guestSeat: AuditoriumSeat;
} {
  const hostSeat = getSeatById(hostSeatId) || SEAT_MAP.get(DEFAULT_HOST_SEAT_ID)!;
  let guestSeat = getSeatById(guestSeatId) || SEAT_MAP.get(DEFAULT_GUEST_SEAT_ID)!;
  if (guestSeat.id === hostSeat.id) {
    guestSeat = findAdjacentPartnerSeat(hostSeat.id);
  }
  return { hostSeat, guestSeat };
}

/**
 * Finds the best side-by-side seat in the same row and section next to `seatId`.
 */
export function findAdjacentPartnerSeat(seatId: string): AuditoriumSeat {
  const base = getSeatById(seatId) || SEAT_MAP.get(DEFAULT_HOST_SEAT_ID)!;
  const sameRowSection = AUDITORIUM_SEATS.filter(
    (s) => s.row === base.row && s.section === base.section && s.id !== base.id
  );
  // Prefer immediate right (+1 column), else immediate left (-1 column)
  const right = sameRowSection.find((s) => s.column === base.column + 1);
  if (right) return right;
  const left = sameRowSection.find((s) => s.column === base.column - 1);
  if (left) return left;
  const anySameRow = AUDITORIUM_SEATS.find((s) => s.row === base.row && s.id !== base.id);
  return anySameRow || SEAT_MAP.get(DEFAULT_GUEST_SEAT_ID)!;
}

/**
 * Pure couple seat assignment state machine:
 * - `'guest'`: moves Your GF to `targetSeatId` (swaps cleanly if she picks your seat)
 * - `'host'`: moves You to `targetSeatId` (swaps cleanly if you pick her seat)
 * - `'together'`: seats You at `targetSeatId` (or left of pair) and Your GF directly adjacent in the same section
 */
export function assignCoupleSeats(
  currentHostSeatId: string | undefined,
  currentGuestSeatId: string | undefined,
  targetSeatId: string,
  mode: SeatAssignMode
): { hostSeatId: string; guestSeatId: string } {
  const current = resolveCoupleSeats(currentHostSeatId, currentGuestSeatId);
  const target = getSeatById(targetSeatId);
  if (!target) {
    return { hostSeatId: current.hostSeat.id, guestSeatId: current.guestSeat.id };
  }

  if (mode === 'guest') {
    if (target.id === current.hostSeat.id) {
      // Swap seats when clicking partner's current seat
      return { hostSeatId: current.guestSeat.id, guestSeatId: target.id };
    }
    return { hostSeatId: current.hostSeat.id, guestSeatId: target.id };
  }

  if (mode === 'host') {
    if (target.id === current.guestSeat.id) {
      return { hostSeatId: target.id, guestSeatId: current.hostSeat.id };
    }
    return { hostSeatId: target.id, guestSeatId: current.guestSeat.id };
  }

  // mode === 'together'
  const partner = findAdjacentPartnerSeat(target.id);
  // Keep host on the left and GF on the right when adjacent for consistent natural order
  if (partner.row === target.row && partner.column < target.column) {
    return { hostSeatId: partner.id, guestSeatId: target.id };
  }
  return { hostSeatId: target.id, guestSeatId: partner.id };
}

export function formatSeatLabel(seatId?: string | null): string {
  const seat = getSeatById(seatId);
  if (!seat) return 'Row D · Seat 6 (Center)';
  const sec = seat.section === 'center' ? 'Center' : seat.section === 'left' ? 'Left Wing' : 'Right Wing';
  return `Row ${seat.row} · Seat ${seat.column} (${sec})`;
}

export function areSeatsAdjacent(seatAId?: string | null, seatBId?: string | null): boolean {
  const a = getSeatById(seatAId);
  const b = getSeatById(seatBId);
  if (!a || !b || a.id === b.id) return false;
  return a.row === b.row && a.section === b.section && Math.abs(a.column - b.column) === 1;
}

import type { PartnerGenderRole } from '../types/cinema';

export type ViewerSeatRole = 'host' | 'guest';

export interface SeatPovCameraPose {
  eyePos: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
}

export function resolveCoupleRoles(
  hostPartnerRole?: PartnerGenderRole | null,
  guestPartnerRole?: PartnerGenderRole | null
): {
  hostPartnerRole: PartnerGenderRole;
  guestPartnerRole: PartnerGenderRole;
} {
  if (hostPartnerRole === 'bf' || hostPartnerRole === 'gf') {
    const opposite: PartnerGenderRole = hostPartnerRole === 'bf' ? 'gf' : 'bf';
    return {
      hostPartnerRole,
      guestPartnerRole: guestPartnerRole === opposite ? guestPartnerRole : opposite,
    };
  }
  if (guestPartnerRole === 'bf' || guestPartnerRole === 'gf') {
    const opposite: PartnerGenderRole = guestPartnerRole === 'bf' ? 'gf' : 'bf';
    return {
      hostPartnerRole: opposite,
      guestPartnerRole,
    };
  }
  return { hostPartnerRole: 'bf', guestPartnerRole: 'gf' };
}

export function setPartnerRoleForSide(
  side: ViewerSeatRole,
  role: PartnerGenderRole
): {
  hostPartnerRole: PartnerGenderRole;
  guestPartnerRole: PartnerGenderRole;
} {
  const clean: PartnerGenderRole = role === 'bf' ? 'bf' : 'gf';
  const other: PartnerGenderRole = clean === 'bf' ? 'gf' : 'bf';
  return side === 'host'
    ? { hostPartnerRole: clean, guestPartnerRole: other }
    : { hostPartnerRole: other, guestPartnerRole: clean };
}

export function swapCoupleRoles(
  hostPartnerRole?: PartnerGenderRole | null,
  guestPartnerRole?: PartnerGenderRole | null
): {
  hostPartnerRole: PartnerGenderRole;
  guestPartnerRole: PartnerGenderRole;
} {
  const current = resolveCoupleRoles(hostPartnerRole, guestPartnerRole);
  return {
    hostPartnerRole: current.guestPartnerRole,
    guestPartnerRole: current.hostPartnerRole,
  };
}

export function formatPartnerRoleBadge(role?: PartnerGenderRole | null): 'BF' | 'GF' {
  return role === 'bf' ? 'BF' : 'GF';
}

/**
 * Determines which couple seat the current viewer sits in.
 * Viewers are strictly restricted to one of the two occupied seats (never floating elsewhere).
 */
export function resolveDefaultViewerRole(params: {
  userId?: string | null;
  roomHostId?: string | null;
  seatParam?: string | null;
  hostPartnerRole?: PartnerGenderRole | null;
  guestPartnerRole?: PartnerGenderRole | null;
}): ViewerSeatRole {
  const param = params.seatParam?.trim().toLowerCase();
  const roles = resolveCoupleRoles(params.hostPartnerRole, params.guestPartnerRole);
  if (param === 'gf') return roles.guestPartnerRole === 'gf' ? 'guest' : 'host';
  if (param === 'bf') return roles.hostPartnerRole === 'bf' ? 'host' : 'guest';
  if (param === 'guest' || param === 'partner') return 'guest';
  if (param === 'me' || param === 'host') return 'host';
  if (params.userId && params.roomHostId && params.userId !== params.roomHostId) {
    return 'guest';
  }
  return 'host';
}

/**
 * Computes the exact first-person seated camera eye position, screen sightline target,
 * and field of view strictly from `seat` inside the 72-seat stadium auditorium.
 */
export function computeSeatPovCamera(
  seat: AuditoriumSeat,
  screenHeight3D: number,
  baseCameraFov: number,
  aspect: number
): SeatPovCameraPose {
  const isPortrait = aspect < 0.95;
  const eyeX = seat.position[0];
  const eyeY = seat.position[1] + 1.24;
  const eyeZ = seat.position[2] + 0.04;

  // Natural head angle slightly toward screen center when seated in left/right wings
  const lookX = Number((seat.position[0] * 0.14).toFixed(3));
  const baseLookY = isPortrait ? 4.35 : Math.max(4.0, Math.min(6.0, screenHeight3D * 0.32));
  const rowTiltAdjust = (3 - seat.rowIndex) * 0.22;
  const lookY = Number((baseLookY + rowTiltAdjust).toFixed(3));
  const lookZ = -14.5;

  let fov = Math.min(92, baseCameraFov + (seat.rowIndex <= 1 ? 6 : seat.rowIndex >= 4 ? 0 : 3));
  if (isPortrait) {
    const desiredHalfHFovRad = (Math.max(34, baseCameraFov * 0.52) * Math.PI) / 180;
    const verticalHalfRad = Math.atan(Math.tan(desiredHalfHFovRad) / Math.max(0.4, aspect));
    const deg = (verticalHalfRad * 2 * 180) / Math.PI;
    fov = Math.max(74, Math.min(92, deg));
  }

  return {
    eyePos: [eyeX, eyeY, eyeZ],
    lookAt: [lookX, lookY, lookZ],
    fov,
  };
}

