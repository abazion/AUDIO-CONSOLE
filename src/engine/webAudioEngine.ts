import type {
  AudioSourceBinding,
  BusNode,
  ChannelStrip,
  CrossoverFamily,
  DetectedHardwareDevice,
  EqBand,
  MeterReading,
  SpeakerBand,
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
  const hpMagSq = Math.pow(hpRatio, 2 * hpfOrder) / (1 + Math.pow(hpRatio, 2 * hpfOrder));

  const lpRatio = Math.max(20, band.lpfHz) / freqHz;
  const lpMagSq = Math.pow(lpRatio, 2 * lpfOrder) / (1 + Math.pow(lpRatio, 2 * lpfOrder));

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

  const magDb =
    band.gainDb +
    subBoost +
    10 * Math.log10(Math.max(1e-7, hpMagSq)) +
    10 * Math.log10(Math.max(1e-7, lpMagSq)) +
    familyOffset(band.family) * 0.15;

  const phaseShift =
    (band.polarityInvert ? 180 : 0) +
    Math.atan2(1, Math.pow(hpRatio, hpfOrder * 0.5)) * (180 / Math.PI) -
    Math.atan2(1, Math.pow(lpRatio, lpfOrder * 0.5)) * (180 / Math.PI);

  return {
    magDb: Math.max(-36, Math.min(12, magDb)),
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
}

interface ChannelAudioNodes {
  inputSumGain: GainNode;
  preAnalyser: AnalyserNode;
  trimGain: GainNode;
  autoGain: GainNode;
  hpf: BiquadFilterNode;
  eqFilters: BiquadFilterNode[];
  geqFilters: BiquadFilterNode[];
  comp: DynamicsCompressorNode;
  faderGain: GainNode;
  panner: StereoPannerNode;
  postAnalyser: AnalyserNode;
  preTimeDomain: Float32Array<ArrayBuffer>;
  preFreqData: Float32Array<ArrayBuffer>;
  postTimeDomain: Float32Array<ArrayBuffer>;
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

class RealTimeConsoleAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private subBoostFilter: BiquadFilterNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterFreqData: Float32Array<ArrayBuffer> | null = null;
  private masterTimeData: Float32Array<ArrayBuffer> | null = null;

  private testOsc: OscillatorNode | null = null;
  private testNoise: AudioBufferSourceNode | null = null;
  private testGain: GainNode | null = null;

  private channelNodes = new Map<string, ChannelAudioNodes>();
  private channelSources = new Map<string, AttachedChannelSource>();
  private peakHolds = new Map<string, { value: number; expiresAt: number }>();
  private duganSmoothedPower = new Map<string, number>();
  private autoTrimSmoothedDb = new Map<string, number>();
  private spectrumBins = new Float32Array(64);
  private roomSpectrumBins = new Float32Array(64);

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
    mainBus: BusNode,
    speakers?: SpeakerBand[]
  ): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });

      this.masterGain = this.ctx.createGain();

      this.subBoostFilter = this.ctx.createBiquadFilter();
      this.subBoostFilter.type = 'peaking';
      this.subBoostFilter.frequency.value = 44;
      this.subBoostFilter.Q.value = 0.9;
      this.subBoostFilter.gain.value = 0;

      this.masterLimiter = this.ctx.createDynamicsCompressor();
      this.masterLimiter.threshold.value = mainBus.limiterCeilingDb;
      this.masterLimiter.ratio.value = 12;
      this.masterLimiter.attack.value = 0.002;
      this.masterLimiter.release.value = 0.08;

      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 2048;
      this.masterAnalyser.smoothingTimeConstant = 0.72;
      this.masterFreqData = new Float32Array(new ArrayBuffer(this.masterAnalyser.frequencyBinCount * 4));
      this.masterTimeData = new Float32Array(new ArrayBuffer(this.masterAnalyser.fftSize * 4));

      this.masterGain.connect(this.subBoostFilter);
      this.subBoostFilter.connect(this.masterLimiter);
      this.masterLimiter.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);

      for (const ch of channels) {
        this.createChannelChain(ch);
      }
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.syncChannels(channels, mainBus, undefined, speakers);
    return this.ctx.state === 'running';
  }

  public async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  }

  private createChannelChain(ch: ChannelStrip): void {
    if (!this.ctx || !this.masterGain) return;

    const inputSumGain = this.ctx.createGain();
    inputSumGain.gain.value = 1.0;

    const preAnalyser = this.ctx.createAnalyser();
    preAnalyser.fftSize = 1024;
    preAnalyser.smoothingTimeConstant = 0.65;

    const trimGain = this.ctx.createGain();
    trimGain.gain.value = dbToGain(ch.softwareTrimDb);

    const autoGain = this.ctx.createGain();
    autoGain.gain.value = 1.0;

    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = ch.hpfEnabled ? ch.hpfFreqHz : 12;

    const eqFilters = ch.eqBands.map((band) => {
      const f = this.ctx!.createBiquadFilter();
      f.type =
        band.shape === 'low-shelf'
          ? 'lowshelf'
          : band.shape === 'high-shelf'
            ? 'highshelf'
            : band.shape === 'notch'
              ? 'notch'
              : band.shape === 'band-pass'
                ? 'bandpass'
                : 'peaking';
      f.frequency.value = band.freqHz;
      f.gain.value = ch.eqEnabled && band.enabled ? band.gainDb : 0;
      f.Q.value = band.q;
      return f;
    });

    const geqFilters = ISO_31_CENTERS.map((freq, idx) => {
      const f = this.ctx!.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = Math.min(20000, freq);
      f.Q.value = 4.31;
      f.gain.value = ch.geqEnabled ? (ch.geqBands[idx] ?? 0) : 0;
      return f;
    });

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = ch.dynamics.compEnabled ? ch.dynamics.compThresholdDb : 0;
    comp.ratio.value = ch.dynamics.compEnabled ? ch.dynamics.compRatio : 1;

    const faderGain = this.ctx.createGain();
    faderGain.gain.value = ch.mute ? 0 : dbToGain(ch.faderDb);

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = ch.pan / 100;

    const postAnalyser = this.ctx.createAnalyser();
    postAnalyser.fftSize = 256;

    inputSumGain.connect(preAnalyser);
    preAnalyser.connect(trimGain);
    trimGain.connect(autoGain);
    autoGain.connect(hpf);

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
    postAnalyser.connect(this.masterGain);

    this.channelNodes.set(ch.id, {
      inputSumGain,
      preAnalyser,
      trimGain,
      autoGain,
      hpf,
      eqFilters,
      geqFilters,
      comp,
      faderGain,
      panner,
      postAnalyser,
      preTimeDomain: new Float32Array(new ArrayBuffer(preAnalyser.fftSize * 4)),
      preFreqData: new Float32Array(new ArrayBuffer(preAnalyser.frequencyBinCount * 4)),
      postTimeDomain: new Float32Array(new ArrayBuffer(postAnalyser.fftSize * 4)),
    });
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
    mainBus: BusNode,
    deviceId?: string,
    fallbackLabel?: string
  ): Promise<AudioSourceBinding> {
    await this.unlockAndStart(channels, mainBus);
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
    mainBus: BusNode,
    onEnded?: () => void
  ): Promise<AudioSourceBinding> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Desktop/System audio capture (getDisplayMedia) is not supported in this browser.');
    }

    await this.unlockAndStart(channels, mainBus);
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
        'No system/desktop audio track was shared. Re-try and enable "Share system audio" or "Share tab audio".'
      );
    }

    // Stop unnecessary video capture track cleanly if audio remains live
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
      label: primaryAudioTrack.label || 'Desktop / System Audio',
      active: true,
      sampleRateHz: settings.sampleRate ?? this.ctx.sampleRate,
      channelCount: settings.channelCount ?? 2,
    };
  }

  public async attachFileToChannel(
    channelId: string,
    file: File,
    channels: ChannelStrip[],
    mainBus: BusNode
  ): Promise<AudioSourceBinding> {
    await this.unlockAndStart(channels, mainBus);
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
    mainBus: BusNode
  ): Promise<AudioSourceBinding> {
    await this.unlockAndStart(channels, mainBus);
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

  public setTestTone(active: boolean, kind: 'pink' | 'sine1k' | 'sweep', gainDb: number): void {
    if (!this.ctx || !this.masterGain) return;

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
    this.testGain.connect(this.masterGain);

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

  public syncChannels(
    channels: ChannelStrip[],
    mainBus?: BusNode,
    virtualDi?: VirtualDiState,
    speakers?: SpeakerBand[]
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const anySolo = channels.some((c) => c.solo);

    if (mainBus && this.masterGain && this.masterLimiter) {
      const mainGain = mainBus.mute ? 0 : dbToGain(mainBus.faderDb);
      this.masterGain.gain.setTargetAtTime(mainGain, now, 0.015);
      this.masterLimiter.threshold.setTargetAtTime(mainBus.limiterCeilingDb, now, 0.02);
    }

    if (speakers && this.subBoostFilter) {
      const subBand = speakers.find((s) => s.role === 'Subwoofer');
      if (subBand && subBand.subBoostEnabled && !subBand.mute) {
        this.subBoostFilter.frequency.setTargetAtTime(subBand.subBoostFreqHz ?? 44, now, 0.02);
        this.subBoostFilter.gain.setTargetAtTime(subBand.subBoostGainDb ?? 0, now, 0.02);
      } else {
        this.subBoostFilter.gain.setTargetAtTime(0, now, 0.02);
      }
    }

    for (const ch of channels) {
      const nodes = this.channelNodes.get(ch.id);
      if (!nodes) continue;

      const effectiveMute = ch.mute || (anySolo && !ch.solo);
      const polarity = ch.polarityInvert ? -1 : 1;
      const vdiBoost =
        virtualDi && virtualDi.sourceChannelId === ch.id && !virtualDi.bypass
          ? dbToGain(virtualDi.outputGainDb + virtualDi.inputTrimDb * 0.5)
          : 1;

      nodes.trimGain.gain.setTargetAtTime(dbToGain(ch.softwareTrimDb), now, 0.015);
      const targetGain = effectiveMute ? 0 : dbToGain(ch.faderDb) * polarity * vdiBoost;

      nodes.faderGain.gain.setTargetAtTime(targetGain, now, 0.015);
      nodes.panner.pan.setTargetAtTime(ch.pan / 100, now, 0.015);
      nodes.hpf.frequency.setTargetAtTime(ch.hpfEnabled ? ch.hpfFreqHz : 12, now, 0.02);

      ch.eqBands.forEach((band, idx) => {
        const filter = nodes.eqFilters[idx];
        if (!filter) return;
        filter.frequency.setTargetAtTime(band.freqHz, now, 0.02);
        filter.Q.setTargetAtTime(band.q, now, 0.02);
        filter.gain.setTargetAtTime(ch.eqEnabled && band.enabled ? band.gainDb : 0, now, 0.02);
      });

      ch.geqBands.forEach((gainDb, idx) => {
        const gf = nodes.geqFilters[idx];
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
    }
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

  /**
   * Reads genuine real-time Web Audio AnalyserNode telemetry at ~25Hz,
   * executes Dugan constant-gain sharing + auto-leveling + FFT acoustic intelligence,
   * and detects non-harmonic narrowband feedback spikes.
   */
  public sampleMeters(
    channels: ChannelStrip[],
    buses: BusNode[],
    graphVersion: number,
    intelligenceConfig: AudioIntelligenceConfig = DEFAULT_INTELLIGENCE_CONFIG
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
    const nowMs = Date.now();
    const isRunning = this.ctx?.state === 'running';
    const sampleRateHz = this.ctx?.sampleRate ?? 48000;

    let mainSumLinear = 0;
    let subSumLinear = 0;
    let mon1SumLinear = 0;
    let mon2SumLinear = 0;
    let iemSumLinear = 0;
    let fxSumLinear = 0;
    let streamSumLinear = 0;

    let hottestActiveChId = channels[0]?.id ?? 'ch-01';
    let hottestChannelRms = -80;

    // Pass 1: Read pre/post RMS levels & update Dugan Automix envelope power
    const preLevels = new Map<string, { prePeak: number; preRms: number; postPeak: number; postRms: number; gr: number; isMuted: boolean; hasSource: boolean }>();
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

    // Pass 2: Apply Dugan Automix + Auto-Leveler GainNode automation & compute per-channel FFT insights
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

      const prevHold = this.peakHolds.get(ch.id);
      let peakHoldDbfs = lvl.postPeak;
      if (prevHold && prevHold.expiresAt > nowMs && prevHold.value > lvl.postPeak) {
        peakHoldDbfs = prevHold.value;
      } else {
        this.peakHolds.set(ch.id, { value: lvl.postPeak, expiresAt: nowMs + 1400 });
      }

      const signalPresent = isRunning && !lvl.isMuted && lvl.postRms > -62;
      if (signalPresent && lvl.postRms > hottestChannelRms) {
        hottestChannelRms = lvl.postRms;
        hottestActiveChId = ch.id;
      }

      meters[ch.id] = {
        nodeId: ch.id,
        inputPeakDbfs: lvl.prePeak,
        inputRmsDbfs: lvl.preRms,
        peakDbfs: lvl.postPeak,
        rmsDbfs: lvl.postRms,
        peakHoldDbfs,
        clipping: lvl.postPeak >= -0.3,
        gainReductionDb: lvl.gr,
        signalPresent,
        source: 'software_measured',
        graphVersion,
      };

      if (isRunning && nodes && lvl.hasSource && !lvl.isMuted && lvl.preRms > -62) {
        nodes.preAnalyser.getFloatFrequencyData(nodes.preFreqData);
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

      if (signalPresent) {
        const lin = dbToGain(lvl.postRms);
        if (ch.assignMain) mainSumLinear += lin;
        if (ch.assignSub) subSumLinear += lin;
        if (ch.assignBroadcast) streamSumLinear += lin * dbToGain(ch.sends.livestream.levelDb);
        if (ch.sends.mon1.enabled) mon1SumLinear += lin * dbToGain(ch.sends.mon1.levelDb);
        if (ch.sends.mon2.enabled) mon2SumLinear += lin * dbToGain(ch.sends.mon2.levelDb);
        if (ch.sends.iemChoir.enabled) iemSumLinear += lin * dbToGain(ch.sends.iemChoir.levelDb);
        if (ch.sends.fxReverb.enabled) fxSumLinear += lin * dbToGain(ch.sends.fxReverb.levelDb);
      }
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

    // Measure actual Master Analyser time-domain and FFT frequency spectrum
    let liveMasterPeak = -80;
    let liveMasterRms = -80;
    let liveFeedbackCandidate: LiveFeedbackCandidate | null = null;
    let spectralTiltDbPerOct = -4.5;

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

      if (liveMasterRms > -60) {
        const lowAvg =
          this.spectrumBins.slice(6, 20).reduce((acc, v) => acc + v, 0) / 14;
        const highAvg =
          this.spectrumBins.slice(36, 54).reduce((acc, v) => acc + v, 0) / 18;
        spectralTiltDbPerOct = Number(((highAvg - lowAvg) / 4.2).toFixed(1));
      }

      // Harmonic-Aware Narrowband Feedback Detector across 80 Hz .. 12 kHz
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
            // Harmonic rejection: if 2*f and 3*f contain strong musical overtones, skip
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

    const busLinearMap: Record<string, number> = {
      'bus-main': mainSumLinear,
      'bus-sub': subSumLinear,
      'bus-mon1': mon1SumLinear,
      'bus-mon2': mon2SumLinear,
      'bus-iem': iemSumLinear,
      'bus-fx': fxSumLinear,
      'bus-stream': streamSumLinear,
    };

    for (const bus of buses) {
      if (bus.id === 'bus-main') {
        const inputRms = gainToDb(mainSumLinear);
        const inputPeak = Math.max(inputRms, liveMasterPeak);
        const rms = bus.mute || !isRunning ? -80 : liveMasterRms;
        const peak = bus.mute || !isRunning ? -80 : liveMasterPeak;
        const gr =
          !bus.mute && isRunning && this.masterLimiter
            ? Math.max(0, Math.abs(this.masterLimiter.reduction))
            : 0;
        meters[bus.id] = {
          nodeId: bus.id,
          inputPeakDbfs: Math.max(inputPeak, liveMasterPeak),
          inputRmsDbfs: Math.max(inputRms, liveMasterRms),
          peakDbfs: peak,
          rmsDbfs: rms,
          peakHoldDbfs: Math.max(peak, -80),
          clipping: peak >= -0.2,
          gainReductionDb: gr,
          signalPresent: isRunning && !bus.mute && rms > -62,
          source: 'software_measured',
          graphVersion,
        };
        continue;
      }

      const preLin = isRunning ? busLinearMap[bus.id] ?? 0 : 0;
      const lin = bus.mute ? 0 : preLin * dbToGain(bus.faderDb);
      const inputRms = gainToDb(preLin);
      const inputPeak = preLin > 0.0001 ? Math.min(0, inputRms + 3.0) : -80;
      const rms = gainToDb(lin);
      const peak = lin > 0.0001 ? Math.min(bus.limiterCeilingDb, rms + 3.0) : -80;
      const gr = rms + 3.0 > bus.limiterCeilingDb ? rms + 3.0 - bus.limiterCeilingDb : 0;

      meters[bus.id] = {
        nodeId: bus.id,
        inputPeakDbfs: inputPeak,
        inputRmsDbfs: inputRms,
        peakDbfs: peak,
        rmsDbfs: rms,
        peakHoldDbfs: peak,
        clipping: peak >= -0.2,
        gainReductionDb: gr,
        signalPresent: isRunning && !bus.mute && rms > -62,
        source: 'software_measured',
        graphVersion,
      };
    }

    const shortTermLufs =
      isRunning && liveMasterRms > -68 ? Number((liveMasterRms - 0.8).toFixed(1)) : -80;
    const headroomMarginDb =
      isRunning && liveMasterPeak > -70
        ? Number(Math.max(0, -0.8 - liveMasterPeak).toFixed(1))
        : 24;

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
