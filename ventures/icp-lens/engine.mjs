// ICP Lens engine: learn who your best customers are from your own won/lost list, then rank a prospect list by
// lookalike fit. Pure functions, no dependencies, runs in a browser tab and in Node.
//
// Model: naive Bayes over bucketed columns with Laplace smoothing. Each column value contributes a log likelihood
// ratio (how much more common it is among wins than losses); a row's score is the sum plus the prior. It is a ranking,
// not a probability, and the page says so. It is checked by leave-one-out on your labelled rows (AUC and top-fifth
// lift), so a profile that does not separate your wins from your losses is reported as such instead of being shown.

export const POSITIVE = new Set(["won", "win", "closed won", "customer", "client", "paid", "yes", "true", "1", "converted", "active"]);
export const NEGATIVE = new Set(["lost", "loss", "closed lost", "no", "false", "0", "churned", "disqualified", "unqualified", "bad fit"]);
const LABEL_NAMES = ["won", "outcome", "status", "customer", "is_customer", "result", "stage", "converted", "label"];
const SKIP_NAMES = /^(id|uuid|name|company|company_name|account|account_name|email|e-mail|phone|url|website|domain|linkedin|notes?|description|first_?name|last_?name|contact|address)$/i;
export const MIN_PER_CLASS = 8;

/** RFC 4180-ish CSV (also accepts tabs from a spreadsheet paste). -> string[][] */
export function parseCsv(text) {
  text = String(text ?? "").replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const sep = first.includes("\t") && !first.includes(",") ? "\t" : ",";
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === "") q = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

const num = (s) => { if (s == null) return NaN; const t = String(s).replace(/[$€£,\s]/g, "").replace(/%$/, ""); return t !== "" && /^-?\d*\.?\d+(e-?\d+)?$/i.test(t) ? Number(t) : NaN; };

/** Which column holds the won/lost outcome? Returns an index or -1. A column qualifies only if it has recognisable labels. */
export function detectLabel(headers, rows) {
  let best = -1, bestScore = 0;
  headers.forEach((h, c) => {
    const vals = rows.map((r) => (r[c] ?? "").toLowerCase());
    const known = vals.filter((v) => POSITIVE.has(v) || NEGATIVE.has(v)).length;
    const pos = vals.filter((v) => POSITIVE.has(v)).length, neg = vals.filter((v) => NEGATIVE.has(v)).length;
    if (!pos || !neg) return;
    const nameBonus = LABEL_NAMES.includes(h.toLowerCase()) ? 0.5 : 0;
    const s = known / Math.max(1, rows.length) + nameBonus;
    if (s > bestScore) { best = c; bestScore = s; }
  });
  return best;
}

const label = (s) => { const v = String(s ?? "").trim().toLowerCase(); return POSITIVE.has(v) ? 1 : NEGATIVE.has(v) ? 0 : null; };

function quantileEdges(vals, bins = 4) {
  const s = vals.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length < 8) return [];
  const edges = [];
  for (let k = 1; k < bins; k++) { const e = s[Math.floor((k * s.length) / bins)]; if (!edges.length || e > edges[edges.length - 1]) edges.push(e); }
  return edges;
}
const fmt = (x) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString("en-US") : String(Math.round(x * 100) / 100));
function bucketOf(x, edges) {
  if (!Number.isFinite(x)) return "(blank)";
  let k = 0; while (k < edges.length && x >= edges[k]) k++;
  return k === 0 ? `under ${fmt(edges[0])}` : k === edges.length ? `${fmt(edges[k - 1])} and over` : `${fmt(edges[k - 1])} to ${fmt(edges[k])}`;
}

/**
 * Turn a parsed table into labelled/unlabelled examples with one bucket per usable column.
 * Dropped columns are reported with a reason so nothing disappears silently.
 */
