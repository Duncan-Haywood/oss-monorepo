import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  solve, normalize, parseStandard, parseTable, parseAny, formatTable, lowerBounds, preemptiveBound,
  checkSchedule, rng, EXAMPLE, RULE_NAMES, _internal,
} from './engine.mjs';

// Independent optimum: try every combination of machine orders and compute
// each one's makespan by repeated relaxation (no topological sort, no code
// shared with the engine). Orders that deadlock never settle and are skipped.
function bruteForce(inst) {
  const p = normalize(inst);
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
  const options = p.machineOps.map(perms);
  let best = Infinity;
  const choice = new Array(options.length).fill(0);
  for (;;) {
    const seqs = choice.map((c, m) => options[m][c]);
    const start = new Array(p.ops.length).fill(0);
    let changed = true, rounds = 0;
    while (changed && rounds <= p.ops.length + 1) {
      changed = false; rounds++;
      for (const ids of p.jobs) for (let k = 1; k < ids.length; k++) {
        const t = start[ids[k - 1]] + p.ops[ids[k - 1]].time;
        if (t > start[ids[k]]) { start[ids[k]] = t; changed = true; }
      }
      for (const s of seqs) for (let k = 1; k < s.length; k++) {
        const t = start[s[k - 1]] + p.ops[s[k - 1]].time;
        if (t > start[s[k]]) { start[s[k]] = t; changed = true; }
      }
    }
    if (!changed) best = Math.min(best, Math.max(...p.ops.map((o) => start[o.id] + o.time)));
    let m = 0;
    while (m < choice.length && ++choice[m] === options[m].length) choice[m++] = 0;
    if (m === choice.length) break;
  }
  return best;
}

function randomInstance(rand, nJobs, nMach, { recirculate = false, maxTime = 9, zero = false } = {}) {
  const jobs = [];
  for (let j = 0; j < nJobs; j++) {
    let ms = Array.from({ length: nMach }, (_, i) => i);
    for (let i = ms.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [ms[i], ms[k]] = [ms[k], ms[i]]; }
    if (recirculate) ms = ms.slice(0, 1 + Math.floor(rand() * nMach)).concat(Math.floor(rand() * nMach));
    else ms = ms.slice(0, 1 + Math.floor(rand() * nMach));
    jobs.push({ name: `J${j}`, ops: ms.map((m) => [`M${m}`, zero && rand() < 0.15 ? 0 : 1 + Math.floor(rand() * maxTime)]) });
  }
  return { jobs };
}

test('brute force agrees: 150 random shops of 2-4 jobs on 2-3 machines, each answer proved, valid and optimal', () => {
  const rand = rng(7);
  for (let t = 0; t < 150; t++) {
    const inst = randomInstance(rand, 2 + Math.floor(rand() * 3), 2 + Math.floor(rand() * 2), { zero: t % 5 === 0 });
    const opt = bruteForce(inst);
    const r = solve(inst, { ms: 2000, seed: t + 1 });
    assert.equal(checkSchedule(inst, r.schedule), r.makespan, `case ${t}`);
    assert.equal(r.makespan, opt, `case ${t}`);
    assert.equal(r.optimal, true, `case ${t}`);
    assert.ok(lowerBounds(inst).lowerBound <= opt + 1e-9, `bound is valid, case ${t}`);
  }
});

test('jobs that visit a machine twice (recirculation) are still solved exactly', () => {
  const rand = rng(99);
  for (let t = 0; t < 60; t++) {
    const inst = randomInstance(rand, 3, 3, { recirculate: true });
    const opt = bruteForce(inst);
    const r = solve(inst, { ms: 2000, seed: t + 1 });
    assert.equal(checkSchedule(inst, r.schedule), r.makespan);
    assert.equal(r.makespan, opt, `case ${t}`);
  }
});

test('tabu search alone reaches the brute-force optimum on small shops (no exact search)', () => {
  const rand = rng(3);
  const { compile, evaluate, workspace, giffler, RULES, tabuSearch } = _internal;
  let hits = 0;
  for (let t = 0; t < 60; t++) {
    const inst = randomInstance(rand, 4, 3);
    const opt = bruteForce(inst);
    const g = compile(normalize(inst));
    const seq = giffler(g, RULES.SPT, null);
    const ts = tabuSearch(g, seq, { deadline: Date.now() + 500, maxIter: 3000, lowerBound: 0, rand: rng(t + 1) });
    assert.ok(ts.best >= opt, 'never below the optimum');
    assert.equal(evaluate(g, ts.bestSeq, workspace(g.N)), ts.best);
    if (ts.best === opt) hits++;
  }
  assert.ok(hits >= 57, `tabu alone hit ${hits} of 60`);
});

