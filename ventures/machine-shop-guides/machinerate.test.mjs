import test from "node:test";
import assert from "node:assert/strict";
import { machineRates, ratesCsv, EXAMPLE } from "./machinerate.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test("one owned machine, worked by hand", () => {
  const r = machineRates({
    rentPerSqft: "12", powerPrice: "0.15",
    machines: [{ name: "VMC", cost: "100000", salvage: "20000", lifeYears: "8", interestPct: "6", sqft: "150", kw: "20", loadPct: "50", maintenancePerYear: "4000", toolingPerHour: "5", hoursPerYear: "4000", utilizationPct: "50", operatorWage: "40", machinesPerOperator: "2" }],
  });
  assert.deepEqual(r.errors, []);
  const m = r.machines[0];
  // depreciation 80000/8 = 10000; interest (120000/2) x 6% = 3600; space 150 x 12 = 1800; maintenance 4000
  close(m.perYear.depreciation, 10000, "depreciation");
  close(m.perYear.interest, 3600, "interest");
  close(m.perYear.space, 1800, "space");
  close(m.perYear.total, 19400, "fixed per year");
  close(m.billableHours, 2000, "billable hours");
  // 19400 / 2000 = 9.70; power 20 x 0.5 x 0.15 = 1.50; tooling 5 -> 16.20
  close(m.perHour.power, 1.5, "power");
  close(m.machineRate, 16.2, "machine rate");
  // operator 40 / 2 machines / 0.5 utilization = 40 per billable hour
  close(m.perHour.operator, 40, "operator");
  close(m.withOperator, 56.2, "with operator");
  assert.equal(m.quoted, null, "no markup, no quoted rate");
  // at 60%: 19400/2400 + 1.5 + 5 + 40/2/0.6
  close(m.higherUtilization.rate, 19400 / 2400 + 6.5 + 40 / 2 / 0.6, "rate at 60%");
  close(m.lowerUtilization.rate, 19400 / 1600 + 6.5 + 40 / 2 / 0.4, "rate at 40%");
});

test("shop overhead is shared by billable hours, and the blended rate weights by them", () => {
  const r = machineRates({
    overheadPerYear: "30000", markupPct: "25",
    machines: [
      { name: "A", leasePerYear: "20000", hoursPerYear: "2000", utilizationPct: "100" },
      { name: "B", hoursPerYear: "2000", utilizationPct: "50" },
    ],
  });
  assert.deepEqual(r.errors, []);
  const [a, b] = r.machines;
  close(a.perYear.overhead, 20000, "A gets 2000 of 3000 hours");
  close(b.perYear.overhead, 10000, "B gets 1000 of 3000 hours");
  close(a.withOperator, 20, "A: (20000 + 20000) / 2000");
  close(b.withOperator, 10, "B: 10000 / 1000");
  close(a.quoted, 25, "markup 25%");
  close(r.shop.blendedRate, (40000 + 10000) / 3000, "blended");
  assert.ok(r.notes.some((n) => /B: no cost or lease/.test(n)));
});

test("a lease replaces the purchase cost, with a note", () => {
  const r = machineRates({ machines: [{ name: "L", cost: "50000", lifeYears: "5", leasePerYear: "12000", hoursPerYear: "1000", utilizationPct: "100" }] });
  close(r.machines[0].perYear.total, 12000, "lease only");
  assert.ok(r.notes.some((n) => /lease is used/.test(n)));
});

test("missing or impossible inputs are errors, not guesses", () => {
  assert.match(machineRates({ machines: [] }).errors.join(), /at least one machine/);
  const r = machineRates({ machines: [{ name: "X", cost: "1000", hoursPerYear: "", utilizationPct: "120" }] });
  const e = r.errors.join(" | ");
  assert.match(e, /scheduled hours/);
  assert.match(e, /over 100%/);
  assert.match(e, /useful life/);
  assert.match(machineRates({ machines: [{ name: "Y", cost: "abc", hoursPerYear: "100", utilizationPct: "50" }] }).errors.join(), /not a number/);
  assert.match(machineRates({ machines: [{ name: "Z", cost: "1000", salvage: "2000", lifeYears: "2", hoursPerYear: "100", utilizationPct: "50" }] }).errors.join(), /salvage/);
});

test("power at full kW without a load, and a note", () => {
  const r = machineRates({ powerPrice: "0.2", machines: [{ name: "P", kw: "10", hoursPerYear: "100", utilizationPct: "100" }] });
  close(r.machines[0].perHour.power, 2, "10 kW x 0.2");
  assert.ok(r.notes.some((n) => /full rated kW/.test(n)));
});

test("utilization sensitivity stops at the ends of the range", () => {
  const r = machineRates({ machines: [{ name: "U", leasePerYear: "1000", hoursPerYear: "100", utilizationPct: "95" }] });
  assert.equal(r.machines[0].higherUtilization.rate, null);
  assert.ok(r.machines[0].lowerUtilization.rate > r.machines[0].withOperator);
});

test("the invented example computes and the CSV is formula-safe", () => {
  const r = machineRates(EXAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.machines.length, 3);
  for (const m of r.machines) assert.ok(m.withOperator > m.machineRate && m.machineRate > 0);
  const csv = ratesCsv(r);
  assert.equal(csv.trim().split("\n").length, 4);
  const evil = ratesCsv(machineRates({ machines: [{ name: "=HYPERLINK(1)", hoursPerYear: "10", utilizationPct: "10" }] }));
  assert.match(evil, /\n'=HYPERLINK/);
});

test("commas are read by shape: thousands grouping kept, a decimal comma refused", () => {
  const ok = machineRates({ machines: [{ name: "C", leasePerYear: "12,000", hoursPerYear: "1,000", utilizationPct: "100" }] });
  assert.deepEqual(ok.errors, []);
  close(ok.machines[0].withOperator, 12, "12,000 / 1,000");
  assert.match(machineRates({ machines: [{ name: "D", leasePerYear: "29,99", hoursPerYear: "10", utilizationPct: "100" }] }).errors.join(), /not a number/);
});

test("CSV defuses every formula lead but keeps a plain negative number", () => {
  // A leading tab or CR is trimmed off the machine name before it reaches the CSV.
  for (const lead of ["=", "+", "-", "@"]) {
    const csv = ratesCsv(machineRates({ machines: [{ name: lead + "X", hoursPerYear: "10", utilizationPct: "10" }] }));
    assert.ok(csv.split("\n")[1].replace(/^"/, "").startsWith("'" + lead), JSON.stringify(lead));
  }
});

test("a plain negative number is not defused", async () => {
  // ratesCsv's cell() lets numbers through; the only text cell is the name.
  const csv = ratesCsv({ machines: [{ name: "-12.50", billableHours: 1, perHour: {}, machineRate: 1, withOperator: 1, quoted: null }] });
  assert.match(csv, /\n-12\.50,/);
});
