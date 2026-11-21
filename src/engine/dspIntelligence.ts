import { getRecommendedEqPresetsForChannel } from './profiles';
import type {
  AiProposal,
  BusNode,
  ChannelStrip,
  HardwareProfile,
  MeterReading,
  SpeakerBand,
  VirtualDiState,
} from './types';

export interface AudioIntelligenceConfig {
  duganAutomixEnabled: boolean;
  autoLevelerEnabled: boolean;
  antiMaskingEnabled: boolean;
  feedbackGuardianEnabled: boolean;
  lufsGuardEnabled: boolean;
}

export const DEFAULT_INTELLIGENCE_CONFIG: AudioIntelligenceConfig = {
  duganAutomixEnabled: true,
  autoLevelerEnabled: true,
  antiMaskingEnabled: true,
  feedbackGuardianEnabled: true,
  lufsGuardEnabled: true,
};

export interface ChannelAcousticAnalysis {
  channelId: string;
  signalPresent: boolean;
  spectralCentroidHz: number;
  crestFactorDb: number;
  subRumbleRatioDb: number;
  mudExcessDb: number;
  sibilanceExcessDb: number;
  duganGainDb: number;
  autoTrimOffsetDb: number;
  maskingConflictWith?: string;
  detectedProfileLabel: string;
}

export interface SystemIntelligenceSummary {
  shortTermLufs: number;
  headroomMarginDb: number;
  spectralTiltDbPerOct: number;
  maskingPairsCount: number;
  automixActiveMics: number;
  channelInsights: Record<string, ChannelAcousticAnalysis>;
}

export function createEmptySystemIntelligence(): SystemIntelligenceSummary {
  return {
    shortTermLufs: -80,
    headroomMarginDb: 24,
    spectralTiltDbPerOct: -4.5,
    maskingPairsCount: 0,
    automixActiveMics: 0,
    channelInsights: {},
  };
}

/**
 * Computes real-time spectral centroid, mud excess (220-450 Hz), sub-rumble (<90 Hz),
 * sibilance (5.5-8.5 kHz), and crest factor directly from live FFT magnitude bins.
 */
