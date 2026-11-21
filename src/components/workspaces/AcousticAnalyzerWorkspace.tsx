import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Pause, Play, Radio, RotateCcw, SlidersHorizontal, Waves } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { ArcGauge } from '../hardware/ArcGauge';
import { AnalogVuMeter } from '../hardware/LedMeter';

const WATERFALL_HISTORY_LEN = 42;
const OCTAVE_BAND_INDICES = [
  { hz: '63', idx: 10 },
  { hz: '125', idx: 16 },
  { hz: '250', idx: 23 },
  { hz: '500', idx: 29 },
  { hz: '1k', idx: 36 },
  { hz: '2k', idx: 42 },
  { hz: '4k', idx: 48 },
  { hz: '8k', idx: 55 },
];

function waterfallColor(norm: number, ageRatio: number): string {
  const alpha = Math.max(0.22, 1 - ageRatio * 0.65);
  if (norm > 0.78) return `rgba(244, 63, 94, ${alpha.toFixed(2)})`;
  if (norm > 0.58) return `rgba(245, 158, 11, ${alpha.toFixed(2)})`;
  if (norm > 0.36) return `rgba(16, 185, 129, ${alpha.toFixed(2)})`;
  return `rgba(14, 165, 233, ${alpha.toFixed(2)})`;
}

