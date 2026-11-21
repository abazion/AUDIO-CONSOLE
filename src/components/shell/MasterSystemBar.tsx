import React from 'react';
import {
  Activity,
  Cpu,
  GitBranch,
  Power,
  Search,
  Sliders,
  AlertTriangle,
  Radio,
  Palette,
  Sun,
  Moon,
  Gauge,
  Camera,
  ArrowLeftRight,
  Shield,
  Eye,
  Usb,
} from 'lucide-react';
import { useAudioConsole, WORKSPACE_GROUPS } from '../../engine/store';
import type { ConsoleThemeId, HardwareProfileId, OperatingMode, OperatorRole } from '../../engine/types';

const WORKSPACE_THEMES: { id: ConsoleThemeId; label: string; swatch: string }[] = [
  { id: 'obsidian-brass', label: 'Obsidian Brass', swatch: '#f59e0b' },
  { id: 'cobalt-neve', label: 'Cobalt Neve', swatch: '#38bdf8' },
  { id: 'warm-mahogany', label: 'Warm Mahogany', swatch: '#fb923c' },
  { id: 'emerald-broadcast', label: 'Emerald Studio', swatch: '#10b981' },
  { id: 'titanium-steel', label: 'Titanium Steel', swatch: '#60a5fa' },
  { id: 'daylight-studio', label: 'Day Mode Studio', swatch: '#f8fafc' },
];

interface MasterSystemBarProps {
  onOpenSearch: () => void;
}

