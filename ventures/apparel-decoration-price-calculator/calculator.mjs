/**
 * Job costing for a custom apparel decorator — screen printing, embroidery, or
 * DTF (direct-to-film) heat transfer — as one deterministic function with no
 * dependencies.
 *
 * The question this answers is the one that decides whether a decorated-garment
 * shop makes money on a job: what does one printed or stitched piece actually
 * cost once the one-off setup for *this design* is amortised over *this
 * quantity*, and what price per piece clears that cost.
 *
 * Three things a flat "$12 a shirt" price hides, and all three are modelled
 * here:
 *
 *   1. Setup is per *job*, not per piece, and it is the single largest reason
 *      a small run loses money at a big run's price. A three-colour front and a
 *      one-colour back is four screens to burn, register and reclaim whether
 *      the order is 12 shirts or 500. Spread over 12 pieces that is a few
 *      dollars a shirt; over 500 it rounds to nothing. Quoting both from the
 *      same price list is the classic way to lose money on the small one.
 *   2. Blanks are bought in whole pieces, and spoilage is bought with them. A
 *      shop that orders exactly the order quantity has no misprint allowance,
 *      so one ruined garment on a 24-piece run means re-ordering a single blank
 *      and setting up again — which costs far more than the shirt.
 *   3. Machine time does not scale the way head-count intuition suggests. A
 *      12,000-stitch left chest on a six-head embroidery machine occupies the
 *      machine for one cycle and produces six pieces, so the machine minutes
 *      per piece are the cycle divided by the heads — but hooping is per piece
 *      per placement and is not divided by anything.
 *
 * Nothing here asserts a price the shop should charge, what any blank actually
 * costs, what a local wage rule requires, or what a competitor quotes. Every
 * rate is a number the shop reads off its own supplier invoices, payroll and
 * equipment.
 */

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

/** The three decoration methods this costs. `method` selects which setup and
 *  run-time model applies; every other input is shared. */
export const METHODS = ["screen-print", "embroidery", "dtf"];

/** Quantities the break table is drawn at. These are the industry's own price
 *  tiers — a dozen, two dozen, four dozen, six dozen, a gross, two gross — so
 *  the curve lines up with the tier the shop is actually being asked to quote. */
export const BREAK_QUANTITIES = [12, 24, 48, 72, 144, 288];

