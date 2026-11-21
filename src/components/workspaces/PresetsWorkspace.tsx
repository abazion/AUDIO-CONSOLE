import React, { useMemo, useState } from 'react';
import { BookmarkCheck, Lock, Plus, Sliders } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { ConsoleButton } from '../hardware/ConsoleButton';

export const PresetsWorkspace: React.FC = () => {
  const {
    scenes,
    activeSceneId,
    channels,
    hardwareProfile,
    recallScene,
    saveCurrentAsScene,
  } = useAudioConsole();

  const [previewSceneId, setPreviewSceneId] = useState<string>(scenes[1]?.id ?? scenes[0].id);
  const [sceneTab, setSceneTab] = useState<'recall' | 'store'>('recall');
  const [newName, setNewName] = useState<string>('');
  const [newType, setNewType] = useState<string>('Special Service');

  const previewScene = scenes.find((s) => s.id === previewSceneId) ?? scenes[0];
  const isManualPre = hardwareProfile.devices[0]?.capabilities.preampGain === 'manual';

  const channelPreviewRows = useMemo(() => {
    return channels.map((ch) => {
      const targetFader = previewScene.channelFaders[ch.id] ?? ch.faderDb;
      const targetMute = previewScene.channelMutes[ch.id] ?? ch.mute;
      const changed = Math.abs(targetFader - ch.faderDb) >= 0.2 || targetMute !== ch.mute;
      return { ch, targetFader, targetMute, changed };
    });
  }, [channels, previewScene]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    saveCurrentAsScene(newName.trim(), newType);
    setNewName('');
    setSceneTab('recall');
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Switcher Tabs */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <BookmarkCheck className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              Scene Recall &amp; Motorized Fader Memory Deck
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              {scenes.length} Stored Scenes · Atomic SignalGraph Recall
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'recall', label: 'SCENE RECALL & FADER PREVIEW', icon: Sliders },
            { id: 'store', label: 'STORE NEW SCENE', icon: Plus },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSceneTab(t.id as typeof sceneTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  sceneTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <ConsoleButton
          label={previewScene.id === activeSceneId ? 'SCENE ACTIVE' : 'RECALL SCENE'}
          size="xs"
          color="amber"
          active={previewScene.id !== activeSceneId}
          onClick={() => recallScene(previewScene.id)}
        />
      </div>

      {/* Main Single-Viewport Workspace */}
      {sceneTab === 'recall' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          {/* Left 4 Cols: Illuminated Scene Memory Bank */}
          <div className="lg:col-span-4 console-chassis rounded-lg border border-white/10 p-3 flex flex-col gap-2 min-h-0 overflow-hidden">
            <div className="text-[11px] font-mono font-semibold text-amber-300 uppercase border-b border-white/10 pb-1.5 shrink-0">
              Memory Bank Slots
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
              {scenes.map((scn, idx) => {
                const isActive = scn.id === activeSceneId;
                const isPreview = scn.id === previewScene.id;
                return (
                  <button
                    key={scn.id}
                    type="button"
                    onClick={() => setPreviewSceneId(scn.id)}
                    className={`w-full console-panel rounded p-2.5 text-left border transition-all ${
                      isPreview ? 'border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.14)]' : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-amber-300">
                        MEM 0{idx + 1} · {scn.serviceType.toUpperCase()}
                      </span>
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isActive
                            ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                            : isPreview
                              ? 'bg-amber-400'
                              : 'bg-slate-600'
                        }`}
                      />
                    </div>
                    <div className="text-xs font-semibold text-slate-100 mt-0.5">{scn.name}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{scn.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 8 Cols: Zero-Scroll 6x2 Responsive Target Motorized Fader Preview */}
          <div className="lg:col-span-8 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 shrink-0">
              <div>
                <div className="text-xs font-mono text-amber-300 uppercase">
                  TARGET MOTORIZED FADER BANK · {previewScene.name}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {channelPreviewRows.filter((r) => r.changed).length} channels will move on recall
                </div>
              </div>
              <ConsoleButton
                label={previewScene.id === activeSceneId ? 'SCENE ACTIVE' : 'RECALL NOW'}
                size="sm"
                color="amber"
                active={previewScene.id !== activeSceneId}
                onClick={() => recallScene(previewScene.id)}
              />
            </div>

            <div className="flex-1 min-h-0 console-well rounded p-2.5 grid grid-cols-4 sm:grid-cols-6 gap-2 overflow-y-auto content-start">
              {channelPreviewRows.map(({ ch, targetFader, targetMute, changed }) => {
                const targetNorm = Math.max(0.05, Math.min(1, (targetFader + 80) / 90));
                const curNorm = Math.max(0.05, Math.min(1, (ch.faderDb + 80) / 90));
                return (
                  <div
                    key={ch.id}
                    className={`rounded p-1.5 flex flex-col items-center justify-between gap-1 border ${
                      changed
                        ? 'border-amber-500/50 console-panel'
                        : 'border-white/5 console-btn-surface'
                    }`}
                  >
                    <span className="text-[9px] font-mono text-slate-300 truncate w-full text-center">
                      {ch.shortName}
                    </span>
                    <div className="relative w-4 flex-1 min-h-[72px] fader-slot rounded-full">
                      <div
                        style={{ bottom: `${curNorm * 90}%` }}
                        className="absolute left-0 right-0 h-1 bg-slate-500/70"
                      />
                      <div
                        style={{ bottom: `${targetNorm * 86}%` }}
                        className={`fader-cap absolute -left-0.5 w-5 h-2.5 rounded-[2px] border ${
                          changed ? 'border-amber-400' : 'border-slate-500/60'
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-mono tabular-nums text-amber-300">
                        {targetFader.toFixed(0)}
                      </span>
                      <span
                        className={`text-[8px] font-mono px-1 rounded ${
                          targetMute ? 'bg-rose-500/30 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {targetMute ? 'M' : 'ON'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {isManualPre && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-amber-300 shrink-0">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  MG16XU analog preamp pots &amp; +48V switches remain at their physical desk positions.
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tab 2: Store New Scene Memory */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
          <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-4 flex flex-col justify-between gap-3">
            <div className="border-b border-white/10 pb-2">
              <h2 className="text-sm font-mono font-semibold text-amber-300 uppercase">
                Capture Active Console State to Scene Memory
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Snapshots all {channels.length} channel faders, mutes, parametric + 31-band EQ, active crossovers, and output sinks into SQLite.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4 flex-1 flex flex-col justify-center">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-slate-400 uppercase">
                  Scene Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Sunday Praise Full Band..."
                  className="w-full console-well border border-white/15 rounded px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-slate-400 uppercase">
                  Service Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {['Sunday Worship', 'Prayer Meeting', 'Bible Study', 'Conference', 'Special Service'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`px-2 py-1.5 rounded text-[10px] font-mono transition-all ${
                        newType === t ? 'console-accent-active font-bold' : 'console-btn-surface text-slate-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!newName.trim()}
                className="w-full py-2 rounded bg-amber-500 text-slate-950 text-xs font-mono font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                <span>STORE CURRENT CONSOLE SCENE</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-6 console-chassis rounded-lg border border-white/10 p-4 flex flex-col gap-2 min-h-0 overflow-hidden">
            <div className="text-xs font-mono font-semibold text-sky-300 uppercase border-b border-white/10 pb-2">
              Current Channel Levels to Be Captured
            </div>
            <div className="flex-1 min-h-0 console-well rounded p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto content-start">
              {channels.map((ch) => (
                <div key={ch.id} className="console-panel rounded px-2.5 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-200 truncate">{ch.shortName}</span>
                  <span className="text-[10px] font-mono text-amber-300">
                    {ch.mute ? 'MUTE' : `${ch.faderDb.toFixed(1)}dB`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
