import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimestamp, parseIntervals, inferIntervalMin, analyze, exampleCsv, EXAMPLE_SETTINGS, toCsv } from "./calc.mjs";

test("timestamps in ISO and US formats read as wall-clock", () => {
  assert.equal(parseTimestamp("2026-03-04 14:15"), Date.UTC(2026, 2, 4, 14, 15));
  assert.equal(parseTimestamp("3/4/2026 2:15 PM"), Date.UTC(2026, 2, 4, 14, 15));
  assert.equal(parseTimestamp("3/4/26 12:00 AM"), Date.UTC(2026, 2, 4, 0, 0));
  assert.ok(Number.isNaN(parseTimestamp("hello")));
});

test("parser finds the readings column by header and skips preambles", () => {
  const csv = "Account,1234\nStart,End,Usage (kWh)\n2026-01-01 00:00,2026-01-01 00:15,2.5\n2026-01-01 00:15,2026-01-01 00:30,3\n";
  const { rows, notes } = parseIntervals(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].v, 2.5);
  assert.match(notes[0], /Usage/);
});

test("parser drops duplicates and bad lines, and reports them", () => {
  const { rows, notes } = parseIntervals("t,kw\n2026-01-01 00:00,5\n2026-01-01 00:00,5\n2026-01-01 00:15,-3\n2026-01-01 00:30,7\n");
  assert.equal(rows.length, 2);
  assert.equal(notes.length, 3);
});

function synth(months, peaksByMonth) {
  const rows = [];
  for (const [i, [y, mo]] of months.entries()) {
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) for (let q = 0; q < 96; q++) {
      const t = Date.UTC(y, mo - 1, d, Math.floor(q / 4), (q % 4) * 15);
      rows.push({ t, v: d === 10 && q === 56 ? peaksByMonth[i] : 10 });
    }
  }
  return rows;
}
const base = { unit: "kw", intervalMin: "", demandRate: "10", ratchetPct: "", batteryCostPerKwh: "", batteryCostPerKw: "", usablePct: "" };

test("demand charge is monthly peak times rate, summed", () => {
  const a = analyze(synth([[2026, 1], [2026, 2]], [50, 70]), base);
  assert.equal(a.ok, true);
  assert.equal(a.intervalMin, 15);
  assert.equal(a.months[0].peak, 50);
  assert.equal(a.months[1].charge, 700);
  assert.equal(a.monthsUsed, 2);
  assert.equal(a.yearly, (500 + 700) * 6);
});

test("kWh readings convert to kW using the interval", () => {
  const a = analyze(synth([[2026, 1]], [10]), { ...base, unit: "kwh" });
  assert.equal(a.months[0].peak, 40); // 10 kWh in 15 min
});

test("ratchet keeps billing high after a spike", () => {
  const a = analyze(synth([[2026, 1], [2026, 2]], [100, 20]), { ...base, ratchetPct: "80" });
  assert.equal(a.months[1].billed, 80);
  assert.equal(a.months[1].ratcheted, true);
});

test("cap sweep: a one-interval spike is cheap to shave", () => {
  const a = analyze(synth([[2026, 1], [2026, 2], [2026, 3]], [100, 100, 100]), { ...base, batteryCostPerKwh: "500", batteryCostPerKw: "200", usablePct: "100" });
  const c = a.caps.find((x) => x.pct === 90);
  assert.equal(c.kwShave, 10);
  assert.equal(c.saving, 10 * 10 * 12); // 3 months scaled to 12
  assert.equal(c.events, 3);
  assert.equal(c.longestMin, 15);
  assert.ok(Math.abs(c.batteryKwh - 2.5) < 1e-9); // (100-90) kW for 15 min
});

test("rejects coarse data and missing rate", () => {
  const coarse = [0, 1, 2, 3, 4].map((i) => ({ t: Date.UTC(2026, 0, 1 + i), v: 5 }));
  assert.equal(analyze(coarse, base).ok, false);
  assert.equal(analyze(synth([[2026, 1]], [10]), { ...base, demandRate: "" }).ok, false);
});

test("bundled example parses and produces a plausible result", () => {
  const { rows } = parseIntervals(exampleCsv());
  assert.ok(rows.length > 11000);
  assert.equal(inferIntervalMin(rows), 15);
  const a = analyze(rows, { ...EXAMPLE_SETTINGS });
  assert.equal(a.ok, true);
  assert.equal(a.monthsUsed, 4);
  assert.ok(a.yearly > 0);
  assert.ok(a.caps.some((c) => c.saving > 0));
  assert.match(toCsv(a), /^month,peak_kw/);
});
