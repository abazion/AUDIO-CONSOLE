import React, { useCallback, useRef, useState } from 'react';
import { ISO_31_FREQS } from '../../engine/profiles';
import { ConsoleButton } from './ConsoleButton';

interface GraphicEq31BandProps {
  bands: number[];
  enabled: boolean;
  onToggleEnabled: () => void;
  onChangeBand: (index: number, db: number) => void;
  onResetFlat: () => void;
  onApplyCurvePreset?: (preset: 'vocal' | 'sanctuary' | 'bass') => void;
  quickLoadLabel?: string;
  quickLoadSummary?: string;
  quickLoadActive?: boolean;
  onQuickLoad?: () => void;
  channelLabel: string;
}

const MIN_GAIN = -15;
const MAX_GAIN = 15;

export const GraphicEq31Band: React.FC<GraphicEq31BandProps> = ({
  bands,
  enabled,
  onToggleEnabled,
  onChangeBand,
  onResetFlat,
  onApplyCurvePreset,
  quickLoadLabel,
  quickLoadSummary,
  quickLoadActive = false,
  onQuickLoad,
  channelLabel,
}) => {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([]);

  const updateFromPointer = useCallback(
    (idx: number, clientY: number) => {
      const el = trackRefs.current[idx];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const rel = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const norm = 1 - rel / rect.height;
      const db = Math.round((MIN_GAIN + norm * (MAX_GAIN - MIN_GAIN)) * 2) / 2;
      onChangeBand(idx, db);
    },
    [onChangeBand]
  );

  const formatFreq = (hz: number) => {
    if (hz >= 1000) return `${hz / 1000}k`;
    return `${hz}`;
  };

  return (
    <div className="console-chassis rounded-lg border p-4 space-y-3 select-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5">
        <div>
          <div
            style={{ color: 'var(--console-accent-text)' }}
            className="text-xs font-mono font-semibold tracking-wider uppercase"
          >
            31-Band 1/3-Octave Graphic Equalizer · {channelLabel}
          </div>
          <div className="text-[11px] text-slate-400">
            {quickLoadSummary
              ? `Smart Match: ${quickLoadSummary}`
              : 'ISO 20 Hz – 20 kHz ±15 dB Constant-Q · Drag or scroll any slider · Double-click 0.0 dB'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onQuickLoad && quickLoadLabel && (
            <ConsoleButton
              label={quickLoadActive ? `QUICK-LOAD ON · ${quickLoadLabel}` : `QUICK-LOAD: ${quickLoadLabel}`}
              size="xs"
              color="amber"
              active={quickLoadActive}
              onClick={onQuickLoad}
            />
          )}
          {onApplyCurvePreset && (
            <>
              <button
                type="button"
                onClick={() => onApplyCurvePreset('vocal')}
                className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-slate-300 hover:text-slate-100 whitespace-nowrap"
              >
                Vocal Presence
              </button>
              <button
                type="button"
                onClick={() => onApplyCurvePreset('sanctuary')}
                className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-slate-300 hover:text-slate-100 whitespace-nowrap"
              >
                Anti-Mud Cut
              </button>
              <button
                type="button"
                onClick={() => onApplyCurvePreset('bass')}
                className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-slate-300 hover:text-slate-100 whitespace-nowrap"
              >
                Sub Tight
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onResetFlat}
            className="px-2.5 py-1 rounded console-btn-surface text-[10px] font-mono text-slate-200 whitespace-nowrap"
          >
            FLAT 0 dB
          </button>
          <ConsoleButton
            label={enabled ? '31-BAND IN' : 'BYPASSED'}
            size="xs"
            color={enabled ? 'emerald' : 'crimson'}
            active={enabled}
            onClick={onToggleEnabled}
          />
        </div>
      </div>

      {/* 31-Band Skeuomorphic Fader Bank */}
      <div className="console-well rounded-md p-3 overflow-x-auto">
        <div className="flex items-stretch gap-1 min-w-[920px]">
          {/* Left Scale Column */}
          <div className="w-8 flex flex-col justify-between py-2 text-[9px] font-mono text-slate-500 text-right pr-1 shrink-0">
            <span>+15</span>
            <span>+6</span>
            <span className="text-amber-400 font-semibold">0</span>
            <span>-6</span>
            <span>-15</span>
          </div>

          {ISO_31_FREQS.map((freq, idx) => {
            const val = bands[idx] ?? 0;
            const norm = (val - MIN_GAIN) / (MAX_GAIN - MIN_GAIN);
            const isBoost = val > 0.1;
            const isCut = val < -0.1;
            return (
              <div key={freq} className="flex-1 flex flex-col items-center gap-1 min-w-[26px]">
                <span
                  className={`text-[8px] font-mono tabular-nums leading-none ${
                    isBoost
                      ? 'text-emerald-300'
                      : isCut
                        ? 'text-amber-300'
                        : 'text-slate-500'
                  }`}
                >
                  {val > 0 ? `+${val.toFixed(0)}` : val.toFixed(0)}
                </span>

                <div
                  ref={(el) => {
                    trackRefs.current[idx] = el;
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraggingIdx(idx);
                    updateFromPointer(idx, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (draggingIdx === idx) {
                      updateFromPointer(idx, e.clientY);
                    }
                  }}
                  onPointerUp={(e) => {
                    if (draggingIdx === idx) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      setDraggingIdx(null);
                    }
                  }}
                  onWheel={(e) => {
                    e.preventDefault();
                    const step = e.shiftKey ? 0.5 : 1.0;
                    const next = Math.max(
                      MIN_GAIN,
                      Math.min(MAX_GAIN, val + (e.deltaY < 0 ? step : -step))
                    );
                    onChangeBand(idx, Math.round(next * 2) / 2);
                  }}
                  onDoubleClick={() => onChangeBand(idx, 0)}
                  title={`${freq} Hz: ${val > 0 ? '+' : ''}${val.toFixed(1)} dB`}
                  className={`relative w-5 h-32 flex items-center justify-center cursor-ns-resize touch-none ${
                    !enabled ? 'opacity-50' : ''
                  }`}
                >
                  {/* Center 0dB Reference Hairline */}
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-amber-500/40 pointer-events-none" />

                  {/* Recessed Slot */}
                  <div className="fader-slot w-1.5 h-full rounded-full relative overflow-hidden">
                    {isBoost && (
                      <div
                        style={{
                          bottom: '50%',
                          height: `${((val / MAX_GAIN) * 50).toFixed(1)}%`,
                        }}
                        className="absolute left-0 right-0 bg-emerald-500/60"
                      />
                    )}
                    {isCut && (
                      <div
                        style={{
                          top: '50%',
                          height: `${((Math.abs(val) / MAX_GAIN) * 50).toFixed(1)}%`,
                        }}
                        className="absolute left-0 right-0 bg-amber-500/60"
                      />
                    )}
                  </div>

                  {/* Machined Mini Graphic EQ Cap */}
                  <div
                    style={{ top: `${(1 - norm) * 86}%` }}
                    className={`fader-cap absolute w-4 h-3.5 rounded-[2px] border flex items-center justify-center ${
                      draggingIdx === idx
                        ? 'border-amber-400 ring-1 ring-amber-400/60'
                        : 'border-slate-500/60'
                    }`}
                  >
                    <div
                      className={`w-2.5 h-[1.5px] rounded-full ${
                        isBoost
                          ? 'bg-emerald-400'
                          : isCut
                            ? 'bg-amber-400'
                            : 'bg-slate-200'
                      }`}
                    />
                  </div>
                </div>

                <span className="text-[8px] font-mono text-slate-400 leading-none">
                  {formatFreq(freq)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
