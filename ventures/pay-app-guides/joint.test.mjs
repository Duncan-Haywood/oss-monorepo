import { test } from "node:test";
import assert from "node:assert/strict";
import * as J from "./joint.mjs";
import { splitJointCheck, splitLetter, stateNotes, STATES, GROUPS, AGREEMENT_ITEMS } from "./joint.mjs";

test("one supplier owed less than the check: supplier gets what it is owed, sub keeps the rest", () => {
  const r = splitJointCheck({ check: 48000, suppliers: [{ name: "Acme Electric Supply", owed: 18250 }], writtenSplit: true });
  assert.equal(r.ok, true);
  assert.equal(r.supplierTotal, 18250);
  assert.equal(r.toSub, 29750);
  assert.equal(r.suppliers[0].unpaidAfter, 0);
  assert.equal(r.suppliers[0].atRisk, 0);
  assert.deepEqual(r.flags, []);
});

test("no written split: the supplier's risk is what it was owed up to the check, less what it actually gets", () => {
  // Agreed share $5,000 of $18,250 owed on a $48,000 check, nothing in writing:
  // endorsing can count as payment of $18,250, so $13,250 is at risk.
  const r = splitJointCheck({ check: 48000, suppliers: [{ name: "Acme", owed: 18250, agreed: 5000 }], writtenSplit: false });
  assert.equal(r.suppliers[0].share, 5000);
  assert.equal(r.suppliers[0].unpaidAfter, 13250);
  assert.equal(r.suppliers[0].atRisk, 13250);
  assert.equal(r.toSub, 43000);
  assert.ok(r.flags.some((f) => /do not endorse/.test(f)));
  assert.ok(r.flags.some((f) => /stays owed/.test(f)));
  // The same split in writing: nothing at risk, the shortfall is still owed.
  const w = splitJointCheck({ check: 48000, suppliers: [{ name: "Acme", owed: 18250, agreed: 5000 }], writtenSplit: true });
  assert.equal(w.suppliers[0].atRisk, 0);
  assert.equal(w.suppliers[0].unpaidAfter, 13250);
});

test("deemed payment is capped at the check amount", () => {
  const r = splitJointCheck({ check: 10000, suppliers: [{ name: "A", owed: 25000, agreed: 4000 }] });
  assert.equal(r.suppliers[0].atRisk, 6000); // min(25,000, 10,000) - 4,000
});

test("suppliers owed more than the check are paid pro rata, to the cent, summing to the check", () => {
  const r = splitJointCheck({ check: 10000, suppliers: [{ name: "A", owed: 10000 }, { name: "B", owed: 5000 }, { name: "C", owed: 5000 }] });
  assert.equal(r.prorated, true);
  assert.deepEqual(r.suppliers.map((s) => s.share), [5000, 2500, 2500]);
  assert.equal(r.toSub, 0);
  assert.equal(r.supplierTotal, 10000);
  assert.deepEqual(r.suppliers.map((s) => s.unpaidAfter), [5000, 2500, 2500]);
  const odd = splitJointCheck({ check: 100, suppliers: [{ name: "A", owed: 100 }, { name: "B", owed: 100 }, { name: "C", owed: 100 }] });
  assert.equal(odd.suppliers.reduce((a, s) => a + s.share, 0).toFixed(2), "100.00");
  assert.deepEqual(odd.suppliers.map((s) => s.share), [33.33, 33.33, 33.34]);
});

test("written shares over the check are an error to fix, not prorated", () => {
  const r = splitJointCheck({ check: 1000, suppliers: [{ name: "A", owed: 900, agreed: 700 }, { name: "B", owed: 500, agreed: 500 }], writtenSplit: true });
  assert.equal(r.prorated, false);
  assert.ok(r.flags.some((f) => /Fix the written split/.test(f)));
  assert.equal(r.toSub, 0);
});

test("bad input is reported, not computed", () => {
  assert.equal(splitJointCheck({ check: 0, suppliers: [{ name: "A", owed: 1 }] }).ok, false);
  assert.equal(splitJointCheck({ check: 100, suppliers: [] }).ok, false);
  const r = splitJointCheck({ check: "1,000", suppliers: [{ name: "A", owed: "abc" }] });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /A: enter what is owed/);
  assert.equal(splitJointCheck({ check: "$1,000", suppliers: [{ name: "A", owed: "250" }] }).toSub, 750);
});

test("agreement checklist lists what is missing", () => {
  const r = splitJointCheck({ check: 100, suppliers: [{ name: "A", owed: 10 }], agreementHas: AGREEMENT_ITEMS.map(([k]) => k).filter((k) => k !== "and_payee") });
  assert.equal(r.missing.length, 1);
  assert.match(r.missing[0], /AND supplier/);
  assert.equal(splitJointCheck({ check: 100, suppliers: [{ name: "A", owed: 10 }] }).missing.length, AGREEMENT_ITEMS.length);
});

test("state notes follow the handout's groups; Miller Act and unnamed states have their own notes", () => {
  assert.deepEqual(stateNotes("California"), [GROUPS.rule_both.label, GROUPS.waiver_yes.label]);
  assert.deepEqual(stateNotes("Maryland"), [GROUPS.surety_no.label, GROUPS.waiver_void.label]);
  assert.match(stateNotes("federal")[0], /Miller Act/);
  assert.match(stateNotes("Vermont")[0], /does not name this state/);
  assert.ok(STATES.includes("Texas") && !STATES.includes("Vermont"));
  assert.equal(STATES.length, new Set(STATES).size);
});

test("split letter names every payee, every share and the sub's remainder", () => {
  const r = splitJointCheck({ check: 48000, suppliers: [{ name: "Acme", owed: 18250 }, { name: "Bolt Rentals", owed: 2400 }] });
  const t = splitLetter(r, { project: "Elm St Clinic", payer: "Hill GC", sub: "Spark Electric", checkNo: "1042" });
  assert.match(t, /Check 1042 from Hill GC, payable to Spark Electric and Acme and Bolt Rentals: \$48,000\.00/);
  assert.match(t, /Acme: \$18,250\.00/);
  assert.match(t, /Bolt Rentals: \$2,400\.00/);
  assert.match(t, /Spark Electric: \$27,350\.00/);
  assert.match(t, /Endorsement is payment only of the share above/);
  assert.equal(splitLetter({ ok: false }), "");
});

test("supplier lines: thousands commas, names with commas, optional share, tabs", () => {
  const { parseSuppliers } = J;
  assert.deepEqual(parseSuppliers("Acme Electric Supply, 18,250\nAcme, Inc., $2,400, 1,200\nBolt\t500\t\n\n"), [
    { name: "Acme Electric Supply", owed: "18,250", agreed: null },
    { name: "Acme, Inc.", owed: "$2,400", agreed: "1,200" },
    { name: "Bolt", owed: "500", agreed: null },
  ]);
});

test("typed amounts are plain decimals: exponents, hex and junk are errors", () => {
  for (const bad of ["1e4", "0x10", "12abc", "--5"]) assert.equal(splitJointCheck({ check: bad, suppliers: [{ name: "A", owed: 1 }] }).ok, false, bad);
  assert.equal(splitJointCheck({ check: "100", suppliers: [{ name: "A", owed: "1e1" }] }).ok, false);
  assert.equal(splitJointCheck({ check: " $1,000.50 ", suppliers: [{ name: "A", owed: ".5" }] }).toSub, 1000);
});
