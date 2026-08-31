// Cash-flow timing for a single subcontract.
//
// WHAT THIS ANSWERS, AND WHAT IT USED TO
//
// The first version answered one question: "is there a funding gap?" It priced
// materials as cash out on day 0, assumed nothing arrives before the invoice,
// and stopped at the size of the hole. A subcontractor reading "$1,900 gap"
// still has the whole decision in front of them -- take the job or not, and if
// so, what to negotiate -- because a gap is not actionable until you know what
// it costs to carry and which lever closes it.
//
// Three things were missing, and all three are levers a sub actually pulls:
//
//   * SUPPLIER TERMS. Materials on a supply-house account are not cash out on
//     day 0, and the day they are due decides everything. On the shipped
//     defaults (paid day 44) a net-30 supplier only shortens the borrowing
//     window -- the $2,500 still lands first -- while a net-45 one erases the
//     $1,900 gap outright, because the client's money arrives before the
//     supplier's invoice does. Same account, opposite answer, and the tool had
//     no way to tell them apart.
//   * A DEPOSIT. A mobilisation or materials deposit is the standard ask, and
//     it lands before any of the outflow does.
//   * THE COST OF BRIDGING. A $1,900 gap carried for 18 days on a line of
//     credit is a few dollars; the same gap carried for 90 days is not. Which
//     one it is decides whether the gap is a reason to walk away or a rounding
//     error, and the sizes do not tell you.
//
// It also now reports how much *further* slip the scenario survives, which is
// the number that changes behaviour: "covered" invites you to take the job,
// "covered, and you can absorb 11 more days of late payment" tells you how
// much of the client's reputation you are betting on.
//
// Every input is clamped rather than thrown on, matching the original and
// keeping `checkValidity()` (see platform/ci/check_input_bounds.py) as the only
// thing that reports a bad number to the visitor.

// Days are clamped to ten years. The daily loops below are bounded by this, and
// no honest subcontract scenario is longer.
const MAX_DAYS = 3650;

const money = (value) => Math.max(0, Number(value) || 0);
const days = (value) => Math.min(MAX_DAYS, Math.max(0, Math.round(Number(value) || 0)));
const percent = (value, max = 100) => Math.min(max, Math.max(0, Number(value) || 0));

/**
 * The order `csvRow` writes and the CSV export reads back.
 *
 * Exported because the page used to carry its own copy of this list to label
 * the exported rows. Two hand-maintained lists of the same fields is the shape
 * that silently drops a column the day one of them is extended, so the page
 * imports this one instead.
 */
export const CSV_FIELDS = [
  'invoice',
  'materials',
  'weeklyBurn',
  'terms',
  'retention',
  'delay',
  'retentionRelease',
  'startingCash',
  'deposit',
  'supplierTerms',
  'apr',
  'depositAmount',
  'collectable',
  'paymentOnTerms',
  'retentionAmount',
  'expectedCashDay',
  'retentionCashDay',
  'available',
  'cashNeeded',
  'gap',
  'surplus',
  'runsShortDay',
  'shortDays',
  'bridgeCost',
  'absorbableDelay',
];

export function planCashflow(input) {
  const invoice = money(input.invoice);
  const materials = money(input.materials);
  const weeklyBurn = money(input.weeklyBurn);
  const terms = days(input.terms);
  const retention = percent(input.retention, 99);
  const delay = days(input.delay);
  const retentionRelease = days(input.retentionRelease);
  const startingCash = money(input.startingCash);
  const supplierTerms = days(input.supplierTerms);
  const apr = percent(input.apr, 200);

  // A deposit cannot exceed what the contract will ever release before
  // retention: asking for 95% up front on a job holding 10% back is not a
  // scenario, it is a typo, and clamping keeps the payment on terms from going
  // negative further down.
  const deposit = percent(input.deposit, 100 - retention);

  const collectable = invoice * (1 - retention / 100);
  const retentionAmount = invoice - collectable;
  const depositAmount = invoice * (deposit / 100);
  const expectedCashDay = terms + delay;
  const retentionCashDay = expectedCashDay + retentionRelease;

  // What still arrives on the payment date, given the deposit is already in
  // hand. Floored for safety; the deposit clamp above should make it moot.
  const paymentOnTerms = Math.max(0, collectable - depositAmount);

  // Cumulative cash out by day `t`. Burn is continuous; the materials invoice
  // is a step on its own due date, which is what supplier terms move.
  const outflowBy = (t) => weeklyBurn * (t / 7) + (t >= supplierTerms ? materials : 0);

  const available = startingCash + depositAmount;
  const materialsBeforePayment = supplierTerms <= expectedCashDay;
  const cashNeeded = outflowBy(expectedCashDay);
  const gap = Math.max(0, cashNeeded - available);
  const surplus = Math.max(0, available - cashNeeded);

  // The first day the running balance goes negative, or null if it never does
  // before the invoice lands. Stepped day by day rather than solved: the
  // materials step makes the closed form a case analysis, and the loop is
  // bounded by MAX_DAYS.
  let runsShortDay = null;
  if (gap > 0) {
    for (let t = 0; t <= expectedCashDay; t += 1) {
      if (outflowBy(t) > available) {
        runsShortDay = t;
        break;
      }
    }
    if (runsShortDay === null) runsShortDay = expectedCashDay;
  }
  const shortDays = runsShortDay === null ? 0 : Math.max(0, expectedCashDay - runsShortDay);

  // Daily simple interest on what is actually short each day, not on the peak
  // gap for the whole window. The shortfall ramps up as the burn accrues, so
  // charging the peak for every day roughly doubles the answer -- and a cost
  // that overstates is exactly as useless for the decision as one that
  // understates.
  let bridgeCost = 0;
  if (runsShortDay !== null && apr > 0) {
    for (let t = Math.ceil(runsShortDay); t <= expectedCashDay; t += 1) {
      bridgeCost += Math.max(0, outflowBy(t) - available);
    }
    bridgeCost *= apr / 100 / 365;
  }

  // How many days later than the buffer already assumes the client can pay
  // before this scenario stops being covered. Null when nothing bounds it --
  // no weekly burn means waiting costs nothing, so no amount of delay creates
  // a gap that was not there on day one.
  let absorbableDelay = null;
  if (gap > 0) {
    absorbableDelay = 0;
  } else if (weeklyBurn > 0) {
    absorbableDelay = 0;
    for (let extra = 1; expectedCashDay + extra <= MAX_DAYS; extra += 1) {
      if (outflowBy(expectedCashDay + extra) > available) break;
      absorbableDelay = extra;
    }
  }

  return {
    invoice,
    materials,
    weeklyBurn,
    terms,
    retention,
    delay,
    retentionRelease,
    startingCash,
    deposit,
    supplierTerms,
    apr,
    depositAmount,
    collectable,
    paymentOnTerms,
    retentionAmount,
    expectedCashDay,
    retentionCashDay,
    available,
    materialsBeforePayment,
    cashNeeded,
    gap,
    surplus,
    runsShortDay,
    shortDays,
    bridgeCost,
    absorbableDelay,
    safe: gap === 0,
  };
}

export function csvRow(plan) {
  return CSV_FIELDS.map((key) => {
    const value = plan[key];
    if (value === null || value === undefined) return '';
    return typeof value === 'number' ? Math.round(value * 100) / 100 : value;
  }).join(',');
}
