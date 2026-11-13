// Switching from When I Work without a CSV: read the shifts straight from the When I Work API (v2) and turn them into
// this tool's shift-requirement lines, the same way `import-shifts.mjs` reads a published-schedule export.
//
// The field names, the time format and the envelopes come from When I Work's own published OpenAPI definition
// (https://apidocs.wheniwork.com/external/monolith/docs-master.json, OpenAPI 3.1.0, read 2026-11-13; see
// eval/wheniwork-api-format-2026-11-13.md):
//   GET /2/shifts     -> { shifts: [shift], repeating_shifts: [...], shiftchains: [...] }  (and `deleted_ids` with deleted=true)
//   GET /2/positions  -> { positions: [{ id, name, ... }] }
//   GET /2/locations  -> { locations: [{ id, name, is_deleted, ... }] }
// A shift's `start_time` and `end_time` are RFC 2822 dates with the offset written in ("Mon, 08 May 2023 08:30:00
// -0600"), so the clock digits already are the wall-clock time a manager scheduled: no time zone lookup is needed,
// unlike 7shifts' UTC times. `user_id: 0` (or `is_open`) is an open shift with nobody on it, still needed, so it counts.
// `published: false` is an unpublished draft. Ids listed in `deleted_ids` are left out.
//
// Nothing here needs a server: the page reads saved JSON responses; the CLI can also fetch them with the deployer's
// own token from an environment variable (fetchWhenIWork). No When I Work account was used to build or test this.
import { importShiftsCsv } from "./import-shifts.mjs";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad2 = (n) => String(n).padStart(2, "0");

// "Mon, 08 May 2023 08:30:00 -0600" (RFC 2822, the API's form; the weekday is optional) or ISO 8601
// ("2023-05-08T08:30:00-06:00") -> { date "YYYY-MM-DD", time "HH:MM", ms: the instant, for lengths }.
// The date and time are the digits as written, i.e. the clock where the shift happens.
export function readWiwTime(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  let y, mo, d, h, mi, sec, off;
  let m = /^(?:[A-Za-z]{3},?\s+)?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{2}:?\d{2}|Z|UT|UTC|GMT)?$/.exec(t);
  if (m) {
    mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    if (!mo) return null;
    [d, y, h, mi, sec, off] = [+m[1], +m[3], +m[4], +m[5], +(m[6] || 0), m[7]];
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([+-]\d{2}:?\d{2}|Z)?$/.exec(t);
    if (!m) return null;
    [y, mo, d, h, mi, sec, off] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), m[7]];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 60) return null;
  const local = Date.UTC(y, mo - 1, d, h, mi, sec);
  const back = new Date(local);
  if (back.getUTCDate() !== d) return null; // 31 April and the like
  let offMin = 0;
  if (off && !/^(Z|UT|UTC|GMT)$/.test(off)) {
    const o = /^([+-])(\d{2}):?(\d{2})$/.exec(off);
    offMin = (o[1] === "-" ? -1 : 1) * (+o[2] * 60 + +o[3]);
  }
  return { date: `${y}-${pad2(mo)}-${pad2(d)}`, time: `${pad2(h)}:${pad2(mi)}`, ms: local - offMin * 60000, offset: off || "" };
}

