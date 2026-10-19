// Seating chart optimizer: assigns guests to tables so that wanted pairs sit
// together and avoided pairs do not, within table capacity and pinned seats.
// Pure functions, no I/O, deterministic for a given seed.

export const WEIGHTS = { want: 3, must: 12, party: 6, avoid: -6, never: -200, mix: 2 };

const SOFT_NEVER = -30;

export const DEFAULTS = { seatsPerTable: 8, tableCount: "", balance: true, seed: 1 };

/** Parse the guest box: one guest per line, "Name", "Name | party", "Name | party | group" or "Name | party | group | meal". */
export function parseGuests(text) {
  const guests = [];
  const errors = [];
  const seen = new Map();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const [namePart, partyPart, groupPart, mealPart] = line.split("|");
    const name = namePart.trim().replace(/\s+/g, " ");
    const party = (partyPart || "").trim().replace(/\s+/g, " ");
    if (!name) { errors.push(`Guest line ${i + 1} has no name.`); return; }
    const key = name.toLowerCase();
    if (seen.has(key)) { errors.push(`"${name}" is listed twice (line ${seen.get(key)} and ${i + 1}); add a surname or initial to tell them apart.`); return; }
    seen.set(key, i + 1);
    const group = (groupPart || "").trim().replace(/\s+/g, " ");
    const meal = (mealPart || "").trim().replace(/\s+/g, " ");
    guests.push({ name, party, group, meal });
  });
  return { guests, errors };
}

const ACCESS_WORD = /^(accessible|access|step-free|wheelchair)$/i;

const OP = /^(.*?)\s+(\+\+|\+|!!|!|@)\s+(.*)$/;

/** Parse the rule box: "A + B", "A ++ B", "A ! B", "A !! B", "A @ 3", "A @ accessible". */
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
    if (op === "@" && ACCESS_WORD.test(b.trim())) { rules.push({ kind: "access", a: ai, line: i + 1 }); return; }
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

/**
 * Parse the optional table-size box: "1: 12, 4: 6" or "Table 1 = 12" (one or more per line or comma-separated)
 * gives table 1 twelve seats and table 4 six; every other table keeps the "Seats per table" figure.
 * Returns { sizes: { [tableIndex]: seats }, errors }.
 */
export function parseTableSizes(text) {
  const sizes = {};
  const errors = [];
  for (const raw of String(text || "").split(/[\r\n,;]+/)) {
    const part = raw.trim();
    if (!part || part.startsWith("#")) continue;
    const m = /^(?:table\s*)?(\d+)\s*[:=]\s*(\d+)$/i.exec(part);
    if (!m) { errors.push(`Table size "${part}" should look like "1: 12" (table number, then seats).`); continue; }
    const t = Number(m[1]), seats = Number(m[2]);
    if (t < 1) { errors.push(`Table size "${part}": table numbers start at 1.`); continue; }
    if (seats < 1) { errors.push(`Table size "${part}": a table needs at least 1 seat.`); continue; }
    if (sizes[t - 1] !== undefined && sizes[t - 1] !== seats) { errors.push(`Table ${t} is given two different sizes.`); continue; }
    sizes[t - 1] = seats;
  }
  return { sizes, errors };
}

function sizeOverrides(spec) {
  const o = spec.tableSizes;
  return o && typeof o === "object" ? o : {};
}

export function validateSpec(spec) {
  const errors = [];
  const n = spec.guests.length;
  if (n < 2) errors.push("Add at least two guests.");
  if (!Number.isInteger(spec.seatsPerTable) || spec.seatsPerTable < 1) errors.push("Seats per table must be a whole number of at least 1.");
  const T = resolveTableCount(spec);
  if (spec.tableCount !== "" && spec.tableCount != null && (!Number.isInteger(Number(spec.tableCount)) || Number(spec.tableCount) < 1)) errors.push("Number of tables must be a whole number of at least 1, or blank to use the fewest that fit.");
  const custom = Object.keys(sizeOverrides(spec)).length > 0;
  if (n >= 1 && Number.isInteger(spec.seatsPerTable) && spec.seatsPerTable >= 1) {
    const full = Array.from({ length: T }, (_, t) => (sizeOverrides(spec)[t] !== undefined ? sizeOverrides(spec)[t] : spec.seatsPerTable)).reduce((a, b) => a + b, 0);
    if (full < n) errors.push(custom ? `${T} tables with your sizes seat ${full}, but there are ${n} guests.` : `${T} tables of ${spec.seatsPerTable} seat ${full}, but there are ${n} guests.`);
  }
  for (const k of Object.keys(sizeOverrides(spec))) if (Number(k) >= T) errors.push(`Table ${Number(k) + 1} is given a size, but there are only ${T} tables.`);
  const caps = capacitiesOf(spec, T);
  const pinCount = new Array(T).fill(0);
  for (const r of spec.rules) {
    if (r.kind !== "pin") continue;
    if (r.table >= T) { errors.push(`${spec.guests[r.a].name} is pinned to table ${r.table + 1}, but there are only ${T} tables.`); continue; }
    pinCount[r.table]++;
  }
  pinCount.forEach((c, t) => { if (c > caps[t]) errors.push(`Table ${t + 1} has ${c} pinned guests but holds ${caps[t]}.`); });
  const pinned = new Map();
  for (const r of spec.rules) if (r.kind === "pin") {
    if (pinned.has(r.a) && pinned.get(r.a) !== r.table) errors.push(`${spec.guests[r.a].name} is pinned to two different tables.`);
    pinned.set(r.a, r.table);
  }
  const acc = accessOf(spec);
  if (acc.guests.size) {
    const names = (set) => [...set].map((g) => spec.guests[g].name);
    if (!acc.tables.size) errors.push(`${names(acc.guests).join(", ")} need an accessible table, but no accessible tables are listed.`);
    else {
      for (const t of acc.tables) if (t >= T) errors.push(`Accessible table ${t + 1} is listed, but there are only ${T} tables.`);
      let room = 0;
      for (const t of acc.tables) if (t < T) room += caps[t];
      for (const [g, t] of pinned) if (!acc.guests.has(g) && acc.tables.has(t)) room--;
      for (const [g, t] of pinned) if (acc.guests.has(g) && !acc.tables.has(t)) errors.push(`${spec.guests[g].name} needs an accessible table but is pinned to table ${t + 1}.`);
      if (acc.guests.size > room) errors.push(`${acc.guests.size} guests need an accessible table but the accessible tables have room for ${Math.max(room, 0)}; list another accessible table or enlarge one.`);
    }
  }
  return errors;
}

