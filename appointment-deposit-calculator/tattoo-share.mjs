// Shareable tattoo deposit/touch-up plan link — same in-page URL-fragment
// mechanism as `share.mjs`, with this page's own field list. Kept as a
// separate module rather than extending `share.mjs`'s field lists because
// the two pages' forms do not share field names (`pricingMode`, `touchupFlat`,
// `monthsSinceSession`, and so on exist only here), and a merged list would
// let one page's fragment silently populate fields the other page has no
// form control for.

export const NUMBER_FIELD_IDS = Object.freeze([
  'price', 'depositPercent', 'freeWindowMonths', 'monthsSinceSession',
  'touchupPercent', 'touchupFlat', 'hourlyRate', 'touchupHours',
]);

export const TEXT_FIELD_IDS = Object.freeze(['currency', 'pricingMode', 'businessName', 'artistName']);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of TEXT_FIELD_IDS) {
    const value = inputs?.[id];
    if (typeof value === 'string' && value !== '') params.set(id, value);
  }
  return params.toString();
}

export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  for (const id of TEXT_FIELD_IDS) {
    if (params.has(id)) inputs[id] = params.get(id);
  }
  return inputs;
}
