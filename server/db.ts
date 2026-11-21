import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AiProposal,
  BusNode,
  ChannelStrip,
  ConsoleSnapshotProfile,
  ConsoleThemeId,
  DetectedHardwareDevice,
  FeedbackIncident,
  HardwareProfileId,
  SceneProfile,
  SoundCheckItem,
  SpeakerBand,
  StructuredEvent,
  VirtualCableNode,
  VirtualDiState,
} from '../src/engine/types.ts';

export interface ConsoleFactoryDefaults {
  profileId: HardwareProfileId;
  activeSceneId: string;
  channels: ChannelStrip[];
  buses: BusNode[];
  speakers: SpeakerBand[];
  virtualCables: VirtualCableNode[];
  virtualDi: VirtualDiState;
  scenes: SceneProfile[];
  soundCheckItems: SoundCheckItem[];
}

export interface PersistedConsoleStatePayload {
  profileId: HardwareProfileId;
  workspaceTheme: ConsoleThemeId;
  activeSceneId: string;
  graphVersion: number;
  channels: ChannelStrip[];
  buses: BusNode[];
  speakers: SpeakerBand[];
  virtualCables: VirtualCableNode[];
  virtualDi: VirtualDiState;
  proposals: AiProposal[];
}

export interface BootstrapPayload extends PersistedConsoleStatePayload {
  scenes: SceneProfile[];
  snapshots: ConsoleSnapshotProfile[];
  hardwareInventory: DetectedHardwareDevice[];
  feedbackIncidents: FeedbackIncident[];
  soundCheckItems: SoundCheckItem[];
  events: StructuredEvent[];
  dbPath: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'console.db');

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS console_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      profile_id TEXT NOT NULL,
      theme_id TEXT NOT NULL DEFAULT 'obsidian-brass',
      active_scene_id TEXT NOT NULL,
      graph_version INTEGER NOT NULL,
      channels_json TEXT NOT NULL,
      buses_json TEXT NOT NULL,
      speakers_json TEXT NOT NULL,
      virtual_cables_json TEXT NOT NULL DEFAULT '[]',
      virtual_di_json TEXT NOT NULL,
      proposals_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      service_type TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL,
      description TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hardware_inventory (
      device_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      group_id TEXT NOT NULL,
      driver_class TEXT NOT NULL,
      sample_rate_hz INTEGER NOT NULL,
      channel_count INTEGER NOT NULL,
      is_default INTEGER NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback_incidents (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      freq_hz REAL NOT NULL,
      level_db REAL NOT NULL,
      q_estimate REAL NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      notch_proposed_db REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sound_check_items (
      id TEXT PRIMARY KEY,
      stage TEXT NOT NULL,
      target_node_id TEXT NOT NULL,
      description TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      measured_value TEXT NOT NULL,
      requires_live_tone_auth INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      family TEXT NOT NULL,
      severity TEXT NOT NULL,
      service TEXT NOT NULL,
      graph_version INTEGER NOT NULL,
      node_id TEXT,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS console_snapshots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);

  const cols = db.prepare('PRAGMA table_info(console_state)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'theme_id')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN theme_id TEXT NOT NULL DEFAULT 'obsidian-brass';`);
  }
  if (!cols.some((c) => c.name === 'virtual_cables_json')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN virtual_cables_json TEXT NOT NULL DEFAULT '[]';`);
  }

  dbInstance = db;
  return db;
}

function seedIfEmpty(db: DatabaseSync, defaults: ConsoleFactoryDefaults): void {
  const existingState = db.prepare('SELECT id FROM console_state WHERE id = 1').get() as
    | { id: number }
    | undefined;

  const nowIso = new Date().toISOString();

  if (!existingState) {
    db.prepare(
      `INSERT INTO console_state (
        id, profile_id, theme_id, active_scene_id, graph_version,
        channels_json, buses_json, speakers_json, virtual_cables_json, virtual_di_json, proposals_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      1,
      defaults.profileId,
      'obsidian-brass',
      defaults.activeSceneId,
      1,
      JSON.stringify(defaults.channels),
      JSON.stringify(defaults.buses),
      JSON.stringify(defaults.speakers),
      JSON.stringify(defaults.virtualCables),
      JSON.stringify(defaults.virtualDi),
      JSON.stringify([]),
      nowIso
    );
  }

  const sceneCountRow = db.prepare('SELECT COUNT(*) as cnt FROM scenes').get() as { cnt: number };
  if (sceneCountRow.cnt === 0) {
    const insertScene = db.prepare(
      `INSERT INTO scenes (id, name, service_type, updated_at, version, description, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of defaults.scenes) {
      insertScene.run(
        s.id,
        s.name,
        s.serviceType,
        s.updatedAt,
        s.version,
        s.description,
        JSON.stringify({
          channelFaders: s.channelFaders,
          channelMutes: s.channelMutes,
          channelHpf: s.channelHpf,
          busFaders: s.busFaders,
          virtualDiSaturation: s.virtualDiSaturation,
        })
      );
    }
  }

  const chkCountRow = db.prepare('SELECT COUNT(*) as cnt FROM sound_check_items').get() as { cnt: number };
  if (chkCountRow.cnt === 0) {
    const insertChk = db.prepare(
      `INSERT INTO sound_check_items (
        id, stage, target_node_id, description, method, status, measured_value, requires_live_tone_auth
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of defaults.soundCheckItems) {
      insertChk.run(
        item.id,
        item.stage,
        item.targetNodeId,
        item.description,
        item.method,
        item.status,
        item.measuredValue,
        item.requiresLiveToneAuth ? 1 : 0
      );
    }
  }
}

export function getBootstrapData(defaults: ConsoleFactoryDefaults): BootstrapPayload {
  const db = getDb();
  seedIfEmpty(db, defaults);

  const row = db
    .prepare(
      `SELECT profile_id, theme_id, active_scene_id, graph_version, channels_json, buses_json,
              speakers_json, virtual_cables_json, virtual_di_json, proposals_json, updated_at
       FROM console_state WHERE id = 1`
    )
    .get() as {
    profile_id: string;
    theme_id: string;
    active_scene_id: string;
    graph_version: number;
    channels_json: string;
    buses_json: string;
    speakers_json: string;
    virtual_cables_json: string;
    virtual_di_json: string;
    proposals_json: string;
    updated_at: string;
  };

  const sceneRows = db
    .prepare(
      `SELECT id, name, service_type, updated_at, version, description, payload_json
       FROM scenes ORDER BY version DESC`
    )
    .all() as {
    id: string;
    name: string;
    service_type: string;
    updated_at: string;
    version: number;
    description: string;
    payload_json: string;
  }[];

  const scenes: SceneProfile[] = sceneRows.map((s) => {
    const payload = JSON.parse(s.payload_json) as {
      channelFaders: Record<string, number>;
      channelMutes: Record<string, boolean>;
      channelHpf: Record<string, number>;
      busFaders: Record<string, number>;
      virtualDiSaturation: number;
    };
    return {
      id: s.id,
      name: s.name,
      serviceType: s.service_type,
      updatedAt: s.updated_at,
      version: s.version,
      description: s.description,
      ...payload,
    };
  });

  const hwRows = db
    .prepare(
      `SELECT device_id, kind, label, group_id, driver_class, sample_rate_hz,
              channel_count, is_default, last_seen_at
       FROM hardware_inventory ORDER BY kind ASC, is_default DESC, label ASC`
    )
    .all() as {
    device_id: string;
    kind: 'audioinput' | 'audiooutput';
    label: string;
    group_id: string;
    driver_class: DetectedHardwareDevice['driverClass'];
    sample_rate_hz: number;
    channel_count: number;
    is_default: number;
    last_seen_at: string;
  }[];

  const hardwareInventory: DetectedHardwareDevice[] = hwRows.map((h) => ({
    deviceId: h.device_id,
    kind: h.kind,
    label: h.label,
    groupId: h.group_id,
    driverClass: h.driver_class,
    sampleRateHz: h.sample_rate_hz,
    channelCount: h.channel_count,
    isDefault: h.is_default === 1,
    lastSeenAt: h.last_seen_at,
  }));

  const fbRows = db
    .prepare(
      `SELECT id, channel_id, freq_hz, level_db, q_estimate, confidence, status, detected_at, notch_proposed_db
       FROM feedback_incidents ORDER BY detected_at DESC LIMIT 40`
    )
    .all() as {
    id: string;
    channel_id: string;
    freq_hz: number;
    level_db: number;
    q_estimate: number;
    confidence: number;
    status: FeedbackIncident['status'];
    detected_at: string;
    notch_proposed_db: number;
  }[];

  const feedbackIncidents: FeedbackIncident[] = fbRows.map((f) => ({
    id: f.id,
    channelId: f.channel_id,
    freqHz: f.freq_hz,
    levelDb: f.level_db,
    qEstimate: f.q_estimate,
    confidence: f.confidence,
    status: f.status,
    detectedAt: f.detected_at,
    notchProposedDb: f.notch_proposed_db,
  }));

  const chkRows = db
    .prepare(
      `SELECT id, stage, target_node_id, description, method, status, measured_value, requires_live_tone_auth
       FROM sound_check_items ORDER BY id ASC`
    )
    .all() as {
    id: string;
    stage: string;
    target_node_id: string;
    description: string;
    method: SoundCheckItem['method'];
    status: SoundCheckItem['status'];
    measured_value: string;
    requires_live_tone_auth: number;
  }[];

  const soundCheckItems: SoundCheckItem[] = chkRows.map((c) => ({
    id: c.id,
    stage: c.stage,
    targetNodeId: c.target_node_id,
    description: c.description,
    method: c.method,
    status: c.status,
    measuredValue: c.measured_value,
    requiresLiveToneAuth: c.requires_live_tone_auth === 1,
  }));

  const eventRows = db
    .prepare(
      `SELECT id, timestamp, family, severity, service, graph_version, node_id, message
       FROM events ORDER BY rowid DESC LIMIT 60`
    )
    .all() as {
    id: string;
    timestamp: string;
    family: StructuredEvent['family'];
    severity: StructuredEvent['severity'];
    service: string;
    graph_version: number;
    node_id: string | null;
    message: string;
  }[];

  const events: StructuredEvent[] = eventRows.map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    family: e.family,
    severity: e.severity,
    service: e.service,
    graphVersion: e.graph_version,
    nodeId: e.node_id ?? undefined,
    message: e.message,
  }));

  // Strip ephemeral live stream/file "active" state on fresh reload because WebAudio MediaStreams don't survive page reloads
  const channels = (JSON.parse(row.channels_json) as ChannelStrip[]).map((ch) => ({
    ...ch,
    sourceBinding: ch.sourceBinding
      ? { ...ch.sourceBinding, active: false }
      : { kind: 'none' as const, label: 'Unpatched · Click Source', active: false },
  }));

  const parsedCables = JSON.parse(row.virtual_cables_json || '[]') as VirtualCableNode[];
  const virtualCables =
    Array.isArray(parsedCables) && parsedCables.length > 0
      ? parsedCables
      : defaults.virtualCables;

  const snapshotRows = db
    .prepare(
      `SELECT id, name, category, notes, created_at, updated_at, payload_json
       FROM console_snapshots ORDER BY updated_at DESC`
    )
    .all() as {
    id: string;
    name: string;
    category: string;
    notes: string;
    created_at: string;
    updated_at: string;
    payload_json: string;
  }[];

  const snapshots: ConsoleSnapshotProfile[] = snapshotRows.map((snap) => {
    const p = JSON.parse(snap.payload_json) as Omit<
      ConsoleSnapshotProfile,
      'id' | 'name' | 'category' | 'notes' | 'createdAt' | 'updatedAt'
    >;
    return {
      id: snap.id,
      name: snap.name,
      category: snap.category,
      notes: snap.notes,
      createdAt: snap.created_at,
      updatedAt: snap.updated_at,
      ...p,
    };
  });

  return {
    profileId: row.profile_id as HardwareProfileId,
    workspaceTheme: (row.theme_id || 'obsidian-brass') as ConsoleThemeId,
    activeSceneId: row.active_scene_id,
    graphVersion: row.graph_version,
    channels,
    buses: JSON.parse(row.buses_json) as BusNode[],
    speakers: JSON.parse(row.speakers_json) as SpeakerBand[],
    virtualCables,
    virtualDi: JSON.parse(row.virtual_di_json) as VirtualDiState,
    proposals: JSON.parse(row.proposals_json) as AiProposal[],
    scenes,
    snapshots,
    hardwareInventory,
    feedbackIncidents,
    soundCheckItems,
    events,
    dbPath: 'data/console.db',
    updatedAt: row.updated_at,
  };
}

