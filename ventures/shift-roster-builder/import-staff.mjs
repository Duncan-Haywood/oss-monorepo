// Switching from a paid scheduler: turn a staff/employee CSV export into this tool's staff lines.
// Column names are matched by synonym (name or first + last, hourly rate, max/min weekly hours, position/role);
// the layouts of 7shifts, When I Work, Homebase, Deputy and Sling were written from memory, not from real
// exports, so unknown columns are listed and anything unreadable is skipped with a reason. Availability
// is not in most exports: people come in as "any" so you can edit them. Nothing leaves the browser.
//
// Per-location pay (2026-11-14): payroll and scheduler exports give a person's rate at each shop one of two ways, and
// both become this tool's "sites:" and "wage at <site>:" cells, so a multi-site build prices each shift at the rate that
// person is actually paid there:
//   long: one row per person per location (a Location / Site / Store column), each with that location's rate;
//   wide: one row per person with a column per location ("Wage at Airport", "Airport rate", "Rate (Airport)").
// A person's own wage (used for shifts with no site, and for paid travel) is the rate on most of their rows, ties to the
// lowest; a location paying the same gets no cell.

const SYN = {
  name: ["name", "employee", "employee name", "full name", "staff", "team member", "display name"],
  first: ["first name", "first", "firstname", "given name"],
  last: ["last name", "last", "lastname", "surname", "family name"],
  wage: ["hourly rate", "hourly wage", "wage", "pay rate", "rate", "hourly", "base rate", "default hourly rate", "wage rate"],
  maxH: ["max hours", "max hours per week", "maximum hours", "weekly hours limit", "weekly max hours", "hours limit", "max weekly hours", "weekly hours max"],
  minH: ["min hours", "min hours per week", "minimum hours", "weekly min hours", "target hours", "desired hours"],
  role: ["role", "roles", "position", "positions", "job", "job title", "title", "department"],
  status: ["status", "active", "employment status"],
  site: ["location", "locations", "site", "sites", "store", "stores", "shop", "shops", "branch", "work location", "location name", "store name", "site name", "outlet"],
};

// A wide per-location rate column: "Wage at Airport", "Rate @ Airport", "Pay rate - Airport", "Rate (Airport)", "Airport
// rate", "Airport hourly rate". Returns the site name as written, or null. Words that name a kind of pay rather than a place
// ("Overtime rate", "Base rate", "Sunday rate") are not sites.
const NOT_SITE = /^(base|default|hourly|regular|standard|normal|current|overtime|ot|double|double time|holiday|sunday|saturday|weekend|night|evening|shift|bill|billing|charge|tip|tips|commission|daily|weekly|annual|salary|piece|training|new|old|previous|pay|wage|minimum|min|max|maximum|bonus|premium|differential|diff)$/i;
export function siteRateColumn(raw) {
  const h = String(raw || "").replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
  const KIND = "(?:hourly (?:rate|wage)|pay rate|wage rate|wage|rate|pay)";
  let m = new RegExp(`^${KIND}\\s*(?:at|@|in|for|-|–|:)\\s*(.+)$`, "i").exec(h) || new RegExp(`^${KIND}\\s*\\((.+)\\)$`, "i").exec(h);
  if (!m) m = new RegExp(`^(.+?)\\s*(?:-|–|:)?\\s*${KIND}$`, "i").exec(h);
  if (!m) return null;
  const site = m[1].replace(/\s*\(\s*\$?\s*(?:\/\s*h(?:ou)?r?)?\s*\)\s*$/i, "").replace(/[()$]/g, " ").trim();
  if (!site || NOT_SITE.test(site) || /^(at|@|in|for)$/i.test(site) || /\b(rate|wage|pay|hours?)\b/i.test(site)) return null;
  return site;
}
// A site name safe inside a staff cell: no cell separators, no "|" "/" "&" "+" (they split a sites: list), no ":" (it ends
// the name in "wage at X:"). The builder matches sites with punctuation ignored, so "Main & 5th" still meets "site: Main & 5th".
const siteName = (s) => String(s || "").replace(/[,;\t|/&+:]/g, " ").replace(/\s+/g, " ").trim();
const money = (s) => { const v = String(s || "").replace(/[$£€\s]/g, "").replace(/\/h(r|our)?$/i, ""); return v === "" ? null : Number(v); };
const fmt = (x) => String(Math.round(x * 100) / 100);

