import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseMoney, parsePercent, summaryText, scheduleCsv, sampleList, SAMPLE_SETTINGS, dollars, nextPeriod, nextPeriodEnd } from "./calc.mjs";

const S = (o = {}) => ({ retainagePct: "10", ...o });

test("money parsing handles dollars, commas, parentheses and negatives", () => {
  assert.equal(parseMoney("$1,234.50"), 123450);
  assert.equal(parseMoney("(500)"), -50000);
  assert.equal(parseMoney("-12.5"), -1250);
  assert.equal(parseMoney(""), 0);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parsePercent("10%"), 1000);
  assert.equal(parsePercent("5.5"), 550);
  assert.equal(parsePercent("101"), null);
});

test("one line: completed, retainage, payment due and balance by hand", () => {
  const r = compute("Description,Scheduled value,Previous,This period,Stored\nFraming,100000,30000,20000,10000", S({ previousCertificates: "27000" }));
  const m = r.summary;
  assert.equal(m.completed, 6000000);
  assert.equal(m.retainage, 600000);
  assert.equal(m.earnedLess, 5400000);
  assert.equal(m.due, 2700000);
  assert.equal(m.balanceToFinish, 4600000);
  assert.equal(r.lines[0].pct, 6000);
});

test("previous certificates default to previous work less retainage", () => {
  const r = compute("Description,Scheduled value,Previous,This period\nA,100000,40000,10000", S());
  assert.equal(r.summary.previous, 3600000);
  assert.equal(r.summary.previousEstimated, true);
  assert.equal(r.summary.due, 900000);
  assert.ok(r.findings.some((f) => /estimated/.test(f.title)));
});

test("change orders, including a deductive one, are split from the original sum", () => {
  const r = compute(sampleList(), SAMPLE_SETTINGS);
  assert.equal(r.summary.changes, 430000);
  assert.equal(r.summary.original + r.summary.changes, r.summary.contractToDate);
  assert.equal(r.summary.original, 528000 * 100);
  assert.ok(!r.findings.some((f) => /negative/.test(f.title)), "a fully billed deductive change order is not suspicious");
});

test("retainage on stored materials can use its own rate", () => {
  const r = compute("Description,Scheduled value,Previous,This period,Stored\nHVAC,100000,0,0,50000", S({ retainagePct: "10", storedRetainagePct: "0" }));
  assert.equal(r.summary.retStored, 0);
  assert.equal(r.summary.retainage, 0);
});

test("reduction at a completion threshold lowers the rate on the whole application", () => {
  const csv = "Description,Scheduled value,Previous,This period\nA,100000,40000,20000";
  const before = compute(csv, S({ reduceAtPct: "50", reducedPct: "5" }));
  assert.equal(before.summary.reduced, true);
  assert.equal(before.summary.retainage, 300000);
  const notYet = compute(csv, S({ reduceAtPct: "75", reducedPct: "5" }));
  assert.equal(notYet.summary.retainage, 600000);
});

test("reduction only on work completed past the threshold keeps what was already held", () => {
  // $100,000 contract, $70,000 completed, 10% reduced to 5% past 50%: $50,000 x 10% + $20,000 x 5% = $6,000.
  const csv = "Description,Scheduled value,Previous,This period\nA,60000,30000,12000\nB,40000,20000,8000";
  const r = compute(csv, S({ reduceAtPct: "50", reducedPct: "5", reduceMode: "remaining" }));
  assert.equal(r.summary.reduceMode, "remaining");
  assert.equal(r.summary.thresholdCents, 5000000);
  assert.equal(r.summary.retainage, 600000);
  // Spread in proportion: A did 42/70 of the work, so 30,000 x 10% + 12,000 x 5% = $3,600; B $2,400.
  assert.equal(r.lines[0].ret, 360000);
  assert.equal(r.lines[1].ret, 240000);
  // The same job under the "all" reading holds 5% of everything: $3,500.
  assert.equal(compute(csv, S({ reduceAtPct: "50", reducedPct: "5" })).summary.retainage, 350000);
  // "No further retainage after 50%": held stays at 10% of $50,000.
  assert.equal(compute(csv, S({ reduceAtPct: "50", reducedPct: "0", reduceMode: "remaining" })).summary.retainage, 500000);
  // Below the point nothing changes.
  assert.equal(compute(csv, S({ reduceAtPct: "75", reducedPct: "5", reduceMode: "remaining" })).summary.retainage, 700000);
  assert.ok(r.findings.some((f) => /first 50\.00% of the contract sum/.test(f.title)));
});

