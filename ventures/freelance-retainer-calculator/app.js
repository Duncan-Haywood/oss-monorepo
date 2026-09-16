import { buildShareUrl, decodeInputs, FIELD_IDS } from './share.mjs';

// Remember the visitor's usage-counting choice between visits. The control
// gates the counter correctly and was never stored, so it came back in its
// default state and the choice was silently undone -- a control that quietly
// stops working is worse than none, because the visitor believes they have
// already used it. Polarity-agnostic on purpose: this page's control may mean
// "count me" or "do not", and what has to survive is whichever the visitor
// chose.
// It runs first in this script, before anything is recorded or a shared
// link is replayed. A restore that runs afterwards is too late: the
// control is still in its default state while the startup events go
// through, so a visitor who opted out has a visit counted anyway and a
// visitor who opted in loses one.
(() => {
  const usagePreference = 'freelance-retainer-calculator-usage-preference';
  // A few ventures import this file under `node --test`, with no DOM or a
  // stub one. Remembering a preference must not be what breaks that.
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;
  if (typeof document.getElementById !== 'function') return;
  const usageControl = document.getElementById('optOut');
  if (!usageControl || typeof usageControl.addEventListener !== 'function') return;
  try {
    const saved = localStorage.getItem(usagePreference);
    if (saved !== null) usageControl.checked = saved === '1';
  } catch { /* a browser refusing site data simply does not remember */ }
  usageControl.addEventListener('change', () => {
    try { localStorage.setItem(usagePreference, usageControl.checked ? '1' : '0'); }
    catch { /* as above */ }
  });
})();

const $ = (id) => document.getElementById(id);
const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' };
export const CURRENCIES = Object.keys(symbols);
export const PAYMENT_TERMS = {
  prepaid: { days: 0, label: 'Prepaid on kickoff' },
  net15: { days: 15, label: 'Invoice on kickoff, Net 15' },
  net30: { days: 30, label: 'Invoice on kickoff, Net 30' },
  arrears15: { days: 45, label: 'Invoice at month-end, Net 15' },
  arrears30: { days: 60, label: 'Invoice at month-end, Net 30' },
};
// `otherRevenue`, `otherHours` and `fillRate` describe the rest of the
// freelancer's month, not this client. They are saved in the local draft like
// everything else, but `formatProposalSummary` must never print them: that
// summary is copied into a client-facing proposal, and what other clients pay
// is none of its business. A test asserts the summary stays clean.
// A shareable plan link *does* carry them — that link is for a partner or
// future-you, not the client-facing proposal.
export const inputIds = ['income', 'costs', 'hours', 'utilization', 'retainerHours', 'buffer', 'otherRevenue', 'otherHours', 'fillRate', 'offeredPrice', 'currency', 'paymentTerms'];
export { FIELD_IDS };
export const DRAFT_KEY = 'frc-draft-v1';
export const DISCLAIMER = 'Planning aid only. No warranty. Review and verify this output before relying on it; it is not financial advice.';
export const DEFAULT_RETAINER_HOURS = [10, 15, 20, 25, 30];

export function retainerHourOptions(currentHours, defaults = DEFAULT_RETAINER_HOURS) {
  const hours = Number(currentHours);
  const options = defaults.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (Number.isFinite(hours) && hours > 0) options.push(hours);
  return [...new Set(options)].sort((left, right) => left - right);
}

export function compareRetainerScenarios(values, hourOptions) {
  const selectedHours = Number(values.retainerHours);
  return retainerHourOptions(values.retainerHours, hourOptions ?? DEFAULT_RETAINER_HOURS).map((retainerHours) => {
    try {
      const plan = calculatePlan({ ...values, retainerHours });
      const shareOfCapacity = plan.capacity > 0 ? retainerHours / plan.capacity : 0;
      return {
        retainerHours,
        ok: true,
        selected: selectedHours === retainerHours,
        capacity: plan.capacity,
        remainingCapacity: plan.remainingCapacity,
        target: plan.target,
        rate: plan.rate,
        retainer: plan.retainer,
        shareOfCapacity,
        annual: Math.round(plan.retainer * 12 * 100) / 100,
        effectiveRate: plan.retainer / retainerHours,
      };
    } catch (error) {
      return {
        retainerHours,
        ok: false,
        selected: selectedHours === retainerHours,
        error: error.message,
      };
    }
  });
}

