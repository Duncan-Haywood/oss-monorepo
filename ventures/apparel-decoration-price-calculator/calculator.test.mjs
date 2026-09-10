import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeDecorationJob,
  costOfJob,
  runCostPerPiece,
  setupCost,
  BREAK_QUANTITIES,
  METHODS,
} from "./calculator.mjs";

// A 24-piece, 3-colour front, 1-colour back screen-print job on $4.20 blanks.
const SCREEN = {
  method: "screen-print",
  quantity: 24,
  pricePerPiece: 14,
  setupFeeCharged: 0,
  targetMarginPct: 40,
  locations: 2,
  colorsPerLocation: 3,
  screenSetupCost: 18,
  pressPiecesPerHour: 90,
  inkCostPerPiecePerColor: 0.06,
  blankCostPerPiece: 4.2,
  spoilagePct: 4,
  wagePerHour: 20,
  payrollLoadPct: 18,
  artMinutes: 30,
  finishMinutesPerPiece: 0.4,
  monthlyOverhead: 5200,
  monthlyPieces: 2600,
};

const EMBROIDERY = {
  ...SCREEN,
  method: "embroidery",
  locations: 1,
  stitchCount: 9000,
  digitizingCostPerLocation: 45,
  stitchesPerMinute: 750,
  heads: 6,
  hoopMinutesPerPiece: 0.75,
  threadCostPer1000Stitches: 0.04,
  backingCostPerPlacement: 0.11,
};

const DTF = {
  ...SCREEN,
  method: "dtf",
  locations: 1,
  artWidthIn: 11,
  artHeightIn: 14,
  filmCostPerSquareInch: 0.012,
  pressSecondsPerLocation: 20,
};

test("a screen-print job charges one screen per colour per placement", () => {
  const result = computeDecorationJob(SCREEN);
  // 3 colours x 2 placements = 6 screens, not 3.
  assert.equal(result.job.setup.screenCount, 6);
  assert.equal(result.job.setup.screens, 6 * 18);
});

test("setup is flat across quantity — the whole reason a small run costs more", () => {
  const small = computeDecorationJob({ ...SCREEN, quantity: 12 });
  const large = computeDecorationJob({ ...SCREEN, quantity: 288 });
  assert.equal(small.job.setup.total, large.job.setup.total);
  assert.ok(
    small.setupPerPiece > large.setupPerPiece * 20,
    "setup per piece at 12 should be far above setup per piece at 288",
  );
  assert.ok(
    small.costPerPiece > large.costPerPiece,
    "cost per piece must fall as the run gets longer",
  );
});

test("spoilage buys whole blanks and rounds up", () => {
  const none = computeDecorationJob({ ...SCREEN, spoilagePct: 0 });
  assert.equal(none.job.blanksPurchased, 24);
  const four = computeDecorationJob({ ...SCREEN, spoilagePct: 4 });
  // 24 * 1.04 = 24.96 -> 25 whole garments, never 24.96 of one.
  assert.equal(four.job.blanksPurchased, 25);
  assert.equal(four.job.blanks, 25 * 4.2);
});

test("a 0% spoilage allowance is reported rather than silently accepted", () => {
  const result = computeDecorationJob({ ...SCREEN, spoilagePct: 0 });
  assert.ok(result.findings.some((f) => f.id === "no-spoilage-allowance"));
});

test("embroidery divides the machine cycle by the heads but never the hooping", () => {
  const one = runCostPerPiece({
    ...readable(EMBROIDERY),
    heads: 1,
  });
  const six = runCostPerPiece({
    ...readable(EMBROIDERY),
    heads: 6,
  });
  // 9000 stitches at 750spm = 12 minutes a cycle. One head: 12 + 0.75 hooping.
  // Six heads: 2 + 0.75 hooping. The hooping is identical.
  assert.equal(one.machineMinutes, 12.75);
  assert.equal(six.machineMinutes, 2.75);
});

test("embroidery consumables scale with stitch count", () => {
  const light = computeDecorationJob({ ...EMBROIDERY, stitchCount: 4000 });
  const heavy = computeDecorationJob({ ...EMBROIDERY, stitchCount: 16000 });
  assert.ok(heavy.job.run.consumables > light.job.run.consumables);
  assert.ok(heavy.costPerPiece > light.costPerPiece);
});

