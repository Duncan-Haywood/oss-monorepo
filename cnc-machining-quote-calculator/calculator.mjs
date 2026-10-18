/**
 * Job costing for a CNC machine shop quoting a part — as one deterministic
 * function with no dependencies.
 *
 * The question this answers is the one that decides whether a job shop makes
 * money on a purchase order: what does one finished part actually cost once the
 * one-off work for *this part* is amortised over *this lot size*, and what price
 * per part clears that cost.
 *
 * Four things a flat "$38 a part" price hides, and all four are modelled here:
 *
 *   1. Setup, programming and first-article inspection are per *lot*, not per
 *      part. Dialling in a fixture, proving out a program and writing the FAI
 *      report cost the same whether the order is 5 pieces or 500. Spread over 5
 *      they can exceed the machining itself; over 500 they round to cents.
 *      Quoting both off one price list is the classic way to lose money on the
 *      short run while being uncompetitive on the long one.
 *
 *   2. Material is bought in whole stock units, never by the part. A 12 ft bar
 *      that yields 40 pieces costs the same whether you cut 31 or 40 out of it,
 *      so material cost per part is a *step function*, not a rate. The 32nd part
 *      costs nothing in material; the 41st costs a whole new bar. Shops that
 *      divide a bar price by an ideal parts-per-bar figure miss both edges.
 *
 *   3. Scrap is an integer. To ship 10 good parts at a 3% fallout you do not
 *      start 10.3 — you start 11, which is a 10% hit on material and machine
 *      time, not 3%. On short runs that ceiling rounding dominates the rate
 *      that was entered, and it is invisible in a percentage.
 *
 *   4. Outside processes carry lot minimums that behave exactly like a second
 *      setup. Anodising at $2.10 a part with a $75 lot minimum is $15.00 a part
 *      on a 5-piece run and $2.10 a part at 100. The minimum, not the rate, is
 *      what prices the short run.
 *
 * Nothing here asserts a price the shop should charge, what any material
 * actually costs, what a cycle time ought to be, or what a competitor quotes.
 * Every rate is a number the shop reads off its own supplier invoices, payroll,
 * tooling records and machine monitor.
 */

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

/** How the raw material is bought. `bar` cuts parts along a length of round or
 *  square bar; `plate` nests them out of a rectangular sheet; `supplied` is a
 *  known cost per part — a casting, a customer-supplied blank, or a near-net
 *  forging — where yield is somebody else's problem. */
export const STOCK_FORMS = ["bar", "plate", "supplied"];

/** Quantities the break table is drawn at. These are the lot sizes a job shop
 *  is actually asked to quote — a one-off prototype, a short proveout run, then
 *  the production tiers — so the curve lines up with the RFQ in front of them. */
export const BREAK_QUANTITIES = [1, 5, 10, 25, 50, 100, 250, 500];