export function resolveTableCount(spec) {
  const n = spec.guests.length;
  const given = spec.tableCount === "" || spec.tableCount == null ? null : Number(spec.tableCount);
  const s = spec.seatsPerTable;
  if (given && Number.isInteger(given) && given >= 1) return given;
  const o = sizeOverrides(spec);
  const keys = Object.keys(o).map(Number);
  if (!keys.length) return Math.max(1, tablesNeeded(Math.max(n, 1), Math.max(s, 1)));
  // Custom sizes: the fewest tables, at least up to the highest sized one, whose full seat counts hold everyone.
  let T = Math.max(1, ...keys.map((k) => k + 1)), seats = 0;
  const seatsAt = (t) => (o[t] !== undefined ? o[t] : Math.max(s, 1));
  for (let t = 0; t < T; t++) seats += seatsAt(t);
  while (seats < n) seats += seatsAt(T++);
  return T;
}

/** Seats a table may use. With balance on, tables are filled evenly. */
export function capacityPerTable(spec, T = resolveTableCount(spec)) {
  const n = spec.guests.length;
  return spec.balance ? Math.min(spec.seatsPerTable, Math.ceil(n / T)) : spec.seatsPerTable;
}

/**
 * Seats each table may use, as an array of length T. Tables with a custom size
 * (spec.tableSizes) use exactly that; the rest follow capacityPerTable, and with
 * "fill evenly" on they share what the custom tables leave over.
 */
export function capacitiesOf(spec, T = resolveTableCount(spec)) {
  const o = sizeOverrides(spec);
  if (!Object.keys(o).length) return new Array(T).fill(capacityPerTable(spec, T));
  const n = spec.guests.length;
  let custom = 0, customCount = 0;
  for (let t = 0; t < T; t++) if (o[t] !== undefined) { custom += o[t]; customCount++; }
  const rest = T - customCount;
  const plain = !spec.balance || rest === 0 ? spec.seatsPerTable : Math.max(1, Math.min(spec.seatsPerTable, Math.ceil(Math.max(0, n - custom) / rest)));
  return Array.from({ length: T }, (_, t) => (o[t] !== undefined ? o[t] : plain));
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
  for (const r of spec.rules) if (r.kind !== "pin" && r.kind !== "access") add(r.a, r.b, r.kind === "never" ? neverWeight : r.weight);
  // Optional mixing by group (side of the family, age band, "singles"): spread
  // pushes same-group guests to different tables, cluster pulls them together.
  const mixSign = spec.mix === "spread" ? -1 : spec.mix === "cluster" ? 1 : 0;
  if (mixSign) {
    const byGroup = new Map();
    spec.guests.forEach((g, i) => { if (g.group) { const k = g.group.toLowerCase(); (byGroup.get(k) || byGroup.set(k, []).get(k)).push(i); } });
    for (const members of byGroup.values())
      for (let x = 0; x < members.length; x++) for (let y = x + 1; y < members.length; y++) add(members[x], members[y], mixSign * WEIGHTS.mix);
  }
  return W;
}

export function planScore(W, n, table) {
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (table[i] === table[j]) s += W[i * n + j];
  return s;
}

/**
 * Parse the accessible-tables box ("1, 2" or "Table 1; 3"): the tables with step-free access
 * (near the door, no stairs, room for a wheelchair). Returns { tables: [0-based], errors }.
 */
export function parseAccessTables(text) {
  const tables = [];
  const errors = [];
  for (const raw of String(text || "").split(/[\s,;]+/)) {
    const part = raw.trim().replace(/^table/i, "");
    if (!part) continue;
    if (!/^\d+$/.test(part) || Number(part) < 1) { errors.push(`Accessible table "${raw.trim()}" should be a table number such as 1.`); continue; }
    if (!tables.includes(Number(part) - 1)) tables.push(Number(part) - 1);
  }
  return { tables, errors };
}

