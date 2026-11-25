import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { L1_REQUIREMENTS, DOMAINS } from "./l1-data.mjs";
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

test("CSV: header block, 15 rows, notes kept, formula injection neutralised", () => {
  const a = allMet();
  a["PE.L1-b.1.ix"] = "not_met";
  const csv = l1ToCsv(a, { "AC.L1-b.1.i": "=HYPERLINK(\"x\")", "IA.L1-b.1.v": "Named accounts, see list" }, { org: "Acme, Inc.", cage: "1ABC2", date: "2026-11-25", scope: "Office PCs" });
  assert.match(csv, /^CMMC Level 1 self-check worksheet \(not an SPRS submission\)\n/);
  assert.match(csv, /\nOrganization,"Acme, Inc."\n/);
  assert.match(csv, /Next annual self-assessment and affirmation due,2027-11-25/);
  assert.match(csv, /1 not met: Level 1 cannot be claimed until fixed/);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /Named accounts, see list/);
  const rows = csv.trim().split("\n").filter((l) => /^(AC|IA|MP|PE|SC|SI)\.L1/.test(l));
  assert.equal(rows.length, 15);
  assert.match(rows[8], /,Not met,/);
});
