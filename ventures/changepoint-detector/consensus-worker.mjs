// Runs one setting of the agreed-changes panel off the page's main thread.
// The page (index.html) starts one of these per setting, up to the number of
// cores, and merges the results with mergeConsensus. Nothing leaves the
// browser: the message comes from the page and the answer goes back to it.
import { PANEL, runSetting } from './consensus.mjs';

self.onmessage = (e) => {
  const { id, base, setting } = e.data;
  self.postMessage({ id, setting, run: runSetting(base, PANEL[setting]) });
};
