// What an existing-customer rate increase (ECRI) at a self-storage facility is
// actually worth, once the move-outs it causes are priced properly.
//
// The trade this venture serves runs rate increases on tenants who are already
// in a unit — a letter or an email, 10% to 20%, on everyone past some tenure —
// and the whole decision turns on one question nobody has a number for: **how
// many move-outs can this increase absorb before it loses money?**
//
// The reason the intuition is wrong, and the reason this is a tool rather than
// a rule of thumb, is that operators price a move-out at the tenant's rent. It
// is not: the unit gets re-rented, and at the *street rate*, which is usually
// higher than what a two-year tenant is paying. So losing a tenant costs the
// gap, not the rent, and the gap has four parts that pull in two directions:
//
//   - the rent lost while the unit sits empty, at street rate plus whatever
//     tenant-protection or insurance income rides on an occupied unit;
//   - the move-in concession the new tenant gets (a free first month is the
//     usual one), which is a real cost the departing tenant was not costing;
//   - the turnover cost — clean out, new lock, listing, admin;
//   - **minus** the re-rent uplift: `(new rent − street rate) x horizon`. When
//     street is above the raised rent, this term is negative, and a move-out
//     is worth *more* than the tenant staying.
//
// That last term is the one that changes decisions. On the worked example the
// page opens with, an induced move-out costs $272 rather than the $1,628 of
// rent it looks like, and the increase breaks even at a 60.8% induced move-out
// rate — an order of magnitude above what an operator would actually see.
//
// Nothing here is a determination. Every rate, cost and move-out assumption is
// the operator's own input, including the one that matters most — how many
// tenants the increase will cost them, which no arithmetic can know. This
// prices that assumption; it does not predict it, and the page says so.

/** Mean days in a month. Days-to-months is the one conversion here. */
export const DAYS_PER_MONTH = 30.4375;

/**
 * Every input id the page collects, so the page and the tests agree on one
 * list rather than two that drift. Order is the order they appear on screen.
 */
export const ALL_INPUT_IDS = [
  'unitCount',
  'currentRent',
  'increasePercent',
  'streetRate',
  'ancillaryPerMonth',
  'baselineMoveOutPercent',
  'inducedMoveOutPercent',
  'vacantDays',
  'reletSharePercent',
  'turnoverCost',
  'concessionMonths',
  'horizonMonths',
];

const FIELDS = {
  unitCount: { label: 'Units in this group', min: 1, max: 5000 },
  currentRent: { label: 'Current rent', min: 1, max: 10000 },
  increasePercent: { label: 'Increase', min: 0, max: 200 },
  streetRate: { label: 'Street rate', min: 0, max: 10000 },
  ancillaryPerMonth: { label: 'Tenant protection and other income', min: 0, max: 500 },
  baselineMoveOutPercent: { label: 'Move-outs without the increase', min: 0, max: 100 },
  inducedMoveOutPercent: { label: 'Extra move-outs the increase causes', min: 0, max: 100 },
  vacantDays: { label: 'Days empty before it re-rents', min: 0, max: 365 },
  // `defaultsTo` rather than required: this input was added after the tool
  // shipped, and a saved link or an embedding page from before it existed
  // must keep pricing rather than turning into a validation error. 100 is
  // the assumption every figure was computed under until now, so an absent
  // value reproduces the old answer exactly.
  reletSharePercent: { label: 'Share of vacated units that re-rent', min: 0, max: 100, defaultsTo: 100 },
  turnoverCost: { label: 'Turnover cost', min: 0, max: 5000 },
  concessionMonths: { label: 'Move-in concession', min: 0, max: 12 },
  horizonMonths: { label: 'Judge it over', min: 1, max: 60 },
};

function readNumber(raw, field, errors) {
  const spec = FIELDS[field];
  const value = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    errors.push({ field, message: `${spec.label} needs a number.` });
    return null;
  }
  if (value < spec.min) {
    errors.push({ field, message: `${spec.label} cannot be below ${spec.min}.` });
    return null;
  }
  if (value > spec.max) {
    errors.push({ field, message: `${spec.label} cannot be above ${spec.max}.` });
    return null;
  }
  return value;
}

/**
 * What one vacated unit returns over the horizon once it is re-let.
 *
 * The departing tenant is assumed to leave at the start of the horizon, which
 * is the conservative reading: a tenant who instead pays three more months
 * before going makes a move-out *cheaper*, so assuming the earliest possible
 * departure produces the lowest break-even move-out rate rather than the
 * flattering one.
 */
