import React from 'react';

interface ArcGaugeProps {
  value: number;
  min: number;
  max: number;
  label: string;
  unit?: string;
  subLabel?: string;
  size?: number;
  accent?: 'emerald' | 'amber' | 'rose' | 'cyan' | 'auto';
  segments?: number;
  formatValue?: (v: number) => string;
}

export const ArcGauge: React.FC<ArcGaugeProps> = ({
  value,
  min,
  max,
  label,
  unit = '',
  subLabel,
  size = 96,
  accent = 'auto',
  segments = 20,
  formatValue,
}) => {
  const norm = Math.max(0, Math.min(1, (value - min) / Math.max(0.0001, max - min)));
  const activeCount = Math.round(norm * segments);
  const cx = 50;
  const cy = 54;
  const radius = 38;
  const startDeg = -215;
  const endDeg = 35;

  const getSegColor = (idx: number, isActive: boolean) => {
    if (!isActive) return 'rgba(148, 163, 184, 0.14)';
    if (accent === 'emerald') return '#10b981';
    if (accent === 'cyan') return '#38bdf8';
    if (accent === 'amber') return '#f59e0b';
    if (accent === 'rose') return '#f43f5e';
    const ratio = idx / (segments - 1);
    if (ratio > 0.78) return '#f43f5e';
    if (ratio > 0.52) return '#f59e0b';
    return '#10b981';
  };

  const displayStr = formatValue ? formatValue(value) : `${Math.round(value)}${unit}`;

  return (
    <div className="flex flex-col items-center select-none">
      <div style={{ width: size, height: size * 0.88 }} className="relative">
        <svg viewBox="0 0 100 88" className="w-full h-full overflow-visible">
          {Array.from({ length: segments }).map((_, idx) => {
            const t = idx / (segments - 1);
            const deg = startDeg + t * (endDeg - startDeg);
            const rad = (deg * Math.PI) / 180;
            const x1 = cx + Math.cos(rad) * (radius - 6);
            const y1 = cy + Math.sin(rad) * (radius - 6);
            const x2 = cx + Math.cos(rad) * radius;
            const y2 = cy + Math.sin(rad) * radius;
            const isActive = idx < activeCount;
            const col = getSegColor(idx, isActive);
            return (
              <line
                key={idx}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={col}
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            );
          })}

          {/* Inner Dark Dial Bezel */}
          <circle cx={cx} cy={cy} r={24} fill="#090c12" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

          <text
            x={cx}
            y={cy + 2}
            textAnchor="middle"
            fill="#f8fafc"
            fontSize="12"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            {displayStr}
          </text>
          {subLabel && (
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="7"
              fontFamily="JetBrains Mono, monospace"
            >
              {subLabel}
            </text>
          )}
        </svg>
      </div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 text-center leading-tight">
        {label}
      </span>
    </div>
  );
};
