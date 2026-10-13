import { test } from "node:test";
import assert from "node:assert/strict";
import { USES, classify, compute, dutiesFor, SAMPLE, summaryText, checklistCsv, DATES } from "./calc.mjs";

const use = (id) => USES.find((u) => u.id === id);
const run = (o) => compute({ role: "provider", use: "m-other", gpai: "", exclusive: "", eu: "yes", ...o });

test("every use has a tier and, except the placeholder, an Article reference", () => {
  for (const u of USES.slice(1)) {
    assert.ok(["prohibited", "high", "transparency", "minimal"].includes(u.tier), u.id);
    assert.ok(u.ref, u.id);
  }
  assert.equal(new Set(USES.map((u) => u.id)).size, USES.length);
});

test("Article 5 uses are prohibited and name their paragraph", () => {
  const v = classify({ use: use("p-social-score"), eu: "yes" });
  assert.equal(v.tier, "prohibited");
  assert.equal(v.via, "Art 5(1)(c)");
});

test("Annex III uses are high-risk", () => {
  assert.equal(classify({ use: use("h-credit"), eu: "yes" }).tier, "high");
  assert.equal(classify({ use: use("h-hr-recruit"), eu: "yes" }).via, "Annex III point 4(a)");
});

test("Article 6(3): narrow task without profiling is the exception", () => {
  assert.equal(classify({ use: use("h-hr-recruit"), eu: "yes", narrow: true }).tier, "high-exempt");
});

test("Article 6(3) never applies when the system profiles people", () => {
  const v = classify({ use: use("h-hr-recruit"), eu: "yes", narrow: true, profiling: true });
  assert.equal(v.tier, "high");
  assert.match(v.reason, /always high-risk/);
});

test("biometric uses have no Article 6(3) exception here", () => {
  assert.equal(classify({ use: use("h-bio-id"), eu: "yes", narrow: true }).tier, "high");
});

test("Annex I safety component is high-risk with the 2027 product deadline", () => {
  const v = classify({ use: use("m-other"), eu: "yes", annexI: true });
  assert.equal(v.tier, "high");
  assert.equal(v.via, "Art 6(1), Annex I");
});

test("a prohibited practice stays prohibited even if flagged as a product safety component", () => {
  assert.equal(classify({ use: use("p-manipulation"), eu: "yes", annexI: true }).tier, "prohibited");
});

test("exclusions and no EU link put the system outside the Regulation", () => {
  assert.equal(classify({ use: use("h-credit"), exclusive: { id: "military" }, eu: "yes" }).via, "Art 2(3)");
  assert.equal(classify({ use: use("h-credit"), exclusive: { id: "research" }, eu: "yes" }).via, "Art 2(6)");
  assert.equal(classify({ use: use("h-credit"), exclusive: { id: "personal" }, eu: "yes" }).via, "Art 2(10)");
  assert.equal(classify({ use: use("h-credit"), eu: "no" }).status, "out");
});

test("transparency and minimal uses", () => {
  assert.equal(run({ use: "t-chatbot" }).verdict.tier, "transparency");
  assert.equal(run({ use: "m-other" }).verdict.tier, "minimal");
});

test("provider of a high-risk system gets the full Chapter III set with Articles", () => {
  const r = run({ use: "h-credit" });
  const refs = r.duties.map((d) => d.ref).join(" | ");
  for (const a of ["Art 9", "Art 10", "Art 11", "Art 12", "Art 13", "Art 14", "Art 15", "Art 17", "Art 43", "Art 49", "Art 72"]) assert.ok(refs.includes(a), a);
  assert.ok(r.duties.every((d) => d.ref && d.due));
});

test("deployer gets Article 26 and 27 duties, not the provider set", () => {
  const r = run({ role: "deployer", use: "h-credit" });
  const refs = r.duties.map((d) => d.ref).join(" | ");
  assert.ok(refs.includes("Art 26"));
  assert.ok(refs.includes("Art 27"));
  assert.ok(!refs.includes("Art 43"));
});

test("importer and distributor get their own duty", () => {
  assert.match(run({ role: "importer", use: "h-credit" }).duties[0].ref, /Art 23/);
  assert.match(run({ role: "distributor", use: "h-credit" }).duties[0].ref, /Art 24/);
});

test("chatbot provider must disclose AI interaction; generator provider must mark output", () => {
  assert.ok(run({ use: "t-chatbot" }).duties.some((d) => d.ref === "Art 50(1)"));
  assert.ok(run({ use: "t-generate" }).duties.some((d) => d.ref === "Art 50(2)"));
  assert.ok(run({ role: "deployer", use: "t-deepfake" }).duties.some((d) => d.ref === "Art 50(4)"));
});

test("prohibited gets only the stop duty", () => {
  const r = run({ use: "p-social-score" });
  assert.equal(r.duties.length, 1);
  assert.equal(r.duties[0].ref, "Art 5");
  assert.ok(r.findings.some((f) => /35 million/.test(f.title)));
});

test("general-purpose model adds Article 53, and systemic risk adds Article 55", () => {
  const plain = run({ use: "m-other", gpai: "gpai" }).duties.map((d) => d.ref).join("|");
  assert.ok(plain.includes("Art 53(1)(a)"));
  assert.ok(!plain.includes("Art 55"));
  assert.ok(run({ use: "m-other", gpai: "gpai-systemic" }).duties.map((d) => d.ref).join("|").includes("Art 55"));
});

test("a general-purpose model provider with no system use is accepted", () => {
  const r = run({ use: "", gpai: "gpai" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.verdict.tier, "gpai-only");
  assert.ok(r.duties.length >= 4);
});

test("bad input is rejected, not guessed", () => {
  assert.ok(compute({ role: "", use: "m-other" }).errors.length);
  assert.ok(compute({ role: "provider", use: "", gpai: "" }).errors.length);
  assert.ok(compute({ role: "provider", use: "m-other", eu: "maybe" }).errors.length);
});

test("unsure about the EU link is flagged", () => {
  assert.ok(run({ eu: "unsure" }).findings.some((f) => /unsure on the EU link/.test(f.title)));
});

test("dates are chronological and the omnibus caveat is always shown", () => {
  const ds = DATES.map((d) => d.date);
  assert.deepEqual([...ds].sort(), ds);
  assert.ok(run({}).findings.some((f) => /Digital Omnibus/.test(f.title)));
});

test("sample runs, summary names the Article, and the CSV quotes cleanly", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.match(summaryText(r), /Annex III point 4\(a\)/);
  const csv = checklistCsv(r).split("\n");
  assert.equal(csv[0], "duty,article,applies_from,applies_to,owner,status,evidence");
  assert.equal(csv.length, r.duties.length + 1);
  assert.ok(csv.slice(1).every((l) => l.startsWith('"')));
});

test("dutiesFor with no tier and no model returns nothing", () => {
  assert.deepEqual(dutiesFor(null, { id: "provider" }, "", null), []);
});
