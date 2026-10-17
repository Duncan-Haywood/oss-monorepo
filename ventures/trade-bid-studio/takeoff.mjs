// The trade takeoff: line items -> the labor hours and materials total the
// studio's bid engine prices. No network, no state, no rate tables of its own:
// the starting rates come from a preset (`presets/*.json`, each traced to one
// specialist `*-bid-calculator`) and every one of them is editable.
//
// Why a takeoff and not 119 engines
// ---------------------------------
// The specialist calculators model different work (coats and oil spots,
// restrooms and floors, squares and pitch), but each finishes the same way:
// crew hours x crew x loaded wage, plus materials and trip costs, then
// overhead and a margin on price, with a minimum on-site charge and drive time
// on top. The studio's `engine.mjs` already does that last part for any trade.
// What it lacked was the first part, the "how many hours is this job" that
// a contractor otherwise guesses. That is all this file adds.

export const TAKEOFF_DEFAULTS = Object.freeze({
  crewSize: 1,
  setupHours: 0,
  minOnSiteHours: 0,
  milesOneWay: 0,
  speedMph: 35,
});

export const MAX_LINES = 30;

function number(value, name, { min = 0 } = {}) {
  if (value === '' || value === null || value === undefined) throw new Error(`${name} is required`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  return result;
}

/**
 * Total a takeoff.
 *
 * `hoursPerUnit` is crew hours (elapsed, whole crew on site) per unit, so the
 * labor the engine is charged for is crew hours x crew size.
 *
 * @param {object} input
 * @param {Array<{label?: string, unit?: string, qty: number, hoursPerUnit: number, materialPerUnit: number}>} input.items
 * @param {number} [input.crewSize]
 * @param {number} [input.setupHours] crew hours per job
 * @param {number} [input.minOnSiteHours] smallest on-site charge, crew hours
 * @param {number} [input.milesOneWay]
 * @param {number} [input.speedMph]
 */
export function takeoffTotals(input = {}) {
  const itemsInput = Array.isArray(input.items) ? input.items : [];
  if (itemsInput.length === 0) throw new Error('Add at least one line to the takeoff');
  if (itemsInput.length > MAX_LINES) throw new Error(`Use ${MAX_LINES} lines or fewer`);
  const get = (key, name, opts) => number(input[key] ?? TAKEOFF_DEFAULTS[key], name, opts);
  const crewSize = get('crewSize', 'Crew size', { min: 1 });
  const setupHours = get('setupHours', 'Setup hours');
  const minOnSiteHours = get('minOnSiteHours', 'Minimum on-site hours');
  const milesOneWay = get('milesOneWay', 'Miles one way');
  const speedMph = get('speedMph', 'Travel speed');
  if (speedMph === 0 && milesOneWay > 0) throw new Error('Travel speed must be greater than zero');

  const lines = itemsInput.map((item, index) => {
    const label = String(item?.label ?? '').trim() || `Line ${index + 1}`;
    const qty = number(item?.qty, `${label}: quantity`);
    const hoursPerUnit = number(item?.hoursPerUnit ?? 0, `${label}: hours per unit`);
    const materialPerUnit = number(item?.materialPerUnit ?? 0, `${label}: material per unit`);
    return {
      label,
      unit: String(item?.unit ?? '').trim() || 'each',
      qty,
      hoursPerUnit,
      materialPerUnit,
      crewHours: qty * hoursPerUnit,
      materials: qty * materialPerUnit,
    };
  });

  const workHours = lines.reduce((sum, line) => sum + line.crewHours, 0);
  const materials = lines.reduce((sum, line) => sum + line.materials, 0);
  const rawOnSite = workHours + setupHours;
  const minimumApplied = rawOnSite > 0 && rawOnSite < minOnSiteHours;
  const onSiteHours = minimumApplied ? minOnSiteHours : rawOnSite;
  const travelHours = milesOneWay === 0 ? 0 : (2 * milesOneWay) / speedMph;
  const crewHours = onSiteHours + travelHours;

  return {
    lines,
    crewSize,
    workHours,
    setupHours,
    onSiteHours,
    minimumApplied,
    travelHours,
    crewHours,
    // What the studio's "Labor hours (all crew, total)" field means.
    laborHours: crewHours * crewSize,
    materials,
    lead: { label: lines[0].label, unit: lines[0].unit, qty: lines[0].qty },
  };
}

/** Field names in the studio form, keyed by the preset field that fills them. */
export const PRESET_TO_FORM = Object.freeze({
  hourlyWage: 'wage',
  burdenRate: 'burdenPct',
  overheadRate: 'overheadPct',
  targetMargin: 'marginPct',
  tripFee: 'other',
});

/**
 * Turn a preset into takeoff input plus the studio fields it sets. Items are
 * copied, so editing the form never mutates the shared catalogue.
 */
export function fromPreset(preset) {
  const takeoff = { ...TAKEOFF_DEFAULTS };
  for (const key of Object.keys(TAKEOFF_DEFAULTS)) {
    if (preset[key] !== undefined && preset[key] !== null) takeoff[key] = preset[key];
  }
  takeoff.items = (preset.items || []).map(({ label, unit, qty, hoursPerUnit, materialPerUnit }) => (
    { label, unit, qty, hoursPerUnit, materialPerUnit }
  ));
  const form = {};
  for (const [from, to] of Object.entries(PRESET_TO_FORM)) {
    if (preset[from] !== undefined && preset[from] !== null) form[to] = preset[from];
  }
  // A few specialists default the wage to 0 for an owner-operator who pays
  // themselves out of margin. In the studio that would quote labor at
  // nothing, so a zero wage keeps whatever wage the form already holds.
  if (form.wage === 0) delete form.wage;
  return { takeoff, form };
}
