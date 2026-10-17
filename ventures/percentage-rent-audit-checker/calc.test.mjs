import { test } from "node:test";
import assert from "node:assert/strict";
import { auditPercentageRent, naturalBreakpoint, percentageRent, addDays, disputeNote, money } from "./calc.mjs";

const base = {
  ratePct: 6,
  baseRent: 60000,
  landlordSales: 1250000,
  ownSales: 1240000,
  billed: 15600,
  paid: 0,
  exclusions: [
    { label: "Refunds and returns", amount: 20000 },
    { label: "Gift card sales", amount: 8000 },
    { label: "Third-party delivery fees", amount: 5000, leaseExcludes: false },
  ],
};

test("natural breakpoint is base rent over the rate", () => {
  assert.equal(naturalBreakpoint(60000, 6), 1000000);
  assert.equal(naturalBreakpoint(36000, 5), 720000);
  assert.throws(() => naturalBreakpoint(60000, 0));
  assert.throws(() => naturalBreakpoint(-1, 5));
});

test("percentage rent is zero at or below the breakpoint and capped when a cap applies", () => {
  assert.equal(percentageRent({ sales: 1000000, breakpoint: 1000000, ratePct: 6 }), 0);
  assert.equal(percentageRent({ sales: 900000, breakpoint: 1000000, ratePct: 6 }), 0);
  assert.equal(percentageRent({ sales: 1250000, breakpoint: 1000000, ratePct: 6 }), 15000);
  assert.equal(percentageRent({ sales: 1250000, breakpoint: 1000000, ratePct: 6, cap: 10000 }), 10000);
});

test("hand-counted example: 12,720 owed against 15,600 billed", () => {
  const r = auditPercentageRent(base);
  assert.equal(r.breakpoint, 1000000);
  assert.equal(r.excluded, 28000);
  assert.equal(r.correctSales, 1212000);
  assert.equal(r.correct, 12720);
  assert.equal(r.landlordConsistent, 15000);
  assert.equal(r.overcharge, 2880);
  assert.equal(r.arithmetic, 600);
});

test("the lines decompose the overcharge exactly: arithmetic + sales gap + combined exclusions", () => {
  const r = auditPercentageRent(base);
  const arithmetic = r.items.find((i) => i.kind === "arithmetic");
  const gap = r.items.find((i) => i.kind === "gap");
  assert.equal(-arithmetic.dollars, 600);
  assert.equal(-gap.dollars, 600);
  const ex = r.items.filter((i) => i.kind === "exclusion");
  assert.deepEqual(ex.map((i) => -i.dollars), [1200, 480]);
  assert.equal(600 + 600 + 1200 + 480, r.overcharge);
});

test("an exclusion the lease does not allow is shown but priced at zero", () => {
  const r = auditPercentageRent(base);
  const inc = r.items.find((i) => i.kind === "included");
  assert.equal(inc.dollars, 0);
  assert.equal(r.excluded, 28000);
});

test("artificial breakpoint overrides the natural one", () => {
  const r = auditPercentageRent({ ratePct: 5, breakpointMode: "artificial", artificialBreakpoint: 800000, landlordSales: 900000, billed: 5000 });
  assert.equal(r.breakpoint, 800000);
  assert.equal(r.correct, 5000);
  assert.equal(r.overcharge, 0);
  assert.equal(r.items.length, 0);
});

test("sales below the breakpoint mean no percentage rent is owed", () => {
  const r = auditPercentageRent({ ratePct: 6, baseRent: 60000, landlordSales: 990000, billed: 600 });
  assert.equal(r.correct, 0);
  assert.equal(r.overcharge, 600);
  assert.equal(r.arithmetic, 600);
});

test("exclusions that pull sales under the breakpoint only count above it", () => {
  const r = auditPercentageRent({ ratePct: 10, baseRent: 100000, landlordSales: 1050000, billed: 5000, exclusions: [{ label: "Refunds", amount: 200000 }] });
  assert.equal(r.correct, 0);
  assert.equal(r.items.find((i) => i.kind === "exclusion").dollars, -5000);
});

