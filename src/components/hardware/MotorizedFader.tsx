import React, { useCallback, useRef, useState } from 'react';
import { Lock } from 'lucide-react';

interface MotorizedFaderProps {
  valueDb: number;
  onChange: (nextDb: number) => void;
  onCommit?: (finalDb: number) => void;
  height?: number;
  accentColor?: 'amber' | 'cyan' | 'emerald' | 'rose';
  readOnlyReason?: string;
  label?: string;
  showScale?: boolean;
  isMaster?: boolean;
}

const MIN_DB = -75;
const MAX_DB = 10;

export function dbToNormalized(db: number): number {
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  if (clamped >= -10) {
    return 0.5 + ((clamped + 10) / 20) * 0.5;
  }
  if (clamped >= -40) {
    return 0.16 + ((clamped + 40) / 30) * 0.34;
  }
  return ((clamped - MIN_DB) / 35) * 0.16;
}

export function normalizedToDb(norm: number): number {
  const n = Math.max(0, Math.min(1, norm));
  let db: number;
  if (n >= 0.5) {
    db = -10 + ((n - 0.5) / 0.5) * 20;
  } else if (n >= 0.16) {
    db = -40 + ((n - 0.16) / 0.34) * 30;
  } else {
    db = MIN_DB + (n / 0.16) * 35;
  }
  return Math.round(db * 10) / 10;
}

const SCALE_MARKS = [10, 5, 0, -5, -10, -20, -30, -40, -60];