test("DTF has no per-job setup beyond art time", () => {
  const result = computeDecorationJob(DTF);
  assert.equal(result.job.setup.screens, 0);
  assert.equal(result.job.setup.digitizing, 0);
  assert.ok(result.job.setup.art > 0, "art time is still a real one-off cost");
  assert.equal(result.job.setup.total, result.job.setup.art);
});

test("DTF film cost follows the printed area", () => {
  const small = computeDecorationJob({ ...DTF, artWidthIn: 4, artHeightIn: 4 });
  const big = computeDecorationJob({ ...DTF, artWidthIn: 11, artHeightIn: 14 });
  assert.ok(big.job.run.consumables > small.job.run.consumables);
});

test("break-even ignores setup the shop bills as a separate line", () => {
  const absorbed = computeDecorationJob({ ...SCREEN, setupFeeCharged: 0 });
  const billed = computeDecorationJob({ ...SCREEN, setupFeeCharged: 108 });
  assert.ok(
    billed.breakEvenPricePerPiece < absorbed.breakEvenPricePerPiece,
    "billing the screens separately lowers the per-piece price that has to clear",
  );
  // 6 screens x $18 = $108, so the whole screen cost is covered and only the
  // art time is left riding on the per-piece price.
  const perPieceArt = absorbed.job.setup.art / 24;
  assert.ok(
    Math.abs(
      absorbed.breakEvenPricePerPiece - billed.breakEvenPricePerPiece - 108 / 24,
    ) < 0.01,
    "the difference should be exactly the billed setup spread over the run",
  );
  assert.ok(perPieceArt > 0);
});

test("a setup fee larger than the setup cost does not credit the job twice", () => {
  const over = computeDecorationJob({ ...SCREEN, setupFeeCharged: 1000 });
  const exact = computeDecorationJob({ ...SCREEN, setupFeeCharged: over.job.setup.total });
  assert.equal(
    over.breakEvenPricePerPiece,
    exact.breakEvenPricePerPiece,
    "over-billing setup must not push break-even below the run cost",
  );
  assert.ok(over.breakEvenPricePerPiece > 0);
});

test("revenue counts the setup fee, so profit and margin include it", () => {
  const withFee = computeDecorationJob({ ...SCREEN, setupFeeCharged: 108 });
  const without = computeDecorationJob({ ...SCREEN, setupFeeCharged: 0 });
  // Compared with a tolerance rather than strictly: both operands are already
  // rounded to cents by the calculator, and it is this subtraction in the test
  // that reintroduces binary-float dust.
  assert.ok(Math.abs(withFee.revenue - without.revenue - 108) < 0.005);
  assert.ok(Math.abs(withFee.profit - without.profit - 108) < 0.005);
});

test("the target price hits the target margin exactly", () => {
  const result = computeDecorationJob({ ...SCREEN, targetMarginPct: 40 });
  const priced = computeDecorationJob({
    ...SCREEN,
    pricePerPiece: result.targetPricePerPiece,
    targetMarginPct: 40,
  });
  assert.ok(
    Math.abs(priced.marginPct - 40) < 0.6,
    `expected about 40% margin at the target price, got ${priced.marginPct}%`,
  );
});

test("a target margin above 95% is clamped rather than dividing by zero", () => {
  const result = computeDecorationJob({ ...SCREEN, targetMarginPct: 300 });
  assert.ok(Number.isFinite(result.targetPricePerPiece));
  assert.ok(result.targetPricePerPiece > 0);
});

test("the break table covers the industry tiers and marks the quoted quantity", () => {
  const result = computeDecorationJob({ ...SCREEN, quantity: 24 });
  const quantities = result.quantityBreaks.map((b) => b.quantity);
  for (const tier of BREAK_QUANTITIES) assert.ok(quantities.includes(tier), `${tier} missing`);
  assert.equal(result.quantityBreaks.filter((b) => b.isQuoted).length, 1);
  assert.equal(result.quantityBreaks.find((b) => b.isQuoted).quantity, 24);
});

