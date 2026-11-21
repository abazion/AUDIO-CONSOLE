import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Lock,
  Radio,
  RotateCcw,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';

function dbToPct(db: number): number {
  const clamped = Math.max(-80, Math.min(0, db));
  return ((clamped + 80) / 80) * 100;
}

type StageVerdict = {
  label: 'IDLE' | 'UNDER-GAINED' | 'OPTIMAL' | 'HOT' | 'CLIPPING';
  colorClass: string;
  guidance: string;
};

function evaluateGainStage(
  signalPresent: boolean,
  rmsDbfs: number,
  peakDbfs: number,
  clipping: boolean,
  peakHoldClipped: boolean,
  noiseFloorDbfs: number,
  isManualPreamp: boolean
): StageVerdict {
  if (!signalPresent && rmsDbfs <= -68) {
    return {
      label: 'IDLE',
      colorClass: 'text-slate-400 border-slate-600/50 bg-slate-800/40',
      guidance: 'No input signal above floor. Patch a live source or emit audio to measure gain.',
    };
  }
  if (clipping || peakHoldClipped || peakDbfs >= -0.5) {
    return {
      label: 'CLIPPING',
      colorClass: 'text-rose-300 border-rose-500/60 bg-rose-500/15',
      guidance: isManualPreamp
        ? 'Peak hit 0 dBFS! Reduce desk preamp knob and lower SW Trim immediately, then clear peak latch.'
        : 'Peak hit 0 dBFS! Lower input trim to restore at least 6–12 dB digital headroom.',
    };
  }
  if (peakDbfs > -4.0 || rmsDbfs > -10.5) {
    return {
      label: 'HOT',
      colorClass: 'text-amber-300 border-amber-500/60 bg-amber-500/15',
      guidance: 'Headroom under 4 dB. Trim down -3 to -6 dB so loud transients stay safely below clip.',
    };
  }
  if (rmsDbfs < -34) {
    const snr = rmsDbfs - noiseFloorDbfs;
    return {
      label: 'UNDER-GAINED',
      colorClass: 'text-sky-300 border-sky-500/50 bg-sky-500/15',
      guidance:
        snr < 18
          ? `Low SNR (${snr.toFixed(0)} dB above floor). Increase preamp/SW Trim toward -18 dBFS nominal.`
          : 'Signal below -34 dBFS nominal target. Raise trim toward -20 to -12 dBFS sweet spot.',
    };
  }
  return {
    label: 'OPTIMAL',
    colorClass: 'text-emerald-300 border-emerald-500/50 bg-emerald-500/15',
    guidance: 'Healthy -20 to -12 dBFS nominal RMS with clean headroom above noise floor.',
  };
}

