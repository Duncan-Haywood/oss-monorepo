// "Train the models yourself": runs train/worker.js on the NSFG 1995–2023 extract, shows the
// held-out results next to the shipped Python ones, and scores a profile with the models the
// visitor just trained. Self-contained: mounts into <section id="trainPanel"> and touches
// nothing else on the page.
import { KINDS, MODEL_LABELS, MODEL_COST, rates } from './fit.js';

const here = (p) => new URL(p, import.meta.url);
const LABELS = {
  wife_age_at_marriage: 'Wife’s age at the wedding',
  husband_age_at_marriage: 'Husband’s age at the wedding',
  wedding_year: 'Wedding year',
  wife_premarital_sex_years: 'Years the wife was sexually active before the wedding',
  cohabited_first: 'Lived together before marrying',
  husband_married_before: 'Husband married before',
  husband_prior_children: 'Husband has children from before',
  wife_race_ethnicity: 'Wife’s race-ethnicity',
  same_race_ethnicity: 'Husband’s race-ethnicity versus hers',
  wife_intact_family: 'Wife lived with both parents to 18',
  wife_premarital_birth: 'Wife had a birth before the wedding',
  wife_premarital_partners: 'Wife’s sex partners before the wedding',
  wife_ba_by_wedding: 'Wife had a bachelor’s degree by the wedding',
  wife_mother_education: 'Wife’s mother’s education',
  wife_mother_age_first_birth: 'Wife’s mother’s age at her first birth',
  wife_religion_raised: 'Religion the wife was raised in',
  wife_born_outside_us: 'Wife born outside the U.S.',
};
const NUM_LIMITS = {
  wife_age_at_marriage: [15, 45, 0.5], husband_age_at_marriage: [15, 70, 0.5], wedding_year: [1964, 2023, 1],
  wife_premarital_sex_years: [0, 30, 0.5],
};
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? '—' : `${x.toFixed(d)}%`);
const fx = (x, d = 3) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(d));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function shippedResults(bundle, reference) {
  const out = { constant: { gain: 0, c: null, oe: 1 } };
  for (const m of [...(bundle?.models || []), ...(bundle?.extra_models || [])]) {
    if (!m.heldout) continue;
    out[m.key] = { gain: m.heldout.deviance_improvement_percent, c: m.heldout.harrell_c ?? null, oe: m.heldout.observed_expected_ratio };
  }
  const ext = {};
  for (const k of KINDS) {
    const r = reference?.models?.[k];
    if (r) ext[k] = { gain: r.deviance_gain_percent, c: r.harrell_c, oe: r.observed_expected };
  }
  return { shipped: out, extract: ext };
}