test("an off-tier quoted quantity is inserted in sorted order, not appended", () => {
  const result = computeDecorationJob({ ...SCREEN, quantity: 60 });
  const quantities = result.quantityBreaks.map((b) => b.quantity);
  assert.deepEqual(quantities, [...quantities].sort((a, b) => a - b));
  assert.ok(quantities.includes(60));
});

test("the break table's cost per piece falls monotonically with quantity", () => {
  const result = computeDecorationJob(SCREEN);
  for (let i = 1; i < result.quantityBreaks.length; i += 1) {
    assert.ok(
      result.quantityBreaks[i].costPerPiece <= result.quantityBreaks[i - 1].costPerPiece,
      `cost per piece rose from ${result.quantityBreaks[i - 1].quantity} to ${result.quantityBreaks[i].quantity}`,
    );
  }
});

test("the break table agrees with the headline figure at the quoted quantity", () => {
  const result = computeDecorationJob(SCREEN);
  const quoted = result.quantityBreaks.find((b) => b.isQuoted);
  assert.equal(quoted.costPerPiece, result.costPerPiece);
  assert.equal(quoted.breakEvenPricePerPiece, result.breakEvenPricePerPiece);
});

test("a price below cost is reported as a loss with the shortfall named", () => {
  const result = computeDecorationJob({ ...SCREEN, pricePerPiece: 5 });
  assert.ok(result.profit < 0);
  const finding = result.findings.find((f) => f.id === "below-break-even");
  assert.ok(finding, "a below-cost price must be reported");
  assert.doesNotMatch(finding.title, /\$-/, "the minus sign belongs outside the currency symbol");
});

test("setup dominating a short run is called out, and stops being called out on a long one", () => {
  const short = computeDecorationJob({ ...SCREEN, quantity: 12 });
  const long = computeDecorationJob({ ...SCREEN, quantity: 288 });
  assert.ok(short.findings.some((f) => f.id === "setup-dominates"));
  assert.ok(!long.findings.some((f) => f.id === "setup-dominates"));
});

test("a second placement is flagged for screen printing only", () => {
  const two = computeDecorationJob({ ...SCREEN, locations: 2 });
  assert.ok(two.findings.some((f) => f.id === "second-location-doubles-screens"));
  const oneUp = computeDecorationJob({ ...SCREEN, locations: 1 });
  assert.ok(!oneUp.findings.some((f) => f.id === "second-location-doubles-screens"));
  const stitched = computeDecorationJob({ ...EMBROIDERY, locations: 2 });
  assert.ok(!stitched.findings.some((f) => f.id === "second-location-doubles-screens"));
});

test("digitising is flagged when nothing is billed against it", () => {
  const absorbed = computeDecorationJob({ ...EMBROIDERY, setupFeeCharged: 0 });
  assert.ok(absorbed.findings.some((f) => f.id === "digitizing-not-recovered"));
  const billed = computeDecorationJob({ ...EMBROIDERY, setupFeeCharged: 45 });
  assert.ok(!billed.findings.some((f) => f.id === "digitizing-not-recovered"));
});

test("the standing caveat is always present, whatever the inputs", () => {
  for (const method of METHODS) {
    const result = computeDecorationJob({ ...SCREEN, method });
    assert.ok(result.findings.some((f) => f.id === "rates-are-yours"), method);
  }
  assert.ok(computeDecorationJob({}).findings.some((f) => f.id === "rates-are-yours"));
});

test("an unknown method falls back to screen printing rather than producing nothing", () => {
  const result = computeDecorationJob({ ...SCREEN, method: "sublimation" });
  assert.equal(result.method, "screen-print");
  assert.ok(result.costPerPiece > 0);
});

test("empty and hostile input produce a finite, non-negative answer instead of throwing", () => {
  for (const input of [
    {},
    { quantity: -5, pricePerPiece: -2, blankCostPerPiece: -1 },
    { quantity: 24, heads: 0, stitchesPerMinute: 0, pressPiecesPerHour: 0, locations: 0 },
    { quantity: Number.NaN, wagePerHour: Number.POSITIVE_INFINITY },
    { quantity: 24, spoilagePct: Number.NaN, method: "embroidery" },
  ]) {
    const result = computeDecorationJob(input);
    assert.ok(Number.isFinite(result.costPerPiece), JSON.stringify(input));
    assert.ok(result.costPerPiece >= 0, JSON.stringify(input));
    assert.ok(Array.isArray(result.findings) && result.findings.length > 0);
    for (const row of result.quantityBreaks) {
      assert.ok(Number.isFinite(row.costPerPiece));
    }
  }
});

