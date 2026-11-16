// Switching from Square's free team scheduling without a CSV: read the scheduled shifts straight from Square's Labor API
// and turn them into this tool's shift-requirement lines, the same way `import-shifts.mjs` reads a published-schedule
// export. Many cafes and shops already run their tills on Square, and Square's sales exports are what `--from-sales`
// reads; this is the other half, the schedule they already made there.
//
// Field names, envelopes and meanings come from Square's own published OpenAPI definition
// (https://raw.githubusercontent.com/square/connect-api-specification/master/api.json, read 2026-11-16, Square-Version
// default 2026-09-16; SHA-256 and every field used in eval/square-scheduled-shifts-format-2026-11-16.md):
//   POST /v2/labor/scheduled-shifts/search -> { scheduled_shifts: [ScheduledShift], cursor }   (BETA in the definition)
//   GET  /v2/team-members/jobs             -> { jobs: [{ id, title, ... }], cursor }
//   GET  /v2/locations                     -> { locations: [{ id, name, timezone, status, ... }] }
// A ScheduledShift has `draft_shift_details` ("always present", the latest draft) and `published_shift_details` ("present
// only if the shift was published"). Each details object holds team_member_id, location_id, job_id, start_at, end_at
// (RFC 3339 "in the time zone + offset of the shift location"), is_deleted and timezone. A shift with no team_member_id
// is unassigned: still needed, so it counts, like an open shift in the other readers.
//
// Nothing here needs a server: the page reads saved JSON responses; the CLI can also fetch them with the deployer's own
// access token from an environment variable (fetchSquare). No Square account was used to build or test this.
import { importShiftsCsv } from "./import-shifts.mjs";
import { readWiwTime } from "./import-wheniwork.mjs";

const pad2 = (n) => String(n).padStart(2, "0");

