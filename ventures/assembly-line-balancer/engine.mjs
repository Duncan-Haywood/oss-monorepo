// Assembly line balancing engine: the simple assembly line balancing problem
// (SALBP) in its two classic forms.
//
//   SALBP-1: given a cycle time (takt), use the fewest stations.
//   SALBP-2: given a number of stations, use the shortest cycle time.
//
// Every task has a time and a list of tasks that must be done before it
// (directly; the closure is taken here). A station's load is the sum of its
// task times and may not exceed the cycle time; a task may sit in a station
// only if each of its predecessors sits in the same station or an earlier one.
//
// Method, with credit:
// - Bounds LB1 (total work over cycle time) and the bin-packing bounds LB2
//   and LB3 (counting tasks longer than a half and a third of the cycle), and
//   earliest/latest stations from head and tail work, as collected in Scholl
//   and Klein (1997), "SALOME: a bidirectional branch and bound procedure for
//   assembly line balancing", INFORMS Journal on Computing 9(4).
// - Upper bounds from priority-rule heuristics, forwards and on the reversed
//   graph (ranked positional weight, Helgeson and Birnie 1961; most followers;
//   longest task; longest path to the end).
// - An exact station-oriented search that fills one station at a time with
//   *maximal* loads only (Jackson 1956, Management Science 2(3)), prunes on
//   the idle time a target station count allows, explores states by cyclic
//   best-first search and stores every set of assigned tasks once ("branch,
//   bound and remember", Sewell and Jacobson 2012, INFORMS Journal on
//   Computing 24(3)). It tries target counts from the lower bound up, so the
//   first feasible count is optimal; a node or time limit turns the answer
//   into a proved range.
//
// The code is original (MIT); the ideas are the cited authors'.

const DEFAULT_LIMITS = { nodes: 4_000_000, ms: 4000 };

// ---------------------------------------------------------------- input

/** Parse Scholl's .IN2 format: n, then n task times, then "i,j" arcs, then optional "-1,-1". */
export function parseIn2(text) {
  const lines = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error('empty .IN2 file');
  const n = Number(lines[0]);
  if (!Number.isInteger(n) || n < 1) throw new Error('first line of an .IN2 file is the number of tasks');
  if (lines.length < n + 1) throw new Error(`.IN2 file says ${n} tasks but lists ${lines.length - 1} times`);
  const tasks = [];
  for (let i = 0; i < n; i++) tasks.push({ id: String(i + 1), time: Number(lines[i + 1]), predecessors: [] });
  for (const line of lines.slice(n + 1)) {
    const m = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(line);
    if (!m) throw new Error(`cannot read precedence line "${line}"; write i,j`);
    const a = Number(m[1]), b = Number(m[2]);
    if (a === -1 && b === -1) break;
    if (a < 1 || a > n || b < 1 || b > n) throw new Error(`precedence ${a},${b} names a task outside 1..${n}`);
    tasks[b - 1].predecessors.push(String(a));
  }
  return { tasks };
}

/** Parse a task table: one task per line, "id, time, predecessors, description".
 *  Predecessors are separated by spaces or semicolons; a header line is skipped. */
export function parseTaskTable(text) {
  const tasks = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = splitCsvLine(line);
    if (i === firstNonEmpty(lines) && !Number.isFinite(Number(parts[1]))) return; // header
    if (parts.length < 2) throw new Error(`line ${i + 1}: write id, time, predecessors, description`);
    const id = parts[0].trim();
    const time = Number(parts[1].trim());
    const preds = (parts[2] || '').split(/[\s;]+/).map(s => s.trim()).filter(Boolean);
    const name = parts.slice(3).join(',').trim();
    tasks.push({ id, time, predecessors: preds, ...(name ? { name } : {}) });
  });
  return { tasks };
}

