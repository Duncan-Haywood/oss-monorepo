// dateTime ranges written as XSD patterns (temporal.mjs dateTimeRangePattern):
// the pattern, read by this checker's own XSD regex reader, passes the same
// strings as the range for every value written with no zone, Z, +-00:00 or an
// offset a time zone uses, and never passes one the range refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIds } from "./ids.mjs";
import { dateTimeRangePattern, ZONE_OFFSETS } from "./temporal.mjs";
import { dateTimePattern } from "./editor.mjs";

const NS = "http://standards.buildingsmart.org/IDS";
const valueOf = (restriction) => parseIds(`<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="v" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name><value>${restriction}</value></attribute></requirements></specification></specifications></ids>`).specs[0].requirements[0].value;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const rangeOf = (r) => valueOf(`<xs:restriction base="xs:dateTime">${Object.entries(r).map(([k, v]) => `<xs:${k} value="${v}"/>`).join("")}</xs:restriction>`);
const patternOf = (p) => valueOf(`<xs:restriction base="xs:string"><xs:pattern value="${esc(p)}"/></xs:restriction>`);

const P = (n, w = 2) => String(n).padStart(w, "0");
const offStr = (o) => (o === 0 ? "+00:00" : `${o < 0 ? "-" : "+"}${P(Math.floor(Math.abs(o) / 60))}:${P(Math.abs(o) % 60)}`);
const offMin = (s) => (s[0] === "-" ? -1 : 1) * (Number(s.slice(1, 3)) * 60 + Number(s.slice(4, 6)));
// The ways a value at instant t can be written in zone z (a string: "", "Z" or
// an offset): local wall time, fractions of several lengths, 24:00:00 for a
// midnight.
function writings(t, z) {
  const o = z === "" || z === "Z" ? 0 : offMin(z);
  const d = new Date(t + o * 6e4);
  if (d.getUTCFullYear() < 0 || d.getUTCFullYear() > 9999) return [];
  const day = `${P(d.getUTCFullYear(), 4)}-${P(d.getUTCMonth() + 1)}-${P(d.getUTCDate())}`;
  const hms = `${P(d.getUTCHours())}:${P(d.getUTCMinutes())}:${P(d.getUTCSeconds())}`;
  const ms = d.getUTCMilliseconds();
  const out = [];
  const f3 = P(ms, 3);
  out.push(`${day}T${hms}.${f3}${z}`, `${day}T${hms}.${f3}7${z}`);
  if (ms === 0) out.push(`${day}T${hms}${z}`);
  if (ms % 100 === 0) out.push(`${day}T${hms}.${f3[0]}${z}`);
  if (ms % 10 === 0) out.push(`${day}T${hms}.${f3.slice(0, 2)}${z}`);
  if (ms === 0 && hms === "00:00:00") {
    const p = new Date(t + o * 6e4 - 864e5);
    if (p.getUTCFullYear() >= 0) out.push(`${P(p.getUTCFullYear(), 4)}-${P(p.getUTCMonth() + 1)}-${P(p.getUTCDate())}T24:00:00${z}`, `${P(p.getUTCFullYear(), 4)}-${P(p.getUTCMonth() + 1)}-${P(p.getUTCDate())}T24:00:00.000${z}`);
  }
  return out;
}
const STEPS = [0, 1, 2, 999, 1000, 1001, 59e3, 6e4, 61e3, 9e5, 18e5, 27e5, 36e5, 36e5 + 1, 5 * 36e5, 12 * 36e5, 14 * 36e5, 14 * 36e5 + 1, 20 * 36e5, 864e5 - 1, 864e5, 864e5 + 1, 1.5 * 864e5, 2 * 864e5, 3 * 864e5];
const NEAR = [...new Set(STEPS.flatMap((s) => [s, -s]))];
const ODD = ["+10:17", "-03:07", "+23:59", "-23:59", "+00:01"];

