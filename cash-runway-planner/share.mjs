// Shareable forecast link. A business owner comparing notes with a
// bookkeeper or a partner needs the recipient to see the exact same
// forecast, including the one-off rows -- not just the four headline
// numbers. The transform is pure: no DOM, no storage, no network. A crafted
// or stale link can only set known fields, each validated the same way the
// form itself would reject a bad value.
//
// Field count mirrors app.mjs's MAX_ITEMS (currently 8), kept as a literal
// here rather than an import so this module has no dependency on app.mjs --
// share.test.mjs pins the two counts equal instead.
const ITEM_ROWS = 8;
const TEXT_MAX = 60; // matches the item-name input's maxlength in index.html

export const NUMBER_FIELD_IDS = ['cash', 'weeklyIncome', 'collectionWeeks', 'weeklyCosts', 'weeks'];
for (let index = 1; index <= ITEM_ROWS; index += 1) {
  // Repeat rides the same allowlist as Amount and Week -- a row missing here
  // is a field that silently falls off a shared link, the exact drift class
  // #2962 caused by omission from a select allowlist instead of a value check.
  NUMBER_FIELD_IDS.push(`item${index}Amount`, `item${index}Week`, `item${index}Repeat`);
}

export const TEXT_FIELD_IDS = [];
for (let index = 1; index <= ITEM_ROWS; index += 1) TEXT_FIELD_IDS.push(`item${index}Name`);

// Kind is neither a free number nor free text -- the form only ever renders
// 'in' or 'out', so a link carrying anything else has that field dropped
// rather than silently reinterpreted. This is the same drift class a select
// field missing from a share allowlist causes (paver-patio/roofing, #2962);
// here it is guarded by a value check instead of by omission, because the
// field itself is required for the round trip.
export const KIND_FIELD_IDS = [];
for (let index = 1; index <= ITEM_ROWS; index += 1) KIND_FIELD_IDS.push(`item${index}Kind`);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

// Collapses ASCII control characters (tab, newline, etc.) and runs of
// whitespace to a single space, without embedding a raw control-character
// range in this file's source. A pasted multi-line item name still fits on
// one line of the results list.
function usableText(value) {
  if (typeof value !== 'string') return null;
  let collapsed = '';
  let lastWasSpace = false;
  for (const char of value) {
    const code = char.codePointAt(0);
    const isControl = code < 32 || code === 127;
    if (isControl || char === ' ') {
      if (!lastWasSpace) collapsed += ' ';
      lastWasSpace = true;
    } else {
      collapsed += char;
      lastWasSpace = false;
    }
  }
  const cleaned = collapsed.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, TEXT_MAX);
}

function usableKind(value) {
  return value === 'in' || value === 'out' ? value : null;
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
  for (const id of KIND_FIELD_IDS) {
    const value = usableKind(inputs?.[id]);
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
  for (const id of KIND_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableKind(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
