import React, { useRef, useState } from 'react';
import {
  AudioWaveform,
  FileAudio,
  HardDrive,
  Mic,
  MonitorSpeaker,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Trash2,
  Unlock,
  Volume2,
  X,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { audioEngine } from '../../engine/webAudioEngine';
import { LedMeter } from '../hardware/LedMeter';

export const AudioSourcePatchModal: React.FC = () => {
  const {
    sourceBayOpen,
    sourceBayChannelId,
    openSourceBay,
    closeSourceBay,
    channels,
    meters,
    detectedHardware,
    selectedOutputDeviceId,
    scanHardware,
    setOutputDevice,
    attachMicToChannel,
    attachDesktopAudioToChannel,
    attachFileToChannel,
    attachToneToChannel,
    toggleChannelFilePlayback,
    detachChannelSource,
  } = useAudioConsole();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState<string>('default');
  const [toneKind, setToneKind] = useState<'pink' | 'sine1k' | 'sweep'>('pink');
  const [busy, setBusy] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  if (!sourceBayOpen) return null;

  const targetChannel = channels.find((c) => c.id === sourceBayChannelId) ?? channels[0];
  const targetMeter = meters[targetChannel.id];
  const inputDevices = detectedHardware.filter((d) => d.kind === 'audioinput');
  const outputDevices = detectedHardware.filter((d) => d.kind === 'audiooutput');
  const fileStatus = audioEngine.getChannelSourceStatus(targetChannel.id);

  const handlePatchMic = async (devId?: string, label?: string) => {
    setBusy(true);
    setStatusError(null);
    const res = await attachMicToChannel(targetChannel.id, devId ?? selectedInputDeviceId, label);
    setBusy(false);
    if (!res.ok && res.error) setStatusError(res.error);
  };

  const handlePatchDesktop = async () => {
    setBusy(true);
    setStatusError(null);
    const res = await attachDesktopAudioToChannel(targetChannel.id);
    setBusy(false);
    if (!res.ok && res.error) setStatusError(res.error);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatusError(null);
    const res = await attachFileToChannel(targetChannel.id, file);
    setBusy(false);
    if (!res.ok && res.error) setStatusError(res.error);
    e.target.value = '';
  };

  const handlePatchTone = async () => {
    setBusy(true);
    setStatusError(null);
    const res = await attachToneToChannel(targetChannel.id, toneKind, -18);
    setBusy(false);
    if (!res.ok && res.error) setStatusError(res.error);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-4xl console-chassis rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 console-header-bar border-b flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4" style={{ color: 'var(--console-accent)' }} />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Universal Audio Source Patchbay &amp; Auto-Hardware Detector
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Route Desktop / System Audio, Any OS Input Hardware, Audio Files, or Calibration Tone to any Strip
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSourceBay}
            className="p-1.5 rounded console-btn-surface text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {/* Auto-Hardware Scanner Bar */}
          <div className="console-panel rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-slate-100">Host Hardware Detected: </span>
                <span className="font-mono text-emerald-300">
                  {inputDevices.length} Input{inputDevices.length === 1 ? '' : 's'} · {outputDevices.length} Output{outputDevices.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void scanHardware(false)}
                className="px-2.5 py-1 rounded bg-[#141821] border border-white/15 hover:border-sky-400/50 text-[11px] font-mono text-sky-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Rescan OS Hardware</span>
              </button>
              <button
                type="button"
                onClick={() => void scanHardware(true)}
                className="px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-[11px] font-mono text-amber-300 flex items-center gap-1"
              >
                <Unlock className="w-3 h-3" />
                <span>Unlock Full Device Labels</span>
              </button>
            </div>
          </div>

          {/* Target Console Strip Matrix Selector */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">
              1. Select Destination Console Channel (CH 01–12)
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {channels.map((ch) => {
                const isSel = ch.id === targetChannel.id;
                const active = Boolean(ch.sourceBinding?.active);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => openSourceBay(ch.id)}
                    className={`rounded px-2 py-1.5 border text-left transition-all ${
                      isSel
                        ? 'console-selected-strip'
                        : 'console-unselected-strip hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[9px] font-mono">
                      <span className="text-amber-300">CH {String(ch.number).padStart(2, '0')}</span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          active ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-600'
                        }`}
                      />
                    </div>
                    <div className="text-[10px] font-semibold text-slate-100 truncate">{ch.shortName}</div>
                    <div className="text-[8.5px] font-mono text-slate-400 truncate">
                      {active ? ch.sourceBinding?.kind.toUpperCase() : 'UNPATCHED'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {statusError && (
            <div className="px-3 py-2 rounded bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200">
              {statusError}
            </div>
          )}

          {/* Active Channel Patch Status + Live Meter */}
          <div className="console-well rounded-md p-3 flex flex-wrap items-center justify-between gap-3 border border-white/10">
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="text-[10px] font-mono text-amber-300">
                ACTIVE ROUTE FOR CH {String(targetChannel.number).padStart(2, '0')} · {targetChannel.name}
              </div>
              <div className="text-xs font-mono text-slate-100 truncate">
                {targetChannel.sourceBinding?.active
                  ? `[${targetChannel.sourceBinding.kind.toUpperCase()}] ${targetChannel.sourceBinding.label}`
                  : 'No live signal patched — channel silent (-80.0 dBFS)'}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Live Input Meter: {(targetMeter?.inputRmsDbfs ?? -80).toFixed(1)} dBFS RMS · Output:{' '}
                {(targetMeter?.peakDbfs ?? -80).toFixed(1)} dBFS Peak
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LedMeter
                peakDbfs={targetMeter?.inputPeakDbfs ?? -80}
                peakHoldDbfs={targetMeter?.peakHoldDbfs ?? -80}
                height={42}
                width={10}
                segments={8}
              />
              {targetChannel.sourceBinding?.kind === 'file' && (
                <button
                  type="button"
                  onClick={() => toggleChannelFilePlayback(targetChannel.id)}
                  className="px-2.5 py-1.5 rounded bg-sky-500/20 border border-sky-500/50 text-xs font-mono text-sky-200 flex items-center gap-1"
                >
                  {fileStatus.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{fileStatus.playing ? 'Pause' : 'Play'}</span>
                </button>
              )}
              {targetChannel.sourceBinding?.active && (
                <button
                  type="button"
                  onClick={() => detachChannelSource(targetChannel.id)}
                  className="px-2.5 py-1.5 rounded bg-rose-500/15 border border-rose-500/40 text-xs font-mono text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Unpatch</span>
                </button>
              )}
            </div>
          </div>

          {/* 4-Way Universal Source Deck */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Source 1: Desktop / System Audio */}
            <div className="console-panel rounded-md p-3.5 space-y-2.5 border border-sky-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                  <MonitorSpeaker className="w-4 h-4" />
                  <span>Desktop / System / App Audio</span>
                </span>
                <span className="text-[9px] font-mono text-emerald-400">LOOPBACK CAPTURE</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Captures system desktop audio, ProPresenter, Spotify, DAW playback, or browser tab audio directly into CH {String(targetChannel.number).padStart(2, '0')} DSP & 31-band EQ.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={handlePatchDesktop}
                className="w-full py-2 rounded bg-sky-500/20 border border-sky-400/60 hover:bg-sky-500/30 text-xs font-mono font-semibold text-sky-200"
              >
                {busy ? 'Opening OS Audio Picker...' : `Capture Desktop Audio -> CH ${String(targetChannel.number).padStart(2, '0')}`}
              </button>
            </div>

            {/* Source 2: Detected Hardware Microphone / USB / Line Input */}
            <div className="console-panel rounded-md p-3.5 space-y-2.5 border border-amber-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Mic className="w-4 h-4" />
                  <span>Auto-Detected Hardware Inputs</span>
                </span>
                <span className="text-[9px] font-mono text-slate-400">{inputDevices.length} FOUND</span>
              </div>
              <select
                value={selectedInputDeviceId}
                onChange={(e) => setSelectedInputDeviceId(e.target.value)}
                className="w-full bg-[#0b0e14] border border-white/15 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
              >
                <option value="default">Default OS Audio Input</option>
                {inputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    [{d.driverClass}] {d.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const chosen = inputDevices.find((d) => d.deviceId === selectedInputDeviceId);
                  void handlePatchMic(selectedInputDeviceId, chosen?.label);
                }}
                className="w-full py-2 rounded bg-amber-500/20 border border-amber-400/60 hover:bg-amber-500/30 text-xs font-mono font-semibold text-amber-200"
              >
                Patch Hardware Input -&gt; CH {String(targetChannel.number).padStart(2, '0')}
              </button>
            </div>

            {/* Source 3: Local Audio File Deck */}
            <div className="console-panel rounded-md p-3.5 space-y-2.5 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <FileAudio className="w-4 h-4" />
                  <span>Local Audio File / Backing Track</span>
                </span>
                <span className="text-[9px] font-mono text-slate-400">WAV / MP3 / FLAC</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Load any local audio track directly into CH {String(targetChannel.number).padStart(2, '0')} for live mixing, 31-band EQ shaping, and Bass V-DI processing.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 rounded bg-emerald-500/20 border border-emerald-400/60 hover:bg-emerald-500/30 text-xs font-mono font-semibold text-emerald-200"
              >
                Choose Audio File -&gt; CH {String(targetChannel.number).padStart(2, '0')}
              </button>
            </div>

            {/* Source 4: Calibration Signal + Output Endpoint */}
            <div className="console-panel rounded-md p-3.5 space-y-2.5 border border-white/15">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <AudioWaveform className="w-4 h-4 text-rose-400" />
                  <span>Calibration Signal & Playback Output</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['pink', 'sine1k', 'sweep'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setToneKind(k)}
                    className={`flex-1 py-1 rounded text-[10px] font-mono border ${
                      toneKind === k
                        ? 'bg-rose-500/25 border-rose-400 text-rose-200 font-semibold'
                        : 'bg-[#0b0e14] border-white/10 text-slate-400'
                    }`}
                  >
                    {k === 'pink' ? 'PINK' : k === 'sine1k' ? '1kHz' : 'SWEEP'}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePatchTone}
                  className="px-3 py-1 rounded bg-rose-500/20 border border-rose-400/60 text-[10px] font-mono font-semibold text-rose-200"
                >
                  Patch Tone
                </button>
              </div>
              <div className="pt-1 border-t border-white/10 flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <select
                  aria-label="Master Playback Output Endpoint"
                  value={selectedOutputDeviceId}
                  onChange={(e) => void setOutputDevice(e.target.value)}
                  className="flex-1 bg-[#0b0e14] border border-white/15 rounded px-2 py-1 text-[11px] font-mono text-slate-200"
                >
                  <option value="default">Default OS Playback Output</option>
                  {outputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      Out: {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
