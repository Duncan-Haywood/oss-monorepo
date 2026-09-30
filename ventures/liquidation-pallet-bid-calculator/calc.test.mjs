import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyCondition, parseManifest, normalizeParams, concentration, costsAt, simulate, analyze,
  reportCsv, summaryCsv, csvCell, sampleManifestText, money, pct, DEFAULTS,
} from "./calc.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);
const lines = (rows) => parseManifest(["item,qty,unit_retail,condition,category", ...rows].join("\n")).lines;

// A deterministic setting: no uncertainty at all, so the simulation collapses onto the arithmetic.
// A pallet big enough that its max bids are positive under the default costs.
const PALLET = ["A,30,120,Used,x", "B,4,900,New,y", "C,80,25,Open Box,x", "D,20,40,New,x"];
const FIXED = { marketSigmaPct: 0, lineSigmaPct: 0, concentration: Infinity, trials: 500 };

test("condition classes are read from common liquidation wording", () => {
  assert.equal(classifyCondition("Brand New"), "new");
  assert.equal(classifyCondition("Customer Return"), "used");
  assert.equal(classifyCondition("Open Box"), "open-box");
  assert.equal(classifyCondition("Like New"), "open-box");
  assert.equal(classifyCondition("Damaged"), "salvage");
  assert.equal(classifyCondition("Salvage - for parts"), "salvage");
  assert.equal(classifyCondition(""), null);
  assert.equal(classifyCondition("zzz"), null);
});

test("manifest parsing: header names, delimiters, quotes, money formats and bad rows", () => {
  const r = parseManifest('Description;Qty;MSRP;Grade\n"Widget, large";2;$1,200.50;New\nBad row;1;abc;New\nZero;1;0;New\nNegative qty;-1;5;New\n');
  assert.equal(r.lines.length, 1);
  assert.equal(r.skipped, 3);
  assert.equal(r.lines[0].item, "Widget, large");
  assert.equal(r.lines[0].ext, 2401);
  assert.equal(r.lines[0].cls, "new");
  const t = parseManifest("item\tqty\tretail\tcondition\nA\t3\t10\tUsed");
  assert.equal(t.lines[0].ext, 30);
  const noHeader = parseManifest("Gadget,4,25.00,Open Box\nThing,1,100,Used");
  assert.equal(noHeader.hasHeader, false);
  assert.equal(noHeader.lines[0].ext, 100);
  assert.equal(noHeader.lines[1].cls, "used");
  const ext = parseManifest("item,qty,ext retail\nA,4,100");
  assert.equal(ext.lines[0].unitRetail, 25);
  assert.equal(ext.lines[0].ext, 100);
  const noQty = parseManifest("item,retail\nA,50\nB,20");
  assert.equal(noQty.lines.length, 2);
  assert.equal(noQty.defaultedQty, 2);
  assert.ok(parseManifest("").error);
  assert.ok(parseManifest("item,qty\nA,1").error);
  assert.ok(parseManifest("item,qty,retail\nA,1,0").error);
});

test("parameters are validated", () => {
  assert.equal(normalizeParams({}).errors.length, 0);
  assert.ok(normalizeParams({ buyerPremiumPct: -1 }).errors.length);
  assert.ok(normalizeParams({ trials: 10 }).errors.length);
  assert.ok(normalizeParams({ recovery: { used: 500 } }).errors.length);
  assert.ok(normalizeParams({ bid: -5 }).errors.length);
  assert.ok(normalizeParams({ defaultClass: "nope" }).errors.length);
  assert.ok(analyze(lines(["A,1,100,New,x"]), { channelFeePct: 99 }).error);
});

test("cost identity: bid, premium, freight, handling and holding add up", () => {
  const p = normalizeParams({ buyerPremiumPct: 10, freight: 200, handlingPerUnit: 1, months: 6, storagePerMonth: 10, capitalRatePct: 12 }).p;
  const c = costsAt(1000, 50, p);
  near(c.purchase, 1100, 1e-9);
  near(c.cash, 1100 + 200 + 50, 1e-9);
  near(c.holding, 1350 * 0.06 + 60, 1e-9);
  near(c.total, c.cash + c.holding, 1e-9);
});

