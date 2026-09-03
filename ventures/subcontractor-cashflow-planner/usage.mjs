const KEY = 'subcontractor-cashflow-planner-usage';
const EVENTS = new Set(['scenario_planned', 'csv_exported']);

function honorsPrivacy() {
  return globalThis.navigator?.doNotTrack === '1'
    || globalThis.navigator?.globalPrivacyControl === true;
}

export function recordUsage(event, enabled = true, storage = globalThis.localStorage) {
  if (!enabled || !EVENTS.has(event) || honorsPrivacy() || !storage) return;
  try {
    const usage = JSON.parse(storage.getItem(KEY) || '{}');
    usage[event] = (usage[event] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(usage));
  } catch {
    // localStorage can throw in private mode; counting is optional.
  }
}