// The wall clock of an instant in an IANA zone, as { date, time }; null when the zone is unknown to this runtime.
function wallClock(ms, timeZone) {
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${pad2(+p.hour % 24)}:${p.minute}` };
  } catch { return null; }
}

// An RFC 3339 time as Square writes it ("2026-11-09T07:00:00-06:00"). The digits are the location's clock when the
// offset is written in, as the definition says they will be. A time in UTC ("Z", or no offset) is moved to the
// location's zone when one is known (the details' `timezone`, or the location's), and flagged `utc` otherwise.
export function readSquareTime(s, timeZone) {
  const t = readWiwTime(s);
  if (!t || !/^\d{4}-/.test(String(s).trim())) return null;
  if (t.offset && !/^Z$/i.test(t.offset)) return t;
  const w = timeZone ? wallClock(t.ms, timeZone) : null;
  return w ? { ...t, ...w, offset: timeZone, moved: true } : { ...t, utc: true };
}

// Flatten JSON text, a parsed response, or a list of these (several saved responses, one per file or one per line).
function collect(inputs) {
  const out = { shifts: [], jobs: [], locations: [], unread: 0, errors: [] };
  const visit = (v) => {
    if (typeof v === "string") {
      const s = v.trim().replace(/^﻿/, "");
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
      // A bare list of scheduled shifts, or a list of responses.
      if (v.length && v.every((x) => x && typeof x === "object" && ("draft_shift_details" in x || "published_shift_details" in x))) { out.shifts.push(...v); return; }
      for (const x of v) visit(x);
      return;
    }
    if (!v || typeof v !== "object") { out.unread++; return; }
    let used = false;
    if (Array.isArray(v.scheduled_shifts)) { out.shifts.push(...v.scheduled_shifts); used = true; }
    if (v.scheduled_shift && typeof v.scheduled_shift === "object") { out.shifts.push(v.scheduled_shift); used = true; }
    for (const k of ["jobs", "locations"]) if (Array.isArray(v[k])) { out[k].push(...v[k]); used = true; }
    if (Array.isArray(v.errors) && v.errors.length) { out.errors.push(...v.errors.map((e) => e?.detail || e?.code || "error")); used = true; }
    if (!used) out.unread++;
  };
  visit(inputs);
  return out;
}

// True when the JSON texts look like Square Labor responses. The page asks this before the When I Work and 7shifts
// checks, so a saved Square locations response next to the shifts does not read as When I Work's.
export function looksLikeSquare(texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  return list.some((t) => /"(scheduled_shifts|draft_shift_details|published_shift_details)"\s*:/.test(String(t)));
}

const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

// inputs: see collect(). opts.location: a location name or id to keep; opts.drafts: false to leave out shifts never
// published; opts.latest: true to read every shift's latest draft (the edits a manager has not published yet) instead of
// the published version. Returns importShiftsCsv's result plus `counts`.
export function importSquare(inputs, opts = {}) {
  const got = collect(inputs);
  const counts = { shifts: got.shifts.length, deleted: 0, drafts: 0, draftsLeftOut: 0, pendingDelete: 0, open: 0, unreadable: 0, edited: 0, moved: 0, utc: 0 };
  const fail = (msg) => ({ shiftsText: "", rows: 0, shifts: 0, notes: [msg], skipped: [], unknown: [], locations: [], families: [], counts });
  if (!got.shifts.length) {
    if (got.errors.length) return fail(`Square answered with an error, not shifts: ${got.errors.slice(0, 3).join("; ")}.`);
    return fail(got.unread || got.jobs.length || got.locations.length
      ? "No Square scheduled shifts found in that JSON. Save the response of POST /v2/labor/scheduled-shifts/search (its rows have draft_shift_details)."
      : "Nothing to read: paste or choose the JSON from Square's scheduled-shifts search.");
  }

  const jobs = new Map(got.jobs.map((j) => [String(j.id), String(j.title || "").trim()]));
  const locs = new Map(got.locations.map((l) => [String(l.id), l]));
  const locName = (id) => { const l = locs.get(String(id)); return l?.name ? String(l.name).trim() : id == null || id === "" ? "" : `location ${id}`; };
  const rows = ["Date,Start,End,Role,Location"];
  const skipped = [];
  const seen = new Set();
  const offsets = new Set();
  let dupes = 0;
  got.shifts.forEach((s, i) => {
    if (!s || typeof s !== "object") { counts.unreadable++; return; }
    const id = s.id ?? null;
    if (id != null) { if (seen.has(String(id))) { dupes++; return; } seen.add(String(id)); }
    const draft = s.draft_shift_details && typeof s.draft_shift_details === "object" ? s.draft_shift_details : null;
    const pub = s.published_shift_details && typeof s.published_shift_details === "object" ? s.published_shift_details : null;
    let d;
    if (opts.latest) {
      d = draft || pub;
      if (d?.is_deleted === true) { counts.deleted++; return; }
      if (!pub) counts.drafts++;
    } else if (pub) {
      d = pub;
      // A draft that deletes a published shift: the shift stays on the posted schedule until the manager publishes.
      if (draft?.is_deleted === true) counts.pendingDelete++;
      else if (draft && ["start_at", "end_at", "team_member_id", "job_id", "location_id"].some((k) => (draft[k] ?? null) !== (pub[k] ?? null))) counts.edited++;
    } else {
      if (!draft || draft.is_deleted === true) { counts.deleted++; return; }
      counts.drafts++;
      if (opts.drafts === false) { counts.draftsLeftOut++; return; }
      d = draft;
    }
    if (!d || d.is_deleted === true) { counts.deleted++; return; }
    const label = `Shift ${id ?? i + 1}`;
    const zone = d.timezone || locs.get(String(d.location_id))?.timezone || undefined;
    const a = readSquareTime(d.start_at, zone);
    if (!a) { skipped.push(`${label}: could not read the start "${d.start_at}"`); return; }
    const b = readSquareTime(d.end_at, zone);
    if (!b) { skipped.push(`${label}: could not read the end "${d.end_at}"`); return; }
    const len = (b.ms - a.ms) / 60000;
    if (!(len > 0 && len < 1440)) { skipped.push(`${label}: ends ${len <= 0 ? "at or before its start" : "a day or more after its start"} (${d.start_at} to ${d.end_at})`); return; }
    if (a.moved) counts.moved++;
    if (a.utc) counts.utc++;
    if (a.offset && !a.moved && !a.utc) offsets.add(a.offset);
    if (d.team_member_id == null || d.team_member_id === "") counts.open++;
    const role = d.job_id == null || d.job_id === "" ? "" : jobs.get(String(d.job_id)) || `job ${d.job_id}`;
    rows.push([a.date, a.time, b.time, q(role), q(locName(d.location_id))].join(","));
  });
  if (rows.length < 2) {
    const r = fail(`No shifts left to read: ${counts.deleted} deleted${counts.draftsLeftOut ? `, ${counts.draftsLeftOut} never published left out` : ""}${skipped.length ? `, ${skipped.length} unreadable` : ""}.`);
    r.skipped = skipped;
    return r;
  }
  const r = importShiftsCsv(rows.join("\n"), { location: opts.location != null && locs.has(String(opts.location)) ? locName(opts.location) : opts.location });
  const kept = r.notes.filter((n) => !/^Employee names were not used|^Columns not used/.test(n));
  const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const notes = [`Read ${plural(counts.shifts - dupes, "Square scheduled shift")}${dupes ? ` (${dupes} repeated across files counted once)` : ""}${opts.latest ? ", latest drafts" : ""}.`];
  if (counts.deleted) notes.push(`${plural(counts.deleted, "deleted shift")} left out.`);
  if (counts.draftsLeftOut) notes.push(`${plural(counts.draftsLeftOut, "never-published shift")} left out.`);
  else if (counts.drafts) notes.push(`${plural(counts.drafts, "never-published shift")} read from ${counts.drafts === 1 ? "its draft" : "their drafts"} as planned.`);
  if (counts.edited) notes.push(`${plural(counts.edited, "published shift")} ${counts.edited === 1 ? "has" : "have"} unpublished edits; read as published (--square-latest reads the drafts).`);
  if (counts.pendingDelete) notes.push(`${plural(counts.pendingDelete, "published shift")} ${counts.pendingDelete === 1 ? "is" : "are"} deleted in a draft but still posted; counted until published.`);
  if (counts.open) notes.push(`${plural(counts.open, "unassigned shift")} counted as needed.`);
  if (offsets.size > 1) notes.push(`Times are read as written, on each shift's own clock (offsets ${[...offsets].sort().join(", ")}: a daylight-saving change or locations in different zones).`);
  if (counts.moved) notes.push(`${plural(counts.moved, "shift")} given in UTC moved to the location's time zone.`);
  if (counts.utc) notes.push(`${plural(counts.utc, "shift")} given in UTC with no time zone known were read as UTC clock times: add the locations response (GET /v2/locations) for each location's zone.`);
  if (got.errors.length) notes.push(`Square also answered with ${plural(got.errors.length, "error")}: ${got.errors.slice(0, 3).join("; ")}.`);
  if (counts.unreadable || got.unread) notes.push(`${counts.unreadable + got.unread} JSON value(s) were not Square scheduled shifts, jobs or locations and were ignored.`);
  if (!got.jobs.length && got.shifts.some((s) => (s?.published_shift_details || s?.draft_shift_details)?.job_id)) notes.push("Jobs are shown as ids: add the jobs response (GET /v2/team-members/jobs) for their titles.");
  return { ...r, notes: [...notes, ...kept], skipped: [...skipped, ...r.skipped], counts };
}

