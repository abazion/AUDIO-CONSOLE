import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AiProposal,
  AutomationLane,
  BusNode,
  ChannelStrip,
  ConsoleSnapshotProfile,
  ConsoleThemeId,
  DcaGroupState,
  DetectedHardwareDevice,
  FeedbackIncident,
  FxSlotState,
  HardwareProfileId,
  MatrixZone,
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
  dcaGroups: DcaGroupState[];
  fxRack: FxSlotState[];
  matrixZones: MatrixZone[];
  scenes: SceneProfile[];
  soundCheckItems: SoundCheckItem[];
}

export interface PersistedConsoleStatePayload {
  profileId: HardwareProfileId;
  workspaceTheme: ConsoleThemeId;
  activeSceneId: string;
  graphVersion: number;
  revisionId?: number;
  clientId?: string;
  channels: ChannelStrip[];
  buses: BusNode[];
  speakers: SpeakerBand[];
  virtualCables: VirtualCableNode[];
  virtualDi: VirtualDiState;
  dcaGroups?: DcaGroupState[];
  fxRack?: FxSlotState[];
  matrixZones?: MatrixZone[];
  proposals: AiProposal[];
  automationLanes?: AutomationLane[];
  automationDurationSec?: number;
}

export interface BootstrapPayload extends PersistedConsoleStatePayload {
  revisionId: number;
  dcaGroups: DcaGroupState[];
  fxRack: FxSlotState[];
  matrixZones: MatrixZone[];
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
      revision_id INTEGER NOT NULL DEFAULT 1,
      last_client_id TEXT NOT NULL DEFAULT '',
      channels_json TEXT NOT NULL,
      buses_json TEXT NOT NULL,
      speakers_json TEXT NOT NULL,
      virtual_cables_json TEXT NOT NULL DEFAULT '[]',
      virtual_di_json TEXT NOT NULL,
      dca_groups_json TEXT NOT NULL DEFAULT '[]',
      fx_rack_json TEXT NOT NULL DEFAULT '[]',
      matrix_zones_json TEXT NOT NULL DEFAULT '[]',
      proposals_json TEXT NOT NULL,
      automation_lanes_json TEXT NOT NULL DEFAULT '[]',
      automation_duration_sec REAL NOT NULL DEFAULT 60,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_rows (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bus_rows (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
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
  if (!cols.some((c) => c.name === 'automation_lanes_json')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN automation_lanes_json TEXT NOT NULL DEFAULT '[]';`);
  }
  if (!cols.some((c) => c.name === 'automation_duration_sec')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN automation_duration_sec REAL NOT NULL DEFAULT 60;`);
  }
  if (!cols.some((c) => c.name === 'revision_id')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN revision_id INTEGER NOT NULL DEFAULT 1;`);
  }
  if (!cols.some((c) => c.name === 'last_client_id')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN last_client_id TEXT NOT NULL DEFAULT '';`);
  }
  if (!cols.some((c) => c.name === 'dca_groups_json')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN dca_groups_json TEXT NOT NULL DEFAULT '[]';`);
  }
  if (!cols.some((c) => c.name === 'fx_rack_json')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN fx_rack_json TEXT NOT NULL DEFAULT '[]';`);
  }
  if (!cols.some((c) => c.name === 'matrix_zones_json')) {
    db.exec(`ALTER TABLE console_state ADD COLUMN matrix_zones_json TEXT NOT NULL DEFAULT '[]';`);
  }

  dbInstance = db;
  return db;
}