export function prepare(table, opts = {}) {
  if (table.length < 2) throw new Error("Paste a header row and at least a few rows.");
  const headers = table[0].map((h, i) => h || `column ${i + 1}`), body = table.slice(1);
  const lc = opts.labelColumn != null ? (typeof opts.labelColumn === "number" ? opts.labelColumn : headers.findIndex((h) => h.toLowerCase() === String(opts.labelColumn).toLowerCase())) : detectLabel(headers, body);
  const ignore = new Set((opts.ignore || []).map((s) => s.toLowerCase()));
  const nameCol = headers.findIndex((h) => /^(name|company|company_name|account|account_name)$/i.test(h));
  const features = [], dropped = [];
  headers.forEach((h, c) => {
    if (c === lc) return;
    if (ignore.has(h.toLowerCase())) { dropped.push({ column: h, reason: "ignored by you" }); return; }
    if (SKIP_NAMES.test(h)) { dropped.push({ column: h, reason: "identifier or free text, not a fit signal" }); return; }
    const raw = body.map((r) => r[c] ?? ""), filled = raw.filter((x) => x !== "");
    if (filled.length < Math.max(3, body.length * 0.3)) { dropped.push({ column: h, reason: "mostly blank" }); return; }
    const nums = filled.map(num), numeric = nums.filter(Number.isFinite).length >= filled.length * 0.8;
    if (numeric) { const edges = quantileEdges(raw.map(num)); if (!edges.length) { dropped.push({ column: h, reason: "too few distinct numbers to split" }); return; } features.push({ name: h, col: c, type: "number", edges }); return; }
    const distinct = new Set(filled.map((x) => x.toLowerCase())).size;
    if (distinct < 2) { dropped.push({ column: h, reason: "one value only" }); return; }
    if (distinct > Math.max(12, body.length * 0.4)) { dropped.push({ column: h, reason: `${distinct} different values, so it looks like an identifier` }); return; }
    features.push({ name: h, col: c, type: "category" });
  });
  const examples = body.map((r, i) => {
    const vals = {};
    for (const f of features) { const x = r[f.col] ?? ""; vals[f.name] = f.type === "number" ? bucketOf(num(x), f.edges) : x === "" ? "(blank)" : x.toLowerCase(); }
    return { row: i + 2, name: nameCol >= 0 ? r[nameCol] || `row ${i + 2}` : `row ${i + 2}`, y: lc >= 0 ? label(r[lc]) : null, vals, raw: r };
  });
  return { headers, features, dropped, examples, labelColumn: lc >= 0 ? headers[lc] : null };
}

/** Count bucket occurrences per class. */
export function fit(examples, features, alpha = 1) {
  const m = { alpha, pos: 0, neg: 0, counts: {}, k: {} };
  for (const f of features) { m.counts[f.name] = {}; }
  for (const e of examples) {
    if (e.y == null) continue;
    e.y ? m.pos++ : m.neg++;
    for (const f of features) { const c = (m.counts[f.name][e.vals[f.name]] ||= [0, 0]); c[e.y ? 0 : 1]++; }
  }
  for (const f of features) m.k[f.name] = Math.max(2, Object.keys(m.counts[f.name]).length + 1);
  return m;
}

function llr(m, f, v, held) {
  const c = m.counts[f][v] || [0, 0];
  let p = c[0], n = c[1], P = m.pos, N = m.neg;
  if (held) { P -= held.y ? 1 : 0; N -= held.y ? 0 : 1; if (held.y) p -= 1; else n -= 1; }
  const k = m.k[f], a = m.alpha;
  return Math.log((p + a) / (P + a * k)) - Math.log((n + a) / (N + a * k));
}

/** Score one example; `held` removes that labelled example from the counts (leave-one-out). */
export function score(m, features, e, held = null) {
  let s = Math.log(((held && held.y ? m.pos - 1 : m.pos) + 1) / ((held && !held.y ? m.neg - 1 : m.neg) + 1));
  const parts = [];
  for (const f of features) { const w = llr(m, f.name, e.vals[f.name], held); s += w; parts.push({ feature: f.name, value: e.vals[f.name], w }); }
  return { s, parts };
}

/** Mann-Whitney AUC with ties counted half. null when a class is empty. */
export function auc(pos, neg) {
  if (!pos.length || !neg.length) return null;
  let w = 0;
  for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0;
  return w / (pos.length * neg.length);
}

