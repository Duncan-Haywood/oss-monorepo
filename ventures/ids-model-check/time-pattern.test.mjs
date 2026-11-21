// Time-of-day ranges written as XSD patterns (temporal.mjs timeRangePattern):
// the pattern, read by this checker's own XSD regex reader, passes the same
// strings as the range for every value written with no zone, Z, +-00:00 or an
// offset a time zone uses, and never passes one the range refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIds } from "./ids.mjs";
import { timeRangePattern, temporalKey, temporalCompare, ZONE_OFFSETS } from "./temporal.mjs";
import { timePattern, datePattern, dateTimePattern } from "./editor.mjs";

const NS = "http://standards.buildingsmart.org/IDS";
const valueOf = (restriction) => parseIds(`<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="v" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name><value>${restriction}</value></attribute></requirements></specification></specifications></ids>`).specs[0].requirements[0].value;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const rangeOf = (r) => valueOf(`<xs:restriction base="xs:time">${Object.entries(r).map(([k, v]) => `<xs:${k} value="${v}"/>`).join("")}</xs:restriction>`);
const patternOf = (p) => valueOf(`<xs:restriction base="xs:string"><xs:pattern value="${esc(p)}"/></xs:restriction>`);

const DAY = 864e5;
const P = (n, w = 2) => String(n).padStart(w, "0");
const offMin = (s) => (s[0] === "-" ? -1 : 1) * (Number(s.slice(1, 3)) * 60 + Number(s.slice(4, 6)));
// The ways a value at instant t (ms from 1970-01-01T00:00Z) can be written as
// a time in zone z, if its wall clock falls on 1970-01-01... any local day:
// a time carries no date, so the wall clock is t + offset, taken mod a day.
// The checker then places that clock on 1970-01-01 again, so only clocks
// whose instant equals t are this value; the others are other instants and
// are tested too, as near misses.
function writings(t, z) {
  const o = z === "" || z === "Z" ? 0 : offMin(z);
  const local = (((t + o * 6e4) % DAY) + DAY) % DAY;
  const ms = local % 1000, sec = Math.floor(local / 1000);
  const hms = `${P(Math.floor(sec / 3600))}:${P(Math.floor(sec / 60) % 60)}:${P(sec % 60)}`;
  const f3 = P(ms, 3);
  const out = [`${hms}.${f3}${z}`, `${hms}.${f3}7${z}`, `${hms}.${f3}0001${z}`];
  if (ms === 0) out.push(`${hms}${z}`);
  if (ms % 100 === 0) out.push(`${hms}.${f3[0]}${z}`);
  if (ms % 10 === 0) out.push(`${hms}.${f3.slice(0, 2)}${z}`);
  if (local === 0) out.push(`24:00:00${z}`, `24:00:00.000${z}`);
  if (local === DAY - 1) out.push(`23:59:59.9999999${z}`);
  return out;
}
const STEPS = [0, 1, 2, 999, 1000, 1001, 59e3, 6e4, 61e3, 9e5, 18e5, 36e5, 36e5 + 1, 5 * 36e5, 12 * 36e5, 14 * 36e5, 14 * 36e5 + 1, 20 * 36e5, DAY - 1, DAY];
const NEAR = [...new Set(STEPS.flatMap((s) => [s, -s]))];
const ODD = ["+10:17", "-03:07", "+23:59", "-23:59", "+00:01"];
const keyOf = (v) => temporalKey(v);

function compare(r) {
  const p = timeRangePattern(r);
  const range = rangeOf(r);
  assert.ok(typeof p === "string", JSON.stringify(r));
  assert.ok(!/\\d/.test(p), "ASCII digits only");
  const pat = patternOf(p);
  const marks = [...Object.values(r).map(keyOf), 0, DAY / 2, DAY - 1];
  let n = 0;
  const zones = ["", "Z", "-00:00", ...ZONE_OFFSETS];
  for (const k of marks) for (const dt of NEAR) {
    for (const z of zones) for (const s of writings(k + dt, z)) { assert.equal(pat.match(s, "string"), range.match(s, "string"), `${JSON.stringify(r)} ${s}`); n++; }
    for (const z of ODD) for (const s of writings(k + dt, z)) {
      if (pat.match(s, "string")) assert.ok(range.match(s, "string"), `${JSON.stringify(r)} ${s}: pattern passes what the range refuses`);
      n++;
    }
  }
  for (const s of ["24:00:01", "24:00:00.5", "23:59:60", "23:60:00", "25:00:00", "12:00:00+24:00", "12:00:00+10:60", "12:00:00.", "1:00:00", "٠٩:00:00", " 12:00:00 ", "\t12:00:00Z\n", "2024-03-01T12:00:00", "2024-03-01", "12:00", "PT12H"]) {
    assert.equal(pat.match(s, "string"), range.match(s, "string"), `${JSON.stringify(r)} ${JSON.stringify(s)}`);
    n++;
  }
  return n;
}

