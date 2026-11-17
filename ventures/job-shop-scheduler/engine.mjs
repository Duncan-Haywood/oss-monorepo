// Job shop scheduler: shortest makespan for jobs that each visit machines in a
// fixed order, one job per machine at a time (the classic J||Cmax problem).
//
// Our own implementation of published ideas, credited at the point of use:
// - disjunctive graph, heads and tails: B. Roy and B. Sussmann (1964), and
//   E. Balas, "Machine sequencing via disjunctive graphs", Operations
//   Research 17(6), 1969;
// - active schedules and priority dispatching: B. Giffler and G. L. Thompson,
//   "Algorithms for solving production-scheduling problems", Operations
//   Research 8(4), 1960;
// - tabu search on the N5 neighbourhood (swap the first two or the last two
//   operations of a critical block): E. Nowicki and C. Smutnicki, "A fast
//   taboo search algorithm for the job shop problem", Management Science
//   42(6), 1996; move estimates after E. Taillard, "Parallel taboo search
//   techniques for the job shop scheduling problem", ORSA Journal on
//   Computing 6(2), 1994;
// - the one-machine preemptive lower bound with heads and tails (Jackson's
//   preemptive schedule): J. R. Jackson (1955) and J. Carlier, "The
//   one-machine sequencing problem", European Journal of Operational
//   Research 11(1), 1982.
// Not affiliated with or endorsed by any of these authors.

// A made-up six-job shop where the dispatch rules are seven time units off
// the optimum and the bounds one short of it, so the exact search has work.
export const EXAMPLE = {
  name: 'Six-job machine shop',
  machines: ['Saw', 'Mill', 'Lathe', 'Drill'],
  jobs: [
    { name: 'Bracket', ops: [['Lathe', 7], ['Drill', 4], ['Mill', 7], ['Saw', 4]] },
    { name: 'Shaft', ops: [['Lathe', 7], ['Drill', 3], ['Mill', 7], ['Saw', 6]] },
    { name: 'Flange', ops: [['Drill', 4], ['Mill', 2], ['Saw', 6]] },
    { name: 'Housing', ops: [['Saw', 4], ['Lathe', 6], ['Mill', 5], ['Drill', 7]] },
    { name: 'Pin', ops: [['Lathe', 3], ['Mill', 4], ['Saw', 8]] },
    { name: 'Cover', ops: [['Drill', 2], ['Saw', 2], ['Mill', 5], ['Lathe', 8]] },
  ],
};

// ---------------------------------------------------------------- parsing

const isNum = (s) => /^-?\d+(\.\d+)?$/.test(s);

// Accepts the instance as {machines?, jobs: [{name?, ops: [[machine, time]] | [{machine, time}]}]}
// or jobs as bare arrays of [machine, time]. Machines may be names or numbers.
export function normalize(input) {
  if (!input || !Array.isArray(input.jobs) || input.jobs.length === 0) throw new Error('no jobs given');
  const machineIndex = new Map();
  const machineNames = [];
  const addMachine = (key) => {
    const k = String(key).trim();
    if (!k) throw new Error('an operation has no machine');
    if (!machineIndex.has(k)) { machineIndex.set(k, machineNames.length); machineNames.push(k); }
    return machineIndex.get(k);
  };
  for (const m of input.machines || []) addMachine(m);
  const ops = [];
  const jobs = [];
  const jobNames = [];
  input.jobs.forEach((job, j) => {
    const list = Array.isArray(job) ? job : job.ops;
    if (!Array.isArray(list) || list.length === 0) throw new Error(`job ${j + 1} has no operations`);
    jobNames.push(String((!Array.isArray(job) && job.name) || `Job ${j + 1}`));
    const ids = [];
    list.forEach((op, k) => {
      const machine = Array.isArray(op) ? op[0] : op.machine;
      const time = Number(Array.isArray(op) ? op[1] : op.time);
      if (!Number.isFinite(time) || time < 0) throw new Error(`job ${jobNames[j]}, operation ${k + 1}: time must be a number of 0 or more`);
      ids.push(ops.length);
      ops.push({ id: ops.length, job: j, index: k, machine: addMachine(machine), time });
    });
    jobs.push(ids);
  });
  const machineOps = machineNames.map(() => []);
  for (const o of ops) machineOps[o.machine].push(o.id);
  return { name: input.name || '', jobNames, machineNames, ops, jobs, machineOps };
}

