import React, { useState } from 'react';
import { Armchair, ArrowLeftRight, Heart, Sparkles, User, Users, X } from 'lucide-react';
import type { ScreenMode } from '../../types/cinema';
import {
  assignCoupleSeats,
  areSeatsAdjacent,
  AUDITORIUM_ROWS,
  AUDITORIUM_SEATS,
  findAdjacentPartnerSeat,
  formatSeatLabel,
  resolveCoupleSeats,
  type SeatAssignMode,
  type ViewerSeatRole,
} from '../../utils/seatMap';

export interface AuditoriumSeatMapProps {
  hostSeatId?: string;
  guestSeatId?: string;
  hostLabel?: string;
  guestLabel?: string;
  viewerSeatRole?: ViewerSeatRole;
  screenMode?: ScreenMode;
  saving?: boolean;
  onChangeSeats: (next: { hostSeatId: string; guestSeatId: string; guestLabel?: string }) => void;
  onChangeViewerRole?: (role: ViewerSeatRole) => void;
  onClose?: () => void;
  compact?: boolean;
}

export function AuditoriumSeatMap({
  hostSeatId,
  guestSeatId,
  hostLabel = 'You',
  guestLabel = 'My GF',
  viewerSeatRole,
  screenMode = 'Screen X',
  saving = false,
  onChangeSeats,
  onChangeViewerRole,
  compact = false,
}: AuditoriumSeatMapProps) {
  const [assignMode, setAssignMode] = useState<SeatAssignMode>('guest');
  const [editingLabel, setEditingLabel] = useState(guestLabel);

  const resolved = resolveCoupleSeats(hostSeatId, guestSeatId);
  const currentHostId = resolved.hostSeat.id;
  const currentGuestId = resolved.guestSeat.id;
  const together = areSeatsAdjacent(currentHostId, currentGuestId);

  const handleSeatClick = (seatId: string) => {
    const next = assignCoupleSeats(currentHostId, currentGuestId, seatId, assignMode);
    onChangeSeats({
      hostSeatId: next.hostSeatId,
      guestSeatId: next.guestSeatId,
      guestLabel: editingLabel.trim() || guestLabel,
    });
  };

  const handleBringGfBesideMe = () => {
    const partnerSeat = findAdjacentPartnerSeat(currentHostId);
    onChangeSeats({
      hostSeatId: currentHostId,
      guestSeatId: partnerSeat.id,
      guestLabel: editingLabel.trim() || guestLabel,
    });
  };

  const handleSwapSeats = () => {
    onChangeSeats({
      hostSeatId: currentGuestId,
      guestSeatId: currentHostId,
      guestLabel: editingLabel.trim() || guestLabel,
    });
  };

  const applyPreset = (h: string, g: string) => {
    onChangeSeats({
      hostSeatId: h,
      guestSeatId: g,
      guestLabel: editingLabel.trim() || guestLabel,
    });
  };

  const seatColumnsLeft = [1, 2, 3];
  const seatColumnsCenter = [4, 5, 6, 7, 8, 9];
  const seatColumnsRight = [10, 11, 12];

  const renderSeatButton = (rowId: string, col: number) => {
    const seat = AUDITORIUM_SEATS.find((s) => s.row === rowId && s.column === col);
    if (!seat) return null;
    const isHost = seat.id === currentHostId;
    const isGuest = seat.id === currentGuestId;
    const isCenter = seat.section === 'center';

    let seatClasses =
      'bg-[#18132b] border-white/10 text-slate-300 hover:border-[#C4B5FD]/60 hover:bg-[#241b42]';
    if (isCenter) {
      seatClasses =
        'bg-[#221840] border-[#8B5CF6]/25 text-slate-200 hover:border-[#C4B5FD]/80 hover:bg-[#2d2055]';
    }
    if (isHost) {
      seatClasses =
        'bg-[#8B5CF6] border-[#C4B5FD] text-white shadow-[0_0_16px_rgba(139,92,246,0.65)] scale-[1.04]';
    } else if (isGuest) {
      seatClasses =
        'bg-[#F472B6] border-rose-200 text-[#080810] font-bold shadow-[0_0_16px_rgba(244,114,182,0.65)] scale-[1.04]';
    }

    const whoHere = isHost ? ` (${hostLabel})` : isGuest ? ` (${editingLabel || guestLabel})` : '';

    return (
      <button
        key={seat.id}
        type="button"
        data-testid={`seat-btn-${seat.id}`}
        data-seat-owner={isHost ? 'host' : isGuest ? 'guest' : 'open'}
        onClick={() => handleSeatClick(seat.id)}
        aria-label={`Seat ${seat.id}, ${formatSeatLabel(seat.id)}${whoHere}`}
        title={`${seat.id} · ${formatSeatLabel(seat.id)}${whoHere}`}
        className={`relative flex flex-col items-center justify-center rounded-t-lg rounded-b-sm border transition-all cursor-pointer select-none ${
          compact ? 'w-6 h-6 sm:w-7 sm:h-7 text-[9px]' : 'w-7 h-7 sm:w-9 sm:h-8 text-[10px]'
        } ${seatClasses}`}
      >
        <span className="leading-none font-mono font-semibold">
          {isHost ? 'YOU' : isGuest ? 'GF' : seat.id}
        </span>
        <span
          className={`mt-0.5 h-[3px] w-3/4 rounded-full ${
            isHost ? 'bg-white/75' : isGuest ? 'bg-[#080810]/55' : 'bg-white/15'
          }`}
        />
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Placement Target Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#0B1020] border border-white/10">
          <button
            type="button"
            data-testid="seat-mode-guest"
            onClick={() => setAssignMode('guest')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              assignMode === 'guest'
                ? 'bg-[#F472B6] text-[#080810]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Move My GF</span>
          </button>
          <button
            type="button"
            data-testid="seat-mode-host"
            onClick={() => setAssignMode('host')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              assignMode === 'host'
                ? 'bg-[#8B5CF6] text-white'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Move Me</span>
          </button>
          <button
            type="button"
            data-testid="seat-mode-together"
            onClick={() => setAssignMode('together')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              assignMode === 'together'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#F472B6] text-white'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Sit Together</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleBringGfBesideMe}
            className="px-2.5 py-1.5 rounded-lg bg-[#1C1930] border border-[#F472B6]/35 hover:border-[#F472B6] text-[11px] font-medium text-[#F472B6] flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3 h-3" />
            <span>Bring GF Next to Me</span>
          </button>
          <button
            type="button"
            onClick={handleSwapSeats}
            className="px-2.5 py-1.5 rounded-lg bg-[#1C1930] border border-white/10 hover:border-[#C4B5FD]/50 text-[11px] font-medium text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>Swap</span>
          </button>
        </div>
      </div>

      {/* Overhead Cinema Auditorium Map */}
      <div className="rounded-xl bg-[#090812] border border-[#C4B5FD]/15 p-3 sm:p-4 space-y-3 overflow-x-auto">
        {/* Curved Cinema Screen Indicator */}
        <div className="flex flex-col items-center space-y-1">
          <div
            className={`h-2.5 w-3/4 max-w-md rounded-b-full border-b-2 ${
              screenMode === 'Screen X'
                ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 shadow-[0_6px_22px_rgba(139,92,246,0.55)]'
                : 'border-[#C4B5FD] bg-[#C4B5FD]/15 shadow-[0_6px_18px_rgba(196,181,253,0.4)]'
            }`}
          />
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#C4B5FD]">
            {screenMode === 'Screen X' ? '270° ScreenX Curved Stage' : `${screenMode} Screen`}
          </p>
        </div>

        {/* 6 Rows x 12 Seats Grid with Twin Glowing Aisles */}
        <div className="space-y-1.5 min-w-[450px]">
          {AUDITORIUM_ROWS.map((rowSpec) => (
            <div key={rowSpec.row} className="flex items-center justify-center gap-1.5 sm:gap-2">
              <span
                className="w-5 text-right text-[10px] font-mono font-bold text-slate-400 shrink-0"
                title={rowSpec.tierLabel}
              >
                {rowSpec.row}
              </span>

              {/* Left Wing (1-3) */}
              <div className="flex items-center gap-1">
                {seatColumnsLeft.map((col) => renderSeatButton(rowSpec.row, col))}
              </div>

              {/* Left Aisle */}
              <div className="w-3 sm:w-5 flex justify-center">
                <span className="w-1 h-4 rounded-full bg-amber-400/25" />
              </div>

              {/* VIP Center (4-9) */}
              <div className="flex items-center gap-1">
                {seatColumnsCenter.map((col) => renderSeatButton(rowSpec.row, col))}
              </div>

              {/* Right Aisle */}
              <div className="w-3 sm:w-5 flex justify-center">
                <span className="w-1 h-4 rounded-full bg-amber-400/25" />
              </div>

              {/* Right Wing (10-12) */}
              <div className="flex items-center gap-1">
                {seatColumnsRight.map((col) => renderSeatButton(rowSpec.row, col))}
              </div>

              <span className="w-5 text-left text-[10px] font-mono text-slate-500 shrink-0">{rowSpec.row}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-[11px] text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-slate-200">
              <span className="w-3 h-3 rounded bg-[#8B5CF6] inline-block" />
              <span>{hostLabel} ({currentHostId})</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-200">
              <span className="w-3 h-3 rounded bg-[#F472B6] inline-block" />
              <span>{editingLabel || guestLabel} ({currentGuestId})</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#221840] border border-[#8B5CF6]/40 inline-block" />
              <span>VIP Center</span>
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#C4B5FD]">
            {together ? 'Seated side-by-side' : 'Custom separate spots'}
            {saving ? ' · Syncing...' : ''}
          </span>
        </div>
      </div>

      {/* GF Name Label + Quick Row Presets */}
      <div className="grid sm:grid-cols-2 gap-3 items-center">
        <div className="flex items-center gap-2 rounded-xl bg-[#0B1020] border border-white/10 px-3 py-2">
          <Heart className="w-3.5 h-3.5 text-[#F472B6] shrink-0" />
          <label htmlFor="gf-seat-label-input" className="text-[11px] text-slate-400 shrink-0">
            GF Name:
          </label>
          <input
            id="gf-seat-label-input"
            type="text"
            value={editingLabel}
            maxLength={32}
            onChange={(e) => setEditingLabel(e.target.value)}
            onBlur={() => {
              if (editingLabel.trim() && editingLabel.trim() !== guestLabel) {
                onChangeSeats({
                  hostSeatId: currentHostId,
                  guestSeatId: currentGuestId,
                  guestLabel: editingLabel.trim(),
                });
              }
            }}
            placeholder="My GF"
            className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => applyPreset('A6', 'A7')}
            className="px-2.5 py-1.5 rounded-lg bg-[#1C1930] hover:bg-[#2a2444] text-slate-200 whitespace-nowrap cursor-pointer"
          >
            Front (A6·A7)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('D6', 'D7')}
            className="px-2.5 py-1.5 rounded-lg bg-[#1C1930] hover:bg-[#2a2444] text-slate-200 whitespace-nowrap cursor-pointer"
          >
            VIP Center (D6·D7)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('F6', 'F7')}
            className="px-2.5 py-1.5 rounded-lg bg-[#1C1930] hover:bg-[#2a2444] text-slate-200 whitespace-nowrap cursor-pointer"
          >
            Balcony (F6·F7)
          </button>
        </div>
      </div>

      {/* Live Readout & Strict Seat-Only Camera Perspective Cards */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div
            className={`p-2.5 rounded-xl border transition-colors ${
              viewerSeatRole === 'host'
                ? 'bg-[#8B5CF6]/25 border-[#C4B5FD]'
                : 'bg-[#8B5CF6]/12 border-[#8B5CF6]/35'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-[#C4B5FD]">Your Seat</p>
              {onChangeViewerRole && (
                <button
                  type="button"
                  data-testid="view-from-host-btn"
                  onClick={() => onChangeViewerRole('host')}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                    viewerSeatRole === 'host'
                      ? 'bg-[#8B5CF6] text-white'
                      : 'bg-[#0B1020] text-[#C4B5FD] hover:text-white'
                  }`}
                >
                  {viewerSeatRole === 'host' ? 'Active View' : 'Sit Here'}
                </button>
              )}
            </div>
            <p className="font-semibold text-white mt-0.5 truncate" data-testid="summary-host-seat">
              {currentHostId} · {formatSeatLabel(currentHostId)}
            </p>
          </div>
          <div
            className={`p-2.5 rounded-xl border transition-colors ${
              viewerSeatRole === 'guest'
                ? 'bg-[#F472B6]/25 border-rose-200'
                : 'bg-[#F472B6]/12 border-[#F472B6]/35'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-[#F472B6]">
                {editingLabel || guestLabel}
              </p>
              {onChangeViewerRole && (
                <button
                  type="button"
                  data-testid="view-from-guest-btn"
                  onClick={() => onChangeViewerRole('guest')}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                    viewerSeatRole === 'guest'
                      ? 'bg-[#F472B6] text-[#080810]'
                      : 'bg-[#0B1020] text-[#F472B6] hover:text-white'
                  }`}
                >
                  {viewerSeatRole === 'guest' ? 'Active View' : 'View Her Seat'}
                </button>
              )}
            </div>
            <p className="font-semibold text-white mt-0.5 truncate" data-testid="summary-guest-seat">
              {currentGuestId} · {formatSeatLabel(currentGuestId)}
            </p>
          </div>
        </div>
        {onChangeViewerRole && (
          <p className="text-[11px] text-slate-400 text-center">
            3D auditorium camera is locked strictly to your seated POV ({viewerSeatRole === 'guest' ? currentGuestId : currentHostId}) — no outside views.
          </p>
        )}
      </div>
    </div>
  );
}

export function SeatMapModal(props: AuditoriumSeatMapProps & { open: boolean }) {
  if (!props.open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Auditorium Seat Map"
      data-testid="seat-map-modal"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-5"
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#151126] border border-[#C4B5FD]/30 p-4 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#C4B5FD]">
              <Armchair className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-white">
                Auditorium Seat Map (72 Luxury Seats)
              </h2>
              <p className="text-xs text-slate-300">
                Choose where you sit and place your girlfriend anywhere in the hall — updates live in 3D.
              </p>
            </div>
          </div>
          {props.onClose && (
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close seat map"
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <AuditoriumSeatMap {...props} />
      </div>
    </div>
  );
}
