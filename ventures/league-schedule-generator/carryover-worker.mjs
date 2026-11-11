// Runs carry-over searches off the page thread: one search for 20 teams takes a few seconds, and
// the page should keep scrolling and typing meanwhile.
//
// Pool mode (the page): In { n, double, seed, indices }, the try numbers this worker owns
// (splitCarryOverTries). Out: { type: "try", i, candidate, result } per try (result is the whole
// carryOverTry output, rounds included, for combineCarryOverTries on the page), then
// { type: "done" }, or { type: "error", error }.
//
// Whole-search mode (older pages, kept for cached copies): In { n, double, seed, tries, pick }.
// Out: { type: "try", i, tries, candidate } per search, then { type: "done", rounds, summary }.
import { bestCarryOverRounds, carryOverSummary, carryOverTry } from "./carryover.mjs";
self.onmessage = (e) => {
  const { n, double, seed, tries, pick, indices } = e.data || {};
  try {
    if (Array.isArray(indices)) {
      for (const i of indices) {
        const result = carryOverTry(n, i, { double: Boolean(double), seed });
        self.postMessage({ type: "try", i, candidate: { coe: result.coe, breaks: result.breaks, breakWeight: result.breakWeight }, result });
      }
      self.postMessage({ type: "done" });
      return;
    }
    const best = bestCarryOverRounds(n, { double: Boolean(double), seed, tries, pick, onTry: (i, candidate) => self.postMessage({ type: "try", i, tries, candidate }) });
    self.postMessage({ type: "done", rounds: best.rounds, summary: carryOverSummary(best) });
  } catch (err) {
    self.postMessage({ type: "error", error: err.message });
  }
};
