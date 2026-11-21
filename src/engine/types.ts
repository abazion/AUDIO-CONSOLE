export type CapabilityLevel = 'controllable' | 'observable' | 'manual' | 'unsupported';

export type MeasurementSource = 'hardware_reported' | 'software_measured' | 'software_estimated';

export type OperatingMode = 'console' | 'engineering' | 'compact';

export type ConsoleThemeId =
  | 'obsidian-brass'
  | 'cobalt-neve'
  | 'warm-mahogany'
  | 'emerald-broadcast'
  | 'titanium-steel'
  | 'daylight-studio';

export type MainDestinationId =
  | 'overview'
  | 'inputs'
  | 'processing'
  | 'routing'
  | 'operations'
  | 'intelligence';

export type WorkspaceId =
  | 'master-overview'
  | 'live-console'
  | 'mic-intelligence'
  | 'instrument-intelligence'
  | 'virtual-di'
  | 'dsp-eq'
  | 'feedback-detection'
  | 'acoustic-analyzer'
  | 'universal-routing'
  | 'speaker-management'
  | 'livestream-studio'
  | 'sound-check'
  | 'presets-profiles'
  | 'ai-engineer'
  | 'system-diagnostics';

export type HardwareProfileId =
  | 'auto-detected'
  | 'mg16xu-xonar'
  | 'dlive-dante-128'
  | 'studio-usb-8x8';

export interface AudioSourceBinding {
  kind: 'none' | 'mic' | 'desktop' | 'file' | 'tone' | 'virtual-cable';
  deviceId?: string;
  virtualCableId?: string;
  label: string;
  active: boolean;
  sampleRateHz?: number;
  channelCount?: number;
}

export interface VirtualCableNode {
  id: string;
  name: string;
  sourceKind: 'idle' | 'bus' | 'channel' | 'external-tab' | 'media-deck';
  sourceId?: string;
  sourceLabel: string;
  gainDb: number;
  active: boolean;
  monitorToMaster: boolean;
}

export interface DetectedHardwareDevice {
  deviceId: string;
  kind: 'audioinput' | 'audiooutput';
  label: string;
  groupId: string;
  driverClass: 'USB Audio' | 'PCIe / Line-In' | 'Virtual / Loopback' | 'Network Audio' | 'System Integrated';
  sampleRateHz: number;
  channelCount: number;
  isDefault: boolean;
  lastSeenAt: string;
}

export interface CapabilityDescriptor {
  preampGain: CapabilityLevel;
  phantomPower: CapabilityLevel;
  pad: CapabilityLevel;
  hardwareFaders: CapabilityLevel;
  softwareDsp: CapabilityLevel;
  hardwareMeters: CapabilityLevel;
  clockSync: CapabilityLevel;
  talkback: CapabilityLevel;
}

export interface AudioDevice {
  id: string;
  name: string;
  driver: 'ASIO' | 'WASAPI Shared' | 'Dante Network' | 'PCIe Line-In' | 'WebAudio Auto';
  role: 'Primary Capture/Playback' | 'Secondary Line Capture' | 'Network Stagebox';
  inputsCount: number;
  outputsCount: number;
  sampleRateHz: 44100 | 48000 | 96000;
  bufferSamples: 64 | 128 | 256 | 512;
  clockDomain: string;
  clockState: 'Locked Leader' | 'Locked Follower' | 'Free-Running (Drift Risk)' | 'Clock Fault';
  connected: boolean;
  capabilities: CapabilityDescriptor;
  notes: string;
}

export interface HardwareProfile {
  id: HardwareProfileId;
  name: string;
  subtitle: string;
  maxInputsLogical: number;
  maxBusesLogical: number;
  maxOutputsLogical: number;
  usbBridgeChannels: number;
  devices: AudioDevice[];
  wiringSummary: string;
}

export type FilterShape = 'bell' | 'low-shelf' | 'high-shelf' | 'notch' | 'band-pass';

