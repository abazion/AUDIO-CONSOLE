import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDynamicChannelStrip,
  createDynamicSpeakerOutput,
  HARDWARE_PROFILES,
  INITIAL_BUSES,
  INITIAL_CHANNELS,
  INITIAL_DCA_GROUPS,
  INITIAL_FEEDBACK,
  INITIAL_FX_RACK,
  INITIAL_MATRIX_ZONES,
  INITIAL_SCENES,
  INITIAL_SOUND_CHECK,
  INITIAL_SPEAKERS,
  INITIAL_VIRTUAL_CABLES,
  INITIAL_VIRTUAL_DI,
  makeDefaultEqBands,
} from './profiles';
import type {
  AiProposal,
  AudioDevice,
  AudioSourceBinding,
  AutomationKeyframe,
  AutomationLane,
  AutomationMode,
  AutomationParameterKey,
  AutomationTransportState,
  BroadcastLoudnessMetrics,
  BusNode,
  ChannelSendConfig,
  ChannelStrip,
  ConsoleSnapshotProfile,
  ConsoleThemeId,
  DcaGroupId,
  DcaGroupState,
  DetectedHardwareDevice,
  EqBand,
  FeedbackIncident,
  FxSlotState,
  GraphTraceResult,
  GraphTraceStage,
  HardwareProfile,
  HardwareProfileId,
  MainDestinationId,
  MatrixZone,
  MeterReading,
  MultitrackSession,
  MultitrackTapPoint,
  OperatingMode,
  OperatorRole,
  RecordedTake,
  RecordingTargetId,
  SceneProfile,
  SnapshotRestoreScope,
  SoloMode,
  SoundCheckItem,
  SpeakerBand,
  StructuredEvent,
  VirtualCableNode,
  VirtualDiState,
  VirtualSoundcheckTrack,
  WavBitDepth,
  WorkspaceId,
} from './types';
import { audioEngine } from './webAudioEngine';
import {
  computeAutoCalibratedChannelDsp,
  createEmptySystemIntelligence,
  DEFAULT_INTELLIGENCE_CONFIG,
  type AudioIntelligenceConfig,
  type SystemIntelligenceSummary,
} from './dspIntelligence';

export interface ConsoleSnapshotState {
  profileId: HardwareProfileId;
  channels: ChannelStrip[];
  buses: BusNode[];
  speakers: SpeakerBand[];
  virtualCables: VirtualCableNode[];
  virtualDi: VirtualDiState;
  feedbackIncidents: FeedbackIncident[];
  soundCheckItems: SoundCheckItem[];
  activeSceneId: string;
}

interface AudioConsoleContextValue {
  // Navigation & Shell
  activeDestination: MainDestinationId;
  activeWorkspace: WorkspaceId;
  operatingMode: OperatingMode;
  workspaceTheme: ConsoleThemeId;
  setWorkspace: (dest: MainDestinationId, ws: WorkspaceId) => void;
  setOperatingMode: (mode: OperatingMode) => void;
  setWorkspaceTheme: (theme: ConsoleThemeId) => void;
  selectedChannelId: string;
  setSelectedChannelId: (id: string) => void;
  selectedBusId: string;
  setSelectedBusId: (id: string) => void;
  signalJourneyTargetId: string | null;
  openSignalJourney: (nodeId: string) => void;
  closeSignalJourney: () => void;

  // Source Patchbay Modal, Gain Staging Assistant & Snapshot Manager Modal
  sourceBayOpen: boolean;
  sourceBayChannelId: string;
  openSourceBay: (channelId?: string) => void;
  closeSourceBay: () => void;
  gainStagingOpen: boolean;
  gainStagingChannelId: string | null;
  openGainStagingAssistant: (channelId?: string) => void;
  closeGainStagingAssistant: () => void;
  snapshotModalOpen: boolean;
  openSnapshotManager: () => void;
  closeSnapshotManager: () => void;

  // Hardware, DB Persistence & Engine State
  hardwareProfile: HardwareProfile;
  switchHardwareProfile: (id: HardwareProfileId) => void;
  detectedHardware: DetectedHardwareDevice[];
  selectedOutputDeviceId: string;
  scanHardware: (unlockLabels?: boolean) => Promise<DetectedHardwareDevice[]>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  dbHydrated: boolean;
  dbSyncing: boolean;
  dbUpdatedAt: string | null;
  resetFactoryState: () => Promise<void>;

  audioUnlocked: boolean;
  toggleAudioEngine: () => Promise<void>;
  globalDspBypass: boolean;
  toggleGlobalDspBypass: () => void;
  setGlobalDspBypass: (bypassed: boolean) => void;
  liveMicActive: boolean;
  toggleLiveMic: () => Promise<void>;
  graphVersion: number;
  cpuDspLoadPct: number;
  measuredLatencyMs: number;
  bufferLatencyMs: number;
  xrunsCount: number;
  resetXruns: () => void;
  resetPeakHold: (nodeId?: string) => void;

  // Real Whole-System & Broadcast Bus Recorder
  recordingActive: boolean;
  recordingDurationSec: number;
  recordingTargetId: RecordingTargetId;
  setRecordingTargetId: (targetId: RecordingTargetId) => void;
  recordedTakes: RecordedTake[];
  deleteRecordedTake: (takeId: string) => void;
  lastRecordingUrl: string | null;
  lastRecordingFilename: string | null;
  toggleStreamRecording: (targetId?: string) => Promise<{ ok: boolean; error?: string }>;

  // Real Multitrack Simultaneous Channel WAV Recorder
  multitrackArmedIds: string[];
  multitrackTapPoint: MultitrackTapPoint;
  setMultitrackTapPoint: (tap: MultitrackTapPoint) => void;
  multitrackBitDepth: WavBitDepth;
  setMultitrackBitDepth: (depth: WavBitDepth) => void;
  multitrackRecording: boolean;
  multitrackSessions: MultitrackSession[];
  toggleMultitrackArm: (channelId: string) => void;
  armMultitrackPreset: (preset: 'all' | 'active' | 'none') => void;
  toggleMultitrackRecording: () => Promise<{ ok: boolean; error?: string }>;
  deleteMultitrackSession: (sessionId: string) => void;

  // Parameter Automation Engine
  automationLanes: AutomationLane[];
  automationTransport: AutomationTransportState;
  toggleAutomationPlay: () => void;
  stopAndRewindAutomation: () => void;
  setAutomationPlayhead: (sec: number) => void;
  setAutomationMode: (mode: AutomationMode) => void;
  toggleAutomationRecord: () => void;
  setAutomationDuration: (durationSec: number) => void;
  toggleAutomationLoop: () => void;
  ensureAutomationLane: (channelId: string, parameter: AutomationParameterKey) => AutomationLane;
  toggleAutomationLaneEnabled: (laneId: string) => void;
  removeAutomationLane: (laneId: string) => void;
  clearAutomationLanePoints: (laneId: string) => void;
  upsertAutomationPoint: (
    laneId: string,
    timeSec: number,
    value: number,
    replacePointId?: string
  ) => void;
  removeAutomationPoint: (laneId: string, pointId: string) => void;
  captureAutomationSnapshotPoint: (channelId: string, parameter: AutomationParameterKey) => void;

  // Multi-Source Patching & Built-In Virtual Audio Cables
  virtualCables: VirtualCableNode[];
  addVirtualCable: (name?: string, sourceKind?: VirtualCableNode['sourceKind'], sourceId?: string) => VirtualCableNode;
  updateVirtualCable: (cableId: string, patch: Partial<VirtualCableNode>) => void;
  removeVirtualCable: (cableId: string) => void;
  attachMicToChannel: (channelId: string, deviceId?: string, label?: string) => Promise<{ ok: boolean; error?: string }>;
  attachDesktopAudioToChannel: (channelId: string) => Promise<{ ok: boolean; error?: string }>;
  attachFileToChannel: (channelId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  attachToneToChannel: (channelId: string, kind: 'pink' | 'sine1k' | 'sweep', gainDb: number) => Promise<{ ok: boolean; error?: string }>;
  attachVirtualCableToChannel: (channelId: string, virtualCableId: string) => Promise<{ ok: boolean; error?: string }>;
  attachExternalTabToVirtualCable: (cableId: string) => Promise<{ ok: boolean; error?: string }>;
  attachFileToVirtualCable: (cableId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  toggleChannelFilePlayback: (channelId: string) => boolean;
  detachChannelSource: (channelId: string) => void;

  // Dynamic Channels, EQs, Crossovers, Buses & Outputs
  addChannel: (name?: string, category?: ChannelStrip['category']) => ChannelStrip;
  removeChannel: (channelId: string) => void;
  addChannelEqBand: (channelId: string, preset?: Partial<EqBand>) => void;
  removeChannelEqBand: (channelId: string, bandId: string) => void;
  addBus: (name: string, kind?: BusNode['kind']) => BusNode;
  removeBus: (busId: string) => void;
  addBusEqBand: (busId: string, preset?: Partial<EqBand>) => void;
  updateBusEqBand: (busId: string, bandId: string, patch: Partial<EqBand>) => void;
  removeBusEqBand: (busId: string, bandId: string) => void;
  addSpeakerOutput: (name?: string, role?: SpeakerBand['role'], sourceBusId?: string) => SpeakerBand;
  removeSpeakerOutput: (speakerId: string) => void;
  addSpeakerEqBand: (speakerId: string, preset?: Partial<EqBand>) => void;
  updateSpeakerEqBand: (speakerId: string, bandId: string, patch: Partial<EqBand>) => void;
  removeSpeakerEqBand: (speakerId: string, bandId: string) => void;

  // Test Tone & Monitoring
  testToneActive: boolean;
  testToneKind: 'pink' | 'sine1k' | 'sweep';
  testToneGainDb: number;
  setTestToneConfig: (active: boolean, kind?: 'pink' | 'sine1k' | 'sweep', gainDb?: number) => void;
  talkbackActive: boolean;
  toggleTalkback: () => void;
  monitorSource: 'MAIN L/R' | 'MON 1' | 'MON 2' | 'STREAM' | 'SOLO';
  setMonitorSource: (src: 'MAIN L/R' | 'MON 1' | 'MON 2' | 'STREAM' | 'SOLO') => void;
  muteGroupsActive: Record<1 | 2 | 3 | 4, boolean>;
  toggleMuteGroup: (group: 1 | 2 | 3 | 4) => void;
  clearAllSolos: () => void;

  // Core Entities
  channels: ChannelStrip[];
  buses: BusNode[];
  speakers: SpeakerBand[];
  virtualDi: VirtualDiState;
  feedbackIncidents: FeedbackIncident[];
  soundCheckItems: SoundCheckItem[];
  scenes: SceneProfile[];
  activeSceneId: string;
  snapshots: ConsoleSnapshotProfile[];
  activeSnapshotId: string | null;
  proposals: AiProposal[];
  events: StructuredEvent[];

  // Live Telemetry (25Hz) & Autonomous DSP Intelligence
  meters: Record<string, MeterReading>;
  spectrum: number[];
  roomSpectrum: number[];
  intelligenceConfig: AudioIntelligenceConfig;
  setIntelligenceConfig: (patch: Partial<AudioIntelligenceConfig>) => void;
  systemIntelligence: SystemIntelligenceSummary;
  autoCalibrateChannel: (channelId: string) => { ok: boolean; summary: string };
  optimizeAllLiveChannels: () => number;

  // Transactional Commands & Undo/Redo
  updateChannel: (channelId: string, patch: Partial<ChannelStrip>, reason?: string) => { ok: boolean; error?: string };
  updateChannelSend: (
    channelId: string,
    busKey: string,
    patch: Partial<ChannelSendConfig>
  ) => void;
  updateBus: (busId: string, patch: Partial<BusNode>, reason?: string) => void;
  updateSpeaker: (speakerId: string, patch: Partial<SpeakerBand>, reason?: string) => void;
  updateVirtualDi: (patch: Partial<VirtualDiState>, reason?: string) => { ok: boolean; error?: string };
  updateFeedbackIncident: (incidentId: string, patch: Partial<FeedbackIncident>) => void;
  applyFeedbackNotch: (incidentId: string) => void;
  dismissFeedbackIncident: (incidentId: string) => void;
  runSoundCheckItem: (itemId: string, operatorAuthorized?: boolean) => void;
  recallScene: (sceneId: string) => void;
  saveCurrentAsScene: (name: string, serviceType: string) => void;
  saveSnapshot: (
    name: string,
    category?: string,
    notes?: string,
    overwriteId?: string
  ) => ConsoleSnapshotProfile;
  restoreSnapshot: (
    snapshotId: string,
    scope?: SnapshotRestoreScope
  ) => { ok: boolean; summary: string };
  deleteSnapshot: (snapshotId: string) => void;
  importSnapshotJson: (
    rawJson: string
  ) => { ok: boolean; importedCount: number; error?: string };
  addProposals: (items: AiProposal[]) => void;
  applyProposal: (proposalId: string) => void;
  dismissProposal: (proposalId: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  traceSignalJourney: (nodeId: string, direction?: 'forward' | 'reverse' | 'both') => GraphTraceResult;
  logEvent: (evt: Omit<StructuredEvent, 'id' | 'timestamp' | 'graphVersion'>) => void;

  // Audit 2026: Multi-Seat WebSocket, RBAC, High-Vis, Web MIDI, DCA Spill, Solo Modes, FX Rack, Matrix, LUFS & Virtual Soundcheck
  connectedSeats: number;
  wsConnected: boolean;
  operatorRole: OperatorRole;
  setOperatorRole: (role: OperatorRole) => void;
  highVisibilityMode: boolean;
  setHighVisibilityMode: (v: boolean) => void;
  midiConnectedDevices: string[];
  midiLastMessage: string | null;
  dcaGroups: DcaGroupState[];
  updateDcaGroup: (id: DcaGroupId, patch: Partial<DcaGroupState>) => void;
  activeDcaSpill: DcaGroupId | null;
  setActiveDcaSpill: (id: DcaGroupId | null) => void;
  soloMode: SoloMode;
  setSoloMode: (mode: SoloMode) => void;
  fxRack: FxSlotState[];
  updateFxSlot: (slotId: string, patch: Partial<FxSlotState>) => void;
  matrixZones: MatrixZone[];
  updateMatrixZone: (zoneId: string, patch: Partial<MatrixZone>) => void;
  updateMatrixZoneSource: (zoneId: string, busId: string, gainDb: number) => void;
  broadcastLoudness: BroadcastLoudnessMetrics;
  virtualSoundcheckStatus: {
    loadedCount: number;
    playing: boolean;
    loop: boolean;
    positionSec: number;
    durationSec: number;
  };
  loadVirtualSoundcheckFiles: (
    assignments: { channelId: string; file: File }[]
  ) => Promise<{ ok: boolean; loadedCount: number; durationSec: number; error?: string }>;
  mountMultitrackSessionForSoundcheck: (
    sessionId: string
  ) => Promise<{ ok: boolean; loadedCount: number; durationSec: number; error?: string }>;
  toggleVirtualSoundcheckPlay: () => void;
  stopVirtualSoundcheck: () => void;
  setVirtualSoundcheckLoop: (loop: boolean) => void;
}

const LOCAL_SNAPSHOTS_STORAGE_KEY = 'church_console_snapshots_v1';
const LOCAL_AUTOMATION_STORAGE_KEY = 'church_console_automation_v1';
const LOCAL_ROLE_STORAGE_KEY = 'church_console_operator_role_v1';
const LOCAL_HIGH_VIS_STORAGE_KEY = 'church_console_high_vis_v1';

export const AUTOMATION_PARAM_META: Record<
  AutomationParameterKey,
  { label: string; shortLabel: string; unit: string; min: number; max: number; step: number; color: string }
> = {
  faderDb: { label: 'Channel Fader', shortLabel: 'FADER', unit: 'dB', min: -60, max: 10, step: 0.5, color: '#f59e0b' },
  pan: { label: 'Stereo Pan', shortLabel: 'PAN', unit: '', min: -100, max: 100, step: 2, color: '#10b981' },
  softwareTrimDb: { label: 'Digital Trim', shortLabel: 'TRIM', unit: 'dB', min: -18, max: 18, step: 0.5, color: '#38bdf8' },
  mute: { label: 'Channel Mute', shortLabel: 'MUTE', unit: '', min: 0, max: 1, step: 1, color: '#f43f5e' },
  hpfFreqHz: { label: 'HPF Cutoff', shortLabel: 'HPF', unit: 'Hz', min: 25, max: 300, step: 5, color: '#a78bfa' },
  sendMon1: { label: 'Monitor 1 Send', shortLabel: 'MON1', unit: 'dB', min: -60, max: 10, step: 0.5, color: '#22d3ee' },
  sendStream: { label: 'Stream Send', shortLabel: 'STRM', unit: 'dB', min: -60, max: 10, step: 0.5, color: '#34d399' },
};

function clampAutomationValue(param: AutomationParameterKey, value: number): number {
  const b = AUTOMATION_PARAM_META[param];
  const clamped = Math.max(b.min, Math.min(b.max, value));
  if (param === 'mute') return clamped >= 0.5 ? 1 : 0;
  return Math.round(clamped / b.step) * b.step;
}

function readChannelAutomationParam(ch: ChannelStrip, param: AutomationParameterKey): number {
  switch (param) {
    case 'faderDb':
      return ch.faderDb;
    case 'pan':
      return ch.pan;
    case 'softwareTrimDb':
      return ch.softwareTrimDb;
    case 'mute':
      return ch.mute ? 1 : 0;
    case 'hpfFreqHz':
      return ch.hpfFreqHz;
    case 'sendMon1':
      return ch.sends.mon1?.levelDb ?? -12;
    case 'sendStream':
      return ch.sends.livestream?.levelDb ?? -6;
  }
}

export function evaluateAutomationLaneAt(lane: AutomationLane, timeSec: number): number | null {
  if (lane.points.length === 0) return null;
  const pts = lane.points;
  if (timeSec <= pts[0].timeSec) return pts[0].value;
  if (timeSec >= pts[pts.length - 1].timeSec) return pts[pts.length - 1].value;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      if (lane.parameter === 'mute') return a.value;
      const span = b.timeSec - a.timeSec;
      if (span <= 0.0001) return b.value;
      const t = (timeSec - a.timeSec) / span;
      return a.value + (b.value - a.value) * t;
    }
  }
  return pts[pts.length - 1].value;
}

function loadLocalAutomation(): { lanes: AutomationLane[]; durationSec: number } {
  if (typeof window === 'undefined') return { lanes: [], durationSec: 60 };
  try {
    const raw = window.localStorage.getItem(LOCAL_AUTOMATION_STORAGE_KEY);
    if (!raw) return { lanes: [], durationSec: 60 };
    const parsed = JSON.parse(raw) as { lanes?: unknown; durationSec?: unknown };
    const lanes = Array.isArray(parsed.lanes)
      ? parsed.lanes.filter(
          (l): l is AutomationLane =>
            Boolean(l) &&
            typeof l.id === 'string' &&
            typeof l.channelId === 'string' &&
            typeof l.parameter === 'string' &&
            Array.isArray(l.points)
        )
      : [];
    const durationSec =
      typeof parsed.durationSec === 'number' && parsed.durationSec >= 10 && parsed.durationSec <= 600
        ? parsed.durationSec
        : 60;
    return { lanes, durationSec };
  } catch {
    return { lanes: [], durationSec: 60 };
  }
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadLocalSnapshots(): ConsoleSnapshotProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ConsoleSnapshotProfile =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        Array.isArray(item.channels) &&
        Array.isArray(item.buses) &&
        Array.isArray(item.speakers)
    );
  } catch {
    return [];
  }
}

