/**
 * Prepaid session-package pricing vs. pay-per-session pricing, for an
 * independent 1:1 tutor, coach, or instructor, as deterministic functions
 * with no dependencies.
 *
 * The buyer: an independent academic tutor, test-prep coach, or similar
 * 1:1 instructor who is deciding whether to sell a discounted prepaid
 * block of sessions (e.g. "10 sessions for $450") instead of charging a
 * full price per session booked one at a time.
 *
 * The mistake this catches: a package is sold as protection against
 * no-shows -- the student has already paid, so a missed session cannot
 * cost the tutor revenue. That half is true. What is not true, and what
 * most tutors never separately check, is that a package usually also
 * comes with an implicit or explicit promise to make up a missed session
 * rather than forfeit it. Under that promise, a no-show does not free the
 * tutor's time the way it does under pay-per-session (where an empty slot
 * is simply unpaid and unworked) -- it defers the same hour of work to
 * later. So the package protects *revenue* from no-shows but does nothing
 * to protect *hours*, and the discount that made the package attractive to
 * sell is still applied to every one of those hours once they are all
 * eventually delivered. A package discounted below the no-show rate, sold
 * with a makeup guarantee, can pay a strictly worse effective hourly rate
 * than simply charging full price per session and letting a no-show empty
 * the slot -- while looking, on the revenue line alone, like the safer
 * choice.
 *
 * This is not scheduling software and does not track which student owes a
 * makeup or when. It applies the numbers entered to one representative
 * block of sessions and says which pricing structure pays better per hour
 * actually worked.
 *
 *   comparePricing(inputs)      -- both models' revenue, hours, and
 *                                  effective hourly rate, side by side.
 *   formatComparisonSummary(r)  -- the same comparison as plain text, for
 *                                  pasting into a note to yourself.
 */

