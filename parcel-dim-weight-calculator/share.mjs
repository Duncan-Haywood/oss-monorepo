// A seller pricing a new SKU tries the same carton against two or three
// divisors, then wants to hand the result to a co-packer or a 3PL rep. Losing
// it on a refresh, or having to read six numbers down a phone, is what this
// module fixes.
//
// Nothing here is transmitted. The values travel in the URL fragment (`#...`),
// which a browser never sends to a server or puts in a `Referer` header, so a
// copied link only ever goes where the sender pastes it.

export const NUMBER_FIELD_IDS = ['length', 'width', 'height', 'weight', 'divisor', 'packages'];

// Carried separately because it is a checkbox, not a number: a URL says `1` or
// `0` and an absent key means "leave the page default alone" rather than "off".
export const BOOLEAN_FIELD_IDS = ['roundDimensions'];

// Only a finite, non-negative number survives -- the same contract
// `calculateBillableWeight` enforces, so a restored or shared value can never
// prefill a field the calculator would then throw on.
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
  for (const id of BOOLEAN_FIELD_IDS) {
    const value = inputs?.[id];
    if (value === true || value === false) params.set(id, value ? '1' : '0');
  }
  return params.toString();
}

// query string -> inputs object. Accepts a bare string or one with a leading
// '?' or '#', so a caller can hand it `location.hash` untouched. Only the known
// ids survive, and only if they parse.
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  for (const id of BOOLEAN_FIELD_IDS) {
    if (!params.has(id)) continue;
    const raw = params.get(id);
    // Anything that is not an explicit 0/1 is discarded rather than coerced:
    // a truthy-string rule would turn `?roundDimensions=false` into `true`.
    if (raw === '1') inputs[id] = true;
    else if (raw === '0') inputs[id] = false;
  }
  return inputs;
}
