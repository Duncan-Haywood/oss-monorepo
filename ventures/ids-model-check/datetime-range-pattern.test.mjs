// dateTime ranges written as one XSD pattern (temporal.mjs
// dateTimeRangePattern), checked against ids.mjs on the range itself, with
// the pattern read by the XSD regex reader (xsdregex.mjs, elementpath's
// reading). Exact for values with no zone, Z or +/-00:00, and for any zone
// more than a day inside the bounds; near a bound, exact for the listed
// zones. The only difference allowed: a value with an unlisted zone within
// a day of a bound that the range passes and the pattern does not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIds } from "./ids.mjs";
import { dateTimeRangePattern, temporalCompare, WHOLE_HOUR_ZONES } from "./temporal.mjs";
import { compileXsdRegex } from "./xsdregex.mjs";

const NS = "http://standards.buildingsmart.org/IDS";
const rangeValue = (r) => parseIds(`<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="v" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:dateTime">${Object.entries(r).map(([k, v]) => `<xs:${k} value="${v}"/>`).join("")}</xs:restriction></value></attribute></requirements></specification></specifications></ids>`).specs[0].requirements[0].value;

const zoneStr = (m) => (m === null ? "" : m === "Z" ? "Z" : (m < 0 ? "-" : "+") + String(Math.floor(Math.abs(m) / 60)).padStart(2, "0") + ":" + String(Math.abs(m) % 60).padStart(2, "0"));
// The local text of instant ms (UTC) written in zone m (minutes), with extra
// fraction digits after the milliseconds.
function write(ms, m, extra = "", fracForm = "ms") {
  const off = typeof m === "number" ? m : 0;
  const iso = new Date(ms + off * 60000).toISOString();
  if (iso.length !== 24) return null;
  let t = iso.slice(0, 19);
  const msPart = iso.slice(20, 23);
  if (fracForm === "ms") t += "." + msPart + extra;
  else if (fracForm === "none" && msPart === "000" && !extra) {}
  else if (fracForm === "none") t += "." + msPart + extra;
  return t + zoneStr(m);
}
const ZONES = [null, "Z", 0, -0, 60, -300, 330, -570, 345, 1, -1, 1439, -1439, 840, -720, 37, -61];
const msOf = (s) => {
  const m = s.match(/^(.*?T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/);
  return Date.parse(m[1] + (m[2] ? m[2].slice(0, 4) : "") + (m[3] || "Z"));
};

function sweep(r, opts) {
  const p = dateTimeRangePattern(r, opts);
  const v = rangeValue(r);
  const listed = new Set([0, ...(opts && opts.zones ? opts.zones : WHOLE_HOUR_ZONES)]);
  const bounds = Object.values(r).map(msOf);
  const strs = new Set(["2024-01-01T24:00:00.5", "2024-01-01T23:60:00", "2024-02-30T10:00:00", "12024-01-01T00:00:00", "-2024-01-01T00:00:00", "2024-01-01T00:00:00.", "2024-01-01T00:00:00+24:00", "2024-01-01T00:00:00+10:60", "2024-01-01", "٢٠٢٤-01-01T00:00:00"]);
  const steps = [0, 1, 1000, 60000, 3600000, 1439 * 60000, 1440 * 60000, 1441 * 60000, 2 * 864e5];
  for (const b of bounds) for (const st of steps) for (const sg of [-1, 1]) for (const z of ZONES) {
    for (const ex of ["", "4", "0000", "9999999"]) {
      const s = write(b + sg * st, z, ex);
      if (s) strs.add(s);
    }
    const n = write(b + sg * st, z, "", "none");
    if (n) { strs.add(n); strs.add(" " + n + "\t"); }
    // midnight written as 24:00:00 of the day before
    const z0 = typeof z === "number" ? z : 0;
    const loc = new Date(b + sg * st + z0 * 60000);
    if (loc.getUTCHours() === 0 && loc.getUTCMinutes() === 0 && loc.getUTCSeconds() === 0 && loc.getUTCMilliseconds() === 0) {
      const prev = new Date(loc.getTime() - 864e5).toISOString().slice(0, 10);
      if (prev.length === 10) { strs.add(prev + "T24:00:00" + zoneStr(z)); strs.add(prev + "T24:00:00.000" + zoneStr(z)); }
    }
  }
  for (let t = Date.parse("1890-01-01T00:00:00Z"); t < Date.parse("2060-01-01T00:00:00Z"); t += 864e5 * 41 + 3600e3 * 7 + 61e3) for (const z of [null, "Z", 120, -480]) strs.add(write(t, z, "", "none"));
  let compared = 0, allowed = 0;
  const re = p ? compileXsdRegex(p) : null;
  if (p) assert.ok(re, "compiles as XSD");
  for (const s of strs) {
    const want = v.match(s, "string");
    const got = re ? new RegExp(`^(?:${re.source})$`, "v").test(s) : false;
    compared++;
    if (want === got) continue;
    const zm = s.trim().match(/([+-])(\d{2}):(\d{2})$/);
    const zmin = zm ? (zm[1] === "-" ? -1 : 1) * (Number(zm[2]) * 60 + Number(zm[3])) : 0;
    // near: the written (local) time within a day of a bound's instant
    const local = msOf(s.trim().replace(/(Z|[+-]\d{2}:\d{2})$/, ""));
    const near = bounds.some((b) => Math.abs(local - b) < 1440 * 60000 + 1000);
    assert.ok(want && !got && !listed.has(zmin) && near, `${JSON.stringify(r)} ${JSON.stringify(s)} range ${want} pattern ${got}`);
    allowed++;
  }
  return { p, compared, allowed };
}

test("temporalCompare orders past the millisecond, 24:00:00 as the next midnight", () => {
  assert.equal(temporalCompare("2024-01-01T00:00:00.0004", "2024-01-01T00:00:00"), 1);
  assert.equal(temporalCompare("2024-01-01T00:00:00.000", "2024-01-01T00:00:00Z"), 0);
  assert.equal(temporalCompare("2024-01-01T00:00:00.12345", "2024-01-01T00:00:00.1234"), 1);
  assert.equal(temporalCompare("2024-01-01T24:00:00", "2024-01-02T00:00:00"), 0);
  assert.ok(Number.isNaN(temporalCompare("2024-01-01T24:00:00.5", "2024-01-02T00:00:00")));
  assert.ok(Number.isNaN(temporalCompare("2024-01-01", "2024-01-01T00:00:00")));
  assert.equal(temporalCompare("2024-01-01T01:00:00+01:00", "2024-01-01T00:00:00Z"), 0);
  assert.equal(temporalCompare("10:00:00.00001", "10:00:00"), 1);
});

test("the checker passes a value a fraction past an exclusive bound (it compared milliseconds)", () => {
  const v = rangeValue({ minExclusive: "2024-01-01T00:00:00" });
  assert.equal(v.match("2024-01-01T00:00:00.0004", "string"), true);
  assert.equal(v.match("2024-01-01T00:00:00.0000", "string"), false);
  const w = rangeValue({ maxInclusive: "2024-01-01T00:00:00.1234" });
  assert.equal(w.match("2024-01-01T00:00:00.12341", "string"), false);
  assert.equal(w.match("2024-01-01T00:00:00.123400", "string"), true);
});

const CASES = [
  { minInclusive: "2024-01-01T00:00:00", maxInclusive: "2030-12-31T23:59:59" },
  { minInclusive: "2024-01-01T08:30:00" },
  { maxExclusive: "2024-06-01T12:00:00.25" },
  { minExclusive: "2024-03-10T10:15:20.5", maxInclusive: "2024-03-10T10:15:21" },
  { minExclusive: "2023-12-31T23:59:59.999", maxExclusive: "2024-01-01T00:00:00.0001" },
  { minInclusive: "2024-02-28T22:00:00+05:30", maxInclusive: "2024-03-01T02:00:00-04:00" },
  { minInclusive: "1999-12-31T23:00:00Z", maxExclusive: "2000-01-02T00:00:00" },
  { maxInclusive: "2024-01-01T24:00:00" },
  { minInclusive: "0000-01-01T05:00:00", maxInclusive: "0000-01-03T00:00:00" },
  { minExclusive: "9999-12-30T12:00:00" },
  { minInclusive: "2024-05-05T05:05:05.050505", maxExclusive: "2024-05-06T05:05:05.0505051" },
];

test("dateTimeRangePattern, no zones listed: exact for zone-less, Z and +/-00:00 values, and any zone a day inside", () => {
  let total = 0, allowed = 0;
  for (const r of CASES) { const s = sweep(r, { zones: [] }); total += s.compared; allowed += s.allowed; assert.ok(!s.p || !/\\d/.test(s.p), "ASCII digits only"); }
  assert.ok(total > 20000, String(total));
  assert.ok(allowed > 0, "zoned values near a bound are the gap");
});

test("dateTimeRangePattern, whole-hour zones listed: those placed exactly near a bound too", () => {
  let total = 0;
  for (const r of CASES.slice(0, 6)) total += sweep(r, { zones: WHOLE_HOUR_ZONES }).compared;
  assert.ok(total > 10000, String(total));
});

test("dateTimeRangePattern: empty ranges, bad bounds, a seeded random sweep", () => {
  assert.equal(dateTimeRangePattern({ minInclusive: "2024-01-02T00:00:00", maxInclusive: "2024-01-01T00:00:00" }), false);
  assert.equal(dateTimeRangePattern({ minExclusive: "2024-01-01T00:00:00", maxExclusive: "2024-01-01T00:00:00" }), false);
  assert.equal(dateTimeRangePattern({ minInclusive: "2024-02-30T00:00:00" }), false);
  assert.equal(dateTimeRangePattern({ minInclusive: "2024-01-01" }), null);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const at = () => new Date(Date.parse("1950-01-01T00:00:00Z") + Math.floor(rnd() * 100 * 365 * 864e5 / 1000) * 1000).toISOString().slice(0, 19) + (rnd() < 0.3 ? "." + String(Math.floor(rnd() * 1e6)) : "");
  for (let k = 0; k < 12; k++) {
    let a = at(), b = rnd() < 0.5 ? at() : new Date(Date.parse(a + "Z") + Math.floor(rnd() * 3 * 864e5)).toISOString().slice(0, 19);
    if (temporalCompare(a, b) > 0) [a, b] = [b, a];
    const r = {};
    if (rnd() < 0.85) r[rnd() < 0.5 ? "minInclusive" : "minExclusive"] = a;
    if (rnd() < 0.85 || !Object.keys(r).length) r[rnd() < 0.5 ? "maxInclusive" : "maxExclusive"] = b;
    sweep(r, { zones: [] });
  }
});

test("zonesOf: the zones a model writes its dateTimes in; the editor's pattern places them exactly", async () => {
  const { zonesOf, datePattern } = await import("./editor.mjs");
  assert.deepEqual(zonesOf([["2024-05-01T09:00:00+01:00", 3], ["2024-05-01T09:00:00Z", 1], ["2024-05-01T09:00:00.5-05:30", 1], ["2024-05-01T09:00:00+00:00", 2], ["2024-05-01", 1], ["2024-05-01T09:00:00+24:00", 1]]), [-330, 60]);
  const r = { minInclusive: "2024-05-01T08:00:00" };
  const plain = new RegExp(`^(?:${compileXsdRegex(datePattern("2024-05-01T08:00:00", "")).source})$`, "v");
  const withZ = new RegExp(`^(?:${compileXsdRegex(datePattern("2024-05-01T08:00:00", "", false, false, [60])).source})$`, "v");
  const v = rangeValue(r);
  for (const s of ["2024-05-01T09:00:00+01:00", "2024-05-01T08:59:59+01:00"]) {
    assert.equal(withZ.test(s), v.match(s, "string"), s);
    assert.equal(plain.test(s), false, s);
  }
  assert.ok(sweep(r, { zones: [60, -330] }).compared > 1000);
});
