import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, normalizeJob, jobMinutes, jobCost, quoteJob, flatRule, verdict, quantityBreaks, stitchSensitivity,
  analyze, summarize, parseJobs, money, cents, pct, effectiveHourly,
} from "./engine.mjs";

// A job small enough to do by hand.
const HAND = {
  quantity: 12, garmentCost: 5, stitches: 6000, colors: 1, digitizingFee: 30, heads: 1, spm: 600, efficiency: 100,
  hoopMin: 2, setupJobMin: 10, setupColorMin: 0, colorChangeSec: 8, materialPer1000: 0.1, laborRate: 30, overheadPerHour: 12,
  margin: 50, minCharge: 0, rushPct: 0, minHourly: 40, flatPer1000: 1,
};
const job = (o = {}) => normalizeJob({ ...HAND, ...o }).job;

test("money formats negatives with the sign before the dollar sign", () => {
  assert.equal(money(-12), "-$12.00");
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-0.004), "$0.00");
  assert.equal(money(0), "$0.00");
  assert.equal(cents(-1200), "-$12.00");
  assert.equal(pct(12.345, 1), "12.3%");
  assert.equal(pct(NaN), "n/a");
});

test("normalizeJob fills defaults, rejects bad numbers and keeps the job quantity in the breaks", () => {
  const ok = normalizeJob({});
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.job.quantity, DEFAULTS.quantity);
  assert.deepEqual(ok.job.breakQtys, [12, 24, 48, 100, 250]);
  const odd = normalizeJob({ quantity: 30, breakQtys: "100, 12 ; 12 48" });
  assert.deepEqual(odd.job.breakQtys, [12, 30, 48, 100]);
  const bad = normalizeJob({ quantity: 0, efficiency: 150, margin: 100, stitches: "abc", heads: 1.5, breakQtys: "10, x" });
  assert.equal(bad.errors.length, 6);
  assert.equal(normalizeJob({ quantity: "$12", margin: "40%" }).job.margin, 40);
  assert.equal(normalizeJob({ offerPerPiece: -1 }).errors.length, 1);
  assert.equal(normalizeJob({ offerPerPiece: "" }).job.offerPerPiece, null);
});

test("clock minutes, cost and quote agree with hand arithmetic", () => {
  const j = job();
  const m = jobMinutes(j, 12);
  assert.equal(m.stitchMin, 10);
  assert.equal(m.hoops, 12);
  assert.equal(m.total, 10 + 12 * 10 + 12 * 2); // 154
  const c = jobCost(j, 12);
  assert.equal(c.garments, 6000);
  assert.equal(c.materials, 720);
  assert.equal(c.labor, 7700);   // 154/60 h x $30
  assert.equal(c.overhead, 3080); // 154/60 h x $12
  assert.equal(c.digitizing, 3000);
  assert.equal(c.total, 20500);
  const q = quoteJob(j, 12);
  assert.equal(q.targetTotal, 41000);          // 20500 / 0.5
  assert.equal(q.perPieceCents, 3417);         // 41000 / 12 = 3416.67, rounded up
  assert.equal(q.total, 41004);
  assert.equal(q.profit, 20504);
  assert.ok(q.margin >= 50);
  // hourly: (410.04 - 60 - 7.20 - 30 - 30.80) / 2.5667 h
  assert.ok(Math.abs(q.effectiveHourly - 282.04 / (154 / 60)) < 1e-6);
});

test("multi-head runs hoops in parallel and colors add change time and setup", () => {
  const j = job({ heads: 4, colors: 3, setupColorMin: 2, colorChangeSec: 30 });
  const m = jobMinutes(j, 10);
  assert.equal(m.hoops, 3);
  assert.equal(m.hoopRunMin, 10 + (2 * 30) / 60);
  assert.equal(m.setup, 10 + 2 * 3);
  assert.equal(m.total, 16 + 3 * 11 + 10 * 2);
  assert.equal(jobMinutes(job({ efficiency: 50 }), 1).stitchMin, 20);
});

test("closed-form clock time equals a replay of the machine hoop by hoop", () => {
  let seed = 7;
  const rnd = (lo, hi) => { seed = (seed * 1103515245 + 12345) % 2147483648; return lo + (seed / 2147483648) * (hi - lo); };
  for (let t = 0; t < 400; t += 1) {
    const j = job({
      heads: 1 + Math.floor(rnd(0, 8)), colors: 1 + Math.floor(rnd(0, 9)), stitches: Math.round(rnd(500, 40000)),
      spm: Math.round(rnd(300, 1000)), efficiency: Math.round(rnd(40, 100)), hoopMin: rnd(0, 4), setupJobMin: rnd(0, 30),
      setupColorMin: rnd(0, 5), colorChangeSec: rnd(0, 40),
    });
    const qty = 1 + Math.floor(rnd(0, 300));
    let clock = j.setupJobMin + j.setupColorMin * j.colors;
    let left = qty;
    const perHoop = j.stitches / (j.spm * (j.efficiency / 100)) + (Math.max(j.colors - 1, 0) * j.colorChangeSec) / 60;
    while (left > 0) {
      const n = Math.min(j.heads, left);
      clock += perHoop + n * j.hoopMin;
      left -= n;
    }
    assert.ok(Math.abs(clock - jobMinutes(j, qty).total) < 1e-6, `trial ${t}`);
  }
});