/** Guests flagged "@ accessible" and the tables they may use (null set = none given). */
function accessOf(spec) {
  const guests = new Set(spec.rules.filter((r) => r.kind === "access").map((r) => r.a));
  const tables = new Set(Array.isArray(spec.accessTables) ? spec.accessTables : []);
  return { guests, tables };
}
const canSit = (acc, g, t) => !acc.guests.has(g) || acc.tables.has(t);

function pinsOf(spec) {
  const pin = new Map();
  for (const r of spec.rules) if (r.kind === "pin") pin.set(r.a, r.table);
  return pin;
}

/** Seats guests in list order, filling table 1, then 2... (the do-nothing baseline). Pins honoured. */
export function baselinePlan(spec) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const cap = capacitiesOf(spec, T);
  const pin = pinsOf(spec);
  const table = new Array(n).fill(-1);
  const load = new Array(T).fill(0);
  for (const [g, t] of pin) { table[g] = t; load[t]++; }
  const acc = accessOf(spec);
  for (let g = 0; g < n; g++) {
    if (table[g] !== -1 || !acc.guests.has(g)) continue;
    const t2 = [...acc.tables].sort((a, b) => a - b).find((x) => x < T && load[x] < cap[x]);
    if (t2 !== undefined) { table[g] = t2; load[t2]++; }
  }
  let t = 0;
  for (let g = 0; g < n; g++) {
    if (table[g] !== -1) continue;
    while (load[t] >= cap[t]) t = (t + 1) % T;
    table[g] = t; load[t]++;
  }
  return table;
}

function anneal(spec, W, seed, iters) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const cap = capacitiesOf(spec, T);
  const pin = pinsOf(spec);
  const acc = accessOf(spec);
  const rnd = mulberry32(seed);
  const free = [];
  for (let g = 0; g < n; g++) if (!pin.has(g)) free.push(g);

  // random start that respects pins and capacity
  const table = new Array(n).fill(-1);
  const load = new Array(T).fill(0);
  for (const [g, t] of pin) { table[g] = t; load[t]++; }
  const order = free.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  // guests who need an accessible table are placed first, at accessible tables with room
  const accList = [...acc.tables].filter((x) => x < T);
  for (const g of order.filter((x) => acc.guests.has(x))) {
    const open = accList.filter((x) => load[x] < cap[x]);
    const x = open[Math.floor(rnd() * open.length)];
    table[g] = x; load[x]++;
  }
  let tt = 0;
  for (const g of order) { if (table[g] !== -1) continue; while (load[tt] >= cap[tt]) tt = (tt + 1) % T; table[g] = tt; load[tt]++; }

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
      if (to === table[g] || load[to] >= cap[to] || !canSit(acc, g, to)) continue;
      const d = A[g * T + to] - A[g * T + table[g]];
      if (d >= 0 || rnd() < Math.exp(d / temp)) { move(g, to); score += d; }
    } else {
      const g2 = free[Math.floor(rnd() * free.length)];
      if (g2 === g || table[g2] === table[g]) continue;
      if (!canSit(acc, g, table[g2]) || !canSit(acc, g2, table[g])) continue;
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
  const cap = capacitiesOf(spec, T);
  const pin = pinsOf(spec);
  const acc = accessOf(spec);
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
        if (t === table[g] || load[t] >= cap[t] || !canSit(acc, g, t)) continue;
        if (aff(g, t) - here > 1e-9) { load[table[g]]--; load[t]++; table[g] = t; improved = true; break; }
      }
      for (let g2 = g + 1; g2 < n; g2++) {
        if (pin.has(g2) || table[g2] === table[g]) continue;
        if (!canSit(acc, g, table[g2]) || !canSit(acc, g2, table[g])) continue;
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

/**
 * Orders the guests of one table around it (a ring: the last seat touches the
 * first). Neighbours score the pair weight, so a party and wanted pairs end up
 * side by side and avoided pairs do not touch. Tables up to 9 are solved
 * exhaustively; larger ones by greedy chaining then swap and reversal passes.
 */
export function orderTable(members, W, n) {
  const m = members.length;
  if (m <= 2) return members.slice();
  const w = (a, b) => W[a * n + b];
  const ring = (p) => { let s = 0; for (let i = 0; i < m; i++) s += w(p[i], p[(i + 1) % m]); return s; };
  if (m <= 9) {
    let best = members.slice(), bestS = ring(best);
    const rest = members.slice(1);
    const used = new Array(rest.length).fill(false);
    const cur = [members[0]];
    const rec = () => {
      if (cur.length === m) { const s = ring(cur); if (s > bestS + 1e-9) { bestS = s; best = cur.slice(); } return; }
      for (let i = 0; i < rest.length; i++) {
        if (used[i]) continue;
        used[i] = true; cur.push(rest[i]); rec(); cur.pop(); used[i] = false;
      }
    };
    rec();
    return best;
  }
  const left = members.slice(1);
  const path = [members[0]];
  while (left.length) {
    const last = path[path.length - 1];
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (w(last, left[i]) > w(last, left[bi])) bi = i;
    path.push(left.splice(bi, 1)[0]);
  }
  let score = ring(path), improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
      const a = path.slice(); [a[i], a[j]] = [a[j], a[i]];
      let s = ring(a);
      if (s > score + 1e-9) { path.splice(0, m, ...a); score = s; improved = true; continue; }
      const b = path.slice(); b.splice(i, j - i + 1, ...b.slice(i, j + 1).reverse());
      s = ring(b);
      if (s > score + 1e-9) { path.splice(0, m, ...b); score = s; improved = true; }
    }
  }
  return path;
}

