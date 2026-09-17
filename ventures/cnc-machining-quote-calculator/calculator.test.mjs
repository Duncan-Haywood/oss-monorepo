import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BREAK_QUANTITIES,
  SEVERITY,
  STOCK_FORMS,
  computeMachiningJob,
  costOfLot,
  lotCosts,
  partsPerStockUnit,
  partsToStart,
} from "./calculator.mjs";

/** A complete, realistic 2-axis turned part: 1.25" 304 bar, 12 ft lengths.
 *  Every number here is a stand-in for something a shop reads off its own
 *  paperwork; none of it is asserted as a market figure. */
const BASE = {
  quantity: 50,
  pricePerPart: 38,
  setupFeeCharged: 0,
  targetMargin: 35,
  scrapPct: 3,

  stockForm: "bar",
  barLengthIn: 144,
  barEndLossIn: 4,
  stockUnitCost: 118,
  partLengthIn: 2.5,
  partingAllowanceIn: 0.14,

  cycleMinutesPerPart: 4.2,
  handlingMinutesPerPart: 0.8,
  machineBurdenPerHour: 22,

  hourlyWage: 28,
  burdenRate: 26,
  overheadRate: 18,

  setupHours: 2.5,
  programmingHours: 3,
  amortiseProgrammingOverParts: 50,

  toolCostPerCuttingEdge: 9.4,
  partsPerCuttingEdge: 60,

  firstArticleHours: 1.2,
  inspectionMinutesPerPart: 0.6,

  outsideCostPerPart: 0,
  outsideLotMinimum: 0,
};

const findingTitles = (result) => result.findings.map((f) => f.title);

test("the module exposes the shapes the page depends on", () => {
  assert.deepEqual(STOCK_FORMS, ["bar", "plate", "supplied"]);
  assert.deepEqual(BREAK_QUANTITIES, [1, 5, 10, 25, 50, 100, 250, 500]);
  assert.equal(BREAK_QUANTITIES.length, new Set(BREAK_QUANTITIES).size);
  // Ascending, so the break table reads as a curve rather than a jumble.
  assert.deepEqual(BREAK_QUANTITIES, [...BREAK_QUANTITIES].sort((a, b) => a - b));
});

// --- Effect 3: scrap is an integer -----------------------------------------

test("parts to start is yield-based, not the naive quantity times one plus scrap", () => {
  // 100 good at 10% fallout: 100/0.9 = 111.1 -> 112. The naive form gives 110.
  assert.equal(partsToStart(100, 10), 112);
  assert.notEqual(partsToStart(100, 10), 110);
});

test("the ceiling dominates the entered rate on a short run", () => {
  // 10 good parts at 3%: 10/0.97 = 10.3 -> 11, an effective 10% not 3%.
  assert.equal(partsToStart(10, 3), 11);
  const short = computeMachiningJob({ ...BASE, quantity: 10 });
  assert.equal(short.starts, 11);
  assert.equal(short.effectiveScrapPct, 10);
  assert.ok(
    findingTitles(short).some((t) => t.includes("3% scrap allowance costs you 10%")),
    `expected the scrap-rounding finding, got ${JSON.stringify(findingTitles(short))}`,
  );
});

test("a zero scrap allowance starts exactly the order quantity", () => {
  assert.equal(partsToStart(50, 0), 50);
  const result = computeMachiningJob({ ...BASE, scrapPct: 0 });
  assert.equal(result.starts, 50);
  assert.equal(result.effectiveScrapPct, 0);
});

test("a nonsensical scrap rate never yields fewer starts than good parts", () => {
  assert.equal(partsToStart(20, 100), 20);
  assert.equal(partsToStart(20, 150), 20);
  assert.equal(partsToStart(20, Number.NaN), 20);
  assert.equal(partsToStart(20, -5), 20);
});

// --- Effect 2: material is a step function ---------------------------------

test("bar yield takes the end loss off once and the parting cut off every part", () => {
  // (144 - 4) / (2.5 + 0.14) = 53.03 -> 53 parts.
  assert.equal(partsPerStockUnit(BASE), 53);
});