test("per-piece price is the smallest whole-cent price that reaches the target margin (brute force)", () => {
  let seed = 99;
  const rnd = (lo, hi) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return lo + (seed / 4294967296) * (hi - lo); };
  for (let t = 0; t < 300; t += 1) {
    const j = job({
      quantity: 1 + Math.floor(rnd(0, 60)), garmentCost: Math.round(rnd(0, 40) * 100) / 100, stitches: Math.round(rnd(1000, 30000)),
      colors: 1 + Math.floor(rnd(0, 8)), heads: 1 + Math.floor(rnd(0, 6)), margin: Math.floor(rnd(0, 70)), minCharge: 0, rushPct: 0,
      digitizingFee: Math.round(rnd(0, 80)), laborRate: Math.round(rnd(0, 60)), overheadPerHour: Math.round(rnd(0, 30)),
    });
    const q = quoteJob(j, j.quantity);
    const cost = jobCost(j, j.quantity).total;
    // search upward from a price known to be too low
    let p = Math.max(0, Math.floor(cost / j.quantity) - 1);
    const reaches = (price) => price * j.quantity * (100 - j.margin) >= 100 * cost;
    while (!reaches(p)) p += 1;
    assert.equal(q.perPieceCents, p, `trial ${t}`);
    assert.equal(q.total, p * j.quantity);
    assert.ok(q.margin + 1e-9 >= j.margin);
    if (p > 0) assert.ok(!reaches(p - 1));
  }
});

test("minimum charge and rush surcharge", () => {
  const j = job({ quantity: 2, minCharge: 250, margin: 40 });
  const q = quoteJob(j, 2);
  assert.equal(q.minBound, true);
  assert.equal(q.total, 25000);
  assert.equal(q.perPieceCents, 12500);
  const big = quoteJob(job({ minCharge: 250 }), 12);
  assert.equal(big.minBound, false);
  const rush = quoteJob(job({ rushPct: 25 }), 12);
  const plain = quoteJob(job(), 12);
  assert.ok(rush.total >= Math.ceil(plain.targetTotal * 1.25) && rush.total <= Math.ceil(plain.targetTotal * 1.25) + 12);
  assert.ok(rush.margin > plain.margin);
  const both = quoteJob(job({ quantity: 2, minCharge: 250, rushPct: 20 }), 2);
  assert.equal(both.total, 30000);
});

test("a thinner margin or a bigger quantity never raises the per-piece price", () => {
  const rows = quantityBreaks(job({ breakQtys: [1, 6, 12, 24, 48, 100, 250, 1000] }));
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].quote.perPieceCents <= rows[i - 1].quote.perPieceCents, `qty ${rows[i].qty}`);
  assert.ok(quoteJob(job({ margin: 30 }), 12).total < quoteJob(job({ margin: 50 }), 12).total);
});

test("quantity-break rows flag minimum charge, setup domination and the biggest drop", () => {
  const rows = quantityBreaks(job({ minCharge: 400, digitizingFee: 60 }), [3, 12, 100, 500]);
  assert.equal(rows[0].minChargeBinds, true);
  assert.equal(rows[0].dropPct, null);
  assert.ok(rows[1].dropPct > 0);
  assert.equal(rows[3].setupDominates, false);
  assert.equal(rows[0].setupDominates, rows[0].quote.setupShare >= 50);
  assert.ok(rows[0].quote.setupShare > rows[3].quote.setupShare);
});

test("the flat per-1000 rule ignores setup, so it loses money on small runs and covers cost on big ones", () => {
  const j = job({ digitizingFee: 80, setupJobMin: 30, flatPer1000: 2.5 });
  const small = flatRule(j, 1);
  const large = flatRule(j, 200);
  assert.equal(small.perPieceCents, 500 + 1500);
  assert.equal(small.losesMoney, true);
  assert.equal(large.losesMoney, false);
  const a = analyze({ ...HAND, digitizingFee: 80, setupJobMin: 30, flatPer1000: 2.5, breakQtys: "1, 12, 200" });
  assert.ok(a.breaks[0].flat.losesMoney);
  assert.ok(a.breaks[0].flatShortfall < 0);
  assert.ok(a.findings.some((f) => f.rule === "flat-rule-loses-money"));
  // the reported crossover really is the first quantity from which the rule covers cost
  const from = a.flatLosesBelow;
  assert.equal(flatRule(j, from).losesMoney, false);
  assert.equal(flatRule(j, from - 1).losesMoney, true);
});

