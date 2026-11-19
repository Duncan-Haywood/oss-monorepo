// Switching from Deputy without a CSV: read the rostered shifts straight from Deputy's resource API and turn them into
// this tool's shift-requirement lines, the same way `import-shifts.mjs` reads a published-schedule export.
//
// Deputy's own API reference was not reachable from the session that wrote this (developer.deputy.com and
// www.deputy.com/api-doc did not answer). The request and field shapes come from two open-source clients instead
// (read 2026-11-17; see eval/deputy-api-format-2026-11-17.md):
//   - communityds/deputy-api-wrapper (MIT): its schema registry (Roster StartTime/EndTime are Unix timestamps), its
//     Roster and OperationalUnit models, and the Roster and OperationalUnit responses its mock client answers with;
//   - google/deputy-api-python-client (Apache-2.0): its Query body ({ search, join, start, max: 500 }, 500 rows a page)
//     and its headers (Authorization: OAuth <token>), against https://<install>.<region>.deputy.com/api/v1/.
//   POST /api/v1/resource/Roster/QUERY           -> [ roster ]   (a bare list; a roster is one shift)
//   POST /api/v1/resource/OperationalUnit/QUERY  -> [ { Id, OperationalUnitName, Company, CompanyName, ... } ]
//   POST /api/v1/resource/Company/QUERY          -> [ { Id, CompanyName, ... } ]
// A roster's `StartTime`/`EndTime` are Unix seconds; `StartTimeLocalized`/`EndTimeLocalized` (when present) and `Date`
// are ISO 8601 with the site's offset written in ("2018-01-01T09:00:00+10:30"), so their digits are the wall clock a
// manager rostered. `OperationalUnit` is the area (Deputy's "Area Name" in its CSV export, read as the role); the
// area's `Company` is the location. `Employee: 0` or `Open: true` is an open shift, still needed; `Published: false` is
// a draft. `Mealbreak` (time after midnight = break length) is not read: a needed shift is its start to its end.
//
// Nothing here needs a server: the page reads saved JSON responses; the CLI can also fetch them with the deployer's
// own token (fetchDeputy). No Deputy account or real Deputy response was used to build or test this.
import { importShiftsCsv } from "./import-shifts.mjs";
import { readWiwTime } from "./import-wheniwork.mjs";

const pad2 = (n) => String(n).padStart(2, "0");
const isRoster = (x) => x && typeof x === "object" && !Array.isArray(x) && ("StartTime" in x || "StartTimeLocalized" in x) && ("EndTime" in x || "EndTimeLocalized" in x);
const isUnit = (x) => x && typeof x === "object" && "OperationalUnitName" in x;
const isCompany = (x) => x && typeof x === "object" && "CompanyName" in x && !("OperationalUnitName" in x) && !isRoster(x);

function collect(inputs) {
  const out = { rosters: [], units: [], companies: [], errors: [], unread: 0 };
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
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    if (!v || typeof v !== "object") { out.unread++; return; }
    if (isRoster(v)) out.rosters.push(v);
    else if (isUnit(v)) out.units.push(v);
    else if (isCompany(v)) out.companies.push(v);
    else if (v.error) out.errors.push(String(v.error?.message || v.error).slice(0, 200));
    else out.unread++;
  };
  visit(inputs);
  return out;
}

// True when the JSON texts look like Deputy resource responses (capitalised StartTime as a number, or an area list).
export function looksLikeDeputy(texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  return list.some((t) => /"StartTime"\s*:\s*\d/.test(String(t)) || /"StartTimeLocalized"\s*:/.test(String(t)) || /"OperationalUnitName"\s*:/.test(String(t)));
}

const fmtCache = new Map();
function zoneClock(ms, tz) {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); fmtCache.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, ms };
}
const validZone = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
const offsetOf = (iso) => { const m = /([+-])(\d{2}):?(\d{2})$/.exec(String(iso || "").trim()); return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : null; };
const unixMs = (v) => (typeof v === "number" || (typeof v === "string" && /^\d{9,11}$/.test(v)) ? +v * 1000 : null);

// One end of a roster on the wall clock, best source first: the localized ISO time; the Unix time with a time zone
// the caller names; the Unix time with the offset of the roster's own `Date`; the Unix time in UTC (flagged).
function readEnd(r, which, tz) {
  const loc = r[which + "TimeLocalized"];
  if (typeof loc === "string" && loc) { const a = readWiwTime(loc); if (a) return { ...a, how: "localized" }; }
  const ms = unixMs(r[which + "Time"]);
  if (ms == null) return null;
  if (tz) return { ...zoneClock(ms, tz), how: "zone" };
  const off = offsetOf(r.Date);
  if (off != null) {
    const d = new Date(ms + off * 60000);
    return { date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`, time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`, ms, how: "date-offset" };
  }
  return { ...zoneClock(ms, "UTC"), how: "utc" };
}