export interface EqBand {
  id: string;
  label: string;
  enabled: boolean;
  shape: FilterShape;
  freqHz: number;
  gainDb: number;
  q: number;
}

export interface DynamicsConfig {
  gateEnabled: boolean;
  gateThresholdDb: number;
  gateRangeDb: number;
  compEnabled: boolean;
  compThresholdDb: number;
  compRatio: number;
  compAttackMs: number;
  compReleaseMs: number;
  compMakeupDb: number;
  limiterEnabled: boolean;
  limiterCeilingDb: number;
}

export type SourceCategory = 'vocal' | 'pulpit' | 'acoustic' | 'electric' | 'bass' | 'keys' | 'drums' | 'choir' | 'media';

export interface ChannelSendConfig {
  levelDb: number;
  preFader: boolean;
  enabled: boolean;
}

export interface ChannelStrip {
  id: string;
  number: number;
  name: string;
  shortName: string;
  category: SourceCategory;
  color: 'amber' | 'cyan' | 'emerald' | 'rose' | 'violet' | 'slate';
  physicalPort: string;
  micOrDiModel: string;
  sourceBinding?: AudioSourceBinding;
  hardwarePreampDb: number; // manual if external analog desk
  softwareTrimDb: number;
  phantom48v: boolean;
  polarityInvert: boolean;
  hpfEnabled: boolean;
  hpfFreqHz: number;
  eqEnabled: boolean;
  eqBands: EqBand[];
  geqEnabled: boolean;
  geqBands: number[]; // 31-band ISO 1/3-octave (-15 to +15 dB)
  dynamics: DynamicsConfig;
  delayMs: number;
  pan: number; // -100 to +100
  faderDb: number; // -75 to +10
  mute: boolean;
  solo: boolean;
  dcaGroup: 'A' | 'B' | 'C' | 'D' | null;
  muteGroup: 1 | 2 | 3 | 4 | null;
  assignMain: boolean;
  assignSub: boolean;
  assignBroadcast: boolean;
  sends: {
    mon1: ChannelSendConfig;
    mon2: ChannelSendConfig;
    iemChoir: ChannelSendConfig;
    fxReverb: ChannelSendConfig;
    livestream: ChannelSendConfig;
    [customBusKey: string]: ChannelSendConfig;
  };
}

export interface BusNode {
  id: string;
  name: string;
  shortName: string;
  kind: 'main' | 'sub' | 'monitor' | 'broadcast' | 'fx';
  faderDb: number;
  mute: boolean;
  solo: boolean;
  eqEnabled: boolean;
  eqBands?: EqBand[];
  limiterCeilingDb: number;
  assignedOutputId: string | null;
}

export type CrossoverFamily = 'Linkwitz-Riley' | 'Butterworth' | 'Bessel';

export type SpeakerRole =
  | 'Subwoofer'
  | 'Low-Mid'
  | 'High-Mid / Horn'
  | 'Front Fill'
  | 'Balcony Delay'
  | 'Monitor Wedge'
  | 'Broadcast / Stream'
  | 'Virtual Cable Out'
  | 'Custom Output';

export interface SpeakerBand {
  id: string;
  name: string;
  role: SpeakerRole;
  physicalConnector: string;
  connectorVerified: boolean;
  sourceBusId: string;
  hpfHz: number;
  hpfSlope: 12 | 24 | 48;
  lpfHz: number;
  lpfSlope: 12 | 24 | 48;
  crossoverBypass?: boolean;
  family: CrossoverFamily;
  eqEnabled?: boolean;
  eqBands?: EqBand[];
  gainDb: number;
  delayMs: number;
  polarityInvert: boolean;
  limiterThresholdDb: number;
  mute: boolean;
  outputSinkKind?: 'master-mix' | 'device-sink' | 'virtual-cable';
  outputDeviceId?: string;
  virtualCableId?: string;
  subBoostEnabled?: boolean;
  subBoostFreqHz?: number;
  subBoostGainDb?: number;
}

