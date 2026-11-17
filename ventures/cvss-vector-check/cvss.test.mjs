import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseVector, explain, scoreMetrics, roundup31, roundup30, roundup30Naive, severity, diffVectors, sensitivity, audit, auditCsv, analyze, canonicalVector, EXAMPLE } from "./cvss.mjs";

const fixture = (v) => JSON.parse(readFileSync(new URL(`./oracle/fixture-${v}.json`, import.meta.url), "utf8"));

for (const v of ["3.1", "3.0"]) {
  test(`every CVSS ${v} score in the oracle fixture matches (Red Hat cvss package)`, () => {
    const { rows, oracle } = fixture(v);
    assert.ok(rows.length >= 3000, oracle);
    for (const [vec, b, t, e] of rows) {
      const s = explain(vec).scores;
      assert.deepEqual([s.base, s.temporal, s.environmental], [b, t, e], vec);
    }
  });
}

test("well-known base scores", () => {
  assert.equal(explain("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H").scores.base, 9.8);
  assert.equal(explain("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H").scores.base, 10);
  assert.equal(explain("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N").scores.base, 0);
  assert.equal(explain("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N").scores.baseSeverity, "None");
});

test("Roundup: v3.1 integer form, v3.0 exact, and the naive v3.0 ceiling", () => {
  assert.equal(roundup31(4.02), 4.1);
  assert.equal(roundup31(4.0), 4.0);
  assert.equal(roundup31(4.000000000000001), 4.0);
  assert.equal(roundup30(5.0 * 0.92), 4.6);
  assert.equal(roundup30Naive(5.0 * 0.92), 4.7);
  assert.equal(roundup30(4.61), 4.7);
});

test("severity bands", () => {
  assert.deepEqual([0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10].map(severity), ["None", "Low", "Low", "Medium", "Medium", "High", "High", "Critical", "Critical"]);
});

test("parse errors are specific and never throw", () => {
  const cases = [
    ["", /Empty/],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H", /Missing base metric: A/],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/AV:L", /AV appears twice/],
    ["CVSS:3.1/AV:Q/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", /AV:Q is not allowed/],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/ZZ:1", /not a CVSS v3 metric/],
    ["CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N", /CVSS 4\.0 is not scored/],
    ["AV:N/AC:L/Au:N/C:P/I:P/A:P", /CVSS v2/],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/", /Empty field/],
    // Inherited Object keys must not read as metrics or values.
    ["CVSS:3.1/constructor:x/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", /not a CVSS v3 metric/],
    ["CVSS:3.1/AV:toString/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", /AV:toString is not allowed/],
  ];
  for (const [v, re] of cases) {
    const p = parseVector(v);
    assert.equal(p.valid, false, v);
    assert.match(p.errors.join(" "), re, v);
  }
  for (const junk of [null, undefined, 42, "////", "CVSS:3.1", ":::"]) assert.doesNotThrow(() => explain(junk));
});

