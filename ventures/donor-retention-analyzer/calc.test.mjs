import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, analyze, reportCsv, sampleText, rng, parseDate, isoDate, pct, money, MIN_DONORS } from "./calc.mjs";

// 40 donors. 0-19 give in 2022; all 40 give in 2023 (20-39 are new that year);
// in 2024 donors 0-14 and 20-28 give again, donor 0 giving 400 instead of 100.
function hand(extra = "") {
  const lines = ["donor,date,amount"];
  for (let i = 0; i < 20; i++) lines.push(`d${i},2022-01-15,100`);
  for (let i = 0; i < 40; i++) lines.push(`d${i},2023-01-15,100`);
  for (const i of [...Array(15).keys(), ...Array.from({ length: 9 }, (_, k) => 20 + k)]) lines.push(`d${i},2024-09-15,${i === 0 ? 400 : 100}`);
  return lines.join("\n") + extra;
}
const run = (text, opts = { asOf: "2024-12-31" }) => {
  const p = parseRows(text);
  assert.ok(p.rows, p.error);
  return analyze(p.rows, opts);
};

test("parses ISO and US dates, quoted names, currency amounts, and ignores refunds", () => {
  assert.equal(parseDate("2026-03-14"), parseDate("3/14/2026"));
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(isoDate(parseDate("2026-03-14T10:00:00Z")), "2026-03-14");
  const p = parseRows('donor,date,amount\n"Smith, J",3/14/2026,"$1,250.50"\nA,2026-03-15,-20\nB,not a date,5\nC,2026-03-16,(10)');
  assert.equal(p.rows.length, 1);
  assert.deepEqual(p.rows[0], { donor: "smith, j", day: parseDate("2026-03-14"), amount: 1250.5 });
  assert.match(p.warnings.join(" "), /1 row\(s\) skipped/);
  assert.match(p.warnings.join(" "), /2 row\(s\) with a zero or negative/);
  assert.ok(parseRows("").error);
  assert.ok(parseRows("a,b,c").error);
});

test("retention matches a hand count, split into first-year and repeat donors", () => {
  const r = run(hand());
  assert.equal(r.latest.fy, 2024);
  assert.equal(r.latest.prevDonors, 40);
  assert.equal(r.latest.retained, 24);
  assert.equal(r.latest.retention, 0.6);
  assert.equal(r.latest.firstYearRetention, 9 / 20);
  assert.equal(r.latest.repeatRetention, 15 / 20);
  // 23 donors at 100 and donor 0 at 400 against 4000 the year before.
  assert.equal(r.latest.dollarRetention, 2700 / 4000);
  const y2023 = r.table.find((t) => t.fy === 2023);
  assert.equal(y2023.newDonors, 20);
  assert.equal(y2023.retention, 1);
  assert.equal(r.table.find((t) => t.fy === 2022).retention, null);
});

test("status counts at the as-of date: current, LYBUNT and SYBUNT", () => {
  const r = run(hand());
  assert.deepEqual(r.status, { current: 24, LYBUNT: 16, SYBUNT: 0 });
  assert.equal(r.listTotals.LYBUNT, 16);
  // LYBUNT dollars at stake are what those donors gave the year before.
  assert.equal(r.lybuntDollars, 1600);
  // Add 2025 so the 2023-only donors are two years lapsed.
  const later = run(hand() + "\n" + [...Array(5).keys()].map((i) => `d${i},2025-02-01,50`).join("\n") + "\n" + [...Array(40).keys()].slice(5).map((i) => `x${i},2025-03-01,10`).join("\n"), { asOf: "2025-12-31" });
  assert.equal(later.status.SYBUNT > 0, true);
  assert.equal(later.status.current, 40);
});

test("a year still in progress is left out of retention, and later gifts are dropped", () => {
  const r = run(hand(), { asOf: "2024-06-30" });
  assert.equal(r.latest.fy, 2023);
  assert.equal(r.latest.retention, 1);
  assert.match(r.warnings.join(" "), /24 gift\(s\) dated after the as-of date were ignored/);
});

test("a fiscal year starting in July groups gifts by that year", () => {
  const lines = ["donor,date,amount"];
  for (let i = 0; i < 40; i++) lines.push(`d${i},2022-08-01,10`, `d${i},2023-02-01,10`);
  for (let i = 0; i < 20; i++) lines.push(`d${i},2023-09-01,10`);
  const p = parseRows(lines.join("\n"));
  const r = analyze(p.rows, { fyStartMonth: 7, asOf: "2024-06-30" });
  const fy2022 = r.table.find((t) => t.fy === 2022), fy2023 = r.table.find((t) => t.fy === 2023);
  assert.equal(fy2022.donors, 40);
  assert.equal(fy2023.donors, 20);
  assert.equal(fy2023.retention, 0.5);
  assert.equal(fy2022.gifts, 80);
});

test("a latest gift a few days before year end moves the as-of date and says so", () => {
  const r = run(hand().replace("2024-09-15", "2024-12-20"), {});
  assert.equal(r.asOf, "2024-12-31");
  assert.match(r.warnings.join(" "), /moved to the fiscal year end/);
  assert.equal(r.latest.fy, 2024);
});

