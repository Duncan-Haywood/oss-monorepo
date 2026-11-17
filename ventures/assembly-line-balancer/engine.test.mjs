import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIn2, parseTaskTable, formatTaskTable, prepare, stationBounds, heuristicBalance,
  minimizeStations, minimizeCycleTime, checkBalance, taktTime, EXAMPLE,
} from './engine.mjs';

// Jackson (1956) in Scholl's .IN2 form, as distributed in the 1993 data set.
const JACKSON_IN2 = `11\n6\n2\n5\n7\n1\n2\n3\n6\n5\n5\n4\n1,2\n1,3\n1,4\n1,5\n2,6\n3,7\n4,7\n5,7\n6,8\n7,9\n8,10\n9,11\n10,11\n-1,-1\n`;

test('the example is Jackson\'s graph exactly as the .IN2 file gives it', () => {
  const g = parseIn2(JACKSON_IN2);
  assert.deepEqual(g.tasks.map(t => t.time), EXAMPLE.tasks.map(t => t.time));
  assert.deepEqual(g.tasks.map(t => t.predecessors), EXAMPLE.tasks.map(t => t.predecessors));
});

test('Jackson SALBP-1: the published optima at every cycle time in Scholl\'s set, each proved and valid', () => {
  // Scholl and Klein, SALBP-1 data set (assembly-line-balancing.de): Jackson c = 7, 9, 10, 13, 14, 21.
  const published = { 7: 8, 9: 6, 10: 5, 13: 4, 14: 4, 21: 3 };
  for (const [c, m] of Object.entries(published)) {
    const r = minimizeStations({ ...EXAMPLE, cycleTime: Number(c) });
    assert.equal(r.stationCount, m, `c=${c}`);
    assert.equal(r.optimal, true, `c=${c}`);
    assert.equal(checkBalance(EXAMPLE, r.assignment, Number(c)), m);
    assert.equal(r.stations.length, m);
    assert.ok(Math.abs(r.stations.reduce((a, s) => a + s.load, 0) - 46) < 1e-9);
  }
});

test('SALBP-2 agrees with SALBP-1: m stations fit at c* and do not fit at c* - 1', () => {
  for (let m = 2; m <= 9; m++) {
    const r = minimizeCycleTime(EXAMPLE, m);
    assert.equal(r.optimal, true);
    checkBalance(EXAMPLE, r.assignment, r.cycleTime);
    assert.ok(r.stationsUsed <= m);
    assert.ok(minimizeStations({ ...EXAMPLE, cycleTime: r.cycleTime }).stationCount <= m, `m=${m}`);
    if (r.cycleTime > 7) assert.ok(minimizeStations({ ...EXAMPLE, cycleTime: r.cycleTime - 1 }).stationCount > m, `m=${m}`);
  }
});

