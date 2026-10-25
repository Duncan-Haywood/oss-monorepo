import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaims, splitClaim, modFor, plan, sampleInput, toCsv } from "./calc.mjs";

const base = { expected: 100000, dRatio: 0.4, weight: 0.2, ballast: 50000 };

test("claims parse, abbreviations work, bad lines are reported", () => {
  const { claims, errors } = parseClaims("2024, m, $1,500\n2023, indemnity, 30000\n# note\n");
  assert.equal(errors.length, 0);
  assert.deepEqual(claims.map((c) => c.type), ["medical-only", "indemnity"]);
  assert.equal(claims[0].incurred, 1500);
  assert.match(parseClaims("2024, other, 5").errors[0], /Claim line 1/);
  assert.match(parseClaims("2024, m, -3").errors[0], /Claim line 1/);
});

test("split: primary capped at the split point, excess above, limit applied", () => {
  const s = splitClaim({ year: "a", type: "indemnity", incurred: 50000 }, { splitPoint: 20000, claimLimit: 40000 });
  assert.equal(s.primary, 20000);
  assert.equal(s.excess, 20000);
  assert.equal(s.counted, 40000);
});

test("medical-only claims are discounted to 30% when ERA is on", () => {
  assert.equal(splitClaim({ year: "a", type: "medical-only", incurred: 10000 }, { era: true }).counted, 3000);
  assert.equal(splitClaim({ year: "a", type: "medical-only", incurred: 10000 }, { era: false }).counted, 10000);
});

test("no claims gives a credit mod below one; actual equal to expected gives unity", () => {
  assert.ok(modFor(base, []).mod < 1);
  // Ap = Ep = 40000, Ae = Ee = 60000 -> numerator = 40000 + 0.2*60000 + 0.8*60000 + 50000 = E + B
  const split = [{ primary: 40000, excess: 60000 }];
  assert.ok(Math.abs(modFor(base, split).mod - 1) < 1e-9);
});

test("plan: hand-computed mod", () => {
  // claim 30000 indemnity, split 20500: Ap 20500, Ae 9500. Ee = 60000.
  // num = 20500 + .2*9500 + .8*60000 + 50000 = 20500+1900+48000+50000 = 120400 ; den 150000 -> 0.803
  const r = plan({ ...base, manualPremium: "10000", claims: "2024, indemnity, 30000" });
  assert.equal(r.mod, 0.803);
  assert.equal(r.premium, 8030);
});

test("plan: removing a claim lowers the mod and per-claim cost is positive", () => {
  const r = plan({ ...sampleInput() });
  assert.ok(r.perClaim.every((c) => c.modPoints > 0 && c.modWithout < r.mod));
  assert.equal(r.perClaim[0].threeYear, Math.round(r.perClaim[0].modPoints * 48000 * 3 * 100) / 100);
});

test("plan: validation errors are specific", () => {
  assert.match(plan({ ...base, expected: 0, claims: "" }).error, /Expected losses/);
  assert.match(plan({ ...base, dRatio: 2, claims: "" }).error, /D-ratio/);
  assert.match(plan({ ...base, weight: -1, claims: "" }).error, /Weight/);
  assert.match(plan({ ...base, splitPoint: 100, claimLimit: 50, claims: "" }).error, /Split point/);
  assert.match(plan({ ...base, claims: "x" }).error, /Claim line/);
});

test("plan: empty claim list is allowed and says why the mod is not zero", () => {
  const r = plan({ ...base, claims: "" });
  assert.equal(r.perClaim.length, 0);
  assert.ok(r.advice.some((a) => /ballast/.test(a)));
});

test("hypothetical new claims only ever raise the mod", () => {
  const r = plan(sampleInput());
  assert.ok(r.hypo.every((h) => h.mod >= r.mod));
  assert.ok(r.hypo[2].mod >= r.hypo[1].mod && r.hypo[1].mod >= r.hypo[0].mod);
});

test("csv has a header, one row per claim and the mod", () => {
  const lines = toCsv(plan(sampleInput())).trim().split("\n");
  assert.equal(lines.length, 1 + 4 + 1);
  assert.match(lines.at(-1), /^mod,/);
});

test("defaults: NCCI split point and per-claim limit are the documented values", () => {
  const r = plan({ ...base, claims: "2024, indemnity, 300000" });
  assert.equal(r.opts.claimLimit, 250000);
  assert.equal(r.opts.splitPoint, 20500);
  assert.equal(plan({ ...base, claims: "2024, indemnity, 250000" }).mod, plan({ ...base, claims: "2024, indemnity, 300000" }).mod);
  assert.ok(plan({ ...base, claims: "2024, indemnity, 250000" }).mod > plan({ ...base, claims: "2024, indemnity, 249000" }).mod);
});

test("era input 'off' turns the medical-only discount off, like false", () => {
  const claims = "2024, medical-only, 10000";
  const off = plan({ ...base, claims, era: "off" });
  const no = plan({ ...base, claims, era: false });
  const on = plan({ ...base, claims });
  assert.equal(off.mod, no.mod);
  assert.ok(off.mod > on.mod);
});

test("hypothetical claim sizes are 2,000, the split point and 100,000, and the advice says 3 policy years", () => {
  const r = plan({ ...base, manualPremium: 100000, claims: "2024, indemnity, 30000" });
  assert.deepEqual(r.hypo.map((h) => h.amount), [2000, 20500, 100000]);
  assert.match(r.advice.join(" "), /for each of the 3 policy years/);
});
