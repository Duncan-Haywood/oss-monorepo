// Sprinkler system hydraulics: tree, looped and gridded pipe networks with
// K-factor sprinklers, solved for every pipe flow and node pressure at once.
//
// Units are the US ones sprinkler drawings use: gpm, psi, feet, inches.
// Friction is Hazen-Williams in the form NFPA 13 prints,
//   p = 4.52 Q^1.85 / (C^1.85 d^4.87)   psi per foot of pipe,
// elevation is 0.433 psi per foot, and a sprinkler discharges Q = K sqrt(P).
//
// The solver is the global gradient algorithm of Todini and Pilati (1988),
// the method EPANET uses: Newton's method on pipe flows and node heads
// together, which needs no loop-finding and handles trees, loops and grids
// alike. Each sprinkler is an extra link from its node to a fixed head equal
// to its own elevation (zero pressure), with loss (Q / K)^2, as in EPANET's
// emitter model (Rossman, EPANET 2.2 manual, "Emitters").
//
// Heads are in psi: H = p + g z, g = 0.433 psi per foot.

export const NFPA = { coef: 4.52, qExp: 1.85, dExp: 4.87, psiPerFt: 0.433 };
// EPANET's US-unit Hazen-Williams (h ft = 4.727 C^-1.852 d^-4.871 L q^1.852,
// d in ft, q in cfs) rewritten for gpm, inches and psi, with EPANET's own
// 0.4333 psi per foot. Used only to check this solver against EPANET.
export const EPANET = (() => {
  const psiPerFt = 0.4333;
  const coef = psiPerFt * 4.727 * Math.pow(12, 4.871) / Math.pow(448.831, 1.852);
  return { coef, qExp: 1.852, dExp: 4.871, psiPerFt };
})();

// Internal diameters in inches from the outside diameters and wall
// thicknesses in ASME B36.10M (schedule 40) and B36.19M (schedule 10).
export const PIPE_ID = {
  'sch40': { '1': 1.049, '1-1/4': 1.380, '1-1/2': 1.610, '2': 2.067, '2-1/2': 2.469, '3': 3.068, '4': 4.026, '6': 6.065, '8': 7.981 },
  'sch10': { '1': 1.097, '1-1/4': 1.442, '1-1/2': 1.682, '2': 2.157, '2-1/2': 2.635, '3': 3.260, '4': 4.260, '6': 6.357, '8': 8.329 },
};

// Hazen-Williams C values in the table NFPA 13 gives for hydraulic
// calculations. A user can type any C instead.
export const C_VALUES = {
  'black steel, wet': 120,
  'black steel, dry or preaction': 100,
  'galvanized steel': 120,
  'CPVC or listed plastic': 150,
  'copper or stainless': 150,
  'cement-lined ductile iron': 140,
  'unlined cast or ductile iron': 100,
};

export function pipeId(pipe) {
  if (Number.isFinite(pipe.idIn) && pipe.idIn > 0) return pipe.idIn;
  const table = PIPE_ID[pipe.schedule || 'sch40'];
  return table ? table[String(pipe.size)] : undefined;
}

// Water supply curve from a flow test: static pressure, and a residual
// pressure at a measured flow. Hazen-Williams shape, as on N^1.85 paper.
export function supplyPressure(supply, q) {
  const { staticPsi, residualPsi, residualGpm } = supply;
  return staticPsi - (staticPsi - residualPsi) * Math.pow(Math.max(q, 0) / residualGpm, 1.85);
}