/** Leave-one-out check on the labelled rows. */
export function validate(m, features, examples) {
  const lab = examples.filter((e) => e.y != null);
  const sc = lab.map((e) => ({ y: e.y, s: score(m, features, e, e).s }));
  const a = auc(sc.filter((x) => x.y).map((x) => x.s), sc.filter((x) => !x.y).map((x) => x.s));
  const top = [...sc].sort((x, y) => y.s - x.s).slice(0, Math.max(1, Math.ceil(sc.length / 5)));
  const base = sc.filter((x) => x.y).length / sc.length, topRate = top.filter((x) => x.y).length / top.length;
  return { n: sc.length, auc: a, base, topFifthWinRate: topRate, lift: base ? topRate / base : null };
}

const words = (p) => {
  const x = Math.exp(Math.abs(p.w));
  const times = x >= 10 ? "10x+" : `${x.toFixed(1)}x`;
  return p.w >= 0 ? `${p.feature} = ${p.value} (${times} more common among wins)` : `${p.feature} = ${p.value} (${times} more common among losses)`;
};

/** The profile of a good customer: for each column, the values over-represented among wins. */
export function profile(m, features) {
  const out = [];
  for (const f of features) for (const [v, [p, n]] of Object.entries(m.counts[f.name])) {
    if (p + n < 3 || v === "(blank)") continue;
    const winShare = p / Math.max(1, m.pos), allShare = (p + n) / Math.max(1, m.pos + m.neg);
    out.push({ feature: f.name, value: v, wins: p, total: p + n, winRate: p / (p + n), lift: winShare / allShare });
  }
  return out.sort((a, b) => b.lift - a.lift || b.total - a.total);
}

/**
 * The whole job: CSV text -> ranked prospects, the winner profile and an honest accuracy reading.
 * Rows with a won/lost label train the model; rows with no label are the prospects to rank.
 */
export function analyze(text, opts = {}) {
  const prep = prepare(parseCsv(text), opts);
  const { features, examples } = prep;
  const lab = examples.filter((e) => e.y != null), prospects = examples.filter((e) => e.y == null);
  const pos = lab.filter((e) => e.y).length, neg = lab.length - pos;
  const out = { labelColumn: prep.labelColumn, features: features.map((f) => f.name), dropped: prep.dropped, wins: pos, losses: neg, prospects: [], profile: [], validation: null, learned: false, note: "" };
  if (!features.length) { out.note = "No usable columns were left to learn from. Add columns such as industry, size, country or source."; return out; }
  if (prep.labelColumn == null) { out.note = "No won/lost column found. Add a column (for example status) with won/lost values on your past deals and leave it blank on prospects."; return out; }
  if (pos < MIN_PER_CLASS || neg < MIN_PER_CLASS) {
    out.note = `Need at least ${MIN_PER_CLASS} won and ${MIN_PER_CLASS} lost rows to learn a profile; you have ${pos} won and ${neg} lost. Below that a model would only echo a few lucky accounts. Use the manual rules instead.`;
    return out;
  }
  const m = fit(examples, features);
  out.learned = true;
  out.validation = validate(m, features, examples);
  const v = out.validation;
  out.reliable = v.auc != null && v.auc >= 0.6;
  out.note = out.reliable ? "" : `Leave-one-out AUC is ${v.auc == null ? "n/a" : v.auc.toFixed(2)}, barely better than a coin flip (0.50): your columns do not separate wins from losses, so treat the ranking below as noise and add columns that describe the customer.`;
  out.profile = profile(m, features).filter((p) => p.lift > 1.2).slice(0, 12);
  const scored = prospects.map((e) => { const r = score(m, features, e); return { e, ...r }; }).sort((a, b) => b.s - a.s);
  scored.forEach((x, i) => {
    const pct = scored.length > 1 ? 1 - i / (scored.length - 1) : 1;
    const parts = [...x.parts].sort((a, b) => b.w - a.w);
    out.prospects.push({
      row: x.e.row, name: x.e.name, rank: i + 1, fit: Math.round(pct * 100), tier: pct >= 0.8 ? "A" : pct >= 0.5 ? "B" : "C",
      because: parts.filter((p) => p.w > 0.25).slice(0, 3).map(words),
      against: parts.filter((p) => p.w < -0.25).reverse().slice(0, 2).map(words),
      raw: x.e.raw,
    });
  });
  return out;
}

