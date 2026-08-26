export function createUsage(storage = globalThis.localStorage) {
  const disabled = () => globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  return { record(event) { if (disabled()) return; try { const key = 'medical-courier-route-margin-usage'; const data = JSON.parse(storage.getItem(key) || '{}'); data[event] = (data[event] || 0) + 1; storage.setItem(key, JSON.stringify(data)); } catch {} } };
}
