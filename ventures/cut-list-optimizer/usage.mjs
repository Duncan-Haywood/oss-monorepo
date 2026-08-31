// Anonymous, browser-local usage counting. Nothing leaves the device: these are
// counters in localStorage that the visitor can switch off, not analytics events.
//
// `event` separates the things worth knowing apart — how many cut plans were
// actually calculated ('runs', 'sheet-runs'), how many were carried into a
// job ticket ('copies', 'sheet-copies'), and how many times a shop used the
// size comparison to decide what to buy ('compares', 'sheet-compares').
// Counting them into one key made the number unreadable, and the sheet and
// linear tools answer different questions about which half of the product
// people come back for.
export const EVENTS = ['runs', 'copies', 'compares', 'sheet-runs', 'sheet-copies', 'sheet-compares', 'draft-saves', 'draft-restores'];

// A visitor who has asked their browser to say "do not track me" has already
// answered this question, so the opt-out checkbox is not the only way to say no.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage, optOut, event = 'runs') {
  if (optOut || !storage || honorsBrowserSignal()) return;
  const key = `cut-list-optimizer-${event}`;
  try { storage.setItem(key, String(Number(storage.getItem(key) || 0) + 1)); } catch { /* private browsing can deny storage */ }
}

export function readUsage(storage, event = 'runs') {
  if (!storage) return 0;
  try { return Number(storage.getItem(`cut-list-optimizer-${event}`) || 0); } catch { return 0; }
}

// The footer checkbox reads "do not keep anonymous local usage counts", so
// ticking it has to remove the counts already kept, not just stop adding to them.
export function clearUsage(storage) {
  if (!storage) return;
  for (const event of EVENTS) {
    try { storage.removeItem(`cut-list-optimizer-${event}`); } catch { /* nothing to clear if storage is denied */ }
  }
}
