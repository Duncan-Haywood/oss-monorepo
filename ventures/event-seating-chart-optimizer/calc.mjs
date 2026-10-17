// Seating chart optimizer: assigns guests to tables so that wanted pairs sit
// together and avoided pairs do not, within table capacity and pinned seats.
// Pure functions, no I/O, deterministic for a given seed.

export const WEIGHTS = { want: 3, must: 12, party: 6, avoid: -6, never: -200 };

const SOFT_NEVER = -30;

export const DEFAULTS = { seatsPerTable: 8, tableCount: "", balance: true, seed: 1 };

/** Parse the guest box: one guest per line, "Name" or "Name | party". */
export function parseGuests(text) {
  const guests = [];
  const errors = [];
  const seen = new Map();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const [namePart, partyPart] = line.split("|");
    const name = namePart.trim().replace(/\s+/g, " ");
    const party = (partyPart || "").trim().replace(/\s+/g, " ");
    if (!name) { errors.push(`Guest line ${i + 1} has no name.`); return; }
    const key = name.toLowerCase();
    if (seen.has(key)) { errors.push(`"${name}" is listed twice (line ${seen.get(key)} and ${i + 1}); add a surname or initial to tell them apart.`); return; }
    seen.set(key, i + 1);
    guests.push({ name, party });
  });
  return { guests, errors };
}

const OP = /^(.*?)\s+(\+\+|\+|!!|!|@)\s+(.*)$/;

/** Parse the rule box: "A + B", "A ++ B", "A ! B", "A !! B", "A @ 3". */
export function parseRules(text, guests) {
  const index = new Map(guests.map((g, i) => [g.name.toLowerCase(), i]));
  const rules = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = OP.exec(line);
    if (!m) { errors.push(`Rule line ${i + 1} ("${line}") needs two names and one of + ++ ! !! @ between spaces.`); return; }
    const [, a, op, b] = m;
    const ai = index.get(a.trim().replace(/\s+/g, " ").toLowerCase());
    if (ai === undefined) { errors.push(`Rule line ${i + 1}: "${a.trim()}" is not in the guest list.`); return; }
    if (op === "@") {
      const t = Number(b.trim());
      if (!Number.isInteger(t) || t < 1) { errors.push(`Rule line ${i + 1}: "${b.trim()}" is not a table number.`); return; }
      rules.push({ kind: "pin", a: ai, table: t - 1, line: i + 1 });
      return;
    }
    const bi = index.get(b.trim().replace(/\s+/g, " ").toLowerCase());
    if (bi === undefined) { errors.push(`Rule line ${i + 1}: "${b.trim()}" is not in the guest list.`); return; }
    if (ai === bi) { errors.push(`Rule line ${i + 1}: a guest cannot be paired with themselves.`); return; }
    const kind = { "+": "want", "++": "must", "!": "avoid", "!!": "never" }[op];
    rules.push({ kind, a: ai, b: bi, weight: WEIGHTS[kind], line: i + 1 });
  });
  return { rules, errors };
}

export function tablesNeeded(n, seats) { return Math.ceil(n / seats); }

export function validateSpec(spec) {
  const errors = [];
  const n = spec.guests.length;
  if (n < 2) errors.push("Add at least two guests.");
  if (!Number.isInteger(spec.seatsPerTable) || spec.seatsPerTable < 1) errors.push("Seats per table must be a whole number of at least 1.");
  const T = resolveTableCount(spec);
  if (spec.tableCount !== "" && spec.tableCount != null && (!Number.isInteger(Number(spec.tableCount)) || Number(spec.tableCount) < 1)) errors.push("Number of tables must be a whole number of at least 1, or blank to use the fewest that fit.");
  if (n >= 1 && Number.isInteger(spec.seatsPerTable) && spec.seatsPerTable >= 1 && T * spec.seatsPerTable < n) errors.push(`${T} tables of ${spec.seatsPerTable} seat ${T * spec.seatsPerTable}, but there are ${n} guests.`);
  const cap = capacityPerTable(spec, T);
  const pinCount = new Array(T).fill(0);
  for (const r of spec.rules) {
    if (r.kind !== "pin") continue;
    if (r.table >= T) { errors.push(`${spec.guests[r.a].name} is pinned to table ${r.table + 1}, but there are only ${T} tables.`); continue; }
    pinCount[r.table]++;
  }
  pinCount.forEach((c, t) => { if (c > cap) errors.push(`Table ${t + 1} has ${c} pinned guests but holds ${cap}.`); });
  const pinned = new Map();
  for (const r of spec.rules) if (r.kind === "pin") {
    if (pinned.has(r.a) && pinned.get(r.a) !== r.table) errors.push(`${spec.guests[r.a].name} is pinned to two different tables.`);
    pinned.set(r.a, r.table);
  }
  return errors;
}