test("refuses too few donors and a history with only one full year", () => {
  const small = analyze(parseRows("a,2024-01-01,5\nb,2025-01-01,5\nc,2025-02-01,5").rows, {});
  assert.match(small.error, /at least 30 donors/);
  const one = [];
  for (let i = 0; i < 80; i++) one.push(`d${i},2024-0${1 + (i % 9)}-10,20`);
  assert.match(run(one.join("\n"), { asOf: "2024-12-31" }).error, /two full fiscal years/);
  assert.ok(MIN_DONORS >= 30);
  assert.ok(analyze(parseRows(hand()).rows, { fyStartMonth: 13 }).error);
  assert.ok(analyze(parseRows(hand()).rows, { asOf: "tomorrow" }).error);
});

test("the bootstrap range is seeded, contains the point, and narrows with more donors", () => {
  const a = run(hand()), b = run(hand());
  assert.deepEqual(a.latest.range80, b.latest.range80);
  assert.ok(a.latest.range80[0] <= 0.6 && a.latest.range80[1] >= 0.6);
  const lines = [];
  for (let i = 0; i < 4000; i++) { lines.push(`d${i},2023-02-01,10`); if (i % 5 < 3) lines.push(`d${i},2024-02-01,10`); }
  const big = run(lines.join("\n"));
  assert.equal(big.latest.retention, 0.6);
  assert.ok(big.latest.range80[1] - big.latest.range80[0] < (a.latest.range80[1] - a.latest.range80[0]) / 3);
});

// Each donor gives in each year with a fixed probability, independent of what
// happened before, so the true chance of giving in the next 12 months is that
// probability whatever the status or band, and the model must find it.
function memoryless(probByYear, donors = 700, seed = 3) {
  const rand = rng(seed);
  const lines = [];
  for (let i = 0; i < donors; i++) {
    for (const [y, p] of Object.entries(probByYear)) {
      if (rand() < p) lines.push(`m${i},${y}-${String(1 + ((rand() * 12) | 0)).padStart(2, "0")}-15,${25 + ((rand() * 4) | 0) * 25}`);
    }
  }
  return lines.join("\n");
}

test("the giving-probability model recovers a known 50% and passes its own hold-out", () => {
  const r = run(memoryless({ 2020: 0.5, 2021: 0.5, 2022: 0.5, 2023: 0.5, 2024: 0.5, 2025: 0.5 }), {});
  assert.ok(r.model, "model fitted");
  assert.ok(r.model.snapshots >= 2);
  for (const s of r.model.rates) assert.ok(Math.abs(s.rate - 0.5) < 0.08, `${s.status} ${s.rate}`);
  assert.ok(r.holdout.gap < 0.15, `gap ${r.holdout.gap}`);
  assert.equal(r.verdict, "usable");
  for (const row of r.lists.LYBUNT) assert.ok(Math.abs(row.probability - 0.5) < 0.1);
});

test("when behaviour changes in the last year the hold-out calls the model unstable", () => {
  const r = run(memoryless({ 2020: 0.9, 2021: 0.9, 2022: 0.9, 2023: 0.9, 2024: 0.2 }), {});
  assert.equal(r.verdict, "unstable");
  assert.ok(r.holdout.gap > 0.25);
  assert.match(r.verdictNote, /ranking, not a forecast/);
});

test("donors who stopped giving are ranked by expected dollars, and the CSV lists every one", () => {
  const r = run(sampleText().replace(/\n/, "\n\"Smith, Jo\",2022-05-05,2500\n"), {});
  const exp = r.lists.LYBUNT.map((x) => x.expected);
  assert.deepEqual(exp, [...exp].sort((a, b) => b - a));
  const csv = reportCsv(r).trim().split("\n");
  assert.equal(csv.length, 1 + r.listTotals.LYBUNT + r.listTotals.SYBUNT);
  assert.match(csv[0], /^status,donor,last_gift/);
  assert.ok(csv.some((l) => l.startsWith('SYBUNT,"smith, jo"')));
});

test("an unfittable history still returns retention and ranks donors by what they gave", () => {
  const r = run(hand());
  assert.equal(r.model, null);
  assert.equal(r.verdict, "weak");
  assert.equal(r.recoverable, null);
  const top = r.lists.LYBUNT[0];
  assert.equal(top.probability, null);
  assert.equal(top.expected, null);
});

test("the sample loads, is deterministic and gives a usable result", () => {
  assert.equal(sampleText(), sampleText());
  const r = run(sampleText(), {});
  assert.equal(r.verdict, "usable");
  assert.ok(r.donors > 300);
  assert.ok(r.dollarsPerPoint > 0 && r.lifetimeYears > 1);
  assert.equal(pct(0.456, 1), "45.6%");
  assert.equal(money(1234.5), "$1,235");
});

test("a large donor concentration is flagged", () => {
  const lines = [hand(), "d0,2024-10-01,50000"];
  assert.match(run(lines.join("\n")).warnings.join(" "), /ten largest donors gave/);
});