function syncNormalizedChannelRows(db: DatabaseSync, channels: ChannelStrip[], updatedAt: string): void {
  db.prepare('DELETE FROM channel_rows').run();
  const stmt = db.prepare(
    `INSERT INTO channel_rows (id, number, sort_order, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  channels.forEach((ch, idx) => {
    stmt.run(ch.id, ch.number, idx, JSON.stringify(ch), updatedAt);
  });
}

function syncNormalizedBusRows(db: DatabaseSync, buses: BusNode[], updatedAt: string): void {
  db.prepare('DELETE FROM bus_rows').run();
  const stmt = db.prepare(
    `INSERT INTO bus_rows (id, sort_order, payload_json, updated_at)
     VALUES (?, ?, ?, ?)`
  );
  buses.forEach((bus, idx) => {
    stmt.run(bus.id, idx, JSON.stringify(bus), updatedAt);
  });
}

function seedIfEmpty(db: DatabaseSync, defaults: ConsoleFactoryDefaults): void {
  const existingState = db.prepare('SELECT id, channels_json, buses_json FROM console_state WHERE id = 1').get() as
    | { id: number; channels_json: string; buses_json: string }
    | undefined;

  const nowIso = new Date().toISOString();

  if (!existingState) {
    db.prepare(
      `INSERT INTO console_state (
        id, profile_id, theme_id, active_scene_id, graph_version, revision_id, last_client_id,
        channels_json, buses_json, speakers_json, virtual_cables_json, virtual_di_json,
        dca_groups_json, fx_rack_json, matrix_zones_json, proposals_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      1,
      defaults.profileId,
      'obsidian-brass',
      defaults.activeSceneId,
      1,
      1,
      'bootstrap',
      JSON.stringify(defaults.channels),
      JSON.stringify(defaults.buses),
      JSON.stringify(defaults.speakers),
      JSON.stringify(defaults.virtualCables),
      JSON.stringify(defaults.virtualDi),
      JSON.stringify(defaults.dcaGroups),
      JSON.stringify(defaults.fxRack),
      JSON.stringify(defaults.matrixZones),
      JSON.stringify([]),
      nowIso
    );
    syncNormalizedChannelRows(db, defaults.channels, nowIso);
    syncNormalizedBusRows(db, defaults.buses, nowIso);
  } else {
    const chCount = (db.prepare('SELECT COUNT(*) as cnt FROM channel_rows').get() as { cnt: number }).cnt;
    if (chCount === 0) {
      syncNormalizedChannelRows(db, JSON.parse(existingState.channels_json) as ChannelStrip[], nowIso);
    }
    const busCount = (db.prepare('SELECT COUNT(*) as cnt FROM bus_rows').get() as { cnt: number }).cnt;
    if (busCount === 0) {
      syncNormalizedBusRows(db, JSON.parse(existingState.buses_json) as BusNode[], nowIso);
    }
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
      `SELECT profile_id, theme_id, active_scene_id, graph_version, revision_id, channels_json, buses_json,
              speakers_json, virtual_cables_json, virtual_di_json, dca_groups_json, fx_rack_json,
              matrix_zones_json, proposals_json, automation_lanes_json, automation_duration_sec, updated_at
       FROM console_state WHERE id = 1`
    )
    .get() as {
    profile_id: string;
    theme_id: string;
    active_scene_id: string;
    graph_version: number;
    revision_id: number;
    channels_json: string;
    buses_json: string;
    speakers_json: string;
    virtual_cables_json: string;
    virtual_di_json: string;
    dca_groups_json: string;
    fx_rack_json: string;
    matrix_zones_json: string;
    proposals_json: string;
    automation_lanes_json: string;
    automation_duration_sec: number;
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

  const channelRows = db
    .prepare('SELECT payload_json FROM channel_rows ORDER BY sort_order ASC')
    .all() as { payload_json: string }[];
  const rawChannels =
    channelRows.length > 0
      ? channelRows.map((r) => JSON.parse(r.payload_json) as ChannelStrip)
      : (JSON.parse(row.channels_json) as ChannelStrip[]);

  // Strip ephemeral live stream/file "active" state on fresh reload because WebAudio MediaStreams don't survive page reloads
  const channels = rawChannels.map((ch) => ({
    ...ch,
    sourceBinding: ch.sourceBinding
      ? { ...ch.sourceBinding, active: false }
      : { kind: 'none' as const, label: 'Unpatched · Click Source', active: false },
  }));

  const busRows = db
    .prepare('SELECT payload_json FROM bus_rows ORDER BY sort_order ASC')
    .all() as { payload_json: string }[];
  const buses =
    busRows.length > 0
      ? busRows.map((r) => JSON.parse(r.payload_json) as BusNode)
      : (JSON.parse(row.buses_json) as BusNode[]);

  const parsedCables = JSON.parse(row.virtual_cables_json || '[]') as VirtualCableNode[];
  const virtualCables =
    Array.isArray(parsedCables) && parsedCables.length > 0
      ? parsedCables
      : defaults.virtualCables;

  const parsedDca = JSON.parse(row.dca_groups_json || '[]') as DcaGroupState[];
  const dcaGroups =
    Array.isArray(parsedDca) && parsedDca.length > 0 ? parsedDca : defaults.dcaGroups;

  const parsedFx = JSON.parse(row.fx_rack_json || '[]') as FxSlotState[];
  const fxRack =
    Array.isArray(parsedFx) && parsedFx.length > 0 ? parsedFx : defaults.fxRack;

  const parsedMatrix = JSON.parse(row.matrix_zones_json || '[]') as MatrixZone[];
  const matrixZones =
    Array.isArray(parsedMatrix) && parsedMatrix.length > 0 ? parsedMatrix : defaults.matrixZones;

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
    revisionId: row.revision_id ?? 1,
    channels,
    buses,
    speakers: JSON.parse(row.speakers_json) as SpeakerBand[],
    virtualCables,
    virtualDi: JSON.parse(row.virtual_di_json) as VirtualDiState,
    dcaGroups,
    fxRack,
    matrixZones,
    proposals: JSON.parse(row.proposals_json) as AiProposal[],
    automationLanes: JSON.parse(row.automation_lanes_json || '[]') as AutomationLane[],
    automationDurationSec:
      typeof row.automation_duration_sec === 'number' && row.automation_duration_sec >= 15
        ? row.automation_duration_sec
        : 60,
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

export function saveConsoleState(payload: PersistedConsoleStatePayload): {
  ok: boolean;
  conflict?: boolean;
  revisionId: number;
  updatedAt: string;
} {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const current = db
      .prepare('SELECT revision_id, last_client_id, updated_at FROM console_state WHERE id = 1')
      .get() as { revision_id: number; last_client_id: string; updated_at: string } | undefined;
    const currentRev = current?.revision_id ?? 1;
    if (
      typeof payload.revisionId === 'number' &&
      payload.revisionId < currentRev &&
      payload.clientId &&
      current?.last_client_id &&
      payload.clientId !== current.last_client_id
    ) {
      db.exec('ROLLBACK;');
      return { ok: false, conflict: true, revisionId: currentRev, updatedAt: current.updated_at };
    }
    const nextRev = currentRev + 1;
    db.prepare(
      `UPDATE console_state
       SET profile_id = ?, theme_id = ?, active_scene_id = ?, graph_version = ?,
           revision_id = ?, last_client_id = ?,
           channels_json = ?, buses_json = ?, speakers_json = ?,
           virtual_cables_json = ?, virtual_di_json = ?,
           dca_groups_json = COALESCE(?, dca_groups_json),
           fx_rack_json = COALESCE(?, fx_rack_json),
           matrix_zones_json = COALESCE(?, matrix_zones_json),
           proposals_json = ?, automation_lanes_json = ?, automation_duration_sec = ?, updated_at = ?
       WHERE id = 1`
    ).run(
      payload.profileId,
      payload.workspaceTheme,
      payload.activeSceneId,
      payload.graphVersion,
      nextRev,
      payload.clientId ?? '',
      JSON.stringify(payload.channels),
      JSON.stringify(payload.buses),
      JSON.stringify(payload.speakers),
      JSON.stringify(payload.virtualCables ?? []),
      JSON.stringify(payload.virtualDi),
      payload.dcaGroups ? JSON.stringify(payload.dcaGroups) : null,
      payload.fxRack ? JSON.stringify(payload.fxRack) : null,
      payload.matrixZones ? JSON.stringify(payload.matrixZones) : null,
      JSON.stringify(payload.proposals),
      JSON.stringify(payload.automationLanes ?? []),
      typeof payload.automationDurationSec === 'number' ? payload.automationDurationSec : 60,
      updatedAt
    );
    syncNormalizedChannelRows(db, payload.channels, updatedAt);
    syncNormalizedBusRows(db, payload.buses, updatedAt);
    db.exec('COMMIT;');
    return { ok: true, revisionId: nextRev, updatedAt };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function patchChannelAtomic(
  channelId: string,
  patch: Partial<ChannelStrip>,
  opts?: { expectedRevisionId?: number; clientId?: string }
): {
  ok: boolean;
  conflict?: boolean;
  notFound?: boolean;
  revisionId: number;
  graphVersion?: number;
  channel?: ChannelStrip;
  updatedAt: string;
} {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const stateRow = db
      .prepare('SELECT revision_id, graph_version, last_client_id, channels_json, updated_at FROM console_state WHERE id = 1')
      .get() as
      | { revision_id: number; graph_version: number; last_client_id: string; channels_json: string; updated_at: string }
      | undefined;
    if (!stateRow) {
      db.exec('ROLLBACK;');
      return { ok: false, notFound: true, revisionId: 0, updatedAt };
    }
    if (
      typeof opts?.expectedRevisionId === 'number' &&
      opts.expectedRevisionId < stateRow.revision_id &&
      opts.clientId &&
      stateRow.last_client_id &&
      opts.clientId !== stateRow.last_client_id
    ) {
      db.exec('ROLLBACK;');
      return { ok: false, conflict: true, revisionId: stateRow.revision_id, updatedAt: stateRow.updated_at };
    }

    const row = db
      .prepare('SELECT payload_json FROM channel_rows WHERE id = ?')
      .get(channelId) as { payload_json: string } | undefined;

    const channels = JSON.parse(stateRow.channels_json) as ChannelStrip[];
    const idx = channels.findIndex((c) => c.id === channelId);
    if (!row && idx === -1) {
      db.exec('ROLLBACK;');
      return { ok: false, notFound: true, revisionId: stateRow.revision_id, updatedAt: stateRow.updated_at };
    }

    const base: ChannelStrip = row ? (JSON.parse(row.payload_json) as ChannelStrip) : channels[idx];
    const merged: ChannelStrip = {
      ...base,
      ...patch,
      id: base.id,
      dynamics: patch.dynamics ? { ...base.dynamics, ...patch.dynamics } : base.dynamics,
      sends: patch.sends ? { ...base.sends, ...patch.sends } : base.sends,
    };

    if (idx !== -1) {
      channels[idx] = merged;
    }

    const nextRev = stateRow.revision_id + 1;
    const nextGraphVersion = stateRow.graph_version + 1;

    db.prepare(
      `INSERT INTO channel_rows (id, number, sort_order, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`
    ).run(merged.id, merged.number, idx >= 0 ? idx : channels.length, JSON.stringify(merged), updatedAt);

    db.prepare(
      `UPDATE console_state
       SET revision_id = ?, graph_version = ?, last_client_id = ?, channels_json = ?, updated_at = ?
       WHERE id = 1`
    ).run(nextRev, nextGraphVersion, opts?.clientId ?? '', JSON.stringify(channels), updatedAt);

    db.exec('COMMIT;');
    return {
      ok: true,
      revisionId: nextRev,
      graphVersion: nextGraphVersion,
      channel: merged,
      updatedAt,
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function patchBusAtomic(
  busId: string,
  patch: Partial<BusNode>,
  opts?: { expectedRevisionId?: number; clientId?: string }
): {
  ok: boolean;
  conflict?: boolean;
  notFound?: boolean;
  revisionId: number;
  graphVersion?: number;
  bus?: BusNode;
  updatedAt: string;
} {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const stateRow = db
      .prepare('SELECT revision_id, graph_version, last_client_id, buses_json, updated_at FROM console_state WHERE id = 1')
      .get() as
      | { revision_id: number; graph_version: number; last_client_id: string; buses_json: string; updated_at: string }
      | undefined;
    if (!stateRow) {
      db.exec('ROLLBACK;');
      return { ok: false, notFound: true, revisionId: 0, updatedAt };
    }
    if (
      typeof opts?.expectedRevisionId === 'number' &&
      opts.expectedRevisionId < stateRow.revision_id &&
      opts.clientId &&
      stateRow.last_client_id &&
      opts.clientId !== stateRow.last_client_id
    ) {
      db.exec('ROLLBACK;');
      return { ok: false, conflict: true, revisionId: stateRow.revision_id, updatedAt: stateRow.updated_at };
    }

    const row = db
      .prepare('SELECT payload_json FROM bus_rows WHERE id = ?')
      .get(busId) as { payload_json: string } | undefined;

    const buses = JSON.parse(stateRow.buses_json) as BusNode[];
    const idx = buses.findIndex((b) => b.id === busId);
    if (!row && idx === -1) {
      db.exec('ROLLBACK;');
      return { ok: false, notFound: true, revisionId: stateRow.revision_id, updatedAt: stateRow.updated_at };
    }

    const base: BusNode = row ? (JSON.parse(row.payload_json) as BusNode) : buses[idx];
    const merged: BusNode = { ...base, ...patch, id: base.id };
    if (idx !== -1) {
      buses[idx] = merged;
    }

    const nextRev = stateRow.revision_id + 1;
    const nextGraphVersion = stateRow.graph_version + 1;

    db.prepare(
      `INSERT INTO bus_rows (id, sort_order, payload_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`
    ).run(merged.id, idx >= 0 ? idx : buses.length, JSON.stringify(merged), updatedAt);

    db.prepare(
      `UPDATE console_state
       SET revision_id = ?, graph_version = ?, last_client_id = ?, buses_json = ?, updated_at = ?
       WHERE id = 1`
    ).run(nextRev, nextGraphVersion, opts?.clientId ?? '', JSON.stringify(buses), updatedAt);

    db.exec('COMMIT;');
    return {
      ok: true,
      revisionId: nextRev,
      graphVersion: nextGraphVersion,
      bus: merged,
      updatedAt,
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function patchDcaGroupAtomic(
  dcaId: DcaGroupState['id'],
  patch: Partial<DcaGroupState>,
  defaults: DcaGroupState[],
  clientId?: string
): {
  ok: boolean;
  revisionId: number;
  dcaGroups: DcaGroupState[];
  updatedAt: string;
} {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const stateRow = db
      .prepare('SELECT revision_id, dca_groups_json FROM console_state WHERE id = 1')
      .get() as { revision_id: number; dca_groups_json: string } | undefined;
    const parsed = JSON.parse(stateRow?.dca_groups_json || '[]') as DcaGroupState[];
    const list = Array.isArray(parsed) && parsed.length > 0 ? parsed : defaults.map((d) => ({ ...d }));
    const updatedList = list.map((d) => (d.id === dcaId ? { ...d, ...patch, id: d.id } : d));
    const nextRev = (stateRow?.revision_id ?? 1) + 1;
    db.prepare(
      `UPDATE console_state SET revision_id = ?, last_client_id = ?, dca_groups_json = ?, updated_at = ? WHERE id = 1`
    ).run(nextRev, clientId ?? '', JSON.stringify(updatedList), updatedAt);
    db.exec('COMMIT;');
    return { ok: true, revisionId: nextRev, dcaGroups: updatedList, updatedAt };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
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
    db.prepare('DELETE FROM channel_rows').run();
    db.prepare('DELETE FROM bus_rows').run();
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
