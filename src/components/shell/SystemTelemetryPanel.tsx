import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Cpu, HardDrive, Activity } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';

interface ServerTelemetry {
  cpuLoadPct: number;
  ramLoadPct: number;
  usedRamGb: number;
  totalRamGb: number;
  processRssMb: number;
  heapUsedMb: number;
  cpuCores: number;
  loadAvg1m: number;
  uptimeSec: number;
}

const SEGMENTS = 16;

interface LedColumnProps {
  label: string;
  percent: number;
  subLabel: string;
  accent?: 'emerald' | 'cyan' | 'amber';
}

const HardwareLedLadder: React.FC<LedColumnProps> = ({ label, percent, subLabel }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const activeCount = Math.max(clamped > 0 ? 1 : 0, Math.round((clamped / 100) * SEGMENTS));
  const statusColor =
    clamped >= 82 ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : clamped >= 62 ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]';

  return (
    <div className="console-panel rounded p-2 flex flex-col items-center gap-1.5 flex-1 min-w-0">
      <div className="flex items-center justify-between w-full">
        <span className="text-[9px] font-mono font-bold text-slate-300 tracking-wider">{label}</span>
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
      </div>

      {/* Physical Recessed 16-LED Vertical Bar Ladder */}
      <div className="console-well rounded px-1.5 py-2 flex flex-col-reverse gap-[3px] w-full items-center">
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const lit = i < activeCount;
          let onClass = 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]';
          if (i >= 13) {
            onClass = 'bg-rose-500 shadow-[0_0_7px_rgba(244,63,94,0.85)]';
          } else if (i >= 10) {
            onClass = 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]';
          }
          return (
            <div
              key={i}
              className={`h-[6px] w-full rounded-[1px] transition-all duration-150 ${
                lit ? onClass : 'bg-slate-800/80 border border-white/[0.04]'
              }`}
            />
          );
        })}
      </div>

      <div className="oled-display rounded px-1.5 py-1 w-full text-center">
        <div
          className={`text-xs font-mono font-bold tabular-nums leading-none ${
            clamped >= 82 ? 'text-rose-300' : clamped >= 62 ? 'text-amber-300' : 'text-emerald-300'
          }`}
        >
          {clamped}%
        </div>
        <div className="text-[8px] font-mono text-slate-400 truncate mt-0.5">{subLabel}</div>
      </div>
    </div>
  );
};

