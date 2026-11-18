import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readMeter, parseTimestamp } from "./meter.mjs";
import { exampleCsv, syntheticYear } from "./example.mjs";

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const pad = (x) => String(x).padStart(2, "0");
const days = (n, f) => { const out = []; for (let i = 0; i < n * 24; i++) out.push(f(i, i % 24, Math.floor(i / 24))); return out; };
const date = (d) => new Date(Date.UTC(2025, 6, 1 + d)).toISOString().slice(0, 10);

test("Opower layout with signed hourly values (solar export negative)", () => {
  const lines = ["Name,Jane Q", "Address,1 Main St", "", "TYPE,DATE,START TIME,END TIME,USAGE (kWh),COST,NOTES"];
  lines.push(...days(3, (i, h, d) => `Electric usage,${date(d)},${pad(h)}:00,${pad(h)}:59,${h >= 10 && h < 15 ? "-2.50" : "1.00"},$0.30,`));
  const m = readMeter(lines.join("\n"));
  assert.ok(m.ok, m.notes.join(" "));
  assert.equal(m.net.length, 72);
  assert.equal(m.start, Date.UTC(2025, 6, 1));
  assert.equal(m.net[10], -2.5);
  assert.equal(m.net[9], 1);
  assert.match(m.notes.join(" "), /from the grid, 38 kWh sent to it/);
});

test("15-minute readings are summed into hours; separate delivered and received columns make net", () => {
  const lines = ["Interval Start,Interval End,Delivered kWh,Received kWh,Cost $"];
  for (let i = 0; i < 96 * 2; i++) {
    const t = Date.UTC(2025, 6, 1) + i * 900000, e = t + 900000;
    const f = (x) => new Date(x).toISOString().slice(0, 16).replace("T", " ");
    const h = new Date(t).getUTCHours();
    lines.push(`${f(t)},${f(e)},0.25,${h === 12 ? "0.75" : "0"},0.07`);
  }
  const m = readMeter(lines.join("\n"));
  assert.ok(m.ok, m.notes.join(" "));
  assert.equal(m.intervalMin, 15);
  assert.equal(m.net.length, 48);
  near(m.net[0], 1);
  near(m.net[12], 1 - 3);
  assert.match(m.notes[0], /"delivered kwh".*"received kwh"/);
});

test("Smart Meter Texas rows marked surplus generation count as export", () => {
  const lines = ["ESIID,USAGE_DATE,REVISION_DATE,USAGE_START_TIME,USAGE_END_TIME,USAGE_KWH,ESTIMATED_ACTUAL,CONSUMPTION_SURPLUSGENERATION"];
  for (let d = 0; d < 2; d++) for (let q = 0; q < 96; q++) {
    const s = `${pad(Math.floor(q / 4))}:${pad((q % 4) * 15)}`, e = `${pad(Math.floor((q + 1) / 4) % 24)}:${pad(((q + 1) % 4) * 15)}`;
    const dt = `07/0${1 + d}/2025`;
    lines.push(`"1000",${dt},${dt},${s},${e},0.300,A,Consumption`);
    lines.push(`"1000",${dt},${dt},${s},${e},${q >= 48 && q < 52 ? "0.500" : "0.000"},A,Surplus Generation`);
  }
  const m = readMeter(lines.join("\n"));
  assert.ok(m.ok, m.notes.join(" "));
  assert.equal(m.net.length, 48);
  near(m.net[0], 1.2);
  near(m.net[12], 1.2 - 2);
  assert.match(m.notes.join(" "), /surplus generation were read as energy sent/);
});

test("a missing hour is filled from the same hour on nearby days and named", () => {
  const lines = ["date,kwh"];
  for (let i = 0; i < 24 * 15; i++) if (i !== 24 * 7 + 18) lines.push(`${new Date(Date.UTC(2025, 2, 1) + i * 3600000).toISOString().slice(0, 16).replace("T", " ")},${(i % 24) / 10}`);
  const m = readMeter(lines.join("\n"));
  assert.equal(m.filled, 1);
  near(m.net[24 * 7 + 18], 1.8);
  assert.match(m.notes.join(" "), /1 hour\(s\) had no reading/);
});

