const STORAGE_KEY = "rc-time-calculator:usage-events";
const OPT_OUT_KEY = "rc-time-calculator:usage-opt-out";
function storage() { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } }
function enabled() { const s = storage(); return s && s.getItem(OPT_OUT_KEY) !== "1" && navigator?.doNotTrack !== "1" && navigator?.globalPrivacyControl !== true; }
export function setUsageCountingEnabled(value) { const s = storage(); if (!s) return; try { value ? s.removeItem(OPT_OUT_KEY) : s.setItem(OPT_OUT_KEY, "1"); } catch {} }
export function recordEvent(name) { const s = storage(); if (!enabled()) return; try { const day = new Date().toISOString().slice(0, 10); const events = JSON.parse(s.getItem(STORAGE_KEY) || "{}"); events[`${name}:${day}`] = (events[`${name}:${day}`] || 0) + 1; s.setItem(STORAGE_KEY, JSON.stringify(events)); } catch {} }
export function readLocalUsage() { const s = storage(); if (!s) return {}; try { return JSON.parse(s.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