// OR-Library / JSPLIB "standard" format: a line "n m", then one line per job of
// (machine time) pairs, machines numbered from 0. Lines starting with # are comments.
// Also reads Taillard's format: "n m", then n lines of times, then n lines of
// machines numbered from 1 (optionally headed by "Times" and "Machines").
export function parseStandard(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  let start = 0;
  while (start < lines.length && !/^\d+\s+\d+(\s|$)/.test(lines[start])) start++;
  if (start >= lines.length) throw new Error('expected a first line "jobs machines"');
  const [n, m] = lines[start].split(/\s+/).map(Number);
  const rows = lines.slice(start + 1).filter((l) => /^[\d\s.]+$/.test(l)).map((l) => l.split(/\s+/).map(Number));
  if (rows.length >= 2 * n && rows.slice(0, 2 * n).every((r) => r.length === m) && m > 0) {
    const times = rows.slice(0, n);
    const machs = rows.slice(n, 2 * n);
    const oneBased = machs.every((r) => r.every((x) => x >= 1 && x <= m));
    if (oneBased) {
      return {
        machines: Array.from({ length: m }, (_, i) => `M${i}`),
        jobs: times.map((t, j) => ({ name: `J${j}`, ops: t.map((p, k) => [`M${machs[j][k] - 1}`, p]) })),
      };
    }
  }
  if (rows.length < n) throw new Error(`expected ${n} job lines, found ${rows.length}`);
  return {
    machines: Array.from({ length: m }, (_, i) => `M${i}`),
    jobs: rows.slice(0, n).map((r, j) => {
      if (r.length % 2) throw new Error(`job line ${j + 1} has an odd count of numbers`);
      const ops = [];
      for (let k = 0; k < r.length; k += 2) {
        if (r[k] >= m) throw new Error(`job line ${j + 1} names machine ${r[k]}, but there are ${m} (numbered from 0)`);
        ops.push([`M${r[k]}`, r[k + 1]]);
      }
      return { name: `J${j}`, ops };
    }),
  };
}

// Friendly table: one operation per line, "job, machine, time", in each job's
// routing order. A header line is skipped. Commas, tabs or semicolons.
export function parseTable(text) {
  const jobs = new Map();
  const machines = [];
  const seen = new Set();
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const cells = line.split(/\s*[,;\t]\s*/);
    if (cells.length < 3) throw new Error(`line ${i + 1}: expected job, machine, time`);
    const [job, machine, time] = cells;
    if (!isNum(time)) {
      if (jobs.size === 0) return; // header
      throw new Error(`line ${i + 1}: time "${time}" is not a number`);
    }
    if (!jobs.has(job)) jobs.set(job, []);
    jobs.get(job).push([machine, Number(time)]);
    if (!seen.has(machine)) { seen.add(machine); machines.push(machine); }
  });
  if (jobs.size === 0) throw new Error('no operations found');
  return { machines, jobs: [...jobs].map(([name, ops]) => ({ name, ops })) };
}

export function parseAny(text) {
  const firstReal = String(text).split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) || '';
  if (firstReal.startsWith('{')) return JSON.parse(text);
  if (/^\d+\s+\d+\s*$/.test(firstReal) || /^\d+\s+\d+\s+[\d\s]+$/.test(firstReal)) return parseStandard(text);
  return parseTable(text);
}

