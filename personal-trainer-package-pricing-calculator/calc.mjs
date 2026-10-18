/**
 * Prepaid session-package pricing vs. pay-per-session pricing, net of a
 * gym or studio's cut, for an independent personal trainer -- as
 * deterministic functions with no dependencies.
 *
 * The buyer: an independent personal trainer who pays a commercial gym or
 * boutique studio for the right to train their own clients there, either as
 * a percentage of every session (a "revenue share") or a flat per-session
 * facility/room-rental fee -- both common in the industry -- and is deciding
 * whether to sell a discounted prepaid block of sessions (e.g. "10 sessions
 * for $650") instead of charging full price one session at a time.
 *
 * Two separate mistakes this catches, and a trainer can be hit by either or
 * both at once:
 *
 * 1. **The same dilution `tutor-package-pricing-calculator` catches.** A
 *    package is sold, and bought, as protection against no-shows: the client
 *    has already paid. What usually goes unchecked is that a package sold
 *    with a makeup guarantee still owes every session eventually -- so a
 *    discount deeper than the real no-show rate can pay a worse effective
 *    hourly rate than plain pay-per-session, even though its revenue looks
 *    safer. Same arithmetic, same finding, reused because the underlying
 *    economics do not depend on what is being taught.
 *
 * 2. **A flat venue fee erodes a discounted package harder than it erodes
 *    full price -- a mechanic tutoring has no equivalent of.** A gym that
 *    charges $12 a session regardless of what the trainer billed the client
 *    takes a bigger *percentage* bite out of a $58 package-equivalent
 *    session than out of a $75 full-price session. The trainer's own percent
 *    discount and the gym's flat fee compound against the same session,
 *    and the sticker discount alone does not show it. (A *percentage*
 *    revenue-share cut, by contrast, takes the same percentage of both --
 *    it scales the comparison down without changing which side wins, which
 *    is exactly why this file tells the two venue models apart rather than
 *    treating "the gym takes a cut" as one case.)
 *
 * This is not scheduling software and does not track which client owes a
 * makeup or when. It applies the numbers entered to one representative
 * block of sessions and reports net take-home pay, not gross billings.
 *
 *   comparePricing(inputs)      -- both models' gross revenue, venue cost,
 *                                  net take-home, hours, and effective net
 *                                  hourly pay, side by side.
 *   formatComparisonSummary(r)  -- the same comparison as plain text, for
 *                                  pasting into a note to yourself.
 */

export const INPUT_FIELDS = [
  'ratePerSession',
  'packageSessions',
  'packagePrice',
  'noShowRate',
  'makeupOwed',
  'sessionMinutes',
  'venueModel',
  'venuePercent',
  'venueFlatFee',
  'targetTakeHomeHourly',
];

export const VENUE_MODELS = ['none', 'percent', 'flat'];

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
 * Net take-home from a block of sessions under one venue-cost model.
 *
 * `sessionsWorked` (not sessions attended) is what the venue charges
 * against under a flat fee -- a facility fee is owed for a session that is
 * delivered, attended or as a makeup, not for one that never happened.
 */
function netRevenue(grossRevenue, sessionsWorked, venueModel, venuePercent, venueFlatFee) {
  if (venueModel === 'percent') return round2(grossRevenue * (1 - venuePercent / 100));
  if (venueModel === 'flat') return round2(Math.max(0, grossRevenue - venueFlatFee * sessionsWorked));
  return round2(grossRevenue);
}

/**
 * The package price whose net take-home clears `targetHourly` over `hours`,
 * under the same venue-cost model -- solved algebraically per model rather
 * than by search, since each model is linear in gross revenue.
 */
function minPackagePriceForTarget(targetHourly, hours, sessionsWorked, venueModel, venuePercent, venueFlatFee) {
  const targetNet = targetHourly * hours;
  if (venueModel === 'percent') {
    const keep = 1 - venuePercent / 100;
    return keep > 0 ? round2(targetNet / keep) : Infinity;
  }
  if (venueModel === 'flat') return round2(targetNet + venueFlatFee * sessionsWorked);
  return round2(targetNet);
}

/**
 * @param {{
 *   ratePerSession: number,
 *   packageSessions: number,
 *   packagePrice: number,
 *   noShowRate?: number,
 *   makeupOwed?: boolean,
 *   sessionMinutes?: number,
 *   venueModel?: 'none'|'percent'|'flat',
 *   venuePercent?: number,
 *   venueFlatFee?: number,
 *   targetTakeHomeHourly?: number,
 * }} input
 */
