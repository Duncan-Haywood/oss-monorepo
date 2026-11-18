import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeDstRule, ruleDay, localClock, readEspi, espiToCsv, isEspi } from "./greenbutton.mjs";
import { parseIntervals, analyze } from "./calc.mjs";

// Encodes a DstRuleType the way the ESPI schema lays out the bits, to build test rules independently of the decoder.
const enc = ({ seconds = 0, hour, dow, dom = 0, op, month }) =>
  ((month << 28) | (op << 25) | (dom << 20) | (dow << 17) | (hour << 12) | seconds) >>> 0;
const hex = (r) => enc(r).toString(16).toUpperCase().padStart(8, "0");

test("US rules as Green Button files write them decode to the second Sunday of March and first of November", () => {
  const start = decodeDstRule("360E2000");
  const end = decodeDstRule("B40E2000");
  assert.deepEqual(start, { seconds: 0, hour: 2, dow: 7, dom: 0, op: 3, month: 3 });
  assert.deepEqual(end, { seconds: 0, hour: 2, dow: 7, dom: 0, op: 2, month: 11 });
  assert.equal(hex(start), "360E2000");
  assert.equal(ruleDay(2024, start), 10);
  assert.equal(ruleDay(2024, end), 3);
  assert.equal(ruleDay(2025, start), 9);
  assert.equal(ruleDay(2025, end), 2);
  assert.equal(ruleDay(2026, start), 8);
  assert.equal(ruleDay(2026, end), 1);
  assert.equal(decodeDstRule("FFFFFFFF"), null);
  assert.equal(decodeDstRule("00000000"), null);
  assert.equal(decodeDstRule("not hex"), null);
});

test("operators: fixed day, on-or-after, last occurrence", () => {
  assert.equal(ruleDay(2024, { op: 0, dom: 15, dow: 0, month: 6 }), 15);
  // EU: last Sunday of March 2024 is the 31st, of October the 27th.
  assert.equal(ruleDay(2024, { op: 7, dow: 7, month: 3 }), 31);
  assert.equal(ruleDay(2024, { op: 7, dow: 7, month: 10 }), 27);
  // Sunday on or after 8 March 2024 (old-style encoding of the US rule) is the 10th.
  assert.equal(ruleDay(2024, { op: 1, dom: 8, dow: 7, month: 3 }), 10);
  // A fifth Monday that February 2024 does not have falls back to the last (26th).
  assert.equal(ruleDay(2024, { op: 6, dow: 1, month: 2 }), 26);
});

const EASTERN = { tzOffset: -18000, dstOffset: 3600, dstStart: decodeDstRule("360E2000"), dstEnd: decodeDstRule("B40E2000") };
const utc = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const wall = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

test("local clock springs forward and falls back at 2:00 wall time (US Eastern)", () => {
  const c = localClock(EASTERN);
  assert.equal(c(utc(2024, 1, 15, 17)), wall(2024, 1, 15, 12));
  assert.equal(c(utc(2024, 7, 1, 16)), wall(2024, 7, 1, 12));
  assert.equal(c(utc(2024, 3, 10, 6, 45)), wall(2024, 3, 10, 1, 45)); // 1:45 EST
  assert.equal(c(utc(2024, 3, 10, 7, 0)), wall(2024, 3, 10, 3, 0)); // 2:00 EST is 3:00 EDT
  assert.equal(c(utc(2024, 11, 3, 5, 45)), wall(2024, 11, 3, 1, 45)); // first 1:45, EDT
  assert.equal(c(utc(2024, 11, 3, 6, 0)), wall(2024, 11, 3, 1, 0)); // back to 1:00 EST
  assert.equal(c(utc(2024, 11, 3, 6, 45)), wall(2024, 11, 3, 1, 45)); // second 1:45, EST
  assert.equal(c(utc(2024, 11, 3, 7, 0)), wall(2024, 11, 3, 2, 0));
});

test("southern hemisphere rules wrap the year end (Sydney)", () => {
  const c = localClock({
    tzOffset: 36000,
    dstOffset: 3600,
    dstStart: { seconds: 0, hour: 2, dow: 7, dom: 0, op: 2, month: 10 }, // first Sunday of October, 2:00 standard
    dstEnd: { seconds: 0, hour: 3, dow: 7, dom: 0, op: 2, month: 4 }, // first Sunday of April, 3:00 daylight
  });
  assert.equal(c(utc(2024, 1, 15, 2)), wall(2024, 1, 15, 13)); // summer: UTC+11
  assert.equal(c(utc(2024, 7, 15, 2)), wall(2024, 7, 15, 12)); // winter: UTC+10
  assert.equal(c(utc(2024, 12, 15, 2)), wall(2024, 12, 15, 13));
  // 7 April 2024, 3:00 AEDT = 16:00 UTC on the 6th: the last daylight minute is 15:59 UTC.
  assert.equal(c(utc(2024, 4, 6, 15, 45)), wall(2024, 4, 7, 2, 45));
  assert.equal(c(utc(2024, 4, 6, 16, 0)), wall(2024, 4, 7, 2, 0));
});

