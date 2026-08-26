const KEY = "translator-project-quote:usage";
const OPT_OUT = "translator-project-quote:opt-out";
function storage() { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } }
function blocked() { try { return navigator?.doNotTrack === "1" || navigator?.globalPrivacyControl === true; } catch { return false; } }
export function enabled() { const s = storage(); return Boolean(s && !blocked() && s.getItem(OPT_OUT) !== "1"); }
export function setEnabled(value) { const s = storage(); if (!s) return; if (value) s.removeItem(OPT_OUT); else s.setItem(OPT_OUT, "1"); }
export function record(event) { const s = storage(); if (!s || !enabled()) return; try { const day = new Date().toISOString().slice(0, 10); const counts = JSON.parse(s.getItem(KEY) || "{}"); const key = `${event}:${day}`; counts[key] = (counts[key] || 0) + 1; s.setItem(KEY, JSON.stringify(counts)); } catch { /* best effort */ } }
