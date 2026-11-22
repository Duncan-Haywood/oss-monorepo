// Runs checkRound off the page's main thread: re-pairing a 275-player round takes about a second, and
// the search for a result entered late re-pairs it once per candidate game.
import { parseTrf } from "./trf.mjs";
import { checkRound } from "./round-check.mjs";

self.onmessage = (e) => {
  const { text, round } = e.data;
  try {
    const trf = parseTrf(text);
    const out = checkRound(trf, round, { onProgress: (done, of) => self.postMessage({ progress: [done, of] }) });
    self.postMessage({ result: { ...out, scores: out.scores ? [...out.scores] : null } });
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err) });
  }
};
