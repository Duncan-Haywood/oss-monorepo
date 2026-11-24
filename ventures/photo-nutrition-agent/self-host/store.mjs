// Persistent store. SQLite through Node's built-in `node:sqlite` (Node >= 22.5),
// so the server has no npm dependencies at all.
//
// The backend database is the canonical source of truth for meal records
// (docs/adr/0001-architecture.md, "Source of truth"). Apple Health holds a
// projection of it: one sample per nutrient per meal, keyed by a HealthKit sync
// identifier derived from the meal id, and versioned by the meal's version.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS photos (
  id              TEXT PRIMARY KEY,
  asset_id        TEXT NOT NULL UNIQUE,      -- PHAsset.localIdentifier (or cloudIdentifier)
  sha256          TEXT,                       -- of the uploaded image bytes
  dhash           TEXT,                       -- 64-bit difference hash (hex), computed on device
  captured_at     TEXT NOT NULL,              -- UTC ISO-8601 instant
  tz_offset_min   INTEGER NOT NULL DEFAULT 0, -- offset at capture, minutes east of UTC
  time_zone       TEXT,                       -- IANA zone at capture, if the device knew it
  local_date      TEXT NOT NULL,              -- YYYY-MM-DD in the capture zone
  is_screenshot   INTEGER NOT NULL DEFAULT 0,
  has_camera_exif INTEGER NOT NULL DEFAULT 1,
  food_score      REAL,                       -- on-device classifier score
  state           TEXT NOT NULL,              -- see PHOTO_STATES
  kind            TEXT,                       -- analyzer verdict: meal, beverage, nutrition_label, ...
  meal_id         TEXT,
  duplicate_of    TEXT,
  analysis_json   TEXT,
  reason          TEXT,
  error           TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  image           BLOB,
  image_mime      TEXT,
  image_expires_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS photos_sha ON photos(sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS photos_time ON photos(captured_at);
CREATE INDEX IF NOT EXISTS photos_state ON photos(state);

CREATE TABLE IF NOT EXISTS meals (
  id             TEXT PRIMARY KEY,
  version        INTEGER NOT NULL,
  seq            INTEGER NOT NULL,           -- global change sequence, for the device's HealthKit feed
  status         TEXT NOT NULL,              -- logged | provisional | deleted
  name           TEXT NOT NULL,
  eaten_at       TEXT NOT NULL,              -- UTC ISO-8601
  tz_offset_min  INTEGER NOT NULL DEFAULT 0,
  time_zone      TEXT,
  local_date     TEXT NOT NULL,
  items_json     TEXT NOT NULL,
  confidence     REAL,
  origin         TEXT NOT NULL,              -- photo | chat | label
  deleted_reason TEXT,
  hk_version     INTEGER NOT NULL DEFAULT 0, -- version last confirmed written to (or removed from) HealthKit
  hk_samples_json TEXT,
  hk_error       TEXT,
  hk_synced_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meals_date ON meals(local_date);
CREATE INDEX IF NOT EXISTS meals_seq ON meals(seq);

CREATE TABLE IF NOT EXISTS meal_versions (
  meal_id     TEXT NOT NULL,
  version     INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_json TEXT,
  actor       TEXT NOT NULL,                 -- pipeline | chat | device | user
  reason      TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (meal_id, version)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  date   TEXT NOT NULL,                      -- local YYYY-MM-DD
  type   TEXT NOT NULL,                      -- body_mass_kg, body_fat_pct, lean_mass_kg, active_kcal, ...
  value  REAL NOT NULL,
  source TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, type)
);

CREATE TABLE IF NOT EXISTS dexa_scans (
  id         TEXT PRIMARY KEY,
  scan_date  TEXT NOT NULL UNIQUE,
  data_json  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  at    TEXT NOT NULL,
  type  TEXT NOT NULL,
  ref   TEXT,
  data_json TEXT
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id  TEXT PRIMARY KEY,
  data_json  TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash  TEXT PRIMARY KEY,
  data_json  TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,                  -- access | refresh
  data_json  TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

export const PHOTO_STATES = [
  "queued", // stored, waiting for the analyzer (no key configured, or between retries)
  "analyzing",
  "logged", // produced or extended a meal
  "attached", // another photo of an existing meal, no nutrient change
  "label_pending", // a nutrition label with no meal yet in its window
  "duplicate", // same image or near-identical burst shot
  "ignored", // not consumption: menu, groceries, recipe, someone else's plate, screenshot...
  "failed", // gave up after max attempts; retry with reanalysis
];

export function openStore(path = ":memory:", { now = () => new Date() } = {}) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  const store = new Store(db, now);
  return store;
}

export class Store {
  constructor(db, now) {
    this.db = db;
    this.now = now;
  }

  nowIso() {
    return this.now().toISOString();
  }

  close() {
    this.db.close();
  }

  tx(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  // ---------- settings ----------
  getSetting(key, fallback = null) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? JSON.parse(row.value) : fallback;
  }

  setSetting(key, value) {
    this.db
      .prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  }

  nextSeq() {
    const n = (this.getSetting("seq", 0) || 0) + 1;
    this.setSetting("seq", n);
    return n;
  }

  // ---------- events (audit / processing log) ----------
  logEvent(type, ref = null, data = null) {
    this.db
      .prepare("INSERT INTO events(at, type, ref, data_json) VALUES (?, ?, ?, ?)")
      .run(this.nowIso(), type, ref, data == null ? null : JSON.stringify(data));
  }

  recentEvents(limit = 50) {
    return this.db
      .prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?")
      .all(limit)
      .map((r) => ({ ...r, data: r.data_json ? JSON.parse(r.data_json) : null, data_json: undefined }));
  }

  // ---------- photos ----------
  photoByAsset(assetId) {
    return rowToPhoto(this.db.prepare("SELECT * FROM photos WHERE asset_id = ?").get(assetId));
  }

  photoBySha(sha) {
    if (!sha) return null;
    return rowToPhoto(this.db.prepare("SELECT * FROM photos WHERE sha256 = ?").get(sha));
  }

  photo(id) {
    return rowToPhoto(this.db.prepare("SELECT * FROM photos WHERE id = ?").get(id));
  }

  photosBetween(fromIso, toIso) {
    return this.db
      .prepare("SELECT * FROM photos WHERE captured_at >= ? AND captured_at <= ? ORDER BY captured_at")
      .all(fromIso, toIso)
      .map(rowToPhoto);
  }

  photosForMeal(mealId) {
    return this.db.prepare("SELECT * FROM photos WHERE meal_id = ? ORDER BY captured_at").all(mealId).map(rowToPhoto);
  }

  photosInState(state, limit = 100) {
    return this.db
      .prepare("SELECT * FROM photos WHERE state = ? ORDER BY captured_at LIMIT ?")
      .all(state, limit)
      .map(rowToPhoto);
  }

  insertPhoto(p) {
    const t = this.nowIso();
    const id = p.id || `ph_${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO photos(id, asset_id, sha256, dhash, captured_at, tz_offset_min, time_zone, local_date,
          is_screenshot, has_camera_exif, food_score, state, kind, meal_id, duplicate_of, reason,
          image, image_mime, image_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        p.asset_id,
        p.sha256 ?? null,
        p.dhash ?? null,
        p.captured_at,
        p.tz_offset_min ?? 0,
        p.time_zone ?? null,
        p.local_date,
        p.is_screenshot ? 1 : 0,
        p.has_camera_exif === false ? 0 : 1,
        p.food_score ?? null,
        p.state,
        p.kind ?? null,
        p.meal_id ?? null,
        p.duplicate_of ?? null,
        p.reason ?? null,
        p.image ?? null,
        p.image_mime ?? null,
        p.image_expires_at ?? null,
        t,
        t
      );
    return this.photo(id);
  }

  updatePhoto(id, fields) {
    const allowed = [
      "state",
      "kind",
      "meal_id",
      "duplicate_of",
      "analysis_json",
      "reason",
      "error",
      "attempts",
      "next_attempt_at",
      "image",
      "image_mime",
      "image_expires_at",
    ];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return this.photo(id);
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    const vals = keys.map((k) => {
      const v = fields[k];
      if (k === "analysis_json" && v != null && typeof v !== "string") return JSON.stringify(v);
      return v === undefined ? null : v;
    });
    this.db.prepare(`UPDATE photos SET ${sets}, updated_at = ? WHERE id = ?`).run(...vals, this.nowIso(), id);
    return this.photo(id);
  }

  purgeExpiredImages() {
    const r = this.db
      .prepare(
        "UPDATE photos SET image = NULL, image_mime = NULL, image_expires_at = NULL WHERE image IS NOT NULL AND image_expires_at IS NOT NULL AND image_expires_at <= ?"
      )
      .run(this.nowIso());
    return Number(r.changes);
  }

  photoCounts() {
    const rows = this.db.prepare("SELECT state, COUNT(*) AS n FROM photos GROUP BY state").all();
    return Object.fromEntries(rows.map((r) => [r.state, Number(r.n)]));
  }

  // ---------- meals ----------
  meal(id) {
    return rowToMeal(this.db.prepare("SELECT * FROM meals WHERE id = ?").get(id));
  }

  mealsByDate(from, to, { includeDeleted = false } = {}) {
    const sql = includeDeleted
      ? "SELECT * FROM meals WHERE local_date >= ? AND local_date <= ? ORDER BY eaten_at"
      : "SELECT * FROM meals WHERE local_date >= ? AND local_date <= ? AND status != 'deleted' ORDER BY eaten_at";
    return this.db.prepare(sql).all(from, to).map(rowToMeal);
  }

  mealsBetweenInstants(fromIso, toIso) {
    return this.db
      .prepare("SELECT * FROM meals WHERE eaten_at >= ? AND eaten_at <= ? AND status != 'deleted' ORDER BY eaten_at")
      .all(fromIso, toIso)
      .map(rowToMeal);
  }

  mealsWithStatus(status) {
    return this.db.prepare("SELECT * FROM meals WHERE status = ? ORDER BY eaten_at").all(status).map(rowToMeal);
  }

  mealsChangedSince(seq, limit = 200) {
    return this.db
      .prepare("SELECT * FROM meals WHERE seq > ? ORDER BY seq LIMIT ?")
      .all(seq, limit)
      .map(rowToMeal);
  }

  /** Insert or replace a meal row and append its version snapshot. Caller supplies the full meal. */
  writeMeal(meal, { actor, reason = null, change = null }) {
    const t = this.nowIso();
    const seq = this.nextSeq();
    const existing = this.meal(meal.id);
    const created = existing ? existing.created_at : t;
    this.db
      .prepare(
        `INSERT INTO meals(id, version, seq, status, name, eaten_at, tz_offset_min, time_zone, local_date, items_json,
          confidence, origin, deleted_reason, hk_version, hk_samples_json, hk_error, hk_synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET version = excluded.version, seq = excluded.seq, status = excluded.status,
          name = excluded.name, eaten_at = excluded.eaten_at, tz_offset_min = excluded.tz_offset_min,
          time_zone = excluded.time_zone, local_date = excluded.local_date, items_json = excluded.items_json,
          confidence = excluded.confidence, deleted_reason = excluded.deleted_reason, updated_at = excluded.updated_at`
      )
      .run(
        meal.id,
        meal.version,
        seq,
        meal.status,
        meal.name,
        meal.eaten_at,
        meal.tz_offset_min ?? 0,
        meal.time_zone ?? null,
        meal.local_date,
        JSON.stringify(meal.items),
        meal.confidence ?? null,
        meal.origin,
        meal.deleted_reason ?? null,
        existing ? existing.hk_version : 0,
        existing ? JSON.stringify(existing.hk_samples) : null,
        existing ? existing.hk_error : null,
        existing ? existing.hk_synced_at : null,
        created,
        t
      );
    const snapshot = { ...meal };
    delete snapshot.hk_version;
    delete snapshot.hk_samples;
    this.db
      .prepare(
        "INSERT INTO meal_versions(meal_id, version, snapshot_json, change_json, actor, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(meal.id, meal.version, JSON.stringify(snapshot), change ? JSON.stringify(change) : null, actor, reason, t);
    return this.meal(meal.id);
  }

  mealVersions(id) {
    return this.db
      .prepare("SELECT * FROM meal_versions WHERE meal_id = ? ORDER BY version")
      .all(id)
      .map((r) => ({
        version: Number(r.version),
        actor: r.actor,
        reason: r.reason,
        created_at: r.created_at,
        change: r.change_json ? JSON.parse(r.change_json) : null,
        snapshot: JSON.parse(r.snapshot_json),
      }));
  }

  markHealthKit(id, { version, samples = null, error = null }) {
    const meal = this.meal(id);
    if (!meal) return null;
    if (error) {
      this.db.prepare("UPDATE meals SET hk_error = ? WHERE id = ?").run(String(error).slice(0, 500), id);
    } else if (version >= meal.hk_version) {
      // Only move forward: a late ack for an older version must not mark a newer one as written.
      this.db
        .prepare("UPDATE meals SET hk_version = ?, hk_samples_json = ?, hk_error = NULL, hk_synced_at = ? WHERE id = ?")
        .run(version, samples ? JSON.stringify(samples) : null, this.nowIso(), id);
    }
    return this.meal(id);
  }

  // ---------- metrics ----------
  upsertMetric(date, type, value, source = null) {
    this.db
      .prepare(
        `INSERT INTO metrics(date, type, value, source, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date, type) DO UPDATE SET value = excluded.value, source = excluded.source, updated_at = excluded.updated_at`
      )
      .run(date, type, value, source, this.nowIso());
  }

  metrics(type, from, to) {
    return this.db
      .prepare("SELECT date, value, source FROM metrics WHERE type = ? AND date >= ? AND date <= ? ORDER BY date")
      .all(type, from, to)
      .map((r) => ({ date: r.date, value: Number(r.value), source: r.source }));
  }

  // ---------- DEXA ----------
  upsertDexa(scanDate, data) {
    const existing = this.db.prepare("SELECT id FROM dexa_scans WHERE scan_date = ?").get(scanDate);
    const id = existing ? existing.id : `dx_${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO dexa_scans(id, scan_date, data_json, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(scan_date) DO UPDATE SET data_json = excluded.data_json`
      )
      .run(id, scanDate, JSON.stringify(data), this.nowIso());
    return { id, scan_date: scanDate, ...data };
  }

  dexaScans() {
    return this.db
      .prepare("SELECT * FROM dexa_scans ORDER BY scan_date")
      .all()
      .map((r) => ({ id: r.id, scan_date: r.scan_date, ...JSON.parse(r.data_json) }));
  }

  deleteDexa(id) {
    return Number(this.db.prepare("DELETE FROM dexa_scans WHERE id = ?").run(id).changes);
  }

  // ---------- export / restore / erase ----------
  exportAll({ includeImages = false } = {}) {
    const photos = this.db.prepare("SELECT * FROM photos ORDER BY captured_at").all().map(rowToPhoto);
    if (!includeImages) for (const p of photos) delete p.image;
    else for (const p of photos) if (p.image) p.image = Buffer.from(p.image).toString("base64");
    const allVersions = this.db.prepare("SELECT meal_id FROM meal_versions GROUP BY meal_id").all();
    return {
      format: "photo-nutrition-agent/export@1",
      exported_at: this.nowIso(),
      settings: Object.fromEntries(
        this.db
          .prepare("SELECT key, value FROM settings")
          .all()
          .map((r) => [r.key, JSON.parse(r.value)])
      ),
      meals: this.db.prepare("SELECT * FROM meals ORDER BY eaten_at").all().map(rowToMeal),
      meal_versions: Object.fromEntries(allVersions.map((r) => [r.meal_id, this.mealVersions(r.meal_id)])),
      photos,
      metrics: this.db.prepare("SELECT * FROM metrics ORDER BY date, type").all(),
      dexa_scans: this.dexaScans(),
    };
  }

  restore(dump) {
    if (dump?.format !== "photo-nutrition-agent/export@1") throw new Error("not a photo-nutrition-agent export");
    this.tx(() => {
      for (const t of ["photos", "meals", "meal_versions", "settings", "metrics", "dexa_scans"])
        this.db.exec(`DELETE FROM ${t}`);
      for (const [k, v] of Object.entries(dump.settings || {})) this.setSetting(k, v);
      for (const m of dump.meals || []) {
        this.db
          .prepare(
            `INSERT INTO meals(id, version, seq, status, name, eaten_at, tz_offset_min, time_zone, local_date, items_json,
              confidence, origin, deleted_reason, hk_version, hk_samples_json, hk_error, hk_synced_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            m.id, m.version, m.seq, m.status, m.name, m.eaten_at, m.tz_offset_min, m.time_zone ?? null, m.local_date,
            JSON.stringify(m.items), m.confidence ?? null, m.origin, m.deleted_reason ?? null, m.hk_version ?? 0,
            m.hk_samples ? JSON.stringify(m.hk_samples) : null, m.hk_error ?? null, m.hk_synced_at ?? null,
            m.created_at, m.updated_at
          );
      }
      for (const [mealId, versions] of Object.entries(dump.meal_versions || {}))
        for (const v of versions)
          this.db
            .prepare(
              "INSERT INTO meal_versions(meal_id, version, snapshot_json, change_json, actor, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
            .run(mealId, v.version, JSON.stringify(v.snapshot), v.change ? JSON.stringify(v.change) : null, v.actor, v.reason, v.created_at);
      for (const p of dump.photos || []) {
        this.insertPhoto({ ...p, image: p.image ? Buffer.from(p.image, "base64") : null });
        if (p.analysis_json || p.attempts) this.updatePhoto(p.id, { analysis_json: p.analysis_json ?? null, attempts: p.attempts ?? 0 });
      }
      for (const r of dump.metrics || []) this.upsertMetric(r.date, r.type, r.value, r.source);
      for (const d of dump.dexa_scans || []) {
        const { id, scan_date, ...data } = d;
        this.upsertDexa(scan_date, data);
      }
    });
  }

  eraseAll() {
    this.tx(() => {
      for (const t of ["photos", "meals", "meal_versions", "metrics", "dexa_scans", "events", "oauth_codes", "oauth_tokens"])
        this.db.exec(`DELETE FROM ${t}`);
    });
  }
}

function rowToPhoto(r) {
  if (!r) return null;
  return {
    ...r,
    is_screenshot: !!r.is_screenshot,
    has_camera_exif: !!r.has_camera_exif,
    attempts: Number(r.attempts),
    tz_offset_min: Number(r.tz_offset_min),
    analysis: r.analysis_json ? JSON.parse(r.analysis_json) : null,
  };
}

function rowToMeal(r) {
  if (!r) return null;
  return {
    id: r.id,
    version: Number(r.version),
    seq: Number(r.seq),
    status: r.status,
    name: r.name,
    eaten_at: r.eaten_at,
    tz_offset_min: Number(r.tz_offset_min),
    time_zone: r.time_zone,
    local_date: r.local_date,
    items: JSON.parse(r.items_json),
    confidence: r.confidence == null ? null : Number(r.confidence),
    origin: r.origin,
    deleted_reason: r.deleted_reason,
    hk_version: Number(r.hk_version),
    hk_samples: r.hk_samples_json ? JSON.parse(r.hk_samples_json) : null,
    hk_error: r.hk_error,
    hk_synced_at: r.hk_synced_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
