import React, { useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Mic,
  Radio,
  GitBranch,
  Disc,
  Square,
  Download,
  Trash2,
  FileAudio,
  X,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { ConsoleButton } from '../hardware/ConsoleButton';

function formatRecTime(sec: number): string {
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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
    recordingActive,
    recordingDurationSec,
    recordingTargetId,
    setRecordingTargetId,
    recordedTakes,
    deleteRecordedTake,
    toggleStreamRecording,
  } = useAudioConsole();

  const [takesDrawerOpen, setTakesDrawerOpen] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  const anySolo = channels.some((c) => c.solo) || buses.some((b) => b.solo);
  const latestEvent = events[0];
  const talkbackManual = hardwareProfile.devices[0]?.capabilities.talkback === 'manual';

  const handleToggleRec = async () => {
    setRecError(null);
    const res = await toggleStreamRecording(recordingTargetId);
    if (!res.ok) {
      setRecError(res.error ?? 'Unable to capture output audio.');
    }
  };

  return (
    <footer className="relative console-footer-bar border-t px-4 py-1.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0 select-none transition-colors duration-200">
      {/* Recorded System Output Takes Drawer */}
      {takesDrawerOpen && (
        <div className="absolute bottom-full right-4 mb-2 w-96 max-w-[calc(100vw-2rem)] console-chassis border border-white/15 rounded-lg shadow-2xl p-3 z-40 space-y-2">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-100">
              <FileAudio className="w-3.5 h-3.5 text-amber-400" />
              <span>Recorded System &amp; Bus Takes ({recordedTakes.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setTakesDrawerOpen(false)}
              className="p-0.5 rounded text-slate-400 hover:text-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {recordedTakes.length === 0 ? (
            <div className="text-[11px] font-mono text-slate-400 py-3 text-center">
              No recordings yet. Select a target (System Out, Main L/R, or Stream Bus) and press REC SYSTEM.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-0.5">
              {recordedTakes.map((take) => (
                <div
                  key={take.id}
                  className="console-panel rounded p-2 border border-white/10 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                    <span className="font-semibold text-amber-300 truncate">{take.targetLabel}</span>
                    <span className="text-slate-400 tabular-nums shrink-0">
                      {formatRecTime(take.durationSec)} · {formatBytes(take.sizeBytes)} · {take.createdAt}
                    </span>
                  </div>
                  <audio controls src={take.blobUrl} className="w-full h-7" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-mono text-slate-400 truncate">
                      {take.filename}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={take.blobUrl}
                        download={take.filename}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-mono text-emerald-300 flex items-center gap-1 hover:bg-emerald-500/30"
                      >
                        <Download className="w-2.5 h-2.5" />
                        <span>Download</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => deleteRecordedTake(take.id)}
                        className="p-1 rounded console-btn-surface text-slate-400 hover:text-rose-400"
                        title="Delete take from session"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {/* Whole-System Output Recorder + Latest Engine Event & Undo/Redo */}
      <div className="flex items-center gap-2 min-w-0">
        {latestEvent && (
          <div className="hidden 2xl:flex items-center gap-2 text-[11px] text-slate-400 max-w-xs truncate">
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

        {/* Whole System Master Output Recorder */}
        <div className="flex items-center gap-1 console-well rounded p-0.5 border border-white/10">
          <select
            aria-label="Whole system recording target"
            disabled={recordingActive}
            value={recordingTargetId}
            onChange={(e) => setRecordingTargetId(e.target.value)}
            className="bg-transparent px-1.5 py-0.5 text-[10px] font-mono text-slate-200 outline-none disabled:opacity-50"
          >
            <option value="system-master" className="bg-slate-900 text-slate-100">
              System Out (Master)
            </option>
            <option value="bus-main" className="bg-slate-900 text-slate-100">
              Main L/R Bus
            </option>
            <option value="bus-stream" className="bg-slate-900 text-slate-100">
              Stream Bus
            </option>
          </select>
          <button
            type="button"
            onClick={() => void handleToggleRec()}
            className={`px-2 py-0.5 rounded-[3px] text-[10px] font-mono font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
              recordingActive
                ? 'bg-rose-600 text-white'
                : 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
            }`}
            title="Record summed whole-system or bus output audio"
          >
            {recordingActive ? (
              <>
                <Square className="w-2.5 h-2.5 fill-current" />
                <span className="tabular-nums">STOP ({formatRecTime(recordingDurationSec)})</span>
              </>
            ) : (
              <>
                <Disc className="w-3 h-3" />
                <span>REC SYSTEM</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTakesDrawerOpen((v) => !v)}
            className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-mono whitespace-nowrap shrink-0 ${
              takesDrawerOpen
                ? 'console-accent-solid'
                : recordedTakes.length > 0
                  ? 'text-emerald-300 hover:bg-white/5'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Play or download recorded system output takes"
          >
            Takes ({recordedTakes.length})
          </button>
        </div>

        {recError && (
          <span className="text-[10px] font-mono text-rose-300 max-w-44 truncate" title={recError}>
            {recError}
          </span>
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
