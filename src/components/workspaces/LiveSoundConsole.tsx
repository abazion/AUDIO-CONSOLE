import React, { useMemo, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Copy,
  Gauge,
  GitBranch,
  Lock,
  Maximize2,
  Minimize2,
  Plus,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Speaker,
  Trash2,
  Waves,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { getRecommendedEqPresetsForChannel } from '../../engine/profiles';
import {
  computeChannelEqResponseDb,
  computeCrossoverResponseDb,
} from '../../engine/webAudioEngine';
import { MotorizedFader } from '../hardware/MotorizedFader';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { LedMeter, AnalogVuMeter, DualChannelVuBridge } from '../hardware/LedMeter';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { ScribbleStrip } from '../hardware/ScribbleStrip';
import { GraphicEq31Band } from '../hardware/GraphicEq31Band';
import { HorizontalSlider } from '../hardware/HorizontalSlider';
import { ChannelAutomationLanes } from '../hardware/ChannelAutomationLanes';
import type {
  ChannelStrip,
  CrossoverFamily,
  DcaGroupId,
  SoloMode,
  SourceCategory,
} from '../../engine/types';

const SPK_COLORS = ['#a78bfa', '#f59e0b', '#38bdf8', '#10b981', '#f43f5e'];

const SelectedChannelEqCurve: React.FC<{
  channel: ChannelStrip;
  compact?: boolean;
  bypassed?: boolean;
}> = ({
  channel,
  compact = false,
  bypassed = false,
}) => {
  const path = useMemo(() => {
    const w = 320;
    const h = 84;
    const pts: string[] = [];
    for (let i = 0; i <= 72; i++) {
      const freq = 20 * Math.pow(1000, i / 72);
      const db = computeChannelEqResponseDb(
        freq,
        channel.hpfEnabled,
        channel.hpfFreqHz,
        channel.eqEnabled,
        channel.eqBands,
        channel.geqEnabled,
        channel.geqBands
      );
      const x = (i / 72) * w;
      const y = ((15 - Math.max(-15, Math.min(15, db))) / 30) * h;
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [
    channel.hpfEnabled,
    channel.hpfFreqHz,
    channel.eqEnabled,
    channel.eqBands,
    channel.geqEnabled,
    channel.geqBands,
  ]);

  return (
    <div className="w-full dark-instrument-scope rounded-md px-2 py-1.5">
      <svg viewBox="0 0 320 84" className={`w-full ${compact ? 'h-16' : 'h-20'}`}>
        {[40, 80, 120, 160, 200, 240, 280].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="84" stroke="rgba(148,163,184,0.1)" strokeWidth="0.7" />
        ))}
        <line x1="0" y1="21" x2="320" y2="21" stroke="rgba(148,163,184,0.1)" strokeWidth="0.7" />
        <line x1="0" y1="42" x2="320" y2="42" stroke="rgba(255,255,255,0.22)" strokeWidth="0.9" />
        <line x1="0" y1="63" x2="320" y2="63" stroke="rgba(148,163,184,0.1)" strokeWidth="0.7" />
        <path
          d={path}
          fill="none"
          stroke={!bypassed && (channel.eqEnabled || channel.geqEnabled) ? '#f59e0b' : '#64748b'}
          strokeDasharray={bypassed ? '4 3' : undefined}
          strokeWidth="2.4"
        />
      </svg>
      <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 mt-0.5">
        <span>20Hz</span>
        <span>100Hz</span>
        {bypassed ? (
          <span className="text-amber-300 font-semibold">GLOBAL A/B BYPASS</span>
        ) : (
          <span>500Hz · 1kHz</span>
        )}
        <span>4kHz</span>
        <span>20kHz</span>
      </div>
    </div>
  );
};

export const LiveSoundConsole: React.FC = () => {
  const {
    channels,
    buses,
    speakers,
    meters,
    hardwareProfile,
    selectedChannelId,
    setSelectedChannelId,
    updateChannel,
    updateChannelSend,
    updateBus,
    updateSpeaker,
    addChannel,
    removeChannel,
    resetPeakHold,
    openSignalJourney,
    openSourceBay,
    openGainStagingAssistant,
    intelligenceConfig,
    setIntelligenceConfig,
    systemIntelligence,
    autoCalibrateChannel,
    globalDspBypass,
    dcaGroups,
    updateDcaGroup,
    activeDcaSpill,
    setActiveDcaSpill,
    soloMode,
    setSoloMode,
    clearAllSolos,
    fxRack,
    updateFxSlot,
    matrixZones,
    updateMatrixZone,
    updateMatrixZoneSource,
    operatorRole,
  } = useAudioConsole();

  const isVolunteer = operatorRole === 'volunteer';
  const volunteerLockReason = isVolunteer ? 'Locked for Volunteer role (switch to FOH / Sys Tech)' : undefined;

  const [consoleModule, setConsoleModule] = useState<
    'desk' | 'eq31' | 'crossover' | 'dynamics' | 'fxrack' | 'matrix'
  >('desk');
  const [focusTab, setFocusTab] = useState<'eq' | 'crossover' | 'preamp'>('eq');
  const [bankFilter, setBankFilter] = useState<'all' | 'vox' | 'band' | 'drums-choir'>('all');
  const [bankSize, setBankSize] = useState<6 | 8 | 12 | 16 | 'all'>(6);
  const [bankPageIdx, setBankPageIdx] = useState<number>(0);
  const [expandedStripIds, setExpandedStripIds] = useState<Record<string, boolean>>({});
  const [expandAllStrips, setExpandAllStrips] = useState<boolean>(false);
  const [showAutomationLanes, setShowAutomationLanes] = useState<boolean>(true);
  const [addInputOpen, setAddInputOpen] = useState<boolean>(false);
  const [newInputName, setNewInputName] = useState<string>('');
  const [newInputCat, setNewInputCat] = useState<SourceCategory>('media');
  const [sendMode, setSendMode] = useState<'mix' | 'mon1' | 'mon2' | 'livestream'>('mix');
  const [secondChannelId, setSecondChannelId] = useState<string>(channels[1]?.id ?? channels[0].id);
  const [selectedSpkId, setSelectedSpkId] = useState<string>(speakers[0]?.id ?? 'spk-sub');
  const [activeQuickPresetByChannel, setActiveQuickPresetByChannel] = useState<
    Record<string, string | null>
  >({});
  const [hardwareNotice, setHardwareNotice] = useState<string | null>(null);

  const primaryCaps = hardwareProfile.devices[0]?.capabilities;
  const isManualPreamp = primaryCaps?.preampGain === 'manual';
  const isManualPhantom = primaryCaps?.phantomPower === 'manual';

  const dcaFilteredChannels = useMemo(() => {
    if (!activeDcaSpill) return channels;
    return channels.filter((ch) => ch.dcaGroup === activeDcaSpill);
  }, [channels, activeDcaSpill]);

  const effectiveBankSize = bankSize === 'all' ? Math.max(1, dcaFilteredChannels.length) : bankSize;
  const totalPages = Math.max(1, Math.ceil(dcaFilteredChannels.length / effectiveBankSize));
  const safePageIdx = Math.min(bankPageIdx, totalPages - 1);

  // Dynamic 6/8/12/16/ALL paged channel view supporting DCA Spill & unlimited channels
  const visibleChannels = useMemo(() => {
    const base = dcaFilteredChannels;
    if (bankFilter === 'all') {
      const start = safePageIdx * effectiveBankSize;
      return base.slice(start, start + effectiveBankSize);
    }
    if (bankFilter === 'vox')
      return base.filter((ch) => ch.category === 'pulpit' || ch.category === 'vocal').slice(0, effectiveBankSize);
    if (bankFilter === 'band')
      return base
        .filter(
          (ch) =>
            ch.category === 'acoustic' ||
            ch.category === 'electric' ||
            ch.category === 'bass' ||
            ch.category === 'keys'
        )
        .slice(0, effectiveBankSize);
    return base
      .filter((ch) => ch.category === 'drums' || ch.category === 'choir' || ch.category === 'media')
      .slice(0, effectiveBankSize);
  }, [dcaFilteredChannels, bankFilter, safePageIdx, effectiveBankSize]);

  const toggleStripExpanded = (channelId: string) => {
    setExpandedStripIds((prev) => ({
      ...prev,
      [channelId]: !(prev[channelId] ?? expandAllStrips),
    }));
  };

  const toggleAllExpanded = () => {
    const next = !expandAllStrips;
    setExpandAllStrips(next);
    const map: Record<string, boolean> = {};
    channels.forEach((c) => {
      map[c.id] = next;
    });
    setExpandedStripIds(map);
  };

  const handleCreateInputChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const created = addChannel(newInputName.trim() || undefined, newInputCat);
    setNewInputName('');
    setAddInputOpen(false);
    setActiveDcaSpill(null);
    setBankFilter('all');
    const newPage = Math.floor(channels.length / effectiveBankSize);
    setBankPageIdx(newPage);
    setSelectedChannelId(created.id);
  };

  const selectedIndex = Math.max(0, channels.findIndex((c) => c.id === selectedChannelId));
  const selectedChannel = channels[selectedIndex] ?? channels[0];
  const partnerChannel =
    channels.find((c) => c.id === secondChannelId && c.id !== selectedChannel.id) ??
    channels[(selectedIndex + 1) % channels.length];
  const selectedMeter = meters[selectedChannel.id];
  const selectedInsight = systemIntelligence.channelInsights[selectedChannel.id];

  const recommendation = useMemo(
    () => getRecommendedEqPresetsForChannel(selectedChannel),
    [selectedChannel]
  );
  const activeQuickPresetId = activeQuickPresetByChannel[selectedChannel.id] ?? null;
  const isRecommendedActive = activeQuickPresetId === recommendation.primary.id;

  const toggleRecommendedPreset = () => {
    const p = recommendation.primary;
    if (isRecommendedActive) {
      setActiveQuickPresetByChannel((prev) => ({ ...prev, [selectedChannel.id]: null }));
      updateChannel(
        selectedChannel.id,
        {
          eqBands: selectedChannel.eqBands.map((b) => ({ ...b, gainDb: 0 })),
          geqBands: new Array(31).fill(0),
        },
        `Toggled Quick-Load off (${p.name})`
      );
      return;
    }

    const nextGeq = new Array(31).fill(0);
    Object.entries(p.geqOffsets).forEach(([idxStr, val]) => {
      nextGeq[Number(idxStr)] = val;
    });
    const nextPara = selectedChannel.eqBands.map((b, idx) => ({
      ...b,
      enabled: true,
      freqHz: p.eqBands[idx]?.freqHz ?? b.freqHz,
      gainDb: p.eqBands[idx]?.gainDb ?? 0,
      q: p.eqBands[idx]?.q ?? b.q,
    }));

    setActiveQuickPresetByChannel((prev) => ({ ...prev, [selectedChannel.id]: p.id }));
    updateChannel(
      selectedChannel.id,
      {
        hpfEnabled: p.hpfEnabled,
        hpfFreqHz: p.hpfFreqHz,
        eqEnabled: true,
        eqBands: nextPara,
        geqEnabled: true,
        geqBands: nextGeq,
      },
      `Quick-Loaded EQ curve: ${p.name}`
    );
  };

  const copyEqToSecondChannel = () => {
    updateChannel(
      partnerChannel.id,
      {
        hpfEnabled: selectedChannel.hpfEnabled,
        hpfFreqHz: selectedChannel.hpfFreqHz,
        eqEnabled: selectedChannel.eqEnabled,
        eqBands: selectedChannel.eqBands.map((b) => ({ ...b })),
        geqEnabled: selectedChannel.geqEnabled,
        geqBands: [...selectedChannel.geqBands],
      },
      `Copied EQ & HPF from CH ${selectedChannel.number} to 2nd CH (${partnerChannel.shortName})`
    );
  };

  const mainBus = buses.find((b) => b.id === 'bus-main')!;
  const subBus = buses.find((b) => b.id === 'bus-sub')!;
  const streamBus = buses.find((b) => b.id === 'bus-stream')!;
  const mainMeter = meters[mainBus.id];

  const subSpeaker = speakers.find((s) => s.role === 'Subwoofer') ?? speakers[0];
  const mainLeftSpeaker = speakers.find((s) => s.id === 'spk-main-l') ?? speakers[1];
  const mainRightSpeaker = speakers.find((s) => s.id === 'spk-main-r') ?? speakers[2];
  const selectedSpk = speakers.find((s) => s.id === selectedSpkId) ?? speakers[0];
  const systemXoverFreq = subSpeaker?.lpfHz ?? mainLeftSpeaker?.hpfHz ?? 90;

  const setSyncedCrossoverHz = (hz: number) => {
    if (subSpeaker) {
      updateSpeaker(subSpeaker.id, { lpfHz: hz }, `Set active crossover ${hz} Hz`);
    }
    if (mainLeftSpeaker) {
      updateSpeaker(mainLeftSpeaker.id, { hpfHz: hz });
    }
    if (mainRightSpeaker) {
      updateSpeaker(mainRightSpeaker.id, { hpfHz: hz });
    }
  };

  const { miniSubPath, miniMainPath, fullXoverCurves } = useMemo(() => {
    const miniW = 240;
    const miniH = 62;
    const fToX = (f: number, w: number) =>
      ((Math.log10(Math.max(20, Math.min(20000, f))) - Math.log10(20)) / 3) * w;
    const dbToY = (db: number, h: number) => ((10 - Math.max(-36, Math.min(10, db))) / 46) * h;

    const subPts: string[] = [];
    const mainPts: string[] = [];
    for (let i = 0; i <= 70; i++) {
      const freq = 20 * Math.pow(1000, i / 70);
      const x = fToX(freq, miniW);
      if (subSpeaker) {
        const { magDb } = computeCrossoverResponseDb(freq, subSpeaker);
        subPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${dbToY(magDb, miniH).toFixed(1)}`);
      }
      if (mainLeftSpeaker) {
        const { magDb } = computeCrossoverResponseDb(freq, mainLeftSpeaker);
        mainPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${dbToY(magDb, miniH).toFixed(1)}`);
      }
    }

    const rackW = 680;
    const rackH = 190;
    const curves = speakers.map((spk, idx) => {
      const pts: string[] = [];
      for (let i = 0; i <= 100; i++) {
        const freq = 20 * Math.pow(1000, i / 100);
        const { magDb } = computeCrossoverResponseDb(freq, spk);
        pts.push(
          `${i === 0 ? 'M' : 'L'} ${fToX(freq, rackW).toFixed(1)} ${dbToY(magDb, rackH).toFixed(1)}`
        );
      }
      return { id: spk.id, color: SPK_COLORS[idx % SPK_COLORS.length], path: pts.join(' ') };
    });

    return {
      miniSubPath: subPts.join(' '),
      miniMainPath: mainPts.join(' '),
      fullXoverCurves: curves,
    };
  }, [speakers, subSpeaker, mainLeftSpeaker]);

  const handleManualCheck = (res: { ok: boolean; error?: string }) => {
    if (!res.ok && res.error) {
      setHardwareNotice(res.error);
      window.setTimeout(() => setHardwareNotice(null), 4000);
    }
  };

  const updateChannelEqGain = (ch: ChannelStrip, bandIdx: number, gainDb: number) => {
    setActiveQuickPresetByChannel((prev) => ({ ...prev, [ch.id]: null }));
    const nextBands = ch.eqBands.map((b, i) => (i === bandIdx ? { ...b, gainDb } : b));
    updateChannel(ch.id, { eqEnabled: true, eqBands: nextBands });
  };

  const stepChannel = (delta: number) => {
    const nextIdx = (selectedIndex + delta + channels.length) % channels.length;
    setSelectedChannelId(channels[nextIdx].id);
  };

  const selectChannelWithBank = (id: string) => {
    const idx = channels.findIndex((c) => c.id === id);
    if (idx >= 0) {
      setActiveDcaSpill(null);
      setBankFilter('all');
      setBankPageIdx(Math.floor(idx / effectiveBankSize));
    }
    setSelectedChannelId(id);
  };

  const anyChannelSolo = channels.some((c) => c.solo);

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Unified Single-Row Tabbed Console Toolbar (Zero Vertical/Horizontal Scroll) */}
      <div className="console-panel rounded-md px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* In-Place Module Switcher Tabs */}
        <div className="console-module-rack p-0.5 rounded flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'desk', label: 'MIX DESK + EQ', icon: SlidersHorizontal },
            { id: 'eq31', label: '31-BAND EQ', icon: Waves },
            { id: 'crossover', label: 'ACTIVE XOVER', icon: Speaker },
            { id: 'dynamics', label: 'DYNAMICS & SENDS', icon: Radio },
            { id: 'fxrack', label: 'FX RACK (4)', icon: Sparkles },
            { id: 'matrix', label: 'MATRIX MIX N×M', icon: GitBranch },
          ].map((mod) => {
            const Icon = mod.icon;
            const active = consoleModule === mod.id;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setConsoleModule(mod.id as typeof consoleModule)}
                className={`px-2 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap shrink-0 transition-all ${
                  active ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{mod.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Channel Bank Pages (6/8/12/16/ALL Strips / Page — Unlimited Channels) */}
        <div className="flex items-center gap-1 flex-wrap">
          <select
            aria-label="Channel Bank Size"
            value={String(bankSize)}
            onChange={(e) => {
              const raw = e.target.value;
              setBankSize(raw === 'all' ? 'all' : (Number(raw) as 6 | 8 | 12 | 16));
              setBankPageIdx(0);
            }}
            className="console-btn-surface rounded px-1.5 py-1 text-[10px] font-mono text-amber-300 focus:outline-none"
            title="Strips visible per bank page"
          >
            <option value="6">6/Bank</option>
            <option value="8">8/Bank</option>
            <option value="12">12/Bank</option>
            <option value="16">16/Bank</option>
            <option value="all">ALL IN</option>
          </select>

          {Array.from({ length: totalPages }).map((_, pIdx) => {
            const startNum = pIdx * effectiveBankSize + 1;
            const endNum = Math.min(dcaFilteredChannels.length, (pIdx + 1) * effectiveBankSize);
            const active = bankFilter === 'all' && safePageIdx === pIdx;
            return (
              <button
                key={`bank-${pIdx}`}
                type="button"
                onClick={() => {
                  setBankFilter('all');
                  setBankPageIdx(pIdx);
                }}
                className={`px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap transition-colors ${
                  active ? 'console-accent-solid' : 'console-btn-surface text-slate-300'
                }`}
              >
                CH {startNum}–{endNum}
              </button>
            );
          })}
          {[
            { id: 'vox', label: 'VOX' },
            { id: 'band', label: 'BAND' },
            { id: 'drums-choir', label: 'DRUMS/MEDIA' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setBankFilter(tab.id as typeof bankFilter)}
              className={`px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap transition-colors ${
                bankFilter === tab.id
                  ? 'console-accent-solid'
                  : 'console-btn-surface text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {!isVolunteer && (
            <button
              type="button"
              onClick={() => setAddInputOpen((v) => !v)}
              className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-mono text-emerald-200 flex items-center gap-1 whitespace-nowrap"
              title="Add new separate input channel"
            >
              <Plus className="w-3 h-3" />
              <span>ADD IN</span>
            </button>
          )}
        </div>

        {/* Sends-On-Fader + DSP IQ Autopilot */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center console-well rounded p-0.5 gap-0.5">
            {[
              { id: 'mix', label: 'MAIN' },
              { id: 'mon1', label: 'MON1' },
              { id: 'mon2', label: 'MON2' },
              { id: 'livestream', label: 'STRM' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSendMode(mode.id as typeof sendMode)}
                className={`px-2 py-0.5 rounded-[3px] text-[9px] font-mono whitespace-nowrap transition-colors ${
                  sendMode === mode.id
                    ? mode.id === 'mix'
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-sky-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="hidden xl:flex items-center gap-1 console-well rounded px-1.5 py-0.5">
            <ConsoleButton
              label="DUGAN"
              size="xs"
              color="emerald"
              active={intelligenceConfig.duganAutomixEnabled}
              onClick={() =>
                setIntelligenceConfig({
                  duganAutomixEnabled: !intelligenceConfig.duganAutomixEnabled,
                })
              }
            />
            <ConsoleButton
              label="AUTO-LVL"
              size="xs"
              color="cyan"
              active={intelligenceConfig.autoLevelerEnabled}
              onClick={() =>
                setIntelligenceConfig({
                  autoLevelerEnabled: !intelligenceConfig.autoLevelerEnabled,
                })
              }
            />
            <ConsoleButton
              label="DE-MASK"
              size="xs"
              color="amber"
              active={intelligenceConfig.antiMaskingEnabled}
              onClick={() =>
                setIntelligenceConfig({
                  antiMaskingEnabled: !intelligenceConfig.antiMaskingEnabled,
                })
              }
            />
          </div>
        </div>
      </div>

      {addInputOpen && (
        <form
          onSubmit={handleCreateInputChannel}
          className="console-panel rounded-md px-3 py-2 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 shrink-0"
        >
          <span className="text-[11px] font-mono font-semibold text-emerald-300">
            NEW SEPARATE INPUT STRIP (CH {String(channels.length + 1).padStart(2, '0')}):
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newInputName}
              onChange={(e) => setNewInputName(e.target.value)}
              placeholder="Source name (e.g., Browser Tab Audio, Pulpit 2, Media)"
              className="console-well border border-white/15 rounded px-2.5 py-1 text-xs font-mono text-slate-100 w-64"
            />
            <select
              value={newInputCat}
              onChange={(e) => setNewInputCat(e.target.value as SourceCategory)}
              className="console-btn-surface rounded px-2 py-1 text-[11px] font-mono text-slate-200"
            >
              <option value="media">Media / Browser</option>
              <option value="vocal">Vocal</option>
              <option value="pulpit">Pulpit</option>
              <option value="acoustic">Acoustic</option>
              <option value="electric">Electric</option>
              <option value="bass">Bass</option>
              <option value="keys">Keys</option>
              <option value="drums">Drums</option>
              <option value="choir">Choir</option>
            </select>
            <button
              type="submit"
              className="px-3 py-1 rounded bg-emerald-500 text-slate-950 text-[11px] font-mono font-bold"
            >
              CREATE STRIP
            </button>
            <button
              type="button"
              onClick={() => setAddInputOpen(false)}
              className="px-2 py-1 rounded console-btn-surface text-[11px] font-mono text-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {hardwareNotice && (
        <div className="px-3 py-1.5 rounded bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-2 shrink-0">
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{hardwareNotice}</span>
        </div>
      )}

      {/* MODULE 1: MAIN UNIFIED MIX DESK (Fits 100% in Single Viewport, Zero Scroll) */}
      {consoleModule === 'desk' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
          {/* LEFT BAY: Selected Channel + 2nd Channel Pair + Tabbed [EQ | ACTIVE XOVER | PREAMP] */}
          <div className="xl:col-span-4 2xl:col-span-3 console-chassis rounded-lg border p-2.5 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            {/* 1st / 2nd Channel Header & Quick Actions */}
            <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-1.5 shrink-0">
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => stepChannel(-1)}
                  className="p-1 rounded console-btn-surface text-slate-300"
                  title="Previous Channel"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <div className="min-w-0">
                  <div className="text-xs font-mono font-bold truncate" style={{ color: 'var(--console-accent-text)' }}>
                    CH {String(selectedChannel.number).padStart(2, '0')} · {selectedChannel.shortName}
                  </div>
                  <div className="text-[9px] font-mono text-slate-400 truncate">
                    {selectedChannel.sourceBinding?.active
                      ? `[${selectedChannel.sourceBinding.kind.toUpperCase()}]`
                      : selectedChannel.physicalPort}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => stepChannel(1)}
                  className="p-1 rounded console-btn-surface text-slate-300"
                  title="Next Channel"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {/* 2ND CHANNEL BUTTON + SOURCE + TRACE */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const prevId = selectedChannel.id;
                    selectChannelWithBank(partnerChannel.id);
                    setSecondChannelId(prevId);
                  }}
                  className="px-2 py-1 rounded console-accent-active border text-[9px] font-mono font-bold whitespace-nowrap"
                  title={`Switch immediately to 2nd Channel: CH ${String(partnerChannel.number).padStart(2, '0')} ${partnerChannel.shortName}`}
                >
                  2ND CH: {String(partnerChannel.number).padStart(2, '0')}
                </button>
                <button
                  type="button"
                  onClick={() => openSourceBay(selectedChannel.id)}
                  className="p-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300"
                  title="Patch Desktop Audio / Mic / File"
                >
                  <Radio className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => openSignalJourney(selectedChannel.id)}
                  className="p-1 rounded console-btn-surface text-sky-300"
                  title="Signal Journey"
                >
                  <GitBranch className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Dual Input / Output Analog VU Meters */}
            <DualChannelVuBridge
              inputRmsDbfs={selectedMeter?.inputRmsDbfs ?? -80}
              outputRmsDbfs={selectedMeter?.rmsDbfs ?? -80}
              inputPeakDbfs={selectedMeter?.inputPeakDbfs ?? -80}
              outputPeakDbfs={selectedMeter?.peakDbfs ?? -80}
            />

            {/* Focus Strip Internal Module Switcher: EQ | ACTIVE CROSSOVER | PREAMP/AUX */}
            <div className="console-module-rack p-0.5 rounded grid grid-cols-3 gap-1 shrink-0">
              {[
                { id: 'eq', label: 'EQ + Q-LOAD' },
                { id: 'crossover', label: 'ACTIVE XOVER' },
                { id: 'preamp', label: 'PREAMP / AUX' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFocusTab(t.id as typeof focusTab)}
                  className={`py-1 px-1.5 rounded-[3px] text-[9px] font-mono transition-all ${
                    focusTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Focus Tab A: Channel EQ + Quick-Load + 2nd Channel Copy */}
            {focusTab === 'eq' && (
              <div className="console-panel rounded-md p-2 flex-1 min-h-0 flex flex-col justify-between gap-1.5 border border-amber-500/35">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <ConsoleButton
                      label={selectedChannel.eqEnabled ? 'EQ IN' : 'EQ BYP'}
                      size="xs"
                      color="amber"
                      active={selectedChannel.eqEnabled}
                      onClick={() =>
                        updateChannel(selectedChannel.id, { eqEnabled: !selectedChannel.eqEnabled })
                      }
                    />
                    <ConsoleButton
                      label="AUTO-EQ"
                      size="xs"
                      color="emerald"
                      active={false}
                      onClick={() => {
                        const res = autoCalibrateChannel(selectedChannel.id);
                        if (res.ok) {
                          setActiveQuickPresetByChannel((prev) => ({
                            ...prev,
                            [selectedChannel.id]: recommendation.primary.id,
                          }));
                        }
                      }}
                    />
                    <ConsoleButton
                      label={isRecommendedActive ? 'LOADED' : 'Q-LOAD'}
                      size="xs"
                      color="amber"
                      active={isRecommendedActive}
                      onClick={toggleRecommendedPreset}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={copyEqToSecondChannel}
                      className="px-1.5 py-0.5 rounded console-btn-surface text-[8px] font-mono text-sky-300 flex items-center gap-0.5"
                      title={`Copy EQ curve to 2nd Channel (${partnerChannel.shortName})`}
                    >
                      <Copy className="w-2.5 h-2.5" />
                      <span>→2ND</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConsoleModule('eq31')}
                      className="px-1.5 py-0.5 rounded console-btn-surface text-[8px] font-mono text-amber-300"
                    >
                      31B
                    </button>
                  </div>
                </div>

                <div className="console-well rounded px-2 py-1 flex items-center justify-between text-[9px] font-mono">
                  <span className="text-slate-300 flex items-center gap-1 truncate">
                    <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                    <span className="truncate">{recommendation.primary.name}</span>
                  </span>
                  <span className="text-slate-400 truncate ml-1">
                    {selectedInsight?.signalPresent
                      ? `${selectedInsight.spectralCentroidHz}Hz`
                      : `HPF ${selectedChannel.hpfFreqHz}Hz`}
                  </span>
                </div>

                <SelectedChannelEqCurve channel={selectedChannel} compact bypassed={globalDspBypass} />

                <div className="grid grid-cols-4 gap-1.5">
                  <RotaryKnob
                    label="LOW"
                    value={selectedChannel.eqBands[0]?.gainDb ?? 0}
                    min={-15}
                    max={15}
                    step={0.5}
                    bipolar
                    size={32}
                    accentColor="amber"
                    onChange={(v) => updateChannelEqGain(selectedChannel, 0, v)}
                  />
                  <RotaryKnob
                    label="LO-MID"
                    value={selectedChannel.eqBands[1]?.gainDb ?? 0}
                    min={-15}
                    max={15}
                    step={0.5}
                    bipolar
                    size={32}
                    accentColor="cyan"
                    onChange={(v) => updateChannelEqGain(selectedChannel, 1, v)}
                  />
                  <RotaryKnob
                    label="HI-MID"
                    value={selectedChannel.eqBands[2]?.gainDb ?? 0}
                    min={-15}
                    max={15}
                    step={0.5}
                    bipolar
                    size={32}
                    accentColor="cyan"
                    onChange={(v) => updateChannelEqGain(selectedChannel, 2, v)}
                  />
                  <RotaryKnob
                    label="HIGH"
                    value={selectedChannel.eqBands[3]?.gainDb ?? 0}
                    min={-15}
                    max={15}
                    step={0.5}
                    bipolar
                    size={32}
                    accentColor="emerald"
                    onChange={(v) => updateChannelEqGain(selectedChannel, 3, v)}
                  />
                </div>

                <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-white/[0.06]">
                  <RotaryKnob
                    label="HPF"
                    value={selectedChannel.hpfFreqHz}
                    min={25}
                    max={300}
                    step={5}
                    unit="Hz"
                    size={30}
                    accentColor="amber"
                    disabled={!selectedChannel.hpfEnabled}
                    onChange={(val) => updateChannel(selectedChannel.id, { hpfFreqHz: val })}
                  />
                  <RotaryKnob
                    label="MID FRQ"
                    value={selectedChannel.eqBands[2]?.freqHz ?? 2400}
                    min={200}
                    max={8000}
                    step={25}
                    size={30}
                    accentColor="cyan"
                    formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)}
                    onChange={(v) => {
                      const next = selectedChannel.eqBands.map((b, i) =>
                        i === 2 ? { ...b, freqHz: v } : b
                      );
                      updateChannel(selectedChannel.id, { eqBands: next });
                    }}
                  />
                  <RotaryKnob
                    label="MID Q"
                    value={selectedChannel.eqBands[2]?.q ?? 1.2}
                    min={0.4}
                    max={12}
                    step={0.1}
                    size={30}
                    accentColor="rose"
                    formatValue={(v) => v.toFixed(1)}
                    onChange={(v) => {
                      const next = selectedChannel.eqBands.map((b, i) => (i === 2 ? { ...b, q: v } : b));
                      updateChannel(selectedChannel.id, { eqBands: next });
                    }}
                  />
                  <RotaryKnob
                    label="COMP"
                    value={selectedChannel.dynamics.compThresholdDb}
                    min={-40}
                    max={0}
                    step={0.5}
                    unit="dB"
                    size={30}
                    accentColor="emerald"
                    onChange={(v) =>
                      updateChannel(selectedChannel.id, {
                        dynamics: { ...selectedChannel.dynamics, compThresholdDb: v },
                      })
                    }
                  />
                </div>
              </div>
            )}

            {/* Focus Tab B: Active Crossover + 1st/2nd Channel Crossover Switcher */}
            {focusTab === 'crossover' && (
              <div className="console-panel rounded-md p-2 flex-1 min-h-0 flex flex-col justify-between gap-1.5 border border-sky-400/45">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono font-bold text-sky-300 uppercase">
                    ACTIVE CROSSOVER · {systemXoverFreq} Hz
                  </span>
                  <button
                    type="button"
                    onClick={() => setConsoleModule('crossover')}
                    className="px-1.5 py-0.5 rounded console-btn-surface text-[9px] font-mono text-sky-300"
                  >
                    FULL BODE →
                  </button>
                </div>

                {/* Dynamic Crossover Output Channel Selector Buttons */}
                <div className="grid grid-cols-3 gap-1 max-h-14 overflow-y-auto">
                  {speakers.map((spk, idx) => {
                    const active = spk.id === selectedSpk.id;
                    return (
                      <button
                        key={spk.id}
                        type="button"
                        onClick={() => setSelectedSpkId(spk.id)}
                        className={`px-1.5 py-1 rounded text-[9px] font-mono border truncate ${
                          active ? 'console-accent-active font-bold' : 'console-btn-surface text-slate-300'
                        }`}
                      >
                        OUT {idx + 1} · {spk.role === 'Subwoofer' ? 'SUB' : spk.name}
                      </button>
                    );
                  })}
                </div>

                <div className="dark-instrument-scope rounded px-2 py-1">
                  <svg viewBox="0 0 240 62" className="w-full h-16">
                    <line x1="0" y1="16" x2="240" y2="16" stroke="rgba(255,255,255,0.16)" strokeWidth="0.7" />
                    <line x1="0" y1="38" x2="240" y2="38" stroke="rgba(148,163,184,0.1)" strokeWidth="0.6" />
                    {miniSubPath && <path d={miniSubPath} fill="none" stroke="#a78bfa" strokeWidth="2.1" />}
                    {miniMainPath && <path d={miniMainPath} fill="none" stroke="#f59e0b" strokeWidth="2.1" />}
                  </svg>
                </div>

                <div className="grid grid-cols-4 gap-1.5 items-center">
                  <RotaryKnob
                    label="XOVER"
                    value={systemXoverFreq}
                    min={60}
                    max={140}
                    step={2}
                    unit="Hz"
                    size={32}
                    accentColor="cyan"
                    onChange={setSyncedCrossoverHz}
                  />
                  <RotaryKnob
                    label="CH HPF"
                    value={selectedSpk.hpfHz}
                    min={20}
                    max={300}
                    step={2}
                    unit="Hz"
                    size={32}
                    accentColor="amber"
                    onChange={(v) => updateSpeaker(selectedSpk.id, { hpfHz: v })}
                  />
                  <RotaryKnob
                    label="CH LPF"
                    value={selectedSpk.lpfHz}
                    min={60}
                    max={20000}
                    step={20}
                    size={32}
                    accentColor="cyan"
                    formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)}
                    onChange={(v) => updateSpeaker(selectedSpk.id, { lpfHz: v })}
                  />
                  <RotaryKnob
                    label="DEEP SUB"
                    value={subSpeaker?.subBoostGainDb ?? 3.5}
                    min={0}
                    max={9}
                    step={0.5}
                    unit="dB"
                    size={32}
                    accentColor="emerald"
                    disabled={!subSpeaker?.subBoostEnabled}
                    formatValue={(v) => `+${v.toFixed(1)}`}
                    onChange={(v) => subSpeaker && updateSpeaker(subSpeaker.id, { subBoostGainDb: v })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <ConsoleButton
                    label={selectedSpk.family === 'Linkwitz-Riley' ? 'LR24' : selectedSpk.family === 'Butterworth' ? 'BW24' : 'BESSEL'}
                    size="xs"
                    color="cyan"
                    active={true}
                    onClick={() => {
                      const nextFam: CrossoverFamily =
                        selectedSpk.family === 'Linkwitz-Riley'
                          ? 'Butterworth'
                          : selectedSpk.family === 'Butterworth'
                            ? 'Bessel'
                            : 'Linkwitz-Riley';
                      updateSpeaker(selectedSpk.id, { family: nextFam });
                    }}
                  />
                  <ConsoleButton
                    label={subSpeaker?.subBoostEnabled ? 'SUB BOOST ON' : 'SUB BOOST OFF'}
                    size="xs"
                    color="emerald"
                    active={Boolean(subSpeaker?.subBoostEnabled)}
                    onClick={() =>
                      subSpeaker &&
                      updateSpeaker(subSpeaker.id, { subBoostEnabled: !subSpeaker.subBoostEnabled })
                    }
                  />
                  <ConsoleButton
                    label={selectedSpk.mute ? 'CH MUTED' : 'CH ACTIVE'}
                    size="xs"
                    color={selectedSpk.mute ? 'crimson' : 'amber'}
                    active={!selectedSpk.mute}
                    onClick={() => updateSpeaker(selectedSpk.id, { mute: !selectedSpk.mute })}
                  />
                </div>
              </div>
            )}

            {/* Focus Tab C: Preamp, Conditioning & Aux Sends */}
            {focusTab === 'preamp' && (
              <div className="console-panel rounded-md p-2 flex-1 min-h-0 flex flex-col justify-between gap-1.5">
                <div className="grid grid-cols-4 gap-1.5">
                  <RotaryKnob
                    label={isManualPreamp ? 'DESK' : 'GAIN'}
                    value={selectedChannel.hardwarePreampDb}
                    min={0}
                    max={60}
                    step={1}
                    unit="dB"
                    size={32}
                    accentColor="rose"
                    manualOnlyReason={isManualPreamp ? 'Manual preamp knob on desk' : undefined}
                    onChange={(val) =>
                      handleManualCheck(
                        updateChannel(selectedChannel.id, { hardwarePreampDb: val }, 'Adjusted HA gain')
                      )
                    }
                  />
                  <RotaryKnob
                    label="TRIM"
                    value={selectedChannel.softwareTrimDb}
                    min={-18}
                    max={18}
                    step={0.5}
                    bipolar
                    unit="dB"
                    size={32}
                    accentColor="cyan"
                    onChange={(val) => updateChannel(selectedChannel.id, { softwareTrimDb: val })}
                  />
                  <RotaryKnob
                    label="PAN"
                    value={selectedChannel.pan}
                    min={-100}
                    max={100}
                    step={2}
                    bipolar
                    size={32}
                    accentColor="emerald"
                    formatValue={(v) =>
                      v === 0 ? 'C' : v < 0 ? `L${Math.abs(Math.round(v))}` : `R${Math.round(v)}`
                    }
                    onChange={(val) => updateChannel(selectedChannel.id, { pan: val })}
                  />
                  <RotaryKnob
                    label="STREAM"
                    value={selectedChannel.sends.livestream.levelDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={32}
                    accentColor="emerald"
                    onChange={(v) =>
                      updateChannelSend(selectedChannel.id, 'livestream', {
                        levelDb: v,
                        enabled: v > -55,
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-4 gap-1">
                  <ConsoleButton
                    label="48V"
                    size="xs"
                    color="crimson"
                    active={selectedChannel.phantom48v}
                    manualOnlyReason={isManualPhantom ? 'Manual +48V desk switch' : undefined}
                    onClick={() =>
                      handleManualCheck(
                        updateChannel(selectedChannel.id, { phantom48v: !selectedChannel.phantom48v })
                      )
                    }
                  />
                  <ConsoleButton
                    label="Ø POL"
                    size="xs"
                    color="cyan"
                    active={selectedChannel.polarityInvert}
                    onClick={() =>
                      updateChannel(selectedChannel.id, {
                        polarityInvert: !selectedChannel.polarityInvert,
                      })
                    }
                  />
                  <ConsoleButton
                    label="HPF"
                    size="xs"
                    color="amber"
                    active={selectedChannel.hpfEnabled}
                    onClick={() =>
                      updateChannel(selectedChannel.id, { hpfEnabled: !selectedChannel.hpfEnabled })
                    }
                  />
                  <ConsoleButton
                    label="COMP"
                    size="xs"
                    color="emerald"
                    active={selectedChannel.dynamics.compEnabled}
                    onClick={() =>
                      updateChannel(selectedChannel.id, {
                        dynamics: {
                          ...selectedChannel.dynamics,
                          compEnabled: !selectedChannel.dynamics.compEnabled,
                        },
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/[0.06]">
                  <RotaryKnob
                    label="MON 1"
                    value={selectedChannel.sends.mon1.levelDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={32}
                    accentColor="cyan"
                    onChange={(v) =>
                      updateChannelSend(selectedChannel.id, 'mon1', { levelDb: v, enabled: v > -55 })
                    }
                  />
                  <RotaryKnob
                    label="MON 2"
                    value={selectedChannel.sends.mon2.levelDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={32}
                    accentColor="cyan"
                    onChange={(v) =>
                      updateChannelSend(selectedChannel.id, 'mon2', { levelDb: v, enabled: v > -55 })
                    }
                  />
                  <RotaryKnob
                    label="FX REV"
                    value={selectedChannel.sends.fxReverb.levelDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={32}
                    accentColor="amber"
                    onChange={(v) =>
                      updateChannelSend(selectedChannel.id, 'fxReverb', { levelDb: v, enabled: v > -55 })
                    }
                  />
                </div>

                {/* Mute-Safe + DCA Group Assignment */}
                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/[0.06]">
                  <ConsoleButton
                    label={selectedChannel.muteSafe ? 'MUTE SAFE' : 'SAFE OFF'}
                    size="xs"
                    color="emerald"
                    active={Boolean(selectedChannel.muteSafe)}
                    manualOnlyReason={volunteerLockReason}
                    onClick={() =>
                      handleManualCheck(
                        updateChannel(selectedChannel.id, { muteSafe: !selectedChannel.muteSafe })
                      )
                    }
                  />
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px] font-mono text-slate-400 mr-1">DCA:</span>
                    {([null, 'A', 'B', 'C', 'D'] as (DcaGroupId | null)[]).map((gid) => (
                      <button
                        key={gid ?? 'none'}
                        type="button"
                        disabled={isVolunteer}
                        onClick={() =>
                          handleManualCheck(updateChannel(selectedChannel.id, { dcaGroup: gid }))
                        }
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono border disabled:opacity-40 ${
                          selectedChannel.dcaGroup === gid
                            ? 'console-accent-solid border-transparent'
                            : 'console-btn-surface text-slate-300'
                        }`}
                      >
                        {gid ?? '—'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CENTER BAY: Flexible Expandable Motorized Fader Bank + DCA Spill Bar + Parameter Automation Lanes */}
          <div className="xl:col-span-5 2xl:col-span-6 console-chassis rounded-lg border p-2.5 flex flex-col justify-between gap-1.5 min-h-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-white/[0.07] shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Bank ({activeDcaSpill ? `DCA ${activeDcaSpill} SPILL` : bankFilter === 'all' ? `CH ${safePageIdx * effectiveBankSize + 1}–${Math.min(dcaFilteredChannels.length, (safePageIdx + 1) * effectiveBankSize)}` : bankFilter.toUpperCase()}) · {visibleChannels.length}/{channels.length} IN
                </span>
                {activeDcaSpill && (
                  <button
                    type="button"
                    onClick={() => setActiveDcaSpill(null)}
                    className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/60 text-[9px] font-mono text-amber-200 font-bold whitespace-nowrap"
                  >
                    EXIT SPILL
                  </button>
                )}
                {isVolunteer && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-[9px] font-mono text-amber-200 flex items-center gap-1 whitespace-nowrap">
                    <Lock className="w-2.5 h-2.5" />
                    VOLUNTEER
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                {/* PFL / AFL / SIP Solo Mode Selector */}
                <div className="flex items-center console-well rounded p-0.5 gap-0.5">
                  {(['pfl', 'afl', 'sip'] as SoloMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSoloMode(mode)}
                      title={
                        mode === 'pfl'
                          ? 'Pre-Fader Listen (Cue Bus)'
                          : mode === 'afl'
                            ? 'After-Fader Listen (Cue Bus)'
                            : 'Solo-In-Place (Mutes non-soloed channels)'
                      }
                      className={`px-1.5 py-0.5 rounded-[2px] text-[8.5px] font-mono uppercase transition-colors ${
                        soloMode === mode
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                  {anyChannelSolo && (
                    <button
                      type="button"
                      onClick={clearAllSolos}
                      className="px-1.5 py-0.5 rounded-[2px] text-[8.5px] font-mono bg-rose-500/30 text-rose-200 font-bold"
                    >
                      CLR
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAutomationLanes((v) => !v)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    showAutomationLanes ? 'console-accent-active' : 'console-btn-surface text-slate-300'
                  }`}
                  title="Toggle parameter automation lanes beneath channel strips"
                >
                  <Activity className="w-2.5 h-2.5" />
                  <span>AUTO LANES</span>
                </button>
                <button
                  type="button"
                  onClick={toggleAllExpanded}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    expandAllStrips ? 'console-accent-active' : 'console-btn-surface text-slate-300'
                  }`}
                  title="Toggle detailed fader view (Gain Reduction History + Peak Hold)"
                >
                  {expandAllStrips ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
                  <span>{expandAllStrips ? 'COMPACT' : 'EXPAND'}</span>
                </button>
              </div>
            </div>

            <div
              className={
                visibleChannels.length > 8
                  ? 'flex-1 min-h-0 flex items-stretch gap-1.5 overflow-x-auto pb-1 pt-0.5'
                  : visibleChannels.length > 6
                    ? 'flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 pt-0.5'
                    : 'flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-0.5'
              }
            >
              {visibleChannels.map((ch) => {
                const m = meters[ch.id];
                const isSelected = ch.id === selectedChannel.id;
                const isSecond = ch.id === partnerChannel.id;
                const isExpanded = expandedStripIds[ch.id] ?? expandAllStrips;
                const grHistory = m?.gainReductionHistory ?? [];
                const peakHold = m?.peakHoldDbfs ?? -80;
                const peakHoldClipped = Boolean(m?.peakHoldClipped);
                const maxGrDb = grHistory.length > 0 ? Math.max(...grHistory) : (m?.gainReductionDb ?? 0);

                const faderVal =
                  sendMode === 'mix'
                    ? ch.faderDb
                    : sendMode === 'mon1'
                      ? ch.sends.mon1.levelDb
                      : sendMode === 'mon2'
                        ? ch.sends.mon2.levelDb
                        : ch.sends.livestream.levelDb;

                const handleFaderChange = (db: number) => {
                  if (sendMode === 'mix') {
                    updateChannel(ch.id, { faderDb: db });
                  } else {
                    updateChannelSend(ch.id, sendMode, { levelDb: db, enabled: db > -70 });
                  }
                };

                const grSparkPath = (() => {
                  const pts = grHistory.length > 1 ? grHistory : [0, 0];
                  const w = 96;
                  const h = 24;
                  return pts
                    .map((val, idx) => {
                      const x = (idx / Math.max(1, pts.length - 1)) * w;
                      const norm = Math.max(0, Math.min(1, val / 18));
                      const y = norm * (h - 3) + 1.5;
                      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ');
                })();

                return (
                  <div
                    key={ch.id}
                    onClick={() => setSelectedChannelId(ch.id)}
                    className={`rounded-md p-1.5 flex flex-col items-center justify-between gap-1 border transition-all cursor-pointer ${
                      visibleChannels.length > 8 ? 'min-w-[106px] shrink-0' : 'min-w-0'
                    } ${
                      isSelected
                        ? 'console-selected-strip'
                        : isSecond
                          ? 'console-unselected-strip border-sky-400/50'
                          : 'console-unselected-strip'
                    }`}
                  >
                    <div className="w-full space-y-1">
                      <div className="w-full console-well rounded px-1.5 py-0.5 flex items-center justify-between text-[8px] font-mono">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            m?.clipping || peakHoldClipped
                              ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]'
                              : m?.signalPresent
                                ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                                : 'bg-slate-700'
                          }`}
                        />
                        <span className="tabular-nums text-slate-300">
                          {m?.signalPresent ? `${m.rmsDbfs.toFixed(0)}dB` : 'IDLE'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStripExpanded(ch.id);
                          }}
                          title={isExpanded ? 'Compact fader slot' : 'Expand detail: Gain Reduction history & Peak Hold'}
                          className={`p-0.5 rounded transition-colors ${
                            isExpanded ? 'text-amber-300 bg-amber-500/20' : 'text-slate-400 hover:text-slate-100'
                          }`}
                        >
                          {isExpanded ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
                        </button>
                      </div>

                      <ScribbleStrip
                        channel={ch}
                        selected={isSelected}
                        onSelect={() => setSelectedChannelId(ch.id)}
                        onOpenSource={() => openSourceBay(ch.id)}
                        isManualHardwarePreamp={isManualPreamp}
                      />

                      {!isExpanded ? (
                        <>
                          <div className="grid grid-cols-2 gap-1">
                            <ConsoleButton
                              label={isSelected ? '1ST' : 'SEL'}
                              size="xs"
                              color="amber"
                              active={isSelected}
                              onClick={() => setSelectedChannelId(ch.id)}
                            />
                            <ConsoleButton
                              label="2ND"
                              size="xs"
                              color="cyan"
                              active={isSecond}
                              onClick={() => setSecondChannelId(ch.id)}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-1">
                            <ConsoleButton
                              label="SOLO"
                              size="xs"
                              color="cyan"
                              active={ch.solo}
                              onClick={() => updateChannel(ch.id, { solo: !ch.solo })}
                            />
                            <ConsoleButton
                              label="MUTE"
                              size="xs"
                              color="crimson"
                              active={ch.mute}
                              onClick={() => updateChannel(ch.id, { mute: !ch.mute })}
                            />
                          </div>
                        </>
                      ) : (
                        /* Expanded Detailed View: Peak Hold Indicator + Gain Reduction History */
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="console-well rounded p-1.5 space-y-1 border border-amber-500/30"
                        >
                          {/* Peak Hold Indicator Row */}
                          <div className="flex items-center justify-between text-[8px] font-mono">
                            <span className="text-slate-400">PK HOLD</span>
                            <span
                              className={`font-bold tabular-nums ${
                                peakHoldClipped
                                  ? 'text-rose-400'
                                  : peakHold > -6
                                    ? 'text-amber-300'
                                    : 'text-emerald-300'
                              }`}
                            >
                              {peakHold <= -78 ? '—' : `${peakHold.toFixed(1)}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => resetPeakHold(ch.id)}
                              title="Reset Peak Hold & Clip Latch"
                              className="text-sky-400 hover:text-sky-200 p-0.5"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          {peakHoldClipped && (
                            <div className="w-full py-0.5 rounded bg-rose-500/25 border border-rose-500/60 text-center text-[7.5px] font-mono font-bold text-rose-200">
                              CLIP LATCHED
                            </div>
                          )}

                          {/* Gain Reduction History Sparkline */}
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between text-[7.5px] font-mono">
                              <span className="text-slate-400">GR HIST</span>
                              <span className="text-amber-300 tabular-nums">
                                -{(m?.gainReductionDb ?? 0).toFixed(1)} (pk -{maxGrDb.toFixed(1)})
                              </span>
                            </div>
                            <div className="dark-instrument-scope rounded px-0.5 py-0.5">
                              <svg viewBox="0 0 96 24" className="w-full h-5">
                                <line x1="0" y1="1.5" x2="96" y2="1.5" stroke="rgba(148,163,184,0.22)" strokeWidth="0.6" />
                                <line x1="0" y1="12" x2="96" y2="12" stroke="rgba(148,163,184,0.12)" strokeWidth="0.6" strokeDasharray="2 2" />
                                <path d={grSparkPath} fill="none" stroke="#f59e0b" strokeWidth="1.4" />
                              </svg>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => openGainStagingAssistant(ch.id)}
                              className="py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-[7.5px] font-mono text-amber-200 flex items-center justify-center gap-0.5"
                              title="Gain Staging Assistant"
                            >
                              <Gauge className="w-2.5 h-2.5" />
                              <span>STAGE</span>
                            </button>
                            {channels.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeChannel(ch.id)}
                                className="py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-[7.5px] font-mono text-rose-300 flex items-center justify-center gap-0.5"
                                title="Remove input strip"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>DEL</span>
                              </button>
                            ) : (
                              <ConsoleButton
                                label="MUTE"
                                size="xs"
                                color="crimson"
                                active={ch.mute}
                                onClick={() => updateChannel(ch.id, { mute: !ch.mute })}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-start justify-center gap-1 pt-0.5">
                      <MotorizedFader
                        valueDb={faderVal}
                        onChange={handleFaderChange}
                        height={showAutomationLanes ? (isExpanded ? 88 : 114) : isExpanded ? 116 : 158}
                        accentColor={sendMode === 'mix' ? 'amber' : 'cyan'}
                      />
                      <LedMeter
                        peakDbfs={m?.peakDbfs ?? -80}
                        peakHoldDbfs={peakHold}
                        gainReductionDb={m?.gainReductionDb ?? 0}
                        clipping={m?.clipping || peakHoldClipped}
                        height={showAutomationLanes ? (isExpanded ? 88 : 114) : isExpanded ? 116 : 158}
                        width={8}
                        segments={showAutomationLanes ? (isExpanded ? 10 : 12) : isExpanded ? 12 : 16}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DCA Groups A / B / C / D Spill & Master Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 shrink-0">
              {dcaGroups.map((dca) => {
                const isSpilled = activeDcaSpill === dca.id;
                const assignedCount = channels.filter((c) => c.dcaGroup === dca.id).length;
                return (
                  <div
                    key={dca.id}
                    className={`console-well rounded px-2 py-1 border flex flex-col gap-1 ${
                      isSpilled ? 'border-amber-400/80 bg-amber-500/10' : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[9px] font-mono">
                      <span className="font-bold text-amber-300 truncate">
                        DCA {dca.id} · {dca.label} ({assignedCount})
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveDcaSpill(isSpilled ? null : dca.id)}
                          className={`px-1 py-0.5 rounded text-[8px] font-bold border ${
                            isSpilled
                              ? 'bg-amber-400 text-slate-950 border-amber-300'
                              : 'console-btn-surface text-sky-300'
                          }`}
                          title={`Spill DCA ${dca.id} channels onto fader bank`}
                        >
                          SPILL
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDcaGroup(dca.id, { mute: !dca.mute })}
                          className={`px-1 py-0.5 rounded text-[8px] font-bold border ${
                            dca.mute
                              ? 'bg-rose-500 text-white border-rose-400'
                              : 'console-btn-surface text-slate-300'
                          }`}
                        >
                          {dca.mute ? 'M' : 'ON'}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="range"
                        aria-label={`DCA ${dca.id} Fader`}
                        min={-60}
                        max={10}
                        step={0.5}
                        value={dca.faderDb}
                        onChange={(e) =>
                          updateDcaGroup(dca.id, { faderDb: Number.parseFloat(e.target.value) })
                        }
                        className="w-full accent-amber-400 h-1 cursor-pointer"
                      />
                      <span className="text-[8.5px] font-mono tabular-nums text-slate-200 w-9 text-right shrink-0">
                        {dca.faderDb <= -59 ? '-∞' : `${dca.faderDb > 0 ? '+' : ''}${dca.faderDb.toFixed(1)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {showAutomationLanes && (
              <ChannelAutomationLanes
                visibleChannels={visibleChannels}
                onCollapse={() => setShowAutomationLanes(false)}
              />
            )}
          </div>

          {/* RIGHT BAY: Active Crossover Summary + Dual Master VU + Master L/R & Sub/Stream */}
          <div className="xl:col-span-3 console-chassis rounded-lg border p-2.5 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            {/* Always-Visible Active Crossover & Sub Deep-Bass Module */}
            <div className="console-panel rounded-md p-2 space-y-1.5 border border-sky-400/45 shrink-0">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <Speaker className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="text-[10px] font-mono font-bold text-sky-300 uppercase">
                    ACTIVE XOVER · {systemXoverFreq}Hz
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setConsoleModule('crossover')}
                  className="px-1.5 py-0.5 rounded console-btn-surface text-[9px] font-mono text-sky-300"
                >
                  OPEN TAB →
                </button>
              </div>

              <div className="dark-instrument-scope rounded px-1.5 py-1">
                <svg viewBox="0 0 240 62" className="w-full h-12">
                  <line x1="0" y1="16" x2="240" y2="16" stroke="rgba(255,255,255,0.16)" strokeWidth="0.7" />
                  {miniSubPath && <path d={miniSubPath} fill="none" stroke="#a78bfa" strokeWidth="2.1" />}
                  {miniMainPath && <path d={miniMainPath} fill="none" stroke="#f59e0b" strokeWidth="2.1" />}
                </svg>
                <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                  <span className="text-violet-300">CH1 SUB {subSpeaker?.lpfHz}Hz</span>
                  <span className="text-amber-300">CH2 MAIN {mainLeftSpeaker?.hpfHz}Hz+</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 items-center">
                <RotaryKnob
                  label="XOVER"
                  value={systemXoverFreq}
                  min={60}
                  max={140}
                  step={2}
                  unit="Hz"
                  size={30}
                  accentColor="cyan"
                  onChange={setSyncedCrossoverHz}
                />
                <RotaryKnob
                  label="DEEP dB"
                  value={subSpeaker?.subBoostGainDb ?? 3.5}
                  min={0}
                  max={9}
                  step={0.5}
                  unit="dB"
                  size={30}
                  accentColor="emerald"
                  disabled={!subSpeaker?.subBoostEnabled}
                  formatValue={(v) => `+${v.toFixed(1)}`}
                  onChange={(v) => subSpeaker && updateSpeaker(subSpeaker.id, { subBoostGainDb: v })}
                />
                <ConsoleButton
                  label={subSpeaker?.subBoostEnabled ? 'SUB BOOST' : 'BOOST OFF'}
                  size="xs"
                  color="cyan"
                  active={Boolean(subSpeaker?.subBoostEnabled)}
                  onClick={() =>
                    subSpeaker &&
                    updateSpeaker(subSpeaker.id, { subBoostEnabled: !subSpeaker.subBoostEnabled })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 shrink-0">
              <AnalogVuMeter
                label="MASTER IN"
                levelDbfs={mainMeter?.inputRmsDbfs ?? -80}
                peakLed={(mainMeter?.inputPeakDbfs ?? -80) > -0.5}
                compact
              />
              <AnalogVuMeter
                label="MASTER OUT"
                levelDbfs={mainMeter?.rmsDbfs ?? -80}
                peakLed={mainMeter?.clipping}
                compact
              />
            </div>

            <div className="flex items-stretch justify-between gap-1.5 flex-1 min-h-0">
              <div className="console-panel rounded p-2 flex flex-col items-center justify-between gap-1 flex-1">
                <ConsoleButton
                  label={mainBus.mute ? 'MASTER MUTE' : 'MASTER ON'}
                  size="xs"
                  color={mainBus.mute ? 'crimson' : 'emerald'}
                  active={!mainBus.mute}
                  fullWidth
                  onClick={() => updateBus(mainBus.id, { mute: !mainBus.mute })}
                />
                <div className="flex items-start gap-1.5">
                  <MotorizedFader
                    isMaster
                    valueDb={mainBus.faderDb}
                    onChange={(db) => updateBus(mainBus.id, { faderDb: db })}
                    height={118}
                    label="MAIN L/R"
                  />
                  <LedMeter
                    peakDbfs={mainMeter?.peakDbfs ?? -80}
                    peakHoldDbfs={mainMeter?.peakHoldDbfs ?? -80}
                    height={118}
                    width={8}
                    segments={14}
                  />
                </div>
              </div>

              <div className="flex flex-col justify-between gap-1.5 w-20">
                {[subBus, streamBus].map((b) => {
                  const bm = meters[b.id];
                  return (
                    <div
                      key={b.id}
                      className="console-panel rounded p-1.5 flex flex-col items-center gap-0.5 flex-1 justify-center"
                    >
                      <span className="text-[8px] font-mono font-semibold text-slate-300">
                        {b.shortName}
                      </span>
                      <div className="flex items-start gap-1">
                        <MotorizedFader
                          valueDb={b.faderDb}
                          onChange={(db) => updateBus(b.id, { faderDb: db })}
                          height={58}
                          showScale={false}
                          accentColor={b.kind === 'broadcast' ? 'cyan' : 'emerald'}
                        />
                        <LedMeter peakDbfs={bm?.peakDbfs ?? -80} height={58} width={6} segments={8} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 2: IN-PLACE 31-BAND GRAPHIC EQ + QUICK-LOAD (Zero Scroll) */}
      {consoleModule === 'eq31' && (
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
          <div className="console-panel rounded-md px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-amber-300">
                31-BAND GEQ · CH {String(selectedChannel.number).padStart(2, '0')} {selectedChannel.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  const prevId = selectedChannel.id;
                  selectChannelWithBank(partnerChannel.id);
                  setSecondChannelId(prevId);
                }}
                className="px-2 py-0.5 rounded console-accent-active border text-[10px] font-mono font-bold"
              >
                SWITCH TO 2ND CH ({partnerChannel.shortName})
              </button>
              <button
                type="button"
                onClick={copyEqToSecondChannel}
                className="px-2 py-0.5 rounded console-btn-surface text-[10px] font-mono text-sky-300"
              >
                Copy Curve → 2nd CH
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <ConsoleButton
                label="AUTO-EQ CALIBRATE"
                size="xs"
                color="emerald"
                active={false}
                onClick={() => autoCalibrateChannel(selectedChannel.id)}
              />
              <button
                type="button"
                onClick={() => setConsoleModule('crossover')}
                className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300"
              >
                Switch to Active Crossover →
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <GraphicEq31Band
              channelLabel={`CH ${String(selectedChannel.number).padStart(2, '0')} · ${selectedChannel.name}`}
              bands={selectedChannel.geqBands}
              enabled={selectedChannel.geqEnabled}
              quickLoadLabel={recommendation.primary.name}
              quickLoadSummary={recommendation.matchReason}
              quickLoadActive={isRecommendedActive}
              onQuickLoad={toggleRecommendedPreset}
              onToggleEnabled={() =>
                updateChannel(selectedChannel.id, { geqEnabled: !selectedChannel.geqEnabled })
              }
              onChangeBand={(idx, db) => {
                const next = [...selectedChannel.geqBands];
                next[idx] = db;
                updateChannel(selectedChannel.id, { geqBands: next });
              }}
              onResetFlat={() =>
                updateChannel(selectedChannel.id, { geqBands: new Array(31).fill(0) })
              }
              onApplyCurvePreset={(preset) => {
                const next = new Array(31).fill(0);
                if (preset === 'vocal') {
                  next[6] = -4;
                  next[7] = -3;
                  next[10] = -2;
                  next[20] = 2.5;
                  next[22] = 3;
                } else if (preset === 'sanctuary') {
                  next[4] = -3;
                  next[5] = -4;
                  next[11] = -3.5;
                  next[12] = -2.5;
                } else {
                  next[3] = 2.5;
                  next[4] = 3;
                  next[5] = 2;
                  next[11] = -3.5;
                  next[17] = 2.5;
                }
                updateChannel(selectedChannel.id, { geqEnabled: true, geqBands: next });
              }}
            />
          </div>
        </div>
      )}

      {/* MODULE 3: IN-PLACE ACTIVE CROSSOVER, CH 1/2/3/4/5 & SUB DEEP BASS (Zero Scroll) */}
      {consoleModule === 'crossover' && selectedSpk && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border border-sky-400/40 p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
            <div>
              <div className="text-xs font-mono font-bold text-sky-300 uppercase tracking-wider">
                Active System Crossover &amp; 2-Channel Sub/Main Alignment · {selectedSpk.name}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {selectedSpk.family} 24dB/oct · Connector: {selectedSpk.physicalConnector}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedSpkId(speakers[0].id)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono border ${
                  selectedSpk.id === speakers[0].id
                    ? 'console-accent-solid border-transparent'
                    : 'console-btn-surface text-slate-300'
                }`}
              >
                CH 1 · SUB ({speakers[0].lpfHz}Hz)
              </button>
              <button
                type="button"
                onClick={() => setSelectedSpkId(speakers[1].id)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono border ${
                  selectedSpk.id === speakers[1].id
                    ? 'console-accent-solid border-transparent'
                    : 'console-btn-surface text-slate-300'
                }`}
              >
                CH 2 · MAIN L ({speakers[1].hpfHz}Hz)
              </button>
              <button
                type="button"
                onClick={() => setConsoleModule('eq31')}
                className="px-2.5 py-1 rounded console-btn-surface text-[10px] font-mono text-amber-300"
              >
                Open Channel EQ →
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch overflow-hidden">
            {/* 5 Zone Crossover Buttons */}
            <div className="xl:col-span-3 flex flex-col justify-between gap-1.5">
              {speakers.map((spk, idx) => {
                const isSel = spk.id === selectedSpk.id;
                const bm = meters[spk.sourceBusId];
                return (
                  <button
                    key={spk.id}
                    type="button"
                    onClick={() => setSelectedSpkId(spk.id)}
                    className={`w-full rounded px-2.5 py-1.5 border flex items-center justify-between gap-2 text-left transition-colors ${
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
                      peakDbfs={(bm?.peakDbfs ?? -80) + spk.gainDb}
                      height={20}
                      width={6}
                      segments={5}
                    />
                  </button>
                );
              })}
            </div>

            {/* Active Crossover Multi-Band Bode Scope */}
            <div className="xl:col-span-5 dark-instrument-scope rounded-md p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                <span>ACTIVE CROSSOVER BODE (20 Hz – 20 kHz)</span>
                <span className="text-sky-300">{selectedSpk.family} · SYNCED {systemXoverFreq}Hz</span>
              </div>
              <svg viewBox="0 0 680 190" className="w-full flex-1 min-h-0">
                {[30, 60, 90, 120, 250, 500, 1000, 4000, 10000].map((hz) => {
                  const x =
                    ((Math.log10(Math.max(20, Math.min(20000, hz))) - Math.log10(20)) / 3) * 680;
                  return (
                    <g key={hz}>
                      <line x1={x} y1={0} x2={x} y2={190} stroke="rgba(148,163,184,0.12)" />
                      <text x={x + 3} y={182} fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono">
                        {hz >= 1000 ? `${hz / 1000}k` : hz}
                      </text>
                    </g>
                  );
                })}
                {[0, -12, -24].map((db) => {
                  const y = ((10 - db) / 46) * 190;
                  return (
                    <g key={db}>
                      <line
                        x1={0}
                        y1={y}
                        x2={680}
                        y2={y}
                        stroke={db === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(148,163,184,0.12)'}
                      />
                      <text x={5} y={y - 3} fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono">
                        {db}dB
                      </text>
                    </g>
                  );
                })}
                {fullXoverCurves.map((c) => (
                  <path
                    key={c.id}
                    d={c.path}
                    fill="none"
                    stroke={c.color}
                    strokeWidth={c.id === selectedSpk.id ? 3 : 1.4}
                    opacity={c.id === selectedSpk.id ? 1 : 0.4}
                  />
                ))}
              </svg>
            </div>

            {/* Active Crossover Sliders + Sub Deep-Bass Boost */}
            <div className="xl:col-span-4 console-panel rounded-md p-2.5 flex flex-col justify-between gap-1.5">
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
                <div className="grid grid-cols-2 gap-1">
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

              <HorizontalSlider
                label="SYNCED SUB/MAIN XOVER"
                value={systemXoverFreq}
                min={60}
                max={140}
                step={2}
                unit="Hz"
                accentColor="cyan"
                onChange={setSyncedCrossoverHz}
              />
              <HorizontalSlider
                label="ZONE GAIN"
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
                label={`DELAY (${(selectedSpk.delayMs * 0.343).toFixed(2)} m)`}
                value={selectedSpk.delayMs}
                min={0}
                max={80}
                step={0.2}
                unit="ms"
                accentColor="cyan"
                onChange={(v) => updateSpeaker(selectedSpk.id, { delayMs: v })}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODULE 4: IN-PLACE DYNAMICS, PREAMP & DUAL-CHANNEL SENDS (Zero Scroll) */}
      {consoleModule === 'dynamics' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-3 overflow-hidden">
          {[selectedChannel, partnerChannel].map((ch, idx) => {
            const m = meters[ch.id];
            return (
              <div
                key={ch.id}
                className="console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2.5 overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div>
                    <span className="text-[10px] font-mono text-amber-300 uppercase">
                      {idx === 0 ? '1ST CHANNEL FOCUS' : '2ND CHANNEL PAIR'}
                    </span>
                    <div className="text-sm font-semibold text-slate-100">
                      CH {String(ch.number).padStart(2, '0')} · {ch.name}
                    </div>
                  </div>
                  <select
                    aria-label={`Select Channel ${idx + 1}`}
                    value={ch.id}
                    onChange={(e) =>
                      idx === 0 ? selectChannelWithBank(e.target.value) : setSecondChannelId(e.target.value)
                    }
                    className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200"
                  >
                    {channels.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        CH {String(opt.number).padStart(2, '0')} · {opt.shortName}
                      </option>
                    ))}
                  </select>
                </div>

                <DualChannelVuBridge
                  inputRmsDbfs={m?.inputRmsDbfs ?? -80}
                  outputRmsDbfs={m?.rmsDbfs ?? -80}
                  inputPeakDbfs={m?.inputPeakDbfs ?? -80}
                  outputPeakDbfs={m?.peakDbfs ?? -80}
                />

                <div className="console-panel rounded p-2.5 grid grid-cols-4 gap-2">
                  <RotaryKnob
                    label="COMP THR"
                    value={ch.dynamics.compThresholdDb}
                    min={-40}
                    max={0}
                    step={0.5}
                    unit="dB"
                    size={38}
                    accentColor="emerald"
                    onChange={(v) =>
                      updateChannel(ch.id, { dynamics: { ...ch.dynamics, compThresholdDb: v } })
                    }
                  />
                  <RotaryKnob
                    label="RATIO"
                    value={ch.dynamics.compRatio}
                    min={1}
                    max={10}
                    step={0.5}
                    size={38}
                    accentColor="cyan"
                    formatValue={(v) => `${v.toFixed(1)}:1`}
                    onChange={(v) =>
                      updateChannel(ch.id, { dynamics: { ...ch.dynamics, compRatio: v } })
                    }
                  />
                  <RotaryKnob
                    label="GATE THR"
                    value={ch.dynamics.gateThresholdDb}
                    min={-75}
                    max={-20}
                    step={1}
                    unit="dB"
                    size={38}
                    accentColor="amber"
                    onChange={(v) =>
                      updateChannel(ch.id, { dynamics: { ...ch.dynamics, gateThresholdDb: v } })
                    }
                  />
                  <RotaryKnob
                    label="SW TRIM"
                    value={ch.softwareTrimDb}
                    min={-18}
                    max={18}
                    step={0.5}
                    bipolar
                    unit="dB"
                    size={38}
                    accentColor="cyan"
                    onChange={(v) => updateChannel(ch.id, { softwareTrimDb: v })}
                  />
                </div>

                <div className="console-panel rounded p-2.5 grid grid-cols-4 gap-2">
                  <RotaryKnob
                    label="MON 1"
                    value={ch.sends.mon1.levelDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={34}
                    accentColor="cyan"
                    onChange={(v) => updateChannelSend(ch.id, 'mon1', { levelDb: v, enabled: v > -55 })}
                  />
                  <RotaryKnob
                    label="MON 2"
                    value={ch.sends.mon2.levelDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={34}
                    accentColor="cyan"
                    onChange={(v) => updateChannelSend(ch.id, 'mon2', { levelDb: v, enabled: v > -55 })}
                  />
                  <RotaryKnob
                    label="FX REV"
                    value={ch.sends.fxReverb.levelDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={34}
                    accentColor="amber"
                    onChange={(v) => updateChannelSend(ch.id, 'fxReverb', { levelDb: v, enabled: v > -55 })}
                  />
                  <RotaryKnob
                    label="STREAM"
                    value={ch.sends.livestream.levelDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={34}
                    accentColor="emerald"
                    onChange={(v) =>
                      updateChannelSend(ch.id, 'livestream', { levelDb: v, enabled: v > -55 })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODULE 5: 4-SLOT HARDWARE DSP FX RACK (HALL, PLATE, BPM TAP DELAY, CHORUS) */}
      {consoleModule === 'fxrack' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5 overflow-hidden">
          {fxRack.map((slot) => {
            const fm = meters[slot.id];
            return (
              <div
                key={slot.id}
                className="console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-amber-300 uppercase">
                      FX SLOT {slot.slotNumber}
                    </div>
                    <div className="text-sm font-semibold text-slate-100 truncate">{slot.name}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ConsoleButton
                      label={slot.bypass ? 'BYPASSED' : slot.enabled ? 'ACTIVE' : 'OFF'}
                      size="xs"
                      color={slot.bypass ? 'crimson' : slot.enabled ? 'emerald' : 'amber'}
                      active={slot.enabled && !slot.bypass}
                      manualOnlyReason={volunteerLockReason}
                      onClick={() => updateFxSlot(slot.id, { bypass: !slot.bypass, enabled: true })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 console-well rounded p-2 shrink-0">
                  <div className="flex-1 space-y-1">
                    <label className="block text-[9px] font-mono text-slate-400">INPUT FEED BUS</label>
                    <select
                      disabled={isVolunteer}
                      value={slot.inputBusId}
                      onChange={(e) => updateFxSlot(slot.id, { inputBusId: e.target.value })}
                      className="w-full console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200 disabled:opacity-50"
                    >
                      {buses.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.shortName} · {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <LedMeter peakDbfs={fm?.peakDbfs ?? -80} height={46} width={8} segments={8} label="RTN" />
                </div>

                <div className="console-panel rounded p-2.5 grid grid-cols-2 gap-3 items-center flex-1">
                  <RotaryKnob
                    label="RETURN"
                    value={slot.returnGainDb}
                    min={-60}
                    max={10}
                    step={0.5}
                    unit="dB"
                    size={42}
                    accentColor="emerald"
                    manualOnlyReason={volunteerLockReason}
                    onChange={(v) => updateFxSlot(slot.id, { returnGainDb: v })}
                  />

                  {(slot.type === 'hall-reverb' || slot.type === 'plate-reverb') && (
                    <>
                      <RotaryKnob
                        label="DECAY"
                        value={slot.decaySec}
                        min={0.4}
                        max={6.5}
                        step={0.1}
                        unit="s"
                        size={42}
                        accentColor="amber"
                        manualOnlyReason={volunteerLockReason}
                        onChange={(v) => updateFxSlot(slot.id, { decaySec: v })}
                      />
                      <RotaryKnob
                        label="PRE-DLY"
                        value={slot.preDelayMs}
                        min={0}
                        max={120}
                        step={2}
                        unit="ms"
                        size={42}
                        accentColor="cyan"
                        manualOnlyReason={volunteerLockReason}
                        onChange={(v) => updateFxSlot(slot.id, { preDelayMs: v })}
                      />
                      <RotaryKnob
                        label="DAMPING"
                        value={slot.dampingHz}
                        min={1500}
                        max={14000}
                        step={250}
                        size={42}
                        accentColor="cyan"
                        manualOnlyReason={volunteerLockReason}
                        formatValue={(v) => `${(v / 1000).toFixed(1)}k`}
                        onChange={(v) => updateFxSlot(slot.id, { dampingHz: v })}
                      />
                    </>
                  )}

                  {slot.type === 'tap-delay' && (
                    <>
                      <RotaryKnob
                        label="BPM"
                        value={slot.bpm}
                        min={50}
                        max={180}
                        step={1}
                        size={42}
                        accentColor="amber"
                        manualOnlyReason={volunteerLockReason}
                        onChange={(v) => {
                          const quarterMs = 60000 / v;
                          const mult =
                            slot.subdivision === '1/8' ? 0.5 : slot.subdivision === 'dotted-1/8' ? 0.75 : 1;
                          updateFxSlot(slot.id, { bpm: v, delayTimeMs: Math.round(quarterMs * mult) });
                        }}
                      />
                      <RotaryKnob
                        label="FEEDBACK"
                        value={slot.feedbackPct}
                        min={0}
                        max={80}
                        step={2}
                        unit="%"
                        size={42}
                        accentColor="rose"
                        manualOnlyReason={volunteerLockReason}
                        onChange={(v) => updateFxSlot(slot.id, { feedbackPct: v })}
                      />
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-mono text-slate-400 text-center">SUBDIV</span>
                        <div className="grid grid-cols-3 gap-0.5">
                          {(['1/4', '1/8', 'dotted-1/8'] as const).map((sub) => (
                            <button
                              key={sub}
                              type="button"
                              disabled={isVolunteer}
                              onClick={() => {
                                const quarterMs = 60000 / slot.bpm;
                                const mult = sub === '1/8' ? 0.5 : sub === 'dotted-1/8' ? 0.75 : 1;
                                updateFxSlot(slot.id, {
                                  subdivision: sub,
                                  delayTimeMs: Math.round(quarterMs * mult),
                                });
                              }}
                              className={`py-1 rounded text-[8.5px] font-mono border disabled:opacity-40 ${
                                slot.subdivision === sub
                                  ? 'console-accent-solid border-transparent'
                                  : 'console-btn-surface text-slate-300'
                              }`}
                            >
                              {sub === 'dotted-1/8' ? 'D1/8' : sub}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {slot.type === 'vocal-chorus' && (
                    <>
                      <RotaryKnob
                        label="RATE"
                        value={slot.chorusRateHz}
                        min={0.1}
                        max={4.0}
                        step={0.1}
                        unit="Hz"
                        size={42}
                        accentColor="cyan"
                        manualOnlyReason={volunteerLockReason}
                        onChange={(v) => updateFxSlot(slot.id, { chorusRateHz: v })}
                      />
                      <RotaryKnob
                        label="DEPTH"
                        value={slot.chorusDepthPct}
                        min={5}
                        max={100}
                        step={5}
                        unit="%"
                        size={42}
                        accentColor="amber"
                        manualOnlyReason={volunteerLockReason}
                        onChange={(v) => updateFxSlot(slot.id, { chorusDepthPct: v })}
                      />
                      <RotaryKnob
                        label="BASE DLY"
                        value={slot.delayTimeMs}
                        min={6}
                        max={40}
                        step={1}
                        unit="ms"
                        size={42}
                        accentColor="cyan"
                        manualOnlyReason={volunteerLockReason}
                        onChange={(v) => updateFxSlot(slot.id, { delayTimeMs: v })}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODULE 6: N×M ARCHITECTURAL ZONE MATRIX MIXER */}
      {consoleModule === 'matrix' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5 overflow-hidden">
          {matrixZones.map((zone) => {
            const zm = meters[zone.id];
            return (
              <div
                key={zone.id}
                className="console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-sky-300 uppercase">{zone.shortName} · {zone.physicalOut}</div>
                    <div className="text-sm font-semibold text-slate-100 truncate">{zone.name}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <LedMeter peakDbfs={zm?.peakDbfs ?? -80} height={32} width={7} segments={6} />
                    <ConsoleButton
                      label={zone.mute ? 'MUTED' : 'LIVE'}
                      size="xs"
                      color={zone.mute ? 'crimson' : 'emerald'}
                      active={!zone.mute}
                      manualOnlyReason={volunteerLockReason}
                      onClick={() => updateMatrixZone(zone.id, { mute: !zone.mute })}
                    />
                  </div>
                </div>

                <div className="console-panel rounded p-2 space-y-1.5 shrink-0">
                  <HorizontalSlider
                    label="ZONE MASTER"
                    value={zone.masterGainDb}
                    min={-75}
                    max={10}
                    step={0.5}
                    unit="dB"
                    accentColor="emerald"
                    onChange={(v) => !isVolunteer && updateMatrixZone(zone.id, { masterGainDb: v })}
                  />
                  <HorizontalSlider
                    label={`ALIGN DELAY (${(zone.delayMs * 0.343).toFixed(1)} m)`}
                    value={zone.delayMs}
                    min={0}
                    max={120}
                    step={0.5}
                    unit="ms"
                    accentColor="cyan"
                    onChange={(v) => !isVolunteer && updateMatrixZone(zone.id, { delayMs: v })}
                  />
                </div>

                <div className="flex-1 min-h-0 console-well rounded p-2 overflow-y-auto space-y-1.5">
                  <div className="text-[9px] font-mono text-slate-400 uppercase">BUS → ZONE SEND MATRIX</div>
                  {buses.map((b) => {
                    const sendDb = zone.sourceGains[b.id] ?? -75;
                    return (
                      <div key={b.id} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[9.5px] font-mono">
                          <span className="text-slate-200 truncate">{b.shortName}</span>
                          <span className="tabular-nums text-amber-300">
                            {sendDb <= -70 ? '-∞ dB' : `${sendDb > 0 ? '+' : ''}${sendDb.toFixed(1)} dB`}
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label={`${zone.name} send from ${b.shortName}`}
                          disabled={isVolunteer}
                          min={-75}
                          max={10}
                          step={0.5}
                          value={sendDb}
                          onChange={(e) =>
                            updateMatrixZoneSource(zone.id, b.id, Number.parseFloat(e.target.value))
                          }
                          className="w-full accent-sky-400 h-1.5 cursor-pointer disabled:opacity-45"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
