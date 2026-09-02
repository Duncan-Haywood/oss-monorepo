const KEY = 'saas-seat-true-up:usage';
const OPT_OUT = 'saas-seat-true-up:opt-out';
const SCENARIO_KEY = 'saas-seat-true-up:scenario';
const SCENARIO_FIELDS = ['purchased', 'used', 'price', 'months', 'overageRate', 'seatMinimum'];

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function usageAllowed() {
  if (typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || navigator.globalPrivacyControl)) {
    return false;
  }
  const ls = storage();
  if (!ls) return false;
  // recordEvent() (and the #disable click handler) call this with no
  // try/catch of their own -- a blocked getItem must not throw out of here.
  try {
    return ls.getItem(OPT_OUT) !== 'true';
  } catch {
    return false;
  }
}

export function recordEvent(eventName) {
  if (!usageAllowed()) return;
  try {
    const ls = storage();
    if (!ls) return;
    const current = JSON.parse(ls.getItem(KEY) || '{}');
    current[eventName] = (current[eventName] || 0) + 1;
    ls.setItem(KEY, JSON.stringify(current));
  } catch { /* Private browsing must not break the calculator. */ }
}

export function disableUsage() {
  try {
    const ls = storage();
    if (!ls) return;
    ls.setItem(OPT_OUT, 'true');
    ls.removeItem(KEY);
  } catch { /* optional measurement */ }
}

export function saveScenario(store, scenario) {
  const ls = store || storage();
  if (!ls) return false;
  try {
    const value = {};
    for (const field of SCENARIO_FIELDS) {
      const number = Number(scenario?.[field]);
      if (!Number.isFinite(number) || number < 0) return false;
      value[field] = number;
    }
    ls.setItem(SCENARIO_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadScenario(store) {
  const ls = store || storage();
  if (!ls) return null;
  try {
    const value = JSON.parse(ls.getItem(SCENARIO_KEY) || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (['purchased', 'used', 'price', 'months'].some((field) => typeof value[field] !== 'number' || !Number.isFinite(value[field]) || value[field] < 0)) {
      return null;
    }
    if (value.overageRate == null) value.overageRate = 0;
    if (typeof value.overageRate !== 'number' || !Number.isFinite(value.overageRate) || value.overageRate < 0) {
      return null;
    }
    if (value.seatMinimum == null) value.seatMinimum = 0;
    if (typeof value.seatMinimum !== 'number' || !Number.isFinite(value.seatMinimum) || value.seatMinimum < 0) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function clearScenario(store) {
  const ls = store || storage();
  if (!ls) return;
  try {
    ls.removeItem(SCENARIO_KEY);
  } catch { /* optional persistence */ }
}