function round(n, places = 2) {
  const factor = 10 ** places;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/** Non-negative finite, else the fallback. Used for every cost and rate: a
 *  negative material price or a negative cycle time is a typo, not an input. */
function num(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Strictly positive finite, else the fallback. Used for divisors and for
 *  dimensions, where zero would produce an Infinity rather than an answer. */
function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function wholePositive(value, fallback) {
  const n = positive(value, fallback);
  return Math.max(1, Math.floor(n));
}

function normaliseStockForm(value) {
  return STOCK_FORMS.includes(value) ? value : "bar";
}

/** A percentage that has to stay below 100 to mean anything: a 100% margin is a
 *  division by zero, and a 100% scrap rate never yields a good part. */
function fractionBelowOne(pct, fallback = 0) {
  const raw = Number.isFinite(pct) && pct >= 0 && pct < 100 ? pct : fallback;
  return raw / 100;
}

/**
 * Parts obtainable from one stock unit.
 *
 * Bar: the chuck grip and the unusable far end come off the length once, then
 * each part consumes its own length plus the parting cut and facing allowance.
 * Plate: a plain rectangular grid, tried both ways round, because rotating the
 * part 90° in the nest frequently changes the yield and no shop nests a simple
 * blank on the diagonal. This is deliberately not a real nesting algorithm —
 * `cut-list-optimizer` is the tool for that — it is the conservative figure a
 * shop would arrive at with a tape measure, which is the right basis for a quote.
 *
 * Returns 0 when the part does not fit the stock at all, which the caller
 * surfaces as a finding rather than dividing by it.
 */
export function partsPerStockUnit(rates) {
  const form = normaliseStockForm(rates.stockForm);
  if (form === "supplied") return 1;

  if (form === "bar") {
    const usable = positive(rates.barLengthIn, 144) - num(rates.barEndLossIn, 0);
    const perPart = positive(rates.partLengthIn, 1) + num(rates.partingAllowanceIn, 0);
    if (usable <= 0 || perPart <= 0) return 0;
    return Math.max(0, Math.floor(usable / perPart));
  }

  const gap = num(rates.nestGapIn, 0);
  const sheetL = positive(rates.sheetLengthIn, 48);
  const sheetW = positive(rates.sheetWidthIn, 24);
  const partL = positive(rates.partLengthIn, 1) + gap;
  const partW = positive(rates.partWidthIn, 1) + gap;
  const asIs = Math.floor(sheetL / partL) * Math.floor(sheetW / partW);
  const rotated = Math.floor(sheetL / partW) * Math.floor(sheetW / partL);
  return Math.max(0, asIs, rotated);
}

/**
 * Parts that have to be *started* to ship `quantity` good ones.
 *
 * Yield-based and then rounded up to a whole part, because both matter. Shops
 * commonly compute `quantity * (1 + scrap)`, which understates: at a 10% fallout
 * you do not need 110 starts to get 100 good, you need 112 (100 / 0.9 = 111.1,
 * and you cannot start a tenth of a part). The gap widens as the rate does, and
 * the ceiling is what dominates on short runs.
 */
export function partsToStart(quantity, scrapPct) {
  const qty = wholePositive(quantity, 1);
  const yieldFraction = 1 - fractionBelowOne(scrapPct, 0);
  if (yieldFraction <= 0) return qty;
  return Math.max(qty, Math.ceil(qty / yieldFraction));
}

/**
 * Every cost line for one lot, in dollars, before overhead and margin.
 *
 * Split into `perLot` (flat, and therefore the whole reason a short run is
 * expensive per part) and `perPart` (scales with how many parts are started).
 * Keeping the two apart is what lets the caller explain the quantity curve
 * rather than just draw it.
 */
export function lotCosts(quantity, rates) {
  const qty = wholePositive(quantity, 1);
  const starts = partsToStart(qty, rates.scrapPct);

  const loadedWage =
    num(rates.hourlyWage, 0) * (1 + num(rates.burdenRate, 0) / 100);
  const machineBurden = num(rates.machineBurdenPerHour, 0);

  // --- Material -----------------------------------------------------------
  const form = normaliseStockForm(rates.stockForm);
  const perStock = partsPerStockUnit(rates);
  let materialCost;
  let stockUnitsNeeded = null;
  let sparePartsInStock = 0;

  if (form === "supplied") {
    materialCost = num(rates.materialCostPerPart, 0) * starts;
  } else if (perStock <= 0) {
    // The part does not fit the stock described. Charging one whole stock unit
    // per started part is the only defensible reading, and the finding says so
    // loudly rather than letting a silent Infinity reach the quote.
    stockUnitsNeeded = starts;
    materialCost = num(rates.stockUnitCost, 0) * starts;
  } else {
    stockUnitsNeeded = Math.ceil(starts / perStock);
    materialCost = num(rates.stockUnitCost, 0) * stockUnitsNeeded;
    sparePartsInStock = perStock * stockUnitsNeeded - starts;
  }

  // --- Machine and run labour --------------------------------------------
  // Handling is added to the cycle because the machine is occupied for both,
  // and the operator is present for both. A shop running lights-out or one
  // operator across several machines enters a lower wage, not a shorter cycle.
  const runMinutesPerPart =
    num(rates.cycleMinutesPerPart, 0) + num(rates.handlingMinutesPerPart, 0);
  const runHours = (runMinutesPerPart * starts) / 60;
  const runLabour = runHours * loadedWage;
  const runMachine = runHours * machineBurden;

  // --- Setup (flat per lot) ----------------------------------------------
  // The machine burden applies during setup too: the spindle is not cutting,
  // but the machine is unavailable for other work, which is exactly what a
  // machine rate is for.
  const setupHours = num(rates.setupHours, 0);
  const setupLabour = setupHours * loadedWage;
  const setupMachine = setupHours * machineBurden;

  // --- Programming (one-off for the part, amortised) ---------------------
  // Amortised over the parts the shop expects to make from this program, which
  // defaults to this lot. A repeat order owes no new programming, and a shop
  // that buries the whole CAM cost in a 10-piece proveout has to explain why
  // the reorder is suddenly cheaper.
  const programmingTotal = num(rates.programmingHours, 0) * loadedWage;
  const amortiseOver = Math.max(qty, wholePositive(rates.amortiseProgrammingOverParts, qty));
  const programming = amortiseOver > 0 ? (programmingTotal * qty) / amortiseOver : programmingTotal;

  // --- Tooling ------------------------------------------------------------
  // Perishable tooling only: the insert edge or endmill consumed making parts.
  // Fixtures and workholding are setup, and a shop that bought a dedicated
  // fixture for this job puts it in programming or setup, not here.
  const partsPerEdge = positive(rates.partsPerCuttingEdge, 1);
  const tooling = (num(rates.toolCostPerCuttingEdge, 0) / partsPerEdge) * starts;

  // --- Inspection ---------------------------------------------------------
  // First article is per lot; in-process inspection follows the good parts,
  // since a part scrapped at the machine is not inspected and reported on.
  const firstArticle = num(rates.firstArticleHours, 0) * loadedWage;
  const inProcess = ((num(rates.inspectionMinutesPerPart, 0) * qty) / 60) * loadedWage;

  // --- Outside processes --------------------------------------------------
  // The lot minimum is the point of modelling this at all. It is charged on
  // what is sent out, which is the started quantity: a plater does not refund
  // the parts you subsequently scrap.
  const outsideAtRate = num(rates.outsideCostPerPart, 0) * starts;
  const outsideMinimum = num(rates.outsideLotMinimum, 0);
  const outside = Math.max(outsideAtRate, outsideMinimum);

  // Every line is rounded to whole cents *before* anything is summed, and each
  // total is then composed from those rounded figures. Composing from the
  // unrounded values is marginally more accurate and produces a breakdown that
  // does not add up on screen — a direct cost of $683.38 beside an overhead of
  // $123.01 over a total of $806.38, which is off by the cent the two roundings
  // went in opposite directions. This audience checks arithmetic for a living,
  // and a quote whose column does not sum is a quote they stop trusting.
  const lines = {
    material: round(materialCost),
    runLabour: round(runLabour),
    runMachine: round(runMachine),
    setupLabour: round(setupLabour),
    setupMachine: round(setupMachine),
    programming: round(programming),
    tooling: round(tooling),
    firstArticle: round(firstArticle),
    inspection: round(inProcess),
    outside: round(outside),
  };

  const perLot = round(
    lines.setupLabour + lines.setupMachine + lines.programming + lines.firstArticle,
  );
  const perPart = round(
    lines.material + lines.runLabour + lines.runMachine + lines.tooling + lines.inspection +
      lines.outside,
  );
  const directCost = round(perLot + perPart);
  const overheadCost = round(directCost * (num(rates.overheadRate, 0) / 100));
  const totalCost = round(directCost + overheadCost);

  return {
    quantity: qty,
    starts,
    scrapStarts: starts - qty,
    effectiveScrapPct: qty > 0 ? round(((starts - qty) / qty) * 100, 2) : 0,
    loadedWage: round(loadedWage),
    partsPerStockUnit: perStock,
    stockUnitsNeeded,
    sparePartsInStock,
    runHours: round(runHours, 3),
    lines,
    outsideMinimumBinding: outsideMinimum > 0 && outsideAtRate < outsideMinimum,
    outsideAtRate: round(outsideAtRate),
    programmingTotal: round(programmingTotal),
    perLotCost: perLot,
    perPartCost: perPart,
    directCost,
    overheadCost,
    totalCost,
  };
}

/**
 * Cost and break-even price for one lot size, with no reference to what was
 * quoted. The break table calls this once per tier; the headline figures come
 * from the same function at the quoted quantity, so a tier can never disagree
 * with the headline.
 */
export function costOfLot(quantity, rates) {
  const lot = lotCosts(quantity, rates);
  const costPerPart = lot.quantity > 0 ? lot.totalCost / lot.quantity : 0;
  const marginFraction = fractionBelowOne(rates.targetMargin, 0);
  const targetPrice = marginFraction < 1 ? costPerPart / (1 - marginFraction) : costPerPart;
  return {
    ...lot,
    costPerPart: round(costPerPart),
    breakEvenPricePerPart: round(costPerPart),
    targetPricePerPart: round(targetPrice),
    // What the flat-per-lot work costs each part at this tier. This single
    // number is the quantity curve: it is the whole difference between a
    // one-off and a production run.
    perLotCostPerPart: round(lot.quantity > 0 ? lot.perLotCost / lot.quantity : 0),
  };
}

function finding(severity, title, detail) {
  return { severity, title, detail };
}

const money = (n) => {
  const value = Number(n) || 0;
  const text = `$${Math.abs(value).toFixed(2)}`;
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

/**
 * The whole quote: cost breakdown at the asked-for quantity, the margin at what
 * the shop is thinking of quoting, the same part costed at every standard lot
 * size, and the findings worth reading before the quote goes out.
 */
export function computeMachiningJob(input = {}) {
  const rates = { ...input };
  const quantity = wholePositive(rates.quantity, 1);
  const at = costOfLot(quantity, rates);

  const quotedPrice = num(rates.pricePerPart, 0);
  const setupFeeCharged = num(rates.setupFeeCharged, 0);
  const revenue = quotedPrice * quantity + setupFeeCharged;
  const profit = revenue - at.totalCost;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  // A setup fee billed as its own line is revenue that does not have to come
  // out of the per-part price, so the price the per-part number must clear is
  // the total cost less that fee.
  const costPerPartAfterSetupFee =
    quantity > 0 ? Math.max(0, at.totalCost - setupFeeCharged) / quantity : 0;

  const table = BREAK_QUANTITIES.map((q) => {
    const tier = costOfLot(q, rates);
    return {
      quantity: q,
      starts: tier.starts,
      stockUnitsNeeded: tier.stockUnitsNeeded,
      costPerPart: tier.costPerPart,
      perLotCostPerPart: tier.perLotCostPerPart,
      targetPricePerPart: tier.targetPricePerPart,
      marginAtQuotedPrice:
        quotedPrice > 0 ? round(((quotedPrice - tier.costPerPart) / quotedPrice) * 100, 1) : null,
      isQuoted: q === quantity,
    };
  });

  const findings = [];
  const targetMarginPct = Number.isFinite(rates.targetMargin) ? rates.targetMargin : 0;

  if (quotedPrice > 0 && quotedPrice < at.costPerPart) {
    const perPart = at.costPerPart - quotedPrice;
    findings.push(
      finding(
        SEVERITY.HIGH,
        `${money(quotedPrice)} a part is below your cost of ${money(at.costPerPart)}`,
        `Every part shipped loses ${money(perPart)}, and the lot loses ${money(
          perPart * quantity - setupFeeCharged,
        )} after the ${money(setupFeeCharged)} setup fee. Break-even on this lot is ${money(
          at.breakEvenPricePerPart,
        )} a part, or ${money(costPerPartAfterSetupFee)} if you keep billing setup separately.`,
      ),
    );
  } else if (quotedPrice > 0 && marginPct < targetMarginPct) {
    findings.push(
      finding(
        SEVERITY.MEDIUM,
        `${round(marginPct, 1)}% margin is under your ${round(targetMarginPct, 1)}% target`,
        `At ${money(quotedPrice)} a part this lot makes ${money(profit)}. Your target margin needs ${money(
          at.targetPricePerPart,
        )} a part.`,
      ),
    );
  }

  if (at.partsPerStockUnit <= 0 && normaliseStockForm(rates.stockForm) !== "supplied") {
    findings.push(
      finding(
        SEVERITY.HIGH,
        "The part does not fit the stock you described",
        "No whole part comes out of one stock unit at these dimensions, so the material figure below assumes one whole stock unit per part — almost certainly wrong. Check the part length against the bar length less end loss, or the part against the sheet.",
      ),
    );
  }

  const flatShare = at.costPerPart > 0 ? (at.perLotCostPerPart / at.costPerPart) * 100 : 0;
  if (flatShare >= 30) {
    const at100 = costOfLot(100, rates);
    findings.push(
      finding(
        SEVERITY.MEDIUM,
        `Setup, programming and first article are ${round(flatShare, 0)}% of the cost of each part`,
        `That is ${money(at.perLotCostPerPart)} a part of work that costs the same at any quantity — it would be ${money(
          at100.perLotCostPerPart,
        )} a part at 100 pieces. On a lot this size the honest options are a separate setup line, a minimum order quantity, or a per-part price the customer will read as high without that context.`,
      ),
    );
  }

  if (at.sparePartsInStock > 0) {
    findings.push(
      finding(
        SEVERITY.MEDIUM,
        `You are paying for ${at.sparePartsInStock} more part${
          at.sparePartsInStock === 1 ? "" : "s"
        }' worth of material than you are starting`,
        `${at.stockUnitsNeeded} stock unit${
          at.stockUnitsNeeded === 1 ? "" : "s"
        } yields ${at.partsPerStockUnit * at.stockUnitsNeeded} parts and you are starting ${
          at.starts
        }. The material for those ${at.sparePartsInStock} is already bought, so running them costs only machine time and tooling — worth knowing if the customer might take a few spares, or if you would rather hold them than a remnant.`,
      ),
    );
  }

  if (at.outsideMinimumBinding) {
    const at100 = costOfLot(100, rates);
    const perPartHere = quantity > 0 ? at.lines.outside / quantity : 0;
    const perPart100 = at100.quantity > 0 ? at100.lines.outside / at100.quantity : 0;
    findings.push(
      finding(
        SEVERITY.MEDIUM,
        "The outside-process lot minimum is what prices this run, not the per-part rate",
        `Your parts come to ${money(at.outsideAtRate)} at the per-part rate but the minimum is ${money(
          at.lines.outside,
        )}, so it costs ${money(perPartHere)} a part here against ${money(
          perPart100,
        )} at 100 pieces. Sending a larger batch out at once, or combining this lot with another job going to the same process, is usually the only lever.`,
      ),
    );
  }

  if (at.scrapStarts > 0 && at.effectiveScrapPct > num(rates.scrapPct, 0) + 0.5) {
    findings.push(
      finding(
        SEVERITY.LOW,
        `A ${round(num(rates.scrapPct, 0), 1)}% scrap allowance costs you ${round(
          at.effectiveScrapPct,
          1,
        )}% on a lot this size`,
        `You cannot start a fraction of a part: shipping ${quantity} good parts means starting ${at.starts}. The extra ${at.scrapStarts} carr${
          at.scrapStarts === 1 ? "ies" : "y"
        } full material, machine time and outside-process cost, which is already in the figures above.`,
      ),
    );
  }

  const materialShare = at.directCost > 0 ? (at.lines.material / at.directCost) * 100 : 0;
  const timeShare =
    at.directCost > 0
      ? ((at.lines.runLabour + at.lines.runMachine) / at.directCost) * 100
      : 0;
  if (materialShare >= 50) {
    findings.push(
      finding(
        SEVERITY.INFO,
        `Material is ${round(materialShare, 0)}% of the direct cost of this job`,
        "Shaving the cycle time will not move this quote much. Yield per stock unit, a better material price, and a nearer-net starting form are where the money is.",
      ),
    );
  } else if (timeShare >= 50) {
    findings.push(
      finding(
        SEVERITY.INFO,
        `Machine and run labour are ${round(timeShare, 0)}% of the direct cost of this job`,
        "This is a cycle-time job: a minute off the cycle is worth more here than a better material price. Chasing a cheaper bar will not move the quote much.",
      ),
    );
  }

  const order = [SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  return {
    quantity,
    starts: at.starts,
    stockForm: normaliseStockForm(rates.stockForm),
    partsPerStockUnit: at.partsPerStockUnit,
    stockUnitsNeeded: at.stockUnitsNeeded,
    sparePartsInStock: at.sparePartsInStock,
    effectiveScrapPct: at.effectiveScrapPct,
    loadedWage: at.loadedWage,
    runHours: at.runHours,
    lines: at.lines,
    perLotCost: at.perLotCost,
    perLotCostPerPart: at.perLotCostPerPart,
    directCost: at.directCost,
    overheadCost: at.overheadCost,
    totalCost: at.totalCost,
    costPerPart: at.costPerPart,
    breakEvenPricePerPart: at.breakEvenPricePerPart,
    breakEvenExcludingSetupFee: round(costPerPartAfterSetupFee),
    targetPricePerPart: at.targetPricePerPart,
    quotedPricePerPart: round(quotedPrice),
    setupFeeCharged: round(setupFeeCharged),
    revenue: round(revenue),
    profit: round(profit),
    marginPct: round(marginPct, 1),
    programmingTotal: at.programmingTotal,
    table,
    findings,
  };
}