export function splitCsvRow(line, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Split a CSV text into records. A quoted cell may hold a line break (Square's item export puts an item's
// description in its Notes cell, often over several lines: 14 of 50 rows in one real export), so a newline inside quotes
// does not end the row; it is kept as a space. A quote left open at the end falls back to one row per line. A bare "\r" before "\n" is dropped. A BOM at the start is dropped.
export function csvLines(text) {
  const s = String(text || "").replace(/^\uFEFF/, "");
  const out = []; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { q = !q; cur += ch; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      if (q) cur += " "; else { out.push(cur); cur = ""; }
    } else cur += ch;
  }
  if (cur !== "") out.push(cur);
  // A quote never closed (a stray inch mark) would swallow every row after it: read the file line by line instead.
  if (q) return s.split(/\r?\n/);
  return out;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s) => String(s || "").replace(/[,;\t]/g, " ").replace(/\s+/g, " ").trim();

export function importStaffCsv(text) {
  const lines = csvLines(text).filter((l) => l.trim());
  const notes = [], skipped = [];
  if (lines.length < 2) return { staffText: "", rows: 0, notes: ["Needs a header row and at least one person."], skipped, unknown: [] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const head = splitCsvRow(lines[0], sep).map(norm);
  const find = (key) => head.findIndex((h) => SYN[key].includes(h));
  const ix = Object.fromEntries(Object.keys(SYN).map((k) => [k, find(k)]));
  if (ix.name < 0 && ix.first < 0) return { staffText: "", rows: 0, notes: ["No name column found (looked for Name, Employee, First name + Last name)."], skipped, unknown: head };
  const wide = [];
  splitCsvRow(lines[0], sep).forEach((raw, i) => { if (Object.values(ix).includes(i)) return; const site = siteRateColumn(raw); if (site && siteName(site)) wide.push({ i, site: siteName(site) }); });
  if (ix.wage < 0 && !wide.length) notes.push("No hourly-rate column found: wages are set to 0. Fill them in before reading the payroll figures.");
  const used = new Set([...Object.values(ix).filter((i) => i >= 0), ...wide.map((w) => w.i)]);
  const unknown = head.filter((h, i) => h && !used.has(i));
  // One entry per person; with a location column, a person's later rows add a location and its rate instead of being
  // skipped as listed twice.
  const people = new Map();
  lines.slice(1).forEach((line, n) => {
    const c = splitCsvRow(line, sep), at = (i) => (i >= 0 ? c[i] || "" : "");
    const name = clean(ix.name >= 0 ? at(ix.name) : `${at(ix.first)} ${at(ix.last)}`);
    const where = `Row ${n + 2}${name ? ` (${name})` : ""}`;
    if (!name) return skipped.push(`${where}: no name`);
    const st = norm(at(ix.status));
    if (st && /^(inactive|terminated|archived|deactivated|former|false|no|0)$/.test(st)) return skipped.push(`${where}: status "${at(ix.status)}"`);
    const site = siteName(at(ix.site));
    const key = name.toLowerCase();
    const p = people.get(key);
    if (p && (!site || p.siteRates.has(site.toLowerCase()) || (!p.siteRates.size && !p.sites.size))) return skipped.push(`${where}: listed twice`);
    const wage = money(at(ix.wage));
    if (wage !== null && (!Number.isFinite(wage) || wage < 0)) return skipped.push(`${where}: rate "${at(ix.wage)}" is not a number`);
    const num = (i, d) => { const v = at(i).replace(/[^0-9.]/g, ""); return v === "" ? d : Number(v); };
    const roles = clean(at(ix.role)).split(/\s*[|/]\s*/).filter(Boolean);
    const q = p || { name, rates: [], siteRates: new Map(), sites: new Map(), wideRates: new Map(), maxH: null, minH: null, roles: [] };
    if (!p) people.set(key, q);
    if (q.maxH === null && at(ix.maxH).replace(/[^0-9.]/g, "") !== "") q.maxH = num(ix.maxH, 40);
    if (q.minH === null && at(ix.minH).replace(/[^0-9.]/g, "") !== "") q.minH = num(ix.minH, 0);
    for (const r of roles) if (!q.roles.some((x) => x.toLowerCase() === r.toLowerCase())) q.roles.push(r);
    if (wage !== null) q.rates.push(wage);
    // A location cell may list several ("Main | Harbour") in a one-row-per-person export.
    const listed = String(at(ix.site)).split(/\s*[|;/]\s*/).map(siteName).filter(Boolean);
    for (const s1 of listed) q.sites.set(s1.toLowerCase(), q.sites.get(s1.toLowerCase()) || s1);
    if (site && wage !== null && listed.length === 1) q.siteRates.set(site.toLowerCase(), { site, wage });
    for (const w of wide) {
      const raw = at(w.i).trim();
      if (!raw || /^(n\/?a|-|none)$/i.test(raw)) continue;
      const rel = /^([+-])\s*\$?\s*(\d+(?:\.\d+)?)\s*(%?)$/.exec(raw.replace(/\/h(r|our)?$/i, ""));
      const v = rel ? null : money(raw);
      if (!rel && !(Number.isFinite(v) && v >= 0)) { skipped.push(`${where}: "${raw}" under "${w.site}" is not a rate, so it was left out`); continue; }
      q.wideRates.set(w.site.toLowerCase(), { site: w.site, abs: rel ? null : v, rel: rel ? `${rel[1]}${rel[2]}${rel[3]}` : null });
    }
  });
  const out = ["name, wage, max hours, min hours, availability"];
  let cells = 0, mixed = 0;
  for (const q of people.values()) {
    // The person's own wage: the rate on most rows (ties to the lowest); with only wide columns, the lowest of them.
    let wage = 0;
    const pool = q.rates.length ? q.rates : [...q.wideRates.values()].filter((w) => w.abs !== null).map((w) => w.abs);
    if (pool.length) {
      const count = new Map();
      for (const r of pool) count.set(r, (count.get(r) || 0) + 1);
      wage = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    }
    if (q.rates.length && new Set(q.rates).size > 1) mixed++;
    const maxH = q.maxH ?? 40, minH = Math.min(q.minH ?? 0, maxH);
    const tail = [];
    if (q.roles.length) tail.push(`role: ${q.roles.slice(0, 4).join("/")}`);
    if (q.sites.size) tail.push(`sites: ${[...q.sites.values()].join(" | ")}`);
    const at = new Map();
    for (const [k, r] of q.siteRates) if (Math.abs(r.wage - wage) > 1e-9) at.set(k, `wage at ${r.site}: ${fmt(r.wage)}`);
    for (const [k, w] of q.wideRates) {
      if (at.has(k)) continue;
      if (w.rel) { if (!/^[+-]0+(\.0+)?%?$/.test(w.rel)) at.set(k, `wage at ${w.site}: ${w.rel}`); }
      else if (Math.abs(w.abs - wage) > 1e-9) at.set(k, `wage at ${w.site}: ${fmt(w.abs)}`);
    }
    cells += at.size;
    out.push([q.name, fmt(wage), maxH, minH, "any", ...tail, ...at.values()].join(", "));
  }
  if (unknown.length) notes.push(`Columns not used: ${unknown.join(", ")}.`);
  const multi = [...people.values()].filter((q) => q.siteRates.size > 1 || q.sites.size > 1).length;
  if (ix.site >= 0) notes.push(`Locations read from the ${splitCsvRow(lines[0], sep)[ix.site]} column: ${multi} ${multi === 1 ? "person works" : "people work"} at more than one; each person's sites: cell lists where they can be scheduled.`);
  if (wide.length) notes.push(`Rates by location read from ${wide.map((w) => `"${w.site}"`).join(", ")}.`);
  if (cells) notes.push(`${cells} "wage at" ${cells === 1 ? "cell" : "cells"} written where a location pays someone other than their own wage (their own wage is the rate on most of their rows, ties to the lowest). A site's floor (--site-wage "City min 21.30") still applies on top.`);
  else if (mixed) notes.push(`${mixed} ${mixed === 1 ? "person has" : "people have"} different rates on different rows but no location column, so their most common rate is used.`);
  notes.push("Availability is set to any: edit each line, or send the availability link.");
  return { staffText: out.join("\n"), rows: out.length - 1, notes, skipped, unknown };
}
