/**
 * The form fields a shared link carries, in the form's own ids -- not the
 * `calculateTrueUp` parameter names, which is what `share.mjs` reads and
 * writes on the page. Single-sourced here so a field added to the form is
 * shareable the day it ships rather than silently dropped by an encoder that
 * never learned about it. Deliberately the same set `usage.mjs`'s
 * `SCENARIO_FIELDS` persists locally -- `renewalDate` and `noticeDays` are
 * session-only on this page already, so a shared link matches what "Save
 * scenario" already carries rather than promising more.
 */
export const INPUT_FIELDS = Object.freeze(['purchased', 'used', 'price', 'months', 'overageRate', 'seatMinimum']);

export function calculateTrueUp({ seatsPurchased, seatsUsed, monthlyPrice, monthsRemaining = 12, overageRatePct = 0, seatMinimum = 0 }) {
  const purchased = Number(seatsPurchased);
  const used = Number(seatsUsed);
  const price = Number(monthlyPrice);
  const months = Number(monthsRemaining);
  const overageRate = Number(overageRatePct);
  const minimum = Number(seatMinimum);
  if (![purchased, used, price, months, overageRate, minimum].every(Number.isFinite) || purchased < 0 || used < 0 || price < 0 || months < 0 || overageRate < 0 || minimum < 0) {
    throw new Error('Values must be non-negative numbers');
  }
  const unused = Math.max(0, purchased - used);
  const extra = Math.max(0, used - purchased);
  // A contracted seat minimum means unused seats below that floor cannot
  // actually be dropped at renewal -- the vendor bills for them either way.
  // droppableSeats is what a true-up can realistically remove; lockedByMinimum
  // is the unused seats the minimum still forces you to keep paying for.
  const droppableSeats = Math.max(0, purchased - Math.max(used, minimum));
  const lockedByMinimum = unused - droppableSeats;
  const monthlyAvoidable = droppableSeats * price;
  // Vendor overage is often list price plus a contracted premium. 0% keeps
  // the same-price default so existing worksheets stay comparable.
  const monthlyOverage = extra * price * (1 + overageRate / 100);
  return {
    purchased,
    used,
    unused,
    extra,
    overageRatePct: overageRate,
    seatMinimum: minimum,
    droppableSeats,
    lockedByMinimum,
    utilizationPercent: purchased === 0 ? (used === 0 ? 0 : Infinity) : (used / purchased) * 100,
    monthlyAvoidable,
    remainingAvoidable: monthlyAvoidable * months,
    annualAvoidable: monthlyAvoidable * 12,
    monthlyOverage,
    remainingOverage: monthlyOverage * months,
    annualOverage: monthlyOverage * 12,
  };
}

export function formatMoney(value, currency = '$') {
  return `${currency}${value.toFixed(2)}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateInput(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Most seat contracts do not let you reduce at will -- reductions land at
// renewal, and renewal itself is often gated behind a written-notice window
// (e.g. "must notify 60 days before the term ends or it auto-renews at the
// full count"). A true-up that only compares purchased vs. used ignores
// whether there is still time to act on that comparison. If the notice
// deadline has already passed, the "avoidable" spend calculateTrueUp reports
// is not avoidable this cycle at all -- it renews regardless of usage, and
// the number that matters is how much of that is now locked in and when the
// *next* window opens.
export function evaluateNoticeDeadline({ renewalDate, noticeDays = 0, today } = {}) {
  const renewal = parseDateInput(renewalDate);
  if (!renewal) return null;
  const days = Number(noticeDays);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error('Notice period must be a non-negative number of days');
  }
  const now = parseDateInput(today) || (today instanceof Date ? today : new Date());
  const deadline = new Date(renewal.getTime() - days * MS_PER_DAY);
  const daysUntilDeadline = Math.round((deadline.getTime() - now.getTime()) / MS_PER_DAY);
  const daysUntilRenewal = Math.round((renewal.getTime() - now.getTime()) / MS_PER_DAY);
  return {
    renewalDate: renewal,
    noticeDays: days,
    deadline,
    daysUntilDeadline,
    daysUntilRenewal,
    deadlinePassed: daysUntilDeadline < 0,
    deadlineSoon: daysUntilDeadline >= 0 && daysUntilDeadline <= 14,
  };
}

function formatDate(date) {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD, unambiguous regardless of locale
}

export function noticeMessage(result, notice) {
  if (!notice) return null;
  if (result.droppableSeats <= 0) return null; // nothing this window's deadline could have saved
  if (notice.deadlinePassed) {
    const nextDeadline = new Date(notice.deadline.getTime() + 365 * MS_PER_DAY);
    return `The notice deadline (${formatDate(notice.deadline)}) passed ${Math.abs(notice.daysUntilDeadline)} day${Math.abs(notice.daysUntilDeadline) === 1 ? '' : 's'} ago. This renewal auto-renews at the full ${result.purchased} seats regardless of usage -- the ${result.droppableSeats}-seat saving above is not avoidable this cycle. Assuming an annual term, the next window to act closes around ${formatDate(nextDeadline)}; confirm the real date on your agreement.`;
  }
  if (notice.deadlineSoon) {
    return `Notice deadline in ${notice.daysUntilDeadline} day${notice.daysUntilDeadline === 1 ? '' : 's'} (${formatDate(notice.deadline)}). Submit the ${result.droppableSeats}-seat reduction before then or this renewal auto-renews at the full count and the saving above is lost for the term.`;
  }
  return `Notice deadline: ${formatDate(notice.deadline)} (${notice.daysUntilDeadline} days away). The ${result.droppableSeats}-seat saving above is only real if the reduction is submitted by then.`;
}

export function reviewMessage(result) {
  if (result.extra > 0) {
    const premium = result.overageRatePct > 0
      ? ` at the entered ${result.overageRatePct}% overage premium`
      : '';
    return `This review is over the purchased count by ${result.extra} seat${result.extra === 1 ? '' : 's'}${premium}. That is ${formatMoney(result.annualOverage)} of extra annual spend if the overage continues, or ${formatMoney(result.remainingOverage)} through the remaining term.`;
  }
  if (result.lockedByMinimum > 0) {
    return `${result.unused} seat${result.unused === 1 ? ' is' : 's are'} unused, but the contracted ${result.seatMinimum}-seat minimum locks in ${result.lockedByMinimum} of them regardless. Only ${result.droppableSeats} seat${result.droppableSeats === 1 ? '' : 's'} can actually be dropped: ${formatMoney(result.annualAvoidable)} over a full year if those go.`;
  }
  return `A seat review could release ${formatMoney(result.annualAvoidable)} over a full year if the unused seats are not renewed.`;
}
