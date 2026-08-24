const KEY = 'saas-seat-true-up-usage';
const SCENARIO_KEY = 'saas-seat-true-up-scenario';

export function recordUsage(storage, event, optedOut = false) {
  if (optedOut || !storage) return;
  try {
    const current = JSON.parse(storage.getItem(KEY) || '{}');
    current[event] = Math.min(10000, Number(current[event] || 0) + 1);
    storage.setItem(KEY, JSON.stringify(current));
  } catch { /* local storage is optional */ }
}

export function saveScenario(storage, scenario) {
  if (!storage) return false;
  try {
    storage.setItem(SCENARIO_KEY, JSON.stringify({
      seats: Number(scenario.seats),
      activeUsers: Number(scenario.activeUsers),
      price: Number(scenario.price),
      months: Number(scenario.months),
      overageRate: Number(scenario.overageRate),
    }));
    return true;
  } catch { return false; }
}

export function loadScenario(storage) {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(SCENARIO_KEY) || 'null');
    if (!value || Object.values(value).some(number => typeof number !== 'number' || !Number.isFinite(number))) return null;
    return value;
  } catch { return null; }
}