/** Turn an assignment into the report: tables, satisfied and broken rules, scores. */
export function describe(spec, W, table, baseline) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const tables = Array.from({ length: T }, () => []);
  table.forEach((t, g) => tables[t].push(g));
  // Each table's guests are listed in seat order around it, not list order.
  tables.forEach((members, t) => { tables[t] = orderTable(members, W, n); });
  const pairs = (list) => list.map((r) => ({ ...r, aName: spec.guests[r.a].name, bName: spec.guests[r.b].name, met: r.kind === "want" || r.kind === "must" ? table[r.a] === table[r.b] : table[r.a] !== table[r.b] }));
  const pairRules = pairs(spec.rules.filter((r) => r.kind !== "pin" && r.kind !== "access"));
  const broken = pairRules.filter((r) => !r.met);
  const partySplits = [];
  const byParty = new Map();
  spec.guests.forEach((g, i) => { if (g.party) { const k = g.party.toLowerCase(); (byParty.get(k) || byParty.set(k, { name: g.party, members: [] }).get(k)).members.push(i); } });
  for (const p of byParty.values()) {
    const spread = new Set(p.members.map((m) => table[m]));
    if (spread.size > 1) partySplits.push({ party: p.name, tables: [...spread].map((t) => t + 1).sort((a, b) => a - b), size: p.members.length });
  }
  const groupMix = groupMixOf(spec, table, T);
  const score = planScore(W, n, table);
  const baseScore = baseline ? planScore(W, n, baseline) : null;
  const baseBroken = baseline ? pairRules.filter((r) => (r.kind === "want" || r.kind === "must" ? baseline[r.a] === baseline[r.b] : baseline[r.a] !== baseline[r.b])).length : null;
  const wantRules = pairRules.filter((r) => r.kind === "want" || r.kind === "must");
  return {
    errors: [],
    table,
    tables: tables.map((members, i) => ({ number: i + 1, guests: members.map((g) => spec.guests[g].name), size: members.length, seats: capacitiesOf(spec, T)[i] })),
    score, baseScore,
    rulesTotal: pairRules.length,
    rulesMet: pairRules.length - broken.length,
    rulesMetBaseline: baseline ? pairRules.length - baseBroken : null,
    wantsMet: wantRules.filter((r) => r.met).length,
    wantsTotal: wantRules.length,
    broken,
    neverBroken: broken.filter((r) => r.kind === "never"),
    partySplits,
    groupMix,
    meals: mealTally(spec, table, T),
    accessSeated: spec.rules.filter((r) => r.kind === "access").map((r) => ({ name: spec.guests[r.a].name, table: table[r.a] + 1 })),
    capacity: Math.max(...capacitiesOf(spec, T)),
    capacities: capacitiesOf(spec, T),
  };
}

/**
 * "Would one more (or fewer) table seat everyone better?" Re-runs the optimiser
 * for table counts from the fewest that fit up to `extra` more and reports each
 * one's wishes met and fullest table. Counts the spec rules out (a pin past the
 * last table, an accessible table that does not exist) are left out. Nothing is applied.
 */
export function compareTableCounts(spec, extra = 3) {
  const base = resolveTableCount({ ...spec, tableCount: "" });
  const rows = [];
  for (let T = base; T <= base + extra; T++) {
    const res = optimize({ ...spec, tableCount: T });
    if (res.errors.length) continue;
    rows.push({ tables: T, rulesMet: res.rulesMet, rulesTotal: res.rulesTotal, score: res.score, maxPerTable: Math.max(...res.tables.map((t) => t.size)) });
  }
  const top = Math.max(...rows.map((r) => r.score), 0);
  return rows.map((r) => ({ ...r, best: rows.length > 1 && r.score === top }));
}

/**
 * "What if I move this guest to table N?" Checks a hand edit against the
 * plan: capacity, pin, access, and which wishes it would break or fix, with
 * the score change. Nothing is applied. Returns { errors } for a bad name or
 * table, else { guest, from, to, blocked: [..], scoreDelta, broke: [..], fixed: [..] }.
 */
export function checkMove(spec, result, guestName, toTable) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const g = spec.guests.findIndex((x) => x.name.toLowerCase() === String(guestName || "").trim().toLowerCase());
  if (g < 0) return { errors: [`No guest named "${String(guestName || "").trim()}".`] };
  const to = Number(toTable) - 1;
  if (!Number.isInteger(to) || to < 0 || to >= T) return { errors: [`Table should be a number from 1 to ${T}.`] };
  const from = result.table[g];
  const blocked = [];
  if (from === to) return { errors: [], guest: spec.guests[g].name, from: from + 1, to: to + 1, blocked, scoreDelta: 0, broke: [], fixed: [], same: true };
  const caps = capacitiesOf(spec, T);
  const size = result.table.filter((t) => t === to).length;
  if (size >= caps[to]) blocked.push(`Table ${to + 1} is full (${size} of ${caps[to]} seats).`);
  const pin = pinsOf(spec).get(g);
  if (pin !== undefined && pin !== to) blocked.push(`${spec.guests[g].name} is pinned to table ${pin + 1}.`);
  if (!canSit(accessOf(spec), g, to)) blocked.push(`${spec.guests[g].name} needs an accessible table and table ${to + 1} is not one.`);
  const W = weightMatrix(spec);
  const next = result.table.slice();
  next[g] = to;
  const scoreDelta = planScore(W, n, next) - planScore(W, n, result.table);
  const broke = [], fixed = [];
  for (const r of spec.rules) {
    if (r.kind === "pin" || r.kind === "access" || (r.a !== g && r.b !== g)) continue;
    const wantTogether = r.kind === "want" || r.kind === "must";
    const was = wantTogether ? result.table[r.a] === result.table[r.b] : result.table[r.a] !== result.table[r.b];
    const will = wantTogether ? next[r.a] === next[r.b] : next[r.a] !== next[r.b];
    const item = { kind: r.kind, aName: spec.guests[r.a].name, bName: spec.guests[r.b].name };
    if (was && !will) broke.push(item); else if (!was && will) fixed.push(item);
  }
  return { errors: [], guest: spec.guests[g].name, from: from + 1, to: to + 1, blocked, scoreDelta, broke, fixed };
}

