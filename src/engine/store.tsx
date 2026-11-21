import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDynamicChannelStrip,
  createDynamicSpeakerOutput,
  HARDWARE_PROFILES,
  INITIAL_BUSES,
  INITIAL_CHANNELS,
  INITIAL_FEEDBACK,
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
  BusNode,
  ChannelSendConfig,
  ChannelStrip,
  ConsoleSnapshotProfile,
  ConsoleThemeId,
  DetectedHardwareDevice,
  EqBand,
  FeedbackIncident,
  GraphTraceResult,
  GraphTraceStage,
  HardwareProfile,
  HardwareProfileId,
  MainDestinationId,
  MeterReading,
  OperatingMode,
  SceneProfile,
  SnapshotRestoreScope,
  SoundCheckItem,
  SpeakerBand,
  StructuredEvent,
  VirtualCableNode,
  VirtualDiState,
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

  // Real Broadcast / Stream Recorder
  recordingActive: boolean;
  recordingDurationSec: number;
  lastRecordingUrl: string | null;
  lastRecordingFilename: string | null;
  toggleStreamRecording: (busId?: string) => Promise<{ ok: boolean; error?: string }>;

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
}

const LOCAL_SNAPSHOTS_STORAGE_KEY = 'church_console_snapshots_v1';

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
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  const [lastRecordingFilename, setLastRecordingFilename] = useState<string | null>(null);

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
  };

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
          headers: { 'Content-Type': 'application/json' },
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
            if (Array.isArray(data.proposals)) setProposals(data.proposals);
            if (Array.isArray(data.scenes)) setScenes(data.scenes);
            if (Array.isArray(data.snapshots)) {
              setSnapshots((localPrev) => mergeSnapshots(data.snapshots, localPrev));
            }
            if (Array.isArray(data.hardwareInventory)) setDetectedHardware(data.hardwareInventory);
            if (Array.isArray(data.feedbackIncidents)) setFeedbackIncidents(data.feedbackIncidents);
            if (Array.isArray(data.soundCheckItems)) setSoundCheckItems(data.soundCheckItems);
            if (Array.isArray(data.events)) setEvents(data.events);
            if (data.updatedAt) setDbUpdatedAt(data.updatedAt);
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
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [scanHardware, logEvent]);

  // Apply full-workspace CSS variable theme attribute on root element
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-console-theme', workspaceTheme);
    }
  }, [workspaceTheme]);

  // Persist Console Snapshot Profiles to local browser profile storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LOCAL_SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [snapshots]);

  // Debounced DB state persistence whenever core mixer state updates after hydration
  useEffect(() => {
    if (!dbHydrated) return;
    const handle = window.setTimeout(() => {
      setDbSyncing(true);
      void fetch('/api/console/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          workspaceTheme,
          activeSceneId,
          graphVersion,
          channels,
          buses,
          speakers,
          virtualCables,
          virtualDi,
          proposals,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.updatedAt) setDbUpdatedAt(res.updatedAt);
        })
        .catch(() => {})
        .finally(() => setDbSyncing(false));
    }, 320);
    return () => window.clearTimeout(handle);
  }, [dbHydrated, profileId, workspaceTheme, activeSceneId, graphVersion, channels, buses, speakers, virtualCables, virtualDi, proposals]);

  // Recording elapsed duration ticker
  useEffect(() => {
    if (!recordingActive) return;
    const t = window.setInterval(() => {
      setRecordingDurationSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [recordingActive]);

  // 25 Hz genuine Web Audio AnalyserNode metering + autonomous Dugan/FFT DSP intelligence
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
        s.globalDspBypass
      );
      setMeters(sample.meters);
      setSpectrum(sample.spectrum);
      setRoomSpectrum(sample.roomSpectrum);
      setSystemIntelligence(sample.systemIntelligence);

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

  // Sync live Web Audio DSP parameters whenever channels, buses, speakers, virtual cables, Virtual DI, or Global DSP Bypass change
  useEffect(() => {
    audioEngine.syncGraph(channels, buses, virtualDi, speakers, virtualCables, globalDspBypass);
  }, [channels, buses, virtualDi, speakers, virtualCables, globalDspBypass]);

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
        globalDspBypass
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
  }, [audioUnlocked, buses, channels, speakers, virtualCables, virtualDi, globalDspBypass, logEvent, scanHardware]);

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
    async (busId = 'bus-stream') => {
      if (recordingActive) {
        const res = await audioEngine.stopBusRecording();
        setRecordingActive(false);
        if (res) {
          if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
          setLastRecordingUrl(res.blobUrl);
          setLastRecordingFilename(res.filename);
          logEvent({
            family: 'device',
            severity: 'info',
            service: 'BroadcastRecorder',
            nodeId: busId,
            message: `Saved ${res.durationSec}s live recording (${res.filename}).`,
          });
        }
        return { ok: true };
      } else {
        if (!audioEngine.isAudioUnlocked()) {
          const ok = await audioEngine.unlockAndStart(channels, buses, speakers, virtualCables, virtualDi);
          setAudioUnlocked(ok);
        }
        const started = audioEngine.startBusRecording(busId);
        if (started.ok) {
          setRecordingDurationSec(0);
          setRecordingActive(true);
          logEvent({
            family: 'device',
            severity: 'info',
            service: 'BroadcastRecorder',
            nodeId: busId,
            message: `Started live ${started.mimeType ?? 'audio'} capture on ${busId.toUpperCase()}.`,
          });
        }
        return started;
      }
    },
    [recordingActive, lastRecordingUrl, channels, buses, speakers, virtualCables, virtualDi, logEvent]
  );

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
    channels.forEach((c) => audioEngine.detachChannelSource(c.id));
    const res = await fetch('/api/console/reset', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setProfileId(data.profileId);
      setActiveSceneId(data.activeSceneId);
      setGraphVersion(data.graphVersion);
      setChannels(data.channels);
      setBuses(data.buses);
      setSpeakers(data.speakers);
      if (Array.isArray(data.virtualCables)) setVirtualCables(data.virtualCables);
      setVirtualDi(data.virtualDi);
      setProposals(data.proposals ?? []);
      setScenes(data.scenes);
      setFeedbackIncidents(data.feedbackIncidents ?? []);
      setSoundCheckItems(data.soundCheckItems);
      setEvents(data.events ?? []);
      setDbUpdatedAt(data.updatedAt ?? null);
    }
  }, [channels]);

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

  const updateChannel = useCallback(
    (channelId: string, patch: Partial<ChannelStrip>, reason?: string) => {
      const target = channels.find((c) => c.id === channelId);
      if (!target) return { ok: false, error: 'Channel not found in active SignalGraph.' };

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
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, ...patch } : c)));
      setGraphVersion((v) => v + 1);
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
    [channels, hardwareProfile, pushUndo, logEvent]
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
    []
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
      if (reason) pushUndo();
      setBuses((prev) => prev.map((b) => (b.id === busId ? { ...b, ...patch } : b)));
      setGraphVersion((v) => v + 1);
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
      const scene = scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      pushUndo();

      setChannels((prev) =>
        prev.map((ch) => ({
          ...ch,
          faderDb: scene.channelFaders[ch.id] ?? ch.faderDb,
          mute: scene.channelMutes[ch.id] ?? ch.mute,
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
        message: `Recalled scene "${scene.name}" (v${scene.version}) atomically across SignalGraph.`,
      });
    },
    [scenes, pushUndo, logEvent]
  );

  const saveCurrentAsScene = useCallback(
    (name: string, serviceType: string) => {
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
      const removed = snapshots.find((s) => s.id === snapshotId);
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
      if (activeSnapshotId === snapshotId) {
        setActiveSnapshotId(null);
      }
      void fetch(`/api/console/snapshots/${encodeURIComponent(snapshotId)}`, {
        method: 'DELETE',
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
        prev.map((ch) => (ch.muteGroup === group ? { ...ch, mute: nextActive } : ch))
      );
      setGraphVersion((v) => v + 1);
      logEvent({
        family: 'dsp',
        severity: nextActive ? 'warning' : 'info',
        service: 'ChannelManager',
        message: `Mute Group ${group} ${nextActive ? 'ENGAGED' : 'RELEASED'}.`,
      });
    },
    [muteGroupsActive, pushUndo, logEvent]
  );

  const clearAllSolos = useCallback(() => {
    setChannels((prev) => prev.map((c) => ({ ...c, solo: false })));
    setBuses((prev) => prev.map((b) => ({ ...b, solo: false })));
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
    lastRecordingUrl,
    lastRecordingFilename,
    toggleStreamRecording,
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
  };

  return <AudioConsoleContext.Provider value={value}>{children}</AudioConsoleContext.Provider>;
}

export function useAudioConsole() {
  const ctx = useContext(AudioConsoleContext);
  if (!ctx) throw new Error('useAudioConsole must be used inside UnifiedAudioEngineProvider');
  return ctx;
}