export interface EqPreset {
  id: string;
  name: string;
  category: string;
  hpfEnabled: boolean;
  hpfFreqHz: number;
  eqBands: { freqHz: number; gainDb: number; q: number }[];
  geqOffsets: Record<number, number>;
}

export interface VirtualDiState {
  topology: 'without-physical-di' | 'with-physical-di';
  sourceChannelId: string;
  isolatedRouteLabel: string;
  duplicatedDryWarningConfirmed: boolean;
  bypass: boolean;
  abSlot: 'A' | 'B';
  inputTrimDb: number;
  hpfHz: number;
  subHarmonicBoostDb: number;
  midScoopDb: number;
  presenceDb: number;
  compThresholdDb: number;
  compRatio: number;
  transientAttack: number; // -50 to +50
  tubeSaturationPct: number; // 0 to 100
  limiterCeilingDb: number;
  outputGainDb: number;
}

export interface FeedbackIncident {
  id: string;
  channelId: string;
  freqHz: number;
  levelDb: number;
  qEstimate: number;
  confidence: number;
  status: 'risk_predicted' | 'feedback_detected' | 'suppression_applied_verified' | 'dismissed';
  detectedAt: string;
  notchProposedDb: number;
}

export interface SoundCheckItem {
  id: string;
  stage: string;
  targetNodeId: string;
  description: string;
  method: 'software_measured' | 'manual_confirmed' | 'not_testable';
  status: 'pass' | 'warning' | 'fail' | 'pending' | 'not_testable';
  measuredValue: string;
  requiresLiveToneAuth?: boolean;
}

export interface SceneProfile {
  id: string;
  name: string;
  serviceType: string;
  updatedAt: string;
  version: number;
  description: string;
  channelFaders: Record<string, number>;
  channelMutes: Record<string, boolean>;
  channelHpf: Record<string, number>;
  busFaders: Record<string, number>;
  virtualDiSaturation: number;
}

export interface AiProposal {
  id: string;
  title: string;
  category: string;
  evidence: string;
  affectedNodeIds: string[];
  confidence: number;
  expectedChange: string;
  potentialImpact: string;
  requiresPhysicalAction: boolean;
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: string;
  patch?: {
    channelId?: string;
    hpfEnabled?: boolean;
    hpfFreq?: number;
    faderDeltaDb?: number;
    eqBandIndex?: number;
    eqGainDb?: number;
    eqFreqHz?: number;
    compThresholdDb?: number;
  };
}

export interface StructuredEvent {
  id: string;
  timestamp: string;
  family: 'device' | 'graph' | 'dsp' | 'feedback' | 'scene' | 'soundcheck' | 'ai' | 'recovery';
  severity: 'info' | 'warning' | 'critical';
  service: string;
  graphVersion: number;
  nodeId?: string;
  message: string;
}

export interface MeterReading {
  nodeId: string;
  inputPeakDbfs: number;
  inputRmsDbfs: number;
  peakDbfs: number;
  rmsDbfs: number;
  peakHoldDbfs: number;
  peakHoldClipped: boolean;
  noiseFloorDbfs: number;
  crestFactorDb: number;
  fundamentalHz: number;
  clipping: boolean;
  gainReductionDb: number;
  gainReductionHistory: number[];
  signalPresent: boolean;
  source: MeasurementSource;
  graphVersion: number;
}

export interface GraphTraceStage {
  nodeId: string;
  label: string;
  domain: 'hardware' | 'software' | 'monitoring';
  connectionKind: 'analog' | 'digital' | 'software' | 'monitoring';
  status: 'active' | 'muted' | 'bypassed' | 'manual' | 'fault';
  latencyMs: number;
  meter?: MeterReading;
  note: string;
}

export interface GraphTraceResult {
  targetId: string;
  direction: 'forward' | 'reverse' | 'both';
  graphVersion: number;
  generatedAt: string;
  upstream: GraphTraceStage[];
  selected: GraphTraceStage;
  downstream: GraphTraceStage[];
  warnings: string[];
}