// Flatten what the caller hands over: JSON text, a parsed response, or a list of these (several saved responses, one
// per file or one per line). A response object can carry several lists at once (shifts with positions beside them).
function collect(inputs) {
  const out = { shifts: [], positions: [], locations: [], deletedIds: new Set(), repeating: 0, unread: 0 };
  const visit = (v) => {
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return;
      let parsed;
      try { parsed = JSON.parse(s); } catch {
        const parts = s.split(/\n(?=\s*[{[])/);
        if (parts.length < 2) { out.unread++; return; }
        for (const p of parts) visit(p);
        return;
      }
      return visit(parsed);
    }
    if (Array.isArray(v)) {
      // A bare list of shift rows, or a list of responses.
      if (v.length && v.every((x) => x && typeof x === "object" && "start_time" in x && "end_time" in x)) { out.shifts.push(...v); return; }
      for (const x of v) visit(x);
      return;
    }
    if (!v || typeof v !== "object") { out.unread++; return; }
    let used = false;
    for (const k of ["shifts", "positions", "locations"]) if (Array.isArray(v[k])) { out[k].push(...v[k]); used = true; }
    if (Array.isArray(v.deleted_ids)) { for (const id of v.deleted_ids) out.deletedIds.add(String(id)); used = true; }
    if (Array.isArray(v.repeating_shifts)) { out.repeating += v.repeating_shifts.length; used = true; }
    if (!used) out.unread++;
  };
  visit(inputs);
  return out;
}

// True when the JSON texts look like When I Work responses rather than 7shifts' (`{ object, data }`): the page uses
// this to pick the reader for a saved-JSON upload.
export function looksLikeWhenIWork(texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  return list.some((t) => /"start_time"\s*:\s*"/.test(String(t)) || /^\s*\{\s*"(shifts|positions)"\s*:/.test(String(t)));
}

const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

// inputs: see collect(). opts.location: a location name or id to keep (the result lists them); opts.drafts: false to
// leave out unpublished shifts. Returns importShiftsCsv's result plus `counts`.
export function importWhenIWork(inputs, opts = {}) {
  const got = collect(inputs);
  const counts = { shifts: got.shifts.length, deleted: 0, drafts: 0, draftsLeftOut: 0, open: 0, unreadable: 0, offsets: 0 };
  const fail = (msg) => ({ shiftsText: "", rows: 0, shifts: 0, notes: [msg], skipped: [], unknown: [], locations: [], families: [], counts });
  if (!got.shifts.length) return fail(got.unread || got.positions.length || got.locations.length
    ? "No When I Work shifts found in that JSON. Save the response of GET /2/shifts (its rows have start_time and end_time)."
    : "Nothing to read: paste or choose the JSON from the When I Work shifts endpoint.");

  const positions = new Map(got.positions.map((p) => [String(p.id), String(p.name || "").trim()]));
  const locs = new Map(got.locations.map((l) => [String(l.id), l]));
  const locName = (id) => { const l = locs.get(String(id)); return l?.name ? String(l.name).trim() : id == null || id === 0 ? "" : `location ${id}`; };
  const rows = ["Date,Start,End,Role,Location"];
  const skipped = [];
  const seen = new Set();
  const offsets = new Set();
  let dupes = 0;
  got.shifts.forEach((s, i) => {
    if (!s || typeof s !== "object") { counts.unreadable++; return; }
    const id = s.id ?? null;
    if (id != null) { if (seen.has(String(id))) { dupes++; return; } seen.add(String(id)); }
    if ((id != null && got.deletedIds.has(String(id))) || s.is_deleted === true || (s.deleted_at != null && s.deleted_at !== "")) { counts.deleted++; return; }
    if (s.published === false) { counts.drafts++; if (opts.drafts === false) { counts.draftsLeftOut++; return; } }
    const label = `Shift ${id ?? i + 1}`;
    const a = readWiwTime(s.start_time);
    if (!a) { skipped.push(`${label}: could not read the start "${s.start_time}"`); return; }
    const b = readWiwTime(s.end_time);
    if (!b) { skipped.push(`${label}: could not read the end "${s.end_time}"`); return; }
    // A shift's end is after its start and less than a day later; anything else is a damaged row, not a shift.
    const len = (b.ms - a.ms) / 60000;
    if (!(len > 0 && len < 1440)) { skipped.push(`${label}: ends ${len <= 0 ? "at or before its start" : "a day or more after its start"} (${s.start_time} to ${s.end_time})`); return; }
    if (a.offset) offsets.add(a.offset);
    if (s.is_open === true || s.user_id === 0 || s.user_id === "0" || s.user_id == null) counts.open++;
    const role = s.position_id == null || s.position_id === 0 ? "" : positions.get(String(s.position_id)) || `position ${s.position_id}`;
    rows.push([a.date, a.time, b.time, q(role), q(locName(s.location_id))].join(","));
  });
  if (rows.length < 2) {
    const r = fail(`No shifts left to read: ${counts.deleted} deleted${counts.draftsLeftOut ? `, ${counts.draftsLeftOut} unpublished left out` : ""}${skipped.length ? `, ${skipped.length} unreadable` : ""}.`);
    r.skipped = skipped;
    return r;
  }
  counts.offsets = offsets.size;
  const r = importShiftsCsv(rows.join("\n"), { location: opts.location != null && locs.has(String(opts.location)) ? locName(opts.location) : opts.location });
  const kept = r.notes.filter((n) => !/^Employee names were not used|^Columns not used/.test(n));
  const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const notes = [`Read ${plural(counts.shifts - dupes, "When I Work shift")}${dupes ? ` (${dupes} repeated across files counted once)` : ""}.`];
  if (counts.deleted) notes.push(`${plural(counts.deleted, "deleted shift")} left out.`);
  if (counts.draftsLeftOut) notes.push(`${plural(counts.draftsLeftOut, "unpublished shift")} left out.`);
  else if (counts.drafts) notes.push(`${plural(counts.drafts, "unpublished shift")} read as planned shifts.`);
  if (counts.open) notes.push(`${plural(counts.open, "open shift")} with nobody on ${counts.open === 1 ? "it" : "them"} counted as needed.`);
  if (offsets.size > 1) notes.push(`Times are read as written, on each shift's own clock (offsets ${[...offsets].sort().join(", ")}: a daylight-saving change or locations in different zones).`);
  if (got.repeating) notes.push(`${plural(got.repeating, "repeating-series row")} not read: the dated shifts list is what counts (fetch a longer range for more weeks).`);
  if (counts.unreadable || got.unread) notes.push(`${counts.unreadable + got.unread} JSON value(s) were not When I Work shifts, positions or locations and were ignored.`);
  if (!got.positions.length && got.shifts.some((s) => s?.position_id)) notes.push("Positions are shown as numbers: add the positions response (GET /2/positions) for their names.");
  return { ...r, notes: [...notes, ...kept], skipped: [...skipped, ...r.skipped], counts };
}

// Fetch the shifts (with open and unpublished ones, and the ids deleted in the range), positions and locations for
// [from, to] with the deployer's own token. `fetchImpl` defaults to the global fetch; tests pass a stub. The token
// goes only to `base` as a bearer header and is never printed. `userId` sets the W-UserId header, which When I Work
// needs when the person behind the token belongs to more than one workplace.
export async function fetchWhenIWork({ token, userId, from, to, base = "https://api.wheniwork.com", fetchImpl = globalThis.fetch }) {
  if (!token) throw new Error("Set WHENIWORK_TOKEN to a token from your own When I Work login (When I Work API docs, Authentication: POST https://api.login.wheniwork.com/login with your developer key).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) throw new Error("--from and --to take dates like 2026-11-02.");
  if (to < from) throw new Error("--to is before --from.");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", ...(userId ? { "W-UserId": String(userId) } : {}) };
  const get = async (path, params = {}) => {
    // API request parameters (not page state): built as one query string for the When I Work request.
    const query = new URLSearchParams(params);
    const request = path + "?" + query;
    const u = new URL(request, base);
    const res = await fetchImpl(u.toString(), { headers });
    if (!res.ok) throw new Error(`When I Work answered ${res.status} for ${u.pathname}${res.status === 401 ? " (check the token)" : res.status === 403 ? " (no permission, or a rate limit: When I Work answers 403 for both)" : ""}.`);
    return res.json();
  };
  // The range filter is on shift times; a day either side is asked for and the wall-clock dates are what count
  // (within() below), so a shift near midnight in a zone far from the server's is not lost.
  const day = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const shifts = await get("/2/shifts", { start: day(from, -1) + "T00:00:00Z", end: day(to, 2) + "T00:00:00Z", unpublished: "true", include_open: "true", include_allopen: "true", deleted: "true", all_locations: "true" });
  const positions = await get("/2/positions");
  const locations = await get("/2/locations");
  return { responses: [shifts, positions, locations], from, to };
}

// Keep only the shifts whose wall-clock start date is inside [from, to].
export function within(inputs, from, to) {
  const got = collect(inputs);
  const keep = got.shifts.filter((s) => { const a = readWiwTime(s?.start_time); return a && a.date >= from && a.date <= to; });
  return [{ shifts: keep, deleted_ids: [...got.deletedIds] }, { positions: got.positions }, { locations: got.locations }];
}
