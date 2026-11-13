// Switching from 7shifts without a CSV: read the shifts straight from the 7shifts API (v2) and turn them into this
// tool's shift-requirement lines, the same way `import-shifts.mjs` reads a published-schedule export.
//
// The field names, the time format and the envelope come from 7shifts' own API definition (API version 2023-05-01,
// as mirrored in jentic/jentic-public-apis, read 2026-11-13; see eval/7shifts-api-format-2026-11-13.md):
//   GET /v2/company/{company_id}/shifts     -> { object: "shifts", data: [shift], meta: { cursor: { next } } }
//   GET /v2/company/{company_id}/roles      -> { object: "roles", data: [{ id, name, location_id }] }
//   GET /v2/company/{company_id}/locations  -> { object: "locations", data: [{ id, name, timezone, mon_hours_close ... }] }
// A shift's `start` and `end` are UTC in ISO 8601, so the location's `timezone` (an IANA zone name) turns them into
// the wall-clock times a manager scheduled. `open: true` shifts have nobody on them and are still needed, so they count.
// `close: true` means "until closing" and the API says `end` is not used: the location's closing time for that
// weekday is used when the locations response is given. Deleted shifts are left out.
//
// Nothing here needs a server: the page reads saved JSON responses; the CLI can also fetch them with the deployer's
// own access token from an environment variable (fetch7shifts). No 7shifts account was used to build or test this.
import { importShiftsCsv } from "./import-shifts.mjs";

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// What kind of 7shifts response a parsed JSON value is: by its `object` field, else by the keys its rows carry.
function kindOf(resp) {
  const rows = Array.isArray(resp) ? resp : Array.isArray(resp?.data) ? resp.data : null;
  if (!rows) return { kind: "", rows: [] };
  const named = !Array.isArray(resp) && typeof resp.object === "string" ? resp.object : "";
  if (["shifts", "roles", "locations"].includes(named)) return { kind: named, rows };
  const r = rows.find((x) => x && typeof x === "object") || {};
  if ("start" in r && "end" in r) return { kind: "shifts", rows };
  if ("timezone" in r) return { kind: "locations", rows };
  if ("name" in r && ("num_stations" in r || "job_code" in r || "stations" in r || "color" in r)) return { kind: "roles", rows };
  return { kind: named || "", rows };
}

// Flatten what the caller hands over: JSON text, a parsed response, a bare array, or a list of any of these
// (several pages of one endpoint, or one page each of shifts, roles and locations).
function collect(inputs) {
  const out = { shifts: [], roles: [], locations: [], unread: 0 };
  const visit = (v) => {
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return;
      let parsed;
      try { parsed = JSON.parse(s); } catch {
        // Several responses saved one after another (one per line, or pasted back to back).
        const parts = s.split(/\n(?=\s*[{[])/);
        if (parts.length < 2) { out.unread++; return; }
        for (const p of parts) visit(p);
        return;
      }
      return visit(parsed);
    }
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) { for (const x of v) visit(x); return; }
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && !Array.isArray(x) && ("data" in x || "object" in x))) { for (const x of v) visit(x); return; }
    const { kind, rows } = kindOf(v);
    if (kind && out[kind]) out[kind].push(...rows);
    else out.unread++;
  };
  visit(inputs);
  return out;
}

// UTC ISO time -> { date "YYYY-MM-DD", time "HH:MM", dow 0=Sun } on the wall clock of `tz`.
const fmtCache = new Map();
function wallClock(iso, tz) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, dow: DOW.indexOf(p.weekday.slice(0, 3).toLowerCase()) };
}
const validZone = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

