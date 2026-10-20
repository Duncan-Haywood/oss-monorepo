// Module worker for the "Train the models yourself" panel: loads the gzipped NSFG extract,
// runs the five-fold person-held-out comparison and refits the chosen models on every
// marriage, posting progress as it goes. The page cancels a run by terminating the worker.
import * as F from './fit.js';

const COST = { constant: 0.05, duration_only: 1, additive_spline: 2.5, tree_depth4: 0.6, gradient_boosting: 30 };

async function loadExtract() {
  const res = await fetch(new URL('nsfg_pooled_women.json.gz', import.meta.url));
  if (!res.ok) throw new Error(`could not load the data (HTTP ${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let text;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot decompress gzip (DecompressionStream is missing); try a current Chrome, Edge, Firefox or Safari');
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buf);   // a server already removed the gzip layer
  }
  return JSON.parse(text);
}

function defaults(D) {
  const num = D.numNames.map((n) => {
    const v = Array.from(D.num[n]).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  });
  const cat = D.catNames.map((n) => {
    const counts = new Float64Array(D.levels[n].length);
    for (let i = 0; i < D.n; i++) counts[D.cat[n][i]] += D.weight[i];
    return counts.indexOf(Math.max(...counts));
  });
  return { num, cat };
}

self.onmessage = async (ev) => {
  const { kinds, boostingIters = 250, finalFit = true } = ev.data;
  try {
    const t0 = performance.now();
    self.postMessage({ type: 'status', text: 'Downloading and unpacking the survey extract…' });
    const doc = await loadExtract();
    const D = F.decode(doc);
    const R = F.intervals(D);
    self.postMessage({ type: 'loaded', n: D.n, events: doc.events, intervals: R.n, seconds: (performance.now() - t0) / 1000,
      numNames: D.numNames, catNames: D.catNames, levels: D.levels, defaults: defaults(D), licence: doc.licence });
    const opts = { boosting: { iters: boostingIters } };
    const cost = (k) => COST[k] * (k === 'gradient_boosting' ? boostingIters / 250 : 1);
    const perFold = kinds.reduce((s, k) => s + cost(k), 0);
    const total = perFold * (5 + (finalFit ? 1.25 : 0));
    let done = 0, last = 0;
    const tick = (frac, label) => {
      const now = performance.now();
      if (now - last < 100 && frac < 1) return;
      last = now;
      self.postMessage({ type: 'progress', value: Math.min(frac, 1), label });
    };
    const results = F.crossValidate(D, R, kinds, opts, (p) => {
      const label = `Held-out fold ${p.fold + 1} of 5: ${F.MODEL_LABELS[p.kind]}`;
      if (p.phase === 'done') { done += cost(p.kind); tick(done / total, label); }
      else if (p.phase === 'iter' && p.kind === 'gradient_boosting') tick((done + cost(p.kind) * (p.it + 1) / p.of) / total, `${label}, tree ${p.it + 1} of ${p.of}`);
      else tick(done / total, label);
    });
    self.postMessage({ type: 'cv', results, seconds: (performance.now() - t0) / 1000 });
    const models = {};
    if (finalFit) {
      const all = Int32Array.from({ length: R.n }, (_, r) => r);
      for (const k of kinds) {
        const label = `Refitting on all ${D.n.toLocaleString('en-US')} marriages: ${F.MODEL_LABELS[k]}`;
        tick(done / total, label);
        models[k] = F.fitKind(k, D, R, all, opts, (it, of) => {
          if (k === 'gradient_boosting') tick((done + 1.25 * cost(k) * (it + 1) / of) / total, `${label}, tree ${it + 1} of ${of}`);
        });
        done += 1.25 * cost(k);
      }
    }
    self.postMessage({ type: 'done', models, seconds: (performance.now() - t0) / 1000 });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
