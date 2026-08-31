import test from "node:test";
import assert from "node:assert/strict";
import {
  auditCharges,
  auditTotals,
  csvForReview,
  disputeDraft,
  reviewDetention,
  detentionNote,
  comparePassThrough,
  passThroughNote,
  reviewFuelSurcharge,
  fuelSurchargeNote,
} from "./audit.mjs";

const rows = [
  { invoice: "INV-1", reference: "PO-8", code: "LIFT", billed: "125", expected: "75", evidence: "missing" },
  { invoice: "INV-1", reference: "PO-8", code: "LIFT", billed: "125", expected: "75", evidence: "missing" },
  { invoice: "INV-2", reference: "PO-9", code: "", billed: "20", expected: "20", evidence: "supports" },
];

test("flags overages, duplicates, missing codes, and evidence", () => {
  const results = auditCharges(rows);
  assert.deepEqual(results.map((row) => row.flags), [
    ["Over expected by $50.00", "Evidence missing for the overage"],
    ["Possible duplicate", "Over expected by $50.00", "Evidence missing for the overage"],
    ["Missing accessorial code"],
  ]);
  assert.deepEqual(results.map((row) => row.priority), ["review", "review", "supported"]);
  assert.deepEqual(auditTotals(results), {
    billed: 270,
    expected: 170,
    flagged: 3,
    recoverable: 100,
    unpriced: 0,
    supported: 1,
    actionable: 2,
  });
});

test("an overage with evidence supporting the billed amount is not counted as recoverable", () => {
  // A $300 detention line against a $75 rate-card figure looks like a
  // $225.00 overage until a scale ticket or dock log is attached that
  // supports the $300 as billed. `priorityFor` already keeps such a row
  // out of `actionable`; `recoverable` must exclude it too, or the
  // headline "above expected" total still claims a gap the evidence has
  // already closed.
  const results = auditCharges([
    { invoice: "INV-4", reference: "PO-11", code: "DET", billed: "300", expected: "75", evidence: "supports" },
  ]);
  assert.equal(results[0].priority, "supported");
  const totals = auditTotals(results);
  assert.equal(totals.recoverable, 0);
  assert.equal(totals.supported, 1);
  assert.equal(totals.actionable, 0);
});

test("a line with no expected amount is not counted as a full recovery", () => {
  // Bulk import makes this the common case: a carrier export carries line haul
  // and fuel that no rate card prices. Treating their blank expected as $0.00
  // would headline the whole billed amount as recoverable — "we do not know
  // what this should cost" reported as "you were overbilled by $912.40".
  const results = auditCharges([
    { invoice: "INV-4471", reference: "PRO-77120", code: "LINEHAUL", billed: "912.40", expected: "" },
    { invoice: "INV-4471", reference: "PRO-77120", code: "DET", billed: "300", expected: "75" },
  ]);
  assert.equal(results[0].priority, "fix-inputs");
  const totals = auditTotals(results);
  assert.equal(totals.billed, 1212.4);
  assert.equal(totals.recoverable, 225);
  assert.equal(totals.unpriced, 1);
  assert.equal(totals.actionable, 1);
});

test("high priority starts at a $100 overage with missing or contradictory evidence", () => {
  const results = auditCharges([
    { invoice: "INV-3", reference: "PO-10", code: "DET", billed: "300", expected: "75", evidence: "contradicts" },
    { invoice: "INV-4", reference: "PO-11", code: "DET", billed: "300", expected: "75", evidence: "supports" },
  ]);
  assert.equal(results[0].priority, "high");
  assert.equal(results[1].priority, "supported");
  assert.ok(results[0].flags.includes("Evidence contradicts the billed condition"));
});

test("escapes review CSV values and includes evidence and priority", () => {
  const csv = csvForReview(
    auditCharges([{ invoice: 'I"1', reference: "R", code: "FUEL", billed: 10, expected: 10, evidence: "supports" }]),
  );
  assert.match(csv, /"I""1"/);
  assert.match(csv, /Evidence,Priority,Flags/);
  assert.match(csv, /supports/);
});

