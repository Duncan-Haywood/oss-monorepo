// UI for the "Profile report" view: renders report.js for the selected lens, for you and for the
// person you are looking at, plus the lens-by-lens partner-mix table. Nothing is stored or sent;
// the report reads the same form as every other view and never adds answers to the link.
import { profileReport, mixAcrossLenses, inHundred, aboveBelow } from './report.js';
import { fmtYears } from './couple.js';
import { shortName } from './summary.js';
import { renderSatisfaction } from './satisfaction.js';
import { renderDating } from './dating-length.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtN = (x) => Math.round(x).toLocaleString('en-US');
const n100 = (r) => (Number.isFinite(r) ? `${inHundred(r)} in 100` : '—');
const pts = (x) => `${(100 * Math.abs(x)).toFixed(1)}`;
const rng = (lo, hi) => `${inHundred(lo)}–${inHundred(hi)}`;
const pctl = (s) => {
  if (!s || !Number.isFinite(s.percentile)) return '—';
  if (s.below || s.above) return s.pLabel || s.label || (s.below ? 'below p1' : 'above p99');
  return 'p' + (s.percentile < 10 ? s.percentile.toFixed(1) : Math.round(s.percentile));
};

let satData = null;
let satLoad = null;
let satGroup = 'All';
function drawSatisfaction(couple) {
  const el = document.getElementById('satOut');
  if (!el) return;
  if (!satLoad) {
    satLoad = fetch('data/satisfaction_by_duration.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((d) => { satData = d; drawSatisfaction(couple); });
    return;
  }
  if (!satData) { el.innerHTML = '<p class="note">Loading the satisfaction data…</p>'; return; }
  const ym = Number(couple.yearsMarried);
  renderSatisfaction(el, satData, { group: satGroup, yearsMarried: ym > 0 ? ym : null });
  el.querySelector('#satGroup')?.addEventListener('change', (ev) => { satGroup = ev.target.value; drawSatisfaction(couple); });
}
let datingData = null;
let datingLoad = null;
function drawDating(couple) {
  const el = document.getElementById('datingLengthOut');
  if (!el) return;
  if (!datingLoad) {
    datingLoad = fetch('data/dating_length.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((d) => { datingData = d; drawDating(couple); });
    return;
  }
  renderDating(el, datingData, couple);
}
let timer = null;
let lastKey = '';
let evidence = null;
let evidenceLoad = null;
// decision_evidence.json (factor grades), loaded once on first use; the report renders without it.
function loadEvidence(rerun) {
  if (evidenceLoad) return;
  evidenceLoad = fetch('data/decision_evidence.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((d) => { evidence = d; if (d) { lastKey = ''; rerun(); } });
}

// Debounced: the report scores several hundred partner profiles, so typing does not block.
export function renderReport(ctx) {
  loadEvidence(() => renderReport(ctx));
  const key = JSON.stringify([ctx.lens.summary.id, ctx.a, ctx.b, ctx.couple]);
  if (key === lastKey && ctx.el.dataset.ready === '1') return;
  ctx.el.setAttribute('aria-busy', 'true');
  clearTimeout(timer);
  timer = setTimeout(() => {
    lastKey = key;
    try {
      draw(ctx);
    } catch (e) {
      ctx.el.innerHTML = `<p class="note">The report could not be computed for these answers (${esc(e.message)}).</p>`;
    }
    ctx.el.dataset.ready = '1';
    ctx.el.setAttribute('aria-busy', 'false');
  }, 120);
}

function draw({ el, lens, lenses, a, b, couple }) {
  if (!lens.summary.scorable) {
    el.innerHTML = '<p class="note">This lens gives no numbers; pick a scorable lens at the top (NSFG 1995–2023 or NLSY79 first marriages have partner distributions).</p>';
    return;
  }
  const r = profileReport(lens.bundle, a, b, couple, { evidence, draws: 200 });
  const h = r.horizon;
  const hy = `${fmtYears(h)} year${h === 1 ? '' : 's'}`;
  const ym = Number(couple.yearsMarried) || 0;
  el.innerHTML = `
    <p class="note rep-frame">Lens: <strong>${esc(lens.summary.label)}</strong>. Every number is the lens’s chance of a break-up within <strong>${hy}</strong> of the wedding${ym ? ' (your ages rewound to your wedding day)' : ''}, as “N in 100 couples like this”. Ranges are the spread across the lens’s ${r.you.models} models; 95% intervals on averages come from resampling who married whom in the survey and do not include model uncertainty. Associations in past surveys, not causes.</p>
    <div class="rep-two">
      ${personCard('You', a, r.you, h, 'the person you are looking at')}
      ${personCard('The person you are looking at', b, r.them, h, 'you')}
    </div>
    <h3>Every lens with a partner distribution</h3>
    <p class="sub">Each lens’s own number, never pooled: “dating everyone” against “partners people like you marry”, for each of you.</p>
    ${acrossTable(lenses, a, b, couple)}
    <h3>Marital satisfaction at different numbers of years married</h3>
    <p class="sub">What surveyed married people said about their marriage at each length of marriage. Not a prediction for your marriage, and not from the lens above.</p>
    <div id="satOut" aria-live="polite"></div>
    <h3>How long you dated before marrying</h3>
    <p class="sub">Whether a longer courtship goes with fewer divorces: what one survey shows, a held-out test, and the published estimate, with its evidence grade.</p>
    <div id="datingLengthOut" aria-live="polite"></div>`;
  drawSatisfaction(couple);
  drawDating(couple);
}

function bar(risk, lo, hi, max) {
  const x = (v) => Math.max(0, Math.min(100, (100 * v) / max));
  return `<span class="rep-bar" aria-hidden="true"><span class="rep-rng" style="left:${x(lo)}%;width:${Math.max(0.6, x(hi) - x(lo))}%"></span><span class="rep-dot" style="left:${x(risk)}%"></span></span>`;
}

function personCard(title, person, p, h, otherName) {
  const rows = [];
  const maxRisk = Math.max(0.05, ...[p.withPartner?.riskMax, p.likely?.riskMax, p.everyone?.riskMax, p.self?.riskMax, p.likely?.standing?.median, p.everyone?.standing?.median, p.withPartner?.standing?.median].filter(Number.isFinite)) * 1.1;
  const row = (label, x, ci, note = '') => rows.push(`<tr><th scope="row">${label}${note ? `<small>${note}</small>` : ''}</th><td class="num"><b>${n100(x.risk)}</b>${ci ? `<small>95% interval ${(100 * ci[0]).toFixed(1)}–${(100 * ci[1]).toFixed(1)}</small>` : ''}</td><td class="num">${rng(x.riskMin, x.riskMax)}</td><td>${bar(x.risk, x.riskMin, x.riskMax, maxRisk)}</td><td class="num">${pctl(x.standing)}</td></tr>`);
  if (p.withPartner && !p.withPartner.refused) row(`With ${esc(otherName)}`, p.withPartner, null, p.withPartner.inSupport ? '' : 'includes years outside the data');
  if (p.likely?.available) row('Partners people like you marry', p.likely, p.likely.ci, `${fmtN(p.likely.n)} surveyed marriages; ${p.likely.profiles} partner types covering ${Math.round(100 * p.likely.coverage)}%`);
  if (p.everyone?.available) row('If you dated everyone', p.everyone, p.everyone.ci, `${p.everyone.profiles} partner types from ${fmtN(p.everyone.n)} marriages, weighted by how common they are`);
  if (p.self) row('You alone (this lens scores one person)', p.self, null);
  const median = p.withPartner?.standing?.median ?? p.likely?.standing?.median ?? p.everyone?.standing?.median;
  if (Number.isFinite(median)) rows.push(`<tr class="ref"><th scope="row">The middle couple in the survey<small>population median${(p.withPartner?.standing || p.likely?.standing)?.model ? ' (of the reference model)' : ''}</small></th><td class="num"><b>${n100(median)}</b></td><td></td><td>${bar(median, median, median, maxRisk)}</td><td class="num">p50</td></tr>`);
  const missing = ['everyone', 'likely'].filter((k) => !p[k]?.available).map((k) => `<li><strong>${k === 'likely' ? 'Partners people like you marry' : 'Dating everyone'}:</strong> ${esc(p[k]?.reason || 'not available')}</li>`).join('');
  return `<section class="rep-card" aria-label="${esc(title)}">
    <h3>${esc(title)} <small>${esc(person.sex || '')}${Number.isFinite(person.age) ? `, ${person.age}` : ''}</small></h3>
    <div class="table-wrap"><table class="rep-table"><thead><tr><th scope="col">If married to…</th><th class="num" scope="col">Break-ups by ${fmtYears(h)} y</th><th class="num" scope="col">Model range</th><th scope="col"><span class="vh">Chart</span></th><th class="num" scope="col">Population percentile</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    ${missing ? `<ul class="small rep-miss">${missing}</ul>` : ''}
    ${standingText(p)}
    ${likelyTypes(p)}
    ${lowestBlock(p, h)}
    ${factorBlock(p)}
    ${changesBlock(p)}
  </section>`;
}

function standingText(p) {
  const s = p.withPartner?.standing ? p.withPartner : p.likely?.standing ? p.likely : p.self?.standing ? p.self : p.everyone?.standing ? p.everyone : null;
  if (!s) return '<p class="small">This lens has no population reference at this horizon, so there is no above/below-average comparison.</p>';
  const ab = aboveBelow(s.standing);
  const which = s === p.withPartner ? 'With this partner' : s === p.likely ? 'With the partners people like you marry' : s === p.self ? 'On your own traits' : 'Dating everyone';
  const word = ab === 'above' ? 'higher risk than most' : ab === 'below' ? 'lower risk than most' : 'about average';
  const subs = (s === p.withPartner ? p.withPartner.subgroups : p.likelySubgroups || []).slice(0, 6).map((g) => `${esc(g.label)} ${esc(g.level)}: ${esc(pctl(g))}`).join('; ');
  return `<p class="rep-stand"><strong>Above or below average?</strong> ${which}, ${n100(s.risk)} is ${word} in this lens’s surveyed marriages (${esc(pctl(s.standing))}; the middle couple is ${n100(s.standing.median)}).${subs ? `<small>Within your own groups: ${subs}.</small>` : ''}</p>`;
}

function likelyTypes(p) {
  if (!p.likely?.available) return '';
  const top = p.likely.top.map((t) => `<li><b>${Math.round(100 * t.share)}%</b> ${esc(t.label)} — ${n100(t.risk)} <small>models ${rng(t.riskMin, t.riskMax)}${t.inSupport ? '' : '; outside the data'}</small></li>`).join('');
  return `<h4>Who people like you marry, and their predicted break-ups</h4><ol class="rep-list">${top}</ol>${p.likely.note ? `<p class="small">${esc(p.likely.note)}</p>` : ''}`;
}

function lowestBlock(p, h) {
  const L = p.lowest;
  if (!L || L.reason) return `<h4>Lowest-risk partner profiles</h4><p class="small">${esc(L?.reason || 'Not available.')}</p>`;
  const list = L.list.map((x) => `<li>${esc(x.label)} — <b>${n100(x.risk)}</b> <small>models ${rng(x.riskMin, x.riskMax)}; ${x.beats} of ${L.models} models score it below the person entered${x.inSupport ? '' : '; outside the data'}</small></li>`).join('');
  const spread = L.perModelTop.length ? ` On their own the models’ best profiles range from ${n100(Math.min(...L.perModelTop.map((t) => t.risk)))} to ${n100(Math.max(...L.perModelTop.map((t) => t.risk)))}.` : '';
  const flag = L.distinctTops > 1 ? `<strong>The models disagree:</strong> they put ${L.distinctTops} different profiles first.` : `All ${L.models} models put the same profile first.`;
  return `<h4>Lowest-risk partner profiles (by ${fmtYears(h)} years)</h4><ol class="rep-list">${list}</ol>
    <p class="small">${L.tied} of ${L.considered} searched profiles have a model range overlapping the top one’s, so the models cannot tell them apart. ${flag}${spread}${L.held?.length ? ` Held at the person entered for speed: ${esc(L.held.join(', '))}.` : ''} Profiles vary only the traits this lens models; none is an “ideal partner”.</p>`;
}

function gradeText(g) {
  if (!g) return '<span class="tag">no graded evidence</span>';
  return `<span class="tag${g.causal ? ' causal' : ''}" title="${esc(g.reading)}">${esc(g.designLabel)}</span>`;
}

function factorBlock(p) {
  if (!p.factors.length) return '<h4>Which factors matter most</h4><p class="small">This lens has no partner traits or changes to vary for this profile.</p>';
  const max = Math.max(0.005, ...p.factors.map((f) => f.spread));
  const rows = p.factors.map((f) => `<tr><th scope="row">${esc(f.label)}<small>${f.kind === 'partner' ? 'partner trait' : 'your side'} · ${esc(f.changeable)}</small></th>
    <td class="num">${pts(f.spread)}<small>points</small></td><td class="rep-impcell"><span class="rep-imp" style="width:${(100 * f.spread) / max}%"></span></td>
    <td>${f.spread < 0.0005 ? '<small>no difference in this lens</small>' : `${esc(f.best)}${f.kind === 'partner' ? ` <small>${n100(f.bestRisk)} vs ${n100(f.worstRisk)} at ${esc(f.worst)}</small>` : ''}`}</td><td>${gradeText(f.grade)}</td></tr>`).join('');
  return `<h4>Which factors matter most, for this profile</h4>
    <p class="small">Each row varies one thing across its levels, holding everything else as entered; the size is the gap between its highest- and lowest-risk level, in break-ups per 100. Evidence is the strongest study design behind that factor (reproducibility/decision_evidence/FACTORS.md).</p>
    <div class="table-wrap"><table class="rep-table"><thead><tr><th scope="col">Factor</th><th class="num" scope="col">Size</th><th scope="col"><span class="vh">Bar</span></th><th scope="col">Lowest-risk level</th><th scope="col">Evidence</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function changesBlock(p) {
  const items = (p.changes || []).filter((c) => c.riskDrop >= 0.0005);
  const head = '<h4>The changes with the biggest predicted drop</h4>';
  if (!items.length) return `${head}<p class="small">No change this lens models lowers the predicted risk for this profile (its other inputs are history and background).</p>`;
  const list = items.map((c) => `<li>${esc(c.label)}: <b>${inHundred(c.riskDrop) ? `${inHundred(c.riskDrop)} fewer in 100` : 'under 1 in 100'}</b> <small>models ${pts(c.lo)}–${pts(c.hi)} points; ${c.agree} of ${c.models} agree${c.unchanged ? `; ${c.unchanged} do not move` : ''} · ${esc(c.changeability)} · ${c.grade ? `${esc(c.grade.designLabel)}${c.grade.causal ? '' : ', so an association, not a shown cause'}` : 'no graded evidence, an association'}</small></li>`).join('');
  const comb = p.combined ? `<p class="small">All helpful changes together (${esc(p.combined.labels.join('; '))}): ${pts(p.combined.riskDrop)} fewer per 100, models ${pts(p.combined.lo)}–${pts(p.combined.hi)}.</p>` : '';
  return `${head}<ol class="rep-list">${list}</ol>${comb}`;
}

function acrossTable(lenses, a, b, couple) {
  const cell = (x) => (x.available ? `<b>${n100(x.risk)}</b><small>models ${rng(x.riskMin, x.riskMax)}</small>` : `<small>${esc(x.reason)}</small>`);
  const rowsA = mixAcrossLenses(lenses, a, couple, { template: b, draws: 50 });
  const rowsB = mixAcrossLenses(lenses, b, couple, { template: a, draws: 50 });
  const ids = [...new Set([...rowsA, ...rowsB].map((r) => r.id))];
  if (!ids.length) return '<p class="note">No lens with a partner distribution can score these profiles.</p>';
  const body = ids.map((id) => {
    const x = rowsA.find((r) => r.id === id);
    const y = rowsB.find((r) => r.id === id);
    const any = x || y;
    const na = { available: false, reason: 'no partner mix for this profile' };
    return `<tr><th scope="row">${esc(shortName(any.label, any.id))}<small>by ${fmtYears(any.horizon)} years</small></th><td class="num">${cell(x?.everyone || na)}</td><td class="num">${cell(x?.likely || na)}</td><td class="num">${cell(y?.everyone || na)}</td><td class="num">${cell(y?.likely || na)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="rep-table"><thead><tr><th scope="col">Lens</th><th class="num" scope="col">You: dating everyone</th><th class="num" scope="col">You: likely partners</th><th class="num" scope="col">Them: dating everyone</th><th class="num" scope="col">Them: likely partners</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