export const INPUT_FIELDS = [
  'singleSessionPrice',
  'packageSessions',
  'packagePrice',
  'noShowRate',
  'makeupOwed',
  'sessionMinutes',
  'prepMinutes',
  'travelMinutes',
  'targetHourlyRate',
];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function money(n) {
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

function number(value, name, { allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * @param {{
 *   singleSessionPrice: number,
 *   packageSessions: number,
 *   packagePrice: number,
 *   noShowRate?: number,
 *   makeupOwed?: boolean,
 *   sessionMinutes?: number,
 *   prepMinutes?: number,
 *   travelMinutes?: number,
 *   targetHourlyRate?: number,
 * }} input
 */
export function comparePricing(input = {}) {
  const singleSessionPrice = number(input.singleSessionPrice, 'Single-session price', { allowZero: false });
  const packageSessions = number(input.packageSessions, 'Sessions per package', { allowZero: false });
  const packagePrice = number(input.packagePrice, 'Package price', { allowZero: false });
  const noShowRate = number(input.noShowRate ?? 10, 'No-show rate');
  if (noShowRate > 100) throw new Error('No-show rate must be 100% or less');
  const makeupOwed = Boolean(input.makeupOwed ?? true);
  const sessionMinutes = number(input.sessionMinutes ?? 60, 'Session length', { allowZero: false });
  const prepMinutes = number(input.prepMinutes ?? 0, 'Prep minutes');
  const travelMinutes = number(input.travelMinutes ?? 0, 'Travel minutes');
  const targetHourlyRate = number(input.targetHourlyRate ?? 40, 'Target hourly rate');

  const minutesPerSessionWorked = sessionMinutes + prepMinutes + travelMinutes;
  const attendanceRate = 1 - noShowRate / 100;
  const sessionsAttended = packageSessions * attendanceRate;

  // Pay-per-session: a no-show is simply an empty, unworked, unpaid slot.
  const singleRevenue = round2(sessionsAttended * singleSessionPrice);
  const singleHours = round2((sessionsAttended * minutesPerSessionWorked) / 60);
  const singleEffectiveHourly = singleHours > 0 ? round2(singleRevenue / singleHours) : 0;

  // Package: paid up front regardless of attendance. Hours worked depend on
  // whether a no-show is made up (all sessions eventually delivered) or
  // forfeited (same shape as pay-per-session).
  const packageRevenue = round2(packagePrice);
  const packageSessionsWorked = makeupOwed ? packageSessions : sessionsAttended;
  const packageHours = round2((packageSessionsWorked * minutesPerSessionWorked) / 60);
  const packageEffectiveHourly = packageHours > 0 ? round2(packageRevenue / packageHours) : 0;

  const perSessionEquivalent = round2(packagePrice / packageSessions);
  const discountPercent = singleSessionPrice > 0
    ? round2(Math.max(0, (1 - perSessionEquivalent / singleSessionPrice) * 100))
    : 0;

  const revenueDelta = round2(packageRevenue - singleRevenue);
  const hourlyDelta = round2(packageEffectiveHourly - singleEffectiveHourly);
  const minPackagePriceForTarget = round2(targetHourlyRate * packageHours);

  const findings = [];

  if (makeupOwed && discountPercent > noShowRate && noShowRate > 0) {
    findings.push({
      id: 'discount-exceeds-noshow-rate',
      severity: 'high',
      title: `The ${discountPercent}% package discount is deeper than the ${noShowRate}% no-show rate it is meant to cover`,
      detail:
        'Because a missed package session is made up rather than forfeited, every hour is eventually worked -- the discount applies to all of it, not just the sessions attended. ' +
        (hourlyDelta < 0
          ? `Effective hourly pay under the package is ${money(Math.abs(hourlyDelta))} lower than pay-per-session.`
          : 'Check whether the discount is still worth the guaranteed revenue at this gap.'),
    });
  }

  if (!makeupOwed) {
    findings.push({
      id: 'no-makeup-owed',
      severity: 'info',
      title: 'No makeup owed on a missed package session',
      detail:
        'With no makeup obligation, a package no-show frees the same hour a pay-per-session no-show would. The package still guarantees revenue up front; it carries no extra hours cost for that guarantee.',
    });
  }

  if (packageEffectiveHourly < targetHourlyRate) {
    findings.push({
      id: 'below-target-hourly',
      severity: 'medium',
      title: `Package effective pay ${money(packageEffectiveHourly)}/hr is below your ${money(targetHourlyRate)}/hr target`,
      detail: `A package priced at ${money(minPackagePriceForTarget)} for these ${packageSessions} sessions would clear the target instead.`,
    });
  }

  if (revenueDelta > 0 && hourlyDelta < 0) {
    findings.push({
      id: 'revenue-safe-hourly-worse',
      severity: 'medium',
      title: 'Package revenue is safer, but effective hourly pay is worse',
      detail:
        'Guaranteed revenue and hourly pay are two different protections. This package wins on the first and loses on the second -- both are worth knowing before you sell it.',
    });
  }

  return {
    singleSessionPrice,
    packageSessions,
    packagePrice,
    noShowRate,
    makeupOwed,
    minutesPerSessionWorked,
    perSessionEquivalent,
    discountPercent,
    single: { revenue: singleRevenue, hours: singleHours, effectiveHourly: singleEffectiveHourly },
    package: { revenue: packageRevenue, hours: packageHours, effectiveHourly: packageEffectiveHourly },
    revenueDelta,
    hourlyDelta,
    minPackagePriceForTarget,
    findings,
  };
}

/**
 * The disclaimer that travels with a copied comparison -- the same reasoning
 * `overtime-pay-calculator`'s BREAKDOWN_DISCLAIMER applies: the text leaves
 * this page and its reader may never see the footer.
 */
export const COMPARISON_DISCLAIMER =
  'Arithmetic only, applied to the one representative block of sessions you entered: not a scheduling ' +
  'record, not a prediction of any specific student’s attendance, and not tax, legal, or financial advice.';

export function formatComparisonSummary(result) {
  const {
    packageSessions = 0, noShowRate = 0, makeupOwed = true, discountPercent = 0,
    single = {}, package: pkg = {}, revenueDelta = 0, hourlyDelta = 0,
  } = result ?? {};

  const lines = ['TUTOR PACKAGE VS. PAY-PER-SESSION -- COMPARISON', ''];
  lines.push(`Block size: ${packageSessions} sessions, ${noShowRate}% no-show rate, makeup ${makeupOwed ? 'owed' : 'not owed'} on a miss`);
  lines.push(`Package discount vs. single-session price: ${discountPercent}%`);
  lines.push('');
  lines.push(`Pay-per-session: ${money(single.revenue ?? 0)} revenue / ${(single.hours ?? 0).toFixed(2)} hours = ${money(single.effectiveHourly ?? 0)}/hr`);
  lines.push(`Package:         ${money(pkg.revenue ?? 0)} revenue / ${(pkg.hours ?? 0).toFixed(2)} hours = ${money(pkg.effectiveHourly ?? 0)}/hr`);
  lines.push('');
  lines.push(`Revenue difference (package - single): ${revenueDelta >= 0 ? '+' : ''}${money(revenueDelta)}`);
  lines.push(`Effective hourly difference (package - single): ${hourlyDelta >= 0 ? '+' : ''}${money(hourlyDelta)}/hr`);
  lines.push('', '--', COMPARISON_DISCLAIMER);

  return lines.join('\n');
}