/**
 * Applies hand edits to a plan: `moves` is [{ guest, to }] with `to` a 1-based table, all applied together so a swap
 * (two moves) can pass through a full table. The result must still respect capacity, pins and accessible tables, else
 * nothing is applied. Returns { errors } or the full report for the edited plan (same shape as `optimize`), so every
 * print-out and the CSV work on it unchanged. The edited plan can score lower than the optimiser's; that is the point.
 */
export function applyMoves(spec, result, moves) {
  const T = resolveTableCount(spec);
  const next = result.table.slice();
  for (const m of moves) {
    const g = spec.guests.findIndex((x) => x.name.toLowerCase() === String(m.guest || "").trim().toLowerCase());
    if (g < 0) return { errors: [`No guest named "${String(m.guest || "").trim()}".`] };
    const to = Number(m.to) - 1;
    if (!Number.isInteger(to) || to < 0 || to >= T) return { errors: [`Table should be a number from 1 to ${T}.`] };
    next[g] = to;
  }
  const caps = capacitiesOf(spec, T), pins = pinsOf(spec), access = accessOf(spec);
  const load = new Array(T).fill(0);
  next.forEach((t) => load[t]++);
  const errors = [];
  load.forEach((c, t) => { if (c > caps[t]) errors.push(`Table ${t + 1} would have ${c} guests for ${caps[t]} seats.`); });
  next.forEach((t, g) => {
    if (pins.get(g) !== undefined && pins.get(g) !== t) errors.push(`${spec.guests[g].name} is pinned to table ${pins.get(g) + 1}.`);
    if (!canSit(access, g, t)) errors.push(`${spec.guests[g].name} needs an accessible table and table ${t + 1} is not one.`);
  });
  if (errors.length) return { errors };
  return describe(spec, weightMatrix(spec), next, baselinePlan(spec));
}

/**
 * "How do I fix this unmet wish?" For each wish the plan could not meet, tries moving either guest to the other's
 * table and swapping either guest with someone at the other's table, keeps only options that respect capacity, pins
 * and access tables and that raise the plan's score, and returns the best per wish. Nothing is applied. Returns
 * [{ rule, aName, bName, kind, action, scoreDelta, broke: [..] }], best score gain first; a wish with no worthwhile
 * fix is left out, because the plan already trades it against something worth more.
 */
export function suggestFixes(spec, result) {
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const W = weightMatrix(spec);
  const caps = capacitiesOf(spec, T);
  const pins = pinsOf(spec), access = accessOf(spec);
  const base = planScore(W, n, result.table);
  const ok = (g, to) => (pins.get(g) === undefined || pins.get(g) === to) && canSit(access, g, to);
  const met = (table, r) => (r.kind === "want" || r.kind === "must" ? table[r.a] === table[r.b] : table[r.a] !== table[r.b]);
  const pairRules = spec.rules.filter((r) => r.kind !== "pin" && r.kind !== "access");
  const nm = (g) => spec.guests[g].name;
  const out = [];
  for (const br of result.broken) {
    if (br.kind !== "want" && br.kind !== "must") continue;
    const { a, b } = br;
    const options = [];
    const size = (t) => result.table.filter((x) => x === t).length;
    for (const [mover, anchor] of [[a, b], [b, a]]) {
      const to = result.table[anchor], from = result.table[mover];
      if (ok(mover, to) && size(to) < caps[to]) {
        const next = result.table.slice(); next[mover] = to;
        options.push({ next, moves: [{ guest: nm(mover), to: to + 1 }], action: `Move ${nm(mover)} from table ${from + 1} to table ${to + 1}.` });
      }
      result.table.forEach((t, x) => {
        if (t !== to || x === anchor || !ok(mover, to) || !ok(x, from)) return;
        const next = result.table.slice(); next[mover] = to; next[x] = from;
        options.push({ next, moves: [{ guest: nm(mover), to: to + 1 }, { guest: nm(x), to: from + 1 }], action: `Swap ${nm(mover)} (table ${from + 1}) with ${nm(x)} (table ${to + 1}).` });
      });
    }
    let best = null;
    for (const o of options) {
      const delta = planScore(W, n, o.next) - base;
      if (delta > 1e-9 && (!best || delta > best.scoreDelta)) {
        best = { rule: br.kind, aName: br.aName, bName: br.bName, kind: br.kind, action: o.action, moves: o.moves, scoreDelta: Math.round(delta * 100) / 100,
          broke: pairRules.filter((r) => met(result.table, r) && !met(o.next, r)).map((r) => ({ kind: r.kind, aName: nm(r.a), bName: nm(r.b) })) };
      }
    }
    if (best) out.push(best);
  }
  return out.sort((x, y) => y.scoreDelta - x.scoreDelta);
}

