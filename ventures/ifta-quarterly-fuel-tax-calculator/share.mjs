// A carrier working a return here has typed a full quarter's mileage, fuel
// and rate figures across up to twelve jurisdictions by the time a number
// shows up. Losing all of that on tab close, or retyping it to hand the
// return to a bookkeeper or co-owner for a second look, is the annoyance
// this module removes: it keeps the whole quarter, on this device between
// visits, and in a link the carrier can send.
//
// The safety rules match the fleet's other per-venture share modules (see
// wildlife-exclusion-bid-calculator/share.mjs for the fuller account):
//
//   * The quarter travels in the URL fragment (after '#'), never the query
//     string, so it is never sent in a request line a server logs or a
//     Referer header a later click would carry.
//   * Every value is re-validated on the way back in, exactly as on the way
//     out. A crafted link cannot write more than ROW_COUNT rows, a
//     jurisdiction code longer than the form's own maxlength, or a number
//     calc.mjs would itself have rejected.
//
// The field list is imported, not restated: ROW_COUNT, ROW_FIELDS and
// GLOBAL_INPUT_IDS are the same constants index.html's own readRows() uses.
// That is deliberate, and copied from the fleet's worst-known instance of the
// alternative -- platform/pages/link.mjs's header records that the very
// first per-venture share.mjs kept its own field list, a calculator grew a
// field, the list did not, and a shared link silently dropped it. A column
// added to this table tomorrow is carried by this module with no second
// edit here.

import { ROW_COUNT, ROW_FIELDS, GLOBAL_INPUT_IDS } from './calc.mjs';

const VERSION = 1;

/** localStorage key this quarter is saved under on the visitor's own device. */
export const QUARTER_KEY = 'ifta-quarterly-fuel-tax-calculator-quarter';

const ROW_SEPARATOR = ',';
const CELL_SEPARATOR = ':';

// Matches the jurisdiction input's own maxlength in index.html. A code
// longer than this is not a real IFTA jurisdiction, so it is dropped as
// unusable rather than carried on to a form field that would reject it too.
const JURISDICTION_MAX = 24;

// Only a finite, non-negative number is carried -- the same contract
// calc.mjs's readNumber enforces on input (blank means zero; negative
// mileage or a negative rate is never valid), so a restored or shared value
// can never prefill a field the calculator would then reject.
function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

// Strips control characters without leaning on a regex escape (easy to get
// wrong character-by-character and hard to eyeball once wrong), then trims
// surrounding whitespace and drops anything past the input's own maxlength.
function usableJurisdiction(value) {
  if (typeof value !== 'string') return null;
  const printable = Array.from(value).filter((ch) => {
    const code = ch.codePointAt(0);
    return code >= 0x20 && code !== 0x7f;
  }).join('');
  const clean = printable.trim();
  if (!clean) return null;
  return clean.length > JURISDICTION_MAX ? null : clean;
}

function encodeCell(field, value) {
  if (field === 'jurisdiction') {
    const text = usableJurisdiction(value);
    return text === null ? '' : text;
  }
  const number = usableNumber(value);
  return number === null ? '' : String(number);
}

function decodeCell(field, raw) {
  if (field === 'jurisdiction') return usableJurisdiction(raw);
  const number = usableNumber(raw);
  return number === null ? null : String(number);
}

/**
 * The quarter's fields into a query string (no leading '#').
 *
 * `values` is `{ interestAnnualPercent, monthsLate, rows: [{ jurisdiction,
 * totalMiles, ... }, ...] }` -- the same shape `readRows()` plus the two
 * global fields already produces. A row where every cell was rejected
 * carries nothing: emitting it would give the recipient a blank space in the
 * middle of the table to puzzle over, so it is dropped rather than sent as
 * an empty entry. Row *position* among the rows that do carry something is
 * preserved; a gap left by a blank row in between is not, which changes
 * nothing about the arithmetic -- every jurisdiction's total is independent
 * of which row number it sits on.
 */
export function encodeBid(values) {
  const params = new URLSearchParams();
  for (const id of GLOBAL_INPUT_IDS) {
    const value = usableNumber(values?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  const rows = Array.isArray(values?.rows) ? values.rows.slice(0, ROW_COUNT) : [];
  const encodedRows = rows
    .map((row) => ROW_FIELDS.map((field) => encodeCell(field, row?.[field])).join(CELL_SEPARATOR))
    .filter((line) => line.replaceAll(CELL_SEPARATOR, '') !== '');
  if (encodedRows.length > 0) params.set('rows', encodedRows.join(ROW_SEPARATOR));
  return params.toString();
}

/**
 * A query string (bare, or with a leading '?' or '#') back into the
 * quarter's fields. Unknown fields, over-long jurisdiction codes and
 * non-numeric or negative figures all drop out here rather than reaching a
 * form control -- the fragment is the one part of this page a stranger can
 * write.
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
      .slice(0, ROW_COUNT)
      .map((line) => {
        const cells = line.split(CELL_SEPARATOR);
        const row = {};
        ROW_FIELDS.forEach((field, index) => {
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

// Writes the quarter to the visitor's own storage. Wrapped because a browser
// with site data blocked throws on access rather than returning null, and a
// carrier mid-return should not lose the page over a storage setting.
export function saveBid(storage, values) {
  if (!storage) return false;
  try {
    storage.setItem(QUARTER_KEY, JSON.stringify({ v: VERSION, values: decodeBid(encodeBid(values)) }));
    return true;
  } catch {
    return false;
  }
}

// Reads a previously saved quarter back, re-validated through the same
// encode/decode pair so a stored blob edited by hand, or written by an older
// version of this module, can only ever produce fields this build knows
// about.
export function loadBid(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(QUARTER_KEY);
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
    storage.removeItem(QUARTER_KEY);
    return true;
  } catch {
    return false;
  }
}

// A link wins over storage: a carrier who opens a shared link means to see
// that quarter, not the one they last worked. Storage is the fallback for a
// plain visit. Returns the values plus which source answered, so the page
// can say so rather than silently changing numbers under the visitor.
export function restoreBid({ hash = '', storage = null } = {}) {
  const fromLink = decodeBid(hash);
  if (Object.keys(fromLink).length > 0) return { values: fromLink, source: 'link' };
  const stored = loadBid(storage);
  if (Object.keys(stored).length > 0) return { values: stored, source: 'storage' };
  return { values: {}, source: 'none' };
}
