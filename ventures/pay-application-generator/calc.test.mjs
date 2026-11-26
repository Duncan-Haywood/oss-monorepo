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

// Red team 2026-11-25 (second run): "CO2 sensors" or "CO2 monitoring" is a base-contract HVAC line, but a description
// starting "CO" + digit was read as change order 2, moving its value out of the original contract sum. A description
// needs a separator ("CO-2", "CO 2", "C.O. 2") to count; a compact "CO2" in the Item column still does.
test("a CO2 sensors line is base contract, not change order 2", () => {
  const r = compute("Item,Description,Scheduled value,Previous,This period\n1,Framing,10000,0,0\n2,CO2 sensors,5000,0,1000\nCO2,Added door,400,0,0\n3,CO-3 added outlet,600,0,0\n4,C.O. 4 extra paint,300,0,0\n");
  assert.deepEqual(r.lines.map((l) => l.isCo), [false, false, true, true, true]);
  assert.equal(r.summary.original, 1_500_000);
  assert.equal(r.summary.changes, 40_000 + 60_000 + 30_000);
});

// Guards for mutants that escaped the 2026-11-25 campaign.
test("a line's label is its description, and falls back to the item number", () => {
  const bad = compute("Item,Description,Scheduled value,This period\n7,Framing,ten,0\n");
  assert.match(bad.errors[0], /\(Framing\)/);
  const noDesc = compute("Item,Description,Scheduled value,This period\n7,,1000,0\n");
  assert.equal(noDesc.lines[0].desc, "7");
});

test("next period does not count an empty zero-value line as fully billed", () => {
  const r = compute("Item,Description,Scheduled value,Previous,This period\n1,Framing,1000,0,500\n2,Allowance,0,0,0\n");
  const n = nextPeriod(r, {});
  assert.ok(!n.notes.some((x) => /fully billed/.test(x)), n.notes.join(" | "));
});

test("a percent is a plain decimal: hex or exponent text is refused", () => {
  assert.equal(parsePercent("0x10"), null);
  assert.equal(parsePercent("1e1"), null);
  assert.equal(parsePercent("7.5"), 750);
  assert.equal(parsePercent(".5%"), 50);
});

test("half a cent of retainage rounds away from zero, so a deductive change order mirrors the same amount billed", () => {
  // 10% of 1,234.55 is 123.455. Excel's ROUND (and the workbook's formulas) give 123.46 and -123.46; Math.round alone
  // would give -123.45 for the deduction and leave the page a cent off the workbook.
  const r = compute("Item,Description,Scheduled value,Previous,This period,Stored\n1,Base,100000,0,1234.55,0\nCO-1,Deduct,-1234.55,0,-1234.55,0", S());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.lines.map((l) => l.ret), [12346, -12346]);
  assert.equal(r.summary.retainage, 0);
});

test("retainage is odd-symmetric: negating every amount on a line negates its retainage, at any rate", () => {
  // A seeded sweep over cents and rates, so any rounding that favours one sign (the class of the bug above) fails here
  // in CI, where the LibreOffice recalculation test is skipped.
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 300; i++) {
    // Amounts ending in 5 cents at the common 10%, 5% and 2.5% rates land on half cents; the rest are any rate.
    const amt = ((rnd(1000000) * 10 + 5) / 100).toFixed(2), stored = ((rnd(10000) * 10 + 5) / 100).toFixed(2);
    const rate = ["10", "5", "2.5", (rnd(2001) / 100).toFixed(2)][i % 4];
    const csv = (sign) => `Item,Description,Scheduled value,Previous,This period,Stored\nCO-${i},Change,${sign}${amt},0,${sign}${amt},${sign}${stored}`;
    const pos = compute(csv(""), S({ retainagePct: rate })), neg = compute(csv("-"), S({ retainagePct: rate }));
    assert.deepEqual([pos.errors, neg.errors], [[], []]);
    assert.equal(neg.lines[0].ret, -pos.lines[0].ret, `${amt} + ${stored} stored at ${rate}%`);
  }
});