const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

// inputs: see collect(). opts.location: a location (company) name or id to keep; opts.drafts: false to leave out
// unpublished rosters; opts.timeZone: an IANA zone for rosters that carry only Unix times. Returns importShiftsCsv's
// result plus `counts`.
export function importDeputy(inputs, opts = {}) {
  const got = collect(inputs);
  const counts = { rosters: got.rosters.length, drafts: 0, draftsLeftOut: 0, open: 0, utc: 0, dateOffset: 0 };
  const fail = (msg) => ({ shiftsText: "", rows: 0, shifts: 0, notes: [msg], skipped: [], unknown: [], locations: [], families: [], counts });
  if (opts.timeZone && !validZone(opts.timeZone)) return fail(`"${opts.timeZone}" is not a time zone name (use one like Australia/Adelaide).`);
  if (!got.rosters.length) {
    if (got.errors.length) return fail(`Deputy answered with an error: ${got.errors[0]}`);
    return fail(got.unread || got.units.length || got.companies.length
      ? "No Deputy rosters found in that JSON. Save the response of POST /api/v1/resource/Roster/QUERY (its rows have StartTime and EndTime)."
      : "Nothing to read: paste or choose the JSON from Deputy's resource/Roster/QUERY endpoint.");
  }
  const units = new Map(got.units.map((u) => [String(u.Id), u]));
  const companies = new Map(got.companies.map((c) => [String(c.Id), String(c.CompanyName || "").trim()]));
  const areaOf = (r) => {
    const o = r.OperationalUnitObject && typeof r.OperationalUnitObject === "object" ? r.OperationalUnitObject : null;
    const u = units.get(String(r.OperationalUnit ?? o?.Id ?? ""));
    const name = String(o?.OperationalUnitName || u?.OperationalUnitName || "").trim();
    const role = name || (r.OperationalUnit ? `area ${r.OperationalUnit}` : "");
    const compId = o?.Company ?? u?.Company;
    const loc = String(o?.CompanyName || u?.CompanyName || "").trim() || (compId != null && compId !== 0 ? companies.get(String(compId)) || `location ${compId}` : "");
    return { role, loc, compId };
  };
  const rows = ["Date,Start,End,Role,Location"];
  const skipped = [];
  const seen = new Set();
  const locIds = new Map();
  let dupes = 0;
  got.rosters.forEach((r, i) => {
    const id = r.Id ?? null;
    if (id != null) { if (seen.has(String(id))) { dupes++; return; } seen.add(String(id)); }
    if (r.Published === false) { counts.drafts++; if (opts.drafts === false) { counts.draftsLeftOut++; return; } }
    const label = `Roster ${id ?? i + 1}`;
    const a = readEnd(r, "Start", opts.timeZone);
    if (!a) { skipped.push(`${label}: could not read the start "${r.StartTimeLocalized ?? r.StartTime}"`); return; }
    const b = readEnd(r, "End", opts.timeZone);
    if (!b) { skipped.push(`${label}: could not read the end "${r.EndTimeLocalized ?? r.EndTime}"`); return; }
    const len = (b.ms - a.ms) / 60000;
    if (!(len > 0 && len < 1440)) { skipped.push(`${label}: ends ${len <= 0 ? "at or before its start" : "a day or more after its start"}`); return; }
    if (a.how === "utc") counts.utc++;
    if (a.how === "date-offset") counts.dateOffset++;
    if (r.Open === true || r.Employee === 0 || r.Employee === "0" || r.Employee == null) counts.open++;
    const { role, loc, compId } = areaOf(r);
    if (loc && compId != null) locIds.set(String(compId), loc);
    rows.push([a.date, a.time, b.time, q(role), q(loc)].join(","));
  });
  if (rows.length < 2) {
    const r = fail(`No rosters left to read${counts.draftsLeftOut ? `: ${counts.draftsLeftOut} unpublished left out` : ""}${skipped.length ? `, ${skipped.length} unreadable` : ""}.`);
    r.skipped = skipped;
    return r;
  }
  const r = importShiftsCsv(rows.join("\n"), { location: opts.location != null && locIds.has(String(opts.location)) ? locIds.get(String(opts.location)) : opts.location });
  const kept = r.notes.filter((n) => !/^Employee names were not used|^Columns not used/.test(n));
  const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const notes = [`Read ${plural(counts.rosters - dupes, "Deputy roster")}${dupes ? ` (${dupes} repeated across files counted once)` : ""}.`];
  if (counts.draftsLeftOut) notes.push(`${plural(counts.draftsLeftOut, "unpublished roster")} left out.`);
  else if (counts.drafts) notes.push(`${plural(counts.drafts, "unpublished roster")} read as planned shifts.`);
  if (counts.open) notes.push(`${plural(counts.open, "open shift")} with nobody on ${counts.open === 1 ? "it" : "them"} counted as needed.`);
  if (opts.timeZone) notes.push(`Rosters without a localized time read in ${opts.timeZone}.`);
  if (counts.dateOffset) notes.push(`${plural(counts.dateOffset, "roster")} had no localized time and ${counts.dateOffset === 1 ? "was" : "were"} read at the offset of ${counts.dateOffset === 1 ? "its" : "their"} Date (one hour off only for a shift that starts after a daylight-saving change on its own day).`);
  if (counts.utc) notes.push(`${plural(counts.utc, "roster")} carried only Unix times and ${counts.utc === 1 ? "was" : "were"} read in UTC: give the site's time zone (--tz) for local times.`);
  if (got.unread) notes.push(`${got.unread} JSON value(s) were not Deputy rosters, areas or locations and were ignored.`);
  if (!got.units.length && got.rosters.some((x) => x.OperationalUnit && !x.OperationalUnitObject?.OperationalUnitName)) notes.push("Areas are shown as numbers: add the areas response (resource/OperationalUnit/QUERY) or join OperationalUnitObject for their names.");
  return { ...r, notes: [...notes, ...kept], skipped: [...skipped, ...r.skipped], counts };
}

