import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  getBootstrapData,
  insertEvent,
  resetFactoryData,
  saveConsoleState,
  syncHardwareInventory,
  updateFeedbackStatus,
  updateSoundCheckItem,
  upsertFeedbackIncident,
  upsertScene,
} from './server/db.ts';
import {
  INITIAL_BUSES,
  INITIAL_CHANNELS,
  INITIAL_SCENES,
  INITIAL_SOUND_CHECK,
  INITIAL_SPEAKERS,
  INITIAL_VIRTUAL_CABLES,
  INITIAL_VIRTUAL_DI,
} from './src/engine/profiles.ts';
import type {
  ConsoleThemeId,
  DetectedHardwareDevice,
  FeedbackIncident,
  HardwareProfileId,
  SceneProfile,
  SoundCheckItem,
  StructuredEvent,
} from './src/engine/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const VALID_PROFILE_IDS = new Set<HardwareProfileId>([
  'auto-detected',
  'mg16xu-xonar',
  'dlive-dante-128',
  'studio-usb-8x8',
]);

const VALID_THEME_IDS = new Set<ConsoleThemeId>([
  'obsidian-brass',
  'cobalt-neve',
  'warm-mahogany',
  'emerald-broadcast',
  'titanium-steel',
  'daylight-studio',
]);

const FACTORY_DEFAULTS = {
  profileId: 'auto-detected' as HardwareProfileId,
  activeSceneId: 'scn-sunday',
  channels: INITIAL_CHANNELS,
  buses: INITIAL_BUSES,
  speakers: INITIAL_SPEAKERS,
  virtualCables: INITIAL_VIRTUAL_CABLES,
  virtualDi: INITIAL_VIRTUAL_DI,
  scenes: INITIAL_SCENES,
  soundCheckItems: INITIAL_SOUND_CHECK,
};

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isNonEmptyString(val: unknown, maxLen = 256): val is string {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}

