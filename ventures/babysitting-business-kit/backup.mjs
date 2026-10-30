// Babysitting Business Kit: keeping the server's one JSON file safe. Zero dependencies.
//
//   - atomic writes (write a temp file, fsync, rename), so a crash never leaves half a file;
//   - a startup check: a state file that does not parse is moved aside to
//     desk.json.corrupt-<time> and logged, never overwritten, and the newest good
//     daily snapshot is loaded in its place;
//   - daily snapshots in BACKUP_DIR (default: a "backups" folder beside STATE), the
//     newest 14 kept;
//   - admin API: GET /api/backup (download), GET /api/backups (list),
//     POST /api/restore (a desk JSON, or {"snapshot": "desk-YYYY-MM-DD.json"}),
//     GET /api/status (what the /admin page shows);
//   - optional off-site copy to the sitter's own S3-compatible bucket (AWS S3,
//     Cloudflare R2, Backblaze B2, MinIO...), signed with AWS Signature Version 4
//     in plain node:crypto. Off until BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID and
//     BACKUP_S3_SECRET_ACCESS_KEY are all set.

import { openSync, writeSync, fsyncSync, closeSync, renameSync, existsSync, readFileSync, readdirSync, statSync, unlinkSync, mkdirSync, statfsSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { join, dirname } from "node:path";
import { normalizeDesk, emptyDesk } from "./engine.mjs";

export const KEEP = 14;
export const APP_VERSION = "0.2.0";
const DAILY = /^desk-(\d{4}-\d{2}-\d{2})\.json$/;
const ANY_SNAPSHOT = /^desk-\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]{1,40})?\.json$/;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

export function atomicWrite(path, text) {
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, "w");
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
}

// A desk must be a JSON object. Anything else is treated as damage, not as "empty".
export function parseDesk(text) {
  const d = JSON.parse(text);
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("not a desk object");
  return normalizeDesk(d);
}

export const backupDir = (env = {}) => env.BACKUP_DIR || join(dirname(env.STATE || "desk.json"), "backups");

export function listSnapshots(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => ANY_SNAPSHOT.test(n)).map((name) => {
    const st = statSync(join(dir, name));
    return { name, size: st.size, modified: st.mtime.toISOString() };
  }).sort((a, b) => (a.name < b.name ? 1 : -1));
}

// Write today's snapshot (overwriting today's if it exists) and prune daily snapshots
// beyond `keep`. Tagged snapshots (e.g. "pre-restore") are kept to the newest five.
export function snapshot(desk, dir, today, { keep = KEEP, tag = "" } = {}) {
  mkdirSync(dir, { recursive: true });
  const name = tag ? `desk-${today}-${tag}.json` : `desk-${today}.json`;
  atomicWrite(join(dir, name), JSON.stringify(desk));
  const all = listSnapshots(dir);
  const daily = all.filter((s) => DAILY.test(s.name));
  const tagged = all.filter((s) => !DAILY.test(s.name));
  const removed = [...daily.slice(keep), ...tagged.slice(5)].map((s) => s.name);
  for (const n of removed) unlinkSync(join(dir, n));
  return { name, removed };
}

// Load the state file at startup. A missing file is a new desk. A damaged one is moved
// aside (never overwritten) and the newest snapshot that parses is used instead.
export function loadDesk(path, { dir = join(dirname(path), "backups"), log = console.error, now = Date.now } = {}) {
  if (!existsSync(path)) return { desk: emptyDesk(), recovered: null };
  try {
    return { desk: parseDesk(readFileSync(path, "utf8")), recovered: null };
  } catch (e) {
    const movedTo = `${path}.corrupt-${new Date(now()).toISOString().replace(/[:.]/g, "-")}`;
    renameSync(path, movedTo);
    log(`state file ${path} could not be read (${e.message}); moved it to ${movedTo} and did not overwrite it`);
    for (const s of listSnapshots(dir)) {
      try {
        const desk = parseDesk(readFileSync(join(dir, s.name), "utf8"));
        log(`loaded the newest good snapshot instead: ${s.name}`);
        return { desk, recovered: { movedTo, from: s.name } };
      } catch { /* try the next one */ }
    }
    log("no good snapshot found; starting an empty desk (the damaged file is kept)");
    return { desk: emptyDesk(), recovered: { movedTo, from: null } };
  }
}

// ---------- AWS Signature Version 4 ----------

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

