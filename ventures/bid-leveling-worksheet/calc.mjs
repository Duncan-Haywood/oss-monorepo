// Bid leveling: put subcontractor bids on the same scope before comparing prices.
// Pure arithmetic over the table the user pastes; nothing here is a recommendation.

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export function parseMoney(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t);
  const n = Number(t.replace(/[()$,\s-]/g, ""));
  return Number.isFinite(n) && /\d/.test(t) ? (neg ? -n : n) : null;
}

const INCLUDED = /^(incl(uded|\.)?|inc|yes|y|✓|in base|by others? included)$/i;
const EXCLUDED = /^(excl(uded|\.)?|exc|no|n|nic|by (others?|owner|gc)|not included)$/i;
const UNKNOWN = /^(\?|n\/a|na|tbd|unclear|not addressed|silent|-|—)$/i;
const BASE_ROW = /^(base( bid| price)?|lump sum|total bid|bid( total| price)?)$/i;

export function classifyCell(raw) {
  const t = String(raw ?? "").trim();
  if (!t || UNKNOWN.test(t)) return { kind: "unknown" };
  if (INCLUDED.test(t)) return { kind: "included" };
  if (EXCLUDED.test(t)) return { kind: "excluded" };
  const m = parseMoney(t);
  if (m !== null) return { kind: "priced", amount: m };
  return { kind: "unreadable", text: t };
}

