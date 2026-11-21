import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  Circle,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  AUTOMATION_PARAM_META,
  evaluateAutomationLaneAt,
  useAudioConsole,
} from '../../engine/store';
import type {
  AutomationKeyframe,
  AutomationLane,
  AutomationMode,
  AutomationParameterKey,
  ChannelStrip,
} from '../../engine/types';

interface ChannelAutomationLanesProps {
  visibleChannels: ChannelStrip[];
  onCollapse?: () => void;
}

const PARAM_OPTIONS: AutomationParameterKey[] = [
  'faderDb',
  'pan',
  'softwareTrimDb',
  'mute',
  'hpfFreqHz',
  'sendMon1',
  'sendStream',
];

function formatTimecode(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const rem = clamped - mins * 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(1).padStart(4, '0')}`;
}

function formatParamValue(param: AutomationParameterKey, val: number): string {
  if (param === 'mute') return val >= 0.5 ? 'MUTED' : 'OPEN';
  if (param === 'pan') {
    if (Math.abs(val) < 1) return 'C';
    return val < 0 ? `L${Math.abs(Math.round(val))}` : `R${Math.round(val)}`;
  }
  if (param === 'hpfFreqHz') return `${Math.round(val)} Hz`;
  return `${val >= 0 && param !== 'faderDb' ? '+' : ''}${val.toFixed(1)} dB`;
}

interface LaneCanvasProps {
  lane: AutomationLane;
  durationSec: number;
  playheadSec: number;
  onUpsertPoint: (laneId: string, timeSec: number, value: number, replacePointId?: string) => void;
  onRemovePoint: (laneId: string, pointId: string) => void;
}

const LaneEnvelopeCanvas: React.FC<LaneCanvasProps> = ({
  lane,
  durationSec,
  playheadSec,
  onUpsertPoint,
  onRemovePoint,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<{
    pointId: string;
    timeSec: number;
    value: number;
  } | null>(null);

  const meta = AUTOMATION_PARAM_META[lane.parameter];
  const w = 600;
  const h = 44;
  const padY = 5;

  const valueToY = (v: number) => {
    const norm = (v - meta.min) / Math.max(0.0001, meta.max - meta.min);
    return h - padY - norm * (h - padY * 2);
  };

  const timeToX = (t: number) => (Math.max(0, Math.min(durationSec, t)) / Math.max(1, durationSec)) * w;

  const clientToCoords = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { timeSec: 0, value: meta.min };
    }
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const timeSec = Math.round(nx * durationSec * 20) / 20;
    const normVal = Math.max(0, Math.min(1, 1 - (ny * h - padY) / (h - padY * 2)));
    const rawVal = meta.min + normVal * (meta.max - meta.min);
    const snappedVal =
      lane.parameter === 'mute'
        ? rawVal >= 0.5
          ? 1
          : 0
        : Math.round(rawVal / meta.step) * meta.step;
    return { timeSec, value: Number(snappedVal.toFixed(2)) };
  };

  const renderedPoints: AutomationKeyframe[] = useMemo(() => {
    if (!dragging) return lane.points;
    return lane.points
      .map((p) =>
        p.id === dragging.pointId
          ? { ...p, timeSec: dragging.timeSec, value: dragging.value }
          : p
      )
      .sort((a, b) => a.timeSec - b.timeSec);
  }, [lane.points, dragging]);

  const { linePath, areaPath } = useMemo(() => {
    if (renderedPoints.length === 0) return { linePath: '', areaPath: '' };
    const pts = renderedPoints;
    const coords: { x: number; y: number }[] = [];

    if (pts[0].timeSec > 0) {
      coords.push({ x: 0, y: valueToY(pts[0].value) });
    }
    pts.forEach((p, idx) => {
      const px = timeToX(p.timeSec);
      const py = valueToY(p.value);
      if (lane.parameter === 'mute' && idx > 0) {
        coords.push({ x: px, y: valueToY(pts[idx - 1].value) });
      }
      coords.push({ x: px, y: py });
    });
    if (pts[pts.length - 1].timeSec < durationSec) {
      coords.push({ x: w, y: valueToY(pts[pts.length - 1].value) });
    }

    const line = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    const area = `${line} L ${w} ${h} L 0 ${h} Z`;
    return { linePath: line, areaPath: area };
  }, [renderedPoints, durationSec, lane.parameter]);

  const playheadX = timeToX(playheadSec);
  const zeroNormY =
    meta.min < 0 && meta.max > 0 ? valueToY(0) : meta.min === 0 ? valueToY(0.5) : h / 2;

  return (
    <div className="relative flex-1 min-w-0 h-11 dark-instrument-scope rounded overflow-hidden border border-white/[0.08]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-full cursor-crosshair block"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as SVGElement).dataset.pointId) return;
          const { timeSec, value } = clientToCoords(e.clientX, e.clientY);
          onUpsertPoint(lane.id, timeSec, value);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const { timeSec, value } = clientToCoords(e.clientX, e.clientY);
          setDragging((prev) => (prev ? { ...prev, timeSec, value } : null));
          onUpsertPoint(lane.id, timeSec, value, dragging.pointId);
        }}
        onPointerUp={(e) => {
          if (!dragging) return;
          try {
            (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          setDragging(null);
        }}
      >
        {/* Reference Horizon */}
        <line
          x1="0"
          y1={zeroNormY}
          x2={w}
          y2={zeroNormY}
          stroke="rgba(148,163,184,0.18)"
          strokeWidth="0.8"
          strokeDasharray="3 3"
        />

        {/* Vertical Beat/Time Grid */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={w * frac}
            y1="0"
            x2={w * frac}
            y2={h}
            stroke="rgba(148,163,184,0.1)"
            strokeWidth="0.7"
          />
        ))}

        {/* Shaded Envelope Area & Curve */}
        {areaPath && (
          <path
            d={areaPath}
            fill={lane.enabled ? meta.color : '#64748b'}
            fillOpacity={lane.enabled ? 0.14 : 0.06}
          />
        )}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={lane.enabled ? meta.color : '#64748b'}
            strokeWidth={lane.enabled ? 1.8 : 1.2}
            strokeDasharray={lane.enabled ? undefined : '4 3'}
          />
        )}

        {/* Playhead Marker */}
        <line
          x1={playheadX}
          y1="0"
          x2={playheadX}
          y2={h}
          stroke="#fbbf24"
          strokeWidth="1.4"
        />
      </svg>

      {/* Interactive Keyframe Nodes rendered in crisp screen coordinates */}
      {renderedPoints.map((pt) => {
        const leftPct = (pt.timeSec / Math.max(1, durationSec)) * 100;
        const topPct = (valueToY(pt.value) / h) * 100;
        const isDraggingThis = dragging?.pointId === pt.id;
        return (
          <button
            key={pt.id}
            type="button"
            data-point-id={pt.id}
            title={`${formatTimecode(pt.timeSec)} · ${formatParamValue(lane.parameter, pt.value)} (Drag to edit, Double-click to delete)`}
            onPointerDown={(e) => {
              e.stopPropagation();
              svgRef.current?.setPointerCapture?.(e.pointerId);
              setDragging({ pointId: pt.id, timeSec: pt.timeSec, value: pt.value });
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onRemovePoint(lane.id, pt.id);
            }}
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              borderColor: lane.enabled ? meta.color : '#94a3b8',
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 transition-transform ${
              isDraggingThis
                ? 'scale-125 bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)]'
                : 'bg-[#090b0e] hover:scale-125'
            }`}
          />
        );
      })}

      {/* Live Drag Readout HUD */}
      {dragging && (
        <div className="pointer-events-none absolute top-0.5 right-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-white/15 text-[9px] font-mono text-amber-300 tabular-nums">
          {formatTimecode(dragging.timeSec)} · {formatParamValue(lane.parameter, dragging.value)}
        </div>
      )}
    </div>
  );
};

