import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import type { ConsoleSnapshotProfile, SnapshotRestoreScope } from '../../engine/types';

const SNAPSHOT_CATEGORIES = [
  'Sunday Worship',
  'Rehearsal',
  'Livestream',
  'Conference',
  'Backup',
  'Custom',
] as const;

const RESTORE_SCOPES: { id: SnapshotRestoreScope; label: string; hint: string }[] = [
  {
    id: 'all',
    label: 'Full Console',
    hint: 'Channels, routing, PEQ/GEQ, dynamics, gains, buses, crossovers, outputs & virtual cables',
  },
  {
    id: 'routing',
    label: 'Routing & Outputs',
    hint: 'Main/Sub/Broadcast assigns, aux sends, DCA/Mute groups, buses, speaker sinks & virtual cables',
  },
  {
    id: 'eq',
    label: 'EQ & Dynamics',
    hint: 'HPF, N-band PEQ, 31-band GEQ, gates/compressors, crossovers, output EQs & Virtual DI tone',
  },
  {
    id: 'gains',
    label: 'Gains & Faders',
    hint: 'Software trims, channel faders, pan, polarity, mutes, bus masters & output speaker gains',
  },
];

function formatSnapshotTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isEqEqual(
  a: { eqEnabled: boolean; hpfEnabled: boolean; hpfFreqHz: number; geqEnabled: boolean; geqBands: number[]; eqBands: unknown[]; dynamics: unknown },
  b: { eqEnabled: boolean; hpfEnabled: boolean; hpfFreqHz: number; geqEnabled: boolean; geqBands: number[]; eqBands: unknown[]; dynamics: unknown }
): boolean {
  if (
    a.eqEnabled !== b.eqEnabled ||
    a.hpfEnabled !== b.hpfEnabled ||
    Math.abs(a.hpfFreqHz - b.hpfFreqHz) > 0.5 ||
    a.geqEnabled !== b.geqEnabled
  ) {
    return false;
  }
  return (
    JSON.stringify(a.eqBands) === JSON.stringify(b.eqBands) &&
    JSON.stringify(a.geqBands) === JSON.stringify(b.geqBands) &&
    JSON.stringify(a.dynamics) === JSON.stringify(b.dynamics)
  );
}

function isRoutingEqual(
  a: { assignMain: boolean; assignSub: boolean; assignBroadcast: boolean; dcaGroup: string | null; muteGroup: number | null; sends: unknown },
  b: { assignMain: boolean; assignSub: boolean; assignBroadcast: boolean; dcaGroup: string | null; muteGroup: number | null; sends: unknown }
): boolean {
  if (
    a.assignMain !== b.assignMain ||
    a.assignSub !== b.assignSub ||
    a.assignBroadcast !== b.assignBroadcast ||
    a.dcaGroup !== b.dcaGroup ||
    a.muteGroup !== b.muteGroup
  ) {
    return false;
  }
  return JSON.stringify(a.sends) === JSON.stringify(b.sends);
}