export function comparePricing(input = {}) {
  const ratePerSession = number(input.ratePerSession, 'Single-session rate', { allowZero: false });
  const packageSessions = number(input.packageSessions, 'Sessions per package', { allowZero: false });
  const packagePrice = number(input.packagePrice, 'Package price', { allowZero: false });
  const noShowRate = number(input.noShowRate ?? 10, 'No-show rate');
  if (noShowRate > 100) throw new Error('No-show rate must be 100% or less');
  const makeupOwed = Boolean(input.makeupOwed ?? true);
  const sessionMinutes = number(input.sessionMinutes ?? 60, 'Session length', { allowZero: false });
  const venueModel = VENUE_MODELS.includes(input.venueModel) ? input.venueModel : 'none';
  const venuePercent = number(input.venuePercent ?? 0, 'Venue percentage');
  if (venueModel === 'percent' && venuePercent >= 100) throw new Error('Venue percentage must be less than 100%');
  const venueFlatFee = number(input.venueFlatFee ?? 0, 'Venue flat fee');
  const targetTakeHomeHourly = number(input.targetTakeHomeHourly ?? 40, 'Target take-home hourly rate');

  const attendanceRate = 1 - noShowRate / 100;
  const sessionsAttended = packageSessions * attendanceRate;

  // Pay-per-session: a no-show is simply an empty, unworked, unpaid slot.
  const singleGross = round2(sessionsAttended * ratePerSession);
  const singleNet = netRevenue(singleGross, sessionsAttended, venueModel, venuePercent, venueFlatFee);
  const singleHours = round2((sessionsAttended * sessionMinutes) / 60);
  const singleEffectiveHourly = singleHours > 0 ? round2(singleNet / singleHours) : 0;

  // Package: billed up front regardless of attendance. Sessions worked (and
  // so, under a flat venue fee, sessions the venue charges for) depend on
  // whether a no-show earns a makeup or is forfeited.
  const packageGross = round2(packagePrice);
  const packageSessionsWorked = makeupOwed ? packageSessions : sessionsAttended;
  const packageNet = netRevenue(packageGross, packageSessionsWorked, venueModel, venuePercent, venueFlatFee);
  const packageHours = round2((packageSessionsWorked * sessionMinutes) / 60);
  const packageEffectiveHourly = packageHours > 0 ? round2(packageNet / packageHours) : 0;

  const perSessionEquivalent = round2(packagePrice / packageSessions);
  const discountPercent = ratePerSession > 0
    ? round2(Math.max(0, (1 - perSessionEquivalent / ratePerSession) * 100))
    : 0;

  const revenueDelta = round2(packageNet - singleNet);
  const hourlyDelta = round2(packageEffectiveHourly - singleEffectiveHourly);
  const minPriceForTarget = minPackagePriceForTarget(
    targetTakeHomeHourly, packageHours, packageSessionsWorked, venueModel, venuePercent, venueFlatFee,
  );

  const findings = [];

  if (makeupOwed && discountPercent > noShowRate && noShowRate > 0) {
    findings.push({
      id: 'discount-exceeds-noshow-rate',
      severity: 'high',
      title: `The ${discountPercent}% package discount is deeper than the ${noShowRate}% no-show rate it is meant to cover`,
      detail:
        'Because a missed package session is made up rather than forfeited, every hour is eventually worked -- the discount applies to all of it, not just the sessions attended. ' +
        (hourlyDelta < 0
          ? `Net take-home under the package is ${money(Math.abs(hourlyDelta))}/hr lower than pay-per-session.`
          : 'Check whether the discount is still worth the guaranteed revenue at this gap.'),
    });
  }

  if (!makeupOwed) {
    findings.push({
      id: 'no-makeup-owed',
      severity: 'info',
      title: 'No makeup owed on a missed package session',
      detail:
        'With no makeup obligation, a package no-show frees the same hour a pay-per-session no-show would, and the venue is not charging you a facility fee for it either. The package still guarantees revenue up front; it carries no extra hours cost for that guarantee.',
    });
  }

  if (venueModel === 'flat' && venueFlatFee > 0 && perSessionEquivalent > 0 && perSessionEquivalent < ratePerSession) {
    const feePercentOfSingle = round2((venueFlatFee / ratePerSession) * 100);
    const feePercentOfPackage = round2((venueFlatFee / perSessionEquivalent) * 100);
    if (feePercentOfPackage > feePercentOfSingle) {
      findings.push({
        id: 'flat-fee-erodes-package-more',
        severity: 'high',
        title: `The ${money(venueFlatFee)} facility fee eats ${feePercentOfPackage}% of your package's per-session rate, vs. ${feePercentOfSingle}% of your full rate`,
        detail:
          `A flat per-session fee does not scale down with your discount -- it takes the same ${money(venueFlatFee)} whether you billed ${money(ratePerSession)} or the ${money(perSessionEquivalent)} package-equivalent rate, so it costs a proportionally bigger bite out of the discounted sessions. A percentage revenue-share cut would not do this: it takes the same share of both.`,
      });
    }
  }

  if (packageEffectiveHourly < targetTakeHomeHourly) {
    findings.push({
      id: 'below-target-hourly',
      severity: 'medium',
      title: `Package net pay ${money(packageEffectiveHourly)}/hr is below your ${money(targetTakeHomeHourly)}/hr take-home target`,
      detail: Number.isFinite(minPriceForTarget)
        ? `A package priced at ${money(minPriceForTarget)} for these ${packageSessions} sessions would clear the target instead, after the venue's cut.`
        : 'At a 100%-or-more venue percentage, no package price can clear a positive take-home target.',
    });
  }

  if (revenueDelta > 0 && hourlyDelta < 0) {
    findings.push({
      id: 'revenue-safe-hourly-worse',
      severity: 'medium',
      title: 'Package net revenue is safer, but net effective hourly pay is worse',
      detail:
        'Guaranteed revenue and hourly take-home are two different protections. This package wins on the first and loses on the second -- both are worth knowing before you sell it.',
    });
  }

  return {
    ratePerSession,
    packageSessions,
    packagePrice,
    noShowRate,
    makeupOwed,
    sessionMinutes,
    venueModel,
    venuePercent,
    venueFlatFee,
    perSessionEquivalent,
    discountPercent,
    single: { gross: singleGross, net: singleNet, hours: singleHours, effectiveHourly: singleEffectiveHourly },
    package: { gross: packageGross, net: packageNet, hours: packageHours, effectiveHourly: packageEffectiveHourly },
    revenueDelta,
    hourlyDelta,
    minPackagePriceForTarget: minPriceForTarget,
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
  'record, not a prediction of any specific client’s attendance, and not tax, legal, or financial advice.';

export function formatComparisonSummary(result) {
  const {
    packageSessions = 0, noShowRate = 0, makeupOwed = true, discountPercent = 0,
    venueModel = 'none', venuePercent = 0, venueFlatFee = 0,
    single = {}, package: pkg = {}, revenueDelta = 0, hourlyDelta = 0,
  } = result ?? {};

  const venueLine = venueModel === 'percent'
    ? `Venue cut: ${venuePercent}% of every session's revenue`
    : venueModel === 'flat'
      ? `Venue cut: ${money(venueFlatFee)} flat facility fee per session worked`
      : 'Venue cut: none entered';

  const lines = ['PERSONAL TRAINER PACKAGE VS. PAY-PER-SESSION -- COMPARISON', ''];
  lines.push(`Block size: ${packageSessions} sessions, ${noShowRate}% no-show rate, makeup ${makeupOwed ? 'owed' : 'not owed'} on a miss`);
  lines.push(venueLine);
  lines.push(`Package discount vs. single-session rate: ${discountPercent}%`);
  lines.push('');
  lines.push(`Pay-per-session: ${money(single.net ?? 0)} net / ${(single.hours ?? 0).toFixed(2)} hours = ${money(single.effectiveHourly ?? 0)}/hr take-home`);
  lines.push(`Package:         ${money(pkg.net ?? 0)} net / ${(pkg.hours ?? 0).toFixed(2)} hours = ${money(pkg.effectiveHourly ?? 0)}/hr take-home`);
  lines.push('');
  lines.push(`Net revenue difference (package - single): ${revenueDelta >= 0 ? '+' : ''}${money(revenueDelta)}`);
  lines.push(`Net effective hourly difference (package - single): ${hourlyDelta >= 0 ? '+' : ''}${money(hourlyDelta)}/hr`);
  lines.push('', '--', COMPARISON_DISCLAIMER);

  return lines.join('\n');
}
