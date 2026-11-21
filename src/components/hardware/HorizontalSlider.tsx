import React, { useCallback, useRef, useState } from 'react';

interface HorizontalSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accentColor?: 'amber' | 'cyan' | 'emerald' | 'rose';
  bipolar?: boolean;
  disabled?: boolean;
  formatValue?: (v: number) => string;
  onChange: (value: number) => void;
}

export const HorizontalSlider: React.FC<HorizontalSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 0.5,
  unit = '',
  accentColor = 'cyan',
  bipolar = false,
  disabled = false,
  formatValue,
  onChange,
}) => {
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const norm = Math.max(0, Math.min(1, (value - min) / Math.max(0.0001, max - min)));

  const commitFromClientX = useCallback(
    (clientX: number) => {
      if (disabled || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const rel = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const raw = min + (rel / rect.width) * (max - min);
      const stepped = Math.round(raw / step) * step;
      const clamped = Math.max(min, Math.min(max, Number(stepped.toFixed(2))));
      onChange(clamped);
    },
    [disabled, max, min, onChange, step]
  );

  const fillColor =
    accentColor === 'amber'
      ? 'bg-amber-400'
      : accentColor === 'emerald'
        ? 'bg-emerald-400'
        : accentColor === 'rose'
          ? 'bg-rose-500'
          : 'bg-sky-400';

  const displayText = formatValue
    ? formatValue(value)
    : `${bipolar && value > 0 ? '+' : ''}${Number.isInteger(step) ? Math.round(value) : value.toFixed(1)}${unit ? ` ${unit}` : ''}`;

  return (
    <div className={`space-y-1.5 select-none ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-slate-400 uppercase tracking-wider">{label}</span>
        <span className="text-slate-100 tabular-nums font-semibold">{displayText}</span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          commitFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging) commitFromClientX(e.clientX);
        }}
        onPointerUp={(e) => {
          if (dragging) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            setDragging(false);
          }
        }}
        onWheel={(e) => {
          if (disabled) return;
          e.preventDefault();
          const delta = e.deltaY < 0 ? step : -step;
          const next = Math.max(min, Math.min(max, Number((value + delta).toFixed(2))));
          onChange(next);
        }}
        className="relative h-5 flex items-center cursor-ew-resize touch-none"
      >
        <div className="w-full h-2 fader-slot rounded-full relative overflow-hidden">
          {bipolar ? (
            <div
              style={{
                left: norm >= 0.5 ? '50%' : `${norm * 100}%`,
                width: `${Math.abs(norm - 0.5) * 100}%`,
              }}
              className={`absolute top-0 bottom-0 ${fillColor} opacity-80`}
            />
          ) : (
            <div
              style={{ width: `${norm * 100}%` }}
              className={`h-full ${fillColor} opacity-80`}
            />
          )}
        </div>

        {/* Machined Horizontal Cap */}
        <div
          style={{ left: `calc(${norm * 100}% - 7px)` }}
          className={`fader-cap absolute w-3.5 h-4 rounded-[3px] border flex items-center justify-center ${
            dragging ? 'border-amber-400 ring-1 ring-amber-400/60' : 'border-slate-500/70'
          }`}
        >
          <div className="w-[1.5px] h-2 bg-slate-200 rounded-full" />
        </div>
      </div>
    </div>
  );
};
