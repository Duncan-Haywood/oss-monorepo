// UI for "Compare scenarios" (the DOM side of scenarios.js). Scenarios live in memory, in this
// browser's storage when it allows it (never the sensitive answers), in JSON/CSV files the user
// downloads, and in a share link that carries only the link-safe fields. Nothing is uploaded.
import { MAX_SCENARIOS, STORAGE_KEY, VARY_FIELDS, varyValues, cleanFields, addScenario, duplicateScenario, renameScenario, deleteScenario, moveScenario, updateScenario, baselineOf, autoName, varyOne, summariseScenarios, lensComparison, defaultLenses, horizonsOf, comparisonCsv, exportJson, importJson, encodeScenarioLink, decodeScenarioLink, capMessage, isSensitive, verdictText } from './scenarios.js';
import { LIT_SENSITIVE } from './literature-ui.js';
import { primaryHorizon, fmtYears } from './couple.js';
import { shortName } from './summary.js';
import { download } from './compare-ui.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (x, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d) + '%' : '—');
const signed = (x) => `${x >= 0 ? '+' : '−'}${(100 * Math.abs(x)).toFixed(1)}`;
const yrs = (h) => `${fmtYears(h)} year${h === 1 ? '' : 's'}`;
const year = () => new Date().getFullYear();

let ctx = null; // { lenses(), capture() -> { fields, lit }, load(scenario), rerender() }
let list = [];
let baselineId = null;
let editingId = null;
let selection = null; // { lenses: [ids], horizons: { id: years } }
let storageOk = true;
let lastKey = '';
const cache = new Map();

// ---- Storage (non-sensitive answers only; the page works without it) ----------------------
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exportJson(list, baselineId, { includeSensitive: false, selection })));
    storageOk = true;
  } catch { storageOk = false; }
}
function restore() {
  let text = null;
  try { text = localStorage.getItem(STORAGE_KEY); } catch { storageOk = false; }
  if (!text) return;
  const r = importJson(text);
  if (r.fatal) return; // an unreadable store is ignored, not fatal
  append(r.scenarios, r.baseline);
  if (r.selection) selection = r.selection;
}
function append(items, baseIndex = null) {
  const added = [];
  for (const s of items) {
    const r = addScenario(list, s);
    if (r.error) break;
    list = r.list;
    added.push(r.scenario);
  }
  if (added.length && baseIndex !== null && added[baseIndex]) baselineId = added[baseIndex].id;
  if (!baselineOf(list, baselineId)) baselineId = list[0]?.id ?? null;
  return added;
}

const status = (msg) => { $('#scenStatus').textContent = msg; };
const in100 = (x) => Math.round(100 * x);

// ---- Link import (called before the first render, and on hashchange) ----------------------
export function importScenariosFromHash(hash) {
  const d = decodeScenarioLink(hash);
  if (!d) return false;
  const room = MAX_SCENARIOS - list.length;
  const added = append(d.scenarios.slice(0, Math.max(0, room)), d.baseline);
  const lost = d.scenarios.length - added.length + d.dropped;
  persist();
  status(`Added ${added.length} option${added.length === 1 ? '' : 's'} from the link.${lost ? ` ${lost} not added: the limit is ${MAX_SCENARIOS}.` : ''} Links never carry the sensitive answers.`);
  return true;
}