export const SnapshotManagerModal: React.FC = () => {
  const {
    snapshotModalOpen,
    closeSnapshotManager,
    snapshots,
    activeSnapshotId,
    saveSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    importSnapshotJson,
    channels,
    buses,
    speakers,
    virtualCables,
    hardwareProfile,
    canUndo,
    undo,
  } = useAudioConsole();

  const [nameInput, setNameInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<string>('Sunday Worship');
  const [notesInput, setNotesInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoreScope, setRestoreScope] = useState<SnapshotRestoreScope>('all');
  const [statusBanner, setStatusBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!snapshotModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSnapshotManager();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [snapshotModalOpen, closeSnapshotManager]);

  useEffect(() => {
    if (snapshots.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !snapshots.some((s) => s.id === selectedId)) {
      setSelectedId(
        activeSnapshotId && snapshots.some((s) => s.id === activeSnapshotId)
          ? activeSnapshotId
          : snapshots[0].id
      );
    }
  }, [snapshots, selectedId, activeSnapshotId]);

  const filteredSnapshots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return snapshots.filter((snap) => {
      if (categoryFilter !== 'ALL' && snap.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        snap.name.toLowerCase().includes(q) ||
        snap.category.toLowerCase().includes(q) ||
        snap.notes.toLowerCase().includes(q)
      );
    });
  }, [snapshots, searchQuery, categoryFilter]);

  const selectedSnapshot: ConsoleSnapshotProfile | null = useMemo(() => {
    if (!selectedId) return filteredSnapshots[0] ?? null;
    return snapshots.find((s) => s.id === selectedId) ?? filteredSnapshots[0] ?? null;
  }, [snapshots, filteredSnapshots, selectedId]);

  const diffAnalysis = useMemo(() => {
    if (!selectedSnapshot) return null;
    const liveChMap = new Map(channels.map((c) => [c.id, c]));
    const liveBusMap = new Map(buses.map((b) => [b.id, b]));
    const liveSpkMap = new Map(speakers.map((s) => [s.id, s]));

    let gainsChanged = 0;
    let eqChanged = 0;
    let routingChanged = 0;

    const channelDiffRows = selectedSnapshot.channels.map((snapCh) => {
      const liveCh = liveChMap.get(snapCh.id);
      const gainDiff =
        !liveCh ||
        Math.abs(snapCh.faderDb - liveCh.faderDb) >= 0.1 ||
        Math.abs(snapCh.softwareTrimDb - liveCh.softwareTrimDb) >= 0.1 ||
        snapCh.mute !== liveCh.mute ||
        snapCh.pan !== liveCh.pan ||
        snapCh.polarityInvert !== liveCh.polarityInvert;
      const eqDiff = !liveCh || !isEqEqual(snapCh, liveCh);
      const routeDiff = !liveCh || !isRoutingEqual(snapCh, liveCh);

      if (gainDiff) gainsChanged += 1;
      if (eqDiff) eqChanged += 1;
      if (routeDiff) routingChanged += 1;

      return {
        snapCh,
        liveCh,
        gainDiff,
        eqDiff,
        routeDiff,
      };
    });

    const extraLiveChannels = channels.filter(
      (c) => !selectedSnapshot.channels.some((sc) => sc.id === c.id)
    ).length;

    const busesChanged =
      selectedSnapshot.buses.filter((sb) => {
        const lb = liveBusMap.get(sb.id);
        return (
          !lb ||
          Math.abs(sb.faderDb - lb.faderDb) >= 0.1 ||
          sb.mute !== lb.mute ||
          sb.eqEnabled !== lb.eqEnabled ||
          JSON.stringify(sb.eqBands ?? []) !== JSON.stringify(lb.eqBands ?? [])
        );
      }).length +
      buses.filter((b) => !selectedSnapshot.buses.some((sb) => sb.id === b.id)).length;

    const speakersChanged =
      selectedSnapshot.speakers.filter((ss) => {
        const ls = liveSpkMap.get(ss.id);
        return (
          !ls ||
          ss.sourceBusId !== ls.sourceBusId ||
          Math.abs(ss.gainDb - ls.gainDb) >= 0.1 ||
          ss.hpfHz !== ls.hpfHz ||
          ss.lpfHz !== ls.lpfHz ||
          ss.mute !== ls.mute ||
          JSON.stringify(ss.eqBands ?? []) !== JSON.stringify(ls.eqBands ?? [])
        );
      }).length +
      speakers.filter((s) => !selectedSnapshot.speakers.some((ss) => ss.id === s.id)).length;

    const cablesChanged =
      JSON.stringify(selectedSnapshot.virtualCables ?? []) !== JSON.stringify(virtualCables);

    return {
      gainsChanged,
      eqChanged,
      routingChanged,
      extraLiveChannels,
      busesChanged,
      speakersChanged,
      cablesChanged,
      channelDiffRows,
    };
  }, [selectedSnapshot, channels, buses, speakers, virtualCables]);

  if (!snapshotModalOpen) return null;

  const isManualPreamp = hardwareProfile.devices[0]?.capabilities.preampGain === 'manual';

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultName = `Console ${categoryInput} (${new Date().toTimeString().slice(0, 5)})`;
    const saved = saveSnapshot(nameInput.trim() || defaultName, categoryInput, notesInput);
    setSelectedId(saved.id);
    setNameInput('');
    setNotesInput('');
    setStatusBanner({
      tone: 'ok',
      text: `Saved "${saved.name}" to local browser profile & SQLite.`,
    });
  };

  const handleOverwriteSelected = () => {
    if (!selectedSnapshot) return;
    const saved = saveSnapshot(
      nameInput.trim() || selectedSnapshot.name,
      categoryInput || selectedSnapshot.category,
      notesInput.trim() || selectedSnapshot.notes,
      selectedSnapshot.id
    );
    setSelectedId(saved.id);
    setStatusBanner({
      tone: 'ok',
      text: `Updated snapshot "${saved.name}" with current console state.`,
    });
  };

  const handleRestore = (snapshotId: string, scope: SnapshotRestoreScope) => {
    const res = restoreSnapshot(snapshotId, scope);
    setStatusBanner({
      tone: res.ok ? 'ok' : 'err',
      text: res.summary,
    });
  };

  const handleExportLocalProfile = (target?: ConsoleSnapshotProfile | null) => {
    const payload = target
      ? target
      : {
          exportedAt: new Date().toISOString(),
          format: 'church-console-snapshots-v1',
          snapshots,
        };
    const filename = target
      ? `${target.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'console-snapshot'}.json`
      : `console-snapshots-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatusBanner({
      tone: 'ok',
      text: target
        ? `Exported "${target.name}" as local JSON profile.`
        : `Exported all ${snapshots.length} snapshot(s) to local JSON backup.`,
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const res = importSnapshotJson(raw);
      setStatusBanner({
        tone: res.ok ? 'ok' : 'err',
        text: res.ok
          ? `Imported ${res.importedCount} snapshot profile(s) from "${file.name}".`
          : res.error || 'Import failed.',
      });
    } catch {
      setStatusBanner({ tone: 'err', text: `Unable to read file "${file.name}".` });
    }
  };

  const activeScopeMeta =
    RESTORE_SCOPES.find((s) => s.id === restoreScope) ?? RESTORE_SCOPES[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      onClick={closeSnapshotManager}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Console Snapshot Profiles"
        className="w-full max-w-6xl h-[88vh] console-chassis border border-white/15 rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 console-panel border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Camera className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
                Console Snapshot Profiles
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                {snapshots.length} Saved · Routing, N-Band PEQ, 31-Band GEQ, Gains &amp; Outputs · Local Profile + SQLite
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded console-btn-surface text-xs font-mono text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>Import .json</span>
            </button>
            <button
              type="button"
              disabled={snapshots.length === 0}
              onClick={() => handleExportLocalProfile(null)}
              className="px-2.5 py-1.5 rounded console-btn-surface text-xs font-mono text-slate-200 flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Export All</span>
            </button>
            <button
              type="button"
              onClick={closeSnapshotManager}
              className="p-1.5 rounded console-btn-surface text-slate-300 hover:text-white"
              aria-label="Close Snapshot Manager"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Capture Current State Form */}
        <form
          onSubmit={handleSaveNew}
          className="px-4 py-2.5 console-subbar border-b border-white/10 flex flex-wrap items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Snapshot name (e.g. Sunday Morning Praise Full Band)"
            className="flex-1 min-w-[200px] console-well border border-white/15 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/70"
          />
          <select
            aria-label="Snapshot Category"
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            className="console-well border border-white/15 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none"
          >
            {SNAPSHOT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat} className="bg-[#0e1117]">
                {cat}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Optional notes (mics, room, pastor)..."
            className="w-56 console-well border border-white/15 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/70"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save Current Snapshot</span>
          </button>
          {selectedSnapshot && (
            <button
              type="button"
              onClick={handleOverwriteSelected}
              title={`Overwrite "${selectedSnapshot.name}" with live console settings`}
              className="px-2.5 py-1.5 rounded console-btn-surface border-sky-500/40 text-xs font-mono text-sky-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Overwrite Selected</span>
            </button>
          )}
        </form>

        {/* Status Notification Strip */}
        {statusBanner && (
          <div
            className={`px-4 py-1.5 border-b border-white/10 flex items-center justify-between gap-3 text-xs font-mono shrink-0 ${
              statusBanner.tone === 'ok'
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-rose-500/10 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{statusBanner.text}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canUndo && statusBanner.tone === 'ok' && (
                <button
                  type="button"
                  onClick={() => {
                    undo();
                    setStatusBanner({ tone: 'ok', text: 'Reverted snapshot restore via Undo.' });
                  }}
                  className="px-2 py-0.5 rounded console-btn-surface text-[11px] text-amber-300 flex items-center gap-1 whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Undo Restore</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main 12-Col Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left 5 Cols: Local Profile Snapshot Bank */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col min-h-0 overflow-hidden">
            <div className="p-2.5 border-b border-white/10 flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter snapshots..."
                  className="w-full console-well border border-white/10 rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60"
                />
              </div>
              <select
                aria-label="Filter by Category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="console-well border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-slate-300 focus:outline-none"
              >
                <option value="ALL" className="bg-[#0e1117]">All Types</option>
                {SNAPSHOT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#0e1117]">
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
              {filteredSnapshots.length === 0 ? (
                <div className="h-full min-h-[200px] console-well rounded border border-dashed border-white/10 p-5 flex flex-col items-center justify-center text-center gap-2.5">
                  <Camera className="w-6 h-6 text-slate-500" />
                  <div className="text-xs font-semibold text-slate-200">
                    {snapshots.length === 0
                      ? 'No Console Snapshots Saved Yet'
                      : 'No Snapshots Match Filter'}
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                    Save a snapshot to capture all {channels.length} channels, bus assignments, PEQ, 31-band GEQ, dynamics, gains, crossovers, outputs, and virtual cables to your local profile.
                  </p>
                  {snapshots.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const saved = saveSnapshot(
                          'Initial Service Snapshot',
                          categoryInput,
                          'Baseline routing, EQ, and gain structure'
                        );
                        setSelectedId(saved.id);
                        setStatusBanner({
                          tone: 'ok',
                          text: `Saved "${saved.name}" to local profile & SQLite.`,
                        });
                      }}
                      className="px-3 py-1.5 rounded bg-amber-500 text-slate-950 text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Capture Baseline Snapshot</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredSnapshots.map((snap) => {
                  const isSelected = selectedSnapshot?.id === snap.id;
                  const isActive = activeSnapshotId === snap.id;
                  return (
                    <div
                      key={snap.id}
                      onClick={() => setSelectedId(snap.id)}
                      className={`console-panel rounded p-2.5 border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-amber-400/80 bg-amber-500/[0.06]'
                          : 'border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-100 truncate">
                              {snap.name}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-mono font-semibold text-emerald-400 shrink-0">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5 truncate">
                            {snap.category} · {formatSnapshotTime(snap.updatedAt)} · {snap.channels.length} ch · {snap.buses.length} buses · {snap.speakers.length} out
                          </div>
                          {snap.notes && (
                            <div className="text-[11px] text-slate-400 mt-1 truncate">
                              {snap.notes}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(snap.id);
                              handleRestore(snap.id, restoreScope);
                            }}
                            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-[10px] font-mono font-semibold text-amber-200 whitespace-nowrap"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportLocalProfile(snap);
                            }}
                            title="Export this snapshot as .json"
                            aria-label={`Export ${snap.name}`}
                            className="p-1 rounded console-btn-surface text-slate-300 hover:text-white"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSnapshot(snap.id);
                              setStatusBanner({
                                tone: 'ok',
                                text: `Removed snapshot "${snap.name}".`,
                              });
                            }}
                            title="Delete snapshot"
                            aria-label={`Delete ${snap.name}`}
                            className="p-1 rounded console-btn-surface text-slate-400 hover:text-rose-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right 7 Cols: Selected Snapshot Scope & Live Diff Inspector */}
          <div className="lg:col-span-7 flex flex-col min-h-0 overflow-hidden">
            {!selectedSnapshot || !diffAnalysis ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 gap-2">
                <p className="text-xs font-mono text-slate-300">
                  Select or save a snapshot to inspect routing, EQ, and gain differences.
                </p>
              </div>
            ) : (
              <>
                {/* Inspector Header & Restore Scope Selector */}
                <div className="p-3 border-b border-white/10 space-y-2.5 shrink-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-100">
                        {selectedSnapshot.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                        {selectedSnapshot.category} · Updated {formatSnapshotTime(selectedSnapshot.updatedAt)} · Profile {selectedSnapshot.profileId}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestore(selectedSnapshot.id, restoreScope)}
                      className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-mono font-bold whitespace-nowrap shrink-0 transition-colors"
                    >
                      Restore {activeScopeMeta.label}
                    </button>
                  </div>

                  {/* Scope Segmented Control */}
                  <div className="console-module-rack p-0.5 rounded grid grid-cols-2 sm:grid-cols-4 gap-1">
                    {RESTORE_SCOPES.map((scope) => {
                      const active = restoreScope === scope.id;
                      return (
                        <button
                          key={scope.id}
                          type="button"
                          onClick={() => setRestoreScope(scope.id)}
                          className={`px-2 py-1 rounded-[3px] text-[11px] font-mono transition-colors whitespace-nowrap ${
                            active
                              ? 'console-module-tab-active font-semibold'
                              : 'console-module-tab'
                          }`}
                        >
                          {scope.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-slate-400">{activeScopeMeta.hint}</div>

                  {/* Quantitative Diff Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                    <div className="console-well rounded border border-white/10 px-2.5 py-1.5">
                      <div className="text-[10px] font-mono text-slate-400">GAINS / FADERS</div>
                      <div className="text-sm font-mono font-semibold tabular-nums text-amber-300 mt-0.5">
                        {diffAnalysis.gainsChanged} ch Δ
                      </div>
                    </div>
                    <div className="console-well rounded border border-white/10 px-2.5 py-1.5">
                      <div className="text-[10px] font-mono text-slate-400">EQ / GEQ / DYN</div>
                      <div className="text-sm font-mono font-semibold tabular-nums text-sky-300 mt-0.5">
                        {diffAnalysis.eqChanged} ch Δ
                      </div>
                    </div>
                    <div className="console-well rounded border border-white/10 px-2.5 py-1.5">
                      <div className="text-[10px] font-mono text-slate-400">BUSES &amp; ROUTING</div>
                      <div className="text-sm font-mono font-semibold tabular-nums text-emerald-300 mt-0.5">
                        {diffAnalysis.routingChanged} ch · {diffAnalysis.busesChanged} bus
                      </div>
                    </div>
                    <div className="console-well rounded border border-white/10 px-2.5 py-1.5">
                      <div className="text-[10px] font-mono text-slate-400">OUTPUTS / CABLES</div>
                      <div className="text-sm font-mono font-semibold tabular-nums text-slate-200 mt-0.5">
                        {diffAnalysis.speakersChanged} out · {diffAnalysis.cablesChanged ? 'VAC Δ' : '0 VAC'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Channel-by-Channel Comparison Table */}
                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 console-chassis border-b border-white/10 text-[10px] font-mono text-slate-400 uppercase">
                      <tr>
                        <th className="py-1.5 pr-2">Ch</th>
                        <th className="py-1.5 pr-2">Source</th>
                        <th className="py-1.5 pr-2">Fader (Live → Snap)</th>
                        <th className="py-1.5 pr-2">SW Trim</th>
                        <th className="py-1.5 pr-2">EQ / GEQ</th>
                        <th className="py-1.5">Routing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-[11px] font-mono tabular-nums">
                      {diffAnalysis.channelDiffRows.map(
                        ({ snapCh, liveCh, gainDiff, eqDiff, routeDiff }) => {
                          const hasDelta = gainDiff || eqDiff || routeDiff;
                          return (
                            <tr
                              key={snapCh.id}
                              className={hasDelta ? 'bg-amber-500/[0.04]' : 'text-slate-400'}
                            >
                              <td className="py-1.5 pr-2 text-slate-300">
                                {String(snapCh.number).padStart(2, '0')}
                              </td>
                              <td className="py-1.5 pr-2 text-slate-200 font-sans truncate max-w-[130px]">
                                {snapCh.name}
                              </td>
                              <td
                                className={`py-1.5 pr-2 ${
                                  gainDiff ? 'text-amber-300 font-semibold' : 'text-slate-400'
                                }`}
                              >
                                {liveCh ? `${liveCh.faderDb.toFixed(1)}` : 'NEW'} →{' '}
                                {snapCh.faderDb.toFixed(1)} dB
                                {snapCh.mute ? ' M' : ''}
                              </td>
                              <td className="py-1.5 pr-2 text-slate-300">
                                {snapCh.softwareTrimDb >= 0 ? '+' : ''}
                                {snapCh.softwareTrimDb.toFixed(1)} dB
                              </td>
                              <td
                                className={`py-1.5 pr-2 ${
                                  eqDiff ? 'text-sky-300 font-semibold' : 'text-slate-400'
                                }`}
                              >
                                {snapCh.eqEnabled ? `${snapCh.eqBands.length} PEQ` : 'BYP'} ·{' '}
                                {snapCh.geqEnabled ? 'GEQ' : '—'}
                              </td>
                              <td
                                className={`py-1.5 ${
                                  routeDiff ? 'text-emerald-300 font-semibold' : 'text-slate-400'
                                }`}
                              >
                                {[
                                  snapCh.assignMain ? 'MN' : '',
                                  snapCh.assignSub ? 'SB' : '',
                                  snapCh.assignBroadcast ? 'ST' : '',
                                ]
                                  .filter(Boolean)
                                  .join('/') || 'NONE'}
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                  {diffAnalysis.extraLiveChannels > 0 && restoreScope === 'all' && (
                    <div className="mt-2 px-2.5 py-1.5 rounded console-well border border-amber-500/30 text-[11px] font-mono text-amber-300">
                      {diffAnalysis.extraLiveChannels} channel(s) added after this snapshot will be removed on Full Console restore (use EQ, Routing, or Gains scope to preserve them).
                    </div>
                  )}
                </div>

                {/* Honest Hardware Capability Footer */}
                {isManualPreamp && (
                  <div className="px-3 py-2 border-t border-white/10 console-panel flex items-center gap-2 text-[11px] font-mono text-amber-300 shrink-0">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Analog desk preamps &amp; +48V switches are manual-only and stay untouched; software trims, faders, EQ, routing &amp; outputs restore immediately.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
