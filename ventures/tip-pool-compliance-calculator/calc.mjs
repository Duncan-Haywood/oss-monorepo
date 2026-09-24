// Federal FLSA tip-pooling eligibility, and the back-wage exposure a
// non-compliant pool creates.
//
// The mistake this exists to catch: an owner assumes "mandatory tip pool" is
// a single rule they either have or don't, when federal law actually splits
// on two separate axes that most owners have never seen written down
// together:
//
//   1. Managers and supervisors can NEVER receive tip-pool money, whether or
//      not the employer takes a tip credit. This is not the traditional
//      "customarily tipped" test — it is a flat prohibition Congress added
//      to the FLSA in 2018 (Consolidated Appropriations Act, 2018, Pub. L.
//      115-141 div. S § 1201, amending 29 U.S.C. 203(m)): "An employer may
//      not keep tips received by its employees for any purposes, including
//      allowing managers or supervisors to keep any portion of employees'
//      tips, regardless of whether or not the employer takes a tip credit."
//   2. Back-of-house staff (cooks, dishwashers, prep) can be added to the
//      pool ONLY if the employer does not take a tip credit — pays the full
//      minimum wage in cash and treats the tip credit as zero. DOL's 2021
//      final rule (29 CFR 531.54) calls this a "nontraditional" tip pool.
//      An employer who DOES take a tip credit is still held to the older,
//      narrower rule: the pool may only include employees who "customarily
//      and regularly receive tips" — front-of-house.
//
// Getting either wrong while taking a tip credit does not cost a warning. DOL
// and the circuit courts that have ruled on this treat an invalid tip pool as
// forfeiting the tip credit entirely, for every front-of-house employee the
// credit was taken against, for the whole period the pool ran — see DOL Fact
// Sheet #15 ("Tipped Employees Under the FLSA") and Fact Sheet #66. That is
// the dollar figure this calculator works out: the tip credit the employer
// would owe back if the pool as described were found non-compliant.
//
// No wage table ships here, on purpose, same reasoning as this portfolio's
// occupancy-tax and IFTA calculators: the tip credit an employer is actually
// taking is a number only the employer's own pay stub can supply, and several
// states (California, Nevada, Washington, Oregon, Montana, Alaska, Minnesota,
// and others) do not allow a tip credit at all, which this tool has no way to
// know from a browser with no location data.

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Round to two decimals, half away from zero -- see str-occupancy-tax-calculator/calc.mjs for why this beats Math.round for money. */
export function round2(value) {
  const scaled = Math.abs(value) * 100;
  const rounded = Math.round(scaled + Number.EPSILON * scaled) / 100;
  return value < 0 ? -rounded : rounded;
}

/** Fixed roster rows the page renders. */
export const ROLE_COUNT = 6;

/** The per-row input/select fields, in the order they appear across a row. */
export const ROLE_FIELDS = ['name', 'category', 'inPool', 'hoursPerWeek', 'headcount'];

/** Inputs that are not part of the roster table. */
export const GLOBAL_INPUT_IDS = ['tipCreditTaken', 'tipCreditPerHour', 'weeksExposed'];

/** The three categories a role can be classified as. */
export const CATEGORIES = new Set(['front', 'back', 'manager']);

const ROW_LIMITS = {
  hoursPerWeek: { label: 'Hours/week', min: 0, max: 168 },
  headcount: { label: 'Headcount', min: 0, max: 500 },
};

const GLOBAL_LIMITS = {
  tipCreditPerHour: { label: 'Tip credit per hour', min: 0, max: 20 },
  weeksExposed: { label: 'Weeks this pool has run', min: 0, max: 260 },
};

/**
 * Whether federal law allows this role to receive tip-pool money.
 *
 * A manager or supervisor is never eligible, full stop -- that half of the
 * rule does not depend on whether a tip credit is taken. A back-of-house
 * role is eligible only when the employer takes no tip credit at all; a
 * front-of-house role -- one that customarily and regularly receives tips --
 * is eligible either way.
 */
export function isEligible(category, tipCreditTaken) {
  if (category === 'manager') return false;
  if (category === 'back') return !tipCreditTaken;
  return true;
}

function readNumber(raw, limits, key, errors, rowLabel) {
  const spec = limits[key];
  const text = typeof raw === 'string' ? raw.trim() : raw;
  if (text === '' || text === null || text === undefined) return 0;
  const value = typeof text === 'number' ? text : Number.parseFloat(text);
  const where = rowLabel ? `${rowLabel}: ` : '';
  if (!Number.isFinite(value)) {
    errors.push({ field: key, message: `${where}${spec.label} needs a number.` });
    return null;
  }
  if (value < spec.min) {
    errors.push({ field: key, message: `${where}${spec.label} cannot be below ${spec.min}.` });
    return null;
  }
  if (value > spec.max) {
    errors.push({ field: key, message: `${where}${spec.label} cannot be above ${spec.max.toLocaleString('en-US')}.` });
    return null;
  }
  return value;
}