test("remaining mode: the previous-certificates estimate uses the same split, and a rolled month with no new work is due $0", () => {
  // Previous $50,000 is right at the point, so all of it was held at 10%: estimate = 50,000 - 5,000 = $45,000.
  const r = compute("Description,Scheduled value,Previous,This period\nA,100000,50000,20000", S({ reduceAtPct: "50", reducedPct: "5", reduceMode: "remaining" }));
  assert.equal(r.summary.previous, 4500000);
  assert.equal(r.summary.due, 7000000 - 600000 - 4500000);
  // Roll forward: next month's previous certificates are this month's line 6, and with no new work nothing is due.
  const n = nextPeriod(r, S({ reduceAtPct: "50", reducedPct: "5", reduceMode: "remaining" }));
  assert.equal(n.settings.reduceMode, "remaining");
  assert.equal(compute(n.csv, n.settings).summary.due, 0);
});

test("a per-line retainage column overrides the global rate", () => {
  const r = compute("Description,Scheduled value,Previous,This period,Retainage\nA,100000,0,10000,0\nB,100000,0,10000,", S());
  assert.equal(r.lines[0].ret, 0);
  assert.equal(r.lines[1].ret, 100000);
});

test("findings: overbilled line, negative payment due, front loading", () => {
  const over = compute("Description,Scheduled value,Previous,This period\nA,1000,900,200", S());
  assert.ok(over.findings.some((f) => f.severity === "high" && /over/.test(f.title)));
  const neg = compute("Description,Scheduled value,Previous,This period\nA,1000,500,0", S({ previousCertificates: "900" }));
  assert.ok(neg.findings.some((f) => /negative/.test(f.title)));
  const front = compute("Description,Scheduled value,Previous,This period\nMobilization,10000,8000,1500\nBig,990000,0,0", S());
  assert.ok(front.findings.some((f) => /Front-loading/.test(f.title)));
});

test("bad input is reported rather than guessed", () => {
  assert.ok(compute("", S()).errors.length);
  assert.ok(compute("Description,Foo\nA,1", S()).errors[0].match(/Scheduled value/));
  assert.ok(compute("Description,Scheduled value\nA,ten", S()).errors[0].match(/Row 2/));
  assert.ok(compute("Description,Scheduled value\nA,1", S({ retainagePct: "x" })).errors[0].match(/Retainage/));
});

test("column names from other templates are recognised", () => {
  const r = compute("Item No,Description of Work,Scheduled Value,Work Completed Previous,Work Completed This Period,Materials Presently Stored\n1,Site,1000,100,200,50", S());
  assert.equal(r.summary.completed, 35000);
});

test("outputs: summary text and CSV carry the totals; delimiter and quoting survive", () => {
  const r = compute('Description,Scheduled value,Previous,This period\n"Paint, interior",1000,0,100', S());
  assert.match(summaryText(r, { applicationNo: "2", project: "X" }), /CURRENT PAYMENT DUE/);
  const csv = scheduleCsv(r);
  assert.match(csv, /"Paint, interior"/);
  assert.match(csv, /TOTAL/);
  assert.equal(dollars(-150), "-$1.50");
});

test("tab-separated spreadsheet pastes work", () => {
  const r = compute("Description\tScheduled value\tPrevious\tThis period\nA\t1000\t0\t100", S());
  assert.equal(r.summary.completed, 10000);
});

test("next period: previous takes this period, this period starts at zero, stored stays stored", () => {
  const r = compute(sampleList(), SAMPLE_SETTINGS);
  const n = nextPeriod(r, SAMPLE_SETTINGS);
  const next = compute(n.csv, n.settings);
  assert.deepEqual(next.errors, []);
  r.lines.forEach((l, i) => {
    const m = next.lines[i];
    assert.equal(m.d, l.d + l.e, l.desc);
    assert.equal(m.e, 0);
    assert.equal(m.f, l.f);
    assert.equal(m.c, l.c);
    assert.equal(m.isCo, l.isCo, `${l.desc} stays a change order`);
  });
  assert.equal(next.summary.original, r.summary.original);
  assert.equal(next.summary.changes, r.summary.changes);
  assert.equal(n.settings.applicationNo, "5");
  assert.equal(n.settings.periodTo, "2026-11-30");
  assert.equal(n.settings.previousCertificates, (r.summary.earnedLess / 100).toFixed(2));
});