export function resolveTableCount(spec) {
  const n = spec.guests.length;
  const given = spec.tableCount === "" || spec.tableCount == null ? null : Number(spec.tableCount);
  const s = spec.seatsPerTable;
  if (given && Number.isInteger(given) && given >= 1) return given;
  return Math.max(1, tablesNeeded(Math.max(n, 1), Math.max(s, 1)));
}

/** Seats a table may use. With balance on, tables are filled evenly. */
export function capacityPerTable(spec, T = resolveTableCount(spec)) {
  const n = spec.guests.length;
  return spec.balance ? Math.min(spec.seatsPerTable, Math.ceil(n / T)) : spec.seatsPerTable;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Symmetric pair-weight matrix from rules and parties. */
export function weightMatrix(spec, neverWeight = WEIGHTS.never) {
  const n = spec.guests.length;
  const W = new Float64Array(n * n);
  const add = (i, j, w) => { W[i * n + j] += w; W[j * n + i] += w; };
  const byParty = new Map();
  spec.guests.forEach((g, i) => { if (g.party) { const k = g.party.toLowerCase(); (byParty.get(k) || byParty.set(k, []).get(k)).push(i); } });
  for (const members of byParty.values())
    for (let x = 0; x < members.length; x++) for (let y = x + 1; y < members.length; y++) add(members[x], members[y], WEIGHTS.party);
  for (const r of spec.rules) if (r.kind !== "pin") add(r.a, r.b, r.kind === "never" ? neverWeight : r.weight);
  return W;
}

export function planScore(W, n, table) {
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (table[i] === table[j]) s += W[i * n + j];
  return s;
}

function pinsOf(spec) {
  const pin = new Map();
  for (const r of spec.rules) if (r.kind === "pin") pin.set(r.a, r.table);
  return pin;
}

/** Seats guests in list order, filling table 1, then 2... (the do-nothing baseline). Pins honoured. */
export function baselinePlan(spec) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const cap = capacityPerTable(spec, T);
  const pin = pinsOf(spec);
  const table = new Array(n).fill(-1);
  const load = new Array(T).fill(0);
  for (const [g, t] of pin) { table[g] = t; load[t]++; }
  let t = 0;
  for (let g = 0; g < n; g++) {
    if (table[g] !== -1) continue;
    while (load[t] >= cap) t = (t + 1) % T;
    table[g] = t; load[t]++;
  }
  return table;
}

