import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, entitlement, SAMPLE, summaryText } from "./calc.mjs";

test("entitlement bands", () => {
  assert.equal(entitlement("u9", true), 0);
  assert.equal(entitlement("9m", true), 30);
  assert.equal(entitlement("9m", false), 0);
  assert.equal(entitlement("3-4", true), 30);
  assert.equal(entitlement("3-4", false), 15);
  assert.equal(entitlement("school", true), 0);
});

test("worked example: nursery child plus after-school child", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.eligible, true);
  const [a, b] = r.rows;
  assert.equal(a.gross, 11250);
  assert.equal(a.fundedHours, 1140);
  assert.equal(a.fundedValue, 8550);
  assert.equal(a.toPay, 2700);
  assert.equal(a.topUp, 540);
  assert.equal(b.weekly, 0);
  assert.equal(b.toPay, 1800);
  assert.equal(b.topUp, 360);
  assert.equal(r.totals.topUp, 900);
  assert.equal(r.totals.youPay, 3600);
});

test("minimum earnings threshold is 16 hours at minimum wage per quarter", () => {
  const r = compute({ ...SAMPLE, year: "2025-26" });
  assert.equal(r.quarterMin, 2539.68);
  const low = compute({ ...SAMPLE, p2Earnings: "9000" });
  assert.equal(low.eligible, false);
  assert.equal(low.totals.topUp, 0);
  assert.equal(low.rows[0].fundedHours, 0);
});

test("a parent over 100,000 adjusted net income removes everything", () => {
  const r = compute({ ...SAMPLE, p1Ani: "100001" });
  assert.equal(r.eligible, false);
  assert.ok(r.findings.some((f) => /over the/.test(f.title)));
});

test("a parent over the limit is still caught when earnings are below it", () => {
  assert.equal(compute({ ...SAMPLE, p1Earnings: "60000", p1Ani: "120000" }).eligible, false);
});

test("exempt and new self-employed parents skip the earnings test, not the income test", () => {
  assert.equal(compute({ ...SAMPLE, p2Status: "exempt", p2Earnings: "" }).eligible, true);
  assert.equal(compute({ ...SAMPLE, p2Status: "newSelfEmployed", p2Earnings: "" }).eligible, true);
  assert.equal(compute({ ...SAMPLE, p2Status: "exempt", p2Earnings: "", p2Ani: "150000" }).eligible, false);
  assert.equal(compute({ ...SAMPLE, p2Status: "notWorking", p2Earnings: "" }).eligible, false);
});

test("single parent: no second parent test", () => {
  const r = compute({ ...SAMPLE, p2Status: "none", p2Earnings: "" });
  assert.equal(r.parents.length, 1);
  assert.equal(r.eligible, true);
});

test("top-up caps at 2,000 a child and 4,000 if disabled", () => {
  const big = { ...SAMPLE, c2Age: "none", c1Age: "school", c1Hours: "50", c1Rate: "10", c1Weeks: "52" };
  assert.equal(compute(big).rows[0].topUp, 2000);
  assert.equal(compute({ ...big, c1Disabled: "yes" }).rows[0].topUp, 4000);
});

test("3-4 year olds in a non-qualifying household still get 15 hours", () => {
  const r = compute({ ...SAMPLE, p2Status: "notWorking", p2Earnings: "", c1Age: "3-4", c2Age: "none" });
  assert.equal(r.eligible, false);
  assert.equal(r.rows[0].weekly, 15);
  assert.equal(r.rows[0].fundedHours, 15 * 38);
});

test("stretched hours cap at the hours actually used", () => {
  const r = compute({ ...SAMPLE, mode: "stretch", c2Age: "none", c1Hours: "10", c1Weeks: "40" });
  assert.equal(r.rows[0].fundedHours, 400);
});

test("Universal Credit alternative is 85% of costs after free hours, capped monthly", () => {
  const r = compute({ ...SAMPLE, c2Age: "none", c1Age: "school", c1Hours: "40", c1Rate: "12", c1Weeks: "52" });
  assert.equal(r.uc.cap, 1031.88);
  assert.equal(r.uc.perYear, 12382.56);
});

test("other nations and bad inputs give errors, not numbers", () => {
  assert.match(compute({ ...SAMPLE, nation: "scotland" }).errors[0], /England/);
  assert.ok(compute({ ...SAMPLE, c1Hours: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, c1Age: "none", c2Age: "none" }).errors.length);
});

test("summary names the figures and tells the reader to verify", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /Tax-Free Childcare top-up £900\.00/);
  assert.match(t, /Verify/);
});

test("free hours total sums every funded child", () => {
  const r = compute({ ...SAMPLE, c2Age: "3-4", c2Hours: "15", c2Weeks: "38" });
  assert.equal(r.rows[0].fundedHours, 1140);
  assert.equal(r.rows[1].fundedHours, 570);
  assert.equal(r.totals.fundedHours, 1710);
});

test("a top-up under £1 is still reported", () => {
  const r = compute({ ...SAMPLE, c1Age: "school", c1Hours: "1", c1Rate: "1", c1Weeks: "1", c2Age: "none" });
  assert.equal(r.totals.topUp, 0.2);
  assert.ok(r.findings.some((f) => f.title.startsWith("Tax-Free Childcare adds")));
});

test("the cap warning appears only when the top-up is actually limited", () => {
  const at = { ...SAMPLE, c1Age: "school", c1Hours: "40", c1Rate: "5", c1Weeks: "50", c2Age: "none" };
  const exact = compute(at); // 10,000 to pay -> 2,000 top-up, exactly the cap
  assert.equal(exact.totals.topUp, 2000);
  assert.ok(!exact.findings.some((f) => f.title.includes("hit the Tax-Free Childcare cap")));
  const over = compute({ ...at, c1Rate: "6" });
  assert.ok(over.findings.some((f) => f.title.includes("hit the Tax-Free Childcare cap")));
});
