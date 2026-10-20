// A shareable link and a local save for one restaurant's channel comparison.
//
// Before this, the only way to hand a priced comparison to a partner or an
// accountant was "Copy decision summary" -- prose describing the winner, not
// the inputs. That is enough to report a decision but not enough to *check*
// one: a partner who wants to try a different DoorDash commission has to
// retype every field from scratch, on every channel, or take the sender's
// word for the shared and per-channel numbers that produced it.
//
// The transform is pure and takes the field list as an argument rather than
// keeping its own copy. `SHARED_FIELDS` and `CHANNEL_FIELDS` in `index.html`
// already say what `readShared()` and `renderPanels()` read and write, so
// passing those same lists in means a field added to the form is shareable
// the moment it exists. A second hand-maintained allowlist in here would
// silently drop whatever the form grew since -- a shared link that reopens a
// different comparison than the sender saw is worse than no link at all.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in the browser and copied by the visitor. The
// comparison travels in the URL *fragment* (`#...`), never the query string:
// a fragment is not sent in the request line a server logs, nor in the
// `Referer` header a later click would carry, so a restaurant's ticket price,
// food cost and commission rates stay on the machines the sender chooses to
// send the link to.

const VERSION = 1;
const ROW_SEPARATOR = ',';
const CELL_SEPARATOR = ':';
// A ceiling far above the six shipped channels plus headroom for "Other
// channel" duplicated a few times by hand -- not a limit anyone should ever
// approach, and far below anything that would slow a browser down.
const MAX_ROWS = 20;

// Only a finite, non-negative number is carried, the same contract
// `calculateChannel` enforces on every numeric input -- a restored or shared
// value can never prefill a field the calculator would then reject.
function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Spec shape:
 *   {
 *     key:     'delivery-app-margin',       // localStorage key
 *     numbers: ['ticketPrice', ...],        // the shared, non-channel fields
 *     rows:    { param: 'channels', fields: [...] },
 *   }
 *
 * `rows` carries the channel list. Each channel is identified by its preset
 * `id` (a `choice` cell restricted to the ids `CHANNEL_PRESETS` actually
 * ships), so a decoded row can only ever address a channel this build knows
 * about -- a crafted link cannot inject a made-up path with no rate table
 * behind it. Every other cell is the numeric rate or cost fields a channel
 * panel exposes, plus `enabled` riding as a two-value choice the same way
 * `tree-service-bid-calculator`'s per-tree checkboxes do, because a row cell
 * here is a number or a choice -- there is no boolean cell kind.
 */
export function buildSpec(sharedFields, channelFieldKeys, channelIds) {
  return {
    key: 'delivery-app-margin',
    numbers: [...sharedFields],
    rows: {
      param: 'channels',
      fields: [
        { key: 'id', kind: 'choice', options: [...channelIds] },
        ...channelFieldKeys.map((key) => ({ key, kind: 'number' })),
        { key: 'enabled', kind: 'choice', options: ['1', '0'] },
      ],
    },
  };
}

function encodeCell(field, value) {
  if (field.kind === 'choice') {
    const text = typeof value === 'string' ? value : String(value ?? '');
    return field.options.includes(text) ? text : '';
  }
  const number = usableNumber(value);
  return number === null ? '' : String(number);
}

function decodeCell(field, raw) {
  if (field.kind === 'choice') return field.options.includes(raw) ? raw : null;
  const number = usableNumber(raw);
  return number === null ? null : String(number);
}

// values: { ...sharedFields, channels: [{ id, enabled, ...rateFields }] }
// -> query string (no leading '#'). Field order follows the spec, so the
// same comparison always encodes to the same string and a copied link stays
// stable across visits.
export function encodeShare(spec, values) {
  const params = new URLSearchParams();
  for (const id of spec.numbers) {
    const value = usableNumber(values?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  const rows = spec.rows;
  if (Array.isArray(values?.[rows.param])) {
    const encoded = values[rows.param]
      .slice(0, MAX_ROWS)
      .map((row) => rows.fields.map((field) => encodeCell(field, row?.[field.key])).join(CELL_SEPARATOR))
      // A row whose id did not survive is not a channel the recipient's build
      // knows about; emitting it would give them a blank space to puzzle
      // over instead of the channel simply keeping its default.
      .filter((row) => !row.startsWith(CELL_SEPARATOR) && row !== '');
    if (encoded.length > 0) params.set(rows.param, encoded.join(ROW_SEPARATOR));
  }
  return params.toString();
}

// query string -> values object. Accepts a bare string or one with a leading
// '?' or '#'. Only ids named in the spec survive, numbers must parse, and a
// channel row only takes an id the preset list actually offers -- a crafted
// link cannot address a channel this build has no rate table for.
export function decodeShare(spec, source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const values = {};
  for (const id of spec.numbers) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) values[id] = String(value);
  }
  const rows = spec.rows;
  if (params.has(rows.param)) {
    const decoded = params.get(rows.param)
      .split(ROW_SEPARATOR)
      .slice(0, MAX_ROWS)
      .map((row) => {
        const cells = row.split(CELL_SEPARATOR);
        const out = {};
        rows.fields.forEach((field, index) => {
          const value = decodeCell(field, cells[index] ?? '');
          if (value !== null) out[field.key] = value;
        });
        return out;
      })
      // A row that survived validation with no channel id is not one the
      // sender described.
      .filter((row) => typeof row.id === 'string');
    if (decoded.length > 0) values[rows.param] = decoded;
  }
  return values;
}

// Writes the comparison to the visitor's own storage. Wrapped because a
// browser with site data blocked throws on access rather than returning
// null, and a mid-comparison visitor should not lose the page over a storage
// setting.
export function saveShare(storage, spec, values) {
  if (!storage || !spec?.key) return false;
  try {
    storage.setItem(spec.key, JSON.stringify({ v: VERSION, values: decodeShare(spec, encodeShare(spec, values)) }));
    return true;
  } catch {
    return false;
  }
}

// Reads a previously saved comparison back, re-validated through the same
// spec so a stored blob edited by hand, or written by an older build, can
// only ever produce fields this build knows about.
export function loadShare(storage, spec) {
  if (!storage || !spec?.key) return {};
  try {
    const raw = storage.getItem(spec.key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || typeof parsed.values !== 'object') return {};
    return decodeShare(spec, encodeShare(spec, parsed.values));
  } catch {
    return {};
  }
}

export function clearShare(storage, spec) {
  if (!storage || !spec?.key) return false;
  try {
    storage.removeItem(spec.key);
    return true;
  } catch {
    return false;
  }
}

// A link wins over storage: a visitor who opens a comparison someone sent
// them means to see that comparison, not the one they last priced. Storage
// is the fallback for a plain visit. Returns the values plus which source
// answered, so the page can say so rather than silently changing numbers
// under the visitor.
export function restoreShare(spec, { hash = '', storage = null } = {}) {
  const fromLink = decodeShare(spec, hash);
  if (Object.keys(fromLink).length > 0) return { values: fromLink, source: 'link' };
  const stored = loadShare(storage, spec);
  if (Object.keys(stored).length > 0) return { values: stored, source: 'storage' };
  return { values: {}, source: 'none' };
}
