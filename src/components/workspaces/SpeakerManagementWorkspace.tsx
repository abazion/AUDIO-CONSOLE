import React, { useMemo, useState } from 'react';
import { AlertTriangle, Speaker, Waves, ShieldCheck, Plus, Trash2, Sliders } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { computeCrossoverResponseDb } from '../../engine/webAudioEngine';
import type { CrossoverFamily, FilterShape, SpeakerBand, SpeakerRole } from '../../engine/types';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { ArcGauge } from '../hardware/ArcGauge';
import { HorizontalSlider } from '../hardware/HorizontalSlider';
import { LedMeter } from '../hardware/LedMeter';

const SPK_COLORS = ['#10b981', '#f59e0b', '#38bdf8', '#a78bfa', '#f43f5e', '#fb923c', '#2dd4bf', '#e879f9'];

const SPEAKER_ROLES: SpeakerRole[] = [
  'Subwoofer',
  'Low-Mid',
  'High-Mid / Horn',
  'Front Fill',
  'Balcony Delay',
  'Monitor Wedge',
  'Broadcast / Stream',
  'Virtual Cable Out',
  'Custom Output',
];

export const SpeakerManagementWorkspace: React.FC = () => {
  const {
    speakers,
    updateSpeaker,
    addSpeakerOutput,
    removeSpeakerOutput,
    addSpeakerEqBand,
    updateSpeakerEqBand,
    removeSpeakerEqBand,
    buses,
    meters,
    detectedHardware,
    virtualCables,
  } = useAudioConsole();

  const [selectedSpkId, setSelectedSpkId] = useState<string>(speakers[0]?.id ?? '');
  const [spkTab, setSpkTab] = useState<'bode' | 'output_eq' | 'zones'>('bode');
  const [addingOutput, setAddingOutput] = useState(false);
  const [newOutName, setNewOutName] = useState('');
  const [newOutRole, setNewOutRole] = useState<SpeakerRole>('Custom Output');
  const [newOutBusId, setNewOutBusId] = useState<string>(buses[0]?.id ?? 'bus-main');
  const [selectedOutBandIdx, setSelectedOutBandIdx] = useState<number>(0);

  const selectedSpk = speakers.find((s) => s.id === selectedSpkId) ?? speakers[0];
  const subBand = speakers.find((s) => s.role === 'Subwoofer') ?? selectedSpk;
  const outputDevices = detectedHardware.filter((d) => d.kind === 'audiooutput');

  const svgW = 760;
  const svgH = 220;

  const freqToX = (f: number) =>
    ((Math.log10(Math.max(20, Math.min(20000, f))) - Math.log10(20)) / 3) * svgW;
  const dbToY = (db: number) => ((12 - Math.max(-36, Math.min(12, db))) / 48) * svgH;

  const curves = useMemo(() => {
    return speakers.map((spk, idx) => {
      const pts: string[] = [];
      for (let i = 0; i <= 120; i++) {
        const freq = 20 * Math.pow(1000, i / 120);
        const { magDb } = computeCrossoverResponseDb(freq, spk);
        pts.push(`${i === 0 ? 'M' : 'L'} ${freqToX(freq).toFixed(1)} ${dbToY(magDb).toFixed(1)}`);
      }
      return { id: spk.id, color: SPK_COLORS[idx % SPK_COLORS.length], path: pts.join(' ') };
    });
  }, [speakers]);

  const delayMeters = (selectedSpk.delayMs * 0.343).toFixed(2);
  const verifiedPct = Math.round(
    (speakers.filter((s) => s.connectorVerified).length / Math.max(1, speakers.length)) * 100
  );
  const liveReadyPct = Math.round(
    (speakers.filter((s) => !s.mute && s.connectorVerified).length / Math.max(1, speakers.length)) * 100
  );

  const outEqBands = selectedSpk.eqBands ?? [];
  const clampedOutBandIdx = Math.min(selectedOutBandIdx, Math.max(0, outEqBands.length - 1));
  const activeOutBand = outEqBands[clampedOutBandIdx];

  const handleCreateOutput = (e: React.FormEvent) => {
    e.preventDefault();
    const created = addSpeakerOutput(
      newOutName.trim() || `Output ${speakers.length + 1}`,
      newOutRole,
      newOutBusId
    );
    setSelectedSpkId(created.id);
    setNewOutName('');
    setAddingOutput(false);
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Top Speaker DSP Header + Module Tabs + Dynamic Output Switcher */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Speaker className="w-4 h-4 text-sky-400 shrink-0" />
          <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100">
            Active Crossovers, Output EQ &amp; Final Sinks
          </h1>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'bode', label: 'CROSSOVER BODE', icon: Waves },
            { id: 'output_eq', label: `OUTPUT EQ (${outEqBands.length}B)`, icon: Sliders },
            { id: 'zones', label: 'OUTPUT SINKS & SUB BOOST', icon: ShieldCheck },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSpkTab(t.id as typeof spkTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  spkTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={selectedSpk.id}
            onChange={(e) => {
              setSelectedSpkId(e.target.value);
              setSelectedOutBandIdx(0);
            }}
            className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-100"
          >
            {speakers.map((spk, idx) => (
              <option key={spk.id} value={spk.id}>
                OUT {idx + 1} · {spk.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAddingOutput((v) => !v)}
            className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/15 text-[10px] font-mono text-emerald-300 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>ADD OUT</span>
          </button>
        </div>
      </div>

      {addingOutput && (
        <form
          onSubmit={handleCreateOutput}
          className="console-panel rounded-md px-3 py-2 flex flex-wrap items-center gap-2 border border-emerald-500/40 shrink-0"
        >
          <input
            type="text"
            value={newOutName}
            onChange={(e) => setNewOutName(e.target.value)}
            placeholder="Output name (e.g. Choir Balcony, Cry Room, Recording Stem)"
            className="flex-1 min-w-[200px] console-well border border-white/15 rounded px-2 py-1 text-xs font-mono text-slate-100"
          />
          <select
            value={newOutRole}
            onChange={(e) => setNewOutRole(e.target.value as SpeakerRole)}
            className="console-btn-surface rounded px-2 py-1 text-xs font-mono text-slate-200"
          >
            {SPEAKER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={newOutBusId}
            onChange={(e) => setNewOutBusId(e.target.value)}
            className="console-btn-surface rounded px-2 py-1 text-xs font-mono text-slate-200"
          >
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                Source: {b.shortName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1 rounded bg-emerald-500 text-slate-950 text-xs font-mono font-bold"
          >
            CREATE OUTPUT
          </button>
          <button
            type="button"
            onClick={() => setAddingOutput(false)}
            className="px-2 py-1 rounded console-btn-surface text-xs font-mono text-slate-400"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Main Single-Viewport Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
        {/* Left 3 Cols: Unlimited Dynamic Output Channel Matrix */}
        <div className="xl:col-span-3 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
            <span className="text-[10px] font-mono font-semibold text-emerald-300 uppercase">
              Output Matrix ({speakers.length} Outputs)
            </span>
            {speakers.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const fallback = speakers.find((s) => s.id !== selectedSpk.id);
                  removeSpeakerOutput(selectedSpk.id);
                  if (fallback) setSelectedSpkId(fallback.id);
                }}
                className="text-[10px] font-mono text-rose-400 hover:text-rose-300 flex items-center gap-0.5"
                title="Remove selected output"
              >
                <Trash2 className="w-3 h-3" />
                <span>DEL</span>
              </button>
            )}
          </div>

          <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
            {speakers.map((spk, idx) => {
              const spkMeter = meters[spk.id];
              const busMeter = meters[spk.sourceBusId];
              const isSel = spk.id === selectedSpk.id;
              return (
                <button
                  key={spk.id}
                  type="button"
                  onClick={() => {
                    setSelectedSpkId(spk.id);
                    setSelectedOutBandIdx(0);
                  }}
                  className={`w-full rounded px-2.5 py-2 border flex items-center justify-between gap-2 text-left transition-all ${
                    isSel ? 'console-accent-active' : 'console-btn-surface'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: SPK_COLORS[idx % SPK_COLORS.length] }}
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-100 truncate">
                        OUT {idx + 1} · {spk.name}
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 truncate">
                        {spk.crossoverBypass
                          ? 'FULL-RANGE'
                          : `${spk.hpfHz}–${spk.lpfHz >= 1000 ? `${(spk.lpfHz / 1000).toFixed(1)}k` : spk.lpfHz}Hz`}{' '}
                        · {spk.delayMs.toFixed(1)}ms
                        {(spk.eqBands?.length ?? 0) > 0 ? ` · ${spk.eqBands?.length}B EQ` : ''}
                      </div>
                    </div>
                  </div>
                  <LedMeter
                    peakDbfs={spkMeter?.signalPresent ? spkMeter.peakDbfs : (busMeter?.peakDbfs ?? -80)}
                    height={22}
                    width={6}
                    segments={5}
                  />
                </button>
              );
            })}
          </div>

          {!selectedSpk.connectorVerified && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 flex items-center justify-between gap-2 text-[10px] text-amber-200 shrink-0">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                Unverified output connector
              </span>
              <ConsoleButton
                label="VERIFY"
                size="xs"
                color="emerald"
                active={false}
                onClick={() => updateSpeaker(selectedSpk.id, { connectorVerified: true })}
              />
            </div>
          )}
        </div>

        {/* Center 6 Cols: Tabbed Active View (Bode | Per-Output Parametric EQ | Final Sinks & Zones) */}
        <div className="xl:col-span-6 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
          {spkTab === 'bode' && (
            <>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-white/10 pb-1.5">
                <span className="text-sky-300 font-semibold uppercase">
                  {speakers.length}-Output Active Crossover &amp; Output EQ Bode (20 Hz – 20 kHz)
                </span>
                <span>
                  {selectedSpk.crossoverBypass ? 'XOVER BYPASSED' : `${selectedSpk.family} · ${selectedSpk.hpfSlope}/${selectedSpk.lpfSlope} dB/oct`}
                </span>
              </div>
              <div className="console-well rounded-md p-2.5 flex-1 min-h-0 flex items-center">
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full max-h-[340px] dark-instrument-scope rounded">
                  {[30, 60, 90, 120, 250, 500, 1000, 4000, 10000].map((hz) => {
                    const x = freqToX(hz);
                    return (
                      <g key={hz}>
                        <line x1={x} y1={0} x2={x} y2={svgH} stroke="rgba(255,255,255,0.06)" />
                        <text x={x + 3} y={svgH - 5} fill="#64748b" fontSize="9" fontFamily="JetBrains Mono">
                          {hz >= 1000 ? `${hz / 1000}k` : hz}
                        </text>
                      </g>
                    );
                  })}
                  {[0, -12, -24].map((db) => {
                    const y = dbToY(db);
                    return (
                      <g key={db}>
                        <line
                          x1={0}
                          y1={y}
                          x2={svgW}
                          y2={y}
                          stroke={db === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}
                        />
                        <text x={6} y={y - 3} fill="#64748b" fontSize="9" fontFamily="JetBrains Mono">
                          {db} dB
                        </text>
                      </g>
                    );
                  })}
                  {curves.map((c) => (
                    <path
                      key={c.id}
                      d={c.path}
                      fill="none"
                      stroke={c.color}
                      strokeWidth={c.id === selectedSpk.id ? 3 : 1.5}
                      opacity={c.id === selectedSpk.id ? 1 : 0.4}
                    />
                  ))}
                </svg>
              </div>
            </>
          )}

          {spkTab === 'output_eq' && (
            <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="text-[11px] font-mono font-semibold text-amber-300 uppercase">
                  {selectedSpk.name} · Dedicated Output Parametric EQ ({outEqBands.length} Bands)
                </span>
                <div className="flex items-center gap-1.5">
                  <ConsoleButton
                    label={selectedSpk.eqEnabled !== false ? 'OUT EQ ON' : 'BYPASSED'}
                    size="xs"
                    color={selectedSpk.eqEnabled !== false ? 'emerald' : 'crimson'}
                    active={selectedSpk.eqEnabled !== false}
                    onClick={() =>
                      updateSpeaker(selectedSpk.id, { eqEnabled: selectedSpk.eqEnabled === false })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addSpeakerEqBand(selectedSpk.id, {
                        freqHz: Math.min(12000, 120 * Math.pow(2, outEqBands.length % 6)),
                      });
                      setSelectedOutBandIdx(outEqBands.length);
                    }}
                    className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/15 text-[10px] font-mono text-emerald-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>ADD BAND</span>
                  </button>
                </div>
              </div>

              <div className="console-well rounded-md p-2 flex-1 min-h-0 flex items-center">
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full max-h-[250px] dark-instrument-scope rounded">
                  {[30, 60, 120, 250, 500, 1000, 4000, 10000].map((hz) => (
                    <line key={hz} x1={freqToX(hz)} y1={0} x2={freqToX(hz)} y2={svgH} stroke="rgba(255,255,255,0.06)" />
                  ))}
                  {[0, -12, -24].map((db) => (
                    <line
                      key={db}
                      x1={0}
                      y1={dbToY(db)}
                      x2={svgW}
                      y2={dbToY(db)}
                      stroke={db === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}
                    />
                  ))}
                  {curves
                    .filter((c) => c.id === selectedSpk.id)
                    .map((c) => (
                      <path key={c.id} d={c.path} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
                    ))}
                </svg>
              </div>

              <div className="console-panel rounded p-2.5 space-y-2 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {outEqBands.length === 0 ? (
                      <span className="text-[10px] font-mono text-slate-400">
                        No room-tuning EQ bands yet — click ADD BAND to create unlimited corrective filters.
                      </span>
                    ) : (
                      outEqBands.map((b, i) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedOutBandIdx(i)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                            i === clampedOutBandIdx ? 'console-accent-active font-bold' : 'console-btn-surface text-slate-400'
                          }`}
                        >
                          {i + 1}. {b.freqHz >= 1000 ? `${(b.freqHz / 1000).toFixed(1)}k` : `${b.freqHz}Hz`} ({b.gainDb >= 0 ? '+' : ''}
                          {b.gainDb.toFixed(1)})
                        </button>
                      ))
                    )}
                  </div>
                  {activeOutBand && (
                    <div className="flex items-center gap-1">
                      <select
                        value={activeOutBand.shape}
                        onChange={(e) =>
                          updateSpeakerEqBand(selectedSpk.id, activeOutBand.id, {
                            shape: e.target.value as FilterShape,
                          })
                        }
                        className="console-btn-surface rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-200"
                      >
                        <option value="bell">Bell</option>
                        <option value="low-shelf">Low Shelf</option>
                        <option value="high-shelf">High Shelf</option>
                        <option value="notch">Notch</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeSpeakerEqBand(selectedSpk.id, activeOutBand.id)}
                        className="px-1.5 py-0.5 rounded border border-rose-500/40 text-[10px] font-mono text-rose-300"
                      >
                        DEL
                      </button>
                    </div>
                  )}
                </div>

                {activeOutBand && (
                  <div className="flex items-center justify-around pt-1">
                    <RotaryKnob
                      label="FREQ"
                      value={activeOutBand.freqHz}
                      min={20}
                      max={18000}
                      step={10}
                      size={38}
                      accentColor="cyan"
                      formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${Math.round(v)}Hz`)}
                      onChange={(v) => updateSpeakerEqBand(selectedSpk.id, activeOutBand.id, { freqHz: v })}
                    />
                    <RotaryKnob
                      label="GAIN"
                      value={activeOutBand.gainDb}
                      min={-18}
                      max={18}
                      step={0.5}
                      bipolar
                      unit="dB"
                      size={38}
                      accentColor="emerald"
                      onChange={(v) => updateSpeakerEqBand(selectedSpk.id, activeOutBand.id, { gainDb: v })}
                    />
                    <RotaryKnob
                      label="Q"
                      value={activeOutBand.q}
                      min={0.4}
                      max={14}
                      step={0.1}
                      size={38}
                      accentColor="rose"
                      formatValue={(v) => v.toFixed(1)}
                      onChange={(v) => updateSpeakerEqBand(selectedSpk.id, activeOutBand.id, { q: v })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {spkTab === 'zones' && (
            <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
              <div className="console-panel rounded p-2.5 flex items-center justify-around shrink-0">
                <ArcGauge value={verifiedPct} min={0} max={100} label="IO VERIFIED" unit="%" accent="emerald" size={84} />
                <ArcGauge value={liveReadyPct} min={0} max={100} label="OUTPUTS LIVE" unit="%" accent="cyan" size={84} />
              </div>

              <div className="console-panel rounded-md p-2.5 border border-violet-500/40 space-y-1.5 shrink-0">
                <div className="text-[10px] font-mono font-semibold text-violet-300 uppercase">
                  Subwoofer Deep-Bass Harmonic Boost ({subBand.name})
                </div>
                <div className="flex items-center justify-around console-well rounded p-2">
                  <ConsoleButton
                    label={subBand.subBoostEnabled ? 'BOOST ON' : 'BOOST OFF'}
                    size="sm"
                    color="cyan"
                    active={Boolean(subBand.subBoostEnabled)}
                    onClick={() =>
                      updateSpeaker(subBand.id, { subBoostEnabled: !subBand.subBoostEnabled })
                    }
                  />
                  <RotaryKnob
                    label="SUB FREQ"
                    value={subBand.subBoostFreqHz ?? 44}
                    min={28}
                    max={70}
                    step={1}
                    unit="Hz"
                    size={44}
                    accentColor="cyan"
                    disabled={!subBand.subBoostEnabled}
                    onChange={(v) => updateSpeaker(subBand.id, { subBoostFreqHz: v })}
                  />
                  <RotaryKnob
                    label="DEEP GAIN"
                    value={subBand.subBoostGainDb ?? 3.5}
                    min={0}
                    max={9}
                    step={0.5}
                    unit="dB"
                    size={44}
                    accentColor="emerald"
                    disabled={!subBand.subBoostEnabled}
                    formatValue={(v) => `+${v.toFixed(1)}`}
                    onChange={(v) => updateSpeaker(subBand.id, { subBoostGainDb: v })}
                  />
                </div>
              </div>

              <div className="console-panel rounded-md p-2.5 flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
                <div className="text-[10px] font-mono text-slate-400 uppercase">
                  Configured Final Output Destinations ({speakers.length})
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                  {speakers.map((spk) => (
                    <div
                      key={spk.id}
                      className="console-well rounded px-2.5 py-1.5 flex items-center justify-between gap-2 text-[10px] font-mono"
                    >
                      <div className="min-w-0">
                        <span className="text-slate-100 font-semibold">{spk.name}</span>
                        <span className="text-slate-400 ml-2">
                          Sink: {spk.outputSinkKind ?? 'master-mix'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ConsoleButton
                          label={spk.connectorVerified ? 'VERIFIED' : 'VERIFY'}
                          size="xs"
                          color="cyan"
                          active={spk.connectorVerified}
                          onClick={() => updateSpeaker(spk.id, { connectorVerified: !spk.connectorVerified })}
                        />
                        <ConsoleButton
                          label={spk.mute ? 'MUTED' : 'LIVE'}
                          size="xs"
                          color={spk.mute ? 'crimson' : 'emerald'}
                          active={!spk.mute}
                          onClick={() => updateSpeaker(spk.id, { mute: !spk.mute })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 3 Cols: Selected Output Crossover, Slope, Alignment & Final Sink */}
        <div className="xl:col-span-3 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="border-b border-white/10 pb-1.5 shrink-0">
            <div className="text-xs font-mono font-semibold text-amber-300 uppercase truncate">
              {selectedSpk.name}
            </div>
            <div className="text-[10px] font-mono text-slate-400 truncate">
              {selectedSpk.physicalConnector} · {selectedSpk.role}
            </div>
          </div>

          <div className="console-panel rounded p-2.5 space-y-1.5 flex-1 min-h-0 overflow-y-auto flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={selectedSpk.family}
                onChange={(e) =>
                  updateSpeaker(selectedSpk.id, { family: e.target.value as CrossoverFamily })
                }
                className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200"
              >
                <option value="Linkwitz-Riley">Linkwitz-Riley</option>
                <option value="Butterworth">Butterworth</option>
                <option value="Bessel">Bessel</option>
              </select>
              <select
                value={selectedSpk.sourceBusId}
                onChange={(e) => updateSpeaker(selectedSpk.id, { sourceBusId: e.target.value })}
                className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200"
              >
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    Bus: {b.shortName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={selectedSpk.hpfSlope}
                onChange={(e) =>
                  updateSpeaker(selectedSpk.id, { hpfSlope: Number(e.target.value) as 12 | 24 | 48 })
                }
                className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200"
              >
                <option value={12}>HPF 12dB/oct</option>
                <option value={24}>HPF 24dB/oct</option>
                <option value={48}>HPF 48dB/oct</option>
              </select>
              <select
                value={selectedSpk.lpfSlope}
                onChange={(e) =>
                  updateSpeaker(selectedSpk.id, { lpfSlope: Number(e.target.value) as 12 | 24 | 48 })
                }
                className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200"
              >
                <option value={12}>LPF 12dB/oct</option>
                <option value={24}>LPF 24dB/oct</option>
                <option value={48}>LPF 48dB/oct</option>
              </select>
            </div>

            {/* Final Output Sink Selector */}
            <div className="console-well rounded p-1.5 space-y-1">
              <div className="text-[9px] font-mono text-slate-400 uppercase">Final Destination Sink</div>
              <select
                value={selectedSpk.outputSinkKind ?? 'master-mix'}
                onChange={(e) =>
                  updateSpeaker(selectedSpk.id, {
                    outputSinkKind: e.target.value as SpeakerBand['outputSinkKind'],
                  })
                }
                className="w-full console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200"
              >
                <option value="master-mix">Master Audio Hardware Mix</option>
                <option value="device-sink">Dedicated OS Audio Output Device</option>
                <option value="virtual-cable">Built-In Virtual Audio Cable</option>
              </select>
              {selectedSpk.outputSinkKind === 'device-sink' && (
                <select
                  value={selectedSpk.outputDeviceId ?? ''}
                  onChange={(e) => updateSpeaker(selectedSpk.id, { outputDeviceId: e.target.value })}
                  className="w-full console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-sky-300"
                >
                  <option value="">Default System Output</option>
                  {outputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
              {selectedSpk.outputSinkKind === 'virtual-cable' && (
                <select
                  value={selectedSpk.virtualCableId ?? ''}
                  onChange={(e) => updateSpeaker(selectedSpk.id, { virtualCableId: e.target.value })}
                  className="w-full console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-emerald-300"
                >
                  <option value="">Select Virtual Cable...</option>
                  {virtualCables.map((vc) => (
                    <option key={vc.id} value={vc.id}>
                      {vc.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <HorizontalSlider
              label="OUTPUT LEVEL"
              value={selectedSpk.gainDb}
              min={-18}
              max={12}
              step={0.5}
              bipolar
              unit="dB"
              accentColor="emerald"
              onChange={(v) => updateSpeaker(selectedSpk.id, { gainDb: v })}
            />
            <HorizontalSlider
              label={`DELAY (${delayMeters} m)`}
              value={selectedSpk.delayMs}
              min={0}
              max={80}
              step={0.2}
              unit="ms"
              accentColor="cyan"
              onChange={(v) => updateSpeaker(selectedSpk.id, { delayMs: v })}
            />
            <HorizontalSlider
              label="HPF CROSSOVER"
              value={selectedSpk.hpfHz}
              min={20}
              max={400}
              step={2}
              unit="Hz"
              accentColor="amber"
              disabled={Boolean(selectedSpk.crossoverBypass)}
              onChange={(v) => updateSpeaker(selectedSpk.id, { hpfHz: v })}
            />
            <HorizontalSlider
              label="LPF CROSSOVER"
              value={selectedSpk.lpfHz}
              min={60}
              max={20000}
              step={20}
              accentColor="cyan"
              disabled={Boolean(selectedSpk.crossoverBypass)}
              formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`)}
              onChange={(v) => updateSpeaker(selectedSpk.id, { lpfHz: v })}
            />
            <HorizontalSlider
              label="LIMITER CEIL"
              value={selectedSpk.limiterThresholdDb}
              min={-16}
              max={0}
              step={0.5}
              unit="dBFS"
              accentColor="rose"
              onChange={(v) => updateSpeaker(selectedSpk.id, { limiterThresholdDb: v })}
            />

            <div className="grid grid-cols-3 gap-1 pt-1">
              <ConsoleButton
                label="BYP XOV"
                size="xs"
                color="amber"
                active={Boolean(selectedSpk.crossoverBypass)}
                onClick={() =>
                  updateSpeaker(selectedSpk.id, { crossoverBypass: !selectedSpk.crossoverBypass })
                }
              />
              <ConsoleButton
                label="Ø POL"
                size="xs"
                color="cyan"
                active={selectedSpk.polarityInvert}
                onClick={() =>
                  updateSpeaker(selectedSpk.id, { polarityInvert: !selectedSpk.polarityInvert })
                }
              />
              <ConsoleButton
                label={selectedSpk.mute ? 'MUTED' : 'LIVE'}
                size="xs"
                color={selectedSpk.mute ? 'crimson' : 'emerald'}
                active={!selectedSpk.mute}
                onClick={() => updateSpeaker(selectedSpk.id, { mute: !selectedSpk.mute })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
