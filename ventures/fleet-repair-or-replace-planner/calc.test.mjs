import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSUMPTIONS,
  DEFAULT_EXPECTED_LIFE_YEARS,
  STRONG_PAYBACK_YEARS,
  planFleet,
  planRow,
  sampleRows,
  selectWithinBudget,
  toCsv,
} from "./calc.mjs";

const ids = (result) => result.findings.map((f) => f.id);

test("keep cost is the repair bill plus the downtime it caused", () => {
  const row = planRow({
    name: "Van 3",
    annualRepairSpend: "6400",
    downtimeDays: "14",
    dailyLostRevenue: "900",
  });
  assert.equal(row.downtimeCost, 12600);
  assert.equal(row.keepAnnualCost, 19000);
});

test("replace cost is annualised net capital plus the new asset's own running costs", () => {
  const row = planRow({
    name: "Van 3",
    replacementCost: "42000",
    resaleValue: "4500",
    expectedLifeYears: "8",
    annualRepairOnNew: "700",
    downtimeDaysOnNew: "1",
    dailyLostRevenue: "900",
  });
  assert.equal(row.capitalNeeded, 37500);
  assert.equal(row.annualisedCapital, 4687.5); // 37500 / 8
  assert.equal(row.replaceAnnualCost, 6287.5); // 4687.5 + 700 + 900
});

test("the worked example reproduces the numbers by hand, to the cent", () => {
  const [van3, excavator, van1] = sampleRows().map(planRow);

  assert.equal(van3.annualSaving, 12712.5); // 19000 - 6287.5
  assert.equal(van3.operatingSaving, 17400); // 19000 - (700 + 900)
  assert.equal(van3.paybackYears, 2.16); // 37500 / 17400, NOT / 12712.5
  assert.equal(van3.recommendation, "replace");

  assert.equal(excavator.annualSaving, 7600); // 16000 - 8400
  assert.equal(excavator.operatingSaving, 12500); // 16000 - (1100 + 2400)
  assert.equal(excavator.paybackYears, 3.92); // 49000 / 12500
  assert.equal(excavator.recommendation, "replace");

  // Pays less per year to keep than to replace: a newer van with real
  // trade-in value and a small repair bill is the case the planner has to be
  // willing to say "keep" about, or it is just a sales tool.
  assert.equal(van1.annualSaving, -1425); // 2700 - 4125
  assert.equal(van1.recommendation, "keep");
  // Payback is still reported on a keep row, and reporting it is the point:
  // 21000 / 1200 = 17.5 years against an 8-year service life says plainly why
  // this one is a keep. It is `strong-payback` that is gated on the verdict,
  // not the number itself.
  assert.equal(van1.operatingSaving, 1200); // 2700 - (600 + 900)
  assert.equal(van1.paybackYears, 17.5);
  assert.ok(van1.paybackYears > van1.expectedLifeYears);
});

test("a blank expected life falls back to the documented default rather than dividing by zero", () => {
  const row = planRow({ name: "Loader", replacementCost: "70000", resaleValue: "0" });
  assert.equal(row.expectedLifeYears, DEFAULT_EXPECTED_LIFE_YEARS);
  assert.equal(row.annualisedCapital, round(70000 / DEFAULT_EXPECTED_LIFE_YEARS));
  assert.ok(Number.isFinite(row.replaceAnnualCost));
});

