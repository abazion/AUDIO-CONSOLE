import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import {
  deleteSnapshotById,
  getBootstrapData,
  insertEvent,
  patchBusAtomic,
  patchChannelAtomic,
  patchDcaGroupAtomic,
  resetFactoryData,
  saveConsoleState,
  syncHardwareInventory,
  updateFeedbackStatus,
  updateSoundCheckItem,
  upsertFeedbackIncident,
  upsertScene,
  upsertSnapshot,
} from './server/db.ts';
import {
  INITIAL_BUSES,
  INITIAL_CHANNELS,
  INITIAL_DCA_GROUPS,
  INITIAL_FX_RACK,
  INITIAL_MATRIX_ZONES,
  INITIAL_SCENES,
  INITIAL_SOUND_CHECK,
  INITIAL_SPEAKERS,
  INITIAL_VIRTUAL_CABLES,
  INITIAL_VIRTUAL_DI,
} from './src/engine/profiles.ts';
import type {
  ConsoleSnapshotProfile,
  ConsoleThemeId,
  DcaGroupId,
  DetectedHardwareDevice,
  FeedbackIncident,
  HardwareProfileId,
  OperatorRole,
  SceneProfile,
  SoundCheckItem,
  StructuredEvent,
} from './src/engine/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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

const VALID_ROLES = new Set<OperatorRole>(['volunteer', 'foh', 'system-tech']);

const FACTORY_DEFAULTS = {
  profileId: 'auto-detected' as HardwareProfileId,
  activeSceneId: 'scn-sunday',
  channels: INITIAL_CHANNELS,
  buses: INITIAL_BUSES,
  speakers: INITIAL_SPEAKERS,
  virtualCables: INITIAL_VIRTUAL_CABLES,
  virtualDi: INITIAL_VIRTUAL_DI,
  dcaGroups: INITIAL_DCA_GROUPS,
  fxRack: INITIAL_FX_RACK,
  matrixZones: INITIAL_MATRIX_ZONES,
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

function getOperatorRole(req: express.Request): OperatorRole {
  const raw = req.header('x-operator-role');
  if (raw && VALID_ROLES.has(raw as OperatorRole)) {
    return raw as OperatorRole;
  }
  return 'foh';
}

function requireOperatorRole(allowed: OperatorRole[]): express.RequestHandler {
  return (req, res, next) => {
    const role = getOperatorRole(req);
    if (!allowed.includes(role)) {
      res.status(403).json({
        error: `Operator role '${role}' is not authorized for this action. Requires: ${allowed.join(' or ')}.`,
        code: 'RBAC_FORBIDDEN',
        role,
      });
      return;
    }
    next();
  };
}

function createRateLimiter(maxRequests: number, windowMs: number): express.RequestHandler {
  const hits = new Map<string, number[]>();
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'local';
    const now = Date.now();
    const arr = (hits.get(ip) ?? []).filter((ts) => now - ts < windowMs);
    if (arr.length >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded. Slow down rapid requests and retry shortly.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSec: Math.ceil(windowMs / 1000),
      });
      return;
    }
    arr.push(now);
    hits.set(ip, arr);
    if (hits.size > 1000) {
      for (const [k, timestamps] of hits.entries()) {
        if (timestamps.every((t) => now - t >= windowMs)) {
          hits.delete(k);
        }
      }
    }
    next();
  };
}