test("a fractional quantity is rounded to whole pieces, not carried", () => {
  const result = computeDecorationJob({ ...SCREEN, quantity: 24.6 });
  assert.equal(result.job.quantity, 25);
});

test("overhead only enters the cost when both monthly figures are given", () => {
  const without = computeDecorationJob({ ...SCREEN, monthlyOverhead: 0, monthlyPieces: 0 });
  const with_ = computeDecorationJob(SCREEN);
  assert.equal(without.job.overhead, 0);
  assert.ok(with_.job.overhead > 0);
  assert.ok(without.findings.some((f) => f.id === "no-overhead-allocated"));
  assert.ok(!with_.findings.some((f) => f.id === "no-overhead-allocated"));
});

test("costOfJob and setupCost are the same arithmetic the report uses", () => {
  const rates = readable(SCREEN);
  rates.overheadPerPiece = 5200 / 2600;
  const direct = costOfJob(24, rates);
  const viaReport = computeDecorationJob(SCREEN).job;
  assert.equal(direct.total, viaReport.total);
  assert.equal(setupCost(rates).total, viaReport.setup.total);
});

// The report normalises its input before costing; the two exported helpers take
// already-normalised rates. This mirrors that normalisation for the tests that
// call them directly, so a test never asserts against a shape the report cannot
// produce.
function readable(input) {
  return {
    method: input.method,
    wagePerHour: input.wagePerHour,
    payrollLoadPct: input.payrollLoadPct,
    artMinutes: input.artMinutes,
    finishMinutesPerPiece: input.finishMinutesPerPiece,
    blankCostPerPiece: input.blankCostPerPiece,
    spoilagePct: input.spoilagePct,
    locations: input.locations ?? 1,
    colorsPerLocation: input.colorsPerLocation ?? 1,
    screenSetupCost: input.screenSetupCost ?? 0,
    pressPiecesPerHour: input.pressPiecesPerHour ?? 1,
    inkCostPerPiecePerColor: input.inkCostPerPiecePerColor ?? 0,
    stitchCount: input.stitchCount ?? 0,
    digitizingCostPerLocation: input.digitizingCostPerLocation ?? 0,
    stitchesPerMinute: input.stitchesPerMinute ?? 1,
    heads: input.heads ?? 1,
    hoopMinutesPerPiece: input.hoopMinutesPerPiece ?? 0,
    threadCostPer1000Stitches: input.threadCostPer1000Stitches ?? 0,
    backingCostPerPlacement: input.backingCostPerPlacement ?? 0,
    artWidthIn: input.artWidthIn ?? 0,
    artHeightIn: input.artHeightIn ?? 0,
    filmCostPerSquareInch: input.filmCostPerSquareInch ?? 0,
    pressSecondsPerLocation: input.pressSecondsPerLocation ?? 0,
    overheadPerPiece: 0,
  };
}

test("a price above cost but under the margin target is reported as such", () => {
  const result = computeDecorationJob({ ...SCREEN, pricePerPiece: 14, targetMarginPct: 40 });
  assert.ok(result.profit > 0, "the example must be profitable, just thin");
  assert.ok(result.findings.some((f) => f.id === "below-target-margin"));
  assert.ok(!result.findings.some((f) => f.id === "below-break-even"));
});

test("a price at the target margin reports neither shortfall finding", () => {
  const target = computeDecorationJob({ ...SCREEN, targetMarginPct: 40 }).targetPricePerPiece;
  const result = computeDecorationJob({
    ...SCREEN,
    pricePerPiece: target,
    targetMarginPct: 40,
  });
  assert.ok(!result.findings.some((f) => f.id === "below-target-margin"));
  assert.ok(!result.findings.some((f) => f.id === "below-break-even"));
});