export function formatScenarioComparison(scenarios, currency = 'USD') {
  const symbol = symbols[currency] || symbols.USD;
  const money = (value) => `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const lines = ['Package options from the same assumptions'];
  for (const row of scenarios) {
    if (!row.ok) {
      lines.push(`${row.retainerHours} hours — exceeds billable capacity`);
      continue;
    }
    const mark = row.selected ? '  ← this proposal' : '';
    lines.push(`${row.retainerHours} hours — ${money(row.retainer)} / month — ${row.remainingCapacity.toFixed(1)} hours left${mark}`);
  }
  return lines.join('\n');
}

export function scenarioInsight(scenarios) {
  const selected = scenarios.find((row) => row.selected && row.ok);
  if (!selected) {
    const largestFit = [...scenarios].reverse().find((row) => row.ok);
    return largestFit
      ? `That package does not fit this month. The largest size that does is ${largestFit.retainerHours} hours.`
      : '';
  }
  const pct = Math.round(selected.shareOfCapacity * 100);
  const half = scenarios.filter((row) => row.ok && row.shareOfCapacity <= 0.5).at(-1);
  if (pct > 50) {
    return `This ${selected.retainerHours}-hour package uses ${pct}% of your billable capacity. One client would take more than half your month; leave room for other work or raise the price to compensate for concentration risk.`;
  }
  if (half && half.retainerHours !== selected.retainerHours) {
    return `This ${selected.retainerHours}-hour package uses ${pct}% of your billable capacity. You could include up to ${half.retainerHours} hours and still keep at least half your capacity for other clients.`;
  }
  return `This ${selected.retainerHours}-hour package uses ${pct}% of your billable capacity. That leaves room for other clients, admin, and recovery.`;
}

export function usableCurrency(value) {
  const key = String(value || '').trim().toUpperCase();
  return CURRENCIES.includes(key) ? key : '';
}

export function usablePaymentTerms(value) {
  const key = String(value || '').trim();
  return Object.hasOwn(PAYMENT_TERMS, key) ? key : '';
}

function draftField(id, raw) {
  if (typeof raw !== 'string') return '';
  if (id === 'currency') return usableCurrency(raw);
  if (id === 'paymentTerms') return usablePaymentTerms(raw);
  return raw;
}

export function saveDraft(values, storage) {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(inputIds.map((id) => [id, draftField(id, String(values[id] ?? ''))]))));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage) {
  try {
    const draft = JSON.parse(storage.getItem(DRAFT_KEY) || 'null');
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
    return Object.fromEntries(inputIds.map((id) => [id, draftField(id, draft[id])]));
  } catch {
    return null;
  }
}

export const USAGE_FRACTIONS = [0.5, 0.75, 1, 1.25];

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function calculatePlan(values) {
  const income = Number(values.income), costs = Number(values.costs), hours = Number(values.hours);
  const utilization = Number(values.utilization) / 100, retainerHours = Number(values.retainerHours);
  const buffer = Number(values.buffer) / 100;
  if (![income, costs, hours, utilization, retainerHours, buffer].every(Number.isFinite) || income < 0 || costs < 0 || hours <= 0 || utilization <= 0 || utilization > 1 || retainerHours <= 0 || buffer < 0 || buffer > 1) throw new Error('Enter valid positive values. Utilization and buffer must be percentages from 0 to 100.');
  const capacity = hours * utilization;
  if (retainerHours > capacity) throw new Error(`The retainer needs ${retainerHours} hours, but your plan has only ${capacity.toFixed(1)} billable hours available.`);
  const target = income + costs;
  const rate = target / capacity;
  const retainer = Math.round(rate * retainerHours * (1 + buffer) * 100) / 100;
  return { capacity, remainingCapacity: capacity - retainerHours, target, rate, retainer, retainerHours, buffer };
}

/**
 * Compare a client's offered monthly price to the planning floor.
 * Blank is "I have not been offered a number yet." A typed value shows the
 * gap, the effective hourly rate, and how many hours still fit the floor.
 * Arithmetic only — it does not tell the freelancer to accept or walk away.
 */
export function compareOffer(plan, offeredPriceRaw) {
  if (offeredPriceRaw === '' || offeredPriceRaw == null) return null;
  const offeredPrice = Number(offeredPriceRaw);
  if (!Number.isFinite(offeredPrice) || offeredPrice < 0) {
    throw new Error('Enter a valid offered monthly price, or leave it blank.');
  }
  const buffer = Number.isFinite(plan.buffer) ? plan.buffer : 0;
  const loadedRate = plan.rate * (1 + buffer);
  const bufferedHours = plan.retainerHours * (1 + buffer);
  const hoursAtFloor = loadedRate > 0 ? Math.round((offeredPrice / loadedRate) * 10) / 10 : 0;
  const gap = Math.round((offeredPrice - plan.retainer) * 100) / 100;
  return {
    offeredPrice,
    gap,
    belowFloor: offeredPrice + 0.005 < plan.retainer,
    effectiveIncluded: offeredPrice / plan.retainerHours,
    effectiveBuffered: bufferedHours > 0 ? offeredPrice / bufferedHours : 0,
    hoursAtFloor,
  };
}

export const DEFAULT_FILL_RATE = 100;

/**
 * Whether this retainer actually reaches the income goal — which is not the
 * same question as whether it clears the hourly floor.
 *
 * `calculatePlan` derives the floor as `target / capacity`: the rate that hits
 * the goal *if every billable hour in the month is sold*. A 20-hour retainer
 * out of 104 billable hours can clear that floor to the penny and still leave
 * the freelancer thousands short, because the other 84 hours are an assumption
 * nobody made out loud. Every other number on the page is about one client;
 * this one is about the month.
 *
 * So: name what is already sold (this retainer plus any other committed work),
 * name how much of what is left you actually expect to bill, and report the
 * gap. `requiredFillRate` is the honest headline — the share of unsold
 * capacity that has to turn into billed work for the goal to arrive.
 *
 * Defaults reproduce the tool's previous implicit assumption exactly: no other
 * commitments and a 100% fill rate. The change is that the assumption is now
 * on screen instead of buried in the arithmetic.
 */
export function calculateIncomeCoverage(plan, options = {}) {
  const rate = Number(plan?.rate);
  const retainer = Number(plan?.retainer);
  const target = Number(plan?.target);
  const capacity = Number(plan?.capacity);
  const retainerHours = Number(options.retainerHours ?? plan?.retainerHours);
  if (![rate, retainer, target, capacity, retainerHours].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Need a priced retainer and a positive hourly floor to check the income goal.');
  }

  const otherRevenue = Number(options.otherRevenue ?? 0);
  const otherHours = Number(options.otherHours ?? 0);
  const fillRatePercent = Number(options.fillRatePercent ?? DEFAULT_FILL_RATE);
  if (![otherRevenue, otherHours].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('Other committed revenue and hours must be zero or more.');
  }
  if (!Number.isFinite(fillRatePercent) || fillRatePercent < 0 || fillRatePercent > 100) {
    throw new Error('Expected fill rate must be a percentage from 0 to 100.');
  }

  const committedHours = round2(retainerHours + otherHours);
  if (committedHours > capacity + 1e-9) {
    throw new Error(`This retainer plus your other commitments need ${committedHours} hours, but your plan has only ${capacity.toFixed(1)} billable hours.`);
  }
  const committedRevenue = round2(retainer + otherRevenue);
  const unsoldHours = round2(Math.max(0, capacity - committedHours));

  const fillRate = fillRatePercent / 100;
  const expectedFillHours = round2(unsoldHours * fillRate);
  const expectedOtherRevenue = round2(expectedFillHours * rate);
  const expectedRevenue = round2(committedRevenue + expectedOtherRevenue);
  const shortfall = round2(target - expectedRevenue);
  const coversTarget = shortfall <= 1e-9;

  // The break-even that makes the rest trustworthy: what share of the unsold
  // hours has to become billed work. Above 100% means no amount of selling
  // inside this capacity closes the gap — the price, the capacity, or the
  // client list has to change instead. Reported as the raw figure rather than
  // suppressed, because "you would need 140% of the hours you have" is a more
  // useful answer than "unreachable".
  const gapAfterCommitted = round2(target - committedRevenue);
  const requiredFillRate = unsoldHours > 0
    ? round2(Math.max(0, (gapAfterCommitted / (unsoldHours * rate)) * 100))
    : null;
  const reachableWithinCapacity = requiredFillRate !== null
    ? requiredFillRate <= 100 + 1e-9
    : gapAfterCommitted <= 1e-9;

  const hoursToClose = shortfall > 0 ? round2(shortfall / rate) : 0;
  // What this retainer alone would have to cost to close the gap by itself —
  // the "or raise the price" branch of the same decision.
  const retainerPriceToCloseGap = shortfall > 0 ? round2(retainer + shortfall) : round2(retainer);
  const retainerShareOfTarget = round2((retainer / target) * 100);

  // The verdict is the one place a reader meets these figures in prose, so it
  // formats its own money. `options.currency` is display-only and changes no
  // arithmetic; every numeric field on the returned object stays a raw number.
  const money = (value) => moneyText(value, options.currency ?? 'USD');
  const parts = [];
  if (coversTarget) {
    parts.push(`At ${fillRatePercent}% fill on the ${unsoldHours} unsold hours, the month reaches ${money(expectedRevenue)} against a ${money(target)} target. This retainer is ${retainerShareOfTarget}% of it.`);
    if (requiredFillRate !== null && requiredFillRate > 0) {
      parts.push(`The goal survives down to a ${requiredFillRate}% fill rate before it stops arriving.`);
    }
  } else {
    parts.push(`This retainer clears your ${money(round2(rate))}/hr floor, but the month does not reach the goal: ${money(expectedRevenue)} of ${money(target)}, ${money(shortfall)} short. The retainer is only ${retainerShareOfTarget}% of the target — the rest is ${unsoldHours} unsold hours you are assuming will fill.`);
    if (requiredFillRate === null) {
      parts.push('There are no unsold hours left to fill, so the gap can only close on price or capacity.');
    } else if (reachableWithinCapacity) {
      parts.push(`Closing it needs ${hoursToClose} more billed hours — a ${requiredFillRate}% fill rate rather than ${fillRatePercent}%. If that is not the year you are having, price this retainer at ${money(retainerPriceToCloseGap)} instead, or plan for a second client.`);
    } else {
      parts.push(`No fill rate closes it: even billing every one of the ${unsoldHours} unsold hours leaves you short, because you would need ${requiredFillRate}% of them. Raise the price toward ${money(retainerPriceToCloseGap)}, add capacity, or lower the take-home goal — selling harder cannot do it.`);
    }
  }

  return {
    quotedHourlyRate: round2(rate),
    retainerPrice: round2(retainer),
    target: round2(target),
    capacity: round2(capacity),
    otherRevenue: round2(otherRevenue),
    otherHours: round2(otherHours),
    committedHours,
    committedRevenue,
    unsoldHours,
    fillRatePercent,
    expectedFillHours,
    expectedOtherRevenue,
    expectedRevenue,
    shortfall: round2(Math.max(0, shortfall)),
    surplus: round2(Math.max(0, -shortfall)),
    coversTarget,
    requiredFillRate,
    reachableWithinCapacity,
    hoursToClose,
    retainerPriceToCloseGap,
    retainerShareOfTarget,
    recommendation: parts.join(' '),
  };
}

export function formatIncomeCoverageAdvice(coverage, currency = 'USD') {
  const money = (value) => moneyText(value, currency);
  if (coverage.coversTarget) {
    return `Income goal: reached at a ${coverage.fillRatePercent}% fill rate — ${money(coverage.expectedRevenue)} against ${money(coverage.target)}.`;
  }
  return `Income goal: ${money(coverage.shortfall)} short at a ${coverage.fillRatePercent}% fill rate. ${coverage.reachableWithinCapacity ? `Needs ${coverage.requiredFillRate}% instead, or ${money(coverage.retainerPriceToCloseGap)} for this retainer.` : `Unreachable by selling — this retainer would have to be ${money(coverage.retainerPriceToCloseGap)}.`}`;
}

/**
 * A monthly retainer price is not cash. Days until first payment times
 * the monthly revenue target / 30 is the working capital this client
 * asks you to lend. Prepaid is zero. Month-end plus Net 30 is ~60 days.
 */
export function calculateCashFloat(target, paymentTerms = 'prepaid') {
  if (!Number.isFinite(Number(target)) || Number(target) < 0) {
    throw new Error('Enter a valid monthly revenue target before estimating cash you must float.');
  }
  const key = usablePaymentTerms(paymentTerms) || 'prepaid';
  const term = PAYMENT_TERMS[key];
  return {
    paymentTerms: key,
    days: term.days,
    cashToFloat: Math.round(Number(target) * (term.days / 30) * 100) / 100,
    label: term.label,
    prepaid: term.days === 0,
  };
}

export function comparePaymentTerms(target) {
  return Object.keys(PAYMENT_TERMS).map((key) => calculateCashFloat(target, key));
}

function moneyText(value, currency = 'USD') {
  const symbol = symbols[usableCurrency(currency) || 'USD'] || symbols.USD;
  return `${symbol}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatCashFloatAdvice(float, currency = 'USD') {
  if (float.prepaid) {
    return `Payment terms: ${float.label}. First cash arrives at kickoff, so you do not float this retainer.`;
  }
  return `Payment terms: ${float.label}. First cash is about ${float.days} days after kickoff. You need to float ${moneyText(float.cashToFloat, currency)} — one monthly revenue target times ${float.days}/30 — from savings or other clients. If you cannot float that, require prepaid or 50% on kickoff.`;
}

export function formatArrearsComparison(target, currency = 'USD') {
  const worst = calculateCashFloat(target, 'arrears30');
  return `If this client paid at month-end plus Net 30, you would float ${moneyText(worst.cashToFloat, currency)} for about 60 days.`;
}

/**
 * Show whether the quoted retainer still pays the hourly floor when the
 * client uses half the block, the full block, or more than they bought.
 *
 * Light use leaves unused-hour cash (the usual renewal risk). Use above
 * break-even without billed overage drops the effective rate below the floor.
 */
export function compareRetainerUsage(plan, options = {}) {
  const rate = Number(plan?.rate);
  const retainer = Number(plan?.retainer);
  const retainerHours = Number(options.retainerHours ?? plan?.retainerHours);
  if (![rate, retainer, retainerHours].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Need a priced retainer and a positive hourly floor to compare usage.');
  }

  const fractions = Array.isArray(options.fractions) && options.fractions.length
    ? options.fractions
    : USAGE_FRACTIONS;
  if (fractions.some((fraction) => !Number.isFinite(fraction) || fraction <= 0)) {
    throw new Error('Usage fractions must be positive numbers.');
  }

  const breakEvenHours = round2(retainer / rate);
  const bufferHours = round2(breakEvenHours - retainerHours);
  const rows = fractions.map((fraction) => {
    const hoursUsed = round2(retainerHours * fraction);
    const hourlyAtFloor = round2(rate * hoursUsed);
    const effectiveRate = round2(retainer / hoursUsed);
    const unusedHours = round2(Math.max(0, retainerHours - hoursUsed));
    const overageHours = round2(Math.max(0, hoursUsed - retainerHours));
    const overageBill = round2(overageHours * rate);
    const withOverageRevenue = round2(retainer + overageBill);
    const withOverageEffectiveRate = round2(withOverageRevenue / hoursUsed);
    const percent = Math.round(fraction * 100);
    return {
      fraction,
      label: `${percent}% of the block`,
      hoursUsed,
      retainerRevenue: round2(retainer),
      hourlyAtFloor,
      freelancerDelta: round2(retainer - hourlyAtFloor),
      effectiveRate,
      coversFloor: effectiveRate + 1e-9 >= rate,
      unusedHours,
      overageHours,
      withOverageRevenue,
      withOverageEffectiveRate,
      withOverageCoversFloor: withOverageEffectiveRate + 1e-9 >= rate,
      withOverageDelta: round2(withOverageRevenue - hourlyAtFloor),
    };
  });

  const overageRisk = rows.find((row) => row.overageHours > 0 && !row.coversFloor);
  const unusedRisk = rows.find((row) => row.unusedHours > 0 && row.fraction <= 0.5);
  const parts = [];
  if (bufferHours >= 0) {
    parts.push(`This retainer covers your ${round2(rate)}/hr floor up to ${breakEvenHours} hours. The ${retainerHours}-hour block still has ${bufferHours} hours of buffer before unpaid extras drop you below that floor.`);
  } else {
    parts.push(`The quoted price already sits below your hourly floor at full use (${round2(retainer / retainerHours)}/hr vs ${round2(rate)}/hr). Raise the retainer or cut included hours before you send it.`);
  }
  if (overageRisk) {
    parts.push(`At ${overageRisk.hoursUsed} hours with no overage you are at ${overageRisk.effectiveRate}/hr. Bill those extra hours at the floor rate and the same month still covers (${overageRisk.withOverageEffectiveRate}/hr).`);
  }
  if (unusedRisk && unusedRisk.freelancerDelta > 0) {
    parts.push(`At ${unusedRisk.hoursUsed} hours they paid the full retainer for work that would have billed ${unusedRisk.hourlyAtFloor} at your floor rate. That unused-hour cash is why light-use retainers often fail to renew — shorten the block or sell hourly if that is the real pattern.`);
  }

  return {
    quotedHourlyRate: round2(rate),
    retainerPrice: round2(retainer),
    includedHours: retainerHours,
    breakEvenHours,
    bufferHours,
    rows,
    recommendation: parts.join(' '),
  };
}

/**
 * Unused hours that roll into next month are not a courtesy. They are
 * unpaid delivery in month 2. Compare expire vs cap-at-buffer vs
 * unlimited one-month rollover after a light first month.
 */
export function compareUnusedHourRollover(plan, options = {}) {
  const rate = Number(plan?.rate);
  const retainer = Number(plan?.retainer);
  const retainerHours = Number(options.retainerHours ?? plan?.retainerHours);
  const month1Fraction = Number(options.month1Fraction ?? 0.5);
  const month2Fraction = Number(options.month2Fraction ?? 1);
  if (![rate, retainer, retainerHours].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Need a priced retainer and a positive hourly floor to compare unused-hour rollover.');
  }
  if (![month1Fraction, month2Fraction].every((value) => Number.isFinite(value) && value >= 0 && value <= 2)) {
    throw new Error('Month usage must be a percentage from 0 to 200.');
  }

  const month1Hours = round2(retainerHours * month1Fraction);
  const unusedHours = round2(Math.max(0, retainerHours - month1Hours));
  const month2NewHours = round2(retainerHours * month2Fraction);
  const breakEvenHours = round2(retainer / rate);
  const bufferHours = round2(Math.max(0, breakEvenHours - retainerHours));
  const cappedRoll = round2(Math.min(unusedHours, bufferHours));

  const clauses = [
    { key: 'expire', label: 'Unused hours expire', rolledHours: 0 },
    { key: 'cap-buffer', label: `Rollover capped at ${bufferHours} buffer hours`, rolledHours: cappedRoll },
    { key: 'unlimited', label: 'Unused hours roll one month', rolledHours: unusedHours },
  ].map((clause) => {
    const month2Hours = round2(month2NewHours + clause.rolledHours);
    const month2Effective = month2Hours > 0 ? round2(retainer / month2Hours) : 0;
    const twoMonthHours = round2(month1Hours + month2Hours);
    const twoMonthRevenue = round2(retainer * 2);
    const twoMonthEffective = twoMonthHours > 0 ? round2(twoMonthRevenue / twoMonthHours) : 0;
    const giftedHours = clause.rolledHours;
    const giftedCash = round2(giftedHours * rate);
    return {
      ...clause,
      month2Hours,
      month2Effective,
      month2CoversFloor: month2Effective + 1e-9 >= rate,
      twoMonthHours,
      twoMonthRevenue,
      twoMonthEffective,
      twoMonthCoversFloor: twoMonthEffective + 1e-9 >= rate,
      giftedHours,
      giftedCash,
    };
  });

  const unlimited = clauses.find((row) => row.key === 'unlimited');
  const cap = clauses.find((row) => row.key === 'cap-buffer');
  const parts = [];
  if (unusedHours <= 0) {
    parts.push(`Month 1 used the full ${retainerHours}-hour block, so there is nothing to roll. Rollover language does not change month 2.`);
  } else if (!unlimited.month2CoversFloor) {
    parts.push(`A light ${month1Hours}-hour first month leaves ${unusedHours} unused hours. If those roll into a ${month2NewHours}-hour second month, you deliver ${unlimited.month2Hours} hours for ${round2(retainer)} — ${unlimited.month2Effective}/hr, below the ${round2(rate)}/hr floor. That is ${unlimited.giftedHours} unpaid hours, ${unlimited.giftedCash} at the floor.`);
    if (cap.month2CoversFloor) {
      parts.push(`Cap rollover at the ${bufferHours}-hour buffer and month 2 stays at ${cap.month2Effective}/hr.`);
    } else {
      parts.push('Even a buffer-sized cap still leaves month 2 below the floor. Expire unused hours or bill the rolled hours at the floor.');
    }
  } else {
    parts.push(`Rollover of ${unusedHours} unused hours still covers the floor on month 2 (${unlimited.month2Effective}/hr). The gift is still ${unlimited.giftedCash} of unpaid time — write a cap so a quieter first month cannot stack.`);
  }

  return {
    quotedHourlyRate: round2(rate),
    retainerPrice: round2(retainer),
    includedHours: retainerHours,
    month1Hours,
    unusedHours,
    month2NewHours,
    breakEvenHours,
    bufferHours,
    clauses,
    recommendation: parts.join(' '),
  };
}

export function formatRolloverAdvice(rollover, currency = 'USD') {
  if (rollover.unusedHours <= 0) return rollover.recommendation;
  const unlimited = rollover.clauses.find((row) => row.key === 'unlimited');
  return `${rollover.recommendation} Walk-away: expire unused hours or bill the ${unlimited.giftedHours} rolled hours at ${moneyText(rollover.quotedHourlyRate, currency)}/hr (${moneyText(unlimited.giftedCash, currency)}).`;
}

export function formatProposalSummary(input, plan, currency = 'USD', comparison = null, rollover = null) {
  const money = (value) => moneyText(value, currency);
  const usage = comparison ?? compareRetainerUsage(plan, { retainerHours: Number(input.retainerHours) });
  const roll = rollover ?? compareUnusedHourRollover(plan, { retainerHours: Number(input.retainerHours) });
  const float = calculateCashFloat(plan.target, input.paymentTerms);
  return `Monthly retainer proposal\n\nIncluded: ${input.retainerHours} hours per month\nMonthly price: ${money(plan.retainer)}\nAdditional work: ${money(plan.rate)} per hour\nCapacity left after retainer: ${plan.remainingCapacity.toFixed(1)} hours\nUnpaid extras drop below the floor after: ${usage.breakEvenHours} hours\nUnused-hour rollover: ${formatRolloverAdvice(roll, currency)}\n${formatCashFloatAdvice(float, currency)}\n\nPricing assumptions\nTake-home goal: ${money(Number(input.income))} per month\nBusiness costs and taxes: ${money(Number(input.costs))} per month\nAvailable work hours: ${input.hours} per month\nBillable utilization: ${input.utilization}%\nScope / revision buffer: ${input.buffer}%\n\nResponse time and out-of-scope work: define in the agreement.\n\n${DISCLAIMER}`;
}

if (typeof document !== 'undefined') {
  const track = (event) => {
    if ($('optOut')?.checked || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    try {
      const events = JSON.parse(localStorage.getItem('frc-events') || '{}');
      events[event] = (events[event] || 0) + 1;
      localStorage.setItem('frc-events', JSON.stringify(events));
    } catch {
      // Usage measurement is best-effort and must never block the calculator.
    }
  };
  if ($('calculator')) {
    const form = $('calculator');
    const money = (n) => moneyText(n, $('currency').value);
    const read = () => Object.fromEntries(inputIds.map((id) => [id, $(id)?.value ?? '']));
    const apply = (values) => {
      for (const id of FIELD_IDS) {
        if (values[id] === undefined || !$(id)) continue;
        $(id).value = String(values[id]);
      }
    };
    const storage = (() => { try { return window.localStorage; } catch { return null; } })();
    const syncCurrencyLabels = () => {
      const symbol = symbols[$('currency').value] || symbols.USD;
      document.querySelectorAll('[data-currency-symbol]').forEach((el) => { el.textContent = symbol; });
    };
    const save = () => storage && saveDraft(read(), storage) && ($('draftStatus').textContent = 'Draft saved locally.');
    const copyShareLink = async () => {
      const link = buildShareUrl(location.href, read());
      try { history.replaceState(null, '', link); } catch { /* file URLs may reject it */ }
      try {
        await navigator.clipboard.writeText(link);
        $('copyStatus').textContent = ' Shareable link copied.';
        $('draftStatus').textContent = 'Shareable link copied. It carries only these planning numbers in the URL hash.';
        track('share-link');
      } catch {
        window.prompt('Copy this private link:', link);
        $('copyStatus').textContent = ' Copy was blocked. The link is in the prompt.';
      }
    };
    // A shared link wins over a local draft so the recipient always sees the
    // sender's numbers. HTML defaults fill any field the link omitted.
    const fromLink = decodeInputs(location.hash || location.search);
    const openedFromLink = Object.keys(fromLink).length > 0;
    if (openedFromLink) {
      apply(fromLink);
      $('draftStatus').textContent = 'Opened a shared plan. Review the numbers before you quote.';
    } else if (storage) {
      const draft = loadDraft(storage);
      if (draft) {
        inputIds.forEach((id) => { if (draft[id] !== '' && $(id)) $(id).value = draft[id]; });
        $('draftStatus').textContent = 'Restored your last draft from this browser.';
      }
    }
    if (storage) {
      inputIds.forEach((id) => {
        if (!$(id)) return;
        $(id).addEventListener('input', save);
        $(id).addEventListener('change', save);
      });
    }
    $('currency').addEventListener('change', syncCurrencyLabels);
    syncCurrencyLabels();
    const renderUsage = (comparison) => {
      const tbody = $('usageRows');
      tbody.replaceChildren();
      for (const row of comparison.rows) {
        const tr = document.createElement('tr');
        if (!row.coversFloor) tr.className = 'warn-row';
        const cells = [
          row.label,
          `${row.hoursUsed} h`,
          money(row.retainerRevenue),
          money(row.hourlyAtFloor),
          money(row.effectiveRate),
          row.coversFloor ? 'Yes — at or above floor' : 'No — below floor',
        ];
        for (const text of cells) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      $('usageBreakEven').textContent = `${comparison.breakEvenHours} hours`;
      $('usageVerdict').textContent = comparison.recommendation;
    };
    const renderRollover = (rollover) => {
      const tbody = $('rolloverRows');
      if (!tbody) return;
      tbody.replaceChildren();
      for (const row of rollover.clauses) {
        const tr = document.createElement('tr');
        if (!row.month2CoversFloor) tr.className = 'warn-row';
        const cells = [
          row.label,
          `${row.rolledHours} h`,
          `${row.month2Hours} h`,
          money(row.month2Effective),
          row.month2CoversFloor ? 'Yes — at or above floor' : 'No — below floor',
          money(row.giftedCash),
        ];
        for (const text of cells) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      if ($('rolloverUnused')) $('rolloverUnused').textContent = `${rollover.unusedHours} hours`;
      if ($('rolloverVerdict')) $('rolloverVerdict').textContent = formatRolloverAdvice(rollover, $('currency')?.value || 'USD');
    };
    const renderCoverage = (coverage) => {
      if (!$('coverageCompare')) return;
      $('coverageCommitted').textContent = money(coverage.committedRevenue);
      $('coverageUnsold').textContent = `${coverage.unsoldHours} hours`;
      $('coverageExpected').textContent = money(coverage.expectedRevenue);
      $('coverageShortfall').textContent = coverage.coversTarget
        ? `None — ${money(coverage.surplus)} over`
        : money(coverage.shortfall);
      $('coverageShortfall').classList.toggle('needs-float', !coverage.coversTarget);
      $('coverageRequiredFill').textContent = coverage.requiredFillRate === null
        ? 'No unsold hours left'
        : `${coverage.requiredFillRate}%${coverage.reachableWithinCapacity ? '' : ' — more than you have'}`;
      $('coverageVerdict').textContent = coverage.recommendation;
    };
    const renderScenarios = (scenarios) => {
      const box = $('scenarios');
      const tbody = $('scenarioRows');
      if (!box || !tbody) return;
      tbody.replaceChildren();
      for (const row of scenarios) {
        const tr = document.createElement('tr');
        if (row.selected) tr.classList.add('selected');
        if (!row.ok) tr.classList.add('overflow');
        const cells = row.ok
          ? [
              `${row.retainerHours} hrs`,
              money(row.retainer),
              money(row.effectiveRate),
              `${row.remainingCapacity.toFixed(1)} hrs`,
              `${Math.round(row.shareOfCapacity * 100)}%`,
            ]
          : [`${row.retainerHours} hrs`, '—', '—', 'Exceeds capacity', '—'];
        for (const text of cells) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        const action = document.createElement('td');
        if (row.ok && !row.selected) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'secondary apply';
          button.textContent = 'Use this package';
          button.addEventListener('click', () => {
            $('retainerHours').value = String(row.retainerHours);
            save();
            form.requestSubmit();
            track('apply-scenario');
          });
          action.appendChild(button);
        } else {
          action.textContent = row.selected ? 'This proposal' : '';
        }
        tr.appendChild(action);
        tbody.appendChild(tr);
      }
      $('scenarioInsight').textContent = scenarioInsight(scenarios);
      box.hidden = false;
    };
    const renderOffer = (offer, currency) => {
      const box = $('offerCompare');
      if (!box) return;
      if (!offer) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      $('offerAmount').textContent = moneyText(offer.offeredPrice, currency);
      $('offerGap').textContent = `${offer.gap < 0 ? '' : '+'}${moneyText(offer.gap, currency)}`;
      $('offerGap').classList.toggle('needs-float', offer.belowFloor);
      $('offerIncluded').textContent = moneyText(offer.effectiveIncluded, currency);
      $('offerHours').textContent = `${offer.hoursAtFloor} hours`;
      $('offerVerdict').textContent = offer.belowFloor
        ? `This offer is ${moneyText(Math.abs(offer.gap), currency)} below your planning floor. Cut included hours, drop the buffer, or walk away — the arithmetic does not choose for you.`
        : `This offer is ${moneyText(offer.gap, currency)} above your planning floor. That is leftover, not a reason to raise the included hours without repricing.`;
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = read();
      const scenarios = compareRetainerScenarios(input);
      const anyOk = scenarios.some((row) => row.ok);
      try {
        const plan = calculatePlan(input);
        const comparison = compareRetainerUsage(plan);
        const rollover = compareUnusedHourRollover(plan);
        const coverage = calculateIncomeCoverage(plan, {
          otherRevenue: input.otherRevenue === '' ? 0 : Number(input.otherRevenue),
          otherHours: input.otherHours === '' ? 0 : Number(input.otherHours),
          fillRatePercent: input.fillRate === '' ? DEFAULT_FILL_RATE : Number(input.fillRate),
          currency: input.currency,
        });
        const float = calculateCashFloat(plan.target, input.paymentTerms);
        const offer = compareOffer(plan, input.offeredPrice);
        $('errors').hidden = true;
        $('results').hidden = false;
        $('rate').textContent = money(plan.rate);
        $('retainer').textContent = money(plan.retainer);
        $('capacity').textContent = `${plan.capacity.toFixed(1)} hrs`;
        $('remaining').textContent = `${plan.remainingCapacity.toFixed(1)} hrs`;
        $('target').textContent = money(plan.target);
        $('termsLabel').textContent = float.label;
        $('cashFloat').textContent = money(float.cashToFloat);
        $('cashFloat').classList.toggle('needs-float', !float.prepaid);
        $('explanation').textContent = `Your ${input.utilization}% utilization leaves ${plan.capacity.toFixed(1)} billable hours from ${input.hours} available hours. After this retainer, ${plan.remainingCapacity.toFixed(1)} hours remain for other work, admin, and recovery. The retainer includes a ${input.buffer}% buffer for scope drift; it is a planning floor, not a promise of results. ${formatCashFloatAdvice(float, input.currency)} ${formatArrearsComparison(plan.target, input.currency)}`;
        renderCoverage(coverage);
        renderOffer(offer, input.currency);
        renderUsage(comparison);
        renderRollover(rollover);
        $('summary').value = formatProposalSummary(input, plan, input.currency, comparison, rollover);
        $('copyStatus').textContent = '';
        track('calculate');
        track('retainer_usage_compared');
        track('unused_hour_rollover_compared');
        // Separable from `calculate` on purpose: the question this event exists
        // to answer is whether anyone engages with the month-level check at
        // all, or only ever prices the one client in front of them.
        if (!coverage.coversTarget) track('income_goal_short');
        if (coverage.otherRevenue > 0 || coverage.otherHours > 0 || coverage.fillRatePercent !== DEFAULT_FILL_RATE) {
          track('income_coverage_compared');
        }
        if (!float.prepaid) track('payment-terms-float');
        if (offer) track('client_offer_compared');
        if (anyOk) {
          renderScenarios(scenarios);
          track('scenario_table_viewed');
        } else if ($('scenarios')) {
          $('scenarios').hidden = true;
        }
      } catch (error) {
        $('errors').textContent = error.message;
        $('errors').hidden = false;
        $('results').hidden = true;
        if (anyOk) {
          renderScenarios(scenarios);
          track('scenario_table_viewed');
        } else if ($('scenarios')) {
          $('scenarios').hidden = true;
        }
      }
    });
    $('copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('summary').value);
        $('copyStatus').textContent = ' Copied.';
        track('copy-summary');
      } catch {
        $('copyStatus').textContent = ' Copy was blocked. Select the summary and copy it manually.';
      }
    });
    $('download').addEventListener('click', () => {
      if (!$('summary').value) return;
      const blob = new Blob([$('summary').value], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'freelance-retainer-proposal.txt';
      link.click();
      URL.revokeObjectURL(link.href);
      $('copyStatus').textContent = ' Proposal downloaded.';
      track('download-summary');
    });
    $('share')?.addEventListener('click', copyShareLink);
    $('shareResult')?.addEventListener('click', copyShareLink);
    if (openedFromLink) form.requestSubmit();
  }

  if ($('floatForm')) {
    const renderTerms = (target, currency) => {
      const tbody = $('floatRows');
      tbody.replaceChildren();
      for (const row of comparePaymentTerms(target)) {
        const tr = document.createElement('tr');
        if (!row.prepaid) tr.className = 'needs-float';
        const cells = [row.label, `${row.days} days`, moneyText(row.cashToFloat, currency)];
        for (const text of cells) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      $('floatVerdict').textContent = formatArrearsComparison(target, currency);
    };
    $('floatForm').addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const target = Number($('floatTarget').value);
        const currency = $('floatCurrency').value;
        const rows = comparePaymentTerms(target);
        $('floatErrors').hidden = true;
        $('floatResults').hidden = false;
        renderTerms(target, currency);
        track('payment_terms_compared');
        if (rows.some((row) => !row.prepaid && row.cashToFloat > 0)) track('payment-terms-float');
      } catch (error) {
        $('floatErrors').textContent = error.message;
        $('floatErrors').hidden = false;
        $('floatResults').hidden = true;
      }
    });
  }

  if ($('rolloverForm')) {
    const renderRolloverPage = (rollover, currency) => {
      const tbody = $('pageRolloverRows');
      tbody.replaceChildren();
      for (const row of rollover.clauses) {
        const tr = document.createElement('tr');
        if (!row.month2CoversFloor) tr.className = 'warn-row';
        const cells = [
          row.label,
          `${row.rolledHours} h`,
          `${row.month2Hours} h`,
          moneyText(row.month2Effective, currency),
          row.month2CoversFloor ? 'Yes — at or above floor' : 'No — below floor',
          moneyText(row.giftedCash, currency),
        ];
        for (const text of cells) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      $('pageRolloverUnused').textContent = `${rollover.unusedHours} hours`;
      $('pageRolloverMonth2').textContent = `${rollover.month2NewHours} new hours + rolled leftover`;
      $('pageRolloverVerdict').textContent = formatRolloverAdvice(rollover, currency);
    };
    $('rolloverForm').addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const retainer = Number($('rolloverPrice').value);
        const retainerHours = Number($('rolloverHours').value);
        const rate = Number($('rolloverRate').value);
        const month1Fraction = Number($('rolloverMonth1').value) / 100;
        const month2Fraction = Number($('rolloverMonth2').value) / 100;
        const currency = $('rolloverCurrency').value;
        const rollover = compareUnusedHourRollover(
          { rate, retainer, retainerHours },
          { month1Fraction, month2Fraction },
        );
        $('rolloverErrors').hidden = true;
        $('rolloverResults').hidden = false;
        renderRolloverPage(rollover, currency);
        track('unused_hour_rollover_compared');
      } catch (error) {
        $('rolloverErrors').textContent = error.message;
        $('rolloverErrors').hidden = false;
        $('rolloverResults').hidden = true;
      }
    });
  }
}

