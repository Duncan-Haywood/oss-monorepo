import { test } from "node:test";
import assert from "node:assert/strict";
import {
  solve, sampleInput, validateInput, highestBidder, envyFreePayments, knasterPayments, roundPayments, envyWithCash,
  nashAllocation, pickingSequence, bidSheetCsv, parseBidSheet, ef1Violations, bundleValues, splitCash, resultText, resultCsv, serializeState, parseState, MAX_HEIRS, MAX_ITEMS,
} from "./calc.mjs";

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function randValues(r, n, m, zeroRate = 0.2) {
  return Array.from({ length: n }, () => Array.from({ length: m }, () => (r() < zeroRate ? 0 : Math.round(r() * 5000))));
}
function randWeights(r, n) { const raw = Array.from({ length: n }, () => 0.2 + r()); const t = raw.reduce((a, b) => a + b, 0); return raw.map((x) => x / t); }
function nashScore(values, owner, w) {
  const u = Array(values.length).fill(0);
  owner.forEach((k, j) => { if (k >= 0) u[k] += values[k][j]; });
  let zeros = 0, s = 0;
  u.forEach((x, i) => { if (x <= 1e-9) zeros++; else s += w[i] * Math.log(x); });
  return { zeros, s };
}
function bruteMnw(values, w) {
  const n = values.length, m = values[0].length;
  const items = [...Array(m).keys()].filter((j) => values.some((r) => r[j] > 0));
  let best = null;
  const owner = Array(m).fill(-1);
  const rec = (d) => {
    if (d === items.length) { const s = nashScore(values, owner, w); if (!best || s.zeros < best.zeros || (s.zeros === best.zeros && s.s > best.s + 1e-12)) best = s; return; }
    for (let i = 0; i < n; i++) { owner[items[d]] = i; rec(d + 1); }
  };
  rec(0);
  return best;
}

test("worked example: three heirs, everyone ends $1,255.56 over a fair third and nobody envies", () => {
  const R = solve(sampleInput());
  assert.ok(R.ok);
  assert.deepEqual(R.rows.map((r) => r.items), [["Piano"], ["Dining table", "Grandfather clock", "Tools"], ["Wedding ring", "Painting"]]);
  assert.deepEqual(R.rows.map((r) => r.payment), [1088.89, -177.78, -911.11]);
  assert.equal(R.margin, 1255.56);
  assert.equal(R.envyFree, true);
});

test("cash method, equal shares: payments sum to zero, envy-free, everyone at least a fair share (500 random estates)", () => {
  const r = rng(11);
  for (let k = 0; k < 500; k++) {
    const n = 2 + (k % (MAX_HEIRS - 1)), m = 1 + (k % 25);
    const values = randValues(r, n, m);
    const owner = highestBidder(values);
    const { payments, margin } = envyFreePayments(values, owner);
    assert.ok(Math.abs(payments.reduce((a, b) => a + b, 0)) < 1e-6, "budget balanced");
    assert.deepEqual(envyWithCash(values, owner, payments, 1e-6), [], `envy k=${k}`);
    assert.ok(margin >= -1e-6, "envy-free implies proportional");
    const A = bundleValues(values, owner);
    const V = values.map((row) => row.reduce((a, b) => a + b, 0));
    const over = A.map((row, i) => row[i] + payments[i] - V[i] / n);
    assert.ok(Math.abs(Math.min(...over) - margin) < 1e-6, "margin is the least-well-off heir's excess");
    const cents = roundPayments(payments);
    assert.ok(Math.round(cents.reduce((a, b) => a + b, 0) * 100) === 0, "cents still sum to zero");
    assert.ok(cents.every((c, i) => Math.abs(c - payments[i]) < 0.01 + 1e-9));
  }
});

test("cash method maximin: no envy-free balanced payments give the least-well-off heir more (random perturbations)", () => {
  // Any EF balanced payment vector is p + delta with sum(delta)=0. Sample deltas; whenever the
  // perturbed vector is still envy-free, its minimum excess must not beat the engine's.
  const r = rng(5);
  for (let k = 0; k < 120; k++) {
    const n = 2 + (k % 4), m = 2 + (k % 7);
    const values = randValues(r, n, m, 0.1);
    const owner = highestBidder(values);
    const { payments, margin } = envyFreePayments(values, owner);
    const A = bundleValues(values, owner);
    const V = values.map((row) => row.reduce((a, b) => a + b, 0));
    for (let t = 0; t < 200; t++) {
      const d = Array.from({ length: n }, () => (r() - 0.5) * 200);
      const mean = d.reduce((a, b) => a + b, 0) / n;
      const p = payments.map((x, i) => x + d[i] - mean);
      if (envyWithCash(values, owner, p, 1e-9).length) continue;
      const minOver = Math.min(...A.map((row, i) => row[i] + p[i] - V[i] / n));
      assert.ok(minOver <= margin + 1e-6, `k=${k}: found ${minOver} > ${margin}`);
    }
  }
});