test("no daylight rule or no LocalTimeParameters: standard time or UTC", () => {
  assert.equal(localClock({ tzOffset: -25200, dstOffset: 3600, dstStart: null, dstEnd: null })(utc(2024, 7, 1, 19)), wall(2024, 7, 1, 12));
  assert.equal(localClock(null)(utc(2024, 7, 1, 19)), wall(2024, 7, 1, 19));
});

// A synthetic feed with the structure of a Green Button download: one UsagePoint, two meter readings
// (delivered Wh, and received Wh with a different multiplier), linked to their reading types by href.
function feed({ days = 3, start = utc(2024, 7, 1, 4), dst = true, extra = "" } = {}) {
  const base = "https://utility.example/DataCustodian/espi/1_1/resource";
  const up = `${base}/RetailCustomer/9/UsagePoint/1`;
  const entry = (self, rels, content) =>
    `<entry><id>urn:uuid:${self.length}</id><link rel="self" href="${self}"/>${rels.map((r) => `<link rel="related" href="${r}"/>`).join("")}<content>${content}</content></entry>`;
  const reading = (s, v) => `<espi:IntervalReading><espi:cost>12</espi:cost><espi:timePeriod><espi:duration>900</espi:duration><espi:start>${s}</espi:start></espi:timePeriod><espi:value>${v}</espi:value></espi:IntervalReading>`;
  let fwd = "", rev = "";
  for (let i = 0; i < days * 96; i++) {
    const s = start + i * 900;
    const q = i % 96;
    fwd += reading(s, q === 70 ? 9000 : 2500); // 2.5 kWh (10 kW) baseline, one 9 kWh (36 kW) interval a day
    rev += reading(s, q >= 40 && q < 60 ? 300 : 0); // x10 multiplier: 3 kWh
  }
  const ltp = dst
    ? "<espi:LocalTimeParameters><espi:dstEndRule>B40E2000</espi:dstEndRule><espi:dstOffset>3600</espi:dstOffset><espi:dstStartRule>360E2000</espi:dstStartRule><espi:tzOffset>-18000</espi:tzOffset></espi:LocalTimeParameters>"
    : "<espi:LocalTimeParameters><espi:dstEndRule>FFFFFFFF</espi:dstEndRule><espi:dstOffset>0</espi:dstOffset><espi:dstStartRule>FFFFFFFF</espi:dstStartRule><espi:tzOffset>-18000</espi:tzOffset></espi:LocalTimeParameters>";
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:espi="http://naesb.org/espi">
${entry(`${base}/LocalTimeParameters/1`, [], ltp)}
${entry(`${base}/ReadingType/2`, [], "<espi:ReadingType><espi:accumulationBehaviour>4</espi:accumulationBehaviour><espi:commodity>1</espi:commodity><espi:flowDirection>19</espi:flowDirection><espi:intervalLength>900</espi:intervalLength><espi:powerOfTenMultiplier>1</espi:powerOfTenMultiplier><espi:uom>72</espi:uom></espi:ReadingType>")}
${entry(`${base}/ReadingType/1`, [], "<espi:ReadingType><espi:accumulationBehaviour>4</espi:accumulationBehaviour><espi:commodity>1</espi:commodity><espi:flowDirection>1</espi:flowDirection><espi:intervalLength>900</espi:intervalLength><espi:powerOfTenMultiplier>0</espi:powerOfTenMultiplier><espi:uom>72</espi:uom></espi:ReadingType>")}
${entry(`${up}/MeterReading/2`, [`${base}/ReadingType/2`], "<espi:MeterReading/>")}
${entry(`${up}/MeterReading/1`, [`${base}/ReadingType/1`], "<espi:MeterReading/>")}
${entry(`${up}/MeterReading/2/IntervalBlock/1`, [], `<espi:IntervalBlock><espi:interval><espi:duration>${days * 86400}</espi:duration><espi:start>${start}</espi:start></espi:interval>${rev}</espi:IntervalBlock>`)}
${entry(`${up}/MeterReading/1/IntervalBlock/1`, [], `<espi:IntervalBlock><espi:interval><espi:duration>${days * 86400}</espi:duration><espi:start>${start}</espi:start></espi:interval>${fwd}</espi:IntervalBlock>`)}
${extra}
</feed>`;
}

test("reads each reading type with its own multiplier, following MeterReading links", () => {
  const { series, ltp } = readEspi(feed());
  assert.equal(series.length, 2);
  const fwd = series.find((s) => s.type.flow === 1);
  const rev = series.find((s) => s.type.flow === 19);
  assert.equal(fwd.readings.length, 288);
  assert.equal(fwd.readings[70].v, 9000);
  assert.equal(Math.max(...rev.readings.map((r) => r.v)), 3000); // 300 x 10^1
  assert.equal(ltp.tzOffset, -18000);
  assert.equal(ltp.dstStart.month, 3);
});

test("picks the delivered series, converts to kWh and local daylight time, says what it skipped", () => {
  const g = espiToCsv(feed());
  assert.ok(isEspi(feed()));
  assert.equal(g.unit, "kwh");
  const lines = g.csv.split("\n");
  assert.equal(lines.length, 289);
  assert.equal(lines[0], "Interval start (local),Usage (kWh)");
  assert.equal(lines[1], "2024-07-01 00:00,2.5"); // 04:00 UTC in July is midnight EDT
  assert.equal(lines[71], "2024-07-01 17:30,9");
  assert.ok(g.notes.some((n) => /received from you/.test(n) && /not used/.test(n)));
  assert.ok(g.notes.some((n) => /daylight saving applied/.test(n)));
});

test("an ESPI file runs straight through the analyzer: kWh read as kWh, peak at local time", () => {
  const p = parseIntervals(feed({ days: 31 }));
  assert.equal(p.unitHint, "kwh");
  assert.equal(p.rows.length, 31 * 96);
  const a = analyze(p.rows, { unit: p.unitHint, intervalMin: "", demandRate: "10", ratchetPct: "" });
  assert.ok(a.ok, JSON.stringify(a.warnings));
  assert.equal(a.months[0].month, "2024-07");
  assert.equal(a.months[0].peak, 36);
  assert.equal(new Date(a.months[0].peakAt).getUTCHours(), 17);
});

test("without daylight rules the same file is read in standard time", () => {
  const g = espiToCsv(feed({ dst: false }));
  assert.equal(g.csv.split("\n")[1], "2024-06-30 23:00,2.5");
  assert.ok(g.notes.some((n) => /no daylight-saving rule/.test(n)));
});

test("a minimal file with one reading type and no links still reads; W gives kW", () => {
  const r = (s, v) => `<IntervalReading><timePeriod><duration>900</duration><start>${s}</start></timePeriod><value>${v}</value></IntervalReading>`;
  const xml = `<feed><entry><content><ReadingType><powerOfTenMultiplier>3</powerOfTenMultiplier><uom>38</uom></ReadingType></content></entry>
  <entry><content><IntervalBlock>${r(utc(2024, 1, 1, 0), 12)}${r(utc(2024, 1, 1, 0, 15), 15)}</IntervalBlock></content></entry></feed>`;
  const g = espiToCsv(xml);
  assert.equal(g.unit, "kw");
  assert.equal(g.csv, "Interval start (local),Demand (kW)\n2024-01-01 00:00,12\n2024-01-01 00:15,15");
  assert.ok(g.notes.some((n) => /No time zone/.test(n)));
});

test("a gas-only file is refused with a reason, not read as electricity", () => {
  const r = `<IntervalReading><timePeriod><duration>3600</duration><start>${utc(2024, 1, 1, 0)}</start></timePeriod><value>4</value></IntervalReading>`;
  const xml = `<feed><entry><content><ReadingType><commodity>7</commodity><uom>169</uom></ReadingType></content></entry><entry><content><IntervalBlock>${r}</IntervalBlock></content></entry></feed>`;
  const p = parseIntervals(xml);
  assert.equal(p.rows.length, 0);
  assert.ok(p.notes.some((n) => /not electricity/.test(n)));
});

test("Opower-layout Green Button CSV: preamble, separate DATE and START TIME, UNITS column", () => {
  let s = "Name,ACME BAKERY\nAddress,1 MAIN ST\nAccount Number,0000\nService,Service 1\n\nTYPE,DATE,START TIME,END TIME,USAGE,UNITS,COST,NOTES\n";
  const p2 = (n) => String(n).padStart(2, "0");
  for (let d = 1; d <= 31; d++) for (let q = 0; q < 96; q++) {
    const h = Math.floor(q / 4), m = (q % 4) * 15;
    s += `Electric usage,2024-01-${p2(d)},${p2(h)}:${p2(m)},${p2(h)}:${p2(m + 14)},${q === 50 ? "7.50" : "1.25"},kWh,$0.20,\n`;
  }
  const p = parseIntervals(s);
  assert.equal(p.rows.length, 31 * 96);
  assert.equal(p.unitHint, "kwh");
  assert.ok(p.notes.some((n) => /START TIME/.test(n)));
  assert.equal(p.rows[50].t, Date.UTC(2024, 0, 1, 12, 30));
  const a = analyze(p.rows, { unit: "kwh", intervalMin: "", demandRate: "10", ratchetPct: "" });
  assert.ok(a.ok);
  assert.equal(a.intervalMin, 15);
  assert.equal(a.months[0].peak, 30);
});

test("US date and 12-hour start time in separate columns", () => {
  const p = parseIntervals("Date,Start Time,End Time,kWh\n3/4/2026,1:00 PM,1:15 PM,2\n3/4/2026,1:15 PM,1:30 PM,3\n");
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].t, Date.UTC(2026, 2, 4, 13, 15));
  assert.equal(p.unitHint, "kwh");
});
