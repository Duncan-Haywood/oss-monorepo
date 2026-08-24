// Anonymous, browser-local usage counting. Nothing leaves the device: these are
// counters in localStorage that the visitor can switch off, not analytics events.
//
// `event` separates the two things worth knowing apart — how many cut plans were
// actually calculated ('runs') and how many were carried into a job ticket
// ('copies'). Counting both into one key made the number unreadable.
export function recordUsage(storage, optOut, event = 'runs') {
  if (optOut || !storage) return;
  const key = `cut-list-optimizer-${event}`;
  try { storage.setItem(key, String(Number(storage.getItem(key) || 0) + 1)); } catch { /* private browsing can deny storage */ }
}

export function readUsage(storage, event = 'runs') {
  if (!storage) return 0;
  try { return Number(storage.getItem(`cut-list-optimizer-${event}`) || 0); } catch { return 0; }
}
