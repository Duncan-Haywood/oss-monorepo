// "Train the models yourself": runs train/worker.js on the NSFG 1995–2023 extract, shows the
// held-out results next to the shipped Python ones, and scores a profile with the models the
// visitor just trained. Self-contained: mounts into <section id="trainPanel"> and touches
// nothing else on the page.
import { KINDS, MODEL_LABELS, rates } from './fit.js';

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
  <p class="sub">Retrain the NSFG 1995–2023 lens from its survey data, here in your browser, with the same person-held-out five-fold test as the Python pipeline. The data are a compact public extract of 29,202 women’s first marriages from eight National Survey of Family Growth cycles (NCHS; U.S. government work, public domain), with inputs fixed at or before the wedding only. The models are fitted by plain JavaScript in a background worker, so the page stays usable. All five models take about 40 seconds on a laptop and a few minutes on a phone; you can cancel at any time. Nothing is sent anywhere.</p>
  <fieldset class="train-opts"><legend>Models to train</legend>
    <div class="train-kinds">${KINDS.map((k) => `<label class="check"><input type="checkbox" name="kind" value="${k}" ${k === 'constant' ? 'checked disabled' : 'checked'}> ${esc(MODEL_LABELS[k])}</label>`).join('')}</div>
    <label>Boosting rounds <select name="iters"><option value="250" selected>250 (the Python setting)</option><option value="100">100 (faster, a little less skill)</option><option value="25">25 (quick look)</option></select></label>
    <label class="check"><input type="checkbox" name="final" checked> Then refit on every marriage, to score a profile below</label>
  </fieldset>
  <p class="actions"><button type="button" data-act="start">Train in my browser</button> <button type="button" data-act="cancel" disabled>Cancel</button></p>
  <progress value="0" max="1" hidden aria-label="Training progress"></progress>
  <p class="train-status" role="status" aria-live="polite"></p>
  <div class="train-results"></div>
  <div class="train-score"></div>`;
  const $ = (s) => root.querySelector(s);
  const progress = $('progress'), status = $('.train-status'), results = $('.train-results'), scoreBox = $('.train-score');
  const start = $('[data-act=start]'), cancel = $('[data-act=cancel]');
  let worker = null, meta = null, cv = null;
  const python = Promise.all([
    fetch(here('../models/nsfg_pooled_first_marriage.json')).then((r) => r.json()).catch(() => null),
    fetch(here('sklearn_reference.json')).then((r) => r.json()).catch(() => null),
  ]).then(([b, r]) => shippedResults(b, r));

  const stop = (text) => {
    if (worker) worker.terminate();
    worker = null;
    start.disabled = false; cancel.disabled = true;
    progress.hidden = true;
    if (text) status.textContent = text;
  };
  cancel.addEventListener('click', () => stop('Cancelled. Nothing was kept.'));
  start.addEventListener('click', () => {
    const kinds = ['constant', ...[...root.querySelectorAll('input[name=kind]:checked')].map((i) => i.value).filter((k) => k !== 'constant')];
    const boostingIters = Number($('select[name=iters]').value);
    const finalFit = $('input[name=final]').checked;
    results.innerHTML = ''; scoreBox.innerHTML = '';
    start.disabled = true; cancel.disabled = false;
    progress.hidden = false; progress.value = 0;
    status.textContent = 'Starting the background worker…';
    try {
      worker = new Worker(here('worker.js'), { type: 'module' });
    } catch (e) {
      stop(`This browser cannot run module workers (${e.message}).`);
      return;
    }
    const t0 = performance.now();
    worker.onerror = (e) => stop(`The worker failed: ${e.message || 'unknown error'}.`);
    worker.onmessage = async (ev) => {
      const m = ev.data;
      if (m.type === 'status') status.textContent = m.text;
      else if (m.type === 'loaded') {
        meta = m;
        status.textContent = `Loaded ${m.n.toLocaleString('en-US')} marriages (${m.events.toLocaleString('en-US')} ended) as ${m.intervals.toLocaleString('en-US')} marriage-years in ${m.seconds.toFixed(1)} s. Training…`;
      } else if (m.type === 'progress') {
        progress.value = m.value;
        status.textContent = `${Math.round(100 * m.value)}% · ${m.label} · ${((performance.now() - t0) / 1000).toFixed(0)} s`;
      } else if (m.type === 'cv') {
        cv = m.results;
        renderResults(results, kinds, cv, await python, m.seconds, boostingIters);
        if (!finalFit) stop(`Done in ${m.seconds.toFixed(0)} s.`);
      } else if (m.type === 'done') {
        stop(`Done in ${m.seconds.toFixed(0)} s. Held-out results and a profile scorer for the models you trained are below.`);
        if (Object.keys(m.models).length) renderScorer(scoreBox, meta, m.models, kinds);
      } else if (m.type === 'error') stop(`Training stopped: ${m.message}`);
    };
    worker.postMessage({ kinds, boostingIters, finalFit });
  });
}

function renderResults(el, kinds, cv, py, seconds, iters) {
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
      <tr><th scope="col" class="num">Deviance gain</th><th scope="col" class="num">C</th><th scope="col" class="num">O/E</th><th scope="col" class="num">Time</th><th scope="col" class="num">Deviance gain</th><th scope="col" class="num">C</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="small">Deviance gain: how much better than a constant annual rate the model predicts the 5,800 or so women held out in each fold, pooled over the five folds (Poisson deviance on marriage-years). C: Harrell’s concordance of the 10-year risk score. O/E: observed over predicted dissolutions. Python: scikit-learn 1.7.2 in <code>reproducibility/nsfg_pooled_first_marriage/train_pooled.py</code>, same folds${iters !== 250 ? `; your boosting used ${iters} rounds instead of 250, so expect less skill` : ''}. Total ${seconds.toFixed(0)} s here.</p>
    ${cal}`;
}

function renderScorer(el, meta, models, kinds) {
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
    const row = (k) => {
      const r = rates(models[k], nv, cv, ks, D);
      const by = (h) => 100 * (1 - Math.exp(-r.slice(0, h).reduce((a, b) => a + b, 0)));
      return `<tr><th scope="row">${esc(MODEL_LABELS[k])}</th><td class="num">${pct(by(5))}</td><td class="num">${pct(by(10))}</td><td class="num">${pct(by(20))}</td></tr>`;
    };
    out.innerHTML = `<div class="table-wrap"><table><thead><tr><th scope="col">Model you trained</th><th scope="col" class="num">Ended by year 5</th><th scope="col" class="num">by year 10</th><th scope="col" class="num">by year 20</th></tr></thead>
      <tbody>${kinds.filter((k) => models[k]).map(row).join('')}</tbody></table></div>
      <p class="small">Chance the marriage ends in divorce, annulment or separation, assuming both spouses live: 1 − e<sup>−(sum of the annual rates)</sup>. Unknown ages use the training median. For reference, 33.3% of these women’s first marriages had ended by year 10.</p>`;
  };
  form.addEventListener('input', update);
  update();
}

mount(document.getElementById('trainPanel'));
