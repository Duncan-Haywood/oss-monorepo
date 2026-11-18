// Runs carry-over searches off the page thread: one search for 20 teams takes a few seconds, and
// the page should keep scrolling and typing meanwhile.
//
// Pool mode (the page): In { n, double, seed, indices, weighted }, the try numbers this worker owns
// (splitCarryOverTries); tries numbered `weighted` and up are capped ones (carryOverTry). An older
// page sends no `weighted`, so every try is weighted, as before. Out: { type: "try", i, candidate, result } per try (result is the whole
// carryOverTry output, rounds included, for combineCarryOverTries on the page), then
// { type: "done" }, or { type: "error", error }.
//
// Squeeze mode (either kind of season, after the pool): In { squeeze: count, n, seed, results } (every
// try's result, by index). Out: { type: "try", i, candidate, result } per squeezed season
// (carryOverSqueeze, numbered after the tries), then, when `polish` is set, one per polished season
// (carryOverPolish, numbered after the squeezes), then, when `floorPriced` is set, one per
// floor-priced season (carryOverFloorPriced, single round robins, numbered after those), then
// { type: "done" }.
//
// Whole-search mode (older pages, kept for cached copies): In { n, double, seed, tries, capped, pick }.
// Out: { type: "try", i, tries, candidate } per search, then { type: "done", rounds, summary }.
import { bestCarryOverRounds, carryOverSummary, carryOverTry, carryOverSqueeze, carryOverPolish, carryOverFloorPriced, carryOverPure } from "./carryover.mjs";
self.onmessage = (e) => {
  const { n, double, seed, tries, capped, pick, indices, weighted, squeeze, polish, floorPriced, pure, results } = e.data || {};
  try {
    if (Number.isInteger(squeeze) && Array.isArray(results)) {
      const all = [...results].sort((a, b) => a.index - b.index);
      for (let j = 0; j < squeeze; j++) {
        const result = carryOverSqueeze(n, all, { seed });
        if (!result) break;
        all.push(result);
        self.postMessage({ type: "try", i: result.index, candidate: { coe: result.coe, breaks: result.breaks, breakWeight: null, maxBreaks: result.maxBreaks }, result });
      }
      if (Number.isInteger(polish) && polish > 0) for (const result of carryOverPolish(n, all, { seed, count: polish })) {
        all.push(result);
        self.postMessage({ type: "try", i: result.index, candidate: { coe: result.coe, breaks: result.breaks, breakWeight: null, maxBreaks: null }, result });
      }
      if (Number.isInteger(floorPriced) && floorPriced > 0) for (const result of carryOverFloorPriced(n, all, { seed, count: floorPriced })) {
        all.push(result);
        self.postMessage({ type: "try", i: result.index, candidate: { coe: result.coe, breaks: result.breaks, breakWeight: null, maxBreaks: result.maxBreaks }, result });
      }
      if (pure) for (const result of carryOverPure(n, all, { seed })) {
        self.postMessage({ type: "try", i: result.index, candidate: { coe: result.coe, breaks: result.breaks, breakWeight: 0, maxBreaks: null }, result });
      }
      self.postMessage({ type: "done" });
      return;
    }
    if (Array.isArray(indices)) {
      for (const i of indices) {
        const result = carryOverTry(n, i, { double: Boolean(double), seed, weighted: Number.isInteger(weighted) ? weighted : Infinity });
        self.postMessage({ type: "try", i, candidate: { coe: result.coe, breaks: result.breaks, breakWeight: result.breakWeight, maxBreaks: result.maxBreaks ?? null }, result });
      }
      self.postMessage({ type: "done" });
      return;
    }
    const best = bestCarryOverRounds(n, { double: Boolean(double), seed, tries, capped: Number.isInteger(capped) ? capped : 0, pick, onTry: (i, candidate) => self.postMessage({ type: "try", i, tries, candidate }) });
    self.postMessage({ type: "done", rounds: best.rounds, summary: carryOverSummary(best) });
  } catch (err) {
    self.postMessage({ type: "error", error: err.message });
  }
};
