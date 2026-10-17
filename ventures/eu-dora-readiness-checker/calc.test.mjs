import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, clocks, scope, addMonths, parseStamp, simplifiedFramework, ENTITIES, FE_DUTIES, CONTRACT_TERMS, SAMPLE, summaryText, checklistCsv } from "./calc.mjs";

const base = { entity: "credit", size: "large", now: "2026-10-13T12:00" };
const ent = (id) => ENTITIES.find((e) => e.id === id);

test("listed financial entities are in scope; others are out", () => {
  assert.equal(compute(base).scope.status, "in");
  assert.equal(compute({ ...base, entity: "other" }).scope.status, "out");
  assert.equal(compute({ ...base, entity: "crowdfunding" }).scope.status, "in");
});

test("small insurance intermediaries are excluded, larger ones are not", () => {
  assert.equal(scope(ent("intermediary"), "micro", false).status, "out");
  assert.equal(scope(ent("intermediary"), "sme", false).status, "out");
  assert.equal(scope(ent("intermediary"), "large", false).status, "in");
});

test("a claimed exemption becomes a check, not an out", () => {
  assert.equal(compute({ ...base, exempt: "yes" }).scope.status, "check");
});

test("ICT providers get the contract list, not the duty list", () => {
  const r = compute({ ...base, entity: "provider", critical: "yes" });
  assert.equal(r.scope.status, "provider");
  assert.equal(r.open.length, 0);
  assert.equal(r.termsOpen.length, CONTRACT_TERMS.length);
  assert.equal(compute({ ...base, entity: "provider" }).terms.length, CONTRACT_TERMS.filter((t) => !t.critical).length);
});

test("an out-of-scope organisation gets no duties", () => {
  const r = compute({ ...base, entity: "other" });
  assert.equal(r.open.length, 0);
  assert.equal(r.terms.length, 0);
});

test("open duties are exactly the unchecked ones", () => {
  const r = compute({ ...base, governance: "1", register: "1" });
  assert.equal(r.open.length, FE_DUTIES.length - 2);
  assert.ok(!r.open.some((d) => d.id === "register"));
});

test("TLPT is open only when identified, never for a microenterprise", () => {
  assert.ok(!compute(base).open.some((d) => d.id === "tlpt"));
  assert.ok(compute({ ...base, tlptIdentified: "yes" }).open.some((d) => d.id === "tlpt"));
  assert.ok(!compute({ ...base, size: "micro", tlptIdentified: "yes" }).open.some((d) => d.id === "tlpt"));
});

test("simplified framework needs an eligible entity, the answer yes, and not large", () => {
  assert.equal(simplifiedFramework(ent("investment"), "sme", "yes"), true);
  assert.equal(simplifiedFramework(ent("investment"), "large", "yes"), false);
  assert.equal(simplifiedFramework(ent("insurer"), "sme", "yes"), false);
  assert.equal(simplifiedFramework(ent("investment"), "sme", "no"), false);
});

test("all done gives the keep-the-evidence note", () => {
  const all = Object.fromEntries(FE_DUTIES.map((d) => [d.id, "1"]));
  const r = compute({ ...base, ...all });
  assert.equal(r.open.length, 0);
  assert.ok(r.findings.some((f) => /Keep the evidence/.test(f.title)));
});

test("clocks: classified early makes the initial deadline 4 hours after classification", () => {
  const c = compute({ ...base, aware: "2026-10-12T08:30", classified: "2026-10-12T10:00" }).clocks;
  assert.equal(c.initialDue, "2026-10-12 14:00");
  assert.equal(c.initialBound, "4 hours after classification");
  assert.equal(c.intermediateDue, "2026-10-15 14:00");
  assert.equal(c.finalDue, "2026-11-15 14:00");
});

test("clocks: classified late is capped at 24 hours from awareness", () => {
  const c = compute({ ...base, aware: "2026-10-12T08:30", classified: "2026-10-13T07:00" }).clocks;
  assert.equal(c.initialDue, "2026-10-13 08:30");
  assert.equal(c.initialBound, "24 hours after awareness");
});

test("clocks: unclassified falls back to 24 hours and says so", () => {
  const r = compute({ ...base, aware: "2026-10-12T08:30" });
  assert.equal(r.clocks.initialDue, "2026-10-13 08:30");
  assert.ok(r.findings.some((f) => /Not yet classified/.test(f.title)));
});

test("clocks: intermediate runs from the sent initial; final from the sent intermediate", () => {
  const c = compute({ ...base, aware: "2026-10-01T08:00", initialSent: "2026-10-01T11:00", intermediateSent: "2026-10-03T09:00" }).clocks;
  assert.equal(c.intermediateDue, "2026-10-04 11:00");
  assert.equal(c.intermediateLate, false);
  assert.equal(c.finalDue, "2026-11-03 09:00");
});

test("late initial and overdue final are flagged", () => {
  const r = compute({ ...base, aware: "2026-08-01T08:00", initialSent: "2026-08-03T08:00" });
  assert.equal(r.clocks.initialLate, true);
  assert.equal(r.clocks.finalLate, true);
  assert.ok(r.findings.some((f) => f.severity === "high" && /overdue/.test(f.title)));
});

test("month addition clamps to month end and keeps the time", () => {
  assert.equal(fmtd(addMonths(parseStamp("2026-12-31T23:15"), 1)), "2027-01-31 23:15");
  assert.equal(fmtd(addMonths(parseStamp("2027-01-31T10:00"), 1)), "2027-02-28 10:00");
  assert.equal(fmtd(addMonths(parseStamp("2028-01-31T10:00"), 1)), "2028-02-29 10:00");
});
const fmtd = (d) => d.toISOString().slice(0, 16).replace("T", " ");

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...base, entity: "" }).errors.length);
  assert.ok(compute({ ...base, aware: "2026-02-30T10:00" }).errors.length);
  assert.ok(compute({ ...base, aware: "12/10/2026 08:30" }).errors.length);
  assert.ok(compute({ ...base, aware: "2026-10-12T25:00" }).errors.length);
  assert.ok(compute({ ...base, classified: "2026-10-12T10:00" }).errors.length);
  assert.ok(compute({ ...base, aware: "2026-10-12T10:00", classified: "2026-10-12T09:00" }).errors.length);
  assert.ok(compute({ ...base, aware: "2026-10-12T10:00", intermediateSent: "2026-10-13T09:00" }).errors.length);
  assert.ok(compute({ ...base, aware: "2026-10-12T10:00", initialSent: "2026-10-13T09:00", intermediateSent: "2026-10-12T11:00" }).errors.length);
  assert.equal(parse(undefined).errors.length, 1);
});

test("unknown size falls back to SME, not a crash", () => {
  assert.equal(parse({ ...base, size: "__proto__" }).size, "sme");
});

test("sample runs; summary and csv render", () => {
  const r = compute(SAMPLE);
  assert.ok(!r.errors);
  assert.match(summaryText(r), /Initial notification by: 2026-10-12 14:00  <-- late|Initial notification by: 2026-10-12 14:00/);
  const csv = checklistCsv(r).split("\n");
  assert.equal(csv.length, FE_DUTIES.length + r.terms.length + 1);
});

test("clocks returns null without an awareness time", () => {
  assert.equal(clocks(parse(base)), null);
});
