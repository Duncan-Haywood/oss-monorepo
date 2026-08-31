// The dilution ratio, container price, batch size, and labor rate on this
// page are all a setter re-enters every time a supplier changes or a job
// changes size. Losing them on a refresh, or having no way to hand the exact
// numbers to a coworker pricing the same job, is what this module fixes.
//
// The transform is pure and carries only the free numeric fields this
// calculator has -- no choices, no text, no rows, unlike the richer bid
// calculators that need them. Nothing here is transmitted: the values travel
// in the URL fragment (`#...`), which a browser never sends to a server or a
// `Referer` header, so a copied link only ever goes where the sender pastes it.

export const NUMBER_FIELD_IDS = [
  'concentrateOz',
  'waterGallons',
  'containerCost',
  'containerOz',
  'batchGallons',
  'wasteRate',
  'laborMinutes',
  'laborRate',
];

// Only a finite, non-negative number is carried -- the same contract
// `calculateDilution` enforces on input, so a restored or shared value can
// never prefill a field the calculator would then reject.
function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

// inputs object -> query string (no leading '?' or '#').
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

// query string -> inputs object. Accepts a bare string or one with a leading
// '?' or '#', so a caller can hand it `location.hash` or `location.search`
// untouched. Only the known numeric ids survive, and only if they parse.
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
