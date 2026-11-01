// @ts-check
// Anonymous, browser-local usage counting. Nothing leaves the device: these are
// counters in localStorage that the visitor can switch off, not analytics events.
//
// The events separate what tells us whether the tool is doing its job: designs
// built ('builds'), edits made by dragging rather than typing ('drags'), a
// second design started to compare ('designs'), and the outputs a builder
// takes away ('plans-printed', 'dxf-downloads', 'svg-downloads',
// 'csv-downloads', 'links-copied'), and whether anyone looks at where the
// structure's capacity goes ('utilisation-opened'), and how many 3D pictures are saved ('pictures-saved').
export const EVENTS = ['builds', 'drags', 'designs', 'details', 'compares', 'plans-printed', 'dxf-downloads', 'svg-downloads', 'csv-downloads', 'links-copied', 'options-priced', 'hoa-packets', 'utilisation-opened', 'pictures-saved', 'swaps'];

const PREFIX = 'shed-designer-';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || /** @type {any} */ (globalThis.navigator)?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/** @param {Storage | null | undefined} storage @param {boolean} optOut @param {string} event */
export function recordUsage(storage, optOut, event = 'builds') {
  if (optOut || !storage || honorsBrowserSignal() || !EVENTS.includes(event)) return;
  const key = PREFIX + event;
  try { storage.setItem(key, String(Number(storage.getItem(key) || 0) + 1)); } catch { /* private browsing can deny storage */ }
}

/** @param {Storage | null | undefined} storage @param {string} event */
export function readUsage(storage, event) {
  if (!storage) return 0;
  try { return Number(storage.getItem(PREFIX + event) || 0); } catch { return 0; }
}

/** Ticking "do not count" removes the counts already kept, not just future ones. @param {Storage | null | undefined} storage */
export function clearUsage(storage) {
  if (!storage) return;
  for (const e of EVENTS) {
    try { storage.removeItem(PREFIX + e); } catch { /* nothing to clear */ }
  }
}
