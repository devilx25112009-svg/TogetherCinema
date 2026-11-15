import type { PartnerGenderRole } from '../types/cinema';

export function buildPartnerAuditoriumLink(
  origin: string,
  roomId: string,
  inviteCode: string,
  partnerRole: PartnerGenderRole = 'gf'
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const cleanRoomId = encodeURIComponent(roomId.trim());
  const cleanInvite = encodeURIComponent(inviteCode.trim().toUpperCase());
  const seatParam = partnerRole === 'bf' ? 'bf' : 'gf';
  return `${cleanOrigin}/cinema/${cleanRoomId}?invite=${cleanInvite}&seat=${seatParam}&auditoriumOnly=1`;
}

export function buildShortPartnerJoinLink(origin: string, inviteCode: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}/join/${encodeURIComponent(inviteCode.trim().toUpperCase())}`;
}

export function isPartnerInviteValid(
  providedInvite: string | null | undefined,
  roomInviteCode: string | null | undefined
): boolean {
  const a = (providedInvite || '').trim().toUpperCase();
  const b = (roomInviteCode || '').trim().toUpperCase();
  return Boolean(a && b && a === b);
}

export function resolveAuditoriumOnlyMode(params: {
  auditoriumOnlyParam: string | null | undefined;
  inviteParam: string | null | undefined;
}): boolean {
  if (params.auditoriumOnlyParam === '1' || params.auditoriumOnlyParam === 'true') {
    return true;
  }
  return Boolean(params.inviteParam && params.inviteParam.trim().length > 0);
}
