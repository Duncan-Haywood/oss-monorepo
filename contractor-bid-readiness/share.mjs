// Shareable checklist link. The page's own copy already promises "a portable
// handoff" -- today that means a Markdown download, which a subcontractor or
// co-bidder has to open and cannot edit back into this page. "Copy shareable
// link" is the other half of that promise: it puts the opportunity name, the
// due date, and every listed requirement (name, owner, status, note) into the
// URL fragment, so a teammate who opens the link sees and can keep working on
// the exact same checklist rather than retyping it from a PDF export. A
// requirement silently dropped on the way through is a requirement the
// recipient never sees was ever tracked.
//
// The transform is pure: no DOM, no storage, no network, and everything after
// the # never reaches a server or a Referer header. `index.html`'s own
// "Check readiness" handler builds the same `{ name, owner, status, note }`
// shape from the row inputs it reads, so a field added to a row there needs
// only a matching change here, not a second hand-kept list.

/** The two fields the opportunity header carries. */
export const TEXT_FIELD_IDS = Object.freeze(['opportunity']);
export const DATE_FIELD_IDS = Object.freeze(['due']);

/** Mirrors the select options `add()` renders for a requirement row. */
export const ROW_STATUSES = Object.freeze(['ready', 'attention', 'blocked']);

/** Ceiling on the opportunity name -- a sentence, not a solicitation title. */
export const MAX_TEXT = 200;
/** Ceiling on a single requirement's name, owner, or note. */
export const MAX_ROW_TEXT = 120;
/**
 * A checklist this long is far past any real RFP and far below what would
 * strain a browser or a link a chat app is willing to auto-link.
 */
export const MAX_ROWS = 100;

const ROW_SEPARATOR = ',';
const CELL_SEPARATOR = ':';
const ROWS_PARAM = 'items';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Shape-checked rather than calendar-checked: a link carrying "2099-13-40" is
// passed through to `daysUntilDue`, which already treats an unparseable date
// as "no deadline" the same way a blank field does. This only guards against
// a fragment that is not a date-shaped string at all.
function usableDate(value) {
  return typeof value === 'string' && ISO_DATE_RE.test(value) ? value : null;
}

// Strips ASCII control characters that a requirement name or note should
// never carry and a link must not smuggle through as a stray byte. Written
// as a character-code test rather than a regex literal so no raw control
// byte has to appear anywhere in this source file.
function stripControlChars(value) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const tab = 9;
    const newline = 10;
    const carriageReturn = 13;
    const space = 32;
    const del = 127;
    if (code === tab || code === newline || code === carriageReturn || (code >= space && code !== del)) {
      out += value[i];
    }
  }
  return out;
}

function usableText(value, max) {
  if (typeof value !== 'string') return null;
  const clean = stripControlChars(value).trim();
  if (!clean) return null;
  return clean.length > max ? clean.slice(0, max) : clean;
}

// Row cells are URI-encoded so a requirement name or note can contain ":" or
// "," without splitting the row apart, matching the pattern
// tree-service-bid-calculator/share.mjs uses for the same problem.
function encodeCell(value) {
  const raw = stripControlChars(String(value == null ? '' : value)).trim().slice(0, MAX_ROW_TEXT);
  return raw ? encodeURIComponent(raw) : '';
}

function decodeCell(raw) {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim().slice(0, MAX_ROW_TEXT);
  } catch {
    return '';
  }
}

/**
 * Encode the opportunity header and requirement rows as a URL fragment
 * payload (no leading '#').
 *
 * A blank or unusable field is omitted rather than carried as an empty
 * string, and a row with nothing usable in it at all is dropped rather than
 * sent as an empty slot -- either would hand the recipient a value the sender
 * never entered.
 */
export function encodeInputs(inputs) {
  const opportunity = inputs && inputs.opportunity;
  const due = inputs && inputs.due;
  const items = inputs && inputs.items;

  const params = new URLSearchParams();

  const name = usableText(opportunity, MAX_TEXT);
  if (name !== null) params.set('opportunity', name);

  const date = usableDate(due);
  if (date !== null) params.set('due', date);

  const rows = Array.isArray(items) ? items.slice(0, MAX_ROWS) : [];
  const encodedRows = rows
    .map((item) => [
      encodeCell(item && item.name),
      encodeCell(item && item.owner),
      ROW_STATUSES.includes(item && item.status) ? item.status : '',
      encodeCell(item && item.note),
    ].join(CELL_SEPARATOR))
    .filter((row) => row.replaceAll(CELL_SEPARATOR, '') !== '');
  if (encodedRows.length > 0) params.set(ROWS_PARAM, encodedRows.join(ROW_SEPARATOR));

  return params.toString();
}

/**
 * Read a fragment (or query string) back into { opportunity, due, items }.
 *
 * Anything unrecognised, over-long, or not one of the form's own status
 * options is dropped or coerced rather than thrown on, so a truncated or
 * crafted link still opens the page on the fields that survived. A row with
 * no usable name is dropped, matching index.html's own
 * `.filter(item => item.name.trim())` before a row is ever assessed -- a
 * crafted link cannot inject a "requirement" with no name for someone to
 * puzzle over.
 */
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const result = {};

  if (params.has('opportunity')) {
    const name = usableText(params.get('opportunity'), MAX_TEXT);
    if (name !== null) result.opportunity = name;
  }
  if (params.has('due')) {
    const date = usableDate(params.get('due'));
    if (date !== null) result.due = date;
  }
  if (params.has(ROWS_PARAM)) {
    const items = params.get(ROWS_PARAM)
      .split(ROW_SEPARATOR)
      .slice(0, MAX_ROWS)
      .map((row) => {
        const cells = row.split(CELL_SEPARATOR);
        const status = cells[2];
        return {
          name: decodeCell(cells[0]),
          owner: decodeCell(cells[1]),
          status: ROW_STATUSES.includes(status) ? status : 'attention',
          note: decodeCell(cells[3]),
        };
      })
      .filter((item) => item.name.trim() !== '');
    if (items.length > 0) result.items = items;
  }
  return result;
}
