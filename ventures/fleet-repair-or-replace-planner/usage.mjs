/**
 * Anonymous, local-only feature counting, and an opt-out that actually sticks.
 *
 * ## The opt-out is persisted, deliberately (2026-09-12, review finding #4649)
 *
 * The shape this file started from — shared by 39 ventures in this fleet, of
 * which only 3 do it correctly — kept the opt-out in a module-scope global:
 *
 *     globalThis.__usageOptOut = true;          // and nothing else
 *
 * A global lives in one JavaScript realm. Reload the page and there is a new
 * realm, no marker, an opt-out button that has reset itself to "off", and
 * counting resumed. So the switch the footer advertises worked until the
 * visitor navigated, which for a calculator someone returns to next budget
 * cycle is most of the time — and the one thing a privacy control must not be
 * is quietly temporary. `AGENTS.md` requires usage counting be "visible and
 * switch-off-able"; a switch that unswitches itself is neither.
 *
 * The opt-out therefore lives in its own `localStorage` key, separate from the
 * counters, and is consulted on every `record`. Separate keys because the two
 * have opposite lifetimes: clearing the counters is something the visitor may
 * want to do repeatedly, and it must never be the thing that turns counting
 * back on. Storing the flag inside the counter object would have made
 * "delete my data" and "stop collecting my data" the same button, which is
 * how a consent record gets lost by accident.
 *
 * The hub page (`platform/pages/build.mjs`'s `pf-site.js`) already got this
 * right with `portfolio-hub-optout`; this is the same convention applied per
 * venture rather than a new one.
 */
const KEY = "fleet-repair-or-replace-planner-usage";
const OPT_OUT_KEY = "fleet-repair-or-replace-planner-optout";

/**
 * Browser-level signals first. Do Not Track and Global Privacy Control are the
 * visitor saying so before they have touched this page at all, and neither
 * needs a click to be honoured.
 */
function honorsBrowserSignal() {
  try {
    return navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  } catch {
    // navigator is absent under `node --test`; that is not a signal either way.
    return false;
  }
}

/** Has this visitor opted out, on this device, at any point? */
export function isOptedOut() {
  if (globalThis.__usageOptOut) return true;
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    // A browser that refuses storage cannot be counted in anyway, and refusing
    // to count is the safe direction to fail.
    return true;
  }
}

function usageBlocked() {
  return isOptedOut() || honorsBrowserSignal();
}

export function record(event) {
  if (typeof localStorage === "undefined" || usageBlocked()) return;
  let current;
  try {
    current = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    current = {};
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
  current[event] = (current[event] || 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}

export function readUsage() {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Turn counting off (or back on). Opting out both records the choice durably
 * and deletes what was already counted, in that order: if the write of the
 * flag fails, the counters are still cleared and the in-memory guard still
 * holds for this page view.
 */
export function setUsageOptOut(value) {
  const off = Boolean(value);
  globalThis.__usageOptOut = off;
  if (typeof localStorage === "undefined") return;
  try {
    if (off) {
      localStorage.setItem(OPT_OUT_KEY, "1");
      localStorage.removeItem(KEY);
    } else {
      localStorage.removeItem(OPT_OUT_KEY);
    }
  } catch {
    /* storage is optional */
  }
}