test("findings: no prefix, out of order, explicit X", () => {
  const a = explain("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
  assert.equal(a.valid, true);
  assert.ok(a.findings.some((f) => f.code === "no-prefix"));
  const b = explain("CVSS:3.1/AC:L/AV:N/PR:N/UI:N/S:U/C:H/I:H/A:H/E:X");
  assert.ok(b.findings.some((f) => f.code === "order"));
  assert.ok(b.findings.some((f) => f.code === "explicit-x"));
  assert.equal(b.vector, "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
});

test("version difference is reported for a changed modified scope", () => {
  // Found in the 200,000-vector sample: 6.9 under v3.0, 7.0 under v3.1 (a severity band apart).
  const v = "CVSS:3.1/AV:P/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:N/RC:U/CR:H/IR:M/AR:H/MAV:L/MAC:H/MUI:N/MS:C/MA:H";
  const x = explain(v);
  assert.equal(x.scores.environmental, 7);
  assert.equal(x.otherVersion.environmental, 6.9);
  assert.ok(x.findings.some((f) => f.code === "version-diff" && /Modified Impact/.test(f.message)));
});

test("diff names each differing metric and its effect alone", () => {
  const d = diffVectors(EXAMPLE.vector, EXAMPLE.compare);
  assert.equal(d.valid, true);
  assert.equal(d.a.scores.base, 9.8);
  assert.equal(d.b.scores.base, 7.5);
  assert.deepEqual(d.differences.map((x) => x.metric).sort(), ["AC", "UI"]);
  for (const x of d.differences) assert.ok(x.baseDelta < 0);
  assert.equal(d.baseDelta, -2.3);
  assert.ok(d.notes.some((n) => /interact/.test(n)));
  assert.equal(diffVectors(EXAMPLE.vector, EXAMPLE.vector).same, true);
  assert.equal(diffVectors("nope", EXAMPLE.vector).valid, false);
});

test("sensitivity lists every alternative base value", () => {
  const s = sensitivity(EXAMPLE.vector);
  // (4-1)+(2-1)+(3-1)+(2-1)+(2-1)+3*(3-1) = 14 alternatives
  assert.equal(s.rows.length, 14);
  const av = s.rows.find((r) => r.metric === "AV" && r.to === "P");
  assert.equal(av.base, scoreMetrics({ ...parseVector(EXAMPLE.vector).metrics, AV: "P" }).base);
  assert.ok(s.rows.some((r) => r.crossesBand));
});

test("audit of the example CSV finds the planted problems", () => {
  const r = audit(EXAMPLE.text);
  assert.equal(r.format, "text");
  assert.equal(r.totals.vectors, 5);
  const by = Object.fromEntries(r.rows.map((x) => [x.where, x]));
  assert.equal(by["line 2"].status, "ok");
  assert.equal(by["line 3"].status, "ok"); // 6.4 is right for this changed-scope vector
  assert.equal(by["line 4"].status, "mismatch"); // 7.8 is High, labelled Medium
  assert.match(by["line 4"].problems.join(" "), /Labelled Medium, but a score of 7\.8 is High/);
  assert.equal(by["line 5"].status, "explained"); // 8.8 is the temporal score
  assert.match(by["line 5"].problems.join(" "), /temporal score/);
  assert.equal(by["line 6"].status, "mismatch"); // AC:H gives 5.9, not 7.5
});

test("audit reads NVD-style JSON and OSV-style JSON", () => {
  const nvd = JSON.stringify({ vulnerabilities: [{ cve: { id: "CVE-0000-0001", metrics: { cvssMetricV31: [{ cvssData: { version: "3.1", vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", baseScore: 9.8, baseSeverity: "CRITICAL" } }] } } }] });
  const r = audit(nvd);
  assert.equal(r.format, "json");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].status, "ok");
  assert.equal(r.rows[0].stated, 9.8);
  assert.equal(r.rows[0].statedSeverity, "Critical");
  const osv = JSON.stringify({ id: "X", severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N" }] });
  const o = audit(osv);
  assert.equal(o.rows.length, 1);
  assert.equal(o.rows[0].stated, null);
  assert.equal(o.rows[0].base, 9.1);
});

test("audit does not take metric letters or version numbers as the stated score", () => {
  const r = audit("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H (v3.1.2)");
  assert.equal(r.rows[0].stated, null);
  const two = audit("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H 9.8 | CVSS:3.0/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H 7.8");
  assert.deepEqual(two.rows.map((x) => x.stated), [9.8, 7.8]);
  assert.deepEqual(two.rows.map((x) => x.status), ["ok", "ok"]);
});

test("audit explains a v3.0 temporal score from a floating-point Roundup", () => {
  const r = audit("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H/RC:U 9.3");
  assert.equal(r.rows[0].temporal, 9.2);
  assert.equal(r.rows[0].base, 10);
  // 9.3 is neither the base nor the exact temporal score, but it is the naive ceiling of 10 * 0.92.
  assert.equal(r.rows[0].status, "explained");
  assert.match(r.rows[0].problems.join(" "), /floating-point Math\.ceil Roundup gives \(exact: 9\.2\)/);
  const t = audit("CVSS:3.0/AV:A/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:L/E:H/RC:U 4.7");
  assert.equal(t.rows[0].base, 5);
  assert.equal(t.rows[0].status, "explained");
  assert.equal(audit("CVSS:3.0/AV:A/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:L/E:H/RC:U 4.8").rows[0].status, "mismatch");
});

test("CSV neutralises formula characters", () => {
  const csv = auditCsv({ rows: [{ where: "=cmd", vector: "v", problems: ["+x"], status: "ok" }] });
  assert.match(csv, /'=cmd/);
  assert.match(csv, /'\+x/);
  assert.equal(auditCsv(audit(EXAMPLE.text)).trim().split("\n").length, 6);
});

test("analyze bundles explain, sensitivity, diff and audit", () => {
  const r = analyze(EXAMPLE);
  assert.equal(r.explain.scores.base, 9.8);
  assert.equal(r.diff.b.scores.base, 7.5);
  assert.equal(r.audit.totals.vectors, 5);
  assert.deepEqual(analyze({}), {});
  assert.equal(canonicalVector(parseVector("CVSS:3.0/A:H/I:H/C:H/S:U/UI:N/PR:N/AC:L/AV:N")), "CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
});
