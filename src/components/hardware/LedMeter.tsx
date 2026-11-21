import React from 'react';

interface LedMeterProps {
  peakDbfs: number;
  rmsDbfs?: number;
  peakHoldDbfs?: number;
  gainReductionDb?: number;
  clipping?: boolean;
  height?: number;
  width?: number;
  segments?: number;
  label?: string;
}

export const LedMeter: React.FC<LedMeterProps> = ({
  peakDbfs,
  peakHoldDbfs = -80,
  gainReductionDb = 0,
  clipping = false,
  height = 176,
  width = 12,
  segments = 20,
  label,
}) => {
  const mapDbToIdx = (db: number) => {
    const norm = (db + 56) / 58;
    return Math.max(0, Math.min(segments, Math.round(norm * segments)));
  };

  const activeSegments = mapDbToIdx(peakDbfs);
  const holdIdx = mapDbToIdx(peakHoldDbfs);
  const grSegments = Math.min(8, Math.round(gainReductionDb / 1.5));

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="flex items-stretch gap-1">
        <div
          style={{ height, width }}
          className="console-well rounded-[3px] p-[2px] flex flex-col-reverse justify-between"
        >
          {Array.from({ length: segments }).map((_, i) => {
            const lit = i < activeSegments || (i === holdIdx - 1 && holdIdx > 1);
            const isClip = i >= segments - 2;
            const isAmber = i >= segments - 6 && i < segments - 2;

            let bg = 'bg-slate-800/50';
            if (lit) {
              if (isClip) {
                bg = clipping || i === segments - 1 ? 'bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.85)]' : 'bg-rose-500/90';
              } else if (isAmber) {
                bg = 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.5)]';
              } else {
                bg = 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]';
              }
            }

            return <div key={i} className={`w-full flex-1 my-[0.5px] rounded-[1px] ${bg}`} />;
          })}
        </div>

        {gainReductionDb > 0.2 && (
          <div
            style={{ height }}
            className="w-1.5 console-well rounded-[2px] p-[1px] flex flex-col justify-start gap-[1px]"
            title={`Gain Reduction: -${gainReductionDb.toFixed(1)} dB`}
          >
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={`w-full flex-1 rounded-[1px] ${
                  i < grSegments ? 'bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.7)]' : 'bg-slate-800/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      {label && <span className="text-[8px] font-mono text-slate-500 leading-none">{label}</span>}
    </div>
  );
};

interface AnalogVuMeterProps {
  levelDbfs: number;
  label: string;
  peakLed?: boolean;
  compact?: boolean;
}

export const AnalogVuMeter: React.FC<AnalogVuMeterProps> = ({
  levelDbfs,
  label,
  peakLed,
  compact = false,
}) => {
  const vuValue = Math.max(-24, Math.min(3, levelDbfs + 18));
  const norm = (vuValue + 24) / 27;
  const angleDeg = -44 + norm * 88;

  return (
    <div
      className={`console-well rounded-md border border-amber-500/20 flex flex-col items-center ${
        compact ? 'p-1' : 'p-2'
      }`}
    >
      <div
        className={`relative rounded overflow-hidden bg-gradient-to-b from-[#2f2411] via-[#1f170b] to-[#110c05] border border-amber-900/60 shadow-inner ${
          compact ? 'w-full h-11' : 'w-36 h-20'
        }`}
      >
        <svg viewBox="0 0 140 80" className="w-full h-full">
          <path
            d="M 22 64 A 52 52 0 0 1 94 20"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.8"
            opacity="0.75"
          />
          <path
            d="M 94 20 A 52 52 0 0 1 118 64"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2.8"
            opacity="0.92"
          />
          {[-20, -10, -5, -3, 0, 3].map((v, i) => {
            const tNorm = (v + 20) / 23;
            const deg = -42 + tNorm * 84;
            const rad = ((deg - 90) * Math.PI) / 180;
            const x1 = 70 + 46 * Math.cos(rad);
            const y1 = 72 + 46 * Math.sin(rad);
            const x2 = 70 + 54 * Math.cos(rad);
            const y2 = 72 + 54 * Math.sin(rad);
            const tx = 70 + 36 * Math.cos(rad);
            const ty = 72 + 36 * Math.sin(rad);
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={v >= 0 ? '#ef4444' : '#fde68a'}
                  strokeWidth="1.4"
                />
                {!compact && (
                  <text
                    x={tx}
                    y={ty}
                    fill={v >= 0 ? '#fca5a5' : '#fde68a'}
                    fontSize="6.5"
                    fontFamily="JetBrains Mono"
                    textAnchor="middle"
                  >
                    {v > 0 ? `+${v}` : v}
                  </text>
                )}
              </g>
            );
          })}

          {!compact && (
            <text
              x="70"
              y="54"
              fill="#d97706"
              fontSize="7"
              fontFamily="Outfit"
              textAnchor="middle"
              letterSpacing="1.2"
            >
              VU
            </text>
          )}

          {/* Moving Needle with realistic ballistic transition */}
          <g transform={`rotate(${angleDeg}, 70, 76)`} style={{ transition: 'transform 75ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
            <line x1="70" y1="76" x2="70" y2="15" stroke="#fffbeb" strokeWidth={compact ? '2.2' : '1.6'} />
          </g>
          <circle cx="70" cy="76" r="6" fill="#0f172a" stroke="#78350f" strokeWidth="1.5" />
        </svg>

        <div
          className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${
            peakLed || levelDbfs > -1.5
              ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.95)]'
              : 'bg-rose-950/80 border border-rose-900/50'
          }`}
          title="Peak Overload Indicator"
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between w-full px-0.5">
        <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-mono text-amber-200/80 truncate`}>
          {label}
        </span>
        <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-mono tabular-nums text-amber-300`}>
          {levelDbfs <= -75 ? '-∞' : levelDbfs.toFixed(1)}
        </span>
      </div>
    </div>
  );
};

interface DualChannelVuBridgeProps {
  inputRmsDbfs: number;
  outputRmsDbfs: number;
  inputPeakDbfs: number;
  outputPeakDbfs: number;
}

export const DualChannelVuBridge: React.FC<DualChannelVuBridgeProps> = ({
  inputRmsDbfs,
  outputRmsDbfs,
  inputPeakDbfs,
  outputPeakDbfs,
}) => {
  return (
    <div className="w-full grid grid-cols-2 gap-1">
      <AnalogVuMeter
        label="IN"
        levelDbfs={inputRmsDbfs}
        peakLed={inputPeakDbfs > -1.0}
        compact
      />
      <AnalogVuMeter
        label="OUT"
        levelDbfs={outputRmsDbfs}
        peakLed={outputPeakDbfs > -1.0}
        compact
      />
    </div>
  );
};
