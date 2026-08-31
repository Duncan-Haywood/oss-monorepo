const KEY = "translator-project-quote:usage";
const OPT_OUT = "translator-project-quote:opt-out";
function storage() { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } }
function blocked() { try { return navigator?.doNotTrack === "1" || navigator?.globalPrivacyControl === true; } catch { return false; } }
// enabled(), setEnabled(), and record() are all called directly from
// click handlers (and once at page load) in index.html with no
// surrounding try/catch there. Blocked storage access (private browsing,
// a SecurityError on getItem/setItem) must never throw out of any of
// these three, or the caller breaks after doing its real work.
export function enabled() { const s = storage(); if (!s || blocked()) return false; try { return s.getItem(OPT_OUT) !== "1"; } catch { return false; } }
export function setEnabled(value) { const s = storage(); if (!s) return; try { if (value) s.removeItem(OPT_OUT); else s.setItem(OPT_OUT, "1"); } catch { /* best effort */ } }
export function record(event) { const s = storage(); if (!s || !enabled()) return; try { const day = new Date().toISOString().slice(0, 10); const counts = JSON.parse(s.getItem(KEY) || "{}"); const key = `${event}:${day}`; counts[key] = (counts[key] || 0) + 1; s.setItem(KEY, JSON.stringify(counts)); } catch { /* best effort */ } }
