import { test } from "node:test";
import assert from "node:assert/strict";
import { q } from "./csvq.mjs";
import { contractors1099Csv, nec1099FilingCsv } from "./taxforms.mjs";

test("q puts an apostrophe before a leading formula character, then quotes as usual", () => {
  assert.equal(q("=HYPERLINK(\"http://x\",\"a\")"), `"'=HYPERLINK(""http://x"",""a"")"`);
  for (const lead of ["=", "+", "-", "@", "\t", "\r"]) assert.ok(q(lead + "cmd").replace(/^"/, "").startsWith("'" + lead));
  assert.equal(q("Acme, LLC"), '"Acme, LLC"');
  assert.equal(q("Plain Name"), "Plain Name");
  assert.equal(q(null), "");
});

test("1099 CSVs defuse a payee name copied from a bank file", () => {
  const p = { name: "=cmd|' /C calc'!A0", cents: 100000, count: 2, cardCents: 0, over: true, w9: false };
  const a = contractors1099Csv({ payees: [p] }).split("\n")[1];
  assert.ok(a.startsWith("\"'=cmd") || a.startsWith("'=cmd"), a);
  const b = nec1099FilingCsv({ year: 2026, reportable: [p] }).split("\n")[1];
  assert.ok(b.includes(",'=cmd") || b.includes(",\"'=cmd"), b);
});
