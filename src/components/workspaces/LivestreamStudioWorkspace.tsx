import React, { useState } from 'react';
import { Radio, Disc, Video, Sliders, Gauge } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { MotorizedFader } from '../hardware/MotorizedFader';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { RotaryKnob } from '../hardware/RotaryKnob';

export const LivestreamStudioWorkspace: React.FC = () => {
  const { channels, buses, meters, updateChannel, updateChannelSend, updateBus, logEvent } =
    useAudioConsole();

  const streamBus = buses.find((b) => b.id === 'bus-stream')!;
  const streamMeter = meters[streamBus.id];

  const [streamTab, setStreamTab] = useState<'sends' | 'loudness'>('sends');
  const [bankPage, setBankPage] = useState<'1-6' | '7-12'>('1-6');
  const [streamLive, setStreamLive] = useState<boolean>(false);
  const [recordingActive, setRecordingActive] = useState<boolean>(true);
  const [targetLufs, setTargetLufs] = useState<number>(-14);

  const shortTermLufs = Math.max(-55, (streamMeter?.rmsDbfs ?? -30) + 2.5);
  const integratedLufs = Math.max(-55, shortTermLufs - 0.8);
  const truePeakDb = Math.min(0, streamMeter?.peakDbfs ?? -20);

  const visibleChannels = bankPage === '1-6' ? channels.slice(0, 6) : channels.slice(6, 12);

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Switcher Tabs + Broadcast Transport */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              Livestream Studio · Broadcast Mix
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              Isolated Pre/Post Broadcast Bus · ITU-R BS.1770 Loudness
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'sends', label: 'BROADCAST SENDS (6-UP)', icon: Sliders },
            { id: 'loudness', label: 'LOUDNESS LUFS & ENCODER', icon: Gauge },
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
            label={recordingActive ? 'REC WAV ON' : 'REC WAV'}
            size="xs"
            color="crimson"
            active={recordingActive}
            onClick={() => {
              setRecordingActive((r) => !r);
              logEvent({
                family: 'dsp',
                severity: 'info',
                service: 'LivestreamStudio',
                nodeId: streamBus.id,
                message: !recordingActive ? 'Started broadcast WAV multitrack recording.' : 'Stopped recording.',
              });
            }}
          />
          <ConsoleButton
            label={streamLive ? 'STREAM ON' : 'START STREAM'}
            size="xs"
            color="emerald"
            active={streamLive}
            onClick={() => {
              setStreamLive((s) => !s);
              logEvent({
                family: 'dsp',
                severity: 'info',
                service: 'LivestreamStudio',
                nodeId: streamBus.id,
                message: !streamLive ? 'Broadcast RTMP audio feed engaged.' : 'Broadcast audio feed stopped.',
              });
            }}
          />
        </div>
      </div>

      {/* Main Single-Viewport Workspace */}
      {streamTab === 'sends' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          {/* Left 8 Cols: 6-Up Responsive Broadcast Fader Bank (Zero Scroll) */}
          <div className="lg:col-span-8 console-chassis rounded-lg border border-white/10 p-3 flex flex-col gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
              <span className="text-[11px] font-mono font-semibold text-sky-300 uppercase">
                Broadcast Source Contribution Faders (Independent of House PA)
              </span>
              <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
                {(['1-6', '7-12'] as const).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setBankPage(page)}
                    className={`px-2 py-0.5 rounded-[2px] text-[10px] font-mono ${
                      bankPage === page ? 'console-module-tab-active' : 'console-module-tab'
                    }`}
                  >
                    CH {page}
                  </button>
                ))}
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
                        peakDbfs={(m?.peakDbfs ?? -70) + ch.sends.livestream.levelDb * 0.25}
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

          {/* Right 4 Cols: Compact Broadcast Master + LUFS Readout */}
          <div className="lg:col-span-4 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <AnalogVuMeter
                label="STREAM L"
                levelDbfs={streamMeter?.rmsDbfs ?? -40}
                peakLed={streamMeter?.clipping}
              />
              <AnalogVuMeter
                label="STREAM R"
                levelDbfs={(streamMeter?.rmsDbfs ?? -40) - 0.1}
                peakLed={streamMeter?.clipping}
              />
            </div>

            <div className="oled-display rounded p-2.5 grid grid-cols-3 gap-1.5 text-center font-mono shrink-0">
              <div>
                <div className="text-[8px] text-slate-400">INTEGRATED</div>
                <div className="text-sm font-bold text-emerald-300 tabular-nums">
                  {integratedLufs.toFixed(1)}
                </div>
                <div className="text-[8px] text-slate-500">LUFS</div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400">SHORT-TERM</div>
                <div className="text-sm font-bold text-sky-300 tabular-nums">
                  {shortTermLufs.toFixed(1)}
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
                  {truePeakDb.toFixed(1)}
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
                <span>48k / 24-bit WAV</span>
              </span>
              <span className="flex items-center gap-1">
                <Radio className={`w-3 h-3 ${streamLive ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{streamLive ? 'RTMP Live' : 'Standby'}</span>
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Dedicated Broadcast Loudness & 12-Channel Quick Send Matrix */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden">
            <div className="text-xs font-mono font-semibold text-sky-300 uppercase border-b border-white/10 pb-1.5">
              ITU-R BS.1770 Loudness Bridge &amp; Master Limiter
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AnalogVuMeter
                label="BROADCAST MASTER L"
                levelDbfs={streamMeter?.rmsDbfs ?? -40}
                peakLed={streamMeter?.clipping}
              />
              <AnalogVuMeter
                label="BROADCAST MASTER R"
                levelDbfs={(streamMeter?.rmsDbfs ?? -40) - 0.1}
                peakLed={streamMeter?.clipping}
              />
            </div>
            <div className="oled-display rounded p-3 grid grid-cols-3 gap-2 text-center font-mono">
              <div>
                <div className="text-[9px] text-slate-400">INTEGRATED</div>
                <div className="text-lg font-bold text-emerald-300 tabular-nums">
                  {integratedLufs.toFixed(1)}
                </div>
                <div className="text-[9px] text-slate-500">LUFS</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400">SHORT-TERM</div>
                <div className="text-lg font-bold text-sky-300 tabular-nums">
                  {shortTermLufs.toFixed(1)}
                </div>
                <div className="text-[9px] text-slate-500">LUFS</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400">TRUE PEAK</div>
                <div className={`text-lg font-bold tabular-nums ${truePeakDb > -1.0 ? 'text-rose-400' : 'text-amber-300'}`}>
                  {truePeakDb.toFixed(1)}
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
              12-Channel Broadcast Assignment Switches
            </div>
            <div className="flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-3 gap-2">
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