// "yourco.na.deputy.com", "https://yourco.au.deputy.com" or ".../api/v1/" -> "https://yourco.na.deputy.com/api/v1/".
// The token is sent only to a deputy.com host (or to `base` passed by a test).
export function deputyBase(install) {
  const s = String(install || "").trim().replace(/^https?:\/\//, "").replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.deputy\.com$/i.test(s)) return null;
  return `https://${s.toLowerCase()}/api/v1/`;
}

// POST resource/<name>/QUERY, paged by `start` until a short page (500 rows a page upstream). Shared by the roster and
// staff fetches; the token goes only to `root`.
export function deputyQuery({ token, root, fetchImpl = globalThis.fetch, pageSize = 500 }) {
  const headers = { Authorization: `OAuth ${token}`, "Content-Type": "application/json", Accept: "application/json", "dp-meta-option": "none" };
  return async (resource, search, join) => {
    const all = [];
    for (let start = 0; start < 200000; start += pageSize) {
      const u = new URL(`resource/${resource}/QUERY`, root);
      const body = JSON.stringify({ search, ...(join ? { join } : {}), start, max: pageSize });
      const res = await fetchImpl(u.toString(), { method: "POST", headers, body });
      if (!res.ok) throw new Error(`Deputy answered ${res.status} for ${u.pathname}${res.status === 401 ? " (check the token)" : res.status === 403 ? " (the token's user cannot read this)" : ""}.`);
      const page = await res.json();
      if (!Array.isArray(page)) throw new Error(`Deputy's ${resource} answer was not a list${page?.error ? `: ${String(page.error.message || page.error).slice(0, 120)}` : ""}.`);
      all.push(...page);
      if (page.length < pageSize) break;
    }
    return all;
  };
}

// Fetch the rosters (open and unpublished ones included) whose start is within a day of [from, to], with the areas and
// locations for names. `fetchImpl` defaults to the global fetch; tests pass a stub. The token goes only to the install's
// own host and is never printed.
export async function fetchDeputy({ token, install, base, from, to, fetchImpl = globalThis.fetch, pageSize = 500 }) {
  if (!token) throw new Error("Set DEPUTY_TOKEN to a permanent token or OAuth access token from your own Deputy install.");
  const root = base || deputyBase(install);
  if (!root) throw new Error('Set DEPUTY_INSTALL to your Deputy address, like "yourco.na.deputy.com".');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) throw new Error("--from and --to take dates like 2026-11-02.");
  if (to < from) throw new Error("--to is before --from.");
  const query = deputyQuery({ token, root, fetchImpl, pageSize });
  // A day either side by Unix time; the wall-clock dates are what count (within() below).
  const unix = (d, n) => Math.floor(Date.parse(d + "T00:00:00Z") / 1000) + n * 86400;
  const rosters = await query("Roster", { s1: { field: "StartTime", type: "ge", data: unix(from, -1) }, s2: { field: "StartTime", type: "le", data: unix(to, 2) } }, ["OperationalUnitObject"]);
  const areas = await query("OperationalUnit", { s1: { field: "Id", type: "ne", data: 0 } });
  const companies = await query("Company", { s1: { field: "Id", type: "ne", data: 0 } });
  return { responses: [rosters, areas, companies], from, to };
}

// Keep only the rosters whose wall-clock start date is inside [from, to].
export function within(inputs, from, to, timeZone) {
  const got = collect(inputs);
  const keep = got.rosters.filter((r) => { const a = readEnd(r, "Start", timeZone); return a && a.date >= from && a.date <= to; });
  return [keep, got.units, got.companies];
}
