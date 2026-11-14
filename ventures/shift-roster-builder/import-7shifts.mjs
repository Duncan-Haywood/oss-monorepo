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
      // API request parameters (not page state): built as one query string for the 7shifts request.
      const query = new URLSearchParams({ ...params, limit: "500", ...(cursor ? { cursor } : {}) });
      const request = path + "?" + query;
      const u = new URL(request, base);
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

// ---------------------------------------------------------------------------------------------------------------------
// The team from 7shifts (2026-11-14): people, their roles, their locations and what each role pays, as staff lines with
// "sites:" and "wage at <location>:" cells, so a multi-site build prices each shift at the rate that person is paid there.
// From the same API definition (2023-05-01):
//   GET /v2/company/{company_id}/users                      -> { object: "users", data: [{ id, first_name, last_name,
//        preferred_first_name, active, type, appear_as_employee, max_weekly_hours, hourly_wage (cents), wage_type }] }
//   GET /v2/company/{company_id}/users/{user_id}/assignments -> { object: "assignments", data: { locations: [{ id, name }],
//        departments: [...], roles: [{ id, location_id, department_id, name }] } }
//   GET /v2/company/{company_id}/users/{user_id}/wages       -> { object: "user_wages", data: { current_wages: [{ role_id
//        (null = the person's default), wage_type "hourly" | "weekly_salary", wage_cents, effective_date }],
//        upcoming_wages: [...] } }
// 7shifts pays by role, and every role belongs to one location, so a person's rate at a location is what their roles
// there pay. Neither per-user response names the user, so fetch7shiftsStaff adds `user_id` to each one it saves; a saved
// response without it cannot be matched to a person and is reported.
const PER_USER = ["assignments", "user_wages", "role_assignments", "location_assignments"];
function collectStaff(inputs) {
  const out = { users: [], roles: [], locations: [], perUser: new Map(), untagged: 0, unread: 0 };
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
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string" || (x && typeof x === "object" && !Array.isArray(x) && ("data" in x || "object" in x)))) { for (const x of v) visit(x); return; }
    if (v && typeof v === "object" && !Array.isArray(v) && PER_USER.includes(v.object)) {
      if (v.user_id == null) { out.untagged++; return; }
      const k = String(v.user_id);
      if (!out.perUser.has(k)) out.perUser.set(k, {});
      out.perUser.get(k)[v.object] = v.data;
      return;
    }
    const rows = Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : null;
    if (!rows) { out.unread++; return; }
    const named = !Array.isArray(v) && typeof v?.object === "string" ? v.object : "";
    const r = rows.find((x) => x && typeof x === "object") || {};
    const kind = ["users", "roles", "locations"].includes(named) ? named
      : "first_name" in r || "last_name" in r ? "users" : "timezone" in r ? "locations" : "name" in r && "location_id" in r ? "roles" : "";
    if (kind) out[kind].push(...rows); else out.unread++;
  };
  visit(inputs);
  return out;
}

const cents = (c) => Math.round(Number(c)) / 100;
const cellName = (s) => String(s || "").replace(/[,;\t|/&+:]/g, " ").replace(/\s+/g, " ").trim();
const money2 = (x) => String(Math.round(x * 100) / 100);

// The wages in force on `asOf` (YYYY-MM-DD; default: the current wages as 7shifts sent them): per role id ("" = the
// person's default), the latest effective entry not after asOf.
function wagesOn(w, asOf) {
  const all = [...(w?.current_wages || []), ...(asOf ? (w?.upcoming_wages || []) : [])];
  const best = new Map();
  for (const x of all) {
    if (!x || typeof x !== "object") continue;
    if (asOf && String(x.effective_date || "") > asOf) continue;
    const k = x.role_id == null ? "" : String(x.role_id);
    const b = best.get(k);
    if (!b || String(x.effective_date || "") >= String(b.effective_date || "")) best.set(k, x);
  }
  return best;
}

