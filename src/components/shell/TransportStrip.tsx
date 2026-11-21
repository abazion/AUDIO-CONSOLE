import React from 'react';
import { RotateCcw, RotateCw, Mic, Radio, GitBranch } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { ConsoleButton } from '../hardware/ConsoleButton';

export const TransportStrip: React.FC = () => {
  const {
    muteGroupsActive,
    toggleMuteGroup,
    clearAllSolos,
    channels,
    buses,
    talkbackActive,
    toggleTalkback,
    monitorSource,
    setMonitorSource,
    hardwareProfile,
    canUndo,
    canRedo,
    undo,
    redo,
    events,
    selectedChannelId,
    openSignalJourney,
    openSourceBay,
    liveMicActive,
    toggleLiveMic,
  } = useAudioConsole();

  const anySolo = channels.some((c) => c.solo) || buses.some((b) => b.solo);
  const latestEvent = events[0];
  const talkbackManual = hardwareProfile.devices[0]?.capabilities.talkback === 'manual';

  return (
    <footer className="console-footer-bar border-t px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none transition-colors duration-200">
      {/* Mute Groups & Solo Clear */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-slate-500 uppercase mr-1">Mute Grp</span>
        {([1, 2, 3, 4] as const).map((g) => (
          <ConsoleButton
            key={g}
            label={`MG${g}`}
            size="xs"
            color="crimson"
            active={muteGroupsActive[g]}
            onClick={() => toggleMuteGroup(g)}
            title={
              g === 1
                ? 'Mute Group 1: Pastor & Vocals'
                : g === 2
                  ? 'Mute Group 2: Band Instruments'
                  : g === 3
                    ? 'Mute Group 3: Drums'
                    : 'Mute Group 4: Choir'
            }
          />
        ))}
        <div className="w-px h-4 bg-white/10 mx-1" />
        <ConsoleButton
          label={anySolo ? 'CLR SOLO' : 'NO SOLO'}
          size="xs"
          color="amber"
          active={anySolo}
          onClick={clearAllSolos}
        />
        <ConsoleButton
          label="TALKBACK"
          size="xs"
          color="cyan"
          active={talkbackActive}
          manualOnlyReason={
            talkbackManual ? 'Manual physical switch on Yamaha MG16XU' : undefined
          }
          onClick={toggleTalkback}
        />
      </div>

      {/* Monitor Source Selector & Live Mic Capture */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-slate-500 uppercase">Monitor</span>
        <div className="flex items-center console-well rounded p-0.5">
          {(['MAIN L/R', 'MON 1', 'MON 2', 'STREAM', 'SOLO'] as const).map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setMonitorSource(src)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-[3px] whitespace-nowrap transition-colors ${
                monitorSource === src
                  ? 'console-accent-solid'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {src}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={toggleLiveMic}
          className={`px-2 py-1 rounded text-[10px] font-mono border flex items-center gap-1 whitespace-nowrap ${
            liveMicActive
              ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
              : 'console-btn-surface text-slate-300'
          }`}
          title="Capture real microphone input into CH 01"
        >
          <Mic className="w-3 h-3" />
          <span>{liveMicActive ? 'Live Input ON' : 'Patch Mic CH01'}</span>
        </button>

        <button
          type="button"
          onClick={() => openSourceBay(selectedChannelId)}
          className="px-2 py-1 rounded text-[10px] font-mono border bg-sky-500/15 border-sky-500/40 text-sky-200 hover:border-sky-400 whitespace-nowrap"
          title="Open Universal Patchbay for Desktop Audio, Hardware Inputs, and Files"
        >
          Desktop / Files / I/O
        </button>
      </div>

      {/* Latest Engine Event & Undo/Redo */}
      <div className="flex items-center gap-2 min-w-0">
        {latestEvent && (
          <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-400 max-w-md truncate">
            <Radio
              className={`w-3 h-3 shrink-0 ${
                latestEvent.severity === 'warning'
                  ? 'text-amber-400'
                  : latestEvent.severity === 'critical'
                    ? 'text-rose-400'
                    : 'text-emerald-400'
              }`}
            />
            <span className="font-mono text-[10px] text-slate-500">{latestEvent.timestamp}</span>
            <span className="truncate">{latestEvent.message}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => openSignalJourney(selectedChannelId)}
          className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 flex items-center gap-1 whitespace-nowrap"
        >
          <GitBranch className="w-3 h-3" />
          <span>Trace</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            title="Rollback last transaction"
            className="p-1.5 rounded console-btn-surface text-slate-300 disabled:opacity-35"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={redo}
            title="Re-apply rolled-back transaction"
            className="p-1.5 rounded console-btn-surface text-slate-300 disabled:opacity-35"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
};