function anneal(spec, W, seed, iters) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const cap = capacityPerTable(spec, T);
  const pin = pinsOf(spec);
  const rnd = mulberry32(seed);
  const free = [];
  for (let g = 0; g < n; g++) if (!pin.has(g)) free.push(g);

  // random start that respects pins and capacity
  const table = new Array(n).fill(-1);
  const load = new Array(T).fill(0);
  for (const [g, t] of pin) { table[g] = t; load[t]++; }
  const order = free.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let tt = 0;
  for (const g of order) { while (load[tt] >= cap) tt = (tt + 1) % T; table[g] = tt; load[tt]++; }

  // A[g*T + t] = sum of W[g][h] over guests h (h != g) at table t
  const A = new Float64Array(n * T);
  for (let g = 0; g < n; g++) for (let h = 0; h < n; h++) if (h !== g) A[g * T + table[h]] += W[g * n + h];
  const move = (g, to) => {
    const from = table[g];
    for (let h = 0; h < n; h++) { const w = W[h * n + g]; if (w !== 0 && h !== g) { A[h * T + from] -= w; A[h * T + to] += w; } }
    table[g] = to; load[from]--; load[to]++;
  };
  const swap = (g1, g2) => {
    const a = table[g1], b = table[g2];
    for (let h = 0; h < n; h++) {
      if (h === g1 || h === g2) continue;
      const w1 = W[h * n + g1], w2 = W[h * n + g2];
      A[h * T + a] += w2 - w1; A[h * T + b] += w1 - w2;
    }
    // the two moved guests' own rows are recomputed exactly
    for (const g of [g1, g2]) { A.fill(0, g * T, g * T + T); }
    table[g1] = b; table[g2] = a;
    for (const g of [g1, g2]) for (let h = 0; h < n; h++) if (h !== g) A[g * T + table[h]] += W[g * n + h];
  };

  let score = 0;
  for (let g = 0; g < n; g++) score += A[g * T + table[g]];
  score /= 2;
  let best = score, bestTable = table.slice();
  if (free.length < 2) return { table: bestTable, score: best };

  let scale = 1;
  for (let i = 0; i < W.length; i++) { const a = Math.abs(W[i]); if (a > scale) scale = a; }
  const T0 = scale * 1.5, T1 = 0.02;
  for (let it = 0; it < iters; it++) {
    const temp = T0 * Math.pow(T1 / T0, it / iters);
    const g = free[Math.floor(rnd() * free.length)];
    if (rnd() < 0.5) {
      const to = Math.floor(rnd() * T);
      if (to === table[g] || load[to] >= cap) continue;
      const d = A[g * T + to] - A[g * T + table[g]];
      if (d >= 0 || rnd() < Math.exp(d / temp)) { move(g, to); score += d; }
    } else {
      const g2 = free[Math.floor(rnd() * free.length)];
      if (g2 === g || table[g2] === table[g]) continue;
      const a = table[g], b = table[g2], w = W[g * n + g2];
      const d = (A[g * T + b] - w) + (A[g2 * T + a] - w) - A[g * T + a] - A[g2 * T + b];
      if (d >= 0 || rnd() < Math.exp(d / temp)) { swap(g, g2); score += d; }
    }
    if (score > best + 1e-9) { best = score; bestTable = table.slice(); }
  }
  return { table: bestTable, score: best };
}

/** Steepest-descent polish: apply any improving move or swap until none remains. */
function polish(spec, W, table0) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const cap = capacityPerTable(spec, T);
  const pin = pinsOf(spec);
  const table = table0.slice();
  const load = new Array(T).fill(0);
  table.forEach((t) => load[t]++);
  const aff = (g, t, skip = -1) => { let s = 0; for (let h = 0; h < n; h++) if (h !== g && h !== skip && table[h] === t) s += W[g * n + h]; return s; };
  let improved = true, guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let g = 0; g < n; g++) {
      if (pin.has(g)) continue;
      const here = aff(g, table[g]);
      for (let t = 0; t < T; t++) {
        if (t === table[g] || load[t] >= cap) continue;
        if (aff(g, t) - here > 1e-9) { load[table[g]]--; load[t]++; table[g] = t; improved = true; break; }
      }
      for (let g2 = g + 1; g2 < n; g2++) {
        if (pin.has(g2) || table[g2] === table[g]) continue;
        const a = table[g], b = table[g2];
        const d = aff(g, b, g2) + aff(g2, a, g) - aff(g, a) - aff(g2, b);
        if (d > 1e-9) { table[g] = b; table[g2] = a; improved = true; }
      }
    }
  }
  return table;
}