// inputs: JSON text or parsed responses, as collectStaff reads them. opts.asOf: apply upcoming wages effective by this
// date (the week you are planning). opts.location: keep only people assigned to this location (name or id).
// Returns { staffText, rows, notes, skipped, counts }.
export function import7shiftsStaff(inputs, opts = {}) {
  const got = collectStaff(inputs);
  const notes = [], skipped = [];
  const counts = { users: got.users.length, inactive: 0, notScheduled: 0, salaried: 0, ownRates: 0, multiSite: 0, noWages: 0, splitRates: 0, upcoming: 0 };
  if (opts.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(opts.asOf)) return { staffText: "", rows: 0, notes: [`"${opts.asOf}" is not a date like 2026-11-16.`], skipped, counts };
  if (!got.users.length) return { staffText: "", rows: 0, notes: [got.perUser.size || got.untagged ? "No 7shifts users found: add the response of GET /v2/company/{company_id}/users." : "No 7shifts users found in that JSON. Save the response of GET /v2/company/{company_id}/users (its rows have first_name and last_name)."], skipped, counts };
  const roleById = new Map(got.roles.map((r) => [String(r.id), r]));
  const locById = new Map(got.locations.map((l) => [String(l.id), cellName(l.name)]));
  for (const pu of got.perUser.values()) {
    for (const l of pu.assignments?.locations || []) if (l?.id != null && l.name && !locById.has(String(l.id))) locById.set(String(l.id), cellName(l.name));
    for (const r of pu.assignments?.roles || []) if (r?.id != null && !roleById.has(String(r.id))) roleById.set(String(r.id), r);
  }
  const locName = (id) => locById.get(String(id)) || `location ${id}`;
  let keepLoc = null;
  if (opts.location != null && opts.location !== "") {
    const want = String(opts.location).toLowerCase();
    keepLoc = [...locById].find(([id, n]) => id === want || n.toLowerCase() === want)?.[0] ?? null;
    if (keepLoc === null) return { staffText: "", rows: 0, notes: [`No location "${opts.location}": the responses name ${[...new Set(locById.values())].join(", ") || "none"}.`], skipped, counts };
  }
  const companySites = new Set();
  const people = [];
  const names = new Map();
  for (const u of got.users) {
    if (!u || typeof u !== "object") continue;
    const name0 = cellName(`${u.preferred_first_name || u.first_name || ""} ${u.preferred_last_name || u.last_name || ""}`);
    const where = `User ${u.id ?? "?"}${name0 ? ` (${name0})` : ""}`;
    if (!name0) { skipped.push(`${where}: no name`); continue; }
    if (u.active === false) { counts.inactive++; continue; }
    if (u.type && u.type !== "employee" && u.appear_as_employee === false) { counts.notScheduled++; continue; }
    const pu = got.perUser.get(String(u.id)) || {};
    const asg = pu.assignments || {};
    const roleList = (asg.roles || pu.role_assignments?.map((r) => ({ id: r.role_id, location_id: r.location_id, name: r.name })) || []).filter(Boolean);
    let locIds = (asg.locations || pu.location_assignments?.map((l) => ({ id: l.location_id, name: l.name })) || []).map((l) => String(l.id));
    if (!locIds.length) locIds = [...new Set(roleList.map((r) => r.location_id).filter((x) => x != null).map(String))];
    if (keepLoc !== null && !locIds.includes(keepLoc)) continue;
    for (const id of locIds) companySites.add(id);
    const wages = wagesOn(pu.user_wages, opts.asOf);
    if (opts.asOf) for (const x of wages.values()) if ((pu.user_wages?.upcoming_wages || []).includes(x)) counts.upcoming++;
    if (!pu.user_wages) counts.noWages++;
    const hourly = [...wages.values()].filter((x) => x.wage_type !== "weekly_salary");
    const salaried = wages.size > 0 && hourly.length === 0 || (!wages.size && u.wage_type === "weekly_salary");
    // The person's own wage: their default (role-less) hourly wage, else the users row's hourly_wage, else the most
    // common of their role rates (ties to the lowest).
    let base = null;
    const def = wages.get("");
    if (def && def.wage_type !== "weekly_salary") base = cents(def.wage_cents);
    else if (!salaried && Number(u.hourly_wage) > 0) base = cents(u.hourly_wage);
    else if (hourly.length) {
      const c = new Map();
      for (const x of hourly) c.set(cents(x.wage_cents), (c.get(cents(x.wage_cents)) || 0) + 1);
      base = [...c].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    }
    if (salaried) counts.salaried++;
    if (base === null) base = 0;
    // Per location: the rates of this person's roles there. Several roles at one location at different rates cannot all
    // be one "wage at" cell (the builder has one rate per person per site): the highest is written, so the plan does not
    // understate payroll, and the count is reported.
    const atLoc = new Map();
    for (const [rid, x] of wages) {
      if (!rid || x.wage_type === "weekly_salary") continue;
      const role = roleById.get(rid);
      if (!role || role.location_id == null) continue;
      const k = String(role.location_id);
      if (!atLoc.has(k)) atLoc.set(k, []);
      atLoc.get(k).push(cents(x.wage_cents));
      if (!locIds.includes(k)) locIds.push(k);
    }
    const cells = [];
    for (const [k, rates] of atLoc) {
      if (keepLoc !== null && k !== keepLoc) continue;
      if (new Set(rates).size > 1) counts.splitRates++;
      const r = Math.max(...rates);
      if (Math.abs(r - base) > 1e-9) cells.push(`wage at ${locName(k)}: ${money2(r)}`);
    }
    counts.ownRates += cells.length;
    const here = keepLoc !== null && atLoc.has(keepLoc) ? Math.max(...atLoc.get(keepLoc)) : null;
    let name = name0;
    if (names.has(name.toLowerCase())) { name = cellName(`${name0} ${u.employee_id || u.id}`); skipped.push(`${where}: a second person with this name is listed as "${name}"`); }
    names.set(name.toLowerCase(), true);
    const roleNames = [];
    for (const r of roleList) {
      if (keepLoc !== null && String(r.location_id) !== keepLoc) continue;
      const n = cellName(r.name || roleById.get(String(r.id))?.name || "");
      if (n && !roleNames.some((x) => x.toLowerCase() === n.toLowerCase())) roleNames.push(n);
    }
    const maxH = Number(u.max_weekly_hours) > 0 && Number(u.max_weekly_hours) <= 168 ? Number(u.max_weekly_hours) : 40;
    if (locIds.length > 1) counts.multiSite++;
    people.push({ name, base: here ?? base, maxH, roleNames, locIds: keepLoc !== null ? [keepLoc] : locIds, cells });
  }
  const many = keepLoc === null && (companySites.size > 1 || got.locations.length > 1);
  const out = ["name, wage, max hours, min hours, availability"];
  for (const p of people) {
    const tail = [];
    if (p.roleNames.length) tail.push(`role: ${p.roleNames.slice(0, 4).join("/")}`);
    if (many && p.locIds.length) tail.push(`sites: ${p.locIds.map(locName).join(" | ")}`);
    out.push([p.name, money2(p.base), p.maxH, 0, "any", ...tail, ...(keepLoc !== null ? [] : p.cells)].join(", "));
  }
  const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  notes.push(`Read ${plural(people.length, "person")} from 7shifts${keepLoc !== null ? ` at ${locName(keepLoc)}` : ""}.`);
  if (counts.inactive) notes.push(`${plural(counts.inactive, "deactivated user")} left out.`);
  if (counts.notScheduled) notes.push(`${plural(counts.notScheduled, "manager")} not set to appear as employees left out.`);
  if (many) notes.push(`${counts.multiSite} of ${people.length} work at more than one location; each sites: cell lists where 7shifts assigns them.`);
  if (counts.ownRates) notes.push(`${plural(counts.ownRates, '"wage at" cell')} written where a location's roles pay someone other than their own wage. A site's floor (--site-wage "City min 21.30") still applies on top.`);
  if (keepLoc !== null) notes.push(`Only ${locName(keepLoc)} is planned, so each wage is the person's rate there (their roles at ${locName(keepLoc)}), and no sites: or "wage at" cells are written.`);
  if (counts.splitRates) notes.push(`${counts.splitRates} person-location${counts.splitRates === 1 ? "" : "s"} with roles at different rates: the highest is used there, because this tool keeps one rate per person per site.`);
  if (counts.salaried) notes.push(`${plural(counts.salaried, "salaried person")} (weekly salary) at wage 0: their hours add nothing to the plan's payroll. Set a wage if overtime or a cost per hour applies.`);
  if (counts.noWages) notes.push(`${counts.noWages} of ${people.length + counts.inactive + counts.notScheduled} users have no wages response, so their users-row hourly wage (or 0) is used and no "wage at" cells are written for them.`);
  if (opts.asOf) notes.push(`Wages as of ${opts.asOf}${counts.upcoming ? `: ${plural(counts.upcoming, "upcoming wage")} already in force` : ""}.`);
  if (got.untagged) notes.push(`${got.untagged} saved assignments or wages response(s) carry no user_id, so they could not be matched to a person (the CLI's --fetch-7shifts-staff --save adds it).`);
  if (got.unread) notes.push(`${got.unread} JSON value(s) were not 7shifts users, roles, locations, assignments or wages and were ignored.`);
  notes.push("Availability is set to any: edit each line, or send the availability link.");
  return { staffText: out.join("\n"), rows: people.length, notes, skipped, counts };
}

