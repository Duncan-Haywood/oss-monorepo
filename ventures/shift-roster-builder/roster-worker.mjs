// Builds a roster off the page's main thread. The exact check (column generation, then branch-and-price) can run for
// seconds on a big week, and on a phone that froze the page: no scrolling, no typing, no way to stop it. index.html
// posts { id, staff, slots, options } here and gets back { id, staff, slots, roster } in ONE message, so the roster
// and the staff and shift objects it refers to arrive as one cloned graph (structured clone keeps shared references
// inside a message). The page then uses those copies, never its own, alongside the roster.
// Same code as the CLI and the tests: this file only moves buildRoster to another thread. Nothing leaves the browser.
import { buildRoster } from "./calc.mjs";

export function handle({ id, staff, slots, options }) {
  let roster;
  try {
    roster = buildRoster(staff, slots, options || {});
  } catch (err) {
    roster = { error: "The roster could not be built: " + (err && err.message ? err.message : String(err)) };
  }
  return { id, staff, slots, roster };
}

// Only inside a dedicated worker: under node's test runner, or if a page imported this file, nothing is wired up.
if (typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => self.postMessage(handle(e.data));
}