test("cash method, unequal shares (Knaster): each heir gets share x (own valuation + surplus)", () => {
  const r = rng(3);
  for (let k = 0; k < 300; k++) {
    const n = 2 + (k % 5), m = 1 + (k % 20);
    const values = randValues(r, n, m);
    const w = randWeights(r, n);
    const owner = highestBidder(values);
    const { payments, surplus } = knasterPayments(values, owner, w);
    assert.ok(surplus >= -1e-6);
    assert.ok(Math.abs(payments.reduce((a, b) => a + b, 0)) < 1e-6);
    const A = bundleValues(values, owner);
    values.forEach((row, i) => {
      const V = row.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(A[i][i] + payments[i] - w[i] * (V + surplus)) < 1e-6);
    });
  }
});

test("items method: exact search matches brute force on small estates and is always (weighted) EF1", () => {
  const r = rng(21);
  let proven = 0;
  for (let k = 0; k < 150; k++) {
    const n = 2 + (k % 3), m = 2 + (k % 8);
    const values = randValues(r, n, m, 0.25);
    if (values.some((row) => row.every((x) => x === 0))) continue;
    const w = k % 2 ? randWeights(r, n) : Array(n).fill(1 / n);
    const res = nashAllocation(values, w);
    assert.deepEqual(ef1Violations(values, res.owner, w), [], `EF1 k=${k}`);
    if (res.proven) {
      proven++;
      const got = nashScore(values, res.owner, w), best = bruteMnw(values, w);
      assert.equal(got.zeros, best.zeros);
      assert.ok(Math.abs(got.s - best.s) < 1e-9, `k=${k}`);
    }
  }
  assert.ok(proven > 100, `only ${proven} proven`);
});

test("items method: local search alone (no exact pass) finds the optimum on most small estates", () => {
  const r = rng(77);
  let same = 0, total = 0;
  for (let k = 0; k < 120; k++) {
    const n = 2 + (k % 3), m = 3 + (k % 7);
    const values = randValues(r, n, m, 0.2);
    if (values.some((row) => row.every((x) => x === 0))) continue;
    const w = Array(n).fill(1 / n);
    const res = nashAllocation(values, w, { nodeBudget: 0 });
    const got = nashScore(values, res.owner, w), best = bruteMnw(values, w);
    total++;
    if (got.zeros === best.zeros && Math.abs(got.s - best.s) < 1e-9) same++;
  }
  // Measured 2026-11-13: recorded in README. Keep a floor well under it.
  assert.ok(same / total > 0.9, `${same}/${total}`);
});

test("weighted picking sequence is always weighted EF1", () => {
  const r = rng(8);
  for (let k = 0; k < 400; k++) {
    const n = 2 + (k % 7), m = 1 + (k % 30);
    const values = randValues(r, n, m, 0.3);
    const w = randWeights(r, n);
    assert.deepEqual(ef1Violations(values, pickingSequence(values, w), w), [], `k=${k}`);
  }
});

test("largest estate (8 heirs, 80 items) finishes quickly and stays EF1", () => {
  const r = rng(99);
  const values = randValues(r, MAX_HEIRS, MAX_ITEMS, 0.3);
  const w = Array(MAX_HEIRS).fill(1 / MAX_HEIRS);
  const t0 = Date.now();
  const res = nashAllocation(values, w);
  assert.ok(Date.now() - t0 < 15000, `${Date.now() - t0} ms`);
  assert.deepEqual(ef1Violations(values, res.owner, w), []);
});

test("items nobody values are left unclaimed in both methods", () => {
  const inp = sampleInput();
  inp.items.push("Old magazines");
  inp.heirs.forEach((h) => h.values.push(0));
  for (const mode of ["cash", "items"]) {
    const R = solve({ ...inp, mode });
    assert.deepEqual(R.unclaimed, ["Old magazines"]);
    assert.ok(R.notes.some((n) => n.includes("Old magazines")));
  }
});

