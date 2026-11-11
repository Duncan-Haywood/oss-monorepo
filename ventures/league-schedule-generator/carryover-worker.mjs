// Runs the best-of-k carry-over search (bestCarryOverRounds) off the page thread: four searches
// for 20 teams take several seconds, and the page should keep scrolling and typing meanwhile.
// In: { n, double, seed, tries, pick }. Out: { type: "try", i, tries, candidate } per search, then
// { type: "done", rounds, summary } or { type: "error", error }.
import { bestCarryOverRounds, carryOverSummary } from "./carryover.mjs";
self.onmessage = (e) => {
  const { n, double, seed, tries, pick } = e.data || {};
  try {
    const best = bestCarryOverRounds(n, { double: Boolean(double), seed, tries, pick, onTry: (i, candidate) => self.postMessage({ type: "try", i, tries, candidate }) });
    self.postMessage({ type: "done", rounds: best.rounds, summary: carryOverSummary(best) });
  } catch (err) {
    self.postMessage({ type: "error", error: err.message });
  }
};