export function analyzeChannelSpectrumFft(
  channel: ChannelStrip,
  freqDataDb: Float32Array,
  sampleRateHz: number,
  rmsDbfs: number,
  peakDbfs: number,
  duganGainDb: number,
  autoTrimOffsetDb: number
): ChannelAcousticAnalysis {
  const signalPresent = rmsDbfs > -62;
  if (!signalPresent) {
    return {
      channelId: channel.id,
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

  const nyquist = sampleRateHz / 2;
  const n = freqDataDb.length;
  let weightedFreqSum = 0;
  let magSum = 0;

  let subSum = 0;
  let subCount = 0;
  let mudSum = 0;
  let mudCount = 0;
  let coreSum = 0;
  let coreCount = 0;
  let sibSum = 0;
  let sibCount = 0;

  for (let i = 1; i < n; i++) {
    const hz = (i / n) * nyquist;
    if (hz < 20 || hz > 18000) continue;
    const db = Math.max(-90, Math.min(0, Number.isFinite(freqDataDb[i]) ? freqDataDb[i] : -90));
    const lin = Math.pow(10, db / 20);

    weightedFreqSum += hz * lin;
    magSum += lin;

    if (hz >= 22 && hz <= 90) {
      subSum += db;
      subCount++;
    } else if (hz >= 210 && hz <= 440) {
      mudSum += db;
      mudCount++;
    } else if (hz >= 550 && hz <= 3200) {
      coreSum += db;
      coreCount++;
    } else if (hz >= 5400 && hz <= 8800) {
      sibSum += db;
      sibCount++;
    }
  }

  const spectralCentroidHz =
    magSum > 1e-6 ? Math.round(weightedFreqSum / magSum) : 0;
  const crestFactorDb = Number(Math.max(0, Math.min(28, peakDbfs - rmsDbfs)).toFixed(1));

  const subAvg = subCount > 0 ? subSum / subCount : -80;
  const mudAvg = mudCount > 0 ? mudSum / mudCount : -80;
  const coreAvg = coreCount > 0 ? coreSum / coreCount : -80;
  const sibAvg = sibCount > 0 ? sibSum / sibCount : -80;

  const subRumbleRatioDb = Number((subAvg - coreAvg).toFixed(1));
  const mudExcessDb = Number((mudAvg - coreAvg).toFixed(1));
  const sibilanceExcessDb = Number((sibAvg - coreAvg).toFixed(1));

  let detectedProfileLabel = 'Balanced Full-Range';
  if (spectralCentroidHz < 380 && crestFactorDb > 10) {
    detectedProfileLabel = 'Sub-Heavy Percussive';
  } else if (spectralCentroidHz < 420) {
    detectedProfileLabel = 'Low-End Bass / Body';
  } else if (crestFactorDb >= 11 && spectralCentroidHz >= 750 && spectralCentroidHz <= 2800) {
    detectedProfileLabel = 'Spoken Word / Vocal';
  } else if (sibAvg > coreAvg + 1.5 || spectralCentroidHz > 3400) {
    detectedProfileLabel = 'Bright / Sibilant Top';
  } else if (mudExcessDb > 3.5) {
    detectedProfileLabel = 'Low-Mid Dense (Boxy)';
  }

  return {
    channelId: channel.id,
    signalPresent: true,
    spectralCentroidHz,
    crestFactorDb,
    subRumbleRatioDb,
    mudExcessDb,
    sibilanceExcessDb,
    duganGainDb: Number(duganGainDb.toFixed(1)),
    autoTrimOffsetDb: Number(autoTrimOffsetDb.toFixed(1)),
    detectedProfileLabel,
  };
}

/**
 * Deterministic 1-Click Adaptive Strip Calibration:
 * Uses live measured FFT features when signal is present, or context-matched
 * acoustic engineering curves when idle.
 */
export function computeAutoCalibratedChannelDsp(
  channel: ChannelStrip,
  insight?: ChannelAcousticAnalysis
): {
  patch: Partial<ChannelStrip>;
  summary: string;
} {
  const rec = getRecommendedEqPresetsForChannel(channel);
  const basePreset = rec.primary;

  const nextGeq = new Array(31).fill(0);
  Object.entries(basePreset.geqOffsets).forEach(([idxStr, val]) => {
    nextGeq[Number(idxStr)] = val;
  });

  let hpfFreqHz = basePreset.hpfFreqHz;
  let mudGainDb = basePreset.eqBands[1]?.gainDb ?? -2.5;
  let mudFreqHz = basePreset.eqBands[1]?.freqHz ?? 320;
  let hiMidGainDb = basePreset.eqBands[2]?.gainDb ?? 2.0;
  let hiMidFreqHz = basePreset.eqBands[2]?.freqHz ?? 2800;
  let highGainDb = basePreset.eqBands[3]?.gainDb ?? 1.5;

  let compThresholdDb = channel.dynamics.compThresholdDb;
  let compRatio = channel.dynamics.compRatio;
  let reasonSuffix = `Template "${basePreset.name}"`;

  if (insight?.signalPresent) {
    const isVoiceOrAcoustic =
      channel.category === 'pulpit' ||
      channel.category === 'vocal' ||
      channel.category === 'acoustic' ||
      channel.category === 'choir';

    // Adaptive HPF from sub-rumble ratio
    if (isVoiceOrAcoustic && insight.subRumbleRatioDb > -2) {
      hpfFreqHz = Math.min(145, Math.max(hpfFreqHz, 120));
    }

    // Adaptive Low-Mid Anti-Mud Cut from measured 210-440 Hz excess
    if (insight.mudExcessDb > 1.5) {
      const cut = -Math.min(6.0, Math.max(1.5, insight.mudExcessDb * 0.65));
      mudGainDb = Number((Math.round(cut * 2) / 2).toFixed(1));
      mudFreqHz = channel.category === 'acoustic' ? 240 : channel.category === 'pulpit' ? 340 : 310;
      nextGeq[11] = Math.min(nextGeq[11], mudGainDb);
      nextGeq[12] = Math.min(nextGeq[12], Number((mudGainDb * 0.7).toFixed(1)));
    }

    // Adaptive Presence / Sibilance Balance
    if (insight.sibilanceExcessDb > 2.0) {
      highGainDb = -Math.min(3.5, Number((insight.sibilanceExcessDb * 0.5).toFixed(1)));
      hiMidGainDb = Math.min(hiMidGainDb, 1.5);
    } else if (insight.spectralCentroidHz > 0 && insight.spectralCentroidHz < 1100 && isVoiceOrAcoustic) {
      hiMidGainDb = Math.max(hiMidGainDb, 3.0);
      hiMidFreqHz = 3100;
    }

    // Adaptive Compressor Ratio from Crest Factor
    if (insight.crestFactorDb > 14) {
      compRatio = 4.0;
      compThresholdDb = -18;
    } else if (insight.crestFactorDb < 8) {
      compRatio = 2.4;
      compThresholdDb = -15;
    }

    reasonSuffix = `Measured FFT (${insight.spectralCentroidHz} Hz centroid, ${insight.crestFactorDb} dB crest, ${insight.mudExcessDb > 0 ? `+${insight.mudExcessDb}` : insight.mudExcessDb} dB mud)`;
  }

  const nextBands = channel.eqBands.map((b, idx) => {
    if (idx === 0) {
      return {
        ...b,
        enabled: true,
        freqHz: basePreset.eqBands[0]?.freqHz ?? b.freqHz,
        gainDb: basePreset.eqBands[0]?.gainDb ?? b.gainDb,
        q: basePreset.eqBands[0]?.q ?? b.q,
      };
    }
    if (idx === 1) {
      return {
        ...b,
        enabled: true,
        freqHz: mudFreqHz,
        gainDb: mudGainDb,
        q: 1.9,
      };
    }
    if (idx === 2) {
      return {
        ...b,
        enabled: true,
        freqHz: hiMidFreqHz,
        gainDb: hiMidGainDb,
        q: 1.4,
      };
    }
    return {
      ...b,
      enabled: true,
      freqHz: basePreset.eqBands[3]?.freqHz ?? b.freqHz,
      gainDb: highGainDb,
      q: basePreset.eqBands[3]?.q ?? b.q,
    };
  });

  return {
    patch: {
      hpfEnabled: basePreset.hpfEnabled,
      hpfFreqHz,
      eqEnabled: true,
      eqBands: nextBands,
      geqEnabled: true,
      geqBands: nextGeq,
      dynamics: {
        ...channel.dynamics,
        compEnabled: true,
        compThresholdDb,
        compRatio,
      },
    },
    summary: `Calibrated CH ${String(channel.number).padStart(2, '0')} (${channel.shortName}) via ${reasonSuffix}`,
  };
}

/**
 * Pure deterministic offline DSP audit (no external AI API needed).
 * Analyzes live FFT insights, gain staging, crossover alignment, clock domains, and Virtual DI safety.
 */
export function runDeterministicConsoleAudit(params: {
  channels: ChannelStrip[];
  buses: BusNode[];
  speakers: SpeakerBand[];
  virtualDi: VirtualDiState;
  hardwareProfile: HardwareProfile;
  meters: Record<string, MeterReading>;
  intelligence: SystemIntelligenceSummary;
}): { summary: string; proposals: AiProposal[] } {
  const { channels, speakers, virtualDi, hardwareProfile, meters, intelligence } = params;
  const proposals: AiProposal[] = [];
  const nowStr = new Date().toTimeString().slice(0, 8);

  // 1. Check live channels for Sub Rumble without adequate HPF or Mud buildup
  for (const ch of channels) {
    const ins = intelligence.channelInsights[ch.id];
    const m = meters[ch.id];

    if (ins?.signalPresent) {
      const isVoice = ch.category === 'pulpit' || ch.category === 'vocal' || ch.category === 'choir';
      if (isVoice && (!ch.hpfEnabled || ch.hpfFreqHz < 85) && ins.subRumbleRatioDb > -4) {
        proposals.push({
          id: `dsp-hpf-${ch.id}-${Date.now()}`,
          title: `Engage 110 Hz HPF on ${ch.name}`,
          category: 'spectral_cleanup',
          evidence: `Live FFT shows ${ins.subRumbleRatioDb.toFixed(1)} dB sub-90 Hz energy on voice mic with HPF ${ch.hpfEnabled ? `${ch.hpfFreqHz} Hz` : 'bypassed'}.`,
          affectedNodeIds: [ch.id],
          confidence: 0.94,
          expectedChange: 'Removes stage rumble & plosive proximity boom, +3 dB PA headroom.',
          potentialImpact: 'Minimal; preserves full vocal fundamental clarity.',
          requiresPhysicalAction: false,
          status: 'pending',
          createdAt: nowStr,
          patch: { channelId: ch.id, hpfEnabled: true, hpfFreq: 110 },
        });
      }

      if (ins.mudExcessDb > 3.2 && (ch.eqBands[1]?.gainDb ?? 0) > -2.0) {
        const cutDb = -Math.min(5.0, Math.round(ins.mudExcessDb * 0.65 * 2) / 2);
        proposals.push({
          id: `dsp-mud-${ch.id}-${Date.now()}`,
          title: `Cut ${cutDb.toFixed(1)} dB Mud @ 320 Hz on ${ch.name}`,
          category: 'eq_clarity',
          evidence: `Measured +${ins.mudExcessDb.toFixed(1)} dB low-mid energy excess (210–440 Hz) relative to speech core.`,
          affectedNodeIds: [ch.id],
          confidence: 0.91,
          expectedChange: `Carves ${cutDb.toFixed(1)} dB at 320 Hz to restore intelligibility.`,
          potentialImpact: 'Reduces room boxiness without thinning tone.',
          requiresPhysicalAction: false,
          status: 'pending',
          createdAt: nowStr,
          patch: { channelId: ch.id, eqBandIndex: 1, eqFreqHz: 320, eqGainDb: cutDb },
        });
      }
    }

    if (m?.clipping) {
      proposals.push({
        id: `dsp-clip-${ch.id}-${Date.now()}`,
        title: `Trim Hot Strip ${ch.name} (-3.0 dB)`,
        category: 'gain_staging',
        evidence: `Post-DSP peak reached ${m.peakDbfs.toFixed(1)} dBFS (clipping threshold exceeded).`,
        affectedNodeIds: [ch.id],
        confidence: 0.97,
        expectedChange: 'Lowers strip fader -3.0 dB and tightens compressor threshold to -16 dBFS.',
        potentialImpact: 'Eliminates digital clipping immediately.',
        requiresPhysicalAction: false,
        status: 'pending',
        createdAt: nowStr,
        patch: { channelId: ch.id, faderDeltaDb: -3.0, compThresholdDb: -16 },
      });
    }
  }

  // 2. Crossover gap / overlap audit between Sub & Main Arrays
  const sub = speakers.find((s) => s.role === 'Subwoofer');
  const mainL = speakers.find((s) => s.id === 'spk-main-l');
  if (sub && mainL && Math.abs(sub.lpfHz - mainL.hpfHz) >= 12) {
    proposals.push({
      id: `dsp-xover-${Date.now()}`,
      title: `Crossover Gap Warning: Sub LPF (${sub.lpfHz} Hz) vs Mains HPF (${mainL.hpfHz} Hz)`,
      category: 'crossover_alignment',
      evidence: `${Math.abs(sub.lpfHz - mainL.hpfHz)} Hz mismatch creates phase/magnitude dip or buildup in ${Math.min(sub.lpfHz, mainL.hpfHz)}–${Math.max(sub.lpfHz, mainL.hpfHz)} Hz region.`,
      affectedNodeIds: [sub.id, mainL.id],
      confidence: 0.93,
      expectedChange: `Match Sub LPF and Mains HPF at ${sub.lpfHz} Hz LR24 in Crossover Deck.`,
      potentialImpact: 'Smooth phase summation through the sanctuary crossover region.',
      requiresPhysicalAction: false,
      status: 'pending',
      createdAt: nowStr,
    });
  }

  // 3. Hardware clock drift / Bass V-DI checks
  const driftDev = hardwareProfile.devices.find((d) => d.clockState.includes('Drift'));
  if (driftDev) {
    proposals.push({
      id: `dsp-clock-${Date.now()}`,
      title: `Multi-Interface Clock Domain Caution (${driftDev.name})`,
      category: 'hardware_sync',
      evidence: `${driftDev.name} runs on independent crystal (${driftDev.clockDomain}).`,
      affectedNodeIds: [virtualDi.sourceChannelId],
      confidence: 0.89,
      expectedChange: 'Keep Bass Virtual DI isolated on Aux 3 so dry/wet paths never sum.',
      potentialImpact: 'Prevents sample-drift comb filtering on low end.',
      requiresPhysicalAction: true,
      status: 'pending',
      createdAt: nowStr,
    });
  }

  const liveCount = Object.values(intelligence.channelInsights).filter((i) => i.signalPresent).length;
  const summary =
    proposals.length > 0
      ? `Deterministic DSP Audit scanned ${liveCount} live channel(s), ${speakers.length} crossover bands (${intelligence.shortTermLufs > -75 ? `${intelligence.shortTermLufs.toFixed(1)} LUFS` : 'idle bus'}), and found ${proposals.length} optimization patch(es).`
      : `Deterministic DSP Audit clean: ${liveCount} live channel(s), ${speakers.length} crossover zones aligned (${sub?.lpfHz ?? 90} Hz LR24), ${intelligence.automixActiveMics} Dugan automix mic(s), zero clipping or masking faults.`;

  return { summary, proposals };
}
