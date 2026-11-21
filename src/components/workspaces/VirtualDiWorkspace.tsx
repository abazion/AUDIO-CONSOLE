import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Zap, Sliders } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';

export const VirtualDiWorkspace: React.FC = () => {
  const { virtualDi, updateVirtualDi, channels, meters, spectrum } = useAudioConsole();
  const [diTab, setDiTab] = useState<'rack' | 'topology'>('rack');

  const bassCh = channels.find((c) => c.id === virtualDi.sourceChannelId) ?? channels[0];
  const bassMeter = meters[bassCh.id];
  const bassBins = spectrum.slice(0, 28);
  const liveFreqHz = bassMeter?.signalPresent ? bassMeter.fundamentalHz : 0;

  const pitchNote = (hz: number) => {
    if (hz <= 0) return '—';
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = Math.round(12 * Math.log2(hz / 440) + 69);
    const name = notes[((midi % 12) + 12) % 12];
    const oct = Math.floor(midi / 12) - 1;
    return `${name}${oct}`;
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-400 shrink-0" />
          <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100">
            Virtual DI &amp; Bass Processor
          </h1>
          <select
            value={bassCh.id}
            onChange={(e) => updateVirtualDi({ sourceChannelId: e.target.value }, 'Changed Virtual DI source channel')}
            className="console-btn-surface rounded px-2 py-0.5 text-[10px] font-mono text-amber-300"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                CH {String(c.number).padStart(2, '0')} · {c.shortName}
              </option>
            ))}
          </select>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'rack', label: 'BASS PREAMP & DYNAMICS RACK', icon: Sliders },
            { id: 'topology', label: 'ELECTRICAL TOPOLOGY & ISOLATION', icon: Zap },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setDiTab(t.id as typeof diTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  diTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <ConsoleButton
            label={`SLOT ${virtualDi.abSlot}`}
            size="xs"
            color="cyan"
            active={true}
            onClick={() =>
              updateVirtualDi({ abSlot: virtualDi.abSlot === 'A' ? 'B' : 'A' }, 'Switched A/B slot')
            }
          />
          <ConsoleButton
            label={virtualDi.bypass ? 'BYPASSED' : 'ACTIVE'}
            size="xs"
            color={virtualDi.bypass ? 'crimson' : 'emerald'}
            active={!virtualDi.bypass}
            onClick={() => updateVirtualDi({ bypass: !virtualDi.bypass })}
          />
        </div>
      </div>

      {/* TAB 1: FULL TACTILE BASS PREAMP, SPECTRUM & DYNAMICS RACK */}
      {diTab === 'rack' && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border p-3 grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch overflow-hidden">
          <div className="xl:col-span-4 flex flex-col justify-between gap-2.5">
            <AnalogVuMeter
              label="BASS INPUT STAGE"
              levelDbfs={(bassMeter?.rmsDbfs ?? -80) + virtualDi.inputTrimDb}
              peakLed={bassMeter?.clipping}
            />
            <div className="dark-instrument-scope rounded p-2.5 flex-1 min-h-0 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>LOW-END SPECTRUM (20–450 Hz)</span>
                <span className="text-violet-300 tabular-nums">
                  {liveFreqHz > 0 ? `${liveFreqHz.toFixed(0)} Hz (${pitchNote(liveFreqHz)})` : 'IDLE'}
                </span>
              </div>
              <div className="flex-1 min-h-0 flex items-end gap-[3px] pt-2">
                {bassBins.map((val, i) => {
                  const h = Math.max(4, Math.min(100, ((val + 72) / 68) * 100));
                  return (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className="flex-1 rounded-t-[1px] bg-gradient-to-t from-violet-700 via-sky-500 to-emerald-400"
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="xl:col-span-7 console-panel rounded-md p-3 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="font-mono text-xs font-semibold text-amber-300">
                INPUT / EQ TONE STACK
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {virtualDi.bypass ? 'BYPASS' : '64-BIT FLOAT DSP'}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <RotaryKnob label="IN TRIM" value={virtualDi.inputTrimDb} min={-12} max={18} step={0.5} bipolar unit="dB" size={44} accentColor="cyan" onChange={(v) => updateVirtualDi({ inputTrimDb: v })} />
              <RotaryKnob label="HPF" value={virtualDi.hpfHz} min={20} max={120} step={2} defaultValue={36} unit="Hz" size={44} accentColor="amber" onChange={(v) => updateVirtualDi({ hpfHz: v })} />
              <RotaryKnob label="SUB 60Hz" value={virtualDi.subHarmonicBoostDb} min={-12} max={12} step={0.5} bipolar unit="dB" size={44} accentColor="emerald" onChange={(v) => updateVirtualDi({ subHarmonicBoostDb: v })} />
              <RotaryKnob label="MID 240Hz" value={virtualDi.midScoopDb} min={-12} max={12} step={0.5} bipolar unit="dB" size={44} accentColor="emerald" onChange={(v) => updateVirtualDi({ midScoopDb: v })} />
              <RotaryKnob label="PRESENCE" value={virtualDi.presenceDb} min={-12} max={12} step={0.5} bipolar unit="dB" size={44} accentColor="cyan" onChange={(v) => updateVirtualDi({ presenceDb: v })} />
              <RotaryKnob label="TUBE SAT" value={virtualDi.tubeSaturationPct} min={0} max={100} step={1} unit="%" size={44} accentColor="rose" onChange={(v) => updateVirtualDi({ tubeSaturationPct: v })} />
            </div>

            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 pt-1">
              <span className="font-mono text-xs font-semibold text-emerald-300">
                DYNAMICS / TRANSIENT / OUTPUT LIMITER
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <RotaryKnob label="COMP THR" value={virtualDi.compThresholdDb} min={-40} max={0} step={0.5} unit="dB" size={44} accentColor="emerald" onChange={(v) => updateVirtualDi({ compThresholdDb: v })} />
              <RotaryKnob label="RATIO" value={virtualDi.compRatio} min={1} max={12} step={0.2} unit=":1" size={44} accentColor="emerald" onChange={(v) => updateVirtualDi({ compRatio: v })} />
              <RotaryKnob label="TRANSIENT" value={virtualDi.transientAttack} min={-50} max={50} step={1} bipolar unit="%" size={44} accentColor="amber" onChange={(v) => updateVirtualDi({ transientAttack: v })} />
              <RotaryKnob label="LIMITER" value={virtualDi.limiterCeilingDb} min={-12} max={0} step={0.5} unit="dB" size={44} accentColor="rose" onChange={(v) => updateVirtualDi({ limiterCeilingDb: v })} />
              <RotaryKnob label="OUT GAIN" value={virtualDi.outputGainDb} min={-18} max={12} step={0.5} bipolar unit="dB" size={44} accentColor="amber" onChange={(v) => updateVirtualDi({ outputGainDb: v })} />
            </div>
          </div>

          <div className="xl:col-span-1 flex justify-center">
            <div className="console-well rounded-md p-2.5 flex flex-col items-center justify-between gap-2 w-full">
              <span className="text-[10px] font-mono text-slate-400">OUT</span>
              <LedMeter
                peakDbfs={(bassMeter?.peakDbfs ?? -80) + virtualDi.outputGainDb}
                peakHoldDbfs={bassMeter?.peakHoldDbfs ?? -80}
                gainReductionDb={bassMeter?.gainReductionDb ?? 0}
                clipping={bassMeter?.clipping}
                height={210}
                width={16}
                segments={22}
              />
              <span className="text-[10px] font-mono tabular-nums text-emerald-300">
                {((bassMeter?.peakDbfs ?? -80) + virtualDi.outputGainDb).toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ELECTRICAL TOPOLOGY & DRY/WET ISOLATION BOUNDARY */}
      {diTab === 'topology' && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border p-4 flex flex-col justify-between gap-3 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 items-stretch">
            <button
              type="button"
              onClick={() =>
                updateVirtualDi({
                  topology: 'without-physical-di',
                  isolatedRouteLabel: 'MG16XU Line/Hi-Z -> Isolated Aux 3 Send -> Capture -> Software Bass DSP',
                })
              }
              className={`text-left rounded-md p-4 border transition-all flex flex-col justify-between ${
                virtualDi.topology === 'without-physical-di' ? 'console-accent-active' : 'console-btn-surface'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-100">
                  Topology A · Without Physical DI Box
                </span>
                <span className="text-[10px] font-mono text-amber-300">
                  {virtualDi.topology === 'without-physical-di' ? 'ACTIVE' : 'SELECT'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Bass → Mixer Hi-Z / Line Input → Dedicated Isolated Aux Send → Xonar/USB Capture → Software Bass Chain
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                updateVirtualDi({
                  topology: 'with-physical-di',
                  isolatedRouteLabel: 'Physical DI (Balanced XLR) -> Mixer Mic Pre -> Isolated Send -> Software Bass DSP',
                })
              }
              className={`text-left rounded-md p-4 border transition-all flex flex-col justify-between ${
                virtualDi.topology === 'with-physical-di' ? 'console-accent-active' : 'console-btn-surface'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-100">
                  Topology B · With Physical DI Box
                </span>
                <span className="text-[10px] font-mono text-emerald-300">
                  {virtualDi.topology === 'with-physical-di' ? 'ACTIVE' : 'SELECT'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Bass → Physical DI (Transformer Balanced) → Mixer Mic Input → Isolated Send → Software Bass Chain
              </p>
            </button>
          </div>

          <div className="console-well rounded-md p-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <span>
              CAPTURE: <strong className="text-sky-300">{virtualDi.isolatedRouteLabel}</strong>
            </span>
            {virtualDi.duplicatedDryWarningConfirmed ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Dry Channel Unrouted from Main PA</span>
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <ShieldAlert className="w-4 h-4" />
                <span>Dry/Processed Comb-Filter Risk</span>
              </span>
            )}
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2 console-panel rounded p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Electrical Truth: Software Virtual DI performs harmonic shaping, dynamics, and tone sculpting—it does not replace a physical DI box&apos;s high-impedance buffering, ground lift, or balanced XLR line driving.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
