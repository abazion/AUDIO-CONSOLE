import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  GitBranch,
  Lock,
  Radio,
  SlidersHorizontal,
  Speaker,
  Waves,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { computeCrossoverResponseDb } from '../../engine/webAudioEngine';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { MotorizedFader } from '../hardware/MotorizedFader';
import { ArcGauge } from '../hardware/ArcGauge';

function freqToX(freq: number, width: number): number {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  return ((Math.log10(Math.max(20, Math.min(20000, freq))) - minLog) / (maxLog - minLog)) * width;
}

export const MasterSystemOverview: React.FC = () => {
  const {
    hardwareProfile,
    detectedHardware,
    channels,
    buses,
    speakers,
    meters,
    spectrum,
    feedbackIncidents,
    scenes,
    activeSceneId,
    updateChannel,
    updateBus,
    setWorkspace,
    setSelectedChannelId,
    openSignalJourney,
    openSourceBay,
    cpuDspLoadPct,
    measuredLatencyMs,
    graphVersion,
    audioUnlocked,
    toggleAudioEngine,
    clearAllSolos,
    talkbackActive,
    toggleTalkback,
    systemIntelligence,
    optimizeAllLiveChannels,
  } = useAudioConsole();

  const [overviewTab, setOverviewTab] = useState<'bridge' | 'rta' | 'matrix'>('bridge');

  const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
  const subBus = buses.find((b) => b.id === 'bus-sub') ?? buses[1];
  const streamBus = buses.find((b) => b.id === 'bus-stream') ?? buses[buses.length - 1];
  const mainMeter = meters[mainBus.id];

  const subSpeaker = speakers.find((s) => s.role === 'Subwoofer') ?? speakers[0];
  const mainLeftSpeaker = speakers.find((s) => s.id === 'spk-main-l') ?? speakers[1];
  const activeScene = scenes.find((s) => s.id === activeSceneId);

  const activeAlerts = feedbackIncidents.filter(
    (f) => f.status === 'feedback_detected' || f.status === 'risk_predicted'
  );
  const ringRiskPct = activeAlerts.length > 0 ? Math.min(92, 42 + activeAlerts.length * 22) : 0;
  const headroomDb = mainMeter?.signalPresent
    ? Math.max(0, Math.min(24, Math.abs(mainMeter.peakDbfs)))
    : 24;
  const activePatchedCount = channels.filter((c) => c.sourceBinding?.active).length;

  const rtaW = 620;
  const rtaH = 210;

  const { rtaFillPath, rtaStrokePath, subXoverPath, mainXoverPath } = useMemo(() => {
    const rtaPts: string[] = [];
    spectrum.forEach((db, idx) => {
      const freq = 20 * Math.pow(1000, idx / 63);
      const x = freqToX(freq, rtaW);
      const norm = Math.max(0.02, Math.min(1, (db + 74) / 74));
      const y = rtaH - norm * (rtaH - 16);
      rtaPts.push(`${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    const stroke = rtaPts.join(' ');
    const fill = `${stroke} L ${rtaW} ${rtaH} L 0 ${rtaH} Z`;

    const subPts: string[] = [];
    const mainPts: string[] = [];
    for (let i = 0; i <= 90; i++) {
      const freq = 20 * Math.pow(1000, i / 90);
      const x = freqToX(freq, rtaW);
      if (subSpeaker) {
        const { magDb } = computeCrossoverResponseDb(freq, subSpeaker);
        const ySub = ((10 - Math.max(-36, Math.min(10, magDb))) / 46) * (rtaH - 16) + 8;
        subPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ySub.toFixed(1)}`);
      }
      if (mainLeftSpeaker) {
        const { magDb } = computeCrossoverResponseDb(freq, mainLeftSpeaker);
        const yMain = ((10 - Math.max(-36, Math.min(10, magDb))) / 46) * (rtaH - 16) + 8;
        mainPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yMain.toFixed(1)}`);
      }
    }

    return {
      rtaFillPath: fill,
      rtaStrokePath: stroke,
      subXoverPath: subPts.join(' '),
      mainXoverPath: mainPts.join(' '),
    };
  }, [spectrum, subSpeaker, mainLeftSpeaker]);

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Top FOH Bridge Header + In-Place Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 truncate">
                FOH Master Console Bridge · {hardwareProfile.name}
              </h1>
              <span
                style={{ color: 'var(--console-accent-text)' }}
                className="text-[10px] font-mono font-semibold uppercase"
              >
                {activeScene?.name ?? 'Live Session'}
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              Graph v{graphVersion} · {activePatchedCount}/{channels.length} Patched · {detectedHardware.length} OS Endpoints ·{' '}
              Short-Term{' '}
              {systemIntelligence.shortTermLufs <= -75
                ? '-∞ LUFS'
                : `${systemIntelligence.shortTermLufs.toFixed(1)} LUFS`}
            </p>
          </div>
        </div>

        {/* In-Place Overview Module Tabs */}
        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'bridge', label: `FOH BRIDGE & ${channels.length}-CH METERS`, icon: Activity },
            { id: 'rta', label: 'RTA SPECTRUM & XOVER', icon: Waves },
            { id: 'matrix', label: `${buses.length}-BUS MATRIX & OUTPUTS`, icon: Speaker },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOverviewTab(t.id as typeof overviewTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  overviewTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action Keys */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ConsoleButton
            label={audioUnlocked ? 'DSP LIVE' : 'ENGAGE AUDIO'}
            size="xs"
            color="emerald"
            active={audioUnlocked}
            onClick={toggleAudioEngine}
          />
          <ConsoleButton
            label="AUTO-EQ ALL"
            size="xs"
            color="amber"
            active={false}
            onClick={() => optimizeAllLiveChannels()}
          />
          <ConsoleButton
            label="TALKBACK"
            size="xs"
            color="cyan"
            active={talkbackActive}
            onClick={toggleTalkback}
          />
          <ConsoleButton
            label="CLR SOLO"
            size="xs"
            color="amber"
            active={channels.some((c) => c.solo)}
            onClick={clearAllSolos}
          />
          <button
            type="button"
            onClick={() => setWorkspace('inputs', 'live-console')}
            className="px-2.5 py-1 rounded console-accent-solid text-[10px] font-mono flex items-center gap-1 whitespace-nowrap"
          >
            <span>MIX CONSOLE</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Autonomous DSP Intelligence Strip */}
      <div className="console-well rounded-md px-3 py-1 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] font-mono shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">SHORT-TERM LUFS</span>
          <span className="text-emerald-300 font-semibold tabular-nums">
            {systemIntelligence.shortTermLufs <= -75
              ? '-∞ LUFS'
              : `${systemIntelligence.shortTermLufs.toFixed(1)} LUFS`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">SPECTRAL TILT</span>
          <span className="text-sky-300 font-semibold tabular-nums">
            {systemIntelligence.spectralTiltDbPerOct.toFixed(1)} dB/oct
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">DUGAN AUTOMIX</span>
          <span className="text-amber-300 font-semibold tabular-nums">
            {systemIntelligence.automixActiveMics} Active Mic
            {systemIntelligence.automixActiveMics === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">MASKING</span>
          <span
            className={`font-semibold tabular-nums ${
              systemIntelligence.maskingPairsCount > 0 ? 'text-rose-300' : 'text-emerald-300'
            }`}
          >
            {systemIntelligence.maskingPairsCount > 0
              ? `${systemIntelligence.maskingPairsCount} Collisions`
              : 'Clear'}
          </span>
        </div>
      </div>

      {/* TAB 1: FOH BRIDGE & 12-CHANNEL METER BRIDGE (Zero Scroll) */}
      {overviewTab === 'bridge' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
          {/* Left 4 Cols: Master Output Desk + Analog VU */}
          <div className="xl:col-span-4 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/[0.06] pb-1.5">
              <span
                style={{ color: 'var(--console-accent-text)' }}
                className="font-semibold uppercase tracking-wider"
              >
                Master Output Bridge
              </span>
              <span className="text-slate-400">
                {mainMeter?.signalPresent ? `${mainMeter.rmsDbfs.toFixed(1)} dBFS` : 'IDLE (-80 dBFS)'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <AnalogVuMeter
                label="MAIN PA L"
                levelDbfs={mainMeter?.rmsDbfs ?? -80}
                peakLed={mainMeter?.clipping}
                compact
              />
              <AnalogVuMeter
                label="MAIN PA R"
                levelDbfs={(mainMeter?.rmsDbfs ?? -80) - 0.3}
                peakLed={mainMeter?.clipping}
                compact
              />
            </div>

            <div className="grid grid-cols-3 gap-2 flex-1 min-h-0 items-center">
              {[mainBus, subBus, streamBus].map((b) => {
                const m = meters[b.id];
                const isMain = b.id === mainBus.id;
                return (
                  <div
                    key={b.id}
                    className="console-well rounded p-2 flex flex-col items-center justify-between gap-1.5 h-full"
                  >
                    <ConsoleButton
                      label={b.mute ? 'MUTE' : `${b.shortName} ON`}
                      size="xs"
                      color={b.mute ? 'crimson' : b.kind === 'broadcast' ? 'cyan' : 'emerald'}
                      active={!b.mute}
                      fullWidth
                      onClick={() => updateBus(b.id, { mute: !b.mute })}
                    />
                    <div className="flex items-center justify-center gap-1.5">
                      <MotorizedFader
                        isMaster={isMain}
                        valueDb={b.faderDb}
                        onChange={(db) => updateBus(b.id, { faderDb: db })}
                        height={138}
                        showScale={false}
                        accentColor={
                          b.kind === 'broadcast' ? 'cyan' : b.kind === 'sub' ? 'emerald' : 'amber'
                        }
                        label={b.shortName}
                      />
                      <LedMeter
                        peakDbfs={m?.peakDbfs ?? -80}
                        peakHoldDbfs={m?.peakHoldDbfs ?? -80}
                        gainReductionDb={m?.gainReductionDb ?? 0}
                        clipping={m?.clipping}
                        height={138}
                        width={8}
                        segments={16}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right 8 Cols: 12-Channel Dual-Row In/Out Meter Bridge (6×2 Grid — Zero Scroll) */}
          <div className="xl:col-span-8 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/[0.06] pb-1.5 shrink-0">
              <span
                style={{ color: 'var(--console-accent-text)' }}
                className="font-semibold uppercase tracking-wider"
              >
                {channels.length}-Channel Dual In/Out Meter Bridge
              </span>
              <span className="text-slate-400">Click any channel OLED to jump straight into Mix Console</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-3 md:grid-cols-6 gap-2 pr-0.5 content-start">
              {channels.map((ch) => {
                const m = meters[ch.id];
                const isPatched = Boolean(ch.sourceBinding?.active);
                return (
                  <div
                    key={ch.id}
                    className="console-panel rounded-md p-2 flex flex-col items-center justify-between gap-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChannelId(ch.id);
                        setWorkspace('inputs', 'live-console');
                      }}
                      className="w-full oled-display rounded px-1.5 py-1 text-left hover:border-amber-400 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                        <span>CH {String(ch.number).padStart(2, '0')}</span>
                        <span className={isPatched ? 'text-emerald-400' : 'text-slate-500'}>
                          {isPatched ? 'LIVE' : 'IDLE'}
                        </span>
                      </div>
                      <div className="text-[10px] font-semibold text-slate-100 truncate">
                        {ch.shortName}
                      </div>
                    </button>

                    <div className="flex items-center justify-center gap-2">
                      <LedMeter
                        peakDbfs={m?.inputPeakDbfs ?? -80}
                        height={66}
                        width={7}
                        segments={12}
                        label="IN"
                      />
                      <LedMeter
                        peakDbfs={m?.peakDbfs ?? -80}
                        peakHoldDbfs={m?.peakHoldDbfs ?? -80}
                        gainReductionDb={m?.gainReductionDb ?? 0}
                        clipping={m?.clipping}
                        height={66}
                        width={8}
                        segments={12}
                        label="OUT"
                      />
                    </div>

                    <div className="w-full grid grid-cols-2 gap-1">
                      <ConsoleButton
                        label="M"
                        size="xs"
                        color="crimson"
                        active={ch.mute}
                        onClick={() => updateChannel(ch.id, { mute: !ch.mute })}
                      />
                      <ConsoleButton
                        label="S"
                        size="xs"
                        color="amber"
                        active={ch.solo}
                        onClick={() => updateChannel(ch.id, { solo: !ch.solo })}
                      />
                    </div>

                    <div className="w-full flex items-center justify-between text-[8px] font-mono">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedChannelId(ch.id);
                          setWorkspace('processing', 'dsp-eq');
                        }}
                        className={ch.eqEnabled ? 'text-amber-300 hover:underline' : 'text-slate-500'}
                      >
                        EQ
                      </button>
                      <button
                        type="button"
                        onClick={() => openSignalJourney(ch.id)}
                        className="text-sky-400 hover:text-sky-300 flex items-center gap-0.5"
                      >
                        <GitBranch className="w-2.5 h-2.5" />
                        <span>Trace</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 64-BAND LOG RTA SPECTRUM + ACTIVE CROSSOVER + GAUGES */}
      {overviewTab === 'rta' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="xl:col-span-8 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono shrink-0">
              <span className="text-sky-300 font-semibold uppercase tracking-wider">
                64-Band Log RTA &amp; Active System Crossover Overlay
              </span>
              <div className="flex items-center gap-3 text-[9px]">
                <span className="text-sky-300">■ Program RTA</span>
                <span className="text-violet-300">
                  — CH1 Sub LPF {subSpeaker?.lpfHz ?? 90}Hz
                  {subSpeaker?.subBoostEnabled ? ` (+${subSpeaker.subBoostGainDb ?? 0}dB)` : ''}
                </span>
                <span className="text-amber-300">— CH2 Mains HPF {mainLeftSpeaker?.hpfHz ?? 90}Hz</span>
              </div>
            </div>

            <div className="dark-instrument-scope rounded-md p-2.5 flex-1 min-h-0 flex flex-col justify-center">
              <svg viewBox={`0 0 ${rtaW} ${rtaH}`} className="w-full h-full max-h-[340px] select-none">
                {[30, 60, 90, 120, 250, 500, 1000, 2000, 5000, 10000].map((hz) => {
                  const x = freqToX(hz, rtaW);
                  return (
                    <g key={hz}>
                      <line
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={rtaH - 12}
                        stroke="rgba(148,163,184,0.14)"
                        strokeWidth="1"
                      />
                      <text x={x + 2} y={rtaH - 2} fill="#64748b" fontSize="8" fontFamily="JetBrains Mono">
                        {hz >= 1000 ? `${hz / 1000}k` : hz}
                      </text>
                    </g>
                  );
                })}
                {[0.25, 0.5, 0.75].map((frac) => (
                  <line
                    key={frac}
                    x1={0}
                    y1={rtaH * frac}
                    x2={rtaW}
                    y2={rtaH * frac}
                    stroke="rgba(148,163,184,0.1)"
                    strokeWidth="1"
                  />
                ))}
                <path d={rtaFillPath} fill="rgba(56, 189, 248, 0.22)" />
                <path d={rtaStrokePath} fill="none" stroke="#38bdf8" strokeWidth="1.8" />
                {subXoverPath && (
                  <path
                    d={subXoverPath}
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="2.1"
                    strokeDasharray="4 2"
                  />
                )}
                {mainXoverPath && (
                  <path d={mainXoverPath} fill="none" stroke="#f59e0b" strokeWidth="2.1" />
                )}
              </svg>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono shrink-0">
              <button
                type="button"
                onClick={() => setWorkspace('processing', 'dsp-eq')}
                className="text-sky-400 hover:underline flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Open 31-Band EQ Rack →</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspace('routing', 'speaker-management')}
                className="text-amber-300 hover:underline flex items-center gap-1"
              >
                <Speaker className="w-3 h-3" />
                <span>Open Speaker Crossover DSP →</span>
              </button>
            </div>
          </div>

          <div className="xl:col-span-4 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
            <div className="text-[10px] font-mono text-amber-300 font-semibold uppercase tracking-wider border-b border-white/10 pb-1.5">
              Acoustic Headroom &amp; DSP Engine Dials
            </div>
            <div className="console-well rounded p-3 grid grid-cols-2 gap-3 flex-1 items-center">
              <ArcGauge value={cpuDspLoadPct} min={0} max={100} label="DSP ENGINE" unit="%" accent="emerald" size={88} />
              <ArcGauge
                value={measuredLatencyMs}
                min={0}
                max={25}
                label="RTL LATENCY"
                unit="ms"
                accent="cyan"
                size={88}
                formatValue={(v) => `${v.toFixed(1)}ms`}
              />
              <ArcGauge
                value={headroomDb}
                min={0}
                max={24}
                label="HEADROOM"
                unit="dB"
                accent="amber"
                size={88}
                formatValue={(v) => `${v.toFixed(0)}dB`}
              />
              <ArcGauge value={ringRiskPct} min={0} max={100} label="RING RISK" unit="%" size={88} />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 6-BUS MATRIX & SPEAKER ZONE PROTECTION */}
      {overviewTab === 'matrix' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="xl:col-span-7 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="text-[11px] font-mono font-semibold text-amber-300 uppercase">
                {buses.length}-Bus Master Output Matrix
              </span>
              <span className="text-[10px] font-mono text-slate-400">Live Bus Faders &amp; Mutes</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-3 sm:grid-cols-6 gap-2 pr-0.5">
              {buses.map((b) => {
                const bm = meters[b.id];
                return (
                  <div
                    key={b.id}
                    className="console-panel rounded p-2 flex flex-col items-center justify-between gap-1.5"
                  >
                    <span className="text-[10px] font-mono font-semibold text-slate-100 truncate w-full text-center">
                      {b.shortName}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <MotorizedFader
                        valueDb={b.faderDb}
                        onChange={(db) => updateBus(b.id, { faderDb: db })}
                        height={155}
                        showScale={false}
                        accentColor={b.kind === 'broadcast' ? 'cyan' : 'emerald'}
                      />
                      <LedMeter
                        peakDbfs={bm?.peakDbfs ?? -80}
                        peakHoldDbfs={bm?.peakHoldDbfs ?? -80}
                        height={155}
                        width={8}
                        segments={14}
                      />
                    </div>
                    <ConsoleButton
                      label={b.mute ? 'MUTE' : 'ON'}
                      size="xs"
                      color={b.mute ? 'crimson' : 'emerald'}
                      active={!b.mute}
                      fullWidth
                      onClick={() => updateBus(b.id, { mute: !b.mute })}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="xl:col-span-5 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="text-[11px] font-mono font-semibold text-sky-300 uppercase">
                Speaker Zone Crossover &amp; Protection Rack
              </span>
              <button
                type="button"
                onClick={() => setWorkspace('routing', 'speaker-management')}
                className="text-[10px] font-mono text-sky-400 hover:underline"
              >
                Tune Zones →
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
              {speakers.map((spk) => {
                const bm = meters[spk.sourceBusId];
                return (
                  <button
                    key={spk.id}
                    type="button"
                    onClick={() => setWorkspace('routing', 'speaker-management')}
                    className="w-full console-btn-surface rounded px-3 py-2 flex items-center justify-between gap-2 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100 truncate">{spk.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {spk.hpfHz}–{spk.lpfHz >= 1000 ? `${(spk.lpfHz / 1000).toFixed(1)}k` : spk.lpfHz}Hz ·{' '}
                        {spk.delayMs.toFixed(1)}ms
                        {spk.subBoostEnabled ? ` · +${spk.subBoostGainDb}dB Sub` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <LedMeter
                        peakDbfs={(bm?.peakDbfs ?? -80) + spk.gainDb}
                        height={24}
                        width={6}
                        segments={6}
                      />
                      <span
                        className={`text-[9px] font-mono font-bold ${
                          spk.mute ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {spk.mute ? 'MUTE' : 'LIVE'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-white/[0.06] text-[10px] font-mono">
              {hardwareProfile.devices.slice(0, 2).map((dev) => (
                <span
                  key={dev.id}
                  className="px-2 py-0.5 rounded console-well text-slate-300 flex items-center gap-1 truncate max-w-[200px]"
                >
                  {dev.capabilities.preampGain === 'manual' && (
                    <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate">{dev.name}</span>
                </span>
              ))}
              <button
                type="button"
                onClick={() => openSourceBay()}
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 ml-auto"
              >
                <Radio className="w-3 h-3" />
                <span>Patch I/O</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
