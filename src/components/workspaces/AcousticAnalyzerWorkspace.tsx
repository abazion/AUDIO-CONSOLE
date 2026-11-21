import React, { useState } from 'react';
import { Radio, AlertTriangle, Waves, SlidersHorizontal } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { ArcGauge } from '../hardware/ArcGauge';
import { AnalogVuMeter } from '../hardware/LedMeter';

export const AcousticAnalyzerWorkspace: React.FC = () => {
  const {
    roomSpectrum,
    spectrum,
    meters,
    buses,
    testToneActive,
    testToneKind,
    testToneGainDb,
    setTestToneConfig,
  } = useAudioConsole();

  const [viewMode, setViewMode] = useState<'rta' | 'rt60' | 'lr' | 'generator'>('rta');
  const [toneAuthConfirmed, setToneAuthConfirmed] = useState<boolean>(false);
  const [smoothingOct, setSmoothingOct] = useState<number>(3);
  const [decayAvgMs, setDecayAvgMs] = useState<number>(450);

  const mainMeter = meters[buses[0].id];

  const rt60Bands = [
    { hz: '63', sec: 1.42 },
    { hz: '125', sec: 1.18 },
    { hz: '250', sec: 0.96 },
    { hz: '500', sec: 0.84 },
    { hz: '1k', sec: 0.81 },
    { hz: '2k', sec: 0.77 },
    { hz: '4k', sec: 0.69 },
    { hz: '8k', sec: 0.56 },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              Acoustic Dual-FFT Room Analyzer
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              1/{smoothingOct} Oct · {decayAvgMs} ms Avg ·{' '}
              {testToneActive ? `${testToneKind.toUpperCase()} EXCITATION` : 'PROGRAM MONITOR'}
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'rta', label: '1/3 OCTAVE RTA', icon: Waves },
            { id: 'rt60', label: 'RT60 DECAY', icon: SlidersHorizontal },
            { id: 'lr', label: 'L/R COMPARE', icon: Waves },
            { id: 'generator', label: 'SIGNAL GEN & GAUGES', icon: Radio },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setViewMode(t.id as typeof viewMode)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  viewMode === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <ConsoleButton
            label={testToneActive ? 'TONE ACTIVE' : 'TONE IDLE'}
            size="xs"
            color={testToneActive ? 'crimson' : 'cyan'}
            active={testToneActive}
            onClick={() => {
              if (!toneAuthConfirmed) {
                setViewMode('generator');
                return;
              }
              setTestToneConfig(!testToneActive, testToneKind, testToneGainDb);
            }}
          />
        </div>
      </div>

      {/* Main Single-Viewport Workspace Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
        {viewMode === 'generator' ? (
          <>
            <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
                <span className="font-mono text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5" />
                  <span>CALIBRATED TEST SIGNAL GENERATOR</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">MAIN PA EXCITATION</span>
              </div>

              <div className="grid grid-cols-3 gap-2 shrink-0">
                {(['pink', 'sine1k', 'sweep'] as const).map((k) => (
                  <ConsoleButton
                    key={k}
                    label={k === 'pink' ? 'PINK NOISE' : k === 'sine1k' ? '1kHz SINE' : 'LOG SWEEP'}
                    size="sm"
                    color="cyan"
                    active={testToneKind === k}
                    onClick={() => setTestToneConfig(testToneActive, k, testToneGainDb)}
                  />
                ))}
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-around console-well rounded p-3">
                <RotaryKnob
                  label="GEN LEVEL"
                  value={testToneGainDb}
                  min={-48}
                  max={-10}
                  step={1}
                  unit="dBFS"
                  size={56}
                  accentColor="rose"
                  onChange={(v) => setTestToneConfig(testToneActive, testToneKind, v)}
                />
                <RotaryKnob
                  label="SMOOTH"
                  value={smoothingOct}
                  min={1}
                  max={12}
                  step={1}
                  size={56}
                  accentColor="cyan"
                  formatValue={(v) => `1/${Math.round(v)}`}
                  onChange={setSmoothingOct}
                />
                <RotaryKnob
                  label="AVG TIME"
                  value={decayAvgMs}
                  min={100}
                  max={2000}
                  step={50}
                  unit="ms"
                  size={56}
                  accentColor="amber"
                  onChange={setDecayAvgMs}
                />
              </div>

              <div className="console-panel rounded p-2.5 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-[11px] text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {testToneActive
                      ? 'Live calibrated acoustic excitation active on Main PA.'
                      : 'Arm output switch before emitting Pink Noise or Sweep.'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ConsoleButton
                    label={toneAuthConfirmed ? 'ARMED SAFE' : 'ARM OUTPUT'}
                    size="xs"
                    color="amber"
                    active={toneAuthConfirmed}
                    onClick={() => {
                      if (toneAuthConfirmed && testToneActive) setTestToneConfig(false);
                      setToneAuthConfirmed((v) => !v);
                    }}
                  />
                  <ConsoleButton
                    label={testToneActive ? 'STOP TONE' : 'EMIT TONE'}
                    size="sm"
                    color="crimson"
                    active={testToneActive}
                    disabled={!toneAuthConfirmed}
                    onClick={() => {
                      if (!toneAuthConfirmed) return;
                      setTestToneConfig(!testToneActive, testToneKind, testToneGainDb);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden">
              <div className="console-panel rounded p-3 flex items-center justify-around shrink-0">
                <ArcGauge
                  value={0.81}
                  min={0.2}
                  max={2.0}
                  label="RT60 MID"
                  accent="emerald"
                  size={96}
                  formatValue={(v) => `${v.toFixed(2)}s`}
                />
                <ArcGauge
                  value={78}
                  min={40}
                  max={115}
                  label="SANCTUARY SPL"
                  accent="amber"
                  size={96}
                  formatValue={(v) => `${Math.round(v)}dB`}
                />
              </div>

              <AnalogVuMeter
                label="RTA MEASUREMENT MIC INPUT"
                levelDbfs={mainMeter?.inputRmsDbfs ?? -48}
                peakLed={testToneActive}
              />

              <div className="oled-display rounded p-3 flex-1 min-h-0 flex flex-col justify-center gap-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>EXCITATION SOURCE:</span>
                  <span className="text-sky-300 uppercase">{testToneKind}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>GENERATOR TRIM:</span>
                  <span className="text-amber-300">{testToneGainDb.toFixed(1)} dBFS</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>TARGET DECAY WINDOW:</span>
                  <span className="text-emerald-300">0.75s – 0.90s SPEECH CLARITY</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Left 8 Cols: Dual-FFT Smaart-Style Hardware Analyzer Unit */}
            <div className="lg:col-span-8 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 dark-instrument-scope rounded-md p-3 flex flex-col justify-end">
                {viewMode === 'rt60' ? (
                  <div className="h-full flex items-end gap-3 pt-4">
                    {rt60Bands.map((b) => (
                      <div key={b.hz} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                        <span className="text-[10px] font-mono text-amber-300">{b.sec.toFixed(2)}s</span>
                        <div
                          style={{ height: `${(b.sec / 1.6) * 80}%` }}
                          className="w-full rounded-t bg-gradient-to-t from-amber-700 to-amber-400"
                        />
                        <span className="text-[10px] font-mono text-slate-400">{b.hz}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex items-end gap-[2px]">
                    {roomSpectrum.map((val, i) => {
                      const prog = spectrum[i] ?? -65;
                      const hRoom = Math.max(4, Math.min(100, ((val + 72) / 70) * 100));
                      const hProg = Math.max(4, Math.min(100, ((prog + 72) / 70) * 100));
                      return (
                        <div key={i} className="flex-1 h-full flex items-end gap-[1px]">
                          <div
                            style={{ height: `${hRoom}%` }}
                            className="flex-1 rounded-t-[1px] bg-amber-400/85"
                          />
                          {viewMode === 'lr' && (
                            <div
                              style={{ height: `${Math.max(4, hProg - 4)}%` }}
                              className="flex-1 rounded-t-[1px] bg-sky-400/75"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Analyzer DSP Controls + Warning Footer */}
              <div className="console-panel rounded p-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <RotaryKnob
                    label="SMOOTH"
                    value={smoothingOct}
                    min={1}
                    max={12}
                    step={1}
                    size={36}
                    accentColor="cyan"
                    formatValue={(v) => `1/${Math.round(v)}`}
                    onChange={setSmoothingOct}
                  />
                  <RotaryKnob
                    label="AVG TIME"
                    value={decayAvgMs}
                    min={100}
                    max={2000}
                    step={50}
                    unit="ms"
                    size={36}
                    accentColor="amber"
                    onChange={setDecayAvgMs}
                  />
                </div>

                <div className="flex items-center gap-2 text-[10px] text-amber-300/90 max-w-md">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {testToneActive
                      ? 'Calibrated room excitation active.'
                      : 'Switch to SIGNAL GEN & GAUGES tab to arm Pink Noise / Sine Sweep.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right 4 Cols: Compact Acoustic Gauges + Quick Tone Control */}
            <div className="lg:col-span-4 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
              <div className="console-panel rounded p-2.5 flex items-center justify-around shrink-0">
                <ArcGauge
                  value={0.81}
                  min={0.2}
                  max={2.0}
                  label="RT60 MID"
                  accent="emerald"
                  size={74}
                  formatValue={(v) => `${v.toFixed(2)}s`}
                />
                <ArcGauge
                  value={78}
                  min={40}
                  max={115}
                  label="ROOM SPL"
                  accent="amber"
                  size={74}
                  formatValue={(v) => `${Math.round(v)}dB`}
                />
              </div>

              <AnalogVuMeter
                label="RTA MIC INPUT"
                levelDbfs={mainMeter?.inputRmsDbfs ?? -48}
                peakLed={testToneActive}
              />

              <div className="console-panel rounded p-2.5 flex-1 min-h-0 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="font-mono text-[10px] font-semibold text-rose-300 flex items-center gap-1">
                    <Radio className="w-3 h-3" />
                    <span>TEST TONE</span>
                  </span>
                  <div className="flex gap-1">
                    {(['pink', 'sine1k', 'sweep'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setTestToneConfig(testToneActive, k, testToneGainDb)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                          testToneKind === k ? 'console-accent-active' : 'console-btn-surface text-slate-400'
                        }`}
                      >
                        {k === 'pink' ? 'PNK' : k === 'sine1k' ? '1k' : 'SWP'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-around console-well rounded py-1.5">
                  <RotaryKnob
                    label="GEN LVL"
                    value={testToneGainDb}
                    min={-48}
                    max={-10}
                    step={1}
                    unit="dB"
                    size={40}
                    accentColor="rose"
                    onChange={(v) => setTestToneConfig(testToneActive, testToneKind, v)}
                  />
                  <div className="flex flex-col gap-1.5">
                    <ConsoleButton
                      label={toneAuthConfirmed ? 'ARMED' : 'ARM PA'}
                      size="xs"
                      color="amber"
                      active={toneAuthConfirmed}
                      onClick={() => {
                        if (toneAuthConfirmed && testToneActive) setTestToneConfig(false);
                        setToneAuthConfirmed((v) => !v);
                      }}
                    />
                    <ConsoleButton
                      label={testToneActive ? 'STOP' : 'EMIT'}
                      size="xs"
                      color="crimson"
                      active={testToneActive}
                      disabled={!toneAuthConfirmed}
                      onClick={() => {
                        if (!toneAuthConfirmed) return;
                        setTestToneConfig(!testToneActive, testToneKind, testToneGainDb);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