function round(n, places = 2) {
  const factor = 10 ** places;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function num(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normaliseMethod(value) {
  return METHODS.includes(value) ? value : "screen-print";
}

function readRates(input) {
  return {
    method: normaliseMethod(input.method),

    // Shared labour
    wagePerHour: num(input.wagePerHour, 0),
    payrollLoadPct: num(input.payrollLoadPct, 0),
    artMinutes: num(input.artMinutes, 0),
    finishMinutesPerPiece: num(input.finishMinutesPerPiece, 0),

    // Shared materials
    blankCostPerPiece: num(input.blankCostPerPiece, 0),
    spoilagePct: num(input.spoilagePct, 0),
    locations: Math.max(1, Math.round(positive(input.locations, 1))),

    // Screen print
    colorsPerLocation: Math.max(1, Math.round(positive(input.colorsPerLocation, 1))),
    screenSetupCost: num(input.screenSetupCost, 0),
    pressPiecesPerHour: positive(input.pressPiecesPerHour, 1),
    inkCostPerPiecePerColor: num(input.inkCostPerPiecePerColor, 0),

    // Embroidery
    stitchCount: num(input.stitchCount, 0),
    digitizingCostPerLocation: num(input.digitizingCostPerLocation, 0),
    stitchesPerMinute: positive(input.stitchesPerMinute, 1),
    heads: Math.max(1, Math.round(positive(input.heads, 1))),
    hoopMinutesPerPiece: num(input.hoopMinutesPerPiece, 0),
    threadCostPer1000Stitches: num(input.threadCostPer1000Stitches, 0),
    backingCostPerPlacement: num(input.backingCostPerPlacement, 0),

    // DTF
    artWidthIn: num(input.artWidthIn, 0),
    artHeightIn: num(input.artHeightIn, 0),
    filmCostPerSquareInch: num(input.filmCostPerSquareInch, 0),
    pressSecondsPerLocation: num(input.pressSecondsPerLocation, 0),

    // Overhead
    overheadPerPiece: 0,
  };
}

function laborPerMinute(rates) {
  return (rates.wagePerHour * (1 + rates.payrollLoadPct / 100)) / 60;
}

/**
 * The one-off cost of getting this design onto the machine, before a single
 * good piece exists. Independent of quantity — which is the whole point.
 *
 * Exported because the break table costs the *same job* at six other
 * quantities, and re-deriving this per quantity is how the table and the
 * headline figure drift apart.
 *
 * @param {object} rates already-normalised rates from `readRates`
 * @returns {{screens:number, digitizing:number, art:number, total:number, screenCount:number}}
 */
export function setupCost(rates) {
  const perMinute = laborPerMinute(rates);
  const art = round(rates.artMinutes * perMinute, 2);

  let screens = 0;
  let screenCount = 0;
  let digitizing = 0;

  if (rates.method === "screen-print") {
    // One screen per colour per placement. A 3-colour front plus a 1-colour
    // back is four screens, not two — the mistake this line exists to price.
    screenCount = rates.colorsPerLocation * rates.locations;
    screens = round(screenCount * rates.screenSetupCost, 2);
  } else if (rates.method === "embroidery") {
    // Digitising is per design per placement and is a one-off for the design,
    // not for the order — but the first order is the one that has to carry it.
    digitizing = round(rates.digitizingCostPerLocation * rates.locations, 2);
  }
  // DTF has no per-job setup beyond art: the transfer is printed to length, so
  // there is nothing to burn, register or digitise.

  return {
    screens,
    digitizing,
    art,
    total: round(screens + digitizing + art, 2),
    screenCount,
  };
}

/**
 * What one good piece costs to run, excluding the blank and excluding any share
 * of setup. Method-specific: press time, stitch time, or heat-press time.
 *
 * @param {object} rates already-normalised rates from `readRates`
 * @returns {{runLabor:number, consumables:number, machineMinutes:number, total:number}}
 */
export function runCostPerPiece(rates) {
  const perMinute = laborPerMinute(rates);
  let machineMinutes = 0;
  let consumables = 0;

  if (rates.method === "screen-print") {
    // "Pieces per hour" is press throughput for the whole placement — all the
    // colours of that placement in one pass through the press — so it is per
    // placement, not per colour.
    machineMinutes = (60 / rates.pressPiecesPerHour) * rates.locations;
    consumables = rates.inkCostPerPiecePerColor * rates.colorsPerLocation * rates.locations;
  } else if (rates.method === "embroidery") {
    // A multi-head machine sews `heads` pieces in one cycle, so the machine
    // minutes *per piece* are the cycle divided by the heads. Hooping is not
    // divided by anything: every piece is hooped by hand, at every placement.
    const cycleMinutes = rates.stitchCount / rates.stitchesPerMinute;
    machineMinutes =
      (cycleMinutes / rates.heads) * rates.locations + rates.hoopMinutesPerPiece * rates.locations;
    consumables =
      ((rates.stitchCount / 1000) * rates.threadCostPer1000Stitches +
        rates.backingCostPerPlacement) *
      rates.locations;
  } else {
    machineMinutes = (rates.pressSecondsPerLocation / 60) * rates.locations;
    consumables =
      rates.artWidthIn * rates.artHeightIn * rates.filmCostPerSquareInch * rates.locations;
  }

  const totalMinutes = machineMinutes + rates.finishMinutesPerPiece;
  const runLabor = round(totalMinutes * perMinute, 4);
  return {
    runLabor,
    consumables: round(consumables, 4),
    machineMinutes: round(machineMinutes, 3),
    total: round(runLabor + consumables, 4),
  };
}

/**
 * Total cost of the job at a given quantity, under one set of rates.
 *
 * Exported for the same reason `setupCost` is: the break table needs the whole
 * cost at six other quantities, and a second implementation of the spoilage
 * rounding is exactly the kind of thing that drifts.
 *
 * @param {number} quantity good pieces the customer is buying
 * @param {object} rates already-normalised rates from `readRates`
 */
export function costOfJob(quantity, rates) {
  const qty = Math.max(0, Math.round(num(quantity, 0)));
  const setup = setupCost(rates);
  const run = runCostPerPiece(rates);

  // Blanks are bought in whole pieces and the spoilage allowance is bought with
  // them, so this rounds up rather than carrying a fractional shirt.
  const blanksPurchased = qty > 0 ? Math.ceil(qty * (1 + rates.spoilagePct / 100)) : 0;
  const blanks = round(blanksPurchased * rates.blankCostPerPiece, 2);

  const runTotal = round(run.total * qty, 2);
  const overhead = round(rates.overheadPerPiece * qty, 2);
  const total = round(setup.total + blanks + runTotal + overhead, 2);

  return {
    quantity: qty,
    setup,
    run,
    blanksPurchased,
    blanks,
    runTotal,
    overhead,
    total,
    perPiece: qty > 0 ? round(total / qty, 4) : 0,
    setupPerPiece: qty > 0 ? round(setup.total / qty, 4) : 0,
  };
}

/**
 * @param {object} input every rate the shop reads off its own invoices and payroll
 * @returns {object} job cost, cost per piece, break-even and target prices, the
 *   quantity-break curve, and findings to act on
 */
export function computeDecorationJob(input = {}) {
  const rates = readRates(input);

  const monthlyOverhead = num(input.monthlyOverhead, 0);
  const monthlyPieces = num(input.monthlyPieces, 0);
  rates.overheadPerPiece = monthlyPieces > 0 ? monthlyOverhead / monthlyPieces : 0;

  const quantity = Math.max(0, Math.round(num(input.quantity, 0)));
  const pricePerPiece = num(input.pricePerPiece, 0);
  const setupFeeCharged = num(input.setupFeeCharged, 0);
  const targetMarginPct = Math.min(num(input.targetMarginPct, 0), 95);

  const job = costOfJob(quantity, rates);

  const revenue = round(pricePerPiece * quantity + setupFeeCharged, 2);
  const profit = round(revenue - job.total, 2);
  const marginPct = revenue > 0 ? round((profit / revenue) * 100, 1) : 0;
  const profitPerPiece = quantity > 0 ? round(profit / quantity, 4) : 0;

  // Break-even is net of any setup fee billed separately: a shop that bills
  // screens as a line item is not asking the per-piece price to carry them.
  const recoverableSetup = Math.max(0, job.setup.total - setupFeeCharged);
  const breakEvenPricePerPiece =
    quantity > 0
      ? round((job.total - job.setup.total + recoverableSetup) / quantity, 4)
      : 0;
  const targetPricePerPiece =
    targetMarginPct > 0 && quantity > 0
      ? round(breakEvenPricePerPiece / (1 - targetMarginPct / 100), 4)
      : null;

  // The curve is the product. One row per industry price tier, plus the
  // quantity actually being quoted if it is not already one of them.
  const tiers = [...new Set([...BREAK_QUANTITIES, quantity].filter((q) => q > 0))].sort(
    (a, b) => a - b,
  );
  const quantityBreaks = tiers.map((qty) => {
    const at = costOfJob(qty, rates);
    const breakEven = round(
      (at.total - at.setup.total + Math.max(0, at.setup.total - setupFeeCharged)) / qty,
      4,
    );
    return {
      quantity: qty,
      costPerPiece: at.perPiece,
      setupPerPiece: at.setupPerPiece,
      breakEvenPricePerPiece: breakEven,
      targetPricePerPiece:
        targetMarginPct > 0 ? round(breakEven / (1 - targetMarginPct / 100), 4) : null,
      isQuoted: qty === quantity,
    };
  });

  const findings = [];

  if (quantity <= 0 || rates.wagePerHour <= 0) {
    findings.push({
      id: "missing-basics",
      severity: SEVERITY.INFO,
      title: "Enter a quantity and a loaded wage",
      detail:
        "Cost per piece is the job's setup spread over the pieces, plus what each piece costs to run — so the quantity and the loaded wage are what the whole calculation rests on.",
    });
  }

  if (quantity > 0 && pricePerPiece > 0 && pricePerPiece < breakEvenPricePerPiece) {
    findings.push({
      id: "below-break-even",
      severity: SEVERITY.HIGH,
      title: `Your price is ${money(breakEvenPricePerPiece - pricePerPiece)} a piece below cost`,
      detail: `At ${money(pricePerPiece)} a piece for ${quantity}, this job ${profit < 0 ? "loses" : "makes"} ${money(Math.abs(profit))}. Break-even on these numbers is ${money(breakEvenPricePerPiece)} a piece${setupFeeCharged > 0 ? ` on top of the ${money(setupFeeCharged)} setup fee you are billing` : ""}.`,
    });
  }

  if (
    quantity > 0 &&
    pricePerPiece >= breakEvenPricePerPiece &&
    targetPricePerPiece !== null &&
    pricePerPiece < targetPricePerPiece
  ) {
    findings.push({
      id: "below-target-margin",
      severity: SEVERITY.MEDIUM,
      title: `Above cost, but short of your ${targetMarginPct}% margin target`,
      detail: `This job earns ${marginPct}% at ${money(pricePerPiece)} a piece. ${money(targetPricePerPiece)} a piece would hit ${targetMarginPct}% on the same costs — and the gap is this wide mainly because ${quantity} pieces is a short run carrying the whole setup. The break table below shows what the same job clears at each of the usual quantity tiers.`,
    });
  }

  if (quantity > 0 && job.setup.total > 0 && setupFeeCharged < job.setup.total) {
    const shortfall = round(job.setup.total - setupFeeCharged, 2);
    findings.push({
      id: "setup-not-billed",
      severity: SEVERITY.MEDIUM,
      title: `${money(shortfall)} of setup is riding on the per-piece price`,
      detail:
        `This job costs ${money(job.setup.total)} to set up` +
        `${rates.method === "screen-print" ? ` (${job.setup.screenCount} screen${job.setup.screenCount === 1 ? "" : "s"} at ${money(rates.screenSetupCost)})` : ""}` +
        `${setupFeeCharged > 0 ? `, and you are billing ${money(setupFeeCharged)} of it as a line item` : ", and you are not billing any of it as a line item"}. ` +
        `The rest is ${money(round(shortfall / quantity, 4))} on every one of the ${quantity} pieces. That is fine if the price carries it — the point is that it is in there, and that it triples if the next customer orders a third as many.`,
    });
  }

  if (quantity > 0 && job.setupPerPiece > job.run.total && job.setup.total > 0) {
    findings.push({
      id: "setup-dominates",
      severity: SEVERITY.MEDIUM,
      title: `At ${quantity} pieces you are selling setup, not decoration`,
      detail: `Setup works out at ${money(job.setupPerPiece)} a piece against ${money(job.run.total)} to actually run one. The same job at ${quantity * 2} pieces would carry ${money(round(job.setup.total / (quantity * 2), 4))} of setup instead. This is the arithmetic behind a minimum order quantity, and behind quoting small runs off a different price list rather than the same one.`,
    });
  }

  if (quantity > 0 && rates.spoilagePct <= 0) {
    findings.push({
      id: "no-spoilage-allowance",
      severity: SEVERITY.MEDIUM,
      title: "No spoilage allowance — you ordered exactly the order",
      detail:
        "With spoilage at 0% you buy exactly the pieces you sell, so a single misprint, a mis-hoop or a bad blank means the order ships short or you re-order one garment and set up again. Most shops buy 2–5% over on a small run and more on a dark garment or a difficult placement. Put your own figure in to see what the cover actually costs.",
    });
  }

  if (rates.method === "screen-print" && rates.locations > 1) {
    findings.push({
      id: "second-location-doubles-screens",
      severity: SEVERITY.LOW,
      title: `${rates.locations} placements means ${job.setup.screenCount} screens, not ${rates.colorsPerLocation}`,
      detail: `Every placement needs its own screen for every colour in it, so ${rates.colorsPerLocation} colour${rates.colorsPerLocation === 1 ? "" : "s"} across ${rates.locations} placements is ${job.setup.screenCount} screens to burn, register and reclaim — ${money(job.setup.screens)} before a shirt is printed. Dropping a placement, or a colour in the second placement, is usually the cheapest change available on a small run.`,
    });
  }

  if (rates.method === "embroidery" && rates.digitizingCostPerLocation > 0 && setupFeeCharged <= 0) {
    findings.push({
      id: "digitizing-not-recovered",
      severity: SEVERITY.MEDIUM,
      title: "Digitising is a one-off you are absorbing into this order",
      detail: `${money(job.setup.digitizing)} of digitising is in this job's cost with nothing billed against it. It is genuinely one-off — a repeat order of the same design owes nothing more — which is exactly why most shops bill it as a separate line on the first order rather than burying it in a per-piece price that the repeat order will then be compared against.`,
    });
  }

  if (rates.method === "embroidery" && rates.stitchCount > 0 && quantity > 0) {
    const cycle = round(rates.stitchCount / rates.stitchesPerMinute, 1);
    if (rates.heads > 1) {
      findings.push({
        id: "heads-divide-the-cycle",
        severity: SEVERITY.INFO,
        title: `${rates.heads} heads turn a ${cycle}-minute cycle into ${round(cycle / rates.heads, 2)} minutes a piece`,
        detail: `A ${rates.stitchCount}-stitch design runs ${cycle} minutes on the machine and produces ${rates.heads} pieces per cycle. Hooping is the part that does not divide: ${rates.hoopMinutesPerPiece} minute(s) per placement per piece is paid ${quantity * rates.locations} times on this job either way, which is why hooping and not stitching is usually what caps a shop's daily output.`,
      });
    }
  }

  if (monthlyOverhead <= 0 || monthlyPieces <= 0) {
    findings.push({
      id: "no-overhead-allocated",
      severity: SEVERITY.MEDIUM,
      title: "No overhead share is in this number",
      detail:
        "With monthly overhead or monthly volume left blank, the cost below is the touch cost of the job only — rent, insurance, the equipment payment, software and the base utility bill are not in it. Enter both to see what a piece has to carry before the shop breaks even.",
    });
  }

  findings.push({
    id: "rates-are-yours",
    severity: SEVERITY.INFO,
    title: "These are your rates, not a market price",
    detail:
      "Blank costs, ink and thread prices, press speeds, wage rules and equipment vary by supplier, by garment and by shop, so read every figure off your own invoices, payroll and machines rather than a published average. This tool does arithmetic on the numbers you enter; it does not know what your market pays, and it is not tax, financial, or business advice.",
  });

  return {
    method: rates.method,
    job,
    costPerPiece: job.perPiece,
    setupPerPiece: job.setupPerPiece,
    revenue,
    profit,
    marginPct,
    profitPerPiece,
    breakEvenPricePerPiece,
    targetPricePerPiece,
    quantityBreaks,
    findings,
  };
}

// Findings quote figures in the text of the sentence, so the formatting lives
// here rather than in the page: a headline number and the sentence explaining
// it should never round differently.
function money(n) {
  const value = Number.isFinite(n) ? n : 0;
  const text = `$${Math.abs(value).toFixed(2)}`;
  // Sign outside the symbol ("-$9.24", never "$-9.24"), and never on a value
  // that rounds to zero — `platform/ci/check_money_sign.py` guards both.
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}