export const AcousticAnalyzerWorkspace: React.FC = () => {
  const {
    roomSpectrum,
    spectrum,
    meters,
    buses,
    systemIntelligence,
    testToneActive,
    testToneKind,
    testToneGainDb,
    setTestToneConfig,
  } = useAudioConsole();

  const [viewMode, setViewMode] = useState<'waterfall' | 'rta' | 'decay' | 'lr' | 'generator'>('waterfall');
  const [toneAuthConfirmed, setToneAuthConfirmed] = useState<boolean>(false);
  const [smoothingOct, setSmoothingOct] = useState<number>(3);
  const [decayAvgMs, setDecayAvgMs] = useState<number>(450);
  const [waterfallTilt, setWaterfallTilt] = useState<number>(48);
  const [waterfallFrozen, setWaterfallFrozen] = useState<boolean>(false);

  const historyRef = useRef<number[][]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
  const mainMeter = meters[mainBus.id];
  const signalActive = Boolean(mainMeter?.signalPresent || testToneActive);

  // Maintain rolling spectrum history buffer for 3D Waterfall & real-time band decay measurement
  useEffect(() => {
    if (waterfallFrozen) return;
    const sourceSpec = roomSpectrum.some((v) => v > -76) ? roomSpectrum : spectrum;
    const prev = historyRef.current[0];
    const alpha = Math.max(0.15, Math.min(0.85, 450 / Math.max(100, decayAvgMs)));
    const smoothed = sourceSpec.map((val, i) => {
      const prevVal = prev?.[i] ?? val;
      return prevVal * (1 - alpha) + val * alpha;
    });
    historyRef.current = [smoothed, ...historyRef.current.slice(0, WATERFALL_HISTORY_LEN - 1)];
  }, [roomSpectrum, spectrum, decayAvgMs, waterfallFrozen]);

  // Render 3D Isometric Waterfall Spectrum Analyzer on Canvas
  useEffect(() => {
    if (viewMode !== 'waterfall') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(200, Math.floor(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Deep instrument scope background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#05070b');
    bgGrad.addColorStop(1, '#090d14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const frames = historyRef.current;
    const tiltFactor = waterfallTilt / 100; // 0.2 .. 0.8
    const padLeft = 42;
    const padRight = 24;
    const padTop = 26;
    const padBottom = 26;

    const depthShiftX = (w * 0.14) * tiltFactor;
    const depthShiftY = (h * 0.42) * tiltFactor;

    const frontBaseY = h - padBottom;
    const frontLeftX = padLeft;
    const frontWidth = w - padLeft - padRight - depthShiftX;
    const maxPeakHeight = Math.max(48, (h - padTop - padBottom) * (0.48 + (1 - tiltFactor) * 0.25));

    // Isometric floor gridlines (Frequency ticks)
    const freqLabels = [
      { label: '31Hz', norm: 0.08 },
      { label: '63Hz', norm: 0.17 },
      { label: '125Hz', norm: 0.27 },
      { label: '250Hz', norm: 0.37 },
      { label: '500Hz', norm: 0.47 },
      { label: '1kHz', norm: 0.57 },
      { label: '2kHz', norm: 0.67 },
      { label: '4kHz', norm: 0.77 },
      { label: '8kHz', norm: 0.87 },
      { label: '16k', norm: 0.96 },
    ];

    ctx.lineWidth = 1;
    ctx.font = '9px "JetBrains Mono", monospace';
    freqLabels.forEach((f) => {
      const fx = frontLeftX + f.norm * frontWidth;
      const bx = fx + depthShiftX;
      const by = frontBaseY - depthShiftY;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.beginPath();
      ctx.moveTo(fx, frontBaseY);
      ctx.lineTo(bx, by);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.fillText(f.label, fx, frontBaseY + 14);
    });

    // Time axis label along isometric depth edge
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'right';
    ctx.fillText('NOW (0s)', frontLeftX - 6, frontBaseY + 3);
    ctx.fillText(`-${((WATERFALL_HISTORY_LEN * 45) / 1000).toFixed(1)}s`, frontLeftX + depthShiftX - 6, frontBaseY - depthShiftY + 3);

    // Draw back-to-front so nearer slices properly occlude older slices (painter's algorithm)
    const totalSlices = frames.length;
    for (let t = totalSlices - 1; t >= 0; t--) {
      const slice = frames[t];
      const ageRatio = t / Math.max(1, WATERFALL_HISTORY_LEN - 1);
      const offsetX = depthShiftX * ageRatio;
      const offsetY = -depthShiftY * ageRatio;
      const baseY = frontBaseY + offsetY;
      const startX = frontLeftX + offsetX;

      ctx.beginPath();
      ctx.moveTo(startX, baseY);

      let maxNormInSlice = 0;
      const nBins = slice.length;
      for (let b = 0; b < nBins; b++) {
        const db = slice[b] ?? -80;
        const norm = Math.max(0, Math.min(1, (db + 78) / 74));
        if (norm > maxNormInSlice) maxNormInSlice = norm;
        const x = startX + (b / Math.max(1, nBins - 1)) * frontWidth;
        const y = baseY - norm * maxPeakHeight;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(startX + frontWidth, baseY);
      ctx.closePath();

      // Occluding dark fill beneath ridge
      ctx.fillStyle = t === 0 ? 'rgba(9, 13, 20, 0.88)' : 'rgba(7, 10, 16, 0.82)';
      ctx.fill();

      // Phosphor heat trace along frequency ridge
      const strokeGrad = ctx.createLinearGradient(startX, baseY, startX, baseY - maxPeakHeight);
      strokeGrad.addColorStop(0, waterfallColor(0.15, ageRatio));
      strokeGrad.addColorStop(0.45, waterfallColor(0.45, ageRatio));
      strokeGrad.addColorStop(0.75, waterfallColor(0.68, ageRatio));
      strokeGrad.addColorStop(1, waterfallColor(0.92, ageRatio));

      ctx.strokeStyle = t === 0 ? '#f8fafc' : strokeGrad;
      ctx.lineWidth = t === 0 ? 2.0 : 1.15;
      ctx.beginPath();
      for (let b = 0; b < nBins; b++) {
        const db = slice[b] ?? -80;
        const norm = Math.max(0, Math.min(1, (db + 78) / 74));
        const x = startX + (b / Math.max(1, nBins - 1)) * frontWidth;
        const y = baseY - norm * maxPeakHeight;
        if (b === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Vertical thermal highlight bars on newest slice
      if (t === 0 && maxNormInSlice > 0.05) {
        for (let b = 0; b < nBins; b += 2) {
          const db = slice[b] ?? -80;
          const norm = Math.max(0, Math.min(1, (db + 78) / 74));
          if (norm <= 0.06) continue;
          const x = startX + (b / Math.max(1, nBins - 1)) * frontWidth;
          const y = baseY - norm * maxPeakHeight;
          ctx.strokeStyle = waterfallColor(norm, 0);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x, baseY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [viewMode, roomSpectrum, spectrum, waterfallTilt, waterfallFrozen]);

  // Real-time measured octave energy & decay dynamics (no hardcoded numbers)
  const measuredOctaveStats = useMemo(() => {
    const activeSpec = roomSpectrum.some((v) => v > -76) ? roomSpectrum : spectrum;
    const prevFrame = historyRef.current[Math.min(historyRef.current.length - 1, 8)] ?? activeSpec;
    return OCTAVE_BAND_INDICES.map((band) => {
      const db = activeSpec[band.idx] ?? -80;
      const olderDb = prevFrame[band.idx] ?? db;
      const deltaDb = db - olderDb;
      return {
        hz: band.hz,
        db,
        deltaDb,
      };
    });
  }, [roomSpectrum, spectrum]);

  const liveFloorDbfs = mainMeter?.noiseFloorDbfs ?? -80;
  const liveCrestDb = mainMeter?.crestFactorDb ?? 0;
  const liveRmsDbfs = mainMeter?.rmsDbfs ?? -80;

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              Acoustic Dual-FFT &amp; 3D Waterfall Analyzer
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              1/{smoothingOct} Oct · {decayAvgMs} ms Avg ·{' '}
              {testToneActive
                ? `${testToneKind.toUpperCase()} EXCITATION`
                : signalActive
                  ? 'LIVE AUDIO ANALYSER'
                  : 'STANDBY (AWAITING AUDIO)'}
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'waterfall', label: '3D WATERFALL', icon: Activity },
            { id: 'rta', label: '1/3 OCTAVE RTA', icon: Waves },
            { id: 'decay', label: 'BAND ENERGY & DECAY', icon: SlidersHorizontal },
            { id: 'lr', label: 'ROOM vs PROG', icon: Waves },
            { id: 'generator', label: 'SIGNAL GEN', icon: Radio },
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
                  value={Math.max(-80, Math.min(0, liveRmsDbfs))}
                  min={-80}
                  max={0}
                  label="BUS RMS"
                  accent="emerald"
                  size={96}
                  formatValue={(v) => (v <= -78 ? 'IDLE' : `${v.toFixed(1)}dB`)}
                />
                <ArcGauge
                  value={liveCrestDb}
                  min={0}
                  max={24}
                  label="CREST FACTOR"
                  accent="amber"
                  size={96}
                  formatValue={(v) => (signalActive ? `${v.toFixed(1)}dB` : '—')}
                />
              </div>

              <AnalogVuMeter
                label="MAIN BUS ANALYSER INPUT"
                levelDbfs={mainMeter?.rmsDbfs ?? -80}
                peakLed={mainMeter?.clipping}
              />

              <div className="oled-display rounded p-3 flex-1 min-h-0 flex flex-col justify-center gap-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>EXCITATION SOURCE:</span>
                  <span className="text-sky-300 uppercase">{testToneActive ? testToneKind : 'OFF (PROGRAM)'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>MEASURED NOISE FLOOR:</span>
                  <span className="text-amber-300">{liveFloorDbfs.toFixed(1)} dBFS</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>SHORT-TERM LUFS:</span>
                  <span className="text-emerald-300">
                    {systemIntelligence.shortTermLufs <= -75 ? 'IDLE' : `${systemIntelligence.shortTermLufs.toFixed(1)} LUFS`}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Left 8 Cols: 3D Waterfall / Dual-FFT Scope */}
            <div className="lg:col-span-8 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
              {viewMode === 'waterfall' ? (
                <div className="flex-1 min-h-0 dark-instrument-scope rounded-md p-2 flex flex-col justify-between gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono px-1 shrink-0">
                    <span className="text-sky-300 font-semibold">
                      3D WATERFALL SPECTROGRAM · FREQUENCY DENSITY OVER TIME ({WATERFALL_HISTORY_LEN} SLICES)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setWaterfallFrozen((f) => !f)}
                        className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                          waterfallFrozen ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'console-btn-surface text-slate-300'
                        }`}
                      >
                        {waterfallFrozen ? <Play className="w-2.5 h-2.5" /> : <Pause className="w-2.5 h-2.5" />}
                        <span>{waterfallFrozen ? 'RESUME' : 'FREEZE'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          historyRef.current = [];
                        }}
                        className="px-2 py-0.5 rounded console-btn-surface text-slate-300 flex items-center gap-1"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>CLEAR</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 relative">
                    <canvas ref={canvasRef} className="w-full h-full block rounded" />
                    {!signalActive && (
                      <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/70 border border-white/10 text-[10px] font-mono text-slate-400">
                        IDLE NOISE FLOOR · PATCH AUDIO OR EMIT TEST TONE
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 dark-instrument-scope rounded-md p-3 flex flex-col justify-end">
                  {viewMode === 'decay' ? (
                    <div className="h-full flex items-end gap-3 pt-4">
                      {measuredOctaveStats.map((b) => {
                        const hPct = Math.max(4, Math.min(92, ((b.db + 80) / 76) * 100));
                        return (
                          <div key={b.hz} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                            <span className="text-[10px] font-mono text-amber-300 tabular-nums">
                              {b.db <= -78 ? '—' : `${b.db.toFixed(0)}dB`}
                            </span>
                            <div
                              style={{ height: `${hPct}%` }}
                              className="w-full rounded-t bg-gradient-to-t from-sky-700 via-emerald-500 to-amber-400 transition-all duration-75"
                            />
                            <span className="text-[10px] font-mono text-slate-400">{b.hz}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex items-end gap-[2px]">
                      {roomSpectrum.map((val, i) => {
                        const prog = spectrum[i] ?? -80;
                        const hRoom = Math.max(3, Math.min(100, ((val + 80) / 76) * 100));
                        const hProg = Math.max(3, Math.min(100, ((prog + 80) / 76) * 100));
                        return (
                          <div key={i} className="flex-1 h-full flex items-end gap-[1px]">
                            <div
                              style={{ height: `${hRoom}%` }}
                              className="flex-1 rounded-t-[1px] bg-amber-400/85"
                            />
                            {viewMode === 'lr' && (
                              <div
                                style={{ height: `${hProg}%` }}
                                className="flex-1 rounded-t-[1px] bg-sky-400/75"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Analyzer DSP Controls */}
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
                  {viewMode === 'waterfall' && (
                    <RotaryKnob
                      label="3D TILT"
                      value={waterfallTilt}
                      min={20}
                      max={85}
                      step={5}
                      unit="%"
                      size={36}
                      accentColor="emerald"
                      onChange={setWaterfallTilt}
                    />
                  )}
                </div>

                <div className="flex items-center gap-2 text-[10px] text-amber-300/90 max-w-md">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {testToneActive
                      ? 'Calibrated room excitation active.'
                      : signalActive
                        ? 'Analyzing live Web Audio FFT stream in real time.'
                        : 'No active input detected — patch a source or use SIGNAL GEN tab.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right 4 Cols: Real Measured Acoustic Telemetry + Quick Tone Control */}
            <div className="lg:col-span-4 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
              <div className="console-panel rounded p-2.5 flex items-center justify-around shrink-0">
                <ArcGauge
                  value={Math.max(-80, Math.min(0, liveRmsDbfs))}
                  min={-80}
                  max={0}
                  label="PROGRAM RMS"
                  accent="emerald"
                  size={74}
                  formatValue={(v) => (v <= -78 ? 'IDLE' : `${v.toFixed(0)}dB`)}
                />
                <ArcGauge
                  value={liveCrestDb}
                  min={0}
                  max={24}
                  label="CREST"
                  accent="amber"
                  size={74}
                  formatValue={(v) => (signalActive ? `${v.toFixed(1)}dB` : '—')}
                />
              </div>

              <AnalogVuMeter
                label="RTA BUS INPUT"
                levelDbfs={mainMeter?.rmsDbfs ?? -80}
                peakLed={mainMeter?.clipping || testToneActive}
              />

              <div className="oled-display rounded p-2 text-[10px] font-mono space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">NOISE FLOOR</span>
                  <span className="text-sky-300 tabular-nums">{liveFloorDbfs.toFixed(1)} dBFS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">SPECTRAL TILT</span>
                  <span className="text-amber-300 tabular-nums">
                    {signalActive ? `${systemIntelligence.spectralTiltDbPerOct.toFixed(1)} dB/oct` : '—'}
                  </span>
                </div>
              </div>

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
