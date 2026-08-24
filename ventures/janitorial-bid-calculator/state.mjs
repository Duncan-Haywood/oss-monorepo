// Best-effort local persistence for a contractor's current bid setup. The
// payload never leaves the browser and is separate from usage events.
export const BID_STATE_KEY = 'janitorial-bid-state';

export function loadBidState(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const state = JSON.parse(storage.getItem(BID_STATE_KEY) || 'null');
    if (!state || !Array.isArray(state.areas) || !state.costs || typeof state.costs !== 'object') return null;
    return state;
  } catch {
    return null;
  }
}

export function saveBidState(storage = globalThis.localStorage, state) {
  if (!storage || !state || !Array.isArray(state.areas) || !state.costs) return false;
  try {
    storage.setItem(BID_STATE_KEY, JSON.stringify({ areas: state.areas, costs: state.costs, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearBidState(storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.removeItem(BID_STATE_KEY);
    return true;
  } catch {
    return false;
  }
}
