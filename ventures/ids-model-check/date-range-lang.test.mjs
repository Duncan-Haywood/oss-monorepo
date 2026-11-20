// Date ranges read as string languages (pattern-lang.mjs dateRangePatterns):
// the language must pass exactly the strings ids.mjs passes, so a revision
// diff can grade a date range against a pattern, a list or another range.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIds } from "./ids.mjs";
import { restrictionLanguage, languageWithin, compareLanguages } from "./pattern-lang.mjs";
import { compareValuesDetail } from "./revision.mjs";
import { temporalKey } from "./temporal.mjs";

const NS = "http://standards.buildingsmart.org/IDS";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const val = (inner) => parseIds(`<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="v" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name><value>${inner}</value></attribute></requirements></specification></specifications></ids>`).specs[0].requirements[0].value;
const range = (bounds, base = "xs:date", extra = "") => val(`<xs:restriction base="${base}">${extra}${Object.entries(bounds).map(([k, v]) => `<xs:${k} value="${esc(v)}"/>`).join("")}</xs:restriction>`);
const pat = (p) => val(`<xs:restriction base="xs:string"><xs:pattern value="${esc(p)}"/></xs:restriction>`);
const enumv = (...vs) => val(`<xs:restriction base="xs:date">${vs.map((v) => `<xs:enumeration value="${esc(v)}"/>`).join("")}</xs:restriction>`);
const simple = (s) => val(`<simpleValue>${esc(s)}</simpleValue>`);
const accepts = (L, s) => languageWithin(restrictionLanguage(simple(s)), L).within;

// Strings near the bounds: every zone sign, the calendar's edges, malformed forms.
function candidates(days) {
  const zones = ["", "Z", "+00:00", "-00:00", "+00:01", "-00:01", "+01:00", "-05:00", "+14:00", "-12:00", "+23:59", "-23:59", "+24:00", "+10:60", "+1:00"];
  const out = ["", "x", "2024", "2024-1-01", "12024-01-01", "-2024-01-01", "2024-01-01T00:00:00", "2024-02-30", "2023-02-29", "2024-02-29", "1900-02-29", "2000-02-29", "2024-04-31", "2024-13-01", "2024-00-10", "2024-01-00", "2024-01-32", " 2024-03-01 ", "\t2024-03-01\n", " 2024-03-01", "2024-03-01 Z", "٢٠٢٤-03-01"];
  for (const d of days) {
    const t = Date.parse(d + "T00:00:00Z");
    for (const k of [-2, -1, 0, 1, 2]) {
      const day = new Date(t + k * 864e5).toISOString().slice(0, 10);
      for (const z of zones) out.push(day + z);
    }
  }
  return out;
}

const CASES = [
  { minInclusive: "2024-01-01" },
  { minExclusive: "2024-01-01" },
  { maxInclusive: "2024-02-29" },
  { maxExclusive: "2024-03-01" },
  { minInclusive: "2024-01-01", maxInclusive: "2024-12-31" },
  { minExclusive: "2023-12-31", maxExclusive: "2025-01-01" },
  { minInclusive: "1999-12-31", maxExclusive: "2000-03-01" },
  { minInclusive: "2024-03-01", maxInclusive: "2024-03-01" },
  { minExclusive: "2024-03-01", maxExclusive: "2024-03-02" },
  { minInclusive: "2024-03-02", maxInclusive: "2024-03-01" },
  { minInclusive: "0000-01-01" },
  { maxInclusive: "9999-12-31" },
  { minInclusive: "2024-02-30" },
];

test("a date range's language passes exactly what ids.mjs passes", () => {
  let checked = 0;
  for (const b of CASES) {
    const v = range(b);
    const L = restrictionLanguage(v);
    assert.ok(L, JSON.stringify(b));
    const days = Object.values(b).filter((x) => !Number.isNaN(Date.parse(x + "T00:00:00Z")));
    for (const s of candidates(days.length ? days : ["2024-01-01"])) {
      assert.equal(accepts(L, s), v.match(s, "string"), `${JSON.stringify(b)} on ${JSON.stringify(s)}`);
      checked++;
    }
  }
  assert.ok(checked > 1500, String(checked));
});

test("random days and zones agree with ids.mjs", () => {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  const p2 = (n) => String(n).padStart(2, "0");
  for (let i = 0; i < 40; i++) {
    const day = () => `${String(rnd(10000)).padStart(4, "0")}-${p2(1 + rnd(12))}-${p2(1 + rnd(28))}`;
    const [a, c] = [day(), day()].sort();
    const b = { [rnd(2) ? "minInclusive" : "minExclusive"]: a, [rnd(2) ? "maxInclusive" : "maxExclusive"]: c };
    const v = range(b), L = restrictionLanguage(v);
    for (let j = 0; j < 60; j++) {
      const s = `${String(rnd(10000)).padStart(4, "0")}-${p2(rnd(14))}-${p2(rnd(33))}${["", "Z", `+${p2(rnd(25))}:${p2(rnd(61))}`, `-${p2(rnd(25))}:${p2(rnd(61))}`][rnd(4)]}`;
      assert.equal(accepts(L, s), v.match(s, "string"), `${JSON.stringify(b)} on ${s}`);
    }
    for (const s of [a, c]) assert.equal(accepts(L, s), v.match(s, "string"));
  }
});

