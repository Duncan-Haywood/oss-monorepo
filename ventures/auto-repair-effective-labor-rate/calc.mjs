/**
 * What an independent auto repair shop actually collects for an hour of labor.
 *
 * Every shop has a posted door rate. It is on the wall, on the estimate, and in
 * the owner's head when they work out whether a month was any good. Almost no
 * shop collects it. The rate that reaches the bank — the *effective labor rate*,
 * labor dollars divided by the hours those dollars were billed against — is
 * routinely 15-30% below the number on the wall, and the shortfall does not
 * arrive as a decision anyone made. It arrives as a coupon here, a fleet account
 * there, a warranty claim paid at a rate the manufacturer set, a diagnostic hour
 * waived to win the job, and a comeback that consumed a bay and billed nothing.
 *
 * The gap is invisible for a specific structural reason: none of those five
 * things looks like a discount at the moment it happens. A shop management
 * system reports labor sales and it reports hours, and the owner sees both go up
 * in a busy month. Dividing one by the other is the only operation that shows
 * the rate falling, and no report on the estimate does it.
 *
 * This module does that division and then does the harder half: it says *where*
 * the gap went, in the shop's own dollars, and what the door rate would have to
 * be to fix it.
 *
 * ## Four design decisions are load-bearing
 *
 * **The headline rate is measured over sold hours, not over all hours worked.**
 * `effectiveLaborRate` divides labor sales by customer-pay plus warranty hours,
 * which is the industry's own definition and the one a shop can check against
 * its management system in a minute. Internal and comeback hours — worked, and
 * billed to nobody — are reported separately as `effectiveRateOnAllHours`.
 * Folding them into the headline would produce a truer number that no shop could
 * reconcile against any report it already runs, and a figure nobody can check is
 * a figure nobody acts on.
 *
 * **The gap is decomposed into causes that are separately fixable.** A single
 * "you are $31 an hour under" is a fact; it is not a decision. Customer-pay
 * discounting is a pricing and sales-process problem, warranty shortfall is a
 * mix problem (the only lever is how much warranty work is accepted), and
 * internal hours are a quality and capacity problem. They have nothing in common
 * except the direction they push the rate, so a shop that reads only the total
 * will attack whichever one is most visible rather than whichever one is
 * largest.
 *
 * **Internal hours are counted as forgone capacity, not as a discount.** The
 * other two causes are hours that *were* sold for less than the door rate. An
 * internal hour was never sold at all — the bay, the lift and the technician
 * were consumed and no invoice exists. Priced at the door rate it is the revenue
 * the shop could have earned in that hour, which is why it is reported beside
 * the billing gap rather than added into it. Adding them would double-count the
 * shop's problem: the technician cost of those hours is already inside
 * `costPerBilledHour`, because the payroll paid for them.
 *
 * **Overhead carried by labor is what parts gross profit does not already
 * cover.** Allocating fixed expenses between the parts and labor departments by
 * some percentage is the textbook approach, and the percentage is always a
 * guess. Shop owners do not think that way in practice: parts gross profit pays
 * some of the bills and labor gross profit has to pay the rest. So the
 * denominator here is `max(0, overhead - partsGrossProfit)`, which needs no
 * allocation assumption and is checkable against a profit-and-loss statement.
 *
 * Nothing here is an accounting determination, a tax position, or advice about
 * what to charge. It is the shop's own numbers, divided.
 */

/** Required field ids read off the form, in the order the page presents them. */
export const NUMERIC_IDS = Object.freeze([
  'postedLaborRate',
  'customerPayHours',
  'customerPayLaborSales',
  'warrantyHours',
  'warrantyLaborSales',
  'internalHours',
  'technicianCount',
  'totalClockHours',
  'totalTechnicianPay',
  'monthlyOverhead',
  'partsGrossProfit',
  'targetLaborGrossProfit',
]);

/** Every id on the form. What the page reads, and what it marks when invalid. */
export const ALL_INPUT_IDS = Object.freeze([...NUMERIC_IDS]);

/**
 * A shop that bills above its own door rate is not an error.
 *
 * It happens — a menu job priced by the ticket rather than the hour, or a
 * specialty diagnostic sold as a flat fee that consumes less book time than it
 * charges. The realization ratio then exceeds 1, every downstream figure stays
 * finite, and the notes say so rather than the arithmetic refusing.
 */
const PERIOD_LABEL = 'month';

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function toNumber(value) {
  if (isBlank(value)) return NaN;
  return typeof value === 'number' ? value : Number(String(value).trim());
}

