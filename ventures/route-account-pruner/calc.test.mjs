import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, accountEconomics, analyze, sampleText, reportCsv, DEFAULTS } from "./calc.mjs";

const O = { ...DEFAULTS, targetPerHour: 60, vehiclePerHour: 10, churnPer10: 0.1, maxIncrease: 0.25 };
const acct = (p) => ({ name: "a", price: 200, visits: 4, onsite: 30, drive: 10, materials: 0, ...p });

test("economics: hours, vehicle cost, yield and surplus are the arithmetic they say", () => {
  const e = accountEconomics(acct({ materials: 20 }), O);
  assert.equal(e.monthly, 200);
  assert.equal(e.hours, (4 * 40) / 60);
  assert.ok(Math.abs(e.vehicle - (4 * 10 / 60) * 10) < 1e-9);
  assert.ok(Math.abs(e.net - (200 - 20 - e.vehicle)) < 1e-9);
  assert.ok(Math.abs(e.surplus - (e.net - 60 * e.hours)) < 1e-9);
});

test("per-visit billing multiplies by visits", () => {
  assert.equal(accountEconomics(acct({ price: 50 }), { ...O, billing: "visit" }).monthly, 200);
});

test("parseRows reads headers in any order, money formats, and skips junk rows", () => {
  const p = parseRows('Drive min,Minutes on site,Visits,Price,Customer\n12,30,4,"$1,200",Smith\nx,30,4,100,Bad\n5,0,4,100,Zero');
  assert.equal(p.accounts.length, 1);
  assert.deepEqual(p.accounts[0], { name: "Smith", price: 1200, visits: 4, onsite: 30, drive: 12, materials: 0 });
  assert.ok(p.warnings.some((w) => /2 rows skipped/.test(w)));
});

test("parseRows headerless and delimiters; materials optional", () => {
  assert.equal(parseRows("Jones,120,4,25,8,15\nLee;1;1;1;1").accounts.length, 1);
  assert.equal(parseRows("a\t100\t4\t30\t10").accounts[0].materials, 0);
  assert.equal(parseRows("a,100,4,30,10,15").accounts[0].materials, 15);
});

test("empty and too-narrow input are errors", () => {
  assert.ok(parseRows("").error);
  assert.ok(parseRows("a,1,2").error);
});

test("needs five accounts and a positive hour value", () => {
  assert.match(analyze([acct({})], O).error, /at least 5/);
  const five = Array.from({ length: 5 }, () => acct({}));
  assert.match(analyze(five, { ...O, targetPerHour: 0 }).error, /worth to you/);
  assert.ok(analyze(five, { ...O, churnPer10: 2 }).error);
});

test("a profitable account is kept, a hopeless one dropped, a fixable one repriced", () => {
  const good = acct({ name: "good", price: 400 });
  // 4 visits x 40 min = 2.67 h; hour worth 60 => 160 of value; net 200 - 6.67 = 193 => surplus 33 positive
  const fix = acct({ name: "fix", price: 160 });
  const bad = acct({ name: "bad", price: 60, drive: 30 });
  const pad = Array.from({ length: 2 }, () => acct({ price: 300 }));
  const r = analyze([good, fix, bad, ...pad], O);
  const by = Object.fromEntries(r.rows.map((x) => [x.name, x]));
  assert.equal(by.good.action, "keep");
  assert.equal(by.good.increase, undefined);
  assert.equal(by.bad.action, "drop");
  assert.equal(by.fix.action, "reprice");
  assert.ok(by.fix.increase > 0 && by.fix.expected > 0 && by.fix.expected > by.fix.surplus);
});

test("a drop never costs more than the surplus it removes, and the plan never loses to doing nothing", () => {
  const r = analyze(parseRows(sampleText()).accounts, DEFAULTS);
  for (const x of r.rows) assert.ok(x.expected >= x.surplus - 1e-9, x.name);
  assert.ok(r.gain >= 0);
  assert.ok(r.surplusPlan >= r.surplusNow);
});

test("rows are sorted worst surplus per hour first", () => {
  const r = analyze(parseRows(sampleText()).accounts, DEFAULTS);
  const k = r.rows.map((x) => x.surplus / x.hours);
  for (let i = 1; i < k.length; i++) assert.ok(k[i] >= k[i - 1] - 1e-9);
});

test("with no cancellations repricing always wins over dropping, with certain cancellation it never happens", () => {
  const bad = Array.from({ length: 5 }, () => acct({ price: 200, drive: 25 }));
  assert.ok(analyze(bad, { ...O, churnPer10: 0 }).rows.every((x) => x.action === "reprice"));
  assert.ok(analyze(bad, { ...O, churnPer10: 1 }).rows.every((x) => x.action === "drop"));
});

test("a higher hour value drops or reprices at least as many accounts", () => {
  const accts = parseRows(sampleText()).accounts;
  const s = analyze(accts, DEFAULTS).sens;
  assert.ok(s[0].keep >= s[1].keep && s[1].keep >= s[2].keep);
  for (const x of s) assert.equal(x.keep + x.drop + x.reprice, accts.length);
});

test("heavy driving and zero-drive accounts are called out", () => {
  const far = Array.from({ length: 5 }, () => acct({ onsite: 15, drive: 40 }));
  assert.ok(analyze(far, O).warnings.some((w) => /Driving is/.test(w)));
  assert.ok(analyze([acct({ drive: 0 }), ...far], O).warnings.some((w) => /0 drive minutes/.test(w)));
});

test("sample data parses fully, yields a mix of actions, and CSV has one line per account", () => {
  const p = parseRows(sampleText());
  assert.equal(p.accounts.length, 40);
  const r = analyze(p.accounts, DEFAULTS);
  assert.ok(r.dropped + r.repriced > 0 && r.dropped + r.repriced < 40);
  assert.equal(reportCsv(r).trim().split("\n").length, 41);
});
