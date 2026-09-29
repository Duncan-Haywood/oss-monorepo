// Lead-source ROI for home-service pros (Thumbtack, Angi, HomeAdvisor, Google
// Local Services, Yelp, Facebook ads, referrals, or your own log): reads a lead
// log CSV and shows cost per lead, close rate, cost per booked job, revenue and
// profit per source, service and month, plus which sources lose money. Column
// names are matched by alias because every platform and every owner's sheet
// names them differently; no real platform export was available when this was
// written. Pure functions, no DOM, no network.

export const DEFAULT_MARGIN_PCT = 35;
export const MIN_GROUP_LEADS = 5;

const ALIASES = {
  date: ["lead date", "date received", "date of lead", "request date", "received", "received on", "lead created", "created at", "created", "contact date", "date", "sent", "submitted"],
  source: ["lead source", "source", "platform", "channel", "network", "provider", "vendor", "marketplace", "origin"],
  cost: ["lead cost", "cost per lead", "lead price", "lead fee", "lead charge", "amount charged", "charge", "spend", "cost", "price", "amount", "fee"],
  credit: ["refund amount", "credit amount", "refunded", "refund", "credited", "credit", "lead credit"],
  status: ["lead status", "outcome", "result", "disposition", "stage", "status"],
  revenue: ["job value", "booked value", "job revenue", "job total", "won value", "amount won", "contract value", "sale amount", "quote amount", "invoiced", "invoice", "revenue", "value"],
  service: ["service type", "job type", "job category", "service", "category", "project", "trade"],
  id: ["lead id", "request id", "customer name", "customer", "contact", "phone", "email", "name", "id"],
};

export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