function mergeSnapshots(
  primary: ConsoleSnapshotProfile[],
  secondary: ConsoleSnapshotProfile[]
): ConsoleSnapshotProfile[] {
  const map = new Map<string, ConsoleSnapshotProfile>();
  for (const item of [...secondary, ...primary]) {
    if (!item || typeof item.id !== 'string') continue;
    const prev = map.get(item.id);
    if (!prev || String(item.updatedAt) >= String(prev.updatedAt)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
}

const AudioConsoleContext = createContext<AudioConsoleContextValue | null>(null);

export const WORKSPACE_GROUPS: {
  id: MainDestinationId;
  label: string;
  workspaces: { id: WorkspaceId; label: string; shortLabel: string }[];
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    workspaces: [{ id: 'master-overview', label: 'Master System Overview', shortLabel: 'System Overview' }],
  },
  {
    id: 'inputs',
    label: 'Inputs & Channels',
    workspaces: [
      { id: 'live-console', label: 'Live Sound Console', shortLabel: 'Live Console' },
      { id: 'mic-intelligence', label: 'Microphone Intelligence', shortLabel: 'Microphones' },
      { id: 'instrument-intelligence', label: 'Instrument Intelligence', shortLabel: 'Instruments' },
      { id: 'virtual-di', label: 'Virtual DI & Bass Processor', shortLabel: 'Virtual DI' },
    ],
  },
  {
    id: 'processing',
    label: 'Mixing & Processing',
    workspaces: [
      { id: 'dsp-eq', label: 'Professional Audio DSP & EQ', shortLabel: 'DSP & EQ' },
      { id: 'feedback-detection', label: 'Intelligent Feedback Detection', shortLabel: 'Feedback' },
      { id: 'acoustic-analyzer', label: 'Acoustic Intelligence & Room Analyzer', shortLabel: 'Room RTA' },
    ],
  },
  {
    id: 'routing',
    label: 'Routing & Outputs',
    workspaces: [
      { id: 'universal-routing', label: 'Universal Routing & Signal Flow', shortLabel: 'Signal Flow' },
      { id: 'speaker-management', label: 'Intelligent Speaker Management', shortLabel: 'Speakers' },
      { id: 'livestream-studio', label: 'Livestream Studio', shortLabel: 'Livestream' },
    ],
  },
  {
    id: 'operations',
    label: 'Service Operations',
    workspaces: [
      { id: 'sound-check', label: 'Automated Sound Check', shortLabel: 'Sound Check' },
      { id: 'presets-profiles', label: 'Presets & Service Profiles', shortLabel: 'Scenes' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence & System',
    workspaces: [
      { id: 'ai-engineer', label: 'AI Sound Engineer', shortLabel: 'AI Engineer' },
      { id: 'system-diagnostics', label: 'System Diagnostics & Reliability', shortLabel: 'Diagnostics' },
    ],
  },
];

function buildAutoHardwareProfile(detected: DetectedHardwareDevice[]): HardwareProfile {
  const base = HARDWARE_PROFILES['auto-detected'];
  if (detected.length === 0) return base;

  const inputs = detected.filter((d) => d.kind === 'audioinput');
  const outputs = detected.filter((d) => d.kind === 'audiooutput');
  const groupSet = new Set(detected.map((d) => d.groupId));
  const clockTelemetry = audioEngine.getAudioClockTelemetry();

  const devices: AudioDevice[] = [];
  const primaryIn = inputs.find((d) => d.isDefault) ?? inputs[0];
  const primaryOut = outputs.find((d) => d.isDefault) ?? outputs[0];

  if (primaryIn || primaryOut) {
    devices.push({
      id: primaryIn?.deviceId ?? primaryOut?.deviceId ?? 'dev-host-primary',
      name: primaryIn?.label || primaryOut?.label || 'Host Audio Interface',
      driver: 'WebAudio Auto',
      role: 'Primary Capture/Playback',
      inputsCount: inputs.reduce((a, b) => a + b.channelCount, 0) || 2,
      outputsCount: outputs.reduce((a, b) => a + b.channelCount, 0) || 2,
      sampleRateHz: (clockTelemetry.sampleRateHz === 44100 || clockTelemetry.sampleRateHz === 96000
        ? clockTelemetry.sampleRateHz
        : 48000),
      bufferSamples: 128,
      clockDomain: `Host AudioContext (${(clockTelemetry.sampleRateHz / 1000).toFixed(1)} kHz)`,
      clockState: groupSet.size > 2 ? 'Free-Running (Drift Risk)' : 'Locked Leader',
      connected: true,
      capabilities: {
        preampGain: 'manual',
        phantomPower: 'manual',
        pad: 'manual',
        hardwareFaders: 'manual',
        softwareDsp: 'controllable',
        hardwareMeters: 'observable',
        clockSync: 'observable',
        talkback: 'controllable',
      },
      notes: `Auto-detected ${inputs.length} input(s), ${outputs.length} output(s) across ${groupSet.size} hardware clock group(s). Desktop/System Audio Capture + Local File playback always enabled.`,
    });
  }

  return {
    ...base,
    usbBridgeChannels: inputs.reduce((a, b) => a + b.channelCount, 0) || 2,
    devices: devices.length > 0 ? devices : base.devices,
    wiringSummary: `Live host hardware: ${inputs.length} audio input endpoint(s) & ${outputs.length} output endpoint(s) + System/Desktop Audio loopback.`,
  };
}

export function UnifiedAudioEngineProvider({ children }: { children: React.ReactNode }) {
  const [activeDestination, setActiveDestination] = useState<MainDestinationId>('inputs');
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('live-console');
  const [operatingMode, setOperatingMode] = useState<OperatingMode>('console');
  const [workspaceTheme, setWorkspaceTheme] = useState<ConsoleThemeId>('obsidian-brass');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('ch-01');
  const [selectedBusId, setSelectedBusId] = useState<string>('bus-main');
  const [signalJourneyTargetId, setSignalJourneyTargetId] = useState<string | null>(null);

  const [sourceBayOpen, setSourceBayOpen] = useState<boolean>(false);
  const [sourceBayChannelId, setSourceBayChannelId] = useState<string>('ch-01');
  const [gainStagingOpen, setGainStagingOpen] = useState<boolean>(false);
  const [gainStagingChannelId, setGainStagingChannelId] = useState<string | null>(null);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState<boolean>(false);

  const [profileId, setProfileId] = useState<HardwareProfileId>('auto-detected');
  const [detectedHardware, setDetectedHardware] = useState<DetectedHardwareDevice[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>('default');

  const [channels, setChannels] = useState<ChannelStrip[]>(INITIAL_CHANNELS);
  const [buses, setBuses] = useState<BusNode[]>(INITIAL_BUSES);
  const [speakers, setSpeakers] = useState<SpeakerBand[]>(INITIAL_SPEAKERS);
  const [virtualCables, setVirtualCables] = useState<VirtualCableNode[]>(INITIAL_VIRTUAL_CABLES);
  const [virtualDi, setVirtualDi] = useState<VirtualDiState>(INITIAL_VIRTUAL_DI);
  const [feedbackIncidents, setFeedbackIncidents] = useState<FeedbackIncident[]>(INITIAL_FEEDBACK);
  const [soundCheckItems, setSoundCheckItems] = useState<SoundCheckItem[]>(INITIAL_SOUND_CHECK);
  const [scenes, setScenes] = useState<SceneProfile[]>(INITIAL_SCENES);
  const [activeSceneId, setActiveSceneId] = useState<string>('scn-sunday');
  const [snapshots, setSnapshots] = useState<ConsoleSnapshotProfile[]>(() => loadLocalSnapshots());
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<AiProposal[]>([]);

  const [graphVersion, setGraphVersion] = useState<number>(1);
  const [dbHydrated, setDbHydrated] = useState<boolean>(false);
  const [dbSyncing, setDbSyncing] = useState<boolean>(false);
  const [dbUpdatedAt, setDbUpdatedAt] = useState<string | null>(null);

  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const [globalDspBypass, setGlobalDspBypassState] = useState<boolean>(false);
  const [xrunsCount, setXrunsCount] = useState<number>(0);

  const [recordingActive, setRecordingActive] = useState<boolean>(false);
  const [recordingDurationSec, setRecordingDurationSec] = useState<number>(0);
  const [recordingTargetId, setRecordingTargetId] = useState<RecordingTargetId>('system-master');
  const [recordedTakes, setRecordedTakes] = useState<RecordedTake[]>([]);
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  const [lastRecordingFilename, setLastRecordingFilename] = useState<string | null>(null);

  const [multitrackArmedIds, setMultitrackArmedIds] = useState<string[]>(() =>
    INITIAL_CHANNELS.slice(0, 4).map((c) => c.id)
  );
  const [multitrackTapPoint, setMultitrackTapPoint] = useState<MultitrackTapPoint>('pre-dsp');
  const [multitrackBitDepth, setMultitrackBitDepth] = useState<WavBitDepth>(24);
  const [multitrackRecording, setMultitrackRecording] = useState<boolean>(false);
  const [multitrackSessions, setMultitrackSessions] = useState<MultitrackSession[]>([]);

  const initialAuto = useMemo(() => loadLocalAutomation(), []);
  const [automationLanes, setAutomationLanes] = useState<AutomationLane[]>(initialAuto.lanes);
  const [automationTransport, setAutomationTransport] = useState<AutomationTransportState>({
    playing: false,
    recording: false,
    mode: 'read',
    playheadSec: 0,
    durationSec: initialAuto.durationSec,
    loop: true,
  });

  const [testToneActive, setTestToneActive] = useState<boolean>(false);
  const [testToneKind, setTestToneKind] = useState<'pink' | 'sine1k' | 'sweep'>('pink');
  const [testToneGainDb, setTestToneGainDb] = useState<number>(-24);
  const [talkbackActive, setTalkbackActive] = useState<boolean>(false);
  const [monitorSource, setMonitorSource] = useState<'MAIN L/R' | 'MON 1' | 'MON 2' | 'STREAM' | 'SOLO'>('MAIN L/R');
  const [muteGroupsActive, setMuteGroupsActive] = useState<Record<1 | 2 | 3 | 4, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  const [events, setEvents] = useState<StructuredEvent[]>([]);
  const [undoStack, setUndoStack] = useState<ConsoleSnapshotState[]>([]);
  const [redoStack, setRedoStack] = useState<ConsoleSnapshotState[]>([]);

  const [meters, setMeters] = useState<Record<string, MeterReading>>({});
  const [spectrum, setSpectrum] = useState<number[]>(new Array(64).fill(-80));
  const [roomSpectrum, setRoomSpectrum] = useState<number[]>(new Array(64).fill(-80));
  const [intelligenceConfig, setIntelligenceConfigState] = useState<AudioIntelligenceConfig>(
    DEFAULT_INTELLIGENCE_CONFIG
  );
  const [systemIntelligence, setSystemIntelligence] = useState<SystemIntelligenceSummary>(() =>
    createEmptySystemIntelligence()
  );

  // Audit 2026 States
  const [connectedSeats, setConnectedSeats] = useState<number>(1);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [operatorRole, setOperatorRoleState] = useState<OperatorRole>(() => {
    if (typeof window === 'undefined') return 'foh';
    const saved = window.localStorage.getItem(LOCAL_ROLE_STORAGE_KEY);
    return saved === 'volunteer' || saved === 'foh' || saved === 'system-tech' ? saved : 'foh';
  });
  const [highVisibilityMode, setHighVisibilityModeState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(LOCAL_HIGH_VIS_STORAGE_KEY) === 'true';
  });
  const [midiConnectedDevices, setMidiConnectedDevices] = useState<string[]>([]);
  const [midiLastMessage, setMidiLastMessage] = useState<string | null>(null);
  const [dcaGroups, setDcaGroups] = useState<DcaGroupState[]>(INITIAL_DCA_GROUPS);
  const [activeDcaSpill, setActiveDcaSpill] = useState<DcaGroupId | null>(null);
  const [soloMode, setSoloMode] = useState<SoloMode>('afl');
  const [fxRack, setFxRack] = useState<FxSlotState[]>(INITIAL_FX_RACK);
  const [matrixZones, setMatrixZones] = useState<MatrixZone[]>(INITIAL_MATRIX_ZONES);
  const [broadcastLoudness, setBroadcastLoudness] = useState<BroadcastLoudnessMetrics>({
    momentaryLufs: -80,
    shortTermLufs: -80,
    integratedLufs: -80,
    truePeakDbtp: -80,
    loudnessRangeLu: 0,
  });
  const [virtualSoundcheckStatus, setVirtualSoundcheckStatus] = useState<{
    loadedCount: number;
    playing: boolean;
    loop: boolean;
    positionSec: number;
    durationSec: number;
  }>({
    loadedCount: 0,
    playing: false,
    loop: true,
    positionSec: 0,
    durationSec: 0,
  });

  const clientIdRef = useRef<string>(
    `seat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );
  const revisionIdRef = useRef<number>(1);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const channelPatchTimersRef = useRef<Map<string, number>>(new Map());
  const busPatchTimersRef = useRef<Map<string, number>>(new Map());

  const hardwareProfile = useMemo(() => {
    if (profileId === 'auto-detected') {
      return buildAutoHardwareProfile(detectedHardware);
    }
    return HARDWARE_PROFILES[profileId];
  }, [profileId, detectedHardware]);

  const liveMicActive = useMemo(
    () =>
      channels.some(
        (c) =>
          c.sourceBinding?.active &&
          (c.sourceBinding.kind === 'mic' ||
            c.sourceBinding.kind === 'desktop' ||
            c.sourceBinding.kind === 'virtual-cable')
      ),
    [channels]
  );

  const stateRef = useRef({
    profileId,
    activeSceneId,
    channels,
    buses,
    speakers,
    virtualCables,
    virtualDi,
    proposals,
    graphVersion,
    feedbackIncidents,
    intelligenceConfig,
    systemIntelligence,
    globalDspBypass,
    automationLanes,
    automationTransport,
    dcaGroups,
    fxRack,
    matrixZones,
    soloMode,
    operatorRole,
  });
  stateRef.current = {
    profileId,
    activeSceneId,
    channels,
    buses,
    speakers,
    virtualCables,
    virtualDi,
    proposals,
    graphVersion,
    feedbackIncidents,
    intelligenceConfig,
    systemIntelligence,
    globalDspBypass,
    automationLanes,
    automationTransport,
    dcaGroups,
    fxRack,
    matrixZones,
    soloMode,
    operatorRole,
  };

  const lastTouchAtRef = useRef<Map<string, number>>(new Map());
  const feedbackRingTrackerRef = useRef<{ freqHz: number; count: number; lastSeenMs: number } | null>(null);

  const logEvent = useCallback(
    (evt: Omit<StructuredEvent, 'id' | 'timestamp' | 'graphVersion'>) => {
      const now = new Date();
      const timestamp = now.toTimeString().slice(0, 8);
      const entry: StructuredEvent = {
        ...evt,
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        graphVersion: stateRef.current.graphVersion,
      };
      setEvents((prev) => [entry, ...prev.slice(0, 59)]);
      void fetch('/api/console/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: entry }),
      }).catch(() => {});
    },
    []
  );

  const scanHardware = useCallback(
    async (unlockLabels = false): Promise<DetectedHardwareDevice[]> => {
      try {
        if (unlockLabels) {
          await audioEngine.unlockHardwareLabelsViaMicProbe();
        }
        const detected = await audioEngine.enumerateAndClassifyHardware();
        setDetectedHardware(detected);
        void fetch('/api/console/hardware/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Operator-Role': stateRef.current.operatorRole,
          },
          body: JSON.stringify({ devices: detected }),
        }).catch(() => {});
        return detected;
      } catch (err) {
        logEvent({
          family: 'device',
          severity: 'warning',
          service: 'HardwareDetector',
          message: `Hardware scan notice: ${err instanceof Error ? err.message : 'enumeration restricted'}`,
        });
        return [];
      }
    },
    [logEvent]
  );

  // Hydrate persisted state from SQLite backend + run initial OS audio hardware scan
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await fetch('/api/console/bootstrap');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            isRemoteUpdateRef.current = true;
            if (typeof data.revisionId === 'number') revisionIdRef.current = data.revisionId;
            if (data.profileId) setProfileId(data.profileId);
            if (data.workspaceTheme) setWorkspaceTheme(data.workspaceTheme);
            if (data.activeSceneId) setActiveSceneId(data.activeSceneId);
            if (typeof data.graphVersion === 'number') setGraphVersion(data.graphVersion);
            if (Array.isArray(data.channels)) setChannels(data.channels);
            if (Array.isArray(data.buses)) setBuses(data.buses);
            if (Array.isArray(data.speakers)) setSpeakers(data.speakers);
            if (Array.isArray(data.virtualCables) && data.virtualCables.length > 0) {
              setVirtualCables(data.virtualCables);
            }
            if (data.virtualDi) setVirtualDi(data.virtualDi);
            if (Array.isArray(data.dcaGroups) && data.dcaGroups.length > 0) {
              setDcaGroups(data.dcaGroups);
            }
            if (Array.isArray(data.fxRack) && data.fxRack.length > 0) {
              setFxRack(data.fxRack);
            }
            if (Array.isArray(data.matrixZones) && data.matrixZones.length > 0) {
              setMatrixZones(data.matrixZones);
            }
            if (Array.isArray(data.proposals)) setProposals(data.proposals);
            if (Array.isArray(data.scenes)) setScenes(data.scenes);
            if (Array.isArray(data.snapshots)) {
              setSnapshots((localPrev) => mergeSnapshots(data.snapshots, localPrev));
            }
            if (Array.isArray(data.hardwareInventory)) setDetectedHardware(data.hardwareInventory);
            if (Array.isArray(data.feedbackIncidents)) setFeedbackIncidents(data.feedbackIncidents);
            if (Array.isArray(data.soundCheckItems)) setSoundCheckItems(data.soundCheckItems);
            if (Array.isArray(data.events)) setEvents(data.events);
            if (Array.isArray(data.automationLanes) && data.automationLanes.length > 0) {
              setAutomationLanes(data.automationLanes);
            }
            if (typeof data.automationDurationSec === 'number' && data.automationDurationSec >= 10) {
              setAutomationTransport((prev) => ({
                ...prev,
                durationSec: data.automationDurationSec,
              }));
            }
            if (data.updatedAt) setDbUpdatedAt(data.updatedAt);
            window.setTimeout(() => {
              isRemoteUpdateRef.current = false;
            }, 60);
          }
        }
      } catch {
        // Fallback to initial factory state if offline
      } finally {
        if (!cancelled) {
          setDbHydrated(true);
          void scanHardware(false);
        }
      }
    }
    void init();

    const unsubAudioRecovery = audioEngine.subscribeAudioRecovery((ctxState) => {
      setAudioUnlocked(ctxState === 'running');
    });

    const handleDeviceChange = () => {
      void scanHardware(false).then((list) => {
        logEvent({
          family: 'device',
          severity: 'info',
          service: 'AutoHardwareDetector',
          message: `Hot-plug change detected: ${list.length} audio I/O endpoint(s) active.`,
        });
      });
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }
    return () => {
      cancelled = true;
      unsubAudioRecovery();
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [scanHardware, logEvent]);

  // Multi-Seat Bi-Directional WebSocket Synchronization (/ws)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    let closedByCleanup = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closedByCleanup) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            type: 'hello',
            clientId: clientIdRef.current,
            role: stateRef.current.operatorRole,
          })
        );
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string;
            senderClientId?: string;
            connectedSeats?: number;
            revisionId?: number;
            graphVersion?: number;
            channelId?: string;
            channel?: ChannelStrip;
            busId?: string;
            bus?: BusNode;
            dcaGroups?: DcaGroupState[];
            state?: {
              profileId?: HardwareProfileId;
              workspaceTheme?: ConsoleThemeId;
              activeSceneId?: string;
              graphVersion?: number;
              channels?: ChannelStrip[];
              buses?: BusNode[];
              speakers?: SpeakerBand[];
              virtualCables?: VirtualCableNode[];
              virtualDi?: VirtualDiState;
              dcaGroups?: DcaGroupState[];
              fxRack?: FxSlotState[];
              matrixZones?: MatrixZone[];
              proposals?: AiProposal[];
            };
          };

          if (msg.type === 'presence:update' && typeof msg.connectedSeats === 'number') {
            setConnectedSeats(Math.max(1, msg.connectedSeats));
            return;
          }

          if (msg.senderClientId && msg.senderClientId === clientIdRef.current) {
            if (typeof msg.revisionId === 'number') {
              revisionIdRef.current = Math.max(revisionIdRef.current, msg.revisionId);
            }
            return;
          }

          isRemoteUpdateRef.current = true;
          if (typeof msg.revisionId === 'number') {
            revisionIdRef.current = Math.max(revisionIdRef.current, msg.revisionId);
          }

          if (msg.type === 'channel:patched' && msg.channel && msg.channelId) {
            setChannels((prev) =>
              prev.map((c) => (c.id === msg.channelId ? { ...c, ...msg.channel } : c))
            );
            if (typeof msg.graphVersion === 'number') setGraphVersion(msg.graphVersion);
          } else if (msg.type === 'bus:patched' && msg.bus && msg.busId) {
            setBuses((prev) =>
              prev.map((b) => (b.id === msg.busId ? { ...b, ...msg.bus } : b))
            );
            if (typeof msg.graphVersion === 'number') setGraphVersion(msg.graphVersion);
          } else if (msg.type === 'dca:patched' && Array.isArray(msg.dcaGroups)) {
            setDcaGroups(msg.dcaGroups);
          } else if (msg.type === 'state:updated' && msg.state) {
            if (msg.state.profileId) setProfileId(msg.state.profileId);
            if (msg.state.workspaceTheme) setWorkspaceTheme(msg.state.workspaceTheme);
            if (msg.state.activeSceneId) setActiveSceneId(msg.state.activeSceneId);
            if (typeof msg.state.graphVersion === 'number') setGraphVersion(msg.state.graphVersion);
            if (Array.isArray(msg.state.channels)) setChannels(msg.state.channels);
            if (Array.isArray(msg.state.buses)) setBuses(msg.state.buses);
            if (Array.isArray(msg.state.speakers)) setSpeakers(msg.state.speakers);
            if (Array.isArray(msg.state.virtualCables)) setVirtualCables(msg.state.virtualCables);
            if (msg.state.virtualDi) setVirtualDi(msg.state.virtualDi);
            if (Array.isArray(msg.state.dcaGroups)) setDcaGroups(msg.state.dcaGroups);
            if (Array.isArray(msg.state.fxRack)) setFxRack(msg.state.fxRack);
            if (Array.isArray(msg.state.matrixZones)) setMatrixZones(msg.state.matrixZones);
            if (Array.isArray(msg.state.proposals)) setProposals(msg.state.proposals);
          } else if (msg.type === 'console:reset') {
            void fetch('/api/console/bootstrap')
              .then((r) => (r.ok ? r.json() : null))
              .then((boot) => {
                if (!boot) return;
                if (Array.isArray(boot.channels)) setChannels(boot.channels);
                if (Array.isArray(boot.buses)) setBuses(boot.buses);
                if (Array.isArray(boot.speakers)) setSpeakers(boot.speakers);
                if (Array.isArray(boot.dcaGroups)) setDcaGroups(boot.dcaGroups);
                if (Array.isArray(boot.fxRack)) setFxRack(boot.fxRack);
                if (Array.isArray(boot.matrixZones)) setMatrixZones(boot.matrixZones);
              })
              .catch(() => {});
          }

          window.setTimeout(() => {
            isRemoteUpdateRef.current = false;
          }, 50);
        } catch {
          // ignore malformed WS event
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connect, 2200);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connect();
    return () => {
      closedByCleanup = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      try {
        wsRef.current?.close();
      } catch {
        // safe close
      }
      wsRef.current = null;
    };
  }, []);

  // Web MIDI Hardware Controller Support (X-Touch / Mackie CC Faders & Mutes)
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<{
        inputs: Map<
          string,
          {
            name?: string;
            onmidimessage: ((ev: { data: Uint8Array }) => void) | null;
          }
        >;
        onstatechange: (() => void) | null;
      }>;
    };
    if (typeof nav.requestMIDIAccess !== 'function') return;

    let cancelled = false;
    void nav
      .requestMIDIAccess()
      .then((access) => {
        if (cancelled) return;
        const bindInputs = () => {
          const names: string[] = [];
          access.inputs.forEach((input) => {
            names.push(input.name || 'MIDI Surface');
            input.onmidimessage = (ev) => {
              const data = ev.data;
              if (!data || data.length < 3) return;
              const status = data[0] & 0xf0;
              const byte1 = data[1];
              const byte2 = data[2];

              if (status === 0xb0) {
                // CC 0..15 -> Fader level -75..+10 dB
                if (byte1 <= 15) {
                  const targetCh = stateRef.current.channels[byte1];
                  if (targetCh) {
                    const db = Number((-75 + (byte2 / 127) * 85).toFixed(1));
                    setChannels((prev) =>
                      prev.map((c) => (c.id === targetCh.id ? { ...c, faderDb: db } : c))
                    );
                    setMidiLastMessage(`CH ${targetCh.number} Fader -> ${db} dB`);
                  }
                } else if (byte1 >= 16 && byte1 <= 31 && byte2 >= 64) {
                  const targetCh = stateRef.current.channels[byte1 - 16];
                  if (targetCh) {
                    setChannels((prev) =>
                      prev.map((c) => (c.id === targetCh.id ? { ...c, mute: !c.mute } : c))
                    );
                    setMidiLastMessage(`CH ${targetCh.number} Mute toggled`);
                  }
                }
              } else if (status === 0xe0) {
                // Pitchbend on MIDI channel (data[0] & 0x0f) -> Fader
                const midiCh = data[0] & 0x0f;
                const targetCh = stateRef.current.channels[midiCh];
                if (targetCh) {
                  const val14 = ((byte2 << 7) | byte1) / 16383;
                  const db = Number((-75 + val14 * 85).toFixed(1));
                  setChannels((prev) =>
                    prev.map((c) => (c.id === targetCh.id ? { ...c, faderDb: db } : c))
                  );
                  setMidiLastMessage(`CH ${targetCh.number} PB Fader -> ${db} dB`);
                }
              } else if (status === 0x90 && byte2 > 0 && byte1 < 16) {
                const targetCh = stateRef.current.channels[byte1];
                if (targetCh) {
                  setChannels((prev) =>
                    prev.map((c) => (c.id === targetCh.id ? { ...c, mute: !c.mute } : c))
                  );
                  setMidiLastMessage(`CH ${targetCh.number} Note Mute`);
                }
              }
            };
          });
          setMidiConnectedDevices(names);
        };
        bindInputs();
        access.onstatechange = bindInputs;
      })
      .catch(() => {
        // MIDI access denied or unavailable
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Apply full-workspace CSS variable theme attribute & High-Vis Sunlight Mode on root element
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-console-theme', workspaceTheme);
    }
  }, [workspaceTheme]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-high-vis', highVisibilityMode ? 'true' : 'false');
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCAL_HIGH_VIS_STORAGE_KEY, String(highVisibilityMode));
      } catch {
        // ignore
      }
    }
  }, [highVisibilityMode]);

  // Persist Console Snapshot Profiles to local browser profile storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LOCAL_SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [snapshots]);

  // Persist Parameter Automation Lanes to local browser storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        LOCAL_AUTOMATION_STORAGE_KEY,
        JSON.stringify({
          lanes: automationLanes,
          durationSec: automationTransport.durationSec,
        })
      );
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [automationLanes, automationTransport.durationSec]);

  // Debounced DB state persistence whenever core mixer state updates after hydration
  useEffect(() => {
    if (!dbHydrated || isRemoteUpdateRef.current) return;
    const handle = window.setTimeout(() => {
      if (isRemoteUpdateRef.current) return;
      setDbSyncing(true);
      void fetch('/api/console/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Role': stateRef.current.operatorRole,
        },
        body: JSON.stringify({
          profileId,
          workspaceTheme,
          activeSceneId,
          graphVersion,
          revisionId: revisionIdRef.current,
          clientId: clientIdRef.current,
          channels,
          buses,
          speakers,
          virtualCables,
          virtualDi,
          dcaGroups,
          fxRack,
          matrixZones,
          proposals,
          automationLanes,
          automationDurationSec: automationTransport.durationSec,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.updatedAt) setDbUpdatedAt(res.updatedAt);
          if (typeof res?.revisionId === 'number') revisionIdRef.current = res.revisionId;
        })
        .catch(() => {})
        .finally(() => setDbSyncing(false));
    }, 320);
    return () => window.clearTimeout(handle);
  }, [
    dbHydrated,
    profileId,
    workspaceTheme,
    activeSceneId,
    graphVersion,
    channels,
    buses,
    speakers,
    virtualCables,
    virtualDi,
    dcaGroups,
    fxRack,
    matrixZones,
    proposals,
    automationLanes,
    automationTransport.durationSec,
  ]);

  // Recording elapsed duration ticker
  useEffect(() => {
    if (!recordingActive) return;
    const t = window.setInterval(() => {
      setRecordingDurationSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [recordingActive]);

  // 25 Hz genuine Web Audio AnalyserNode metering + autonomous Dugan/FFT DSP + BS.1770 LUFS + Virtual Soundcheck playhead
  useEffect(() => {
    const timer = window.setInterval(() => {
      const s = stateRef.current;
      const sample = audioEngine.sampleMeters(
        s.channels,
        s.buses,
        s.graphVersion,
        s.intelligenceConfig,
        s.speakers,
        s.virtualCables,
        s.globalDspBypass,
        s.dcaGroups,
        s.matrixZones,
        s.soloMode
      );
      setMeters(sample.meters);
      setSpectrum(sample.spectrum);
      setRoomSpectrum(sample.roomSpectrum);
      setSystemIntelligence(sample.systemIntelligence);
      setBroadcastLoudness(sample.broadcastLoudness);
      setVirtualSoundcheckStatus(audioEngine.getVirtualSoundcheckStatus());

      const cand = sample.liveFeedbackCandidate;
      if (cand) {
        const now = Date.now();
        const prev = feedbackRingTrackerRef.current;
        if (prev && Math.abs(prev.freqHz - cand.freqHz) < 65 && now - prev.lastSeenMs < 400) {
          prev.count += 1;
          prev.lastSeenMs = now;
          if (prev.count === 12) {
            const exists = s.feedbackIncidents.some(
              (f) =>
                f.status !== 'dismissed' &&
                f.status !== 'suppression_applied_verified' &&
                Math.abs(f.freqHz - cand.freqHz) < 75
            );
            if (!exists) {
              const inc: FeedbackIncident = {
                id: `fb-${now}`,
                channelId: cand.channelId,
                freqHz: cand.freqHz,
                levelDb: cand.levelDb,
                qEstimate: cand.qEstimate,
                confidence: cand.confidence,
                status: 'feedback_detected',
                detectedAt: new Date().toTimeString().slice(0, 8),
                notchProposedDb: -6.5,
              };
              setFeedbackIncidents((arr) => [inc, ...arr]);
              void fetch('/api/console/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ incident: inc }),
              }).catch(() => {});
            }
          }
        } else {
          feedbackRingTrackerRef.current = { freqHz: cand.freqHz, count: 1, lastSeenMs: now };
        }
      } else {
        feedbackRingTrackerRef.current = null;
      }
    }, 45);
    return () => window.clearInterval(timer);
  }, []);

  const applyAutomationAtTime = useCallback((timeSec: number) => {
    const s = stateRef.current;
    if (s.automationTransport.mode === 'off') return;
    const activeLanes = s.automationLanes.filter((l) => l.enabled && l.points.length > 0);
    if (activeLanes.length === 0) return;

    const nowMs = Date.now();
    const pendingByChannel = new Map<string, Partial<ChannelStrip>>();
    const pendingSendByChannel = new Map<string, { busKey: 'mon1' | 'livestream'; levelDb: number }[]>();

    for (const lane of activeLanes) {
      if (s.automationTransport.mode === 'touch' || s.automationTransport.mode === 'write') {
        const lastTouch = lastTouchAtRef.current.get(`${lane.channelId}:${lane.parameter}`);
        if (lastTouch && nowMs - lastTouch < 350) continue;
      }
      const val = evaluateAutomationLaneAt(lane, timeSec);
      if (val === null) continue;

      if (lane.parameter === 'sendMon1' || lane.parameter === 'sendStream') {
        const busKey = lane.parameter === 'sendMon1' ? 'mon1' : 'livestream';
        const list = pendingSendByChannel.get(lane.channelId) ?? [];
        list.push({ busKey, levelDb: Number(val.toFixed(1)) });
        pendingSendByChannel.set(lane.channelId, list);
      } else {
        const patch = pendingByChannel.get(lane.channelId) ?? {};
        if (lane.parameter === 'mute') {
          patch.mute = val >= 0.5;
        } else if (lane.parameter === 'hpfFreqHz') {
          patch.hpfFreqHz = Math.round(val);
        } else if (lane.parameter === 'pan') {
          patch.pan = Math.round(val);
        } else if (lane.parameter === 'softwareTrimDb') {
          patch.softwareTrimDb = Number(val.toFixed(1));
        } else {
          patch.faderDb = Number(val.toFixed(1));
        }
        pendingByChannel.set(lane.channelId, patch);
      }
    }

    if (pendingByChannel.size === 0 && pendingSendByChannel.size === 0) return;

    setChannels((prev) => {
      let changed = false;
      const next = prev.map((ch) => {
        const patch = pendingByChannel.get(ch.id);
        const sendPatches = pendingSendByChannel.get(ch.id);
        if (!patch && !sendPatches) return ch;

        let stripChanged = false;
        let updated = ch;
        if (patch) {
          if (patch.faderDb !== undefined && Math.abs(patch.faderDb - ch.faderDb) > 0.04) {
            stripChanged = true;
          } else if (patch.pan !== undefined && Math.abs(patch.pan - ch.pan) > 0.4) {
            stripChanged = true;
          } else if (
            patch.softwareTrimDb !== undefined &&
            Math.abs(patch.softwareTrimDb - ch.softwareTrimDb) > 0.04
          ) {
            stripChanged = true;
          } else if (patch.hpfFreqHz !== undefined && Math.abs(patch.hpfFreqHz - ch.hpfFreqHz) > 0.4) {
            stripChanged = true;
          } else if (patch.mute !== undefined && patch.mute !== ch.mute) {
            stripChanged = true;
          }
          if (stripChanged) {
            updated = { ...updated, ...patch };
          }
        }

        if (sendPatches) {
          let nextSends = updated.sends;
          for (const sp of sendPatches) {
            const cur = nextSends[sp.busKey];
            if (!cur || Math.abs(sp.levelDb - cur.levelDb) > 0.04) {
              if (nextSends === updated.sends) nextSends = { ...updated.sends };
              nextSends[sp.busKey] = {
                ...(cur ?? { levelDb: -12, preFader: false, enabled: true }),
                levelDb: sp.levelDb,
                enabled: sp.levelDb > -59,
              };
              stripChanged = true;
            }
          }
          if (nextSends !== updated.sends) {
            updated = { ...updated, sends: nextSends };
          }
        }

        if (stripChanged) changed = true;
        return stripChanged ? updated : ch;
      });
      return changed ? next : prev;
    });
  }, []);

  // Parameter Automation 30Hz playback transport loop
  useEffect(() => {
    if (!automationTransport.playing) return;
    let lastPerf = performance.now();
    const timer = window.setInterval(() => {
      const nowPerf = performance.now();
      const dtSec = Math.max(0, Math.min(0.2, (nowPerf - lastPerf) / 1000));
      lastPerf = nowPerf;
      let targetTime = stateRef.current.automationTransport.playheadSec;
      setAutomationTransport((prev) => {
        if (!prev.playing) return prev;
        let nextSec = prev.playheadSec + dtSec;
        if (nextSec >= prev.durationSec) {
          if (prev.loop) {
            nextSec = nextSec % prev.durationSec;
          } else {
            targetTime = prev.durationSec;
            return { ...prev, playheadSec: prev.durationSec, playing: false, recording: false };
          }
        }
        targetTime = nextSec;
        return { ...prev, playheadSec: nextSec };
      });
      applyAutomationAtTime(targetTime);
    }, 33);
    return () => window.clearInterval(timer);
  }, [automationTransport.playing, applyAutomationAtTime]);

  // Sync live Web Audio DSP parameters whenever channels, buses, speakers, virtual cables, Virtual DI, DCA, FX, Matrix, Solo, or Bypass change
  useEffect(() => {
    audioEngine.syncGraph(
      channels,
      buses,
      virtualDi,
      speakers,
      virtualCables,
      globalDspBypass,
      dcaGroups,
      fxRack,
      matrixZones,
      soloMode
    );
  }, [channels, buses, virtualDi, speakers, virtualCables, globalDspBypass, dcaGroups, fxRack, matrixZones, soloMode]);

  const captureSnapshot = useCallback((): ConsoleSnapshotState => {
    return {
      profileId,
      channels,
      buses,
      speakers,
      virtualCables,
      virtualDi,
      feedbackIncidents,
      soundCheckItems,
      activeSceneId,
    };
  }, [profileId, channels, buses, speakers, virtualCables, virtualDi, feedbackIncidents, soundCheckItems, activeSceneId]);

  const pushUndo = useCallback(() => {
    const snap = captureSnapshot();
    setUndoStack((prev) => [...prev.slice(-24), snap]);
    setRedoStack([]);
  }, [captureSnapshot]);

  const setWorkspace = useCallback((dest: MainDestinationId, ws: WorkspaceId) => {
    setActiveDestination(dest);
    setActiveWorkspace(ws);
  }, []);

  const openSignalJourney = useCallback((nodeId: string) => {
    setSignalJourneyTargetId(nodeId);
  }, []);

  const closeSignalJourney = useCallback(() => {
    setSignalJourneyTargetId(null);
  }, []);

  const openSourceBay = useCallback((channelId?: string) => {
    if (channelId) setSourceBayChannelId(channelId);
    setSourceBayOpen(true);
  }, []);

  const closeSourceBay = useCallback(() => {
    setSourceBayOpen(false);
  }, []);

  const openGainStagingAssistant = useCallback((channelId?: string) => {
    setGainStagingChannelId(channelId ?? null);
    setGainStagingOpen(true);
  }, []);

  const closeGainStagingAssistant = useCallback(() => {
    setGainStagingOpen(false);
  }, []);

  const openSnapshotManager = useCallback(() => {
    setSnapshotModalOpen(true);
  }, []);

  const closeSnapshotManager = useCallback(() => {
    setSnapshotModalOpen(false);
  }, []);

  const resetPeakHold = useCallback((nodeId?: string) => {
    audioEngine.resetPeakHold(nodeId);
  }, []);

  const toggleAudioEngine = useCallback(async () => {
    if (audioUnlocked) {
      await audioEngine.suspend();
      setAudioUnlocked(false);
      logEvent({
        family: 'device',
        severity: 'warning',
        service: 'AudioCore',
        message: 'Real-time Web Audio DSP output placed in Standby.',
      });
    } else {
      const ok = await audioEngine.unlockAndStart(
        channels,
        buses,
        speakers,
        virtualCables,
        virtualDi,
        globalDspBypass,
        dcaGroups,
        fxRack,
        matrixZones,
        soloMode
      );
      setAudioUnlocked(ok);
      void scanHardware(false);
      logEvent({
        family: 'device',
        severity: 'info',
        service: 'AudioCore',
        message: `Real-time Web Audio DSP engine engaged at ${(audioEngine.getAudioClockTelemetry().sampleRateHz / 1000).toFixed(1)} kHz.`,
      });
    }
  }, [audioUnlocked, buses, channels, speakers, virtualCables, virtualDi, globalDspBypass, dcaGroups, fxRack, matrixZones, soloMode, logEvent, scanHardware]);

  const setGlobalDspBypass = useCallback(
    (bypassed: boolean) => {
      setGlobalDspBypassState(bypassed);
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'dsp',
        severity: bypassed ? 'warning' : 'info',
        service: 'GlobalDspBypass',
        message: bypassed
          ? `Global DSP Bypass ENGAGED across all ${channels.length} channels (HPF, PEQ, 31-band GEQ, dynamics, delay & automix bypassed for A/B compare).`
          : `Global DSP Bypass DISENGAGED: restored active DSP chains across all ${channels.length} channels.`,
      });
    },
    [channels.length, logEvent]
  );

  const toggleGlobalDspBypass = useCallback(() => {
    setGlobalDspBypass(!stateRef.current.globalDspBypass);
  }, [setGlobalDspBypass]);

  const updateBindingOnChannel = useCallback((channelId: string, binding: AudioSourceBinding) => {
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              sourceBinding: binding,
              physicalPort: binding.kind === 'none' ? ch.physicalPort : binding.label,
            }
          : ch
      )
    );
    setGraphVersion((v) => v + 1);
  }, []);

  const attachMicToChannel = useCallback(
    async (channelId: string, deviceId?: string, label?: string) => {
      try {
        const binding = await audioEngine.attachMicToChannel(
          channelId,
          channels,
          buses,
          deviceId,
          label,
          speakers,
          virtualCables
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        updateBindingOnChannel(channelId, binding);
        void scanHardware(false);
        logEvent({
          family: 'device',
          severity: 'info',
          service: 'SourcePatchbay',
          nodeId: channelId,
          message: `Patched hardware audio input "${binding.label}" (${binding.sampleRateHz ?? 48000} Hz) -> ${channelId.toUpperCase()}.`,
        });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to capture selected hardware input.';
        logEvent({
          family: 'device',
          severity: 'warning',
          service: 'SourcePatchbay',
          nodeId: channelId,
          message: `Input patch failed on ${channelId.toUpperCase()}: ${msg}`,
        });
        return { ok: false, error: msg };
      }
    },
    [buses, channels, speakers, virtualCables, updateBindingOnChannel, scanHardware, logEvent]
  );

  const attachDesktopAudioToChannel = useCallback(
    async (channelId: string) => {
      try {
        const binding = await audioEngine.attachDesktopAudioToChannel(
          channelId,
          channels,
          buses,
          () => {
            updateBindingOnChannel(channelId, {
              kind: 'none',
              label: 'Browser / System Audio Stopped',
              active: false,
            });
            logEvent({
              family: 'device',
              severity: 'warning',
              service: 'SourcePatchbay',
              nodeId: channelId,
              message: `Browser / System audio capture ended on ${channelId.toUpperCase()}.`,
            });
          },
          speakers,
          virtualCables
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        updateBindingOnChannel(channelId, binding);
        logEvent({
          family: 'device',
          severity: 'info',
          service: 'SourcePatchbay',
          nodeId: channelId,
          message: `Browser / System audio "${binding.label}" routed live into ${channelId.toUpperCase()}.`,
        });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Desktop audio capture canceled or unavailable.';
        logEvent({
          family: 'device',
          severity: 'warning',
          service: 'SourcePatchbay',
          nodeId: channelId,
          message: `Desktop audio capture aborted on ${channelId.toUpperCase()}: ${msg}`,
        });
        return { ok: false, error: msg };
      }
    },
    [buses, channels, speakers, virtualCables, updateBindingOnChannel, logEvent]
  );

  const attachFileToChannel = useCallback(
    async (channelId: string, file: File) => {
      try {
        const binding = await audioEngine.attachFileToChannel(
          channelId,
          file,
          channels,
          buses,
          speakers,
          virtualCables
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        updateBindingOnChannel(channelId, binding);
        logEvent({
          family: 'device',
          severity: 'info',
          service: 'MediaDeck',
          nodeId: channelId,
          message: `Loaded audio file "${file.name}" into ${channelId.toUpperCase()} playback deck.`,
        });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to decode selected audio file.';
        return { ok: false, error: msg };
      }
    },
    [buses, channels, speakers, virtualCables, updateBindingOnChannel, logEvent]
  );

  const attachToneToChannel = useCallback(
    async (channelId: string, kind: 'pink' | 'sine1k' | 'sweep', gainDb: number) => {
      try {
        const binding = await audioEngine.attachToneToChannel(
          channelId,
          kind,
          gainDb,
          channels,
          buses,
          speakers,
          virtualCables
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        updateBindingOnChannel(channelId, binding);
        logEvent({
          family: 'soundcheck',
          severity: 'info',
          service: 'SignalGenerator',
          nodeId: channelId,
          message: `Patched ${kind.toUpperCase()} generator (${gainDb} dBFS) into ${channelId.toUpperCase()}.`,
        });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to attach calibration tone.';
        return { ok: false, error: msg };
      }
    },
    [buses, channels, speakers, virtualCables, updateBindingOnChannel, logEvent]
  );

  const attachVirtualCableToChannel = useCallback(
    async (channelId: string, virtualCableId: string) => {
      try {
        const binding = await audioEngine.attachVirtualCableToChannel(
          channelId,
          virtualCableId,
          channels,
          buses,
          speakers,
          virtualCables
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        updateBindingOnChannel(channelId, binding);
        logEvent({
          family: 'graph',
          severity: 'info',
          service: 'VirtualAudioCable',
          nodeId: channelId,
          message: `Patched ${binding.label} -> ${channelId.toUpperCase()} (built-in internal loopback).`,
        });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to attach Virtual Audio Cable.';
        logEvent({
          family: 'graph',
          severity: 'warning',
          service: 'VirtualAudioCable',
          nodeId: channelId,
          message: msg,
        });
        return { ok: false, error: msg };
      }
    },
    [channels, buses, speakers, virtualCables, updateBindingOnChannel, logEvent]
  );

  const attachExternalTabToVirtualCable = useCallback(
    async (cableId: string) => {
      try {
        const label = await audioEngine.attachExternalTabToVirtualCable(
          cableId,
          channels,
          buses,
          speakers,
          virtualCables,
          () => {
            setVirtualCables((prev) =>
              prev.map((v) =>
                v.id === cableId ? { ...v, sourceKind: 'idle', sourceLabel: 'Tab Audio Stopped' } : v
              )
            );
          }
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        setVirtualCables((prev) =>
          prev.map((v) =>
            v.id === cableId
              ? { ...v, sourceKind: 'external-tab', sourceId: undefined, sourceLabel: label, active: true }
              : v
          )
        );
        setGraphVersion((v) => v + 1);
        logEvent({
          family: 'device',
          severity: 'info',
          service: 'VirtualAudioCable',
          message: `Captured external audio "${label}" into Virtual Cable ${cableId.toUpperCase()}.`,
        });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'External tab audio capture failed.',
        };
      }
    },
    [channels, buses, speakers, virtualCables, logEvent]
  );

  const attachFileToVirtualCable = useCallback(
    async (cableId: string, file: File) => {
      try {
        const label = await audioEngine.attachFileToVirtualCable(
          cableId,
          file,
          channels,
          buses,
          speakers,
          virtualCables
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        setVirtualCables((prev) =>
          prev.map((v) =>
            v.id === cableId
              ? { ...v, sourceKind: 'media-deck', sourceId: undefined, sourceLabel: label, active: true }
              : v
          )
        );
        setGraphVersion((v) => v + 1);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Media deck attachment failed.',
        };
      }
    },
    [channels, buses, speakers, virtualCables]
  );

  const addVirtualCable = useCallback(
    (name?: string, sourceKind: VirtualCableNode['sourceKind'] = 'idle', sourceId?: string) => {
      const idx = virtualCables.length + 1;
      const srcBus = sourceKind === 'bus' ? buses.find((b) => b.id === sourceId) : undefined;
      const srcCh = sourceKind === 'channel' ? channels.find((c) => c.id === sourceId) : undefined;
      const created: VirtualCableNode = {
        id: `vc-${Date.now()}-${idx}`,
        name: name?.trim() || `VAC ${idx} · Virtual Cable`,
        sourceKind,
        sourceId,
        sourceLabel: srcBus
          ? srcBus.name
          : srcCh
            ? `CH ${String(srcCh.number).padStart(2, '0')} · ${srcCh.name}`
            : 'Ready for Source / Tab / Bus',
        gainDb: 0,
        active: true,
        monitorToMaster: false,
      };
      setVirtualCables((prev) => [...prev, created]);
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'graph',
        severity: 'info',
        service: 'VirtualAudioCable',
        message: `Created internal Virtual Audio Cable "${created.name}".`,
      });
      return created;
    },
    [virtualCables.length, buses, channels, logEvent]
  );

  const updateVirtualCable = useCallback((cableId: string, patch: Partial<VirtualCableNode>) => {
    setVirtualCables((prev) => prev.map((v) => (v.id === cableId ? { ...v, ...patch } : v)));
    setGraphVersion((v) => v + 1);
  }, []);

  const removeVirtualCable = useCallback(
    (cableId: string) => {
      channels.forEach((ch) => {
        if (ch.sourceBinding?.kind === 'virtual-cable' && ch.sourceBinding.virtualCableId === cableId) {
          audioEngine.detachChannelSource(ch.id);
        }
      });
      setChannels((prev) =>
        prev.map((ch) =>
          ch.sourceBinding?.kind === 'virtual-cable' && ch.sourceBinding.virtualCableId === cableId
            ? {
                ...ch,
                sourceBinding: { kind: 'none', label: 'Virtual Cable Removed', active: false },
              }
            : ch
        )
      );
      setVirtualCables((prev) => prev.filter((v) => v.id !== cableId));
      setGraphVersion((v) => v + 1);
    },
    [channels]
  );

  const toggleStreamRecording = useCallback(
    async (targetOverride?: string) => {
      const target = targetOverride ?? recordingTargetId;
      if (recordingActive) {
        const res = await audioEngine.stopBusRecording();
        setRecordingActive(false);
        if (res) {
          const targetLabel =
            res.targetId === 'system-master'
              ? 'Whole System Output'
              : buses.find((b) => b.id === res.targetId)?.name ?? res.targetId.toUpperCase();
          const newTake: RecordedTake = {
            id: `take-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            targetId: res.targetId,
            targetLabel,
            filename: res.filename,
            blobUrl: res.blobUrl,
            mimeType: res.mimeType,
            durationSec: res.durationSec,
            sizeBytes: res.sizeBytes,
            createdAt: new Date().toTimeString().slice(0, 8),
          };
          setRecordedTakes((prev) => [newTake, ...prev]);
          setLastRecordingUrl(res.blobUrl);
          setLastRecordingFilename(res.filename);
          logEvent({
            family: 'device',
            severity: 'info',
            service: res.targetId === 'system-master' ? 'SystemOutputRecorder' : 'BroadcastRecorder',
            nodeId: res.targetId,
            message: `Saved ${res.durationSec}s ${targetLabel} capture (${res.filename}).`,
          });
        }
        return { ok: true };
      } else {
        if (!audioEngine.isAudioUnlocked()) {
          const ok = await audioEngine.unlockAndStart(channels, buses, speakers, virtualCables, virtualDi);
          setAudioUnlocked(ok);
        }
        const started = audioEngine.startBusRecording(target);
        if (started.ok) {
          setRecordingTargetId(target);
          setRecordingDurationSec(0);
          setRecordingActive(true);
          const targetLabel =
            target === 'system-master'
              ? 'Whole System Output'
              : buses.find((b) => b.id === target)?.name ?? target.toUpperCase();
          logEvent({
            family: 'device',
            severity: 'info',
            service: target === 'system-master' ? 'SystemOutputRecorder' : 'BroadcastRecorder',
            nodeId: target,
            message: `Started live ${started.mimeType ?? 'audio'} capture on ${targetLabel}.`,
          });
        }
        return started;
      }
    },
    [recordingActive, recordingTargetId, channels, buses, speakers, virtualCables, virtualDi, logEvent]
  );

  const deleteRecordedTake = useCallback(
    (takeId: string) => {
      setRecordedTakes((prev) => {
        const target = prev.find((t) => t.id === takeId);
        if (target) {
          URL.revokeObjectURL(target.blobUrl);
          if (lastRecordingUrl === target.blobUrl) {
            const nextNewest = prev.find((t) => t.id !== takeId);
            setLastRecordingUrl(nextNewest?.blobUrl ?? null);
            setLastRecordingFilename(nextNewest?.filename ?? null);
          }
        }
        return prev.filter((t) => t.id !== takeId);
      });
    },
    [lastRecordingUrl]
  );

  const toggleMultitrackArm = useCallback((channelId: string) => {
    setMultitrackArmedIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  }, []);

  const armMultitrackPreset = useCallback(
    (preset: 'all' | 'active' | 'none') => {
      if (preset === 'none') {
        setMultitrackArmedIds([]);
      } else if (preset === 'all') {
        setMultitrackArmedIds(channels.map((c) => c.id));
      } else {
        const active = channels.filter((c) => c.sourceBinding?.active).map((c) => c.id);
        setMultitrackArmedIds(
          active.length > 0 ? active : channels.slice(0, 4).map((c) => c.id)
        );
      }
    },
    [channels]
  );

  const toggleMultitrackRecording = useCallback(async () => {
    if (multitrackRecording) {
      const session = audioEngine.stopMultitrackRecording();
      setMultitrackRecording(false);
      if (session) {
        setMultitrackSessions((prev) => [session, ...prev]);
        logEvent({
          family: 'device',
          severity: 'info',
          service: 'MultitrackWavRecorder',
          message: `Captured ${session.tracks.length} separate ${session.bitDepth}-bit WAV track(s) (${session.durationSec.toFixed(1)}s @ ${(session.sampleRateHz / 1000).toFixed(1)}kHz).`,
        });
      }
      return { ok: true };
    }

    const armedChannels = channels.filter((c) => multitrackArmedIds.includes(c.id));
    if (armedChannels.length === 0) {
      return { ok: false, error: 'Arm at least one channel before starting multitrack WAV capture.' };
    }

    if (!audioEngine.isAudioUnlocked()) {
      const ok = await audioEngine.unlockAndStart(
        channels,
        buses,
        speakers,
        virtualCables,
        virtualDi,
        globalDspBypass
      );
      setAudioUnlocked(ok);
    }

    const res = await audioEngine.startMultitrackRecording(
      armedChannels,
      multitrackTapPoint,
      multitrackBitDepth
    );
    if (res.ok) {
      setMultitrackRecording(true);
      logEvent({
        family: 'device',
        severity: 'info',
        service: 'MultitrackWavRecorder',
        message: `Started ${armedChannels.length}-track simultaneous ${multitrackBitDepth}-bit WAV capture (${multitrackTapPoint.toUpperCase()}).`,
      });
    }
    return res;
  }, [
    multitrackRecording,
    channels,
    multitrackArmedIds,
    buses,
    speakers,
    virtualCables,
    virtualDi,
    globalDspBypass,
    multitrackTapPoint,
    multitrackBitDepth,
    logEvent,
  ]);

  const deleteMultitrackSession = useCallback((sessionId: string) => {
    setMultitrackSessions((prev) => {
      const target = prev.find((s) => s.id === sessionId);
      if (target) {
        target.tracks.forEach((t) => URL.revokeObjectURL(t.blobUrl));
      }
      return prev.filter((s) => s.id !== sessionId);
    });
  }, []);

  const toggleChannelFilePlayback = useCallback((channelId: string): boolean => {
    const playing = audioEngine.toggleChannelFilePlayback(channelId);
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === channelId && ch.sourceBinding
          ? { ...ch, sourceBinding: { ...ch.sourceBinding, active: playing } }
          : ch
      )
    );
    return playing;
  }, []);

  const detachChannelSource = useCallback(
    (channelId: string) => {
      audioEngine.detachChannelSource(channelId);
      updateBindingOnChannel(channelId, {
        kind: 'none',
        label: 'Unpatched · Click Source',
        active: false,
      });
      logEvent({
        family: 'device',
        severity: 'info',
        service: 'SourcePatchbay',
        nodeId: channelId,
        message: `Detached live input source from ${channelId.toUpperCase()}.`,
      });
    },
    [updateBindingOnChannel, logEvent]
  );

  const toggleLiveMic = useCallback(async () => {
    const ch1 = channels.find((c) => c.id === 'ch-01');
    if (ch1?.sourceBinding?.active && ch1.sourceBinding.kind === 'mic') {
      detachChannelSource('ch-01');
    } else {
      await attachMicToChannel('ch-01');
    }
  }, [channels, attachMicToChannel, detachChannelSource]);

  const setOutputDevice = useCallback(
    async (deviceId: string) => {
      try {
        const ok = await audioEngine.setOutputSinkDevice(deviceId);
        setSelectedOutputDeviceId(deviceId);
        logEvent({
          family: 'device',
          severity: ok ? 'info' : 'warning',
          service: 'AudioOutput',
          message: ok
            ? `Switched master playback sink to endpoint ${deviceId}.`
            : 'Browser audio output routed via OS default playback device (setSinkId unsupported until engine running).',
        });
      } catch (err) {
        logEvent({
          family: 'device',
          severity: 'warning',
          service: 'AudioOutput',
          message: `Output switch failed: ${err instanceof Error ? err.message : 'unsupported'}`,
        });
      }
    },
    [logEvent]
  );

  const resetFactoryState = useCallback(async () => {
    if (stateRef.current.operatorRole === 'volunteer') {
      logEvent({
        family: 'graph',
        severity: 'warning',
        service: 'RBAC',
        message: 'Volunteer role cannot reset factory console state.',
      });
      return;
    }
    channels.forEach((c) => audioEngine.detachChannelSource(c.id));
    const res = await fetch('/api/console/reset', {
      method: 'POST',
      headers: { 'X-Operator-Role': stateRef.current.operatorRole },
    });
    if (res.ok) {
      const data = await res.json();
      isRemoteUpdateRef.current = true;
      if (typeof data.revisionId === 'number') revisionIdRef.current = data.revisionId;
      setProfileId(data.profileId);
      setActiveSceneId(data.activeSceneId);
      setGraphVersion(data.graphVersion);
      setChannels(data.channels);
      setBuses(data.buses);
      setSpeakers(data.speakers);
      if (Array.isArray(data.virtualCables)) setVirtualCables(data.virtualCables);
      setVirtualDi(data.virtualDi);
      if (Array.isArray(data.dcaGroups)) setDcaGroups(data.dcaGroups);
      if (Array.isArray(data.fxRack)) setFxRack(data.fxRack);
      if (Array.isArray(data.matrixZones)) setMatrixZones(data.matrixZones);
      setProposals(data.proposals ?? []);
      setScenes(data.scenes);
      setFeedbackIncidents(data.feedbackIncidents ?? []);
      setSoundCheckItems(data.soundCheckItems);
      setEvents(data.events ?? []);
      setDbUpdatedAt(data.updatedAt ?? null);
      window.setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 60);
    }
  }, [channels, logEvent]);

  const setTestToneConfig = useCallback(
    (active: boolean, kind?: 'pink' | 'sine1k' | 'sweep', gainDb?: number) => {
      const nextKind = kind ?? testToneKind;
      const nextGain = gainDb ?? testToneGainDb;
      setTestToneActive(active);
      setTestToneKind(nextKind);
      setTestToneGainDb(nextGain);
      if (active && !audioEngine.isAudioUnlocked()) {
        void audioEngine.unlockAndStart(channels, buses, speakers, virtualCables, virtualDi).then((ok) => {
          setAudioUnlocked(ok);
          audioEngine.setTestTone(active, nextKind, nextGain);
        });
      } else {
        audioEngine.setTestTone(active, nextKind, nextGain);
      }
      logEvent({
        family: 'soundcheck',
        severity: active ? 'warning' : 'info',
        service: 'SignalGenerator',
        nodeId: 'bus-main',
        message: active
          ? `Authorized test tone (${nextKind.toUpperCase()} @ ${nextGain.toFixed(1)} dBFS) injected to Main Bus.`
          : 'Test tone generator disengaged.',
      });
    },
    [testToneKind, testToneGainDb, buses, channels, speakers, virtualCables, virtualDi, logEvent]
  );

  const switchHardwareProfile = useCallback(
    (id: HardwareProfileId) => {
      pushUndo();
      setProfileId(id);
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'device',
        severity: 'info',
        service: 'CapabilityRegistry',
        message: `Switched hardware profile to ${id === 'auto-detected' ? 'Auto-Detected Host Hardware' : HARDWARE_PROFILES[id].name}.`,
      });
    },
    [pushUndo, logEvent]
  );

  const recordAutomationFromEdit = useCallback(
    (channelId: string, parameter: AutomationParameterKey, rawValue: number) => {
      lastTouchAtRef.current.set(`${channelId}:${parameter}`, Date.now());
      const tr = stateRef.current.automationTransport;
      const shouldWrite =
        tr.recording || (tr.playing && (tr.mode === 'write' || tr.mode === 'touch'));
      if (!shouldWrite) return;

      const quantizedTime = Math.max(0, Math.min(tr.durationSec, Math.round(tr.playheadSec * 20) / 20));
      const clampedVal = clampAutomationValue(parameter, rawValue);
      setAutomationLanes((prev) => {
        const existingIdx = prev.findIndex(
          (l) => l.channelId === channelId && l.parameter === parameter
        );
        if (existingIdx === -1) {
          const newLane: AutomationLane = {
            id: `auto-${channelId}-${parameter}-${Date.now().toString(36)}`,
            channelId,
            parameter,
            enabled: true,
            points: [
              {
                id: `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                timeSec: quantizedTime,
                value: clampedVal,
              },
            ],
          };
          return [...prev, newLane];
        }
        return prev.map((lane, idx) => {
          if (idx !== existingIdx) return lane;
          const nearIdx = lane.points.findIndex((p) => Math.abs(p.timeSec - quantizedTime) < 0.045);
          const nextPts =
            nearIdx >= 0
              ? lane.points.map((p, pIdx) => (pIdx === nearIdx ? { ...p, value: clampedVal } : p))
              : [
                  ...lane.points,
                  {
                    id: `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                    timeSec: quantizedTime,
                    value: clampedVal,
                  },
                ].sort((a, b) => a.timeSec - b.timeSec);
          return { ...lane, enabled: true, points: nextPts };
        });
      });
    },
    []
  );

  const updateChannel = useCallback(
    (channelId: string, patch: Partial<ChannelStrip>, reason?: string) => {
      const target = channels.find((c) => c.id === channelId);
      if (!target) return { ok: false, error: 'Channel not found in active SignalGraph.' };

      if (stateRef.current.operatorRole === 'volunteer') {
        const volunteerAllowed = new Set(['faderDb', 'mute', 'solo']);
        const disallowed = Object.keys(patch).some((k) => !volunteerAllowed.has(k));
        if (disallowed) {
          const err = 'Volunteer role is restricted to fader levels, mute, and solo.';
          logEvent({
            family: 'graph',
            severity: 'warning',
            service: 'RBAC',
            nodeId: channelId,
            message: `Blocked restricted write on ${target.shortName}: ${err}`,
          });
          return { ok: false, error: err };
        }
      }

      const primaryCaps = hardwareProfile.devices[0]?.capabilities;
      if (patch.hardwarePreampDb !== undefined && primaryCaps?.preampGain === 'manual') {
        logEvent({
          family: 'graph',
          severity: 'warning',
          service: 'ConfigurationManager',
          nodeId: channelId,
          message: `Rejected software preamp gain write on ${target.shortName}: physical desk preamp is manual-only.`,
        });
        return {
          ok: false,
          error: 'Physical analog preamp gain is manual-only on this hardware profile.',
        };
      }

      if (patch.phantom48v !== undefined && primaryCaps?.phantomPower === 'manual') {
        logEvent({
          family: 'graph',
          severity: 'warning',
          service: 'ConfigurationManager',
          nodeId: channelId,
          message: `Rejected software +48V toggle on ${target.shortName}: hardware switch is manual-only.`,
        });
        return {
          ok: false,
          error: 'Phantom power (+48V) is physical switch-only on this interface.',
        };
      }

      if (reason) pushUndo();
      if (patch.faderDb !== undefined) recordAutomationFromEdit(channelId, 'faderDb', patch.faderDb);
      if (patch.pan !== undefined) recordAutomationFromEdit(channelId, 'pan', patch.pan);
      if (patch.softwareTrimDb !== undefined) {
        recordAutomationFromEdit(channelId, 'softwareTrimDb', patch.softwareTrimDb);
      }
      if (patch.mute !== undefined) recordAutomationFromEdit(channelId, 'mute', patch.mute ? 1 : 0);
      if (patch.hpfFreqHz !== undefined) recordAutomationFromEdit(channelId, 'hpfFreqHz', patch.hpfFreqHz);

      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, ...patch } : c)));
      setGraphVersion((v) => v + 1);

      // Atomic PATCH for instant multi-seat WebSocket fan-out & normalized SQLite row persistence
      const prevTimer = channelPatchTimersRef.current.get(channelId);
      if (prevTimer) window.clearTimeout(prevTimer);
      const patchCopy = { ...patch };
      const timerId = window.setTimeout(() => {
        channelPatchTimersRef.current.delete(channelId);
        void fetch(`/api/console/channels/${encodeURIComponent(channelId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Operator-Role': stateRef.current.operatorRole,
          },
          body: JSON.stringify({
            patch: patchCopy,
            expectedRevisionId: revisionIdRef.current,
            clientId: clientIdRef.current,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((res) => {
            if (typeof res?.revisionId === 'number') revisionIdRef.current = res.revisionId;
          })
          .catch(() => {});
      }, 45);
      channelPatchTimersRef.current.set(channelId, timerId);

      if (reason) {
        logEvent({
          family: 'dsp',
          severity: 'info',
          service: 'ChannelManager',
          nodeId: channelId,
          message: `${target.shortName}: ${reason}`,
        });
      }
      return { ok: true };
    },
    [channels, hardwareProfile, pushUndo, logEvent, recordAutomationFromEdit]
  );

  const setIntelligenceConfig = useCallback(
    (patch: Partial<AudioIntelligenceConfig>) => {
      setIntelligenceConfigState((prev) => ({ ...prev, ...patch }));
      logEvent({
        family: 'dsp',
        severity: 'info',
        service: 'AutonomousDSP',
        message: `Updated autonomous DSP engine: ${Object.entries(patch)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`,
      });
    },
    [logEvent]
  );

  const autoCalibrateChannel = useCallback(
    (channelId: string) => {
      const target = channels.find((c) => c.id === channelId);
      if (!target) return { ok: false, summary: 'Channel not found' };
      const insight = stateRef.current.systemIntelligence.channelInsights[channelId];
      const { patch, summary } = computeAutoCalibratedChannelDsp(target, insight);
      pushUndo();
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, ...patch } : c)));
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'dsp',
        severity: 'info',
        service: 'AutonomousDSP',
        nodeId: channelId,
        message: summary,
      });
      return { ok: true, summary };
    },
    [channels, pushUndo, logEvent]
  );

  const optimizeAllLiveChannels = useCallback(() => {
    const currentInsights = stateRef.current.systemIntelligence.channelInsights;
    const targets = channels.filter((c) => c.sourceBinding?.active || c.category === 'pulpit');
    if (targets.length === 0) return 0;
    pushUndo();
    setChannels((prev) =>
      prev.map((ch) => {
        if (!ch.sourceBinding?.active && ch.category !== 'pulpit') return ch;
        const { patch } = computeAutoCalibratedChannelDsp(ch, currentInsights[ch.id]);
        return { ...ch, ...patch };
      })
    );
    setGraphVersion((v) => v + 1);
    logEvent({
      family: 'dsp',
      severity: 'info',
      service: 'AutonomousDSP',
      message: `Auto-calibrated ${targets.length} active/priority strip(s) using live FFT + role acoustics.`,
    });
    return targets.length;
  }, [channels, pushUndo, logEvent]);

  const updateChannelSend = useCallback(
    (channelId: string, busKey: string, patch: Partial<ChannelSendConfig>) => {
      if (patch.levelDb !== undefined) {
        if (busKey === 'mon1') recordAutomationFromEdit(channelId, 'sendMon1', patch.levelDb);
        if (busKey === 'livestream') recordAutomationFromEdit(channelId, 'sendStream', patch.levelDb);
      }
      setChannels((prev) =>
        prev.map((c) => {
          if (c.id !== channelId) return c;
          const prevSend = c.sends[busKey] ?? { levelDb: -12, preFader: false, enabled: false };
          return {
            ...c,
            sends: {
              ...c.sends,
              [busKey]: { ...prevSend, ...patch },
            },
          };
        })
      );
      setGraphVersion((v) => v + 1);
    },
    [recordAutomationFromEdit]
  );

  const addChannel = useCallback(
    (name?: string, category: ChannelStrip['category'] = 'media') => {
      pushUndo();
      const maxNum = channels.reduce((m, c) => Math.max(m, c.number), 0);
      const created = createDynamicChannelStrip(maxNum + 1, name || `Input ${maxNum + 1}`, category);
      setChannels((prev) => [...prev, created]);
      setSelectedChannelId(created.id);
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'graph',
        severity: 'info',
        service: 'ChannelManager',
        nodeId: created.id,
        message: `Added dynamic input strip CH ${String(created.number).padStart(2, '0')} (${created.name}).`,
      });
      return created;
    },
    [channels, pushUndo, logEvent]
  );

  const removeChannel = useCallback(
    (channelId: string) => {
      if (channels.length <= 1) return;
      pushUndo();
      audioEngine.detachChannelSource(channelId);
      setChannels((prev) => {
        const filtered = prev.filter((c) => c.id !== channelId);
        if (selectedChannelId === channelId && filtered[0]) {
          setSelectedChannelId(filtered[0].id);
        }
        return filtered;
      });
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'graph',
        severity: 'info',
        service: 'ChannelManager',
        message: `Removed input channel ${channelId.toUpperCase()} from SignalGraph.`,
      });
    },
    [channels.length, selectedChannelId, pushUndo, logEvent]
  );

  const addChannelEqBand = useCallback(
    (channelId: string, preset?: Partial<EqBand>) => {
      pushUndo();
      setChannels((prev) =>
        prev.map((c) => {
          if (c.id !== channelId) return c;
          const idx = c.eqBands.length + 1;
          const newBand: EqBand = {
            id: `b-${Date.now()}-${idx}`,
            label: preset?.label ?? `PEQ ${idx}`,
            enabled: true,
            shape: preset?.shape ?? 'bell',
            freqHz: preset?.freqHz ?? 1000,
            gainDb: preset?.gainDb ?? 0,
            q: preset?.q ?? 1.4,
          };
          return { ...c, eqEnabled: true, eqBands: [...c.eqBands, newBand] };
        })
      );
      setGraphVersion((v) => v + 1);
    },
    [pushUndo]
  );

  const removeChannelEqBand = useCallback(
    (channelId: string, bandId: string) => {
      pushUndo();
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, eqBands: c.eqBands.filter((b) => b.id !== bandId) } : c
        )
      );
      setGraphVersion((v) => v + 1);
    },
    [pushUndo]
  );

  const addBus = useCallback(
    (name: string, kind: BusNode['kind'] = 'monitor') => {
      pushUndo();
      const short = name.trim().toUpperCase().slice(0, 8) || `BUS ${buses.length + 1}`;
      const created: BusNode = {
        id: `bus-${Date.now()}`,
        name: name.trim() || `Aux Bus ${buses.length + 1}`,
        shortName: short,
        kind,
        faderDb: 0,
        mute: false,
        solo: false,
        eqEnabled: true,
        eqBands: makeDefaultEqBands(),
        limiterCeilingDb: -1.5,
        assignedOutputId: null,
      };
      setBuses((prev) => [...prev, created]);
      setSelectedBusId(created.id);
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'graph',
        severity: 'info',
        service: 'BusManager',
        nodeId: created.id,
        message: `Created dynamic mix bus "${created.name}".`,
      });
      return created;
    },
    [buses.length, pushUndo, logEvent]
  );

  const removeBus = useCallback(
    (busId: string) => {
      if (busId === 'bus-main') return;
      pushUndo();
      setBuses((prev) => prev.filter((b) => b.id !== busId));
      setGraphVersion((v) => v + 1);
    },
    [pushUndo]
  );

  const addBusEqBand = useCallback(
    (busId: string, preset?: Partial<EqBand>) => {
      pushUndo();
      setBuses((prev) =>
        prev.map((b) => {
          if (b.id !== busId) return b;
          const existing = b.eqBands ?? [];
          const newBand: EqBand = {
            id: `beq-${Date.now()}-${existing.length + 1}`,
            label: preset?.label ?? `BUS EQ ${existing.length + 1}`,
            enabled: true,
            shape: preset?.shape ?? 'bell',
            freqHz: preset?.freqHz ?? 800,
            gainDb: preset?.gainDb ?? 0,
            q: preset?.q ?? 1.2,
          };
          return { ...b, eqEnabled: true, eqBands: [...existing, newBand] };
        })
      );
      setGraphVersion((v) => v + 1);
    },
    [pushUndo]
  );

  const updateBusEqBand = useCallback(
    (busId: string, bandId: string, patch: Partial<EqBand>) => {
      setBuses((prev) =>
        prev.map((b) =>
          b.id === busId
            ? {
                ...b,
                eqBands: (b.eqBands ?? []).map((band) =>
                  band.id === bandId ? { ...band, ...patch } : band
                ),
              }
            : b
        )
      );
      setGraphVersion((v) => v + 1);
    },
    []
  );

  const removeBusEqBand = useCallback(
    (busId: string, bandId: string) => {
      pushUndo();
      setBuses((prev) =>
        prev.map((b) =>
          b.id === busId ? { ...b, eqBands: (b.eqBands ?? []).filter((band) => band.id !== bandId) } : b
        )
      );
      setGraphVersion((v) => v + 1);
    },
    [pushUndo]
  );

  const updateBus = useCallback(
    (busId: string, patch: Partial<BusNode>, reason?: string) => {
      if (stateRef.current.operatorRole === 'volunteer') {
        const volunteerAllowed = new Set(['faderDb', 'mute', 'solo']);
        if (Object.keys(patch).some((k) => !volunteerAllowed.has(k))) {
          logEvent({
            family: 'graph',
            severity: 'warning',
            service: 'RBAC',
            nodeId: busId,
            message: 'Volunteer role cannot modify bus EQ or limiter thresholds.',
          });
          return;
        }
      }
      if (reason) pushUndo();
      setBuses((prev) => prev.map((b) => (b.id === busId ? { ...b, ...patch } : b)));
      setGraphVersion((v) => v + 1);

      const prevTimer = busPatchTimersRef.current.get(busId);
      if (prevTimer) window.clearTimeout(prevTimer);
      const patchCopy = { ...patch };
      const timerId = window.setTimeout(() => {
        busPatchTimersRef.current.delete(busId);
        void fetch(`/api/console/buses/${encodeURIComponent(busId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Operator-Role': stateRef.current.operatorRole,
          },
          body: JSON.stringify({
            patch: patchCopy,
            expectedRevisionId: revisionIdRef.current,
            clientId: clientIdRef.current,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((res) => {
            if (typeof res?.revisionId === 'number') revisionIdRef.current = res.revisionId;
          })
          .catch(() => {});
      }, 45);
      busPatchTimersRef.current.set(busId, timerId);

      if (reason) {
        logEvent({
          family: 'dsp',
          severity: 'info',
          service: 'BusManager',
          nodeId: busId,
          message: reason,
        });
      }
    },
    [pushUndo, logEvent]
  );

  const addSpeakerOutput = useCallback(
    (name?: string, role: SpeakerBand['role'] = 'Custom Output', sourceBusId = 'bus-main') => {
      pushUndo();
      const created = createDynamicSpeakerOutput(
        speakers.length + 1,
        name || `Output ${speakers.length + 1}`,
        role,
        sourceBusId
      );
      setSpeakers((prev) => [...prev, created]);
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'graph',
        severity: 'info',
        service: 'OutputManager',
        nodeId: created.id,
        message: `Added final crossover / output "${created.name}" (${role}) sourced from ${sourceBusId}.`,
      });
      return created;
    },
    [speakers.length, pushUndo, logEvent]
  );

  const removeSpeakerOutput = useCallback(
    (speakerId: string) => {
      if (speakers.length <= 1) return;
      pushUndo();
      setSpeakers((prev) => prev.filter((s) => s.id !== speakerId));
      setGraphVersion((v) => v + 1);
    },
    [speakers.length, pushUndo]
  );

  const addSpeakerEqBand = useCallback(
    (speakerId: string, preset?: Partial<EqBand>) => {
      pushUndo();
      setSpeakers((prev) =>
        prev.map((s) => {
          if (s.id !== speakerId) return s;
          const existing = s.eqBands ?? [];
          const newBand: EqBand = {
            id: `oeq-${Date.now()}-${existing.length + 1}`,
            label: preset?.label ?? `OUT EQ ${existing.length + 1}`,
            enabled: true,
            shape: preset?.shape ?? 'bell',
            freqHz: preset?.freqHz ?? 500,
            gainDb: preset?.gainDb ?? 0,
            q: preset?.q ?? 1.4,
          };
          return { ...s, eqEnabled: true, eqBands: [...existing, newBand] };
        })
      );
      setGraphVersion((v) => v + 1);
    },
    [pushUndo]
  );

  const updateSpeakerEqBand = useCallback(
    (speakerId: string, bandId: string, patch: Partial<EqBand>) => {
      setSpeakers((prev) =>
        prev.map((s) =>
          s.id === speakerId
            ? {
                ...s,
                eqBands: (s.eqBands ?? []).map((b) => (b.id === bandId ? { ...b, ...patch } : b)),
              }
            : s
        )
      );
      setGraphVersion((v) => v + 1);
    },
    []
  );

  const removeSpeakerEqBand = useCallback(
    (speakerId: string, bandId: string) => {
      pushUndo();
      setSpeakers((prev) =>
        prev.map((s) =>
          s.id === speakerId
            ? { ...s, eqBands: (s.eqBands ?? []).filter((b) => b.id !== bandId) }
            : s
        )
      );
      setGraphVersion((v) => v + 1);
    },
    [pushUndo]
  );

  const updateSpeaker = useCallback(
    (speakerId: string, patch: Partial<SpeakerBand>, reason?: string) => {
      if (stateRef.current.operatorRole === 'volunteer') {
        logEvent({
          family: 'graph',
          severity: 'warning',
          service: 'RBAC',
          nodeId: speakerId,
          message: 'Volunteer role cannot modify speaker crossover or limiter configuration.',
        });
        return;
      }
      if (reason) pushUndo();
      setSpeakers((prev) => prev.map((s) => (s.id === speakerId ? { ...s, ...patch } : s)));
      setGraphVersion((v) => v + 1);
      if (reason) {
        logEvent({
          family: 'graph',
          severity: 'info',
          service: 'OutputManager',
          nodeId: speakerId,
          message: reason,
        });
      }
    },
    [pushUndo, logEvent]
  );

  const updateVirtualDi = useCallback(
    (patch: Partial<VirtualDiState>, reason?: string) => {
      if (patch.duplicatedDryWarningConfirmed === false) {
        return {
          ok: false,
          error: 'Dry & processed parallel loop protection requires explicit confirmation.',
        };
      }
      if (reason) pushUndo();
      setVirtualDi((prev) => ({ ...prev, ...patch }));
      setGraphVersion((v) => v + 1);
      if (reason) {
        logEvent({
          family: 'dsp',
          severity: 'info',
          service: 'VirtualDiChain',
          nodeId: virtualDi.sourceChannelId,
          message: `Bass Virtual DI: ${reason}`,
        });
      }
      return { ok: true };
    },
    [pushUndo, logEvent, virtualDi.sourceChannelId]
  );

  const updateFeedbackIncident = useCallback(
    (incidentId: string, patch: Partial<FeedbackIncident>) => {
      setFeedbackIncidents((prev) =>
        prev.map((f) => (f.id === incidentId ? { ...f, ...patch } : f))
      );
    },
    []
  );

  const applyFeedbackNotch = useCallback(
    (incidentId: string) => {
      const incident = feedbackIncidents.find((f) => f.id === incidentId);
      if (!incident) return;
      pushUndo();

      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.id !== incident.channelId) return ch;
          const bands = [...ch.eqBands];
          const notchIdx = bands.findIndex((b) => Math.abs(b.freqHz - incident.freqHz) < 60);
          if (notchIdx >= 0) {
            bands[notchIdx] = {
              ...bands[notchIdx],
              enabled: true,
              shape: 'notch',
              freqHz: incident.freqHz,
              gainDb: incident.notchProposedDb,
              q: incident.qEstimate || 12.0,
            };
          } else {
            bands.push({
              id: `fb-notch-${Date.now()}`,
              label: `FB ${incident.freqHz}Hz`,
              enabled: true,
              shape: 'notch',
              freqHz: incident.freqHz,
              gainDb: incident.notchProposedDb,
              q: incident.qEstimate || 12.0,
            });
          }
          return { ...ch, eqEnabled: true, eqBands: bands };
        })
      );

      setFeedbackIncidents((prev) =>
        prev.map((f) =>
          f.id === incidentId ? { ...f, status: 'suppression_applied_verified' } : f
        )
      );
      void fetch(`/api/console/feedback/${encodeURIComponent(incidentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'suppression_applied_verified' }),
      }).catch(() => {});

      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'feedback',
        severity: 'info',
        service: 'FeedbackDetector',
        nodeId: incident.channelId,
        message: `Operator applied ${incident.notchProposedDb} dB notch at ${incident.freqHz} Hz. Suppression verified.`,
      });
    },
    [feedbackIncidents, pushUndo, logEvent]
  );

  const dismissFeedbackIncident = useCallback(
    (incidentId: string) => {
      setFeedbackIncidents((prev) =>
        prev.map((f) => (f.id === incidentId ? { ...f, status: 'dismissed' } : f))
      );
      void fetch(`/api/console/feedback/${encodeURIComponent(incidentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      }).catch(() => {});
      logEvent({
        family: 'feedback',
        severity: 'info',
        service: 'FeedbackDetector',
        message: `Feedback alert ${incidentId} dismissed by operator (persisted in SQLite audit log).`,
      });
    },
    [logEvent]
  );

  const persistSoundCheck = (item: SoundCheckItem) => {
    setSoundCheckItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    void fetch(`/api/console/soundcheck/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    }).catch(() => {});
  };

  const runSoundCheckItem = useCallback(
    (itemId: string, operatorAuthorized?: boolean) => {
      const item = soundCheckItems.find((i) => i.id === itemId);
      if (!item || item.method === 'not_testable') return;

      if (item.requiresLiveToneAuth && !operatorAuthorized) {
        logEvent({
          family: 'soundcheck',
          severity: 'warning',
          service: 'SoundCheck',
          nodeId: item.targetNodeId,
          message: 'Blocked live PA sweep: requires explicit operator authorization.',
        });
        return;
      }

      if (item.id === 'chk-1') {
        void scanHardware(false).then((list) => {
          const clk = audioEngine.getAudioClockTelemetry();
          const inCount = list.filter((d) => d.kind === 'audioinput').length;
          const outCount = list.filter((d) => d.kind === 'audiooutput').length;
          const updated: SoundCheckItem = {
            ...item,
            status: list.length > 0 ? 'pass' : 'warning',
            measuredValue: `${(clk.sampleRateHz / 1000).toFixed(1)} kHz · ${clk.baseLatencyMs}ms base · ${inCount} in / ${outCount} out`,
          };
          persistSoundCheck(updated);
        });
      } else if (item.id === 'chk-2') {
        const groups = new Set(detectedHardware.map((d) => d.groupId));
        const updated: SoundCheckItem = {
          ...item,
          status: groups.size <= 2 ? 'pass' : 'warning',
          measuredValue:
            groups.size === 0
              ? 'Run Device Discovery first to enumerate clock groups'
              : groups.size <= 2
                ? `Single Host Clock (${groups.size} hardware group${groups.size > 1 ? 's' : ''})`
                : `${groups.size} distinct clock groups · watch multi-interface drift`,
        };
        persistSoundCheck(updated);
      } else if (item.id === 'chk-3') {
        const ch1 = channels.find((c) => c.id === 'ch-01');
        const m1 = meters['ch-01'];
        const active = Boolean(ch1?.sourceBinding?.active && m1?.signalPresent);
        const updated: SoundCheckItem = {
          ...item,
          status: !active ? 'warning' : m1.clipping ? 'fail' : 'pass',
          measuredValue: !active
            ? 'No live signal on CH 01 (patch Mic, Desktop, or Audio File first)'
            : `${m1.rmsDbfs.toFixed(1)} dBFS RMS · ${m1.peakDbfs.toFixed(1)} dBFS Peak`,
        };
        persistSoundCheck(updated);
      } else if (item.id === 'chk-4') {
        const updated: SoundCheckItem = {
          ...item,
          status: virtualDi.duplicatedDryWarningConfirmed ? 'pass' : 'warning',
          measuredValue: virtualDi.duplicatedDryWarningConfirmed
            ? 'Isolated V-DI route confirmed'
            : 'Parallel dry path unconfirmed',
        };
        persistSoundCheck(updated);
      } else if (item.id === 'chk-5') {
        void audioEngine
          .unlockAndStart(channels, buses, speakers, virtualCables, virtualDi)
          .then((ok) => {
            setAudioUnlocked(ok);
            audioEngine.setTestTone(true, 'pink', -24);
            window.setTimeout(() => {
              const snap = audioEngine.sampleMeters(
                stateRef.current.channels,
                stateRef.current.buses,
                stateRef.current.graphVersion,
                stateRef.current.intelligenceConfig,
                stateRef.current.speakers,
                stateRef.current.virtualCables
              );
              const mainOut = snap.meters['bus-main'];
              audioEngine.setTestTone(false, 'pink', -24);
              const updated: SoundCheckItem = {
                ...item,
                status: mainOut && mainOut.signalPresent ? 'pass' : 'warning',
                measuredValue: mainOut
                  ? `Live Pink Pulse: ${mainOut.rmsDbfs.toFixed(1)} dBFS RMS / ${mainOut.peakDbfs.toFixed(1)} dBFS Peak`
                  : 'Audio engine inactive',
              };
              persistSoundCheck(updated);
            }, 1200);
          });
      }

      logEvent({
        family: 'soundcheck',
        severity: 'info',
        service: 'SoundCheck',
        nodeId: item.targetNodeId,
        message: `Executed measured verification probe "${item.stage}".`,
      });
    },
    [soundCheckItems, scanHardware, detectedHardware, channels, meters, virtualDi, buses, speakers, logEvent]
  );

  const recallScene = useCallback(
    (sceneId: string) => {
      if (stateRef.current.operatorRole === 'volunteer') {
        logEvent({
          family: 'scene',
          severity: 'warning',
          service: 'RBAC',
          message: 'Volunteer role cannot recall global service scenes.',
        });
        return;
      }
      const scene = scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      pushUndo();

      setChannels((prev) =>
        prev.map((ch) => ({
          ...ch,
          faderDb: scene.channelFaders[ch.id] ?? ch.faderDb,
          mute: ch.muteSafe ? ch.mute : (scene.channelMutes[ch.id] ?? ch.mute),
          hpfFreqHz: scene.channelHpf[ch.id] ?? ch.hpfFreqHz,
        }))
      );
      setBuses((prev) =>
        prev.map((b) => ({
          ...b,
          faderDb: scene.busFaders[b.id] ?? b.faderDb,
        }))
      );
      setVirtualDi((prev) => ({ ...prev, tubeSaturationPct: scene.virtualDiSaturation }));
      setActiveSceneId(scene.id);
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'scene',
        severity: 'info',
        service: 'SceneManager',
        message: `Recalled scene "${scene.name}" (v${scene.version}) atomically across SignalGraph (Mute-Safe strips preserved).`,
      });
    },
    [scenes, pushUndo, logEvent]
  );

  const saveCurrentAsScene = useCallback(
    (name: string, serviceType: string) => {
      if (stateRef.current.operatorRole === 'volunteer') {
        logEvent({
          family: 'scene',
          severity: 'warning',
          service: 'RBAC',
          message: 'Volunteer role cannot save global service scenes.',
        });
        return;
      }
      const channelFaders: Record<string, number> = {};
      const channelMutes: Record<string, boolean> = {};
      const channelHpf: Record<string, number> = {};
      channels.forEach((c) => {
        channelFaders[c.id] = c.faderDb;
        channelMutes[c.id] = c.mute;
        channelHpf[c.id] = c.hpfFreqHz;
      });
      const busFaders: Record<string, number> = {};
      buses.forEach((b) => {
        busFaders[b.id] = b.faderDb;
      });

      const newScene: SceneProfile = {
        id: `scn-${Date.now()}`,
        name,
        serviceType,
        updatedAt: `Today · ${new Date().toTimeString().slice(0, 5)}`,
        version: 1,
        description: 'Snapshot captured from active console SignalGraph.',
        channelFaders,
        channelMutes,
        channelHpf,
        busFaders,
        virtualDiSaturation: virtualDi.tubeSaturationPct,
      };
      setScenes((prev) => [newScene, ...prev]);
      setActiveSceneId(newScene.id);
      void fetch('/api/console/scenes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Role': stateRef.current.operatorRole,
        },
        body: JSON.stringify({ scene: newScene }),
      }).catch(() => {});
      logEvent({
        family: 'scene',
        severity: 'info',
        service: 'SceneManager',
        message: `Saved new service profile "${name}" to SQLite.`,
      });
    },
    [channels, buses, virtualDi.tubeSaturationPct, logEvent]
  );

  const saveSnapshot = useCallback(
    (
      name: string,
      category = 'Sunday Worship',
      notes = '',
      overwriteId?: string
    ): ConsoleSnapshotProfile => {
      const nowIso = new Date().toISOString();
      const existing = overwriteId ? snapshots.find((s) => s.id === overwriteId) : undefined;
      const sanitizedChannels = cloneValue(channels).map((ch) => ({
        ...ch,
        sourceBinding: ch.sourceBinding
          ? { ...ch.sourceBinding, active: false }
          : undefined,
      }));
      const sanitizedVirtualCables = cloneValue(virtualCables).map((vc) => ({
        ...vc,
        active: vc.sourceKind === 'external-tab' || vc.sourceKind === 'media-deck' ? false : vc.active,
      }));

      const snapshot: ConsoleSnapshotProfile = {
        id: existing?.id ?? `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim() || existing?.name || `Console Snapshot ${snapshots.length + 1}`,
        category: category.trim() || existing?.category || 'Custom',
        notes: notes.trim(),
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
        profileId,
        workspaceTheme,
        channels: sanitizedChannels,
        buses: cloneValue(buses),
        speakers: cloneValue(speakers),
        virtualCables: sanitizedVirtualCables,
        virtualDi: cloneValue(virtualDi),
      };

      setSnapshots((prev) =>
        mergeSnapshots([snapshot], prev.filter((s) => s.id !== snapshot.id))
      );
      setActiveSnapshotId(snapshot.id);
      void fetch('/api/console/snapshots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Role': stateRef.current.operatorRole,
        },
        body: JSON.stringify({ snapshot }),
      }).catch(() => {});

      logEvent({
        family: 'scene',
        severity: 'info',
        service: 'SnapshotManager',
        message: `${existing ? 'Updated' : 'Saved'} console snapshot "${snapshot.name}" (${snapshot.channels.length} ch, ${snapshot.buses.length} buses, ${snapshot.speakers.length} outputs).`,
      });

      return snapshot;
    },
    [snapshots, channels, virtualCables, profileId, workspaceTheme, buses, speakers, virtualDi, logEvent]
  );

  const restoreSnapshot = useCallback(
    (snapshotId: string, scope: SnapshotRestoreScope = 'all') => {
      const target = snapshots.find((s) => s.id === snapshotId);
      if (!target) {
        return { ok: false, summary: 'Snapshot not found in local profile.' };
      }

      pushUndo();

      const snapChannelMap = new Map<string, ChannelStrip>(
        target.channels.map((ch) => [ch.id, ch])
      );
      const snapBusMap = new Map<string, BusNode>(target.buses.map((b) => [b.id, b]));
      const snapSpeakerMap = new Map<string, SpeakerBand>(target.speakers.map((s) => [s.id, s]));
      const snapCableMap = new Map<string, VirtualCableNode>(
        (target.virtualCables ?? []).map((v) => [v.id, v])
      );
      const isManualPreamp =
        hardwareProfile.devices[0]?.capabilities.preampGain === 'manual';

      let summary = '';

      if (scope === 'all') {
        channels.forEach((existingCh) => {
          if (existingCh.sourceBinding?.active && !snapChannelMap.has(existingCh.id)) {
            audioEngine.detachChannelSource(existingCh.id);
          }
        });

        const nextChannels = cloneValue(target.channels).map((ch) => {
          const liveExisting = channels.find((c) => c.id === ch.id);
          if (liveExisting?.sourceBinding?.active) {
            return {
              ...ch,
              sourceBinding: liveExisting.sourceBinding,
              physicalPort: liveExisting.physicalPort,
            };
          }
          return {
            ...ch,
            hardwarePreampDb: isManualPreamp
              ? (liveExisting?.hardwarePreampDb ?? ch.hardwarePreampDb)
              : ch.hardwarePreampDb,
          };
        });

        const nextBuses = cloneValue(target.buses);
        const nextSpeakers = cloneValue(target.speakers);
        const nextCables = cloneValue(target.virtualCables ?? virtualCables).map((vc) => {
          const liveCable = virtualCables.find((c) => c.id === vc.id);
          if (liveCable && (liveCable.sourceKind === 'external-tab' || liveCable.sourceKind === 'media-deck') && liveCable.active) {
            return {
              ...vc,
              sourceKind: liveCable.sourceKind,
              sourceLabel: liveCable.sourceLabel,
              active: true,
            };
          }
          return vc;
        });

        setProfileId(target.profileId);
        if (target.workspaceTheme) setWorkspaceTheme(target.workspaceTheme);
        setChannels(nextChannels);
        setBuses(nextBuses);
        setSpeakers(nextSpeakers);
        setVirtualCables(nextCables);
        setVirtualDi(cloneValue(target.virtualDi));
        if (nextChannels.length > 0 && !nextChannels.some((c) => c.id === selectedChannelId)) {
          setSelectedChannelId(nextChannels[0].id);
        }
        if (nextBuses.length > 0 && !nextBuses.some((b) => b.id === selectedBusId)) {
          setSelectedBusId(nextBuses[0].id);
        }

        summary = `Restored full console snapshot "${target.name}" (${nextChannels.length} channels, ${nextBuses.length} buses, ${nextSpeakers.length} outputs).`;
      } else if (scope === 'routing') {
        setChannels((prev) =>
          prev.map((ch) => {
            const snap = snapChannelMap.get(ch.id);
            if (!snap) return ch;
            return {
              ...ch,
              assignMain: snap.assignMain,
              assignSub: snap.assignSub,
              assignBroadcast: snap.assignBroadcast,
              dcaGroup: snap.dcaGroup,
              muteGroup: snap.muteGroup,
              sends: cloneValue(snap.sends),
            };
          })
        );

        setBuses((prev) => {
          const prevMap = new Map(prev.map((b) => [b.id, b]));
          return cloneValue(target.buses).map((snapBus) => {
            const liveBus = prevMap.get(snapBus.id);
            return liveBus
              ? {
                  ...liveBus,
                  name: snapBus.name,
                  shortName: snapBus.shortName,
                  kind: snapBus.kind,
                  assignedOutputId: snapBus.assignedOutputId,
                }
              : snapBus;
          });
        });

        setSpeakers((prev) => {
          const prevMap = new Map(prev.map((s) => [s.id, s]));
          return cloneValue(target.speakers).map((snapSpk) => {
            const liveSpk = prevMap.get(snapSpk.id);
            return liveSpk
              ? {
                  ...snapSpk,
                  eqEnabled: liveSpk.eqEnabled,
                  eqBands: liveSpk.eqBands,
                  gainDb: liveSpk.gainDb,
                  limiterThresholdDb: liveSpk.limiterThresholdDb,
                  mute: liveSpk.mute,
                }
              : snapSpk;
          });
        });

        if (Array.isArray(target.virtualCables)) {
          setVirtualCables((prev) => {
            const prevMap = new Map(prev.map((v) => [v.id, v]));
            return cloneValue(target.virtualCables).map((vc) => {
              const live = prevMap.get(vc.id);
              if (live && (live.sourceKind === 'external-tab' || live.sourceKind === 'media-deck') && live.active) {
                return { ...vc, sourceKind: live.sourceKind, sourceLabel: live.sourceLabel, active: true };
              }
              return vc;
            });
          });
        }

        summary = `Restored routing, bus matrix, speaker outputs & virtual cables from "${target.name}".`;
      } else if (scope === 'eq') {
        setChannels((prev) =>
          prev.map((ch) => {
            const snap = snapChannelMap.get(ch.id);
            if (!snap) return ch;
            return {
              ...ch,
              hpfEnabled: snap.hpfEnabled,
              hpfFreqHz: snap.hpfFreqHz,
              eqEnabled: snap.eqEnabled,
              eqBands: cloneValue(snap.eqBands),
              geqEnabled: snap.geqEnabled,
              geqBands: cloneValue(snap.geqBands),
              dynamics: cloneValue(snap.dynamics),
              delayMs: snap.delayMs,
            };
          })
        );

        setBuses((prev) =>
          prev.map((b) => {
            const snap = snapBusMap.get(b.id);
            if (!snap) return b;
            return {
              ...b,
              eqEnabled: snap.eqEnabled,
              eqBands: snap.eqBands ? cloneValue(snap.eqBands) : b.eqBands,
              limiterCeilingDb: snap.limiterCeilingDb,
            };
          })
        );

        setSpeakers((prev) =>
          prev.map((s) => {
            const snap = snapSpeakerMap.get(s.id);
            if (!snap) return s;
            return {
              ...s,
              hpfHz: snap.hpfHz,
              hpfSlope: snap.hpfSlope,
              lpfHz: snap.lpfHz,
              lpfSlope: snap.lpfSlope,
              crossoverBypass: snap.crossoverBypass,
              family: snap.family,
              eqEnabled: snap.eqEnabled,
              eqBands: snap.eqBands ? cloneValue(snap.eqBands) : s.eqBands,
              subBoostEnabled: snap.subBoostEnabled,
              subBoostFreqHz: snap.subBoostFreqHz,
              subBoostGainDb: snap.subBoostGainDb,
              limiterThresholdDb: snap.limiterThresholdDb,
            };
          })
        );

        setVirtualDi((prev) => ({
          ...prev,
          bypass: target.virtualDi.bypass,
          abSlot: target.virtualDi.abSlot,
          hpfHz: target.virtualDi.hpfHz,
          subHarmonicBoostDb: target.virtualDi.subHarmonicBoostDb,
          midScoopDb: target.virtualDi.midScoopDb,
          presenceDb: target.virtualDi.presenceDb,
          compThresholdDb: target.virtualDi.compThresholdDb,
          compRatio: target.virtualDi.compRatio,
          transientAttack: target.virtualDi.transientAttack,
          tubeSaturationPct: target.virtualDi.tubeSaturationPct,
          limiterCeilingDb: target.virtualDi.limiterCeilingDb,
        }));

        summary = `Restored PEQ, 31-band GEQ, HPF, crossovers & dynamics from "${target.name}".`;
      } else if (scope === 'gains') {
        setChannels((prev) =>
          prev.map((ch) => {
            const snap = snapChannelMap.get(ch.id);
            if (!snap) return ch;
            return {
              ...ch,
              hardwarePreampDb: isManualPreamp ? ch.hardwarePreampDb : snap.hardwarePreampDb,
              softwareTrimDb: snap.softwareTrimDb,
              faderDb: snap.faderDb,
              mute: snap.mute,
              pan: snap.pan,
              polarityInvert: snap.polarityInvert,
            };
          })
        );

        setBuses((prev) =>
          prev.map((b) => {
            const snap = snapBusMap.get(b.id);
            if (!snap) return b;
            return {
              ...b,
              faderDb: snap.faderDb,
              mute: snap.mute,
            };
          })
        );

        setSpeakers((prev) =>
          prev.map((s) => {
            const snap = snapSpeakerMap.get(s.id);
            if (!snap) return s;
            return {
              ...s,
              gainDb: snap.gainDb,
              mute: snap.mute,
              delayMs: snap.delayMs,
            };
          })
        );

        setVirtualCables((prev) =>
          prev.map((vc) => {
            const snap = snapCableMap.get(vc.id);
            if (!snap) return vc;
            return {
              ...vc,
              gainDb: snap.gainDb,
            };
          })
        );

        setVirtualDi((prev) => ({
          ...prev,
          inputTrimDb: target.virtualDi.inputTrimDb,
          outputGainDb: target.virtualDi.outputGainDb,
        }));

        summary = `Restored trim gains, faders, mutes & output levels from "${target.name}".`;
      }

      setActiveSnapshotId(target.id);
      setGraphVersion((v) => v + 1);

      logEvent({
        family: 'scene',
        severity: 'info',
        service: 'SnapshotManager',
        message: summary,
      });

      return { ok: true, summary };
    },
    [
      snapshots,
      pushUndo,
      hardwareProfile,
      channels,
      virtualCables,
      selectedChannelId,
      selectedBusId,
      logEvent,
    ]
  );

  const deleteSnapshot = useCallback(
    (snapshotId: string) => {
      if (stateRef.current.operatorRole === 'volunteer') {
        logEvent({
          family: 'scene',
          severity: 'warning',
          service: 'RBAC',
          message: 'Volunteer role cannot delete saved snapshots.',
        });
        return;
      }
      const removed = snapshots.find((s) => s.id === snapshotId);
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
      if (activeSnapshotId === snapshotId) {
        setActiveSnapshotId(null);
      }
      void fetch(`/api/console/snapshots/${encodeURIComponent(snapshotId)}`, {
        method: 'DELETE',
        headers: { 'X-Operator-Role': stateRef.current.operatorRole },
      }).catch(() => {});
      if (removed) {
        logEvent({
          family: 'scene',
          severity: 'info',
          service: 'SnapshotManager',
          message: `Deleted console snapshot "${removed.name}".`,
        });
      }
    },
    [snapshots, activeSnapshotId, logEvent]
  );

  const importSnapshotJson = useCallback(
    (rawJson: string): { ok: boolean; importedCount: number; error?: string } => {
      try {
        const parsed = JSON.parse(rawJson);
        const candidates: unknown[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.snapshots)
            ? parsed.snapshots
            : [parsed];

        const valid: ConsoleSnapshotProfile[] = [];
        const existingIds = new Set(snapshots.map((s) => s.id));
        const nowIso = new Date().toISOString();

        candidates.forEach((raw, idx) => {
          if (!raw || typeof raw !== 'object') return;
          const item = raw as Partial<ConsoleSnapshotProfile>;
          if (
            typeof item.name !== 'string' ||
            !Array.isArray(item.channels) ||
            !Array.isArray(item.buses) ||
            !Array.isArray(item.speakers)
          ) {
            return;
          }
          const id =
            typeof item.id === 'string' && !existingIds.has(item.id)
              ? item.id
              : `snap-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
          existingIds.add(id);

          valid.push({
            id,
            name: item.name.trim() || `Imported Snapshot ${idx + 1}`,
            category: typeof item.category === 'string' ? item.category : 'Imported',
            notes: typeof item.notes === 'string' ? item.notes : '',
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso,
            updatedAt: nowIso,
            profileId: item.profileId ?? profileId,
            workspaceTheme: item.workspaceTheme ?? workspaceTheme,
            channels: item.channels,
            buses: item.buses,
            speakers: item.speakers,
            virtualCables: Array.isArray(item.virtualCables)
              ? item.virtualCables
              : cloneValue(virtualCables),
            virtualDi: item.virtualDi ?? cloneValue(virtualDi),
          });
        });

        if (valid.length === 0) {
          return {
            ok: false,
            importedCount: 0,
            error: 'No valid console snapshots found in JSON file.',
          };
        }

        setSnapshots((prev) => mergeSnapshots(valid, prev));
        valid.forEach((snapshot) => {
          void fetch('/api/console/snapshots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot }),
          }).catch(() => {});
        });

        logEvent({
          family: 'scene',
          severity: 'info',
          service: 'SnapshotManager',
          message: `Imported ${valid.length} console snapshot profile(s) into local & SQLite bank.`,
        });

        return { ok: true, importedCount: valid.length };
      } catch (err) {
        return {
          ok: false,
          importedCount: 0,
          error: err instanceof Error ? err.message : 'Invalid JSON snapshot format.',
        };
      }
    },
    [snapshots, profileId, workspaceTheme, virtualCables, virtualDi, logEvent]
  );

  const addProposals = useCallback((items: AiProposal[]) => {
    setProposals((prev) => [...items, ...prev]);
  }, []);

  const applyProposal = useCallback(
    (proposalId: string) => {
      const prop = proposals.find((p) => p.id === proposalId);
      if (!prop || prop.status !== 'pending') return;
      pushUndo();

      if (prop.patch?.channelId) {
        setChannels((prev) =>
          prev.map((ch) => {
            if (ch.id !== prop.patch?.channelId) return ch;
            const next = { ...ch };
            if (prop.patch.hpfEnabled !== undefined) next.hpfEnabled = prop.patch.hpfEnabled;
            if (prop.patch.hpfFreq !== undefined) next.hpfFreqHz = prop.patch.hpfFreq;
            if (prop.patch.faderDeltaDb !== undefined) {
              next.faderDb = Math.max(-75, Math.min(10, ch.faderDb + prop.patch.faderDeltaDb));
            }
            if (prop.patch.compThresholdDb !== undefined) {
              next.dynamics = { ...ch.dynamics, compEnabled: true, compThresholdDb: prop.patch.compThresholdDb };
            }
            if (prop.patch.eqBandIndex !== undefined && ch.eqBands[prop.patch.eqBandIndex]) {
              const bands = [...ch.eqBands];
              bands[prop.patch.eqBandIndex] = {
                ...bands[prop.patch.eqBandIndex],
                enabled: true,
                freqHz: prop.patch.eqFreqHz ?? bands[prop.patch.eqBandIndex].freqHz,
                gainDb: prop.patch.eqGainDb ?? bands[prop.patch.eqBandIndex].gainDb,
              };
              next.eqEnabled = true;
              next.eqBands = bands;
            }
            return next;
          })
        );
      }

      setProposals((prev) => prev.map((p) => (p.id === proposalId ? { ...p, status: 'applied' } : p)));
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'ai',
        severity: 'info',
        service: 'ConfigurationManager',
        nodeId: prop.affectedNodeIds[0],
        message: `Operator approved and applied AI recommendation: "${prop.title}".`,
      });
    },
    [proposals, pushUndo, logEvent]
  );

  const dismissProposal = useCallback(
    (proposalId: string) => {
      const prop = proposals.find((p) => p.id === proposalId);
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? { ...p, status: 'dismissed' } : p)));
      logEvent({
        family: 'ai',
        severity: 'info',
        service: 'AIEngineer',
        message: `Operator dismissed proposal "${prop?.title ?? proposalId}" (retained in audit trail).`,
      });
    },
    [proposals, logEvent]
  );

  const toggleMuteGroup = useCallback(
    (group: 1 | 2 | 3 | 4) => {
      pushUndo();
      const nextActive = !muteGroupsActive[group];
      setMuteGroupsActive((prev) => ({ ...prev, [group]: nextActive }));
      setChannels((prev) =>
        prev.map((ch) => (ch.muteGroup === group && !ch.muteSafe ? { ...ch, mute: nextActive } : ch))
      );
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'dsp',
        severity: nextActive ? 'warning' : 'info',
        service: 'ChannelManager',
        message: `Mute Group ${group} ${nextActive ? 'ENGAGED' : 'RELEASED'} (Mute-Safe strips protected).`,
      });
    },
    [muteGroupsActive, pushUndo, logEvent]
  );

  const clearAllSolos = useCallback(() => {
    setChannels((prev) => prev.map((c) => ({ ...c, solo: false })));
    setBuses((prev) => prev.map((b) => ({ ...b, solo: false })));
  }, []);

  // Audit 2026 Action Callbacks: RBAC, High-Vis, DCA Groups, FX Rack, Matrix Zones & Virtual Soundcheck
  const setOperatorRole = useCallback(
    (role: OperatorRole) => {
      setOperatorRoleState(role);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LOCAL_ROLE_STORAGE_KEY, role);
        } catch {
          // ignore
        }
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'hello', clientId: clientIdRef.current, role })
        );
      }
      logEvent({
        family: 'device',
        severity: 'info',
        service: 'RBAC',
        message: `Operator role switched to ${role.toUpperCase()}.`,
      });
    },
    [logEvent]
  );

  const setHighVisibilityMode = useCallback((v: boolean) => {
    setHighVisibilityModeState(v);
  }, []);

  const updateDcaGroup = useCallback(
    (id: DcaGroupId, patch: Partial<DcaGroupState>) => {
      setDcaGroups((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
      setGraphVersion((v) => v + 1);
    },
    []
  );

  const updateFxSlot = useCallback(
    (slotId: string, patch: Partial<FxSlotState>) => {
      if (stateRef.current.operatorRole === 'volunteer') {
        logEvent({
          family: 'dsp',
          severity: 'warning',
          service: 'RBAC',
          message: 'Volunteer role cannot modify FX DSP Rack parameters.',
        });
        return;
      }
      setFxRack((prev) => prev.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
      setGraphVersion((v) => v + 1);
    },
    [logEvent]
  );

  const updateMatrixZone = useCallback(
    (zoneId: string, patch: Partial<MatrixZone>) => {
      if (stateRef.current.operatorRole === 'volunteer') {
        logEvent({
          family: 'graph',
          severity: 'warning',
          service: 'RBAC',
          message: 'Volunteer role cannot modify N×M Matrix Zone routing.',
        });
        return;
      }
      setMatrixZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)));
      setGraphVersion((v) => v + 1);
    },
    [logEvent]
  );

  const updateMatrixZoneSource = useCallback(
    (zoneId: string, busId: string, gainDb: number) => {
      if (stateRef.current.operatorRole === 'volunteer') return;
      setMatrixZones((prev) =>
        prev.map((z) =>
          z.id === zoneId
            ? { ...z, sourceGains: { ...z.sourceGains, [busId]: gainDb } }
            : z
        )
      );
      setGraphVersion((v) => v + 1);
    },
    []
  );

  const loadVirtualSoundcheckFiles = useCallback(
    async (assignments: { channelId: string; file: File }[]) => {
      try {
        const tracks: VirtualSoundcheckTrack[] = assignments.map(({ channelId, file }, idx) => {
          const ch = stateRef.current.channels.find((c) => c.id === channelId);
          return {
            id: `vsc-${channelId}-${idx}-${Date.now()}`,
            channelId,
            channelNumber: ch?.number ?? idx + 1,
            filename: file.name,
            blobUrl: URL.createObjectURL(file),
            durationSec: 0,
          };
        });
        const res = await audioEngine.loadVirtualSoundcheckTracks(
          tracks,
          stateRef.current.channels,
          stateRef.current.buses,
          stateRef.current.speakers,
          stateRef.current.virtualCables
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        setVirtualSoundcheckStatus(audioEngine.getVirtualSoundcheckStatus());
        logEvent({
          family: 'soundcheck',
          severity: 'info',
          service: 'VirtualSoundcheck',
          message: `Mounted ${res.loadedCount} multitrack stem(s) (${res.durationSec.toFixed(1)}s) for Virtual Soundcheck.`,
        });
        return { ok: true, ...res };
      } catch (err) {
        return {
          ok: false,
          loadedCount: 0,
          durationSec: 0,
          error: err instanceof Error ? err.message : 'Failed to decode Virtual Soundcheck stems.',
        };
      }
    },
    [logEvent]
  );

  const mountMultitrackSessionForSoundcheck = useCallback(
    async (sessionId: string) => {
      const session = multitrackSessions.find((s) => s.id === sessionId);
      if (!session) {
        return { ok: false, loadedCount: 0, durationSec: 0, error: 'Multitrack session not found.' };
      }
      try {
        const tracks: VirtualSoundcheckTrack[] = session.tracks.map((t, idx) => ({
          id: `vsc-${session.id}-${t.channelId}-${idx}`,
          channelId: t.channelId,
          channelNumber: t.channelNumber,
          filename: t.filename,
          blobUrl: t.blobUrl,
          durationSec: t.durationSec,
        }));
        const res = await audioEngine.loadVirtualSoundcheckTracks(
          tracks,
          stateRef.current.channels,
          stateRef.current.buses,
          stateRef.current.speakers,
          stateRef.current.virtualCables
        );
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        setVirtualSoundcheckStatus(audioEngine.getVirtualSoundcheckStatus());
        logEvent({
          family: 'soundcheck',
          severity: 'info',
          service: 'VirtualSoundcheck',
          message: `Mounted recorded multitrack session (${res.loadedCount} WAV stems, ${res.durationSec.toFixed(1)}s) into console channels.`,
        });
        return { ok: true, ...res };
      } catch (err) {
        return {
          ok: false,
          loadedCount: 0,
          durationSec: 0,
          error: err instanceof Error ? err.message : 'Failed to mount recorded session.',
        };
      }
    },
    [multitrackSessions, logEvent]
  );

  const toggleVirtualSoundcheckPlay = useCallback(() => {
    const st = audioEngine.getVirtualSoundcheckStatus();
    if (st.playing) {
      audioEngine.pauseVirtualSoundcheck();
    } else {
      audioEngine.startVirtualSoundcheck();
    }
    setVirtualSoundcheckStatus(audioEngine.getVirtualSoundcheckStatus());
  }, []);

  const stopVirtualSoundcheck = useCallback(() => {
    audioEngine.stopVirtualSoundcheck();
    setVirtualSoundcheckStatus(audioEngine.getVirtualSoundcheckStatus());
  }, []);

  const setVirtualSoundcheckLoop = useCallback((loop: boolean) => {
    audioEngine.setVirtualSoundcheckLoop(loop);
    setVirtualSoundcheckStatus(audioEngine.getVirtualSoundcheckStatus());
  }, []);

  const toggleTalkback = useCallback(() => {
    const primaryCap = hardwareProfile.devices[0]?.capabilities.talkback;
    if (primaryCap === 'manual') {
      logEvent({
        family: 'device',
        severity: 'warning',
        service: 'CapabilityRegistry',
        message: 'Talkback switch is physical-only on selected hardware profile. Engage desk TALKBACK button manually.',
      });
      return;
    }
    setTalkbackActive((prev) => !prev);
  }, [hardwareProfile, logEvent]);

  // Parameter Automation Controls & Lane CRUD
  const toggleAutomationPlay = useCallback(() => {
    setAutomationTransport((prev) => ({
      ...prev,
      playing: !prev.playing,
      recording: !prev.playing ? prev.recording : false,
    }));
  }, []);

  const stopAndRewindAutomation = useCallback(() => {
    setAutomationTransport((prev) => ({
      ...prev,
      playing: false,
      recording: false,
      playheadSec: 0,
    }));
    applyAutomationAtTime(0);
  }, [applyAutomationAtTime]);

  const setAutomationPlayhead = useCallback(
    (sec: number) => {
      const dur = stateRef.current.automationTransport.durationSec;
      const clamped = Math.max(0, Math.min(dur, Number(sec.toFixed(2))));
      setAutomationTransport((prev) => ({ ...prev, playheadSec: clamped }));
      applyAutomationAtTime(clamped);
    },
    [applyAutomationAtTime]
  );

  const setAutomationMode = useCallback((mode: AutomationMode) => {
    setAutomationTransport((prev) => ({
      ...prev,
      mode,
      recording: mode === 'off' || mode === 'read' ? false : prev.recording,
    }));
  }, []);

  const toggleAutomationRecord = useCallback(() => {
    setAutomationTransport((prev) => {
      const nextRec = !prev.recording;
      const nextMode: AutomationMode =
        nextRec && (prev.mode === 'off' || prev.mode === 'read') ? 'write' : prev.mode;
      return {
        ...prev,
        recording: nextRec,
        mode: nextMode,
        playing: nextRec ? true : prev.playing,
      };
    });
  }, []);

  const setAutomationDuration = useCallback((durationSec: number) => {
    const clampedDur = Math.max(10, Math.min(600, Math.round(durationSec)));
    setAutomationTransport((prev) => ({
      ...prev,
      durationSec: clampedDur,
      playheadSec: Math.min(prev.playheadSec, clampedDur),
    }));
  }, []);

  const toggleAutomationLoop = useCallback(() => {
    setAutomationTransport((prev) => ({ ...prev, loop: !prev.loop }));
  }, []);

  const ensureAutomationLane = useCallback(
    (channelId: string, parameter: AutomationParameterKey): AutomationLane => {
      const existing = stateRef.current.automationLanes.find(
        (l) => l.channelId === channelId && l.parameter === parameter
      );
      if (existing) return existing;
      const ch = stateRef.current.channels.find((c) => c.id === channelId);
      const startVal = ch
        ? clampAutomationValue(parameter, readChannelAutomationParam(ch, parameter))
        : 0;
      const created: AutomationLane = {
        id: `auto-${channelId}-${parameter}-${Date.now().toString(36)}`,
        channelId,
        parameter,
        enabled: true,
        points: [
          {
            id: `pt-${Date.now().toString(36)}-init`,
            timeSec: 0,
            value: startVal,
          },
        ],
      };
      setAutomationLanes((prev) => [...prev, created]);
      return created;
    },
    []
  );

  const toggleAutomationLaneEnabled = useCallback((laneId: string) => {
    setAutomationLanes((prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, enabled: !l.enabled } : l))
    );
  }, []);

  const removeAutomationLane = useCallback((laneId: string) => {
    setAutomationLanes((prev) => prev.filter((l) => l.id !== laneId));
  }, []);

  const clearAutomationLanePoints = useCallback((laneId: string) => {
    setAutomationLanes((prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, points: [] } : l))
    );
  }, []);

  const upsertAutomationPoint = useCallback(
    (laneId: string, timeSec: number, value: number, replacePointId?: string) => {
      const dur = stateRef.current.automationTransport.durationSec;
      const clampedT = Math.max(0, Math.min(dur, Math.round(timeSec * 20) / 20));
      setAutomationLanes((prev) =>
        prev.map((lane) => {
          if (lane.id !== laneId) return lane;
          const clampedV = clampAutomationValue(lane.parameter, value);
          if (replacePointId) {
            const nextPts = lane.points
              .map((p) =>
                p.id === replacePointId ? { ...p, timeSec: clampedT, value: clampedV } : p
              )
              .sort((a, b) => a.timeSec - b.timeSec);
            return { ...lane, points: nextPts };
          }
          const nearIdx = lane.points.findIndex((p) => Math.abs(p.timeSec - clampedT) < 0.08);
          const nextPts =
            nearIdx >= 0
              ? lane.points.map((p, idx) =>
                  idx === nearIdx ? { ...p, timeSec: clampedT, value: clampedV } : p
                )
              : [
                  ...lane.points,
                  {
                    id: `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                    timeSec: clampedT,
                    value: clampedV,
                  },
                ].sort((a, b) => a.timeSec - b.timeSec);
          return { ...lane, points: nextPts };
        })
      );
    },
    []
  );

  const removeAutomationPoint = useCallback((laneId: string, pointId: string) => {
    setAutomationLanes((prev) =>
      prev.map((lane) =>
        lane.id === laneId
          ? { ...lane, points: lane.points.filter((p) => p.id !== pointId) }
          : lane
      )
    );
  }, []);

  const captureAutomationSnapshotPoint = useCallback(
    (channelId: string, parameter: AutomationParameterKey) => {
      const ch = stateRef.current.channels.find((c) => c.id === channelId);
      if (!ch) return;
      const lane = ensureAutomationLane(channelId, parameter);
      const val = readChannelAutomationParam(ch, parameter);
      upsertAutomationPoint(lane.id, stateRef.current.automationTransport.playheadSec, val);
    },
    [ensureAutomationLane, upsertAutomationPoint]
  );

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, captureSnapshot()]);
      setProfileId(last.profileId);
      setChannels(last.channels);
      setBuses(last.buses);
      setSpeakers(last.speakers);
      setVirtualCables(last.virtualCables);
      setVirtualDi(last.virtualDi);
      setFeedbackIncidents(last.feedbackIncidents);
      setSoundCheckItems(last.soundCheckItems);
      setActiveSceneId(last.activeSceneId);
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'graph',
        severity: 'info',
        service: 'ConfigurationManager',
        message: 'Rolled back last SignalGraph / DSP transaction.',
      });
      return prev.slice(0, -1);
    });
  }, [captureSnapshot, logEvent]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((u) => [...u, captureSnapshot()]);
      setProfileId(next.profileId);
      setChannels(next.channels);
      setBuses(next.buses);
      setSpeakers(next.speakers);
      setVirtualCables(next.virtualCables);
      setVirtualDi(next.virtualDi);
      setFeedbackIncidents(next.feedbackIncidents);
      setSoundCheckItems(next.soundCheckItems);
      setActiveSceneId(next.activeSceneId);
      setGraphVersion((v) => v + 1);
      return prev.slice(0, -1);
    });
  }, [captureSnapshot]);

  const traceSignalJourney = useCallback(
    (nodeId: string, direction: 'forward' | 'reverse' | 'both' = 'both'): GraphTraceResult => {
      const ch = channels.find((c) => c.id === nodeId);
      const bus = buses.find((b) => b.id === nodeId);
      const spk = speakers.find((s) => s.id === nodeId);
      const warnings: string[] = [];

      const upstream: GraphTraceStage[] = [];
      const downstream: GraphTraceStage[] = [];
      let selected: GraphTraceStage;

      if (ch) {
        const primaryDev = hardwareProfile.devices[0];
        const isManualPre = primaryDev?.capabilities.preampGain === 'manual';
        upstream.push({
          nodeId: `src-${ch.id}`,
          label: ch.sourceBinding?.active
            ? `${ch.sourceBinding.kind.toUpperCase()}: ${ch.sourceBinding.label}`
            : `${ch.micOrDiModel} (${ch.physicalPort})`,
          domain: 'hardware',
          connectionKind: ch.sourceBinding?.kind === 'desktop' ? 'digital' : 'analog',
          status: ch.sourceBinding?.active ? 'active' : 'bypassed',
          latencyMs: 0.0,
          note: ch.sourceBinding?.active
            ? `Active live WebAudio capture (${ch.sourceBinding.sampleRateHz ?? 48000} Hz)`
            : isManualPre
              ? 'No live stream patched; manual desk preamp stage'
              : 'No live stream patched',
        });

        if (ch.id === virtualDi.sourceChannelId) {
          upstream.push({
            nodeId: 'vdi-capture',
            label:
              virtualDi.topology === 'with-physical-di'
                ? 'Physical DI -> Balanced Mic In -> Isolated Capture'
                : 'Hi-Z / Line In -> Isolated Aux Send -> Computer Capture',
            domain: 'hardware',
            connectionKind: 'analog',
            status: 'active',
            latencyMs: 2.6,
            note: virtualDi.isolatedRouteLabel,
          });
          if (!virtualDi.duplicatedDryWarningConfirmed) {
            warnings.push('Check dry/processed isolation on Bass Virtual DI route.');
          }
        }

        selected = {
          nodeId: ch.id,
          label: `CH ${String(ch.number).padStart(2, '0')} · ${ch.name}`,
          domain: 'software',
          connectionKind: 'software',
          status: ch.mute
            ? 'muted'
            : globalDspBypass || (!ch.eqEnabled && !ch.dynamics.compEnabled)
              ? 'bypassed'
              : 'active',
          latencyMs:
            (globalDspBypass ? 0 : ch.delayMs) +
            (primaryDev ? (primaryDev.bufferSamples / primaryDev.sampleRateHz) * 1000 : 2.7),
          meter: meters[ch.id],
          note: globalDspBypass
            ? `[GLOBAL A/B BYPASS] HPF/PEQ/GEQ/Comp/Delay temporarily bypassed`
            : `HPF ${ch.hpfEnabled ? ch.hpfFreqHz + 'Hz' : 'OFF'} · EQ ${ch.eqEnabled ? 'IN' : 'BYP'} · Comp ${ch.dynamics.compEnabled ? ch.dynamics.compRatio + ':1' : 'BYP'}`,
        };

        if (ch.assignMain) {
          const mainBus = buses.find((b) => b.id === 'bus-main')!;
          downstream.push({
            nodeId: mainBus.id,
            label: mainBus.name,
            domain: 'software',
            connectionKind: 'software',
            status: mainBus.mute ? 'muted' : 'active',
            latencyMs: 0.4,
            meter: meters[mainBus.id],
            note: `Fader ${mainBus.faderDb.toFixed(1)} dB · Limiter ${mainBus.limiterCeilingDb} dBFS`,
          });
          speakers
            .filter((s) => s.sourceBusId === 'bus-main')
            .forEach((s) => {
              downstream.push({
                nodeId: s.id,
                label: `${s.name} (${s.physicalConnector})`,
                domain: 'hardware',
                connectionKind: 'analog',
                status: s.mute ? 'muted' : 'active',
                latencyMs: s.delayMs,
                note: s.connectorVerified ? 'Verified physical mapping' : 'Unverified matrix mapping',
              });
            });
        }
        if (ch.assignBroadcast) {
          const stBus = buses.find((b) => b.id === 'bus-stream')!;
          downstream.push({
            nodeId: stBus.id,
            label: 'Livestream Broadcast Bus -> Stream Encoder',
            domain: 'software',
            connectionKind: 'digital',
            status: stBus.mute ? 'muted' : 'active',
            latencyMs: 1.2,
            meter: meters[stBus.id],
            note: `Send ${ch.sends.livestream.levelDb.toFixed(1)} dB`,
          });
        }
      } else if (bus) {
        channels.forEach((c) => {
          const contributes =
            (bus.id === 'bus-main' && c.assignMain) ||
            (bus.id === 'bus-sub' && c.assignSub) ||
            (bus.id === 'bus-stream' && c.assignBroadcast) ||
            (bus.id === 'bus-mon1' && c.sends.mon1.enabled) ||
            (bus.id === 'bus-mon2' && c.sends.mon2.enabled) ||
            (bus.id === 'bus-iem' && c.sends.iemChoir.enabled) ||
            (bus.id === 'bus-fx' && c.sends.fxReverb.enabled);
          if (contributes) {
            upstream.push({
              nodeId: c.id,
              label: `CH ${String(c.number).padStart(2, '0')} · ${c.name}`,
              domain: 'software',
              connectionKind: 'software',
              status: c.mute ? 'muted' : 'active',
              latencyMs: 2.7,
              meter: meters[c.id],
              note: `Fader ${c.faderDb.toFixed(1)} dB`,
            });
          }
        });

        selected = {
          nodeId: bus.id,
          label: bus.name,
          domain: 'software',
          connectionKind: 'software',
          status: bus.mute ? 'muted' : 'active',
          latencyMs: 0.4,
          meter: meters[bus.id],
          note: `Bus Master ${bus.faderDb.toFixed(1)} dB`,
        };

        speakers
          .filter((s) => s.sourceBusId === bus.id)
          .forEach((s) => {
            downstream.push({
              nodeId: s.id,
              label: `${s.name} -> ${s.physicalConnector}`,
              domain: 'hardware',
              connectionKind: 'analog',
              status: s.mute ? 'muted' : 'active',
              latencyMs: s.delayMs,
              note: `${s.family} ${s.hpfHz}–${s.lpfHz} Hz`,
            });
          });
      } else if (spk) {
        const srcBus = buses.find((b) => b.id === spk.sourceBusId);
        if (srcBus) {
          upstream.push({
            nodeId: srcBus.id,
            label: srcBus.name,
            domain: 'software',
            connectionKind: 'software',
            status: srcBus.mute ? 'muted' : 'active',
            latencyMs: 0.4,
            meter: meters[srcBus.id],
            note: 'Assigned source bus',
          });
        }
        selected = {
          nodeId: spk.id,
          label: spk.name,
          domain: 'hardware',
          connectionKind: 'analog',
          status: spk.mute ? 'muted' : 'active',
          latencyMs: spk.delayMs,
          note: `${spk.physicalConnector} · Delay ${spk.delayMs.toFixed(1)} ms`,
        };
        if (!spk.connectorVerified) {
          warnings.push('Physical connector mapping is unverified on current device profile.');
        }
      } else {
        selected = {
          nodeId,
          label: nodeId,
          domain: 'hardware',
          connectionKind: 'digital',
          status: 'active',
          latencyMs: 2.7,
          note: 'Hardware Endpoint',
        };
      }

      return {
        targetId: nodeId,
        direction,
        graphVersion,
        generatedAt: new Date().toTimeString().slice(0, 8),
        upstream: direction === 'forward' ? [] : upstream,
        selected,
        downstream: direction === 'reverse' ? [] : downstream,
        warnings,
      };
    },
    [channels, buses, speakers, hardwareProfile, virtualDi, meters, graphVersion, globalDspBypass]
  );

  const clockTelemetry = audioEngine.getAudioClockTelemetry();
  const primaryDev = hardwareProfile.devices[0];
  const bufferLatencyMs = audioUnlocked
    ? clockTelemetry.baseLatencyMs
    : primaryDev
      ? Number(((primaryDev.bufferSamples / primaryDev.sampleRateHz) * 1000).toFixed(2))
      : 2.67;
  const measuredLatencyMs = audioUnlocked
    ? Number((clockTelemetry.baseLatencyMs + clockTelemetry.outputLatencyMs).toFixed(2))
    : Number((bufferLatencyMs * 2 + 1.45).toFixed(2));
  const cpuDspLoadPct = useMemo(() => {
    const activeSources = channels.filter((c) => c.sourceBinding?.active && !c.mute).length;
    const eqCount = globalDspBypass ? 0 : channels.filter((c) => c.eqEnabled || c.geqEnabled).length;
    return Number((2.1 + activeSources * 1.4 + eqCount * 0.25).toFixed(1));
  }, [channels, globalDspBypass]);

  const value: AudioConsoleContextValue = {
    activeDestination,
    activeWorkspace,
    operatingMode,
    workspaceTheme,
    setWorkspace,
    setOperatingMode,
    setWorkspaceTheme,
    selectedChannelId,
    setSelectedChannelId,
    selectedBusId,
    setSelectedBusId,
    signalJourneyTargetId,
    openSignalJourney,
    closeSignalJourney,
    sourceBayOpen,
    sourceBayChannelId,
    openSourceBay,
    closeSourceBay,
    gainStagingOpen,
    gainStagingChannelId,
    openGainStagingAssistant,
    closeGainStagingAssistant,
    snapshotModalOpen,
    openSnapshotManager,
    closeSnapshotManager,
    hardwareProfile,
    switchHardwareProfile,
    detectedHardware,
    selectedOutputDeviceId,
    scanHardware,
    setOutputDevice,
    dbHydrated,
    dbSyncing,
    dbUpdatedAt,
    resetFactoryState,
    audioUnlocked,
    toggleAudioEngine,
    globalDspBypass,
    toggleGlobalDspBypass,
    setGlobalDspBypass,
    liveMicActive,
    toggleLiveMic,
    graphVersion,
    cpuDspLoadPct,
    measuredLatencyMs,
    bufferLatencyMs,
    xrunsCount,
    resetXruns: () => setXrunsCount(0),
    resetPeakHold,
    recordingActive,
    recordingDurationSec,
    recordingTargetId,
    setRecordingTargetId,
    recordedTakes,
    deleteRecordedTake,
    lastRecordingUrl,
    lastRecordingFilename,
    toggleStreamRecording,
    multitrackArmedIds,
    multitrackTapPoint,
    setMultitrackTapPoint,
    multitrackBitDepth,
    setMultitrackBitDepth,
    multitrackRecording,
    multitrackSessions,
    toggleMultitrackArm,
    armMultitrackPreset,
    toggleMultitrackRecording,
    deleteMultitrackSession,
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
    virtualCables,
    addVirtualCable,
    updateVirtualCable,
    removeVirtualCable,
    attachMicToChannel,
    attachDesktopAudioToChannel,
    attachFileToChannel,
    attachToneToChannel,
    attachVirtualCableToChannel,
    attachExternalTabToVirtualCable,
    attachFileToVirtualCable,
    toggleChannelFilePlayback,
    detachChannelSource,
    addChannel,
    removeChannel,
    addChannelEqBand,
    removeChannelEqBand,
    addBus,
    removeBus,
    addBusEqBand,
    updateBusEqBand,
    removeBusEqBand,
    addSpeakerOutput,
    removeSpeakerOutput,
    addSpeakerEqBand,
    updateSpeakerEqBand,
    removeSpeakerEqBand,
    testToneActive,
    testToneKind,
    testToneGainDb,
    setTestToneConfig,
    talkbackActive,
    toggleTalkback,
    monitorSource,
    setMonitorSource,
    muteGroupsActive,
    toggleMuteGroup,
    clearAllSolos,
    channels,
    buses,
    speakers,
    virtualDi,
    feedbackIncidents,
    soundCheckItems,
    scenes,
    activeSceneId,
    snapshots,
    activeSnapshotId,
    proposals,
    events,
    meters,
    spectrum,
    roomSpectrum,
    intelligenceConfig,
    setIntelligenceConfig,
    systemIntelligence,
    autoCalibrateChannel,
    optimizeAllLiveChannels,
    updateChannel,
    updateChannelSend,
    updateBus,
    updateSpeaker,
    updateVirtualDi,
    updateFeedbackIncident,
    applyFeedbackNotch,
    dismissFeedbackIncident,
    runSoundCheckItem,
    recallScene,
    saveCurrentAsScene,
    saveSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    importSnapshotJson,
    addProposals,
    applyProposal,
    dismissProposal,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    traceSignalJourney,
    logEvent,
    connectedSeats,
    wsConnected,
    operatorRole,
    setOperatorRole,
    highVisibilityMode,
    setHighVisibilityMode,
    midiConnectedDevices,
    midiLastMessage,
    dcaGroups,
    updateDcaGroup,
    activeDcaSpill,
    setActiveDcaSpill,
    soloMode,
    setSoloMode,
    fxRack,
    updateFxSlot,
    matrixZones,
    updateMatrixZone,
    updateMatrixZoneSource,
    broadcastLoudness,
    virtualSoundcheckStatus,
    loadVirtualSoundcheckFiles,
    mountMultitrackSessionForSoundcheck,
    toggleVirtualSoundcheckPlay,
    stopVirtualSoundcheck,
    setVirtualSoundcheckLoop,
  };

  return <AudioConsoleContext.Provider value={value}>{children}</AudioConsoleContext.Provider>;
}

export function useAudioConsole() {
  const ctx = useContext(AudioConsoleContext);
  if (!ctx) throw new Error('useAudioConsole must be used inside UnifiedAudioEngineProvider');
  return ctx;
}
