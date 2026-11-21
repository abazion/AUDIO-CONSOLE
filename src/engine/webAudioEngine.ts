import type {
  AudioSourceBinding,
  BusNode,
  ChannelStrip,
  CrossoverFamily,
  DetectedHardwareDevice,
  EqBand,
  MeterReading,
  SpeakerBand,
  VirtualCableNode,
  VirtualDiState,
} from './types';
import {
  analyzeChannelSpectrumFft,
  DEFAULT_INTELLIGENCE_CONFIG,
  type AudioIntelligenceConfig,
  type ChannelAcousticAnalysis,
  type SystemIntelligenceSummary,
} from './dspIntelligence';

export function dbToGain(db: number): number {
  if (db <= -75) return 0;
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 0.0001) return -80;
  return Math.max(-80, Math.min(12, 20 * Math.log10(gain)));
}

export const ISO_31_CENTERS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500,
  16000, 20000,
];

function eqShapeToBiquadType(shape: EqBand['shape']): BiquadFilterType {
  switch (shape) {
    case 'low-shelf':
      return 'lowshelf';
    case 'high-shelf':
      return 'highshelf';
    case 'notch':
      return 'notch';
    case 'band-pass':
      return 'bandpass';
    default:
      return 'peaking';
  }
}

export function computeChannelEqResponseDb(
  freqHz: number,
  hpfEnabled: boolean,
  hpfFreqHz: number,
  eqEnabled: boolean,
  bands: EqBand[],
  geqEnabled = false,
  geqBands?: number[]
): number {
  let db = 0;

  if (hpfEnabled && hpfFreqHz > 10) {
    const ratio = freqHz / hpfFreqHz;
    const magSq = Math.pow(ratio, 4) / (1 + Math.pow(ratio, 4));
    db += 10 * Math.log10(Math.max(1e-7, magSq));
  }

  if (geqEnabled && geqBands && geqBands.length === 31) {
    for (let i = 0; i < 31; i++) {
      const g = geqBands[i];
      if (Math.abs(g) < 0.05) continue;
      const logDist = Math.log2(Math.max(0.01, freqHz / ISO_31_CENTERS[i]));
      db += g * Math.exp(-Math.pow(logDist / 0.28, 2));
    }
  }

  if (!eqEnabled) return Math.max(-30, Math.min(24, db));

  for (const band of bands) {
    if (!band.enabled) continue;
    const f0 = Math.max(20, Math.min(20000, band.freqHz));
    const q = Math.max(0.3, Math.min(16, band.q));
    const gain = band.gainDb;
    const ratio = freqHz / f0;
    const logDist = Math.log2(Math.max(0.01, ratio));

    if (band.shape === 'bell') {
      const bandwidth = 1 / q;
      const bell = Math.exp(-Math.pow(logDist / (bandwidth * 0.72), 2));
      db += gain * bell;
    } else if (band.shape === 'notch') {
      const bandwidth = 1 / (q * 1.4);
      const notch = Math.exp(-Math.pow(logDist / bandwidth, 2));
      db += Math.min(-0.5, -Math.abs(gain || 12)) * notch;
    } else if (band.shape === 'low-shelf') {
      const t = 1 / (1 + Math.pow(ratio, 2 * q));
      db += gain * t;
    } else if (band.shape === 'high-shelf') {
      const t = 1 / (1 + Math.pow(1 / Math.max(0.001, ratio), 2 * q));
      db += gain * t;
    } else if (band.shape === 'band-pass') {
      const bandwidth = 1 / q;
      const bp = Math.exp(-Math.pow(logDist / (bandwidth * 0.8), 2));
      db += -18 * (1 - bp) + gain * bp;
    }
  }

  return Math.max(-30, Math.min(24, db));
}

export function computeCrossoverResponseDb(
  freqHz: number,
  band: SpeakerBand
): { magDb: number; phaseDeg: number } {
  const orderFromSlope = (slope: 12 | 24 | 48) => slope / 6;
  const familyOffset = (family: CrossoverFamily) =>
    family === 'Linkwitz-Riley' ? 0 : family === 'Butterworth' ? 1.5 : -1.2;

  const hpfOrder = orderFromSlope(band.hpfSlope);
  const lpfOrder = orderFromSlope(band.lpfSlope);

  const hpRatio = freqHz / Math.max(16, band.hpfHz);
  const hpMagSq = band.crossoverBypass
    ? 1
    : Math.pow(hpRatio, 2 * hpfOrder) / (1 + Math.pow(hpRatio, 2 * hpfOrder));

  const lpRatio = Math.max(20, band.lpfHz) / freqHz;
  const lpMagSq = band.crossoverBypass
    ? 1
    : Math.pow(lpRatio, 2 * lpfOrder) / (1 + Math.pow(lpRatio, 2 * lpfOrder));

  const subBoost =
    band.subBoostEnabled && (band.subBoostGainDb ?? 0) > 0
      ? (band.subBoostGainDb ?? 0) *
        Math.exp(
          -Math.pow(
            Math.log2(Math.max(0.05, freqHz / (band.subBoostFreqHz ?? 44))) / 0.55,
            2
          )
        )
      : 0;

  let eqContrib = 0;
  if (band.eqEnabled !== false && band.eqBands && band.eqBands.length > 0) {
    eqContrib = computeChannelEqResponseDb(freqHz, false, 20, true, band.eqBands, false);
  }

  const magDb =
    band.gainDb +
    subBoost +
    eqContrib +
    10 * Math.log10(Math.max(1e-7, hpMagSq)) +
    10 * Math.log10(Math.max(1e-7, lpMagSq)) +
    familyOffset(band.family) * 0.15;

  const phaseShift =
    (band.polarityInvert ? 180 : 0) +
    (band.crossoverBypass
      ? 0
      : Math.atan2(1, Math.pow(hpRatio, hpfOrder * 0.5)) * (180 / Math.PI) -
        Math.atan2(1, Math.pow(lpRatio, lpfOrder * 0.5)) * (180 / Math.PI));

  return {
    magDb: Math.max(-36, Math.min(18, magDb)),
    phaseDeg: ((phaseShift + 180) % 360) - 180,
  };
}

interface AttachedChannelSource {
  kind: AudioSourceBinding['kind'];
  stream?: MediaStream;
  sourceNode?: AudioNode;
  audioElement?: HTMLAudioElement;
  objectUrl?: string;
  toneOsc?: OscillatorNode;
  toneNoise?: AudioBufferSourceNode;
  toneGain?: GainNode;
  virtualCableId?: string;
}

interface ChannelAudioNodes {
  inputSumGain: GainNode;
  preAnalyser: AnalyserNode;
  trimGain: GainNode;
  autoGain: GainNode;
  polarityGain: GainNode;
  delayNode: DelayNode;
  hpf: BiquadFilterNode;
  eqFilters: BiquadFilterNode[];
  eqFilterCount: number;
  geqFilters: BiquadFilterNode[];
  comp: DynamicsCompressorNode;
  faderGain: GainNode;
  panner: StereoPannerNode;
  postAnalyser: AnalyserNode;
  sendGains: Map<string, { gain: GainNode; preFader: boolean }>;
  preTimeDomain: Float32Array<ArrayBuffer>;
  preFreqData: Float32Array<ArrayBuffer>;
  postTimeDomain: Float32Array<ArrayBuffer>;
}

interface BusAudioNodes {
  sumGain: GainNode;
  eqFilters: BiquadFilterNode[];
  eqFilterCount: number;
  limiter: DynamicsCompressorNode;
  faderGain: GainNode;
  analyser: AnalyserNode;
  streamDest: MediaStreamAudioDestinationNode;
  timeDomain: Float32Array<ArrayBuffer>;
}

interface SpeakerAudioNodes {
  inputGain: GainNode;
  sourceBusId: string;
  hpfFilters: BiquadFilterNode[];
  hpfStagesCount: number;
  lpfFilters: BiquadFilterNode[];
  lpfStagesCount: number;
  eqFilters: BiquadFilterNode[];
  eqFilterCount: number;
  subBoost: BiquadFilterNode;
  polarityGain: GainNode;
  delayNode: DelayNode;
  gainNode: GainNode;
  panner: StereoPannerNode;
  limiter: DynamicsCompressorNode;
  analyser: AnalyserNode;
  sinkKind: 'master-mix' | 'device-sink' | 'virtual-cable';
  sinkTargetId: string;
  sinkStreamDest?: MediaStreamAudioDestinationNode;
  sinkAudioEl?: HTMLAudioElement;
  timeDomain: Float32Array<ArrayBuffer>;
}

interface VirtualCableAudioNodes {
  inputSum: GainNode;
  gainNode: GainNode;
  analyser: AnalyserNode;
  streamDest: MediaStreamAudioDestinationNode;
  monitorGain: GainNode;
  attachedBusTap?: { busId: string; tapGain: GainNode };
  attachedChannelTap?: { channelId: string; tapGain: GainNode };
  externalSource?: AttachedChannelSource;
  timeDomain: Float32Array<ArrayBuffer>;
}

export interface AudioClockTelemetry {
  sampleRateHz: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  maxOutputChannels: number;
  state: string;
}

export interface LiveFeedbackCandidate {
  channelId: string;
  freqHz: number;
  levelDb: number;
  qEstimate: number;
  confidence: number;
}

function classifyDriver(label: string): DetectedHardwareDevice['driverClass'] {
  const lower = label.toLowerCase();
  if (
    lower.includes('blackhole') ||
    lower.includes('vb-cable') ||
    lower.includes('virtual') ||
    lower.includes('loopback') ||
    lower.includes('stereo mix') ||
    lower.includes('pulseaudio') ||
    lower.includes('monitor of') ||
    lower.includes('cable output') ||
    lower.includes('cable input')
  ) {
    return 'Virtual / Loopback';
  }
  if (
    lower.includes('dante') ||
    lower.includes('aes67') ||
    lower.includes('ndi') ||
    lower.includes('network')
  ) {
    return 'Network Audio';
  }
  if (
    lower.includes('usb') ||
    lower.includes('yamaha') ||
    lower.includes('mg16') ||
    lower.includes('scarlett') ||
    lower.includes('focusrite') ||
    lower.includes('behringer') ||
    lower.includes('presonus') ||
    lower.includes('allen') ||
    lower.includes('midas') ||
    lower.includes('steinberg') ||
    lower.includes('motu') ||
    lower.includes('rme') ||
    lower.includes('shure') ||
    lower.includes('rode')
  ) {
    return 'USB Audio';
  }
  if (lower.includes('xonar') || lower.includes('line in') || lower.includes('pcie') || lower.includes('high definition audio')) {
    return 'PCIe / Line-In';
  }
  return 'System Integrated';
}

