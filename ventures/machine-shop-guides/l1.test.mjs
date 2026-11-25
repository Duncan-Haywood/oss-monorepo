import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { L1_REQUIREMENTS, L1_OBJECTIVES, DOMAINS } from "./l1-data.mjs";
import { assessL1, nextAnnualDate, l1ToCsv } from "./l1.mjs";

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
const allMet = () => Object.fromEntries(L1_REQUIREMENTS.map((r) => [r.id, "met"]));

test("15 requirements, (b)(1)(i) to (xv) in order, ids match the FAR paragraph", () => {
  assert.equal(L1_REQUIREMENTS.length, 15);
  L1_REQUIREMENTS.forEach((r, i) => {
    assert.equal(r.far, `(b)(1)(${ROMAN[i]})`);
    assert.match(r.id, new RegExp(`^(AC|IA|MP|PE|SC|SI)\\.L1-b\\.1\\.${ROMAN[i]}$`));
    assert.ok(DOMAINS[r.id.slice(0, 2)]);
    assert.ok(r.text.endsWith("."));
    assert.ok(r.nist.length >= 1);
  });
  assert.equal(new Set(L1_REQUIREMENTS.map((r) => r.id)).size, 15);
});

test("domain split matches the clause: 4 AC, 2 IA, 1 MP, 2 PE, 2 SC, 4 SI", () => {
  const n = {};
  for (const r of L1_REQUIREMENTS) n[r.id.slice(0, 2)] = (n[r.id.slice(0, 2)] || 0) + 1;
  assert.deepEqual(n, { AC: 4, IA: 2, MP: 1, PE: 2, SC: 2, SI: 4 });
});

test("NIST mapping covers 17 Rev. 2 requirements (ix maps to three)", () => {
  assert.equal(L1_REQUIREMENTS.flatMap((r) => r.nist).length, 17);
  assert.deepEqual(L1_REQUIREMENTS[8].nist, ["3.10.3", "3.10.4", "3.10.5"]);
});

test("requirement text is the verbatim clause text (hash pins it against drift)", () => {
  // Hash of the 15 texts joined by newlines, as copied from GSA's FAR source
  // (dita/52.204-21.dita) on 25 Nov 2026. A change here must be re-checked
  // against the official clause, not just re-hashed.
  const h = createHash("sha256").update(L1_REQUIREMENTS.map((r) => r.text).join("\n")).digest("hex");
  assert.equal(h, "ec590bbbf3bec0c3cfed72f8d2ef83a6ec9d9cb6766c603ab3354715b63677d9");
  // Spot checks of the wording most often misquoted.
  assert.match(L1_REQUIREMENTS[14].text, /^Perform periodic scans of the information system and real-time scans of files from external sources/);
  assert.match(L1_REQUIREMENTS[2].text, /control\/limit connections/);
});

test("empty answers are incomplete, not a pass", () => {
  const r = assessL1({});
  assert.equal(r.verdict, "incomplete");
  assert.equal(r.unanswered.length, 15);
  assert.equal(r.allMet, false);
});

test("all 15 met is the only passing verdict", () => {
  const r = assessL1(allMet());
  assert.equal(r.verdict, "all-met");
  assert.equal(r.allMet, true);
  assert.equal(r.met, 15);
});

test("one not met fails, even with others unanswered (no POA&M, no partial credit)", () => {
  const a = allMet();
  a["SI.L1-b.1.xv"] = "not_met";
  const r = assessL1(a);
  assert.equal(r.verdict, "not-met");
  assert.deepEqual(r.notMet, ["SI.L1-b.1.xv"]);
  assert.equal(assessL1({ "AC.L1-b.1.i": "not_met" }).verdict, "not-met");
});

test("unknown status values count as unanswered", () => {
  const a = allMet();
  a["MP.L1-b.1.vii"] = "partial";
  const r = assessL1(a);
  assert.equal(r.verdict, "incomplete");
  assert.deepEqual(r.unanswered, ["MP.L1-b.1.vii"]);
});

test("next annual date: a year on, 29 Feb rolls back, bad input is null", () => {
  assert.equal(nextAnnualDate("2026-11-25"), "2027-11-25");
  assert.equal(nextAnnualDate("2028-02-29"), "2029-02-28");
  assert.equal(nextAnnualDate("2026-02-30"), null);
  assert.equal(nextAnnualDate(""), null);
  assert.equal(nextAnnualDate("25/11/2026"), null);
});

