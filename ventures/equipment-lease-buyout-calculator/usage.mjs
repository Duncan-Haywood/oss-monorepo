// Local-first usage counting and scenario persistence.
//
// Two rules from portfolio/usage/README.md decide everything here: count
// events, never people; and nothing leaves the browser. There is no network
// call in this file and no identifier of any kind -- the counter is a plain
// object of event-name -> integer in this browser's localStorage, readable
// and deletable by the person it belongs to.
//
// Lease terms and replacement costs are commercially sensitive, which is why
// the saved comparison is local too and why there is no upload path to add
// later.

const KEY = 'equipment-lease-buyout-calculator:usage';
const OPT_OUT = 'equipment-lease-buyout-calculator:opt-out';
const SCENARIO_KEY = 'equipment-lease-buyout-calculator:scenario';

export const SCENARIO_FIELDS = [
  'buyoutPrice',
  'fairMarketValue',
  'usefulLifeMonths',
  'replacementCost',
  'replacementLifeMonths',
  'removalCost',
  'downtimeDays',
  'dailyDowntimeCost',
];

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function usageAllowed() {
  if (
    typeof navigator !== 'undefined' &&
    (navigator.doNotTrack === '1' || navigator.globalPrivacyControl)
  ) {
    return false;
  }
  const ls = storage();
  if (!ls) return false;
  // recordEvent() and the #disable click handler call this with no try/catch
  // of their own -- a blocked getItem must not throw out of here.
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
  } catch {
    /* Private browsing must not break the calculator. */
  }
}

export function disableUsage() {
  try {
    const ls = storage();
    if (!ls) return;
    ls.setItem(OPT_OUT, 'true');
    ls.removeItem(KEY);
  } catch {
    /* optional measurement */
  }
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
    // Every field is rejected rather than defaulted: a partially restored
    // scenario would silently mix this lease's buyout price with a previous
    // replacement estimate, and the result would look ordinary.
    for (const field of SCENARIO_FIELDS) {
      const number = value[field];
      if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) return null;
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
  } catch {
    /* optional persistence */
  }
}
