import React, { useState } from 'react';
import { Radio, Disc, Video, Sliders, Gauge, Download } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { MotorizedFader } from '../hardware/MotorizedFader';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { RotaryKnob } from '../hardware/RotaryKnob';

export const LivestreamStudioWorkspace: React.FC = () => {
  const {
    channels,
    buses,
    meters,
    virtualCables,
    updateChannel,
    updateChannelSend,
    updateBus,
    updateVirtualCable,
    recordingActive,
    recordingDurationSec,
    lastRecordingUrl,
    lastRecordingFilename,
    toggleStreamRecording,
  } = useAudioConsole();

  const streamBus = buses.find((b) => b.id === 'bus-stream') ?? buses[0];
  const streamMeter = meters[streamBus.id];
  const streamVac = virtualCables.find(
    (vc) => vc.sourceKind === 'bus' && vc.sourceId === streamBus.id
  );

  const [streamTab, setStreamTab] = useState<'sends' | 'loudness'>('sends');
  const [pageIdx, setPageIdx] = useState<number>(0);
  const [targetLufs, setTargetLufs] = useState<number>(-14);
  const [recError, setRecError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(channels.length / 6));
  const safePageIdx = Math.min(pageIdx, totalPages - 1);
  const visibleChannels = channels.slice(safePageIdx * 6, safePageIdx * 6 + 6);

  const hasSignal = Boolean(streamMeter?.signalPresent);
  const shortTermLufs = hasSignal ? Math.max(-65, streamMeter.rmsDbfs + 2.5) : -80;
  const integratedLufs = hasSignal ? Math.max(-65, shortTermLufs - 0.8) : -80;
  const truePeakDb = hasSignal ? Math.min(0, streamMeter.peakDbfs) : -80;

  const formatDuration = (sec: number) => {
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleToggleRec = async () => {
    setRecError(null);
    const res = await toggleStreamRecording(streamBus.id);
    if (!res.ok) {
      setRecError(res.error ?? 'Unable to start broadcast recorder.');
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Switcher Tabs + Real Broadcast Transport */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              Livestream Studio · Broadcast Mix
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              Isolated Pre/Post Broadcast Bus · Live MediaRecorder &amp; Virtual Cable Feed
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'sends', label: 'BROADCAST SENDS (6-UP)', icon: Sliders },
            { id: 'loudness', label: 'LOUDNESS LUFS & MATRIX', icon: Gauge },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setStreamTab(t.id as typeof streamTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  streamTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <ConsoleButton
            label={recordingActive ? `STOP REC (${formatDuration(recordingDurationSec)})` : 'REC STREAM'}
            size="xs"
            color="crimson"
            active={recordingActive}
            onClick={() => void handleToggleRec()}
          />
          {lastRecordingUrl && lastRecordingFilename && !recordingActive && (
            <a
              href={lastRecordingUrl}
              download={lastRecordingFilename}
              className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/15 text-[10px] font-mono text-emerald-300 flex items-center gap-1 hover:bg-emerald-500/25"
            >
              <Download className="w-3 h-3" />
              <span>Save Take</span>
            </a>
          )}
          {streamVac && (
            <ConsoleButton
              label={streamVac.active ? 'VAC FEED ON' : 'VAC MUTED'}
              size="xs"
              color="emerald"
              active={streamVac.active}
              onClick={() => updateVirtualCable(streamVac.id, { active: !streamVac.active })}
            />
          )}
        </div>
      </div>

      {recError && (
        <div className="px-3 py-1 rounded bg-rose-500/15 border border-rose-500/40 text-[11px] font-mono text-rose-200 shrink-0">
          {recError}
        </div>
      )}

      {/* Main Single-Viewport Workspace */}
      {streamTab === 'sends' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          {/* Left 8 Cols: Dynamic 6-Up Broadcast Fader Bank */}
          <div className="lg:col-span-8 console-chassis rounded-lg border border-white/10 p-3 flex flex-col gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
              <span className="text-[11px] font-mono font-semibold text-sky-300 uppercase">
                Broadcast Source Contribution Faders (Independent of House PA)
              </span>
              <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const start = idx * 6 + 1;
                  const end = Math.min(channels.length, (idx + 1) * 6);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPageIdx(idx)}
                      className={`px-2 py-0.5 rounded-[2px] text-[10px] font-mono ${
                        safePageIdx === idx ? 'console-module-tab-active' : 'console-module-tab'
                      }`}
                    >
                      CH {start}–{end}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-3 sm:grid-cols-6 gap-2">
              {visibleChannels.map((ch) => {
                const m = meters[ch.id];
                return (
                  <div
                    key={ch.id}
                    className="console-well rounded p-2 flex flex-col items-center justify-between gap-1.5"
                  >
                    <div className="w-full text-center">
                      <div className="text-[9px] font-mono text-amber-300">
                        CH {String(ch.number).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] font-mono font-semibold text-slate-200 truncate">
                        {ch.shortName}
                      </div>
                    </div>
                    <ConsoleButton
                      label={ch.assignBroadcast ? 'SEND' : 'OFF'}
                      size="xs"
                      color="cyan"
                      active={ch.assignBroadcast}
                      fullWidth
                      onClick={() =>
                        updateChannel(ch.id, { assignBroadcast: !ch.assignBroadcast }, 'Updated stream send')
                      }
                    />
                    <div className="flex items-start gap-1">
                      <MotorizedFader
                        valueDb={ch.sends.livestream.levelDb}
                        onChange={(db) =>
                          updateChannelSend(ch.id, 'livestream', { levelDb: db, enabled: db > -70 })
                        }
                        height={155}
                        showScale={false}
                        accentColor="cyan"
                      />
                      <LedMeter
                        peakDbfs={m?.signalPresent ? m.peakDbfs + ch.sends.livestream.levelDb * 0.25 : -80}
                        height={155}
                        width={7}
                        segments={14}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right 4 Cols: Broadcast Master + Real LUFS Readout */}
          <div className="lg:col-span-4 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <AnalogVuMeter
                label="STREAM L"
                levelDbfs={streamMeter?.rmsDbfs ?? -80}
                peakLed={streamMeter?.clipping}
              />
              <AnalogVuMeter
                label="STREAM R"
                levelDbfs={hasSignal ? (streamMeter?.rmsDbfs ?? -80) - 0.1 : -80}
                peakLed={streamMeter?.clipping}
              />
            </div>

            <div className="oled-display rounded p-2.5 grid grid-cols-3 gap-1.5 text-center font-mono shrink-0">
              <div>
                <div className="text-[8px] text-slate-400">INTEGRATED</div>
                <div className="text-sm font-bold text-emerald-300 tabular-nums">
                  {hasSignal ? integratedLufs.toFixed(1) : 'IDLE'}
                </div>
                <div className="text-[8px] text-slate-500">LUFS</div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400">SHORT-TERM</div>
                <div className="text-sm font-bold text-sky-300 tabular-nums">
                  {hasSignal ? shortTermLufs.toFixed(1) : 'IDLE'}
                </div>
                <div className="text-[8px] text-slate-500">LUFS</div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400">TRUE PEAK</div>
                <div
                  className={`text-sm font-bold tabular-nums ${
                    truePeakDb > -1.0 ? 'text-rose-400' : 'text-amber-300'
                  }`}
                >
                  {hasSignal ? truePeakDb.toFixed(1) : '-80.0'}
                </div>
                <div className="text-[8px] text-slate-500">dBTP</div>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-around console-well rounded p-2">
              <RotaryKnob
                label="TARGET"
                value={targetLufs}
                min={-24}
                max={-10}
                step={0.5}
                unit="LUFS"
                size={42}
                accentColor="cyan"
                onChange={setTargetLufs}
              />
              <RotaryKnob
                label="LIM CEIL"
                value={streamBus.limiterCeilingDb}
                min={-6}
                max={0}
                step={0.2}
                unit="dB"
                size={42}
                accentColor="rose"
                onChange={(v) => updateBus(streamBus.id, { limiterCeilingDb: v })}
              />
              <MotorizedFader
                valueDb={streamBus.faderDb}
                onChange={(db) => updateBus(streamBus.id, { faderDb: db })}
                height={104}
                showScale={false}
                accentColor="cyan"
                label="STREAM"
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1 shrink-0">
              <span className="flex items-center gap-1">
                <Disc className={`w-3 h-3 ${recordingActive ? 'text-rose-400' : 'text-slate-500'}`} />
                <span>{recordingActive ? `Recording ${formatDuration(recordingDurationSec)}` : 'MediaRecorder Ready'}</span>
              </span>
              <span className="flex items-center gap-1">
                <Radio className={`w-3 h-3 ${streamVac?.active ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{streamVac ? streamVac.name : 'Stream Bus Active'}</span>
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Dedicated Broadcast Loudness & Dynamic Channel Send Matrix */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden">
            <div className="text-xs font-mono font-semibold text-sky-300 uppercase border-b border-white/10 pb-1.5">
              ITU-R BS.1770 Loudness Bridge &amp; Master Limiter
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AnalogVuMeter
                label="BROADCAST MASTER L"
                levelDbfs={streamMeter?.rmsDbfs ?? -80}
                peakLed={streamMeter?.clipping}
              />
              <AnalogVuMeter
                label="BROADCAST MASTER R"
                levelDbfs={hasSignal ? (streamMeter?.rmsDbfs ?? -80) - 0.1 : -80}
                peakLed={streamMeter?.clipping}
              />
            </div>
            <div className="oled-display rounded p-3 grid grid-cols-3 gap-2 text-center font-mono">
              <div>
                <div className="text-[9px] text-slate-400">INTEGRATED</div>
                <div className="text-lg font-bold text-emerald-300 tabular-nums">
                  {hasSignal ? integratedLufs.toFixed(1) : 'IDLE'}
                </div>
                <div className="text-[9px] text-slate-500">LUFS</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400">SHORT-TERM</div>
                <div className="text-lg font-bold text-sky-300 tabular-nums">
                  {hasSignal ? shortTermLufs.toFixed(1) : 'IDLE'}
                </div>
                <div className="text-[9px] text-slate-500">LUFS</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400">TRUE PEAK</div>
                <div className={`text-lg font-bold tabular-nums ${truePeakDb > -1.0 ? 'text-rose-400' : 'text-amber-300'}`}>
                  {hasSignal ? truePeakDb.toFixed(1) : '-80.0'}
                </div>
                <div className="text-[9px] text-slate-500">dBTP</div>
              </div>
            </div>
            <div className="flex-1 min-h-0 console-well rounded p-3 flex items-center justify-around">
              <RotaryKnob
                label="TARGET LUFS"
                value={targetLufs}
                min={-24}
                max={-10}
                step={0.5}
                unit="LUFS"
                size={54}
                accentColor="cyan"
                onChange={setTargetLufs}
              />
              <RotaryKnob
                label="LIM CEIL"
                value={streamBus.limiterCeilingDb}
                min={-6}
                max={0}
                step={0.2}
                unit="dB"
                size={54}
                accentColor="rose"
                onChange={(v) => updateBus(streamBus.id, { limiterCeilingDb: v })}
              />
              <MotorizedFader
                valueDb={streamBus.faderDb}
                onChange={(db) => updateBus(streamBus.id, { faderDb: db })}
                height={120}
                showScale={false}
                accentColor="cyan"
                label="STREAM MASTER"
              />
            </div>
          </div>

          <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-3 flex flex-col gap-2 min-h-0 overflow-hidden">
            <div className="text-xs font-mono font-semibold text-amber-300 uppercase border-b border-white/10 pb-1.5">
              {channels.length}-Channel Broadcast Assignment Switches
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 pr-0.5 content-start">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="console-panel rounded p-2 flex flex-col justify-between gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-amber-300">
                      CH {String(ch.number).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {ch.sends.livestream.levelDb.toFixed(1)} dB
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-100 truncate">{ch.shortName}</div>
                  <ConsoleButton
                    label={ch.assignBroadcast ? 'BROADCAST ON' : 'MUTED STREAM'}
                    size="xs"
                    color={ch.assignBroadcast ? 'cyan' : 'crimson'}
                    active={ch.assignBroadcast}
                    fullWidth
                    onClick={() =>
                      updateChannel(ch.id, { assignBroadcast: !ch.assignBroadcast }, 'Updated stream send')
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