/**
 * Read one field, or record why it cannot be used.
 *
 * Blank is an error rather than a zero, for the same reason it is in every other
 * calculator here: `Number('')` is 0, and a blank labor-sales figure that became
 * $0 would report an effective rate of nothing, which looks like an answer and
 * is not one.
 */
function readField(errors, input, id, { min = 0, max = Infinity, label }) {
  const value = toNumber(input[id]);
  if (!Number.isFinite(value)) {
    errors.push({ id, message: `${label} is needed.` });
    return 0;
  }
  if (value < min) {
    errors.push({ id, message: `${label} cannot be below ${min}.` });
    return 0;
  }
  if (value > max) {
    errors.push({ id, message: `${label} cannot be above ${max}.` });
    return 0;
  }
  return value;
}

/**
 * The rate the shop collects, where the rest of it went, and what it costs.
 *
 * Returns `{ ok: false, errors }` when the inputs cannot produce a number, so a
 * caller never has to tell a real result from a placeholder one.
 */
export function calculateEffectiveLaborRate(input = {}) {
  const errors = [];
  const read = (id, opts) => readField(errors, input, id, opts);

  const postedLaborRate = read('postedLaborRate', { min: 0.01, max: 10000, label: 'Posted labor rate' });
  const customerPayHours = read('customerPayHours', { min: 0, max: 100000, label: 'Customer-pay hours billed' });
  const customerPayLaborSales = read('customerPayLaborSales', { min: 0, max: 100000000, label: 'Customer-pay labor sales' });
  const warrantyHours = read('warrantyHours', { min: 0, max: 100000, label: 'Warranty hours billed' });
  const warrantyLaborSales = read('warrantyLaborSales', { min: 0, max: 100000000, label: 'Warranty labor reimbursed' });
  const internalHours = read('internalHours', { min: 0, max: 100000, label: 'Internal, comeback and policy hours' });

  const technicianCount = read('technicianCount', { min: 1, max: 500, label: 'Technicians' });
  const totalClockHours = read('totalClockHours', { min: 1, max: 1000000, label: 'Technician clock hours paid' });
  const totalTechnicianPay = read('totalTechnicianPay', { min: 0, max: 100000000, label: 'Technician pay including payroll burden' });

  const monthlyOverhead = read('monthlyOverhead', { min: 0, max: 100000000, label: 'Shop overhead for the month' });
  const partsGrossProfit = read('partsGrossProfit', { min: 0, max: 100000000, label: 'Parts gross profit for the month' });
  const targetLaborGrossProfit = read('targetLaborGrossProfit', { min: 0, max: 99.9, label: 'Target labor gross profit' });

  if (errors.length > 0) return { ok: false, errors };

  const soldHours = customerPayHours + warrantyHours;
  // Nothing below divides by zero, but every rate it would produce is
  // meaningless: a month with no hours sold has no effective labor rate, and
  // reporting $0.00 would read as "you collected nothing an hour" rather than
  // "there is nothing here to measure".
  if (soldHours <= 0) {
    errors.push({
      id: 'customerPayHours',
      message: 'No hours were billed this month, so there is no rate to measure. Enter the customer-pay and warranty hours your management system reports.',
    });
    return { ok: false, errors };
  }

  const consumedHours = soldHours + internalHours;
  const laborSales = customerPayLaborSales + warrantyLaborSales;

  const effectiveLaborRate = laborSales / soldHours;
  const effectiveRateOnAllHours = laborSales / consumedHours;

  // What the same hours would have billed at the rate on the wall. This is the
  // counterfactual the whole page is built around, and it is deliberately taken
  // over sold hours only — internal hours are handled as capacity below.
  const laborSalesAtPostedRate = postedLaborRate * soldHours;
  const totalBillingGap = laborSalesAtPostedRate - laborSales;

  const customerPayGap = postedLaborRate * customerPayHours - customerPayLaborSales;
  const warrantyGap = postedLaborRate * warrantyHours - warrantyLaborSales;
  const internalOpportunity = postedLaborRate * internalHours;

  const customerPayEffectiveRate = customerPayHours > 0 ? customerPayLaborSales / customerPayHours : null;
  const warrantyEffectiveRate = warrantyHours > 0 ? warrantyLaborSales / warrantyHours : null;

  // The share of the door rate that survives to the invoice. Every "what if I
  // raised the rate" answer on this page runs through it, because a rate rise
  // is collected in the same proportion as the rate it replaces.
  const realizationRatio = effectiveLaborRate / postedLaborRate;

  const costPerBilledHour = totalTechnicianPay / soldHours;
  const costPerClockHour = totalTechnicianPay / totalClockHours;
  // Hours sold against hours paid for. Below 100% the shop is paying for time
  // that produced nothing billable, and that is the mechanism by which a $32
  // technician becomes $43 of cost inside every hour that is sold.
  const technicianEfficiency = (soldHours / totalClockHours) * 100;
  const unproductiveClockHours = Math.max(0, totalClockHours - soldHours);

  const laborGrossProfitDollars = laborSales - totalTechnicianPay;
  const laborGrossProfitPercent = laborSales > 0 ? (laborGrossProfitDollars / laborSales) * 100 : 0;

  // Parts gross profit pays what it pays; labor has to carry the rest. No
  // allocation percentage is invented, and both inputs are lines a shop can
  // read straight off a profit-and-loss statement.
  const overheadCarriedByLabor = Math.max(0, monthlyOverhead - partsGrossProfit);
  const breakEvenLaborRate = (totalTechnicianPay + overheadCarriedByLabor) / soldHours;

  const marginDivisor = 1 - targetLaborGrossProfit / 100;
  const requiredEffectiveRate = costPerBilledHour / marginDivisor;
  // The point of the page. A shop reading only `requiredEffectiveRate` will
  // post that number on the wall and collect `realizationRatio` of it.
  const requiredPostedRate = realizationRatio > 0 ? requiredEffectiveRate / realizationRatio : null;

  const netBeforeTax = laborGrossProfitDollars + partsGrossProfit - monthlyOverhead;

  const figures = {
    ok: true,
    errors: [],
    period: PERIOD_LABEL,
    postedLaborRate,
    technicianCount,
    targetLaborGrossProfit,

    soldHours,
    consumedHours,
    customerPayHours,
    warrantyHours,
    internalHours,
    customerPayLaborSales,
    warrantyLaborSales,
    laborSales,
    effectiveLaborRate,
    effectiveRateOnAllHours,
    realizationRatio,

    laborSalesAtPostedRate,
    totalBillingGap,
    customerPayGap,
    warrantyGap,
    internalOpportunity,
    customerPayEffectiveRate,
    warrantyEffectiveRate,
    gapShares: gapShares({ customerPayGap, warrantyGap, totalBillingGap }),

    totalClockHours,
    unproductiveClockHours,
    technicianEfficiency,
    totalTechnicianPay,
    costPerBilledHour,
    costPerClockHour,

    laborGrossProfitDollars,
    laborGrossProfitPercent,
    overheadCarriedByLabor,
    breakEvenLaborRate,
    coversCost: effectiveLaborRate >= breakEvenLaborRate,
    requiredEffectiveRate,
    requiredPostedRate,
    meetsTarget: laborGrossProfitPercent >= targetLaborGrossProfit,

    monthlyOverhead,
    partsGrossProfit,
    netBeforeTax,

    annualBillingGap: totalBillingGap * 12,
    annualInternalOpportunity: internalOpportunity * 12,
  };

  figures.notes = notes(figures);
  return figures;
}

