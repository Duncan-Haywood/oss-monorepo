import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solve, analyze, validate, supplyPressure, requiredGpm, headLossCheck, pipeId, NFPA, EPANET, EXAMPLE } from './hydraulics.mjs';
import { cases } from './check/cases.mjs';
import { parse, serialize } from './format.mjs';

const epanet = JSON.parse(readFileSync(new URL('./check/epanet-results.json', import.meta.url), 'utf8'));

test('agrees with EPANET 2.2 on 61 seeded networks (grids, trees, the example) under EPANET\'s own formula', () => {
  let compared = 0;
  let skipped = [];
  let worstPsi = 0;
  let worstGpm = 0;
  for (const c of cases()) {
    const ref = epanet.cases.find(x => x.name === c.name);
    assert.ok(ref, c.name);
    assert.equal(ref.sourcePsi, c.sourcePsi, `${c.name}: stored EPANET run is for another case; rerun check/epanet_compare.py`);
    // EPANET 2.2 lets an emitter draw water in at negative pressure; a
    // sprinkler cannot, so cases with a head below 0 psi in EPANET are not
    // the same problem and are left out (counted below).
    if (c.nodes.some(n => n.k && ref.pressurePsi[n.id] < 0)) { skipped.push(c.name); continue; }
    const r = solve(c, c.sourcePsi, { formula: EPANET });
    assert.ok(r.converged, c.name);
    for (const n of r.nodes) if (n.id !== c.source) worstPsi = Math.max(worstPsi, Math.abs(n.psi - ref.pressurePsi[n.id]));
    for (const p of r.pipes) worstGpm = Math.max(worstGpm, Math.abs(p.gpm - ref.flowGpm[p.id]));
    compared++;
  }
  assert.deepEqual(skipped, ['tree-8', 'tree-16']);
  assert.equal(compared, 59);
  assert.ok(worstPsi < 1e-5, `worst pressure difference ${worstPsi}`);
  assert.ok(worstGpm < 1e-5, `worst flow difference ${worstGpm}`);
});

test('EPANET\'s Hazen-Williams constant, rewritten for gpm and inches, is close to NFPA 13\'s 4.52', () => {
  assert.ok(Math.abs(EPANET.coef / NFPA.coef - 1) < 0.01, String(EPANET.coef));
});

test('flow is conserved at every node and losses balance around every loop', () => {
  for (const c of cases()) {
    const r = solve(c, c.sourcePsi);
    assert.ok(headLossCheck(c, r) < 1e-9, c.name);
    const net = new Map(c.nodes.map(n => [n.id, 0]));
    for (const p of r.pipes) { net.set(p.from, net.get(p.from) - p.gpm); net.set(p.to, net.get(p.to) + p.gpm); }
    for (const s of r.sprinklers) net.set(s.id, net.get(s.id) - s.gpm);
    for (const [id, v] of net) if (id !== c.source) assert.ok(Math.abs(v) < 1e-6, `${c.name} ${id} ${v}`);
    assert.ok(Math.abs(net.get(c.source) + r.sourceGpm) < 1e-6, c.name);
  }
});

// The hand method sprinkler designers learn: start at the most remote head
// with its required flow, add the friction loss to each next head, take
// that head's flow from its pressure, and carry the sum back to the source.
// For a single branch line on one level it is exact, and it shares no code
// with the network solver.
function handCalc(line) {
  let psi = (line.qReq / line.k) ** 2;
  let q = line.qReq;
  for (let i = 0; i < line.segments.length; i++) {
    const s = line.segments[i];
    psi += NFPA.coef * (s.len + s.fit) * q ** 1.85 / (s.c ** 1.85 * s.d ** 4.87);
    if (i < line.segments.length - 1) q += line.k * Math.sqrt(psi);
  }
  return { psi, q };
}

test('a single branch line matches the head-by-head hand calculation', () => {
  for (const [heads, k, qReq, size] of [[3, 5.6, 19.5, '1-1/4'], [6, 5.6, 14.8, '1-1/2'], [4, 8.0, 30, '1-1/2'], [7, 4.2, 12, '2']]) {
    const d = pipeId({ size, schedule: 'sch40' });
    const nodes = [{ id: 'S', elevationFt: 10 }];
    const pipes = [];
    const segments = [];
    for (let i = 1; i <= heads; i++) {
      nodes.push({ id: `H${i}`, elevationFt: 10, k, minGpm: qReq });
      pipes.push({ id: `P${i}`, from: i === 1 ? 'S' : `H${i - 1}`, to: `H${i}`, lengthFt: 10 + i, fittingsFt: i === 1 ? 6 : 0, size, schedule: 'sch40', c: 120 });
    }
    for (let i = heads; i >= 1; i--) segments.push({ len: 10 + i, fit: i === 1 ? 6 : 0, c: 120, d });
    const model = { source: 'S', nodes, pipes, design: { minPsi: 0 } };
    const r = analyze(model);
    const h = handCalc({ k, qReq, segments });
    assert.ok(Math.abs(r.demand.psi - h.psi) < 1e-6, `${heads} heads: ${r.demand.psi} vs ${h.psi}`);
    assert.ok(Math.abs(r.demand.sprinklerGpm - h.q) < 1e-6);
    assert.equal(r.demand.remote, `H${heads}`);
  }
});