test("next period with no new work is due exactly zero, and new work is due net of retainage", () => {
  const r = compute(sampleList(), SAMPLE_SETTINGS);
  const n = nextPeriod(r, SAMPLE_SETTINGS);
  const idle = compute(n.csv, n.settings);
  assert.equal(idle.summary.due, 0);
  assert.ok(!idle.findings.some((f) => /estimated/.test(f.title)), "previous certificates carried, not estimated");
  // Bill $10,000 of drywall next month at 10% retainage: $9,000 due.
  const billed = n.csv.replace(/^(7,Drywall,,41000\.00,0\.00,)0\.00/m, "$110000");
  assert.notEqual(billed, n.csv);
  assert.equal(compute(billed, n.settings).summary.due, 900000);
});

test("next period chains: three months rolled match one month billed in total", () => {
  const sov = "Item,Description,Scheduled value,Previous,This period,Stored\n1,Framing,100000,0,25000,0\n2,Roofing,50000,0,0,5000";
  let s = { retainagePct: "10", applicationNo: "1", periodTo: "2026-01-31" };
  let r = compute(sov, s), paid = r.summary.due;
  for (const add of [20000, 30000]) {
    const n = nextPeriod(r, s);
    s = n.settings;
    r = compute(n.csv.replace(/^(1,Framing,,100000\.00,[\d.]+,)0\.00/m, `$1${add}`), s);
    paid += r.summary.due;
  }
  assert.equal(s.applicationNo, "3");
  assert.equal(s.periodTo, "2026-03-31");
  assert.equal(r.lines[0].d, 4500000);
  assert.equal(paid, r.summary.earnedLess, "the sum of every payment due equals total earned less retainage");
});

test("next period keeps a line's own retainage rate and notes stored and finished lines", () => {
  const r = compute("Description,Scheduled value,Previous,This period,Stored,Retainage\nA,1000,500,500,0,5\nB,2000,0,0,300,", S({ previousCertificates: "" }));
  const n = nextPeriod(r, {});
  assert.match(n.csv.split("\n")[0], /Retainage$/);
  const next = compute(n.csv, n.settings);
  assert.equal(next.lines[0].own, 500);
  assert.equal(next.lines[1].own, null);
  assert.ok(n.notes.some((x) => /still stored on 1 line \(B\)/.test(x)));
  assert.ok(n.notes.some((x) => /1 line is fully billed/.test(x)));
  assert.equal(nextPeriod({ errors: ["x"], summary: null }), null);
});

test("period end rolls month ends to month ends and clips other days", () => {
  assert.equal(nextPeriodEnd("2026-01-31"), "2026-02-28");
  assert.equal(nextPeriodEnd("2028-01-31"), "2028-02-29");
  assert.equal(nextPeriodEnd("2026-02-28"), "2026-03-31");
  assert.equal(nextPeriodEnd("2026-12-25"), "2027-01-25");
  assert.equal(nextPeriodEnd("2026-01-30"), "2026-02-28");
  assert.equal(nextPeriodEnd("Oct 31"), "");
  assert.equal(nextPeriodEnd(""), "");
});

// Red team 2026-11-25: "C.O. 3" is a common way to number a change order; it
// was read as a base-contract line (the same defect was fixed in pay-app-guides).
test("change orders numbered C.O. 3 or C.O.4 are change orders", () => {
  const r = compute("Item,Description,Scheduled value,This period\n1,Framing,10000,5000\nC.O. 3,Deduct fixtures,-1500,0\nC.O.4,Added outlet,600,600\nCO5,Added door,400,0\nConduit 2,Conduit,2000,0\n");
  assert.deepEqual(r.lines.map((l) => l.isCo), [false, true, true, true, false]);
  assert.equal(r.summary.changes, -150_000 + 60_000 + 40_000);
});
