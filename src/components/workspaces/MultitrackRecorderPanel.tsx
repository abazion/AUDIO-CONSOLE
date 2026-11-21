import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Circle,
  Download,
  FileAudio,
  Pause,
  Play,
  Square,
  Trash2,
  Waves,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { audioEngine } from '../../engine/webAudioEngine';
import type {
  MultitrackRecordedFile,
  MultitrackSession,
  MultitrackWaveformSlice,
} from '../../engine/types';

function formatTimelineClock(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const rem = clamped - mins * 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(1).padStart(4, '0')}`;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface WaveformTimelineProps {
  slices: MultitrackWaveformSlice[];
  windowSec: number;
  isLiveRecording: boolean;
  isArmed: boolean;
  hasRecordedFile: boolean;
  playheadSec: number;
  showPlayhead: boolean;
  accentHex: string;
  onSeek?: (sec: number) => void;
}

const WaveformTimelineLane: React.FC<WaveformTimelineProps> = ({
  slices,
  windowSec,
  isLiveRecording,
  isArmed,
  hasRecordedFile,
  playheadSec,
  showPlayhead,
  accentHex,
  onSeek,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const w = 640;
  const h = 44;
  const midY = h / 2;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !hasRecordedFile) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * windowSec);
  };

  const bars = useMemo(() => {
    if (slices.length === 0) return [];
    const totalW = w;
    const minBarW = 2;
    const maxStartSec =
      isLiveRecording && slices[slices.length - 1].timeSec > windowSec
        ? slices[slices.length - 1].timeSec - windowSec
        : 0;

    return slices
      .filter((s) => s.timeSec >= maxStartSec)
      .map((s) => {
        const relSec = s.timeSec - maxStartSec;
        const x = (relSec / Math.max(1, windowSec)) * totalW;
        const amp = Math.max(0.03, Math.min(1, s.peak));
        const halfH = amp * (midY - 3);
        return {
          x,
          y: midY - halfH,
          height: halfH * 2,
          width: Math.max(minBarW, totalW / Math.max(40, slices.length) - 0.6),
          clipped: s.clipped,
        };
      });
  }, [slices, windowSec, isLiveRecording, midY]);

  const playheadPct = Math.max(
    0,
    Math.min(100, (playheadSec / Math.max(0.1, windowSec)) * 100)
  );

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`relative flex-1 min-w-0 h-11 dark-instrument-scope rounded border overflow-hidden ${
        isLiveRecording && isArmed
          ? 'border-rose-500/45'
          : hasRecordedFile
            ? 'border-white/12 cursor-pointer'
            : 'border-white/[0.06]'
      }`}
      title={hasRecordedFile ? 'Click waveform timeline to seek audition playhead' : undefined}
    >
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full block">
        <line
          x1="0"
          y1={midY}
          x2={w}
          y2={midY}
          stroke="rgba(148,163,184,0.2)"
          strokeWidth="0.8"
        />
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={w * f}
            y1="0"
            x2={w * f}
            y2={h}
            stroke="rgba(148,163,184,0.08)"
            strokeWidth="0.7"
          />
        ))}
        {bars.map((b, idx) => (
          <rect
            key={idx}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            rx={0.5}
            fill={b.clipped ? '#f43f5e' : accentHex}
            fillOpacity={isLiveRecording || hasRecordedFile ? 0.85 : 0.35}
          />
        ))}
      </svg>

      {showPlayhead && (
        <div
          style={{ left: `${playheadPct}%` }}
          className={`absolute top-0 bottom-0 w-0.5 pointer-events-none ${
            isLiveRecording ? 'bg-rose-400' : 'bg-amber-400'
          }`}
        />
      )}

      {bars.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-mono text-slate-500">
          {isLiveRecording && isArmed
            ? 'Buffering PCM samples…'
            : isArmed
              ? 'Armed · Ready for multitrack WAV capture'
              : 'Channel disarmed'}
        </div>
      )}
    </div>
  );
};

export const MultitrackRecorderPanel: React.FC = () => {
  const {
    channels,
    meters,
    multitrackArmedIds,
    multitrackTapPoint,
    setMultitrackTapPoint,
    multitrackBitDepth,
    setMultitrackBitDepth,
    multitrackRecording,
    multitrackSessions,
    toggleMultitrackArm,
    armMultitrackPreset,
    toggleMultitrackRecording,
    deleteMultitrackSession,
  } = useAudioConsole();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [laneScope, setLaneScope] = useState<'all' | 'armed'>('all');
  const [recError, setRecError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState(() => audioEngine.getMultitrackLiveState());

  // Multi-track WAV audition player state
  const audioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [auditionPlaying, setAuditionPlaying] = useState<boolean>(false);
  const [auditionTarget, setAuditionTarget] = useState<'all' | string>('all');
  const [auditionSec, setAuditionSec] = useState<number>(0);

  const activeSession: MultitrackSession | null = useMemo(() => {
    if (multitrackSessions.length === 0) return null;
    if (selectedSessionId) {
      const found = multitrackSessions.find((s) => s.id === selectedSessionId);
      if (found) return found;
    }
    return multitrackSessions[0];
  }, [multitrackSessions, selectedSessionId]);

  // Poll 10 Hz live waveform slices & elapsed time while recording
  useEffect(() => {
    if (!multitrackRecording) {
      setLiveState(null);
      return;
    }
    setLiveState(audioEngine.getMultitrackLiveState());
    const t = window.setInterval(() => {
      setLiveState(audioEngine.getMultitrackLiveState());
    }, 100);
    return () => window.clearInterval(t);
  }, [multitrackRecording]);

  // Stop audition playback helper
  const stopAudition = () => {
    for (const el of audioMapRef.current.values()) {
      el.pause();
      el.currentTime = 0;
      el.src = '';
    }
    audioMapRef.current.clear();
    setAuditionPlaying(false);
    setAuditionSec(0);
  };

  useEffect(() => {
    return () => {
      for (const el of audioMapRef.current.values()) {
        el.pause();
        el.src = '';
      }
      audioMapRef.current.clear();
    };
  }, []);

  // Poll audition playhead when playing recorded WAV tracks
  useEffect(() => {
    if (!auditionPlaying) return;
    const t = window.setInterval(() => {
      const first = audioMapRef.current.values().next().value as HTMLAudioElement | undefined;
      if (!first) {
        setAuditionPlaying(false);
        return;
      }
      setAuditionSec(first.currentTime);
      if (first.ended) {
        stopAudition();
      }
    }, 60);
    return () => window.clearInterval(t);
  }, [auditionPlaying]);

  const startAudition = (tracks: MultitrackRecordedFile[], target: 'all' | string, startAt = 0) => {
    stopAudition();
    const toPlay = target === 'all' ? tracks : tracks.filter((t) => t.channelId === target);
    if (toPlay.length === 0) return;

    for (const tr of toPlay) {
      const audio = new Audio(tr.blobUrl);
      audio.currentTime = Math.min(startAt, Math.max(0, tr.durationSec - 0.05));
      audioMapRef.current.set(tr.channelId, audio);
    }
    setAuditionTarget(target);
    setAuditionSec(startAt);
    setAuditionPlaying(true);

    for (const el of audioMapRef.current.values()) {
      void el.play().catch(() => {});
    }
  };

  const seekAudition = (sec: number) => {
    if (!activeSession) return;
    const clamped = Math.max(0, Math.min(activeSession.durationSec, sec));
    setAuditionSec(clamped);
    for (const el of audioMapRef.current.values()) {
      el.currentTime = clamped;
    }
    if (!auditionPlaying) {
      startAudition(activeSession.tracks, auditionTarget, clamped);
    }
  };

  const handleToggleRecord = async () => {
    setRecError(null);
    if (!multitrackRecording && auditionPlaying) {
      stopAudition();
    }
    const res = await toggleMultitrackRecording();
    if (!res.ok) {
      setRecError(res.error ?? 'Failed to toggle multitrack WAV recorder.');
    }
  };

  const handleDownloadAllWavs = (session: MultitrackSession) => {
    session.tracks.forEach((tr, idx) => {
      window.setTimeout(() => {
        const a = document.createElement('a');
        a.href = tr.blobUrl;
        a.download = tr.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, idx * 140);
    });
  };

  const armedSet = useMemo(() => new Set(multitrackArmedIds), [multitrackArmedIds]);

  const liveTrackMap = useMemo(() => {
    const map = new Map<
      string,
      { peakDbfs: number; clipped: boolean; waveform: MultitrackWaveformSlice[]; totalSamples: number }
    >();
    liveState?.tracks.forEach((t) => map.set(t.channelId, t));
    return map;
  }, [liveState]);

  const recordedTrackMap = useMemo(() => {
    const map = new Map<string, MultitrackRecordedFile>();
    activeSession?.tracks.forEach((t) => map.set(t.channelId, t));
    return map;
  }, [activeSession]);

  const displayedChannels = useMemo(() => {
    if (laneScope === 'all') return channels;
    return channels.filter((c) => armedSet.has(c.id) || recordedTrackMap.has(c.id));
  }, [channels, laneScope, armedSet, recordedTrackMap]);

  const timelineWindowSec = multitrackRecording
    ? Math.max(15, Math.min(30, Math.ceil(liveState?.elapsedSec ?? 15)))
    : Math.max(5, activeSession?.durationSec ?? 15);

  const sessionTotalBytes = useMemo(() => {
    if (multitrackRecording && liveState) return liveState.totalBytesEstimate;
    if (activeSession) return activeSession.tracks.reduce((acc, t) => acc + t.sizeBytes, 0);
    return 0;
  }, [multitrackRecording, liveState, activeSession]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      {/* Multitrack WAV Control Bar */}
      <div className="console-chassis rounded-lg border border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Waves className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-mono font-bold text-slate-100 whitespace-nowrap">
              Multitrack WAV Capture
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
            {multitrackArmedIds.length} / {channels.length} armed · Separate mono RIFF WAVs
          </span>

          <div className="flex items-center console-well rounded p-0.5 gap-0.5">
            <button
              type="button"
              disabled={multitrackRecording}
              onClick={() => armMultitrackPreset('active')}
              className="px-2 py-0.5 rounded-[2px] text-[10px] font-mono text-emerald-300 hover:bg-white/10 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Arm Active
            </button>
            <button
              type="button"
              disabled={multitrackRecording}
              onClick={() => armMultitrackPreset('all')}
              className="px-2 py-0.5 rounded-[2px] text-[10px] font-mono text-slate-200 hover:bg-white/10 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Arm All
            </button>
            <button
              type="button"
              disabled={multitrackRecording}
              onClick={() => armMultitrackPreset('none')}
              className="px-2 py-0.5 rounded-[2px] text-[10px] font-mono text-slate-400 hover:bg-white/10 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Multitrack tap point"
            disabled={multitrackRecording}
            value={multitrackTapPoint}
            onChange={(e) => setMultitrackTapPoint(e.target.value as 'pre-dsp' | 'post-fader')}
            className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200 disabled:opacity-50"
          >
            <option value="pre-dsp">Pre-DSP Direct Out</option>
            <option value="post-fader">Post-Fader Stem</option>
          </select>

          <select
            aria-label="WAV PCM bit depth"
            disabled={multitrackRecording}
            value={multitrackBitDepth}
            onChange={(e) => setMultitrackBitDepth(Number(e.target.value) as 16 | 24)}
            className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200 disabled:opacity-50"
          >
            <option value={24}>24-bit PCM WAV</option>
            <option value={16}>16-bit PCM WAV</option>
          </select>

          <button
            type="button"
            onClick={() => setLaneScope((s) => (s === 'all' ? 'armed' : 'all'))}
            className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-slate-300 whitespace-nowrap shrink-0"
          >
            {laneScope === 'all' ? 'View: All Strips' : 'View: Armed/Recorded'}
          </button>

          <div className="oled-display rounded px-2.5 py-1 flex items-center gap-2 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0">
            <span className={multitrackRecording ? 'text-rose-400 font-bold' : 'text-amber-300'}>
              {formatTimelineClock(
                multitrackRecording
                  ? liveState?.elapsedSec ?? 0
                  : auditionPlaying
                    ? auditionSec
                    : activeSession?.durationSec ?? 0
              )}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">
              {((liveState?.sampleRateHz ?? activeSession?.sampleRateHz ?? 48000) / 1000).toFixed(1)}kHz
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-emerald-300">{formatByteSize(sessionTotalBytes)}</span>
          </div>

          <button
            type="button"
            onClick={() => void handleToggleRecord()}
            className={`px-3 py-1 rounded text-[11px] font-mono font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              multitrackRecording
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-rose-500/20 border border-rose-500/50 text-rose-200 hover:bg-rose-500/30'
            }`}
          >
            {multitrackRecording ? (
              <>
                <Square className="w-3 h-3 fill-current" />
                <span>STOP &amp; EXPORT WAVS</span>
              </>
            ) : (
              <>
                <Circle className="w-3 h-3 fill-current" />
                <span>REC MULTITRACK</span>
              </>
            )}
          </button>
        </div>
      </div>

      {recError && (
        <div className="px-3 py-1.5 rounded bg-rose-500/15 border border-rose-500/40 text-[11px] font-mono text-rose-200 shrink-0">
          {recError}
        </div>
      )}

      {/* Visual Timeline Monitor */}
      <div className="flex-1 min-h-0 console-chassis rounded-lg border border-white/10 p-2.5 flex flex-col gap-1.5 overflow-hidden">
        {/* Timeline Ruler Header */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 shrink-0">
          <div className="w-64 shrink-0 flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
            <span>Track · Source · Arm</span>
            <span>Peak / WAV</span>
          </div>
          <div className="relative flex-1 min-w-0 h-5 console-well rounded border border-white/10 overflow-hidden">
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const baseOffset =
                multitrackRecording && (liveState?.elapsedSec ?? 0) > timelineWindowSec
                  ? (liveState?.elapsedSec ?? 0) - timelineWindowSec
                  : 0;
              const sec = baseOffset + timelineWindowSec * frac;
              return (
                <span
                  key={frac}
                  style={{ left: `${frac * 100}%` }}
                  className={`absolute top-0.5 text-[9px] font-mono tabular-nums text-slate-400 ${
                    frac === 1
                      ? '-translate-x-full pr-1.5'
                      : frac === 0
                        ? 'pl-1.5'
                        : '-translate-x-1/2'
                  }`}
                >
                  {formatTimelineClock(sec)}
                </span>
              );
            })}
            {!multitrackRecording && activeSession && (
              <div
                style={{
                  left: `${Math.min(100, (auditionSec / Math.max(0.1, timelineWindowSec)) * 100)}%`,
                }}
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 pointer-events-none"
              />
            )}
          </div>
        </div>

        {/* Channel Multitrack Lanes */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
          {displayedChannels.map((ch) => {
            const isArmed = armedSet.has(ch.id);
            const meter = meters[ch.id];
            const liveTrack = liveTrackMap.get(ch.id);
            const recFile = recordedTrackMap.get(ch.id);
            const isAuditioningThis =
              auditionPlaying && (auditionTarget === 'all' || auditionTarget === ch.id) && Boolean(recFile);

            const peakDisplayDb = multitrackRecording && liveTrack
              ? liveTrack.peakDbfs
              : recFile
                ? recFile.peakDbfs
                : meter?.peakDbfs ?? -80;

            const slices =
              multitrackRecording && liveTrack
                ? liveTrack.waveform
                : recFile
                  ? recFile.waveform
                  : [];

            const liveElapsed = liveState?.elapsedSec ?? 0;
            const playheadSec = multitrackRecording
              ? Math.min(timelineWindowSec, liveElapsed)
              : auditionSec;

            return (
              <div key={ch.id} className="flex items-center gap-2">
                {/* Left Track Control Strip */}
                <div className="w-64 shrink-0 h-11 console-panel rounded border border-white/10 px-2 py-1 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      disabled={multitrackRecording}
                      onClick={() => toggleMultitrackArm(ch.id)}
                      title={isArmed ? 'Disarm track' : 'Arm channel for WAV recording'}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border whitespace-nowrap shrink-0 disabled:opacity-60 ${
                        isArmed
                          ? multitrackRecording
                            ? 'bg-rose-600 border-rose-400 text-white'
                            : 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                          : 'console-btn-surface text-slate-400'
                      }`}
                    >
                      {isArmed ? (multitrackRecording ? 'REC' : 'ARM') : 'OFF'}
                    </button>

                    <div className="min-w-0">
                      <div className="text-[10px] font-mono font-semibold text-slate-100 truncate">
                        <span className="text-amber-300">CH{String(ch.number).padStart(2, '0')}</span>{' '}
                        {ch.shortName}
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 truncate">
                        {ch.sourceBinding?.active
                          ? ch.sourceBinding.kind.toUpperCase()
                          : 'IDLE'}{' '}
                        ·{' '}
                        <span
                          className={`tabular-nums ${
                            liveTrack?.clipped || (recFile && recFile.peakDbfs >= -0.2)
                              ? 'text-rose-400 font-bold'
                              : 'text-slate-300'
                          }`}
                        >
                          {peakDisplayDb <= -75 ? '-inf' : `${peakDisplayDb.toFixed(1)} dB`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Discrete Track WAV Actions */}
                  {recFile && !multitrackRecording ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          isAuditioningThis
                            ? stopAudition()
                            : activeSession && startAudition(activeSession.tracks, ch.id, 0)
                        }
                        title={isAuditioningThis ? 'Stop track audition' : `Audition ${recFile.filename}`}
                        className={`p-1 rounded border text-[9px] font-mono ${
                          isAuditioningThis
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'console-btn-surface text-slate-200'
                        }`}
                      >
                        {isAuditioningThis ? (
                          <Pause className="w-2.5 h-2.5" />
                        ) : (
                          <Play className="w-2.5 h-2.5" />
                        )}
                      </button>
                      <a
                        href={recFile.blobUrl}
                        download={recFile.filename}
                        title={`Download ${recFile.filename} (${formatByteSize(recFile.sizeBytes)})`}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-mono text-emerald-300 flex items-center gap-0.5 hover:bg-emerald-500/30 whitespace-nowrap"
                      >
                        <Download className="w-2.5 h-2.5" />
                        <span>WAV</span>
                      </a>
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono text-slate-500 shrink-0 tabular-nums">
                      {multitrackRecording && liveTrack
                        ? formatByteSize(
                            44 + liveTrack.totalSamples * (multitrackBitDepth === 24 ? 3 : 2)
                          )
                        : isArmed
                          ? `${multitrackBitDepth}b`
                          : '—'}
                    </span>
                  )}
                </div>

                {/* Right Real-Time / Session Waveform Timeline */}
                <WaveformTimelineLane
                  slices={slices}
                  windowSec={timelineWindowSec}
                  isLiveRecording={multitrackRecording}
                  isArmed={isArmed}
                  hasRecordedFile={Boolean(recFile) && !multitrackRecording}
                  playheadSec={playheadSec}
                  showPlayhead={
                    (multitrackRecording && isArmed) || (!multitrackRecording && Boolean(recFile))
                  }
                  accentHex={multitrackRecording ? '#f43f5e' : '#38bdf8'}
                  onSeek={seekAudition}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Multitrack WAV Sessions & Batch Export Strip */}
      <div className="console-chassis rounded-lg border border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {multitrackSessions.length === 0 ? (
          <div className="w-full flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <FileAudio className="w-3.5 h-3.5 text-slate-500" />
              <span>
                No multitrack WAV sessions captured yet. Arm channels above and press REC MULTITRACK to record discrete WAV tracks simultaneously.
              </span>
            </span>
            <button
              type="button"
              disabled={multitrackRecording}
              onClick={() => armMultitrackPreset('active')}
              className="px-2 py-0.5 rounded console-btn-surface text-[10px] font-mono text-amber-300 flex items-center gap-1 whitespace-nowrap"
            >
              <CheckSquare className="w-3 h-3" />
              <span>Auto-Arm Active Inputs</span>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-mono text-slate-400 uppercase whitespace-nowrap">
                Takes ({multitrackSessions.length}):
              </span>
              {multitrackSessions.map((sess, idx) => {
                const isSelected = activeSession?.id === sess.id;
                return (
                  <button
                    key={sess.id}
                    type="button"
                    onClick={() => {
                      stopAudition();
                      setSelectedSessionId(sess.id);
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-mono border whitespace-nowrap shrink-0 ${
                      isSelected ? 'console-accent-active font-bold' : 'console-btn-surface text-slate-300'
                    }`}
                  >
                    Take #{multitrackSessions.length - idx} · {sess.tracks.length} WAVs ·{' '}
                    {sess.durationSec.toFixed(1)}s · {sess.createdAt}
                  </button>
                );
              })}
            </div>

            {activeSession && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    auditionPlaying && auditionTarget === 'all'
                      ? stopAudition()
                      : startAudition(activeSession.tracks, 'all', 0)
                  }
                  className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    auditionPlaying && auditionTarget === 'all'
                      ? 'bg-amber-500 text-slate-950'
                      : 'console-btn-surface text-sky-300'
                  }`}
                >
                  {auditionPlaying && auditionTarget === 'all' ? (
                    <>
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>STOP PLAYBACK</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-2.5 h-2.5" />
                      <span>PLAY ALL TRACKS</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadAllWavs(activeSession)}
                  className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/45 text-[10px] font-mono font-bold text-emerald-300 flex items-center gap-1 hover:bg-emerald-500/30 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3 h-3" />
                  <span>Download All ({activeSession.tracks.length} WAVs)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (auditionPlaying) stopAudition();
                    deleteMultitrackSession(activeSession.id);
                    if (selectedSessionId === activeSession.id) {
                      setSelectedSessionId(null);
                    }
                  }}
                  title="Delete selected multitrack session"
                  className="p-1.5 rounded console-btn-surface text-slate-400 hover:text-rose-400 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