test("a 'Retainage %' header is the per-line rate column, however the percent sign is written", () => {
  for (const h of ["Retainage %", "Retainage%", "retainage_%", "Retainage percent"]) {
    const r = compute(`Description,Scheduled value,Previous,This period,${h}\nA,1000,0,1000,5\nB,1000,0,1000,`, S({ previousCertificates: "0" }));
    assert.deepEqual(r.errors, [], h);
    assert.equal(r.lines[0].own, 500, h);
    assert.equal(r.summary.retainage, 5000 + 10000, h);
  }
});

test("a pasted range that includes its totals row is not counted twice", () => {
  const r = compute("Description,Scheduled value,Previous,This period\nA,1000,0,500\nB,1000,0,0\nTotal,2000,0,500", S({ previousCertificates: "0" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.lines.length, 2);
  assert.equal(r.summary.contractToDate, 200000);
  assert.equal(r.summary.due, 45000);
  assert.ok(r.findings.some((f) => /totals row/i.test(f.title)));
  for (const label of ["TOTAL", "Totals", "Grand total", "total:"]) {
    assert.equal(compute(`Description,Scheduled value,Previous,This period\nA,1000,0,500\n${label},1000,0,500`, S()).lines.length, 1, label);
  }
  // A real line whose description only starts with the word is still a line.
  assert.equal(compute("Description,Scheduled value,Previous,This period\nA,1000,0,500\nTotal station survey,1000,0,500", S()).lines.length, 2);
});

test("the schedule CSV this page downloads pastes back in to the same application", () => {
  const a = compute(sampleList(), SAMPLE_SETTINGS);
  const csv = scheduleCsv(a);
  const b = compute(csv, SAMPLE_SETTINGS);
  assert.deepEqual(b.errors, []);
  assert.equal(b.lines.length, a.lines.length);
  for (const k of ["original", "changes", "contractToDate", "completed", "retainage", "previous", "due"]) assert.equal(b.summary[k], a.summary[k], k);
  // Small lines too: a retainage amount under $100 must not be read back as a per-line rate.
  const small = compute("Description,Scheduled value,Previous,This period\nA,500,0,500", S());
  const back = compute(scheduleCsv(small), S());
  assert.equal(back.lines[0].own, null);
  assert.equal(back.summary.retainage, small.summary.retainage);
});

test("findings: a one-cent line billed in full and an empty zero line are not 'no scheduled value'", () => {
  const r = compute("Description,Scheduled value,Previous,This period\nPenny,0.01,0,0.01\nPlaceholder,0,0,0\nA,1000,0,100", S());
  assert.ok(!r.findings.some((f) => /no scheduled value/.test(f.title)), r.findings.map((f) => f.title).join("\n"));
  const z = compute("Description,Scheduled value,Previous,This period\nExtra,0,0,50\nA,1000,0,100", S());
  assert.ok(z.findings.some((f) => /Extra: work is billed on a line with no scheduled value/.test(f.title)));
});

test("front-loading: only lines 90%+ billed count, and exactly 30% complete is past the flag", () => {
  // Job 20% complete, no line near done: no flag, even though every line has work this period.
  const none = compute("Description,Scheduled value,Previous,This period\nA,1000,0,500\nB,1500,0,0\nC,2500,0,500", S());
  assert.equal(none.summary.completeBp, 2000);
  assert.ok(!none.findings.some((f) => /Front-loading/.test(f.title)));
  // Exactly 30.00% complete with a 100% line: not flagged (the flag is for under 30%).
  const at = compute("Description,Scheduled value,Previous,This period\nA,1000,0,1000\nB,9000,0,2000", S());
  assert.equal(at.summary.completeBp, 3000);
  assert.ok(!at.findings.some((f) => /Front-loading/.test(f.title)));
  const under = compute("Description,Scheduled value,Previous,This period\nA,1000,0,1000\nB,9000,0,1999", S());
  assert.ok(under.findings.some((f) => /Front-loading flag: A is 90%\+ billed/.test(f.title)));
});