function readBool(raw) {
  return raw === true || raw === 'true' || raw === '1' || raw === 1;
}

/**
 * Work one tip pool's compliance, role by role, against the federal FLSA
 * rule, plus the tip-credit clawback exposure a violation would create.
 *
 * @param {object} input
 * @param {boolean|string} input.tipCreditTaken
 * @param {string|number} input.tipCreditPerHour
 * @param {string|number} input.weeksExposed illustrative, not a forecast
 * @param {Array<object>} input.rows one entry per roster row on the page
 * @returns {{ok: boolean, errors?: Array, ...}}
 */
export function checkPool(input = {}) {
  const errors = [];
  const tipCreditTaken = readBool(input.tipCreditTaken);
  const tipCreditPerHour = readNumber(input.tipCreditPerHour, GLOBAL_LIMITS, 'tipCreditPerHour', errors, '');
  const weeksExposed = readNumber(input.weeksExposed, GLOBAL_LIMITS, 'weeksExposed', errors, '');

  const rows = [];
  for (const [i, raw] of (input.rows || []).entries()) {
    const name = String(raw?.name ?? '').trim();
    const label = name || `Row ${i + 1}`;
    const category = CATEGORIES.has(raw?.category) ? raw.category : 'front';
    const inPool = readBool(raw?.inPool);
    const hoursPerWeek = readNumber(raw?.hoursPerWeek, ROW_LIMITS, 'hoursPerWeek', errors, label);
    const headcount = readNumber(raw?.headcount, ROW_LIMITS, 'headcount', errors, label);
    if (hoursPerWeek === null || headcount === null) continue;
    // A row with no name and no headcount is an unused row on the form, not
    // a role -- same convention as the LAYER rows on the occupancy-tax page.
    if (name === '' && headcount === 0) continue;
    rows.push({ index: i, name, label, category, inPool, hoursPerWeek, headcount });
  }

  if (errors.length) return { ok: false, errors };
  if (rows.length === 0) {
    return { ok: false, errors: [{ field: 'rows', message: 'Add at least one role to check.' }] };
  }

  const roles = rows.map((row) => ({
    ...row,
    eligible: isEligible(row.category, tipCreditTaken),
  }));
  roles.forEach((role) => { role.violation = role.inPool && !role.eligible; });

  const violations = roles.filter((r) => r.violation);
  const managerViolations = violations.filter((r) => r.category === 'manager');
  const backOfHouseViolations = violations.filter((r) => r.category === 'back');

  const frontHoursPerWeek = round2(
    roles
      .filter((r) => r.category === 'front' && r.inPool)
      .reduce((sum, r) => sum + r.hoursPerWeek * r.headcount, 0),
  );

  const hasViolation = violations.length > 0;
  // The tip-credit clawback only applies when a credit is actually being
  // taken -- an employer paying full minimum wage in cash has no credit to
  // lose, even though a manager violation there is still a separate FLSA
  // breach (the manager unlawfully kept tips, not a wage shortfall).
  const clawbackApplies = tipCreditTaken && hasViolation;
  const weeklyExposure = clawbackApplies ? round2(frontHoursPerWeek * tipCreditPerHour) : 0;
  const totalExposure = clawbackApplies ? round2(weeklyExposure * weeksExposed) : 0;

  const warnings = [];
  if (!hasViolation) {
    warnings.push({
      code: 'compliant',
      message: tipCreditTaken
        ? 'Every role marked as in the pool is one federal law allows while you take a tip credit -- front-of-house roles only, no manager or supervisor.'
        : 'Every role marked as in the pool is one federal law allows -- no manager or supervisor is included, and back-of-house roles are permitted because no tip credit is taken.',
    });
  }
  if (managerViolations.length) {
    warnings.push({
      code: 'manager-in-pool',
      message: `${managerViolations.map((r) => r.label).join(', ')}: managers and supervisors can never receive tip-pool money under federal law, regardless of tip-credit status (29 U.S.C. 203(m), as amended 2018).`,
    });
  }
  if (backOfHouseViolations.length) {
    warnings.push({
      code: 'back-of-house-with-credit',
      message: `${backOfHouseViolations.map((r) => r.label).join(', ')}: back-of-house roles can only be pooled if no tip credit is taken. While a tip credit is taken, the pool is limited to employees who customarily and regularly receive tips.`,
    });
  }

  return {
    ok: true,
    tipCreditTaken,
    tipCreditPerHour,
    weeksExposed,
    roles,
    violations,
    managerViolations,
    backOfHouseViolations,
    frontHoursPerWeek,
    clawbackApplies,
    weeklyExposure,
    totalExposure,
    warnings,
  };
}
