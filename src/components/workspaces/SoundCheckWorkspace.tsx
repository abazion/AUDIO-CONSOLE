import React, { useRef, useState } from 'react';
import { Lock, Radio, ShieldAlert, Activity, Play, Pause, Square, Repeat, Upload, Disc } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';
import { ArcGauge } from '../hardware/ArcGauge';

export const SoundCheckWorkspace: React.FC = () => {
  const {
    soundCheckItems,
    runSoundCheckItem,
    meters,
    buses,
    channels,
    spectrum,
    testToneGainDb,
    setTestToneConfig,
    testToneActive,
    multitrackSessions,
    virtualSoundcheckStatus,
    loadVirtualSoundcheckFiles,
    mountMultitrackSessionForSoundcheck,
    toggleVirtualSoundcheckPlay,
    stopVirtualSoundcheck,
    setVirtualSoundcheckLoop,
  } = useAudioConsole();

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [scTab, setScTab] = useState<'probes' | 'generator' | 'soundcheck'>('probes');
  const [liveOutputArmed, setLiveOutputArmed] = useState<boolean>(false);
  const [vscStatusMessage, setVscStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const selected = soundCheckItems[selectedIdx] ?? soundCheckItems[0];
  const mainBus = buses.find((b) => b.id === 'bus-main')!;
  const mainMeter = meters[mainBus.id];

  const passCount = soundCheckItems.filter((i) => i.status === 'pass').length;
  const readinessPct = Math.round((passCount / soundCheckItems.length) * 100);

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              Calibration Test Bench &amp; Signal Probes
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              Verified {passCount}/{soundCheckItems.length} Stages ({readinessPct}%)
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'probes', label: 'PROBE MATRIX & SCOPE', icon: Activity },
            { id: 'generator', label: 'SIGNAL GENERATOR & EXEC', icon: Radio },
            {
              id: 'soundcheck',
              label:
                virtualSoundcheckStatus.loadedCount > 0
                  ? `VIRTUAL SOUNDCHECK (${virtualSoundcheckStatus.loadedCount})`
                  : 'VIRTUAL SOUNDCHECK',
              icon: Disc,
            },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setScTab(t.id as typeof scTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  scTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
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
            label={liveOutputArmed ? 'PA ARMED' : 'ARM PA'}
            size="xs"
            color="crimson"
            active={liveOutputArmed}
            onClick={() => setLiveOutputArmed((v) => !v)}
          />
          {selected.method !== 'not_testable' && (
            <ConsoleButton
              label={selected.requiresLiveToneAuth ? 'EMIT SWEEP' : 'RUN PROBE'}
              size="xs"
              color={selected.requiresLiveToneAuth ? 'crimson' : 'emerald'}
              active={true}
              onClick={() => runSoundCheckItem(selected.id, liveOutputArmed)}
            />
          )}
        </div>
      </div>

      {/* Main Single-Viewport Workspace */}
      {scTab === 'probes' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          {/* Left 5 Cols: Probe Selector Grid + Readiness Gauge */}
          <div className="lg:col-span-5 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
              <span className="text-xs font-mono font-semibold text-amber-300 uppercase">
                Select Signal Probe Stage
              </span>
              <ArcGauge
                value={readinessPct}
                min={0}
                max={100}
                label="VERIFIED"
                unit="%"
                accent="emerald"
                size={64}
              />
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-2 gap-1.5">
              {soundCheckItems.map((item, idx) => {
                const isSel = idx === selectedIdx;
                const lampColor =
                  item.status === 'pass'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : item.status === 'warning'
                      ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                      : item.status === 'not_testable'
                        ? 'bg-slate-600'
                        : 'bg-sky-400/60';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={`console-panel rounded p-2 text-left border transition-all flex flex-col justify-between gap-1 ${
                      isSel ? 'border-amber-400/80 shadow-[0_0_10px_rgba(245,158,11,0.16)]' : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-mono text-amber-300">PROBE 0{idx + 1}</span>
                      <span className={`w-2 h-2 rounded-full ${lampColor}`} />
                    </div>
                    <div className="text-[11px] font-semibold text-slate-100 leading-tight truncate">
                      {item.stage}
                    </div>
                    <div className="text-[9px] font-mono text-sky-300 truncate">{item.measuredValue}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 7 Cols: Return Spectrum Scope + Dual VU Meters + Stage Description */}
          <div className="lg:col-span-7 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
              <span className="font-mono text-xs font-semibold text-sky-300 uppercase">
                STAGE {selectedIdx + 1} · {selected.stage}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{selected.targetNodeId}</span>
            </div>

            <div className="flex-1 min-h-0 dark-instrument-scope rounded p-2.5 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 shrink-0">
                <span>SIGNAL PROBE RETURN SPECTRUM</span>
                <span className="text-emerald-300">{selected.measuredValue}</span>
              </div>
              <div className="flex-1 min-h-0 flex items-end gap-[2px]">
                {spectrum.slice(0, 48).map((val, i) => {
                  const h = Math.max(5, Math.min(100, ((val + 72) / 68) * 100));
                  return (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className="flex-1 rounded-t-[1px] bg-gradient-to-t from-sky-700 via-sky-400 to-emerald-300"
                    />
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 items-center console-well rounded p-2 shrink-0">
              <div className="col-span-5">
                <AnalogVuMeter
                  label="PROBE IN VU"
                  levelDbfs={mainMeter?.inputRmsDbfs ?? -80}
                  peakLed={(mainMeter?.inputPeakDbfs ?? -80) > -0.5}
                />
              </div>
              <div className="col-span-5">
                <AnalogVuMeter
                  label="PA RETURN VU"
                  levelDbfs={mainMeter?.rmsDbfs ?? -80}
                  peakLed={mainMeter?.clipping}
                />
              </div>
              <div className="col-span-2 flex justify-center">
                <LedMeter
                  peakDbfs={mainMeter?.peakDbfs ?? -80}
                  peakHoldDbfs={mainMeter?.peakHoldDbfs ?? -80}
                  height={84}
                  width={10}
                  segments={12}
                />
              </div>
            </div>

            <div className="oled-display rounded p-2 flex items-center justify-between gap-2 text-[11px] text-slate-300 shrink-0">
              <span className="truncate">{selected.description}</span>
              {selected.method === 'not_testable' && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-amber-300 shrink-0">
                  <Lock className="w-3 h-3" /> MANUAL POT
                </span>
              )}
            </div>
          </div>
        </div>
      ) : scTab === 'generator' ? (
        /* Tab 2: Dedicated Signal Generator Knobs & Probe Runner */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-3 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                <span>PROBE SIGNAL GENERATOR</span>
              </span>
              <ConsoleButton
                label={liveOutputArmed ? 'PA ARMED' : 'ARM PA'}
                size="xs"
                color="crimson"
                active={liveOutputArmed}
                onClick={() => setLiveOutputArmed((v) => !v)}
              />
            </div>

            <div className="flex-1 min-h-0 console-panel rounded p-4 flex items-center justify-around">
              <RotaryKnob
                label="TONE LVL"
                value={testToneGainDb}
                min={-48}
                max={-12}
                step={1}
                unit="dBFS"
                size={60}
                accentColor="rose"
                onChange={(v) => setTestToneConfig(testToneActive, 'pink', v)}
              />
              <RotaryKnob
                label="STAGE"
                value={selectedIdx + 1}
                min={1}
                max={soundCheckItems.length}
                step={1}
                size={60}
                accentColor="amber"
                formatValue={(v) => `0${Math.round(v)}`}
                onChange={(v) =>
                  setSelectedIdx(Math.max(0, Math.min(soundCheckItems.length - 1, Math.round(v) - 1)))
                }
              />
            </div>

            {selected.requiresLiveToneAuth && !liveOutputArmed && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Arm PA switch before live sweep emission.</span>
              </div>
            )}

            {selected.method === 'not_testable' ? (
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 console-well rounded p-2.5 border border-white/10">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Manual physical desk pot; inspect hardware knob directly.</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <ConsoleButton
                  label="PREV STAGE"
                  size="md"
                  color="cyan"
                  active={false}
                  onClick={() =>
                    setSelectedIdx((i) => (i - 1 + soundCheckItems.length) % soundCheckItems.length)
                  }
                />
                <ConsoleButton
                  label={selected.requiresLiveToneAuth ? 'EMIT SWEEP' : 'RUN PROBE'}
                  size="md"
                  color={selected.requiresLiveToneAuth ? 'crimson' : 'emerald'}
                  active={true}
                  onClick={() => runSoundCheckItem(selected.id, liveOutputArmed)}
                />
              </div>
            )}
          </div>

          <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden">
            <div className="text-xs font-mono font-semibold text-sky-300 uppercase border-b border-white/10 pb-2">
              STAGE {selectedIdx + 1} TELEMETRY · {selected.stage}
            </div>
            <div className="oled-display rounded p-3 text-xs text-slate-200 font-mono leading-relaxed flex-1 min-h-0">
              <div className="text-amber-300 mb-1">TARGET NODE: {selected.targetNodeId}</div>
              <div className="text-emerald-300 mb-2">MEASURED: {selected.measuredValue}</div>
              <p className="text-slate-300">{selected.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <AnalogVuMeter
                label="PROBE IN VU"
                levelDbfs={mainMeter?.inputRmsDbfs ?? -80}
                peakLed={(mainMeter?.inputPeakDbfs ?? -80) > -0.5}
              />
              <AnalogVuMeter
                label="PA RETURN VU"
                levelDbfs={mainMeter?.rmsDbfs ?? -80}
                peakLed={mainMeter?.clipping}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Tab 3: Multi-Track Virtual Soundcheck Transport & Stem Loader */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="lg:col-span-7 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
              <div>
                <div className="text-xs font-mono font-semibold text-amber-300 uppercase">
                  Multi-Track Virtual Soundcheck Transport
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  Routes phase-aligned WAV/AudioBuffer stems directly into channel Pre-DSP inputs
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    const assignments = files
                      .slice(0, channels.length)
                      .map((file, idx) => ({ channelId: channels[idx].id, file }));
                    const res = await loadVirtualSoundcheckFiles(assignments);
                    setVscStatusMessage(
                      res.ok
                        ? `Mounted ${res.loadedCount} stem file(s) (${res.durationSec.toFixed(1)}s)`
                        : res.error ?? 'Failed to decode stems'
                    );
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded console-btn-surface border-sky-400/50 text-[10px] font-mono text-sky-200 flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Load Stems (CH 1–N)</span>
                </button>
              </div>
            </div>

            <div className="oled-display rounded p-3 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">
                  TRACKS MOUNTED:{' '}
                  <strong className="text-emerald-300 tabular-nums">
                    {virtualSoundcheckStatus.loadedCount}
                  </strong>
                </span>
                <span className="text-amber-300 tabular-nums font-bold">
                  {formatTime(virtualSoundcheckStatus.positionSec)} /{' '}
                  {formatTime(virtualSoundcheckStatus.durationSec)}
                </span>
              </div>

              <div className="w-full h-2.5 console-well rounded overflow-hidden">
                <div
                  style={{
                    width:
                      virtualSoundcheckStatus.durationSec > 0
                        ? `${Math.min(
                            100,
                            (virtualSoundcheckStatus.positionSec /
                              virtualSoundcheckStatus.durationSec) *
                              100
                          )}%`
                        : '0%',
                  }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-[width] duration-75"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={virtualSoundcheckStatus.loadedCount === 0}
                    onClick={toggleVirtualSoundcheckPlay}
                    className={`px-3 py-1.5 rounded text-xs font-mono font-bold flex items-center gap-1.5 border disabled:opacity-40 ${
                      virtualSoundcheckStatus.playing
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-emerald-500 text-slate-950 border-emerald-400'
                    }`}
                  >
                    {virtualSoundcheckStatus.playing ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>PAUSE</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>PLAY SOUNDCHECK</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={virtualSoundcheckStatus.loadedCount === 0}
                    onClick={stopVirtualSoundcheck}
                    className="px-2.5 py-1.5 rounded console-btn-surface text-xs font-mono text-slate-200 flex items-center gap-1 disabled:opacity-40"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>STOP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVirtualSoundcheckLoop(!virtualSoundcheckStatus.loop)}
                    className={`px-2.5 py-1.5 rounded text-xs font-mono flex items-center gap-1 border ${
                      virtualSoundcheckStatus.loop
                        ? 'console-accent-active'
                        : 'console-btn-surface text-slate-300'
                    }`}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    <span>LOOP</span>
                  </button>
                </div>

                {vscStatusMessage && (
                  <span className="text-[10px] font-mono text-sky-300 truncate">{vscStatusMessage}</span>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 console-panel rounded p-2.5 flex flex-col gap-1.5 overflow-hidden">
              <div className="text-[10px] font-mono text-slate-400 uppercase shrink-0">
                Mount Recorded Multitrack Sessions (Zero-Latency Playback)
              </div>
              {multitrackSessions.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs font-mono text-slate-400 text-center px-4">
                  No recorded multitrack sessions in memory yet. Record channels in Livestream Studio → Multitrack WAV, or click &ldquo;Load Stems (CH 1–N)&rdquo; above to import rehearsal stems.
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
                  {multitrackSessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="console-well rounded px-2.5 py-2 flex items-center justify-between gap-2 border border-white/10"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-semibold text-slate-100 truncate">
                          Session · {sess.tracks.length} Track(s) · {sess.durationSec.toFixed(1)}s
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {sess.sampleRateHz / 1000}kHz / {sess.bitDepth}-bit · Tap: {sess.tapPoint}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await mountMultitrackSessionForSoundcheck(sess.id);
                          setVscStatusMessage(
                            res.ok
                              ? `Mounted ${res.loadedCount} session track(s)`
                              : res.error ?? 'Mount error'
                          );
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-mono font-bold text-emerald-200 whitespace-nowrap shrink-0"
                      >
                        MOUNT TO DESK
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="text-xs font-mono font-semibold text-sky-300 uppercase border-b border-white/10 pb-1.5">
              Live Channel Return Meters (Post-DSP Verification)
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 content-start pr-1">
              {channels.slice(0, 12).map((ch) => {
                const cm = meters[ch.id];
                return (
                  <div
                    key={ch.id}
                    className="console-well rounded p-2 flex items-center justify-between gap-2 border border-white/10"
                  >
                    <div className="min-w-0">
                      <div className="text-[9px] font-mono text-amber-300">
                        CH {String(ch.number).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] font-mono font-semibold text-slate-100 truncate">
                        {ch.shortName}
                      </div>
                      <div className="text-[9px] font-mono tabular-nums text-slate-400">
                        {cm?.signalPresent ? `${cm.rmsDbfs.toFixed(1)} dB` : 'IDLE'}
                      </div>
                    </div>
                    <LedMeter peakDbfs={cm?.peakDbfs ?? -80} height={38} width={6} segments={6} />
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
