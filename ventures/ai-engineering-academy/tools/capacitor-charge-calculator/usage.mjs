const STORAGE_KEY = "capacitor-charge-calculator:usage-events";
const OPT_OUT_KEY = "capacitor-charge-calculator:usage-opt-out";
const storageAvailable = () => { try { return typeof localStorage !== "undefined"; } catch { return false; } };
export function isUsageCountingEnabled() { try { return storageAvailable() && navigator?.doNotTrack !== "1" && navigator?.globalPrivacyControl !== true && localStorage.getItem(OPT_OUT_KEY) !== "1"; } catch { return false; } }
// The argument is the desired state, not the current state.
export function setUsageCountingEnabled(enabled) { if (!storageAvailable()) return; try { enabled ? localStorage.removeItem(OPT_OUT_KEY) : localStorage.setItem(OPT_OUT_KEY, "1"); } catch {} }
export function recordEvent(name) { if (!isUsageCountingEnabled()) return; try { const day = new Date().toISOString().slice(0, 10); const events = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); events[`${name}:${day}`] = (events[`${name}:${day}`] || 0) + 1; localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch {} }
