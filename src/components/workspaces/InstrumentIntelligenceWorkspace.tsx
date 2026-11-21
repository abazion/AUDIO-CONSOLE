import React, { useState } from 'react';
import { GitBranch, Music2, Sliders } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { AnalogVuMeter, LedMeter } from '../hardware/LedMeter';
import { MotorizedFader } from '../hardware/MotorizedFader';
import { ArcGauge } from '../hardware/ArcGauge';

export const InstrumentIntelligenceWorkspace: React.FC = () => {
  const {
    channels,
    meters,
    spectrum,
    selectedChannelId,
    setSelectedChannelId,
    updateChannel,
    setWorkspace,
    openSignalJourney,
  } = useAudioConsole();

  const rawInstruments = channels.filter(
    (c) =>
      c.category === 'acoustic' ||
      c.category === 'electric' ||
      c.category === 'bass' ||
      c.category === 'keys' ||
      c.category === 'drums'
  );
  const instrumentChannels = rawInstruments.length > 0 ? rawInstruments : channels;

  const activeInst =
    instrumentChannels.find((c) => c.id === selectedChannelId) ?? instrumentChannels[0];
  const activeMeter = meters[activeInst.id];
  const [instTab, setInstTab] = useState<'analyzer' | 'strips'>('analyzer');
  const crestDb = activeMeter?.crestFactorDb ?? 0;
  const liveFundamentalHz = activeMeter?.signalPresent ? activeMeter.fundamentalHz : 0;

  const pitchNoteFromHz = (hz: number) => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = Math.round(12 * Math.log2(hz / 440) + 69);
    const name = notes[((midi % 12) + 12) % 12];
    const oct = Math.floor(midi / 12) - 1;
    return `${name}${oct}`;
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100">
            Instrument Harmonic &amp; Transient Console · CH {String(activeInst.number).padStart(2, '0')} {activeInst.shortName}
          </h1>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'analyzer', label: 'HARMONIC ANALYZER & DSP', icon: Music2 },
            { id: 'strips', label: 'INSTRUMENT FADERS (6-UP)', icon: Sliders },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setInstTab(t.id as typeof instTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  instTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openSignalJourney(activeInst.id)}
            className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 flex items-center gap-1"
          >
            <GitBranch className="w-3 h-3" />
            <span>Trace</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspace('inputs', 'virtual-di')}
            className="px-2.5 py-1 rounded console-btn-surface text-[10px] font-mono text-violet-300"
          >
            BASS VIRTUAL DI →
          </button>
        </div>
      </div>

      {instTab === 'analyzer' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="xl:col-span-7 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/10 pb-1.5">
              <span className="text-emerald-300 font-semibold">
                {activeInst.name} · {activeInst.micOrDiModel}
              </span>
              <span className="text-slate-400">Select instrument channel below</span>
            </div>

            <div className="grid grid-cols-12 gap-3 items-center flex-1 min-h-0">
              <div className="col-span-12 sm:col-span-4 console-panel rounded p-2.5 flex sm:flex-col items-center justify-around gap-2 h-full">
                <div className="oled-display rounded px-3 py-2 w-full text-center">
                  <div className="text-[9px] font-mono text-slate-400">FUNDAMENTAL</div>
                  <div className="text-lg font-mono font-bold text-sky-300 tabular-nums">
                    {liveFundamentalHz > 0 ? `${liveFundamentalHz.toFixed(0)} Hz` : 'IDLE'}
                  </div>
                  <div className="text-[10px] font-mono text-amber-300">
                    NOTE: {liveFundamentalHz > 0 ? pitchNoteFromHz(liveFundamentalHz) : '—'}
                  </div>
                </div>
                <ArcGauge
                  value={crestDb}
                  min={0}
                  max={20}
                  label="CREST FACTOR"
                  unit=" dB"
                  accent="amber"
                  size={90}
                  formatValue={(v) => `${v.toFixed(1)}dB`}
                />
              </div>

              <div className="col-span-12 sm:col-span-8 dark-instrument-scope rounded p-3 h-full flex flex-col justify-between">
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                  <span>HARMONIC CONTENT &amp; TRANSIENT DENSITY</span>
                  <span className="text-emerald-300">
                    {activeMeter?.signalPresent ? `${activeMeter.rmsDbfs.toFixed(1)} dBFS` : 'IDLE (-80)'}
                  </span>
                </div>
                <div className="flex-1 min-h-0 flex items-end gap-[2px] pt-2">
                  {spectrum.slice(0, 48).map((val, idx) => {
                    const h = Math.max(4, Math.min(100, ((val + 72) / 68) * 100));
                    return (
                      <div
                        key={idx}
                        style={{ height: `${h}%` }}
                        className="flex-1 rounded-t-[1px] bg-gradient-to-t from-emerald-600 via-sky-400 to-amber-300"
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 shrink-0">
              {instrumentChannels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSelectedChannelId(ch.id)}
                  className={`rounded px-2 py-1.5 text-left border text-[10px] font-mono ${
                    ch.id === activeInst.id ? 'console-accent-active font-bold' : 'console-btn-surface text-slate-300'
                  }`}
                >
                  CH {String(ch.number).padStart(2, '0')} · {ch.shortName}
                </button>
              ))}
            </div>
          </div>

          <div className="xl:col-span-5 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
            <div className="grid grid-cols-2 gap-2">
              <AnalogVuMeter
                label="INST INPUT VU"
                levelDbfs={activeMeter?.inputRmsDbfs ?? -80}
                peakLed={(activeMeter?.inputPeakDbfs ?? -80) > -0.5}
                compact
              />
              <AnalogVuMeter
                label="INST POST DSP"
                levelDbfs={activeMeter?.rmsDbfs ?? -80}
                peakLed={activeMeter?.clipping}
                compact
              />
            </div>

            <div className="console-panel rounded p-3 grid grid-cols-4 gap-2 flex-1 items-center">
              <RotaryKnob
                label="SW TRIM"
                value={activeInst.softwareTrimDb}
                min={-18}
                max={18}
                step={0.5}
                bipolar
                unit="dB"
                size={42}
                accentColor="cyan"
                onChange={(v) => updateChannel(activeInst.id, { softwareTrimDb: v })}
              />
              <RotaryKnob
                label="HPF"
                value={activeInst.hpfFreqHz}
                min={25}
                max={260}
                step={2}
                unit="Hz"
                size={42}
                accentColor="amber"
                disabled={!activeInst.hpfEnabled}
                onChange={(v) => updateChannel(activeInst.id, { hpfFreqHz: v })}
              />
              <RotaryKnob
                label="COMP THR"
                value={activeInst.dynamics.compThresholdDb}
                min={-40}
                max={0}
                step={0.5}
                unit="dB"
                size={42}
                accentColor="emerald"
                onChange={(v) =>
                  updateChannel(activeInst.id, {
                    dynamics: { ...activeInst.dynamics, compThresholdDb: v },
                  })
                }
              />
              <RotaryKnob
                label="RATIO"
                value={activeInst.dynamics.compRatio}
                min={1}
                max={12}
                step={0.2}
                unit=":1"
                size={42}
                accentColor="rose"
                onChange={(v) =>
                  updateChannel(activeInst.id, {
                    dynamics: { ...activeInst.dynamics, compRatio: v },
                  })
                }
              />
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <ConsoleButton
                label="HPF IN"
                size="xs"
                color="amber"
                active={activeInst.hpfEnabled}
                onClick={() => updateChannel(activeInst.id, { hpfEnabled: !activeInst.hpfEnabled })}
              />
              <ConsoleButton
                label="COMP"
                size="xs"
                color="emerald"
                active={activeInst.dynamics.compEnabled}
                onClick={() =>
                  updateChannel(activeInst.id, {
                    dynamics: { ...activeInst.dynamics, compEnabled: !activeInst.dynamics.compEnabled },
                  })
                }
              />
              <ConsoleButton
                label={activeInst.mute ? 'MUTED' : 'LIVE'}
                size="xs"
                color={activeInst.mute ? 'crimson' : 'emerald'}
                active={!activeInst.mute}
                onClick={() => updateChannel(activeInst.id, { mute: !activeInst.mute })}
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedChannelId(activeInst.id);
                  setWorkspace('processing', 'dsp-eq');
                }}
                className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 flex items-center justify-center gap-1"
              >
                <Sliders className="w-3 h-3" />
                <span>31-EQ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {instTab === 'strips' && (
        <div className="flex-1 min-h-0 console-chassis rounded-lg border p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 overflow-y-auto content-start">
          {instrumentChannels.map((ch) => {
            const m = meters[ch.id];
            const isSel = ch.id === activeInst.id;
            return (
              <div
                key={ch.id}
                onClick={() => setSelectedChannelId(ch.id)}
                className={`rounded-md p-2 flex flex-col items-center justify-between gap-1.5 border cursor-pointer transition-colors ${
                  isSel ? 'console-selected-strip' : 'console-unselected-strip'
                }`}
              >
                <div className="w-full oled-display rounded px-2 py-1 text-center">
                  <div className="text-[9px] font-mono text-emerald-300">CH {String(ch.number).padStart(2, '0')}</div>
                  <div className="text-[10px] font-semibold text-slate-100 truncate">{ch.shortName}</div>
                </div>

                <div className="flex items-center gap-2">
                  <RotaryKnob
                    label="TRIM"
                    value={ch.softwareTrimDb}
                    min={-18}
                    max={18}
                    step={0.5}
                    bipolar
                    size={32}
                    accentColor="cyan"
                    onChange={(v) => updateChannel(ch.id, { softwareTrimDb: v })}
                  />
                  <RotaryKnob
                    label="PAN"
                    value={ch.pan}
                    min={-100}
                    max={100}
                    step={2}
                    bipolar
                    size={32}
                    accentColor="emerald"
                    onChange={(v) => updateChannel(ch.id, { pan: v })}
                  />
                </div>

                <div className="w-full grid grid-cols-2 gap-1">
                  <ConsoleButton
                    label="SOLO"
                    size="xs"
                    color="amber"
                    active={ch.solo}
                    onClick={() => updateChannel(ch.id, { solo: !ch.solo })}
                  />
                  <ConsoleButton
                    label="MUTE"
                    size="xs"
                    color="crimson"
                    active={ch.mute}
                    onClick={() => updateChannel(ch.id, { mute: !ch.mute })}
                  />
                </div>

                <div className="flex items-start gap-1">
                  <MotorizedFader
                    valueDb={ch.faderDb}
                    onChange={(db) => updateChannel(ch.id, { faderDb: db })}
                    height={145}
                    accentColor="emerald"
                  />
                  <LedMeter
                    peakDbfs={m?.peakDbfs ?? -80}
                    peakHoldDbfs={m?.peakHoldDbfs ?? -80}
                    gainReductionDb={m?.gainReductionDb ?? 0}
                    clipping={m?.clipping}
                    height={145}
                    width={9}
                    segments={16}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
