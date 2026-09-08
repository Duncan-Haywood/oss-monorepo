// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores wage
// rates, hours, classifications, or any other input, and it never leaves the
// device — payroll figures are exactly the sort of thing that must not be
// transmitted anywhere.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'week_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem('certified-payroll-usage') || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem('certified-payroll-usage', JSON.stringify(current));
}
