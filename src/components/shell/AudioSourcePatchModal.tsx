import React, { useRef, useState } from 'react';
import {
  AudioWaveform,
  Cable,
  FileAudio,
  Gauge,
  HardDrive,
  Mic,
  MonitorSpeaker,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Unlock,
  Volume2,
  X,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { audioEngine } from '../../engine/webAudioEngine';
import type { SourceCategory } from '../../engine/types';
import { LedMeter } from '../hardware/LedMeter';

export const AudioSourcePatchModal: React.FC = () => {
  const {
    sourceBayOpen,
    sourceBayChannelId,
    openSourceBay,
    closeSourceBay,
    openGainStagingAssistant,
    channels,
    buses,
    virtualCables,
    meters,
    detectedHardware,
    selectedOutputDeviceId,
    scanHardware,
    setOutputDevice,
    addChannel,
    addVirtualCable,
    updateVirtualCable,
    attachMicToChannel,
    attachDesktopAudioToChannel,
    attachFileToChannel,
    attachToneToChannel,
    attachVirtualCableToChannel,
    attachExternalTabToVirtualCable,
    toggleChannelFilePlayback,
    detachChannelSource,
  } = useAudioConsole();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState<string>('default');
  const [selectedCableId, setSelectedCableId] = useState<string>(virtualCables[0]?.id ?? '');
  const [toneKind, setToneKind] = useState<'pink' | 'sine1k' | 'sweep'>('pink');
  const [newChName, setNewChName] = useState<string>('');
  const [newChCategory, setNewChCategory] = useState<SourceCategory>('media');
  const [busy, setBusy] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  if (!sourceBayOpen) return null;

  const targetChannel = channels.find((c) => c.id === sourceBayChannelId) ?? channels[0];
  const targetMeter = meters[targetChannel.id];
  const inputDevices = detectedHardware.filter((d) => d.kind === 'audioinput');
  const outputDevices = detectedHardware.filter((d) => d.kind === 'audiooutput');
  const fileStatus = audioEngine.getChannelSourceStatus(targetChannel.id);
  const effectiveCableId =
    virtualCables.some((v) => v.id === selectedCableId) ? selectedCableId : (virtualCables[0]?.id ?? '');

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

  const handlePatchVirtualCable = async () => {
    if (!effectiveCableId) return;
    setBusy(true);
    setStatusError(null);
    const res = await attachVirtualCableToChannel(targetChannel.id, effectiveCableId);
    setBusy(false);
    if (!res.ok && res.error) setStatusError(res.error);
  };

  const handleCreateSeparateChannel = () => {
    const created = addChannel(newChName.trim() || undefined, newChCategory);
    setNewChName('');
    openSourceBay(created.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-5xl console-chassis rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 py-3 console-header-bar border-b flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4" style={{ color: 'var(--console-accent)' }} />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Universal Audio Source Patchbay &amp; Built-In Virtual Audio Cables
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Route individual Mics, Browser Tabs, System Apps, Audio Files, or Internal Virtual Cables to separate Console Input Strips
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
                <span className="font-semibold text-slate-100">Host Hardware &amp; Virtual I/O: </span>
                <span className="font-mono text-emerald-300">
                  {inputDevices.length} Input{inputDevices.length === 1 ? '' : 's'} · {outputDevices.length} Output{outputDevices.length === 1 ? '' : 's'} · {virtualCables.length} Virtual Cable{virtualCables.length === 1 ? '' : 's'}
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

          {/* Target Console Strip Matrix Selector + Dynamic Input Strip Creation */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                1. Select or Create Individual Input Channel (CH 01–{String(channels.length).padStart(2, '0')})
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newChName}
                  onChange={(e) => setNewChName(e.target.value)}
                  placeholder="New channel name (e.g. Browser Tab 2)"
                  className="console-well border border-white/15 rounded px-2 py-1 text-[11px] font-mono text-slate-100 placeholder:text-slate-500 w-52"
                />
                <select
                  value={newChCategory}
                  onChange={(e) => setNewChCategory(e.target.value as SourceCategory)}
                  className="console-btn-surface rounded px-2 py-1 text-[10px] font-mono text-slate-200"
                >
                  <option value="media">Media / Tab</option>
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
                  type="button"
                  onClick={handleCreateSeparateChannel}
                  className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-mono font-semibold text-emerald-200 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Input Strip</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto pr-0.5">
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

          {/* Active Channel Patch Status + Live Meter + Gain Staging Launch */}
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
                Pre-Fader Input: {(targetMeter?.inputRmsDbfs ?? -80).toFixed(1)} dBFS RMS · Floor:{' '}
                {(targetMeter?.noiseFloorDbfs ?? -80).toFixed(1)} dBFS · Peak Hold:{' '}
                {(targetMeter?.peakHoldDbfs ?? -80).toFixed(1)} dBFS
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
              <button
                type="button"
                onClick={() => {
                  closeSourceBay();
                  openGainStagingAssistant(targetChannel.id);
                }}
                className="px-2.5 py-1.5 rounded bg-amber-500/20 border border-amber-400/50 text-xs font-mono text-amber-200 flex items-center gap-1"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>Gain Assist</span>
              </button>
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

          {/* 5-Way Universal Source Deck */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Source 1: Browser Tab / System / App Audio (Per-Channel Independent Capture) */}
            <div className="console-panel rounded-md p-3.5 space-y-2.5 border border-sky-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                  <MonitorSpeaker className="w-4 h-4" />
                  <span>Browser Tab / App Audio</span>
                </span>
                <span className="text-[9px] font-mono text-emerald-400">PER-STRIP CAPTURE</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Capture a specific browser tab, media player window, or system audio into CH {String(targetChannel.number).padStart(2, '0')} independently from other strips.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={handlePatchDesktop}
                className="w-full py-2 rounded bg-sky-500/20 border border-sky-400/60 hover:bg-sky-500/30 text-xs font-mono font-semibold text-sky-200"
              >
                {busy ? 'Opening OS Audio Picker...' : `Capture Tab / System Audio -> CH ${String(targetChannel.number).padStart(2, '0')}`}
              </button>
            </div>

            {/* Source 2: Detected Hardware Microphone / USB / Line Input */}
            <div className="console-panel rounded-md p-3.5 space-y-2.5 border border-amber-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Mic className="w-4 h-4" />
                  <span>Hardware Mic / Line Input</span>
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

            {/* Source 3: Built-In Virtual Audio Cable (Zero VB-Cable Required) */}
            <div className="console-panel rounded-md p-3.5 space-y-2 border border-violet-500/35">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
                  <Cable className="w-4 h-4" />
                  <span>Built-In Virtual Audio Cable</span>
                </span>
                <span className="text-[9px] font-mono text-emerald-400">INTERNAL LOOP</span>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={effectiveCableId}
                  onChange={(e) => setSelectedCableId(e.target.value)}
                  className="flex-1 bg-[#0b0e14] border border-white/15 rounded px-2 py-1.5 text-xs font-mono text-slate-200"
                >
                  {virtualCables.map((vc) => (
                    <option key={vc.id} value={vc.id}>
                      {vc.name} ({vc.sourceLabel})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const created = addVirtualCable(undefined, 'bus', buses[0]?.id);
                    setSelectedCableId(created.id);
                  }}
                  className="px-2 py-1.5 rounded console-btn-surface text-[10px] font-mono text-violet-300"
                  title="Create new Virtual Audio Cable"
                >
                  +VAC
                </button>
              </div>
              {effectiveCableId && (
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <select
                    value={
                      virtualCables.find((v) => v.id === effectiveCableId)?.sourceKind === 'bus'
                        ? `bus:${virtualCables.find((v) => v.id === effectiveCableId)?.sourceId ?? ''}`
                        : ''
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('bus:')) {
                        const busId = val.slice(4);
                        const b = buses.find((x) => x.id === busId);
                        updateVirtualCable(effectiveCableId, {
                          sourceKind: 'bus',
                          sourceId: busId,
                          sourceLabel: b?.name ?? busId,
                          active: true,
                        });
                      }
                    }}
                    className="flex-1 bg-[#0b0e14] border border-white/10 rounded px-1.5 py-1 text-slate-300"
                  >
                    <option value="">Feed VAC from Bus or Tab...</option>
                    {buses.map((b) => (
                      <option key={b.id} value={`bus:${b.id}`}>
                        Tap Bus: {b.shortName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setStatusError(null);
                      const res = await attachExternalTabToVirtualCable(effectiveCableId);
                      setBusy(false);
                      if (!res.ok && res.error) setStatusError(res.error);
                    }}
                    className="px-2 py-1 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200"
                  >
                    Capture Tab
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={busy || !effectiveCableId}
                onClick={handlePatchVirtualCable}
                className="w-full py-1.5 rounded bg-violet-500/20 border border-violet-400/60 hover:bg-violet-500/30 text-xs font-mono font-semibold text-violet-200"
              >
                Route Virtual Cable -&gt; CH {String(targetChannel.number).padStart(2, '0')}
              </button>
            </div>

            {/* Source 4: Local Audio File Deck */}
            <div className="console-panel rounded-md p-3.5 space-y-2.5 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <FileAudio className="w-4 h-4" />
                  <span>Local Audio File / Media Player</span>
                </span>
                <span className="text-[9px] font-mono text-slate-400">WAV / MP3 / FLAC</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Load any local audio track directly into CH {String(targetChannel.number).padStart(2, '0')} with independent EQ, dynamics &amp; bus sends.
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

            {/* Source 5: Calibration Signal + Output Endpoint */}
            <div className="console-panel rounded-md p-3.5 space-y-2.5 border border-white/15 md:col-span-2 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <AudioWaveform className="w-4 h-4 text-rose-400" />
                  <span>Calibration Signal Generator &amp; Master Playback Sink</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['pink', 'sine1k', 'sweep'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setToneKind(k)}
                    className={`flex-1 py-1.5 rounded text-[10px] font-mono border ${
                      toneKind === k
                        ? 'bg-rose-500/25 border-rose-400 text-rose-200 font-semibold'
                        : 'bg-[#0b0e14] border-white/10 text-slate-400'
                    }`}
                  >
                    {k === 'pink' ? 'PINK NOISE' : k === 'sine1k' ? '1kHz SINE' : 'LOG SWEEP'}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePatchTone}
                  className="px-4 py-1.5 rounded bg-rose-500/20 border border-rose-400/60 text-[10px] font-mono font-semibold text-rose-200"
                >
                  Patch Tone -&gt; CH {String(targetChannel.number).padStart(2, '0')}
                </button>
              </div>
              <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-[10px] font-mono text-slate-400 shrink-0">MASTER SINK:</span>
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