test("CSV: header block, 59 objective rows, notes kept, formula injection neutralised", () => {
  const a = allMet();
  a["PE.L1-b.1.ix"] = "not_met";
  const csv = l1ToCsv(a, { "AC.L1-b.1.i": "=HYPERLINK(\"x\")", "IA.L1-b.1.v": "Named accounts, see list" }, { org: "Acme, Inc.", cage: "1ABC2", date: "2026-11-25", scope: "Office PCs" });
  assert.match(csv, /^CMMC Level 1 self-check worksheet \(not an SPRS submission\)\n/);
  assert.match(csv, /\nOrganization,"Acme, Inc."\n/);
  assert.match(csv, /Next annual self-assessment and affirmation due,2027-11-25/);
  assert.match(csv, /1 not met: Level 1 cannot be claimed until fixed/);
  assert.match(csv, /'=HYPERLINK/);
  // A plain negative number stays a number; every formula lead character is defused.
  const guard = l1ToCsv({}, { "AC.L1-b.1.ii": "-12.50", "AC.L1-b.1.iii": "+cmd", "AC.L1-b.1.iv": "@SUM(A1)", "IA.L1-b.1.v": "-x" });
  assert.match(guard, /,-12\.50\n/);
  for (const bad of ["'+cmd", "'@SUM(A1)", "'-x"]) assert.ok(guard.includes(bad), bad);
  assert.match(csv, /Named accounts, see list/);
  const rows = csv.trim().split("\n").filter((l) => /^(AC|IA|MP|PE|SC|SI)\.L1/.test(l));
  assert.equal(rows.length, 59);
  const ix = rows.filter((l) => l.startsWith("PE.L1-b.1.ix,"));
  assert.equal(ix.length, 6);
  for (const l of ix) assert.match(l, /,Not met,Not met,/);
});

test("Table 2 to 32 CFR 170.15(c)(1)(ii), read from eCFR 25 Nov 2026: all 15 mappings", () => {
  assert.deepEqual(Object.fromEntries(L1_REQUIREMENTS.map((r) => [r.id, r.nist.join(" ")])), {
    "AC.L1-b.1.i": "3.1.1", "AC.L1-b.1.ii": "3.1.2", "AC.L1-b.1.iii": "3.1.20", "AC.L1-b.1.iv": "3.1.22",
    "IA.L1-b.1.v": "3.5.1", "IA.L1-b.1.vi": "3.5.2", "MP.L1-b.1.vii": "3.8.3", "PE.L1-b.1.viii": "3.10.1",
    "PE.L1-b.1.ix": "3.10.3 3.10.4 3.10.5", "SC.L1-b.1.x": "3.13.1", "SC.L1-b.1.xi": "3.13.5",
    "SI.L1-b.1.xii": "3.14.1", "SI.L1-b.1.xiii": "3.14.2", "SI.L1-b.1.xiv": "3.14.4", "SI.L1-b.1.xv": "3.14.5",
  });
});

test("59 NIST SP 800-171A objectives, each under the NIST number its requirement maps to", () => {
  const all = L1_REQUIREMENTS.flatMap((r) => L1_OBJECTIVES[r.id]);
  assert.equal(all.length, 59);
  assert.equal(new Set(all.map((o) => o.id)).size, 59);
  assert.deepEqual(Object.keys(L1_OBJECTIVES), L1_REQUIREMENTS.map((r) => r.id));
  for (const r of L1_REQUIREMENTS) {
    for (const o of L1_OBJECTIVES[r.id]) assert.ok(r.nist.some((n) => o.id === n || o.id.startsWith(n + "[")), o.id);
  }
  assert.deepEqual(L1_REQUIREMENTS.map((r) => L1_OBJECTIVES[r.id].length), [6, 2, 6, 5, 3, 3, 2, 4, 6, 8, 2, 6, 2, 1, 3]);
});

test("objectives read FCI, never CUI (32 CFR 170.15(c)(1)(i)); the five substitutions are flagged", () => {
  const all = Object.values(L1_OBJECTIVES).flat();
  for (const o of all) assert.doesNotMatch(o.text, /\bCUI\b/, o.id);
  assert.deepEqual(all.filter((o) => o.fciSubstituted).map((o) => o.id), ["3.1.22[b]", "3.1.22[d]", "3.1.22[e]", "3.8.3[a]", "3.8.3[b]"]);
});

const allObjectivesMet = () => Object.fromEntries(Object.values(L1_OBJECTIVES).flat().map((o) => [o.id, "met"]));

test("one objective not met fails its requirement and the result", () => {
  const a = allObjectivesMet();
  a["3.10.4"] = "not_met";
  const r = assessL1(a);
  assert.equal(r.verdict, "not-met");
  assert.deepEqual(r.notMet, ["PE.L1-b.1.ix"]);
  assert.deepEqual(r.requirements[8].notMet, ["3.10.4"]);
  assert.equal(r.met, 14);
  assert.equal(r.answered, 59);
});

test("N/A counts as met (32 CFR 170.24(b)(3)); an unanswered objective keeps it incomplete", () => {
  const a = allObjectivesMet();
  a["3.13.5[a]"] = "na"; a["3.13.5[b]"] = "na";
  const r = assessL1(a);
  assert.equal(r.verdict, "all-met");
  assert.equal(r.requirements[10].na, 2);
  delete a["3.14.5[c]"];
  const r2 = assessL1(a);
  assert.equal(r2.verdict, "incomplete");
  assert.deepEqual(r2.unanswered, ["SI.L1-b.1.xv"]);
});

test("an objective's own answer overrides its requirement's answer", () => {
  const a = allMet();
  a["3.1.1[c]"] = "not_met";
  const r = assessL1(a);
  assert.deepEqual(r.notMet, ["AC.L1-b.1.i"]);
  assert.deepEqual(r.requirements[0].notMet, ["3.1.1[c]"]);
});