export const MasterSystemBar: React.FC<MasterSystemBarProps> = ({ onOpenSearch }) => {
  const {
    activeDestination,
    activeWorkspace,
    operatingMode,
    workspaceTheme,
    setWorkspace,
    setOperatingMode,
    setWorkspaceTheme,
    hardwareProfile,
    switchHardwareProfile,
    audioUnlocked,
    toggleAudioEngine,
    globalDspBypass,
    toggleGlobalDspBypass,
    graphVersion,
    cpuDspLoadPct,
    measuredLatencyMs,
    feedbackIncidents,
    scenes,
    activeSceneId,
    openSignalJourney,
    selectedChannelId,
    openSourceBay,
    openGainStagingAssistant,
    snapshots,
    openSnapshotManager,
    detectedHardware,
    channels,
    connectedSeats,
    wsConnected,
    operatorRole,
    setOperatorRole,
    highVisibilityMode,
    setHighVisibilityMode,
    midiConnectedDevices,
    midiLastMessage,
  } = useAudioConsole();

  const currentGroup = WORKSPACE_GROUPS.find((g) => g.id === activeDestination) ?? WORKSPACE_GROUPS[0];
  const activeScene = scenes.find((s) => s.id === activeSceneId);
  const activeAlertsCount = feedbackIncidents.filter(
    (f) => f.status === 'feedback_detected' || f.status === 'risk_predicted'
  ).length;
  const activeSourcesCount = channels.filter((c) => c.sourceBinding?.active).length;
  const primaryDevice = hardwareProfile.devices[0];
  const hasClockDriftRisk = hardwareProfile.devices.some((d) =>
    d.clockState.includes('Drift') || d.clockState.includes('Fault')
  );

  return (
    <header className="console-header-bar border-b select-none shrink-0 z-30 transition-colors duration-200">
      {/* Primary Console Top Bar */}
      <div className="px-4 h-12 flex items-center justify-between gap-3 border-b border-white/[0.06]">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            style={{ backgroundColor: 'var(--console-accent)' }}
            className="w-7 h-7 rounded flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-colors"
          >
            <Sliders className="w-4 h-4 text-slate-950" />
          </div>
          <span className="font-display font-bold text-sm tracking-tight text-slate-100 whitespace-nowrap">
            Church Intelligence
          </span>
        </div>

        {/* 6 Main Navigation Destinations — Persistent High-Contrast Primary Console Rack */}
        <nav className="console-nav-rack px-1.5 py-1 rounded-md flex items-center gap-1 overflow-x-auto no-scrollbar">
          {WORKSPACE_GROUPS.map((group) => {
            const isActive = group.id === activeDestination;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setWorkspace(group.id, group.workspaces[0].id)}
                className={`px-3 py-1 rounded text-xs tracking-wide transition-all whitespace-nowrap shrink-0 ${
                  isActive ? 'console-nav-tab-active' : 'console-nav-tab font-semibold'
                }`}
              >
                {group.label}
              </button>
            );
          })}
        </nav>

        {/* Primary Right Controls */}
        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={onOpenSearch}
            className="px-2.5 py-1.5 rounded console-btn-surface text-xs text-slate-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Search channels, buses, nodes, or workspaces (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span>Search</span>
          </button>

          <button
            type="button"
            onClick={() => openSourceBay(selectedChannelId)}
            className="px-2.5 py-1.5 rounded console-btn-surface border-emerald-500/40 hover:border-emerald-400 text-xs text-emerald-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Route Desktop Audio, Microphone, Audio File, or Hardware I/O"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Sources ({activeSourcesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => openGainStagingAssistant(selectedChannelId)}
            className="px-2.5 py-1.5 rounded console-btn-surface border-amber-500/40 hover:border-amber-400 text-xs text-amber-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Open Gain Staging Assistant (Noise Floor, Nominal Sweet Spot & Clipping)"
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>Gain Assist</span>
          </button>

          <button
            type="button"
            onClick={openSnapshotManager}
            className="px-2.5 py-1.5 rounded console-btn-surface border-violet-500/40 hover:border-violet-400 text-xs text-violet-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums"
            title="Save or Restore Full Console Snapshot Profiles (Routing, EQ, Gains)"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Snapshots ({snapshots.length})</span>
          </button>

          <button
            type="button"
            aria-pressed={globalDspBypass}
            onClick={toggleGlobalDspBypass}
            className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 border transition-all whitespace-nowrap shrink-0 ${
              globalDspBypass
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/70 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-semibold'
                : 'console-btn-surface border-white/15 hover:border-amber-400/50 text-slate-200'
            }`}
            title={
              globalDspBypass
                ? 'All channel DSP chains are BYPASSED (Dry A/B). Click to restore active HPF, PEQ, 31-Band GEQ, Dynamics & Delay.'
                : 'Bypass all active channel DSP chains (HPF, PEQ, 31-Band GEQ, Dynamics, Delay) for A/B comparison.'
            }
          >
            <ArrowLeftRight className={`w-3.5 h-3.5 ${globalDspBypass ? 'text-amber-300' : 'text-slate-400'}`} />
            <span>{globalDspBypass ? 'DSP Bypassed' : 'A/B Bypass'}</span>
          </button>

          <button
            type="button"
            onClick={() => openSignalJourney(selectedChannelId)}
            className="px-2.5 py-1.5 rounded console-btn-surface border-sky-500/30 hover:border-sky-400/60 text-xs text-sky-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Signal Journey</span>
          </button>

          <button
            type="button"
            onClick={toggleAudioEngine}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 border transition-all whitespace-nowrap shrink-0 ${
              audioUnlocked
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'console-btn-surface text-slate-200 border-amber-500/50 hover:border-amber-400'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{audioUnlocked ? 'Audio Active' : 'Engage Audio'}</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation: Specialist Workspace Tabs (Distinct Technical Contrast) + Operating Modes + Hardware Profile Bar */}
      <div className="px-4 py-1.5 console-subbar flex flex-wrap items-center justify-between gap-3 text-[11px] border-b border-white/[0.06]">
        {/* Specialist Workspaces inside active destination */}
        <div className="console-subnav-rack px-1.5 py-1 rounded-md flex items-center gap-1.5 overflow-x-auto">
          {currentGroup.workspaces.map((ws) => {
            const active = ws.id === activeWorkspace;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => setWorkspace(currentGroup.id, ws.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono tracking-tight transition-all whitespace-nowrap shrink-0 ${
                  active ? 'console-subnav-tab-active' : 'console-subnav-tab font-semibold'
                }`}
              >
                {ws.label}
              </button>
            );
          })}
        </div>

        {/* Master Hardware & Engine Readout Strip */}
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              aria-label="Hardware Qualification Profile"
              value={hardwareProfile.id}
              onChange={(e) => switchHardwareProfile(e.target.value as HardwareProfileId)}
              className="console-btn-surface rounded px-2 py-0.5 text-[11px] font-mono text-slate-200 focus:outline-none"
            >
              <option value="auto-detected">
                Auto-Detected OS Hardware ({detectedHardware.length} I/O)
              </option>
              <option value="mg16xu-xonar">MG16XU (USB 2x2) + Xonar DGX</option>
              <option value="dlive-dante-128">dLive / Dante 128x64 Pro (96 kHz)</option>
              <option value="studio-usb-8x8">Pro USB 8x8 ASIO (48 kHz)</option>
            </select>
          </div>

          <span className="text-slate-600">|</span>

          <div className="flex items-center gap-2 font-mono tabular-nums text-[11px] text-slate-300 whitespace-nowrap">
            <span>{(primaryDevice.sampleRateHz / 1000).toFixed(1)} kHz</span>
            <span className="text-slate-600">·</span>
            <span>{primaryDevice.bufferSamples} smp</span>
            <span className="text-slate-600">·</span>
            <span className={hasClockDriftRisk ? 'text-amber-300' : 'text-emerald-400'}>
              {hasClockDriftRisk ? 'Dual Clock (Drift)' : 'Clock Locked'}
            </span>
          </div>

          <span className="text-slate-600">|</span>

          <div className="flex items-center gap-2 font-mono tabular-nums text-[11px] text-slate-300 whitespace-nowrap">
            <Cpu className="w-3 h-3 text-slate-400" />
            <span>DSP {cpuDspLoadPct}%</span>
            <span className="text-slate-600">·</span>
            <Activity className="w-3 h-3 text-slate-400" />
            <span>RTL {measuredLatencyMs} ms</span>
            <span className="text-slate-600">·</span>
            <span className="text-sky-300">Graph v{graphVersion}</span>
          </div>

          {activeAlertsCount > 0 && (
            <button
              type="button"
              onClick={() => setWorkspace('processing', 'feedback-detection')}
              className="flex items-center gap-1 text-amber-300 hover:text-amber-200 font-mono text-[11px] whitespace-nowrap"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{activeAlertsCount} Alert{activeAlertsCount > 1 ? 's' : ''}</span>
            </button>
          )}

          <span className="text-slate-600">|</span>

          <span className="text-[11px] text-slate-400 whitespace-nowrap truncate max-w-[140px]">
            Scene: <strong className="text-slate-200 font-medium">{activeScene?.name}</strong>
          </span>

          {/* Multi-Seat WS Sync Readout (Static Indicator Dot) */}
          <div
            className="flex items-center gap-1.5 console-btn-surface rounded px-2 py-0.5 font-mono tabular-nums text-[10px] text-slate-200 whitespace-nowrap shrink-0"
            title={wsConnected ? 'Real-time WebSocket multi-seat console sync active' : 'WebSocket reconnecting'}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                wsConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>
              {connectedSeats} Seat{connectedSeats !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Web MIDI Hardware Surface Indicator */}
          {midiConnectedDevices.length > 0 && (
            <div
              className="flex items-center gap-1 console-btn-surface border-sky-500/40 rounded px-2 py-0.5 font-mono tabular-nums text-[10px] text-sky-300 whitespace-nowrap shrink-0"
              title={
                midiLastMessage
                  ? `Connected: ${midiConnectedDevices.join(', ')} · Last: ${midiLastMessage}`
                  : `Connected MIDI Surfaces: ${midiConnectedDevices.join(', ')}`
              }
            >
              <Usb className="w-3 h-3 shrink-0" />
              <span>MIDI ({midiConnectedDevices.length})</span>
            </div>
          )}

          {/* Operator Role RBAC Selector */}
          <div className="flex items-center gap-1 console-btn-surface rounded px-1.5 py-0.5 shrink-0">
            <Shield
              className={`w-3 h-3 shrink-0 ${
                operatorRole === 'volunteer'
                  ? 'text-amber-300'
                  : operatorRole === 'system-tech'
                    ? 'text-emerald-400'
                    : 'text-sky-400'
              }`}
            />
            <select
              aria-label="Operator Access Role"
              value={operatorRole}
              onChange={(e) => setOperatorRole(e.target.value as OperatorRole)}
              title="RBAC Role: Volunteer locks structural DSP/EQ/Routing; FOH & System Tech allow full engineering edits"
              className="bg-transparent text-[10px] font-mono text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="volunteer" className="bg-[#0e1117] text-white">
                Role: Volunteer
              </option>
              <option value="foh" className="bg-[#0e1117] text-white">
                Role: FOH Mix
              </option>
              <option value="system-tech" className="bg-[#0e1117] text-white">
                Role: Sys Tech
              </option>
            </select>
          </div>

          {/* High-Visibility Booth Toggle */}
          <button
            type="button"
            aria-pressed={highVisibilityMode}
            onClick={() => setHighVisibilityMode(!highVisibilityMode)}
            title="Toggle High-Visibility Contrast for Bright Sanctuary Booths"
            className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors whitespace-nowrap shrink-0 ${
              highVisibilityMode
                ? 'console-accent-solid border-transparent'
                : 'console-btn-surface text-slate-300'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Hi-Vis</span>
          </button>

          {/* Workspace Full-Surface Color Theme Selector + Quick Day/Night Switch */}
          <div className="flex items-center gap-1.5 console-panel rounded px-2 py-0.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setWorkspaceTheme(workspaceTheme === 'daylight-studio' ? 'obsidian-brass' : 'daylight-studio')
              }
              title={workspaceTheme === 'daylight-studio' ? 'Switch to Night Console' : 'Switch to Day Mode'}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors ${
                workspaceTheme === 'daylight-studio'
                  ? 'console-accent-solid border-transparent'
                  : 'console-btn-surface text-slate-300'
              }`}
            >
              {workspaceTheme === 'daylight-studio' ? (
                <>
                  <Sun className="w-3 h-3" />
                  <span>Day</span>
                </>
              ) : (
                <>
                  <Moon className="w-3 h-3" />
                  <span>Night</span>
                </>
              )}
            </button>
            <Palette className="w-3 h-3 text-slate-400 shrink-0" />
            <div className="flex items-center gap-1" title="Workspace Surface Color Theme">
              {WORKSPACE_THEMES.map((t) => {
                const selected = t.id === workspaceTheme;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setWorkspaceTheme(t.id)}
                    title={`Workspace Theme: ${t.label}`}
                    aria-label={`Workspace Theme: ${t.label}`}
                    style={{ backgroundColor: t.swatch }}
                    className={`w-3.5 h-3.5 rounded-full border border-slate-500/40 transition-transform ${
                      selected ? 'ring-2 ring-amber-400 scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                  />
                );
              })}
            </div>
            <select
              aria-label="Workspace Color Theme"
              value={workspaceTheme}
              onChange={(e) => setWorkspaceTheme(e.target.value as ConsoleThemeId)}
              className="bg-transparent text-[10px] font-mono text-slate-200 focus:outline-none cursor-pointer"
            >
              {WORKSPACE_THEMES.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#0e1117] text-white">
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Operating Mode Segmented Control */}
          <div className="flex items-center console-btn-surface rounded p-0.5 shrink-0">
            {(['console', 'engineering', 'compact'] as OperatingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setOperatingMode(mode)}
                className={`px-2 py-0.5 rounded-[3px] text-[10px] font-medium capitalize transition-colors whitespace-nowrap ${
                  operatingMode === mode
                    ? 'console-accent-solid'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};
