import React, { useMemo, useState } from 'react';
import { ShieldAlert, ZapOff, Waves } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { RotaryKnob } from '../hardware/RotaryKnob';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { ArcGauge } from '../hardware/ArcGauge';
import { HorizontalSlider } from '../hardware/HorizontalSlider';
import { MotorizedFader } from '../hardware/MotorizedFader';

export const FeedbackDetectionWorkspace: React.FC = () => {
  const {
    feedbackIncidents,
    channels,
    spectrum,
    updateChannel,
    applyFeedbackNotch,
    dismissFeedbackIncident,
  } = useAudioConsole();

  const [fbTab, setFbTab] = useState<'spectrum' | 'notches'>('spectrum');
  const [detectorSensitivity, setDetectorSensitivity] = useState<number>(78);
  const [holdWindowMs, setHoldWindowMs] = useState<number>(350);
  const [autoRingWatch, setAutoRingWatch] = useState<boolean>(true);

  const watchChannels = channels.slice(0, 4);
  const activeIncidents = feedbackIncidents.filter(
    (f) => f.status === 'feedback_detected' || f.status === 'risk_predicted'
  );
  const activeCount = activeIncidents.length;
  const globalRisk = activeCount > 0 ? Math.min(94, 48 + activeCount * 22) : 6;
  const gainMarginDb = activeCount > 0 ? 11 : 22;

  const liveSpectralPeak = useMemo(() => {
    let bestVal = -80;
    let bestIdx = 0;
    spectrum.forEach((v, idx) => {
      if (v > bestVal) {
        bestVal = v;
        bestIdx = idx;
      }
    });
    const freqHz = Math.round(20 * Math.pow(1000, bestIdx / 63));
    return { freqHz, levelDb: bestVal };
  }, [spectrum]);

  const waterfallRows = useMemo(() => {
    return Array.from({ length: 8 }).map((_, rowIdx) =>
      spectrum.slice(0, 48).map((db) => {
        const val = db - rowIdx * 2.5;
        return Math.max(0, Math.min(1, (val + 76) / 68));
      })
    );
  }, [spectrum]);

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100">
            Harmonic-Aware Feedback Guardian &amp; Notch Rack
          </h1>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'spectrum', label: 'LIVE SPECTRUM & WATERFALL', icon: Waves },
            { id: 'notches', label: `NOTCH PROPOSALS (${feedbackIncidents.length})`, icon: ShieldAlert },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setFbTab(t.id as typeof fbTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  fbTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <ConsoleButton
          label={autoRingWatch ? 'GUARDIAN ACTIVE' : 'PAUSED'}
          size="xs"
          color="emerald"
          active={autoRingWatch}
          onClick={() => setAutoRingWatch((v) => !v)}
        />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
        {/* Left 3 Cols: Channel Risk Faders + Global Ring Risk */}
        <div className="xl:col-span-3 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="grid grid-cols-4 gap-1.5">
            {watchChannels.map((ch) => {
              const inc = feedbackIncidents.find(
                (f) =>
                  f.channelId === ch.id &&
                  f.status !== 'dismissed' &&
                  f.status !== 'suppression_applied_verified'
              );
              return (
                <div key={ch.id} className="console-panel rounded p-1.5 flex flex-col items-center gap-1">
                  <span className="text-[9px] font-mono text-slate-200 truncate w-full text-center">
                    {ch.shortName}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      inc?.status === 'feedback_detected'
                        ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                        : inc?.status === 'risk_predicted'
                          ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                          : 'bg-emerald-400'
                    }`}
                  />
                  <MotorizedFader
                    valueDb={ch.faderDb}
                    onChange={(db) => updateChannel(ch.id, { faderDb: db })}
                    height={112}
                    showScale={false}
                    accentColor={inc ? 'amber' : 'cyan'}
                  />
                  <ConsoleButton
                    label={ch.mute ? 'M' : 'ON'}
                    size="xs"
                    color={ch.mute ? 'crimson' : 'emerald'}
                    active={!ch.mute}
                    fullWidth
                    onClick={() => updateChannel(ch.id, { mute: !ch.mute })}
                  />
                </div>
              );
            })}
          </div>

          <div className="console-panel rounded p-2.5 flex items-center justify-around">
            <ArcGauge
              value={globalRisk}
              min={0}
              max={100}
              label="RING RISK"
              unit="%"
              subLabel={globalRisk > 65 ? 'CRITICAL' : 'SAFE'}
              size={84}
            />
            <div className="space-y-1.5">
              <RotaryKnob label="SENS" value={detectorSensitivity} min={30} max={98} step={1} unit="%" size={38} accentColor="amber" onChange={setDetectorSensitivity} />
              <RotaryKnob label="HOLD" value={holdWindowMs} min={100} max={1000} step={25} unit="ms" size={38} accentColor="cyan" onChange={setHoldWindowMs} />
            </div>
          </div>
        </div>

        {/* Center 6 Cols: Tabbed Live Spectrum+Waterfall OR Active Notch Rack */}
        <div className="xl:col-span-6 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
          {fbTab === 'spectrum' ? (
            <>
              <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/10 pb-1.5">
                <span className={activeCount > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {activeCount > 0 ? `● ${activeCount} NARROWBAND RING DETECTED` : '● CLEAN FLOOR (HARMONIC REJECTION ACTIVE)'}
                </span>
                <span className="text-amber-300">
                  {liveSpectralPeak.levelDb > -65
                    ? `Peak: ${liveSpectralPeak.freqHz} Hz (${liveSpectralPeak.levelDb.toFixed(1)} dBFS)`
                    : 'FFT Idle · Patch an input'}
                </span>
              </div>

              <div className="dark-instrument-scope rounded p-3 flex-1 min-h-0 flex flex-col justify-between gap-2">
                <div className="flex-1 min-h-0 flex items-end gap-[2px]">
                  {spectrum.map((val, i) => {
                    const freq = 20 * Math.pow(1000, i / 63);
                    const isRingHotspot = activeIncidents.some(
                      (inc) => Math.abs(freq - inc.freqHz) / Math.max(40, inc.freqHz) < 0.14
                    );
                    const h = Math.max(3, Math.min(100, ((val + 80) / 76) * 100));
                    return (
                      <div key={i} className="flex-1 h-full flex flex-col justify-end">
                        <div
                          style={{ height: `${h}%` }}
                          className={`w-full rounded-t-[1px] ${
                            isRingHotspot
                              ? 'bg-gradient-to-t from-amber-500 to-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.65)]'
                              : 'bg-sky-500/65'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="pt-1.5 border-t border-white/[0.08] space-y-1">
                  <div className="text-[9px] font-mono text-slate-400">FREQUENCY WATERFALL</div>
                  <div className="space-y-[2px]">
                    {waterfallRows.map((row, rIdx) => (
                      <div key={rIdx} className="grid grid-cols-[repeat(48,minmax(0,1fr))] gap-[1px] h-2">
                        {row.map((norm, bIdx) => (
                          <div
                            key={bIdx}
                            style={{
                              backgroundColor:
                                norm > 0.72
                                  ? 'rgba(244,63,94,0.9)'
                                  : norm > 0.5
                                    ? 'rgba(245,158,11,0.75)'
                                    : `rgba(56,189,248,${(norm * 0.55).toFixed(2)})`,
                            }}
                            className="rounded-[1px]"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
              {feedbackIncidents.length === 0 ? (
                <div className="console-well rounded p-6 text-center text-xs font-mono text-slate-400 my-auto">
                  No active narrowband ringing detected. Real-time harmonic-aware FFT guardian actively watching 80 Hz – 12 kHz.
                </div>
              ) : (
                feedbackIncidents.map((inc) => {
                  const ch = channels.find((c) => c.id === inc.channelId);
                  const resolved =
                    inc.status === 'suppression_applied_verified' || inc.status === 'dismissed';
                  return (
                    <div
                      key={inc.id}
                      className="console-well rounded px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-[140px]">
                        <div className="text-xs font-mono font-bold text-amber-300">
                          {inc.freqHz} Hz · Q {inc.qEstimate.toFixed(1)}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          CH {String(ch?.number ?? 1).padStart(2, '0')} · {ch?.shortName ?? inc.channelId} ·{' '}
                          {inc.levelDb.toFixed(1)} dBFS
                        </div>
                      </div>
                      <div className="flex-1 min-w-[120px] max-w-[180px]">
                        <HorizontalSlider
                          label="NOTCH"
                          value={inc.notchProposedDb}
                          min={-15}
                          max={0}
                          step={0.5}
                          unit="dB"
                          accentColor="rose"
                          disabled={resolved}
                          onChange={() => {}}
                        />
                      </div>
                      {!resolved ? (
                        <div className="flex items-center gap-1.5">
                          <ConsoleButton label={`NOTCH ${inc.notchProposedDb}dB`} size="xs" color="amber" active={true} onClick={() => applyFeedbackNotch(inc.id)} />
                          <ConsoleButton label="IGNORE" size="xs" color="crimson" active={false} onClick={() => dismissFeedbackIncident(inc.id)} />
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                          {inc.status === 'dismissed' && <ZapOff className="w-3 h-3 text-slate-400" />}
                          {inc.status === 'suppression_applied_verified' ? 'NOTCH ACTIVE' : 'IGNORED'}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Right 3 Cols: Adaptive Notch Knobs & Gain Margin */}
        <div className="xl:col-span-3 console-chassis rounded-lg border p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="text-xs font-mono font-semibold text-sky-300 uppercase border-b border-white/10 pb-1.5">
            Adaptive Notch Filters
          </div>

          <div className="grid grid-cols-2 gap-1.5 flex-1 content-start">
            {feedbackIncidents.slice(0, 4).map((inc, idx) => (
              <div key={inc.id} className="console-panel rounded p-2 flex flex-col items-center gap-1">
                <div className="text-[9px] font-mono text-amber-300">
                  F{idx + 1}: {inc.freqHz}Hz
                </div>
                <RotaryKnob label="Q" value={inc.qEstimate} min={4} max={24} step={0.5} size={32} accentColor="cyan" onChange={() => {}} />
                <ConsoleButton
                  label={inc.status === 'suppression_applied_verified' ? 'ACTIVE' : 'ENGAGE'}
                  size="xs"
                  color="emerald"
                  active={inc.status === 'suppression_applied_verified'}
                  fullWidth
                  onClick={() => applyFeedbackNotch(inc.id)}
                />
              </div>
            ))}
          </div>

          <div className="console-panel rounded p-2.5 flex flex-col items-center gap-1.5">
            <ArcGauge value={gainMarginDb} min={0} max={24} label="GAIN MARGIN" unit=" dB" accent="emerald" size={88} />
            <div className="text-[9px] font-mono text-slate-400 text-center">
              Safe-Ops: Live PA faders never auto-mute.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