test("with no uncertainty the simulation equals the arithmetic and every trial is identical", () => {
  const ls = lines(["TV,2,500,New,e", "Lamp,10,40,Used,h", "Junk,5,100,Damaged,x"]);
  const r = analyze(ls, { ...FIXED, bid: 300 });
  const p = r.p;
  const d = p.damagePct / 100, s = p.sellThroughPct / 100, fee = p.channelFeePct / 100;
  let expectRev = 0, units = 0;
  for (const l of ls) {
    expectRev += l.ext * (p.recovery[l.cls] / 100) * (1 - d) * s * (1 - fee) - l.qty * (1 - d) * s * p.outboundPerUnit;
    units += l.qty;
  }
  const cost = costsAt(300, units, p);
  near(r.stats.mean, expectRev - cost.total, 1e-6);
  near(r.stats.sd, 0, 1e-6);
  near(r.stats.p10, r.stats.p90, 1e-6);
  assert.ok(r.stats.pProfit === 0 || r.stats.pProfit === 1);
  near(r.summary.expectedNetRevenue, expectRev, 1e-6);
  near(r.perLine.reduce((a, l) => a + l.contribution, 0), r.stats.mean, 1e-6);
});

test("determinism: same seed same answer, different seed different answer", () => {
  const ls = lines(["A,3,120,Used,x", "B,1,900,New,y", "C,8,25,Open Box,x"]);
  const a = analyze(ls, { seed: 5 }), b = analyze(ls, { seed: 5 }), c = analyze(ls, { seed: 6 });
  assert.deepEqual(a.stats, b.stats);
  assert.deepEqual(a.bids, b.bids);
  assert.notEqual(a.stats.mean, c.stats.mean);
  assert.equal(reportCsv(a), reportCsv(b));
});

test("simulated mean recovers the analytic mean (uncertainty is mean-preserving)", () => {
  const ls = lines(["A,3,120,Used,x", "B,1,900,New,y", "C,8,25,Open Box,x", "D,2,60,Damaged,z"]);
  const many = analyze(ls, { trials: 40000, bid: 200 });
  const fixed = analyze(ls, { ...FIXED, bid: 200 });
  near(many.stats.mean, fixed.stats.mean, Math.abs(fixed.stats.mean) * 0.03 + 8, "MC mean vs arithmetic");
  assert.ok(many.stats.sd > 0);
});

test("max bid for P(loss)<=X: loss probability is at most X at it and above X just past it", () => {
  const ls = lines(PALLET);
  for (const x of [5, 10, 25]) {
    const r = analyze(ls, { maxLossProbPct: x, trials: 6000 });
    const at = analyze(ls, { maxLossProbPct: x, trials: 6000, bid: r.bids.loss });
    assert.ok(at.stats.pLoss <= x / 100 + 1e-9, `${x}%: ${at.stats.pLoss}`);
    const past = analyze(ls, { maxLossProbPct: x, trials: 6000, bid: r.bids.loss + 15 });
    assert.ok(past.stats.pLoss > x / 100, `${x}% past: ${past.stats.pLoss}`);
  }
});

test("max bid for target ROI: expected ROI equals the target at it", () => {
  const ls = lines(PALLET);
  const r = analyze(ls, { targetRoiPct: 40 });
  const at = analyze(ls, { targetRoiPct: 40, bid: r.bids.roi });
  near(at.stats.roi, 0.4, 1e-6);
  const p = analyze(ls, { targetProfit: 250 });
  near(analyze(ls, { targetProfit: 250, bid: p.bids.profit }).stats.mean, 250, 1e-6);
});