function round(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

test("downtime days entered but never valued raises a finding rather than scoring as free", () => {
  const row = planRow({ name: "Van 9", downtimeDays: "11", dailyLostRevenue: "" });
  assert.equal(row.downtimeCost, 0);
  assert.ok(row.findings.some((f) => f.id === "downtime-not-valued"));
});

test("downtime costing more than the repairs is called out, because that is the whole point", () => {
  const row = planRow({
    name: "Van 3",
    annualRepairSpend: "3000",
    downtimeDays: "10",
    dailyLostRevenue: "900",
  });
  const finding = row.findings.find((f) => f.id === "downtime-dominates");
  assert.ok(finding);
  assert.match(finding.detail, /9000\.00/);
  assert.match(finding.detail, /3000\.00/);
});

test("a missing replacement cost is flagged, since zero capital always looks like a win", () => {
  const row = planRow({
    name: "Van 3",
    annualRepairSpend: "6000",
    replacementCost: "",
  });
  assert.ok(row.findings.some((f) => f.id === "missing-replacement-cost"));
});

test("a trade-in worth more than the replacement is a data error, not free money", () => {
  const row = planRow({ name: "Van 3", replacementCost: "4000", resaleValue: "40000" });
  assert.equal(row.capitalNeeded, 0, "capital is floored at zero rather than negative");
  assert.ok(row.findings.some((f) => f.id === "resale-exceeds-replacement"));
});

test("a payback inside the threshold is reported as a strong case", () => {
  const row = planRow({
    name: "Van 3",
    annualRepairSpend: "20000",
    replacementCost: "30000",
    resaleValue: "10000",
    expectedLifeYears: "10",
  });
  assert.ok(row.paybackYears <= STRONG_PAYBACK_YEARS);
  assert.ok(row.findings.some((f) => f.id === "strong-payback"));
});

test("negative and non-numeric inputs are treated as zero, never as NaN", () => {
  const row = planRow({
    name: "Van 3",
    annualRepairSpend: "-500",
    downtimeDays: "abc",
    dailyLostRevenue: null,
    replacementCost: "1e-x",
  });
  for (const value of Object.values(row)) {
    if (typeof value === "number") assert.ok(Number.isFinite(value), `${value} is not finite`);
  }
  assert.equal(row.keepAnnualCost, 0);
});

test("an unnamed asset still gets a stable label", () => {
  assert.equal(planRow({}).name, "Untitled asset");
  assert.equal(planRow({ name: "   " }).name, "Untitled asset");
});

test("budget selection ranks by saving per dollar, not by absolute saving", () => {
  const rows = sampleRows().map(planRow);
  // The excavator saves less per year than Van 3 AND needs more capital, so
  // it must rank below it. A selector that sorted on absolute saving would
  // still get this pair right; one that sorted on capital ascending would not.
  const result = selectWithinBudget(rows, 40000);
  assert.deepEqual(result.selected.map((r) => r.name), ["Van 3 (2014 Transit)"]);
  assert.deepEqual(result.deferred.map((r) => r.name), ["Mini excavator"]);
  assert.equal(result.capitalCommitted, 37500);
  assert.equal(result.capitalRemaining, 2500);
  assert.equal(result.annualSavingCaptured, 12712.5);
  assert.equal(result.annualSavingDeferred, 7600);
});

test("an asset the arithmetic says to keep is never selected, however large the budget", () => {
  const rows = sampleRows().map(planRow);
  const result = selectWithinBudget(rows, 10_000_000);
  assert.equal(result.selected.length, 2);
  assert.ok(!result.selected.some((r) => r.name === "Van 1 (2021 Transit)"));
});

test("a blank budget means no stated limit, not a zero budget", () => {
  const rows = sampleRows().map(planRow);
  const result = selectWithinBudget(rows, "");
  assert.equal(result.selected.length, 2, "both paying assets are selected");
  assert.equal(result.capitalRemaining, null);
});

test("a budget too small for anything selects nothing and defers everything", () => {
  const rows = sampleRows().map(planRow);
  const result = selectWithinBudget(rows, 100);
  assert.equal(result.selected.length, 0);
  assert.equal(result.deferred.length, 2);
  assert.equal(result.capitalCommitted, 0);
});

test("an empty plan asks for a row and raises no arithmetic findings", () => {
  const result = planFleet([], 0);
  assert.deepEqual(ids(result), ["no-rows"]);
  assert.equal(result.totals.keepAnnualCost, 0);
});

test("non-array input is handled rather than thrown on", () => {
  for (const bad of [null, undefined, "rows", 7, {}]) {
    const result = planFleet(bad, 0);
    assert.deepEqual(ids(result), ["no-rows"]);
  }
});

test("the not-a-determination and undiscounted findings fire on EVERY non-empty plan", () => {
  // Unconditionally, including on a plan where nothing is wrong and the
  // recommendation is simply "keep" -- a worksheet that only disclosed when
  // something looked off could be read as having endorsed the rest.
  for (const rows of [
    sampleRows(),
    [{ name: "Van 1", annualRepairSpend: "100", replacementCost: "50000" }],
    [{ name: "Only" }],
  ]) {
    const got = ids(planFleet(rows, 0));
    assert.ok(got.includes("not-a-determination"), "not-a-determination missing");
    assert.ok(got.includes("undiscounted-eac"), "undiscounted-eac missing");
  }
});

test("a binding budget says what deferring costs per year", () => {
  const result = planFleet(sampleRows(), 40000);
  const finding = result.findings.find((f) => f.id === "budget-binding");
  assert.ok(finding);
  assert.match(finding.detail, /7600\.00/);
});

test("a budget that fits everything raises no budget-binding finding", () => {
  const result = planFleet(sampleRows(), 200000);
  assert.ok(!ids(result).includes("budget-binding"));
});

test("the greedy limitation is disclosed whenever more than one asset is selected", () => {
  assert.ok(ids(planFleet(sampleRows(), 200000)).includes("greedy-selection"));
  // With a single selection there is no subset to have chosen differently,
  // so the caveat would be noise.
  assert.ok(!ids(planFleet(sampleRows(), 40000)).includes("greedy-selection"));
});

test("fleet totals add up across rows", () => {
  const result = planFleet(sampleRows(), 0);
  assert.equal(result.totals.annualRepairSpend, 6400 + 5200 + 900);
  assert.equal(result.totals.downtimeDays, 14 + 9 + 2);
  assert.equal(result.totals.downtimeCost, 12600 + 10800 + 1800);
  assert.equal(result.totals.keepAnnualCost, 19000 + 16000 + 2700);
  assert.equal(result.totals.capitalNeeded, 37500 + 49000 + 21000);
});

test("the fleet-wide downtime finding fires when downtime outweighs repairs in total", () => {
  assert.ok(ids(planFleet(sampleRows(), 0)).includes("fleet-downtime-dominates"));
  const repairsHeavy = [
    { name: "A", annualRepairSpend: "9000", downtimeDays: "1", dailyLostRevenue: "100" },
  ];
  assert.ok(!ids(planFleet(repairsHeavy, 0)).includes("fleet-downtime-dominates"));
});

test("CSV carries a header, every row, and whether each is in this year's plan", () => {
  const result = planFleet(sampleRows(), 40000);
  const lines = toCsv(result).trim().split("\n");
  assert.equal(lines.length, 4, "header plus three assets");
  assert.match(lines[0], /^Asset,/);
  assert.match(lines[0], /In this year's plan$/);
  assert.ok(lines[1].endsWith(",replace,yes"), lines[1]);
  assert.ok(lines[2].endsWith(",replace,no"), lines[2]);
  assert.ok(lines[3].endsWith(",keep,no"), lines[3]);
});

test("CSV quotes a field containing a comma or a quote rather than corrupting the row", () => {
  const csv = toCsv(planFleet([{ name: 'Van "3", spare', replacementCost: "1000" }], 0));
  assert.match(csv, /"Van ""3"", spare"/);
  assert.equal(csv.trim().split("\n").length, 2);
});

test("every assumption is a non-empty sentence, so the interface can render them", () => {
  assert.ok(ASSUMPTIONS.length >= 4);
  for (const a of ASSUMPTIONS) {
    assert.equal(typeof a, "string");
    assert.ok(a.trim().length > 20, a);
  }
});

test("every finding carries an id, a severity the interface knows, a title and a detail", () => {
  const result = planFleet(
    [...sampleRows(), { name: "Broken", replacementCost: "", downtimeDays: "5" }],
    1000,
  );
  assert.ok(result.findings.length > 0);
  for (const f of result.findings) {
    assert.ok(f.id, "finding has no id");
    assert.ok(["high", "medium", "info"].includes(f.severity), `bad severity ${f.severity}`);
    assert.ok(f.title && f.title.length > 5, `bad title on ${f.id}`);
    assert.ok(f.detail && f.detail.length > 20, `bad detail on ${f.id}`);
  }
});

test("money never renders as a float artefact", () => {
  const result = planFleet(
    [
      {
        name: "Odd",
        annualRepairSpend: "0.1",
        downtimeDays: "3",
        dailyLostRevenue: "0.2",
        replacementCost: "1000.33",
        resaleValue: "333.11",
        expectedLifeYears: "3",
      },
    ],
    0,
  );
  const row = result.rows[0];
  for (const key of ["downtimeCost", "keepAnnualCost", "capitalNeeded", "annualisedCapital", "replaceAnnualCost", "annualSaving"]) {
    const decimals = String(row[key]).split(".")[1] ?? "";
    assert.ok(decimals.length <= 2, `${key} = ${row[key]} has more than 2 decimals`);
  }
});


// --- Regressions for the three findings on #4649 -------------------------

test("payback divides capital by the spend it stops, not by the EAC saving", () => {
  // The bug: `annualSaving` already has `annualisedCapital` subtracted, so
  // `capitalNeeded / annualSaving` charges the purchase for itself twice. It
  // reported 2.95 years on the shipped van where simple payback is 2.16, and
  // it pushed assets across STRONG_PAYBACK_YEARS in the pessimistic direction.
  const van = planRow(sampleRows()[0]);
  assert.equal(van.capitalNeeded, 37500);
  assert.equal(van.operatingSaving, 17400);
  assert.equal(van.paybackYears, round(37500 / 17400));
  assert.notEqual(van.paybackYears, round(37500 / van.annualSaving));
  // And the denominator carries no capital term at all.
  assert.equal(van.operatingSaving, van.keepAnnualCost - (van.annualRepairOnNew + van.downtimeCostOnNew));
});

test("an asset the EAC says to keep never gets a strong-payback note", () => {
  // `operatingSaving` can be positive on a keep row (cheap trade-in, large
  // purchase), so the threshold alone would contradict the verdict beside it.
  const row = planRow({
    name: "Nearly new",
    annualRepairSpend: "9000",
    replacementCost: "20000",
    resaleValue: "0",
    expectedLifeYears: "1",
  });
  assert.equal(row.recommendation, "keep");
  assert.ok(row.paybackYears !== null && row.paybackYears <= STRONG_PAYBACK_YEARS);
  assert.ok(!row.findings.some((f) => f.id === "strong-payback"));
});

test("two assets sharing a name are tracked separately in the plan", () => {
  // Duplicate labels are ordinary in a fleet. Keying selection on the name
  // ticked both rows when only one fitted the budget, collapsed the pair in
  // the count, and exported a `keep` row as "in this year's plan".
  const rows = [
    { name: "Truck", annualRepairSpend: "9000", downtimeDays: "10", dailyLostRevenue: "500",
      replacementCost: "30000", resaleValue: "5000", expectedLifeYears: "10" },
    { name: "Truck", annualRepairSpend: "100", replacementCost: "60000", resaleValue: "0",
      expectedLifeYears: "10" },
  ];
  const result = planFleet(rows, 25000);
  assert.notEqual(result.rows[0].id, result.rows[1].id);
  assert.equal(result.budget.selected.length, 1, "only the first Truck pays and fits");
  assert.equal(result.budget.selected[0].id, result.rows[0].id);

  const lines = toCsv(result).trim().split("\n");
  assert.ok(lines[1].endsWith(",replace,yes"), lines[1]);
  assert.ok(lines[2].endsWith(",keep,no"), lines[2]);
});

test("ranking uses the exact ratio, not one rounded to cents", () => {
  // Codex's counter-example on #4649: rounding to cents collapses 0.011 and
  // 0.014 to 0.01, the tie falls back to absolute saving, and the planner
  // captures $990 instead of $1,260 on the same budget.
  const rows = [
    { name: "Big", annualRepairSpend: "990", replacementCost: "90000", resaleValue: "0", expectedLifeYears: "1000000" },
    { name: "Small A", annualRepairSpend: "630", replacementCost: "45000", resaleValue: "0", expectedLifeYears: "1000000" },
    { name: "Small B", annualRepairSpend: "630", replacementCost: "45000", resaleValue: "0", expectedLifeYears: "1000000" },
  ];
  const result = planFleet(rows, 90000);
  assert.deepEqual(
    result.budget.selected.map((r) => r.name).sort(),
    ["Small A", "Small B"],
    "the two better-returning assets must win the budget",
  );
  assert.equal(result.budget.annualSavingCaptured > 1200, true);
});

test("a row with no replacement cost gets no verdict and is never selected", () => {
  // The finding alone was not enough: the table, the summary and the CSV all
  // presented an impossible $0 quote as this year's plan, and the budget
  // selector took it for free while reporting its whole keep cost as captured.
  const result = planFleet(
    [{ name: "No quote", annualRepairSpend: "8000", downtimeDays: "5", dailyLostRevenue: "900", replacementCost: "" }],
    0,
  );
  const row = result.rows[0];
  assert.equal(row.dataComplete, false);
  assert.equal(row.recommendation, "incomplete");
  assert.equal(result.budget.selected.length, 0);
  assert.equal(result.budget.annualSavingCaptured, 0);
  assert.ok(ids(result).includes("missing-replacement-cost"));
  assert.ok(toCsv(result).trim().split("\n")[1].endsWith(",incomplete,no"));
});

test("a trade-in worth more than the replacement is incomplete too, not a free win", () => {
  // capitalNeeded is floored at 0 there, which lands in the same place as a
  // missing quote: zero capital makes replacing look free.
  const result = planFleet(
    [{ name: "Bad trade", annualRepairSpend: "5000", replacementCost: "4000", resaleValue: "40000" }],
    0,
  );
  assert.equal(result.rows[0].recommendation, "incomplete");
  assert.equal(result.budget.selected.length, 0);
  assert.ok(ids(result).includes("resale-exceeds-replacement"));
});

test("a complete row still gets a real verdict", () => {
  const [van3, , van1] = sampleRows().map(planRow);
  assert.equal(van3.dataComplete, true);
  assert.equal(van3.recommendation, "replace");
  assert.equal(van1.dataComplete, true);
  assert.equal(van1.recommendation, "keep");
});

test("an incomplete row can never reach the strong-payback note", () => {
  const row = planRow({ name: "No quote", annualRepairSpend: "50000", replacementCost: "" });
  assert.equal(row.recommendation, "incomplete");
  assert.ok(!row.findings.some((f) => f.id === "strong-payback"));
});

test("the CSV carries enough columns to re-derive the replacement cost", () => {
  // The export is what reaches a lender or an accountant; they get none of the
  // findings, the page or the reasoning. Replacement downtime is a
  // user-entered assumption feeding replaceAnnualCost, annualSaving and
  // paybackYears, so leaving it out made all three unverifiable from the file.
  const result = planFleet(sampleRows(), 40000);
  const lines = toCsv(result).trim().split("\n");
  const header = lines[0].split(",");
  const row = lines[1].split(",");
  assert.equal(header.length, row.length, "header and row must have equal width");
  for (const column of ["Downtime days on replacement", "Downtime cost on replacement"]) {
    assert.ok(header.includes(column), `missing column: ${column}`);
  }
  const value = (name) => Number(row[header.indexOf(name)]);
  assert.equal(
    round(
      value("Annualised capital") +
        value("Repairs on replacement") +
        value("Downtime cost on replacement"),
    ),
    value("Annual cost of replacing"),
    "the exported replacement cost must be reproducible from the exported columns",
  );
  // And the saving follows from the two costs the file already carries.
  assert.equal(
    round(value("Annual cost of keeping") - value("Annual cost of replacing")),
    value("Annual saving"),
  );
});