export const MotorizedFader: React.FC<MotorizedFaderProps> = ({
  valueDb,
  onChange,
  onCommit,
  height = 196,
  accentColor = 'amber',
  readOnlyReason,
  label,
  showScale = true,
  isMaster = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);
  const [editingDb, setEditingDb] = useState(false);
  const [draftDb, setDraftDb] = useState('');

  const norm = dbToNormalized(valueDb);
  const capH = isMaster ? 36 : 30;
  const capTravel = height - capH - 4;
  const topPx = (1 - norm) * capTravel;

  const triggerFeedback = useCallback(() => {
    setPulseActive(true);
    window.setTimeout(() => setPulseActive(false), 160);
  }, []);

  const updateFromClientY = useCallback(
    (clientY: number) => {
      if (!trackRef.current || readOnlyReason) return;
      const rect = trackRef.current.getBoundingClientRect();
      const usable = rect.height - capH - 4;
      const relY = clientY - rect.top - capH / 2 - 2;
      const nextNorm = 1 - Math.max(0, Math.min(usable, relY)) / usable;
      onChange(normalizedToDb(nextNorm));
    },
    [onChange, readOnlyReason, capH]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnlyReason) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    triggerFeedback();
    updateFromClientY(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || readOnlyReason) return;
    updateFromClientY(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    onCommit?.(valueDb);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (readOnlyReason) return;
    e.preventDefault();
    triggerFeedback();
    const step = e.shiftKey ? 0.1 : 0.5;
    const next = Math.max(MIN_DB, Math.min(MAX_DB, valueDb + (e.deltaY < 0 ? step : -step)));
    onChange(Math.round(next * 10) / 10);
  };

  const handleDoubleClick = () => {
    if (readOnlyReason) return;
    triggerFeedback();
    onChange(0.0);
    onCommit?.(0.0);
  };

  const openInlineDbEdit = () => {
    if (readOnlyReason) return;
    setDraftDb(valueDb <= -74 ? '-75' : valueDb.toFixed(1));
    setEditingDb(true);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const commitInlineDbEdit = () => {
    if (!editingDb) return;
    setEditingDb(false);
    const trimmed = draftDb.trim().toLowerCase();
    if (!trimmed) return;
    if (trimmed === '-inf' || trimmed === '-∞') {
      onChange(MIN_DB);
      onCommit?.(MIN_DB);
      return;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.round(Math.max(MIN_DB, Math.min(MAX_DB, parsed)) * 10) / 10;
    triggerFeedback();
    onChange(clamped);
    onCommit?.(clamped);
  };

  const indicatorColor = isMaster
    ? 'bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.95)]'
    : accentColor === 'cyan'
      ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]'
      : accentColor === 'emerald'
        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
        : accentColor === 'rose'
          ? 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
          : 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]';

  return (
    <div className="flex flex-col items-center select-none relative">
      {label && (
        <span
          className={`text-[10px] font-semibold tracking-wider mb-1 whitespace-nowrap ${
            isMaster ? 'text-amber-300 font-mono' : 'text-slate-400'
          }`}
        >
          {label}
        </span>
      )}

      {/* Visual/Haptic Feedback Pill when adjusting Master Fader */}
      {isMaster && (dragging || pulseActive) && (
        <div className="absolute -top-6 z-20 px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono text-[10px] font-bold shadow-[0_0_14px_rgba(245,158,11,0.75)] whitespace-nowrap pointer-events-none">
          MASTER {valueDb > 0 ? `+${valueDb.toFixed(1)}` : valueDb.toFixed(1)} dB
        </div>
      )}

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        title={readOnlyReason ?? 'Drag to adjust · Shift+Wheel fine trim · Double-click 0.0 dB'}
        style={{ height }}
        className={`relative flex items-center justify-center rounded-md touch-none ${
          isMaster ? 'w-16 bg-[#0b0e14] border border-amber-500/30 shadow-inner' : 'w-12'
        } ${readOnlyReason ? 'cursor-not-allowed opacity-70' : 'cursor-ns-resize'}`}
      >
        {/* dB Silkscreen Scale Marks */}
        {showScale && (
          <div className="absolute inset-y-4 left-0 right-0 pointer-events-none">
            {SCALE_MARKS.map((mark) => {
              const mNorm = dbToNormalized(mark);
              const yPct = (1 - mNorm) * 100;
              const isUnity = mark === 0;
              return (
                <div
                  key={mark}
                  style={{ top: `${yPct}%` }}
                  className="absolute left-0 right-0 -translate-y-1/2 flex items-center justify-between px-0.5"
                >
                  <div
                    className={`h-px ${
                      isUnity
                        ? isMaster
                          ? 'w-4 bg-amber-300 shadow-[0_0_5px_rgba(251,191,36,0.9)]'
                          : 'w-3 bg-amber-400/90'
                        : 'w-2 bg-slate-600/80'
                    }`}
                  />
                  <span
                    className={`text-[8px] font-mono leading-none ${
                      isUnity ? 'text-amber-300 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {mark === -60 ? '-∞' : mark > 0 ? `+${mark}` : mark}
                  </span>
                  <div
                    className={`h-px ${
                      isUnity
                        ? isMaster
                          ? 'w-4 bg-amber-300 shadow-[0_0_5px_rgba(251,191,36,0.9)]'
                          : 'w-3 bg-amber-400/90'
                        : 'w-2 bg-slate-600/80'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Dual-Rail Stereo Track for Master OR Standard Fader Slot */}
        {isMaster ? (
          <div className="flex items-center gap-1.5 h-[calc(100%-22px)]">
            <div className="fader-slot relative w-1.5 h-full rounded-full overflow-hidden">
              <div
                style={{ height: `${norm * 100}%` }}
                className="absolute bottom-0 left-0 right-0 bg-amber-400/50"
              />
            </div>
            <div className="fader-slot relative w-1.5 h-full rounded-full overflow-hidden">
              <div
                style={{ height: `${norm * 100}%` }}
                className="absolute bottom-0 left-0 right-0 bg-amber-400/50"
              />
            </div>
          </div>
        ) : (
          <div className="fader-slot relative w-2 h-[calc(100%-24px)] rounded-full overflow-hidden">
            <div
              style={{ height: `${norm * 100}%` }}
              className={`absolute bottom-0 left-0 right-0 opacity-35 ${
                accentColor === 'cyan'
                  ? 'bg-sky-500'
                  : accentColor === 'emerald'
                    ? 'bg-emerald-500'
                    : accentColor === 'rose'
                      ? 'bg-rose-500'
                      : 'bg-amber-500'
              }`}
            />
          </div>
        )}

        {/* Sculpted Fader Cap */}
        <div
          style={{
            height: capH,
            transform: `translateY(${topPx - capTravel / 2}px) scale(${dragging ? 1.03 : 1})`,
          }}
          className={`absolute rounded-[4px] flex flex-col items-center justify-center transition-transform duration-75 ${
            isMaster
              ? 'w-12 bg-gradient-to-b from-[#92400e] via-[#451a03] to-[#78350f] border border-amber-400/80 shadow-[0_6px_14px_rgba(0,0,0,0.9),0_0_12px_rgba(245,158,11,0.28)]'
              : 'fader-cap w-9 border border-slate-500/40'
          } ${dragging ? 'ring-2 ring-amber-400/80' : ''}`}
        >
          <div className="w-7 h-[1px] bg-white/25 mb-[3px]" />
          {isMaster && <div className="w-7 h-[1px] bg-amber-200/30 mb-[2px]" />}
          <div className={`${isMaster ? 'w-9 h-[3px]' : 'w-7 h-[2px]'} rounded-full ${indicatorColor}`} />
          {isMaster && <div className="w-7 h-[1px] bg-black/70 mt-[2px]" />}
          <div className="w-7 h-[1px] bg-black/70 mt-[3px]" />
          {readOnlyReason && (
            <Lock className="w-2.5 h-2.5 text-amber-400 absolute -top-1.5 -right-1.5 bg-[#0e1117] rounded-full p-0.5" />
          )}
        </div>
      </div>

      {/* Numeric OLED Readout — Click for Precision dB Numeric Entry */}
      {editingDb ? (
        <input
          ref={inputRef}
          type="text"
          aria-label="Precision fader dB value"
          value={draftDb}
          onChange={(e) => setDraftDb(e.target.value)}
          onBlur={commitInlineDbEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitInlineDbEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditingDb(false);
            }
          }}
          className={`oled-display mt-1 px-1 py-0.5 rounded text-[10px] font-mono tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-amber-400 ${
            isMaster
              ? 'w-16 text-amber-300 font-bold border-amber-400'
              : 'w-13 text-amber-200 border-amber-400/70'
          }`}
        />
      ) : (
        <button
          type="button"
          onClick={openInlineDbEdit}
          disabled={Boolean(readOnlyReason)}
          title={readOnlyReason ?? 'Click to type exact dB (-75.0 to +10.0)'}
          className={`oled-display mt-1 px-1.5 py-0.5 min-h-[22px] rounded text-[10px] font-mono tabular-nums text-center transition-colors ${
            readOnlyReason ? 'cursor-not-allowed opacity-70' : 'cursor-text hover:border-amber-400/80'
          } ${
            isMaster
              ? 'w-16 text-amber-300 font-bold border-amber-500/40'
              : 'w-13 text-slate-200'
          }`}
        >
          {valueDb <= -74 ? '-∞ dB' : `${valueDb > 0 ? '+' : ''}${valueDb.toFixed(1)}`}
        </button>
      )}
    </div>
  );
};
