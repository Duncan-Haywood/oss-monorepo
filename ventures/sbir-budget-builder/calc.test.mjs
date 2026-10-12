import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, parsePersonnel, parseSubawards, toCsv, PROGRAMS } from "./calc.mjs";

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("worked example: personnel, fringe, MTDC indirect and fee", () => {
  const a = analyze(DEFAULTS);
  close(a.personnel, 45000);
  close(a.fringe, 11250);
  close(a.direct, 107250);
  // MTDC drops the part of the $40,000 subaward above $25,000
  close(a.indirectBase, 92250);
  close(a.indirect, 41512.5);
  close(a.totalCosts, 148762.5);
  close(a.fee, 10413.38);
  close(a.price, 159175.88);
});

test("small business share is costs kept in house, and passes at 73%", () => {
  const a = analyze(DEFAULTS);
  close(a.sbShare, (148762.5 - 40000) / 148762.5, 1e-6);
  assert.equal(a.checks[0].ok, true);
  assert.equal(a.allOk, true);
});

test("a large university subaward breaks the SBIR Phase I floor", () => {
  const a = analyze({ ...DEFAULTS, subawards: "State University, university, 90000" });
  assert.equal(a.checks[0].ok, false);
  assert.equal(a.allOk, false);
});

test("STTR adds a research institution floor that a company subaward cannot meet", () => {
  const s = PROGRAMS["sttr-1"];
  const base = { ...DEFAULTS, minSmallBusiness: s.minSmallBusiness, minResearchInstitution: s.minResearchInstitution };
  const withCompany = analyze({ ...base, subawards: "Partner Co, company, 40000" });
  assert.equal(withCompany.checks.find((c) => c.name.startsWith("Research")).ok, false);
  const withUni = analyze({ ...base, subawards: "State University, university, 50000" });
  assert.equal(withUni.checks.find((c) => c.name.startsWith("Research")).ok, true);
});

test("fee over the ceiling fails and a zero ceiling disables the check", () => {
  assert.equal(analyze({ ...DEFAULTS, feeRate: 10 }).checks.find((c) => c.name.startsWith("Fee")).ok, false);
  assert.equal(analyze({ ...DEFAULTS, feeRate: 10, feeCeiling: 0 }).checks.find((c) => c.name.startsWith("Fee")).ok, true);
});

test("indirect bases differ as documented", () => {
  const tdc = analyze({ ...DEFAULTS, indirectBase: "tdc" });
  close(tdc.indirectBase, 107250);
  const sal = analyze({ ...DEFAULTS, indirectBase: "salary" });
  close(sal.indirectBase, 45000);
  const none = analyze({ ...DEFAULTS, indirectBase: "none" });
  assert.equal(none.indirect, 0);
});

test("equipment is excluded from MTDC", () => {
  const a = analyze({ ...DEFAULTS, equipment: 10000, subawards: "" });
  close(a.indirectBase, a.direct - 10000);
});

test("salary cap lowers the charged salary and warns", () => {
  const a = analyze({ ...DEFAULTS, salaryCap: 100000 });
  close(a.personnel, 100000 * 0.25 * 0.5 + 100000 * 0.5 * 0.5);
  assert.ok(a.warnings.some((w) => /over the cap/.test(w)));
});

test("over 100% effort warns", () => {
  const a = analyze({ ...DEFAULTS, personnel: "X, PI, 100000, 120" });
  assert.ok(a.warnings.some((w) => /more than full time/.test(w)));
});

test("solicitation maximum is checked only when entered", () => {
  assert.equal(analyze(DEFAULTS).checks.some((c) => c.name.startsWith("Within")), false);
  const over = analyze({ ...DEFAULTS, awardMax: 150000 });
  assert.equal(over.checks.find((c) => c.name.startsWith("Within")).ok, false);
});

test("subaward headroom is the extra subaward the floor still allows", () => {
  const a = analyze(DEFAULTS);
  const s = { ...DEFAULTS, subawards: `State University, university, ${40000 + a.subHeadroom}` };
  const b = analyze(s);
  assert.ok(a.subHeadroom > 0);
  // the extra is added to costs one-for-one without indirect, so the share lands near the floor, not under it
  assert.ok(b.sbShare * 100 > DEFAULTS.minSmallBusiness - 3);
});

test("parsers report malformed lines instead of silently dropping them", () => {
  const p = parsePersonnel("good, PI, 100000, 50\nbad line\n# comment\n\n");
  assert.equal(p.rows.length, 1);
  assert.equal(p.problems.length, 1);
  const s = parseSubawards("U, university, 1000\nX, bogus, 5");
  assert.equal(s.rows.length, 1);
  assert.equal(s.problems.length, 1);
});

test("zero months is refused", () => {
  const a = analyze({ ...DEFAULTS, months: 0 });
  assert.equal(a.result, null);
});

test("CSV carries the budget lines and the checks", () => {
  const csv = toCsv(analyze(DEFAULTS));
  assert.match(csv, /Total price/);
  assert.match(csv, /"Small business share of work",ok/);
});