// Table: header `item,estimate,Bidder A,Bidder B...`; one row named BASE; one row per scope item.
export function parseBids(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: "Need a header row and at least a BASE row." };
  const header = rows[0].map((h) => h.trim());
  if (header.length < 4) return { error: "Header must be: item, estimate, then at least two bidder names." };
  const bidders = header.slice(2).map((name, i) => name || `Bidder ${i + 1}`);
  let base = null;
  const items = [], warnings = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r], label = (row[0] || "").trim();
    if (!label) continue;
    if (BASE_ROW.test(label)) {
      base = bidders.map((_, i) => parseMoney(row[i + 2]));
      continue;
    }
    const est = parseMoney(row[1]);
    items.push({ item: label, estimate: est, cells: bidders.map((_, i) => classifyCell(row[i + 2])), line: r + 1 });
  }
  if (!base) return { error: "No BASE row found. Add a row whose first cell is BASE with each bidder's lump-sum price." };
  base.forEach((b, i) => { if (b === null || b <= 0) warnings.push(`${bidders[i]} has no readable base price; it is left out of the ranking.`); });
  return { bidders, base, items, warnings };
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function level(parsed, opts = {}) {
  const unknownWeight = Number.isFinite(opts.unknownWeight) ? Math.max(0, opts.unknownWeight) : 1;
  const outlierPct = Number.isFinite(opts.outlierPct) ? opts.outlierPct : 15;
  const warnings = [...(parsed.warnings || [])];
  const missingEstimate = new Set();

  const bidders = parsed.bidders.map((name, bi) => {
    const base = parsed.base[bi];
    const adds = [];
    let addTotal = 0, unknownCount = 0, excludedCount = 0, unreadable = 0;
    for (const it of parsed.items) {
      const c = it.cells[bi];
      if (c.kind === "included") continue;
      if (c.kind === "unreadable") { unreadable++; adds.push({ item: it.item, kind: "unreadable", amount: 0, note: c.text }); continue; }
      if (c.kind === "priced") { adds.push({ item: it.item, kind: "priced", amount: c.amount }); addTotal += c.amount; continue; }
      const weight = c.kind === "unknown" ? unknownWeight : 1;
      if (it.estimate === null) missingEstimate.add(it.item);
      const amount = (it.estimate ?? 0) * weight;
      if (c.kind === "unknown") unknownCount++; else excludedCount++;
      adds.push({ item: it.item, kind: c.kind, amount: r2(amount) });
      addTotal += amount;
    }
    const valid = base !== null && base > 0;
    return { name, base: valid ? base : null, adds, addTotal: r2(addTotal), leveled: valid ? r2(base + addTotal) : null, excludedCount, unknownCount, unreadable, flags: [] };
  });

  const ranked = bidders.filter((b) => b.leveled !== null);
  if (!ranked.length) return { error: "No bidder has a readable base price." };
  const medBase = median(ranked.map((b) => b.base));
  const lowBase = [...ranked].sort((a, b) => a.base - b.base)[0];
  const lowLeveled = [...ranked].sort((a, b) => a.leveled - b.leveled)[0];
  [...ranked].sort((a, b) => a.leveled - b.leveled).forEach((b, i) => { b.rank = i + 1; b.vsLowLeveled = r2(b.leveled - lowLeveled.leveled); });
  for (const b of ranked) {
    if (ranked.length >= 3 && b.base < medBase * (1 - outlierPct / 100)) b.flags.push(`Base is ${(100 * (1 - b.base / medBase)).toFixed(0)}% under the median bid; check for missing scope or a misread drawing.`);
    if (b.unknownCount) b.flags.push(`${b.unknownCount} item(s) not addressed; get written confirmation before awarding.`);
    if (b.unreadable) b.flags.push(`${b.unreadable} cell(s) could not be read and add nothing.`);
  }
  for (const n of missingEstimate) warnings.push(`"${n}" has no estimate, so excluded or unaddressed cells on that row add $0 and leveled totals may be understated.`);

  const advice = [];
  if (lowBase.name !== lowLeveled.name) {
    const l = ranked.find((b) => b.name === lowBase.name);
    advice.push(`The lowest base bid (${lowBase.name}) is not the lowest once scope is leveled: it is $${r2(l.leveled - lowLeveled.leveled).toLocaleString("en-US")} above ${lowLeveled.name}.`);
  } else advice.push(`${lowLeveled.name} is lowest both before and after leveling.`);
  const second = [...ranked].sort((a, b) => a.leveled - b.leveled)[1];
  if (second) advice.push(`Leveled spread from lowest to highest is ${(100 * ((Math.max(...ranked.map((b) => b.leveled)) / lowLeveled.leveled) - 1)).toFixed(1)}%; the gap between first and second is $${r2(second.leveled - lowLeveled.leveled).toLocaleString("en-US")}.`);

  const itemCoverage = parsed.items.map((it) => ({
    item: it.item, estimate: it.estimate,
    included: it.cells.filter((c) => c.kind === "included").length,
    excluded: it.cells.filter((c) => c.kind === "excluded").length,
    unknown: it.cells.filter((c) => c.kind === "unknown").length,
    priced: it.cells.filter((c) => c.kind === "priced").length,
  }));
  return { bidders, ranked: ranked.sort((a, b) => a.rank - b.rank), summary: { lowBase: lowBase.name, lowLeveled: lowLeveled.name, medianBase: medBase, rankChanged: lowBase.name !== lowLeveled.name }, itemCoverage, advice, warnings };
}

export function sampleCsv() {
  return [
    "item,estimate,Apex Mechanical,Brightline HVAC,Cole & Sons",
    "BASE,,412000,368500,439000",
    "Controls and BAS integration,22000,incl,excl,incl",
    "Test and balance,9500,incl,excl,excl",
    "Permit fees,6000,excl,incl,incl",
    "Crane and rigging,14000,incl,?,incl",
    "Insulation of ductwork,18500,incl,excl,incl",
    "Overtime / night work,0,incl,incl,incl",
    "Performance bond,12400,incl,incl,12400",
  ].join("\n");
}

export function toCsv(result) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const lines = ["rank,bidder,base,adds,leveled,vs_low_leveled"];
  for (const b of result.ranked) lines.push([b.rank, q(b.name), b.base, b.addTotal, b.leveled, b.vsLowLeveled].join(","));
  return lines.join("\n") + "\n";
}

export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
