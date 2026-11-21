import React, { useMemo, useRef, useState } from 'react';
import { Sliders, ArrowLeftRight, Sparkles, Waves, Activity, Plus, Trash2 } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { EQ_PRESETS, getRecommendedEqPresetsForChannel } from '../../engine/profiles';
import { computeChannelEqResponseDb } from '../../engine/webAudioEngine';
import type { EqBand, FilterShape } from '../../engine/types';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';
import { GraphicEq31Band } from '../hardware/GraphicEq31Band';

const BAND_COLORS = ['#f59e0b', '#38bdf8', '#10b981', '#f43f5e', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9'];

function freqToX(freq: number, width: number): number {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  return ((Math.log10(Math.max(20, Math.min(20000, freq))) - minLog) / (maxLog - minLog)) * width;
}

function xToFreq(x: number, width: number): number {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const norm = Math.max(0, Math.min(1, x / width));
  return Math.round(Math.pow(10, minLog + norm * (maxLog - minLog)));
}

function dbToY(db: number, height: number): number {
  const norm = (18 - Math.max(-18, Math.min(18, db))) / 36;
  return norm * height;
}

function yToDb(y: number, height: number): number {
  const norm = Math.max(0, Math.min(1, y / height));
  return Math.round((18 - norm * 36) * 2) / 2;
}

export const DspEqWorkspace: React.FC = () => {
  const {
    channels,
    buses,
    selectedChannelId,
    setSelectedChannelId,
    selectedBusId,
    setSelectedBusId,
    updateChannel,
    addChannelEqBand,
    removeChannelEqBand,
    updateBus,
    addBusEqBand,
    updateBusEqBand,
    removeBusEqBand,
    meters,
    spectrum,
    autoCalibrateChannel,
    globalDspBypass,
    toggleGlobalDspBypass,
  } = useAudioConsole();

  const chIdx = Math.max(0, channels.findIndex((c) => c.id === selectedChannelId));
  const ch = channels[chIdx] ?? channels[0];
  const partnerCh = channels[(chIdx + 1) % channels.length] ?? ch;
  const activeBus = buses.find((b) => b.id === selectedBusId) ?? buses[0];

  const [targetDomain, setTargetDomain] = useState<'channel' | 'bus'>('channel');
  const [eqModuleTab, setEqModuleTab] = useState<'para' | 'geq31' | 'dynamics' | 'presets'>('para');
  const [selectedBandIdx, setSelectedBandIdx] = useState<number>(0);
  const [activePresetByChannel, setActivePresetByChannel] = useState<Record<string, string | null>>({});
  const [abCompareB, setAbCompareB] = useState<boolean>(false);
  const [draggingBandIdx, setDraggingBandIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const isBusMode = targetDomain === 'bus';
  const m = meters[isBusMode ? activeBus.id : ch.id];
  const activeEqEnabled = isBusMode ? activeBus.eqEnabled : ch.eqEnabled;
  const activeBands: EqBand[] = isBusMode ? activeBus.eqBands ?? [] : ch.eqBands;
  const clampedBandIdx = Math.min(selectedBandIdx, Math.max(0, activeBands.length - 1));
  const activeBand = activeBands[clampedBandIdx];

  const activePresetId = activePresetByChannel[ch.id] ?? null;
  const recommendation = useMemo(() => getRecommendedEqPresetsForChannel(ch), [ch]);

  const togglePreset = (presetId: string) => {
    if (activePresetId === presetId) {
      setActivePresetByChannel((prev) => ({ ...prev, [ch.id]: null }));
      updateChannel(
        ch.id,
        {
          eqBands: ch.eqBands.map((b) => ({ ...b, gainDb: 0 })),
          geqBands: new Array(31).fill(0),
        },
        'Toggled EQ preset off (flattened)'
      );
      return;
    }

    const p = EQ_PRESETS.find((item) => item.id === presetId);
    if (!p) return;

    const nextGeq = new Array(31).fill(0);
    Object.entries(p.geqOffsets).forEach(([idxStr, val]) => {
      nextGeq[Number(idxStr)] = val;
    });

    const nextPara = ch.eqBands.map((b, idx) => ({
      ...b,
      enabled: true,
      freqHz: p.eqBands[idx]?.freqHz ?? b.freqHz,
      gainDb: p.eqBands[idx]?.gainDb ?? 0,
      q: p.eqBands[idx]?.q ?? b.q,
    }));

    setActivePresetByChannel((prev) => ({ ...prev, [ch.id]: p.id }));
    updateChannel(
      ch.id,
      {
        hpfEnabled: p.hpfEnabled,
        hpfFreqHz: p.hpfFreqHz,
        eqEnabled: true,
        eqBands: nextPara,
        geqEnabled: true,
        geqBands: nextGeq,
      },
      `Applied EQ preset: ${p.name}`
    );
  };

  const svgW = 840;
  const svgH = 220;

  const updateBand = (idx: number, patch: Partial<EqBand>) => {
    if (isBusMode) {
      const band = activeBands[idx];
      if (!band) return;
      updateBusEqBand(activeBus.id, band.id, patch);
      return;
    }
    setActivePresetByChannel((prev) => ({ ...prev, [ch.id]: null }));
    const nextBands = ch.eqBands.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    updateChannel(ch.id, { eqBands: nextBands });
  };

  const handleAddBand = () => {
    const newFreq = Math.min(16000, Math.max(80, Math.round(400 * Math.pow(1.45, activeBands.length % 7))));
    if (isBusMode) {
      addBusEqBand(activeBus.id, { freqHz: newFreq, label: `B${activeBands.length + 1}` });
    } else {
      addChannelEqBand(ch.id, { freqHz: newFreq, label: `PEQ ${activeBands.length + 1}` });
    }
    setSelectedBandIdx(activeBands.length);
  };

  const handleDeleteSelectedBand = () => {
    if (!activeBand || activeBands.length <= 1) return;
    if (isBusMode) {
      removeBusEqBand(activeBus.id, activeBand.id);
    } else {
      removeChannelEqBand(ch.id, activeBand.id);
    }
    setSelectedBandIdx(Math.max(0, clampedBandIdx - 1));
  };

  const eqCurvePath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 160; i++) {
      const freq = 20 * Math.pow(1000, i / 160);
      const db = isBusMode
        ? computeChannelEqResponseDb(freq, false, 20, activeBus.eqEnabled, activeBands, false)
        : computeChannelEqResponseDb(
            freq,
            ch.hpfEnabled,
            ch.hpfFreqHz,
            ch.eqEnabled,
            ch.eqBands,
            ch.geqEnabled,
            ch.geqBands
          );
      const x = freqToX(freq, svgW);
      const y = dbToY(db, svgH);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [
    isBusMode,
    activeBus.eqEnabled,
    activeBands,
    ch.hpfEnabled,
    ch.hpfFreqHz,
    ch.eqEnabled,
    ch.eqBands,
    ch.geqEnabled,
    ch.geqBands,
  ]);

  const spectrumPath = useMemo(() => {
    const pts: string[] = [];
    spectrum.forEach((db, i) => {
      const freq = 20 * Math.pow(1000, i / 63);
      const x = freqToX(freq, svgW);
      const y = svgH - Math.max(0, Math.min(1, (db + 72) / 72)) * (svgH - 18);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return `${pts.join(' ')} L ${svgW} ${svgH} L 0 ${svgH} Z`;
  }, [spectrum]);

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingBandIdx === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * svgW;
    const relY = ((e.clientY - rect.top) / rect.height) * svgH;
    updateBand(draggingBandIdx, {
      freqHz: xToFreq(relX, svgW),
      gainDb: yToDb(relY, svgH),
    });
  };

  const flowStages = isBusMode
    ? [
        { label: 'BUS SUM', on: true },
        { label: `BUS PEQ (${activeBands.length}B)`, on: activeBus.eqEnabled },
        { label: `LIMITER ${activeBus.limiterCeilingDb}dB`, on: true },
        { label: `FADER ${activeBus.faderDb.toFixed(1)}dB`, on: !activeBus.mute },
        { label: 'XOVER / OUT', on: !activeBus.mute },
      ]
    : [
        { label: ch.sourceBinding?.active ? 'LIVE IN' : 'IN IDLE', on: Boolean(ch.sourceBinding?.active) },
        { label: `TRIM ${ch.softwareTrimDb >= 0 ? '+' : ''}${ch.softwareTrimDb.toFixed(1)}`, on: true },
        { label: ch.polarityInvert ? 'Ø INV' : 'Ø NORM', on: ch.polarityInvert },
        { label: `${ch.delayMs.toFixed(1)}ms`, on: !globalDspBypass && ch.delayMs > 0 },
        { label: `HPF ${ch.hpfFreqHz}Hz`, on: !globalDspBypass && ch.hpfEnabled },
        { label: `PEQ (${ch.eqBands.length}B)`, on: !globalDspBypass && ch.eqEnabled },
        { label: '31B GEQ', on: !globalDspBypass && ch.geqEnabled },
        { label: 'DYNAMICS', on: !globalDspBypass && (ch.dynamics.compEnabled || ch.dynamics.gateEnabled) },
        { label: `FADER ${ch.faderDb.toFixed(1)}`, on: !ch.mute },
        { label: 'BUS → OUT', on: ch.assignMain || ch.assignSub || ch.assignBroadcast },
      ];

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Top Channel/Bus Selector + In-Place Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="console-module-rack p-0.5 rounded flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                setTargetDomain('channel');
                setSelectedBandIdx(0);
              }}
              className={`px-2 py-0.5 rounded-[2px] text-[10px] font-mono ${
                targetDomain === 'channel' ? 'console-module-tab-active' : 'console-module-tab'
              }`}
            >
              INPUT CH
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetDomain('bus');
                setEqModuleTab('para');
                setSelectedBandIdx(0);
              }}
              className={`px-2 py-0.5 rounded-[2px] text-[10px] font-mono ${
                targetDomain === 'bus' ? 'console-module-tab-active' : 'console-module-tab'
              }`}
            >
              MIX BUS
            </button>
          </div>

          {!isBusMode ? (
            <>
              <select
                value={ch.id}
                onChange={(e) => {
                  setSelectedChannelId(e.target.value);
                  setSelectedBandIdx(0);
                }}
                className="console-btn-surface rounded px-2 py-1 text-xs font-mono text-slate-100"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    CH {String(c.number).padStart(2, '0')} · {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedChannelId(partnerCh.id)}
                className="px-2 py-1 rounded console-accent-active border text-[10px] font-mono font-bold whitespace-nowrap"
              >
                NEXT CH ({partnerCh.shortName})
              </button>
            </>
          ) : (
            <select
              value={activeBus.id}
              onChange={(e) => {
                setSelectedBusId(e.target.value);
                setSelectedBandIdx(0);
              }}
              className="console-btn-surface rounded px-2 py-1 text-xs font-mono text-slate-100"
            >
              {buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortName} · {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Module Tabs: Switch In-Place Without Vertical Scrolling */}
        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'para', label: `PARAMETRIC EQ (${activeBands.length}B)`, icon: Sliders, disabled: false },
            { id: 'geq31', label: '31-BAND GRAPHIC EQ', icon: Waves, disabled: isBusMode },
            { id: 'dynamics', label: 'DYNAMICS & HPF', icon: Activity, disabled: isBusMode },
            { id: 'presets', label: 'QUICK-LOAD CURVES', icon: Sparkles, disabled: isBusMode },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                disabled={t.disabled}
                onClick={() => setEqModuleTab(t.id as typeof eqModuleTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all disabled:opacity-35 ${
                  eqModuleTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {!isBusMode && (
            <ConsoleButton
              label="AUTO-EQ"
              size="xs"
              color="emerald"
              active={false}
              onClick={() => autoCalibrateChannel(ch.id)}
            />
          )}
          {!isBusMode && globalDspBypass && (
            <ConsoleButton
              label="GLOBAL BYP"
              size="xs"
              color="amber"
              active
              onClick={toggleGlobalDspBypass}
            />
          )}
          <ConsoleButton
            label={abCompareB ? 'SLOT B' : 'SLOT A'}
            size="xs"
            color="cyan"
            active={abCompareB}
            onClick={() => setAbCompareB((v) => !v)}
          />
          <ConsoleButton
            label={activeEqEnabled ? 'EQ ON' : 'EQ BYP'}
            size="xs"
            color={activeEqEnabled ? 'amber' : 'crimson'}
            active={activeEqEnabled}
            onClick={() =>
              isBusMode
                ? updateBus(activeBus.id, { eqEnabled: !activeBus.eqEnabled })
                : updateChannel(ch.id, { eqEnabled: !ch.eqEnabled })
            }
          />
        </div>
      </div>

      {/* Front-to-Back Console Signal Flow Strip + Quick-Load Context Bar */}
      <div
        className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border shrink-0"
        style={{ borderColor: 'var(--console-accent-border)' }}
      >
        <div className="flex items-center gap-1 flex-wrap text-[9px] font-mono">
          {flowStages.map((st, idx) => (
            <React.Fragment key={st.label}>
              <span
                className={`px-1.5 py-0.5 rounded border ${
                  st.on
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-white/10 bg-black/30 text-slate-500'
                }`}
              >
                {st.label}
              </span>
              {idx < flowStages.length - 1 && <span className="text-slate-600">→</span>}
            </React.Fragment>
          ))}
        </div>

        {!isBusMode ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-slate-400 hidden xl:inline truncate max-w-[210px]">
              {recommendation.matchReason}
            </span>
            <ConsoleButton
              label={
                activePresetId === recommendation.primary.id
                  ? `ACTIVE: ${recommendation.primary.name}`
                  : `QUICK-LOAD: ${recommendation.primary.name}`
              }
              size="xs"
              color="amber"
              active={activePresetId === recommendation.primary.id}
              onClick={() => togglePreset(recommendation.primary.id)}
            />
            <ConsoleButton
              label="FLAT"
              size="xs"
              color="cyan"
              active={false}
              onClick={() => {
                setActivePresetByChannel((prev) => ({ ...prev, [ch.id]: null }));
                updateChannel(ch.id, {
                  eqBands: ch.eqBands.map((b) => ({ ...b, gainDb: 0 })),
                  geqBands: new Array(31).fill(0),
                });
              }}
            />
          </div>
        ) : (
          <ConsoleButton
            label="FLATTEN BUS EQ"
            size="xs"
            color="cyan"
            active={false}
            onClick={() =>
              updateBus(activeBus.id, {
                eqBands: activeBands.map((b) => ({ ...b, gainDb: 0 })),
              })
            }
          />
        )}
      </div>

      {/* TAB 1: DYNAMIC N-BAND PARAMETRIC BODE + KNOBS */}
      {eqModuleTab === 'para' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
          <div className="flex-1 min-h-0 console-chassis rounded-lg border p-3 grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch overflow-hidden">
            <div className="xl:col-span-2 flex flex-col justify-between gap-2 console-well rounded p-2">
              <AnalogVuMeter
                label="INPUT VU"
                levelDbfs={m?.inputRmsDbfs ?? -80}
                peakLed={(m?.inputPeakDbfs ?? -80) > -0.5}
                compact
              />
              <div className="flex items-center justify-center gap-2 flex-1">
                <LedMeter peakDbfs={m?.inputPeakDbfs ?? -80} height={110} width={10} segments={14} label="IN" />
                <LedMeter
                  peakDbfs={m?.peakDbfs ?? -80}
                  peakHoldDbfs={m?.peakHoldDbfs ?? -80}
                  gainReductionDb={m?.gainReductionDb ?? 0}
                  clipping={m?.clipping}
                  height={110}
                  width={10}
                  segments={14}
                  label="OUT"
                />
              </div>
            </div>

            <div className="xl:col-span-8 console-well rounded-md p-2.5 flex flex-col justify-between min-h-0">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>
                  {isBusMode
                    ? `${activeBus.name.toUpperCase()} · ${activeBands.length}-BAND PARAMETRIC BODE`
                    : `COMBINED PARAMETRIC (${activeBands.length}B) + 31-BAND BODE & LIVE FFT`}
                </span>
                <span className="text-sky-300">Drag nodes · Wheel adjusts Q · Add/Remove bands below</span>
              </div>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${svgW} ${svgH}`}
                onPointerMove={handleSvgPointerMove}
                onPointerUp={() => setDraggingBandIdx(null)}
                onPointerLeave={() => setDraggingBandIdx(null)}
                className="w-full flex-1 min-h-0 rounded dark-instrument-scope select-none touch-none mt-1"
              >
                {[30, 50, 100, 200, 500, 1000, 2000, 5000, 10000].map((hz) => {
                  const x = freqToX(hz, svgW);
                  return (
                    <g key={hz}>
                      <line x1={x} y1={0} x2={x} y2={svgH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <text x={x + 3} y={svgH - 6} fill="#64748b" fontSize="9" fontFamily="JetBrains Mono">
                        {hz >= 1000 ? `${hz / 1000}k` : hz}
                      </text>
                    </g>
                  );
                })}
                {[-12, -6, 0, 6, 12].map((db) => {
                  const y = dbToY(db, svgH);
                  return (
                    <g key={db}>
                      <line
                        x1={0}
                        y1={y}
                        x2={svgW}
                        y2={y}
                        stroke={db === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}
                        strokeWidth="1"
                      />
                      <text x={6} y={y - 3} fill="#64748b" fontSize="9" fontFamily="JetBrains Mono">
                        {db > 0 ? `+${db}` : db} dB
                      </text>
                    </g>
                  );
                })}
                <path d={spectrumPath} fill="rgba(56, 189, 248, 0.14)" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="1" />
                <path
                  d={eqCurvePath}
                  fill="none"
                  stroke={activeEqEnabled || (!isBusMode && ch.geqEnabled) ? '#f59e0b' : '#64748b'}
                  strokeWidth="2.5"
                />
                {activeBands.map((band, idx) => {
                  const cx = freqToX(band.freqHz, svgW);
                  const cy = dbToY(band.gainDb, svgH);
                  const isActive = idx === clampedBandIdx;
                  const col = BAND_COLORS[idx % BAND_COLORS.length];
                  return (
                    <g
                      key={band.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedBandIdx(idx);
                        setDraggingBandIdx(idx);
                      }}
                      onWheel={(e) => {
                        e.preventDefault();
                        const nextQ = Math.max(0.4, Math.min(14, band.q + (e.deltaY < 0 ? 0.3 : -0.3)));
                        updateBand(idx, { q: Number(nextQ.toFixed(1)) });
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isActive ? 11 : 8}
                        fill={band.enabled ? col : '#334155'}
                        fillOpacity={0.28}
                        stroke={col}
                        strokeWidth={isActive ? 2.5 : 1.5}
                      />
                      <text
                        x={cx}
                        y={cy + 3}
                        fill="#f8fafc"
                        fontSize="9"
                        fontFamily="JetBrains Mono"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {idx + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="xl:col-span-2 flex flex-col justify-between gap-2 console-well rounded p-2">
              <AnalogVuMeter label="OUTPUT VU" levelDbfs={m?.rmsDbfs ?? -80} peakLed={m?.clipping} compact />
              <div className="oled-display rounded p-2 space-y-1 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">IN PK</span>
                  <span className="text-slate-200">{(m?.inputPeakDbfs ?? -80).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">OUT PK</span>
                  <span className="text-emerald-300">{(m?.peakDbfs ?? -80).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">COMP GR</span>
                  <span className="text-amber-300">-{(m?.gainReductionDb ?? 0).toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="console-chassis rounded-lg border p-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeBands.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBandIdx(i)}
                  className={`px-2 py-1 rounded text-[10px] font-mono border ${
                    i === clampedBandIdx ? 'console-accent-active font-bold' : 'console-btn-surface text-slate-400'
                  }`}
                >
                  {i + 1}. {b.label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleAddBand}
                className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-mono text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>ADD BAND</span>
              </button>
              {activeBand && activeBands.length > 1 && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedBand}
                  title="Remove selected EQ band"
                  className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-[10px] font-mono text-rose-300 hover:bg-rose-500/20 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {activeBand && (
                <>
                  <select
                    value={activeBand.shape}
                    onChange={(e) => updateBand(clampedBandIdx, { shape: e.target.value as FilterShape })}
                    className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200"
                  >
                    <option value="bell">Bell</option>
                    <option value="low-shelf">Low Shelf</option>
                    <option value="high-shelf">High Shelf</option>
                    <option value="notch">Notch</option>
                    <option value="band-pass">Band-Pass</option>
                  </select>
                  <ConsoleButton
                    label={activeBand.enabled ? 'BAND IN' : 'OUT'}
                    size="xs"
                    color="emerald"
                    active={activeBand.enabled}
                    onClick={() => updateBand(clampedBandIdx, { enabled: !activeBand.enabled })}
                  />
                </>
              )}
            </div>

            {activeBand && (
              <div className="flex items-center gap-4">
                {!isBusMode && (
                  <RotaryKnob
                    label="HPF"
                    value={ch.hpfFreqHz}
                    min={20}
                    max={350}
                    step={5}
                    unit="Hz"
                    size={38}
                    accentColor="amber"
                    disabled={!ch.hpfEnabled}
                    onChange={(v) => updateChannel(ch.id, { hpfFreqHz: v })}
                  />
                )}
                <RotaryKnob
                  label="FREQ"
                  value={activeBand.freqHz}
                  min={20}
                  max={18000}
                  step={10}
                  size={38}
                  accentColor="cyan"
                  formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${Math.round(v)}Hz`)}
                  onChange={(v) => updateBand(clampedBandIdx, { freqHz: v })}
                />
                <RotaryKnob
                  label="GAIN"
                  value={activeBand.gainDb}
                  min={-18}
                  max={18}
                  step={0.5}
                  bipolar
                  unit="dB"
                  size={38}
                  accentColor="emerald"
                  onChange={(v) => updateBand(clampedBandIdx, { gainDb: v })}
                />
                <RotaryKnob
                  label="Q"
                  value={activeBand.q}
                  min={0.4}
                  max={14}
                  step={0.1}
                  size={38}
                  accentColor="rose"
                  formatValue={(v) => v.toFixed(1)}
                  onChange={(v) => updateBand(clampedBandIdx, { q: v })}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: FULL 31-BAND GRAPHIC EQ */}
      {eqModuleTab === 'geq31' && !isBusMode && (
        <div className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden">
          <GraphicEq31Band
            channelLabel={`CH ${String(ch.number).padStart(2, '0')} · ${ch.name}`}
            bands={ch.geqBands}
            enabled={ch.geqEnabled}
            quickLoadLabel={recommendation.primary.name}
            quickLoadSummary={recommendation.matchReason}
            quickLoadActive={activePresetId === recommendation.primary.id}
            onQuickLoad={() => togglePreset(recommendation.primary.id)}
            onToggleEnabled={() => updateChannel(ch.id, { geqEnabled: !ch.geqEnabled })}
            onChangeBand={(idx, db) => {
              const next = [...ch.geqBands];
              next[idx] = db;
              updateChannel(ch.id, { geqBands: next });
            }}
            onResetFlat={() => updateChannel(ch.id, { geqBands: new Array(31).fill(0) })}
            onApplyCurvePreset={(preset) => {
              const next = new Array(31).fill(0);
              if (preset === 'vocal') {
                next[6] = -4;
                next[7] = -3;
                next[10] = -2;
                next[20] = 2.5;
                next[22] = 3;
                next[25] = 2;
              } else if (preset === 'sanctuary') {
                next[4] = -3;
                next[5] = -4;
                next[11] = -3.5;
                next[12] = -2.5;
                next[21] = -2;
              } else {
                next[3] = 2.5;
                next[4] = 3;
                next[5] = 2;
                next[11] = -3.5;
                next[17] = 2.5;
              }
              updateChannel(ch.id, { geqEnabled: true, geqBands: next });
            }}
          />
        </div>
      )}

      {/* TAB 3: DYNAMICS, GATE, COMP & DELAY */}
      {eqModuleTab === 'dynamics' && !isBusMode && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border p-4 flex flex-col justify-between gap-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-mono text-xs font-semibold text-emerald-300 uppercase">
              Channel Dynamics Processor &amp; Phase Delay · CH {String(ch.number).padStart(2, '0')} {ch.name}
            </span>
            <div className="flex items-center gap-2">
              <ConsoleButton
                label="HPF"
                size="xs"
                color="amber"
                active={ch.hpfEnabled}
                onClick={() => updateChannel(ch.id, { hpfEnabled: !ch.hpfEnabled })}
              />
              <ConsoleButton
                label="GATE"
                size="xs"
                color="amber"
                active={ch.dynamics.gateEnabled}
                onClick={() =>
                  updateChannel(ch.id, {
                    dynamics: { ...ch.dynamics, gateEnabled: !ch.dynamics.gateEnabled },
                  })
                }
              />
              <ConsoleButton
                label="COMP"
                size="xs"
                color="emerald"
                active={ch.dynamics.compEnabled}
                onClick={() =>
                  updateChannel(ch.id, {
                    dynamics: { ...ch.dynamics, compEnabled: !ch.dynamics.compEnabled },
                  })
                }
              />
              <ConsoleButton
                label="LIMITER"
                size="xs"
                color="crimson"
                active={ch.dynamics.limiterEnabled}
                onClick={() =>
                  updateChannel(ch.id, {
                    dynamics: { ...ch.dynamics, limiterEnabled: !ch.dynamics.limiterEnabled },
                  })
                }
              />
            </div>
          </div>

          <div className="console-panel rounded-md p-5 grid grid-cols-3 sm:grid-cols-6 gap-4 items-center flex-1">
            <RotaryKnob
              label="GATE THR"
              value={ch.dynamics.gateThresholdDb}
              min={-70}
              max={-10}
              step={1}
              unit="dB"
              size={58}
              accentColor="amber"
              disabled={!ch.dynamics.gateEnabled}
              onChange={(v) =>
                updateChannel(ch.id, { dynamics: { ...ch.dynamics, gateThresholdDb: v } })
              }
            />
            <RotaryKnob
              label="COMP THR"
              value={ch.dynamics.compThresholdDb}
              min={-40}
              max={0}
              step={0.5}
              unit="dB"
              size={58}
              accentColor="emerald"
              disabled={!ch.dynamics.compEnabled}
              onChange={(v) =>
                updateChannel(ch.id, { dynamics: { ...ch.dynamics, compThresholdDb: v } })
              }
            />
            <RotaryKnob
              label="RATIO"
              value={ch.dynamics.compRatio}
              min={1}
              max={12}
              step={0.2}
              unit=":1"
              size={58}
              accentColor="emerald"
              disabled={!ch.dynamics.compEnabled}
              onChange={(v) =>
                updateChannel(ch.id, { dynamics: { ...ch.dynamics, compRatio: v } })
              }
            />
            <RotaryKnob
              label="ATTACK"
              value={ch.dynamics.compAttackMs}
              min={1}
              max={80}
              step={1}
              unit="ms"
              size={58}
              accentColor="cyan"
              onChange={(v) =>
                updateChannel(ch.id, { dynamics: { ...ch.dynamics, compAttackMs: v } })
              }
            />
            <RotaryKnob
              label="MAKEUP"
              value={ch.dynamics.compMakeupDb}
              min={0}
              max={12}
              step={0.5}
              unit="dB"
              size={58}
              accentColor="amber"
              onChange={(v) =>
                updateChannel(ch.id, { dynamics: { ...ch.dynamics, compMakeupDb: v } })
              }
            />
            <RotaryKnob
              label="CH DELAY"
              value={ch.delayMs}
              min={0}
              max={50}
              step={0.2}
              unit="ms"
              size={58}
              accentColor="rose"
              onChange={(v) => updateChannel(ch.id, { delayMs: v })}
            />
          </div>

          <div className="oled-display rounded p-3 flex items-center justify-between text-xs font-mono">
            <span>{abCompareB ? 'Slot B Comparison Snapshot' : 'Slot A Active Real-Time Chain'}</span>
            <span className="flex items-center gap-1.5 text-sky-300">
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Gain Reduction: -{(m?.gainReductionDb ?? 0).toFixed(1)} dB</span>
            </span>
          </div>
        </div>
      )}

      {/* TAB 4: CONTEXT-AWARE QUICK-LOAD STARTING CURVE LIBRARY */}
      {eqModuleTab === 'presets' && !isBusMode && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border p-3.5 flex flex-col justify-between gap-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <h2 className="text-sm font-display font-semibold text-slate-100">
                Context-Aware EQ Curve Library · CH {String(ch.number).padStart(2, '0')} ({ch.name})
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                1-Click toggle loads both Parametric EQ and 31-Band Graphic EQ curves. Click again to revert flat.
              </p>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 content-start overflow-y-auto pr-1">
            {EQ_PRESETS.map((preset) => {
              const isOn = activePresetId === preset.id;
              const isRec = preset.id === recommendation.primary.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => togglePreset(preset.id)}
                  className={`rounded-md p-3 border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    isOn
                      ? 'console-accent-active'
                      : isRec
                        ? 'console-panel border-amber-400/60'
                        : 'console-btn-surface'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {isRec ? `★ ${preset.name}` : preset.name}
                    </span>
                    <span className="text-[9px] font-mono text-amber-300 shrink-0">
                      {isOn ? 'ACTIVE' : isRec ? 'MATCH' : `HPF ${preset.hpfFreqHz}Hz`}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-2">{preset.summary}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
