import React, { useMemo, useState } from 'react';
import { AlertTriangle, Speaker, Waves, ShieldCheck } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { computeCrossoverResponseDb } from '../../engine/webAudioEngine';
import type { CrossoverFamily } from '../../engine/types';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { ArcGauge } from '../hardware/ArcGauge';
import { HorizontalSlider } from '../hardware/HorizontalSlider';
import { LedMeter } from '../hardware/LedMeter';

const SPK_COLORS = ['#10b981', '#f59e0b', '#38bdf8', '#a78bfa', '#f43f5e'];

export const SpeakerManagementWorkspace: React.FC = () => {
  const { speakers, updateSpeaker, buses, meters } = useAudioConsole();
  const [selectedSpkId, setSelectedSpkId] = useState<string>(speakers[0].id);
  const [spkTab, setSpkTab] = useState<'bode' | 'topology' | 'zones'>('bode');
  const [zoneLocks, setZoneLocks] = useState<Record<string, boolean>>({
    Balcony: true,
    Foyer: true,
    Nursery: true,
    Youth: false,
    Overflow: true,
  });

  const selectedSpk = speakers.find((s) => s.id === selectedSpkId) ?? speakers[0];
  const subBand = speakers.find((s) => s.role === 'Subwoofer') ?? selectedSpk;
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
    (speakers.filter((s) => s.connectorVerified).length / speakers.length) * 100
  );

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Top Speaker DSP Header + Module Tabs + Quick CH1/CH2/CH3 Output Selector */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Speaker className="w-4 h-4 text-sky-400 shrink-0" />
          <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100">
            Active Crossover &amp; Speaker Management DSP
          </h1>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'bode', label: 'ACTIVE CROSSOVER BODE', icon: Waves },
            { id: 'topology', label: 'ARRAY TOPOLOGY', icon: Speaker },
            { id: 'zones', label: 'ZONE PROTECTION & SUB BOOST', icon: ShieldCheck },
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

        <div className="flex items-center gap-1">
          {speakers.slice(0, 3).map((spk, idx) => (
            <button
              key={spk.id}
              type="button"
              onClick={() => setSelectedSpkId(spk.id)}
              className={`px-2 py-1 rounded text-[10px] font-mono border ${
                spk.id === selectedSpk.id ? 'console-accent-solid border-transparent' : 'console-btn-surface text-slate-300'
              }`}
            >
              CH {idx + 1} · {spk.role === 'Subwoofer' ? 'SUB' : spk.id === 'spk-main-l' ? 'MAIN L' : 'MAIN R'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Single-Viewport Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
        {/* Left 3 Cols: All 5 Output Channels */}
        <div className="xl:col-span-3 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="text-[10px] font-mono font-semibold text-emerald-300 uppercase border-b border-white/10 pb-1.5">
            Output Channel Matrix ({speakers.length} Channels)
          </div>

          <div className="space-y-1.5 flex-1 min-h-0 flex flex-col justify-between">
            {speakers.map((spk, idx) => {
              const busMeter = meters[spk.sourceBusId];
              const isSel = spk.id === selectedSpk.id;
              return (
                <button
                  key={spk.id}
                  type="button"
                  onClick={() => setSelectedSpkId(spk.id)}
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
                        CH {idx + 1} · {spk.name}
                      </div>
                      <div className="text-[9px] font-mono text-slate-400">
                        {spk.hpfHz}–{spk.lpfHz >= 1000 ? `${(spk.lpfHz / 1000).toFixed(1)}k` : spk.lpfHz}Hz ·{' '}
                        {spk.delayMs.toFixed(1)}ms
                      </div>
                    </div>
                  </div>
                  <LedMeter
                    peakDbfs={(busMeter?.peakDbfs ?? -80) + spk.gainDb}
                    height={22}
                    width={6}
                    segments={5}
                  />
                </button>
              );
            })}
          </div>

          {!selectedSpk.connectorVerified && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 flex items-center justify-between gap-2 text-[10px] text-amber-200">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                Unverified jack
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

        {/* Center 6 Cols: Tabbed Active View (Bode | Topology | Zone Protection) */}
        <div className="xl:col-span-6 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
          {spkTab === 'bode' && (
            <>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-white/10 pb-1.5">
                <span className="text-sky-300 font-semibold uppercase">
                  5-Channel Active Crossover Bode (20 Hz – 20 kHz)
                </span>
                <span>{selectedSpk.family} · 24 dB/oct</span>
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

          {spkTab === 'topology' && (
            <div className="console-well rounded-md p-2.5 flex-1 min-h-0 flex items-center">
              <svg viewBox="0 0 640 310" className="w-full h-full max-h-[360px] select-none">
                {buses.slice(0, 4).map((b, i) => {
                  const x = 55 + i * 145;
                  return (
                    <g key={b.id}>
                      <rect
                        x={x}
                        y={14}
                        width={100}
                        height={34}
                        rx="4"
                        fill="#141a24"
                        stroke="rgba(56,189,248,0.45)"
                        strokeWidth="1"
                      />
                      <text x={x + 50} y={30} textAnchor="middle" fill="#38bdf8" fontSize="9" fontFamily="JetBrains Mono" fontWeight="bold">
                        {b.shortName}
                      </text>
                      <text x={x + 50} y={42} textAnchor="middle" fill="#94a3b8" fontSize="7.5" fontFamily="JetBrains Mono">
                        {b.faderDb.toFixed(1)} dB
                      </text>
                      <path d={`M ${x + 50} 48 L ${x + 50} 82`} stroke="rgba(56,189,248,0.6)" strokeWidth="1.5" />
                    </g>
                  );
                })}

                <g onClick={() => setSelectedSpkId('spk-main-l')} className="cursor-pointer">
                  <rect
                    x={75}
                    y={88}
                    width={145}
                    height={72}
                    rx="6"
                    fill="#111824"
                    stroke={selectedSpk.id === 'spk-main-l' ? '#f59e0b' : '#10b981'}
                    strokeWidth={selectedSpk.id === 'spk-main-l' ? 2.5 : 1.5}
                  />
                  <circle cx="112" cy="116" r="14" fill="#090c12" stroke="#334155" strokeWidth="2" />
                  <circle cx="112" cy="116" r="5" fill="#10b981" />
                  <circle cx="182" cy="116" r="14" fill="#090c12" stroke="#334155" strokeWidth="2" />
                  <circle cx="182" cy="116" r="5" fill="#10b981" />
                  <text x="147" y="149" textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontFamily="JetBrains Mono">
                    MAIN LEFT ARRAY
                  </text>
                </g>

                <g onClick={() => setSelectedSpkId('spk-main-r')} className="cursor-pointer">
                  <rect
                    x={420}
                    y={88}
                    width={145}
                    height={72}
                    rx="6"
                    fill="#111824"
                    stroke="#f59e0b"
                    strokeWidth={selectedSpk.id === 'spk-main-r' ? 2.5 : 1.5}
                  />
                  <circle cx="458" cy="116" r="14" fill="#090c12" stroke="#334155" strokeWidth="2" />
                  <circle cx="458" cy="116" r="5" fill="#f59e0b" />
                  <circle cx="528" cy="116" r="14" fill="#090c12" stroke="#334155" strokeWidth="2" />
                  <circle cx="528" cy="116" r="5" fill="#f59e0b" />
                  <text x="492" y="149" textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontFamily="JetBrains Mono">
                    MAIN RIGHT ARRAY
                  </text>
                </g>

                <g onClick={() => setSelectedSpkId('spk-sub')} className="cursor-pointer">
                  <rect
                    x={250}
                    y={88}
                    width={140}
                    height={72}
                    rx="6"
                    fill="#131624"
                    stroke={selectedSpk.id === 'spk-sub' ? '#a78bfa' : '#38bdf8'}
                    strokeWidth={selectedSpk.id === 'spk-sub' ? 2.5 : 1.5}
                  />
                  <circle cx="290" cy="116" r="16" fill="#090c12" stroke="#8b5cf6" strokeWidth="2" />
                  <circle cx="290" cy="116" r="7" fill="#a78bfa" />
                  <circle cx="350" cy="116" r="16" fill="#090c12" stroke="#8b5cf6" strokeWidth="2" />
                  <circle cx="350" cy="116" r="7" fill="#a78bfa" />
                  <text x="320" y="149" textAnchor="middle" fill="#c4b5fd" fontSize="9.5" fontFamily="JetBrains Mono">
                    SUBWOOFER + BOOST
                  </text>
                </g>

                <path
                  d="M 147 160 L 147 210 M 320 160 L 320 210 M 492 160 L 492 210 M 147 185 L 492 185"
                  stroke="rgba(56,189,248,0.55)"
                  strokeWidth="1.5"
                  fill="none"
                />

                {speakers.slice(3).map((spk, idx) => {
                  const x = 140 + idx * 210;
                  const isSel = spk.id === selectedSpk.id;
                  return (
                    <g key={spk.id} onClick={() => setSelectedSpkId(spk.id)} className="cursor-pointer">
                      <rect
                        x={x}
                        y={210}
                        width={160}
                        height={54}
                        rx="5"
                        fill="#111722"
                        stroke={isSel ? '#f59e0b' : 'rgba(148,163,184,0.35)'}
                        strokeWidth={isSel ? 2 : 1}
                      />
                      <text x={x + 80} y={232} textAnchor="middle" fill="#f8fafc" fontSize="9.5" fontFamily="JetBrains Mono">
                        {spk.name.toUpperCase()}
                      </text>
                      <text x={x + 80} y={249} textAnchor="middle" fill="#34d399" fontSize="8.5" fontFamily="JetBrains Mono">
                        {spk.delayMs.toFixed(1)} ms · {spk.gainDb >= 0 ? '+' : ''}
                        {spk.gainDb.toFixed(1)} dB
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {spkTab === 'zones' && (
            <div className="flex-1 min-h-0 flex flex-col justify-between gap-3">
              <div className="console-panel rounded p-3 flex items-center justify-around">
                <ArcGauge value={verifiedPct} min={0} max={100} label="IO VERIFIED" unit="%" accent="emerald" size={92} />
                <ArcGauge value={92} min={0} max={100} label="COVERAGE" unit="%" accent="cyan" size={92} />
              </div>

              <div className="console-panel rounded-md p-3 border border-violet-500/40 space-y-2">
                <div className="text-[10px] font-mono font-semibold text-violet-300 uppercase">
                  Subwoofer Deep-Bass Harmonic Boost
                </div>
                <div className="flex items-center justify-around console-well rounded p-3">
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
                    size={48}
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
                    size={48}
                    accentColor="emerald"
                    disabled={!subBand.subBoostEnabled}
                    formatValue={(v) => `+${v.toFixed(1)}`}
                    onChange={(v) => updateSpeaker(subBand.id, { subBoostGainDb: v })}
                  />
                </div>
              </div>

              <div className="console-panel rounded-md p-3 space-y-2">
                <div className="text-[10px] font-mono text-slate-400">DISTRIBUTED SANCTUARY ZONES</div>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(zoneLocks).map(([zone, enabled]) => (
                    <ConsoleButton
                      key={zone}
                      label={zone.toUpperCase()}
                      size="xs"
                      color="emerald"
                      active={enabled}
                      fullWidth
                      onClick={() => setZoneLocks((prev) => ({ ...prev, [zone]: !prev[zone] }))}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 3 Cols: Selected Channel Crossover & Alignment Sliders */}
        <div className="xl:col-span-3 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="border-b border-white/10 pb-1.5">
            <div className="text-xs font-mono font-semibold text-amber-300 uppercase truncate">
              {selectedSpk.name}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {selectedSpk.physicalConnector} · {selectedSpk.role}
            </div>
          </div>

          <div className="console-panel rounded p-2.5 space-y-2 flex-1 flex flex-col justify-between">
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
                    {b.shortName}
                  </option>
                ))}
              </select>
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
              onChange={(v) => updateSpeaker(selectedSpk.id, { hpfHz: v })}
            />
            <HorizontalSlider
              label="LPF CROSSOVER"
              value={selectedSpk.lpfHz}
              min={60}
              max={20000}
              step={20}
              accentColor="cyan"
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

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <ConsoleButton
                label="Ø POLARITY"
                size="xs"
                color="cyan"
                active={selectedSpk.polarityInvert}
                onClick={() =>
                  updateSpeaker(selectedSpk.id, { polarityInvert: !selectedSpk.polarityInvert })
                }
              />
              <ConsoleButton
                label={selectedSpk.mute ? 'MUTED' : 'OUT LIVE'}
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