function firstNonEmpty(lines) {
  return lines.findIndex(l => l.trim() && !l.trim().startsWith('#'));
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Write a task table that parseTaskTable reads back. */
export function formatTaskTable(problem) {
  const esc = s => (/[",\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = ['task,time,predecessors,description'];
  for (const t of problem.tasks) rows.push([esc(String(t.id)), String(t.time), (t.predecessors || []).join(' '), ...(t.name ? [esc(t.name)] : [])].join(','));
  return rows.join('\n') + '\n';
}

function decimals(x) {
  const s = String(x);
  if (/e/i.test(s)) return 6;
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * Check a problem and build the internal form: tasks renumbered in a
 * topological order (ties keep the typed order), times scaled to integers.
 */
export function prepare(problem) {
  const list = problem?.tasks;
  if (!Array.isArray(list) || list.length === 0) throw new Error('add at least one task');
  if (list.length > 1000) throw new Error('at most 1000 tasks');
  const index = new Map();
  list.forEach((t, i) => {
    const id = String(t.id ?? '').trim();
    if (!id) throw new Error(`task ${i + 1} has no id`);
    if (index.has(id)) throw new Error(`task id "${id}" appears twice`);
    const time = Number(t.time);
    if (!Number.isFinite(time) || time <= 0) throw new Error(`task "${id}" needs a time above zero`);
    index.set(id, i);
  });
  let dec = 0;
  for (const t of list) dec = Math.max(dec, decimals(Number(t.time)));
  if (problem.cycleTime != null) dec = Math.max(dec, decimals(Number(problem.cycleTime)));
  dec = Math.min(dec, 3);
  const scale = 10 ** dec;
  const n0 = list.length;
  const preds0 = list.map((t, i) => {
    const seen = new Set();
    for (const p of t.predecessors || []) {
      const key = String(p).trim();
      if (!key) continue;
      if (!index.has(key)) throw new Error(`task "${t.id}" names an unknown predecessor "${key}"`);
      const j = index.get(key);
      if (j === i) throw new Error(`task "${t.id}" lists itself as a predecessor`);
      seen.add(j);
    }
    return [...seen];
  });
  // Kahn's algorithm, smallest typed position first.
  const indeg = preds0.map(p => p.length);
  const succ0 = Array.from({ length: n0 }, () => []);
  preds0.forEach((ps, i) => ps.forEach(p => succ0[p].push(i)));
  const order = [];
  const ready = [];
  for (let i = 0; i < n0; i++) if (indeg[i] === 0) ready.push(i);
  while (ready.length) {
    ready.sort((a, b) => a - b);
    const v = ready.shift();
    order.push(v);
    for (const s of succ0[v]) if (--indeg[s] === 0) ready.push(s);
  }
  if (order.length !== n0) {
    const stuck = list.filter((_, i) => indeg[i] > 0).map(t => t.id).slice(0, 6);
    throw new Error(`the precedence relations form a loop (involving ${stuck.join(', ')})`);
  }
  // Renumber in a second topological pass that takes the ready task with the
  // largest positional weight (its time plus all its followers' time) first,
  // so the search, which enumerates loads in task-number order, meets the
  // tasks that hold up the most work first.
  {
    const W0 = (n0 + 31) >>> 5;
    const d0 = Array.from({ length: n0 }, () => new Uint32Array(W0));
    for (let k = n0 - 1; k >= 0; k--) { const v = order[k]; for (const s of succ0[v]) { d0[v][s >>> 5] |= 1 << (s & 31); orInto(d0[v], d0[s]); } }
    const tt = list.map(x => Number(x.time));
    const pw = d0.map((b, v) => tt[v] + sumBits(b, tt));
    const deg = preds0.map(p => p.length);
    const rd = [];
    for (let i = 0; i < n0; i++) if (deg[i] === 0) rd.push(i);
    order.length = 0;
    while (rd.length) {
      let b = 0;
      for (let i = 1; i < rd.length; i++) if (pw[rd[i]] > pw[rd[b]] || (pw[rd[i]] === pw[rd[b]] && rd[i] < rd[b])) b = i;
      const v = rd.splice(b, 1)[0];
      order.push(v);
      for (const s of succ0[v]) if (--deg[s] === 0) rd.push(s);
    }
  }
  const pos = new Array(n0);
  order.forEach((v, k) => { pos[v] = k; });
  const n = n0;
  const t = order.map(v => Math.round(Number(list[v].time) * scale));
  const preds = order.map(v => preds0[v].map(p => pos[p]).sort((a, b) => a - b));
  const succ = Array.from({ length: n }, () => []);
  preds.forEach((ps, j) => ps.forEach(p => succ[p].push(j)));
  // Transitive closures (as bitsets in Uint32 words) and head/tail work.
  const W = (n + 31) >>> 5;
  const anc = Array.from({ length: n }, () => new Uint32Array(W));
  for (let j = 0; j < n; j++) for (const p of preds[j]) { anc[j][p >>> 5] |= 1 << (p & 31); orInto(anc[j], anc[p]); }
  const desc = Array.from({ length: n }, () => new Uint32Array(W));
  for (let j = n - 1; j >= 0; j--) for (const s of succ[j]) { desc[j][s >>> 5] |= 1 << (s & 31); orInto(desc[j], desc[s]); }
  const head = anc.map(b => sumBits(b, t));
  const tail = desc.map(b => sumBits(b, t));
  const ids = order.map(v => String(list[v].id).trim());
  const names = order.map(v => list[v].name || '');
  const total = t.reduce((a, b) => a + b, 0);
  return { n, W, t, preds, succ, anc, desc, head, tail, ids, names, total, scale, order };
}

function orInto(a, b) { for (let w = 0; w < a.length; w++) a[w] |= b[w]; }
function sumBits(bits, t) {
  let s = 0;
  for (let w = 0; w < bits.length; w++) {
    let x = bits[w];
    while (x) { const b = x & -x; const i = (w << 5) + (31 - Math.clz32(b)); s += t[i]; x ^= b; }
  }
  return s;
}
function popcount(bits) {
  let c = 0;
  for (let w = 0; w < bits.length; w++) { let x = bits[w]; x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); c += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
  return c;
}

// --------------------------------------------------------------- bounds

/** Lower bounds on the number of stations for cycle time c (integer units). */
export function stationBounds(P, c) {
  const lb1 = Math.ceil(P.total / c);
  let big = 0, half = 0, w6 = 0;
  for (const x of P.t) {
    if (2 * x > c) big++;
    else if (2 * x === c) half++;
    // LB3 weights in sixths: >2c/3 -> 6, =2c/3 -> 4, (c/3, 2c/3) -> 3, =c/3 -> 2.
    if (3 * x > 2 * c) w6 += 6;
    else if (3 * x === 2 * c) w6 += 4;
    else if (3 * x > c) w6 += 3;
    else if (3 * x === c) w6 += 2;
  }
  const lb2 = big + Math.ceil(half / 2);
  const lb3 = Math.ceil(w6 / 6);
  let lb4 = 0;
  for (let j = 0; j < P.n; j++) lb4 = Math.max(lb4, Math.ceil((P.head[j] + P.t[j]) / c));
  return { lb1, lb2, lb3, lb4, lb: Math.max(lb1, lb2, lb3, lb4, 1) };
}

// ----------------------------------------------------------- heuristics

const RULES = {
  'positional weight': P => P.t.map((x, j) => x + P.tail[j]),
  'most followers': P => P.desc.map(b => popcount(b)),
  'longest task': P => P.t.slice(),
  'longest path': P => {
    const L = new Array(P.n).fill(0);
    for (let j = P.n - 1; j >= 0; j--) { let m = 0; for (const s of P.succ[j]) m = Math.max(m, L[s]); L[j] = P.t[j] + m; }
    return L;
  },
};

function reversed(P) {
  // Reverse the graph and renumber so the order stays topological (j -> n-1-j).
  const n = P.n, r = j => n - 1 - j;
  const t = P.t.slice().reverse();
  const preds = Array.from({ length: n }, (_, j) => P.succ[r(j)].map(r).sort((a, b) => a - b));
  const succ = Array.from({ length: n }, (_, j) => P.preds[r(j)].map(r).sort((a, b) => a - b));
  const W = P.W;
  const flip = bits => { const o = new Uint32Array(W); for (let i = 0; i < n; i++) if (bits[i >>> 5] & (1 << (i & 31))) { const k = r(i); o[k >>> 5] |= 1 << (k & 31); } return o; };
  const anc = Array.from({ length: n }, (_, j) => flip(P.desc[r(j)]));
  const desc = Array.from({ length: n }, (_, j) => flip(P.anc[r(j)]));
  return { ...P, t, preds, succ, anc, desc, head: P.tail.slice().reverse(), tail: P.head.slice().reverse(), ids: P.ids.slice().reverse(), names: P.names.slice().reverse(), reversedFrom: P };
}

/** Station-oriented priority rule: fill each station with the highest-priority task that fits. */
function priorityBalance(P, c, prio) {
  const n = P.n;
  const left = P.preds.map(p => p.length);
  const done = new Uint8Array(n);
  const station = new Int32Array(n);
  let k = 0, cap = 0, placed = 0;
  while (placed < n) {
    let best = -1;
    for (let j = 0; j < n; j++) {
      if (done[j] || left[j] || P.t[j] > cap) continue;
      if (best < 0 || prio[j] > prio[best] || (prio[j] === prio[best] && j < best)) best = j;
    }
    if (best < 0) { k++; cap = c; continue; }
    done[best] = 1; station[best] = k; cap -= P.t[best]; placed++;
    for (const s of P.succ[best]) left[s]--;
  }
  return { m: k, station };
}

function fromReversed(P, res) {
  // A balance of the reversed graph, read backwards, is a balance of the original.
  const n = P.n, st = new Int32Array(n);
  for (let j = 0; j < n; j++) st[j] = res.m + 1 - res.station[n - 1 - j];
  return { m: res.m, station: st };
}

/** Best of the priority rules, forwards and backwards. Stations are numbered from 1. */
export function heuristicBalance(P, c) {
  const R = reversed(P);
  let best = null;
  for (const [name, rule] of Object.entries(RULES)) {
    const f = priorityBalance(P, c, rule(P));
    if (!best || f.m < best.m) best = { ...f, rule: name, direction: 'forward' };
    const b = fromReversed(P, priorityBalance(R, c, rule(R)));
    if (b.m < best.m) best = { ...b, rule: name, direction: 'backward' };
  }
  return best;
}

// ---------------------------------------------------------- exact search

class Budget {
  constructor(limits) {
    this.maxNodes = limits.nodes; this.deadline = Date.now() + limits.ms; this.nodes = 0; this.out = false;
  }
  tick() {
    if (++this.nodes > this.maxNodes) this.out = true;
    else if ((this.nodes & 4095) === 0 && Date.now() > this.deadline) this.out = true;
    return this.out;
  }
}

/** Binary min-heap on (idle, -weight). */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(x, y) { return x.idle < y.idle || (x.idle === y.idle && x.w > y.w); }
  push(v) {
    const a = this.a; a.push(v);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

/**
 * Is there a balance with at most m stations at cycle time c? Returns the
 * station of each task (1-based), false when proven impossible, or null
 * when the budget ran out first.
 *
 * A state is the set of tasks already assigned to stations 1..k. Expanding it
 * enumerates the maximal loads of station k+1 that keep the total idle time
 * within what m stations allow. States are explored by cyclic best-first
 * search (one state per station level per cycle, least idle first) and every
 * set of assigned tasks is stored once, at the fewest stations that reach it
 * (Sewell and Jacobson 2012).
 */
function feasible(P, c, m, budget) {
  const n = P.n, t = P.t, succ = P.succ, W = P.W;
  const idleBudget = m * c - P.total;
  if (idleBudget < 0) return false;
  const latest = new Int32Array(n);
  for (let j = 0; j < n; j++) {
    if (t[j] > c) return false;
    latest[j] = m - Math.ceil((t[j] + P.tail[j]) / c) + 1;
    if (Math.ceil((t[j] + P.head[j]) / c) > latest[j]) return false;
  }
  const weight = P.t.map((x, j) => x + P.tail[j]); // positional weight, to break ties
  const done = new Uint8Array(n);
  const left = new Int32Array(n);
  const seen = new Map(); // assigned-set key -> fewest stations that reach it
  const keyOf = bits => { let s = ''; for (let w = 0; w < W; w++) s += String.fromCharCode(bits[w] & 0xffff, bits[w] >>> 16); return s; };
  const levels = Array.from({ length: m + 1 }, () => new Heap());
  levels[0].push({ bits: new Uint32Array(W), k: 0, time: 0, count: 0, idle: 0, w: 0, parent: null, load: null });

  const finish = state => {
    const station = new Int32Array(n);
    for (let s = state; s && s.load; s = s.parent) for (const j of s.load) station[j] = s.k;
    return station;
  };

  // Restore the shared arrays to a state plus the load chosen so far.
  function restore(st, chosen) {
    for (let j = 0; j < n; j++) { done[j] = (st.bits[j >>> 5] >>> (j & 31)) & 1; left[j] = 0; }
    for (let j = 0; j < n; j++) if (!done[j]) for (const s of succ[j]) left[s]++;
    for (const j of chosen) { done[j] = 1; for (const s of succ[j]) left[s]--; }
  }

  // Cheap checks before a state's loads are enumerated: a task already past
  // its latest station, or too many long tasks for the stations left.
  function viable(st) {
    const k = st.k + 1;
    let big = 0, half = 0, w6 = 0;
    for (let j = 0; j < n; j++) {
      if ((st.bits[j >>> 5] >>> (j & 31)) & 1) continue;
      if (latest[j] < k) return false;
      const x = t[j];
      if (2 * x > c) big++; else if (2 * x === c) half++;
      if (3 * x > 2 * c) w6 += 6; else if (3 * x === 2 * c) w6 += 4; else if (3 * x > c) w6 += 3; else if (3 * x === c) w6 += 2;
    }
    const stationsLeft = m - k + 1;
    return big + Math.ceil(half / 2) <= stationsLeft && Math.ceil(w6 / 6) <= stationsLeft;
  }

  const need = new Float64Array(n);
  // The maximal loads of station k+1 that keep total idle within budget, in
  // increasing task number (the numbering is topological, so each feasible
  // load comes out exactly once). A generator, so a state can be expanded a
  // few children at a time and resumed later. The caller restores the shared
  // arrays before each resume.
  function* loadsOf(st, chosen) {
    const k = st.k + 1;
    const slack = idleBudget - st.idle;
    const remainingWork = P.total - st.time;
    function* gen(last, load) {
      budget.tick();
      if (budget.out) return;
      const cap = c - load;
      let fits = false, reach = 0;
      // need[j]: the least work that putting j in this load would take
      // (j plus the longest chain of its unplaced predecessors); a task whose
      // need exceeds the room left cannot join.
      for (let j = 0; j < n; j++) {
        if (done[j]) { need[j] = 0; continue; }
        let mx = 0;
        for (const p of P.preds[j]) if (!done[p] && need[p] > mx) mx = need[p];
        need[j] = j > last ? t[j] + mx : Infinity;
        if (!left[j] && t[j] <= cap) fits = true;
        if (j > last && need[j] <= cap) reach += t[j];
      }
      // Not even every later task that could join would fill the station
      // enough, and this cannot be the last station: nothing here is usable.
      if (load + Math.min(reach, cap) < c - slack && load + reach < remainingWork) return;
      if (fits) {
        for (let j = last + 1; j < n; j++) {
          if (done[j] || left[j] || t[j] > cap) continue;
          done[j] = 1; for (const s of succ[j]) left[s]--; chosen.push(j);
          yield* gen(j, load + t[j]);
          chosen.pop(); done[j] = 0; for (const s of succ[j]) left[s]++;
          if (budget.out) return;
        }
        return; // a load to which some task still fits is not maximal
      }
      const finished = st.count + chosen.length === n;
      if (cap > slack && !finished) return;
      if (!finished) for (let j = 0; j < n; j++) if (!done[j] && latest[j] <= k) return; // due now
      let w = 0;
      for (const j of chosen) w += weight[j];
      yield { load: chosen.slice(), time: load, w, finished };
    }
    yield* gen(-1, 0);
  }

  const CHUNK = 8; // children taken from a state each time it is popped
  for (;;) {
    let any = false;
    for (let k = 0; k < m; k++) {
      if (!levels[k].size) continue;
      any = true;
      const st = levels[k].pop();
      if (!st.it) {
        if (!viable(st)) continue;
        st.chosen = [];
        st.it = loadsOf(st, st.chosen);
      }
      let taken = 0, exhausted = false;
      restore(st, st.chosen);
      while (taken < CHUNK) {
        const r = st.it.next();
        if (budget.out) return null;
        if (r.done) { exhausted = true; break; }
        taken++;
        const kid = r.value;
        const bits = st.bits.slice();
        for (const j of kid.load) bits[j >>> 5] |= 1 << (j & 31);
        const node = { bits, k: k + 1, time: st.time + kid.time, count: st.count + kid.load.length, w: kid.w, parent: st, load: kid.load };
        node.idle = node.k * c - node.time;
        if (kid.finished) return finish(node);
        const key = keyOf(bits);
        const prev = seen.get(key);
        if (prev !== undefined && prev <= node.k) continue;
        seen.set(key, node.k);
        levels[node.k].push(node);
      }
      // Put a partly expanded state back, behind its unexpanded siblings'
      // best: it re-enters with the idle of the worst child it could still give.
      if (!exhausted) levels[k].push(st);
      else { st.it = null; st.chosen = null; st.done = true; }
    }
    if (!any) return false;
  }
}

/** SALBP-1 on a prepared problem with an integer cycle time. */
function solveType1(P, c, limits) {
  const bounds = stationBounds(P, c);
  // exactOnly (for tests): start from one task per station, so the exact
  // search alone must find and prove the answer.
  const h = limits.exactOnly
    ? { m: P.n, station: Int32Array.from({ length: P.n }, (_, j) => j + 1), rule: 'one task per station', direction: 'forward' }
    : heuristicBalance(P, c);
  let ub = h.m, best = h.station, how = `${h.rule} rule (${h.direction})`;
  let lb = bounds.lb;
  const budget = new Budget(limits);
  budget.backwardOnly = !!limits.backwardOnly; // for tests: search the reversed graph only
  let R = null;
  while (lb < ub) {
    const r = feasibleEitherWay(P, () => (R ??= reversed(P)), c, lb, budget);
    if (r === null) break;
    if (r === false) { lb++; continue; }
    ub = lb; best = r; how = 'branch and bound';
  }
  return { m: ub, lb, station: best, optimal: lb === ub, how, nodes: budget.nodes, bounds };
}

/**
 * Feasibility forwards with half the remaining budget, then on the reversed
 * graph with the rest (the bidirectional idea of SALOME, Scholl and Klein
 * 1997, in its simplest form: some lines are far easier to fill from the end).
 */
function feasibleEitherWay(P, getR, c, m, budget) {
  const half = new Budget({ nodes: Math.floor((budget.maxNodes - budget.nodes) / 2), ms: Math.max(0, (budget.deadline - Date.now()) / 2) });
  let r = null;
  if (!budget.backwardOnly) {
    r = feasible(P, c, m, half);
    budget.nodes += half.nodes;
    if (r !== null) return r;
  }
  const rest = new Budget({ nodes: budget.maxNodes - budget.nodes, ms: Math.max(0, budget.deadline - Date.now()) });
  const R = getR();
  r = feasible(R, c, m, rest);
  budget.nodes += rest.nodes;
  if (r === null) { budget.out = true; return null; }
  if (r === false) return false;
  const st = new Int32Array(P.n);
  const used = Math.max(...r);
  for (let j = 0; j < P.n; j++) st[j] = used + 1 - r[P.n - 1 - j];
  return st;
}

// -------------------------------------------------------------- reports

function stationsReport(P, c, station, m) {
  const out = Array.from({ length: m }, (_, i) => ({ station: i + 1, tasks: [], load: 0 }));
  const typed = Array.from({ length: P.n }, (_, j) => j).sort((a, b) => P.order[a] - P.order[b]);
  for (const j of typed) { const s = out[station[j] - 1]; s.tasks.push(P.ids[j]); s.load += P.t[j]; }
  const max = Math.max(...out.map(s => s.load));
  const smooth = Math.sqrt(out.reduce((a, s) => a + (max - s.load) ** 2, 0));
  const sc = P.scale;
  return {
    stations: out.map(s => ({ station: s.station, tasks: s.tasks, load: s.load / sc, idle: (c - s.load) / sc })),
    efficiency: P.total / (m * c),
    balanceDelay: 1 - P.total / (m * c),
    smoothnessIndex: smooth / sc,
    bottleneck: max / sc,
  };
}

/** Throw unless `station` (by task id) is a valid balance at cycle time c. */
export function checkBalance(problem, assignment, cycleTime) {
  const loads = new Map();
  for (const t of problem.tasks) {
    const s = assignment[String(t.id)];
    if (!Number.isInteger(s) || s < 1) throw new Error(`task ${t.id} has no station`);
    loads.set(s, (loads.get(s) || 0) + Number(t.time));
    for (const p of t.predecessors || []) if (assignment[String(p)] > s) throw new Error(`task ${t.id} is before its predecessor ${p}`);
  }
  for (const [s, load] of loads) if (load > cycleTime + 1e-9) throw new Error(`station ${s} load ${load} exceeds ${cycleTime}`);
  return Math.max(...loads.keys());
}

function assignmentById(P, station) {
  const a = {};
  for (let j = 0; j < P.n; j++) a[P.ids[j]] = station[j];
  return a;
}

/**
 * SALBP-1: fewest stations for a cycle time.
 * problem: { tasks: [{id, time, predecessors, name?}], cycleTime }
 */
export function minimizeStations(problem, limits = DEFAULT_LIMITS) {
  const P = prepare(problem);
  const c = Math.round(Number(problem.cycleTime) * P.scale);
  if (!Number.isFinite(c) || c <= 0) throw new Error('cycle time must be above zero');
  const longest = Math.max(...P.t);
  if (longest > c) {
    const j = P.t.indexOf(longest);
    throw new Error(`task "${P.ids[j]}" takes ${longest / P.scale}, longer than the cycle time ${c / P.scale}: split it or raise the cycle time`);
  }
  const t0 = Date.now();
  const r = solveType1(P, c, { ...DEFAULT_LIMITS, ...limits });
  return {
    type: 'SALBP-1',
    cycleTime: c / P.scale,
    stationCount: r.m,
    lowerBound: r.lb,
    optimal: r.optimal,
    method: r.how,
    bounds: r.bounds,
    nodes: r.nodes,
    ms: Date.now() - t0,
    totalWork: P.total / P.scale,
    assignment: assignmentById(P, r.station),
    ...stationsReport(P, c, r.station, r.m),
  };
}

/** SALBP-2: shortest cycle time for a number of stations. */
export function minimizeCycleTime(problem, stations, limits = DEFAULT_LIMITS) {
  const P = prepare(problem);
  const m = Number(stations);
  if (!Number.isInteger(m) || m < 1) throw new Error('number of stations must be a whole number from 1');
  const lim = { ...DEFAULT_LIMITS, ...limits };
  const t0 = Date.now();
  const longest = Math.max(...P.t);
  let lo = Math.max(longest, Math.ceil(P.total / m));
  // LB from the m+1 longest tasks: two of them share a station.
  if (P.n > m) {
    const s = P.t.slice().sort((a, b) => b - a);
    lo = Math.max(lo, s[m - 1] + s[m]);
  }
  // Heuristic upper bound: the smallest c at which a priority rule needs <= m stations.
  let hi = Math.max(lo, P.total);
  let hiStation = heuristicBalance(P, hi).station;
  {
    let a = lo, b = hi;
    while (a < b) {
      const mid = Math.floor((a + b) / 2);
      const h = heuristicBalance(P, mid);
      if (h.m <= m) { b = mid; hiStation = h.station; } else a = mid + 1;
    }
    hi = b;
    if (a === b) hiStation = heuristicBalance(P, hi).station;
  }
  const budget = new Budget(lim);
  let R = null;
  let how = 'priority rules';
  // Binary search on c with the exact feasibility test (feasibility is monotone in c).
  let a = lo, b = hi;
  let stuck = false;
  while (a < b) {
    const mid = Math.floor((a + b) / 2);
    const r = feasibleEitherWay(P, () => (R ??= reversed(P)), mid, m, budget);
    if (r === null) { stuck = true; break; }
    if (r === false) a = mid + 1;
    else { b = mid; hiStation = r; how = 'branch and bound'; }
  }
  const c = b;
  const used = Math.max(...hiStation);
  return {
    type: 'SALBP-2',
    stationsGiven: m,
    cycleTime: c / P.scale,
    lowerBound: (stuck ? a : c) / P.scale,
    optimal: !stuck,
    method: how,
    nodes: budget.nodes,
    ms: Date.now() - t0,
    totalWork: P.total / P.scale,
    assignment: assignmentById(P, hiStation),
    stationsUsed: used,
    ...stationsReport(P, c, hiStation, m),
  };
}

/** Cycle time (takt) from available time and demand over the same period. */
export function taktTime(availableTime, demand) {
  const a = Number(availableTime), d = Number(demand);
  if (!(a > 0) || !(d > 0)) throw new Error('available time and demand must both be above zero');
  return a / d;
}

/** Jackson's (1956) 11-task example (times and direct precedences), as in Scholl's 1993 data set. */
export const EXAMPLE = {
  cycleTime: 10,
  tasks: [
    { id: '1', time: 6, predecessors: [] },
    { id: '2', time: 2, predecessors: ['1'] },
    { id: '3', time: 5, predecessors: ['1'] },
    { id: '4', time: 7, predecessors: ['1'] },
    { id: '5', time: 1, predecessors: ['1'] },
    { id: '6', time: 2, predecessors: ['2'] },
    { id: '7', time: 3, predecessors: ['3', '4', '5'] },
    { id: '8', time: 6, predecessors: ['6'] },
    { id: '9', time: 5, predecessors: ['7'] },
    { id: '10', time: 5, predecessors: ['8'] },
    { id: '11', time: 4, predecessors: ['9', '10'] },
  ],
};

/** The papers this engine implements, as the research-tools convention asks (portfolio/research-tools/README.md). */
export const PAPERS = [
  { authors: 'J. R. Jackson', title: 'A computing procedure for a line balancing problem', venue: 'Management Science 2(3)', year: 1956, url: 'https://doi.org/10.1287/mnsc.2.3.261', doi: '10.1287/mnsc.2.3.261', implemented: 'search over maximal station loads only', deviations: 'none' },
  { authors: 'W. B. Helgeson, D. P. Birnie', title: 'Assembly line balancing using the ranked positional weight technique', venue: 'Journal of Industrial Engineering 12(6)', year: 1961, url: null, implemented: 'ranked positional weight priority rule', deviations: 'also run on the reversed line; three further priority rules alongside' },
  { authors: 'A. Scholl, R. Klein', title: 'SALOME: A bidirectional branch and bound procedure for assembly line balancing', venue: 'INFORMS Journal on Computing 9(4)', year: 1997, url: 'https://doi.org/10.1287/ijoc.9.4.319', doi: '10.1287/ijoc.9.4.319', implemented: 'lower bounds LB1-LB3, earliest/latest stations, searching forwards and on the reversed line', deviations: 'the direction is not chosen per node as in SALOME: half the budget goes to each direction' },
  { authors: 'E. C. Sewell, S. H. Jacobson', title: 'A branch, bound, and remember algorithm for the simple assembly line balancing problem', venue: 'INFORMS Journal on Computing 24(3)', year: 2012, url: 'https://doi.org/10.1287/ijoc.1110.0462', doi: '10.1287/ijoc.1110.0462', implemented: 'cyclic best-first search over station levels with every set of placed tasks remembered', deviations: 'simpler bounds and dominance rules than the paper; states expanded a few children at a time' },
];

/** One call for agents and the research-tools convention: { tasks, cycleTime } or { tasks, stations }. */
export function analyze(input, limits) {
  const r = input?.stations != null && input?.cycleTime == null
    ? minimizeCycleTime(input, input.stations, limits)
    : minimizeStations(input, limits);
  const pct = x => `${(100 * x).toFixed(1)}%`;
  const summary = r.type === 'SALBP-1'
    ? `${r.stationCount} stations at cycle time ${r.cycleTime} (${r.optimal ? 'proved the fewest possible' : `best found; at least ${r.lowerBound} are needed`}); line efficiency ${pct(r.efficiency)}.`
    : `Cycle time ${r.cycleTime} on ${r.stationsGiven} stations (${r.optimal ? 'proved the shortest possible' : `best found; nothing below ${r.lowerBound} works`}); line efficiency ${pct(r.efficiency)}.`;
  return { ...r, summary };
}
