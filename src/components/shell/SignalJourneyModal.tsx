import React, { useState } from 'react';
import { ArrowRight, GitBranch, X, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import type { GraphTraceStage } from '../../engine/types';

export const SignalJourneyModal: React.FC = () => {
  const {
    signalJourneyTargetId,
    closeSignalJourney,
    traceSignalJourney,
    channels,
    buses,
    speakers,
    virtualCables,
    openSignalJourney,
    setWorkspace,
    setSelectedChannelId,
  } = useAudioConsole();

  const [direction, setDirection] = useState<'both' | 'forward' | 'reverse'>('both');

  if (!signalJourneyTargetId) return null;

  const trace = traceSignalJourney(signalJourneyTargetId, direction);

  const jumpToStageWorkspace = (stage: GraphTraceStage) => {
    if (stage.nodeId.startsWith('ch-')) {
      setSelectedChannelId(stage.nodeId);
      setWorkspace('inputs', 'live-console');
      closeSignalJourney();
    } else if (stage.nodeId.startsWith('bus-') || stage.nodeId.startsWith('vc-')) {
      setWorkspace('routing', 'universal-routing');
      closeSignalJourney();
    } else if (stage.nodeId.startsWith('spk-')) {
      setWorkspace('routing', 'speaker-management');
      closeSignalJourney();
    }
  };

  const renderStageCard = (stage: GraphTraceStage, highlight = false) => {
    const statusColor =
      stage.status === 'muted'
        ? 'text-rose-400'
        : stage.status === 'bypassed'
          ? 'text-amber-300'
          : stage.status === 'manual'
            ? 'text-amber-300'
            : 'text-emerald-400';

    return (
      <div
        key={stage.nodeId}
        className={`console-panel rounded-md p-3 flex flex-col gap-1.5 ${
          highlight ? 'ring-1 ring-amber-400/70' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-100 truncate">{stage.label}</span>
          <span className={`text-[10px] font-mono uppercase ${statusColor}`}>{stage.status}</span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span>Domain: {stage.domain}</span>
          <span>·</span>
          <span>Link: {stage.connectionKind}</span>
          <span>·</span>
          <span className="tabular-nums">+{stage.latencyMs.toFixed(2)} ms</span>
        </div>

        <p className="text-[11px] text-slate-300 leading-snug">{stage.note}</p>

        {stage.meter && (
          <div className="console-well rounded px-2 py-1 flex items-center justify-between text-[10px] font-mono tabular-nums">
            <span className="text-slate-400">
              Peak: <strong className="text-slate-100">{stage.meter.peakDbfs.toFixed(1)} dBFS</strong>
            </span>
            <span className="text-slate-400">
              RMS: <strong className="text-emerald-300">{stage.meter.rmsDbfs.toFixed(1)} dBFS</strong>
            </span>
            <span className="text-sky-300">{stage.meter.source}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => openSignalJourney(stage.nodeId)}
            className="text-[10px] font-mono text-sky-400 hover:text-sky-300"
          >
            Focus Trace Here
          </button>
          {(stage.nodeId.startsWith('ch-') || stage.nodeId.startsWith('spk-') || stage.nodeId.startsWith('bus-')) && (
            <button
              type="button"
              onClick={() => jumpToStageWorkspace(stage)}
              className="text-[10px] font-mono text-amber-300 hover:text-amber-200 flex items-center gap-1"
            >
              <span>Open Instrument</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="console-chassis border rounded-lg w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 console-header-bar border-b flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <GitBranch className="w-4 h-4 text-sky-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Universal Signal Journey
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Target: {trace.selected.label} · Graph v{trace.graphVersion} · Generated {trace.generatedAt}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Target Jump */}
            <select
              value={signalJourneyTargetId}
              onChange={(e) => openSignalJourney(e.target.value)}
              className="console-btn-surface rounded px-2.5 py-1 text-xs font-mono text-slate-200"
            >
              <optgroup label="Channels">
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    CH {String(c.number).padStart(2, '0')} · {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Buses">
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Speaker Outputs">
                {speakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
              {virtualCables.length > 0 && (
                <optgroup label="Built-In Virtual Audio Cables">
                  {virtualCables.map((vc) => (
                    <option key={vc.id} value={vc.id}>
                      {vc.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <div className="flex items-center console-well rounded p-0.5">
              {(['reverse', 'both', 'forward'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirection(dir)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono capitalize ${
                    direction === dir ? 'console-accent-solid' : 'text-slate-400'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={closeSignalJourney}
              className="p-1.5 rounded console-btn-surface text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Warnings */}
        {trace.warnings.length > 0 && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{trace.warnings.join(' · ')}</span>
          </div>
        )}

        {/* 3-Column Bidirectional Signal Graph */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase pb-1 border-b border-white/10">
              <span>Upstream Sources</span>
              <span>{trace.upstream.length} stage{trace.upstream.length === 1 ? '' : 's'}</span>
            </div>
            {trace.upstream.length === 0 ? (
              <div className="console-well rounded p-4 text-xs text-slate-500">
                Origin / No upstream nodes shown for current direction.
              </div>
            ) : (
              trace.upstream.map((st) => renderStageCard(st))
            )}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-amber-300 uppercase pb-1 border-b border-amber-500/30">
              <span>Inspected Stage</span>
              <span>Active Graph</span>
            </div>
            {renderStageCard(trace.selected, true)}
            <div className="console-well rounded p-3 text-[11px] text-slate-400 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Signal Truth Verification</span>
              </div>
              <p>
                Hardware controls vs software DSP boundaries are resolved directly from the active device
                capability profile.
              </p>
              <div className="flex items-center gap-1.5 text-amber-300/90 text-[10px] font-mono pt-1">
                <Lock className="w-3 h-3" />
                <span>Physical cables remain distinct from logical software routes</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase pb-1 border-b border-white/10">
              <span>Downstream Destinations</span>
              <span>{trace.downstream.length} branch{trace.downstream.length === 1 ? '' : 'es'}</span>
            </div>
            {trace.downstream.length === 0 ? (
              <div className="console-well rounded p-4 text-xs text-slate-500">
                Terminal output endpoint / No downstream nodes.
              </div>
            ) : (
              trace.downstream.map((st) => renderStageCard(st))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
