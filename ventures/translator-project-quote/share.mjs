// The eleven quote inputs on this page are re-entered every time a
// freelancer prices a new project. Losing them on a refresh, or having no
// way to hand the exact figures to a client or colleague pricing the same
// job, is what this module fixes.
//
// The transform is pure and carries only the fields this calculator has.
// Nothing here is transmitted: the values travel in the URL fragment
// (`#...`), which a browser never sends to a server or a `Referer` header,
// so a copied link only ever goes where the sender pastes it.

export const NUMBER_FIELD_IDS = [
  'new_words',
  'fuzzy_words',
  'fuzzy_rate',
  'words_per_hour',
  'hourly_rate',
  'qa_hours',
  'dtp_cost',
  'rush_fee',
  'minimum_price',
  'target_margin',
];

export const TEXT_FIELD_IDS = ['currency'];

const TEXT_MAX = 12;

// Only a finite, non-negative number is carried -- the same contract
// `loadQuote` enforces on input, so a restored or shared value can never
// prefill a field the calculator would then reject.
function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

// Collapses control characters and repeated whitespace so a crafted or
// stale link cannot smuggle anything but a plain short label into the
// currency field.
function usableText(value) {
  if (typeof value !== 'string') return null;
  let cleaned = '';
  let lastWasSpace = false;
  for (const ch of value) {
    const code = ch.codePointAt(0);
    const normalized = code < 0x20 || code === 0x7f ? ' ' : ch;
    if (normalized === ' ') {
      if (!lastWasSpace) cleaned += ' ';
      lastWasSpace = true;
    } else {
      cleaned += normalized;
      lastWasSpace = false;
    }
  }
  cleaned = cleaned.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, TEXT_MAX);
}

// inputs object -> query string (no leading '?' or '#').
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

// query string -> inputs object. Accepts a bare string or one with a leading
// '?' or '#', so a caller can hand it `location.hash` or `location.search`
// untouched. Only the known ids survive, and only if they parse.
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
    if (!params.has(id)) continue;
    const value = usableText(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