export function validate(model) {
  const errors = [];
  const nodes = model.nodes || [];
  const pipes = model.pipes || [];
  if (!nodes.length) errors.push('Add at least one node.');
  if (!pipes.length) errors.push('Add at least one pipe.');
  const ids = new Set();
  for (const n of nodes) {
    if (!n.id) errors.push('Every node needs a name.');
    else if (ids.has(n.id)) errors.push(`Node "${n.id}" is listed twice.`);
    ids.add(n.id);
    if (!Number.isFinite(n.elevationFt)) errors.push(`Node "${n.id}": elevation must be a number of feet.`);
    if (n.k !== undefined && !(n.k > 0)) errors.push(`Node "${n.id}": the K factor must be a positive number.`);
  }
  if (!ids.has(model.source)) errors.push(`The source node "${model.source}" is not in the node list.`);
  else if (nodes.find(n => n.id === model.source).k) errors.push('The source node cannot also be a sprinkler.');
  const pids = new Set();
  for (const p of pipes) {
    if (pids.has(p.id)) errors.push(`Pipe "${p.id}" is listed twice.`);
    pids.add(p.id);
    if (!ids.has(p.from) || !ids.has(p.to)) errors.push(`Pipe "${p.id}" joins a node that is not listed.`);
    if (p.from === p.to) errors.push(`Pipe "${p.id}" starts and ends at the same node.`);
    if (!(p.lengthFt > 0)) errors.push(`Pipe "${p.id}": length must be more than 0 ft.`);
    if (p.fittingsFt !== undefined && !(p.fittingsFt >= 0)) errors.push(`Pipe "${p.id}": fittings equivalent length must be 0 or more.`);
    if (!(p.c > 0)) errors.push(`Pipe "${p.id}": C must be a positive number.`);
    if (!(pipeId(p) > 0)) errors.push(`Pipe "${p.id}": unknown size "${p.size}" for ${p.schedule || 'sch40'}; give a size from the table or an inside diameter.`);
  }
  if (!nodes.some(n => n.k)) errors.push('No node has a sprinkler (K factor).');
  if (!errors.length) {
    // Every node must reach the source through pipes.
    const adj = new Map(nodes.map(n => [n.id, []]));
    for (const p of pipes) { adj.get(p.from).push(p.to); adj.get(p.to).push(p.from); }
    const seen = new Set([model.source]);
    const stack = [model.source];
    while (stack.length) for (const m of adj.get(stack.pop())) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    const lost = nodes.filter(n => !seen.has(n.id)).map(n => n.id);
    if (lost.length) errors.push(`Not connected to the source: ${lost.join(', ')}.`);
  }
  return errors;
}

// Symmetric positive definite solve (Cholesky) on the matrix's envelope.
// Row i of A is zero left of its first nonzero column first[i], and so is
// row i of L (fill-in stays inside the envelope), so every product the dense
// loops would take left of max(first[i], first[j]) is an exact zero and is
// skipped. The products that remain are taken in the same k order from the
// same start value, so the answer is the dense loops' answer bit for bit
// (the test "envelope Cholesky ..." pins this). Sprinkler networks number
// nodes along their branch lines, so the envelope is narrow: a 10-line,
// 80-head ladder does about a fifteenth of the dense work. Works in place:
// A is overwritten with L.
export function cholSolve(A, b) {
  const n = b.length;
  const L = A;
  const first = new Int32Array(n);
  for (let i = 0; i < n; i++) { const r = L[i]; let f = 0; while (f < i && r[f] === 0) f++; first[i] = f; }
  for (let j = 0; j < n; j++) {
    const Lj = L[j];
    const fj = first[j];
    let s = Lj[j];
    for (let k = fj; k < j; k++) s -= Lj[k] * Lj[k];
    if (!(s > 0)) throw new Error('singular network matrix');
    const d = Math.sqrt(s);
    Lj[j] = d;
    for (let i = j + 1; i < n; i++) {
      const fi = first[i];
      if (fi > j) continue; // L[i][j] is outside row i's envelope: zero
      const Li = L[i];
      let t = Li[j];
      for (let k = fi > fj ? fi : fj; k < j; k++) t -= Li[k] * Lj[k];
      Li[j] = t / d;
    }
  }
  const y = new Array(n);
  for (let i = 0; i < n; i++) { const Li = L[i]; let s = b[i]; for (let k = first[i]; k < i; k++) s -= Li[k] * y[k]; y[i] = s / Li[i]; }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) if (first[k] <= i) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