async function startServer() {
  // Ensure SQLite database & schema are initialized at server boot
  getBootstrapData(FACTORY_DEFAULTS);

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Real OS CPU tick snapshot tracker for accurate instantaneous CPU load %
  let prevCpuSnapshot = os.cpus().map((c) => ({ ...c.times }));
  const sampleCpuLoadPct = (): number => {
    const cur = os.cpus();
    let idleDelta = 0;
    let totalDelta = 0;
    for (let i = 0; i < cur.length; i++) {
      const a = prevCpuSnapshot[i];
      const b = cur[i].times;
      if (!a) continue;
      const idle = Math.max(0, b.idle - a.idle);
      const total =
        Math.max(0, b.user - a.user) +
        Math.max(0, b.nice - a.nice) +
        Math.max(0, b.sys - a.sys) +
        Math.max(0, b.irq - a.irq) +
        idle;
      idleDelta += idle;
      totalDelta += total;
    }
    prevCpuSnapshot = cur.map((c) => ({ ...c.times }));
    if (totalDelta > 0) {
      return Math.max(1, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
    }
    const load1 = os.loadavg()[0] ?? 0;
    return Math.max(1, Math.min(100, Math.round((load1 / Math.max(1, cur.length)) * 100)));
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'church-intelligence-console',
      dbEngine: 'node:sqlite',
      dbConnected: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/system/telemetry', (_req, res) => {
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = Math.max(0, totalMemBytes - freeMemBytes);
    const ramLoadPct =
      totalMemBytes > 0 ? Math.max(1, Math.min(100, Math.round((usedMemBytes / totalMemBytes) * 100))) : 0;
    const cpuLoadPct = sampleCpuLoadPct();
    const memUsage = process.memoryUsage();
    res.json({
      cpuLoadPct,
      ramLoadPct,
      usedRamGb: Number((usedMemBytes / (1024 * 1024 * 1024)).toFixed(2)),
      totalRamGb: Number((totalMemBytes / (1024 * 1024 * 1024)).toFixed(2)),
      processRssMb: Math.round(memUsage.rss / (1024 * 1024)),
      heapUsedMb: Math.round(memUsage.heapUsed / (1024 * 1024)),
      cpuCores: os.cpus().length,
      loadAvg1m: Number((os.loadavg()[0] ?? 0).toFixed(2)),
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/console/bootstrap', (_req, res) => {
    try {
      const payload = getBootstrapData(FACTORY_DEFAULTS);
      res.json(payload);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to read console database.',
      });
    }
  });

  app.put('/api/console/state', (req, res) => {
    try {
      const body = req.body ?? {};
      if (
        !VALID_PROFILE_IDS.has(body.profileId) ||
        !isNonEmptyString(body.activeSceneId, 128) ||
        typeof body.graphVersion !== 'number' ||
        !Array.isArray(body.channels) ||
        !Array.isArray(body.buses) ||
        !Array.isArray(body.speakers) ||
        typeof body.virtualDi !== 'object' ||
        body.virtualDi === null
      ) {
        res.status(400).json({ error: 'Invalid console state payload.' });
        return;
      }

      const themeId: ConsoleThemeId = VALID_THEME_IDS.has(body.workspaceTheme)
        ? body.workspaceTheme
        : 'obsidian-brass';

      const result = saveConsoleState({
        profileId: body.profileId,
        workspaceTheme: themeId,
        activeSceneId: body.activeSceneId,
        graphVersion: Math.max(1, Math.floor(body.graphVersion)),
        channels: body.channels,
        buses: body.buses,
        speakers: body.speakers,
        virtualCables: Array.isArray(body.virtualCables) ? body.virtualCables : INITIAL_VIRTUAL_CABLES,
        virtualDi: body.virtualDi,
        proposals: Array.isArray(body.proposals) ? body.proposals : [],
      });
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to persist console state.',
      });
    }
  });

  app.post('/api/console/hardware/sync', (req, res) => {
    try {
      const devices = req.body?.devices;
      if (!Array.isArray(devices) || devices.length > 128) {
        res.status(400).json({ error: 'Devices array required (max 128).' });
        return;
      }
      const sanitized: DetectedHardwareDevice[] = [];
      for (const raw of devices) {
        if (
          !raw ||
          !isNonEmptyString(raw.deviceId, 256) ||
          (raw.kind !== 'audioinput' && raw.kind !== 'audiooutput') ||
          !isNonEmptyString(raw.label, 256)
        ) {
          continue;
        }
        sanitized.push({
          deviceId: raw.deviceId,
          kind: raw.kind,
          label: raw.label,
          groupId: typeof raw.groupId === 'string' ? raw.groupId.slice(0, 256) : 'default',
          driverClass:
            raw.driverClass === 'USB Audio' ||
            raw.driverClass === 'PCIe / Line-In' ||
            raw.driverClass === 'Virtual / Loopback' ||
            raw.driverClass === 'Network Audio' ||
            raw.driverClass === 'System Integrated'
              ? raw.driverClass
              : 'System Integrated',
          sampleRateHz: typeof raw.sampleRateHz === 'number' ? Math.round(raw.sampleRateHz) : 48000,
          channelCount: typeof raw.channelCount === 'number' ? Math.max(1, Math.round(raw.channelCount)) : 2,
          isDefault: Boolean(raw.isDefault),
          lastSeenAt: typeof raw.lastSeenAt === 'string' ? raw.lastSeenAt.slice(0, 64) : new Date().toISOString(),
        });
      }
      syncHardwareInventory(sanitized);
      res.json({ ok: true, syncedCount: sanitized.length });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to sync hardware inventory.',
      });
    }
  });

  app.post('/api/console/scenes', (req, res) => {
    try {
      const scene = req.body?.scene as SceneProfile | undefined;
      if (!scene || !isNonEmptyString(scene.id, 128) || !isNonEmptyString(scene.name, 160)) {
        res.status(400).json({ error: 'Valid scene object required.' });
        return;
      }
      upsertScene(scene);
      res.json({ ok: true, sceneId: scene.id });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save scene.',
      });
    }
  });

  app.post('/api/console/events', (req, res) => {
    try {
      const ev = req.body?.event as StructuredEvent | undefined;
      if (!ev || !isNonEmptyString(ev.id, 128) || !isNonEmptyString(ev.message, 1024)) {
        res.status(400).json({ error: 'Valid event payload required.' });
        return;
      }
      insertEvent(ev);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to log event.',
      });
    }
  });

  app.post('/api/console/feedback', (req, res) => {
    try {
      const inc = req.body?.incident as FeedbackIncident | undefined;
      if (!inc || !isNonEmptyString(inc.id, 128) || !isNonEmptyString(inc.channelId, 64)) {
        res.status(400).json({ error: 'Valid feedback incident required.' });
        return;
      }
      upsertFeedbackIncident(inc);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save feedback incident.',
      });
    }
  });

  app.patch('/api/console/feedback/:id', (req, res) => {
    try {
      const id = req.params.id;
      const status = req.body?.status as FeedbackIncident['status'] | undefined;
      if (
        !isNonEmptyString(id, 128) ||
        (status !== 'risk_predicted' &&
          status !== 'feedback_detected' &&
          status !== 'suppression_applied_verified' &&
          status !== 'dismissed')
      ) {
        res.status(400).json({ error: 'Valid incident ID and status required.' });
        return;
      }
      updateFeedbackStatus(id, status);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update feedback incident.',
      });
    }
  });

  app.patch('/api/console/soundcheck/:id', (req, res) => {
    try {
      const id = req.params.id;
      const item = req.body?.item as SoundCheckItem | undefined;
      if (!isNonEmptyString(id, 128) || !item || item.id !== id) {
        res.status(400).json({ error: 'Valid sound check item required.' });
        return;
      }
      updateSoundCheckItem(item);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update soundcheck item.',
      });
    }
  });

  app.post('/api/console/reset', (_req, res) => {
    try {
      const payload = resetFactoryData(FACTORY_DEFAULTS);
      res.json(payload);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to reset database.',
      });
    }
  });

  app.post('/api/ai-engineer/analyze', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in environment secrets. Audio engine continues uninterrupted.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    try {
      const { snapshot } = req.body ?? {};
      const systemInstruction = [
        'You are the AI Sound Engineer inside Church Intelligence Audio Console.',
        'Analyze the provided live SignalGraph, HardwareProfile capabilities, channel meters, feedback alerts, and acoustics.',
        'Follow strict engineering truth:',
        '1. Never propose software control over a parameter marked "manual" or "unsupported" (e.g., analog preamp trim on Yamaha MG16XU). Instead note physical knob adjustment required.',
        '2. Cite exact channel IDs, frequencies (Hz), gains (dB), and measured levels from the snapshot.',
        '3. Output actionable, safe proposals for gain staging, HPF cleanup, feedback notch cuts, bass DI clarity, or broadcast loudness.',
        '4. Be concise, technical, and transparent about confidence and risk.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze this live church audio console snapshot and generate 3 to 5 prioritized engineering proposals:\n${JSON.stringify(snapshot)}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Concise 2-sentence engineering assessment of mix headroom, feedback risk, and hardware boundaries.',
              },
              proposals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    category: {
                      type: Type.STRING,
                      description: 'One of: gain_staging, eq_cleanup, feedback, bass_di, speaker_protection, broadcast',
                    },
                    evidence: { type: Type.STRING },
                    affectedNodeIds: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    confidence: { type: Type.NUMBER },
                    expectedChange: { type: Type.STRING },
                    potentialImpact: { type: Type.STRING },
                    requiresPhysicalAction: { type: Type.BOOLEAN },
                    patch: {
                      type: Type.OBJECT,
                      properties: {
                        channelId: { type: Type.STRING },
                        hpfEnabled: { type: Type.BOOLEAN },
                        hpfFreq: { type: Type.NUMBER },
                        faderDeltaDb: { type: Type.NUMBER },
                        eqBandIndex: { type: Type.NUMBER },
                        eqGainDb: { type: Type.NUMBER },
                        eqFreqHz: { type: Type.NUMBER },
                        compThresholdDb: { type: Type.NUMBER },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upstream AI analysis failure';
      res.status(502).json({
        error: message,
        code: 'GEMINI_UPSTREAM_ERROR',
      });
    }
  });

  app.post('/api/ai-engineer/ask', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in environment secrets. Local console controls remain fully active.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    try {
      const { question, snapshot } = req.body ?? {};
      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'Question string is required.' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Operator question: "${question}"\n\nCurrent live console state:\n${JSON.stringify(snapshot)}`,
        config: {
          systemInstruction:
            'You are a senior live church audio systems engineer. Answer the operator directly using exact node IDs, dBFS/Hz values, and explicit hardware capability boundaries (distinguishing physical analog mixer controls from software DSP controls). Keep answers concise, actionable, and grounded strictly in the provided console state.',
        },
      });

      res.json({
        answer: response.text ?? 'No response text generated.',
        model: 'gemini-4-hydrogen',
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upstream AI query failure';
      res.status(502).json({
        error: message,
        code: 'GEMINI_UPSTREAM_ERROR',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production bundle not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Church Intelligence Audio Console server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
