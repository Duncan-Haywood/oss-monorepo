import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binomialPmf, designCount, demand, flowDistribution, percentileFlow, probabilityOf, HUNTER_1940, demandCurve } from './demand.mjs';

// BMS65 (1940) Table 2, read from the NIST scan: for each r, the number of
// fixtures n at which Hunter steps the design factor up to m = r, and the
// probability he printed for exactly r fixtures flowing. The flush-tank
// column is left out: its n values are garbled in the scan's text layer.
const FLUSH_VALVES = [[6, 2, 0.0119], [16, 3, 0.0102], [30, 4, 0.0101], [47, 5, 0.0104], [66, 6, 0.0106], [85, 7, 0.0100], [107, 8, 0.0105]];
const BATHTUBS = [[3, 2, 0.0124], [8, 3, 0.0118], [15, 4, 0.0126], [22, 5, 0.0107], [31, 6, 0.0118], [40, 7, 0.0112], [59, 9, 0.0104]];

test('the probability function reproduces Hunter\'s printed values (13 of 14 to the fourth decimal)', () => {
  let exact = 0;
  for (const [p, rows] of [[0.03, FLUSH_VALVES], [1 / 15, BATHTUBS]]) {
    for (const [n, r, printed] of rows) {
      const v = binomialPmf(n, p)[r];
      assert.ok(Math.abs(v - printed) < 0.0004, `n=${n} r=${r}: ${v} vs ${printed}`);
      if (Math.abs(v - printed) < 0.00006) exact++;
    }
  }
  // n=31 bathtubs (0.0115, printed 0.0118) is the one that differs;
  // README, "Checked against Hunter".
  assert.equal(exact, 13);
});

test('at each of Hunter\'s tabulated n the exact 1% tail rule gives his m', () => {
  for (const [p, rows] of [[0.03, FLUSH_VALVES], [1 / 15, BATHTUBS]]) for (const [n, r] of rows) assert.equal(designCount(n, p, 0.01), r, `n=${n}`);
});

test('the exact tail rule steps up earlier than Hunter\'s table for larger groups', () => {
  // Hunter keeps m = 7 flush valves up to 106 fixtures; by his own 1% rule
  // m = 8 is needed from 99, where P(more than 7 flowing) is already over 1%.
  let first = 1;
  while (designCount(first, 0.03) < 8) first++;
  assert.equal(first, 99);
  const pmf = binomialPmf(106, 0.03);
  const over7 = 1 - pmf.slice(0, 8).reduce((a, b) => a + b, 0);
  assert.ok(over7 > 0.01 && over7 < 0.015, String(over7));
});

test('pmf sums to one and survives thousands of fixtures without underflow', () => {
  for (const [n, p] of [[1, 0.5], [40, 0.03], [5000, 0.2]]) {
    const s = binomialPmf(n, p).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 1e-9, `${n},${p}: ${s}`);
  }
  assert.throws(() => binomialPmf(-1, 0.5));
  assert.throws(() => binomialPmf(3, 1.5));
});

test('one fixture type: the design flow is m times q, as Hunter computed it', () => {
  const fv = HUNTER_1940[0];
  for (const [n, m] of [[6, 2], [30, 4], [107, 8]]) {
    const d = demand([{ ...fv, count: n }]);
    assert.equal(d.designGpm, m * 27, `n=${n}`);
    assert.equal(d.perType[0].designCount, m);
  }
});

test('mixing types by convolution needs less than adding each type sized alone', () => {
  const groups = HUNTER_1940.map((g, i) => ({ ...g, count: [20, 30, 20][i] }));
  const d = demand(groups);
  assert.ok(d.designGpm < d.sumOfTypesAloneGpm, `${d.designGpm} vs ${d.sumOfTypesAloneGpm}`);
  assert.ok(d.designGpm > Math.max(...d.perType.map(t => t.aloneGpm)));
  assert.ok(d.designGpm < d.allAtOnceGpm);
});

test('the distribution matches a brute-force enumeration on a small mix', () => {
  const groups = [{ name: 'a', count: 2, gpm: 1, p: 0.3 }, { name: 'b', count: 1, gpm: 2.5, p: 0.1 }];
  const dist = flowDistribution(groups);
  const want = new Map();
  for (let a1 = 0; a1 < 2; a1++) for (let a2 = 0; a2 < 2; a2++) for (let b = 0; b < 2; b++) {
    const k = Math.round(((a1 + a2) * 1 + b * 2.5) / 0.1);
    const pr = (a1 ? 0.3 : 0.7) * (a2 ? 0.3 : 0.7) * (b ? 0.1 : 0.9);
    want.set(k, (want.get(k) || 0) + pr);
  }
  for (const [k, pr] of want) assert.ok(Math.abs(dist[k] - pr) < 1e-12, `k=${k}`);
  assert.ok(Math.abs(dist.reduce((s, x) => s + x, 0) - 1) < 1e-12);
});

test('percentile and zero truncation', () => {
  // One fixture busy 5% of the time: untruncated, flow is 0 more than 99%
  // of the time is false (95%), so the 1% design flow is its own flow; with a
  // 10% tail it is 0. Truncated, the only non-zero state is its flow.
  const dist = flowDistribution([{ name: 'x', count: 1, gpm: 3, p: 0.05 }]);
  assert.equal(percentileFlow(dist, 0.01), 3);
  assert.equal(percentileFlow(dist, 0.10), 0);
  assert.equal(percentileFlow(dist, 0.10, true), 3);
  // Truncation never lowers the design flow.
  const groups = [{ name: 'lav', count: 4, gpm: 1.5, p: 0.02 }, { name: 'sh', count: 2, gpm: 2.5, p: 0.05 }];
  assert.ok(demand(groups, { truncate: true }).percentileGpm >= demand(groups).percentileGpm);
});

test('the design flow never falls below the largest single fixture', () => {
  const d = demand([{ name: 'hose', count: 1, gpm: 5, p: 0.001 }]);
  assert.equal(d.percentileGpm, 0);
  assert.equal(d.designGpm, 5);
  assert.equal(d.floorApplied, true);
});

test('probability from uses per hour, from t/T, or given directly', () => {
  assert.equal(probabilityOf({ seconds: 480, usesPerHour: 2 }), 960 / 3600);
  assert.equal(probabilityOf({ seconds: 9, everySeconds: 300 }), 0.03);
  assert.equal(probabilityOf({ p: 0.2, seconds: 1, everySeconds: 2 }), 0.2);
});

test('bad input is reported, not computed', () => {
  assert.match(demand([]).errors[0], /at least one/);
  assert.match(demand([{ name: 'x', count: 1.5, gpm: 2, p: 0.1 }]).errors.join(), /whole number/);
  assert.match(demand([{ name: 'x', count: 1, gpm: 0, p: 0.1 }]).errors.join(), /flow/);
  assert.match(demand([{ name: 'x', count: 1, gpm: 2, seconds: 4000, usesPerHour: 1 }]).errors.join(), /share of time/);
  assert.match(demand([{ name: 'x', count: 0, gpm: 2, p: 0.1 }]).errors.join(), /zero/);
  assert.match(demand([{ name: 'x', count: 1, gpm: 2, p: 0.1 }], { tail: 0.7 }).errors.join(), /exceedance/);
});

test('demand curve grows with count and stays under everything-at-once', () => {
  const c = demandCurve(HUNTER_1940[1], [1, 10, 50, 200]);
  for (let i = 1; i < c.length; i++) assert.ok(c[i].gpm >= c[i - 1].gpm);
  assert.ok(c[3].gpm < 200 * 4);
});