// Fetch the team with the deployer's own access token: users (active), roles, locations, then each user's assignments
// and wages, each tagged with its user_id. That is two requests per person: maxUsers caps it.
export async function fetch7shiftsStaff({ token, companyId, base = "https://api.7shifts.com", fetchImpl = globalThis.fetch, maxPages = 50, maxUsers = 500 }) {
  if (!token) throw new Error("Set SEVENSHIFTS_ACCESS_TOKEN to an access token from your own 7shifts account (7shifts API documentation: access tokens).");
  const one = async (path, params = {}) => {
    // API request parameters (not page state), set on the request URL for 7shifts.
    const query = new URLSearchParams(params);
    const request = Object.keys(params).length ? path + "?" + query : path;
    const u = new URL(request, base);
    const res = await fetchImpl(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!res.ok) throw new Error(`7shifts answered ${res.status} for ${u.pathname}${res.status === 401 ? " (check the access token)" : res.status === 403 ? " (the token lacks permission for this company; wages need a manager-level token)" : ""}.`);
    return res.json();
  };
  const pages = async (path, params = {}) => {
    const out = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page++) {
      const body = await one(path, { ...params, limit: "500", ...(cursor ? { cursor } : {}) });
      out.push(body);
      cursor = body?.meta?.cursor?.next || null;
      if (!cursor) return out;
    }
    throw new Error(`More than ${maxPages} pages from ${path}.`);
  };
  let company = companyId;
  if (!company) {
    const [c] = await pages("/v2/companies");
    const list = c?.data || [];
    if (list.length !== 1) throw new Error(`The token reaches ${list.length} companies: set SEVENSHIFTS_COMPANY_ID to one of ${list.map((x) => x.id).join(", ")}.`);
    company = list[0].id;
  }
  const root = `/v2/company/${encodeURIComponent(company)}`;
  const users = await pages(`${root}/users`, { status: "active" });
  const roles = await pages(`${root}/roles`);
  const locations = await pages(`${root}/locations`);
  const ids = users.flatMap((p) => p?.data || []).map((u) => u?.id).filter((x) => x != null);
  if (ids.length > maxUsers) throw new Error(`${ids.length} users is more than ${maxUsers}; filter by location in 7shifts or raise maxUsers.`);
  const perUser = [];
  for (const id of ids) {
    const a = await one(`${root}/users/${encodeURIComponent(id)}/assignments`);
    const w = await one(`${root}/users/${encodeURIComponent(id)}/wages`);
    perUser.push({ ...a, user_id: id }, { ...w, user_id: id });
  }
  return { responses: [...users, ...roles, ...locations, ...perUser] };
}
