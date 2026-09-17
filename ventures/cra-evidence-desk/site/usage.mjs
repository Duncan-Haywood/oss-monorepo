// Local-first, aggregate-only usage counting, per portfolio/usage/README.md:
// count events, never people. No IDs, no IPs, no component names, no advisory
// ids, no filenames — just an event name and a day, kept in this browser's own
// localStorage. Nothing is sent anywhere; there is no server for it to go to.
// Off-switchable, and honors Do Not Track / Global Privacy Control
// automatically.
//
// The restraint matters more here than on a calculator. An SBOM is a complete
// map of a product's dependencies and the advisories it matches are a map of
// that product's exposure, so the one thing this file must never do is record
// *what* was checked. It records only that a check happened.
//
// `sbom_matched` is the activation event rather than a page view: running the
// match is the thing this tool exists to do, and a visitor who opens the page
// and leaves has not done it. The export events say the dated record was worth
// keeping, which is the outcome a vendor actually takes to their reviewer.

const STORAGE_KEY = "cra-evidence-desk:usage-events";
const OPT_OUT_KEY = "cra-evidence-desk:usage-opt-out";

function hasStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function honorsBrowserSignal() {
  try {
    return navigator?.doNotTrack === "1" || navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function isUsageCountingEnabled() {
  if (!hasStorage()) return false;
  if (honorsBrowserSignal()) return false;
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== "1";
  } catch {
    return false;
  }
}

export function setUsageCountingEnabled(enabled) {
  if (!hasStorage()) return;
  try {
    if (enabled) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, "1");
  } catch {
    // storage unavailable (private mode, quota) — nothing to do
  }
}

/** Records that `eventName` happened today. Aggregate count only; no payload beyond the event name and the day. */
export function recordEvent(eventName) {
  if (!isUsageCountingEnabled()) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(STORAGE_KEY);
    const events = raw ? JSON.parse(raw) : {};
    const key = `${eventName}:${day}`;
    events[key] = (events[key] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // storage unavailable — counting is best-effort only
  }
}

/** Returns the raw local event counts, for the user's own inspection. */
export function readLocalUsage() {
  if (!hasStorage()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