test("the cap limits the correct figure and the landlord-consistent figure", () => {
  const r = auditPercentageRent({ ratePct: 6, baseRent: 60000, landlordSales: 1250000, billed: 15000, cap: 12000 });
  assert.equal(r.landlordConsistent, 12000);
  assert.equal(r.correct, 12000);
  assert.equal(r.overcharge, 3000);
  assert.equal(r.arithmetic, 3000);
});

test("an undercharge shows a negative overcharge and a gap line against the tenant", () => {
  const r = auditPercentageRent({ ratePct: 6, baseRent: 60000, landlordSales: 1100000, ownSales: 1150000, billed: 6000 });
  assert.equal(r.correct, 9000);
  assert.equal(r.overcharge, -3000);
  assert.equal(r.items[0].kind, "gap");
  assert.equal(r.items[0].dollars, 3000);
});

test("estimates already paid change the balances, not the overcharge", () => {
  const r = auditPercentageRent({ ...base, paid: 10000 });
  assert.equal(r.owedByLandlordStatement, 5600);
  assert.equal(r.owedCorrected, 2720);
  assert.equal(r.overcharge, 2880);
  const refund = auditPercentageRent({ ...base, paid: 14000 });
  assert.equal(refund.owedCorrected, -1280);
});

test("blank own sales falls back to the landlord's figure", () => {
  const r = auditPercentageRent({ ratePct: 6, baseRent: 60000, landlordSales: 1250000, ownSales: "", billed: 15000 });
  assert.equal(r.ownSales, 1250000);
  assert.equal(r.items.length, 0);
});

test("bad input throws instead of clamping", () => {
  assert.throws(() => auditPercentageRent({ ...base, ratePct: "" }), /percentage rate is required/);
  assert.throws(() => auditPercentageRent({ ...base, ratePct: 40 }));
  assert.throws(() => auditPercentageRent({ ...base, baseRent: 0 }));
  assert.throws(() => auditPercentageRent({ ...base, landlordSales: -5 }));
  assert.throws(() => auditPercentageRent({ ...base, billed: "abc" }));
  assert.throws(() => auditPercentageRent({ ...base, exclusions: [{ label: "x", amount: 5000000 }] }), /cannot exceed/);
  assert.throws(() => auditPercentageRent({ ratePct: 6, breakpointMode: "artificial", landlordSales: 1, billed: 0 }), /artificial breakpoint/);
});

test("review deadline adds days to the statement date", () => {
  assert.equal(addDays("2026-02-20", 30), "2026-03-22");
  assert.equal(addDays("2027-12-15", 60), "2028-02-13");
  assert.throws(() => addDays("2026-02-30", 5));
  assert.throws(() => addDays("02/20/2026", 5));
  const r = auditPercentageRent({ ...base, statementDate: "2026-03-01", auditWindowDays: 90 });
  assert.equal(r.deadline, "2026-05-30");
  assert.equal(auditPercentageRent(base).deadline, null);
});

test("the dispute note carries the numbers, items and deadline", () => {
  const r = auditPercentageRent({ ...base, statementDate: "2026-03-01", auditWindowDays: 90 });
  const note = disputeNote(r, { tenant: "Corner Cafe LLC", period: "2025 lease year", clause: "Section 4.2" });
  assert.match(note, /Corner Cafe LLC/);
  assert.match(note, /billing \$15,600\.00 against Section 4\.2/);
  assert.match(note, /I calculate \$12,720\.00/);
  assert.match(note, /difference of \$2,880\.00/);
  assert.match(note, /Refunds and returns/);
  assert.match(note, /2026-05-30/);
  assert.match(note, /not a legal position/);
});

test("money formats negatives and thousands", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-5), "-$5.00");
});
