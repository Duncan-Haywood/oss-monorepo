// A freelancer's income, capacity, and buffer assumptions are what they
// re-enter for every proposal. Sharing serializes that same field set as a
// query string so a partner, bookkeeper, or future-self can open the exact
// plan. The transform is pure: no DOM, no storage, no network. Unknown keys
// never survive encode or decode, so a crafted link can only set known fields.

export const NUMBER_FIELD_IDS = [
  'income',
  'costs',
  'hours',
  'utilization',
  'retainerHours',
  'buffer',
  'otherRevenue',
  'otherHours',
  'fillRate',
  'offeredPrice',
];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

export const PAYMENT_TERMS = ['prepaid', 'net15', 'net30', 'arrears15', 'arrears30'];

export const FIELD_IDS = [...NUMBER_FIELD_IDS, 'currency', 'paymentTerms'];

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableCurrency(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CURRENCIES.includes(code) ? code : null;
}

function usablePaymentTerms(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return PAYMENT_TERMS.includes(key) ? key : null;
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  const currency = usableCurrency(inputs?.currency);
  if (currency) params.set('currency', currency);
  const paymentTerms = usablePaymentTerms(inputs?.paymentTerms);
  if (paymentTerms) params.set('paymentTerms', paymentTerms);
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
  if (params.has('currency')) {
    const currency = usableCurrency(params.get('currency'));
    if (currency) inputs.currency = currency;
  }
  if (params.has('paymentTerms')) {
    const paymentTerms = usablePaymentTerms(params.get('paymentTerms'));
    if (paymentTerms) inputs.paymentTerms = paymentTerms;
  }
  return inputs;
}

// Drop query/hash from the current page URL, then attach the encoded plan.
// The hash never leaves the recipient's browser; there is no server hop.
export function buildShareUrl(baseUrl, inputs) {
  const query = encodeInputs(inputs);
  const base = String(baseUrl || '').split('#')[0].split('?')[0];
  return query ? `${base}#${query}` : base;
}