test("recommended bid is the lowest of the three limits, and a stricter limit lowers it", () => {
  const ls = lines(PALLET);
  const r = analyze(ls, {});
  assert.equal(r.bids.recommended, Math.min(r.bids.loss, r.bids.roi, r.bids.profit));
  assert.ok(analyze(ls, { maxLossProbPct: 2 }).bids.loss < analyze(ls, { maxLossProbPct: 20 }).bids.loss);
  assert.ok(analyze(ls, { targetRoiPct: 80 }).bids.roi < analyze(ls, { targetRoiPct: 10 }).bids.roi);
  assert.ok(analyze(ls, { freight: 900 }).bids.recommended < analyze(ls, { freight: 100 }).bids.recommended);
  assert.ok(analyze(ls, { buyerPremiumPct: 20 }).bids.recommended < analyze(ls, { buyerPremiumPct: 5 }).bids.recommended);
});

test("break-even recovery: scaling every class by it gives zero expected profit", () => {
  const ls = lines(["A,3,120,Used,x", "B,1,900,New,y", "C,8,25,Open Box,x"]);
  const r = analyze(ls, { bid: 250 });
  const m = r.breakEven.multiplier;
  const rec = {}; for (const k of Object.keys(DEFAULTS.recovery)) rec[k] = DEFAULTS.recovery[k] * m;
  const at = analyze(ls, { bid: 250, recovery: rec });
  near(at.stats.mean, 0, 1e-6, "profit at break-even recovery");
  near(r.breakEven.blended, r.breakEven.assumedBlended * m, 1e-12);
  assert.ok(analyze(ls, { bid: 2500 }).breakEven.multiplier > m);
});

test("sensitivity table: monotone in recovery and its 1.0 row matches the headline", () => {
  const ls = lines(["A,3,120,Used,x", "B,1,900,New,y", "C,8,25,Open Box,x"]);
  const r = analyze(ls, { bid: 250 });
  for (let i = 1; i < r.sensitivity.length; i++) {
    assert.ok(r.sensitivity[i].mean > r.sensitivity[i - 1].mean);
    assert.ok(r.sensitivity[i].pProfit >= r.sensitivity[i - 1].pProfit);
    assert.ok(r.sensitivity[i].maxBidLoss >= r.sensitivity[i - 1].maxBidLoss);
  }
  const one = r.sensitivity.find((s) => s.mult === 1);
  near(one.mean, r.stats.mean, 1e-9);
  near(one.pProfit, r.stats.pProfit, 1e-12);
  near(one.maxBidLoss, r.bids.loss, 1e-9);
});

test("concentration: shares, effective line count and category share", () => {
  const ls = lines(["A,1,500,New,tv", "B,1,300,New,tv", "C,1,100,New,home", "D,1,50,New,home", "E,1,30,New,home", "F,1,20,New,home"]);
  const c = concentration(ls);
  near(c.total, 1000, 1e-9);
  near(c.top1, 0.5, 1e-12);
  near(c.top5, 0.98, 1e-12);
  assert.equal(c.topCategory.name, "tv");
  near(c.topCategory.share, 0.8, 1e-12);
  const equal = concentration(lines(Array.from({ length: 20 }, (_, i) => `I${i},1,10,New,x`)));
  near(equal.effectiveLines, 20, 1e-9);
  near(equal.top5, 0.25, 1e-12);
  const r = analyze(ls, {});
  assert.ok(r.findings.some((f) => /concentrated/i.test(f.title)));
});

test("concentration widens the spread: same value in one line is riskier than in fifty", () => {
  const one = lines(["Big,1,5000,Used,x"]);
  const many = lines(Array.from({ length: 50 }, (_, i) => `I${i},1,100,Used,x`));
  const a = analyze(one, { bid: 400, freight: 0, handlingPerUnit: 0, outboundPerUnit: 0 });
  const b = analyze(many, { bid: 400, freight: 0, handlingPerUnit: 0, outboundPerUnit: 0 });
  assert.ok(a.stats.sd > b.stats.sd, `${a.stats.sd} vs ${b.stats.sd}`);
});

test("per-line contribution ranks lines and sums to expected net at the bid", () => {
  const r = analyze(lines(["Gold,1,1000,New,x", "Junk,10,10,Damaged,x"]), { bid: 100, ...FIXED, freight: 0 });
  assert.equal(r.perLine[0].item, "Gold");
  assert.ok(r.perLine[1].contribution < 0);
  near(r.perLine.reduce((a, l) => a + l.revenueShare, 0), 1, 1e-9);
});