export function reletValue({
  streetRate,
  ancillaryPerMonth,
  vacantDays,
  concessionMonths,
  turnoverCost,
  horizonMonths,
  reletShare = 1,
}) {
  const vacantMonths = Math.min(vacantDays / DAYS_PER_MONTH, horizonMonths);
  const occupiedMonths = horizonMonths - vacantMonths;
  const concession = streetRate * Math.min(concessionMonths, occupiedMonths);
  // The rent and the concession only happen on a unit that actually re-lets;
  // the turnover cost is spent on every vacated unit whether it re-lets or
  // not, because you still clean it out, re-lock it and list it. Splitting
  // them is the whole point of the share: a soft market does not make turns
  // cheaper, it makes them stop paying for themselves.
  const earned = (streetRate + ancillaryPerMonth) * occupiedMonths - concession;
  return {
    vacantMonths,
    occupiedMonths,
    concession,
    reletShare,
    // What the vacated unit would earn if it certainly re-let. Kept so the
    // itemised cost can show the never-re-lets risk as its own line rather
    // than folding it invisibly into the other four.
    earnedIfRelet: earned,
    value: reletShare * earned - turnoverCost,
  };
}

/**
 * What one *induced* move-out costs, itemised.
 *
 * Algebraically this is `(newRent + ancillary) x horizon − reletValue`, which
 * expands to the four terms below. It is written as the expansion because the
 * expansion is the product: three costs an operator already believes in, and a
 * fourth term — the re-rent uplift — that is negative whenever the street rate
 * sits above the raised rent, and which is the reason a move-out is worth far
 * less than the rent it looks like.
 */
export function moveOutCost({
  newRent,
  streetRate,
  ancillaryPerMonth,
  vacantDays,
  concessionMonths,
  turnoverCost,
  horizonMonths,
  reletShare = 1,
}) {
  const relet = reletValue({
    streetRate,
    ancillaryPerMonth,
    vacantDays,
    concessionMonths,
    turnoverCost,
    horizonMonths,
    reletShare,
  });
  const items = [
    {
      key: 'downtime',
      label: 'Rent lost while the unit is empty',
      amount: (streetRate + ancillaryPerMonth) * relet.vacantMonths,
    },
    { key: 'concession', label: 'Move-in concession for the new tenant', amount: relet.concession },
    { key: 'turnover', label: 'Turnover: clean-out, lock, listing, admin', amount: turnoverCost },
    {
      key: 'rateGap',
      label: 'Re-rent at street rate instead of their rent',
      amount: (newRent - streetRate) * horizonMonths,
    },
    // A fifth term rather than an adjustment to the four above, so each of
    // those keeps meaning exactly what its label says and this one is
    // visible on its own. It is zero at a 100% re-let share, which is the
    // assumption the other four were written under.
    {
      key: 'neverRelet',
      label: 'Vacated units that never re-rent inside the horizon',
      amount: (1 - relet.reletShare) * relet.earnedIfRelet,
    },
  ];
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return { items, total, relet };
}

/**
 * The induced move-out rate at which the increase finishes exactly level.
 *
 * `keepValue` is what one staying tenant is worth over the horizon at the new
 * rent; `moveOutCostTotal` is `keepValue − reletValue`. Setting the gain to
 * zero and solving for the induced rate gives the closed form below.
 *
 * Returns `null` when the cost of a move-out is zero or negative — that is not
 * a failure, it is the case where the street rate is high enough that losing a
 * tenant is worth as much as keeping them, so no amount of induced churn can
 * make the increase unprofitable. The page says that in words rather than
 * printing an infinity.
 */
export function breakEvenInducedRate({ stayingShare, horizonMonths, rentIncrease, moveOutCostTotal }) {
  if (moveOutCostTotal <= 0) return null;
  return (stayingShare * horizonMonths * rentIncrease) / moveOutCostTotal;
}

/**
 * Expected value of one unit in the group over the horizon.
 *
 * `moveOutShare` of them re-let at street; the rest pay `rent` plus whatever
 * ancillary income an occupied unit carries.
 */
export function cohortUnitValue({ rent, ancillaryPerMonth, horizonMonths, moveOutShare, reletValueTotal }) {
  return (1 - moveOutShare) * (rent + ancillaryPerMonth) * horizonMonths + moveOutShare * reletValueTotal;
}

/**
 * Price one rate increase on one group of units.
 *
 * Returns `{ ok: false, errors }` with every field-level problem at once — a
 * form that reveals one error per submit is the reason people abandon these.
 */