function detectFundamentalFromFft(freqData: Float32Array<ArrayBuffer>, sampleRateHz: number): number {
  const nyquist = sampleRateHz / 2;
  const binCount = freqData.length;
  const minIdx = Math.max(1, Math.floor((35 / nyquist) * binCount));
  const maxIdx = Math.min(binCount - 2, Math.ceil((2200 / nyquist) * binCount));
  let bestIdx = -1;
  let bestVal = -64;
  for (let i = minIdx; i <= maxIdx; i++) {
    const val = freqData[i];
    if (Number.isFinite(val) && val > bestVal) {
      bestVal = val;
      bestIdx = i;
    }
  }
  if (bestIdx <= 0) return 0;
  // Parabolic interpolation for sub-bin accuracy
  const left = freqData[bestIdx - 1] ?? bestVal;
  const right = freqData[bestIdx + 1] ?? bestVal;
  const denom = left - 2 * bestVal + right;
  const offset = Math.abs(denom) > 1e-4 ? (0.5 * (left - right)) / denom : 0;
  const interpIdx = Math.max(1, bestIdx + Math.max(-0.5, Math.min(0.5, offset)));
  return Math.round((interpIdx / binCount) * nyquist);
}

class RealTimeConsoleAudioEngine {
  private ctx: AudioContext | null = null;
  private masterMonitorSum: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterFreqData: Float32Array<ArrayBuffer> | null = null;
  private masterTimeData: Float32Array<ArrayBuffer> | null = null;

  private testOsc: OscillatorNode | null = null;
  private testNoise: AudioBufferSourceNode | null = null;
  private testGain: GainNode | null = null;

  private channelNodes = new Map<string, ChannelAudioNodes>();
  private channelSources = new Map<string, AttachedChannelSource>();
  private busNodes = new Map<string, BusAudioNodes>();
  private speakerNodes = new Map<string, SpeakerAudioNodes>();
  private virtualCableNodes = new Map<string, VirtualCableAudioNodes>();

  private peakHolds = new Map<string, { value: number; clipped: boolean }>();
  private noiseFloorMap = new Map<string, number>();
  private grHistoryMap = new Map<string, number[]>();
  private duganSmoothedPower = new Map<string, number>();
  private autoTrimSmoothedDb = new Map<string, number>();
  private spectrumBins = new Float32Array(64);
  private roomSpectrumBins = new Float32Array(64);

  private activeRecorder: {
    recorder: MediaRecorder;
    chunks: Blob[];
    targetId: string;
    startedAt: number;
  } | null = null;

  public isAudioUnlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  public getAudioClockTelemetry(): AudioClockTelemetry {
    const sampleRateHz = this.ctx?.sampleRate ?? 48000;
    const baseLatencyMs = Number((((this.ctx?.baseLatency ?? 0.0053) * 1000)).toFixed(2));
    const outputLatencyMs = Number((((this.ctx?.outputLatency ?? 0.01) * 1000)).toFixed(2));
    return {
      sampleRateHz,
      baseLatencyMs,
      outputLatencyMs,
      maxOutputChannels: this.ctx?.destination.maxChannelCount ?? 2,
      state: this.ctx?.state ?? 'uninitialized',
    };
  }

  public async enumerateAndClassifyHardware(): Promise<DetectedHardwareDevice[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const clock = this.getAudioClockTelemetry();
    const nowIso = new Date().toISOString();
    const audioDevices: DetectedHardwareDevice[] = [];
    let inputIndex = 1;
    let outputIndex = 1;

    for (const d of devices) {
      if (d.kind !== 'audioinput' && d.kind !== 'audiooutput') continue;
      const isDefault = d.deviceId === 'default' || d.deviceId === 'communications';
      const fallbackLabel =
        d.kind === 'audioinput'
          ? `Audio Input ${inputIndex++} (Grant permission for OS device label)`
          : `Audio Output ${outputIndex++} (Host Playback Endpoint)`;
      const label = d.label && d.label.trim().length > 0 ? d.label : fallbackLabel;
      audioDevices.push({
        deviceId: d.deviceId || `${d.kind}-${audioDevices.length}`,
        kind: d.kind,
        label,
        groupId: d.groupId || 'host-default',
        driverClass: classifyDriver(label),
        sampleRateHz: clock.sampleRateHz,
        channelCount: d.kind === 'audiooutput' ? Math.max(2, clock.maxOutputChannels) : 2,
        isDefault,
        lastSeenAt: nowIso,
      });
    }
    return audioDevices;
  }

  public async unlockHardwareLabelsViaMicProbe(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  }

  public async setOutputSinkDevice(deviceId: string): Promise<boolean> {
    if (!this.ctx) return false;
    const sinkCapable = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (typeof sinkCapable.setSinkId !== 'function') {
      return false;
    }
    await sinkCapable.setSinkId(deviceId === 'default' ? '' : deviceId);
    return true;
  }