export const GainStagingAssistantModal: React.FC = () => {
  const {
    gainStagingOpen,
    gainStagingChannelId,
    closeGainStagingAssistant,
    channels,
    meters,
    hardwareProfile,
    updateChannel,
    resetPeakHold,
    openSourceBay,
  } = useAudioConsole();

  const [filterMode, setFilterMode] = useState<'active' | 'all'>('all');
  const [targetNominalRmsDb, setTargetNominalRmsDb] = useState<number>(-18);

  const isManualPreamp = hardwareProfile.devices[0]?.capabilities.preampGain === 'manual';

  const displayedChannels = useMemo(() => {
    if (gainStagingChannelId) {
      const focused = channels.find((c) => c.id === gainStagingChannelId);
      const rest = channels.filter((c) => {
        if (c.id === gainStagingChannelId) return false;
        if (filterMode === 'active') {
          return Boolean(c.sourceBinding?.active) || Boolean(meters[c.id]?.signalPresent);
        }
        return true;
      });
      return focused ? [focused, ...rest] : rest;
    }
    if (filterMode === 'active') {
      const activeOnly = channels.filter(
        (c) => Boolean(c.sourceBinding?.active) || Boolean(meters[c.id]?.signalPresent)
      );
      return activeOnly.length > 0 ? activeOnly : channels;
    }
    return channels;
  }, [channels, filterMode, gainStagingChannelId, meters]);

  if (!gainStagingOpen) return null;

  const autoStageChannel = (chId: string) => {
    const ch = channels.find((c) => c.id === chId);
    const m = meters[chId];
    if (!ch || !m || !m.signalPresent) return;

    const currentInputRms = m.inputRmsDbfs;
    const desiredTrim = Math.max(
      -18,
      Math.min(18, Math.round((targetNominalRmsDb - currentInputRms) * 2) / 2)
    );
    updateChannel(
      chId,
      { softwareTrimDb: desiredTrim },
      `Gain Staging Assistant auto-trimmed CH ${ch.number} to ${desiredTrim >= 0 ? '+' : ''}${desiredTrim.toFixed(1)} dB (target ${targetNominalRmsDb} dBFS)`
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-5xl console-chassis rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 console-header-bar border-b flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Gauge className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-100">
                Gain Staging Assistant · Noise Floor &amp; Clipping Calibrator
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Calibrate pre-fader input trim so sources sit in the -20 to -12 dBFS nominal sweet spot above noise floor without clipping 0 dBFS.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => resetPeakHold()}
              className="px-2.5 py-1 rounded console-btn-surface text-[11px] font-mono text-amber-300 flex items-center gap-1"
              title="Clear all latched peak hold and clip flags"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset All Peaks</span>
            </button>
            <button
              type="button"
              onClick={closeGainStagingAssistant}
              className="p-1.5 rounded console-btn-surface text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Calibration Toolbar & Scale Legend */}
        <div className="px-4 py-2.5 console-subbar border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0 text-[11px] font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">STRIP FILTER:</span>
            <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2 py-0.5 rounded-[2px] text-[10px] ${
                  filterMode === 'all' ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                ALL ({channels.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('active')}
                className={`px-2 py-0.5 rounded-[2px] text-[10px] ${
                  filterMode === 'active' ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                ACTIVE / PATCHED
              </button>
            </div>

            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-400 hidden sm:inline">TARGET NOMINAL:</span>
            {[-20, -18, -14].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTargetNominalRmsDb(t)}
                className={`px-2 py-0.5 rounded text-[10px] border ${
                  targetNominalRmsDb === t
                    ? 'console-accent-active font-bold'
                    : 'console-btn-surface text-slate-300'
                }`}
              >
                {t} dBFS
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-300">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[1px] bg-sky-500/50 border border-sky-400" />
              Noise Floor
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500/35 border border-emerald-400" />
              Sweet Spot (-20..-12 dBFS)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[1px] bg-amber-400" />
              Peak Hold
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[1px] bg-rose-500" />
              0 dBFS Clip
            </span>
          </div>
        </div>

        {isManualPreamp && (
          <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-[11px] font-mono text-amber-200 shrink-0">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Physical desk preamp pots remain manual-only; use SW Trim (±18 dB) here for precision digital nominal alignment, or adjust hardware gain pots if input clips before the ADC.
            </span>
          </div>
        )}

        {/* Channel Strip Calibration List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {displayedChannels.map((ch) => {
            const m = meters[ch.id];
            const signalPresent = Boolean(m?.signalPresent);
            const preRms = m?.inputRmsDbfs ?? -80;
            const postTrimPeak = m?.peakDbfs ?? -80;
            const postTrimRms = m?.rmsDbfs ?? -80;
            const peakHold = m?.peakHoldDbfs ?? -80;
            const noiseFloor = m?.noiseFloorDbfs ?? -80;
            const clipping = Boolean(m?.clipping);
            const peakHoldClipped = Boolean(m?.peakHoldClipped);

            const verdict = evaluateGainStage(
              signalPresent,
              postTrimRms,
              postTrimPeak,
              clipping,
              peakHoldClipped,
              noiseFloor,
              isManualPreamp
            );

            const snrDb = Math.max(0, postTrimRms - noiseFloor);
            const headroomDb = Math.max(0, -peakHold);

            const noisePct = dbToPct(noiseFloor);
            const rmsPct = dbToPct(postTrimRms);
            const peakPct = dbToPct(postTrimPeak);
            const peakHoldPct = dbToPct(peakHold);
            const sweetLeftPct = dbToPct(-20);
            const sweetWidthPct = dbToPct(-12) - sweetLeftPct;
            const hotLeftPct = dbToPct(-6);
            const hotWidthPct = 100 - hotLeftPct;

            return (
              <div
                key={ch.id}
                className={`console-panel rounded-lg p-3 border space-y-2 ${
                  gainStagingChannelId === ch.id
                    ? 'border-amber-400/70'
                    : peakHoldClipped
                      ? 'border-rose-500/60'
                      : 'border-white/10'
                }`}
              >
                {/* Row 1: Identity, Telemetry Readout, Status Badge & Quick Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-white/[0.06] font-mono text-[10px] font-bold text-amber-300">
                      CH {String(ch.number).padStart(2, '0')}
                    </span>
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {ch.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 truncate hidden sm:inline">
                      ({ch.sourceBinding?.active ? ch.sourceBinding.label : ch.physicalPort})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                    <span className="text-slate-400">
                      FLOOR: <strong className="text-sky-300 tabular-nums">{noiseFloor.toFixed(1)}</strong>
                    </span>
                    <span className="text-slate-400">
                      SNR: <strong className="text-emerald-300 tabular-nums">{snrDb.toFixed(1)} dB</strong>
                    </span>
                    <span className="text-slate-400">
                      RMS: <strong className="text-slate-100 tabular-nums">{postTrimRms.toFixed(1)}</strong>
                    </span>
                    <span className="text-slate-400">
                      PK HOLD:{' '}
                      <strong className={peakHoldClipped ? 'text-rose-400' : 'text-amber-300'}>
                        {peakHold.toFixed(1)} dBFS
                      </strong>
                    </span>
                    <span className="text-slate-400">
                      HDRM: <strong className="text-emerald-300 tabular-nums">{headroomDb.toFixed(1)} dB</strong>
                    </span>
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${verdict.colorClass}`}>
                      {verdict.label}
                    </span>
                  </div>
                </div>

                {/* Row 2: Calibrated Gain-Staging Meter Bar (-80 dBFS .. 0 dBFS) */}
                <div className="space-y-1">
                  <div className="relative h-6 console-well rounded border border-white/10 overflow-hidden">
                    {/* Optimal Sweet Spot band (-20 to -12 dBFS) */}
                    <div
                      style={{ left: `${sweetLeftPct}%`, width: `${sweetWidthPct}%` }}
                      className="absolute inset-y-0 bg-emerald-500/15 border-x border-emerald-400/45"
                      title="Optimal Nominal Sweet Spot (-20 to -12 dBFS)"
                    />
                    {/* Danger / Near-Clip Zone (-6 to 0 dBFS) */}
                    <div
                      style={{ left: `${hotLeftPct}%`, width: `${hotWidthPct}%` }}
                      className="absolute inset-y-0 bg-rose-500/15 border-l border-rose-500/40"
                      title="Near-Clip / Clipping Zone (-6 to 0 dBFS)"
                    />

                    {/* Live Noise Floor Fill */}
                    <div
                      style={{ width: `${noisePct}%` }}
                      className="absolute inset-y-0 left-0 bg-sky-900/40 border-r-2 border-sky-400/80 transition-all duration-150"
                      title={`Measured Noise Floor: ${noiseFloor.toFixed(1)} dBFS`}
                    />

                    {/* Live Peak Envelope */}
                    <div
                      style={{ width: `${peakPct}%` }}
                      className="absolute top-1.5 bottom-1.5 left-0 bg-amber-400/35 transition-all duration-75"
                    />

                    {/* Live RMS Bar */}
                    <div
                      style={{ width: `${rmsPct}%` }}
                      className={`absolute top-1 bottom-1 left-0 transition-all duration-75 ${
                        clipping
                          ? 'bg-rose-500'
                          : postTrimRms >= -22 && postTrimRms <= -10
                            ? 'bg-emerald-400'
                            : postTrimRms > -10
                              ? 'bg-amber-400'
                              : 'bg-sky-400'
                      }`}
                    />

                    {/* Target Nominal Tick (-18 / -20 / -14 dBFS) */}
                    <div
                      style={{ left: `${dbToPct(targetNominalRmsDb)}%` }}
                      className="absolute inset-y-0 w-[2px] bg-white/75"
                      title={`Target Nominal ${targetNominalRmsDb} dBFS`}
                    />

                    {/* Latched Peak Hold Indicator Needle */}
                    <div
                      style={{ left: `calc(${peakHoldPct}% - 2px)` }}
                      className={`absolute inset-y-0 w-1 ${
                        peakHoldClipped ? 'bg-rose-400 shadow-[0_0_8px_#f43f5e]' : 'bg-amber-300'
                      }`}
                      title={`Peak Hold: ${peakHold.toFixed(1)} dBFS`}
                    />

                    {/* 0 dBFS Clipping Indicator Lamp */}
                    <div
                      className={`absolute right-0 inset-y-0 w-2 ${
                        peakHoldClipped ? 'bg-rose-500' : 'bg-slate-800'
                      }`}
                    />
                  </div>

                  {/* Scale labels */}
                  <div className="flex justify-between text-[8.5px] font-mono text-slate-500 px-0.5">
                    <span>-80 dBFS</span>
                    <span>-60</span>
                    <span>-40</span>
                    <span className="text-emerald-400">-20 .. -12 NOMINAL</span>
                    <span className="text-amber-400">-6</span>
                    <span className="text-rose-400">0 dBFS CLIP</span>
                  </div>
                </div>

                {/* Row 3: Interactive Trim Adjustment, Auto-Stage, HPF & Source Guidance */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-300 min-w-0 flex-1">
                    {verdict.label === 'OPTIMAL' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          verdict.label === 'CLIPPING' ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      />
                    )}
                    <span className="truncate">{verdict.guidance}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 console-well rounded px-2 py-1">
                      <Sliders className="w-3 h-3 text-sky-400" />
                      <span className="text-[10px] font-mono text-slate-400">SW TRIM</span>
                      <input
                        type="range"
                        min={-18}
                        max={18}
                        step={0.5}
                        value={ch.softwareTrimDb}
                        onChange={(e) =>
                          updateChannel(ch.id, { softwareTrimDb: Number(e.target.value) })
                        }
                        className="w-24 accent-amber-400 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono font-bold text-amber-300 w-12 text-right tabular-nums">
                        {ch.softwareTrimDb >= 0 ? `+${ch.softwareTrimDb.toFixed(1)}` : ch.softwareTrimDb.toFixed(1)}dB
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!signalPresent}
                      onClick={() => autoStageChannel(ch.id)}
                      className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-400/50 hover:bg-emerald-500/30 disabled:opacity-40 text-[10px] font-mono text-emerald-200 flex items-center gap-1"
                      title={
                        signalPresent
                          ? `Trim input (${preRms.toFixed(1)} dBFS pre-trim) to target ${targetNominalRmsDb} dBFS`
                          : 'Send audio into channel first to auto-stage'
                      }
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>AUTO-STAGE</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateChannel(ch.id, { hpfEnabled: !ch.hpfEnabled })}
                      className={`px-2 py-1 rounded text-[10px] font-mono border ${
                        ch.hpfEnabled
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                          : 'console-btn-surface text-slate-400'
                      }`}
                    >
                      HPF {ch.hpfEnabled ? `${ch.hpfFreqHz}Hz` : 'OFF'}
                    </button>

                    <button
                      type="button"
                      onClick={() => resetPeakHold(ch.id)}
                      className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-slate-300 hover:text-white"
                    >
                      CLR PK
                    </button>

                    {!ch.sourceBinding?.active && (
                      <button
                        type="button"
                        onClick={() => {
                          closeGainStagingAssistant();
                          openSourceBay(ch.id);
                        }}
                        className="px-2 py-1 rounded bg-sky-500/20 border border-sky-400/50 text-[10px] font-mono text-sky-200 flex items-center gap-1"
                      >
                        <Radio className="w-3 h-3" />
                        <span>Patch</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
