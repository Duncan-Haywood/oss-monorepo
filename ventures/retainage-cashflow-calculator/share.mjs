// Worksheet numbers and short project labels, serialized so a bookkeeper or
// office manager can reopen the same snapshot. The transform is pure: no DOM,
// no storage, no network. A crafted or stale link can only set known fields.

export const NUMBER_FIELD_IDS = [
  'contractValue',
  'retainagePct',
  'paidToDate',
  'daysOutstanding',
  'annualCarryingRatePct',
  'percentComplete',
  'reductionAtPct',
  'reducedRetainagePct',
  'typicalHoldDays',
  'partialOffer',
  'waitDays',
];

export const TEXT_FIELD_IDS = ['project', 'payer', 'invoice', 'due'];

const TEXT_MAX = 80;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableText(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, TEXT_MAX);
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of TEXT_FIELD_IDS) {
    const value = usableText(inputs?.[id]);
    if (value !== null) params.set(id, value);
  }
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
  for (const id of TEXT_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableText(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