export function calculateIncrease(raw = {}) {
  const errors = [];
  const value = {};
  for (const field of ALL_INPUT_IDS) {
    const supplied = raw[field];
    const spec = FIELDS[field];
    if (spec.defaultsTo !== undefined && (supplied === undefined || supplied === null || supplied === '')) {
      value[field] = spec.defaultsTo;
      continue;
    }
    value[field] = readNumber(supplied, field, errors);
  }
  if (errors.length === 0 && value.baselineMoveOutPercent + value.inducedMoveOutPercent > 100) {
    errors.push({
      field: 'inducedMoveOutPercent',
      message: 'Ordinary move-outs plus the extra ones cannot exceed 100% of the group.',
    });
  }
  if (errors.length > 0) return { ok: false, errors };

  const currentRent = value.currentRent;
  const newRent = currentRent * (1 + value.increasePercent / 100);
  const rentIncrease = newRent - currentRent;
  const baseline = value.baselineMoveOutPercent / 100;
  const induced = value.inducedMoveOutPercent / 100;
  const stayingShare = 1 - baseline;
  const horizonMonths = value.horizonMonths;

  const shared = {
    streetRate: value.streetRate,
    ancillaryPerMonth: value.ancillaryPerMonth,
    vacantDays: value.vacantDays,
    concessionMonths: value.concessionMonths,
    turnoverCost: value.turnoverCost,
    horizonMonths,
    reletShare: value.reletSharePercent / 100,
  };
  const cost = moveOutCost({ newRent, ...shared });
  const relet = cost.relet;
  const keepValue = (newRent + value.ancillaryPerMonth) * horizonMonths;

  const breakEvenRate = breakEvenInducedRate({
    stayingShare,
    horizonMonths,
    rentIncrease,
    moveOutCostTotal: cost.total,
  });
  const breakEvenPercent = breakEvenRate === null ? null : Math.min(breakEvenRate, stayingShare) * 100;
  // Capped at the share who would still be here: you cannot lose more tenants
  // than are left after ordinary move-outs. When the uncapped break-even is
  // above that cap, no achievable amount of induced churn reverses the
  // increase, which is a different sentence from "the break-even is 84%".
  const breakEvenUnreachable = breakEvenRate !== null && breakEvenRate >= stayingShare;

  const perUnitNow = cohortUnitValue({
    rent: currentRent,
    ancillaryPerMonth: value.ancillaryPerMonth,
    horizonMonths,
    moveOutShare: baseline,
    reletValueTotal: relet.value,
  });
  const perUnitAfter = cohortUnitValue({
    rent: newRent,
    ancillaryPerMonth: value.ancillaryPerMonth,
    horizonMonths,
    moveOutShare: baseline + induced,
    reletValueTotal: relet.value,
  });
  const perUnitGain = perUnitAfter - perUnitNow;
  const perUnitGainIfNoneInduced =
    cohortUnitValue({
      rent: newRent,
      ancillaryPerMonth: value.ancillaryPerMonth,
      horizonMonths,
      moveOutShare: baseline,
      reletValueTotal: relet.value,
    }) - perUnitNow;

  const units = value.unitCount;
  const marginOfSafetyPoints = breakEvenPercent === null ? null : breakEvenPercent - value.inducedMoveOutPercent;

  // What the same decision looks like at the increases operators actually
  // send. The break-even column is the point of the table: a larger increase
  // buys more from everyone who stays, so it can absorb more move-outs — while
  // the move-out response it provokes is the thing this tool does not model
  // and the operator has to bring. The rows exist to be judged against that
  // belief, not to name a best answer.
  const ladder = [];
  const rungs = new Set([5, 8, 10, 12, 15, 20, 25, Math.round(value.increasePercent)]);
  for (const percent of [...rungs].sort((a, b) => a - b)) {
    if (percent < 0 || percent > 200) continue;
    const rungRent = currentRent * (1 + percent / 100);
    const rungCost = moveOutCost({ newRent: rungRent, ...shared });
    const rungBreakEven = breakEvenInducedRate({
      stayingShare,
      horizonMonths,
      rentIncrease: rungRent - currentRent,
      moveOutCostTotal: rungCost.total,
    });
    const rungGain =
      (cohortUnitValue({
        rent: rungRent,
        ancillaryPerMonth: value.ancillaryPerMonth,
        horizonMonths,
        moveOutShare: baseline + induced,
        reletValueTotal: relet.value,
      }) -
        perUnitNow) *
      units;
    ladder.push({
      increasePercent: percent,
      newRent: rungRent,
      perMonthPerUnit: rungRent - currentRent,
      breakEvenPercent: rungBreakEven === null ? null : Math.min(rungBreakEven, stayingShare) * 100,
      breakEvenUnreachable: rungBreakEven !== null && rungBreakEven >= stayingShare,
      aboveStreet: rungRent > value.streetRate,
      gain: rungGain,
      isEntered: Math.round(value.increasePercent) === percent,
    });
  }

  const notes = [];
  if (newRent > value.streetRate && value.streetRate > 0) {
    notes.push(
      `The raised rent of $${newRent.toFixed(2)} is above your street rate of $${value.streetRate.toFixed(2)}. A ` +
        'tenant who checks your own website finds a cheaper unit at your own facility, and a unit you re-let ' +
        'comes back at less than they were paying — which is what turns a move-out from cheap into expensive.',
    );
  }
  if (cost.total <= 0) {
    notes.push(
      'On these numbers a move-out is worth as much as the tenant staying: the street rate, net of downtime, ' +
        'concession and turnover, covers what you would have collected. No amount of induced churn makes this ' +
        'increase unprofitable — the question becomes how much more you could have asked for.',
    );
  }
  if (breakEvenPercent !== null && value.inducedMoveOutPercent > breakEvenPercent) {
    notes.push(
      'At the move-out response you entered, this increase loses money over the horizon. Either the increase ' +
        'is too large for this group or the response you expect is too high — the break-even above is the line ' +
        'between them.',
    );
  }
  if (marginOfSafetyPoints !== null && marginOfSafetyPoints > 0 && marginOfSafetyPoints < 3) {
    notes.push(
      'The break-even move-out rate is within three points of what you expect, which is inside the error bar ' +
        'on any move-out assumption. Treat this as a coin-flip rather than a decision the arithmetic made.',
    );
  }
  if (relet.vacantMonths >= horizonMonths) {
    notes.push(
      'The vacancy you entered is as long as the whole horizon, so a unit that turns over earns nothing inside ' +
        'it. Lengthen the horizon to see the re-rent, or shorten the days-empty figure to what your own ' +
        'lease-up actually runs.',
    );
  }
  if (value.concessionMonths > 0) {
    notes.push(
      `A ${value.concessionMonths}-month move-in concession costs $${relet.concession.toFixed(0)} on every unit ` +
        'that turns over. It is the part of a move-out most operators leave out, because it is charged to ' +
        'marketing rather than to the tenant who left.',
    );
  }
  if (value.reletSharePercent < 100) {
    const neverRelet = cost.items.find((item) => item.key === 'neverRelet');
    notes.push(
      `You have said ${100 - value.reletSharePercent}% of vacated units do not re-rent inside the horizon. That ` +
        `adds $${(neverRelet ? neverRelet.amount : 0).toFixed(0)} to every move-out and is the single input a ` +
        'soft market moves most — the other four costs are the same whether demand is there or not. If you are ' +
        'unsure of it, run this at 100% and again at your worst month and see whether the decision changes.',
    );
  }

  return {
    ok: true,
    errors: [],
    newRent,
    rentIncrease,
    monthlyGainIfNobodyLeaves: rentIncrease * units,
    keepValue,
    reletValue: relet.value,
    vacantMonths: relet.vacantMonths,
    occupiedMonths: relet.occupiedMonths,
    moveOutCost: cost,
    breakEvenPercent,
    breakEvenUnreachable,
    stayingSharePercent: stayingShare * 100,
    inducedMoveOutPercent: value.inducedMoveOutPercent,
    marginOfSafetyPoints,
    expectedInducedMoveOuts: units * induced,
    breakEvenMoveOuts: breakEvenPercent === null ? null : units * (breakEvenPercent / 100),
    perUnitGain,
    perUnitGainIfNoneInduced,
    cohortGain: perUnitGain * units,
    cohortGainIfNoneInduced: perUnitGainIfNoneInduced * units,
    cohortValueNow: perUnitNow * units,
    cohortValueAfter: perUnitAfter * units,
    horizonMonths,
    unitCount: units,
    ladder,
    notes,
  };
}

/**
 * The figure this tool exists to contradict: a move-out priced at the rent the
 * departing tenant was paying.
 *
 * Exported to be shown beside the real cost, not to be relied on. It is what
 * an operator reaches for when deciding whether to send the letter — "if six
 * of them leave, that's $8,000 a year gone" — and it is wrong by the whole
 * re-rent, because the unit does not stay empty for the year.
 *
 * By construction this is exactly `keepValue`: what a staying tenant is worth
 * over the horizon. That identity is the point. The naive view prices a
 * move-out at the *whole* value of keeping the tenant; the real cost is that
 * value minus what the unit earns once it is re-let, which is the gap
 * `moveOutCost` itemises.
 */
export function rentOnlyMoveOutCost({ newRent, ancillaryPerMonth, horizonMonths }) {
  return (newRent + ancillaryPerMonth) * horizonMonths;
}