async function startServer() {
  // Ensure SQLite database & schema are initialized at server boot
  getBootstrapData(FACTORY_DEFAULTS);

  const app = express();
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const wsClients = new Map<WebSocket, { clientId: string; role: OperatorRole }>();

  const broadcastWs = (payload: Record<string, unknown>, excludeClientId?: string) => {
    const encoded = JSON.stringify(payload);
    for (const [socket, meta] of wsClients.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (excludeClientId && meta.clientId === excludeClientId) continue;
      socket.send(encoded);
    }
  };

  const broadcastPresence = () => {
    const seats = Array.from(wsClients.values());
    broadcastWs({
      type: 'presence:update',
      connectedSeats: Math.max(1, seats.length),
      seats,
      timestamp: new Date().toISOString(),
    });
  };

  wss.on('connection', (socket) => {
    const defaultMeta: { clientId: string; role: OperatorRole } = {
      clientId: `seat-${Math.random().toString(36).slice(2, 8)}`,
      role: 'foh',
    };
    wsClients.set(socket, defaultMeta);
    broadcastPresence();

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string;
          clientId?: string;
          role?: OperatorRole;
        };
        if (msg.type === 'hello' && msg.clientId) {
          wsClients.set(socket, {
            clientId: msg.clientId.slice(0, 64),
            role: msg.role && VALID_ROLES.has(msg.role) ? msg.role : 'foh',
          });
          broadcastPresence();
        }
      } catch {
        // Ignore malformed WS frames
      }
    });

    socket.on('close', () => {
      wsClients.delete(socket);
      broadcastPresence();
    });
  });

  app.use(express.json({ limit: '4mb' }));

  const mutationRateLimiter = createRateLimiter(300, 60_000);
  const aiRateLimiter = createRateLimiter(20, 60_000);
  app.use('/api/console', (req, res, next) => {
    if (req.method === 'GET') {
      next();
      return;
    }
    mutationRateLimiter(req, res, next);
  });
  app.use('/api/ai-engineer', aiRateLimiter);

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

      const clientId = isNonEmptyString(body.clientId, 128) ? body.clientId : '';
      const result = saveConsoleState({
        profileId: body.profileId,
        workspaceTheme: themeId,
        activeSceneId: body.activeSceneId,
        graphVersion: Math.max(1, Math.floor(body.graphVersion)),
        revisionId: typeof body.revisionId === 'number' ? body.revisionId : undefined,
        clientId,
        channels: body.channels,
        buses: body.buses,
        speakers: body.speakers,
        virtualCables: Array.isArray(body.virtualCables) ? body.virtualCables : INITIAL_VIRTUAL_CABLES,
        virtualDi: body.virtualDi,
        dcaGroups: Array.isArray(body.dcaGroups) ? body.dcaGroups : undefined,
        fxRack: Array.isArray(body.fxRack) ? body.fxRack : undefined,
        matrixZones: Array.isArray(body.matrixZones) ? body.matrixZones : undefined,
        proposals: Array.isArray(body.proposals) ? body.proposals : [],
        automationLanes: Array.isArray(body.automationLanes) ? body.automationLanes : [],
        automationDurationSec:
          typeof body.automationDurationSec === 'number' ? body.automationDurationSec : 60,
      });
      if (!result.ok && result.conflict) {
        res.status(409).json({
          error: 'Console state conflict: another operator seat updated the console.',
          code: 'REVISION_CONFLICT',
          revisionId: result.revisionId,
          updatedAt: result.updatedAt,
        });
        return;
      }
      broadcastWs(
        {
          type: 'state:updated',
          revisionId: result.revisionId,
          updatedAt: result.updatedAt,
          senderClientId: clientId,
          state: {
            profileId: body.profileId,
            workspaceTheme: themeId,
            activeSceneId: body.activeSceneId,
            graphVersion: Math.max(1, Math.floor(body.graphVersion)),
            channels: body.channels,
            buses: body.buses,
            speakers: body.speakers,
            virtualCables: Array.isArray(body.virtualCables) ? body.virtualCables : INITIAL_VIRTUAL_CABLES,
            virtualDi: body.virtualDi,
            dcaGroups: Array.isArray(body.dcaGroups) ? body.dcaGroups : undefined,
            fxRack: Array.isArray(body.fxRack) ? body.fxRack : undefined,
            matrixZones: Array.isArray(body.matrixZones) ? body.matrixZones : undefined,
            proposals: Array.isArray(body.proposals) ? body.proposals : [],
            automationLanes: Array.isArray(body.automationLanes) ? body.automationLanes : [],
            automationDurationSec:
              typeof body.automationDurationSec === 'number' ? body.automationDurationSec : 60,
          },
        },
        clientId
      );
      res.json({ ok: true, revisionId: result.revisionId, updatedAt: result.updatedAt });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to persist console state.',
      });
    }
  });

  app.patch('/api/console/channels/:id', (req, res) => {
    try {
      const channelId = req.params.id;
      const body = req.body ?? {};
      const patch = body.patch as Record<string, unknown> | undefined;
      if (!isNonEmptyString(channelId, 128) || !patch || typeof patch !== 'object') {
        res.status(400).json({ error: 'Valid channelId and patch object required.' });
        return;
      }
      const role = getOperatorRole(req);
      if (role === 'volunteer') {
        const restrictedKeys = ['eqBands', 'geqBands', 'dynamics', 'hpfFreqHz', 'hpfEnabled', 'sourceBinding', 'dcaGroup', 'muteGroup', 'muteSafe'];
        if (restrictedKeys.some((k) => k in patch)) {
          res.status(403).json({
            error: 'Volunteer role cannot modify DSP EQ, dynamics, or routing assignments.',
            code: 'RBAC_FORBIDDEN',
          });
          return;
        }
      }
      const clientId = isNonEmptyString(body.clientId, 128) ? body.clientId : '';
      const result = patchChannelAtomic(channelId, patch, {
        expectedRevisionId: typeof body.expectedRevisionId === 'number' ? body.expectedRevisionId : undefined,
        clientId,
      });
      if (result.notFound) {
        res.status(404).json({ error: `Channel ${channelId} not found.` });
        return;
      }
      if (result.conflict) {
        res.status(409).json({
          error: 'Channel modified by another seat.',
          code: 'REVISION_CONFLICT',
          revisionId: result.revisionId,
          updatedAt: result.updatedAt,
        });
        return;
      }
      broadcastWs(
        {
          type: 'channel:patched',
          channelId,
          channel: result.channel,
          revisionId: result.revisionId,
          graphVersion: result.graphVersion,
          senderClientId: clientId,
        },
        clientId
      );
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to patch channel.',
      });
    }
  });

  app.patch('/api/console/buses/:id', (req, res) => {
    try {
      const busId = req.params.id;
      const body = req.body ?? {};
      const patch = body.patch as Record<string, unknown> | undefined;
      if (!isNonEmptyString(busId, 128) || !patch || typeof patch !== 'object') {
        res.status(400).json({ error: 'Valid busId and patch object required.' });
        return;
      }
      const clientId = isNonEmptyString(body.clientId, 128) ? body.clientId : '';
      const result = patchBusAtomic(busId, patch, {
        expectedRevisionId: typeof body.expectedRevisionId === 'number' ? body.expectedRevisionId : undefined,
        clientId,
      });
      if (result.notFound) {
        res.status(404).json({ error: `Bus ${busId} not found.` });
        return;
      }
      if (result.conflict) {
        res.status(409).json({
          error: 'Bus modified by another seat.',
          code: 'REVISION_CONFLICT',
          revisionId: result.revisionId,
          updatedAt: result.updatedAt,
        });
        return;
      }
      broadcastWs(
        {
          type: 'bus:patched',
          busId,
          bus: result.bus,
          revisionId: result.revisionId,
          graphVersion: result.graphVersion,
          senderClientId: clientId,
        },
        clientId
      );
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to patch bus.',
      });
    }
  });

  app.post('/api/console/osc', requireOperatorRole(['foh', 'system-tech']), (req, res) => {
    try {
      const { address, args } = req.body ?? {};
      if (!isNonEmptyString(address, 256) || !address.startsWith('/')) {
        res.status(400).json({ error: 'Valid OSC address string starting with "/" required.' });
        return;
      }
      const arg0 = Array.isArray(args) ? args[0] : args;
      const chFaderMatch = address.match(/^\/ch\/(\d+)\/fader$/i);
      const chMuteMatch = address.match(/^\/ch\/(\d+)\/mute$/i);
      const busFaderMatch = address.match(/^\/bus\/([a-z0-9-]+)\/fader$/i);
      const busMuteMatch = address.match(/^\/bus\/([a-z0-9-]+)\/mute$/i);
      const dcaFaderMatch = address.match(/^\/dca\/([A-D])\/fader$/i);
      const dcaMuteMatch = address.match(/^\/dca\/([A-D])\/mute$/i);

      if (chFaderMatch || chMuteMatch) {
        const chNum = Number((chFaderMatch ?? chMuteMatch)![1]);
        const boot = getBootstrapData(FACTORY_DEFAULTS);
        const target = boot.channels.find((c) => c.number === chNum);
        if (!target) {
          res.status(404).json({ error: `OSC channel ${chNum} not found.` });
          return;
        }
        const patch = chFaderMatch
          ? { faderDb: Math.max(-75, Math.min(10, Number(arg0) || 0)) }
          : { mute: Boolean(arg0) };
        const result = patchChannelAtomic(target.id, patch, { clientId: 'osc-bridge' });
        broadcastWs({
          type: 'channel:patched',
          channelId: target.id,
          channel: result.channel,
          revisionId: result.revisionId,
          graphVersion: result.graphVersion,
          senderClientId: 'osc-bridge',
        });
        broadcastWs({ type: 'osc:command', address, args: [arg0], timestamp: new Date().toISOString() });
        res.json({ ...result, ok: true, targetId: target.id, address });
        return;
      }

      if (busFaderMatch || busMuteMatch) {
        const busKey = (busFaderMatch ?? busMuteMatch)![1];
        const busId = busKey.startsWith('bus-') ? busKey : `bus-${busKey}`;
        const patch = busFaderMatch
          ? { faderDb: Math.max(-75, Math.min(10, Number(arg0) || 0)) }
          : { mute: Boolean(arg0) };
        const result = patchBusAtomic(busId, patch, { clientId: 'osc-bridge' });
        if (result.notFound) {
          res.status(404).json({ error: `OSC bus ${busId} not found.` });
          return;
        }
        broadcastWs({
          type: 'bus:patched',
          busId,
          bus: result.bus,
          revisionId: result.revisionId,
          graphVersion: result.graphVersion,
          senderClientId: 'osc-bridge',
        });
        broadcastWs({ type: 'osc:command', address, args: [arg0], timestamp: new Date().toISOString() });
        res.json({ ...result, ok: true, targetId: busId, address });
        return;
      }

      if (dcaFaderMatch || dcaMuteMatch) {
        const dcaId = (dcaFaderMatch ?? dcaMuteMatch)![1].toUpperCase() as DcaGroupId;
        const patch = dcaFaderMatch
          ? { faderDb: Math.max(-75, Math.min(10, Number(arg0) || 0)) }
          : { mute: Boolean(arg0) };
        const result = patchDcaGroupAtomic(dcaId, patch, INITIAL_DCA_GROUPS, 'osc-bridge');
        broadcastWs({
          type: 'dca:patched',
          dcaGroups: result.dcaGroups,
          revisionId: result.revisionId,
          senderClientId: 'osc-bridge',
        });
        broadcastWs({ type: 'osc:command', address, args: [arg0], timestamp: new Date().toISOString() });
        res.json({ ...result, ok: true, targetId: `dca-${dcaId}`, address });
        return;
      }

      res.status(400).json({ error: `Unsupported OSC address pattern: ${address}` });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to process OSC command.',
      });
    }
  });

  app.post('/api/console/hardware/sync', requireOperatorRole(['foh', 'system-tech']), (req, res) => {
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

  app.post('/api/console/scenes', requireOperatorRole(['foh', 'system-tech']), (req, res) => {
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

  app.post('/api/console/snapshots', requireOperatorRole(['foh', 'system-tech']), (req, res) => {
    try {
      const snapshot = req.body?.snapshot as ConsoleSnapshotProfile | undefined;
      if (
        !snapshot ||
        !isNonEmptyString(snapshot.id, 128) ||
        !isNonEmptyString(snapshot.name, 160) ||
        !Array.isArray(snapshot.channels) ||
        !Array.isArray(snapshot.buses) ||
        !Array.isArray(snapshot.speakers)
      ) {
        res.status(400).json({ error: 'Valid full console snapshot object required.' });
        return;
      }
      upsertSnapshot(snapshot);
      res.json({ ok: true, snapshotId: snapshot.id });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save console snapshot.',
      });
    }
  });

  app.delete('/api/console/snapshots/:id', requireOperatorRole(['system-tech', 'foh']), (req, res) => {
    try {
      const id = req.params.id;
      if (!isNonEmptyString(id, 128)) {
        res.status(400).json({ error: 'Valid snapshot ID required.' });
        return;
      }
      deleteSnapshotById(id);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to delete console snapshot.',
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

  app.post('/api/console/reset', requireOperatorRole(['system-tech', 'foh']), (_req, res) => {
    try {
      const payload = resetFactoryData(FACTORY_DEFAULTS);
      broadcastWs({ type: 'console:reset', revisionId: payload.revisionId, timestamp: payload.updatedAt });
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
        model: GEMINI_MODEL,
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
        model: GEMINI_MODEL,
        contents: `Operator question: "${question}"\n\nCurrent live console state:\n${JSON.stringify(snapshot)}`,
        config: {
          systemInstruction:
            'You are a senior live church audio systems engineer. Answer the operator directly using exact node IDs, dBFS/Hz values, and explicit hardware capability boundaries (distinguishing physical analog mixer controls from software DSP controls). Keep answers concise, actionable, and grounded strictly in the provided console state.',
        },
      });

      res.json({
        answer: response.text ?? 'No response text generated.',
        model: GEMINI_MODEL,
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Church Intelligence Audio Console server + WS listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