test("plate yield tries the part both ways round and keeps the better nest", () => {
  const plate = {
    stockForm: "plate",
    sheetLengthIn: 48,
    sheetWidthIn: 24,
    partLengthIn: 10,
    partWidthIn: 7,
    nestGapIn: 0,
  };
  // As-is: floor(48/10) * floor(24/7) = 4 * 3 = 12.
  // Rotated: floor(48/7) * floor(24/10) = 6 * 2 = 12. Equal here.
  assert.equal(partsPerStockUnit(plate), 12);
  // Make the rotation strictly better: 48x24 with an 11x5 part.
  // As-is floor(48/11)*floor(24/5) = 4*4 = 16; rotated floor(48/5)*floor(24/11) = 9*2 = 18.
  assert.equal(partsPerStockUnit({ ...plate, partLengthIn: 11, partWidthIn: 5 }), 18);
});

test("a part too large for the stock yields nothing and is reported, not divided by", () => {
  assert.equal(partsPerStockUnit({ ...BASE, partLengthIn: 200 }), 0);
  const result = computeMachiningJob({ ...BASE, partLengthIn: 200, quantity: 5 });
  assert.equal(result.partsPerStockUnit, 0);
  assert.ok(Number.isFinite(result.costPerPart), "cost per part must stay finite");
  const fit = result.findings.find((f) => f.title.includes("does not fit the stock"));
  assert.ok(fit, "expected the does-not-fit finding");
  assert.equal(fit.severity, SEVERITY.HIGH);
});

test("material cost steps with whole stock units rather than scaling per part", () => {
  // 53 parts per bar. 50 good at 3% starts 52 -> still one bar.
  const one = lotCosts(50, BASE);
  assert.equal(one.stockUnitsNeeded, 1);
  assert.equal(one.lines.material, 118);

  // 53 good at 3% starts 55 -> a second bar, and material doubles on one part.
  const two = lotCosts(53, BASE);
  assert.equal(two.starts, 55);
  assert.equal(two.stockUnitsNeeded, 2);
  assert.equal(two.lines.material, 236);
});

test("spare parts already paid for in the stock are counted and surfaced", () => {
  const result = computeMachiningJob({ ...BASE, quantity: 40 });
  // 40 good at 3% starts 42; one bar yields 53; 11 parts' material is bought.
  assert.equal(result.starts, 42);
  assert.equal(result.sparePartsInStock, 11);
  assert.ok(
    findingTitles(result).some((t) => t.includes("11 more parts' worth of material")),
    `expected the spare-material finding, got ${JSON.stringify(findingTitles(result))}`,
  );
});

test("customer-supplied material is costed per part with no yield question", () => {
  const supplied = computeMachiningJob({
    ...BASE,
    stockForm: "supplied",
    materialCostPerPart: 6.5,
  });
  assert.equal(supplied.stockUnitsNeeded, null);
  assert.equal(supplied.sparePartsInStock, 0);
  assert.equal(supplied.lines.material, round2(6.5 * supplied.starts));
  // And no does-not-fit or spare-material finding applies.
  assert.ok(!findingTitles(supplied).some((t) => t.includes("does not fit the stock")));
  assert.ok(!findingTitles(supplied).some((t) => t.includes("worth of material")));
});

// --- Effect 1: per-lot work amortises ---------------------------------------

test("flat per-lot work collapses per part as the lot grows", () => {
  const one = costOfLot(1, BASE);
  const fiveHundred = costOfLot(500, BASE);
  assert.ok(
    one.perLotCostPerPart > fiveHundred.perLotCostPerPart * 50,
    `expected a steep collapse, got ${one.perLotCostPerPart} vs ${fiveHundred.perLotCostPerPart}`,
  );
  // Cost per part must fall monotonically across the tiers for a job whose
  // only quantity-dependent structure is amortisation and material steps.
  const perPart = BREAK_QUANTITIES.map((q) => costOfLot(q, BASE).costPerPart);
  for (let i = 1; i < perPart.length; i += 1) {
    assert.ok(
      perPart[i] <= perPart[i - 1],
      `cost per part rose from ${perPart[i - 1]} at ${BREAK_QUANTITIES[i - 1]} to ${perPart[i]} at ${BREAK_QUANTITIES[i]}`,
    );
  }
});