/** Find a seating plan. Deterministic for a given spec.seed. */
export function optimize(spec) {
  const errors = validateSpec(spec);
  if (errors.length) return { errors };
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const W = weightMatrix(spec);
  const baseline = baselinePlan(spec);
  const iters = Math.min(250000, 20000 + 600 * n);
  let bestTable = baseline, bestScore = planScore(W, n, baseline);
  // The hard "never together" penalty is a wall annealing cannot climb, so the
  // search runs with a softened one and the polish and the final score use the real one.
  const Wsoft = weightMatrix(spec, SOFT_NEVER);
  for (let r = 0; r < 6; r++) {
    const res = anneal(spec, Wsoft, (spec.seed || 1) * 7919 + r * 104729, iters);
    const polished = polish(spec, W, res.table);
    const sc = planScore(W, n, polished);
    if (sc > bestScore + 1e-9) { bestScore = sc; bestTable = polished; }
  }
  return describe(spec, W, bestTable, baseline);
}

/** Turn an assignment into the report: tables, satisfied and broken rules, scores. */
export function describe(spec, W, table, baseline) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const tables = Array.from({ length: T }, () => []);
  table.forEach((t, g) => tables[t].push(g));
  const pairs = (list) => list.map((r) => ({ ...r, aName: spec.guests[r.a].name, bName: spec.guests[r.b].name, met: r.kind === "want" || r.kind === "must" ? table[r.a] === table[r.b] : table[r.a] !== table[r.b] }));
  const pairRules = pairs(spec.rules.filter((r) => r.kind !== "pin"));
  const broken = pairRules.filter((r) => !r.met);
  const partySplits = [];
  const byParty = new Map();
  spec.guests.forEach((g, i) => { if (g.party) { const k = g.party.toLowerCase(); (byParty.get(k) || byParty.set(k, { name: g.party, members: [] }).get(k)).members.push(i); } });
  for (const p of byParty.values()) {
    const spread = new Set(p.members.map((m) => table[m]));
    if (spread.size > 1) partySplits.push({ party: p.name, tables: [...spread].map((t) => t + 1).sort((a, b) => a - b), size: p.members.length });
  }
  const score = planScore(W, n, table);
  const baseScore = baseline ? planScore(W, n, baseline) : null;
  const baseBroken = baseline ? pairRules.filter((r) => (r.kind === "want" || r.kind === "must" ? baseline[r.a] === baseline[r.b] : baseline[r.a] !== baseline[r.b])).length : null;
  const wantRules = pairRules.filter((r) => r.kind === "want" || r.kind === "must");
  return {
    errors: [],
    table,
    tables: tables.map((members, i) => ({ number: i + 1, guests: members.map((g) => spec.guests[g].name), size: members.length })),
    score, baseScore,
    rulesTotal: pairRules.length,
    rulesMet: pairRules.length - broken.length,
    rulesMetBaseline: baseline ? pairRules.length - baseBroken : null,
    wantsMet: wantRules.filter((r) => r.met).length,
    wantsTotal: wantRules.length,
    broken,
    neverBroken: broken.filter((r) => r.kind === "never"),
    partySplits,
    capacity: capacityPerTable(spec, T),
  };
}

/** Independent check: every guest seated once, capacity and pins honoured, score recomputed. */
export function verifyPlan(spec, result) {
  const problems = [];
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const cap = capacityPerTable(spec, T);
  const seen = new Set();
  let total = 0;
  result.tables.forEach((t) => {
    if (t.guests.length > cap) problems.push(`Table ${t.number} holds ${t.guests.length}, capacity ${cap}.`);
    for (const name of t.guests) { if (seen.has(name)) problems.push(`${name} is seated twice.`); seen.add(name); total++; }
  });
  if (total !== n) problems.push(`Seated ${total} of ${n} guests.`);
  const where = new Map();
  result.tables.forEach((t) => t.guests.forEach((name) => where.set(name.toLowerCase(), t.number - 1)));
  for (const r of spec.rules) if (r.kind === "pin" && where.get(spec.guests[r.a].name.toLowerCase()) !== r.table) problems.push(`${spec.guests[r.a].name} is not at their pinned table.`);
  let s = 0;
  const W = weightMatrix(spec);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (where.get(spec.guests[i].name.toLowerCase()) === where.get(spec.guests[j].name.toLowerCase())) s += W[i * n + j];
  if (Math.abs(s - result.score) > 1e-6) problems.push(`Reported score ${result.score} but recomputed ${s}.`);
  return problems;
}

