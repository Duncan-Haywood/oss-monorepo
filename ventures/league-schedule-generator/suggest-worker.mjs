// Runs suggestFairnessWeight off the page thread (about 20 s of search on the example league).
import { suggestFairnessWeight } from "./divisions.mjs";
self.onmessage = (e) => {
  try { self.postMessage({ ok: true, result: suggestFairnessWeight(e.data) }); } catch (err) { self.postMessage({ ok: false, error: err.message }); }
};