test("verdict compares the effective hourly with the floor and prices the counter-offer", () => {
  const j = job({ minHourly: 40 });
  const q = quoteJob(j, 12);
  assert.equal(verdict(j, 12, q.total).status, "take");
  const low = verdict(j, 12, 20000);
  assert.equal(low.status, "counter");
  assert.ok(low.minTotalCents > 20000);
  // paying the counter-offer price reaches the floor, one cent a piece less does not
  const c = jobCost(j, 12);
  assert.ok(effectiveHourly(c, low.minTotalCents) >= 40 - 1e-9);
  assert.ok(effectiveHourly(c, (low.minPerPieceCents - 1) * 12) < 40);
  assert.equal(verdict(j, 12, 5000).status, "pass");
  assert.match(verdict(j, 12, 5000).text, /^Pass: /);
});

test("analyze: an offered price drives the verdict, the quote does not move", () => {
  const base = analyze({ ...HAND });
  const offered = analyze({ ...HAND, offerPerPiece: 17 });
  assert.equal(offered.quote.total, base.quote.total);
  assert.equal(offered.priced, 17 * 100 * 12);
  assert.notEqual(offered.verdict.status, "take");
  assert.equal(base.verdict.status, "take");
  assert.match(summarize(base).text, /^Quote \$410\.04 for 12 pieces/);
});

test("stitch sensitivity: more stitches means a higher price, and the slope is reported", () => {
  const s = stitchSensitivity(job(), 12);
  assert.deepEqual(s.rows.map((r) => r.factor), [0.5, 0.75, 1, 1.25, 1.5, 2]);
  assert.equal(s.rows[2].stitches, 6000);
  assert.equal(s.rows[2].quote.total, quoteJob(job(), 12).total);
  for (let i = 1; i < s.rows.length; i += 1) assert.ok(s.rows[i].quote.perPieceCents > s.rows[i - 1].quote.perPieceCents);
  // slope is the price change per 1000 stitches over the whole range
  const span = s.rows[5].stitches - s.rows[0].stitches;
  assert.ok(Math.abs(s.pricePer1000 - (s.rows[5].quote.perPieceCents - s.rows[0].quote.perPieceCents) / 100 / (span / 1000)) < 1e-9);
  assert.ok(s.pricePer1000 > 0);
});

test("scanned crossover quantities are exact", () => {
  const a = analyze({ ...HAND, quantity: 6, minCharge: 300, digitizingFee: 60, breakQtys: "3, 6, 24, 100" });
  const j = a.job;
  assert.equal(quoteJob(j, a.minChargeStopsAt).minBound, false);
  assert.equal(quoteJob(j, a.minChargeStopsAt - 1).minBound, true);
  assert.ok(a.findings.some((f) => f.rule === "minimum-charge-binds"));
  assert.ok(quoteJob(j, a.setupFallsBelowHalfAt).setupShare < 50);
  assert.ok(quoteJob(j, a.setupFallsBelowHalfAt - 1).setupShare >= 50);
});

test("analyze rejects bad input with every problem listed", () => {
  assert.throws(() => analyze({ quantity: -1, margin: 120 }), (e) => e.errors.length === 2 && /quantity/.test(e.message));
});

test("parseJobs reads rows, optional header and blanks, with line numbers", () => {
  const r = parseJobs("name,quantity,garment_cost,stitches,colors,digitizing_fee,offer_per_piece\n# note\nPolos,24,14.5,6200,2,30,\n\n,5\nCaps,12,6,5400,3,35,13");
  assert.equal(r.jobs.length, 2);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^line 5: the job needs a name/);
  assert.deepEqual(r.jobs[0].fields, { quantity: "24", garmentCost: "14.5", stitches: "6200", colors: "2", digitizingFee: "30" });
  assert.equal(r.jobs[1].fields.offerPerPiece, "13");
  assert.equal(parseJobs("").jobs.length, 0);
});

test("the default job quotes sensibly and the flat rule undercuts it at 24 pieces", () => {
  const a = analyze({});
  assert.equal(a.job.quantity, 24);
  assert.ok(a.quote.margin >= 40);
  assert.ok(a.quote.total > a.flat.total);
  assert.ok(a.verdict.status === "take");
  assert.equal(a.breaks.length, 5);
});