/** Per group, how many of its guests sit at each table: [{ group, perTable: [..] }]. Empty when no guest has a group. */
export function groupMixOf(spec, table, T = resolveTableCount(spec)) {
  const byGroup = new Map();
  spec.guests.forEach((g, i) => {
    if (!g.group) return;
    const k = g.group.toLowerCase();
    if (!byGroup.has(k)) byGroup.set(k, { group: g.group, perTable: new Array(T).fill(0) });
    byGroup.get(k).perTable[table[i]]++;
  });
  return [...byGroup.values()];
}

/** Independent check: every guest seated once, capacity and pins honoured, score recomputed. */
export function verifyPlan(spec, result) {
  const problems = [];
  const n = spec.guests.length;
  const T = resolveTableCount(spec);
  const caps = capacitiesOf(spec, T);
  const seen = new Set();
  let total = 0;
  result.tables.forEach((t) => {
    const cap = caps[t.number - 1];
    if (t.guests.length > cap) problems.push(`Table ${t.number} holds ${t.guests.length}, capacity ${cap}.`);
    for (const name of t.guests) { if (seen.has(name)) problems.push(`${name} is seated twice.`); seen.add(name); total++; }
  });
  if (total !== n) problems.push(`Seated ${total} of ${n} guests.`);
  const where = new Map();
  result.tables.forEach((t) => t.guests.forEach((name) => where.set(name.toLowerCase(), t.number - 1)));
  for (const r of spec.rules) if (r.kind === "pin" && where.get(spec.guests[r.a].name.toLowerCase()) !== r.table) problems.push(`${spec.guests[r.a].name} is not at their pinned table.`);
  const acc = accessOf(spec);
  for (const g of acc.guests) { const t = where.get(spec.guests[g].name.toLowerCase()); if (!acc.tables.has(t)) problems.push(`${spec.guests[g].name} needs an accessible table but is at table ${t + 1}.`); }
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
/**
 * Meal choices per table for the caterer: [{ meal, total, perTable: [..] }],
 * most common first, guests with no meal typed counted as "No choice given".
 * Empty when no guest has a meal, so a list without a fourth column is unchanged.
 */
export function mealTally(spec, table, T = resolveTableCount(spec)) {
  if (!spec.guests.some((g) => g.meal)) return [];
  const by = new Map();
  spec.guests.forEach((g, i) => {
    const label = g.meal || "No choice given";
    const k = label.toLowerCase();
    if (!by.has(k)) by.set(k, { meal: label, total: 0, perTable: new Array(T).fill(0) });
    const m = by.get(k);
    m.total++; m.perTable[table[i]]++;
  });
  return [...by.values()].sort((a, b) => b.total - a.total || a.meal.localeCompare(b.meal));
}

/**
 * A print-ready sheet for the caterer: total count per meal, then for each table
 * the number of each meal. Meals stay off the table signs and escort board, so
 * a guest's dietary need is never shown to the room. Text is escaped.
 */
export function catererSheetHtml(spec, result, title = "Meal counts by table") {
  const meals = result.meals || mealTally(spec, result.table);
  const head = `<tr><th>Meal</th><th>Total</th>${result.tables.map((t) => `<th>T${t.number}</th>`).join("")}</tr>`;
  const rows = meals.map((m) => `<tr><td>${escHtml(m.meal)}</td><td><b>${m.total}</b></td>${m.perTable.map((c) => `<td>${c || ""}</td>`).join("")}</tr>`).join("");
  const body = meals.length ? `<table>${head}${rows}</table>` : "<p>No meal choices were typed. Add a fourth column to each guest line, for example: Ann Lee | | | vegetarian.</p>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>`
    + `<style>body{font-family:Georgia,serif;margin:0;padding:40px}h1{font-size:34px;margin:0 0 20px}table{border-collapse:collapse;font-size:20px}`
    + `th,td{border:1px solid #999;padding:6px 14px;text-align:center}td:first-child,th:first-child{text-align:left}</style></head>`
    + `<body><h1>${escHtml(title)}</h1>${body}</body></html>`;
}

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

/**
 * A print-ready floor plan: every table drawn as a circle with its guests around
 * it in seat order (the same order the signs and CSV use, so neighbours are the
 * people the wishes put next to each other). Landscape, three tables across, one
 * inline SVG per table. Meals never appear. Guest text is escaped; no script,
 * nothing loaded.
 */
export function floorPlanHtml(spec, result, title = "Floor plan") {
  const S = 360, C = S / 2, TR = 46, SR = 74, LR = 88;
  const f = (x) => Math.round(x * 10) / 10;
  const svgFor = (t) => {
    const n = t.guests.length;
    const seats = t.guests.map((name, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
      const cos = Math.cos(a), sin = Math.sin(a);
      const anchor = Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end";
      const ly = sin < -0.3 ? sin * LR - 2 : sin > 0.3 ? sin * LR + 10 : sin * LR + 4;
      return `<circle cx="${f(C + cos * SR)}" cy="${f(C + sin * SR)}" r="7"/>`
        + `<text x="${f(C + cos * LR)}" y="${f(C + ly)}" text-anchor="${anchor}">${escHtml(name)}</text>`;
    }).join("");
    return `<figure><svg viewBox="0 0 ${S} ${S}" role="img" aria-label="Table ${t.number}, ${n} guest${n === 1 ? "" : "s"}">`
      + `<circle class="t" cx="${C}" cy="${C}" r="${TR}"/><text class="n" x="${C}" y="${C + 9}" text-anchor="middle">${t.number}</text>${seats}</svg></figure>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>`
    + `<style>@page{size:letter landscape;margin:0.4in}body{font-family:Georgia,serif;margin:0;padding:16px}h1{text-align:center;font-size:28px;margin:0 0 8px}`
    + `main{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}figure{margin:0;break-inside:avoid}svg{width:100%;height:auto}`
    + `circle{fill:#fff;stroke:#444;stroke-width:1.5}.t{fill:#f1ece2;stroke-width:2}text{font-size:12px;fill:#222}.n{font-size:30px;font-weight:700}</style></head>`
    + `<body><h1>${escHtml(title)}</h1><main>${result.tables.map(svgFor).join("\n") || "<p>No guests to print.</p>"}</main></body></html>`;
}

/**
 * Folded tent place cards, 8 to a US Letter page (2 across, 4 down), cut and
 * fold on the dotted line. The name is printed upside down on the upper half and the right way up with
 * the table number on the lower half, so it reads from both sides once folded. Cards come out grouped by table, in seat order. Meals never appear.
 * Guest text is escaped; no script, nothing loaded.
 */
export function placeCardsHtml(spec, result, title = "Place cards") {
  const cards = [];
  result.tables.forEach((t) => t.guests.forEach((name) => cards.push({ name, table: t.number })));
  const cell = (c) => `<div class="c"><div class="f">${escHtml(c.name)}</div><div class="b">${escHtml(c.name)}<em>Table ${c.table}</em></div></div>`;
  const pages = [];
  for (let i = 0; i < cards.length; i += 8) pages.push(`<section>${cards.slice(i, i + 8).map(cell).join("")}</section>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>`
    + `<style>@page{size:letter;margin:0.5in}body{font-family:Georgia,serif;margin:0}section{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:2.25in;gap:0;page-break-after:always;break-after:page}`
    + `section:last-child{page-break-after:auto;break-after:auto}.c{display:flex;flex-direction:column;border:1px solid #bbb}`
    + `.f,.b{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:26px;padding:0 8px}`
    + `.f{transform:rotate(180deg);border-bottom:1px dotted #777}.b{flex-direction:column}`
    + `.b em{font-style:normal;font-size:16px;color:#555;margin-top:6px}</style></head>`
    + `<body>${pages.join("\n") || "<p>No guests to print.</p>"}</body></html>`;
}

export function planCsv(spec, result) {
  const withMeal = spec.guests.some((g) => g.meal);
  const rows = [["Table", "Guest", "Party", "Group", ...(withMeal ? ["Meal"] : [])]];
  result.tables.forEach((t) => t.guests.forEach((name) => {
    const g = spec.guests.find((x) => x.name === name);
    rows.push([String(t.number), name, g.party, g.group || "", ...(withMeal ? [g.meal || ""] : [])]);
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
  return { guests, rules, seatsPerTable: 8, tableCount: 3, balance: true, mix: "off", seed: 1 };
}

export const STAY = { low: 1.5, medium: 4, high: 12 };

/** Split delimited text (quoted cells allowed) into rows of cells. */
function splitDelimited(text, delim) {
  const rows = [];
  let row = [], cur = "", q = false;
  const src = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"' && src[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const SHEET_COLS = {
  name: /^(full\s*name|guest(\s*name)?|name|attendee)$/i,
  first: /^(first(\s*name)?|given(\s*name)?)$/i,
  last: /^(last(\s*name)?|sur\s*name|surname|family\s*name)$/i,
  party: /^(party|household|family|invitation|invite|rsvp\s*party|address\s*group)$/i,
  group: /^(group|side|category|tag|list|relationship)$/i,
  meal: /^(meal|entr[eé]e|menu|meal\s*choice|dinner|diet(ary)?)$/i,
  rsvp: /^(rsvp|attending|status|response|coming)$/i,
  plusone: /^(plus\s*-?\s*one|\+1|guest\s*name|companion)$/i,
};
const DECLINED = /^(no|n|declined?|not\s*attending|regrets?|false|0|can'?t\s*make\s*it)$/i;

/**
 * Turn a guest list pasted from a spreadsheet or RSVP export (tab, comma or
 * semicolon separated, with or without a header) into the tool's
 * "Name | party | group | meal" lines. Declined RSVPs are dropped, first and
 * last name columns are joined, and a plus-one name becomes its own guest in
 * the same party. Text already in bar format is returned untouched.
 */
export function importGuestSheet(text) {
  const raw = String(text || "");
  const notes = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { text: "", notes, imported: 0, converted: false };
  if (lines.every((l) => l.includes("|") || l.trim().startsWith("#")) || (!/[\t;,]/.test(raw))) {
    return { text: raw, notes, imported: 0, converted: false };
  }
  const count = (d) => lines.slice(0, 5).reduce((n, l) => n + l.split(d).length - 1, 0);
  const delim = ["\t", ";", ","].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = splitDelimited(raw, delim);
  const cols = {};
  const head = rows[0].map((c) => c.trim());
  head.forEach((h, i) => { for (const k of Object.keys(SHEET_COLS)) if (cols[k] === undefined && SHEET_COLS[k].test(h)) cols[k] = i; });
  const hasHeader = cols.name !== undefined || cols.first !== undefined;
  let body = rows;
  if (hasHeader) body = rows.slice(1);
  else { Object.keys(cols).forEach((k) => delete cols[k]); cols.name = 0; cols.party = 1; cols.group = 2; cols.meal = 3; }
  // A header called "Guest" alone is the guest's name; with a Name column it is the plus-one.
  if (hasHeader && cols.name !== undefined && cols.plusone === cols.name) delete cols.plusone;
  const cell = (r, k) => (cols[k] === undefined ? "" : (r[cols[k]] || "").trim().replace(/\s+/g, " ").replace(/\|/g, "/"));
  const out = [];
  let dropped = 0, plus = 0, blank = 0;
  for (const r of body) {
    const name = cols.first !== undefined && cols.name === undefined
      ? `${cell(r, "first")} ${cell(r, "last")}`.trim()
      : cell(r, "name") || `${cell(r, "first")} ${cell(r, "last")}`.trim();
    if (!name) { blank++; continue; }
    if (cols.rsvp !== undefined && DECLINED.test(cell(r, "rsvp"))) { dropped++; continue; }
    const party = cell(r, "party");
    const line = [name, party, cell(r, "group"), cell(r, "meal")];
    while (line.length > 1 && !line[line.length - 1]) line.pop();
    out.push(line.join(" | "));
    const pn = hasHeader ? cell(r, "plusone") : "";
    if (pn && !/^(yes|y|true|1|no|n|false|0|none|-)$/i.test(pn)) {
      out.push([pn, party || `${name} party`].join(" | "));
      if (!party) out[out.length - 2] = [name, `${name} party`, cell(r, "group"), cell(r, "meal")].join(" | ").replace(/( \| )+$/, "");
      plus++;
    }
  }
  if (hasHeader) notes.push(`Read the header row (${head.filter(Boolean).join(", ")}).`);
  else notes.push("No header row found, so columns were read as Name, Party, Group, Meal.");
  if (dropped) notes.push(`Left out ${dropped} declined RSVP${dropped === 1 ? "" : "s"}.`);
  if (plus) notes.push(`Added ${plus} named plus-one${plus === 1 ? "" : "s"}, seated in the same party as their host.`);
  if (blank) notes.push(`Skipped ${blank} row${blank === 1 ? "" : "s"} with no name.`);
  return { text: out.join("\n"), notes, imported: out.length, converted: true };
}

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
  // Anchors take one seat at every table, so custom sizes (and the evened-out rest) each grow by one.
  if (Object.keys(sizeOverrides(spec)).length) ext.tableSizes = Object.fromEntries(capacitiesOf(spec, T).map((c, t) => [t, c + 1]));
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

// Saving the working setup (guests, wishes, table settings, last plan CSV) so
// a planner can come back over the weeks RSVPs trickle in. The page keeps it
// in this browser's local storage and in a downloadable file; nothing leaves
// the device.
export const SETUP_FIELDS = ["guests", "rules", "seats", "tcount", "sizes", "access", "balance", "mix", "prevplan"];
const MIX_VALUES = ["off", "spread", "cluster"];

export function setupJson(state) {
  const out = { app: "event-seating-chart-optimizer", version: 1 };
  for (const k of SETUP_FIELDS) out[k] = state[k];
  return JSON.stringify(out, null, 2);
}

// Parse a saved setup, keeping only known fields of the right type. Returns
// { state, error }; unknown or mistyped fields are dropped, never trusted.
export function parseSetup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { state: null, error: "That file is not valid JSON." }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.app !== "event-seating-chart-optimizer") {
    return { state: null, error: "That is not a seating setup saved by this tool." };
  }
  const state = {};
  for (const k of ["guests", "rules", "sizes", "access", "prevplan"]) if (typeof raw[k] === "string") state[k] = raw[k].slice(0, 200000);
  for (const k of ["seats", "tcount"]) if (typeof raw[k] === "string" || typeof raw[k] === "number") state[k] = String(raw[k]).slice(0, 8);
  if (typeof raw.balance === "boolean") state.balance = raw.balance;
  if (MIX_VALUES.includes(raw.mix)) state.mix = raw.mix;
  return { state, error: null };
}

// Share link: the whole setup packed into a URL fragment (#s=...), so a
// partner or planner opens the same lists from one link. The fragment is never
// sent to a server; it is read by the page in the browser. Unicode-safe
// base64url of the setup JSON.
export function shareFragment(state) {
  const bytes = new TextEncoder().encode(setupJson(state));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "s=" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseShareFragment(hash) {
  const m = /^#?s=([A-Za-z0-9_-]+)$/.exec(String(hash || ""));
  if (!m) return { state: null, error: null };
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return parseSetup(new TextDecoder().decode(bytes));
  } catch {
    return { state: null, error: "That share link is damaged." };
  }
}