  public async unlockAndStart(
    channels: ChannelStrip[],
    buses: BusNode[],
    speakers?: SpeakerBand[],
    virtualCables?: VirtualCableNode[],
    virtualDi?: VirtualDiState
  ): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });

      this.masterMonitorSum = this.ctx.createGain();
      this.masterMonitorSum.gain.value = 1.0;

      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 2048;
      this.masterAnalyser.smoothingTimeConstant = 0.72;
      this.masterFreqData = new Float32Array(new ArrayBuffer(this.masterAnalyser.frequencyBinCount * 4));
      this.masterTimeData = new Float32Array(new ArrayBuffer(this.masterAnalyser.fftSize * 4));

      this.masterMonitorSum.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.syncGraph(channels, buses, virtualDi, speakers ?? [], virtualCables ?? []);
    return this.ctx.state === 'running';
  }

  public async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  }

  public resetPeakHold(nodeId?: string): void {
    if (nodeId) {
      this.peakHolds.delete(nodeId);
    } else {
      this.peakHolds.clear();
    }
  }

  private createBusChain(bus: BusNode): BusAudioNodes {
    const ctx = this.ctx!;
    const sumGain = ctx.createGain();
    sumGain.gain.value = 1.0;

    const eqBands = bus.eqBands ?? [];
    const eqFilters = eqBands.map((band) => {
      const f = ctx.createBiquadFilter();
      f.type = eqShapeToBiquadType(band.shape);
      f.frequency.value = Math.max(20, Math.min(20000, band.freqHz));
      f.gain.value = bus.eqEnabled && band.enabled ? band.gainDb : 0;
      f.Q.value = Math.max(0.2, Math.min(20, band.q));
      return f;
    });

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = bus.limiterCeilingDb;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;

    const faderGain = ctx.createGain();
    faderGain.gain.value = bus.mute ? 0 : dbToGain(bus.faderDb);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;

    const streamDest = ctx.createMediaStreamDestination();

    let prev: AudioNode = sumGain;
    for (const eq of eqFilters) {
      prev.connect(eq);
      prev = eq;
    }
    prev.connect(limiter);
    limiter.connect(faderGain);
    faderGain.connect(analyser);
    analyser.connect(streamDest);

    const nodes: BusAudioNodes = {
      sumGain,
      eqFilters,
      eqFilterCount: eqFilters.length,
      limiter,
      faderGain,
      analyser,
      streamDest,
      timeDomain: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)),
    };
    this.busNodes.set(bus.id, nodes);
    return nodes;
  }

  private rebuildBusEq(bus: BusNode, nodes: BusAudioNodes): void {
    if (!this.ctx) return;
    try {
      nodes.sumGain.disconnect();
      nodes.eqFilters.forEach((f) => f.disconnect());
    } catch {
      // safe disconnect
    }
    const eqBands = bus.eqBands ?? [];
    nodes.eqFilters = eqBands.map((band) => {
      const f = this.ctx!.createBiquadFilter();
      f.type = eqShapeToBiquadType(band.shape);
      f.frequency.value = Math.max(20, Math.min(20000, band.freqHz));
      f.gain.value = bus.eqEnabled && band.enabled ? band.gainDb : 0;
      f.Q.value = Math.max(0.2, Math.min(20, band.q));
      return f;
    });
    nodes.eqFilterCount = nodes.eqFilters.length;
    let prev: AudioNode = nodes.sumGain;
    for (const eq of nodes.eqFilters) {
      prev.connect(eq);
      prev = eq;
    }
    prev.connect(nodes.limiter);
  }

  private createChannelChain(ch: ChannelStrip): ChannelAudioNodes {
    const ctx = this.ctx!;
    const inputSumGain = ctx.createGain();
    inputSumGain.gain.value = 1.0;

    const preAnalyser = ctx.createAnalyser();
    preAnalyser.fftSize = 1024;
    preAnalyser.smoothingTimeConstant = 0.65;

    const trimGain = ctx.createGain();
    trimGain.gain.value = dbToGain(ch.softwareTrimDb);

    const autoGain = ctx.createGain();
    autoGain.gain.value = 1.0;

    const polarityGain = ctx.createGain();
    polarityGain.gain.value = ch.polarityInvert ? -1 : 1;

    const delayNode = ctx.createDelay(0.25);
    delayNode.delayTime.value = Math.max(0, Math.min(0.2, ch.delayMs / 1000));

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = ch.hpfEnabled ? ch.hpfFreqHz : 12;

    const eqFilters = ch.eqBands.map((band) => {
      const f = ctx.createBiquadFilter();
      f.type = eqShapeToBiquadType(band.shape);
      f.frequency.value = Math.max(20, Math.min(20000, band.freqHz));
      f.gain.value = ch.eqEnabled && band.enabled ? band.gainDb : 0;
      f.Q.value = Math.max(0.2, Math.min(20, band.q));
      return f;
    });

    const geqFilters = ISO_31_CENTERS.map((freq, idx) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = Math.min(20000, freq);
      f.Q.value = 4.31;
      f.gain.value = ch.geqEnabled ? (ch.geqBands[idx] ?? 0) : 0;
      return f;
    });

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = ch.dynamics.compEnabled ? ch.dynamics.compThresholdDb : 0;
    comp.ratio.value = ch.dynamics.compEnabled ? ch.dynamics.compRatio : 1;

    const faderGain = ctx.createGain();
    faderGain.gain.value = ch.mute ? 0 : dbToGain(ch.faderDb);

    const panner = ctx.createStereoPanner();
    panner.pan.value = ch.pan / 100;

    const postAnalyser = ctx.createAnalyser();
    postAnalyser.fftSize = 256;

    inputSumGain.connect(preAnalyser);
    preAnalyser.connect(trimGain);
    trimGain.connect(autoGain);
    autoGain.connect(polarityGain);
    polarityGain.connect(delayNode);
    delayNode.connect(hpf);

    let prev: AudioNode = hpf;
    for (const eq of eqFilters) {
      prev.connect(eq);
      prev = eq;
    }
    for (const geq of geqFilters) {
      prev.connect(geq);
      prev = geq;
    }
    prev.connect(comp);
    comp.connect(faderGain);
    faderGain.connect(panner);
    panner.connect(postAnalyser);

    const nodes: ChannelAudioNodes = {
      inputSumGain,
      preAnalyser,
      trimGain,
      autoGain,
      polarityGain,
      delayNode,
      hpf,
      eqFilters,
      eqFilterCount: eqFilters.length,
      geqFilters,
      comp,
      faderGain,
      panner,
      postAnalyser,
      sendGains: new Map(),
      preTimeDomain: new Float32Array(new ArrayBuffer(preAnalyser.fftSize * 4)),
      preFreqData: new Float32Array(new ArrayBuffer(preAnalyser.frequencyBinCount * 4)),
      postTimeDomain: new Float32Array(new ArrayBuffer(postAnalyser.fftSize * 4)),
    };
    this.channelNodes.set(ch.id, nodes);
    return nodes;
  }

  private rebuildChannelEq(ch: ChannelStrip, nodes: ChannelAudioNodes): void {
    if (!this.ctx) return;
    try {
      nodes.hpf.disconnect();
      nodes.eqFilters.forEach((f) => f.disconnect());
    } catch {
      // safe disconnect
    }
    nodes.eqFilters = ch.eqBands.map((band) => {
      const f = this.ctx!.createBiquadFilter();
      f.type = eqShapeToBiquadType(band.shape);
      f.frequency.value = Math.max(20, Math.min(20000, band.freqHz));
      f.gain.value = ch.eqEnabled && band.enabled ? band.gainDb : 0;
      f.Q.value = Math.max(0.2, Math.min(20, band.q));
      return f;
    });
    nodes.eqFilterCount = nodes.eqFilters.length;
    let prev: AudioNode = nodes.hpf;
    for (const eq of nodes.eqFilters) {
      prev.connect(eq);
      prev = eq;
    }
    if (nodes.geqFilters.length > 0) {
      prev.connect(nodes.geqFilters[0]);
    } else {
      prev.connect(nodes.comp);
    }
  }

  private createSpeakerChain(spk: SpeakerBand): SpeakerAudioNodes {
    const ctx = this.ctx!;
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1.0;

    const hpfStagesCount = spk.hpfSlope === 48 ? 4 : spk.hpfSlope === 24 ? 2 : 1;
    const lpfStagesCount = spk.lpfSlope === 48 ? 4 : spk.lpfSlope === 24 ? 2 : 1;

    const hpfFilters = Array.from({ length: hpfStagesCount }, () => {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = spk.crossoverBypass ? 12 : Math.max(16, spk.hpfHz);
      f.Q.value = spk.family === 'Linkwitz-Riley' ? 0.707 : spk.family === 'Bessel' ? 0.577 : 0.707;
      return f;
    });

    const lpfFilters = Array.from({ length: lpfStagesCount }, () => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = spk.crossoverBypass ? 20000 : Math.min(20000, Math.max(40, spk.lpfHz));
      f.Q.value = spk.family === 'Linkwitz-Riley' ? 0.707 : spk.family === 'Bessel' ? 0.577 : 0.707;
      return f;
    });

    const eqBands = spk.eqBands ?? [];
    const eqFilters = eqBands.map((band) => {
      const f = ctx.createBiquadFilter();
      f.type = eqShapeToBiquadType(band.shape);
      f.frequency.value = Math.max(20, Math.min(20000, band.freqHz));
      f.gain.value = spk.eqEnabled !== false && band.enabled ? band.gainDb : 0;
      f.Q.value = Math.max(0.2, Math.min(20, band.q));
      return f;
    });

    const subBoost = ctx.createBiquadFilter();
    subBoost.type = 'peaking';
    subBoost.frequency.value = spk.subBoostFreqHz ?? 44;
    subBoost.Q.value = 0.9;
    subBoost.gain.value = spk.subBoostEnabled ? (spk.subBoostGainDb ?? 0) : 0;

    const polarityGain = ctx.createGain();
    polarityGain.gain.value = spk.polarityInvert ? -1 : 1;

    const delayNode = ctx.createDelay(0.25);
    delayNode.delayTime.value = Math.max(0, Math.min(0.2, spk.delayMs / 1000));

    const gainNode = ctx.createGain();
    gainNode.gain.value = spk.mute ? 0 : dbToGain(spk.gainDb);

    const panner = ctx.createStereoPanner();
    const lowerName = spk.name.toLowerCase();
    panner.pan.value = lowerName.includes('left') ? -0.6 : lowerName.includes('right') ? 0.6 : 0;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = spk.limiterThresholdDb;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;

    let prev: AudioNode = inputGain;
    for (const f of hpfFilters) {
      prev.connect(f);
      prev = f;
    }
    for (const f of lpfFilters) {
      prev.connect(f);
      prev = f;
    }
    for (const f of eqFilters) {
      prev.connect(f);
      prev = f;
    }
    prev.connect(subBoost);
    subBoost.connect(polarityGain);
    polarityGain.connect(delayNode);
    delayNode.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(limiter);
    limiter.connect(analyser);

    const nodes: SpeakerAudioNodes = {
      inputGain,
      sourceBusId: spk.sourceBusId,
      hpfFilters,
      hpfStagesCount,
      lpfFilters,
      lpfStagesCount,
      eqFilters,
      eqFilterCount: eqFilters.length,
      subBoost,
      polarityGain,
      delayNode,
      gainNode,
      panner,
      limiter,
      analyser,
      sinkKind: spk.outputSinkKind ?? 'master-mix',
      sinkTargetId: spk.outputDeviceId ?? spk.virtualCableId ?? '',
      timeDomain: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)),
    };

    const srcBus = this.busNodes.get(spk.sourceBusId);
    if (srcBus) {
      srcBus.analyser.connect(inputGain);
    }

    this.connectSpeakerOutputSink(spk, nodes);
    this.speakerNodes.set(spk.id, nodes);
    return nodes;
  }

  private connectSpeakerOutputSink(spk: SpeakerBand, nodes: SpeakerAudioNodes): void {
    if (!this.ctx) return;
    try {
      nodes.analyser.disconnect();
    } catch {
      // safe disconnect
    }
    if (nodes.sinkAudioEl) {
      nodes.sinkAudioEl.pause();
      nodes.sinkAudioEl.srcObject = null;
      nodes.sinkAudioEl = undefined;
    }
    nodes.sinkStreamDest = undefined;

    const sinkKind = spk.outputSinkKind ?? 'master-mix';
    nodes.sinkKind = sinkKind;
    nodes.sinkTargetId = spk.outputDeviceId ?? spk.virtualCableId ?? '';

    if (sinkKind === 'virtual-cable' && spk.virtualCableId) {
      const vc = this.virtualCableNodes.get(spk.virtualCableId);
      if (vc) {
        nodes.analyser.connect(vc.inputSum);
        return;
      }
    }

    if (sinkKind === 'device-sink' && spk.outputDeviceId && typeof Audio !== 'undefined') {
      const streamDest = this.ctx.createMediaStreamDestination();
      nodes.analyser.connect(streamDest);
      const audioEl = new Audio();
      audioEl.srcObject = streamDest.stream;
      const sinkCapable = audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (typeof sinkCapable.setSinkId === 'function') {
        void sinkCapable.setSinkId(spk.outputDeviceId === 'default' ? '' : spk.outputDeviceId).catch(() => {});
      }
      void audioEl.play().catch(() => {});
      nodes.sinkStreamDest = streamDest;
      nodes.sinkAudioEl = audioEl;
      return;
    }

    if (this.masterMonitorSum) {
      nodes.analyser.connect(this.masterMonitorSum);
    }
  }

  private rebuildSpeakerChain(spk: SpeakerBand): void {
    const existing = this.speakerNodes.get(spk.id);
    if (existing) {
      try {
        existing.inputGain.disconnect();
        existing.hpfFilters.forEach((f) => f.disconnect());
        existing.lpfFilters.forEach((f) => f.disconnect());
        existing.eqFilters.forEach((f) => f.disconnect());
        existing.analyser.disconnect();
      } catch {
        // safe disconnect
      }
      if (existing.sinkAudioEl) {
        existing.sinkAudioEl.pause();
        existing.sinkAudioEl.srcObject = null;
      }
      this.speakerNodes.delete(spk.id);
    }
    this.createSpeakerChain(spk);
  }

  private ensureVirtualCableChain(vc: VirtualCableNode): VirtualCableAudioNodes {
    const existing = this.virtualCableNodes.get(vc.id);
    if (existing) return existing;
    const ctx = this.ctx!;
    const inputSum = ctx.createGain();
    inputSum.gain.value = 1.0;

    const gainNode = ctx.createGain();
    gainNode.gain.value = vc.active ? dbToGain(vc.gainDb) : 0;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;

    const streamDest = ctx.createMediaStreamDestination();

    const monitorGain = ctx.createGain();
    monitorGain.gain.value = vc.monitorToMaster && vc.active ? 1.0 : 0.0;

    inputSum.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(streamDest);
    analyser.connect(monitorGain);
    if (this.masterMonitorSum) {
      monitorGain.connect(this.masterMonitorSum);
    }

    const nodes: VirtualCableAudioNodes = {
      inputSum,
      gainNode,
      analyser,
      streamDest,
      monitorGain,
      timeDomain: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)),
    };
    this.virtualCableNodes.set(vc.id, nodes);
    return nodes;
  }

  public wouldVirtualCableCreateCycle(
    cableId: string,
    candidateChannelId: string,
    channels: ChannelStrip[],
    virtualCables: VirtualCableNode[]
  ): boolean {
    const cable = virtualCables.find((v) => v.id === cableId);
    if (!cable) return false;
    if (cable.sourceKind === 'channel' && cable.sourceId === candidateChannelId) {
      return true;
    }
    // Also guard if candidateChannel feeds a bus that feeds this cable, and this cable feeds candidateChannel
    if (cable.sourceKind === 'bus' && cable.sourceId) {
      const ch = channels.find((c) => c.id === candidateChannelId);
      if (!ch) return false;
      const busId = cable.sourceId;
      if (busId === 'bus-main' && ch.assignMain) return true;
      if (busId === 'bus-sub' && ch.assignSub) return true;
      if (busId === 'bus-stream' && (ch.assignBroadcast || ch.sends.livestream.enabled)) return true;
      if (busId === 'bus-mon1' && ch.sends.mon1.enabled) return true;
      if (busId === 'bus-mon2' && ch.sends.mon2.enabled) return true;
      if (busId === 'bus-iem' && ch.sends.iemChoir.enabled) return true;
      if (busId === 'bus-fx' && ch.sends.fxReverb.enabled) return true;
    }
    return false;
  }

  public detachChannelSource(channelId: string): void {
    const src = this.channelSources.get(channelId);
    if (!src) return;

    try {
      src.toneOsc?.stop();
      src.toneOsc?.disconnect();
      src.toneNoise?.stop();
      src.toneNoise?.disconnect();
      src.toneGain?.disconnect();
      src.sourceNode?.disconnect();
      if (src.virtualCableId) {
        const vcNodes = this.virtualCableNodes.get(src.virtualCableId);
        const chNodes = this.channelNodes.get(channelId);
        if (vcNodes && chNodes) {
          vcNodes.analyser.disconnect(chNodes.inputSumGain);
        }
      }
    } catch {
      // Safe cleanup even if node already disconnected
    }

    if (src.stream) {
      src.stream.getTracks().forEach((t) => t.stop());
    }
    if (src.audioElement) {
      src.audioElement.pause();
      src.audioElement.src = '';
    }
    if (src.objectUrl) {
      URL.revokeObjectURL(src.objectUrl);
    }

    this.channelSources.delete(channelId);
  }

  public getChannelSourceStatus(channelId: string): {
    connected: boolean;
    kind: AudioSourceBinding['kind'];
    playing: boolean;
  } {
    const src = this.channelSources.get(channelId);
    if (!src) return { connected: false, kind: 'none', playing: false };
    const playing =
      src.kind === 'file' ? Boolean(src.audioElement && !src.audioElement.paused) : true;
    return { connected: true, kind: src.kind, playing };
  }

  public toggleChannelFilePlayback(channelId: string): boolean {
    const src = this.channelSources.get(channelId);
    if (!src || src.kind !== 'file' || !src.audioElement) return false;
    if (src.audioElement.paused) {
      void src.audioElement.play();
      return true;
    } else {
      src.audioElement.pause();
      return false;
    }
  }

  public async attachMicToChannel(
    channelId: string,
    channels: ChannelStrip[],
    buses: BusNode[],
    deviceId?: string,
    fallbackLabel?: string,
    speakers?: SpeakerBand[],
    virtualCables?: VirtualCableNode[]
  ): Promise<AudioSourceBinding> {
    await this.unlockAndStart(channels, buses, speakers, virtualCables);
    if (!this.ctx) throw new Error('AudioContext failed to initialize');
    const nodes = this.channelNodes.get(channelId);
    if (!nodes) throw new Error(`Channel chain missing for ${channelId}`);

    this.detachChannelSource(channelId);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const audioTrack = stream.getAudioTracks()[0];
    const settings = audioTrack?.getSettings();
    const sourceNode = this.ctx.createMediaStreamSource(stream);
    sourceNode.connect(nodes.inputSumGain);

    this.channelSources.set(channelId, {
      kind: 'mic',
      stream,
      sourceNode,
    });

    return {
      kind: 'mic',
      deviceId: settings?.deviceId ?? deviceId,
      label: audioTrack?.label || fallbackLabel || 'Hardware Audio Input',
      active: true,
      sampleRateHz: settings?.sampleRate ?? this.ctx.sampleRate,
      channelCount: settings?.channelCount ?? 1,
    };
  }

  public async attachDesktopAudioToChannel(
    channelId: string,
    channels: ChannelStrip[],
    buses: BusNode[],
    onEnded?: () => void,
    speakers?: SpeakerBand[],
    virtualCables?: VirtualCableNode[]
  ): Promise<AudioSourceBinding> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Browser tab / system audio capture (getDisplayMedia) is not supported in this browser.');
    }

    await this.unlockAndStart(channels, buses, speakers, virtualCables);
    if (!this.ctx) throw new Error('AudioContext failed to initialize');
    const nodes = this.channelNodes.get(channelId);
    if (!nodes) throw new Error(`Channel chain missing for ${channelId}`);

    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } as MediaTrackConstraints,
      video: true,
    });

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(
        'No audio track was shared. Re-try and enable "Share tab audio" or "Share system audio".'
      );
    }

    stream.getVideoTracks().forEach((vt) => vt.stop());

    this.detachChannelSource(channelId);

    const primaryAudioTrack = audioTracks[0];
    const settings = primaryAudioTrack.getSettings();
    const audioOnlyStream = new MediaStream([primaryAudioTrack]);
    const sourceNode = this.ctx.createMediaStreamSource(audioOnlyStream);
    sourceNode.connect(nodes.inputSumGain);

    primaryAudioTrack.onended = () => {
      this.detachChannelSource(channelId);
      onEnded?.();
    };

    this.channelSources.set(channelId, {
      kind: 'desktop',
      stream: audioOnlyStream,
      sourceNode,
    });

    return {
      kind: 'desktop',
      label: primaryAudioTrack.label || 'Browser Tab / System Audio',
      active: true,
      sampleRateHz: settings.sampleRate ?? this.ctx.sampleRate,
      channelCount: settings.channelCount ?? 2,
    };
  }

  public async attachFileToChannel(
    channelId: string,
    file: File,
    channels: ChannelStrip[],
    buses: BusNode[],
    speakers?: SpeakerBand[],
    virtualCables?: VirtualCableNode[]
  ): Promise<AudioSourceBinding> {
    await this.unlockAndStart(channels, buses, speakers, virtualCables);
    if (!this.ctx) throw new Error('AudioContext failed to initialize');
    const nodes = this.channelNodes.get(channelId);
    if (!nodes) throw new Error(`Channel chain missing for ${channelId}`);

    this.detachChannelSource(channelId);

    const objectUrl = URL.createObjectURL(file);
    const audioEl = new Audio();
    audioEl.src = objectUrl;
    audioEl.loop = true;
    audioEl.crossOrigin = 'anonymous';

    const sourceNode = this.ctx.createMediaElementSource(audioEl);
    sourceNode.connect(nodes.inputSumGain);
    await audioEl.play();

    this.channelSources.set(channelId, {
      kind: 'file',
      sourceNode,
      audioElement: audioEl,
      objectUrl,
    });

    return {
      kind: 'file',
      label: file.name,
      active: true,
      sampleRateHz: this.ctx.sampleRate,
      channelCount: 2,
    };
  }

  public async attachToneToChannel(
    channelId: string,
    kind: 'pink' | 'sine1k' | 'sweep',
    gainDb: number,
    channels: ChannelStrip[],
    buses: BusNode[],
    speakers?: SpeakerBand[],
    virtualCables?: VirtualCableNode[]
  ): Promise<AudioSourceBinding> {
    await this.unlockAndStart(channels, buses, speakers, virtualCables);
    if (!this.ctx) throw new Error('AudioContext failed to initialize');
    const nodes = this.channelNodes.get(channelId);
    if (!nodes) throw new Error(`Channel chain missing for ${channelId}`);

    this.detachChannelSource(channelId);

    const toneGain = this.ctx.createGain();
    toneGain.gain.setTargetAtTime(dbToGain(gainDb), this.ctx.currentTime, 0.015);
    toneGain.connect(nodes.inputSumGain);

    if (kind === 'pink') {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.12;
        b6 = white * 0.115926;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      noise.connect(toneGain);
      noise.start();
      this.channelSources.set(channelId, {
        kind: 'tone',
        toneNoise: noise,
        toneGain,
      });
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'sine1k' ? 1000 : 80, this.ctx.currentTime);
      if (kind === 'sweep') {
        osc.frequency.exponentialRampToValueAtTime(8000, this.ctx.currentTime + 4);
      }
      osc.connect(toneGain);
      osc.start();
      this.channelSources.set(channelId, {
        kind: 'tone',
        toneOsc: osc,
        toneGain,
      });
    }

    return {
      kind: 'tone',
      label: `Calibration ${kind.toUpperCase()} @ ${gainDb} dBFS`,
      active: true,
      sampleRateHz: this.ctx.sampleRate,
      channelCount: 1,
    };
  }

  public async attachVirtualCableToChannel(
    channelId: string,
    virtualCableId: string,
    channels: ChannelStrip[],
    buses: BusNode[],
    speakers: SpeakerBand[],
    virtualCables: VirtualCableNode[]
  ): Promise<AudioSourceBinding> {
    if (this.wouldVirtualCableCreateCycle(virtualCableId, channelId, channels, virtualCables)) {
      throw new Error(
        `Loop Guard blocked patch: ${virtualCableId.toUpperCase()} receives audio from ${channelId.toUpperCase()} (would cause infinite audio feedback). Unassign the channel send from that bus first.`
      );
    }

    await this.unlockAndStart(channels, buses, speakers, virtualCables);
    if (!this.ctx) throw new Error('AudioContext failed to initialize');
    const chNodes = this.channelNodes.get(channelId);
    const vcNodes = this.virtualCableNodes.get(virtualCableId);
    const vcMeta = virtualCables.find((v) => v.id === virtualCableId);
    if (!chNodes || !vcNodes || !vcMeta) {
      throw new Error(`Virtual Audio Cable "${virtualCableId}" is unavailable.`);
    }

    this.detachChannelSource(channelId);
    vcNodes.analyser.connect(chNodes.inputSumGain);

    this.channelSources.set(channelId, {
      kind: 'virtual-cable',
      virtualCableId,
    });

    return {
      kind: 'virtual-cable',
      virtualCableId,
      label: `${vcMeta.name} (${vcMeta.sourceLabel})`,
      active: true,
      sampleRateHz: this.ctx.sampleRate,
      channelCount: 2,
    };
  }

  public async attachExternalTabToVirtualCable(
    cableId: string,
    channels: ChannelStrip[],
    buses: BusNode[],
    speakers: SpeakerBand[],
    virtualCables: VirtualCableNode[],
    onEnded?: () => void
  ): Promise<string> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Browser tab/system audio capture is unsupported in this browser.');
    }
    await this.unlockAndStart(channels, buses, speakers, virtualCables);
    if (!this.ctx) throw new Error('AudioContext failed to initialize');

    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } as MediaTrackConstraints,
      video: true,
    });

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('No audio track shared. Enable "Share tab audio" or "Share system audio".');
    }
    stream.getVideoTracks().forEach((vt) => vt.stop());

    const vcNodes = this.virtualCableNodes.get(cableId);
    if (!vcNodes) throw new Error('Virtual Cable node missing');

    if (vcNodes.externalSource) {
      try {
        vcNodes.externalSource.sourceNode?.disconnect();
        vcNodes.externalSource.stream?.getTracks().forEach((t) => t.stop());
      } catch {
        // safe cleanup
      }
    }

    const track = audioTracks[0];
    const audioStream = new MediaStream([track]);
    const sourceNode = this.ctx.createMediaStreamSource(audioStream);
    sourceNode.connect(vcNodes.inputSum);

    track.onended = () => {
      try {
        sourceNode.disconnect();
      } catch {
        // safe
      }
      vcNodes.externalSource = undefined;
      onEnded?.();
    };

    vcNodes.externalSource = {
      kind: 'desktop',
      stream: audioStream,
      sourceNode,
    };

    return track.label || 'Browser Tab / Media Stream';
  }

  public async attachFileToVirtualCable(
    cableId: string,
    file: File,
    channels: ChannelStrip[],
    buses: BusNode[],
    speakers: SpeakerBand[],
    virtualCables: VirtualCableNode[]
  ): Promise<string> {
    await this.unlockAndStart(channels, buses, speakers, virtualCables);
    if (!this.ctx) throw new Error('AudioContext failed to initialize');
    const vcNodes = this.virtualCableNodes.get(cableId);
    if (!vcNodes) throw new Error('Virtual Cable node missing');

    if (vcNodes.externalSource) {
      try {
        vcNodes.externalSource.sourceNode?.disconnect();
        vcNodes.externalSource.audioElement?.pause();
        if (vcNodes.externalSource.objectUrl) URL.revokeObjectURL(vcNodes.externalSource.objectUrl);
      } catch {
        // safe
      }
    }

    const objectUrl = URL.createObjectURL(file);
    const audioEl = new Audio();
    audioEl.src = objectUrl;
    audioEl.loop = true;
    audioEl.crossOrigin = 'anonymous';
    const sourceNode = this.ctx.createMediaElementSource(audioEl);
    sourceNode.connect(vcNodes.inputSum);
    await audioEl.play();

    vcNodes.externalSource = {
      kind: 'file',
      sourceNode,
      audioElement: audioEl,
      objectUrl,
    };

    return file.name;
  }

  public setTestTone(active: boolean, kind: 'pink' | 'sine1k' | 'sweep', gainDb: number): void {
    if (!this.ctx) return;
    const mainBus = this.busNodes.get('bus-main');
    const targetNode = mainBus?.sumGain ?? this.masterMonitorSum;
    if (!targetNode) return;

    try {
      this.testOsc?.stop();
      this.testOsc?.disconnect();
      this.testNoise?.stop();
      this.testNoise?.disconnect();
      this.testGain?.disconnect();
    } catch {
      // safe cleanup
    }
    this.testOsc = null;
    this.testNoise = null;
    this.testGain = null;

    if (!active) return;

    this.testGain = this.ctx.createGain();
    this.testGain.gain.setTargetAtTime(dbToGain(gainDb) * 0.35, this.ctx.currentTime, 0.02);
    this.testGain.connect(targetNode);

    if (kind === 'pink') {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
        b6 = white * 0.115926;
      }
      this.testNoise = this.ctx.createBufferSource();
      this.testNoise.buffer = buffer;
      this.testNoise.loop = true;
      this.testNoise.connect(this.testGain);
      this.testNoise.start();
    } else {
      this.testOsc = this.ctx.createOscillator();
      this.testOsc.type = 'sine';
      this.testOsc.frequency.setValueAtTime(kind === 'sine1k' ? 1000 : 80, this.ctx.currentTime);
      if (kind === 'sweep') {
        this.testOsc.frequency.exponentialRampToValueAtTime(8000, this.ctx.currentTime + 4);
      }
      this.testOsc.connect(this.testGain);
      this.testOsc.start();
    }
  }

  public startBusRecording(busId = 'bus-stream'): { ok: boolean; mimeType?: string; error?: string } {
    if (!this.ctx || this.ctx.state !== 'running') {
      return { ok: false, error: 'Engage Audio DSP Engine before recording.' };
    }
    const bus = this.busNodes.get(busId) ?? this.busNodes.get('bus-main');
    if (!bus) return { ok: false, error: 'Target broadcast bus unavailable.' };
    if (typeof MediaRecorder === 'undefined') {
      return { ok: false, error: 'MediaRecorder API is not supported in this browser.' };
    }
    if (this.activeRecorder) {
      return { ok: false, error: 'Recording already in progress.' };
    }

    const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const recorder = mimeType
      ? new MediaRecorder(bus.streamDest.stream, { mimeType })
      : new MediaRecorder(bus.streamDest.stream);

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(500);
    this.activeRecorder = {
      recorder,
      chunks,
      targetId: busId,
      startedAt: Date.now(),
    };
    return { ok: true, mimeType: recorder.mimeType || 'audio/webm' };
  }

  public async stopBusRecording(): Promise<{ blobUrl: string; filename: string; durationSec: number } | null> {
    const rec = this.activeRecorder;
    if (!rec) return null;
    this.activeRecorder = null;

    await new Promise<void>((resolve) => {
      rec.recorder.onstop = () => resolve();
      if (rec.recorder.state !== 'inactive') {
        rec.recorder.stop();
      } else {
        resolve();
      }
    });

    const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || 'audio/webm' });
    const blobUrl = URL.createObjectURL(blob);
    const ext = rec.recorder.mimeType.includes('ogg') ? 'ogg' : 'webm';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return {
      blobUrl,
      filename: `console-${rec.targetId}-${stamp}.${ext}`,
      durationSec: Math.max(1, Math.round((Date.now() - rec.startedAt) / 1000)),
    };
  }

  public syncGraph(
    channels: ChannelStrip[],
    buses: BusNode[],
    virtualDi?: VirtualDiState,
    speakers: SpeakerBand[] = [],
    virtualCables: VirtualCableNode[] = []
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Reconcile Buses dynamically
    const activeBusIds = new Set(buses.map((b) => b.id));
    for (const [id, bNodes] of this.busNodes.entries()) {
      if (!activeBusIds.has(id)) {
        try {
          bNodes.sumGain.disconnect();
          bNodes.analyser.disconnect();
        } catch {
          // safe
        }
        this.busNodes.delete(id);
      }
    }
    for (const bus of buses) {
      let bNodes = this.busNodes.get(bus.id);
      if (!bNodes) {
        bNodes = this.createBusChain(bus);
      }
      if ((bus.eqBands?.length ?? 0) !== bNodes.eqFilterCount) {
        this.rebuildBusEq(bus, bNodes);
      }
      (bus.eqBands ?? []).forEach((band, idx) => {
        const f = bNodes!.eqFilters[idx];
        if (!f) return;
        f.type = eqShapeToBiquadType(band.shape);
        f.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.freqHz)), now, 0.02);
        f.Q.setTargetAtTime(Math.max(0.2, Math.min(20, band.q)), now, 0.02);
        f.gain.setTargetAtTime(bus.eqEnabled && band.enabled ? band.gainDb : 0, now, 0.02);
      });
      bNodes.limiter.threshold.setTargetAtTime(bus.limiterCeilingDb, now, 0.02);
      bNodes.faderGain.gain.setTargetAtTime(bus.mute ? 0 : dbToGain(bus.faderDb), now, 0.015);
    }

    // 2. Reconcile Virtual Audio Cables dynamically
    const activeVcIds = new Set(virtualCables.map((v) => v.id));
    for (const [id, vcNodes] of this.virtualCableNodes.entries()) {
      if (!activeVcIds.has(id)) {
        try {
          vcNodes.attachedBusTap?.tapGain.disconnect();
          vcNodes.attachedChannelTap?.tapGain.disconnect();
          vcNodes.analyser.disconnect();
        } catch {
          // safe
        }
        this.virtualCableNodes.delete(id);
      }
    }
    for (const vc of virtualCables) {
      const vcNodes = this.ensureVirtualCableChain(vc);
      vcNodes.gainNode.gain.setTargetAtTime(vc.active ? dbToGain(vc.gainDb) : 0, now, 0.015);
      vcNodes.monitorGain.gain.setTargetAtTime(vc.monitorToMaster && vc.active ? 1.0 : 0.0, now, 0.015);

      // Update bus tap
      if (vc.sourceKind === 'bus' && vc.sourceId) {
        if (vcNodes.attachedBusTap?.busId !== vc.sourceId) {
          try {
            vcNodes.attachedBusTap?.tapGain.disconnect();
          } catch {
            // safe
          }
          vcNodes.attachedBusTap = undefined;
          const bNodes = this.busNodes.get(vc.sourceId);
          if (bNodes) {
            const tapGain = this.ctx.createGain();
            tapGain.gain.value = 1.0;
            bNodes.analyser.connect(tapGain);
            tapGain.connect(vcNodes.inputSum);
            vcNodes.attachedBusTap = { busId: vc.sourceId, tapGain };
          }
        }
      } else if (vcNodes.attachedBusTap) {
        try {
          vcNodes.attachedBusTap.tapGain.disconnect();
        } catch {
          // safe
        }
        vcNodes.attachedBusTap = undefined;
      }

      // Update channel tap
      if (vc.sourceKind === 'channel' && vc.sourceId) {
        if (vcNodes.attachedChannelTap?.channelId !== vc.sourceId) {
          try {
            vcNodes.attachedChannelTap?.tapGain.disconnect();
          } catch {
            // safe
          }
          vcNodes.attachedChannelTap = undefined;
          const cNodes = this.channelNodes.get(vc.sourceId);
          if (cNodes) {
            const tapGain = this.ctx.createGain();
            tapGain.gain.value = 1.0;
            cNodes.postAnalyser.connect(tapGain);
            tapGain.connect(vcNodes.inputSum);
            vcNodes.attachedChannelTap = { channelId: vc.sourceId, tapGain };
          }
        }
      } else if (vcNodes.attachedChannelTap) {
        try {
          vcNodes.attachedChannelTap.tapGain.disconnect();
        } catch {
          // safe
        }
        vcNodes.attachedChannelTap = undefined;
      }
    }

    // 3. Reconcile Channels dynamically (add/remove/PEQ resize + Bus Sends)
    const activeChannelIds = new Set(channels.map((c) => c.id));
    for (const [id, cNodes] of this.channelNodes.entries()) {
      if (!activeChannelIds.has(id)) {
        this.detachChannelSource(id);
        try {
          cNodes.sendGains.forEach((s) => s.gain.disconnect());
          cNodes.postAnalyser.disconnect();
        } catch {
          // safe
        }
        this.channelNodes.delete(id);
      }
    }

    const anySolo = channels.some((c) => c.solo);

    for (const ch of channels) {
      let nodes = this.channelNodes.get(ch.id);
      if (!nodes) {
        nodes = this.createChannelChain(ch);
      }
      if (ch.eqBands.length !== nodes.eqFilterCount) {
        this.rebuildChannelEq(ch, nodes);
      }

      const effectiveMute = ch.mute || (anySolo && !ch.solo);
      const polarity = ch.polarityInvert ? -1 : 1;
      const vdiBoost =
        virtualDi && virtualDi.sourceChannelId === ch.id && !virtualDi.bypass
          ? dbToGain(virtualDi.outputGainDb + virtualDi.inputTrimDb * 0.5)
          : 1;

      nodes.trimGain.gain.setTargetAtTime(dbToGain(ch.softwareTrimDb), now, 0.015);
      nodes.polarityGain.gain.setTargetAtTime(polarity, now, 0.01);
      nodes.delayNode.delayTime.setTargetAtTime(Math.max(0, Math.min(0.2, ch.delayMs / 1000)), now, 0.015);
      nodes.hpf.frequency.setTargetAtTime(ch.hpfEnabled ? ch.hpfFreqHz : 12, now, 0.02);

      ch.eqBands.forEach((band, idx) => {
        const filter = nodes!.eqFilters[idx];
        if (!filter) return;
        filter.type = eqShapeToBiquadType(band.shape);
        filter.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.freqHz)), now, 0.02);
        filter.Q.setTargetAtTime(Math.max(0.2, Math.min(20, band.q)), now, 0.02);
        filter.gain.setTargetAtTime(ch.eqEnabled && band.enabled ? band.gainDb : 0, now, 0.02);
      });

      ch.geqBands.forEach((gainDb, idx) => {
        const gf = nodes!.geqFilters[idx];
        if (!gf) return;
        gf.gain.setTargetAtTime(ch.geqEnabled ? gainDb : 0, now, 0.02);
      });

      if (ch.dynamics.compEnabled) {
        nodes.comp.threshold.setTargetAtTime(ch.dynamics.compThresholdDb, now, 0.02);
        nodes.comp.ratio.setTargetAtTime(ch.dynamics.compRatio, now, 0.02);
      } else {
        nodes.comp.threshold.setTargetAtTime(0, now, 0.02);
        nodes.comp.ratio.setTargetAtTime(1, now, 0.02);
      }

      const targetGain = effectiveMute ? 0 : dbToGain(ch.faderDb) * vdiBoost;
      nodes.faderGain.gain.setTargetAtTime(targetGain, now, 0.015);
      nodes.panner.pan.setTargetAtTime(ch.pan / 100, now, 0.015);

      // Reconcile channel -> bus sends
      const sendKeyMap: { busId: string; enabled: boolean; levelDb: number; preFader: boolean }[] = [
        { busId: 'bus-main', enabled: ch.assignMain && !effectiveMute, levelDb: 0, preFader: false },
        { busId: 'bus-sub', enabled: ch.assignSub && !effectiveMute, levelDb: 0, preFader: false },
        {
          busId: 'bus-mon1',
          enabled: ch.sends.mon1.enabled && !ch.mute,
          levelDb: ch.sends.mon1.levelDb,
          preFader: ch.sends.mon1.preFader,
        },
        {
          busId: 'bus-mon2',
          enabled: ch.sends.mon2.enabled && !ch.mute,
          levelDb: ch.sends.mon2.levelDb,
          preFader: ch.sends.mon2.preFader,
        },
        {
          busId: 'bus-iem',
          enabled: ch.sends.iemChoir.enabled && !ch.mute,
          levelDb: ch.sends.iemChoir.levelDb,
          preFader: ch.sends.iemChoir.preFader,
        },
        {
          busId: 'bus-fx',
          enabled: ch.sends.fxReverb.enabled && !effectiveMute,
          levelDb: ch.sends.fxReverb.levelDb,
          preFader: ch.sends.fxReverb.preFader,
        },
        {
          busId: 'bus-stream',
          enabled: (ch.assignBroadcast || ch.sends.livestream.enabled) && !effectiveMute,
          levelDb: ch.sends.livestream.levelDb,
          preFader: ch.sends.livestream.preFader,
        },
      ];

      // Include any user-created buses dynamically
      for (const b of buses) {
        if (sendKeyMap.some((s) => s.busId === b.id)) continue;
        const customSend = ch.sends[b.id];
        sendKeyMap.push({
          busId: b.id,
          enabled: customSend ? customSend.enabled && !effectiveMute : false,
          levelDb: customSend?.levelDb ?? -12,
          preFader: customSend?.preFader ?? false,
        });
      }

      for (const spec of sendKeyMap) {
        const bNodes = this.busNodes.get(spec.busId);
        if (!bNodes) continue;
        let existingSend = nodes.sendGains.get(spec.busId);
        if (!existingSend || existingSend.preFader !== spec.preFader) {
          if (existingSend) {
            try {
              existingSend.gain.disconnect();
            } catch {
              // safe
            }
          }
          const sendGain = this.ctx.createGain();
          sendGain.gain.value = spec.enabled ? dbToGain(spec.levelDb) : 0;
          const tapPoint: AudioNode = spec.preFader ? nodes.comp : nodes.postAnalyser;
          tapPoint.connect(sendGain);
          sendGain.connect(bNodes.sumGain);
          existingSend = { gain: sendGain, preFader: spec.preFader };
          nodes.sendGains.set(spec.busId, existingSend);
        } else {
          existingSend.gain.gain.setTargetAtTime(spec.enabled ? dbToGain(spec.levelDb) : 0, now, 0.015);
        }
      }
    }

    // 4. Reconcile Speakers / Crossovers / Final Outputs dynamically
    const activeSpkIds = new Set(speakers.map((s) => s.id));
    for (const [id, sNodes] of this.speakerNodes.entries()) {
      if (!activeSpkIds.has(id)) {
        try {
          sNodes.inputGain.disconnect();
          sNodes.analyser.disconnect();
        } catch {
          // safe
        }
        if (sNodes.sinkAudioEl) {
          sNodes.sinkAudioEl.pause();
          sNodes.sinkAudioEl.srcObject = null;
        }
        this.speakerNodes.delete(id);
      }
    }

    const masterSumSpeakers = speakers.filter((s) => (s.outputSinkKind ?? 'master-mix') === 'master-mix' && !s.mute);
    const masterGainComp = masterSumSpeakers.length > 1 ? 1 / Math.sqrt(masterSumSpeakers.length) : 1;

    for (const spk of speakers) {
      let sNodes = this.speakerNodes.get(spk.id);
      const hpfNeeded = spk.hpfSlope === 48 ? 4 : spk.hpfSlope === 24 ? 2 : 1;
      const lpfNeeded = spk.lpfSlope === 48 ? 4 : spk.lpfSlope === 24 ? 2 : 1;
      const eqNeeded = spk.eqBands?.length ?? 0;

      if (
        !sNodes ||
        sNodes.sourceBusId !== spk.sourceBusId ||
        sNodes.hpfStagesCount !== hpfNeeded ||
        sNodes.lpfStagesCount !== lpfNeeded ||
        sNodes.eqFilterCount !== eqNeeded
      ) {
        this.rebuildSpeakerChain(spk);
        sNodes = this.speakerNodes.get(spk.id);
      }
      if (!sNodes) continue;

      const desiredSinkKind = spk.outputSinkKind ?? 'master-mix';
      const desiredSinkTarget = spk.outputDeviceId ?? spk.virtualCableId ?? '';
      if (sNodes.sinkKind !== desiredSinkKind || sNodes.sinkTargetId !== desiredSinkTarget) {
        this.connectSpeakerOutputSink(spk, sNodes);
      }

      const qVal = spk.family === 'Linkwitz-Riley' ? 0.707 : spk.family === 'Bessel' ? 0.577 : 0.707;
      for (const f of sNodes.hpfFilters) {
        f.frequency.setTargetAtTime(spk.crossoverBypass ? 12 : Math.max(16, spk.hpfHz), now, 0.02);
        f.Q.setTargetAtTime(qVal, now, 0.02);
      }
      for (const f of sNodes.lpfFilters) {
        f.frequency.setTargetAtTime(spk.crossoverBypass ? 20000 : Math.min(20000, Math.max(40, spk.lpfHz)), now, 0.02);
        f.Q.setTargetAtTime(qVal, now, 0.02);
      }
      (spk.eqBands ?? []).forEach((band, idx) => {
        const f = sNodes!.eqFilters[idx];
        if (!f) return;
        f.type = eqShapeToBiquadType(band.shape);
        f.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.freqHz)), now, 0.02);
        f.Q.setTargetAtTime(Math.max(0.2, Math.min(20, band.q)), now, 0.02);
        f.gain.setTargetAtTime(spk.eqEnabled !== false && band.enabled ? band.gainDb : 0, now, 0.02);
      });

      sNodes.subBoost.frequency.setTargetAtTime(spk.subBoostFreqHz ?? 44, now, 0.02);
      sNodes.subBoost.gain.setTargetAtTime(spk.subBoostEnabled ? (spk.subBoostGainDb ?? 0) : 0, now, 0.02);
      sNodes.polarityGain.gain.setTargetAtTime(spk.polarityInvert ? -1 : 1, now, 0.01);
      sNodes.delayNode.delayTime.setTargetAtTime(Math.max(0, Math.min(0.2, spk.delayMs / 1000)), now, 0.015);
      const normComp = desiredSinkKind === 'master-mix' ? masterGainComp : 1;
      sNodes.gainNode.gain.setTargetAtTime(spk.mute ? 0 : dbToGain(spk.gainDb) * normComp, now, 0.015);
      sNodes.limiter.threshold.setTargetAtTime(spk.limiterThresholdDb, now, 0.02);
    }
  }

  public syncChannels(
    channels: ChannelStrip[],
    mainBus?: BusNode,
    virtualDi?: VirtualDiState,
    speakers?: SpeakerBand[],
    buses?: BusNode[],
    virtualCables?: VirtualCableNode[]
  ): void {
    const resolvedBuses = buses ?? (mainBus ? [mainBus] : []);
    this.syncGraph(channels, resolvedBuses, virtualDi, speakers ?? [], virtualCables ?? []);
  }

  private readAnalyserLevels(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): { peakDbfs: number; rmsDbfs: number } {
    analyser.getFloatTimeDomainData(buf);
    let maxAbs = 0;
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const s = buf[i];
      const abs = Math.abs(s);
      if (abs > maxAbs) maxAbs = abs;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    return {
      peakDbfs: gainToDb(maxAbs),
      rmsDbfs: gainToDb(rms),
    };
  }

  private pushGrHistory(nodeId: string, grDb: number): number[] {
    const prev = this.grHistoryMap.get(nodeId) ?? [];
    const next = [...prev.slice(-39), Number(grDb.toFixed(2))];
    this.grHistoryMap.set(nodeId, next);
    return next;
  }

  private updatePeakHold(nodeId: string, currentPeakDbfs: number): { peakHoldDbfs: number; clipped: boolean } {
    const prev = this.peakHolds.get(nodeId);
    const isClip = currentPeakDbfs >= -0.3;
    if (!prev) {
      const next = { value: currentPeakDbfs, clipped: isClip };
      this.peakHolds.set(nodeId, next);
      return { peakHoldDbfs: next.value, clipped: next.clipped };
    }
    const nextVal = currentPeakDbfs > prev.value ? currentPeakDbfs : prev.value;
    const nextClip = prev.clipped || isClip;
    this.peakHolds.set(nodeId, { value: nextVal, clipped: nextClip });
    return { peakHoldDbfs: nextVal, clipped: nextClip };
  }

  public sampleMeters(
    channels: ChannelStrip[],
    buses: BusNode[],
    graphVersion: number,
    intelligenceConfig: AudioIntelligenceConfig = DEFAULT_INTELLIGENCE_CONFIG,
    speakers: SpeakerBand[] = [],
    virtualCables: VirtualCableNode[] = []
  ): {
    meters: Record<string, MeterReading>;
    spectrum: number[];
    roomSpectrum: number[];
    liveFeedbackCandidate: LiveFeedbackCandidate | null;
    systemIntelligence: SystemIntelligenceSummary;
  } {
    const meters: Record<string, MeterReading> = {};
    const channelInsights: Record<string, ChannelAcousticAnalysis> = {};
    const anySolo = channels.some((c) => c.solo);
    const isRunning = this.ctx?.state === 'running';
    const sampleRateHz = this.ctx?.sampleRate ?? 48000;

    let hottestActiveChId = channels[0]?.id ?? 'ch-01';
    let hottestChannelRms = -80;

    const preLevels = new Map<
      string,
      { prePeak: number; preRms: number; postPeak: number; postRms: number; gr: number; isMuted: boolean; hasSource: boolean }
    >();
    const speechCategories = new Set(['pulpit', 'vocal', 'choir']);
    let duganTotalPower = 0;
    let automixActiveMics = 0;

    for (const ch of channels) {
      const nodes = this.channelNodes.get(ch.id);
      const isMuted = ch.mute || (anySolo && !ch.solo);
      const hasSource = this.channelSources.has(ch.id);

      let prePeak = -80;
      let preRms = -80;
      let postPeak = -80;
      let postRms = -80;
      let gr = 0;

      if (isRunning && nodes && hasSource) {
        const pre = this.readAnalyserLevels(nodes.preAnalyser, nodes.preTimeDomain);
        const post = this.readAnalyserLevels(nodes.postAnalyser, nodes.postTimeDomain);
        prePeak = pre.peakDbfs;
        preRms = pre.rmsDbfs;
        postPeak = isMuted ? -80 : post.peakDbfs;
        postRms = isMuted ? -80 : post.rmsDbfs;
        gr = !isMuted && ch.dynamics.compEnabled ? Math.max(0, Math.abs(nodes.comp.reduction)) : 0;

        if (!isMuted && speechCategories.has(ch.category) && preRms > -62) {
          const instPower = Math.pow(10, preRms / 10);
          const prevPower = this.duganSmoothedPower.get(ch.id) ?? instPower;
          const alpha = instPower > prevPower ? 0.35 : 0.08;
          const smoothed = prevPower + alpha * (instPower - prevPower);
          this.duganSmoothedPower.set(ch.id, smoothed);
          duganTotalPower += smoothed;
          automixActiveMics += 1;
        }
      }

      preLevels.set(ch.id, { prePeak, preRms, postPeak, postRms, gr, isMuted, hasSource });
    }

    const activeLowBandChannels: ChannelStrip[] = [];
    const activeLowMidChannels: ChannelStrip[] = [];

    for (const ch of channels) {
      const nodes = this.channelNodes.get(ch.id);
      const lvl = preLevels.get(ch.id)!;

      let duganGainDb = 0;
      if (
        intelligenceConfig.duganAutomixEnabled &&
        automixActiveMics >= 2 &&
        speechCategories.has(ch.category) &&
        !lvl.isMuted &&
        lvl.hasSource &&
        duganTotalPower > 1e-9
      ) {
        const p = this.duganSmoothedPower.get(ch.id) ?? 1e-9;
        duganGainDb = Math.max(-14, Math.min(0, 10 * Math.log10(Math.max(1e-9, p / duganTotalPower))));
      }

      let autoTrimOffsetDb = 0;
      if (intelligenceConfig.autoLevelerEnabled && isRunning && !lvl.isMuted && lvl.hasSource && lvl.preRms > -58) {
        const targetRms = speechCategories.has(ch.category) ? -18 : -16;
        const desired = Math.max(-5, Math.min(5, (targetRms - lvl.preRms) * 0.45));
        const prevTrim = this.autoTrimSmoothedDb.get(ch.id) ?? 0;
        autoTrimOffsetDb = prevTrim + 0.06 * (desired - prevTrim);
        this.autoTrimSmoothedDb.set(ch.id, autoTrimOffsetDb);
      } else {
        this.autoTrimSmoothedDb.set(ch.id, 0);
      }

      if (isRunning && nodes && this.ctx) {
        const totalAutoGain = dbToGain(duganGainDb + autoTrimOffsetDb);
        nodes.autoGain.gain.setTargetAtTime(totalAutoGain, this.ctx.currentTime, 0.045);
      }

      const hold = this.updatePeakHold(ch.id, lvl.postPeak);
      const grHistory = this.pushGrHistory(ch.id, lvl.gr);
      const signalPresent = isRunning && !lvl.isMuted && lvl.postRms > -68;
      if (signalPresent && lvl.postRms > hottestChannelRms) {
        hottestChannelRms = lvl.postRms;
        hottestActiveChId = ch.id;
      }

      // Noise floor tracking over active input stream
      let noiseFloorDbfs = this.noiseFloorMap.get(ch.id) ?? -72;
      if (isRunning && lvl.hasSource) {
        const clampedFloor = Math.max(-80, Math.min(-25, lvl.preRms));
        if (clampedFloor < noiseFloorDbfs) {
          noiseFloorDbfs = noiseFloorDbfs * 0.85 + clampedFloor * 0.15;
        } else {
          noiseFloorDbfs = noiseFloorDbfs * 0.992 + clampedFloor * 0.008;
        }
        this.noiseFloorMap.set(ch.id, noiseFloorDbfs);
      } else {
        noiseFloorDbfs = -80;
      }

      let fundamentalHz = 0;
      if (isRunning && nodes && lvl.hasSource && !lvl.isMuted && lvl.preRms > -64) {
        nodes.preAnalyser.getFloatFrequencyData(nodes.preFreqData);
        fundamentalHz = detectFundamentalFromFft(nodes.preFreqData, sampleRateHz);
        const insight = analyzeChannelSpectrumFft(
          ch,
          nodes.preFreqData,
          sampleRateHz,
          lvl.preRms,
          lvl.prePeak,
          duganGainDb,
          autoTrimOffsetDb
        );
        channelInsights[ch.id] = insight;

        if (insight.subRumbleRatioDb > -2 || ch.category === 'bass' || ch.category === 'drums') {
          activeLowBandChannels.push(ch);
        }
        if (insight.mudExcessDb > 1.2) {
          activeLowMidChannels.push(ch);
        }
      } else {
        channelInsights[ch.id] = {
          channelId: ch.id,
          signalPresent: false,
          spectralCentroidHz: 0,
          crestFactorDb: 0,
          subRumbleRatioDb: 0,
          mudExcessDb: 0,
          sibilanceExcessDb: 0,
          duganGainDb: 0,
          autoTrimOffsetDb: 0,
          detectedProfileLabel: 'Idle / Unpatched',
        };
      }

      meters[ch.id] = {
        nodeId: ch.id,
        inputPeakDbfs: lvl.prePeak,
        inputRmsDbfs: lvl.preRms,
        peakDbfs: lvl.postPeak,
        rmsDbfs: lvl.postRms,
        peakHoldDbfs: hold.peakHoldDbfs,
        peakHoldClipped: hold.clipped,
        noiseFloorDbfs: Number(noiseFloorDbfs.toFixed(1)),
        crestFactorDb: signalPresent ? Number(Math.max(0, lvl.postPeak - lvl.postRms).toFixed(1)) : 0,
        fundamentalHz,
        clipping: lvl.postPeak >= -0.3,
        gainReductionDb: lvl.gr,
        gainReductionHistory: grHistory,
        signalPresent,
        source: 'software_measured',
        graphVersion,
      };
    }

    // Spectral masking collision tagging
    let maskingPairsCount = 0;
    if (intelligenceConfig.antiMaskingEnabled) {
      if (activeLowBandChannels.length >= 2) {
        maskingPairsCount += 1;
        const [a, b] = activeLowBandChannels;
        if (channelInsights[a.id]) {
          channelInsights[a.id].maskingConflictWith = `${b.shortName} (55–90 Hz Low-End)`;
        }
        if (channelInsights[b.id]) {
          channelInsights[b.id].maskingConflictWith = `${a.shortName} (55–90 Hz Low-End)`;
        }
      }
      if (activeLowMidChannels.length >= 2) {
        maskingPairsCount += 1;
        const [a, b] = activeLowMidChannels;
        if (channelInsights[a.id] && !channelInsights[a.id].maskingConflictWith) {
          channelInsights[a.id].maskingConflictWith = `${b.shortName} (240–420 Hz Mud)`;
        }
        if (channelInsights[b.id] && !channelInsights[b.id].maskingConflictWith) {
          channelInsights[b.id].maskingConflictWith = `${a.shortName} (240–420 Hz Mud)`;
        }
      }
    }

    // Read real AnalyserNodes for EVERY Bus
    for (const bus of buses) {
      const bNodes = this.busNodes.get(bus.id);
      if (isRunning && bNodes && !bus.mute) {
        const lvl = this.readAnalyserLevels(bNodes.analyser, bNodes.timeDomain);
        const hold = this.updatePeakHold(bus.id, lvl.peakDbfs);
        const gr = Math.max(0, Math.abs(bNodes.limiter.reduction));
        const grHistory = this.pushGrHistory(bus.id, gr);
        meters[bus.id] = {
          nodeId: bus.id,
          inputPeakDbfs: lvl.peakDbfs,
          inputRmsDbfs: lvl.rmsDbfs,
          peakDbfs: lvl.peakDbfs,
          rmsDbfs: lvl.rmsDbfs,
          peakHoldDbfs: hold.peakHoldDbfs,
          peakHoldClipped: hold.clipped,
          noiseFloorDbfs: -80,
          crestFactorDb: lvl.rmsDbfs > -68 ? Number(Math.max(0, lvl.peakDbfs - lvl.rmsDbfs).toFixed(1)) : 0,
          fundamentalHz: 0,
          clipping: lvl.peakDbfs >= -0.2,
          gainReductionDb: gr,
          gainReductionHistory: grHistory,
          signalPresent: lvl.rmsDbfs > -68,
          source: 'software_measured',
          graphVersion,
        };
      } else {
        const grHistory = this.pushGrHistory(bus.id, 0);
        meters[bus.id] = {
          nodeId: bus.id,
          inputPeakDbfs: -80,
          inputRmsDbfs: -80,
          peakDbfs: -80,
          rmsDbfs: -80,
          peakHoldDbfs: -80,
          peakHoldClipped: false,
          noiseFloorDbfs: -80,
          crestFactorDb: 0,
          fundamentalHz: 0,
          clipping: false,
          gainReductionDb: 0,
          gainReductionHistory: grHistory,
          signalPresent: false,
          source: 'software_measured',
          graphVersion,
        };
      }
    }

    // Read real AnalyserNodes for EVERY Speaker / Final Output
    for (const spk of speakers) {
      const sNodes = this.speakerNodes.get(spk.id);
      if (isRunning && sNodes && !spk.mute) {
        const lvl = this.readAnalyserLevels(sNodes.analyser, sNodes.timeDomain);
        const hold = this.updatePeakHold(spk.id, lvl.peakDbfs);
        const gr = Math.max(0, Math.abs(sNodes.limiter.reduction));
        const grHistory = this.pushGrHistory(spk.id, gr);
        meters[spk.id] = {
          nodeId: spk.id,
          inputPeakDbfs: lvl.peakDbfs,
          inputRmsDbfs: lvl.rmsDbfs,
          peakDbfs: lvl.peakDbfs,
          rmsDbfs: lvl.rmsDbfs,
          peakHoldDbfs: hold.peakHoldDbfs,
          peakHoldClipped: hold.clipped,
          noiseFloorDbfs: -80,
          crestFactorDb: lvl.rmsDbfs > -68 ? Number(Math.max(0, lvl.peakDbfs - lvl.rmsDbfs).toFixed(1)) : 0,
          fundamentalHz: 0,
          clipping: lvl.peakDbfs >= -0.2,
          gainReductionDb: gr,
          gainReductionHistory: grHistory,
          signalPresent: lvl.rmsDbfs > -68,
          source: 'software_measured',
          graphVersion,
        };
      } else {
        meters[spk.id] = {
          nodeId: spk.id,
          inputPeakDbfs: -80,
          inputRmsDbfs: -80,
          peakDbfs: -80,
          rmsDbfs: -80,
          peakHoldDbfs: -80,
          peakHoldClipped: false,
          noiseFloorDbfs: -80,
          crestFactorDb: 0,
          fundamentalHz: 0,
          clipping: false,
          gainReductionDb: 0,
          gainReductionHistory: [],
          signalPresent: false,
          source: 'software_measured',
          graphVersion,
        };
      }
    }

    // Read real AnalyserNodes for EVERY Virtual Audio Cable
    for (const vc of virtualCables) {
      const vcNodes = this.virtualCableNodes.get(vc.id);
      if (isRunning && vcNodes && vc.active) {
        const lvl = this.readAnalyserLevels(vcNodes.analyser, vcNodes.timeDomain);
        const hold = this.updatePeakHold(vc.id, lvl.peakDbfs);
        meters[vc.id] = {
          nodeId: vc.id,
          inputPeakDbfs: lvl.peakDbfs,
          inputRmsDbfs: lvl.rmsDbfs,
          peakDbfs: lvl.peakDbfs,
          rmsDbfs: lvl.rmsDbfs,
          peakHoldDbfs: hold.peakHoldDbfs,
          peakHoldClipped: hold.clipped,
          noiseFloorDbfs: -80,
          crestFactorDb: 0,
          fundamentalHz: 0,
          clipping: lvl.peakDbfs >= -0.2,
          gainReductionDb: 0,
          gainReductionHistory: [],
          signalPresent: lvl.rmsDbfs > -68,
          source: 'software_measured',
          graphVersion,
        };
      } else {
        meters[vc.id] = {
          nodeId: vc.id,
          inputPeakDbfs: -80,
          inputRmsDbfs: -80,
          peakDbfs: -80,
          rmsDbfs: -80,
          peakHoldDbfs: -80,
          peakHoldClipped: false,
          noiseFloorDbfs: -80,
          crestFactorDb: 0,
          fundamentalHz: 0,
          clipping: false,
          gainReductionDb: 0,
          gainReductionHistory: [],
          signalPresent: false,
          source: 'software_measured',
          graphVersion,
        };
      }
    }

    // Measure actual Master Analyser time-domain and FFT frequency spectrum
    let liveMasterPeak = -80;
    let liveMasterRms = -80;
    let liveFeedbackCandidate: LiveFeedbackCandidate | null = null;
    let spectralTiltDbPerOct = 0;

    this.spectrumBins.fill(-80);
    this.roomSpectrumBins.fill(-80);

    if (isRunning && this.masterAnalyser && this.masterTimeData && this.masterFreqData) {
      const mLvl = this.readAnalyserLevels(this.masterAnalyser, this.masterTimeData);
      liveMasterPeak = mLvl.peakDbfs;
      liveMasterRms = mLvl.rmsDbfs;

      this.masterAnalyser.getFloatFrequencyData(this.masterFreqData);
      const nyquist = sampleRateHz / 2;
      const binCount = this.masterFreqData.length;

      for (let b = 0; b < 64; b++) {
        const fLow = 20 * Math.pow(1000, b / 64);
        const fHigh = 20 * Math.pow(1000, (b + 1) / 64);
        const idxLow = Math.max(1, Math.floor((fLow / nyquist) * binCount));
        const idxHigh = Math.min(binCount - 1, Math.max(idxLow, Math.ceil((fHigh / nyquist) * binCount)));
        let maxDb = -80;
        for (let i = idxLow; i <= idxHigh; i++) {
          const val = this.masterFreqData[i];
          if (Number.isFinite(val) && val > maxDb) maxDb = val;
        }
        const clamped = Math.max(-80, Math.min(0, maxDb));
        this.spectrumBins[b] = clamped;
        this.roomSpectrumBins[b] = clamped;
      }

      if (liveMasterRms > -64) {
        const lowAvg = this.spectrumBins.slice(6, 20).reduce((acc, v) => acc + v, 0) / 14;
        const highAvg = this.spectrumBins.slice(36, 54).reduce((acc, v) => acc + v, 0) / 18;
        spectralTiltDbPerOct = Number(((highAvg - lowAvg) / 4.2).toFixed(1));
      }

      if (intelligenceConfig.feedbackGuardianEnabled && liveMasterRms > -42) {
        let bestProminence = 0;
        let bestIdx = -1;
        let bestVal = -80;
        const minIdx = Math.max(4, Math.floor((80 / nyquist) * binCount));
        const maxIdx = Math.min(binCount - 5, Math.ceil((12000 / nyquist) * binCount));

        for (let i = minIdx; i <= maxIdx; i++) {
          const v = this.masterFreqData[i];
          if (!Number.isFinite(v) || v < -24) continue;
          const neighborAvg =
            (this.masterFreqData[i - 3] +
              this.masterFreqData[i - 2] +
              this.masterFreqData[i + 2] +
              this.masterFreqData[i + 3]) /
            4;
          const prominence = v - neighborAvg;
          if (prominence > 15 && prominence > bestProminence) {
            const h2Idx = i * 2;
            const h3Idx = i * 3;
            const hasH2 = h2Idx < binCount && this.masterFreqData[h2Idx] > v - 16;
            const hasH3 = h3Idx < binCount && this.masterFreqData[h3Idx] > v - 20;
            if (hasH2 && hasH3) continue;

            bestProminence = prominence;
            bestIdx = i;
            bestVal = v;
          }
        }

        if (bestIdx > 0) {
          const freqHz = Math.round((bestIdx / binCount) * nyquist);
          liveFeedbackCandidate = {
            channelId: hottestActiveChId,
            freqHz,
            levelDb: Number(bestVal.toFixed(1)),
            qEstimate: Number(Math.min(24, Math.max(8, bestProminence * 0.8)).toFixed(1)),
            confidence: Number(Math.min(0.98, 0.55 + bestProminence / 45).toFixed(2)),
          };
        }
      }
    }

    const shortTermLufs =
      isRunning && liveMasterRms > -68 ? Number((liveMasterRms - 0.8).toFixed(1)) : -80;
    const headroomMarginDb =
      isRunning && liveMasterPeak > -70
        ? Number(Math.max(0, -0.8 - liveMasterPeak).toFixed(1))
        : 0;

    return {
      meters,
      spectrum: Array.from(this.spectrumBins),
      roomSpectrum: Array.from(this.roomSpectrumBins),
      liveFeedbackCandidate,
      systemIntelligence: {
        shortTermLufs,
        headroomMarginDb,
        spectralTiltDbPerOct,
        maskingPairsCount,
        automixActiveMics,
        channelInsights,
      },
    };
  }
}

export const audioEngine = new RealTimeConsoleAudioEngine();