// inputs: see collect(). opts.timeZone: an IANA zone that overrides the locations' own; opts.location: a location
// name or id to keep (the result lists them); opts.drafts: false to leave out unpublished draft shifts.
// Returns importShiftsCsv's result ({ shiftsText, rows, shifts, notes, skipped, locations, ... }) plus `counts`.
export function import7shifts(inputs, opts = {}) {
  const got = collect(inputs);
  const notes = [];
  const counts = { shifts: got.shifts.length, deleted: 0, drafts: 0, draftsLeftOut: 0, open: 0, untilClose: 0, closeFromLocation: 0, sick: 0, noShow: 0, unreadable: 0 };
  const fail = (msg) => ({ shiftsText: "", rows: 0, shifts: 0, notes: [msg], skipped: [], unknown: [], locations: [], families: [], counts });
  if (!got.shifts.length) return fail(got.unread ? "No 7shifts shifts found in that JSON. Save the response of GET /v2/company/{company_id}/shifts (its rows have start and end)." : "Nothing to read: paste or choose the JSON from the 7shifts shifts endpoint.");
  if (opts.timeZone && !validZone(opts.timeZone)) return fail(`"${opts.timeZone}" is not a time zone name (use one like America/Toronto).`);

  const roles = new Map(got.roles.map((r) => [String(r.id), String(r.name || "").trim()]));
  const locs = new Map(got.locations.map((l) => [String(l.id), l]));
  const locName = (id) => { const l = locs.get(String(id)); return l?.name ? String(l.name).trim() : id == null ? "" : `location ${id}`; };
  let utcRows = 0;
  const badZones = new Set();
  const rows = ["Date,Start,End,Role,Location"];
  const skipped = [];
  // Ids of shifts seen, so a page fetched twice or overlapping date ranges do not count a shift twice.
  const seen = new Set();
  let dupes = 0;
  got.shifts.forEach((s, i) => {
    if (!s || typeof s !== "object") { counts.unreadable++; return; }
    if (s.id != null) { if (seen.has(s.id)) { dupes++; return; } seen.add(s.id); }
    if (s.deleted === true || s.soft_deleted === true || /_deleted$/.test(String(s.publish_status || ""))) { counts.deleted++; return; }
    const draft = s.draft === true || s.publish_status === "draft";
    if (draft) { counts.drafts++; if (opts.drafts === false) { counts.draftsLeftOut++; return; } }
    const loc = locs.get(String(s.location_id));
    let tz = opts.timeZone || loc?.timezone || "";
    if (tz && !validZone(tz)) { badZones.add(tz); tz = ""; }
    if (!tz) { tz = "UTC"; utcRows++; }
    const a = wallClock(s.start, tz);
    if (!a) { skipped.push(`Shift ${s.id ?? i + 1}: could not read the start "${s.start}"`); return; }
    let endTime = null;
    if (s.close === true) {
      counts.untilClose++;
      const shut = loc?.[`${DOW[a.dow]}_hours_close`];
      if (typeof shut === "string" && /^\d{1,2}:\d{2}/.test(shut)) { endTime = shut.slice(0, 5); counts.closeFromLocation++; }
    }
    if (!endTime) {
      const b = wallClock(s.end, tz);
      if (!b) { skipped.push(`Shift ${s.id ?? i + 1}: could not read the end "${s.end}"`); return; }
      // A shift's end is after its start and less than a day later; anything else is a damaged row, not a shift.
      const len = (Date.parse(s.end) - Date.parse(s.start)) / 60000;
      if (!(len > 0 && len < 1440)) { skipped.push(`Shift ${s.id ?? i + 1}: ends ${len <= 0 ? "at or before its start" : "a day or more after its start"} (${s.start} to ${s.end})`); return; }
      endTime = b.time;
    }
    if (s.open === true || s.user_id == null) counts.open++;
    if (s.attendance_status === "sick") counts.sick++;
    if (s.attendance_status === "no_show") counts.noShow++;
    const role = s.role_id == null ? "" : roles.get(String(s.role_id)) || `role ${s.role_id}`;
    rows.push([a.date, a.time, endTime, q(role), q(locName(s.location_id))].join(","));
  });
  if (rows.length < 2) {
    const r = fail(`No shifts left to read: ${counts.deleted} deleted${counts.draftsLeftOut ? `, ${counts.draftsLeftOut} drafts left out` : ""}.`);
    r.skipped = skipped;
    return r;
  }
  const r = importShiftsCsv(rows.join("\n"), { location: opts.location != null && locs.has(String(opts.location)) ? locName(opts.location) : opts.location });
  // The CSV step's own notes about employee names and unused columns do not apply to an API read.
  const kept = r.notes.filter((n) => !/^Employee names were not used|^Columns not used/.test(n));
  const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  notes.push(`Read ${plural(counts.shifts - dupes, "7shifts shift")}${dupes ? ` (${dupes} repeated across pages counted once)` : ""}.`);
  if (counts.deleted) notes.push(`${plural(counts.deleted, "deleted shift")} left out.`);
  if (counts.draftsLeftOut) notes.push(`${plural(counts.draftsLeftOut, "unpublished draft shift")} left out.`);
  else if (counts.drafts) notes.push(`${plural(counts.drafts, "unpublished draft shift")} read as planned shifts.`);
  if (counts.open) notes.push(`${plural(counts.open, "open shift")} with nobody on ${counts.open === 1 ? "it" : "them"} counted as needed.`);
  if (counts.untilClose) notes.push(counts.closeFromLocation === counts.untilClose
    ? `${plural(counts.untilClose, "shift")} marked "until close" end at the location's closing time.`
    : `${plural(counts.untilClose, "shift")} marked "until close": ${counts.untilClose - counts.closeFromLocation} use the shift's own end time because no closing time was given (add the locations response).`);
  if (counts.sick || counts.noShow) notes.push(`${counts.sick} marked sick and ${counts.noShow} no-show were still scheduled shifts, so they count.`);
  if (opts.timeZone) notes.push(`Times read in ${opts.timeZone}.`);
  else if (utcRows) notes.push(`${plural(utcRows, "shift")} read in UTC: 7shifts sends UTC times, and ${badZones.size ? `the zone ${[...badZones].join(", ")} was not recognised` : "no location time zone was given"}. Add the locations response or a time zone (CLI --tz America/Toronto) or the hours will be off.`);
  if (counts.unreadable || got.unread) notes.push(`${counts.unreadable + got.unread} JSON value(s) were not 7shifts shifts, roles or locations and were ignored.`);
  if (!got.roles.length && got.shifts.some((s) => s?.role_id != null)) notes.push("Roles are shown as numbers: add the roles response (GET /v2/company/{company_id}/roles) for their names.");
  return { ...r, notes: [...notes, ...kept], skipped: [...skipped, ...r.skipped], counts };
}