test("estate cash is split by share and can cover the heirs who would otherwise pay in", () => {
  const R = solve({ ...sampleInput(), estateCash: 3000 });
  assert.deepEqual(R.rows.map((r) => r.estateCash), [1000, 1000, 1000]);
  assert.deepEqual(R.rows.map((r) => r.netCash), [2088.89, 822.22, 88.89]);
  assert.ok(!R.notes.some((n) => n.includes("own pocket")));
  for (let c = 0; c < 50; c++) {
    const cash = c * 33.37 + 0.01;
    const s = splitCash(cash, [0.5, 0.3, 0.2]);
    assert.equal(Math.round(s.reduce((a, b) => a + b, 0) * 100), Math.round(cash * 100));
  }
});

test("validation", () => {
  assert.ok(validateInput({ heirs: [{ values: [1] }], items: ["a"] }).some((e) => /two heirs/.test(e)));
  assert.ok(validateInput({ heirs: [{ values: [1] }, { values: [-1] }], items: ["a"] }).some((e) => /zero or more/.test(e)));
  assert.ok(validateInput({ equalShares: false, heirs: [{ share: 60, values: [1] }, { share: 30, values: [1] }], items: ["a"] }).some((e) => /100%/.test(e)));
  assert.ok(validateInput({ mode: "items", heirs: [{ values: [0] }, { values: [1] }], items: ["a"] }).some((e) => /zero/.test(e)));
  assert.deepEqual(validateInput(sampleInput()), []);
  assert.equal(solve({ heirs: [], items: [] }).ok, false);
});

test("text, CSV (formula-safe) and save/load round trip", () => {
  const inp = sampleInput();
  inp.items[0] = "=HYPERLINK(\"x\")";
  const R = solve(inp);
  assert.match(resultText(R), /Ana \(33\.3% share\)/);
  const csv = resultCsv(R);
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""));
  assert.ok(csv.includes("heir,share,items_value"));
  const back = parseState(serializeState(inp)).state;
  assert.deepEqual(back.items, inp.items);
  assert.deepEqual(back.heirs.map((h) => h.values), inp.heirs.map((h) => h.values));
  assert.ok(parseState("{").error);
  assert.ok(parseState("{\"kind\":\"other\"}").error);
  assert.equal(MAX_ITEMS, 80);
});

test("the market-price bound stays valid: proven answers match brute force on 3 heirs x 10 items, weighted", () => {
  const r = rng(404);
  for (let k = 0; k < 25; k++) {
    const values = randValues(r, 3, 10, 0.15);
    if (values.some((row) => row.every((x) => x === 0))) continue;
    const w = randWeights(r, 3);
    const res = nashAllocation(values, w, { restarts: 0 });
    assert.ok(res.proven);
    const got = nashScore(values, res.owner, w), best = bruteMnw(values, w);
    assert.equal(got.zeros, best.zeros);
    assert.ok(Math.abs(got.s - best.s) < 1e-9, `k=${k}`);
  }
});

test("typical family estates are proven optimal: 5 heirs x 40 items with correlated values", () => {
  const r = rng(2026);
  for (let k = 0; k < 5; k++) {
    const base = Array.from({ length: 40 }, () => Math.round(50 + r() * 3000));
    const values = Array.from({ length: 5 }, () => base.map((b) => (r() < 0.1 ? 0 : Math.round(b * (0.5 + r())))));
    assert.ok(nashAllocation(values, Array(5).fill(0.2)).proven, `k=${k}`);
  }
});

test("bid sheets: blank sheet, filled sheet with $ and blanks, and the tool's own CSV all read back", () => {
  const blank = bidSheetCsv(["Piano", "Clock, brass"], ["Ana", "Ben"]);
  assert.equal(blank, 'item,Ana,Ben\nPiano,,\n"Clock, brass",,\n');
  const filled = parseBidSheet('item,Ana,Ben\r\nPiano,"$1,200",300\n"Clock, brass",,50\n');
  assert.deepEqual(filled.items, ["Piano", "Clock, brass"]);
  assert.deepEqual(filled.heirs.map((h) => h.values), [[1200, 0], [300, 50]]);
  assert.ok(parseBidSheet("item,Ana,Ben\nPiano,abc,1").error);
  assert.ok(parseBidSheet("item,Ana\nPiano,1").error);
  const R = solve(sampleInput());
  const back = parseBidSheet(resultCsv(R));
  assert.deepEqual(back.items, R.items);
  assert.deepEqual(back.heirs.map((h) => h.name), R.heirs);
  assert.deepEqual(back.heirs.map((h) => h.values), R.values);
});
