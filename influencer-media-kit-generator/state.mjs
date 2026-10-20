// Autosaves the form to the visitor's own browser so a media kit with a
// dozen fields (bio, platform stats, audience breakdown, past partnerships, a
// rate card) survives a closed tab -- the same problem the fleet's trade
// calculators solve with `share.mjs`, but that module's shape (a fixed spec
// of short numbers/flags, a 512-char cap per text field) does not fit this
// venture's data: a bio is routinely several paragraphs, and the
// platform/audience/collab/rate lists are open-ended text blocks, not named
// numeric ids. Sharing the *builder* via a URL link (that module's other
// job) also does not apply here the way it does for a bid -- the deliverable
// a creator sends onward is the generated file itself (downloaded or
// copied), not a link back into this form. So this is a small, purpose-built
// equivalent: one JSON blob, one localStorage key, re-validated shape on
// read so a corrupted or foreign value can't wedge the form. Same shape as
// epk-generator/state.mjs, the closest sibling venture.
//
// Nothing here is transmitted anywhere. `storage` is passed in rather than
// read from a global so this stays testable without a DOM.

const KEY = "influencer-media-kit-generator-draft";
const VERSION = 1;

// Exported so `prefill.mjs` can check an incoming link's field names against
// the form's real ones rather than restating the list. A field renamed here
// then fails that module's test instead of silently accepting a link that
// fills nothing.
export const STRING_FIELDS = Object.freeze([
  "creatorName", "tagline", "niche", "location", "bio",
  "photoUrl", "photoAlt",
  "contactName", "contactEmail", "contactPhone", "websiteUrl",
  "platformsRaw", "audienceRaw", "collabsRaw", "testimonialsRaw", "ratesRaw",
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
