// Runs the fit off the page's main thread, so the page stays responsive
// while every kernel is tried. Same engine, same result as calling analyze().
import { analyze } from "./engine.mjs";

self.onmessage = (event) => {
  let result;
  try {
    result = analyze(event.data);
  } catch (e) {
    result = { error: `The fit failed: ${e.message}` };
  }
  self.postMessage(result);
};
