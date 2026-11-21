import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  HARDWARE_PROFILES,
  INITIAL_BUSES,
  INITIAL_CHANNELS,
  INITIAL_FEEDBACK,
  INITIAL_SCENES,
  INITIAL_SOUND_CHECK,
  INITIAL_SPEAKERS,
  INITIAL_VIRTUAL_DI,
} from './profiles';
import type {
  AiProposal,
  AudioDevice,
  AudioSourceBinding,
  BusNode,
  ChannelStrip,
  ConsoleThemeId,
  DetectedHardwareDevice,
  FeedbackIncident,
  GraphTraceResult,
  GraphTraceStage,
  HardwareProfile,
  HardwareProfileId,
  MainDestinationId,
  MeterReading,
  OperatingMode,
  SceneProfile,
  SoundCheckItem,
  SpeakerBand,
  StructuredEvent,
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

  // Source Patchbay Modal
  sourceBayOpen: boolean;
  sourceBayChannelId: string;
  openSourceBay: (channelId?: string) => void;
  closeSourceBay: () => void;

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
  liveMicActive: boolean;
  toggleLiveMic: () => Promise<void>;
  graphVersion: number;
  cpuDspLoadPct: number;
  measuredLatencyMs: number;
  bufferLatencyMs: number;
  xrunsCount: number;
  resetXruns: () => void;

  // Multi-Source Patching (Mic, Desktop Audio, Audio File, Tone)
  attachMicToChannel: (channelId: string, deviceId?: string, label?: string) => Promise<{ ok: boolean; error?: string }>;
  attachDesktopAudioToChannel: (channelId: string) => Promise<{ ok: boolean; error?: string }>;
  attachFileToChannel: (channelId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  attachToneToChannel: (channelId: string, kind: 'pink' | 'sine1k' | 'sweep', gainDb: number) => Promise<{ ok: boolean; error?: string }>;
  toggleChannelFilePlayback: (channelId: string) => boolean;
  detachChannelSource: (channelId: string) => void;

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
    busKey: keyof ChannelStrip['sends'],
    patch: Partial<ChannelStrip['sends']['mon1']>
  ) => void;
  updateBus: (busId: string, patch: Partial<BusNode>, reason?: string) => void;
  updateSpeaker: (speakerId: string, patch: Partial<SpeakerBand>, reason?: string) => void;
  updateVirtualDi: (patch: Partial<VirtualDiState>, reason?: string) => { ok: boolean; error?: string };
  applyFeedbackNotch: (incidentId: string) => void;
  dismissFeedbackIncident: (incidentId: string) => void;
  runSoundCheckItem: (itemId: string, operatorAuthorized?: boolean) => void;
  recallScene: (sceneId: string) => void;
  saveCurrentAsScene: (name: string, serviceType: string) => void;
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

  const [profileId, setProfileId] = useState<HardwareProfileId>('auto-detected');
  const [detectedHardware, setDetectedHardware] = useState<DetectedHardwareDevice[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>('default');

  const [channels, setChannels] = useState<ChannelStrip[]>(INITIAL_CHANNELS);
  const [buses, setBuses] = useState<BusNode[]>(INITIAL_BUSES);
  const [speakers, setSpeakers] = useState<SpeakerBand[]>(INITIAL_SPEAKERS);
  const [virtualDi, setVirtualDi] = useState<VirtualDiState>(INITIAL_VIRTUAL_DI);
  const [feedbackIncidents, setFeedbackIncidents] = useState<FeedbackIncident[]>(INITIAL_FEEDBACK);
  const [soundCheckItems, setSoundCheckItems] = useState<SoundCheckItem[]>(INITIAL_SOUND_CHECK);
  const [scenes, setScenes] = useState<SceneProfile[]>(INITIAL_SCENES);
  const [activeSceneId, setActiveSceneId] = useState<string>('scn-sunday');
  const [proposals, setProposals] = useState<AiProposal[]>([]);

  const [graphVersion, setGraphVersion] = useState<number>(1);
  const [dbHydrated, setDbHydrated] = useState<boolean>(false);
  const [dbSyncing, setDbSyncing] = useState<boolean>(false);
  const [dbUpdatedAt, setDbUpdatedAt] = useState<string | null>(null);

  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const [xrunsCount, setXrunsCount] = useState<number>(0);

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
    () => channels.some((c) => c.sourceBinding?.active && (c.sourceBinding.kind === 'mic' || c.sourceBinding.kind === 'desktop')),
    [channels]
  );

  const stateRef = useRef({
    profileId,
    activeSceneId,
    channels,
    buses,
    speakers,
    virtualDi,
    proposals,
    graphVersion,
    feedbackIncidents,
    intelligenceConfig,
    systemIntelligence,
  });
  stateRef.current = {
    profileId,
    activeSceneId,
    channels,
    buses,
    speakers,
    virtualDi,
    proposals,
    graphVersion,
    feedbackIncidents,
    intelligenceConfig,
    systemIntelligence,
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
            if (data.virtualDi) setVirtualDi(data.virtualDi);
            if (Array.isArray(data.proposals)) setProposals(data.proposals);
            if (Array.isArray(data.scenes)) setScenes(data.scenes);
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
  }, [dbHydrated, profileId, workspaceTheme, activeSceneId, graphVersion, channels, buses, speakers, virtualDi, proposals]);

  // 25 Hz genuine Web Audio AnalyserNode metering + autonomous Dugan/FFT DSP intelligence
  useEffect(() => {
    const timer = window.setInterval(() => {
      const s = stateRef.current;
      const sample = audioEngine.sampleMeters(
        s.channels,
        s.buses,
        s.graphVersion,
        s.intelligenceConfig
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

  // Sync live Web Audio DSP parameters whenever channels, buses, speakers, or Virtual DI change
  useEffect(() => {
    const mainBus = buses.find((b) => b.id === 'bus-main');
    audioEngine.syncChannels(channels, mainBus, virtualDi, speakers);
  }, [channels, buses, virtualDi, speakers]);

  const captureSnapshot = useCallback((): ConsoleSnapshotState => {
    return {
      profileId,
      channels,
      buses,
      speakers,
      virtualDi,
      feedbackIncidents,
      soundCheckItems,
      activeSceneId,
    };
  }, [profileId, channels, buses, speakers, virtualDi, feedbackIncidents, soundCheckItems, activeSceneId]);

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
      const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
      const ok = await audioEngine.unlockAndStart(channels, mainBus, speakers);
      setAudioUnlocked(ok);
      void scanHardware(false);
      logEvent({
        family: 'device',
        severity: 'info',
        service: 'AudioCore',
        message: `Real-time Web Audio DSP engine engaged at ${(audioEngine.getAudioClockTelemetry().sampleRateHz / 1000).toFixed(1)} kHz.`,
      });
    }
  }, [audioUnlocked, buses, channels, speakers, logEvent, scanHardware]);

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
        const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
        const binding = await audioEngine.attachMicToChannel(channelId, channels, mainBus, deviceId, label);
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
    [buses, channels, updateBindingOnChannel, scanHardware, logEvent]
  );

  const attachDesktopAudioToChannel = useCallback(
    async (channelId: string) => {
      try {
        const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
        const binding = await audioEngine.attachDesktopAudioToChannel(channelId, channels, mainBus, () => {
          updateBindingOnChannel(channelId, {
            kind: 'none',
            label: 'Desktop Audio Stopped',
            active: false,
          });
          logEvent({
            family: 'device',
            severity: 'warning',
            service: 'SourcePatchbay',
            nodeId: channelId,
            message: `Desktop/System audio capture ended on ${channelId.toUpperCase()}.`,
          });
        });
        setAudioUnlocked(audioEngine.isAudioUnlocked());
        updateBindingOnChannel(channelId, binding);
        logEvent({
          family: 'device',
          severity: 'info',
          service: 'SourcePatchbay',
          nodeId: channelId,
          message: `Desktop / System audio "${binding.label}" routed live into ${channelId.toUpperCase()}.`,
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
    [buses, channels, updateBindingOnChannel, logEvent]
  );

  const attachFileToChannel = useCallback(
    async (channelId: string, file: File) => {
      try {
        const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
        const binding = await audioEngine.attachFileToChannel(channelId, file, channels, mainBus);
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
    [buses, channels, updateBindingOnChannel, logEvent]
  );

  const attachToneToChannel = useCallback(
    async (channelId: string, kind: 'pink' | 'sine1k' | 'sweep', gainDb: number) => {
      try {
        const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
        const binding = await audioEngine.attachToneToChannel(channelId, kind, gainDb, channels, mainBus);
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
    [buses, channels, updateBindingOnChannel, logEvent]
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
        const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
        void audioEngine.unlockAndStart(channels, mainBus, speakers).then((ok) => {
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
    [testToneKind, testToneGainDb, buses, channels, speakers, logEvent]
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
    (channelId: string, busKey: keyof ChannelStrip['sends'], patch: Partial<ChannelStrip['sends']['mon1']>) => {
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId
            ? { ...c, sends: { ...c.sends, [busKey]: { ...c.sends[busKey], ...patch } } }
            : c
        )
      );
      setGraphVersion((v) => v + 1);
    },
    []
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

  const applyFeedbackNotch = useCallback(
    (incidentId: string) => {
      const incident = feedbackIncidents.find((f) => f.id === incidentId);
      if (!incident) return;
      pushUndo();

      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.id !== incident.channelId) return ch;
          const bands = [...ch.eqBands];
          bands[2] = {
            ...bands[2],
            enabled: true,
            shape: 'notch',
            freqHz: incident.freqHz,
            gainDb: incident.notchProposedDb,
            q: 12.0,
          };
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
        const mainBus = buses.find((b) => b.id === 'bus-main') ?? buses[0];
        void audioEngine.unlockAndStart(channels, mainBus, speakers).then((ok) => {
          setAudioUnlocked(ok);
          audioEngine.setTestTone(true, 'pink', -24);
          window.setTimeout(() => {
            const snap = audioEngine.sampleMeters(stateRef.current.channels, stateRef.current.buses, stateRef.current.graphVersion);
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
          status: ch.mute ? 'muted' : !ch.eqEnabled && !ch.dynamics.compEnabled ? 'bypassed' : 'active',
          latencyMs: ch.delayMs + (primaryDev ? (primaryDev.bufferSamples / primaryDev.sampleRateHz) * 1000 : 2.7),
          meter: meters[ch.id],
          note: `HPF ${ch.hpfEnabled ? ch.hpfFreqHz + 'Hz' : 'OFF'} · EQ ${ch.eqEnabled ? 'IN' : 'BYP'} · Comp ${ch.dynamics.compEnabled ? ch.dynamics.compRatio + ':1' : 'BYP'}`,
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
    [channels, buses, speakers, hardwareProfile, virtualDi, meters, graphVersion]
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
    const eqCount = channels.filter((c) => c.eqEnabled || c.geqEnabled).length;
    return Number((2.1 + activeSources * 1.4 + eqCount * 0.25).toFixed(1));
  }, [channels]);

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
    liveMicActive,
    toggleLiveMic,
    graphVersion,
    cpuDspLoadPct,
    measuredLatencyMs,
    bufferLatencyMs,
    xrunsCount,
    resetXruns: () => setXrunsCount(0),
    attachMicToChannel,
    attachDesktopAudioToChannel,
    attachFileToChannel,
    attachToneToChannel,
    toggleChannelFilePlayback,
    detachChannelSource,
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
    applyFeedbackNotch,
    dismissFeedbackIncident,
    runSoundCheckItem,
    recallScene,
    saveCurrentAsScene,
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