// ---- Set-up -----------------------------------------------------------------------------
export function initScenarios(c) {
  ctx = c;
  restore();
  $('#scenMax').textContent = MAX_SCENARIOS;
  const optOf = (v) => `<option value="${esc(v.key)}">${esc(v.label)} (${varyValues(v).length} values)</option>`;
  $('#varyField').innerHTML = `<optgroup label="Choices and circumstances">${VARY_FIELDS.filter((v) => !v.fixed).map(optOf).join('')}</optgroup>`
    + `<optgroup label="Age, timing and background (to understand the models, not to change)">${VARY_FIELDS.filter((v) => v.fixed).map(optOf).join('')}</optgroup>`;
  $('#scenSave').addEventListener('click', saveCurrent);
  $('#scenUpdate').addEventListener('click', saveEdits);
  $('#varyGo').addEventListener('click', makeVariations);
  $('#scenList').addEventListener('click', onListClick);
  $('#scenList').addEventListener('change', onListChange);
  $('#scenLenses').addEventListener('change', onLensPick);
  $('#scenJson').addEventListener('click', () => {
    const inc = $('#scenSensitive').checked;
    download('divorce_odds_scenarios.json', JSON.stringify(exportJson(list, baselineId, { includeSensitive: inc, selection }), null, 2) + '\n', 'application/json');
    status(inc ? 'Downloaded the options as JSON, including the sensitive answers you gave. Keep that file private.' : 'Downloaded the options as JSON (sensitive answers left out).');
  });
  $('#scenCsv').addEventListener('click', () => {
    if (!list.length) { status('Save an option first.'); return; }
    const ids = chosenLenses();
    const sums = summariseScenarios(ctx.lenses(), list, ids, { currentYear: year(), cache });
    download('divorce_odds_scenarios.csv', comparisonCsv(ctx.lenses(), list, sums, { baselineId, lensIds: ids }));
    status(`Downloaded a CSV: ${list.length} options × ${ids.length} lens${ids.length === 1 ? '' : 'es'} × each lens’s horizons. It holds no answers, only the option names and results.`);
  });
  $('#scenImport').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const r = importJson(await f.text(), { room: MAX_SCENARIOS - list.length });
    if (r.fatal) {
      $('#scenErrors').innerHTML = `<div class="refuse-inline"><p>${esc(r.fatal)}</p>${r.errors.length ? `<ul class="small">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>`;
      status('Nothing was imported.');
      return;
    }
    $('#scenErrors').innerHTML = '';
    const added = append(r.scenarios, list.length ? null : r.baseline);
    if (r.selection) selection = r.selection;
    persist();
    status(`Imported ${added.length} option${added.length === 1 ? '' : 's'}.${r.dropped ? ` ${r.dropped} not imported: the limit is ${MAX_SCENARIOS}.` : ''}`);
    draw();
  });
  $('#scenLink').addEventListener('click', async () => {
    if (!list.length) { status('Save an option first.'); return; }
    const url = location.origin + location.pathname + location.search + encodeScenarioLink(list, baselineId);
    $('#scenLinkOut').value = url;
    $('#scenLinkWrap').hidden = false;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { /* clipboard blocked */ }
    status(`${ok ? 'Link copied' : 'Copy the link below'} (${url.length.toLocaleString('en-US')} characters). It carries only the answers the single-scenario link carries: no hostility, abuse, substance use, low mood or childhood-adversity answers.${url.length > 8000 ? ' Long links can be cut off by some apps; the JSON file is safer for many options.' : ''}`);
  });
  $('#scenClear').addEventListener('click', () => {
    if (!list.length) return;
    if (!window.confirm(`Delete all ${list.length} options from this page and this browser?`)) return;
    list = [];
    baselineId = null;
    editingId = null;
    persist();
    status('All options deleted.');
    draw();
  });
}

function capture() {
  const { fields, lit } = ctx.capture();
  const c = cleanFields(fields);
  return { fields: c.fields, lit, errors: c.errors };
}

function saveCurrent() {
  const c = capture();
  const r = addScenario(list, { name: $('#scenName').value, fields: c.fields, lit: c.lit });
  if (r.error) { status(r.error); return; }
  list = r.list;
  if (!baselineOf(list, baselineId) || list.length === 1) baselineId = r.scenario.id;
  editingId = r.scenario.id;
  $('#scenName').value = '';
  persist();
  status(`Saved “${r.scenario.name}” (${list.length} of ${MAX_SCENARIOS}).${c.errors.length ? ` Left blank because they were outside the allowed range: ${c.errors.join('; ')}.` : ''}${hasSensitive(c.fields, c.lit) ? ' Its sensitive answers stay in this tab only: they are not saved in this browser, put in links or exported unless you ask.' : ''}`);
  draw();
}
function saveEdits() {
  const s = list.find((x) => x.id === editingId);
  if (!s) return;
  const c = capture();
  list = updateScenario(list, s.id, c);
  persist();
  status(`Saved the form into “${s.name}”.`);
  draw();
}
const hasSensitive = (fields, lit = {}) => Object.keys(fields).some(isSensitive) || Object.keys(lit || {}).some((k) => LIT_SENSITIVE.has(k));

function makeVariations() {
  const key = $('#varyField').value;
  const from = $('#varyBase').value;
  let base = list.find((s) => s.id === from);
  if (!base) {
    // From the form: save it first, so the copies have their reference in the table.
    const c = capture();
    const r = addScenario(list, { name: $('#scenName').value || 'As entered', fields: c.fields, lit: c.lit });
    if (r.error) { status(r.error); return; }
    list = r.list;
    base = r.scenario;
    $('#scenName').value = '';
  }
  const v = varyOne(base, key, { existing: list.length });
  if (v.error) { status(v.error); return; }
  const at = list.findIndex((s) => s.id === base.id) + 1;
  let added = 0;
  for (const s of v.scenarios) {
    const r = addScenario(list, s, at + added);
    if (r.error) break;
    list = r.list;
    added++;
  }
  baselineId = base.id;
  persist();
  const skipped = v.skipped.map((s) => `${s.value} (${s.reason})`).join('; ');
  status(`Made ${added} cop${added === 1 ? 'y' : 'ies'} of “${base.name}” varying ${v.label.toLowerCase()}; “${base.name}” is now your current plan.${skipped ? ` Not made: ${skipped}.` : ''}${list.length >= MAX_SCENARIOS ? ' ' + capMessage() : ''}`);
  draw();
}

function onListClick(ev) {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const s = list.find((x) => x.id === id);
  const act = btn.dataset.act;
  let focusAct = act;
  if (act === 'load') {
    editingId = id;
    ctx.load(s);
    status(`Loaded “${s.name}” into the form above. Change anything, then press “Save changes to ${s.name}”, or save it as a new option.`);
  } else if (act === 'dup') {
    const r = duplicateScenario(list, id);
    if (r.error) { status(r.error); return; }
    list = r.list;
    status(`Duplicated as “${r.scenario.name}”.`);
  } else if (act === 'up' || act === 'down') {
    list = moveScenario(list, id, act === 'up' ? -1 : 1);
  } else if (act === 'del') {
    list = deleteScenario(list, id);
    if (baselineId === id) baselineId = list[0]?.id ?? null;
    if (editingId === id) editingId = null;
    status(`Deleted “${s.name}”.`);
    focusAct = null;
  }
  persist();
  draw();
  const target = focusAct && $(`#scenList [data-id="${CSS.escape(id)}"] [data-act="${focusAct}"]`);
  (target && !target.disabled ? target : $('#scenSave')).focus();
}
function onListChange(ev) {
  const row = ev.target.closest('[data-id]');
  if (!row) return;
  if (ev.target.matches('input[data-rename]')) {
    list = renameScenario(list, row.dataset.id, ev.target.value);
    ev.target.value = list.find((s) => s.id === row.dataset.id).name;
  } else if (ev.target.matches('input[name="scenBase"]')) {
    baselineId = row.dataset.id;
  } else return;
  persist();
  drawOutput();
  drawVaryBase();
  drawEditing();
}

function onLensPick(ev) {
  const lenses = ctx.lenses();
  const ids = [...document.querySelectorAll('#scenLenses [data-pick]:checked')].map((x) => x.dataset.pick);
  const horizons = {};
  for (const sel of document.querySelectorAll('#scenLenses select[data-hz]')) horizons[sel.dataset.hz] = Number(sel.value);
  selection = { lenses: ids.filter((id) => lenses.some((l) => l.summary.id === id)), horizons };
  if (ev.target.matches('[data-hz]')) {
    const box = $(`#scenLenses [data-pick="${CSS.escape(ev.target.dataset.hz)}"]`);
    if (box && !box.checked) { box.checked = true; selection.lenses.push(ev.target.dataset.hz); }
  }
  persist();
  drawOutput();
}

// ---- Drawing ----------------------------------------------------------------------------
const scorable = () => ctx.lenses().filter((l) => l.summary.scorable);
function chosenLenses() {
  const ok = new Set(scorable().map((l) => l.summary.id));
  if (!selection || !selection.lenses.length) {
    const base = baselineOf(list, baselineId);
    selection = { lenses: base ? defaultLenses(ctx.lenses(), base, { currentYear: year() }) : [], horizons: selection?.horizons || {} };
  }
  return selection.lenses.filter((id) => ok.has(id));
}
const horizonFor = (lens) => {
  const h = selection?.horizons?.[lens.summary.id];
  return horizonsOf(lens).find((x) => Math.abs(x - h) < 0.02) ?? primaryHorizon(lens.bundle);
};

export function renderScenarios() {
  if (!ctx) return;
  draw();
}
function draw() {
  $('#scenCount').textContent = `(${list.length} of ${MAX_SCENARIOS})`;
  $('#scenName').placeholder = autoName(list);
  $('#scenSave').disabled = list.length >= MAX_SCENARIOS;
  $('#scenCapNote').textContent = list.length >= MAX_SCENARIOS ? capMessage() : '';
  $('#scenStorage').textContent = storageOk ? 'Saved in this browser only (not the sensitive answers, which stay in this tab).' : 'This browser is not letting the page save options (private window or blocked storage): they last until you close the tab. Download them as JSON to keep them.';
  drawList();
  drawVaryBase();
  drawEditing();
  drawLensPicker();
  drawOutput();
}
function drawEditing() {
  const s = list.find((x) => x.id === editingId);
  $('#scenUpdate').hidden = !s;
  if (s) $('#scenUpdate').textContent = `Save changes to “${s.name}”`;
}
function drawVaryBase() {
  const cur = $('#varyBase').value;
  $('#varyBase').innerHTML = '<option value="">The form as it is now (saved first)</option>' + list.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  if (list.some((s) => s.id === cur)) $('#varyBase').value = cur;
}
function describe(s) {
  const f = s.fields;
  const who = (w) => [f[`${w}.sex`], f[`${w}.age`] && `${f[`${w}.age`]}`, f[`${w}.degree`]].filter(Boolean).join(', ');
  return [`You: ${who('a') || '—'}`, `Partner: ${who('b') || '—'}`, `${f.yearsMarried || 0} years married`, f.cohabitedFirst ? `lived together first: ${f.cohabitedFirst}` : null].filter(Boolean).join(' · ');
}
function drawList() {
  $('#scenList').innerHTML = list.map((s, i) => `<li data-id="${esc(s.id)}" class="scen-item${s.id === baselineId ? ' base' : ''}">
      <div class="scen-head"><label class="scen-name"><span class="vh">Name of option ${i + 1}</span><input data-rename value="${esc(s.name)}" maxlength="80"></label>
      <label class="check"><input type="radio" name="scenBase" value="${esc(s.id)}"${s.id === baselineId ? ' checked' : ''}> Current plan</label></div>
      <small>${esc(describe(s))}${s.id === editingId ? ' · <b>in the form</b>' : ''}</small>
      <div class="scen-btns"><button type="button" data-act="load" aria-label="Load ${esc(s.name)} into the form">Load into form</button><button type="button" data-act="dup" aria-label="Duplicate ${esc(s.name)}"${list.length >= MAX_SCENARIOS ? ' disabled' : ''}>Duplicate</button><button type="button" data-act="up" aria-label="Move ${esc(s.name)} up"${i === 0 ? ' disabled' : ''}>Up</button><button type="button" data-act="down" aria-label="Move ${esc(s.name)} down"${i === list.length - 1 ? ' disabled' : ''}>Down</button><button type="button" data-act="del" aria-label="Delete ${esc(s.name)}">Delete</button></div>
    </li>`).join('');
  $('#scenEmpty').hidden = list.length > 0;
}
function drawLensPicker() {
  const ids = new Set(list.length ? chosenLenses() : selection?.lenses || []);
  $('#scenLensList').innerHTML = scorable().map((l) => {
    const id = l.summary.id;
    const name = shortName(l.summary.label, id);
    const h = horizonFor(l);
    return `<div class="lens-pick"><label class="check"><input type="checkbox" data-pick="${esc(id)}"${ids.has(id) ? ' checked' : ''}> ${esc(name)}</label>
      <label class="hz"><span class="vh">Horizon for ${esc(name)}</span><select data-hz="${esc(id)}">${horizonsOf(l).map((x) => `<option value="${x}"${Math.abs(x - h) < 0.02 ? ' selected' : ''}>${yrs(x)}</option>`).join('')}</select></label></div>`;
  }).join('');
}

function drawOutput() {
  const lenses = ctx.lenses();
  if (!list.length) { $('#scenOut').innerHTML = ''; lastKey = ''; return; }
  const ids = chosenLenses();
  const key = JSON.stringify([list, baselineId, ids, ids.map((id) => selection.horizons[id])]);
  if (key === lastKey) return;
  lastKey = key;
  if (cache.size > 3000) cache.clear();
  if (!ids.length) { $('#scenOut').innerHTML = '<p class="note">Pick at least one lens above.</p>'; return; }
  const sums = summariseScenarios(lenses, list, ids, { currentYear: year(), cache });
  const tables = ids.map((id) => {
    const lens = lenses.find((l) => l.summary.id === id);
    return { lens, c: lensComparison(lens, sums[id], list, { horizon: horizonFor(lens), baselineId }) };
  });
  const head = `<tr><th scope="col">Option</th>${tables.map(({ lens, c }) => `<th scope="col">${esc(shortName(lens.summary.label, lens.summary.id))}<small>break-up within ${yrs(c.horizon)}; ${c.models} model${c.models === 1 ? '' : 's'}</small></th>`).join('')}</tr>`;
  const body = list.map((s, i) => `<tr${s.id === baselineId ? ' class="ref"' : ''}><th scope="row">${i + 1}. ${esc(s.name)}${s.id === baselineId ? ' <span class="tag">current plan</span>' : ''}</th>${tables.map(({ c }) => cellHtml(c.rows[i])).join('')}</tr>`).join('');
  $('#scenOut').innerHTML = `<h3>Side by side</h3>
    <p class="small">Each column is one lens, with every option at the same horizon: how many of 100 couples like you the lens expects to break up, with the range across its models; the difference from your current plan, judged model by model (each model compares the option with your current plan by itself): “models agree” when every model moves the same way by at least 1 point, “most models agree” when most do, and “cannot tell apart” when the models disagree on the direction or every change is under 1 point; and where the couple sits in that lens’s surveyed population. Lenses measure different outcomes, so a row is never summed or averaged across columns. These are associations in past surveys, not advice.</p>
    <div class="table-wrap scen-grid"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <h3>Each lens on its own scale</h3>
    <p class="small">Dot: average of the lens’s models. Bar: smallest to largest model. Dashed line: your current plan. The numbers are repeated as text on the right.</p>
    <div class="sm-grid">${tables.map(({ lens, c }) => chartHtml(lens, c)).join('')}</div>`;
}

function cellHtml(r) {
  if (r.status !== 'ok') return `<td class="out-cell">no number<small>${esc(r.reason)}</small></td>`;
  const diff = r.baseline ? '<small>your current plan</small>' : r.diff ? diffHtml(r.diff) : '<small>no comparison: your current plan has no number in this lens</small>';
  const pc = r.percentile ? `<small>${esc(r.percentile.below || r.percentile.above ? r.percentile.label : 'p' + Math.round(r.percentile.percentile))} of its population (${esc(r.percentile.of)})</small>` : '';
  const flags = [!r.inSupport ? `<span class="tag warn-tag">outside its data</span>` : '', Number.isFinite(r.ood) && r.ood >= 90 ? `<span class="tag warn-tag">unusual: more than ${Math.round(r.ood)}% of its people</span>` : ''].filter(Boolean).join(' ');
  return `<td><b>${in100(r.risk)} in 100</b> couples like you <small>${pct(r.risk)}; models ${pct(r.riskMin)}–${pct(r.riskMax)} (${in100(r.riskMin)}–${in100(r.riskMax)} in 100)</small>${diff}${pc}${flags ? `<div class="flags">${flags}</div>` : ''}</td>`;
}

function diffHtml(d) {
  const cls = d.cannotTell ? '' : d.direction > 0 ? 'down' : 'up';
  const avg = Math.abs(d.points) < 1e-12 ? 'no change on average' : `${signed(d.points)} pts on average${Number.isFinite(d.ratio) ? `, ×${d.ratio.toFixed(2)}` : ''}`;
  return `<small class="${cls}"><b>${esc(verdictText(d))}</b></small><small>${avg} vs your current plan${d.probLower !== null ? `; lower in ${Math.round(100 * d.probLower)}% of posterior draws` : ''}</small>`;
}

const NICE = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1];
function chartHtml(lens, c) {
  const ok = c.rows.filter((r) => r.status === 'ok');
  const top = NICE.find((x) => x >= Math.max(0.005, ...ok.map((r) => r.riskMax))) || 1;
  const at = (x) => `${Math.max(0, Math.min(100, (100 * x) / top)).toFixed(2)}%`;
  const base = c.rows[c.baselineIndex];
  const baseLine = base && base.status === 'ok' ? `<i class="sm-base" style="left:${at(base.risk)}"></i>` : '';
  const name = shortName(lens.summary.label, lens.summary.id);
  const rows = c.rows.map((r) => `<div class="sm-row${r.baseline ? ' base' : ''}${r.status === 'ok' && !r.inSupport ? ' out' : ''}" role="listitem"><span class="sm-name" title="${esc(r.name)}">${c.rows.indexOf(r) + 1}. ${esc(r.name)}</span>`
    + (r.status === 'ok'
      ? `<span class="sm-track" aria-hidden="true">${baseLine}<i class="sm-range" style="left:${at(r.riskMin)};width:calc(${at(r.riskMax)} - ${at(r.riskMin)})"></i><i class="sm-dot" style="left:${at(r.risk)}"></i></span><span class="sm-val">${in100(r.risk)} in 100<small>models ${in100(r.riskMin)}–${in100(r.riskMax)}${r.inSupport ? '' : '; outside data'}</small></span>`
      : `<span class="sm-track none" aria-hidden="true"></span><span class="sm-val">no number</span>`) + '</div>').join('');
  const ticks = [0, top / 2, top].map((x) => `<span style="left:${at(x)}">${pct(x, top < 0.05 ? 1 : 0)}</span>`).join('');
  return `<figure class="sm-card"><figcaption><strong>${esc(name)}</strong>: break-ups within ${yrs(c.horizon)}, out of 100 couples like you<small>${esc(c.outcome || '')}</small></figcaption>
    <div class="sm" role="list" aria-label="${esc(name)}, break-ups within ${yrs(c.horizon)} out of 100 couples like you, for each option">${rows}</div>
    <div class="sm-row sm-axis" aria-hidden="true"><span class="sm-name"></span><span class="sm-ticks">${ticks}</span><span class="sm-val"></span></div></figure>`;
}
