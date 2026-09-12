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
  assert.equal(van3.paybackYears, 2.95); // 37500 / 12712.5
  assert.equal(van3.recommendation, "replace");

  assert.equal(excavator.annualSaving, 7600); // 16000 - 8400
  assert.equal(excavator.paybackYears, 6.45); // 49000 / 7600
  assert.equal(excavator.recommendation, "replace");

  // Pays less per year to keep than to replace: a newer van with real
  // trade-in value and a small repair bill is the case the planner has to be
  // willing to say "keep" about, or it is just a sales tool.
  assert.equal(van1.annualSaving, -1425); // 2700 - 4125
  assert.equal(van1.paybackYears, null);
  assert.equal(van1.recommendation, "keep");
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
