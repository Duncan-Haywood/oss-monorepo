// A setter re-enters the same wage, burden, overhead, markup, and material
// rates on every single bid. Losing them when the tab closes is the reason a
// pricing tool gets used once and never again, so this module keeps the whole
// form: to the visitor's own browser between visits, and into a link they can
// send themselves, a partner, or the customer.
//
// The transform is pure and takes the field spec as an argument rather than
// keeping its own copy of the field list. That is deliberate. `index.html`
// already declares the ids `readInput()` reads, so passing those same arrays
// in means a field added to the form is shareable the moment it exists. A
// second hand-maintained allowlist in here would silently drop whatever the
// form grew since — a shared link that computes a different price than the
// sender saw is worse than no link at all.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The bid
// travels in the URL *fragment* (`#...`), never the query string: a fragment
// is not sent in the request line a server logs, nor in the `Referer` header a
// later click would carry, so the numbers a setter typed stay on the machines
// they choose to send the link to. `encodeBid` returns a bare parameter string
// and `decodeBid` accepts it with or without a leading `#`, so this module
// stays agnostic to which the caller uses; the calculators use the fragment.

// Spec shape, built by the caller from its existing id lists:
//   {
//     key:     'kitchen-tile-backsplash-bid',   // localStorage key
//     numbers: ['wallSf', 'hourlyWage', ...],   // free numeric inputs
//     flags:   ['includeCooktop', ...],         // checkboxes
//     choices: { scope: ['tile-only', ...] },   // selects, with their options
//     rows:    { param: 'a', fields: [...] },   // optional repeated group
//   }
//
// `rows` is for a form whose shape the visitor sets — the janitorial bid is a
// list of spaces in a building, and there is no fixed field list to name. It
// is the case that most needs keeping: re-measuring a building to re-price it
// is an hour of work, not a retyped wage. Each row encodes as colon-separated
// values in spec order, rows separated by commas, under one parameter.

const VERSION = 1;
const ROW_SEPARATOR = ',';
const CELL_SEPARATOR = ':';
// A form the visitor grows without limit is a form a crafted link can grow
// without limit too. This is far above any real building and far below what
// would take a browser down.
const MAX_ROWS = 200;

// Only a finite, non-negative number is carried. That is the same contract the
// calculators enforce on input, so a restored or shared value can never
// prefill a field the calculator would then reject.
function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function specNumbers(spec) {
  return Array.isArray(spec?.numbers) ? spec.numbers : [];
}

function specFlags(spec) {
  return Array.isArray(spec?.flags) ? spec.flags : [];
}

function specChoices(spec) {
  return spec?.choices && typeof spec.choices === 'object' ? spec.choices : {};
}

// A select's value is a string in the DOM, so this used to test `typeof value
// === 'string'` and be done. A page is free to coerce it before handing the
// values here, and one does: `sewer-line-replace-bid-calculator` runs
// `values.diameterIn = Number(values.diameterIn)` in `readInput()` so its own
// arithmetic gets a number. The strict check then dropped `diameterIn` from
// the link *and* from the save, with nothing said — a bid priced for a 6-inch
// lateral reopened as a 4-inch one, for the recipient and for the setter's own
// next visit, and the price moved with it.
//
// So the comparison is made on the string form. The allowed list is still what
// decides: a number that is not an option the select offers is rejected exactly
// as a string that is not. Only a string or a finite number gets that far —
// `true` must not slip in as the option `"true"`, and an object must not
// arrive as `"[object Object]"`.
function choiceText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

