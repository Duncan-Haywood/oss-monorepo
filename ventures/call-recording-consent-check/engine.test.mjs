import test from "node:test";
import assert from "node:assert/strict";
import {
  listStates,
  normalizeState,
  getRule,
  assessCall,
  disclosureScript,
  FEDERAL_CITATION,
  INTERSTATE_PRECEDENT,
} from "./engine.mjs";

test("listStates returns exactly 51 jurisdictions (50 states + DC)", () => {
  const states = listStates();
  assert.equal(states.length, 51);
  assert.ok(states.includes("California"));
  assert.ok(states.includes("District of Columbia"));
});

test("every jurisdiction has a valid type and, if all-party, a statute", () => {
  for (const name of listStates()) {
    const rule = getRule(name);
    assert.ok(["one-party", "all-party"].includes(rule.type), `${name} has an invalid type`);
    if (rule.type === "all-party") {
      assert.ok(rule.statute && rule.statute.length > 0, `${name} is all-party but has no statute citation`);
    }
  }
});

test("normalizeState accepts full names, abbreviations, and is case-insensitive", () => {
  assert.equal(normalizeState("California"), "California");
  assert.equal(normalizeState("california"), "California");
  assert.equal(normalizeState("CA"), "California");
  assert.equal(normalizeState("ca"), "California");
  assert.equal(normalizeState("  Texas  "), "Texas");
  assert.equal(normalizeState("dc"), "District of Columbia");
});

test("normalizeState rejects unrecognized input", () => {
  assert.throws(() => normalizeState("Ontario"), /Unrecognized/);
  assert.throws(() => normalizeState(""), /Expected a US state/);
  assert.throws(() => normalizeState("Puerto Rico"), /Unrecognized/);
});

// The 14 jurisdictions this table classifies as all-party, spelled out so a
// future edit that silently drops or adds one is caught by name rather than
// only by a changed count.
const EXPECTED_ALL_PARTY = [
  "California", "Connecticut", "Delaware", "Florida", "Illinois", "Maryland",
  "Massachusetts", "Michigan", "Montana", "Nevada", "New Hampshire", "Oregon",
  "Pennsylvania", "Washington",
].sort();

test("exactly the expected 14 states are classified all-party; every other jurisdiction is one-party", () => {
  const allParty = listStates().filter((s) => getRule(s).type === "all-party").sort();
  assert.deepEqual(allParty, EXPECTED_ALL_PARTY);
  assert.equal(listStates().length - allParty.length, 37); // 36 one-party states + DC
});

test("getRule is case/abbreviation-insensitive the same way normalizeState is", () => {
  assert.equal(getRule("ca").state, "California");
  assert.equal(getRule("ca").type, "all-party");
  assert.equal(getRule("tx").type, "one-party");
});

test("assessCall: same one-party state on both ends", () => {
  const result = assessCall("Texas", "Texas");
  assert.equal(result.interstate, false);
  assert.equal(result.requirement, "one-party");
  assert.match(result.reason, /Texas/);
});

test("assessCall: same all-party state on both ends", () => {
  const result = assessCall("California", "California");
  assert.equal(result.interstate, false);
  assert.equal(result.requirement, "all-party");
});

test("assessCall: interstate, one side all-party -> conservative all-party requirement, names the stricter state", () => {
  const result = assessCall("Texas", "California");
  assert.equal(result.interstate, true);
  assert.equal(result.requirement, "all-party");
  assert.match(result.reason, /California/);
  assert.match(result.reason, /Kearney|precedent/i);
});

test("assessCall is symmetric in which side is the caller for the all-party trigger", () => {
  const a = assessCall("California", "Texas");
  const b = assessCall("Texas", "California");
  assert.equal(a.requirement, "all-party");
  assert.equal(b.requirement, "all-party");
});

test("assessCall: interstate, both one-party -> one-party requirement", () => {
  const result = assessCall("Texas", "New York");
  assert.equal(result.interstate, true);
  assert.equal(result.requirement, "one-party");
});

test("assessCall throws on an invalid state on either side", () => {
  assert.throws(() => assessCall("Nowhereland", "Texas"), /Unrecognized/);
  assert.throws(() => assessCall("Texas", "Nowhereland"), /Unrecognized/);
});

test("disclosureScript for all-party requests an explicit verbal yes", () => {
  const script = disclosureScript("all-party", { company: "Acme Inc.", purpose: "training purposes" });
  assert.match(script, /Acme Inc\./);
  assert.match(script, /training purposes/);
  assert.match(script, /consent/i);
  assert.match(script, /yes/i);
});

test("disclosureScript for one-party is a shorter courtesy notice, not a consent request", () => {
  const script = disclosureScript("one-party");
  assert.match(script, /may be recorded/i);
  assert.doesNotMatch(script, /Do you consent/i);
});

test("disclosureScript falls back to placeholders for blank company/purpose", () => {
  const script = disclosureScript("all-party", { company: "   ", purpose: "" });
  assert.match(script, /\[Your Company\]/);
  assert.match(script, /quality and training purposes/);
});

test("FEDERAL_CITATION and INTERSTATE_PRECEDENT are non-empty, cited strings", () => {
  assert.match(FEDERAL_CITATION, /18 U\.S\.C\. § 2511/);
  assert.match(INTERSTATE_PRECEDENT, /Kearney/);
});

test("Vermont is classified one-party with its structural-exception note present", () => {
  const rule = getRule("Vermont");
  assert.equal(rule.type, "one-party");
  assert.match(rule.note, /no wiretap statute/i);
});

test("Nevada and Michigan carry their ambiguity notes (statute text vs. how it is applied)", () => {
  assert.match(getRule("Nevada").note, /Lane v\. Allstate/);
  assert.match(getRule("Michigan").note, /least certain/i);
});
