// Accept a platform line and a rate card handed over from another tool.
//
// `ventures/brand-deal-rate-calculator` computes exactly the two things
// `validateMediaKit` warns about when they are missing -- a platform-stats
// line and a rate card -- and until now a creator who had just seen those
// numbers had to retype all of them here. Its `handoff.mjs` builds a relative
// link carrying them in the URL fragment; this module is the receiving half.
//
// Three rules shape it, and each is a bug it is written to not have:
//
// 1. **It never overwrites.** A creator can arrive here with a saved draft
//    they have spent twenty minutes on. Silently replacing a rate card with
//    an incoming one would destroy work with no error and no undo, so
//    `mergeLines` only ever *appends* lines that are not already present, and
//    the page asks before it does even that.
//
// 2. **It trusts nothing in the URL.** A fragment is whatever was in the link
//    someone clicked. Only the form's own field names are read (checked
//    against `STRING_FIELDS`, imported rather than restated), every value is
//    stripped of control characters, and both the line count and the total
//    length are capped -- so a hostile or malformed link cannot wedge the
//    form or fill localStorage. The values land in a textarea's `value` and
//    are escaped again by `generator.mjs` on render, so this is defence in
//    depth rather than the only guard.
//
// 3. **Nothing is transmitted.** The values ride in the fragment, which
//    browsers do not send to any server, and this module does no I/O at all.
//    `storage` and the location string are both passed in, so this stays
//    testable without a DOM.

import { STRING_FIELDS } from "./state.mjs";

/** The fields a handoff link is allowed to fill. */
export const PREFILLABLE = Object.freeze(["platformsRaw", "ratesRaw"]);

/** Caps. Generous for a real rate card, far below anything that could wedge
 * the form or exhaust storage. */
export const LIMITS = Object.freeze({ maxLines: 24, maxLineLength: 200, maxFieldLength: 4000 });

/**
 * Strips control characters (including the newlines that would forge extra
 * rows inside a single one) and collapses runs of whitespace, then trims.
 */
function cleanLine(line) {
  return String(line ?? "")
    // Control characters (the newlines among them would forge extra rows
    // inside a single one), plus the Unicode bidi and zero-width formatting
    // characters that can make a price read as a different number than it is.
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITS.maxLineLength);
}

/**
 * Normalises one incoming field to at most `maxLines` clean, non-empty lines.
 * Returns "" when nothing survives, so a caller can treat empty as absent.
 */
export function cleanBlock(value) {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, LIMITS.maxLines);
  return lines.join("\n").slice(0, LIMITS.maxFieldLength);
}

/**
 * Reads a handoff out of a location fragment or query string.
 *
 * @param {string} value `location.hash` or `location.search`, with or without
 *   its leading `#`/`?`.
 * @returns {{platformsRaw?: string, ratesRaw?: string}|null} null when the
 *   link carries no usable handoff at all.
 */
export function readHandoff(value) {
  const raw = String(value ?? "").replace(/^[#?]/, "");
  if (!raw) return null;
  let params;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }
  const out = {};
  for (const field of PREFILLABLE) {
    // A field this module thinks is prefillable but the form does not have
    // would fill nothing. Caught by a test rather than left to be noticed in
    // production, but checked here too so a stale constant cannot half-work.
    if (!STRING_FIELDS.includes(field)) continue;
    const cleaned = cleanBlock(params.get(field));
    if (cleaned) out[field] = cleaned;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Appends the lines of `incoming` that `current` does not already have.
 *
 * Append rather than replace: see rule 1 above. Duplicate detection compares
 * whole trimmed lines, so a creator who follows the same handoff link twice
 * gets one rate card rather than two, while a genuinely different price for
 * the same deliverable is kept -- this module has no business deciding which
 * of two prices for "Instagram feed post" the creator meant.
 *
 * @returns {{text: string, added: number}}
 */
export function mergeLines(current, incoming) {
  const existing = String(current ?? "").split(/\r?\n/);
  const seen = new Set(existing.map((line) => line.trim()).filter(Boolean));
  const additions = [];
  for (const line of String(incoming ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    additions.push(trimmed);
  }
  if (additions.length === 0) return { text: String(current ?? ""), added: 0 };
  const base = String(current ?? "").replace(/\s+$/, "");
  const text = base ? `${base}\n${additions.join("\n")}` : additions.join("\n");
  return { text, added: additions.length };
}

/**
 * Applies a handoff to the current form values, without destroying any of
 * them.
 *
 * @param {object} current the form's `{platformsRaw, ratesRaw, ...}`
 * @param {object} handoff the result of `readHandoff`
 * @returns {{values: object, added: Record<string, number>, total: number}}
 */
export function applyHandoff(current = {}, handoff = null) {
  const values = { ...current };
  const added = {};
  let total = 0;
  if (!handoff) return { values, added, total };
  for (const field of PREFILLABLE) {
    const incoming = handoff[field];
    if (!incoming) continue;
    const merged = mergeLines(current?.[field], incoming);
    values[field] = merged.text;
    added[field] = merged.added;
    total += merged.added;
  }
  return { values, added, total };
}

/**
 * One sentence naming what a link is offering, for the banner that asks
 * before inserting anything. Counts rows rather than characters because that
 * is what the reader will see appear in the two boxes.
 */
export function describeHandoff(handoff) {
  if (!handoff) return "";
  const countLines = (value) => (value ? value.split("\n").filter(Boolean).length : 0);
  const parts = [];
  const platforms = countLines(handoff.platformsRaw);
  const rates = countLines(handoff.ratesRaw);
  if (platforms) parts.push(`${platforms} platform ${platforms === 1 ? "row" : "rows"}`);
  if (rates) parts.push(`${rates} rate-card ${rates === 1 ? "row" : "rows"}`);
  return parts.join(" and ");
}
