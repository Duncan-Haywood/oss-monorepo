import { COST_IDS, UNIT_FIELDS, UNIT_PRESETS } from './calc.mjs';

/**
 * A rental quote carries two kinds of state, and both have to travel or the
 * recipient prices a different booking:
 *
 *   - the eighteen scalars in `COST_IDS` (days, crew, haul, insurance, margin);
 *   - the fleet table — quantity, daily rate and replacement value for each of
 *     the five presets.
 *
 * Both lists are imported from `calc.mjs`, never restated. The fleet fields are
 * flattened as `<presetId>.<field>` so the query string stays a flat
 * `URLSearchParams` — no JSON blob in a URL, and an unknown preset id in a
 * crafted link simply finds no home rather than inventing a row.
 */
export const UNIT_PARAM_IDS = Object.freeze(
  UNIT_PRESETS.flatMap(preset => UNIT_FIELDS.map(field => `${preset.id}.${field}`)),
);

/** Every parameter a link may carry, scalars first. */
export const SHARE_PARAMS = Object.freeze([...COST_IDS, 'generatorNeeded', ...UNIT_PARAM_IDS]);

function encodeNumber(params, key, value) {
  // Blank is a real state and is not an absent key: a cost field the sender
  // cleared should arrive cleared, so the recipient sees the same error the
  // sender saw rather than this page's shipped example figure.
  if (value === '') {
    params.set(key, '');
    return;
  }
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) params.set(key, String(number));
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of COST_IDS) encodeNumber(params, id, input?.[id]);
  params.set('generatorNeeded', input?.generatorNeeded ? '1' : '0');
  for (const preset of UNIT_PRESETS) {
    for (const field of UNIT_FIELDS) {
      encodeNumber(params, `${preset.id}.${field}`, input?.units?.[preset.id]?.[field]);
    }
  }
  return params.toString();
}

function decodeNumber(params, key) {
  if (!params.has(key)) return undefined;
  if (params.get(key) === '') return '';
  const number = Number(params.get(key));
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
  const result = { units: {} };
  for (const id of COST_IDS) {
    const decoded = decodeNumber(params, id);
    if (decoded !== undefined) result[id] = decoded;
  }
  if (params.has('generatorNeeded')) result.generatorNeeded = params.get('generatorNeeded') === '1';
  for (const preset of UNIT_PRESETS) {
    for (const field of UNIT_FIELDS) {
      const decoded = decodeNumber(params, `${preset.id}.${field}`);
      if (decoded === undefined) continue;
      result.units[preset.id] ??= {};
      result.units[preset.id][field] = decoded;
    }
  }
  return result;
}

/** True when a decoded link carried anything at all worth applying. */
export function carriesAnything(decoded) {
  if (!decoded) return false;
  if (COST_IDS.some(id => decoded[id] !== undefined)) return true;
  if (decoded.generatorNeeded !== undefined) return true;
  return Object.keys(decoded.units || {}).length > 0;
}

/**
 * Every field the form owns, written whether or not the link carried it — so a
 * box the sender cleared, or a preset they zeroed out of the fleet, arrives
 * that way instead of keeping whatever the recipient's page was showing.
 *
 * Returned as flat element-id → string pairs, which is what the page writes.
 * See `platform/ci/check_shared_link_clears.py`.
 */
export function formValues(decoded) {
  const values = {};
  for (const id of COST_IDS) {
    values[id] = decoded?.[id] !== undefined ? String(decoded[id]) : '';
  }
  for (const preset of UNIT_PRESETS) {
    const unit = decoded?.units?.[preset.id];
    // A preset absent from the link is absent from the fleet, which is a
    // quantity of zero rather than a blank box: the quantity input has
    // min="0" and drives whether the row is priced at all, so blanking it
    // would read as an invalid form instead of "this unit is not going out".
    values[`qty-${preset.id}`] = unit?.quantity !== undefined ? String(unit.quantity) : '0';
    values[`rate-${preset.id}`] = unit?.dailyRate !== undefined ? String(unit.dailyRate) : String(preset.dailyRate);
    values[`val-${preset.id}`] = unit?.replacementValue !== undefined
      ? String(unit.replacementValue)
      : String(preset.replacementValue);
  }
  values.generatorNeeded = Boolean(decoded?.generatorNeeded);
  return values;
}
