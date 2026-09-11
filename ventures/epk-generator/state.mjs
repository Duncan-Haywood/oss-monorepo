// Autosaves the form to the visitor's own browser so a press kit with a dozen
// fields (bio, several link lists, tour dates, quotes) survives a closed tab
// -- the same problem the fleet's trade calculators solve with `share.mjs`,
// but that module's shape (a fixed spec of short numbers/flags, a 512-char
// cap per text field) does not fit this venture's data: a bio is routinely
// several paragraphs, and the link/date/quote lists are open-ended text
// blocks, not named numeric ids. Sharing the *builder* via a URL link (that
// module's other job) also does not apply here the way it does for a bid --
// the deliverable an artist sends onward is the generated file itself
// (downloaded or copied), not a link back into this form. So this is a
// small, purpose-built equivalent: one JSON blob, one localStorage key,
// re-validated shape on read so a corrupted or foreign value can't wedge the
// form.
//
// Nothing here is transmitted anywhere. `storage` is passed in rather than
// read from a global so this stays testable without a DOM.

const KEY = "epk-generator-draft";
const VERSION = 1;

const STRING_FIELDS = Object.freeze([
  "artistName", "tagline", "location", "genre", "bio",
  "photoUrl", "photoAlt",
  "contactName", "contactEmail", "contactPhone", "websiteUrl", "techRiderUrl",
  "streamingLinksRaw", "socialLinksRaw", "tourDatesRaw", "pressQuotesRaw",
]);

/** Keeps only known string fields, so a foreign or corrupted blob can't leak
 * arbitrary keys into the form. */
function sanitize(data) {
  const out = {};
  for (const field of STRING_FIELDS) {
    const value = data?.[field];
    if (typeof value === "string" && value.length) out[field] = value;
  }
  return out;
}

/** @param {Storage|null} storage @param {object} data @returns {boolean} */
export function saveDraft(storage, data) {
  if (!storage) return false;
  try {
    const clean = sanitize(data);
    if (Object.keys(clean).length === 0) {
      storage.removeItem(KEY);
      return true;
    }
    storage.setItem(KEY, JSON.stringify({ v: VERSION, data: clean }));
    return true;
  } catch {
    return false;
  }
}

/** @param {Storage|null} storage @returns {object} */
export function loadDraft(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || typeof parsed.data !== "object") return {};
    return sanitize(parsed.data);
  } catch {
    return {};
  }
}

/** @param {Storage|null} storage @returns {boolean} */
export function clearDraft(storage) {
  if (!storage) return false;
  try {
    storage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