// Solve the network with the source held at `sourcePsi` (gauge pressure at
// the source node). Returns flows (gpm, positive from -> to), node
// pressures and sprinkler discharges.
export function solve(model, sourcePsi, opts = {}) {
  const hw = opts.formula || NFPA;
  const g = hw.psiPerFt;
  const nodes = model.nodes;
  const junctions = nodes.filter(n => n.id !== model.source);
  const index = new Map(junctions.map((n, i) => [n.id, i]));
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const src = nodeById.get(model.source);
  const H0 = sourcePsi + g * src.elevationFt;
  // Links: pipes, then one emitter per sprinkler.
  const links = model.pipes.map(p => ({
    kind: 'pipe', p, a: p.from, b: p.to, n: hw.qExp,
    r: hw.coef * (p.lengthFt + (p.fittingsFt || 0)) / (Math.pow(p.c, hw.qExp) * Math.pow(pipeId(p), hw.dExp)),
  }));
  for (const nd of nodes) if (nd.k) links.push({ kind: 'emitter', node: nd, a: nd.id, b: null, n: 2, r: 1 / (nd.k * nd.k), Hb: g * nd.elevationFt });
  // Junction index of each end, looked up once (undefined: the source, or
  // an emitter's open end).
  for (const l of links) { l.ia = index.get(l.a); l.ib = l.b === null ? undefined : index.get(l.b); }
  const demand = new Array(junctions.length).fill(0);
  for (const nd of junctions) demand[index.get(nd.id)] = nd.demandGpm || 0;
  let Q = links.map(l => (l.kind === 'emitter' ? 15 : 20));
  let H = new Array(junctions.length).fill(H0);
  const head = id => (id === model.source ? H0 : H[index.get(id)]);
  const tol = opts.tol ?? 1e-10;
  let iterations = 0;
  let converged = false;
  const m = junctions.length;
  // One matrix for the whole solve, zeroed each step (cholSolve overwrites
  // it with its factor); rows are views into one buffer.
  const buf = new Float64Array(m * m);
  const A = Array.from({ length: m }, (_, i) => buf.subarray(i * m, (i + 1) * m));
  for (; iterations < (opts.maxIter ?? 200); iterations++) {
    buf.fill(0);
    const F = demand.map(d => -d);
    const P = new Array(links.length);
    const Y = new Array(links.length);
    links.forEach((l, k) => {
      if (l.closed) { P[k] = 0; Y[k] = 0; return; }
      const q = Q[k];
      const aq = Math.abs(q);
      // Derivative of the loss; floored so a link at no flow keeps a finite
      // conductance (EPANET does the same with its RQtol).
      const d = Math.max(l.n * l.r * Math.pow(aq, l.n - 1), 1e-7);
      P[k] = 1 / d;
      Y[k] = (l.r * Math.pow(aq, l.n) * Math.sign(q)) / d;
      const { ia, ib } = l;
      const qy = q - Y[k];
      // Link leaves a and enters b.
      if (ia !== undefined) { A[ia][ia] += P[k]; F[ia] -= qy; }
      if (ib !== undefined) { A[ib][ib] += P[k]; F[ib] += qy; }
      if (ia !== undefined && ib !== undefined) { A[ia][ib] -= P[k]; A[ib][ia] -= P[k]; }
      else if (ia !== undefined) F[ia] += P[k] * (l.b === null ? l.Hb : H0);
      else if (ib !== undefined) F[ib] += P[k] * H0;
    });
    H = m ? cholSolve(A, F) : [];
    let dsum = 0;
    let qsum = 0;
    let statusChanged = false;
    const Qn = links.map((l, k) => {
      const Ha = l.ia === undefined ? H0 : H[l.ia];
      const Hb = l.b === null ? l.Hb : l.ib === undefined ? H0 : H[l.ib];
      // A sprinkler cannot draw water back in: like a check valve, its
      // link closes when its node's pressure would be negative and opens
      // again when the pressure comes back.
      if (l.kind === 'emitter') {
        if (l.closed) {
          if (Ha - Hb > 0) { l.closed = false; statusChanged = true; return l.node.k * Math.sqrt(Ha - Hb); }
          return 0;
        }
        const qn = Q[k] - Y[k] + P[k] * (Ha - Hb);
        if (qn < 0) { l.closed = true; statusChanged = true; dsum += Math.abs(Q[k]); return 0; }
        dsum += Math.abs(qn - Q[k]);
        qsum += Math.abs(qn);
        return qn;
      }
      const qn = Q[k] - Y[k] + P[k] * (Ha - Hb);
      dsum += Math.abs(qn - Q[k]);
      qsum += Math.abs(qn);
      return qn;
    });
    Q = Qn;
    if (!statusChanged && dsum <= tol * Math.max(qsum, 1)) { converged = true; iterations++; break; }
  }
  const pressure = id => head(id) - g * nodeById.get(id).elevationFt;
  const pipes = links.filter(l => l.kind === 'pipe').map(l => {
    const k = links.indexOf(l);
    const q = Q[k];
    const d = pipeId(l.p);
    return {
      id: l.p.id, from: l.p.from, to: l.p.to, gpm: q, idIn: d,
      velocityFps: 0.4085 * Math.abs(q) / (d * d),
      frictionPsi: l.r * Math.pow(Math.abs(q), l.n),
      psiPerFt: hw.coef * Math.pow(Math.abs(q), hw.qExp) / (Math.pow(l.p.c, hw.qExp) * Math.pow(d, hw.dExp)),
    };
  });
  const sprinklers = links.filter(l => l.kind === 'emitter').map(l => {
    const p = pressure(l.node.id);
    return { id: l.node.id, k: l.node.k, psi: p, gpm: Q[links.indexOf(l)], areaFt2: l.node.areaFt2, minGpm: l.node.minGpm };
  });
  const nodesOut = nodes.map(nd => ({ id: nd.id, elevationFt: nd.elevationFt, psi: pressure(nd.id) }));
  const sprinklerGpm = sprinklers.reduce((s, x) => s + x.gpm, 0);
  const otherGpm = demand.reduce((s, x) => s + x, 0);
  return { converged, iterations, sourcePsi, sourceGpm: sprinklerGpm + otherGpm, sprinklerGpm, pipes, nodes: nodesOut, sprinklers };
}