// Signs one request. `amzDate` is YYYYMMDDTHHMMSSZ. For S3 (`service: "s3"`) the path
// is encoded once and the payload hash is sent as x-amz-content-sha256; for other
// services the path is encoded twice, as the AWS test suite expects.
// Returns the headers to send (host is signed but left for fetch to set).
export function sigv4({ method = "GET", url, headers = {}, body = "", region, service, accessKeyId, secretAccessKey, sessionToken = "", amzDate }) {
  const u = new URL(url);
  const s3 = service === "s3";
  const payloadHash = sha256(body);
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, " ");
  h.host = u.host;
  h["x-amz-date"] = amzDate;
  if (s3) h["x-amz-content-sha256"] = payloadHash;
  if (sessionToken) h["x-amz-security-token"] = sessionToken;
  const names = Object.keys(h).sort();
  const enc = (seg) => (s3 ? rfc3986(decodeURIComponent(seg)) : rfc3986(rfc3986(decodeURIComponent(seg))));
  const path = u.pathname.split("/").map(enc).join("/") || "/";
  const query = u.search.slice(1).split("&").filter(Boolean).map((p) => {
    const i = p.indexOf("=");
    const k = decodeURIComponent((i < 0 ? p : p.slice(0, i)).replace(/\+/g, " "));
    const v = i < 0 ? "" : decodeURIComponent(p.slice(i + 1).replace(/\+/g, " "));
    return [rfc3986(k), rfc3986(v)];
  }).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method.toUpperCase(), path, query, names.map((n) => `${n}:${h[n]}`).join("\n") + "\n", signedHeaders, payloadHash].join("\n");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(secretAccessKey, date, region, service)).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const out = { ...h, authorization };
  delete out.host;
  return { headers: out, authorization, canonicalRequest, stringToSign, signature };
}

