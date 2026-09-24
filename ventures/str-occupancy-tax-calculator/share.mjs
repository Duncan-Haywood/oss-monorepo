// Keeps a host's stay figures on this device between visits, and in a link
// they can send to a co-host or bookkeeper, so entering four tax layers and
// a flat fee is not something a host redoes on every visit.
//
// Safety rules match the fleet's other per-venture share modules (see
// ifta-quarterly-fuel-tax-calculator/share.mjs for the fuller account):
//
//   * The stay travels in the URL fragment (after '#'), never the query
//     string, so it is never sent in a request line a server logs or a
//     Referer header a later click would carry.
//   * Every value is re-validated on the way back in, exactly as on the way
//     out. A crafted link cannot write more than LAYER_COUNT rows or a
//     number calc.mjs would itself have rejected.
//
// The field list is imported, not restated: LAYER_COUNT, LAYER_FIELDS and
// GLOBAL_INPUT_IDS are the same constants index.html's own readRows() uses,
// so a field added to the table tomorrow is carried by this module with no
// second edit here.

import { LAYER_COUNT, LAYER_FIELDS, GLOBAL_INPUT_IDS } from './calc.mjs';

const VERSION = 1;

/** localStorage key this stay is saved under on the visitor's own device. */
export const STAY_KEY = 'str-occupancy-tax-calculator-stay';

const ROW_SEPARATOR = ',';
const CELL_SEPARATOR = ':';

// Matches the layer-name input's own maxlength in index.html.
const NAME_MAX = 40;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableName(value) {
  if (typeof value !== 'string') return null;
  const printable = Array.from(value).filter((ch) => {
    const code = ch.codePointAt(0);
    return code >= 0x20 && code !== 0x7f;
  }).join('');
  const clean = printable.trim();
  if (!clean) return null;
  return clean.length > NAME_MAX ? null : clean;
}

function encodeCell(field, value) {
  if (field === 'name') {
    const text = usableName(value);
    return text === null ? '' : text;
  }
  const number = usableNumber(value);
  return number === null ? '' : String(number);
}

function decodeCell(field, raw) {
  if (field === 'name') return usableName(raw);
  const number = usableNumber(raw);
  return number === null ? null : String(number);
}

/**
 * The stay's fields into a query string (no leading '#').
 *
 * `values` is `{ nightlyRate, nights, ..., rows: [{ name, ratePercent,
 * platformCollectsPercent }, ...] }` -- the same shape readRows() plus the
 * global fields already produces. A row where every cell was rejected
 * carries nothing, dropped rather than sent as an empty entry.
 */
export function encodeBid(values) {
  const params = new URLSearchParams();
  for (const id of GLOBAL_INPUT_IDS) {
    const value = usableNumber(values?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  const rows = Array.isArray(values?.rows) ? values.rows.slice(0, LAYER_COUNT) : [];
  const encodedRows = rows
    .map((row) => LAYER_FIELDS.map((field) => encodeCell(field, row?.[field])).join(CELL_SEPARATOR))
    .filter((line) => line.replaceAll(CELL_SEPARATOR, '') !== '');
  if (encodedRows.length > 0) params.set('rows', encodedRows.join(ROW_SEPARATOR));
  return params.toString();
}

/**
 * A query string (bare, or with a leading '?' or '#') back into the stay's
 * fields. Unknown fields, over-long names and non-numeric or negative
 * figures all drop out here rather than reaching a form control.
 */
export function decodeBid(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const values = {};
  for (const id of GLOBAL_INPUT_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) values[id] = String(value);
  }
  if (params.has('rows')) {
    const decodedRows = params.get('rows')
      .split(ROW_SEPARATOR)
      .slice(0, LAYER_COUNT)
      .map((line) => {
        const cells = line.split(CELL_SEPARATOR);
        const row = {};
        LAYER_FIELDS.forEach((field, index) => {
          const value = decodeCell(field, cells[index] ?? '');
          if (value !== null) row[field] = value;
        });
        return row;
      })
      .filter((row) => Object.keys(row).length > 0);
    if (decodedRows.length > 0) values.rows = decodedRows;
  }
  return values;
}

export function saveBid(storage, values) {
  if (!storage) return false;
  try {
    storage.setItem(STAY_KEY, JSON.stringify({ v: VERSION, values: decodeBid(encodeBid(values)) }));
    return true;
  } catch {
    return false;
  }
}

export function loadBid(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STAY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || typeof parsed.values !== 'object' || parsed.values === null) return {};
    return decodeBid(encodeBid(parsed.values));
  } catch {
    return {};
  }
}

export function clearBid(storage) {
  if (!storage) return false;
  try {
    storage.removeItem(STAY_KEY);
    return true;
  } catch {
    return false;
  }
}

// A link wins over storage: a host who opens a shared link means to see that
// stay, not the one they last worked. Storage is the fallback for a plain
// visit.
export function restoreBid({ hash = '', storage = null } = {}) {
  const fromLink = decodeBid(hash);
  if (Object.keys(fromLink).length > 0) return { values: fromLink, source: 'link' };
  const stored = loadBid(storage);
  if (Object.keys(stored).length > 0) return { values: stored, source: 'storage' };
  return { values: {}, source: 'none' };
}
