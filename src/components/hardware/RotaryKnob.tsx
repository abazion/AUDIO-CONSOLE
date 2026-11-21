import React, { useCallback, useRef, useState } from 'react';
import { Lock } from 'lucide-react';

interface RotaryKnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  onChange: (next: number) => void;
  onCommit?: (finalVal: number) => void;
  label: string;
  unit?: string;
  size?: number;
  bipolar?: boolean;
  accentColor?: 'amber' | 'cyan' | 'emerald' | 'rose';
  formatValue?: (val: number) => string;
  manualOnlyReason?: string;
  disabled?: boolean;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  value,
  min,
  max,
  step = 0.5,
  defaultValue = 0,
  onChange,
  onCommit,
  label,
  unit = '',
  size = 44,
  bipolar = false,
  accentColor = 'amber',
  formatValue,
  manualOnlyReason,
  disabled = false,
}) => {
  const dragStartRef = useRef<{ y: number; startVal: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamped = Math.max(min, Math.min(max, value));
  const norm = (clamped - min) / Math.max(0.0001, max - min);
  // Sweep from -135 deg to +135 deg
  const angleDeg = -135 + norm * 270;

  const isLocked = Boolean(manualOnlyReason) || disabled;

  const clampAndRound = useCallback(
    (raw: number) => {
      const c = Math.max(min, Math.min(max, raw));
      const snapped = Math.round(c / step) * step;
      return Number(snapped.toFixed(2));
    },
    [min, max, step]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isLocked) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { y: e.clientY, startVal: clamped };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStartRef.current || isLocked) return;
    const dy = dragStartRef.current.y - e.clientY;
    const sensitivity = e.shiftKey ? 320 : 130;
    const delta = (dy / sensitivity) * (max - min);
    onChange(clampAndRound(dragStartRef.current.startVal + delta));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStartRef.current = null;
    setDragging(false);
    onCommit?.(clamped);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isLocked) return;
    e.preventDefault();
    const mult = e.shiftKey ? 0.25 : 1;
    const next = clampAndRound(clamped + (e.deltaY < 0 ? step * mult : -step * mult));
    onChange(next);
  };

  const handleDoubleClick = () => {
    if (isLocked) return;
    const target = clampAndRound(defaultValue);
    onChange(target);
    onCommit?.(target);
  };

  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;

  const polarToXY = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const describeArc = (startDeg: number, endDeg: number, radius: number) => {
    const s = polarToXY(startDeg, radius);
    const e = polarToXY(endDeg, radius);
    const diff = endDeg - startDeg;
    const largeArc = Math.abs(diff) > 180 ? 1 : 0;
    const sweep = diff >= 0 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${e.x} ${e.y}`;
  };

  const strokeHex =
    manualOnlyReason
      ? '#64748b'
      : accentColor === 'cyan'
        ? '#38bdf8'
        : accentColor === 'emerald'
          ? '#10b981'
          : accentColor === 'rose'
            ? '#f43f5e'
            : '#f59e0b';

  const activeArcStart = bipolar ? 0 : -135;
  const activeArcEnd = angleDeg;

  const displayStr = formatValue
    ? formatValue(clamped)
    : `${bipolar && clamped > 0 ? '+' : ''}${Number.isInteger(step) ? Math.round(clamped) : clamped.toFixed(1)}${unit}`;

  return (
    <div className="flex flex-col items-center select-none">
      <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase mb-0.5 whitespace-nowrap">
        {label}
      </span>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        title={
          manualOnlyReason ??
          `${label}: ${displayStr} · Drag vertically (Shift fine) · Double-click reset`
        }
        style={{ width: size, height: size }}
        className={`relative flex items-center justify-center touch-none ${
          isLocked ? 'cursor-not-allowed opacity-75' : 'cursor-ns-resize'
        }`}
      >
        {/* Radial LED Collar SVG */}
        <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
          <path
            d={describeArc(-135, 135, r)}
            fill="none"
            stroke="var(--console-border)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {Math.abs(activeArcEnd - activeArcStart) > 1 && (
            <path
              d={describeArc(activeArcStart, activeArcEnd, r)}
              fill="none"
              stroke={strokeHex}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={manualOnlyReason ? '2 3' : undefined}
            />
          )}
        </svg>

        {/* Knurled Metallic Cap */}
        <div
          style={{
            width: size - 12,
            height: size - 12,
            transform: `rotate(${angleDeg}deg)`,
          }}
          className={`knob-body rounded-full border relative flex items-start justify-center transition-shadow ${
            dragging ? 'border-amber-400/70' : 'border-slate-500/60'
          }`}
        >
          <div
            className="w-[2.5px] rounded-full mt-1"
            style={{
              height: Math.max(6, (size - 12) * 0.34),
              backgroundColor: manualOnlyReason ? '#64748b' : strokeHex,
            }}
          />
        </div>

        {manualOnlyReason && (
          <div className="absolute -bottom-0.5 -right-0.5 bg-[#0d1016] border border-amber-500/40 rounded-full p-0.5">
            <Lock className="w-2.5 h-2.5 text-amber-400" />
          </div>
        )}
      </div>

      <span className="text-[10px] font-mono tabular-nums text-slate-200 mt-0.5 leading-none whitespace-nowrap">
        {displayStr}
      </span>
    </div>
  );
};