test("flags malformed and negative amounts instead of treating them as zero", () => {
  const results = auditCharges([
    { invoice: "INV-3", reference: "PO-10", code: "FUEL", billed: "not-a-number", expected: "10" },
    { invoice: "INV-4", reference: "PO-11", code: "DET", billed: "-5", expected: "0" },
  ]);
  assert.deepEqual(results.map((row) => row.flags), [
    ["Invalid billed amount"],
    ["Invalid billed amount"],
  ]);
  assert.equal(results[0].priority, "fix-inputs");
  assert.equal(results[0].billed, 0);
  assert.equal(results[1].variance, -5);
});

test("flags blank amounts as invalid", () => {
  const results = auditCharges([{ invoice: "INV-5", reference: "PO-12", code: "FUEL", billed: "", expected: " " }]);
  assert.deepEqual(results[0].flags, ["Invalid billed amount", "Invalid expected amount"]);
});

test("dispute draft lists only actionable overages and does not determine the charge", () => {
  const draft = disputeDraft({
    invoice: "INV-1001",
    carrier: "Regional LTL",
    results: auditCharges(rows),
  });
  assert.match(draft, /Subject: Accessorial review — INV-1001/);
  assert.match(draft, /\$100\.00 above expected across 2 line\(s\)/);
  assert.match(draft, /LIFT on INV-1: billed \$125\.00/);
  assert.doesNotMatch(draft, /INV-2/);
  assert.match(draft, /not a determination that any charge is wrong/);
  assert.doesNotMatch(draft, /must dispute|should refuse|the charge is wrong/i);
});

test("default detention demo: 3 hours on dock, 2 free, $75/hour, $300 billed", () => {
  const result = reviewDetention({
    dockMinutes: 180,
    freeMinutes: 120,
    ratePerHour: 75,
    billedAmount: 300,
  });
  assert.deepEqual(
    {
      clockHours: result.clockHours,
      freeHours: result.freeHours,
      billableHours: result.billableHours,
      expected: result.expected,
      variance: result.variance,
      impliedBilledHours: result.impliedBilledHours,
      recoverable: result.recoverable,
    },
    {
      clockHours: 3,
      freeHours: 2,
      billableHours: 1,
      expected: 75,
      variance: 225,
      impliedBilledHours: 4,
      recoverable: 225,
    },
  );
  assert.ok(result.flags.includes("Over expected by $225.00"));
  assert.ok(result.flags.includes("Billed hours exceed time on dock"));
});

test("detention note stays observational and matches the default numbers", () => {
  const note = detentionNote(
    reviewDetention({ dockMinutes: 180, freeMinutes: 120, ratePerHour: 75, billedAmount: 300 }),
  );
  assert.match(note, /3\.00 hours on dock/);
  assert.match(note, /2\.00 free hours/);
  assert.match(note, /\$75\.00 expected/);
  assert.match(note, /as if 4\.00 hours/);
  assert.match(note, /\$225\.00 above the clock/);
  assert.match(note, /not a determination that the charge is wrong/);
  assert.doesNotMatch(note, /must dispute|should refuse/i);
});

test("detention rejects invalid inputs", () => {
  assert.throws(() => reviewDetention({ dockMinutes: -1 }), /Time on dock/);
  assert.throws(() => reviewDetention({ dockMinutes: 60, freeMinutes: "nope" }), /Free time/);
  assert.throws(() => reviewDetention({ dockMinutes: 60, freeMinutes: 0, ratePerHour: Number.NaN }), /Contract hourly rate/);
});

test("detention matching the clock has no recoverable overage", () => {
  const result = reviewDetention({
    dockMinutes: 180,
    freeMinutes: 120,
    ratePerHour: 75,
    billedAmount: 75,
  });
  assert.equal(result.variance, 0);
  assert.equal(result.recoverable, 0);
  assert.deepEqual(result.flags, []);
});

const PASS_THROUGH_DEFAULT = {
  billed: 300,
  expected: 75,
  collectedFreight: 180,
  backCharge: 300,
  reviewHours: 1.5,
  reviewRate: 42,
};

