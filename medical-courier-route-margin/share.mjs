// Shareable route link. A courier comparing an offer with a dispatcher, an
// accountant, or another courier needs the recipient to see the exact same
// route inputs, not just the headline margin -- and the offer often arrives
// by text or email, where retyping thirteen numbers is how a comparison
// never happens. The transform is pure: no DOM, no storage, no network.
//
// Each field is validated the same way the form itself would reject a bad
// value, so a crafted or stale link can only set known fields to values the
// form could have produced. Route type is a fixed-option field, not a free
// number or free text -- checked against the page's own <select> options
// rather than allowed through and silently misread, which is the same
// drift class a select field left out of a share allowlist caused on the
// paver-patio and roofing calculators (#2962).

export const NUMBER_FIELD_IDS = [
  'revenue', 'stops', 'miles', 'routeHours', 'waitMinutes', 'graceMinutes',
  'deadheadMiles', 'deadheadMinutes', 'loadedLaborRate', 'vehicleCostPerMile',
  'consumablePerStop', 'overheadRate', 'targetMarginRate',
];

// Mirrors the <select id="mode"> options in index.html.
export const MODE_VALUES = ['Scheduled', 'STAT', 'Dedicated'];

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableMode(value) {
  return MODE_VALUES.includes(value) ? value : null;
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  const mode = usableMode(inputs?.mode);
  if (mode !== null) params.set('mode', mode);
  return params.toString();
}

export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const trimmed = source.replace(/^[?#]/, '');
  const params = new URLSearchParams(trimmed);
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  if (params.has('mode')) {
    const mode = usableMode(params.get('mode'));
    if (mode !== null) inputs.mode = mode;
  }
  return inputs;
}
