import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaims, analyze, winChance, expectedNet, breakEvenWinChance, deadlines, addBusinessDays, parseHolidays, daysUntil, reportCsv, sampleClaims, money, pct } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const one = { label: "x", billed: 1000, qpa: 400, paid: 300, offer: null };

test("parseClaims reads rows, skips the header, and reports skipped lines", () => {
  const r = parseClaims("label,billed,QPA,paid,offer\nA,1000,400,300\nB,2000,500,0,900\nbad line\nC,-5,100,0");
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].offer, null);
  assert.equal(r.rows[1].offer, 900);
  assert.match(r.warnings[0], /2 line\(s\) skipped/);
  assert.match(parseClaims("").error, /Add at least one claim/);
});

test("winChance is flat to the QPA then falls linearly to the billed charge", () => {
  near(winChance(300, 400, 1000, 0.8, 0.2), 0.8);
  near(winChance(400, 400, 1000, 0.8, 0.2), 0.8);
  near(winChance(700, 400, 1000, 0.8, 0.2), 0.5);
  near(winChance(1000, 400, 1000, 0.8, 0.2), 0.2);
  near(winChance(5000, 400, 1000, 0.8, 0.2), 0.2);
  near(winChance(900, 400, 300, 0.8, 0.2), 0.8);
});

test("expected net matches a hand calculation", () => {
  // gain on loss 100, win adds 0.5*300, admin 115, loss-only entity fee 0.5*500
  near(expectedNet({ offer: 700, theirs: 400, paid: 300, p: 0.5, admin: 115, entity: 500, staff: 0 }), 100 + 150 - 115 - 250);
});

test("break-even win chance zeroes the expected net", () => {
  const args = { offer: 700, theirs: 400, paid: 300, admin: 115, entity: 500, staff: 0 };
  const p = breakEvenWinChance(args);
  near(p, 515 / 800);
  near(expectedNet({ ...args, p }), 0);
  assert.equal(breakEvenWinChance({ ...args, entity: 0, admin: 50 }), 0); // pays for itself even on a loss
  assert.equal(breakEvenWinChance({ offer: 420, theirs: 400, paid: 300, admin: 900, entity: 0, staff: 0 }), null); // cannot reach it
});

test("the offer search finds the analytic optimum", () => {
  // p = .8 - (o-400)/1000, EV = 100 + p(o-400) -> best at o = 800
  const r = analyze([one], { pWinAtQpa: 80, pWinAtBilled: 20, grid: 600 });
  near(r.lines[0].optimal.offer, 800);
  near(r.lines[0].optimal.p, 0.4);
  near(r.lines[0].ev, 260);
  assert.equal(r.lines[0].file, true);
  near(r.lines[0].optimalPctQpa, 2);
});

test("fees can turn a claim from file to skip, and batching shares them", () => {
  const costly = analyze([one], { pWinAtQpa: 80, pWinAtBilled: 20, adminFee: 115, entityFee: 500 });
  assert.ok(costly.lines[0].ev < costly.lines[0].optimal.ev + 1e-9);
  const tiny = { label: "t", billed: 300, qpa: 200, paid: 190, offer: null };
  const alone = analyze([tiny], { adminFee: 115, entityFee: 500 });
  assert.equal(alone.lines[0].file, false);
  const batched = analyze([tiny], { adminFee: 115, entityFee: 500, claimsPerDispute: 50 });
  assert.equal(batched.lines[0].file, true);
  assert.match(alone.verdict, /none is worth/);
});

test("a user-supplied offer is evaluated as typed and compared to the best", () => {
  const r = analyze([{ ...one, offer: 700 }], { pWinAtQpa: 80, pWinAtBilled: 20, grid: 600 });
  const l = r.lines[0];
  near(l.offerUsed, 700);
  near(l.p, 0.5);
  near(l.ev, 100 + 0.5 * 300);
  near(l.evLeftOnTable, 260 - 250);
  assert.equal(l.userMatchesBest, false);
});

test("the payer offer is never below what was already paid", () => {
  const r = analyze([{ ...one, paid: 900 }], { payerOfferPctQpa: 100 });
  assert.equal(r.lines[0].theirs, 900);
});

test("sensitivity totals fall as win chances fall", () => {
  const r = analyze([one, { ...one, label: "y", billed: 2000, qpa: 800, paid: 500 }], { adminFee: 115, entityFee: 500 });
  const t = r.sensitivity.map((s) => s.totalEv);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] >= t[i - 1] - 1e-9);
  assert.equal(r.sensitivity[2].delta, 0);
  near(r.sensitivity[2].totalEv, r.totalEv);
});

test("bad inputs are refused with a message", () => {
  assert.match(analyze([one], { pWinAtQpa: 120 }).error, /percentages/);
  assert.match(analyze([one], { pWinAtQpa: 30, pWinAtBilled: 60 }).error, /should not exceed/);
  assert.match(analyze([one], { adminFee: -1 }).error, /adminFee/);
  assert.match(analyze([one], { claimsPerDispute: 0 }).error, /at least 1/);
  assert.match(analyze([one], { entityFee: "abc" }).error, /entityFee/);
});

test("zero fees raise a warning rather than a confident answer", () => {
  assert.ok(analyze([one]).warnings.some((w) => /Both fees are zero/.test(w)));
  assert.ok(!analyze([one], { adminFee: 115 }).warnings.some((w) => /Both fees are zero/.test(w)));
});

test("business-day deadlines skip weekends and listed holidays", () => {
  assert.equal(addBusinessDays("2026-01-02", 1), "2026-01-05"); // Friday -> Monday
  const d = deadlines("2026-01-02", "2026-01-19");
  assert.equal(d.negotiationEnds, "2026-02-16");
  assert.equal(d.initiateBy, "2026-02-20");
  const plain = deadlines("2026-01-02");
  assert.equal(plain.negotiationEnds, "2026-02-13");
  assert.equal(plain.initiateBy, "2026-02-19");
  assert.ok(plain.warnings.some((w) => /No holidays/.test(w)));
  assert.match(deadlines("02/01/2026").error, /YYYY-MM-DD/);
  assert.match(deadlines("2026-02-30").error, /YYYY-MM-DD/);
  assert.deepEqual(parseHolidays("2026-01-19, nope").bad, ["nope"]);
  assert.equal(daysUntil("2026-02-19", "2026-02-12"), 7);
});

test("sample data analyzes and exports", () => {
  const sv = parseClaims(sampleClaims());
  assert.equal(sv.rows.length, 6);
  const r = analyze(sv.rows, { adminFee: 115, entityFee: 500, claimsPerDispute: 1 });
  assert.ok(!r.error);
  const csv = reportCsv(r);
  assert.match(csv, /^Claim,Billed,QPA/);
  assert.equal(csv.trim().split("\n").length, 1 + 6 + 1 + 1 + 4);
  assert.equal(money(-1234.5), "-$1,235");
  assert.equal(pct(0.256), "25.6%");
});