export const ChannelAutomationLanes: React.FC<ChannelAutomationLanesProps> = ({
  visibleChannels,
  onCollapse,
}) => {
  const {
    channels,
    selectedChannelId,
    automationLanes,
    automationTransport,
    toggleAutomationPlay,
    stopAndRewindAutomation,
    setAutomationPlayhead,
    setAutomationMode,
    toggleAutomationRecord,
    setAutomationDuration,
    toggleAutomationLoop,
    ensureAutomationLane,
    toggleAutomationLaneEnabled,
    removeAutomationLane,
    clearAutomationLanePoints,
    upsertAutomationPoint,
    removeAutomationPoint,
    captureAutomationSnapshotPoint,
  } = useAudioConsole();

  const [newLaneChannelId, setNewLaneChannelId] = useState<string>(selectedChannelId);
  const [newLaneParam, setNewLaneParam] = useState<AutomationParameterKey>('faderDb');
  const [scopeFilter, setScopeFilter] = useState<'visible' | 'all'>('visible');
  const [scrubbingRuler, setScrubbingRuler] = useState<boolean>(false);
  const rulerRef = useRef<HTMLDivElement | null>(null);

  const effectiveChannelId = channels.some((c) => c.id === newLaneChannelId)
    ? newLaneChannelId
    : selectedChannelId;

  const visibleIdSet = useMemo(
    () => new Set(visibleChannels.map((c) => c.id)),
    [visibleChannels]
  );

  const displayedLanes = useMemo(() => {
    const channelOrder = new Map(channels.map((c, i) => [c.id, i]));
    const filtered =
      scopeFilter === 'visible'
        ? automationLanes.filter((l) => visibleIdSet.has(l.channelId))
        : automationLanes;
    return [...filtered].sort((a, b) => {
      const ia = channelOrder.get(a.channelId) ?? 999;
      const ib = channelOrder.get(b.channelId) ?? 999;
      if (ia !== ib) return ia - ib;
      return a.parameter.localeCompare(b.parameter);
    });
  }, [automationLanes, channels, scopeFilter, visibleIdSet]);

  const scrubFromClientX = (clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setAutomationPlayhead(ratio * automationTransport.durationSec);
  };

  const playheadPct =
    (automationTransport.playheadSec / Math.max(1, automationTransport.durationSec)) * 100;

  return (
    <div className="console-panel rounded-md border border-white/12 p-2 flex flex-col gap-1.5 shrink-0">
      {/* Automation Transport & Mode Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-200 whitespace-nowrap">
            Automation Lanes
          </span>
          <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
            · {automationLanes.length} total
          </span>

          {/* Transport Controls */}
          <div className="flex items-center console-well rounded p-0.5 gap-0.5 ml-1">
            <button
              type="button"
              onClick={toggleAutomationPlay}
              title={automationTransport.playing ? 'Pause Automation' : 'Play Automation'}
              className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono flex items-center gap-1 whitespace-nowrap shrink-0 ${
                automationTransport.playing
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {automationTransport.playing ? (
                <Pause className="w-2.5 h-2.5" />
              ) : (
                <Play className="w-2.5 h-2.5" />
              )}
              <span>{automationTransport.playing ? 'PAUSE' : 'PLAY'}</span>
            </button>

            <button
              type="button"
              onClick={stopAndRewindAutomation}
              title="Stop & Rewind to 00:00.0"
              className="px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono text-slate-300 hover:bg-white/10 flex items-center gap-0.5 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>REW</span>
            </button>

            <button
              type="button"
              onClick={toggleAutomationRecord}
              title="Arm & Record Live Fader / Pan / Mute / Send Changes"
              className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono flex items-center gap-1 whitespace-nowrap shrink-0 ${
                automationTransport.recording
                  ? 'bg-rose-500 text-white font-bold'
                  : 'text-rose-300 hover:bg-rose-500/15'
              }`}
            >
              <Circle className="w-2.5 h-2.5 fill-current" />
              <span>{automationTransport.recording ? 'REC LIVE' : 'REC AUTO'}</span>
            </button>

            <button
              type="button"
              onClick={toggleAutomationLoop}
              title="Loop Timeline"
              className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono flex items-center gap-0.5 whitespace-nowrap shrink-0 ${
                automationTransport.loop
                  ? 'bg-sky-500/25 text-sky-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Repeat className="w-2.5 h-2.5" />
              <span>LOOP</span>
            </button>
          </div>

          {/* Mode Selector */}
          <div className="console-module-rack p-0.5 rounded hidden sm:flex items-center gap-0.5">
            {(['off', 'read', 'touch', 'write'] as AutomationMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAutomationMode(mode)}
                className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono uppercase whitespace-nowrap shrink-0 ${
                  automationTransport.mode === mode
                    ? mode === 'write'
                      ? 'bg-rose-500 text-white font-bold'
                      : mode === 'touch'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'console-module-tab-active'
                    : 'console-module-tab'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <span className="text-[10px] font-mono tabular-nums text-amber-300 bg-slate-950/70 border border-white/10 rounded px-1.5 py-0.5 whitespace-nowrap shrink-0">
            {formatTimecode(automationTransport.playheadSec)} /{' '}
            {formatTimecode(automationTransport.durationSec)}
          </span>
        </div>

        {/* Lane Creation & Scope Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            aria-label="Automation timeline duration"
            value={automationTransport.durationSec}
            onChange={(e) => setAutomationDuration(Number(e.target.value))}
            className="console-btn-surface rounded px-1.5 py-0.5 text-[9px] font-mono text-slate-200"
          >
            <option value={30}>30s Pass</option>
            <option value={60}>60s Pass</option>
            <option value={120}>2m Service</option>
            <option value={300}>5m Service</option>
          </select>

          <button
            type="button"
            onClick={() => setScopeFilter((s) => (s === 'visible' ? 'all' : 'visible'))}
            className="px-1.5 py-0.5 rounded console-btn-surface text-[9px] font-mono text-slate-300 whitespace-nowrap shrink-0"
            title="Switch between visible fader bank strips and all console lanes"
          >
            {scopeFilter === 'visible' ? 'VIEW: BANK' : 'VIEW: ALL'}
          </button>

          <div className="flex items-center gap-1 console-well rounded p-0.5">
            <select
              aria-label="Channel for new automation lane"
              value={effectiveChannelId}
              onChange={(e) => setNewLaneChannelId(e.target.value)}
              className="bg-transparent text-[9px] font-mono text-slate-200 px-1 py-0.5 outline-none"
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id} className="bg-slate-900 text-slate-100">
                  CH{String(ch.number).padStart(2, '0')} {ch.shortName}
                </option>
              ))}
            </select>
            <select
              aria-label="Parameter for new automation lane"
              value={newLaneParam}
              onChange={(e) => setNewLaneParam(e.target.value as AutomationParameterKey)}
              className="bg-transparent text-[9px] font-mono text-amber-300 px-1 py-0.5 outline-none"
            >
              {PARAM_OPTIONS.map((p) => (
                <option key={p} value={p} className="bg-slate-900 text-slate-100">
                  {AUTOMATION_PARAM_META[p].shortLabel}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => ensureAutomationLane(effectiveChannelId, newLaneParam)}
              className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-mono font-bold flex items-center gap-0.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-2.5 h-2.5" />
              <span>LANE</span>
            </button>
          </div>

          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse Automation Lanes"
              className="p-0.5 rounded console-btn-surface text-slate-400 hover:text-slate-100"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Scrubbable Time Ruler */}
      <div className="flex items-center gap-2">
        <div className="w-44 shrink-0 flex items-center justify-between text-[9px] font-mono text-slate-400 px-1">
          <span>CHANNEL · PARAM</span>
          <span className="text-slate-500">VALUE</span>
        </div>
        <div
          ref={rulerRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setScrubbingRuler(true);
            scrubFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!scrubbingRuler) return;
            scrubFromClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            setScrubbingRuler(false);
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }
          }}
          className="relative flex-1 min-w-0 h-4 console-well rounded border border-white/[0.07] cursor-ew-resize select-none overflow-hidden"
          title="Click or drag to scrub automation playhead"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const sec = automationTransport.durationSec * frac;
            return (
              <span
                key={frac}
                style={{ left: `${frac * 100}%` }}
                className={`absolute top-0.5 text-[8px] font-mono tabular-nums text-slate-400 ${
                  frac === 1
                    ? '-translate-x-full pr-1'
                    : frac === 0
                      ? 'pl-1'
                      : '-translate-x-1/2'
                }`}
              >
                {Math.round(sec)}s
              </span>
            );
          })}
          <div
            style={{ left: `${playheadPct}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-[0_0_6px_#f59e0b]"
          />
        </div>
      </div>

      {/* Editable Automation Lanes */}
      <div className="max-h-32 overflow-y-auto space-y-1 pr-0.5">
        {displayedLanes.length === 0 ? (
          <div className="console-well rounded border border-dashed border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-slate-400">
              {automationLanes.length === 0
                ? 'No automation lanes yet. Add a lane or arm REC AUTO and move any fader, pan, mute, or send.'
                : `No automation lanes on this channel bank (${automationLanes.length} on other channels).`}
            </span>
            <div className="flex items-center gap-1.5">
              {automationLanes.length > 0 && scopeFilter === 'visible' && (
                <button
                  type="button"
                  onClick={() => setScopeFilter('all')}
                  className="px-2 py-0.5 rounded console-btn-surface text-[9px] font-mono text-sky-300 whitespace-nowrap"
                >
                  Show All {automationLanes.length} Lanes
                </button>
              )}
              <button
                type="button"
                onClick={() => ensureAutomationLane(selectedChannelId, 'faderDb')}
                className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[9px] font-mono text-amber-200 whitespace-nowrap"
              >
                + Add Fader Lane ({channels.find((c) => c.id === selectedChannelId)?.shortName ?? 'CH'})
              </button>
            </div>
          </div>
        ) : (
          displayedLanes.map((lane) => {
            const ch = channels.find((c) => c.id === lane.channelId);
            const meta = AUTOMATION_PARAM_META[lane.parameter];
            const evalVal = evaluateAutomationLaneAt(lane, automationTransport.playheadSec);
            return (
              <div key={lane.id} className="flex items-center gap-2">
                {/* Lane Header & Controls */}
                <div className="w-44 shrink-0 console-well rounded border border-white/[0.07] px-1.5 py-1 flex flex-col justify-between h-11">
                  <div className="flex items-center justify-between gap-1 text-[9px] font-mono">
                    <span className="truncate font-semibold text-slate-200">
                      <span style={{ color: meta.color }}>
                        CH{String(ch?.number ?? '?').padStart(2, '0')}
                      </span>{' '}
                      · {ch?.shortName ?? lane.channelId} · {meta.shortLabel}
                    </span>
                    <span className="tabular-nums text-amber-300 shrink-0">
                      {evalVal !== null ? formatParamValue(lane.parameter, evalVal) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => toggleAutomationLaneEnabled(lane.id)}
                      className={`px-1 py-0.2 rounded text-[8px] font-mono border ${
                        lane.enabled
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-800 border-white/10 text-slate-500'
                      }`}
                    >
                      {lane.enabled ? 'READ' : 'BYP'}
                    </button>
                    <button
                      type="button"
                      onClick={() => captureAutomationSnapshotPoint(lane.channelId, lane.parameter)}
                      className="px-1 py-0.2 rounded console-btn-surface text-[8px] font-mono text-sky-300"
                      title="Insert keyframe using current channel value at playhead"
                    >
                      +PT
                    </button>
                    <button
                      type="button"
                      onClick={() => clearAutomationLanePoints(lane.id)}
                      className="px-1 py-0.2 rounded console-btn-surface text-[8px] font-mono text-slate-400 hover:text-amber-300"
                      title="Clear all keyframes in this lane"
                    >
                      CLR
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAutomationLane(lane.id)}
                      className="p-0.5 rounded text-slate-500 hover:text-rose-400"
                      title="Delete automation lane"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {/* Interactive Envelope Editor */}
                <LaneEnvelopeCanvas
                  lane={lane}
                  durationSec={automationTransport.durationSec}
                  playheadSec={automationTransport.playheadSec}
                  onUpsertPoint={upsertAutomationPoint}
                  onRemovePoint={removeAutomationPoint}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