// Fetch the shifts (and roles and locations) for [from, to] with the deployer's own access token. `fetchImpl`
// defaults to the global fetch; tests pass a stub. The token is sent only to `base` and never printed.
export async function fetch7shifts({ token, companyId, from, to, base = "https://api.7shifts.com", fetchImpl = globalThis.fetch, maxPages = 50 }) {
  if (!token) throw new Error("Set SEVENSHIFTS_ACCESS_TOKEN to an access token from your own 7shifts account (7shifts API documentation: access tokens).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) throw new Error("--from and --to take dates like 2026-11-02.");
  const get = async (path, params = {}) => {
    const out = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page++) {
      const u = new URL(path, base);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      u.searchParams.set("limit", "500");
      if (cursor) u.searchParams.set("cursor", cursor);
      const res = await fetchImpl(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`7shifts answered ${res.status} for ${u.pathname}${res.status === 401 ? " (check the access token)" : res.status === 403 ? " (the token lacks permission for this company)" : ""}.`);
      const body = await res.json();
      out.push(body);
      cursor = body?.meta?.cursor?.next || null;
      if (!cursor) return out;
    }
    throw new Error(`More than ${maxPages} pages from ${path}: pick a shorter date range.`);
  };
  let company = companyId;
  if (!company) {
    const [c] = await get("/v2/companies");
    const list = c?.data || [];
    if (list.length !== 1) throw new Error(`The token reaches ${list.length} companies: set SEVENSHIFTS_COMPANY_ID to one of ${list.map((x) => x.id).join(", ")}.`);
    company = list[0].id;
  }
  const root = `/v2/company/${encodeURIComponent(company)}`;
  // `to` is a whole day: shifts starting up to its last minute (the API filters on UTC; a day either side of the
  // range is fetched and the wall-clock dates are what the importer counts).
  const pad = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().replace(/\.\d+Z$/, "Z");
  const shifts = await get(`${root}/shifts`, { "start[gte]": pad(from, -1), "start[lte]": pad(to, 2) });
  const roles = await get(`${root}/roles`);
  const locations = await get(`${root}/locations`);
  return { responses: [...shifts, ...roles, ...locations], from, to };
}

// Keep only the shifts whose wall-clock start date is inside [from, to] (the fetch above asks for a day either side).
export function within(inputs, from, to, timeZone) {
  const got = collect(inputs);
  const locs = new Map(got.locations.map((l) => [String(l.id), l]));
  const keep = got.shifts.filter((s) => {
    const tz = timeZone || locs.get(String(s?.location_id))?.timezone || "UTC";
    const a = wallClock(s?.start, validZone(tz) ? tz : "UTC");
    return a && a.date >= from && a.date <= to;
  });
  return [{ object: "shifts", data: keep }, { object: "roles", data: got.roles }, { object: "locations", data: got.locations }];
}