test("default pass-through demo: prepaid $180, $300 billed, $75 supported", () => {
  const result = comparePassThrough(PASS_THROUGH_DEFAULT);
  assert.equal(result.recoverable, 225);
  assert.equal(result.labor, 63);
  assert.equal(result.eat, -120);
  assert.equal(result.billCustomer, 180);
  assert.equal(result.reviewCredit, 42);
  assert.equal(result.reviewNoCredit, -183);
  assert.equal(result.vsEatBill, 300);
  assert.equal(result.vsEatReviewCredit, 162);
  assert.equal(result.vsBillReviewCredit, -138);
  assert.equal(result.reviewHoursCreditBuys, 5.36);
  assert.equal(result.winnerId, "bill");
  assert.equal(result.winnerKept, 180);
});

test("pass-through note stays observational and matches the default numbers", () => {
  const note = passThroughNote(comparePassThrough(PASS_THROUGH_DEFAULT));
  assert.match(note, /\$180\.00/);
  assert.match(note, /\$300\.00/);
  assert.match(note, /\$75\.00/);
  assert.match(note, /\$225\.00 gap/);
  assert.match(note, /Eating the line keeps -\$120\.00/);
  assert.match(note, /keeps \$180\.00/);
  assert.match(note, /keeps \$42\.00/);
  assert.match(note, /no credit keeps -\$183\.00/);
  assert.match(note, /5\.36 hours of review/);
  assert.match(note, /not a reason to invoice a customer or to file a claim/);
  assert.doesNotMatch(note, /must bill|should dispute|you should invoice/i);
});

test("clock-only back-charge still beats eating a $300 line", () => {
  const result = comparePassThrough({ ...PASS_THROUGH_DEFAULT, backCharge: 75 });
  assert.equal(result.billCustomer, -45);
  assert.equal(result.vsEatBill, 75);
  assert.equal(result.winnerId, "reviewCredit");
  assert.equal(result.winnerKept, 42);
});

test("already-quoted all-in freight: review-with-credit keeps more than eating", () => {
  const result = comparePassThrough({
    billed: 300,
    expected: 75,
    collectedFreight: 400,
    backCharge: 0,
    reviewHours: 1.5,
    reviewRate: 42,
  });
  assert.equal(result.eat, 100);
  assert.equal(result.billCustomer, 100);
  assert.equal(result.reviewCredit, 262);
  assert.equal(result.reviewNoCredit, 37);
  assert.equal(result.winnerId, "reviewCredit");
});

test("crumbs leftover: a $1,250 review on a $50 gap finishes behind eating", () => {
  const result = comparePassThrough({
    billed: 80,
    expected: 30,
    collectedFreight: 80,
    backCharge: 0,
    reviewHours: 10,
    reviewRate: 125,
  });
  assert.equal(result.recoverable, 50);
  assert.equal(result.labor, 1250);
  assert.equal(result.eat, 0);
  assert.equal(result.reviewCredit, -1200);
  assert.equal(result.winnerId, "eat");
});

test("pass-through rejects invalid inputs", () => {
  assert.throws(() => comparePassThrough({ billed: -1 }), /Billed accessorial/);
  assert.throws(
    () => comparePassThrough({ billed: 10, expected: "nope" }),
    /Expected \/ supported amount/,
  );
  assert.throws(
    () => comparePassThrough({ billed: 10, expected: 10, collectedFreight: Number.NaN }),
    /Freight already collected/,
  );
});

const FUEL_DEFAULT = {
  linehaul: 1200,
  contractPercent: 28,
  billedAmount: 412,
  indexPercent: 26,
  indexAdder: 2,
};

test("default fuel-surcharge demo: $1,200 linehaul, 28% contract, $412 billed", () => {
  const result = reviewFuelSurcharge(FUEL_DEFAULT);
  assert.equal(result.expectedFromContract, 336);
  assert.equal(result.billedPercent, 34.33);
  assert.equal(result.varianceVsContract, 76);
  assert.equal(result.recoverable, 76);
  assert.equal(result.indexAppliedPercent, 28);
  assert.equal(result.expectedFromIndex, 336);
  assert.equal(result.varianceVsIndex, 76);
  assert.ok(result.flags.includes("Over contract by $76.00"));
  assert.ok(result.flags.includes("Over index by $76.00"));
});

