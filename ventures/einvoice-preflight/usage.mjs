// Anonymous, aggregate-only local usage counts. Event name and day only —
// never invoice contents, filenames, amounts, or identifiers.

const STORAGE_KEY = "einvoice-preflight-usage";

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = "invoice_preflight_checked") {
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  let current = {};
  try {
    const loaded = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    if (loaded && typeof loaded === "object") current = loaded;
  } catch {
    current = {};
  }
  current[event] = (Number(current[event]) || 0) + 1;
  current.last_day = today;
  storage.setItem(STORAGE_KEY, JSON.stringify(current));
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. `recordUsage` above consults it
// directly as well as taking the caller's argument -- a stored preference
// that only one line of page wiring reads is one line away from being
// forgotten, which is the defect this change exists to fix.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(`${STORAGE_KEY}-opt-out`) === "1";
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = globalThis.localStorage, optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem(STORAGE_KEY); } catch { /* storage is optional */ }
    try { storage.setItem(`${STORAGE_KEY}-opt-out`, "1"); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${STORAGE_KEY}-opt-out`); } catch { /* storage is optional */ }
  }
}