function compare(r, { odd = true } = {}) {
  const p = dateTimeRangePattern(r);
  const range = rangeOf(r);
  assert.ok(typeof p === "string", JSON.stringify(r));
  assert.ok(!/\\d/.test(p), "ASCII digits only");
  const pat = patternOf(p);
  const keys = Object.values(r).map((v) => Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(v) ? v : v + "Z"));
  let n = 0;
  const zones = ["", "Z", "-00:00", ...ZONE_OFFSETS];
  for (const k of keys) for (const dt of NEAR) {
    for (const z of zones) for (const s of writings(k + dt, z)) { assert.equal(pat.match(s, "string"), range.match(s, "string"), `${JSON.stringify(r)} ${s}`); n++; }
    if (odd) for (const z of ODD) for (const s of writings(k + dt, z)) {
      const inRange = range.match(s, "string");
      if (pat.match(s, "string")) assert.ok(inRange, `${JSON.stringify(r)} ${s}: pattern passes what the range refuses`);
      n++;
    }
  }
  // Odd offsets well inside the range pass.
  if (keys.length === 2 && keys[1] - keys[0] > 4 * 864e5) for (const z of ODD) for (const s of writings((keys[0] + keys[1]) / 2 - ((keys[0] + keys[1]) / 2) % 1000, z)) assert.ok(pat.match(s, "string"), `${JSON.stringify(r)} ${s} mid-range`);
  for (const s of ["2024-02-30T12:00:00", "2023-02-29T12:00:00Z", "2024-04-31T00:00:00", "2024-03-01T24:00:01", "2024-03-01T23:59:60", "2024-03-01T23:60:00", "2024-03-01T12:00:00+24:00", "2024-03-01T12:00:00+10:60", "2024-03-01T12:00:00.", "٢٠٢٤-03-01T12:00:00", " 2024-03-01T12:00:00 ", "\t2024-03-01T12:00:00Z\n", "2024-03-01", "2024-03-01T24:00:00.0001"]) {
    assert.equal(pat.match(s, "string"), range.match(s, "string"), `${JSON.stringify(r)} ${JSON.stringify(s)}`);
    n++;
  }
  return n;
}

test("dateTimeRangePattern: the same verdict as the range on every zone in use, near each bound, to the millisecond", () => {
  const cases = [
    { minInclusive: "2024-01-01T00:00:00", maxInclusive: "2030-12-31T23:59:59" },
    { minInclusive: "2024-03-10T08:30:00" },
    { maxExclusive: "2024-03-10T08:30:00" },
    { minExclusive: "2024-03-10T08:30:00Z", maxExclusive: "2024-03-10T17:00:00.5Z" },
    { minInclusive: "2024-02-28T22:15:30.250+05:45", maxInclusive: "2024-03-01T01:00:00-09:30" },
    { minInclusive: "1999-12-31T23:59:59.999", maxInclusive: "2000-01-01T00:00:00.001" },
    { minInclusive: "2024-06-01T12:00:00", maxInclusive: "2024-06-01T12:00:00" },
    { minInclusive: "1900-02-28T00:00:00", maxExclusive: "1900-03-02T00:00:00" },
    { minInclusive: "0000-01-01T05:00:00" },
    { maxInclusive: "9999-12-31T20:00:00" },
  ];
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const iso = (t) => new Date(t).toISOString().replace("Z", "");
  for (let i = 0; i < 14; i++) {
    const a = Date.parse("1950-01-01T00:00:00Z") + Math.floor(rnd() * 100 * 365 * 864e5);
    const b = a + Math.floor(rnd() * (rnd() < 0.5 ? 3 * 864e5 : 4000 * 864e5));
    const r = {};
    if (rnd() > 0.15) r[rnd() < 0.3 ? "minExclusive" : "minInclusive"] = iso(a);
    if (rnd() > 0.15 || !Object.keys(r).length) r[rnd() < 0.3 ? "maxExclusive" : "maxInclusive"] = iso(b);
    cases.push(r);
  }
  let n = 0;
  for (const r of cases) n += compare(r);
  assert.ok(n > 100000, String(n));
});

test("dateTimeRangePattern: refusals", () => {
  assert.equal(dateTimeRangePattern({ minInclusive: "2024-01-01" }), null);
  assert.equal(dateTimeRangePattern({ minInclusive: "2024-02-30T00:00:00" }), false);
  assert.equal(dateTimeRangePattern({ minInclusive: "2024-01-02T00:00:00", maxInclusive: "2024-01-01T00:00:00" }), false);
  assert.equal(dateTimeRangePattern({ minExclusive: "2024-01-01T00:00:00", maxExclusive: "2024-01-01T00:00:00.001" }), false);
});

test("dateTimePattern: the editor's bounds, inclusive or exclusive", () => {
  assert.equal(dateTimePattern("", ""), null);
  assert.equal(dateTimePattern("2024-01-01", ""), null);
  const p = dateTimePattern("2024-01-01T00:00:00", "2024-12-31T23:59:59", false, true);
  assert.equal(p, dateTimeRangePattern({ minInclusive: "2024-01-01T00:00:00", maxExclusive: "2024-12-31T23:59:59" }));
  assert.ok(p.length < 20000, String(p.length));
});