export function saveConsoleState(payload: PersistedConsoleStatePayload): { updatedAt: string } {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE console_state
     SET profile_id = ?, theme_id = ?, active_scene_id = ?, graph_version = ?,
         channels_json = ?, buses_json = ?, speakers_json = ?,
         virtual_cables_json = ?, virtual_di_json = ?, proposals_json = ?, updated_at = ?
     WHERE id = 1`
  ).run(
    payload.profileId,
    payload.workspaceTheme,
    payload.activeSceneId,
    payload.graphVersion,
    JSON.stringify(payload.channels),
    JSON.stringify(payload.buses),
    JSON.stringify(payload.speakers),
    JSON.stringify(payload.virtualCables ?? []),
    JSON.stringify(payload.virtualDi),
    JSON.stringify(payload.proposals),
    updatedAt
  );
  return { updatedAt };
}

export function syncHardwareInventory(devices: DetectedHardwareDevice[]): void {
  const db = getDb();
  db.exec('BEGIN;');
  try {
    db.prepare('DELETE FROM hardware_inventory').run();
    const stmt = db.prepare(
      `INSERT INTO hardware_inventory (
        device_id, kind, label, group_id, driver_class, sample_rate_hz,
        channel_count, is_default, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const d of devices) {
      stmt.run(
        d.deviceId,
        d.kind,
        d.label,
        d.groupId,
        d.driverClass,
        d.sampleRateHz,
        d.channelCount,
        d.isDefault ? 1 : 0,
        d.lastSeenAt
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function upsertScene(scene: SceneProfile): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO scenes (id, name, service_type, updated_at, version, description, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       service_type = excluded.service_type,
       updated_at = excluded.updated_at,
       version = excluded.version,
       description = excluded.description,
       payload_json = excluded.payload_json`
  ).run(
    scene.id,
    scene.name,
    scene.serviceType,
    scene.updatedAt,
    scene.version,
    scene.description,
    JSON.stringify({
      channelFaders: scene.channelFaders,
      channelMutes: scene.channelMutes,
      channelHpf: scene.channelHpf,
      busFaders: scene.busFaders,
      virtualDiSaturation: scene.virtualDiSaturation,
    })
  );
}

export function upsertFeedbackIncident(inc: FeedbackIncident): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO feedback_incidents (
      id, channel_id, freq_hz, level_db, q_estimate, confidence, status, detected_at, notch_proposed_db
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      level_db = excluded.level_db,
      q_estimate = excluded.q_estimate,
      confidence = excluded.confidence,
      status = excluded.status`
  ).run(
    inc.id,
    inc.channelId,
    inc.freqHz,
    inc.levelDb,
    inc.qEstimate,
    inc.confidence,
    inc.status,
    inc.detectedAt,
    inc.notchProposedDb
  );
}

export function updateFeedbackStatus(id: string, status: FeedbackIncident['status']): void {
  const db = getDb();
  db.prepare('UPDATE feedback_incidents SET status = ? WHERE id = ?').run(status, id);
}

export function updateSoundCheckItem(item: SoundCheckItem): void {
  const db = getDb();
  db.prepare(
    `UPDATE sound_check_items SET status = ?, measured_value = ? WHERE id = ?`
  ).run(item.status, item.measuredValue, item.id);
}

export function insertEvent(ev: StructuredEvent): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO events (id, timestamp, family, severity, service, graph_version, node_id, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ev.id,
    ev.timestamp,
    ev.family,
    ev.severity,
    ev.service,
    ev.graphVersion,
    ev.nodeId ?? null,
    ev.message
  );
  db.prepare(
    `DELETE FROM events WHERE rowid NOT IN (SELECT rowid FROM events ORDER BY rowid DESC LIMIT 200)`
  ).run();
}

export function upsertSnapshot(snapshot: ConsoleSnapshotProfile): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO console_snapshots (id, name, category, notes, created_at, updated_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       notes = excluded.notes,
       updated_at = excluded.updated_at,
       payload_json = excluded.payload_json`
  ).run(
    snapshot.id,
    snapshot.name,
    snapshot.category,
    snapshot.notes,
    snapshot.createdAt,
    snapshot.updatedAt,
    JSON.stringify({
      profileId: snapshot.profileId,
      workspaceTheme: snapshot.workspaceTheme,
      channels: snapshot.channels,
      buses: snapshot.buses,
      speakers: snapshot.speakers,
      virtualCables: snapshot.virtualCables,
      virtualDi: snapshot.virtualDi,
    })
  );
}

export function deleteSnapshotById(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM console_snapshots WHERE id = ?').run(id);
}

export function resetFactoryData(defaults: ConsoleFactoryDefaults): BootstrapPayload {
  const db = getDb();
  db.exec('BEGIN;');
  try {
    db.prepare('DELETE FROM console_state').run();
    db.prepare('DELETE FROM scenes').run();
    db.prepare('DELETE FROM feedback_incidents').run();
    db.prepare('DELETE FROM sound_check_items').run();
    db.prepare('DELETE FROM events').run();
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
  return getBootstrapData(defaults);
}