export function mount(root) {
  if (!root) return;
  if (!document.querySelector('link[data-train-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = here('train.css'); link.dataset.trainCss = '';
    document.head.appendChild(link);
  }
  root.innerHTML = `
  <h2 id="trainHead">Train the models yourself</h2>
  <p class="sub">Retrain the NSFG 1995–2023 lens from its survey data, here in your browser, with the same person-held-out five-fold test as the Python pipeline. The data are a compact public extract of 29,202 women’s first marriages from eight National Survey of Family Growth cycles (NCHS; U.S. government work, public domain), with inputs fixed at or before the wedding only. The models are fitted by plain JavaScript in a background worker, so the page stays usable. The five held-out folds train in parallel, one per spare core: all five models took 45 seconds on one thread of a 4-core machine and 18 seconds on three or more, and a phone takes longer. You can cancel at any time. Nothing is sent anywhere.</p>
  <fieldset class="train-opts"><legend>Models to train</legend>
    <div class="train-kinds">${KINDS.map((k) => `<label class="check"><input type="checkbox" name="kind" value="${k}" ${k === 'constant' ? 'checked disabled' : 'checked'}> ${esc(MODEL_LABELS[k])}</label>`).join('')}</div>
    <label>Boosting rounds <select name="iters"><option value="250" selected>250 (the Python setting)</option><option value="100">100 (faster, a little less skill)</option><option value="25">25 (quick look)</option></select></label>
    <label class="check"><input type="checkbox" name="final" checked> Then refit on every marriage, to score a profile below</label>
    <label>Parallel threads <select name="threads">${threadOptions()}</select><small>The five held-out folds train at the same time on separate cores. More threads use more memory.</small></label>
  </fieldset>
  <p class="actions"><button type="button" data-act="start">Train in my browser</button> <button type="button" data-act="cancel" disabled>Cancel</button></p>
  <progress value="0" max="1" hidden aria-label="Training progress"></progress>
  <p class="train-status" role="status" aria-live="polite"></p>
  <div class="train-results"></div>
  <div class="train-score"></div>`;
  const $ = (s) => root.querySelector(s);
  const progress = $('progress'), status = $('.train-status'), results = $('.train-results'), scoreBox = $('.train-score');
  const start = $('[data-act=start]'), cancel = $('[data-act=cancel]');
  let meta = null;
  const python = Promise.all([
    fetch(here('../models/nsfg_pooled_first_marriage.json')).then((r) => r.json()).catch(() => null),
    fetch(here('sklearn_reference.json')).then((r) => r.json()).catch(() => null),
  ]).then(([b, r]) => shippedResults(b, r));

  let workers = [];
  const stop = (text) => {
    for (const w of workers) w.terminate();
    workers = [];
    start.disabled = false; cancel.disabled = true;
    progress.hidden = true;
    if (text) status.textContent = text;
  };
  cancel.addEventListener('click', () => stop('Cancelled. Nothing was kept.'));
  start.addEventListener('click', () => {
    const kinds = ['constant', ...[...root.querySelectorAll('input[name=kind]:checked')].map((i) => i.value).filter((k) => k !== 'constant')];
    const boostingIters = Number($('select[name=iters]').value);
    const finalFit = $('input[name=final]').checked;
    const nThreads = Number($('select[name=threads]').value);
    results.innerHTML = ''; scoreBox.innerHTML = '';
    start.disabled = true; cancel.disabled = false;
    progress.hidden = false; progress.value = 0;
    status.textContent = `Starting ${nThreads} background worker${nThreads > 1 ? 's' : ''}…`;
    const cost = (k) => MODEL_COST[k] * (k === 'gradient_boosting' ? boostingIters / 250 : 1);
    // The task queue: the five folds first (so held-out results arrive early), then the refits,
    // biggest first; the metrics jump the queue as soon as every fold is in.
    const tasks = [0, 1, 2, 3, 4].map((fold) => ({ cmd: 'fold', fold, kinds, boostingIters, cost: kinds.reduce((t, k) => t + cost(k), 0) }));
    if (finalFit) kinds.map((kind) => ({ cmd: 'final', kind, boostingIters, cost: 1.25 * cost(kind) })).sort((x, y) => y.cost - x.cost).forEach((t) => tasks.push(t));
    tasks.forEach((t, i) => { t.id = i; t.frac = 0; });
    const totalCost = tasks.reduce((t, x) => t + x.cost, 0);
    const queue = tasks.slice(), folds = [], models = {}, foldModels = {};
    const labels = new Map();
    const t0 = performance.now();
    let cvSeconds = null, pendingCv = false, finished = 0;
    const update = () => {
      const value = tasks.reduce((t, x) => t + x.cost * x.frac, 0) / totalCost;
      progress.value = value;
      const now = [...labels.values()].slice(0, 2).join('; ');
      status.textContent = `${Math.round(100 * value)}% · ${finished} of ${tasks.length} tasks done on ${workers.length} thread${workers.length > 1 ? 's' : ''}${now ? ` · ${now}` : ''} · ${((performance.now() - t0) / 1000).toFixed(0)} s`;
    };
    const dispatch = (w) => {
      const t = queue.shift();
      if (!t) { w.idle = true; return; }
      w.idle = false;
      const { cost: _c, frac: _f, ...msg } = t;
      const transfer = t.cmd === 'summarize' ? [...new Set(t.folds.flatMap((fold) => Object.values(fold).flatMap((r) => [r.rows, r.pred, r.people, r.score10].map((a) => a.buffer))))] : [];
      w.postMessage(msg, transfer);
    };
    const finish = () => {
      if (finished < tasks.length || pendingCv || cvSeconds === null) return;
      const total = ((performance.now() - t0) / 1000).toFixed(0);
      stop(`Done in ${total} s on ${nThreads} thread${nThreads > 1 ? 's' : ''}. Held-out results${finalFit ? ' and a profile scorer for the models you trained' : ''} are below.`);
      if (Object.keys(models).length) renderScorer(scoreBox, meta, models, kinds, foldModels);
    };
    const onMessage = (w) => async (ev) => {
      const m = ev.data;
      if (!workers.length) return;                      // cancelled
      if (m.type === 'error') { stop(`Training stopped: ${m.message}`); return; }
      if (m.type === 'loaded') {
        if (!meta) meta = m;
        status.textContent = `Loaded ${m.n.toLocaleString('en-US')} marriages (${m.events.toLocaleString('en-US')} ended) as ${m.intervals.toLocaleString('en-US')} marriage-years in ${m.seconds.toFixed(1)} s. Training…`;
        return;
      }
      if (m.type === 'progress') {
        tasks[m.id].frac = m.frac; labels.set(m.id, m.label); update();
        return;
      }
      if (m.type === 'fold' || m.type === 'final') {
        tasks[m.id].frac = 1; labels.delete(m.id); finished++;
        if (m.type === 'fold') {
          // keep each fold's models for the profile range; the metrics worker needs only predictions
          for (const k of kinds) { (foldModels[k] ||= []).push(m.result[k].model); delete m.result[k].model; }
          folds.push(m.result);
        }
        else models[m.kind] = m.model;
        if (m.type === 'fold' && folds.length === 5 && !pendingCv) {
          // every fold is in: the next free worker pools and scores them (off the page's thread)
          pendingCv = true;
          queue.unshift({ cmd: 'summarize', id: -1, kinds, folds: folds.splice(0), cost: 0, frac: 0 });
          const idle = workers.find((x) => x.idle);
          if (idle) dispatch(idle);
        }
      }
      if (m.type === 'cv') {
        pendingCv = false;
        cvSeconds = (performance.now() - t0) / 1000;
        renderResults(results, kinds, m.results, await python, cvSeconds, boostingIters, nThreads);
      }
      update();
      dispatch(w);
      finish();
    };
    try {
      for (let i = 0; i < nThreads; i++) {
        const w = new Worker(here('worker.js'), { type: 'module' });
        w.onmessage = onMessage(w);
        w.onerror = (e) => stop(`A worker failed: ${e.message || 'unknown error'}.`);
        workers.push(w);
      }
    } catch (e) {
      stop(`This browser cannot run module workers (${e.message}).`);
      return;
    }
    workers[0].postMessage({ cmd: 'load', id: -2 });
    for (const w of workers) dispatch(w);
  });
}

// Default threads: one per spare core, at most five (one per fold), fewer on low-memory devices.
function threadOptions() {
  const cores = Math.max(1, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2);
  const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  let auto = Math.min(5, Math.max(1, cores - 1));
  if (mem && mem <= 2) auto = 1;
  else if (mem && mem <= 4) auto = Math.min(auto, 3);
  return [1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === auto ? 'selected' : ''}>${n}${n === auto ? ' (suggested for this device)' : ''}</option>`).join('');
}

function renderResults(el, kinds, cv, py, seconds, iters, threads = 1) {
  const rows = kinds.map((k) => {
    const r = cv[k], s = py.shipped[k], x = py.extract[k];
    return `<tr><th scope="row">${esc(MODEL_LABELS[k])}</th>
      <td class="num">${pct(r.deviance_gain_percent, 2)}</td><td class="num">${fx(r.harrell_c)}</td><td class="num">${fx(r.observed_expected, 2)}</td><td class="num">${r.seconds.toFixed(1)} s</td>
      <td class="num">${pct(s?.gain, 2)}</td><td class="num">${fx(s?.c)}</td>
      <td class="num">${pct(x?.gain, 2)}</td></tr>`;
  }).join('');
  const cal = kinds.filter((k) => cv[k].calibration).map((k) => `
    <details><summary>Calibration: ${esc(MODEL_LABELS[k])}</summary>
      <div class="table-wrap"><table><caption class="small">Held-out women in tenths of predicted 10-year risk: observed and predicted dissolutions per 1,000 marriage-years.</caption>
      <thead><tr><th scope="col">Tenth</th><th scope="col" class="num">Observed</th><th scope="col" class="num">Predicted</th></tr></thead>
      <tbody>${cv[k].calibration.map((d) => `<tr><td>${d.decile}</td><td class="num">${(1000 * d.observed).toFixed(1)}</td><td class="num">${(1000 * d.predicted).toFixed(1)}</td></tr>`).join('')}</tbody></table></div>
    </details>`).join('');
  el.innerHTML = `
    <h3>Held-out results: your browser versus Python</h3>
    <div class="table-wrap"><table class="train-table">
      <thead><tr><th scope="col" rowspan="2">Model</th><th scope="colgroup" colspan="4">Trained in your browser</th><th scope="colgroup" colspan="2">Shipped lens (Python)</th><th scope="col" rowspan="2" class="num">scikit-learn on this extract</th></tr>
      <tr><th scope="col" class="num">Deviance gain</th><th scope="col" class="num">C</th><th scope="col" class="num">O/E</th><th scope="col" class="num">CPU time</th><th scope="col" class="num">Deviance gain</th><th scope="col" class="num">C</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="small">Deviance gain: how much better than a constant annual rate the model predicts the 5,800 or so women held out in each fold, pooled over the five folds (Poisson deviance on marriage-years). C: Harrell’s concordance of the 10-year risk score. O/E: observed over predicted dissolutions. Python: scikit-learn 1.7.2 in <code>reproducibility/nsfg_pooled_first_marriage/train_pooled.py</code>, same folds${iters !== 250 ? `; your boosting used ${iters} rounds instead of 250, so expect less skill` : ''}. Time: CPU seconds for each model, summed over the five folds; the held-out results were ready after ${seconds.toFixed(0)} s on ${threads} thread${threads > 1 ? 's' : ''}.</p>
    ${cal}`;
}

function renderScorer(el, meta, models, kinds, foldModels = {}) {
  const numField = (n, j) => {
    const [lo, hi, step] = NUM_LIMITS[n] || [0, 100, 1];
    const v = meta.defaults.num[j];
    return `<label>${esc(LABELS[n] || n)} <input type="number" name="n_${j}" min="${lo}" max="${hi}" step="${step}" value="${n === 'wedding_year' ? 2020 : Math.round(v)}" ${n === 'wedding_year' || n === 'wife_age_at_marriage' ? 'required' : 'placeholder="unknown"'}></label>`;
  };
  const catField = (n, j) => `<label>${esc(LABELS[n] || n)} <select name="c_${j}">${meta.levels[n].map((l, c) => `<option value="${c}" ${c === meta.defaults.cat[j] ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  el.innerHTML = `
    <h3>Score a profile with the models you just trained</h3>
    <p class="sub">The models were refitted on every marriage in the extract. They describe a woman’s first marriage, from her report, in U.S. surveys of 1995–2023; the defaults are the most common answers. Associations in past data, not causes and not a forecast for you.</p>
    <form class="train-form" novalidate>${meta.numNames.map(numField).join('')}${meta.catNames.map(catField).join('')}</form>
    <div class="train-out" aria-live="polite"></div>`;
  const form = el.querySelector('form'), out = el.querySelector('.train-out');
  const D = { numNames: meta.numNames, catNames: meta.catNames };
  const ks = Array.from({ length: 20 }, (_, k) => k);
  const update = () => {
    const nv = meta.numNames.map((n, j) => {
      const s = form.elements[`n_${j}`].value;
      if (s === '') return NaN;
      const [lo, hi] = NUM_LIMITS[n] || [-Infinity, Infinity];
      return Math.min(hi, Math.max(lo, Number(s)));
    });
    const cv = meta.catNames.map((_, j) => Number(form.elements[`c_${j}`].value));
    const missingRequired = meta.numNames.some((n, j) => Number.isNaN(nv[j]) && (n === 'wedding_year' || n === 'wife_age_at_marriage'));
    if (missingRequired) { out.innerHTML = '<p class="small">Enter the wedding year and the wife’s age at the wedding.</p>'; return; }
    const ended = (model, h) => {
      const r = rates(model, nv, cv, ks, D);
      return 100 * (1 - Math.exp(-r.slice(0, h).reduce((a, b) => a + b, 0)));
    };
    const row = (k) => {
      const fm = foldModels[k] || [];
      const spread = fm.length ? fm.map((m) => ended(m, 10)) : null;
      const range = spread ? `${pct(Math.min(...spread))} to ${pct(Math.max(...spread))}` : '—';
      return `<tr><th scope="row">${esc(MODEL_LABELS[k])}</th><td class="num">${pct(ended(models[k], 5))}</td><td class="num">${pct(ended(models[k], 10))}</td><td class="num">${pct(ended(models[k], 20))}</td><td class="num">${range}</td></tr>`;
    };
    out.innerHTML = `<div class="table-wrap"><table><thead><tr><th scope="col">Model you trained</th><th scope="col" class="num">Ended by year 5</th><th scope="col" class="num">by year 10</th><th scope="col" class="num">by year 20</th><th scope="col" class="num">Year 10, the five fold models</th></tr></thead>
      <tbody>${kinds.filter((k) => models[k]).map(row).join('')}</tbody></table></div>
      <p class="small">Chance the marriage ends in divorce, annulment or separation, assuming both spouses live: 1 − e<sup>−(sum of the annual rates)</sup>. Unknown ages use the training median. For reference, 33.3% of these women’s first marriages had ended by year 10. The last column scores the same profile with the five models trained during the held-out test, each on a different four-fifths of the women: how far your number moves with the sample it learned from. It covers sampling only, not what the survey never measured.</p>`;
  };
  form.addEventListener('input', update);
  update();
}

mount(document.getElementById('trainPanel'));
