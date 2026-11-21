// Runs buildPractices off the page's main thread so a big league does not freeze the tab.
import { buildPractices } from "./practice.mjs";

self.onmessage = (e) => {
  const { windows, teams, opts } = e.data;
  try { self.postMessage({ result: buildPractices(windows, teams, opts) }); }
  catch (err) { self.postMessage({ error: String(err && err.message || err) }); }
};