test('branch and bound alone is exact on small shops', () => {
  const rand = rng(5);
  const { compile, branchAndBound } = _internal;
  for (let t = 0; t < 60; t++) {
    const inst = randomInstance(rand, 3 + (t % 2), 3);
    const opt = bruteForce(inst);
    const g = compile(normalize(inst));
    const bb = branchAndBound(g, Infinity, null, { deadline: Date.now() + 5000, maxNodes: Infinity, lowerBound: 0 });
    assert.equal(bb.complete, true);
    assert.equal(bb.best, opt, `case ${t}`);
  }
});

test('every dispatch rule gives a valid active schedule', () => {
  const { compile, giffler, RULES, scheduleFromSeq } = _internal;
  const rand = rng(11);
  for (let t = 0; t < 30; t++) {
    const inst = randomInstance(rand, 6, 4, { zero: true });
    const g = compile(normalize(inst));
    for (const name of RULE_NAMES) {
      const s = scheduleFromSeq(g, giffler(g, RULES[name], null));
      assert.equal(checkSchedule(inst, s.ops), s.makespan, name);
    }
  }
});

test('preemptive one-machine bound: hand cases', () => {
  // One operation: release + time + tail.
  assert.equal(preemptiveBound([{ r: 2, p: 3, q: 4 }]), 9);
  // Two released at 0: run the longer tail first; 0..2 (q 5) -> 7, 2..5 (q 1) -> 6.
  assert.equal(preemptiveBound([{ r: 0, p: 2, q: 5 }, { r: 0, p: 3, q: 1 }]), 7);
  // A late arrival with a long tail preempts: A runs 0..1, B 1..3 (ends 3+10=13), A 3..7 (7).
  assert.equal(preemptiveBound([{ r: 0, p: 5, q: 0 }, { r: 1, p: 2, q: 10 }]), 13);
  // Idle gap before the second release.
  assert.equal(preemptiveBound([{ r: 0, p: 1, q: 0 }, { r: 10, p: 1, q: 0 }]), 11);
});

test('the bounds never exceed a found schedule on mid-size random shops', () => {
  const rand = rng(21);
  for (let t = 0; t < 20; t++) {
    const inst = randomInstance(rand, 8, 5, { zero: t % 3 === 0 });
    const r = solve(inst, { ms: 150, seed: t + 1 });
    assert.equal(checkSchedule(inst, r.schedule), r.makespan);
    assert.ok(r.lowerBound <= r.makespan + 1e-9);
    assert.ok(r.bounds.oneMachine >= r.bounds.machineLoad && r.bounds.oneMachine >= r.bounds.job);
  }
});

test('small shops the capped exact search settles skip the tabu run, and keep the brute-force optimum', () => {
  // Pins the search order: before this, every small shop the dispatch rules
  // left unproved spent the tabu run's full 300 ms first.
  const rand = rng(11);
  let settled = 0;
  for (let t = 0; t < 40; t++) {
    const inst = randomInstance(rand, 3, 3);
    const r = solve(inst, { ms: 2000, seed: t + 1 });
    assert.equal(r.makespan, bruteForce(inst), `case ${t}`);
    assert.equal(r.optimal, true);
    if (r.proof === 'exhaustive search') {
      settled++;
      assert.equal(r.tabuIterations, 0, `case ${t} ran tabu before a 3x3 exact search`);
      assert.ok(r.nodes <= 2000);
    }
  }
  assert.ok(settled > 0, 'some cases needed the exact search');
});

test('the example is solved and proved, and its summaries add up', () => {
  const r = solve(EXAMPLE, { ms: 2000 });
  assert.equal(r.optimal, true);
  assert.equal(r.proof, 'exhaustive search');
  assert.equal(r.makespan, 38);
  assert.equal(r.bounds.oneMachine, 37);
  assert.equal(Math.min(...Object.values(r.dispatch)), 45);
  assert.equal(r.jobs, 6);
  assert.equal(r.machines, 4);
  for (const m of r.machineSummary) assert.ok(Math.abs(m.busy + m.idle - r.makespan) < 1e-9);
  for (const j of r.jobSummary) assert.ok(j.completion <= r.makespan && j.waiting >= 0);
  assert.equal(Math.max(...r.jobSummary.map((j) => j.completion)), r.makespan);
});