test("timeRangePattern: the same verdict as the range on every zone in use, near each bound, past the millisecond", () => {
  const cases = [
    { minInclusive: "07:00:00", maxInclusive: "19:00:00" },
    { minInclusive: "00:00:00", maxInclusive: "01:00:00" },
    { minInclusive: "22:00:00" },
    { maxExclusive: "06:30:00" },
    { minExclusive: "08:30:00Z", maxExclusive: "17:00:00.5Z" },
    { minInclusive: "06:15:30.250+05:45", maxInclusive: "20:00:00-09:30" },
    { minInclusive: "00:00:00+14:00", maxInclusive: "23:59:59-12:00" },
    { minInclusive: "23:59:59.999" },
    { minInclusive: "24:00:00.000", maxInclusive: "00:00:00.5" },
    { minInclusive: "24:00:00", maxExclusive: "00:00:00.001" },
    { minInclusive: "12:00:00", maxInclusive: "12:00:00" },
    { minExclusive: "12:00:00.0004", maxInclusive: "12:00:00.001" },
    { minInclusive: "00:00:00", maxInclusive: "23:59:59.999999" },
  ];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const tm = (t) => new Date(t).toISOString().slice(11, 23);
  for (let i = 0; i < 12; i++) {
    const a = Math.floor(rnd() * DAY), b = Math.min(DAY - 1, a + Math.floor(rnd() * DAY));
    const r = {};
    if (rnd() > 0.15) r[rnd() < 0.3 ? "minExclusive" : "minInclusive"] = tm(a);
    if (rnd() > 0.15 || !Object.keys(r).length) r[rnd() < 0.3 ? "maxExclusive" : "maxInclusive"] = tm(b);
    cases.push(r);
  }
  let n = 0;
  for (const r of cases) n += compare(r);
  assert.ok(n > 100000, String(n));
});

test("24:00:00 as a time is 00:00:00 (XSD), not the next midnight", () => {
  assert.equal(temporalKey("24:00:00"), 0);
  assert.equal(temporalCompare("24:00:00", "00:00:00"), 0);
  assert.ok(Number.isNaN(temporalCompare("24:00:00.5", "00:00:00")));
  const r = rangeOf({ minInclusive: "00:00:00", maxInclusive: "01:00:00" });
  assert.equal(r.match("24:00:00", "string"), true);
  assert.equal(rangeOf({ minInclusive: "23:00:00" }).match("24:00:00", "string"), false);
  // A dateTime's 24:00:00 is still the next day's midnight.
  assert.equal(temporalKey("2024-01-01T24:00:00"), Date.parse("2024-01-02T00:00:00Z"));
});

test("timeRangePattern: refusals, and the editor's wrapper", () => {
  assert.equal(timeRangePattern({ minInclusive: "2024-01-01T00:00:00" }), null);
  assert.equal(timeRangePattern({ minInclusive: "25:00:00" }), false);
  assert.equal(timeRangePattern({ minInclusive: "10:00:00", maxInclusive: "09:00:00" }), false);
  assert.equal(timeRangePattern({ minExclusive: "10:00:00", maxExclusive: "10:00:00" }), false);
  // 24:00:00 is the start of the day, so nothing lies from 23:59:59.999 up to it.
  assert.equal(timeRangePattern({ minInclusive: "23:59:59.999", maxInclusive: "24:00:00" }), false);
  assert.equal(timePattern("", ""), null);
  assert.equal(timePattern("2024-01-01", ""), null);
  assert.equal(datePattern("07:00:00", "19:00:00"), null);
  assert.equal(dateTimePattern("07:00:00", "19:00:00"), null);
  const p = timePattern("07:00:00", "19:00:00", false, true);
  const pat = patternOf(p);
  for (const [s, want] of [["07:00:00", true], ["06:59:59.999", false], ["18:59:59.9999", true], ["19:00:00", false], ["12:00:00+01:00", true], ["08:00:00+05:00", false]]) assert.equal(pat.match(s, "string"), want, s);
});