// The flow each sprinkler must give: the design density over the area it
// covers, and never less than K sqrt(minimum pressure).
export function requiredGpm(s, design) {
  const byDensity = (design.densityGpmFt2 || 0) * (s.areaFt2 || design.areaPerHeadFt2 || 0);
  const byPressure = s.k * Math.sqrt(design.minPsi ?? 7);
  return Math.max(byDensity, byPressure, s.minGpm || 0);
}

function bisect(fn, lo, hi, iters = 80) {
  let flo = fn(lo);
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    const fm = fn(mid);
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

// The design point: the lowest source pressure at which every sprinkler
// gives at least its required flow. Then the supply check against the
// flow-test curve, with the hose allowance added to the flow the supply
// must give.
export function analyze(model, opts = {}) {
  const errors = validate(model);
  if (errors.length) return { errors, warnings: [] };
  const design = model.design || {};
  const hoseGpm = design.hoseGpm || 0;
  const formula = opts.formula || NFPA;
  const ratio = s => s.gpm / requiredGpm(s, design);
  const worst = r => Math.min(...r.sprinklers.map(ratio));
  // Raise the upper bracket until every head is satisfied.
  let hi = 50;
  while (worst(solve(model, hi, { formula })) < 1 && hi < 1e5) hi *= 2;
  if (hi >= 1e5) return { errors: ['No source pressure below 100,000 psi satisfies every sprinkler; check the pipe sizes and K factors.'], warnings: [] };
  const p = bisect(x => worst(solve(model, x, { formula })) - 1, 0, hi);
  const at = solve(model, p, { formula });
  const warnings = [];
  if (!at.converged) warnings.push('The network solve did not reach its tolerance in 200 iterations; treat the numbers with care.');
  const remote = at.sprinklers.reduce((m, s) => (ratio(s) < ratio(m) ? s : m));
  for (const pp of at.pipes) if (pp.velocityFps > 32) warnings.push(`Pipe "${pp.id}" runs at ${pp.velocityFps.toFixed(1)} ft/s; many designers keep sprinkler pipe under about 20 to 32 ft/s.`);
  const demandGpm = at.sourceGpm + hoseGpm;
  const out = {
    errors: [], warnings, formula,
    demand: { psi: p, sprinklerGpm: at.sprinklerGpm, otherGpm: at.sourceGpm - at.sprinklerGpm, hoseGpm, totalGpm: demandGpm, remote: remote.id },
    solution: at,
    required: Object.fromEntries(at.sprinklers.map(s => [s.id, requiredGpm(s, design)])),
    overdischargeGpm: at.sprinklerGpm - at.sprinklers.reduce((t, s) => t + requiredGpm(s, design), 0),
  };
  if (model.supply) {
    const avail = supplyPressure(model.supply, demandGpm);
    out.supply = {
      availablePsi: avail,
      marginPsi: avail - p,
      // Where the system's own curve meets the supply curve: the flow the
      // system would really take with all its heads open.
      operating: operatingPoint(model, hoseGpm, formula),
    };
    const safety = design.safetyMarginPsi ?? 0;
    if (out.supply.marginPsi < safety) warnings.push(`The supply gives ${avail.toFixed(1)} psi at ${demandGpm.toFixed(0)} gpm, ${(p - avail).toFixed(1)} psi short of the ${p.toFixed(1)} psi the system needs${safety ? ` plus the ${safety} psi margin you set` : ''}.`);
  }
  return out;
}

export function operatingPoint(model, hoseGpm, formula = NFPA) {
  const f = x => {
    const r = solve(model, x, { formula });
    return x - supplyPressure(model.supply, r.sourceGpm + hoseGpm);
  };
  if (f(0) >= 0) return null;
  const top = model.supply.staticPsi;
  if (f(top) < 0) return null;
  const psi = bisect(f, 0, top);
  const r = solve(model, psi, { formula });
  return { psi, gpm: r.sourceGpm, totalGpm: r.sourceGpm + hoseGpm };
}

// Energy check used by the tests: around any closed path the friction
// losses, signed by flow direction, add to the change in head.
export function headLossCheck(model, result, formula = NFPA) {
  const g = formula.psiPerFt;
  const elev = new Map(model.nodes.map(n => [n.id, n.elevationFt]));
  const psi = new Map(result.nodes.map(n => [n.id, n.psi]));
  let worst = 0;
  for (const p of result.pipes) {
    const dH = (psi.get(p.from) + g * elev.get(p.from)) - (psi.get(p.to) + g * elev.get(p.to));
    worst = Math.max(worst, Math.abs(dH - Math.sign(p.gpm) * p.frictionPsi));
  }
  return worst;
}

// A small gridded system: a 4-inch feed main to two 2-1/2 inch cross mains,
// joined by four 1-1/4 inch branch lines with three heads each, all heads
// open in a 1,560 sq ft design area (12 heads x 130 sq ft) at 0.15 gpm/sq ft
// with a 250 gpm hose allowance (the ordinary hazard group 1 figures in
// NFPA 13's density/area method), K 5.6. Illustrative, not a real building.
export const EXAMPLE = {
  source: 'BOR',
  supply: { staticPsi: 65, residualPsi: 45, residualGpm: 800 },
  design: { densityGpmFt2: 0.15, areaPerHeadFt2: 130, minPsi: 7, hoseGpm: 250, safetyMarginPsi: 5 },
  nodes: [
    { id: 'BOR', elevationFt: 0, x: 0, y: 6 },
    { id: 'RISER', elevationFt: 12, x: 0, y: 4 },
    { id: 'W1', elevationFt: 12, x: 1, y: 0 }, { id: 'W2', elevationFt: 12, x: 1, y: 2 }, { id: 'W3', elevationFt: 12, x: 1, y: 4 }, { id: 'W4', elevationFt: 12, x: 1, y: 6 },
    { id: 'E1', elevationFt: 12, x: 5, y: 0 }, { id: 'E2', elevationFt: 12, x: 5, y: 2 }, { id: 'E3', elevationFt: 12, x: 5, y: 4 }, { id: 'E4', elevationFt: 12, x: 5, y: 6 },
    ...[1, 2, 3, 4].flatMap(r => [1, 2, 3].map(c => ({ id: `H${r}${c}`, elevationFt: 12, k: 5.6, x: 1 + c, y: (r - 1) * 2 }))),
  ],
  pipes: [
    { id: 'feed', from: 'BOR', to: 'RISER', lengthFt: 40, fittingsFt: 30, size: '4', schedule: 'sch40', c: 120 },
    { id: 'main-in', from: 'RISER', to: 'W3', lengthFt: 10, fittingsFt: 12, size: '2-1/2', schedule: 'sch10', c: 120 },
    { id: 'W1-W2', from: 'W1', to: 'W2', lengthFt: 12, fittingsFt: 0, size: '2-1/2', schedule: 'sch10', c: 120 },
    { id: 'W2-W3', from: 'W2', to: 'W3', lengthFt: 12, fittingsFt: 0, size: '2-1/2', schedule: 'sch10', c: 120 },
    { id: 'W3-W4', from: 'W3', to: 'W4', lengthFt: 12, fittingsFt: 0, size: '2-1/2', schedule: 'sch10', c: 120 },
    { id: 'E1-E2', from: 'E1', to: 'E2', lengthFt: 12, fittingsFt: 0, size: '2-1/2', schedule: 'sch10', c: 120 },
    { id: 'E2-E3', from: 'E2', to: 'E3', lengthFt: 12, fittingsFt: 0, size: '2-1/2', schedule: 'sch10', c: 120 },
    { id: 'E3-E4', from: 'E3', to: 'E4', lengthFt: 12, fittingsFt: 0, size: '2-1/2', schedule: 'sch10', c: 120 },
    ...[1, 2, 3, 4].flatMap(r => {
      const nodes = [`W${r}`, `H${r}1`, `H${r}2`, `H${r}3`, `E${r}`];
      return nodes.slice(1).map((to, i) => ({ id: `L${r}-${i + 1}`, from: nodes[i], to, lengthFt: i === 0 || i === 3 ? 7 : 11, fittingsFt: i === 0 ? 6 : 0, size: '1-1/4', schedule: 'sch40', c: 120 }));
    }),
  ],
};