test("fuel-surcharge note stays observational and matches the default numbers", () => {
  const note = fuelSurchargeNote(reviewFuelSurcharge(FUEL_DEFAULT));
  assert.match(note, /\$1200\.00/);
  assert.match(note, /28\.00% contract rate/);
  assert.match(note, /\$336\.00/);
  assert.match(note, /\$412\.00/);
  assert.match(note, /34\.33% of linehaul/);
  assert.match(note, /\$76\.00 above the contract/);
  assert.match(note, /26\.00% plus 2\.00 points/);
  assert.match(note, /not a determination that the charge is wrong/);
  assert.doesNotMatch(note, /must dispute|should refuse|you should dispute/i);
});

test("a billed line that matches the contract has no recoverable overage", () => {
  const result = reviewFuelSurcharge({ ...FUEL_DEFAULT, billedAmount: 336 });
  assert.equal(result.varianceVsContract, 0);
  assert.equal(result.recoverable, 0);
  assert.equal(result.billedPercent, 28);
  assert.deepEqual(result.flags, []);
});

test("index-only path is omitted when no bulletin percent is typed", () => {
  const result = reviewFuelSurcharge({
    linehaul: 1200,
    contractPercent: 28,
    billedAmount: 412,
  });
  assert.equal(result.indexPercent, null);
  assert.equal(result.expectedFromIndex, null);
  assert.equal(result.varianceVsIndex, null);
  assert.doesNotMatch(fuelSurchargeNote(result), /typed index/);
  assert.match(fuelSurchargeNote(result), /No index percent was typed/);
});

test("a higher index expected amount shrinks the gap versus the bulletin", () => {
  const result = reviewFuelSurcharge({
    ...FUEL_DEFAULT,
    indexPercent: 30,
    indexAdder: 0,
  });
  assert.equal(result.expectedFromIndex, 360);
  assert.equal(result.varianceVsIndex, 52);
  assert.equal(result.varianceVsContract, 76);
});

test("fuel surcharge rejects invalid inputs", () => {
  assert.throws(() => reviewFuelSurcharge({ linehaul: -1 }), /Linehaul/);
  assert.throws(
    () => reviewFuelSurcharge({ linehaul: 100, contractPercent: 101 }),
    /Contract fuel percent must be at most 100/,
  );
  assert.throws(
    () => reviewFuelSurcharge({ linehaul: 100, contractPercent: 28, billedAmount: "nope" }),
    /Billed fuel surcharge/,
  );
  assert.throws(
    () => reviewFuelSurcharge({
      linehaul: 100,
      contractPercent: 28,
      billedAmount: 10,
      indexPercent: "",
      indexAdder: 2,
    }),
    /Index adder needs an index fuel percent/,
  );
});

test("the review CSV and the dispute draft cite how the expected amount was reached", () => {
  // A shipper asking for a credit has to be able to say what the contract
  // says the line should have cost. "Expected $65.00" is an assertion; "$65.00
  // an hour past two free hours, on three hours" is something the carrier's
  // rating desk can check against the same document.
  const results = auditCharges([
    {
      invoice: "INV-1",
      reference: "PRO-1",
      code: "DET",
      billed: "300.00",
      expected: "65.00",
      units: "3",
      basis: "1 hour past 2 free × $65.00/hour",
      evidence: "missing",
    },
  ]);
  assert.equal(results[0].basis, "1 hour past 2 free × $65.00/hour");
  const csv = csvForReview(results);
  assert.match(csv.split("\n")[0], /^Invoice,Reference,Code,Quantity,Billed,Expected,Basis,Variance,Evidence,Priority,Flags$/);
  assert.match(csv, /"3","300.00","65.00","1 hour past 2 free × \$65.00\/hour"/);
  const draft = disputeDraft({ invoice: "INV-1", carrier: "Regional LTL", results });
  assert.match(draft, /expected from 1 hour past 2 free × \$65\.00\/hour/);
});

test("a hand-typed expected amount cites no basis rather than inventing one", () => {
  const results = auditCharges([
    { invoice: "INV-1", code: "LIFT", billed: "125.00", expected: "75.00", evidence: "missing" },
  ]);
  assert.equal(results[0].basis, "");
  assert.doesNotMatch(disputeDraft({ results }), /expected from/);
});
