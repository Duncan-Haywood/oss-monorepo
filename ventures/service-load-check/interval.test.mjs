import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUsage, measuredDemand, demandSeries, exampleCsv, parseTimestamp } from "./interval.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("PG&E-style Green Button CSV: preamble, separate date and start/end time columns", () => {
  const csv = [
    "Name,REDACTED",
    "Address,REDACTED",
    "",
    "TYPE,DATE,START TIME,END TIME,USAGE (kWh),COST,NOTES",
    "Electric usage,2025-01-01,00:00,00:14,0.50,$0.15,",
    "Electric usage,2025-01-01,00:15,00:29,1.25,$0.38,",
    "Electric usage,2025-01-01,00:30,00:44,0.25,$0.08,",
    "Electric usage,2025-01-01,00:45,00:59,0.25,$0.08,",
  ].join("\n");
  const p = parseUsage(csv);
  assert.equal(p.rows.length, 4);
  assert.equal(p.rows[0].min, 15);
  assert.equal(p.rows[1].t, Date.UTC(2025, 0, 1, 0, 15));
  const m = measuredDemand(p);
  close(m.peakKw, 5);
  assert.equal(m.peakAt, Date.UTC(2025, 0, 1, 0, 15));
  assert.equal(m.basis, "short");
});

test("5-minute readings are summed into clock-aligned 15-minute blocks", () => {
  const rows = [];
  const t0 = Date.UTC(2025, 5, 1, 12, 0);
  // 12:05-12:20 holds the busiest 15 minutes of raw readings, but the
  // clock-aligned blocks are 12:00-12:15 (1+3+3) and 12:15-12:30 (3+1+1).
  const kwh = [1, 3, 3, 3, 1, 1];
  kwh.forEach((v, i) => rows.push({ t: t0 + i * 300000, kwh: v, min: 5 }));
  const ds = demandSeries(rows);
  assert.equal(ds.fifteen, true);
  assert.deepEqual(ds.series.map((x) => x.kw), [28, 20]);
});

test("hourly data is a screen, flagged, never called a 220.87 load", () => {
  const lines = ["Start,kWh"];
  for (let h = 0; h < 24 * 400; h++) lines.push(`${new Date(Date.UTC(2025, 0, 1) + h * 3600000).toISOString().slice(0, 16).replace("T", " ")},${h === 500 ? 6 : 1}`);
  const m = measuredDemand(parseUsage(lines.join("\n")));
  assert.equal(m.basis, "estimate");
  assert.equal(m.intervalMin, 60);
  close(m.peakKw, 6);
  assert.match(m.warnings.join(" "), /understates/);
});

test("Green Button XML (ESPI): multiplier, unit and time zone", () => {
  const reading = (start, v) => `<espi:IntervalReading><espi:timePeriod><espi:duration>900</espi:duration><espi:start>${start}</espi:start></espi:timePeriod><espi:value>${v}</espi:value></espi:IntervalReading>`;
  const t = Date.UTC(2025, 6, 4, 22, 0) / 1000; // 22:00 UTC = 17:00 at -5 h
  const xml = `<feed><entry><content><espi:LocalTimeParameters><espi:tzOffset>-18000</espi:tzOffset></espi:LocalTimeParameters></content></entry>
  <entry><content><espi:ReadingType><espi:powerOfTenMultiplier>0</espi:powerOfTenMultiplier><espi:uom>72</espi:uom></espi:ReadingType></content></entry>
  <entry><content><espi:IntervalBlock>${reading(t, 1500)}${reading(t + 900, 2250)}${reading(t + 1800, 500)}</espi:IntervalBlock></content></entry></feed>`;
  const p = parseUsage(xml);
  assert.equal(p.rows.length, 3);
  assert.equal(p.rows[0].t, Date.UTC(2025, 6, 4, 17, 0));
  const m = measuredDemand(p);
  close(m.peakKw, 9); // 2250 Wh in 15 minutes
  assert.equal(m.peakAt, Date.UTC(2025, 6, 4, 17, 15));
});

test("a single range column ('start to end') and kW readings", () => {
  const csv = "Period,Demand (kW)\n2025-03-01 00:00 to 2025-03-01 00:15,2.5\n2025-03-01 00:15 to 2025-03-01 00:30,4";
  const p = parseUsage(csv);
  assert.equal(p.unit, "kw");
  assert.equal(p.rows[1].min, 15);
  close(p.rows[1].kwh, 1);
  close(measuredDemand(p).peakKw, 4);
});

test("negative readings or solar raise the net-metering warning", () => {
  const csv = "Start,End,kWh\n2025-03-01 12:00,2025-03-01 12:15,-0.5\n2025-03-01 12:15,2025-03-01 12:30,0.5\n2025-03-01 12:30,2025-03-01 12:45,0.5\n2025-03-01 12:45,2025-03-01 13:00,0.5";
  assert.match(measuredDemand(parseUsage(csv)).warnings.join(" "), /solar/);
  const plain = csv.replace("-0.5", "0.5");
  assert.doesNotMatch(measuredDemand(parseUsage(plain)).warnings.join(" "), /solar/);
  assert.match(measuredDemand(parseUsage(plain), { solar: true }).warnings.join(" "), /solar/);
});

test("repeated timestamps (fall-back hour) keep the larger reading", () => {
  const csv = "Start,End,kWh\n2025-11-02 01:00,2025-11-02 01:15,0.4\n2025-11-02 01:00,2025-11-02 01:15,0.9\n2025-11-02 01:15,2025-11-02 01:30,0.2\n2025-11-02 01:30,2025-11-02 01:45,0.2";
  const p = parseUsage(csv);
  assert.equal(p.rows.length, 3);
  close(p.rows[0].kwh, 0.9);
  assert.match(p.notes.join(" "), /repeated/);
});

test("30 to 364 days of 15-minute data is the 30-day case, with its conditions", () => {
  const lines = ["Start,End,kWh"];
  const t0 = Date.UTC(2025, 0, 1);
  const f = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  for (let i = 0; i < 45 * 96; i++) lines.push(`${f(t0 + i * 900000)},${f(t0 + (i + 1) * 900000)},0.5`);
  const m = measuredDemand(parseUsage(lines.join("\n")));
  assert.equal(m.basis, "30-day");
  assert.match(m.warnings.join(" "), /highest-loaded leg/);
});

test("a gap in the data is reported", () => {
  const lines = ["Start,End,kWh"];
  const t0 = Date.UTC(2025, 0, 1);
  const f = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  for (let i = 0; i < 40 * 96; i++) if (i < 10 * 96 || i >= 12 * 96) lines.push(`${f(t0 + i * 900000)},${f(t0 + (i + 1) * 900000)},0.5`);
  assert.match(measuredDemand(parseUsage(lines.join("\n"))).warnings.join(" "), /no readings/);
});

test("US dates with AM/PM", () => {
  assert.equal(parseTimestamp("3/4/2025 2:15 PM"), Date.UTC(2025, 2, 4, 14, 15));
  assert.equal(parseTimestamp("2025-03-04T00:15:00-08:00"), Date.UTC(2025, 2, 4, 0, 15));
});

test("the synthetic example is a full clean year with a stable peak", () => {
  const m = measuredDemand(parseUsage(exampleCsv()));
  assert.equal(m.basis, "year");
  assert.deepEqual(m.warnings, []);
  assert.equal(m.monthly.length, 12);
  close(m.peakKw, 10.388, 1e-6);
});
