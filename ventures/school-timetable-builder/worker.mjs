// Runs the solver off the main thread so the page stays responsive.
import { parseSchool, solve, validate } from "./timetable.mjs";

self.onmessage = (e) => {
  const { text, seed, initial, iterations, temperature } = e.data;
  const { problem, errors } = parseSchool(text);
  if (!problem) {
    self.postMessage({ type: "error", errors });
    return;
  }
  let last = 0;
  const result = solve(problem, {
    seed,
    initial,
    iterations,
    temperature,
    onProgress(f, best) {
      const now = Date.now();
      if (now - last > 100) {
        last = now;
        self.postMessage({ type: "progress", fraction: f, best });
      }
    },
  });
  const check = validate(problem, result.units, result.placements);
  self.postMessage({ type: "done", placements: result.placements, hard: result.hard, soft: result.soft, check });
};
