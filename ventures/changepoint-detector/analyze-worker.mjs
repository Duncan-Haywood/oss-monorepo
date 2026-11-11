// Runs the page's main analysis off its main thread, so a long series no longer
// freezes the page while it is cut (4.7 to 6.5 s on the 7,980-point tree-ring series in
// one thread). The page (index.html startMain) keeps one of these, terminates it
// when a newer run starts, and runs the same call itself if workers are missing.
// Nothing leaves the browser: the message comes from the page and the answer goes
// back to it.
import { analyzeJob } from './analyze-job.mjs';

self.onmessage = (e) => {
  const { id, job } = e.data;
  self.postMessage({ id, ...analyzeJob(job) });
};