test("programming amortises over the parts the program will make, not just this lot", () => {
  const thisLot = computeMachiningJob({ ...BASE, amortiseProgrammingOverParts: 50 });
  const overFive = computeMachiningJob({ ...BASE, amortiseProgrammingOverParts: 500 });
  assert.ok(
    overFive.lines.programming < thisLot.lines.programming,
    "spreading the program over more parts must lower this lot's share",
  );
  // A tenth of the lifetime run carries a tenth of the programming.
  assert.equal(overFive.lines.programming, round2(thisLot.lines.programming / 10));
  // Never less than this lot's own share: an under-entry cannot create a discount.
  const understated = computeMachiningJob({ ...BASE, amortiseProgrammingOverParts: 5 });
  assert.equal(understated.lines.programming, thisLot.lines.programming);
});

test("the small-lot finding names the flat share and what it would be at 100", () => {
  const one = computeMachiningJob({ ...BASE, quantity: 1 });
  const small = one.findings.find((f) => f.title.includes("first article are"));
  assert.ok(small, `expected the flat-share finding, got ${JSON.stringify(findingTitles(one))}`);
  assert.equal(small.severity, SEVERITY.MEDIUM);
  assert.match(small.detail, /at 100 pieces/);
});

test("setup ties up the machine as well as the operator", () => {
  const withBurden = lotCosts(50, BASE);
  const noBurden = lotCosts(50, { ...BASE, machineBurdenPerHour: 0 });
  assert.equal(withBurden.lines.setupMachine, round2(2.5 * 22));
  assert.equal(noBurden.lines.setupMachine, 0);
  assert.ok(withBurden.totalCost > noBurden.totalCost);
});

// --- Effect 4: outside-process lot minimums --------------------------------

test("the outside-process minimum is charged when the per-part rate falls short", () => {
  const rates = { ...BASE, outsideCostPerPart: 2.1, outsideLotMinimum: 75 };
  const small = computeMachiningJob({ ...rates, quantity: 5 });
  // 5 good at 3% starts 6; 6 * 2.10 = 12.60, under the 75 minimum.
  assert.equal(small.starts, 6);
  assert.equal(small.lines.outside, 75);
  assert.ok(
    findingTitles(small).some((t) => t.includes("lot minimum is what prices this run")),
    `expected the lot-minimum finding, got ${JSON.stringify(findingTitles(small))}`,
  );

  // At 100 the rate exceeds the minimum and the finding goes away.
  const large = computeMachiningJob({ ...rates, quantity: 100 });
  assert.ok(large.lines.outside > 75);
  assert.ok(!findingTitles(large).some((t) => t.includes("lot minimum is what prices")));
});

test("the outside process is charged on parts started, not parts shipped", () => {
  const rates = { ...BASE, quantity: 10, outsideCostPerPart: 4, outsideLotMinimum: 0 };
  const result = computeMachiningJob(rates);
  assert.equal(result.starts, 11);
  assert.equal(result.lines.outside, 44); // the plater does not refund your scrap
});

// --- Price, margin and the quote itself ------------------------------------

test("break-even, target price and margin agree with each other", () => {
  const result = computeMachiningJob(BASE);
  assert.equal(result.breakEvenPricePerPart, result.costPerPart);
  // Target price must yield exactly the target margin.
  // The target price is rounded to whole cents, so the margin it implies can sit
  // half a cent either side of the target. On a part of this price that is well
  // under 0.05 of a percentage point.
  const impliedMargin =
    ((result.targetPricePerPart - result.costPerPart) / result.targetPricePerPart) * 100;
  assert.ok(Math.abs(impliedMargin - 35) < 0.05, `implied margin ${impliedMargin}`);
  // Quoting the target price exactly hits the target margin.
  const atTarget = computeMachiningJob({ ...BASE, pricePerPart: result.targetPricePerPart });
  assert.ok(Math.abs(atTarget.marginPct - 35) < 0.1, `margin at target ${atTarget.marginPct}`);
});

test("a price under cost is a HIGH finding that names the per-part and per-lot loss", () => {
  const result = computeMachiningJob({ ...BASE, pricePerPart: 5 });
  assert.ok(result.profit < 0);
  const loss = result.findings.find((f) => f.title.includes("below your cost"));
  assert.ok(loss, `expected the below-cost finding, got ${JSON.stringify(findingTitles(result))}`);
  assert.equal(loss.severity, SEVERITY.HIGH);
  assert.equal(result.findings[0].severity, SEVERITY.HIGH, "the loss must sort first");
});