// Independent check: the fewest stations by breadth-first search over every
// precedence-closed set of tasks, adding any feasible load (not only maximal
// ones), on small random lines. Shares no code with the engine's search.
function bruteForce(problem, c) {
  const n = problem.tasks.length;
  const idx = new Map(problem.tasks.map((t, i) => [t.id, i]));
  const predMask = problem.tasks.map(t => t.predecessors.reduce((m, p) => m | (1 << idx.get(p)), 0));
  const time = problem.tasks.map(t => t.time);
  const full = (1 << n) - 1;
  const dist = new Map([[0, 0]]);
  let frontier = [0];
  for (let k = 0; frontier.length; k++) {
    const next = [];
    for (const S of frontier) {
      // Every load reachable from S within the cycle time.
      const stack = [[S, 0]];
      const seenLoads = new Set([S]);
      while (stack.length) {
        const [T, load] = stack.pop();
        for (let j = 0; j < n; j++) {
          if (T & (1 << j) || (predMask[j] & T) !== predMask[j] || load + time[j] > c) continue;
          const U = T | (1 << j);
          if (seenLoads.has(U)) continue;
          seenLoads.add(U);
          stack.push([U, load + time[j]]);
          if (U === full) return k + 1;
          if (!dist.has(U)) { dist.set(U, k + 1); next.push(U); }
        }
      }
    }
    frontier = next;
  }
  return null;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

test('fewest stations equals brute force on 300 random lines of up to 11 tasks, with and without the heuristics, forwards and backwards', () => {
  const rand = rng(20261114);
  let checked = 0, viaSearch = 0;
  for (let trial = 0; trial < 300; trial++) {
    const n = 4 + Math.floor(rand() * 8);
    const tasks = [];
    for (let i = 0; i < n; i++) {
      const preds = [];
      for (let p = 0; p < i; p++) if (rand() < 0.25) preds.push(String(p + 1));
      tasks.push({ id: String(i + 1), time: 1 + Math.floor(rand() * 9), predecessors: preds });
    }
    const longest = Math.max(...tasks.map(t => t.time));
    const c = longest + Math.floor(rand() * 12);
    const want = bruteForce({ tasks }, c);
    for (const opts of [{}, { exactOnly: true }, { exactOnly: true, backwardOnly: true }]) {
      const r = minimizeStations({ tasks, cycleTime: c }, opts);
      assert.equal(r.optimal, true);
      assert.equal(r.stationCount, want, JSON.stringify({ tasks, c, opts }));
      assert.equal(checkBalance({ tasks }, r.assignment, c), r.stationCount);
      if (r.method === 'branch and bound') viaSearch++;
    }
    checked++;
  }
  assert.equal(checked, 300);
  assert.ok(viaSearch > 500, `the exact search, not only the heuristics, decided ${viaSearch} cases`);
});

test('shortest cycle equals brute force on random lines', () => {
  const rand = rng(7);
  for (let trial = 0; trial < 60; trial++) {
    const n = 4 + Math.floor(rand() * 6);
    const tasks = [];
    for (let i = 0; i < n; i++) {
      const preds = [];
      for (let p = 0; p < i; p++) if (rand() < 0.3) preds.push(String(p + 1));
      tasks.push({ id: String(i + 1), time: 1 + Math.floor(rand() * 9), predecessors: preds });
    }
    const m = 2 + Math.floor(rand() * 3);
    const r = minimizeCycleTime({ tasks }, m);
    let c = Math.max(...tasks.map(t => t.time));
    while (bruteForce({ tasks }, c) > m) c++;
    assert.equal(r.cycleTime, c, JSON.stringify({ tasks, m }));
    assert.equal(r.optimal, true);
  }
});

test('lower bounds: LB1, LB2 (tasks over half the cycle) and LB3 (thirds)', () => {
  const P = prepare({ tasks: [6, 6, 6, 4, 4, 4].map((t, i) => ({ id: String(i), time: t, predecessors: [] })) });
  const b = stationBounds(P, 10);
  assert.equal(b.lb1, 3);
  assert.equal(b.lb2, 3); // three tasks of 6 > 5 cannot share
  assert.equal(b.lb3, 3); // 6 is in (10/3, 20/3): 1/2 each; 4 is in (10/3, 20/3): 1/2 each -> 3
  assert.equal(minimizeStations({ tasks: P.ids.map((id, j) => ({ id, time: P.t[j], predecessors: [] })), cycleTime: 10 }).stationCount, 3);
});

test('a budget too small to finish returns the heuristic balance and a proved lower bound, not a false claim', () => {
  const r = minimizeStations({ ...EXAMPLE, cycleTime: 10 }, { nodes: 1 });
  assert.equal(r.optimal, false);
  assert.equal(r.lowerBound, 5);
  assert.equal(r.stationCount, 6);
  checkBalance(EXAMPLE, r.assignment, 10);
  assert.equal(heuristicBalance(prepare(EXAMPLE), 10).m, 6);
});

test('decimal times are balanced exactly (no rounding drift)', () => {
  const tasks = [
    { id: 'a', time: 1.5, predecessors: [] },
    { id: 'b', time: 2.25, predecessors: ['a'] },
    { id: 'c', time: 0.75, predecessors: ['a'] },
    { id: 'd', time: 3, predecessors: ['b', 'c'] },
  ];
  const r = minimizeStations({ tasks, cycleTime: 4.5 });
  assert.equal(r.stationCount, 2);
  assert.deepEqual(r.stations.map(s => s.load), [4.5, 3]);
  assert.equal(r.stations[1].idle, 1.5);
});

test('task tables: header, quotes, several predecessors, round trip', () => {
  const p = parseTaskTable('task,time,predecessors,description\nA,4,,"Fit frame, left"\nB,3,A,Weld\nC,5,A B,Paint\n');
  assert.deepEqual(p.tasks.map(t => t.id), ['A', 'B', 'C']);
  assert.deepEqual(p.tasks[2].predecessors, ['A', 'B']);
  assert.equal(p.tasks[0].name, 'Fit frame, left');
  assert.deepEqual(parseTaskTable(formatTaskTable(p)), p);
  assert.deepEqual(parseTaskTable('1;2\t3\n'.replace(';', ',')).tasks[0], { id: '1', time: 2, predecessors: ['3'] });
});

test('bad input is named, not balanced', () => {
  const t = (id, time, predecessors = []) => ({ id, time, predecessors });
  assert.throws(() => minimizeStations({ tasks: [t('a', 3, ['b']), t('b', 2, ['a'])], cycleTime: 9 }), /loop/);
  assert.throws(() => minimizeStations({ tasks: [t('a', 3, ['z'])], cycleTime: 9 }), /unknown predecessor "z"/);
  assert.throws(() => minimizeStations({ tasks: [t('a', 3), t('a', 2)], cycleTime: 9 }), /appears twice/);
  assert.throws(() => minimizeStations({ tasks: [t('a', 0)], cycleTime: 9 }), /above zero/);
  assert.throws(() => minimizeStations({ tasks: [t('a', 12)], cycleTime: 9 }), /longer than the cycle time/);
  assert.throws(() => minimizeStations({ tasks: [t('a', 3)], cycleTime: 0 }), /cycle time/);
  assert.throws(() => minimizeCycleTime({ tasks: [t('a', 3)] }, 1.5), /whole number/);
  assert.throws(() => parseIn2('3\n1\n2\n'), /lists 2 times/);
  assert.throws(() => parseIn2('2\n1\n2\n1,5\n'), /outside/);
  assert.throws(() => checkBalance(EXAMPLE, { ...Object.fromEntries(EXAMPLE.tasks.map(x => [x.id, 1])), 1: 2 }, 100), /before its predecessor/);
});

test('takt time is available time over demand', () => {
  assert.equal(taktTime(27000, 450), 60);
  assert.throws(() => taktTime(0, 10), /above zero/);
});

test('more stations than tasks: every task its own station at the longest task time', () => {
  const r = minimizeCycleTime(EXAMPLE, 20);
  assert.equal(r.cycleTime, 7);
  assert.equal(r.optimal, true);
});