export function s3Config(env = {}) {
  const bucket = env.BACKUP_S3_BUCKET, id = env.BACKUP_S3_ACCESS_KEY_ID, secret = env.BACKUP_S3_SECRET_ACCESS_KEY;
  if (!bucket || !id || !secret) return null;
  const region = env.BACKUP_S3_REGION || "us-east-1";
  const endpoint = String(env.BACKUP_S3_ENDPOINT || `https://s3.${region}.amazonaws.com`).replace(/\/+$/, "");
  if (!/^https:\/\//i.test(endpoint) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(endpoint)) return null;
  return { bucket, region, endpoint, accessKeyId: id, secretAccessKey: secret, prefix: env.BACKUP_S3_PREFIX ?? "babysitting-desk/" };
}

// PUT one object, path-style (endpoint/bucket/key), which S3, R2, B2 and MinIO all accept.
export async function s3Put(cfg, key, body, fetchImpl = globalThis.fetch, now = Date.now) {
  const url = `${cfg.endpoint}/${rfc3986(cfg.bucket)}/${key.split("/").map(rfc3986).join("/")}`;
  const amzDate = new Date(now()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const { headers } = sigv4({ method: "PUT", url, headers: { "content-type": "application/json" }, body, region: cfg.region, service: "s3", accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, amzDate });
  const r = await fetchImpl(url, { method: "PUT", headers, body, signal: AbortSignal.timeout(20000) });
  if (!r || !r.ok) throw new Error(`off-site backup failed: HTTP ${r && r.status}`);
  return url;
}

// ---------- the daily job and the admin API ----------

// Run once a day (and at startup): snapshot, then the off-site copy if configured.
// `info` collects what the /admin page shows; failures are logged, never thrown.
export async function dailyBackup(state, env, today, { fetchImpl = globalThis.fetch, now = Date.now, log = console.error, info = state.backupInfo || (state.backupInfo = {}) } = {}) {
  const dir = backupDir(env);
  try {
    const { name } = snapshot(state.desk, dir, today, { keep: Number(env.BACKUP_KEEP) || KEEP });
    info.lastSnapshot = name;
  } catch (e) { log("snapshot failed:", e.message); info.lastSnapshotError = e.message; }
  const cfg = s3Config(env);
  if (!cfg) return info;
  try {
    await s3Put(cfg, `${cfg.prefix}desk-${today}.json`, JSON.stringify(state.desk), fetchImpl, now);
    info.lastOffsite = new Date(now()).toISOString();
    delete info.lastOffsiteError;
  } catch (e) { log(e.message); info.lastOffsiteError = e.message; }
  return info;
}

// Names only, never values.
export function integrations(env = {}) {
  const on = (k) => !!String(env[k] || "").trim();
  const list = [
    ["admin key", on("ADMIN_KEY")],
    ["calendar feed", on("CAL_TOKEN")],
    ["webhook alerts", /^https?:\/\//i.test(env.NOTIFY_WEBHOOK_URL || "")],
    ["email (Resend)", on("RESEND_API_KEY") && on("FROM_EMAIL")],
    ["alert email", on("NOTIFY_EMAIL")],
    ["auto-reply", env.AUTO_REPLY === "1"],
    ["auto follow-up", env.AUTO_FOLLOW_UP === "1"],
    ["off-site backup", !!s3Config(env)],
  ];
  return list.map(([name, configured]) => ({ name, configured }));
}

function diskUse(env) {
  const statePath = env.STATE || "desk.json";
  const dir = backupDir(env);
  const snaps = listSnapshots(dir);
  const out = { stateBytes: existsSync(statePath) ? statSync(statePath).size : 0, snapshots: snaps.length, snapshotBytes: snaps.reduce((t, s) => t + s.size, 0), newestSnapshot: snaps[0]?.name || null };
  try {
    const fs = statfsSync(dirname(statePath));
    out.freeBytes = fs.bavail * fs.bsize;
    out.totalBytes = fs.blocks * fs.bsize;
  } catch { /* not every platform reports it */ }
  return out;
}

export function status(state, env = {}, now = Date.now) {
  const desk = state.desk;
  const leads = {};
  for (const l of desk.leads) leads[l.status || "new"] = (leads[l.status || "new"] || 0) + 1;
  return {
    app: APP_VERSION,
    node: process.version,
    commit: env.RENDER_GIT_COMMIT || env.FLY_IMAGE_REF || env.APP_COMMIT || null,
    time: new Date(now()).toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    counts: { leads: desk.leads.length, leadsByStatus: leads, families: desk.families.length, bookings: desk.bookings.length, expenses: desk.expenses.length, references: desk.references.length },
    lastDigest: state.lastDigest || null,
    backup: { ...(state.backupInfo || {}), keep: Number(env.BACKUP_KEEP) || KEEP },
    integrations: integrations(env),
    disk: diskUse(env),
  };
}

// Called from server.mjs after the admin key has been checked. Returns true when it
// answered the request.
export async function backupApi(req, url, send, state, save, env, now, readBody) {
  const json = (code, v) => send(code, JSON.stringify(v), "application/json");
  const dir = backupDir(env);
  if (req.method === "GET" && url.pathname === "/api/status") { json(200, status(state, env, now)); return true; }
  if (req.method === "GET" && url.pathname === "/api/backups") { json(200, listSnapshots(dir)); return true; }
  if (req.method === "GET" && url.pathname === "/api/backup") {
    const name = url.searchParams.get("snapshot");
    let body = JSON.stringify(state.desk, null, 1), file = `babysitting-desk-${day(now())}.json`;
    if (name) {
      if (!ANY_SNAPSHOT.test(name) || !existsSync(join(dir, name))) { send(404, "no such snapshot\n", "text/plain"); return true; }
      body = readFileSync(join(dir, name), "utf8"); file = name;
    }
    send(200, body, "application/json", { "content-disposition": `attachment; filename="${file}"`, "cache-control": "no-store" });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/restore") {
    const raw = await readBody(req, 8 * 1024 * 1024);
    if (raw === null) { send(413, "too large\n", "text/plain"); return true; }
    let incoming;
    try { incoming = JSON.parse(raw); } catch { send(400, "not JSON\n", "text/plain"); return true; }
    if (incoming && typeof incoming.snapshot === "string") {
      if (!ANY_SNAPSHOT.test(incoming.snapshot) || !existsSync(join(dir, incoming.snapshot))) { send(404, "no such snapshot\n", "text/plain"); return true; }
      try { incoming = JSON.parse(readFileSync(join(dir, incoming.snapshot), "utf8")); } catch { send(422, "that snapshot is damaged\n", "text/plain"); return true; }
    }
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming) || !("profile" in incoming || "leads" in incoming || "families" in incoming)) {
      send(422, "that file is not a desk backup\n", "text/plain"); return true;
    }
    const before = snapshot(state.desk, dir, day(now()), { tag: `pre-restore-${new Date(now()).toISOString().slice(11, 19).replace(/:/g, "")}` }).name;
    state.desk = normalizeDesk(incoming);
    save();
    json(200, { ok: true, savedFirst: before, counts: status(state, env, now).counts });
    return true;
  }
  return false;
}