export const SystemTelemetryPanel: React.FC = () => {
  const {
    cpuDspLoadPct,
    measuredLatencyMs,
    bufferLatencyMs,
    xrunsCount,
    audioUnlocked,
    hardwareProfile,
    dbHydrated,
    dbSyncing,
    channels,
    setWorkspace,
  } = useAudioConsole();

  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<ServerTelemetry | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/system/telemetry');
        if (!res.ok) return;
        const data = (await res.json()) as ServerTelemetry;
        if (alive) setTelemetry(data);
      } catch {
        // Ignore transient network errors during poll
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const cpuPct = telemetry?.cpuLoadPct ?? Math.max(4, Math.round(cpuDspLoadPct * 0.7));
  const ramPct = telemetry?.ramLoadPct ?? 0;
  const dspPct = cpuDspLoadPct;
  const activeInputs = channels.filter((c) => c.sourceBinding?.active).length;
  const primaryDev = hardwareProfile.devices[0];
  const hasClockDrift = hardwareProfile.devices.some(
    (d) => d.clockState.includes('Drift') || d.clockState.includes('Fault')
  );

  if (collapsed) {
    return (
      <aside className="hidden lg:flex flex-col items-center justify-between w-11 shrink-0 console-chassis border-l py-2.5 px-1.5 select-none">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded console-btn-surface text-slate-300 hover:text-white"
          title="Expand System Telemetry Hardware Monitor"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div className="flex flex-col items-center gap-3 my-auto">
          <div className="flex flex-col items-center gap-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                cpuPct > 80 ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
              }`}
            />
            <span className="text-[8px] font-mono text-slate-300">CPU</span>
            <span className="text-[9px] font-mono font-bold text-emerald-300 tabular-nums">{cpuPct}%</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                ramPct > 85 ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-sky-400 shadow-[0_0_8px_#38bdf8]'
              }`}
            />
            <span className="text-[8px] font-mono text-slate-300">RAM</span>
            <span className="text-[9px] font-mono font-bold text-sky-300 tabular-nums">{ramPct}%</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                dspPct > 75 ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
              }`}
            />
            <span className="text-[8px] font-mono text-slate-300">DSP</span>
            <span className="text-[9px] font-mono font-bold text-amber-300 tabular-nums">{dspPct}%</span>
          </div>
        </div>

        <div className="rack-screw" />
      </aside>
    );
  }

  return (
    <aside className="hidden lg:flex flex-col justify-between w-[216px] xl:w-[232px] shrink-0 console-chassis border-l p-2.5 gap-2.5 select-none overflow-hidden">
      {/* Hardware Rack Top Bezel & Screws */}
      <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="rack-screw shrink-0" />
          <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold text-slate-100 uppercase tracking-wider truncate">
              System Telemetry
            </div>
            <div className="text-[8px] font-mono text-slate-400 uppercase truncate">
              HW Monitor · Rack Unit
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 rounded console-btn-surface text-slate-300 hover:text-white shrink-0"
          title="Collapse Telemetry Panel"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Physical LED Status Lamp Bank */}
      <div className="console-well rounded p-2 grid grid-cols-2 gap-1.5 text-[8px] font-mono">
        <div className="flex items-center justify-between px-1.5 py-1 rounded bg-black/25">
          <span className="text-slate-300">AUDIO DSP</span>
          <span
            className={`w-2 h-2 rounded-full ${
              audioUnlocked ? 'bg-emerald-400 shadow-[0_0_7px_#34d399]' : 'bg-amber-400'
            }`}
          />
        </div>
        <div className="flex items-center justify-between px-1.5 py-1 rounded bg-black/25">
          <span className="text-slate-300">WORD CLK</span>
          <span
            className={`w-2 h-2 rounded-full ${
              hasClockDrift ? 'bg-amber-400 shadow-[0_0_7px_#fbbf24]' : 'bg-emerald-400 shadow-[0_0_7px_#34d399]'
            }`}
          />
        </div>
        <div className="flex items-center justify-between px-1.5 py-1 rounded bg-black/25">
          <span className="text-slate-300">SQLITE DB</span>
          <span
            className={`w-2 h-2 rounded-full ${
              dbSyncing
                ? 'bg-sky-400 shadow-[0_0_7px_#38bdf8]'
                : dbHydrated
                  ? 'bg-emerald-400 shadow-[0_0_7px_#34d399]'
                  : 'bg-rose-500'
            }`}
          />
        </div>
        <div className="flex items-center justify-between px-1.5 py-1 rounded bg-black/25">
          <span className="text-slate-300">XRUNS:{xrunsCount}</span>
          <span
            className={`w-2 h-2 rounded-full ${
              xrunsCount > 0 ? 'bg-rose-500 shadow-[0_0_7px_#f43f5e]' : 'bg-emerald-400 shadow-[0_0_7px_#34d399]'
            }`}
          />
        </div>
      </div>

      {/* 3-Column Segmented LED Meter Bridge: CPU | RAM | DSP */}
      <div className="flex items-stretch gap-1.5 flex-1 min-h-0">
        <HardwareLedLadder
          label="CPU"
          percent={cpuPct}
          subLabel={telemetry ? `${telemetry.cpuCores} Cores` : 'OS Host'}
        />
        <HardwareLedLadder
          label="RAM"
          percent={ramPct}
          subLabel={telemetry ? `${telemetry.usedRamGb}/${telemetry.totalRamGb}G` : 'Mem'}
        />
        <HardwareLedLadder
          label="DSP"
          percent={dspPct}
          subLabel={`${measuredLatencyMs.toFixed(1)}ms`}
        />
      </div>

      {/* OLED Hardware Buffer & Memory Readouts */}
      <div className="oled-display rounded p-2 space-y-1.5 text-[9px] font-mono">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1">
            <Activity className="w-3 h-3 text-sky-400" />
            <span>SAMPLE / BUF</span>
          </span>
          <span className="text-sky-300 tabular-nums">
            {((primaryDev?.sampleRateHz ?? 48000) / 1000).toFixed(1)}k / {primaryDev?.bufferSamples ?? 128}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">RTL / BUF LAT</span>
          <span className="text-amber-300 tabular-nums">
            {measuredLatencyMs.toFixed(1)} / {bufferLatencyMs.toFixed(1)} ms
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-emerald-400" />
            <span>NODE RSS</span>
          </span>
          <span className="text-emerald-300 tabular-nums">
            {telemetry ? `${telemetry.processRssMb} MB` : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">LIVE INPUTS</span>
          <span className="text-slate-200 tabular-nums">{activeInputs} / {channels.length} Patched</span>
        </div>
      </div>

      {/* Bottom Rack Ears & Quick Diagnostics Jump */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
        <div className="rack-screw" />
        <button
          type="button"
          onClick={() => setWorkspace('operations', 'system-diagnostics')}
          className="px-2 py-1 rounded console-btn-surface text-[9px] font-mono text-sky-300 hover:text-sky-200 flex-1 text-center"
        >
          FULL DIAGNOSTICS
        </button>
        <div className="rack-screw" />
      </div>
    </aside>
  );
};
