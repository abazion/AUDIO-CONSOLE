import React, { useMemo, useState } from 'react';
import { GitBranch, Lock, Mic, Sliders } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { LedMeter } from '../hardware/LedMeter';
import { MotorizedFader } from '../hardware/MotorizedFader';
import { ArcGauge } from '../hardware/ArcGauge';
import { HorizontalSlider } from '../hardware/HorizontalSlider';

const STAGE_COORDS: Record<string, { x: number; y: number; zone: string }> = {
  'ch-01': { x: 280, y: 125, zone: 'Center Pulpit' },
  'ch-02': { x: 215, y: 112, zone: 'Stage Left Vocal' },
  'ch-03': { x: 345, y: 112, zone: 'Stage Right Vocal' },
  'ch-09': { x: 165, y: 74, zone: 'Drum Overhead L' },
  'ch-10': { x: 395, y: 74, zone: 'Drum Overhead R' },
  'ch-11': { x: 280, y: 66, zone: 'Choir Loft Center' },
};

export const MicIntelligenceWorkspace: React.FC = () => {
  const {
    channels,
    meters,
    spectrum,
    hardwareProfile,
    selectedChannelId,
    setSelectedChannelId,
    updateChannel,
    openSignalJourney,
    setWorkspace,
    recallScene,
    feedbackIncidents,
  } = useAudioConsole();

  const rawMics = channels.filter(
    (c) => c.category === 'pulpit' || c.category === 'vocal' || c.category === 'choir' || c.category === 'drums'
  );
  const micChannels = rawMics.length > 0 ? rawMics : channels;

  const activeMic = micChannels.find((c) => c.id === selectedChannelId) ?? micChannels[0];
  const activeMeter = meters[activeMic.id];
  const [micTab, setMicTab] = useState<'stage' | 'strips'>('stage');
  const [proximityCompDb, setProximityCompDb] = useState<number>(-2.5);

  const primaryCaps = hardwareProfile.devices[0]?.capabilities;
  const isManualPre = primaryCaps?.preampGain === 'manual';
  const isManual48 = primaryCaps?.phantomPower === 'manual';

  const voicePresent = (activeMeter?.rmsDbfs ?? -80) > -42 && !activeMic.mute;
  const micRiskScore = useMemo(() => {
    const incident = feedbackIncidents.find(
      (f) => f.channelId === activeMic.id && (f.status === 'feedback_detected' || f.status === 'risk_predicted')
    );
    if (incident) return 78;
    const peak = activeMeter?.peakDbfs ?? -80;
    if (peak <= -60) return 0;
    return Math.min(92, Math.max(8, Math.round((peak + 60) * 1.15)));
  }, [activeMic.id, activeMeter?.peakDbfs, feedbackIncidents]);

  const muteAllMics = () => {
    micChannels.forEach((m) => {
      if (!m.mute) updateChannel(m.id, { mute: true }, 'Muted via Mic Console Mute All');
    });
  };

  const clearAllSolos = () => {
    channels.forEach((c) => {
      if (c.solo) updateChannel(c.id, { solo: false });
    });
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Top Mic Intelligence Header + Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100">
              Microphone Placement &amp; Capsule Intelligence
            </h1>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'stage', label: 'STAGE MATRIX & ANALYTICS', icon: Mic },
            { id: 'strips', label: 'MIC PREAMP STRIPS (6-UP)', icon: Sliders },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMicTab(t.id as typeof micTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  micTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <ConsoleButton label="MUTE ALL" size="xs" color="crimson" active={false} onClick={muteAllMics} />
          <ConsoleButton
            label="CLR SOLO"
            size="xs"
            color="amber"
            active={channels.some((c) => c.solo)}
            onClick={clearAllSolos}
          />
          <ConsoleButton label="WORSHIP" size="xs" color="emerald" active={false} onClick={() => recallScene('scn-sunday')} />
          <ConsoleButton label="PREACH" size="xs" color="cyan" active={false} onClick={() => recallScene('scn-sermon')} />
        </div>
      </div>

      {/* TAB 1: STAGE PLACEMENT MAP + MICROPHONE ANALYTICS */}
      {micTab === 'stage' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="xl:col-span-7 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/10 pb-1.5">
              <span className="text-slate-300">Click stage node to inspect capsule health &amp; RF telemetry</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Healthy
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Ring Risk
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Muted/Clip
                </span>
              </div>
            </div>

            <div className="dark-instrument-scope rounded-md p-2 flex-1 min-h-0 flex items-center">
              <svg viewBox="0 0 560 245" className="w-full h-full max-h-[290px] select-none">
                <defs>
                  <radialGradient id="stageGlow" cx="50%" cy="35%" r="55%">
                    <stop offset="0%" stopColor="rgba(56,189,248,0.14)" />
                    <stop offset="100%" stopColor="rgba(9,12,18,0)" />
                  </radialGradient>
                </defs>
                <rect x="0" y="0" width="560" height="245" fill="url(#stageGlow)" />
                <polygon points="90,34 470,34 510,148 50,148" fill="#111824" stroke="rgba(56,189,248,0.28)" strokeWidth="1.5" />
                <polygon points="50,148 510,148 510,156 50,156" fill="#1e293b" />
                <text x="280" y="50" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="JetBrains Mono" letterSpacing="3">
                  SANCTUARY STAGE
                </text>
                <rect x="262" y="112" width="36" height="20" rx="3" fill="#1f2937" stroke="#f59e0b" strokeWidth="1" />
                <text x="280" y="143" textAnchor="middle" fill="#fbbf24" fontSize="8" fontFamily="JetBrains Mono">
                  PULPIT
                </text>
                {[178, 198, 218].map((ry, idx) => (
                  <path
                    key={ry}
                    d={`M ${95 - idx * 14} ${ry} Q 280 ${ry + 18} ${465 + idx * 14} ${ry}`}
                    fill="none"
                    stroke="rgba(148,163,184,0.2)"
                    strokeWidth="6"
                    strokeDasharray="10 6"
                  />
                ))}
                <text x="280" y="236" textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono" letterSpacing="2">
                  CONGREGATION / FOH MIX POSITION
                </text>

                {micChannels.map((ch, idx) => {
                  const pos = STAGE_COORDS[ch.id] ?? {
                    x: 115 + ((idx * 68) % 330),
                    y: 78 + ((idx * 19) % 44),
                    zone: ch.shortName,
                  };
                  const m = meters[ch.id];
                  const hasRisk = feedbackIncidents.some(
                    (f) => f.channelId === ch.id && f.status !== 'dismissed' && f.status !== 'suppression_applied_verified'
                  );
                  const isSel = ch.id === activeMic.id;
                  const nodeColor = ch.mute || m?.clipping ? '#f43f5e' : hasRisk ? '#f59e0b' : '#10b981';

                  return (
                    <g key={ch.id} onClick={() => setSelectedChannelId(ch.id)} className="cursor-pointer">
                      <circle cx={pos.x} cy={pos.y} r={isSel ? 22 : 16} fill={nodeColor} fillOpacity={isSel ? 0.22 : 0.12} stroke={nodeColor} strokeWidth={isSel ? 2 : 1} />
                      <circle cx={pos.x} cy={pos.y} r={9} fill="#090c12" stroke={nodeColor} strokeWidth="2" />
                      <text x={pos.x} y={pos.y + 3} textAnchor="middle" fill="#f8fafc" fontSize="8" fontFamily="JetBrains Mono" fontWeight="bold">
                        {String(ch.number).padStart(2, '0')}
                      </text>
                      <text x={pos.x} y={pos.y - 16} textAnchor="middle" fill="#cbd5e1" fontSize="8.5" fontFamily="JetBrains Mono">
                        {ch.shortName}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 shrink-0">
              {micChannels.slice(0, 6).map((ch) => {
                const m = meters[ch.id];
                const isSel = ch.id === activeMic.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedChannelId(ch.id)}
                    className={`rounded px-2 py-1.5 text-left border transition-all ${
                      isSel ? 'console-accent-active' : 'console-btn-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[9px] font-mono">
                      <span className="text-amber-300 font-semibold truncate">{ch.shortName}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${ch.mute ? 'bg-rose-500' : m?.signalPresent ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-slate-200">
                      {m?.signalPresent ? `${m.peakDbfs.toFixed(1)}dB` : '-80dB'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="xl:col-span-5 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <div>
                <div className="text-xs font-mono text-amber-300 uppercase">
                  CH {String(activeMic.number).padStart(2, '0')} · {activeMic.name}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {activeMic.micOrDiModel} · {activeMic.physicalPort}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openSignalJourney(activeMic.id)}
                  className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 flex items-center gap-1"
                >
                  <GitBranch className="w-3 h-3" />
                  <span>Trace</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMicTab('strips')}
                  className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-amber-300"
                >
                  Preamp Strips →
                </button>
              </div>
            </div>

            <div className="oled-display rounded p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-sky-300">VOICE PRESENCE DETECTION</span>
                <span className={voicePresent ? 'text-emerald-400' : 'text-slate-500'}>
                  {voicePresent ? '● VOICE DETECTED' : '○ NOISE FLOOR'}
                </span>
              </div>
              <div className="h-14 flex items-center gap-[2px]">
                {spectrum.slice(4, 36).map((val, i) => {
                  const amp = Math.max(8, Math.min(100, ((val + 70) / 62) * 100));
                  return (
                    <div key={i} className="flex-1 flex items-center justify-center h-full">
                      <div style={{ height: `${amp}%` }} className={`w-full rounded-full ${voicePresent ? 'bg-sky-400/85' : 'bg-slate-600/50'}`} />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2.5 items-center console-panel rounded p-2.5 flex-1">
              <div className="col-span-5 flex justify-center border-r border-white/10 pr-2">
                <ArcGauge
                  value={micRiskScore}
                  min={0}
                  max={100}
                  label="FEEDBACK RISK"
                  unit="%"
                  subLabel={micRiskScore > 65 ? 'HIGH' : 'NOMINAL'}
                  size={92}
                />
              </div>
              <div className="col-span-7 space-y-2.5 pl-1">
                <HorizontalSlider
                  label="PROXIMITY LOW CUT"
                  value={proximityCompDb}
                  min={-9}
                  max={3}
                  step={0.5}
                  bipolar
                  unit="dB"
                  accentColor="cyan"
                  onChange={(v) => {
                    setProximityCompDb(v);
                    const nextBands = activeMic.eqBands.map((b, i) => (i === 0 ? { ...b, gainDb: v } : b));
                    updateChannel(activeMic.id, { eqEnabled: true, eqBands: nextBands });
                  }}
                />
                <div className="oled-display rounded p-2 space-y-1 text-[10px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">INPUT STATE</span>
                    <span className={activeMic.sourceBinding?.active ? 'text-emerald-400' : 'text-slate-500'}>
                      {activeMic.sourceBinding?.active
                        ? `LIVE (${((activeMic.sourceBinding.sampleRateHz ?? 48000) / 1000).toFixed(1)}kHz)`
                        : 'UNPATCHED'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">PEAK HOLD</span>
                    <span className="text-sky-300 tabular-nums">
                      {(activeMeter?.peakHoldDbfs ?? -80).toFixed(1)} dBFS
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">NOISE FLOOR</span>
                    <span className="text-amber-300 tabular-nums">
                      {(activeMeter?.noiseFloorDbfs ?? -80).toFixed(1)} dBFS
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 6-UP MIC PREAMP & FADER STRIPS (Zero Horizontal/Vertical Scroll) */}
      {micTab === 'strips' && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/10 pb-1.5 shrink-0">
            <span className="text-amber-300 font-semibold uppercase">
              Physical Microphone Preamp, +48V, HPF &amp; Fader Bank
            </span>
            {isManualPre && (
              <span className="text-amber-300/90 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Hardware Preamp Pots &amp; +48V manual-only; SW Trim &amp; HPF live</span>
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {micChannels.slice(0, 6).map((ch) => {
              const m = meters[ch.id];
              const isSel = ch.id === activeMic.id;
              return (
                <div
                  key={ch.id}
                  onClick={() => setSelectedChannelId(ch.id)}
                  className={`rounded-md p-2 flex flex-col items-center justify-between gap-1.5 border cursor-pointer transition-colors ${
                    isSel ? 'console-selected-strip' : 'console-unselected-strip'
                  }`}
                >
                  <div className="w-full oled-display rounded px-2 py-1 text-center">
                    <div className="text-[9px] font-mono text-amber-300">MIC {String(ch.number).padStart(2, '0')}</div>
                    <div className="text-[10px] font-semibold text-slate-100 truncate">{ch.shortName}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <RotaryKnob
                      label={isManualPre ? 'DESK' : 'GAIN'}
                      value={ch.hardwarePreampDb}
                      min={0}
                      max={60}
                      step={1}
                      unit="dB"
                      size={32}
                      accentColor="rose"
                      manualOnlyReason={isManualPre ? 'Manual analog preamp knob' : undefined}
                      onChange={(v) => updateChannel(ch.id, { hardwarePreampDb: v })}
                    />
                    <RotaryKnob
                      label="TRIM"
                      value={ch.softwareTrimDb}
                      min={-18}
                      max={18}
                      step={0.5}
                      bipolar
                      unit="dB"
                      size={32}
                      accentColor="cyan"
                      onChange={(v) => updateChannel(ch.id, { softwareTrimDb: v })}
                    />
                  </div>

                  <div className="w-full grid grid-cols-2 gap-1">
                    <ConsoleButton
                      label="+48V"
                      size="xs"
                      color="crimson"
                      active={ch.phantom48v}
                      manualOnlyReason={isManual48 ? 'Manual desk +48V button' : undefined}
                      onClick={() => updateChannel(ch.id, { phantom48v: !ch.phantom48v })}
                    />
                    <ConsoleButton
                      label="HPF"
                      size="xs"
                      color="amber"
                      active={ch.hpfEnabled}
                      onClick={() => updateChannel(ch.id, { hpfEnabled: !ch.hpfEnabled })}
                    />
                    <ConsoleButton
                      label="MUTE"
                      size="xs"
                      color="crimson"
                      active={ch.mute}
                      onClick={() => updateChannel(ch.id, { mute: !ch.mute })}
                    />
                    <ConsoleButton
                      label="SOLO"
                      size="xs"
                      color="amber"
                      active={ch.solo}
                      onClick={() => updateChannel(ch.id, { solo: !ch.solo })}
                    />
                  </div>

                  <div className="flex items-start gap-1">
                    <MotorizedFader
                      valueDb={ch.faderDb}
                      onChange={(db) => updateChannel(ch.id, { faderDb: db })}
                      height={128}
                      accentColor="amber"
                    />
                    <LedMeter
                      peakDbfs={m?.peakDbfs ?? -80}
                      peakHoldDbfs={m?.peakHoldDbfs ?? -80}
                      clipping={m?.clipping}
                      height={128}
                      width={8}
                      segments={14}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedChannelId(ch.id);
                      setWorkspace('processing', 'dsp-eq');
                    }}
                    className="w-full py-1 rounded console-btn-surface text-[9px] font-mono text-sky-300"
                  >
                    31-BAND EQ
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