const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * A standalone, print-ready page with one sheet per table: a big table number
 * and the guest names, to stand at the table or check people in at the door.
 * Guest text is escaped; the page carries no script and loads nothing.
 */
export function tableSignsHtml(spec, result, title = "Seating plan") {
  const sheets = result.tables.map((t) => {
    const names = t.guests.map((name) => {
      const g = spec.guests.find((x) => x.name === name);
      return `<li>${escHtml(name)}${g && g.party ? ` <small>${escHtml(g.party)}</small>` : ""}</li>`;
    }).join("");
    return `<section><p class="n">Table ${t.number}</p><ul>${names || "<li><small>empty</small></li>"}</ul></section>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>`
    + `<style>body{font-family:Georgia,serif;margin:0}section{page-break-after:always;break-after:page;padding:48px;text-align:center}`
    + `.n{font-size:64px;margin:0 0 24px;font-weight:700}ul{list-style:none;padding:0;margin:0;font-size:28px;line-height:1.6}small{font-size:16px;color:#555}`
    + `section:last-child{page-break-after:auto;break-after:auto}</style></head><body>\n${sheets}\n</body></html>`;
}

/**
 * A print-ready "find your table" board: every guest once, sorted by last name
 * (the last word of the name), with their table number, in two columns, for the
 * welcome sign or escort cards. Guest text is escaped; no script, nothing loaded.
 */
export function escortBoardHtml(spec, result, title = "Find your table") {
  const rows = [];
  result.tables.forEach((t) => t.guests.forEach((name) => rows.push({ name, table: t.number })));
  const key = (n) => { const w = n.trim().split(/\s+/); return `${w[w.length - 1]} ${w.slice(0, -1).join(" ")}`.toLowerCase(); };
  rows.sort((a, b) => key(a.name).localeCompare(key(b.name)) || a.table - b.table);
  const items = rows.map((r) => `<li><span>${escHtml(r.name)}</span><b>${r.table}</b></li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>`
    + `<style>body{font-family:Georgia,serif;margin:0;padding:40px}h1{text-align:center;font-size:40px;margin:0 0 24px}`
    + `ul{list-style:none;padding:0;margin:0;columns:2;column-gap:48px;font-size:20px;line-height:1.7}`
    + `li{display:flex;justify-content:space-between;break-inside:avoid;border-bottom:1px dotted #aaa}b{margin-left:16px}</style></head>`
    + `<body><h1>${escHtml(title)}</h1><ul>${items}</ul></body></html>`;
}

export function planCsv(spec, result) {
  const rows = [["Table", "Guest", "Party"]];
  result.tables.forEach((t) => t.guests.forEach((name) => {
    const g = spec.guests.find((x) => x.name === name);
    rows.push([String(t.number), name, g.party]);
  }));
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export const SAMPLE_GUESTS = [
  "Maya Okafor | Okafor family", "Daniel Okafor | Okafor family", "Grace Okafor | Okafor family", "Joy Okafor | Okafor family",
  "Liam Brandt | Brandt family", "Sofia Brandt | Brandt family", "Henrik Brandt | Brandt family",
  "Priya Nair", "Tom Whitfield", "Aisha Rahman", "Carlos Mendes", "Elena Petrova",
  "Uncle Ray", "Aunt Linda", "Cousin Ben", "Cousin Jess",
  "Noah Kim", "Olivia Reyes", "Marcus Hale", "Tina Walsh", "Priest Anselm", "Hannah Cole", "Victor Lang", "Ines Duarte",
].join("\n");

export const SAMPLE_RULES = [
  "Uncle Ray ! Aunt Linda",
  "Uncle Ray !! Victor Lang",
  "Priya Nair + Tom Whitfield",
  "Aisha Rahman ++ Carlos Mendes",
  "Noah Kim + Olivia Reyes",
  "Cousin Ben + Cousin Jess",
  "Marcus Hale + Tina Walsh",
  "Elena Petrova + Hannah Cole",
  "Maya Okafor @ 1",
  "Liam Brandt @ 2",
  "Priest Anselm @ 1",
].join("\n");

export function sampleSpec() {
  const { guests } = parseGuests(SAMPLE_GUESTS);
  const { rules } = parseRules(SAMPLE_RULES, guests);
  return { guests, rules, seatsPerTable: 8, tableCount: 3, balance: true, seed: 1 };
}

export const STAY = { low: 1.5, medium: 4, high: 12 };

/** Read a plan exported by planCsv (Table,Guest,Party) into Map(lowercased name -> table index). */
export function parsePlanCsv(text) {
  const prev = new Map();
  const errors = [];
  const rows = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cells = [];
    let cur = "", q = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (q) { if (c === '"' && raw[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  rows.forEach((cells, i) => {
    if (i === 0 && /^table$/i.test(cells[0].trim())) return;
    const t = Number(cells[0].trim());
    const name = (cells[1] || "").trim().replace(/\s+/g, " ");
    if (!Number.isInteger(t) || t < 1 || !name) { errors.push(`Previous plan row ${i + 1} is not "table number, guest name".`); return; }
    prev.set(name.toLowerCase(), t - 1);
  });
  if (!prev.size && !errors.length) errors.push("The previous plan is empty.");
  return { prev, errors };
}

/**
 * Re-seat after the list changed (late RSVPs, drop-outs) moving as few guests
 * as possible. Each retained guest is tied to an anchor sitting at their old
 * table, so leaving costs `stay` points; anchors are removed from the result.
 */
export function reseat(spec, prev, stickiness = "medium") {
  const stay = typeof stickiness === "number" ? stickiness : STAY[stickiness] ?? STAY.medium;
  const errors = validateSpec(spec);
  if (errors.length) return { errors };
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const anchorIdx = Array.from({ length: T }, (_, t) => n + t);
  const guests = [...spec.guests, ...anchorIdx.map((_, t) => ({ name: `\u0000anchor${t}`, party: "" }))];
  const rules = [...spec.rules];
  const pinned = new Set(spec.rules.filter((r) => r.kind === "pin").map((r) => r.a));
  anchorIdx.forEach((a, t) => rules.push({ kind: "pin", a, table: t }));
  const oldTable = new Array(n).fill(-1);
  spec.guests.forEach((g, i) => {
    const t = prev.get(g.name.toLowerCase());
    if (t === undefined || t >= T) return;
    oldTable[i] = t;
    if (!pinned.has(i)) rules.push({ kind: "stay", a: i, b: anchorIdx[t], weight: stay });
  });
  const ext = { ...spec, guests, rules, seatsPerTable: spec.seatsPerTable + 1, tableCount: T };
  const raw = optimize(ext);
  if (raw.errors?.length) return { errors: raw.errors };
  const table = raw.table.slice(0, n);
  const W = weightMatrix(spec);
  const baseline = baselinePlan(spec);
  const res = describe(spec, W, table, baseline);
  const moved = [];
  let kept = 0, retained = 0;
  spec.guests.forEach((g, i) => {
    if (oldTable[i] === -1) return;
    retained++;
    if (table[i] === oldTable[i]) kept++; else moved.push({ name: g.name, from: oldTable[i] + 1, to: table[i] + 1 });
  });
  const added = spec.guests.filter((_, i) => oldTable[i] === -1).map((g) => g.name);
  const dropped = [...prev.keys()].filter((k) => !spec.guests.some((g) => g.name.toLowerCase() === k));
  return { ...res, moved, kept, retained, added, dropped, stickiness: stay };
}
