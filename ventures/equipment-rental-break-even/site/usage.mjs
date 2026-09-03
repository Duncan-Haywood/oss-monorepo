// Local, opt-out usage counting for the equipment rental break-even calculator.
//
// Extracted from app.mjs on 2026-09-03. It lived inline there as three
// functions that touched `localStorage` directly, with no guard, and that is a
// real failure rather than a style point: **reading `localStorage` throws**
// when a browser is set to block site data (private windows, "block all
// cookies", some enterprise policies). It does not return null.
//
// What that cost, in app.mjs's own control flow:
//
//   - `usage("calculation")` is called from inside `render()`'s try block, so
//     a visitor with storage blocked got the SecurityError rendered into the
//     results panel *as if it were a calculation error*. The calculator — the
//     entire product — appeared broken.
//   - `showUsage()` ran at module top level, after the event listeners were
//     attached but before `showDrafts()`. A throw there aborted the rest of
//     module evaluation, so the drafts dropdown was never populated, and every
//     later click that recorded an event threw uncaught.
//
// Every sibling venture that keeps its site in `site/` already wraps storage
// this way (`quote-margin-check`, `tender-radar`, `mcp-supply-chain-watch`,
// `shopify-permission-drift`). This is that same shape, and being DOM-free is
// the point: it can be unit-tested against a throwing storage stub, which the
// inline version could not be.
//
// The storage keys are deliberately unchanged (`rental-usage`,
// `rental-usage-off`). Renaming them would silently reset the counts of anyone
// already using the tool and, worse, forget an opt-out someone had chosen —
// re-enabling counting for a visitor who had turned it off.

const KEY = "rental-usage";
const OPT_OUT = "rental-usage-off";

/**
 * The backing store, or null when it cannot be reached.
 *
 * The `try` covers the property access itself, not just the method call: in a
 * browser blocking site data, `localStorage` throws on access rather than
 * being undefined.
 */
function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Honour the two headers a browser can express this with, and never throw. */
function blocked() {
  try {
    return navigator?.doNotTrack === "1" || navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function enabled() {
  const store = storage();
  if (!store || blocked()) return false;
  try {
    return store.getItem(OPT_OUT) !== "1";
  } catch {
    return false;
  }
}

/** Counts for display. `{}` whenever storage is unreadable or malformed. */
export function counts() {
  const store = storage();
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(KEY) || "{}");
    // A hand-edited or corrupted value must not reach the caller as a string
    // or an array, which would render as `undefined` counts rather than 0.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function record(event) {
  if (!enabled()) return;
  const store = storage();
  if (!store) return;
  try {
    const data = counts();
    data[event] = (data[event] || 0) + 1;
    store.setItem(KEY, JSON.stringify(data));
  } catch {
    /* best effort: a quota error must never break the calculator */
  }
}

/**
 * Clear the counts and turn counting off.
 *
 * One-way by design, matching the copy the page has always carried ("the
 * button above turns them off"). Returns whether the store accepted it, so the
 * UI can tell the visitor the truth when storage is unavailable rather than
 * claiming it turned something off that it could not reach.
 */
export function clearAndDisable() {
  const store = storage();
  if (!store) return false;
  try {
    store.removeItem(KEY);
    store.setItem(OPT_OUT, "1");
    return true;
  } catch {
    return false;
  }
}