test("a day the month lacks passes no range (XSD: not a date)", () => {
  assert.ok(Number.isNaN(temporalKey("2023-02-29")));
  assert.ok(Number.isNaN(temporalKey("2024-04-31T10:00:00")));
  assert.ok(!Number.isNaN(temporalKey("2024-02-29")));
  assert.equal(range({ minInclusive: "2024-05-01" }).match("2024-04-31", "string"), false);
  assert.equal(range({ maxInclusive: "2024-03-31" }).match("2023-02-29", "string"), false);
  // Only XML whitespace is collapsed; a no-break space is part of the value.
  assert.equal(range({ minInclusive: "2024-01-01" }).match(" 2024-03-01\n", "string"), true);
  assert.equal(range({ minInclusive: "2024-01-01" }).match(" 2024-03-01", "string"), false);
});

test("revision diff: date range against a pattern, a list and another range", () => {
  // The pattern a BIM manager writes for "in 2024" against the range it replaced.
  let r = compareValuesDetail(range({ minInclusive: "2024-01-01", maxInclusive: "2024-12-31" }), pat("2024-[0-9]{2}-[0-9]{2}"));
  assert.equal(r.effect, "changed");
  assert.ok(r.nowFails && /[+-]|Z/.test(r.nowFails), r.nowFails); // a zoned date the pattern drops
  assert.ok(r.nowPasses && !range({ minInclusive: "2024-01-01" }).match(r.nowPasses, "string"), r.nowPasses); // e.g. 2024-02-30
  // A pattern inside the year, with real days only, asks more than the year's range.
  r = compareValuesDetail(range({ minInclusive: "2024-01-01", maxInclusive: "2024-12-31" }), pat("2024-0[1-6]-(0[1-9]|1[0-9]|2[0-8])"));
  assert.equal(r.effect, "tighter");
  assert.ok(r.nowFails);
  // Narrowing a range: tighter, with a day that used to pass.
  r = compareValuesDetail(range({ minInclusive: "2024-01-01" }), range({ minInclusive: "2024-06-01" }));
  assert.equal(r.effect, "tighter");
  assert.ok(range({ minInclusive: "2024-01-01" }).match(r.nowFails, "string") && !range({ minInclusive: "2024-06-01" }).match(r.nowFails, "string"));
  // Inclusive to exclusive on the next day is not the same: ids.mjs compares
  // instants: 29 February a minute west of UTC (00:01Z) is under 1 March but
  // past midnight on the 29th, and 1 March an hour east is 23:00Z on the 29th.
  r = compareValuesDetail(range({ maxInclusive: "2024-02-29" }), range({ maxExclusive: "2024-03-01" }));
  assert.equal(r.effect, "looser");
  assert.match(r.nowPasses, /^2024-0(2-29-|3-01\+)/);
  assert.ok(range({ maxExclusive: "2024-03-01" }).match(r.nowPasses, "string") && !range({ maxInclusive: "2024-02-29" }).match(r.nowPasses, "string"));
  // Widened to the end of the year: looser.
  assert.equal(compareValuesDetail(range({ maxInclusive: "2024-06-30" }), range({ maxInclusive: "2024-12-31" })).effect, "looser");
  // A list of days inside the range asks more; one outside it changes the ask.
  assert.equal(compareValuesDetail(range({ minInclusive: "2024-01-01" }), enumv("2024-03-01", "2024-04-01")).effect, "tighter");
  assert.equal(compareValuesDetail(range({ minInclusive: "2024-01-01" }), enumv("2023-03-01")).effect, "changed");
  assert.equal(compareLanguages(range({ minInclusive: "2024-01-01" }), range({ minInclusive: "2024-01-01" }, "xs:string")).effect, "same");
});

test("bounds that are not plain dates stay out of the language reading", () => {
  assert.equal(restrictionLanguage(range({ minInclusive: "2024-01-01Z" })), null);
  assert.equal(restrictionLanguage(range({ minInclusive: "2024-01-01T00:00:00" }, "xs:dateTime")), null);
  assert.equal(restrictionLanguage(range({ maxInclusive: "PT5M" }, "xs:duration")), null);
  assert.equal(restrictionLanguage(range({ minInclusive: "5" }, "xs:double")), null);
});

test("revision diff: dateTime, time and duration ranges compare as intervals", () => {
  const dt = (b) => range(b, "xs:dateTime");
  assert.equal(compareValuesDetail(dt({ minInclusive: "2024-01-01T00:00:00" }), dt({ minInclusive: "2024-01-01T08:00:00" })).effect, "tighter");
  assert.equal(compareValuesDetail(dt({ minInclusive: "2024-01-01T08:00:00+08:00" }), dt({ minInclusive: "2024-01-01T00:00:00Z" })).effect, "same");
  assert.equal(compareValuesDetail(range({ maxExclusive: "PT30M" }, "xs:duration"), range({ maxExclusive: "PT1H" }, "xs:duration")).effect, "looser");
  assert.equal(compareValuesDetail(range({ minInclusive: "07:00:00", maxInclusive: "19:00:00" }, "xs:time"), range({ minInclusive: "08:00:00", maxInclusive: "18:00:00" }, "xs:time")).effect, "tighter");
  // A date range to a dateTime range: no value passes both forms.
  assert.equal(compareValuesDetail(range({ minInclusive: "2024-01-01Z" }), dt({ minInclusive: "2024-01-01T00:00:00Z" })).effect, "changed");
});
