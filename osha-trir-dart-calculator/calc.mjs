/**
 * OSHA Total Recordable Incident Rate (TRIR) and DART rate, from a company's
 * own recordkeeping counts, plus how many more injury-free hours it takes to
 * bring the rate down to a stated target.
 *
 * TRIR and DART are the two incident rates OSHA's own recordkeeping rule
 * (29 CFR 1904) defines, and the two numbers almost every general contractor
 * prequalification form and workers' comp renewal actually asks for:
 *
 *   TRIR = (recordable cases x 200,000) / total hours worked
 *   DART = (cases with Days Away, Restricted duty, or Transfer x 200,000) / total hours worked
 *
 * 200,000 is OSHA's own base rate -- the hours 100 full-time employees work
 * in a year (40 hours x 50 weeks x 100), chosen so the rate reads as
 * "recordable cases per 100 full-time workers per year" regardless of a
 * company's actual headcount.
 *
 * This tool does not decide whether a specific injury or illness is
 * "recordable" under 29 CFR 1904.7 -- that determination is the employer's
 * own recordkeeping judgment call, made case by case against the rule's own
 * criteria, and is exactly the kind of professional determination this
 * portfolio does not make on a user's behalf. It takes the counts a company
 * has already logged on its OSHA 300 log and turns them into the two rates
 * everyone downstream actually asks for.
 */

/** Every id the form owns, in read order. */
export const ALL_INPUT_IDS = Object.freeze([
  'recordableCases',
  'dartCases',
  'totalHoursWorked',
  'targetTrir',
  'avgHoursPerMonth',
]);

/** Fields required on every calculation. */
export const REQUIRED_INPUT_IDS = Object.freeze(['recordableCases', 'dartCases', 'totalHoursWorked', 'targetTrir']);

/** OSHA's own base rate: hours 100 full-time employees work in a year. */
export const OSHA_BASE_RATE_HOURS = 200000;

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function toNumber(value) {
  if (isBlank(value)) return NaN;
  return typeof value === 'number' ? value : Number(String(value).trim());
}

function readField(errors, input, id, { min = 0, max = Infinity, integer = false, label }) {
  const value = toNumber(input[id]);
  if (!Number.isFinite(value)) {
    errors.push({ id, message: `${label} is needed.` });
    return 0;
  }
  if (integer && !Number.isInteger(value)) {
    errors.push({ id, message: `${label} has to be a whole number.` });
    return 0;
  }
  if (value < min) {
    errors.push({ id, message: `${label} cannot be below ${min}.` });
    return 0;
  }
  if (value > max) {
    errors.push({ id, message: `${label} cannot be above ${max.toLocaleString('en-US')}.` });
    return 0;
  }
  return value;
}

/**
 * TRIR, DART rate, the gap against a stated target, and — when the current
 * rate is above target — the additional injury-free hours it would take to
 * dilute the rate down to it.
 *
 * Returns `{ ok: false, errors }` when the inputs cannot produce a number.
 */
export function calculateRates(input = {}) {
  const errors = [];
  const read = (id, opts) => readField(errors, input, id, opts);

  const recordableCases = read('recordableCases', { min: 0, max: 100000, integer: true, label: 'Recordable cases' });
  const dartCases = read('dartCases', { min: 0, max: 100000, integer: true, label: 'DART cases' });
  const totalHoursWorked = read('totalHoursWorked', { min: 1, max: 1e9, label: 'Total hours worked' });
  const targetTrir = read('targetTrir', { min: 0, max: 500, label: 'Target TRIR' });

  // Cross-field check, only meaningful once both fields parsed on their own.
  if (errors.length === 0 && dartCases > recordableCases) {
    errors.push({
      id: 'dartCases',
      message: 'DART cases cannot be more than recordable cases — every DART case is also a recordable case.',
    });
  }

  const avgHoursPerMonthRaw = input.avgHoursPerMonth;
  const hasMonthlyHours = !isBlank(avgHoursPerMonthRaw);
  const avgHoursPerMonth = hasMonthlyHours
    ? read('avgHoursPerMonth', { min: 1, max: 1e7, label: 'Average hours worked per month' })
    : 0;

  if (errors.length > 0) return { ok: false, errors };

  const trir = (recordableCases * OSHA_BASE_RATE_HOURS) / totalHoursWorked;
  const dartRate = (dartCases * OSHA_BASE_RATE_HOURS) / totalHoursWorked;
  const nonDartRecordableCases = recordableCases - dartCases;

  const gapVsTarget = trir - targetTrir;
  const onTarget = trir <= targetTrir;

  // Holding the recordable count fixed, how many more injury-free hours
  // would dilute the rate down to the target: solve
  // recordableCases * 200,000 / (totalHoursWorked + extraHours) = targetTrir
  // for extraHours. Undefined when there is nothing to dilute (0 recordable
  // cases) or when the target is 0 (no finite number of hours reaches it
  // with any recordable case on the books).
  let extraHoursToTarget = null;
  let monthsToTarget = null;
  if (!onTarget && recordableCases > 0 && targetTrir > 0) {
    extraHoursToTarget = (recordableCases * OSHA_BASE_RATE_HOURS) / targetTrir - totalHoursWorked;
    if (hasMonthlyHours && avgHoursPerMonth > 0) {
      monthsToTarget = extraHoursToTarget / avgHoursPerMonth;
    }
  }

  const figures = {
    ok: true,
    errors: [],
    recordableCases,
    dartCases,
    nonDartRecordableCases,
    totalHoursWorked,
    trir,
    dartRate,
    targetTrir,
    gapVsTarget,
    onTarget,
    hasMonthlyHours,
    avgHoursPerMonth,
    extraHoursToTarget,
    monthsToTarget,
  };

  figures.notes = notes(figures);
  return figures;
}

/**
 * What the numbers say, in the safety coordinator's terms. Observations
 * about the rates entered, never a determination of recordability or a
 * claim of OSHA compliance.
 */
export function notes(result) {
  const out = [];

  if (result.recordableCases === 0) {
    out.push(
      `Zero recordable cases across ${result.totalHoursWorked.toLocaleString('en-US')} hours worked — TRIR and DART rate are both 0.0 for this period.`,
    );
  } else if (result.onTarget) {
    out.push(
      `This period's TRIR (${result.trir.toFixed(2)}) is at or below the ${result.targetTrir.toFixed(2)} target — no additional injury-free hours are needed to meet it.`,
    );
  } else if (result.extraHoursToTarget !== null) {
    const hoursText = `${Math.round(result.extraHoursToTarget).toLocaleString('en-US')} additional injury-free hours`;
    const monthsText =
      result.monthsToTarget !== null ? ` — about ${result.monthsToTarget.toFixed(1)} months at the monthly hours entered` : '';
    out.push(
      `TRIR is ${result.trir.toFixed(2)}, ${result.gapVsTarget.toFixed(2)} points above the ${result.targetTrir.toFixed(2)} target. With no new recordable cases, it would take ${hoursText}${monthsText} to dilute the rate down to that target.`,
    );
  }

  if (result.nonDartRecordableCases > 0 && result.dartCases > 0) {
    out.push(
      `${result.dartCases} of ${result.recordableCases} recordable case${result.recordableCases === 1 ? '' : 's'} involved days away, restricted duty, or a transfer (DART); the other ${result.nonDartRecordableCases} required only medical treatment beyond first aid.`,
    );
  }

  return out;
}