test('checkSchedule rejects overlaps, broken routings and missing operations', () => {
  const r = solve(EXAMPLE, { ms: 500 });
  const s = r.schedule.map((o) => ({ ...o }));
  const bad1 = s.map((o) => ({ ...o }));
  const a = bad1.find((o) => o.job === 'Bracket' && o.step === 2);
  a.start -= 100; a.end -= 100;
  assert.throws(() => checkSchedule(EXAMPLE, bad1), /starts before|bad times/);
  assert.throws(() => checkSchedule(EXAMPLE, s.slice(1)), /operations/);
  const bad2 = s.map((o) => ({ ...o }));
  const saw = bad2.filter((o) => o.machine === 'Saw').sort((x, y) => x.start - y.start);
  saw[1].start = saw[0].start; saw[1].end = saw[1].start + saw[1].time;
  assert.throws(() => checkSchedule(EXAMPLE, bad2), /two operations at once|starts before/);
});

test('parsers: standard (0-based pairs), Taillard (times then 1-based machines), table, JSON', () => {
  const std = '# a comment\n2 2\n0 3 1 2\n1 4 0 1\n';
  const a = parseStandard(std);
  assert.deepEqual(a.jobs[0].ops, [['M0', 3], ['M1', 2]]);
  assert.deepEqual(a.jobs[1].ops, [['M1', 4], ['M0', 1]]);
  const tai = '2 2\n3 2\n4 1\n1 2\n2 1\n';
  assert.deepEqual(parseStandard(tai).jobs, a.jobs);
  assert.deepEqual(parseAny(std).jobs, a.jobs);
  const tbl = 'job, machine, time\nA, Saw, 3\nA, Mill, 2\nB, Mill, 4\nB, Saw, 1\n';
  const t = parseAny(tbl);
  assert.deepEqual(t.jobs, [{ name: 'A', ops: [['Saw', 3], ['Mill', 2]] }, { name: 'B', ops: [['Mill', 4], ['Saw', 1]] }]);
  assert.equal(solve(t).makespan, solve(a).makespan);
  assert.deepEqual(parseTable(formatTable(EXAMPLE)).jobs.map((j) => j.ops), EXAMPLE.jobs.map((j) => j.ops));
  assert.equal(parseAny(JSON.stringify(EXAMPLE)).jobs.length, 6);
  assert.throws(() => parseStandard('2 2\n0 3 1\n1 4 0 1\n'), /odd/);
  assert.throws(() => parseStandard('2 2\n0 3 5 2\n1 4 0 1\n'), /machine 5/);
  assert.throws(() => parseTable('A, Saw, x\n'), /no operations/);
  assert.throws(() => parseTable('A, Saw, 3\nB, Mill, x\n'), /not a number/);
  assert.throws(() => normalize({ jobs: [{ ops: [['Saw', -1]] }] }), /0 or more/);
  assert.throws(() => normalize({ jobs: [] }), /no jobs/);
});

test('a single machine is a sum, and parallel independent jobs are the longest job', () => {
  const one = { jobs: [{ ops: [['M', 3]] }, { ops: [['M', 4]] }, { ops: [['M', 5]] }] };
  const r1 = solve(one);
  assert.equal(r1.makespan, 12);
  assert.equal(r1.optimal, true);
  const par = { jobs: [{ ops: [['A', 3], ['B', 2]] }, { ops: [['C', 7]] }] };
  assert.equal(solve(par).makespan, 7);
});

test('decimal and zero times work', () => {
  const inst = { jobs: [{ ops: [['A', 1.5], ['B', 0], ['C', 2.25]] }, { ops: [['C', 0.5], ['A', 2]] }] };
  const r = solve(inst, { ms: 500 });
  assert.equal(checkSchedule(inst, r.schedule), r.makespan);
  assert.equal(r.makespan, bruteForce(inst));
});

test('larger shop: stays within the time limit and every schedule checks', () => {
  const rand = rng(31);
  const inst = randomInstance(rand, 30, 10);
  const t0 = Date.now();
  const r = solve(inst, { ms: 600 });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(checkSchedule(inst, r.schedule), r.makespan);
  assert.ok(r.makespan <= Math.min(...Object.values(r.dispatch)));
});