test('elevation adds 0.433 psi per foot of rise and nothing else', () => {
  const base = { source: 'S', nodes: [{ id: 'S', elevationFt: 0 }, { id: 'H', elevationFt: 0, k: 5.6 }], pipes: [{ id: 'p', from: 'S', to: 'H', lengthFt: 20, size: '1', c: 120 }], design: { minPsi: 7 } };
  const up = { ...base, nodes: [{ id: 'S', elevationFt: 0 }, { id: 'H', elevationFt: 30, k: 5.6 }] };
  assert.ok(Math.abs(analyze(up).demand.psi - analyze(base).demand.psi - 30 * 0.433) < 1e-6);
});

test('the design point is the lowest source pressure that satisfies the worst head', () => {
  const r = analyze(EXAMPLE);
  const req = r.required;
  const ok = s => s.sprinklers.every(h => h.gpm >= req[h.id] - 1e-6);
  assert.ok(ok(solve(EXAMPLE, r.demand.psi)));
  assert.ok(!ok(solve(EXAMPLE, r.demand.psi - 0.01)));
  const remote = r.solution.sprinklers.find(h => h.id === r.demand.remote);
  assert.ok(Math.abs(remote.gpm - req[remote.id]) < 1e-6);
  // Density governs here: 0.15 x 130 = 19.5 gpm a head, more than 5.6 sqrt(7).
  assert.equal(requiredGpm({ k: 5.6 }, EXAMPLE.design), 19.5);
  assert.ok(r.overdischargeGpm > 0);
});

test('supply curve: static at no flow, residual at the test flow, and the operating point sits on both curves', () => {
  const s = EXAMPLE.supply;
  assert.equal(supplyPressure(s, 0), 65);
  assert.ok(Math.abs(supplyPressure(s, 800) - 45) < 1e-12);
  const r = analyze(EXAMPLE);
  const op = r.supply.operating;
  assert.ok(Math.abs(op.psi - supplyPressure(s, op.totalGpm)) < 1e-6);
  assert.ok(Math.abs(solve(EXAMPLE, op.psi).sourceGpm - op.gpm) < 1e-6);
  assert.ok(op.psi > r.demand.psi && op.gpm > r.demand.sprinklerGpm);
  assert.ok(r.supply.marginPsi > 5);
  assert.deepEqual(r.warnings, []);
});

test('a weak supply is reported as short, with the shortfall', () => {
  const weak = { ...EXAMPLE, supply: { staticPsi: 40, residualPsi: 20, residualGpm: 500 } };
  const r = analyze(weak);
  assert.ok(r.supply.marginPsi < 0);
  assert.match(r.warnings.join(' '), /psi short of the/);
});

test('input problems are named, not thrown', () => {
  assert.match(validate({ source: 'X', nodes: [{ id: 'A', elevationFt: 0, k: 5.6 }], pipes: [] }).join(' '), /at least one pipe/);
  assert.match(validate({ source: 'S', nodes: [{ id: 'S', elevationFt: 0 }, { id: 'A', elevationFt: 0, k: 5.6 }, { id: 'B', elevationFt: 0 }], pipes: [{ id: 'p', from: 'S', to: 'A', lengthFt: 5, fittingsFt: 0, size: '1', c: 120 }] }).join(' '), /Not connected to the source: B/);
  assert.match(validate({ source: 'S', nodes: [{ id: 'S', elevationFt: 0 }, { id: 'A', elevationFt: 0, k: 5.6 }], pipes: [{ id: 'p', from: 'S', to: 'A', lengthFt: 5, fittingsFt: 0, size: '7', c: 120 }] }).join(' '), /unknown size "7"/);
  assert.deepEqual(analyze({ source: 'S', nodes: [], pipes: [] }).errors.length > 0, true);
});

test('the text format round-trips the example and reports bad lines', () => {
  const text = serialize(EXAMPLE);
  const { model, errors } = parse(text);
  assert.deepEqual(errors, []);
  const a = analyze(EXAMPLE);
  const b = analyze(model);
  assert.ok(Math.abs(a.demand.psi - b.demand.psi) < 1e-9);
  assert.match(parse('pipe a b').errors[0], /needs a name, a from node and a to node/);
  assert.match(parse('node A elev=high').errors[0], /must be a number/);
  assert.match(parse('valve V').errors[0], /not "valve"/);
  assert.match(parse('supply static=40 residual=50 at=500').errors[0], /static > residual/);
});
