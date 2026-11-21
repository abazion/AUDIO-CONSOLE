import React, { useState } from 'react';
import {
  AlertTriangle,
  GitBranch,
  Sliders,
  Grid,
  Cable,
  Plus,
  Trash2,
  MonitorSpeaker,
  Upload,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { audioEngine } from '../../engine/webAudioEngine';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';
import { MotorizedFader } from '../hardware/MotorizedFader';
import { HorizontalSlider } from '../hardware/HorizontalSlider';

const BUILTIN_SEND_KEY_BY_BUS_ID: Record<string, string> = {
  'bus-mon1': 'mon1',
  'bus-mon2': 'mon2',
  'bus-iem': 'iemChoir',
  'bus-fx': 'fxReverb',
  'bus-stream': 'livestream',
};

export const UniversalRoutingWorkspace: React.FC = () => {
  const {
    channels,
    buses,
    speakers,
    virtualCables,
    meters,
    updateChannel,
    updateChannelSend,
    updateBus,
    addChannel,
    addBus,
    removeBus,
    addVirtualCable,
    updateVirtualCable,
    removeVirtualCable,
    attachVirtualCableToChannel,
    attachExternalTabToVirtualCable,
    attachFileToVirtualCable,
    openSignalJourney,
    graphVersion,
    hardwareProfile,
  } = useAudioConsole();

  const [selectedSourceId, setSelectedSourceId] = useState<string>(channels[0]?.id ?? '');
  const [routingTab, setRoutingTab] = useState<'matrix' | 'preamp_buses' | 'virtual_cables'>('matrix');
  const [cycleWarning, setCycleWarning] = useState<string | null>(null);
  const [addingBus, setAddingBus] = useState(false);
  const [newBusName, setNewBusName] = useState('');
  const [newBusKind, setNewBusKind] = useState<'monitor' | 'sub' | 'broadcast' | 'fx'>('monitor');
  const [newCableName, setNewCableName] = useState('');
  const [cableTargetChannel, setCableTargetChannel] = useState<Record<string, string>>({});
  const [cableMessage, setCableMessage] = useState<string | null>(null);

  const selectedCh = channels.find((c) => c.id === selectedSourceId) ?? channels[0];
  const isManualPre = hardwareProfile.devices[0]?.capabilities.preampGain === 'manual';

  const testCycleRejection = () => {
    const ch1 = channels[0];
    const cyclicCable = virtualCables.find((vc) =>
      ch1 ? audioEngine.wouldVirtualCableCreateCycle(vc.id, ch1.id, channels, virtualCables) : false
    );
    if (cyclicCable && ch1) {
      setCycleWarning(
        `SignalGraph Cycle Guard Active: "${cyclicCable.name}" cannot patch into CH ${String(ch1.number).padStart(2, '0')} (${ch1.shortName}) because CH ${String(ch1.number).padStart(2, '0')} feeds ${cyclicCable.sourceLabel}. Graph v${graphVersion} protected.`
      );
    } else {
      setCycleWarning(
        `SignalGraph Cycle Guard Verified (Graph v${graphVersion}): Directed acyclic graph intact across ${channels.length} Inputs × ${buses.length} Buses × ${virtualCables.length} Virtual Cables.`
      );
    }
    window.setTimeout(() => setCycleWarning(null), 5000);
  };

  const handleCreateBus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBusName.trim()) return;
    addBus(newBusName.trim(), newBusKind);
    setNewBusName('');
    setAddingBus(false);
  };

  const handleRouteCableToChannel = async (cableId: string) => {
    const targetChId = cableTargetChannel[cableId] ?? selectedCh?.id ?? channels[0]?.id;
    if (!targetChId) return;
    const res = await attachVirtualCableToChannel(targetChId, cableId);
    if (!res.ok) {
      setCycleWarning(res.error ?? 'Routing blocked by feedback loop guard.');
      window.setTimeout(() => setCycleWarning(null), 5000);
    } else {
      const targetCh = channels.find((c) => c.id === targetChId);
      setCableMessage(
        `Patched Virtual Cable to CH ${String(targetCh?.number ?? 1).padStart(2, '0')} (${targetCh?.shortName ?? targetChId}).`
      );
      window.setTimeout(() => setCableMessage(null), 3500);
    }
  };

  const getBusAssignmentState = (ch: (typeof channels)[number], busId: string) => {
    if (busId === 'bus-main') {
      return {
        active: ch.assignMain,
        toggle: () => updateChannel(ch.id, { assignMain: !ch.assignMain }),
        activeClass: 'bg-amber-500 text-slate-950 border-amber-300',
      };
    }
    if (busId === 'bus-sub') {
      return {
        active: ch.assignSub,
        toggle: () => updateChannel(ch.id, { assignSub: !ch.assignSub }),
        activeClass: 'bg-emerald-500 text-slate-950 border-emerald-300',
      };
    }
    if (busId === 'bus-stream') {
      return {
        active: ch.assignBroadcast,
        toggle: () => updateChannel(ch.id, { assignBroadcast: !ch.assignBroadcast }),
        activeClass: 'bg-emerald-400 text-slate-950 border-emerald-200',
      };
    }
    const sendKey = BUILTIN_SEND_KEY_BY_BUS_ID[busId] ?? busId;
    const sendCfg = ch.sends[sendKey];
    return {
      active: Boolean(sendCfg?.enabled),
      toggle: () => updateChannelSend(ch.id, sendKey, { enabled: !sendCfg?.enabled }),
      activeClass:
        busId === 'bus-fx'
          ? 'bg-amber-400 text-slate-950 border-amber-200'
          : 'bg-sky-500 text-slate-950 border-sky-300',
    };
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Top Signal Flow Header + Module Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              Universal Routing &amp; Built-In Virtual Cables
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              Graph v{graphVersion} · {channels.length} Inputs × {buses.length} Buses × {speakers.length} Outputs · {virtualCables.length} VACs
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'matrix', label: 'CHANNEL → BUS MATRIX', icon: Grid },
            { id: 'virtual_cables', label: `VIRTUAL CABLES (${virtualCables.length})`, icon: Cable },
            { id: 'preamp_buses', label: 'PREAMP & BUS OUTPUTS', icon: Sliders },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setRoutingTab(t.id as typeof routingTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  routingTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => addChannel(`Input ${channels.length + 1}`, 'media')}
            className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/15 text-[10px] font-mono text-emerald-300 whitespace-nowrap flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>IN</span>
          </button>
          <button
            type="button"
            onClick={() => setAddingBus((v) => !v)}
            className="px-2 py-1 rounded border border-sky-500/40 bg-sky-500/15 text-[10px] font-mono text-sky-300 whitespace-nowrap flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>BUS</span>
          </button>
          <button
            type="button"
            onClick={testCycleRejection}
            className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-amber-300 whitespace-nowrap"
          >
            Loop Guard
          </button>
          {selectedCh && (
            <button
              type="button"
              onClick={() => openSignalJourney(selectedCh.id)}
              className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 whitespace-nowrap"
            >
              Trace CH {String(selectedCh.number).padStart(2, '0')}
            </button>
          )}
        </div>
      </div>

      {addingBus && (
        <form
          onSubmit={handleCreateBus}
          className="console-panel rounded-md px-3 py-2 flex flex-wrap items-center gap-2 border border-sky-500/40 shrink-0"
        >
          <input
            type="text"
            value={newBusName}
            onChange={(e) => setNewBusName(e.target.value)}
            placeholder="New bus name (e.g. Choir Floor Wedge, Lobby Matrix, Recording Stem)"
            className="flex-1 min-w-[200px] console-well border border-white/15 rounded px-2 py-1 text-xs font-mono text-slate-100"
          />
          <select
            value={newBusKind}
            onChange={(e) => setNewBusKind(e.target.value as typeof newBusKind)}
            className="console-btn-surface rounded px-2 py-1 text-xs font-mono text-slate-200"
          >
            <option value="monitor">Monitor Aux Bus</option>
            <option value="sub">Subwoofer / LF Bus</option>
            <option value="broadcast">Broadcast / Stream Bus</option>
            <option value="fx">FX Return Bus</option>
          </select>
          <button type="submit" className="px-3 py-1 rounded bg-sky-500 text-slate-950 text-xs font-mono font-bold">
            CREATE BUS
          </button>
          <button
            type="button"
            onClick={() => setAddingBus(false)}
            className="px-2 py-1 rounded console-btn-surface text-xs font-mono text-slate-400"
          >
            Cancel
          </button>
        </form>
      )}

      {cycleWarning && (
        <div className="px-3 py-1.5 rounded bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{cycleWarning}</span>
        </div>
      )}

      {cableMessage && (
        <div className="px-3 py-1.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-xs font-mono text-emerald-200 shrink-0">
          {cableMessage}
        </div>
      )}

      {/* TAB 1: DYNAMIC CROSSPOINT MATRIX */}
      {routingTab === 'matrix' && selectedCh && (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="lg:col-span-9 console-chassis rounded-lg border border-white/10 p-2.5 flex flex-col gap-1.5 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1 shrink-0">
              <span className="text-[11px] font-mono font-semibold text-sky-300 uppercase">
                Dynamic Input → Bus Crosspoint Matrix ({channels.length} Inputs × {buses.length} Buses)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Selected: CH {String(selectedCh.number).padStart(2, '0')} · {selectedCh.shortName}
              </span>
            </div>

            <div className="flex-1 min-h-0 console-well rounded p-2 overflow-auto">
              <table className="w-full border-collapse text-[10px] font-mono">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="text-left py-1 pl-1 sticky left-0 bg-[#0b0f16] z-10 min-w-[140px]">
                      INPUT STRIP
                    </th>
                    {buses.map((bus) => (
                      <th key={bus.id} className="text-center py-1 px-1 min-w-[54px]">
                        <div className="flex items-center justify-center gap-0.5">
                          <span className="truncate max-w-[56px]" title={bus.name}>
                            {bus.shortName}
                          </span>
                          {bus.id !== 'bus-main' && (
                            <button
                              type="button"
                              onClick={() => removeBus(bus.id)}
                              title={`Remove ${bus.name}`}
                              className="text-slate-600 hover:text-rose-400"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch) => {
                    const isSel = ch.id === selectedCh.id;
                    return (
                      <tr
                        key={ch.id}
                        onClick={() => setSelectedSourceId(ch.id)}
                        className={`cursor-pointer border-b border-white/[0.04] ${
                          isSel ? 'console-accent-active' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="py-1 pl-1 pr-2 sticky left-0 bg-[#0b0f16]/95">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-amber-300 font-semibold">
                              {String(ch.number).padStart(2, '0')}
                            </span>
                            <span className="text-slate-100 truncate">{ch.shortName}</span>
                          </div>
                        </td>
                        {buses.map((bus) => {
                          const node = getBusAssignmentState(ch, bus.id);
                          return (
                            <td key={bus.id} className="py-0.5 px-1 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  node.toggle();
                                }}
                                className={`w-full h-5 rounded-[3px] border text-[10px] font-mono font-bold transition-all flex items-center justify-center ${
                                  node.active
                                    ? `${node.activeClass} shadow-[0_0_6px_rgba(56,189,248,0.28)]`
                                    : 'console-btn-surface text-slate-500'
                                }`}
                              >
                                {node.active ? '+' : '·'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right 3 Cols: Selected Channel Input Trim + Bus Outputs */}
          <div className="lg:col-span-3 console-chassis rounded-lg border border-white/10 p-2.5 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="console-panel rounded p-2 space-y-2 shrink-0">
              <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/10 pb-1">
                <span className="text-amber-300 font-semibold">
                  CH {String(selectedCh.number).padStart(2, '0')} · {selectedCh.shortName}
                </span>
                <span className="text-slate-400 truncate max-w-[110px]">{selectedCh.physicalPort}</span>
              </div>
              <div className="flex items-center justify-around">
                <RotaryKnob
                  label={isManualPre ? 'DESK' : 'HA GAIN'}
                  value={selectedCh.hardwarePreampDb}
                  min={0}
                  max={60}
                  step={1}
                  unit="dB"
                  size={38}
                  accentColor="rose"
                  manualOnlyReason={isManualPre ? 'Physical preamp pot on hardware desk' : undefined}
                  onChange={(v) => updateChannel(selectedCh.id, { hardwarePreampDb: v })}
                />
                <RotaryKnob
                  label="SW TRIM"
                  value={selectedCh.softwareTrimDb}
                  min={-18}
                  max={18}
                  step={0.5}
                  bipolar
                  unit="dB"
                  size={38}
                  accentColor="cyan"
                  onChange={(v) => updateChannel(selectedCh.id, { softwareTrimDb: v })}
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-1.5 pr-0.5">
              {buses.map((bus) => {
                const bm = meters[bus.id];
                return (
                  <div
                    key={bus.id}
                    className="console-panel rounded p-1.5 flex flex-col items-center justify-between gap-1"
                  >
                    <span className="text-[9px] font-mono font-semibold text-slate-200 truncate w-full text-center">
                      {bus.shortName}
                    </span>
                    <div className="flex items-start gap-1">
                      <MotorizedFader
                        valueDb={bus.faderDb}
                        onChange={(db) => updateBus(bus.id, { faderDb: db })}
                        height={92}
                        showScale={false}
                        accentColor={bus.kind === 'main' ? 'amber' : 'cyan'}
                      />
                      <LedMeter
                        peakDbfs={bm?.peakDbfs ?? -80}
                        peakHoldDbfs={bm?.peakHoldDbfs ?? -80}
                        height={92}
                        width={6}
                        segments={12}
                      />
                    </div>
                    <ConsoleButton
                      label={bus.mute ? 'M' : 'ON'}
                      size="xs"
                      color={bus.mute ? 'crimson' : 'emerald'}
                      active={!bus.mute}
                      fullWidth
                      onClick={() => updateBus(bus.id, { mute: !bus.mute })}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BUILT-IN VIRTUAL AUDIO CABLES (NO EXTERNAL VB-CABLE NEEDED) */}
      {routingTab === 'virtual_cables' && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border border-white/10 p-3 flex flex-col gap-2.5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
            <div>
              <h2 className="text-xs font-mono font-semibold text-emerald-300 uppercase">
                Built-In Virtual Audio Cables (Zero External Driver Install Needed)
              </h2>
              <p className="text-[10px] font-mono text-slate-400">
                Isolate browser tabs, OS playback apps, media decks, buses, or channel taps onto dedicated virtual cables and patch each onto its own independent mixer strip.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newCableName}
                onChange={(e) => setNewCableName(e.target.value)}
                placeholder="New cable name (e.g. YouTube Lyrics, Zoom Caller)..."
                className="console-well border border-white/15 rounded px-2 py-1 text-xs font-mono text-slate-100 w-56"
              />
              <button
                type="button"
                onClick={() => {
                  addVirtualCable(newCableName.trim() || undefined, 'idle');
                  setNewCableName('');
                }}
                className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 text-[10px] font-mono font-bold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>CREATE CABLE</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 pr-1 content-start">
            {virtualCables.map((vc) => {
              const vcMeter = meters[vc.id];
              const targetChId = cableTargetChannel[vc.id] ?? selectedCh?.id ?? channels[0]?.id ?? '';
              const wouldLoop =
                targetChId ? audioEngine.wouldVirtualCableCreateCycle(vc.id, targetChId, channels, virtualCables) : false;

              return (
                <div key={vc.id} className="console-panel rounded-md p-3 border border-white/10 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-bold text-emerald-300 truncate">{vc.name}</div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        Source: {vc.sourceKind.toUpperCase()} · {vc.sourceLabel}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <LedMeter
                        peakDbfs={vcMeter?.peakDbfs ?? -80}
                        peakHoldDbfs={vcMeter?.peakHoldDbfs ?? -80}
                        height={28}
                        width={6}
                        segments={6}
                      />
                      <button
                        type="button"
                        onClick={() => removeVirtualCable(vc.id)}
                        className="p-1 rounded console-btn-surface text-rose-400 hover:text-rose-300"
                        title="Delete virtual cable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Source Selection */}
                  <div className="console-well rounded p-2 space-y-1.5">
                    <div className="text-[9px] font-mono text-slate-400 uppercase">Cable Feed Source</div>
                    <div className="grid grid-cols-2 gap-1">
                      <select
                        value={vc.sourceKind === 'bus' ? vc.sourceId ?? '' : ''}
                        onChange={(e) => {
                          const b = buses.find((item) => item.id === e.target.value);
                          if (b) {
                            updateVirtualCable(vc.id, {
                              sourceKind: 'bus',
                              sourceId: b.id,
                              sourceLabel: b.name,
                              active: true,
                            });
                          }
                        }}
                        className="console-btn-surface rounded px-1.5 py-1 text-[10px] font-mono text-slate-200"
                      >
                        <option value="">Tap Bus...</option>
                        {buses.map((b) => (
                          <option key={b.id} value={b.id}>
                            Bus: {b.shortName}
                          </option>
                        ))}
                      </select>
                      <select
                        value={vc.sourceKind === 'channel' ? vc.sourceId ?? '' : ''}
                        onChange={(e) => {
                          const c = channels.find((item) => item.id === e.target.value);
                          if (c) {
                            updateVirtualCable(vc.id, {
                              sourceKind: 'channel',
                              sourceId: c.id,
                              sourceLabel: `CH ${String(c.number).padStart(2, '0')} · ${c.shortName}`,
                              active: true,
                            });
                          }
                        }}
                        className="console-btn-surface rounded px-1.5 py-1 text-[10px] font-mono text-slate-200"
                      >
                        <option value="">Tap Channel...</option>
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            CH {String(c.number).padStart(2, '0')} · {c.shortName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => void attachExternalTabToVirtualCable(vc.id)}
                        className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 flex items-center justify-center gap-1"
                      >
                        <MonitorSpeaker className="w-3 h-3" />
                        <span>Capture Tab/App</span>
                      </button>
                      <label className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-amber-300 flex items-center justify-center gap-1 cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>Audio File</span>
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void attachFileToVirtualCable(vc.id, f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Gain & Monitor Controls */}
                  <HorizontalSlider
                    label="CABLE GAIN"
                    value={vc.gainDb}
                    min={-24}
                    max={12}
                    step={0.5}
                    bipolar
                    unit="dB"
                    accentColor="emerald"
                    onChange={(v) => updateVirtualCable(vc.id, { gainDb: v })}
                  />

                  <div className="grid grid-cols-2 gap-1.5">
                    <ConsoleButton
                      label={vc.active ? 'CABLE ACTIVE' : 'MUTED'}
                      size="xs"
                      color={vc.active ? 'emerald' : 'crimson'}
                      active={vc.active}
                      onClick={() => updateVirtualCable(vc.id, { active: !vc.active })}
                    />
                    <ConsoleButton
                      label={vc.monitorToMaster ? 'MON MASTER ON' : 'MON ISOLATED'}
                      size="xs"
                      color="cyan"
                      active={vc.monitorToMaster}
                      onClick={() => updateVirtualCable(vc.id, { monitorToMaster: !vc.monitorToMaster })}
                    />
                  </div>

                  {/* Route Cable onto Individual Channel Strip */}
                  <div className="console-well rounded p-1.5 flex items-center gap-1.5">
                    <select
                      value={targetChId}
                      onChange={(e) =>
                        setCableTargetChannel((prev) => ({ ...prev, [vc.id]: e.target.value }))
                      }
                      className="flex-1 min-w-0 console-btn-surface rounded px-1.5 py-1 text-[10px] font-mono text-slate-200"
                    >
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          CH {String(c.number).padStart(2, '0')} · {c.shortName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleRouteCableToChannel(vc.id)}
                      className={`px-2 py-1 rounded text-[10px] font-mono font-bold shrink-0 ${
                        wouldLoop
                          ? 'bg-rose-500/20 border border-rose-500/50 text-rose-300'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {wouldLoop ? 'LOOP GUARD' : 'PATCH → CH'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Detailed Input Preamp, Speaker Output Connector Bay, & Dynamic Bus Master Bank */}
      {routingTab === 'preamp_buses' && selectedCh && (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="lg:col-span-4 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
              <span className="text-xs font-mono font-semibold text-amber-300 uppercase">
                Input Preamp · CH {String(selectedCh.number).padStart(2, '0')}
              </span>
              <select
                value={selectedCh.id}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="console-btn-surface rounded px-2 py-0.5 text-[10px] font-mono text-slate-200"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    CH {String(c.number).padStart(2, '0')} · {c.shortName}
                  </option>
                ))}
              </select>
            </div>

            <AnalogVuMeter
              label={`IN ${String(selectedCh.number).padStart(2, '0')} · ${selectedCh.shortName}`}
              levelDbfs={meters[selectedCh.id]?.inputRmsDbfs ?? -80}
              peakLed={meters[selectedCh.id]?.clipping}
            />

            <div className="console-panel rounded p-2.5 flex items-center justify-around">
              <RotaryKnob
                label={isManualPre ? 'DESK' : 'HA GAIN'}
                value={selectedCh.hardwarePreampDb}
                min={0}
                max={60}
                step={1}
                unit="dB"
                size={44}
                accentColor="rose"
                manualOnlyReason={isManualPre ? 'Physical preamp pot on hardware desk' : undefined}
                onChange={(v) => updateChannel(selectedCh.id, { hardwarePreampDb: v })}
              />
              <RotaryKnob
                label="SW TRIM"
                value={selectedCh.softwareTrimDb}
                min={-18}
                max={18}
                step={0.5}
                bipolar
                unit="dB"
                size={44}
                accentColor="cyan"
                onChange={(v) => updateChannel(selectedCh.id, { softwareTrimDb: v })}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 shrink-0">
              <ConsoleButton
                label="+48V"
                size="xs"
                color="crimson"
                active={selectedCh.phantom48v}
                manualOnlyReason={isManualPre ? 'Manual desk switch' : undefined}
                onClick={() => updateChannel(selectedCh.id, { phantom48v: !selectedCh.phantom48v })}
              />
              <ConsoleButton
                label="Ø POL"
                size="xs"
                color="cyan"
                active={selectedCh.polarityInvert}
                onClick={() => updateChannel(selectedCh.id, { polarityInvert: !selectedCh.polarityInvert })}
              />
              <ConsoleButton
                label="HPF"
                size="xs"
                color="amber"
                active={selectedCh.hpfEnabled}
                onClick={() => updateChannel(selectedCh.id, { hpfEnabled: !selectedCh.hpfEnabled })}
              />
            </div>

            <div className="console-well rounded p-2 space-y-1 flex-1 min-h-0 overflow-y-auto">
              <div className="text-[9px] font-mono text-slate-400 uppercase">
                Bus → Speaker Physical Connector Bay ({speakers.length})
              </div>
              {speakers.map((spk) => {
                const bus = buses.find((b) => b.id === spk.sourceBusId);
                return (
                  <button
                    key={spk.id}
                    type="button"
                    onClick={() => openSignalJourney(spk.id)}
                    className="w-full rounded console-btn-surface px-2 py-1 flex items-center justify-between text-[10px] font-mono"
                  >
                    <span className="text-amber-300">{bus?.shortName ?? '—'}</span>
                    <span className="text-slate-300 truncate mx-1">→ {spk.physicalConnector}</span>
                    <span className={spk.connectorVerified ? 'text-emerald-400' : 'text-rose-400'}>
                      {spk.connectorVerified ? '●' : '○'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-8 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
              <span className="text-xs font-mono font-semibold text-emerald-300 uppercase">
                {buses.length}-Bus Master Output Bank &amp; Meter Bridge
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                STAGE: INPUT → PREAMP → EQ → DYN → CROSSPOINT → BUSES → XOVER → OUTPUTS
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-3 lg:grid-cols-6 gap-2 pr-0.5">
              {buses.map((bus) => {
                const bm = meters[bus.id];
                return (
                  <div
                    key={bus.id}
                    className="console-panel rounded p-2 flex flex-col items-center justify-between gap-1.5"
                  >
                    <span className="text-[10px] font-mono font-semibold text-slate-200 truncate w-full text-center">
                      {bus.shortName}
                    </span>
                    <div className="flex items-start gap-1">
                      <MotorizedFader
                        valueDb={bus.faderDb}
                        onChange={(db) => updateBus(bus.id, { faderDb: db })}
                        height={170}
                        showScale={false}
                        accentColor={bus.kind === 'main' ? 'amber' : 'cyan'}
                      />
                      <LedMeter
                        peakDbfs={bm?.peakDbfs ?? -80}
                        peakHoldDbfs={bm?.peakHoldDbfs ?? -80}
                        height={170}
                        width={8}
                        segments={16}
                      />
                    </div>
                    <ConsoleButton
                      label={bus.mute ? 'MUTED' : 'ACTIVE'}
                      size="xs"
                      color={bus.mute ? 'crimson' : 'emerald'}
                      active={!bus.mute}
                      fullWidth
                      onClick={() => updateBus(bus.id, { mute: !bus.mute })}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