export function formatTable(input) {
  const p = normalize(input);
  const lines = ['job, machine, time'];
  for (const ids of p.jobs) for (const id of ids) {
    const o = p.ops[id];
    lines.push(`${p.jobNames[o.job]}, ${p.machineNames[o.machine]}, ${o.time}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- random

export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- graph

// Internal compact form: JP/JS job predecessor/successor, p times.
function compile(p) {
  const N = p.ops.length;
  const JP = new Int32Array(N).fill(-1);
  const JS = new Int32Array(N).fill(-1);
  const P = new Float64Array(N);
  const M = new Int32Array(N);
  for (const ids of p.jobs) for (let k = 0; k < ids.length; k++) {
    if (k > 0) JP[ids[k]] = ids[k - 1];
    if (k + 1 < ids.length) JS[ids[k]] = ids[k + 1];
  }
  for (const o of p.ops) { P[o.id] = o.time; M[o.id] = o.machine; }
  return { N, JP, JS, P, M, mCount: p.machineNames.length, p };
}

// A solution is the order of operations on each machine. evaluate() builds the
// machine arcs, takes a topological order and computes heads r (earliest
// start) and tails q (longest path from the end of an operation to the end of
// the schedule). Returns null when the orders contain a cycle.
function evaluate(g, seq, work) {
  const { N, JP, JS, P } = g;
  const MP = work.MP, MS = work.MS, r = work.r, q = work.q, indeg = work.indeg, order = work.order;
  MP.fill(-1); MS.fill(-1);
  for (const s of seq) for (let k = 0; k < s.length; k++) {
    if (k > 0) MP[s[k]] = s[k - 1];
    if (k + 1 < s.length) MS[s[k]] = s[k + 1];
  }
  let head = 0, tail = 0;
  for (let o = 0; o < N; o++) {
    indeg[o] = (JP[o] >= 0 ? 1 : 0) + (MP[o] >= 0 ? 1 : 0);
    if (indeg[o] === 0) order[tail++] = o;
    r[o] = 0;
  }
  while (head < tail) {
    const o = order[head++];
    const end = r[o] + P[o];
    const a = JS[o], b = MS[o];
    if (a >= 0) { if (end > r[a]) r[a] = end; if (--indeg[a] === 0) order[tail++] = a; }
    if (b >= 0) { if (end > r[b]) r[b] = end; if (--indeg[b] === 0) order[tail++] = b; }
  }
  if (tail < N) return null;
  let cmax = 0;
  for (let i = N - 1; i >= 0; i--) {
    const o = order[i];
    let t = 0;
    const a = JS[o], b = MS[o];
    if (a >= 0 && q[a] + P[a] > t) t = q[a] + P[a];
    if (b >= 0 && q[b] + P[b] > t) t = q[b] + P[b];
    q[o] = t;
    if (r[o] + P[o] + t > cmax) cmax = r[o] + P[o] + t;
  }
  return cmax;
}

function workspace(N) {
  return { MP: new Int32Array(N), MS: new Int32Array(N), r: new Float64Array(N), q: new Float64Array(N), indeg: new Int32Array(N), order: new Int32Array(N) };
}

const EPS = 1e-9;

// One critical path, traced back from an operation that ends at the makespan.
// Ties between a job arc and a machine arc are broken at random.
function criticalPath(g, w, cmax, rand) {
  const { N, JP, P } = g;
  const ends = [];
  for (let o = 0; o < N; o++) if (Math.abs(w.r[o] + P[o] - cmax) < EPS && w.q[o] < EPS) ends.push(o);
  let o = ends[Math.floor(rand() * ends.length)];
  const path = [o];
  while (w.r[o] > EPS) {
    const a = JP[o], b = w.MP[o];
    const okA = a >= 0 && Math.abs(w.r[a] + P[a] - w.r[o]) < EPS;
    const okB = b >= 0 && Math.abs(w.r[b] + P[b] - w.r[o]) < EPS;
    o = okA && okB ? (rand() < 0.5 ? a : b) : okA ? a : b;
    path.push(o);
  }
  return path.reverse();
}

// Maximal runs of the critical path joined by machine arcs.
function blocks(path, w) {
  const out = [];
  let cur = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (w.MP[path[i]] === path[i - 1]) cur.push(path[i]);
    else { out.push(cur); cur = [path[i]]; }
  }
  out.push(cur);
  return out;
}

// N5 moves: in each block, swap the first two (except in the first block) and
// the last two (except in the last block). Swapping two adjacent critical
// operations never makes a cycle (van Laarhoven, Aarts and Lenstra 1992).
function n5Moves(bl) {
  const moves = [];
  const B = bl.length;
  for (let i = 0; i < B; i++) {
    const b = bl[i];
    if (b.length < 2) continue;
    if (i > 0) moves.push([b[0], b[1]]);
    if (i < B - 1 && !(i > 0 && b.length === 2)) moves.push([b[b.length - 2], b[b.length - 1]]);
  }
  return moves;
}

// Taillard's estimate of the makespan after swapping adjacent u -> v on one machine.
function estimateSwap(g, w, u, v) {
  const { JP, JS, P } = g;
  const a = w.MP[u], d = w.MS[v];
  const rv = Math.max(JP[v] >= 0 ? w.r[JP[v]] + P[JP[v]] : 0, a >= 0 ? w.r[a] + P[a] : 0);
  const ru = Math.max(JP[u] >= 0 ? w.r[JP[u]] + P[JP[u]] : 0, rv + P[v]);
  const qu = Math.max(JS[u] >= 0 ? w.q[JS[u]] + P[JS[u]] : 0, d >= 0 ? w.q[d] + P[d] : 0);
  const qv = Math.max(JS[v] >= 0 ? w.q[JS[v]] + P[JS[v]] : 0, qu + P[u]);
  return Math.max(rv + P[v] + qv, ru + P[u] + qu);
}

function swapInSeq(g, seq, pos, u, v) {
  const s = seq[g.M[u]];
  const i = pos[u];
  s[i] = v; s[i + 1] = u;
  pos[v] = i; pos[u] = i + 1;
}

function positions(g, seq) {
  const pos = new Int32Array(g.N);
  for (const s of seq) s.forEach((o, i) => { pos[o] = i; });
  return pos;
}

const cloneSeq = (seq) => seq.map((s) => s.slice());

// ---------------------------------------------------------------- bounds

// Preemptive one-machine bound: schedule the operations of one machine with
// release r_j, time p_j and tail q_j, always running the released operation
// with the longest tail (Jackson's preemptive schedule). Its max(C_j + q_j) is
// a lower bound on the makespan (Carlier 1982).
export function preemptiveBound(items) {
  const jobs = items.filter((x) => x.p > 0).map((x) => ({ ...x, left: x.p })).sort((a, b) => a.r - b.r);
  let t = 0, best = 0, i = 0;
  const ready = [];
  for (const x of items) best = Math.max(best, x.r + x.p + x.q);
  while (i < jobs.length || ready.length) {
    if (!ready.length && t < jobs[i].r) t = jobs[i].r;
    while (i < jobs.length && jobs[i].r <= t + EPS) ready.push(jobs[i++]);
    let k = 0;
    for (let j = 1; j < ready.length; j++) if (ready[j].q > ready[k].q) k = j;
    const cur = ready[k];
    const next = i < jobs.length ? jobs[i].r : Infinity;
    const run = Math.min(cur.left, next - t);
    t += run;
    cur.left -= run;
    if (cur.left <= EPS) { ready.splice(k, 1); best = Math.max(best, t + cur.q); }
  }
  return best;
}

export function lowerBounds(input) {
  const p = input.ops ? input : normalize(input);
  const head = new Float64Array(p.ops.length);
  const tail = new Float64Array(p.ops.length);
  let jobBound = 0;
  for (const ids of p.jobs) {
    let s = 0;
    for (const id of ids) { head[id] = s; s += p.ops[id].time; }
    jobBound = Math.max(jobBound, s);
    let t = 0;
    for (let k = ids.length - 1; k >= 0; k--) { tail[ids[k]] = t; t += p.ops[ids[k]].time; }
  }
  const machineLoad = p.machineOps.map((ids) => ids.reduce((a, id) => a + p.ops[id].time, 0));
  const oneMachine = p.machineOps.map((ids) => preemptiveBound(ids.map((id) => ({ r: head[id], p: p.ops[id].time, q: tail[id] }))));
  const loadBound = Math.max(0, ...machineLoad);
  const machineBound = Math.max(0, ...oneMachine);
  return { jobBound, loadBound, machineBound, lowerBound: Math.max(jobBound, loadBound, machineBound), machineLoad, oneMachine };
}

// ---------------------------------------------------------------- dispatch

// Giffler-Thompson active schedule: find the operation that could finish
// first, take the operations on its machine that could start before then, and
// pick one by the rule. Returns the machine orders.
const RULES = {
  // Most work remaining in the job.
  MWKR: (c) => -c.workLeft,
  // Shortest processing time.
  SPT: (c) => c.time,
  // Most operations remaining.
  MOPNR: (c) => -c.opsLeft,
  // Longest processing time.
  LPT: (c) => -c.time,
  // Earliest possible start, then most work remaining.
  FCFS: (c) => c.est * 1e6 - c.workLeft,
};
export const RULE_NAMES = Object.keys(RULES);

function giffler(g, priority, rand) {
  const p = g.p;
  const nJobs = p.jobs.length;
  const next = new Int32Array(nJobs);
  const jobReady = new Float64Array(nJobs);
  const machReady = new Float64Array(g.mCount);
  const workLeft = p.jobs.map((ids) => ids.reduce((a, id) => a + p.ops[id].time, 0));
  const seq = Array.from({ length: g.mCount }, () => []);
  let left = g.N;
  while (left > 0) {
    let bestEct = Infinity, bestM = -1;
    for (let j = 0; j < nJobs; j++) {
      if (next[j] >= p.jobs[j].length) continue;
      const o = p.jobs[j][next[j]];
      const est = Math.max(jobReady[j], machReady[g.M[o]]);
      const ect = est + g.P[o];
      if (ect < bestEct - EPS || (Math.abs(ect - bestEct) < EPS && g.M[o] < bestM)) { bestEct = ect; bestM = g.M[o]; }
    }
    const conflict = [];
    for (let j = 0; j < nJobs; j++) {
      if (next[j] >= p.jobs[j].length) continue;
      const o = p.jobs[j][next[j]];
      if (g.M[o] !== bestM) continue;
      const est = Math.max(jobReady[j], machReady[bestM]);
      if (est < bestEct - EPS || (g.P[o] === 0 && est <= bestEct + EPS)) {
        conflict.push({ o, j, est, time: g.P[o], workLeft: workLeft[j], opsLeft: p.jobs[j].length - next[j] });
      }
    }
    if (!conflict.length) { // only zero-length ops tie at bestEct
      for (let j = 0; j < nJobs; j++) {
        if (next[j] >= p.jobs[j].length) continue;
        const o = p.jobs[j][next[j]];
        if (g.M[o] === bestM) conflict.push({ o, j, est: Math.max(jobReady[j], machReady[bestM]), time: g.P[o], workLeft: workLeft[j], opsLeft: p.jobs[j].length - next[j] });
      }
    }
    let pick = conflict[0], best = Infinity;
    for (const c of conflict) {
      const v = priority(c) + (rand ? rand() * 1e-3 : 0);
      if (v < best) { best = v; pick = c; }
    }
    const end = pick.est + pick.time;
    jobReady[pick.j] = end;
    machReady[bestM] = end;
    workLeft[pick.j] -= pick.time;
    next[pick.j]++;
    seq[bestM].push(pick.o);
    left--;
  }
  return seq;
}

// ---------------------------------------------------------------- tabu search

function tabuSearch(g, startSeq, opts) {
  const { deadline, maxIter, lowerBound, rand, onImprove } = opts;
  const N = g.N;
  const w = workspace(N);
  let seq = cloneSeq(startSeq);
  let pos = positions(g, seq);
  let cur = evaluate(g, seq, w);
  let best = cur, bestSeq = cloneSeq(seq);
  const tabu = new Map();
  const nJ = g.p.jobs.length, nM = g.mCount;
  const L = 10 + Math.floor(nJ / nM);
  const Lmax = nJ <= 2 * nM ? Math.floor(1.4 * L) : Math.floor(1.5 * L);
  const stallLimit = Math.max(2000, 40 * N);
  let iter = 0, stall = 0, restarts = 0;
  while (iter < maxIter && best > lowerBound + EPS) {
    if ((iter & 63) === 0 && Date.now() > deadline) break;
    iter++;
    const path = criticalPath(g, w, cur, rand);
    // A job that visits one machine twice in a row has a job arc inside the
    // block; that pair cannot be swapped.
    let moves = n5Moves(blocks(path, w)).filter(([u, v]) => g.JS[u] !== v);
    if (!moves.length) break; // one block: the schedule meets a machine's bound
    let val = null;
    while (val === null && moves.length) {
      let pick = null, pickVal = Infinity, fallback = null, fallbackAge = Infinity;
      for (const mv of moves) {
        const [u, v] = mv;
        const est = estimateSwap(g, w, u, v);
        // Tabu if a recent move created the arc u -> v this swap would reverse.
        const until = tabu.get(u * N + v) || 0;
        const isTabu = until > iter;
        const score = est + rand() * 1e-6;
        if (!isTabu || est < best - EPS) {
          if (score < pickVal) { pickVal = score; pick = mv; }
        } else if (until < fallbackAge) { fallbackAge = until; fallback = mv; }
      }
      if (!pick) pick = fallback || moves[Math.floor(rand() * moves.length)];
      const [u, v] = pick;
      swapInSeq(g, seq, pos, u, v);
      val = evaluate(g, seq, w);
      if (val === null) {
        // Only possible with recirculating jobs or zero-length operations:
        // undo, and try the next move.
        swapInSeq(g, seq, pos, v, u);
        evaluate(g, seq, w);
        moves = moves.filter((m) => m !== pick);
        continue;
      }
      // After the swap v precedes u; swapping them back is tabu for a while.
      tabu.set(v * N + u, iter + L + Math.floor(rand() * (Lmax - L + 1)));
    }
    if (val === null) break;
    cur = val;
    if (cur < best - EPS) {
      best = cur; bestSeq = cloneSeq(seq); stall = 0;
      if (onImprove) onImprove(best);
    } else if (++stall > stallLimit) {
      // Restart from the best with a few random adjacent swaps on critical blocks.
      restarts++;
      stall = 0;
      seq = cloneSeq(bestSeq);
      pos = positions(g, seq);
      cur = evaluate(g, seq, w);
      tabu.clear();
      const kicks = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < kicks; k++) {
        const ms = n5Moves(blocks(criticalPath(g, w, cur, rand), w)).filter(([a, b]) => g.JS[a] !== b);
        if (!ms.length) break;
        const [a, b] = ms[Math.floor(rand() * ms.length)];
        swapInSeq(g, seq, pos, a, b);
        const c = evaluate(g, seq, w);
        if (c === null) { swapInSeq(g, seq, pos, b, a); cur = evaluate(g, seq, w); } else cur = c;
      }
    }
    if (tabu.size > 4 * N + 1000) {
      for (const [k, t] of tabu) if (t <= iter) tabu.delete(k);
    }
  }
  return { best, bestSeq, iter, restarts };
}

// ---------------------------------------------------------------- exact search

// Depth-first branch and bound over Giffler-Thompson conflict sets (every
// problem has an optimal active schedule), pruned by the preemptive
// one-machine bound on the operations not yet scheduled. Exact when it
// finishes within the limits.
function branchAndBound(g, ub, ubSeq, opts) {
  const { deadline, maxNodes, lowerBound } = opts;
  const p = g.p;
  const nJobs = p.jobs.length;
  const tailAfter = new Float64Array(g.N);
  for (const ids of p.jobs) { let t = 0; for (let k = ids.length - 1; k >= 0; k--) { tailAfter[ids[k]] = t; t += g.P[ids[k]]; } }
  const next = new Int32Array(nJobs);
  const jobReady = new Float64Array(nJobs);
  const machReady = new Float64Array(g.mCount);
  const seq = Array.from({ length: g.mCount }, () => []);
  let best = ub, bestSeq = ubSeq ? cloneSeq(ubSeq) : null;
  let nodes = 0, aborted = false;
  const byMachine = Array.from({ length: g.mCount }, () => []);

  function bound() {
    for (const b of byMachine) b.length = 0;
    let lb = 0;
    for (let j = 0; j < nJobs; j++) {
      let t = jobReady[j];
      const ids = p.jobs[j];
      for (let k = next[j]; k < ids.length; k++) {
        const o = ids[k];
        const r = Math.max(t, machReady[g.M[o]]);
        byMachine[g.M[o]].push({ r, p: g.P[o], q: tailAfter[o] });
        t = r + g.P[o];
      }
      if (t > lb) lb = t;
    }
    for (let m = 0; m < g.mCount; m++) {
      if (byMachine[m].length) lb = Math.max(lb, preemptiveBound(byMachine[m]));
      else lb = Math.max(lb, machReady[m]);
    }
    return lb;
  }

  function dfs(left) {
    if (aborted) return;
    if (++nodes > maxNodes || ((nodes & 255) === 0 && Date.now() > deadline)) { aborted = true; return; }
    if (left === 0) {
      const c = Math.max(...machReady);
      if (c < best - EPS) { best = c; bestSeq = cloneSeq(seq); }
      return;
    }
    if (bound() >= best - EPS) return;
    let bestEct = Infinity, bestM = -1;
    for (let j = 0; j < nJobs; j++) {
      if (next[j] >= p.jobs[j].length) continue;
      const o = p.jobs[j][next[j]];
      const ect = Math.max(jobReady[j], machReady[g.M[o]]) + g.P[o];
      if (ect < bestEct - EPS) { bestEct = ect; bestM = g.M[o]; }
    }
    const conflict = [];
    for (let j = 0; j < nJobs; j++) {
      if (next[j] >= p.jobs[j].length) continue;
      const o = p.jobs[j][next[j]];
      if (g.M[o] !== bestM) continue;
      const est = Math.max(jobReady[j], machReady[bestM]);
      if (est < bestEct - EPS || est + g.P[o] <= bestEct + EPS) conflict.push({ o, j, est, tail: tailAfter[o] + g.P[o] });
    }
    // Longest remaining job first: good schedules early, tighter pruning.
    conflict.sort((a, b) => b.tail - a.tail);
    for (const c of conflict) {
      const pj = jobReady[c.j], pm = machReady[bestM];
      const end = c.est + g.P[c.o];
      jobReady[c.j] = end; machReady[bestM] = end; next[c.j]++; seq[bestM].push(c.o);
      dfs(left - 1);
      seq[bestM].pop(); next[c.j]--; jobReady[c.j] = pj; machReady[bestM] = pm;
      if (aborted || best <= lowerBound + EPS) return;
    }
  }
  dfs(g.N);
  return { best, bestSeq, nodes, complete: !aborted };
}

// ---------------------------------------------------------------- schedule

function scheduleFromSeq(g, seq) {
  const w = workspace(g.N);
  const cmax = evaluate(g, seq, w);
  if (cmax === null) throw new Error('internal: machine orders contain a cycle');
  const p = g.p;
  const ops = p.ops.map((o) => ({
    job: p.jobNames[o.job], jobIndex: o.job, step: o.index + 1, machine: p.machineNames[o.machine], machineIndex: o.machine,
    start: w.r[o.id], end: w.r[o.id] + o.time, time: o.time,
  }));
  return { makespan: cmax, ops };
}

// Independent check of a schedule: every operation present once with its own
// time, each job's steps in order, no two operations overlapping on a
// machine. Shares no code with the search. Returns the makespan.
export function checkSchedule(input, ops) {
  const p = input.ops ? input : normalize(input);
  if (ops.length !== p.ops.length) throw new Error(`schedule has ${ops.length} operations, problem has ${p.ops.length}`);
  const byJob = new Map();
  const byMachine = new Map();
  for (const o of ops) {
    if (!(o.start >= -EPS) || Math.abs(o.end - o.start - o.time) > 1e-6) throw new Error(`bad times on ${o.job} step ${o.step}`);
    const key = `${o.jobIndex}:${o.step}`;
    if (byJob.has(key)) throw new Error(`duplicate ${key}`);
    byJob.set(key, o);
    if (!byMachine.has(o.machineIndex)) byMachine.set(o.machineIndex, []);
    byMachine.get(o.machineIndex).push(o);
  }
  let cmax = 0;
  p.jobs.forEach((ids, j) => {
    let t = 0;
    ids.forEach((id, k) => {
      const o = byJob.get(`${j}:${k + 1}`);
      if (!o) throw new Error(`missing job ${j} step ${k + 1}`);
      if (o.machineIndex !== p.ops[id].machine || Math.abs(o.time - p.ops[id].time) > 1e-9) throw new Error(`job ${j} step ${k + 1} is on the wrong machine or has the wrong time`);
      if (o.start < t - 1e-6) throw new Error(`job ${p.jobNames[j]} step ${k + 1} starts before step ${k} ends`);
      t = o.end;
    });
    cmax = Math.max(cmax, t);
  });
  for (const [m, list] of byMachine) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < list.length; i++) if (list[i].start < list[i - 1].end - 1e-6 && list[i - 1].time > 0 && list[i].time > 0) throw new Error(`machine ${p.machineNames[m]} runs two operations at once at ${list[i].start}`);
  }
  return cmax;
}

// ---------------------------------------------------------------- solve

// Node cap on the exact search tried before tabu on small shops.
const QUICK_NODES = 2000;

// solve(instance, {ms, seed, iterations, nodes}) -> the shortest schedule found,
// the proved lower bound, and whether it is proved optimal.
export function solve(input, limits = {}) {
  const t0 = Date.now();
  const ms = limits.ms ?? 2000;
  const deadline = t0 + ms;
  const rand = rng(limits.seed ?? 12345);
  const p = normalize(input);
  const g = compile(p);
  const lb = lowerBounds(p);
  const w = workspace(g.N);
  let best = Infinity, bestSeq = null, method = '';
  const dispatch = {};
  for (const name of RULE_NAMES) {
    const seq = giffler(g, RULES[name], null);
    const c = evaluate(g, seq, w);
    dispatch[name] = c;
    if (c < best - EPS) { best = c; bestSeq = seq; method = `dispatch rule ${name}`; }
  }
  let lowerBound = lb.lowerBound;
  let optimal = best <= lowerBound + EPS;
  let tabuIter = 0, restarts = 0, nodes = 0, exactComplete = false;
  const small = g.N <= 64;
  if (!optimal && small) {
    // A capped exact search first: most small shops are settled within
    // QUICK_NODES nodes, so the tabu run's 300 ms only goes to the shops this
    // cannot finish. It reads no random numbers, so the tabu run below sees
    // the same seed stream.
    const quick = branchAndBound(g, best, bestSeq, { deadline, maxNodes: Math.min(limits.nodes ?? Infinity, QUICK_NODES), lowerBound });
    nodes += quick.nodes;
    if (quick.best < best - EPS) { best = quick.best; bestSeq = quick.bestSeq; method = 'branch and bound'; }
    if (quick.complete) { optimal = true; exactComplete = true; lowerBound = best; }
  }
  if (!optimal) {
    // Small shops: a short tabu run for a good bound, then the exact search.
    const tsDeadline = small ? t0 + Math.min(ms * 0.4, 300) : deadline;
    const ts = tabuSearch(g, bestSeq, { deadline: tsDeadline, maxIter: limits.iterations ?? Infinity, lowerBound, rand });
    tabuIter = ts.iter; restarts = ts.restarts;
    if (ts.best < best - EPS) { best = ts.best; bestSeq = ts.bestSeq; method = 'tabu search (N5)'; }
    optimal = best <= lowerBound + EPS;
  }
  if (!optimal && small && Date.now() < deadline) {
    const bb = branchAndBound(g, best, bestSeq, { deadline, maxNodes: limits.nodes != null ? Math.max(0, limits.nodes - nodes) : Infinity, lowerBound });
    nodes += bb.nodes;
    exactComplete = bb.complete;
    if (bb.best < best - EPS) { best = bb.best; bestSeq = bb.bestSeq; method = 'branch and bound'; }
    if (bb.complete) { optimal = true; lowerBound = best; }
  }
  const sched = scheduleFromSeq(g, bestSeq);
  const makespan = sched.makespan;
  const machines = p.machineNames.map((name, m) => {
    const busy = lb.machineLoad[m];
    return { machine: name, busy, idle: makespan - busy, utilization: makespan > 0 ? busy / makespan : 0, sequence: bestSeq[m].map((id) => `${p.jobNames[p.ops[id].job]}#${p.ops[id].index + 1}`) };
  });
  const jobs = p.jobNames.map((name, j) => {
    const ids = p.jobs[j];
    const last = sched.ops[ids[ids.length - 1]];
    const work = ids.reduce((a, id) => a + p.ops[id].time, 0);
    return { job: name, completion: last.end, work, waiting: last.end - work };
  });
  return {
    name: p.name,
    jobs: p.jobs.length,
    machines: p.machineNames.length,
    operations: g.N,
    makespan,
    lowerBound: optimal ? makespan : lowerBound,
    bounds: { job: lb.jobBound, machineLoad: lb.loadBound, oneMachine: lb.machineBound },
    optimal,
    proof: optimal ? (exactComplete ? 'exhaustive search' : 'meets the lower bound') : null,
    gap: optimal ? 0 : (makespan - lowerBound) / makespan,
    method,
    dispatch,
    tabuIterations: tabuIter,
    restarts,
    nodes,
    ms: Date.now() - t0,
    schedule: sched.ops,
    machineSummary: machines,
    jobSummary: jobs,
    averageUtilization: machines.reduce((a, m) => a + m.utilization, 0) / Math.max(1, machines.length),
  };
}

// Internal hooks for tests and the benchmark.
export const _internal = { normalize, compile, evaluate, workspace, giffler, RULES, tabuSearch, branchAndBound, scheduleFromSeq };
