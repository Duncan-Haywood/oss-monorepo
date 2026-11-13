// Builds a roster off the page's main thread. The exact check (column generation, then branch-and-price) can run for
// seconds on a big week, and on a phone that froze the page: no scrolling, no typing, no way to stop it. index.html
// posts { id, staff, slots, options } here and gets back { id, staff, slots, roster } in ONE message, so the roster
// and the staff and shift objects it refers to arrive as one cloned graph (structured clone keeps shared references
// inside a message). The page then uses those copies, never its own, alongside the roster.
// The multi-week planner ("Plan several weeks") posts { id, kind: "plan", staffText, shiftsText, options } and gets
// { id, progress: { done, of } } after each week, then { id, kind: "plan", plan } with the whole plan.
// Same code as the CLI and the tests: this file only moves buildRoster and planWeeks to another thread. Nothing leaves
// the browser.
// A build with options.steady (2026-11-13) runs steadyRoster instead: the tied best rosters, the one a single call-out
// hurts least is posted, and { id, progress: { stage, ... } } messages report how far the check has got.
import { buildRoster, planWeeks, steadyRoster } from "./calc.mjs";

export function handle({ id, staff, slots, options }, post = () => {}) {
  let roster;
  try {
    const { steady, ...o } = options || {};
    roster = steady ? steadyRoster(staff, slots, o, { onProgress: (p) => post({ id, progress: p }) }) : buildRoster(staff, slots, o);
  } catch (err) {
    roster = { error: "The roster could not be built: " + (err && err.message ? err.message : String(err)) };
  }
  return { id, staff, slots, roster };
}

// `post` receives each progress message; the return value is the final message.
export function handlePlan({ id, staffText, shiftsText, options }, post = () => {}) {
  let plan;
  try {
    plan = planWeeks(staffText, shiftsText, { ...(options || {}), onWeek: (done, of) => post({ id, progress: { done, of } }) });
  } catch (err) {
    plan = { error: "The weeks could not be planned: " + (err && err.message ? err.message : String(err)) };
  }
  return { id, kind: "plan", plan };
}

// Only inside a dedicated worker: under node's test runner, or if a page imported this file, nothing is wired up.
if (typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => self.postMessage(e.data && e.data.kind === "plan" ? handlePlan(e.data, (m) => self.postMessage(m)) : handle(e.data, (m) => self.postMessage(m)));
}
