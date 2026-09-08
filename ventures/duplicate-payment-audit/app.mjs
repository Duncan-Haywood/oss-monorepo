import { readRecords, detectDuplicates, money } from './detect.mjs';
import { reviewCsv } from './export.mjs';
import { count } from './usage.mjs';

const $ = id => document.getElementById(id);
let latest = [];

function readFile(input) { return input.files[0]?.text(); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

function render(flags, recordCount) {
  $('checked').textContent = recordCount;
  $('flagged').textContent = flags.length;
  $('highConfidence').textContent = flags.filter(f => f.confidence === 'high').length;
  $('table').innerHTML = flags.length
    ? `<table><thead><tr><th>Confidence</th><th>Row A</th><th>Row B</th><th>Amount</th><th>What to check</th></tr></thead><tbody>${flags.map(f => `<tr><td>${escapeHtml(f.confidence)}</td><td>${f.a.row} (${escapeHtml(f.a.date)})</td><td>${f.b.row} (${escapeHtml(f.b.date)})</td><td>$${money(f.a.cents)}</td><td>${escapeHtml(f.reason)}</td></tr>`).join('')}</tbody></table>`
    : '<p>No likely duplicates found in this file.</p>';
  $('results').hidden = false;
}

async function run() {
  $('message').textContent = '';
  try {
    if (!$('ledger').files[0]) throw new Error('Choose a payment ledger CSV first.');
    const { records, hasInvoiceColumn } = readRecords(await readFile($('ledger')));
    const flags = detectDuplicates(records, { dateWindowDays: Number($('window').value) });
    latest = flags;
    render(flags, records.length);
    if (!hasInvoiceColumn) $('message').textContent = 'No invoice/reference column found — running the same-amount, near-date check only.';
    count('audit_run');
    if (flags.some(f => f.confidence === 'high')) count('high_confidence_flag');
  } catch (error) {
    $('message').textContent = error.message;
  }
}

$('run').addEventListener('click', run);
$('window').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); run(); } });
$('download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([reviewCsv(latest)], { type: 'text/csv' }));
  link.download = 'duplicate-payment-review.csv';
  link.click();
  count('review_exported');
});
$('usage').addEventListener('change', event => { localStorage.setItem('duplicate-payment-audit-disable', event.target.checked ? '0' : '1'); });
