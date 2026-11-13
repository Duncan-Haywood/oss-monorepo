import { audit, summarize, formatMoney, parseLimitList } from './benford.mjs';
import { readLedger, flaggedToCsv } from './csv.mjs';
import { exampleCsv } from './example.mjs';
import { count, enabled, setEnabled } from './usage.mjs';

const $ = (id) => document.getElementById(id);
let text = '';
let lastResult = null;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const pfmt = (p) => (p === null || p === undefined ? '-' : p < 1e-4 ? p.toExponential(1) : p.toFixed(4));
const verdictClass = (v) => (v ? `verdict-${v.split(' ')[0]}` : '');

function table(head, rows, numeric = []) {
  const th = head.map((h, i) => `<th${numeric.includes(i) ? ' class="num"' : ''}>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Observed bars with an expected line, as inline SVG. */
function chart(test, title) {
  const W = 640;
  const H = 220;
  const pad = { l: 34, r: 8, t: 22, b: 26 };
  const rows = test.rows;
  const max = Math.max(...rows.map((r) => Math.max(r.observed, r.expected))) * 1.1 || 1;
  const bw = (W - pad.l - pad.r) / rows.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bars = rows.map((r, i) => {
    const x = pad.l + i * bw;
    const hot = r.significant && r.diff > 0 ? ' hot' : '';
    return `<rect class="bar${hot}" x="${(x + bw * 0.12).toFixed(1)}" y="${y(r.observed).toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${(y(0) - y(r.observed)).toFixed(1)}"><title>${r.digit}: ${pct(r.observed)} observed, ${pct(r.expected)} expected, z ${r.z.toFixed(2)}</title></rect>`;
  }).join('');
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${(pad.l + (i + 0.5) * bw).toFixed(1)},${y(r.expected).toFixed(1)}`).join(' ');
  const step = rows.length > 20 ? 10 : 1;
  const labels = rows.map((r, i) => (i % step === 0 ? `<text x="${(pad.l + (i + 0.5) * bw).toFixed(1)}" y="${H - 8}" text-anchor="middle">${r.digit}</text>` : '')).join('');
  const ticks = [0, max / 2, max].map((v) => `<text x="${pad.l - 4}" y="${y(v) + 3}" text-anchor="end">${(v * 100).toFixed(max < 0.1 ? 1 : 0)}%</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: observed against Benford expected"><text x="${pad.l}" y="14" font-weight="700">${esc(title)}</text>${ticks}${bars}<path class="exp" d="${line}"/>${labels}</svg>`;
}

function fillColumns(header, ledger) {
  const opts = header.map((h, i) => `<option value="${i}">${esc(h || `column ${i + 1}`)}</option>`).join('');
  $('amountCol').innerHTML = opts;
  $('groupCol').innerHTML = `<option value="-1">(none)</option>${opts}`;
  $('amountCol').value = String(ledger.amountColumn);
  $('groupCol').value = String(ledger.groupColumn);
}

function load(csv, name) {
  text = csv;
  const ledger = readLedger(text);
  if (!ledger.header.length) { $('message').textContent = 'That file looks empty.'; return; }
  fillColumns(ledger.header, ledger);
  $('fileInfo').textContent = `${name}: ${ledger.records.length.toLocaleString('en-US')} rows, ${ledger.header.length} columns.`;
  $('message').textContent = ledger.amountColumn < 0 ? 'No amount column found automatically: choose one above.' : '';
}

function run() {
  $('message').textContent = '';
  if (!text) { $('message').textContent = 'Choose a CSV first, or load the worked example.'; return; }
  const amountColumn = Number($('amountCol').value);
  if (!(amountColumn >= 0)) { $('message').textContent = 'Choose the amount column.'; return; }
  const ledger = readLedger(text, { amountColumn, groupColumn: Number($('groupCol').value) });
  const thresholds = parseLimitList($('thresholds').value);
  const result = audit(ledger.records, {
    sign: $('sign').value,
    minAmount: Math.max(0, Number($('minAmount').value) || 0),
    thresholds,
    groupMin: Math.max(10, Number($('groupMin').value) || 50),
  });
  if (!result.first.n) { $('message').textContent = 'No amounts left to test. Check the amount column and the sign and minimum filters.'; return; }
  lastResult = result;
  render(result);
  count('audit_run');
  if (result.flagged.length) count('records_flagged');
}

function render(r) {
  $('results').hidden = false;
  $('nTested').textContent = r.first.n.toLocaleString('en-US');
  $('firstMad').innerHTML = `${r.first.mad.toFixed(4)} <small class="${verdictClass(r.first.verdict)}">${esc(r.first.verdict)}</small>`;
  $('firstTwoMad').innerHTML = `${r.firstTwo.mad.toFixed(4)} <small class="${verdictClass(r.firstTwo.verdict)}">${esc(r.firstTwo.verdict)}</small>`;
  $('nFlagged').textContent = r.flagged.length.toLocaleString('en-US');
  $('summary').textContent = summarize(r);
  $('warnings').innerHTML = r.applicability.notes.map((n) => `<p class="warn">${esc(n)}</p>`).join('');

  $('chartFirstTwo').innerHTML = chart(r.firstTwo, 'First two digits (10-99)');
  $('firstTwoStats').textContent = `MAD ${r.firstTwo.mad.toFixed(4)} (${r.firstTwo.verdict}; sampling noise alone would give about ${r.firstTwo.expectedMad.toFixed(4)} at this size). Chi-square ${r.firstTwo.chiSquare.toFixed(1)} on 89 df, p ${pfmt(r.firstTwo.p)}.`;
  $('chartFirst').innerHTML = chart(r.first, 'First digit');
  $('chartSecond').innerHTML = chart(r.second, 'Second digit');
  $('firstTable').innerHTML = table(['Test', 'n', 'MAD', 'Verdict', 'Chi-square', 'df', 'p'],
    [r.first, r.second, r.firstTwo, r.lastTwo].map((t) => [
      { first: 'First digit', second: 'Second digit', firstTwo: 'First two digits', lastTwo: `Last two digits (${t.basis || ''})` }[t.test],
      t.n.toLocaleString('en-US'), t.mad.toFixed(4), t.verdict ? `<span class="${verdictClass(t.verdict)}">${esc(t.verdict)}</span>` : 'no MAD bands; read chi-square',
      t.chiSquare.toFixed(1), t.df, pfmt(t.p),
    ]), [1, 2, 4, 5, 6]);

  $('thresholdTable').innerHTML = r.thresholds.length
    ? table(['Limit', 'Just under', 'Just over', 'Expected under', 'p', ''],
      r.thresholds.map((t) => [formatMoney(t.threshold), t.below, t.above, t.expectedBelow.toFixed(1), pfmt(t.p), t.flagged ? '<strong class="verdict-nonconformity">piles up under</strong>' : '']), [0, 1, 2, 3, 4])
    : '<p class="hint">Enter one or more approval limits above to run this test.</p>';

  $('groupTable').innerHTML = r.groups.rows.length
    ? table(['Group', 'n', 'Total', 'MAD', 'Excess MAD', 'Most off digit', 'p', 'q', ''],
      r.groups.rows.slice(0, 50).map((g) => [esc(g.group), g.n, formatMoney(Math.round(g.total)), g.mad.toFixed(3), g.excessMad.toFixed(3), `${g.worstDigit} (${g.worstDiff > 0 ? '+' : ''}${(g.worstDiff * 100).toFixed(0)} pts)`, pfmt(g.p), pfmt(g.q), g.flagged ? '<strong class="verdict-nonconformity">departs</strong>' : '']), [1, 2, 3, 4, 6, 7])
      + (r.groups.rows.length > 50 ? `<p class="hint">Showing 50 of ${r.groups.rows.length}.</p>` : '')
    : `<p class="hint">${r.groups.groups ? `No group has ${r.groups.min} or more amounts; lower "Smallest group to rank" to include smaller ones (their tests are weaker).` : 'Choose a "Group by" column to rank vendors, employees or cards.'}</p>`;

  $('dupTable').innerHTML = r.duplication.rows.length
    ? `<h3>Most repeated amounts</h3>${table(['Amount', 'Times', 'Total', 'Groups'], r.duplication.rows.map((d) => [formatMoney(d.amount), d.count, formatMoney(d.total), esc(d.groups.join(', '))]), [0, 1, 2])}`
    : '<p>No amount appears more than once.</p>';
  const rd = r.round;
  $('roundStats').innerHTML = `<h3>Round numbers</h3><p>${pct(rd.wholeShare)} whole-currency amounts, ${pct(rd.hundredsShare)} multiples of 100, ${pct(rd.thousandsShare)} multiples of 1,000. Estimates and invented figures tend to be round; invoices for goods rarely are.</p>
    <h3>Last two digits</h3><p>Read on ${esc(r.lastTwo.basis)}: chi-square ${r.lastTwo.chiSquare.toFixed(1)} on 99 df, p ${pfmt(r.lastTwo.p)}. Expected uniform (1% each). A low p usually means rounding or repeated amounts.</p>`;

  $('sumTable').innerHTML = r.summation.outliers.length
    ? table(['First two digits', 'Share of total', 'Times expected', 'Records', 'Largest amounts (row)'],
      r.summation.outliers.slice(0, 15).map((s) => [s.digits, pct(s.share), s.ratio.toFixed(1), s.count, s.largest.map((x) => `${formatMoney(x.value)} (row ${x.row})`).join(', ')]), [1, 2, 3])
    : '<p>No bin holds twice its expected share of the total.</p>';

  $('flaggedTable').innerHTML = r.flagged.length
    ? table(['Row', 'Amount', 'Group', 'Tests', 'Why'], r.flagged.slice(0, 200).map((f) => [f.row, formatMoney(f.amount), esc(f.group), f.score, esc(f.reasons.join('; '))]), [0, 1, 3])
    : '<p>No record was caught by any test.</p>';
}

$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  load(await f.text(), f.name);
});
$('loadExample').addEventListener('click', () => {
  load(exampleCsv(), 'worked example (synthetic)');
  run();
  count('example_loaded');
});
$('run').addEventListener('click', run);
for (const id of ['minAmount', 'thresholds', 'groupMin']) {
  $(id).addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); run(); } });
}
$('download').addEventListener('click', () => {
  if (!lastResult) return;
  const blob = new Blob([flaggedToCsv(lastResult.flagged)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'benford-flagged-records.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  count('flagged_exported');
});
$('print').addEventListener('click', () => { count('report_printed'); window.print(); });
$('usage').checked = enabled();
$('usage').addEventListener('change', (e) => setEnabled(e.target.checked));