// values object -> query string (no leading '?'). Field order follows the
// spec, so the same bid always encodes to the same string and a copied link
// stays stable across visits.
export function encodeBid(spec, values) {
  const params = new URLSearchParams();
  const choices = specChoices(spec);
  for (const [id, allowed] of Object.entries(choices)) {
    const value = choiceText(values?.[id]);
    if (value !== null && allowed.includes(value)) params.set(id, value);
  }
  for (const id of specNumbers(spec)) {
    const value = usableNumber(values?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of specFlags(spec)) {
    if (values?.[id] === undefined) continue;
    params.set(id, values[id] ? '1' : '0');
  }
  for (const rows of specRowGroups(spec)) {
    if (!Array.isArray(values?.[rows.param])) continue;
    const encoded = values[rows.param]
      .slice(0, MAX_ROWS)
      .map(row => rows.fields.map(field => encodeCell(field, row?.[field.key])).join(CELL_SEPARATOR))
      // A row where every cell was rejected carries nothing; emitting it would
      // give the recipient a blank space to puzzle over.
      .filter(row => row.replaceAll(CELL_SEPARATOR, '') !== '');
    if (encoded.length > 0) params.set(rows.param, encoded.join(ROW_SEPARATOR));
  }
  return params.toString();
}

function specRows(spec) {
  const rows = spec?.rows;
  if (!rows || typeof rows.param !== 'string' || !Array.isArray(rows.fields)) return null;
  return rows;
}

function specRowGroups(spec) {
  const groups = [];
  const primary = specRows(spec);
  if (primary) groups.push(primary);
  if (Array.isArray(spec?.extraRows)) {
    for (const rows of spec.extraRows) {
      if (rows && typeof rows.param === 'string' && Array.isArray(rows.fields)) {
        groups.push(rows);
      }
    }
  }
  return groups;
}

const MAX_TEXT = 80;

function encodeText(value) {
  const raw = String(value ?? '').trim().slice(0, MAX_TEXT);
  if (!raw) return '';
  // URI-encode so a typed name can contain ":" or "," without splitting the row.
  return encodeURIComponent(raw);
}

function decodeText(raw) {
  if (!raw) return null;
  try {
    const text = decodeURIComponent(raw).trim().slice(0, MAX_TEXT);
    return text || null;
  } catch {
    return null;
  }
}

function encodeCell(field, value) {
  if (field.kind === 'choice') {
    // Same coercion tolerance as `encodeBid` above, for the same reason: a row
    // cell is read out of a form the visitor grew, and a page that normalises
    // it on the way in should not lose it on the way out.
    const text = choiceText(value);
    return text !== null && field.options.includes(text) ? text : '';
  }
  if (field.kind === 'text') return encodeText(value);
  const number = usableNumber(value);
  return number === null ? '' : String(number);
}

function decodeCell(field, raw) {
  if (field.kind === 'choice') return field.options.includes(raw) ? raw : null;
  if (field.kind === 'text') return decodeText(raw);
  const number = usableNumber(raw);
  return number === null ? null : String(number);
}

// query string -> values object. Accepts a bare query string or one with a
// leading '?' or '#', so a caller can hand it `location.search` untouched.
// Only ids named in the spec survive, numbers must parse, and a select only
// takes a value the select actually offers — a crafted link cannot inject a
// scope the calculator has no rates for, or any markup at all.
export function decodeBid(spec, source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const values = {};
  for (const [id, allowed] of Object.entries(specChoices(spec))) {
    if (!params.has(id)) continue;
    const value = params.get(id);
    if (allowed.includes(value)) values[id] = value;
  }
  for (const id of specNumbers(spec)) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) values[id] = String(value);
  }
  for (const id of specFlags(spec)) {
    if (!params.has(id)) continue;
    values[id] = params.get(id) === '1';
  }
  for (const rows of specRowGroups(spec)) {
    if (!params.has(rows.param)) continue;
    const decoded = params.get(rows.param)
      .split(ROW_SEPARATOR)
      .slice(0, MAX_ROWS)
      .map(row => {
        const cells = row.split(CELL_SEPARATOR);
        const out = {};
        rows.fields.forEach((field, index) => {
          const value = decodeCell(field, cells[index] ?? '');
          if (value !== null) out[field.key] = value;
        });
        return out;
      })
      // A row that survived validation with nothing in it is not a space the
      // sender described, so it is dropped rather than added to the form.
      .filter(row => Object.keys(row).length > 0);
    if (decoded.length > 0) values[rows.param] = decoded;
  }
  return values;
}

// Writes the bid to the visitor's own storage. Wrapped because a browser with
// site data blocked throws on access rather than returning null, and a setter
// mid-bid should not lose the page over a storage setting.
export function saveBid(storage, spec, values) {
  if (!storage || !spec?.key) return false;
  try {
    storage.setItem(spec.key, JSON.stringify({ v: VERSION, values: decodeBid(spec, encodeBid(spec, values)) }));
    return true;
  } catch {
    return false;
  }
}

// Reads a previously saved bid back, re-validated through the same spec so a
// stored blob edited by hand, or written by an older version of the form, can
// only ever produce fields this build knows about.
export function loadBid(storage, spec) {
  if (!storage || !spec?.key) return {};
  try {
    const raw = storage.getItem(spec.key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || typeof parsed.values !== 'object') return {};
    return decodeBid(spec, encodeBid(spec, parsed.values));
  } catch {
    return {};
  }
}

export function clearBid(storage, spec) {
  if (!storage || !spec?.key) return false;
  try {
    storage.removeItem(spec.key);
    return true;
  } catch {
    return false;
  }
}

// A link wins over storage: a setter who opens a bid someone sent them means
// to see that bid, not the one they last priced. Storage is the fallback for a
// plain visit. Returns the values plus which source answered, so the page can
// say so rather than silently changing numbers under the visitor.
export function restoreBid(spec, { search = '', storage = null } = {}) {
  const fromLink = decodeBid(spec, search);
  if (Object.keys(fromLink).length > 0) return { values: fromLink, source: 'link' };
  const stored = loadBid(storage, spec);
  if (Object.keys(stored).length > 0) return { values: stored, source: 'storage' };
  return { values: {}, source: 'none' };
}
