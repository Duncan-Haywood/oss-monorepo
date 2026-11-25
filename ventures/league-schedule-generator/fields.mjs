// League schedule generator, fields.mjs: the small text-field readers and plan helpers that the season
// builder and the multi-division builder share (CSV rows, name and time lists, court closures, relabelling a
// round robin, the forfeit count). Split out of schedule.mjs on 2026-11-23 so divisions.mjs, and the
// multi-division page with it, stop fetching the carry-over search and the night designs that schedule.mjs
// imports (eval/page-weight.txt). schedule.mjs and calc.mjs re-export every name.

import { parseTime, parseDateList, dateOrder, MIXED_ORDER } from "./dates.mjs";

/** Splits CSV text into rows of cells (quotes, doubled quotes, commas and newlines inside quotes; a BOM is dropped). */
export function csvRows(text) {
  const rows = []; let row = [], cell = "", q = false;
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/**
 * Lines like "Field 2: 2026-11-03, 2026-11-10 to 2026-11-17": dates a court or field is not available
 * (booked by someone else, closed for maintenance). Court names match case-insensitively when `courts`
 * is known. Returns { closures: { courtName: [days] }, errors }.
 */
export function parseCourtClosures(text, courts = null) {
  const closures = {};
  const errors = [];
  const order = dateOrder(text);
  if (order.mixed) errors.push(MIXED_ORDER);
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*(?::|\bis closed\b|\bclosed\b|\bunavailable\b)\s*(.+)$/i);
    if (!m || !m[1].trim()) { errors.push(`Line ${i + 1}: write the court, a colon, then the dates it is closed (Field 2: 2026-11-05).`); continue; }
    const name = m[1].trim();
    const hit = courts ? courts.find((x) => x.toLowerCase() === name.toLowerCase()) : name;
    if (!hit) { errors.push(`Line ${i + 1}: "${name}" is not one of the courts.`); continue; }
    const { days, errors: e } = parseDateList(m[2], order.order ?? null);
    for (const x of e) errors.push(`Line ${i + 1}: ${x}`);
    if (days.length) closures[hit] = [...new Set([...(closures[hit] || []), ...days])].sort((a, b) => a - b);
  }
  return { closures, errors };
}

/** True when `court` is listed as closed on `day` in a schedule config. */
export function courtClosedOn(cfg, court, day) {
  return ((cfg.courtClosures || {})[court] || []).includes(day);
}

export function parseNameList(text) {
  return [...new Set(String(text ?? "").split(/[\n,;]+/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

export function parseTimes(text) {
  const times = [];
  const errors = [];
  for (const raw of parseNameList(text)) {
    const t = parseTime(raw);
    if (t === null) errors.push(`"${raw}" is not a time. Use 18:00 or 6:30pm.`);
    else if (!times.includes(t)) times.push(t);
  }
  return { times, errors };
}

/** The plan with team t renamed perm[t] everywhere (pairings, venues and byes); an isomorphic round robin. */
export function relabelPlan(plan, perm) {
  return plan.map((r) => ({ ...r, matches: r.matches.map(([h, a, ...rest]) => [perm[h], perm[a], ...rest]), bye: r.bye === null || r.bye === undefined ? r.bye : perm[r.bye], ...(r.sitOut ? { sitOut: r.sitOut.map((t) => perm[t]) } : {}) }));
}

/**
 * Forfeit report: how many games each team has lost by walkover (the results box's
 * "Hawks w/o Owls"), so an organiser sees who keeps not turning up. A team with `limit`
 * or more (default 2) is flagged, since many leagues drop a side after two forfeits.
 * Returns { rows: [{ team, forfeits }] (most first, only teams with one or more), flagged: [team names] }.
 */
export function forfeitReport(teams, results, { limit = 2 } = {}) {
  const n = teams.map(() => 0);
  for (const r of results) {
    if (!r.walkover) continue;
    const loser = r.ga > r.gb ? r.b : r.gb > r.ga ? r.a : null;
    if (loser !== null && loser !== undefined && n[loser] !== undefined) n[loser]++;
  }
  const rows = teams.map((team, i) => ({ team, forfeits: n[i] })).filter((x) => x.forfeits > 0).sort((x, y) => y.forfeits - x.forfeits);
  return { rows, flagged: rows.filter((x) => x.forfeits >= limit).map((x) => x.team) };
}