export function detectDelimiter(text) {
  const head = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const n = (c) => head.split(c).length - 1;
  const best = [["\t", n("\t")], [";", n(";")], [",", n(",")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d, rest = "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
    rest = m[4];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let hh = 0, mm = 0, hasTime = false;
  const tm = rest.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (tm) {
    hh = +tm[1]; mm = +tm[2]; hasTime = true;
    const ap = tm[3] ? tm[3][0].toLowerCase() : "";
    if (ap === "p" && hh < 12) hh += 12;
    if (ap === "a" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
  }
  const t = Date.UTC(y, mo - 1, d, hh, mm);
  return new Date(t).getUTCDate() === d ? { t, hasTime } : null;
}

export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}
function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

const DAY = 86400000;
const r2 = (n) => Math.round(n * 100) / 100;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(0);

// What a status cell means. "bad" leads are ones the platform is commonly asked to
// credit (spam, wrong number, out of area, duplicate); whether it does is the
// platform's policy and is not modelled here.
export function classifyStatus(raw) {
  const s = norm(raw);
  if (!s) return "open";
  if (/spam|invalid|fake|wrong (number|area)|bad (lead|number)|out of (area|service)|outside|duplicate|not a real|disconnected|no such/.test(s)) return "bad";
  if (/lost|declin|not interested|went with|chose|passed|cancel|no show|no-show|too expensive|ghost|no response|unanswered|no contact|unreach|not hired/.test(s)) return "lost";
  if (/won|booked|hired|closed|complete|paid|sold|scheduled|awarded|accepted|job done|invoiced/.test(s)) return "won";
  return "open";
}

// Returns { items, skipped, columns, dmy, statusMode, error }. An item is
// { line, t, source, service, id, cost, credit, net, outcome, revenue } where
// net is what the lead cost after any credit or refund.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { items: [], skipped: [], columns: {}, dmy: false, statusMode: "none" };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.date !== undefined && c.source !== undefined && c.cost !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Date”, “Source” (or “Platform”) and “Lead Cost” (or “Cost”), plus ideally “Status”, “Job Value” (or “Revenue”), “Service” and “Refund”. Copy your leads from Thumbtack, Angi, Google Local Services or your own sheet into a table with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const statusMode = cols.status !== undefined ? "column" : cols.revenue !== undefined ? "revenue" : "none";
  if (statusMode === "none") return { ...empty, columns: cols, dmy, error: "The file has no Status column and no Job Value column, so there is no way to tell which leads became jobs. Add a Status (won, lost, open …) or a Job Value column." };
  const items = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const when = parseWhen(get(line, "date"), dmy);
    if (!when) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    const source = get(line, "source");
    if (!source) { skipped.push({ line: lineNo, reason: "no source" }); continue; }
    const cost = isBlank(get(line, "cost")) ? 0 : parseNumber(get(line, "cost"), decimalComma);
    if (!Number.isFinite(cost)) { skipped.push({ line: lineNo, reason: "cost not readable" }); continue; }
    const creditRaw = get(line, "credit");
    const credit = isBlank(creditRaw) ? 0 : Math.abs(parseNumber(creditRaw, decimalComma));
    const revRaw = get(line, "revenue");
    const revNum = isBlank(revRaw) ? null : parseNumber(revRaw, decimalComma);
    if (revNum !== null && !Number.isFinite(revNum)) { skipped.push({ line: lineNo, reason: "job value not readable" }); continue; }
    const revenue = revNum !== null && revNum > 0 ? revNum : null;
    let outcome = statusMode === "column" ? classifyStatus(get(line, "status")) : revenue !== null ? "won" : "open";
    // A job value on a row whose status says lost is a data error, not a win; the
    // status column is trusted and the row is flagged in the findings.
    const conflict = statusMode === "column" && revenue !== null && outcome !== "won";
    if (statusMode === "column" && outcome === "open" && revenue !== null) outcome = "won";
    const abs = Math.abs(cost);
    items.push({ line: lineNo, t: when.t, source, service: get(line, "service"), id: get(line, "id"), cost: r2(abs), credit: r2(Math.min(credit, abs)), net: r2(abs - Math.min(credit, abs)), outcome, revenue: outcome === "won" ? revenue : null, conflict });
  }
  if (!items.length) return { ...empty, skipped, columns: cols, dmy, statusMode, error: "No leads could be read from the file. " + (skipped.length ? `${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "") };
  return { items, skipped, columns: cols, dmy, statusMode };
}

function rollup(label, list, margin) {
  const leads = list.length;
  const spend = list.reduce((s, x) => s + x.net, 0);
  const credits = list.reduce((s, x) => s + x.credit, 0);
  const won = list.filter((x) => x.outcome === "won");
  const withRev = won.filter((x) => x.revenue !== null);
  const revenue = withRev.reduce((s, x) => s + x.revenue, 0);
  const avgJob = withRev.length ? revenue / withRev.length : null;
  const costPerLead = leads ? spend / leads : null;
  const grossProfit = revenue * margin;
  return {
    label, leads, spend: r2(spend), credits: r2(credits), costPerLead,
    won: won.length, wonNoValue: won.length - withRev.length, closeRate: leads ? won.length / leads : null,
    costPerWon: won.length ? spend / won.length : null,
    revenue: r2(revenue), avgJob, revenuePerSpend: spend > 0 ? revenue / spend : null,
    profit: r2(grossProfit - spend),
    // Close rate at which this source's average job just repays its lead cost.
    breakEvenClose: avgJob && margin > 0 && costPerLead !== null ? costPerLead / (avgJob * margin) : null,
    open: list.filter((x) => x.outcome === "open").length, bad: list.filter((x) => x.outcome === "bad").length,
  };
}

const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

// items: normalizeRows(...).items. marginPct is your gross margin on a job, before
// lead cost; it is an assumption the page labels as one.
export function analyze(rawItems, { marginPct = DEFAULT_MARGIN_PCT, from = null, to = null, minGroupLeads = MIN_GROUP_LEADS } = {}) {
  const margin = Math.min(Math.max(marginPct, 0), 100) / 100;
  const items = rawItems.filter((x) => (from === null || x.t >= from) && (to === null || x.t < to + DAY)).map((x) => ({ ...x, sourceLabel: x.source, serviceLabel: x.service || "(no service)" }));
  if (!items.length) return { invalid: "No leads fall inside the date range you chose." };
  const group = (keyFn, sortFn) => {
    const m = new Map();
    for (const x of items) { const k = keyFn(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); }
    return [...m].map(([k, list]) => rollup(k, list, margin)).sort(sortFn);
  };
  const byProfit = (a, b) => (b.profit - a.profit) || (b.leads - a.leads);
  const bySource = group((x) => x.sourceLabel, byProfit);
  const byService = group((x) => x.serviceLabel, byProfit);
  const byMonth = group((x) => monthKey(x.t), (a, b) => (a.label < b.label ? -1 : 1));
  const total = rollup("All", items, margin);
  const paid = (g) => g.spend > 0;
  const enough = (g) => g.leads >= minGroupLeads;

  const losing = bySource.filter((g) => enough(g) && paid(g) && g.profit < 0 && g.won > 0);
  const zeroWon = bySource.filter((g) => enough(g) && paid(g) && g.won === 0 && g.open < g.leads * 0.5);
  const rankable = bySource.filter((g) => enough(g) && paid(g) && g.won >= 2 && g.costPerWon !== null);
  const bestSource = [...rankable].sort((a, b) => a.costPerWon - b.costPerWon)[0] ?? null;
  const worstSource = [...rankable].sort((a, b) => b.costPerWon - a.costPerWon)[0] ?? null;
  const belowBreakEven = bySource.filter((g) => enough(g) && paid(g) && g.breakEvenClose !== null && g.closeRate < g.breakEvenClose && g.won > 0);

  const bad = items.filter((x) => x.outcome === "bad");
  const badUncredited = bad.filter((x) => x.net > 0);
  const badSpend = badUncredited.reduce((s, x) => s + x.net, 0);
  const seen = new Map(), dupes = [];
  for (const x of items) {
    if (!x.id || x.net <= 0) continue;
    const k = [norm(x.source), norm(x.id), monthKey(x.t)].join("|");
    if (seen.has(k)) dupes.push(x); else seen.set(k, x);
  }
  const dupSpend = dupes.reduce((s, x) => s + x.net, 0);
  const wonNoValue = total.wonNoValue;
  const conflicts = items.filter((x) => x.conflict);
  const openShare = total.leads ? total.open / total.leads : 0;

  const findings = [];
  if (losing.length) findings.push({ severity: "high", title: `Sources that cost more than the jobs they brought paid you: ${losing.map((g) => g.label).join(", ")}`, detail: losing.map((g) => `${g.label}: ${usd(g.spend)} spent, ${g.won} job(s) worth ${usd(g.revenue)}, about ${usd(g.revenue * margin)} of gross profit at a ${(margin * 100).toFixed(0)}% margin, so ${usd(g.profit)} after lead cost`).join("; ") + `. A source needs at least ${minGroupLeads} leads to be named. The margin is an assumption you can change.` });
  if (zeroWon.length) findings.push({ severity: "high", title: `Paid leads that never became a job: ${zeroWon.map((g) => g.label).join(", ")}`, detail: zeroWon.map((g) => `${g.label}: ${usd(g.spend)} on ${g.leads} leads, none booked`).join("; ") + ". Sources where more than half the leads are still open are not named, since their outcome is not known yet." });
  if (belowBreakEven.length) findings.push({ severity: "medium", title: `Closing below break-even: ${belowBreakEven.map((g) => g.label).join(", ")}`, detail: belowBreakEven.map((g) => `${g.label}: you close ${(g.closeRate * 100).toFixed(0)}% and would need ${(g.breakEvenClose * 100).toFixed(0)}% for the average job (${usd(g.avgJob)}) to repay a ${usd(g.costPerLead)} lead at a ${(margin * 100).toFixed(0)}% margin`).join("; ") + "." });
  if (bestSource && worstSource && bestSource.label !== worstSource.label && worstSource.costPerWon >= bestSource.costPerWon * 1.5) findings.push({ severity: "info", title: `A booked job costs ${usd(worstSource.costPerWon)} from ${worstSource.label} and ${usd(bestSource.costPerWon)} from ${bestSource.label}`, detail: `Cost per booked job is lead spend divided by jobs won, counting the leads that went nowhere. It is the number to compare across sources, not cost per lead.` });
  if (badUncredited.length) findings.push({ severity: "medium", title: `${badUncredited.length} lead${badUncredited.length === 1 ? "" : "s"} marked spam, wrong number, duplicate or out of area were charged and not credited`, detail: `${usd(badSpend)} in total. Many platforms credit some of these on request within a time limit; whether yours does is its policy and is not modelled here. Check the rules before disputing.` });
  if (dupes.length) findings.push({ severity: "medium", title: `${dupes.length} lead${dupes.length === 1 ? "" : "s"} charged more than once to the same contact in the same month`, detail: `${usd(dupSpend)} in repeat charges on ${new Set(dupes.map((x) => norm(x.id))).size} contact(s). A repeat request from the same customer is sometimes a real second lead; look at them before assuming a mistake.` });
  if (wonNoValue) findings.push({ severity: "medium", title: `${wonNoValue} won job${wonNoValue === 1 ? "" : "s"} have no job value`, detail: "Revenue, return on spend and profit leave them out, so they are understated. Add the job value for each." });
  if (conflicts.length) findings.push({ severity: "info", title: `${conflicts.length} row${conflicts.length === 1 ? "" : "s"} carry a job value but a status that is not won`, detail: "The status is trusted and the job value on those rows is ignored." });
  if (openShare >= 0.25) findings.push({ severity: "info", title: `${(openShare * 100).toFixed(0)}% of leads have no outcome yet`, detail: "Close rates and cost per booked job are worse than they will turn out to be until those are resolved. Recent months are the most affected." });

  return {
    items, bySource, byService, byMonth, findings, losing, zeroWon, bestSource, worstSource,
    summary: { ...total, from: Math.min(...items.map((x) => x.t)), to: Math.max(...items.map((x) => x.t)), sources: bySource.length, margin, badUncredited: badUncredited.length, badSpend: r2(badSpend), dupes: dupes.length, dupSpend: r2(dupSpend) },
  };
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Plain text for pasting into a note, a message to a partner or a forum post.
export function summaryText(r) {
  const s = r.summary;
  const m = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(0) : "n/a");
  const lines = [
    `Lead sources ${dateStr(s.from)} to ${dateStr(s.to)}: ${s.leads} leads from ${s.sources} source(s), ${m(s.spend)} spent, ${s.won} booked (${pct(s.closeRate)} close rate)`,
    `Job value ${m(s.revenue)}, profit ${m(s.profit)} after lead cost at an assumed ${(s.margin * 100).toFixed(0)}% job margin` + (s.costPerWon !== null ? `, ${m(s.costPerWon)} per booked job` : ""),
  ];
  for (const g of r.bySource.slice(0, 6)) lines.push(`  ${g.label}: ${g.leads} leads, ${m(g.spend)}, ${g.won} booked${g.costPerWon !== null ? ` at ${m(g.costPerWon)} each` : ""}, profit ${m(g.profit)}`);
  if (r.losing.length) lines.push(`Losing money after lead cost: ${r.losing.map((g) => `${g.label} (${m(g.profit)})`).join("; ")}`);
  if (r.zeroWon.length) lines.push(`Paid leads with no booked job: ${r.zeroWon.map((g) => `${g.label} (${m(g.spend)})`).join("; ")}`);
  lines.push("Made with the Home Service Lead ROI Analyzer (nothing uploaded). Estimates from the file supplied.");
  return lines.join("\n");
}

// Synthetic, invented leads for the "Load an example" button. Not a real business.
export function sampleCsv() {
  const lines = ["Lead ID,Date,Source,Service,Lead Cost,Status,Job Value,Refund"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const sources = [
    { name: "Thumbtack", cost: [28, 60], close: 0.14, job: [400, 1800] },
    { name: "Angi", cost: [35, 75], close: 0.09, job: [500, 2400] },
    { name: "Google Local Services", cost: [22, 48], close: 0.32, job: [450, 2200] },
    { name: "Facebook ads", cost: [12, 20], close: 0.06, job: [300, 1200] },
    { name: "Referral", cost: [0, 0], close: 0.6, job: [600, 2600] },
  ];
  const services = ["Water heater", "Drain cleaning", "Repipe", "Fixture install"];
  let n = 0;
  for (let i = 0; i < 90; i++) {
    const s = sources[i % sources.length];
    const cost = Math.round(s.cost[0] + rnd() * (s.cost[1] - s.cost[0]));
    const r = rnd();
    let status = "Open", job = "", refund = "";
    if (r < s.close) { status = "Booked"; job = String(Math.round(s.job[0] + rnd() * (s.job[1] - s.job[0]))); }
    else if (r < s.close + 0.07 && cost > 0) { status = i % 2 ? "Spam" : "Wrong number"; if (i % 4 === 0) refund = String(cost); }
    else if (r < 0.9) status = "Lost";
    const sold = Date.UTC(2026, 5 + Math.floor(i / 30), 1 + ((i * 3) % 27));
    lines.push([`L-${1000 + n++}`, dateStr(sold), s.name, services[i % services.length], cost.toFixed(2), status, job, refund].join(","));
  }
  return lines.join("\n");
}