test("a separately billed setup fee lowers what the per-part price must clear", () => {
  const withFee = computeMachiningJob({ ...BASE, setupFeeCharged: 400 });
  const without = computeMachiningJob({ ...BASE, setupFeeCharged: 0 });
  assert.equal(withFee.totalCost, without.totalCost, "a fee is revenue, not a cost change");
  assert.ok(withFee.breakEvenExcludingSetupFee < without.breakEvenExcludingSetupFee);
  assert.ok(withFee.revenue > without.revenue);
  assert.ok(withFee.profit > without.profit);
});

test("a below-target but profitable price is MEDIUM, not HIGH", () => {
  // Cost per part on the base case is about $16.13 and the 35% target needs
  // about $24.81, so $20 clears cost while missing the target.
  const result = computeMachiningJob({ ...BASE, pricePerPart: 20 });
  assert.ok(result.profit > 0, "this price should be profitable");
  assert.ok(result.marginPct < 35, "and under its target");
  const under = result.findings.find((f) => f.title.includes("under your"));
  assert.ok(under, `expected the under-target finding, got ${JSON.stringify(findingTitles(result))}`);
  assert.equal(under.severity, SEVERITY.MEDIUM);
  assert.ok(!findingTitles(result).some((t) => t.includes("below your cost")));
});

test("overhead is applied to direct cost and nothing else", () => {
  const plain = lotCosts(50, { ...BASE, overheadRate: 0 });
  const loaded = lotCosts(50, { ...BASE, overheadRate: 18 });
  assert.equal(plain.overheadCost, 0);
  assert.equal(plain.totalCost, plain.directCost);
  assert.equal(loaded.overheadCost, round2(loaded.directCost * 0.18));
  assert.equal(loaded.totalCost, round2(loaded.directCost + loaded.overheadCost));
});

test("the breakdown on screen adds up exactly, at every quantity", () => {
  // A machinist reads this column and checks it. Composing the totals from the
  // unrounded values makes each figure marginally more accurate and leaves the
  // column off by a cent, which is the more expensive kind of wrong.
  for (const q of [...BREAK_QUANTITIES, 37, 7]) {
    const lot = lotCosts(q, BASE);
    const sumOfLines = round2(Object.values(lot.lines).reduce((a, b) => a + b, 0));
    assert.equal(sumOfLines, lot.directCost, `lines do not sum to direct cost at qty ${q}`);
    assert.equal(
      round2(lot.perLotCost + lot.perPartCost),
      lot.directCost,
      `per-lot plus per-part does not equal direct cost at qty ${q}`,
    );
    assert.equal(
      round2(lot.directCost + lot.overheadCost),
      lot.totalCost,
      `direct plus overhead does not equal total at qty ${q}`,
    );
  }
});

test("payroll burden loads the wage used for every hour of labour", () => {
  const result = lotCosts(50, BASE);
  assert.equal(result.loadedWage, round2(28 * 1.26));
  const unburdened = lotCosts(50, { ...BASE, burdenRate: 0 });
  assert.equal(unburdened.loadedWage, 28);
  assert.ok(result.lines.setupLabour > unburdened.lines.setupLabour);
  assert.ok(result.lines.runLabour > unburdened.lines.runLabour);
});

test("the break table marks the quoted quantity and stays consistent with the headline", () => {
  const result = computeMachiningJob(BASE);
  const quoted = result.table.filter((r) => r.isQuoted);
  assert.equal(quoted.length, 1);
  assert.equal(quoted[0].quantity, 50);
  assert.equal(quoted[0].costPerPart, result.costPerPart);
  assert.equal(quoted[0].targetPricePerPart, result.targetPricePerPart);
});

test("a quantity off the standard tiers still appears in the headline and not the table", () => {
  const result = computeMachiningJob({ ...BASE, quantity: 37 });
  assert.equal(result.quantity, 37);
  assert.ok(!result.table.some((r) => r.isQuoted));
  assert.ok(result.costPerPart > 0);
});

