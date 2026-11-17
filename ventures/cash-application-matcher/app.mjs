import { readInvoices, readReceipts, fmtMoney, fmtDate } from './csv.mjs';
import { applyCash } from './match.mjs';
import { applicationsCsv, openInvoicesCsv } from './export.mjs';
import { count, setEnabled, isEnabled } from './usage.mjs';

const $ = (id) => document.getElementById(id);
let texts = { invoices: '', receipts: '' };
let lastRun = null;

const readFile = (input, slot) => input.addEventListener('change', async () => {
  const f = input.files[0];
  texts[slot] = f ? await f.text() : '';
  $(`${slot}Name`).textContent = f ? f.name : '';
});
readFile($('invoices'), 'invoices');
readFile($('receipts'), 'receipts');

$('loadExample').addEventListener('click', async () => {
  try {
    const [a, b] = await Promise.all(['examples/open-invoices.csv', 'examples/bank-receipts.csv'].map((p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.text(); })));
    texts = { invoices: a, receipts: b };
    $('invoicesName').textContent = 'example: open-invoices.csv (11 made-up invoices)';
    $('receiptsName').textContent = 'example: bank-receipts.csv (8 made-up receipts)';
    run();
  } catch {
    $('message').textContent = 'Could not load the example files. Open the page from the site or a local web server.';
  }
});

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LABEL = { high: 'High', medium: 'Medium', review: 'Review', none: 'Unmatched' };

function run() {
  $('message').textContent = '';
  if (!texts.invoices || !texts.receipts) { $('message').textContent = 'Choose both files first, or load the worked example.'; return; }
  const opts = { dayFirst: $('dayFirst').checked };
  const inv = readInvoices(texts.invoices, opts);
  const rec = readReceipts(texts.receipts, opts);
  const warnings = [...inv.warnings, ...rec.warnings];
  if (!inv.invoices.length || !rec.receipts.length) { $('message').textContent = warnings.join(' ') || 'No open invoices or incoming payments found.'; return; }
  const fee = Number($('fee').value);
  const run = applyCash(inv.invoices, rec.receipts, { feeTolerance: Number.isFinite(fee) && fee >= 0 ? Math.round(fee * 100) : 2500, allowDiscounts: $('discounts').checked });
  lastRun = run;
  const s = run.summary;
  $('sHigh').textContent = s.high;
  $('sMedium').textContent = s.medium;
  $('sReview').textContent = s.review;
  $('sNone').textContent = s.unmatched;
  $('sApplied').textContent = `${fmtMoney(s.appliedCents)} of ${fmtMoney(s.receivedCents)} applied; ${fmtMoney(s.discountCents)} in early-payment discounts; ${fmtMoney(s.unappliedCents)} unapplied; ${run.openInvoices.length} invoices still open.`;
  $('warnings').textContent = warnings.slice(0, 5).join(' ');
  const rows = run.results.map((x) => {
    const r = x.receipt;
    const apps = x.applications.map((a) => `${esc(a.invoice)} <span class="muted">${esc(a.customer)}</span> ${fmtMoney(a.applied)}${a.discount ? ` <span class="tag">disc ${fmtMoney(a.discount)}</span>` : ''}${a.writeoff ? ` <span class="tag">fee ${fmtMoney(a.writeoff)}</span>` : ''}${a.leftOpen ? ` <span class="tag">${fmtMoney(a.leftOpen)} left open</span>` : ''}`).join('<br>') || '<span class="muted">nothing applied</span>';
    return `<tr class="c-${x.confidence}"><td>${esc(fmtDate(r.date))}</td><td>${esc(r.payer || '(blank)')}<br><span class="muted">${esc(r.reference)}</span></td><td class="num">${fmtMoney(r.amount)}</td><td>${apps}</td><td><strong>${Object.hasOwn(LABEL, x.confidence) ? LABEL[x.confidence] : x.confidence}</strong><br><span class="muted">${esc(x.method)}</span></td><td>${esc(x.note)}</td></tr>`;
  }).join('');
  $('table').innerHTML = `<div class="scroll"><table><thead><tr><th>Date</th><th>Payer and remittance</th><th>Amount</th><th>Proposed application</th><th>Confidence</th><th>What to check</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $('results').hidden = false;
  count('match_run');
  if (s.review + s.unmatched > 0) count('exceptions_listed');
}

const download = (name, text) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('run').addEventListener('click', run);
$('downloadApps').addEventListener('click', () => { if (lastRun) { download('cash-applications.csv', applicationsCsv(lastRun)); count('applications_exported'); } });
$('downloadOpen').addEventListener('click', () => { if (lastRun) { download('still-open-invoices.csv', openInvoicesCsv(lastRun)); count('open_invoices_exported'); } });
$('usage').checked = isEnabled();
$('usage').addEventListener('change', () => setEnabled($('usage').checked));