// Square's API version header: the definition's default when this was written. SQUARE_VERSION overrides it in the CLI.
export const SQUARE_VERSION = "2026-09-16";

// Fetch the scheduled shifts whose workday falls in [from, to] (every page), the jobs and the locations, with the
// deployer's own access token. `fetchImpl` defaults to the global fetch; tests pass a stub. The token goes only to `base`
// as a bearer header and is never printed. The search needs the TIMECARDS_READ permission, per the definition.
export async function fetchSquare({ token, from, to, base = "https://connect.squareup.com", version = SQUARE_VERSION, fetchImpl = globalThis.fetch, maxPages = 200 }) {
  if (!token) throw new Error("Set SQUARE_ACCESS_TOKEN to an access token for your own Square account (Square Developer Console: your application's production access token, or OAuth with TIMECARDS_READ, EMPLOYEES_READ and MERCHANT_PROFILE_READ).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) throw new Error("--from and --to take dates like 2026-11-02.");
  if (to < from) throw new Error("--to is before --from.");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "Square-Version": version };
  const call = async (path, body) => {
    const u = new URL(path, base);
    const res = await fetchImpl(u.toString(), body ? { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) } : { headers });
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = (j?.errors || []).map((e) => e?.code).filter(Boolean).join(", "); } catch { /* not JSON */ }
      throw new Error(`Square answered ${res.status} for ${u.pathname}${detail ? ` (${detail})` : ""}${res.status === 401 ? ": check the token" : res.status === 403 ? ": the token lacks a permission (scheduled shifts need TIMECARDS_READ)" : res.status === 429 ? ": rate limited, try again in a minute" : ""}.`);
    }
    return res.json();
  };
  // The workday filter matches on the location's own dates (INTERSECTION: "shifts that start between the start and end
  // workdays"), so no day either side is needed; within() still keeps only the dates asked for.
  const shifts = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const body = { query: { filter: { workday: { date_range: { start_date: from, end_date: to }, match_scheduled_shifts_by: "INTERSECTION" } }, sort: { field: "START_AT", order: "ASC" } }, limit: 50, ...(cursor ? { cursor } : {}) };
    const r = await call("/v2/labor/scheduled-shifts/search", body);
    shifts.push(...(r.scheduled_shifts || []));
    cursor = r.cursor;
    if (!cursor) break;
  }
  const jobs = [];
  cursor = undefined;
  for (let page = 0; page < maxPages; page++) {
    const r = await call("/v2/team-members/jobs" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""));
    jobs.push(...(r.jobs || []));
    cursor = r.cursor;
    if (!cursor) break;
  }
  const locations = await call("/v2/locations");
  return { responses: [{ scheduled_shifts: shifts }, { jobs }, { locations: locations.locations || [] }], from, to };
}

// Keep only the shifts whose wall-clock start date (published version, else the draft) is inside [from, to].
export function within(inputs, from, to) {
  const got = collect(inputs);
  const locs = new Map(got.locations.map((l) => [String(l.id), l]));
  const keep = got.shifts.filter((s) => {
    const d = s?.published_shift_details || s?.draft_shift_details;
    const a = d && readSquareTime(d.start_at, d.timezone || locs.get(String(d.location_id))?.timezone);
    return a && a.date >= from && a.date <= to;
  });
  return [{ scheduled_shifts: keep }, { jobs: got.jobs }, { locations: got.locations }];
}
