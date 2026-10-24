// Module worker for the "Train the models yourself" panel: loads the gzipped NSFG extract and
// runs training tasks (one held-out fold, one refit on every marriage, or the final metrics).
// The page runs several of these in parallel and cancels a run by terminating them.
import * as F from './fit.js';

const COST = F.MODEL_COST;

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

// Each worker loads the extract once and then runs tasks the page sends it, so several
// workers can train the five folds at the same time:
//   {cmd: 'fold', id, fold, kinds, boostingIters}  -> {type: 'fold', id, result}
//   {cmd: 'final', id, kind, boostingIters}        -> {type: 'final', id, kind, model}
//   {cmd: 'summarize', id, kinds, folds}           -> {type: 'cv', id, results}
// and {type: 'progress', id, frac, label} while a task runs.
let data = null;
async function load() {
  if (!data) {
    data = (async () => {
      const t0 = performance.now();
      const doc = await loadExtract();
      const D = F.decode(doc);
      const R = F.intervals(D);
      const meta = { type: 'loaded', n: D.n, events: doc.events, intervals: R.n, seconds: (performance.now() - t0) / 1000,
        numNames: D.numNames, catNames: D.catNames, levels: D.levels, defaults: defaults(D), licence: doc.licence };
      return { D, R, meta };
    })();
  }
  return data;
}

// Every model in a fold shares the fold's rows and people arrays, so list each buffer once.
function transferables(result) {
  const out = new Set();
  for (const k of Object.keys(result)) for (const a of ['rows', 'pred', 'people', 'score10']) out.add(result[k][a].buffer);
  return [...out];
}

let queue = Promise.resolve();
self.onmessage = (ev) => { queue = queue.then(() => run(ev.data)); };

async function run(msg) {
  const { cmd, id } = msg;
  try {
    const { D, R, meta } = await load();
    if (cmd === 'load') { self.postMessage({ ...meta, id }); return; }
    const opts = { boosting: { iters: msg.boostingIters ?? 250 } };
    let last = 0;
    const tick = (frac, label) => {
      const now = performance.now();
      if (now - last < 150 && frac < 1) return;
      last = now;
      self.postMessage({ type: 'progress', id, frac: Math.min(frac, 1), label });
    };
    if (cmd === 'fold') {
      const cost = (k) => COST[k] * (k === 'gradient_boosting' ? opts.boosting.iters / 250 : 1);
      const total = msg.kinds.reduce((s, k) => s + cost(k), 0);
      let done = 0;
      const result = F.foldPredictions(D, R, msg.kinds, msg.fold, opts, (p) => {
        const label = `fold ${p.fold + 1}: ${F.MODEL_LABELS[p.kind]}`;
        if (p.phase === 'done') { done += cost(p.kind); tick(done / total, label); }
        else if (p.phase === 'iter' && p.kind === 'gradient_boosting') tick((done + cost(p.kind) * (p.it + 1) / p.of) / total, `${label}, tree ${p.it + 1}/${p.of}`);
        else tick(done / total, label);
      });
      self.postMessage({ type: 'fold', id, fold: msg.fold, result }, transferables(result));
    } else if (cmd === 'final') {
      const all = Int32Array.from({ length: R.n }, (_, r) => r);
      const label = `all ${D.n.toLocaleString('en-US')} marriages: ${F.MODEL_LABELS[msg.kind]}`;
      tick(0, label);
      const model = F.fitKind(msg.kind, D, R, all, opts, (it, of) => {
        if (msg.kind === 'gradient_boosting') tick((it + 1) / of, `${label}, tree ${it + 1}/${of}`);
      });
      self.postMessage({ type: 'final', id, kind: msg.kind, model });
    } else if (cmd === 'summarize') {
      self.postMessage({ type: 'cv', id, results: F.summarize(D, R, msg.kinds, F.mergeFolds(D, R, msg.kinds, msg.folds)) });
    } else {
      throw new Error(`unknown command ${cmd}`);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message ? err.message : err) });
  }
}