/**
 * Manual ICP for when there is no history: one rule per line, e.g.
 *   employees >= 20 | employees <= 200 | industry in saas, fintech | country != RU
 * A row's score is the share of rules it meets. Blank values meet no rule.
 */
export function parseRules(text) {
  const rules = [], errors = [];
  for (const line of String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(.+?)\s*(>=|<=|!=|=|>|<|\bnot in\b|\bin\b)\s*(.+)$/i);
    if (!m) { errors.push(`Cannot read rule: ${line}`); continue; }
    const op = m[2].toLowerCase(), list = m[3].split(/[,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (["in", "not in"].includes(op) && !list.length) { errors.push(`Rule has no values: ${line}`); continue; }
    if ([">", "<", ">=", "<="].includes(op) && !Number.isFinite(num(m[3]))) { errors.push(`Rule needs a number: ${line}`); continue; }
    rules.push({ column: m[1].trim(), op, value: m[3].trim(), list, text: line });
  }
  return { rules, errors };
}

export function applyRules(text, rulesText) {
  const table = parseCsv(text), headers = table[0] || [], body = table.slice(1);
  const { rules, errors } = parseRules(rulesText);
  for (const r of rules) { r.c = headers.findIndex((h) => h.toLowerCase() === r.column.toLowerCase()); if (r.c < 0) errors.push(`No column named "${r.column}" for rule: ${r.text}`); }
  const live = rules.filter((r) => r.c >= 0), nameCol = headers.findIndex((h) => /^(name|company|company_name|account|account_name)$/i.test(h));
  const meets = (r, raw) => {
    const x = (raw ?? "").trim(); if (x === "") return false;
    const lx = x.toLowerCase();
    switch (r.op) {
      case "in": return r.list.includes(lx);
      case "not in": return !r.list.includes(lx);
      case "=": return lx === r.value.toLowerCase() || (Number.isFinite(num(x)) && num(x) === num(r.value));
      case "!=": return lx !== r.value.toLowerCase();
      default: { const a = num(x), b = num(r.value); if (!Number.isFinite(a)) return false; return r.op === ">" ? a > b : r.op === "<" ? a < b : r.op === ">=" ? a >= b : a <= b; }
    }
  };
  const rows = body.map((raw, i) => {
    const hit = live.filter((r) => meets(r, raw[r.c])), miss = live.filter((r) => !hit.includes(r));
    return { row: i + 2, name: nameCol >= 0 ? raw[nameCol] || `row ${i + 2}` : `row ${i + 2}`, fit: live.length ? Math.round((hit.length / live.length) * 100) : 0, met: hit.map((r) => r.text), missed: miss.map((r) => r.text), raw };
  }).sort((a, b) => b.fit - a.fit);
  rows.forEach((r, i) => { r.rank = i + 1; r.tier = r.fit >= 80 ? "A" : r.fit >= 50 ? "B" : "C"; });
  return { rules: live.map((r) => r.text), errors, prospects: rows };
}

/** Deterministic synthetic list for the demo button. Not real companies. */
export function syntheticCsv(seed = 7, n = 160) {
  let s = seed >>> 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const lines = ["name,industry,employees,country,source,status"];
  for (let i = 1; i <= n; i++) {
    const industry = pick(["saas", "saas", "fintech", "agency", "retail", "manufacturing"]);
    const emp = Math.round(10 + rnd() ** 2 * 400), source = pick(["referral", "outbound", "webinar", "inbound", "inbound"]);
    const country = pick(["US", "US", "US", "UK", "DE", "BR"]);
    let p = 0.12 + (["saas", "fintech"].includes(industry) ? 0.28 : 0) + (emp >= 25 && emp <= 150 ? 0.22 : 0) + (source === "referral" ? 0.2 : 0) - (country === "BR" ? 0.08 : 0);
    p = Math.min(0.9, Math.max(0.03, p));
    const status = i > n - 30 ? "" : rnd() < p ? "won" : "lost";
    lines.push(`Sample Co ${i},${industry},${emp},${country},${source},${status}`);
  }
  return lines.join("\n");
}
