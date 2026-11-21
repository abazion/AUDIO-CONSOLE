import React, { useState } from 'react';
import { Activity, Cpu, Database, HardDrive, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { ArcGauge } from '../hardware/ArcGauge';

export const SystemDiagnosticsWorkspace: React.FC = () => {
  const {
    hardwareProfile,
    detectedHardware,
    scanHardware,
    dbHydrated,
    dbSyncing,
    dbUpdatedAt,
    resetFactoryState,
    cpuDspLoadPct,
    measuredLatencyMs,
    bufferLatencyMs,
    xrunsCount,
    resetXruns,
    graphVersion,
    events,
    audioUnlocked,
    toggleAudioEngine,
    undo,
    canUndo,
  } = useAudioConsole();

  const [diagTab, setDiagTab] = useState<'telemetry' | 'hardware' | 'audit'>('telemetry');
  const externalUnknownLatency = 'External analog/amp DSP unknown unless loopback measured';

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Tabs + System Hardware Switches */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              System Settings &amp; Hardware Diagnostics
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              OS Hardware Enumeration · SQLite WAL Persistence · Graph v{graphVersion}
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'telemetry', label: 'TELEMETRY & SQLITE', icon: Database },
            { id: 'hardware', label: `OS HARDWARE (${detectedHardware.length})`, icon: ShieldCheck },
            { id: 'audit', label: `ENGINE AUDIT LOG (${events.length})`, icon: Activity },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setDiagTab(t.id as typeof diagTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  diagTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ConsoleButton
            label="RESET XRUNS"
            size="xs"
            color="cyan"
            active={false}
            onClick={resetXruns}
          />
          <button
            type="button"
            onClick={() => void scanHardware(true)}
            className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 flex items-center gap-1"
          >
            <HardDrive className="w-3 h-3" />
            <span>Scan OS</span>
          </button>
          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-amber-300 disabled:opacity-40 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Rollback</span>
          </button>
          <button
            type="button"
            onClick={toggleAudioEngine}
            className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-emerald-300 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{audioUnlocked ? 'Engine On' : 'Engage Audio'}</span>
          </button>
          <button
            type="button"
            onClick={() => void resetFactoryState()}
            className="px-2 py-1 rounded bg-rose-500/15 border border-rose-500/40 text-[10px] font-mono text-rose-300 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            <span>Reset DB</span>
          </button>
        </div>
      </div>

      {/* Main Single-Viewport Body */}
      {diagTab === 'telemetry' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
          <div className="console-chassis rounded-lg border border-white/10 p-3 flex-1 min-h-0 flex flex-col justify-between gap-3">
            <div className="console-well rounded p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-h-0 items-center">
              <ArcGauge value={cpuDspLoadPct} min={0} max={100} label="AUDIO DSP LOAD" unit="%" accent="emerald" size={104} />
              <ArcGauge value={bufferLatencyMs} min={0} max={25} label="BUFFER LATENCY" unit="ms" accent="cyan" size={104} formatValue={(v) => `${v.toFixed(1)}ms`} />
              <ArcGauge value={measuredLatencyMs} min={0} max={25} label="LOOPBACK RTL" unit="ms" accent="amber" size={104} formatValue={(v) => `${v.toFixed(1)}ms`} />
              <ArcGauge value={xrunsCount} min={0} max={10} label="STREAM XRUNS" accent="rose" size={104} formatValue={(v) => `${Math.round(v)}`} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
              <div className="console-panel rounded p-3 space-y-1">
                <div className="text-[10px] font-mono text-slate-400">SQLITE DATABASE BACKEND</div>
                <div className="text-sm font-mono font-bold text-emerald-300 flex items-center gap-1.5">
                  <Database className="w-4 h-4 shrink-0" />
                  <span>{dbHydrated ? (dbSyncing ? 'SYNCING WAL...' : 'CONNECTED WAL') : 'CONNECTING'}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  {dbUpdatedAt ? `Last write: ${new Date(dbUpdatedAt).toLocaleTimeString()}` : 'data/console.db'}
                </div>
              </div>

              <div className="console-panel rounded p-3 space-y-1">
                <div className="text-[10px] font-mono text-slate-400">CONFIGURED BUFFER (REPORTED)</div>
                <div className="text-lg font-mono font-bold text-sky-300 tabular-nums">
                  {bufferLatencyMs} ms
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {hardwareProfile.devices[0]?.bufferSamples} samples @{' '}
                  {(hardwareProfile.devices[0]?.sampleRateHz ?? 48000) / 1000} kHz
                </div>
              </div>

              <div className="console-panel rounded p-3 space-y-1">
                <div className="text-[10px] font-mono text-slate-400">LOOPBACK RTL (MEASURED)</div>
                <div className="text-lg font-mono font-bold text-amber-300 tabular-nums">
                  {measuredLatencyMs} ms
                </div>
                <div className="text-[10px] text-slate-400 truncate" title={externalUnknownLatency}>
                  {externalUnknownLatency}
                </div>
              </div>

              <div className="console-panel rounded p-3 space-y-1">
                <div className="text-[10px] font-mono text-slate-400">OS ENDPOINTS / GRAPH VERSION</div>
                <div className="text-lg font-mono font-bold text-slate-100 tabular-nums">
                  {detectedHardware.length} <span className="text-xs text-slate-400 font-normal">devices</span>
                </div>
                <div className="text-[10px] font-mono text-emerald-400">
                  Graph v{graphVersion} Committed
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {diagTab === 'hardware' && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border border-white/10 p-3 flex flex-col gap-2 overflow-hidden">
          <div className="flex items-center justify-between text-xs font-mono text-amber-300 uppercase border-b border-white/10 pb-2 shrink-0">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Auto-Detected OS Hardware Inventory ({detectedHardware.length})</span>
            </span>
            <span className="text-[10px] text-slate-400">Persisted to SQLite</span>
          </div>
          <div className="flex-1 min-h-0 console-well rounded p-3 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
            {detectedHardware.length === 0 ? (
              <div className="col-span-full text-xs text-slate-400 py-10 text-center">
                No browser media endpoints exposed yet. Click &quot;Scan OS&quot; above.
              </div>
            ) : (
              detectedHardware.map((d) => (
                <div key={d.deviceId} className="console-panel border border-white/10 rounded p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100 truncate">{d.label}</span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                        d.kind === 'audioinput'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-sky-500/15 text-sky-300'
                      }`}
                    >
                      {d.kind === 'audioinput' ? 'INPUT' : 'OUTPUT'}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 flex flex-wrap gap-2">
                    <span>Class: {d.driverClass}</span>
                    <span>·</span>
                    <span>{(d.sampleRateHz / 1000).toFixed(1)} kHz</span>
                    <span>·</span>
                    <span>{d.channelCount} ch</span>
                    {d.isDefault && <span className="text-emerald-400">· OS DEFAULT</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {diagTab === 'audit' && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border border-white/10 p-3 flex flex-col gap-2 overflow-hidden">
          <div className="flex items-center gap-2 text-xs font-mono text-sky-300 uppercase border-b border-white/10 pb-2 shrink-0">
            <Activity className="w-4 h-4" />
            <span>Structured Engine Event Audit ({events.length})</span>
          </div>
          <div className="flex-1 min-h-0 console-well rounded p-3 overflow-y-auto space-y-1.5">
            {events.length === 0 ? (
              <div className="text-xs text-slate-400 py-10 text-center">
                No engine events logged yet. Audio operations and patches are audited here.
              </div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="text-[11px] border-b border-white/[0.04] pb-1.5 last:border-0 flex items-start gap-2"
                >
                  <span className="font-mono text-[10px] text-slate-500 shrink-0">
                    {ev.timestamp}
                  </span>
                  <span className="font-mono text-[10px] text-sky-300 shrink-0">
                    [{ev.service}]
                  </span>
                  <span className="text-slate-300">{ev.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