test("edge cases: zero bid, zero sell-through, 100% damage, free everything, single line, huge manifest", () => {
  const ls = lines(["A,2,100,New,x"]);
  const zero = analyze(ls, { bid: 0 });
  assert.equal(zero.summary.bid, 0);
  assert.ok(Number.isFinite(zero.stats.mean));
  const none = analyze(ls, { sellThroughPct: 0, bid: 50 });
  assert.ok(none.stats.mean < 0);
  assert.equal(none.stats.pProfit, 0);
  assert.equal(none.bids.recommended, 0);
  assert.ok(none.findings.some((f) => /No positive bid/.test(f.title)));
  assert.equal(none.breakEven, null);
  const dmg = analyze(ls, { damagePct: 100, bid: 10 });
  assert.equal(dmg.stats.pProfit, 0);
  const free = analyze(ls, { buyerPremiumPct: 0, freight: 0, handlingPerUnit: 0, storagePerMonth: 0, capitalRatePct: 0, channelFeePct: 0, outboundPerUnit: 0, ...FIXED, damagePct: 0, sellThroughPct: 100, bid: 50 });
  near(free.stats.mean, 200 * 0.45 - 50, 1e-9);
  const big = Array.from({ length: 3000 }, (_, i) => `Item ${i},${1 + (i % 5)},${20 + (i % 90)},${["New", "Used", "Damaged", ""][i % 4]},c${i % 7}`);
  const rb = analyze(lines(big), {});
  assert.ok(rb.bids.recommended > 0);
  assert.equal(rb.summary.lines, 3000);
});

test("unlabelled lines fall back to the chosen default class and are flagged", () => {
  const ls = lines(["A,1,100,,x"]);
  const a = analyze(ls, { defaultClass: "new", ...FIXED, bid: 0 });
  const b = analyze(ls, { defaultClass: "salvage", ...FIXED, bid: 0 });
  assert.ok(a.stats.mean > b.stats.mean);
  assert.ok(a.findings.some((f) => /no readable condition/.test(f.title)));
});

test("a bid above the recommended maximum is called out", () => {
  const ls = lines(["A,3,120,Used,x", "B,1,900,New,y"]);
  const r = analyze(ls, {});
  const over = analyze(ls, { bid: r.bids.recommended + 500 });
  assert.ok(over.findings.some((f) => /above the recommended/.test(f.title)));
  assert.ok(!r.findings.some((f) => /above the recommended/.test(f.title)));
});

test("CSV export is spreadsheet-injection safe", () => {
  for (const evil of ["=HYPERLINK(\"http://x\",\"y\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", " =1+1", "\r=1"]) {
    const cell = csvCell(evil);
    assert.match(cell, /^"?'/, evil);
  }
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(-12.5), "-12.5000");
  assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
  const ls = parseManifest('item,qty,retail,condition\n"=cmd|\' /C calc\'!A0",1,100,New\n"@x",1,50,Used\n').lines;
  const csv = reportCsv(analyze(ls, {}));
  for (const row of csv.trim().split("\n").slice(1)) assert.doesNotMatch(row, /^[=+\-@]/);
  assert.match(csv, /'=cmd/);
  const sum = summaryCsv(analyze(ls, {}));
  assert.match(sum, /max_bid_recommended/);
  assert.match(sum, /recovery_multiplier/);
});

test("the sample manifest parses cleanly and gives a positive recommended bid", () => {
  const p = parseManifest(sampleManifestText());
  assert.equal(p.lines.length, 50);
  assert.equal(p.skipped, 0);
  assert.equal(sampleManifestText(), sampleManifestText());
  const r = analyze(p.lines, {});
  assert.ok(r.bids.recommended > 0 && r.bids.recommended < r.summary.totalRetail);
  assert.equal(simulate(p.lines, { trials: 300 }).A.length, 300);
});

test("formatting helpers", () => {
  assert.equal(money(1234.6), "$1,235");
  assert.equal(money(-5), "-$5");
  assert.equal(pct(0.1234), "12.3%");
  assert.equal(money(NaN), "n/a");
  assert.equal(money(-0.11), "$0");
});
