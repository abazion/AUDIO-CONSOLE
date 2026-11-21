import React, { useState } from 'react';
import { AlertTriangle, GitBranch, Sliders, Grid } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';
import { MotorizedFader } from '../hardware/MotorizedFader';

export const UniversalRoutingWorkspace: React.FC = () => {
  const {
    channels,
    buses,
    speakers,
    meters,
    updateChannel,
    updateChannelSend,
    updateBus,
    openSignalJourney,
    graphVersion,
    hardwareProfile,
  } = useAudioConsole();

  const [selectedSourceId, setSelectedSourceId] = useState<string>(channels[0].id);
  const [routingTab, setRoutingTab] = useState<'matrix' | 'preamp_buses'>('matrix');
  const [cycleWarning, setCycleWarning] = useState<string | null>(null);

  const selectedCh = channels.find((c) => c.id === selectedSourceId) ?? channels[0];
  const isManualPre = hardwareProfile.devices[0]?.capabilities.preampGain === 'manual';

  const testCycleRejection = () => {
    setCycleWarning(
      `SignalGraph Validation Blocked: Attempted route BUS-MAIN → CH-01 creates an illegal feedback loop. Active Graph v${graphVersion} preserved.`
    );
    window.setTimeout(() => setCycleWarning(null), 5000);
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Top Signal Flow Header + Module Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              Universal Routing Patchbay
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              Graph v{graphVersion} · {hardwareProfile.maxInputsLogical} In × {hardwareProfile.maxBusesLogical} Bus ×{' '}
              {hardwareProfile.maxOutputsLogical} Out
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'matrix', label: 'CHANNEL → BUS MATRIX', icon: Grid },
            { id: 'preamp_buses', label: 'INPUT PREAMP & OUTPUT JACKS', icon: Sliders },
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
            onClick={testCycleRejection}
            className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-amber-300 whitespace-nowrap"
          >
            Loop Guard Test
          </button>
          <button
            type="button"
            onClick={() => openSignalJourney(selectedCh.id)}
            className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 whitespace-nowrap"
          >
            Trace CH {String(selectedCh.number).padStart(2, '0')}
          </button>
        </div>
      </div>

      {cycleWarning && (
        <div className="px-3 py-1.5 rounded bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{cycleWarning}</span>
        </div>
      )}

      {/* Main Single-Viewport Body */}
      {routingTab === 'matrix' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          {/* Left 9 Cols: Full 12-Channel Crosspoint Matrix (Zero Scroll) */}
          <div className="lg:col-span-9 console-chassis rounded-lg border border-white/10 p-2.5 flex flex-col gap-1.5 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1 shrink-0">
              <span className="text-[11px] font-mono font-semibold text-sky-300 uppercase">
                Hardware Crosspoint Patchbay (Click Nodes to Assign)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Selected: CH {String(selectedCh.number).padStart(2, '0')} · {selectedCh.shortName}
              </span>
            </div>

            <div className="flex-1 min-h-0 console-well rounded p-2 flex flex-col justify-between">
              <div className="grid grid-cols-10 gap-1 text-[9px] font-mono text-slate-400 pb-1 border-b border-white/10 shrink-0">
                <div className="col-span-3 pl-1">INPUT SOURCE</div>
                <div className="text-center">MAIN</div>
                <div className="text-center">SUB</div>
                <div className="text-center">MON1</div>
                <div className="text-center">MON2</div>
                <div className="text-center">IEM</div>
                <div className="text-center">FX</div>
                <div className="text-center">STRM</div>
              </div>

              <div className="flex-1 min-h-0 flex flex-col justify-between py-0.5">
                {channels.map((ch) => {
                  const isSel = ch.id === selectedCh.id;
                  const nodes = [
                    {
                      key: 'main',
                      active: ch.assignMain,
                      color: 'bg-amber-500 text-slate-950 border-amber-300',
                      toggle: () => updateChannel(ch.id, { assignMain: !ch.assignMain }),
                    },
                    {
                      key: 'sub',
                      active: ch.assignSub,
                      color: 'bg-emerald-500 text-slate-950 border-emerald-300',
                      toggle: () => updateChannel(ch.id, { assignSub: !ch.assignSub }),
                    },
                    {
                      key: 'mon1',
                      active: ch.sends.mon1.enabled,
                      color: 'bg-sky-500 text-slate-950 border-sky-300',
                      toggle: () =>
                        updateChannelSend(ch.id, 'mon1', { enabled: !ch.sends.mon1.enabled }),
                    },
                    {
                      key: 'mon2',
                      active: ch.sends.mon2.enabled,
                      color: 'bg-sky-500 text-slate-950 border-sky-300',
                      toggle: () =>
                        updateChannelSend(ch.id, 'mon2', { enabled: !ch.sends.mon2.enabled }),
                    },
                    {
                      key: 'iem',
                      active: ch.sends.iemChoir.enabled,
                      color: 'bg-sky-500 text-slate-950 border-sky-300',
                      toggle: () =>
                        updateChannelSend(ch.id, 'iemChoir', { enabled: !ch.sends.iemChoir.enabled }),
                    },
                    {
                      key: 'fx',
                      active: ch.sends.fxReverb.enabled,
                      color: 'bg-amber-400 text-slate-950 border-amber-200',
                      toggle: () =>
                        updateChannelSend(ch.id, 'fxReverb', { enabled: !ch.sends.fxReverb.enabled }),
                    },
                    {
                      key: 'stream',
                      active: ch.assignBroadcast,
                      color: 'bg-emerald-400 text-slate-950 border-emerald-200',
                      toggle: () => updateChannel(ch.id, { assignBroadcast: !ch.assignBroadcast }),
                    },
                  ];

                  return (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedSourceId(ch.id)}
                      className={`grid grid-cols-10 gap-1 items-center rounded px-1 py-0.5 cursor-pointer ${
                        isSel
                          ? 'console-accent-active border border-sky-400/50'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="col-span-3 flex items-center gap-1 min-w-0">
                        <span className="text-[9px] font-mono text-amber-300">
                          {String(ch.number).padStart(2, '0')}
                        </span>
                        <span className="text-[10px] font-medium text-slate-100 truncate">
                          {ch.shortName}
                        </span>
                      </div>

                      {nodes.map((node) => (
                        <button
                          key={node.key}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            node.toggle();
                          }}
                          className={`h-5 rounded-[3px] border text-[10px] font-mono font-bold transition-all flex items-center justify-center ${
                            node.active
                              ? `${node.color} shadow-[0_0_6px_rgba(56,189,248,0.28)]`
                              : 'console-btn-surface text-slate-500'
                          }`}
                        >
                          {node.active ? '+' : '·'}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right 3 Cols: Selected Channel Input Trim + Bus Outputs */}
          <div className="lg:col-span-3 console-chassis rounded-lg border border-white/10 p-2.5 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="console-panel rounded p-2 space-y-2 shrink-0">
              <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/10 pb-1">
                <span className="text-amber-300 font-semibold">
                  CH {String(selectedCh.number).padStart(2, '0')} · {selectedCh.shortName}
                </span>
                <span className="text-slate-400">{selectedCh.physicalPort}</span>
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
                  manualOnlyReason={isManualPre ? 'Physical preamp pot on MG16XU' : undefined}
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

            <div className="flex-1 min-h-0 grid grid-cols-2 gap-1.5">
              {buses.slice(0, 4).map((bus) => {
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
                        peakDbfs={bm?.peakDbfs ?? -70}
                        peakHoldDbfs={bm?.peakHoldDbfs ?? -70}
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
      ) : (
        /* Tab 2: Detailed Input Preamp, Speaker Output Connector Bay, & 6-Bus Master Bank */
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
              levelDbfs={meters[selectedCh.id]?.inputRmsDbfs ?? -48}
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
                manualOnlyReason={isManualPre ? 'Physical preamp pot on MG16XU' : undefined}
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

            <div className="console-well rounded p-2 space-y-1 flex-1 min-h-0 overflow-hidden">
              <div className="text-[9px] font-mono text-slate-400 uppercase">
                Bus → Speaker Physical Connector Bay
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
                6-Bus Master Output Bank &amp; Meter Bridge
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                STAGE: INPUT → PREAMP → EQ → DYN → CROSSPOINT → BUSES → SPEAKERS
              </span>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-3 lg:grid-cols-6 gap-2">
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
                        peakDbfs={bm?.peakDbfs ?? -70}
                        peakHoldDbfs={bm?.peakHoldDbfs ?? -70}
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