/**
 * Each cause's share of the billing gap, or `null` when there is no gap.
 *
 * Shares of a negative total are not percentages of anything a reader would
 * recognise — a shop billing above its door rate has no gap to apportion — so
 * the result is `null` and the page says the rate was beaten rather than
 * printing "-140% of the shortfall came from warranty".
 */
export function gapShares({ customerPayGap, warrantyGap, totalBillingGap }) {
  if (!(totalBillingGap > 0)) return null;
  return {
    customerPay: (customerPayGap / totalBillingGap) * 100,
    warranty: (warrantyGap / totalBillingGap) * 100,
  };
}

/**
 * What the numbers say, in the shop owner's terms.
 *
 * Observations about the figures entered, never instructions. This page does not
 * tell anybody what to charge, what warranty work to accept, or who to employ —
 * it has no way to know the shop's market, its competition, or its contracts.
 * What it can do, and what is worth returning for, is name which single input is
 * doing the damage, because the causes are separately fixable and a shop reading
 * only the total will chase the most visible one.
 */
export function notes(f) {
  const out = [];
  const perHour = (value) => `$${Math.abs(value).toFixed(2)}`;
  const dollars = (value) => {
    const format = (value) => `$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };

  if (f.totalBillingGap > 0) {
    out.push(
      `Your effective labor rate is ${perHour(f.effectiveLaborRate)} against a posted rate of ${perHour(f.postedLaborRate)} — you collect ${(f.realizationRatio * 100).toFixed(0)} cents on every posted dollar. Across the hours you sold this month that is ${dollars(f.totalBillingGap)}, or about ${dollars(f.annualBillingGap)} a year at this month's mix.`,
    );
  } else if (f.totalBillingGap < 0) {
    out.push(
      `You billed ${dollars(-f.totalBillingGap)} more than your posted rate would have produced this month, so your effective rate of ${perHour(f.effectiveLaborRate)} is above the ${perHour(f.postedLaborRate)} on the wall. That usually means menu or flat-fee pricing is selling more than the book time it consumes — worth knowing which jobs, because the mix is doing the work rather than the rate.`,
    );
  }

  if (f.gapShares && f.gapShares.warranty >= 40) {
    out.push(
      `Warranty is ${f.gapShares.warranty.toFixed(0)}% of the shortfall: ${perHour(f.warrantyEffectiveRate)} an hour across ${f.warrantyHours.toLocaleString('en-US')} warranty hours, against ${perHour(f.postedLaborRate)} posted. The rate on that work is set by whoever pays the claim, so the only lever here is how much of it the shop takes on — a decision about mix, not about pricing.`,
    );
  }

  if (f.gapShares && f.gapShares.customerPay >= 40) {
    out.push(
      `Customer-pay work is ${f.gapShares.customerPay.toFixed(0)}% of the shortfall: ${perHour(f.customerPayEffectiveRate)} an hour collected across ${f.customerPayHours.toLocaleString('en-US')} hours, against ${perHour(f.postedLaborRate)} posted. Unlike warranty, every dollar of this one was given away by the shop — coupons, fleet and wholesale rates, waived diagnostic time, and book hours trimmed to close the sale. It is the half of the gap the shop controls.`,
    );
  }

  if (f.internalHours > 0) {
    const share = (f.internalHours / f.consumedHours) * 100;
    out.push(
      `${f.internalHours.toLocaleString('en-US')} hours went to comebacks, policy work and shop vehicles — ${share.toFixed(0)}% of every hour your technicians turned. Nobody was invoiced for them, but payroll paid for them, so they are already inside your ${perHour(f.costPerBilledHour)} cost per billed hour. At your posted rate those bays could have produced ${dollars(f.internalOpportunity)} this month, ${dollars(f.annualInternalOpportunity)} a year.`,
    );
  }

  if (f.technicianEfficiency < 100) {
    out.push(
      `You paid for ${Math.round(f.totalClockHours).toLocaleString('en-US')} technician hours and sold ${Math.round(f.soldHours).toLocaleString('en-US')} of them — ${f.technicianEfficiency.toFixed(0)}% efficiency. That is why a technician costing ${perHour(f.costPerClockHour)} a clock hour costs ${perHour(f.costPerBilledHour)} inside every hour you actually bill. The ${Math.round(f.unproductiveClockHours).toLocaleString('en-US')} unsold hours are the difference.`,
    );
  } else if (f.technicianEfficiency > 100) {
    out.push(
      `You sold ${f.technicianEfficiency.toFixed(0)}% of the technician hours you paid for, which is what flat-rate pay is designed to produce: book time billed can exceed clock time on work a technician beats the guide on. Cost per billed hour (${perHour(f.costPerBilledHour)}) is below cost per clock hour (${perHour(f.costPerClockHour)}) for the same reason.`,
    );
  }

  if (!f.coversCost) {
    out.push(
      `At ${perHour(f.effectiveLaborRate)} an hour, labor is not covering its own cost plus the ${dollars(f.overheadCarriedByLabor)} of overhead your parts gross profit does not pay for. Break-even on that basis is ${perHour(f.breakEvenLaborRate)} an hour, so the month is ${dollars(f.netBeforeTax)} ${f.netBeforeTax < 0 ? 'short' : 'clear'} before tax.`,
    );
  }

  if (!f.meetsTarget && f.requiredPostedRate !== null) {
    out.push(
      `A ${f.targetLaborGrossProfit.toFixed(0)}% labor gross profit needs ${perHour(f.requiredEffectiveRate)} an hour to actually reach the invoice. At the ${(f.realizationRatio * 100).toFixed(0)}% of your posted rate you currently collect, that means a posted rate of ${perHour(f.requiredPostedRate)} — not ${perHour(f.requiredEffectiveRate)}. Raising the number on the wall is collected in the same proportion as the number it replaces, which is why a rate rise on its own usually lands short of what it was meant to fix.`,
    );
  } else if (f.meetsTarget) {
    out.push(
      `Labor gross profit is ${f.laborGrossProfitPercent.toFixed(1)}%, at or above the ${f.targetLaborGrossProfit.toFixed(1)}% you asked for. The figure to watch from here is the ${(f.realizationRatio * 100).toFixed(0)}% realization above — gross profit holds while the mix does, and the mix is what moves first.`,
    );
  }

  return out;
}