test("daily totals are refused with a reason", () => {
  const lines = ["date,kwh", ...Array.from({ length: 90 }, (_, d) => `${new Date(Date.UTC(2025, 0, 1 + d)).toISOString().slice(0, 10)},25`)];
  const m = readMeter(lines.join("\n"));
  assert.equal(m.ok, false);
  assert.match(m.notes.join(" "), /24 hours apart/);
});

test("Green Button XML: delivered minus received, on the local clock with daylight saving", () => {
  const base = "https://utility.example/espi/1_1/resource/RetailCustomer/1/UsagePoint/1";
  const entry = (self, rels, content) => `<entry><link rel="self" href="${self}"/>${rels.map((r) => `<link rel="related" href="${r}"/>`).join("")}<content>${content}</content></entry>`;
  const reading = (s, v) => `<espi:IntervalReading><espi:timePeriod><espi:duration>3600</espi:duration><espi:start>${s}</espi:start></espi:timePeriod><espi:value>${v}</espi:value></espi:IntervalReading>`;
  const start = Date.UTC(2025, 6, 1, 7) / 1000; // midnight PDT
  let fwd = "", rev = "";
  for (let i = 0; i < 72; i++) { fwd += reading(start + i * 3600, 800); rev += reading(start + i * 3600, i % 24 === 12 ? 300 : 0); }
  const type = (flow, p10) => `<espi:ReadingType><espi:commodity>1</espi:commodity><espi:flowDirection>${flow}</espi:flowDirection><espi:powerOfTenMultiplier>${p10}</espi:powerOfTenMultiplier><espi:uom>72</espi:uom></espi:ReadingType>`;
  const xml = `<feed xmlns:espi="http://naesb.org/espi">
${entry(`${base}/LocalTimeParameters/1`, [], "<espi:LocalTimeParameters><espi:dstEndRule>B40E2000</espi:dstEndRule><espi:dstOffset>3600</espi:dstOffset><espi:dstStartRule>360E2000</espi:dstStartRule><espi:tzOffset>-28800</espi:tzOffset></espi:LocalTimeParameters>")}
${entry(`${base}/ReadingType/1`, [], type(1, 0))}
${entry(`${base}/ReadingType/2`, [], type(19, 1))}
${entry(`${base}/MeterReading/1`, [`${base}/ReadingType/1`], "<espi:MeterReading/>")}
${entry(`${base}/MeterReading/2`, [`${base}/ReadingType/2`], "<espi:MeterReading/>")}
${entry(`${base}/MeterReading/1/IntervalBlock/1`, [], `<espi:IntervalBlock>${fwd}</espi:IntervalBlock>`)}
${entry(`${base}/MeterReading/2/IntervalBlock/1`, [], `<espi:IntervalBlock>${rev}</espi:IntervalBlock>`)}
</feed>`;
  const m = readMeter(xml);
  assert.ok(m.ok, m.notes.join(" "));
  assert.equal(m.start, Date.UTC(2025, 6, 1, 0));
  assert.equal(m.net.length, 72);
  near(m.net[0], 0.8);
  near(m.net[12], 0.8 - 3); // 300 Wh x 10^1 received at local noon
  assert.match(m.notes.join(" "), /Delivered and received/);
});

test("the example CSV reads back to the synthetic year", () => {
  const { net } = syntheticYear();
  const m = readMeter(exampleCsv());
  assert.ok(m.ok);
  assert.equal(m.net.length, 8760);
  for (let i = 0; i < 8760; i += 97) near(m.net[i], +net[i].toFixed(2));
});

test("timestamps: ISO, US dates, AM/PM; impossible dates refused", () => {
  assert.equal(parseTimestamp("2025-07-04 1:15 PM"), Date.UTC(2025, 6, 4, 13, 15));
  assert.equal(parseTimestamp("7/4/25 13:15"), Date.UTC(2025, 6, 4, 13, 15));
  assert.ok(Number.isNaN(parseTimestamp("2025-02-30")));
});

test("greenbutton.mjs is the same file as the demand-charge-interval-analyzer copy", () => {
  const mine = readFileSync(new URL("./greenbutton.mjs", import.meta.url), "utf8");
  const sibling = readFileSync(new URL("../demand-charge-interval-analyzer/greenbutton.mjs", import.meta.url), "utf8");
  assert.equal(mine, sibling);
});
