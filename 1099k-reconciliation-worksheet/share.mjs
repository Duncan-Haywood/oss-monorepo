/**
 * Shareable link for the 1099-K reconciliation worksheet.
 *
 * A seller handing this off to a tax preparer, a bookkeeper, or a spouse
 * needs the recipient to see the exact same rows -- every platform, every
 * figure -- not a screenshot of the totals. Unlike most of this portfolio's
 * share.mjs modules, the payload here has no fixed field count: a seller
 * can add one platform or a dozen, so the whole row list rides in the URL
 * fragment as one JSON array rather than as separate query-string fields
 * keyed by index. That is also why a flat allowlist (the drift class
 * CLAUDE.md records against a fixed-field share module) does not apply the
 * same way here -- each row is independently reshaped through the same six
 * fields reconcileRow already treats as optional-and-coerced, so a field
 * dropped from a row is a zero on that row, never a crash or a silently
 * dropped platform.
 *
 * The transform is pure: no DOM, no storage, no network. A crafted or stale
 * fragment can only produce well-shaped rows -- never inject a string where
 * calc.mjs expects a number, and never grow past MAX_ROWS.
 */

// More platforms than any seller realistically reconciles in one worksheet
// (the IRS itself only requires one 1099-K per payer, and this portfolio's
// other multi-row worksheets cap similarly) -- a ceiling against a
// pathologically long crafted link, not a limit anyone should ever hit.
const MAX_ROWS = 25;

// Matches the platform name input's practical length used elsewhere in the
// portfolio for a free-text label field.
const TEXT_MAX = 60;

const NUMBER_FIELDS = Object.freeze(["box1a", "refunds", "salesTax", "fees", "cogs", "shipping"]);

function usableNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Collapses control characters and runs of whitespace to a single space,
// the same shape cash-runway-planner's share.mjs uses for a free-text
// field, so a pasted multi-line platform name still fits on one row.
function usableText(value) {
  if (typeof value !== "string") return "";
  let collapsed = "";
  let lastWasSpace = false;
  for (const char of value) {
    const code = char.codePointAt(0);
    const isControl = code < 32 || code === 127;
    if (isControl || char === " ") {
      if (!lastWasSpace) collapsed += " ";
      lastWasSpace = true;
    } else {
      collapsed += char;
      lastWasSpace = false;
    }
  }
  return collapsed.trim().slice(0, TEXT_MAX);
}

function sanitizeRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const platform = usableText(row.platform);
  if (!platform) return null;
  const clean = { platform };
  for (const field of NUMBER_FIELDS) clean[field] = usableNumber(row[field]);
  return clean;
}

/** Encodes a row array (the same shape stored in localStorage) as a URL fragment payload, or '' when there is nothing worth sharing. */
export function encodeRows(rows) {
  const clean = (Array.isArray(rows) ? rows : [])
    .map(sanitizeRow)
    .filter(Boolean)
    .slice(0, MAX_ROWS);
  if (clean.length === 0) return "";
  return encodeURIComponent(JSON.stringify(clean));
}

/** Decodes a URL fragment (with or without its leading '#') back into a validated row array. Never throws; an absent, malformed, or non-array fragment decodes to []. */
export function decodeRows(fragment) {
  if (!fragment) return [];
  const raw = String(fragment).replace(/^[#?]/, "");
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(sanitizeRow).filter(Boolean).slice(0, MAX_ROWS);
}
