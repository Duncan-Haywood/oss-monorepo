// Anonymous local usage counting for the change-order margin calculator.
//
// Pulled out of index.html's inline `count()` so the opt-out and
// Do-Not-Track/Global-Privacy-Control logic is unit-tested directly instead
// of only exercised by hand in a browser. The event names and the
// `change-order-<event>` key shape are unchanged from the inline version --
// this is an extraction, not a redesign, so an existing user's opt-out choice
// (stored under `change-order-usage-enabled`) keeps meaning exactly what it
// meant before.
//
// A separate `usage.mjs` module (rather than the inline function) is also
// what lets this venture adopt the shared customer-proposal panel: that
// tooling (`platform/proposal/adopt.mjs`) anchors its generated import next
// to `import { ... } from './usage.mjs'` and refuses a page that has no such
// file to anchor to.

const OPT_OUT_KEY = 'change-order-usage-enabled';
const PREFIX = 'change-order-';

/** Whether counting is currently allowed on this device. */
export function usageEnabled(storage, navigatorLike = globalThis.navigator) {
  if (
    navigatorLike?.doNotTrack === '1'
    || navigatorLike?.globalPrivacyControl === true
    || navigatorLike?.globalPrivacyControl === 'true'
  ) {
    return false;
  }
  try {
    // The stored value is the opt-out flag as a string: absent (or anything
    // other than the literal 'false') means counting is on, matching the
    // original inline `!=='false'` check.
    return storage.getItem(OPT_OUT_KEY) !== 'false';
  } catch {
    return false;
  }
}

/** Record one occurrence of `event`, unless counting is currently disabled. */
export function recordUsage(storage, event, navigatorLike = globalThis.navigator) {
  if (!usageEnabled(storage, navigatorLike)) return;
  try {
    const key = `${PREFIX}${event}`;
    const current = Number(storage.getItem(key) || 0);
    storage.setItem(key, String(current + 1));
  } catch {
    // Private browsing or a full quota must not break the calculator.
  }
}

/** Turn counting off for this device. Mirrors the page's own toggle button. */
export function disableUsage(storage) {
  try {
    storage.setItem(OPT_OUT_KEY, 'false');
  } catch {
    // Optional measurement; a storage failure here is not the user's problem.
  }
}