test("the dominant-cost note picks material or machine time, never both", () => {
  const materialHeavy = computeMachiningJob({
    ...BASE,
    stockUnitCost: 900,
    cycleMinutesPerPart: 0.5,
    handlingMinutesPerPart: 0.1,
  });
  const timeHeavy = computeMachiningJob({
    ...BASE,
    stockUnitCost: 12,
    cycleMinutesPerPart: 45,
  });
  const notes = (r) => r.findings.filter((f) => f.title.includes("direct cost of this job"));
  assert.equal(notes(materialHeavy).length, 1);
  assert.match(notes(materialHeavy)[0].title, /^Material is/);
  assert.equal(notes(timeHeavy).length, 1);
  assert.match(notes(timeHeavy)[0].title, /^Machine and run labour are/);
});

test("findings are sorted most severe first", () => {
  const result = computeMachiningJob({
    ...BASE,
    quantity: 2,
    pricePerPart: 3,
    outsideCostPerPart: 2,
    outsideLotMinimum: 120,
  });
  const order = [SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
  const ranks = result.findings.map((f) => order.indexOf(f.severity));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.ok(result.findings.length >= 3, "this input should raise several findings");
});

// --- Robustness: the page passes whatever is in the boxes -------------------

test("an entirely empty input produces a finite, non-throwing result", () => {
  const result = computeMachiningJob();
  assert.equal(result.quantity, 1);
  assert.ok(Number.isFinite(result.costPerPart));
  assert.ok(Number.isFinite(result.totalCost));
  assert.ok(Number.isFinite(result.marginPct));
  assert.equal(result.table.length, BREAK_QUANTITIES.length);
  for (const row of result.table) assert.ok(Number.isFinite(row.costPerPart));
});

test("garbage, negative and missing numbers fall back instead of poisoning the total", () => {
  const result = computeMachiningJob({
    quantity: -4,
    pricePerPart: Number.NaN,
    hourlyWage: "twenty",
    cycleMinutesPerPart: -10,
    stockUnitCost: Number.POSITIVE_INFINITY,
    overheadRate: Number.NaN,
    targetMargin: 250,
    partsPerCuttingEdge: 0,
    barLengthIn: 0,
  });
  assert.equal(result.quantity, 1);
  assert.ok(Number.isFinite(result.costPerPart), "cost per part stayed finite");
  assert.ok(Number.isFinite(result.targetPricePerPart));
  assert.ok(result.costPerPart >= 0);
});

test("a margin target of 100% or more cannot divide by zero", () => {
  const result = computeMachiningJob({ ...BASE, targetMargin: 100 });
  assert.ok(Number.isFinite(result.targetPricePerPart));
  assert.equal(result.targetPricePerPart, result.costPerPart);
});

test("an unknown stock form falls back to bar rather than throwing", () => {
  const result = computeMachiningJob({ ...BASE, stockForm: "unobtainium" });
  assert.equal(result.stockForm, "bar");
  assert.equal(result.partsPerStockUnit, 53);
});

test("computing twice with the same input gives the same answer", () => {
  assert.deepEqual(computeMachiningJob(BASE), computeMachiningJob(BASE));
});

test("the input object is never mutated", () => {
  const input = { ...BASE };
  const snapshot = JSON.stringify(input);
  computeMachiningJob(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test("every money figure is rounded to whole cents", () => {
  const result = computeMachiningJob(BASE);
  const cents = (n) => assert.equal(n, round2(n), `${n} is not a whole number of cents`);
  cents(result.costPerPart);
  cents(result.totalCost);
  cents(result.directCost);
  cents(result.overheadCost);
  cents(result.targetPricePerPart);
  cents(result.breakEvenPricePerPart);
  for (const value of Object.values(result.lines)) cents(value);
  for (const row of result.table) {
    cents(row.costPerPart);
    cents(row.targetPricePerPart);
  }
});

test("no finding text leaks a raw floating-point artefact", () => {
  const result = computeMachiningJob({ ...BASE, quantity: 3, pricePerPart: 2 });
  for (const f of result.findings) {
    assert.doesNotMatch(f.title + f.detail, /\d\.\d{3,}/, `long decimal in: ${f.title}`);
    assert.doesNotMatch(f.title + f.detail, /NaN|Infinity|undefined|null/);
    assert.doesNotMatch(f.title + f.detail, /\$-/, "sign must sit outside the symbol");
  }
});

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
