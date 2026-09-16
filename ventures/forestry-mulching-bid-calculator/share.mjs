// Shareable job link for the forestry mulching bid calculator.
//
// This tool is priced by one operator alone, but the job it prices rarely
// stays with one person: a partner runs the numbers on the same lot, a crew
// lead is told the machine hours and mobilization plan, or an operator wants
// a second read on their own assumptions before quoting. A downloaded
// worksheet is a dead end for that conversation -- the other side can only
// read a number somebody else produced, not change the tooth life or the
// billable hours a month and watch the price move. A link fixes that: the
// recipient lands on the same job, already filled in, editable field by
// field.
//
// The payload rides in the URL *fragment*, which browsers never send to a
// server, so the "nothing leaves your browser" promise this page already
// makes survives the feature. Anyone holding the link can read the figures,
// which is the same exposure as forwarding the downloaded worksheet.
//
// The transform is pure: no DOM, no storage, no network.

import { DENSITY_CLASSES } from './calc.mjs';

/**
 * Every numeric field the job form collects. Same ids `index.html` declares
 * on its `<input type="number">` elements and the same set its `NUMERIC`
 * array reads for validation -- if a field is added to the form and not
 * here, a share link silently drops it, and the recipient prices a
 * different job than the sender did with nothing on screen to say so.
 */
export const FIELD_IDS = Object.freeze([
  'acres', 'largestStemInches', 'terrainFactorPct', 'headWidthFt', 'headRatedStemInches',
  'advanceFtPerMin', 'passes', 'cuttingEfficiencyPct', 'workHoursPerDay',
  'operatorWagePerHour', 'fuelGallonsPerHour', 'fuelPricePerGallon', 'toothSetCost',
  'toothSetLifeHours', 'maintenancePerHour', 'machinePaymentMonthly', 'insuranceAnnual',
  'billableHoursPerMonth', 'mobilizationTrips', 'mobilizationHoursEach',
  'mobilizationMilesEach', 'truckCostPerMile', 'otherCosts', 'targetMarginPct',
  'quotedPerAcre',
]);

/**
 * The one non-numeric field: which density preset is selected. Carrying it
 * alongside the numbers it wrote (`advanceFtPerMin`, `passes`) means the
 * recipient's dropdown shows the same preset the sender picked, rather than
 * silently reverting to "My own numbers..." with the right figures but the
 * wrong label -- which matters because choosing a different preset on the
 * recipient's page overwrites those two fields.
 */
export const DENSITY_FIELD_ID = 'density';

/**
 * The proposal panel's own terms (`platform/proposal/adopt.mjs`): the
 * deposit, how long the price is held, and the three blocks of prose a
 * contractor writes once and reuses. A shared job link that carries the
 * price but not these opens the recipient on this venture's own defaults
 * (30% / 30 days) under a headline figure that matches the sender's to the
 * cent -- two people reading one price and different money on acceptance,
 * with nothing on screen to say so. See `platform/proposal/term-ids.test.mjs`
 * for the incident this list exists to prevent.
 */
export const PROPOSAL_TERM_NUMBERS = Object.freeze(['depositPercent', 'validDays']);
export const PROPOSAL_TERM_TEXT = Object.freeze(['paymentTerms', 'proposalNotes', 'proposalExclusions']);

/** A job figure: finite. Blank, missing or unparsable means "not entered". */
function jobNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

/** A proposal-term number, bounded exactly as its own `<input>` is. */
function termNumber(value, { min, max }) {
  const result = jobNumber(value);
  if (result === null || result < min || result > max) return null;
  return result;
}

/** Free text the contractor typed. Empty means "left blank", not "unset". */
function termText(value) {
  return typeof value === 'string' ? value : null;
}

/** A density value the page's own `<select>` actually offers. */
function validDensity(value) {
  if (value === 'custom' || Object.hasOwn(DENSITY_CLASSES, value)) return value;
  return null;
}

/**
 * Encode the page's current inputs as a URL fragment payload.
 *
 * Blank or unusable figures are omitted rather than sent as empty strings,
 * so the recipient keeps their own default for anything the sender never
 * filled in -- each field here is independently visible on the page, unlike
 * a grouped clause, so there is nothing to bias by dropping one on its own.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const value = jobNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  const density = validDensity(inputs?.[DENSITY_FIELD_ID]);
  if (density !== null) params.set(DENSITY_FIELD_ID, density);

  const deposit = termNumber(inputs?.depositPercent, { min: 0, max: 100 });
  if (deposit !== null) params.set('depositPercent', String(deposit));
  const validDays = termNumber(inputs?.validDays, { min: 0, max: 365 });
  if (validDays !== null) params.set('validDays', String(validDays));
  for (const id of PROPOSAL_TERM_TEXT) {
    const text = termText(inputs?.[id]);
    if (text) params.set(id, text);
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Nothing here throws. A link truncated by a messaging app, hand-edited, or
 * carrying a key this page does not know should open the calculator on
 * whatever survived, not on an error page -- the recipient can always
 * retype the one field that did not make it, and cannot recover from a
 * blank screen. A figure that fails to parse is dropped on its own; it does
 * not take any other field down with it.
 */
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = jobNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  if (params.has(DENSITY_FIELD_ID)) {
    const density = validDensity(params.get(DENSITY_FIELD_ID));
    if (density !== null) inputs[DENSITY_FIELD_ID] = density;
  }

  if (params.has('depositPercent')) {
    const deposit = termNumber(params.get('depositPercent'), { min: 0, max: 100 });
    if (deposit !== null) inputs.depositPercent = deposit;
  }
  if (params.has('validDays')) {
    const validDays = termNumber(params.get('validDays'), { min: 0, max: 365 });
    if (validDays !== null) inputs.validDays = validDays;
  }
  for (const id of PROPOSAL_TERM_TEXT) {
    if (params.has(id)) inputs[id] = params.get(id);
  }
  return inputs;
}

/**
 * Build the shareable URL for a page location and an input set.
 *
 * Any existing query string is preserved and the fragment replaced, so a
 * link copied from a page that was itself opened from a link does not
 * accumulate payloads.
 */
export function shareUrl(location, inputs) {
  const origin = location?.origin ?? '';
  const pathname = location?.pathname ?? '';
  const search = location?.search ?? '';
  return `${origin}${pathname}${search}#${encodeInputs(inputs)}`;
}
