// Runs the matrix profile off the page's main thread so the tab stays
// responsive on long series. The page falls back to the main thread when
// module workers are unavailable (for example when opened from file://).
import { analyze } from "./engine.mjs";

self.onmessage = (event) => {
  const { id, input } = event.data || {};
  let result;
  try {
    result = analyze(input);
  } catch (err) {
    result = { error: String((err && err.message) || err) };
  }
  self.postMessage({ id, result });
};
