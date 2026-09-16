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

// A visitor arriving from a search for "duplicate payment recovery" has no
// reason to pull an AP export out of their accounting system just to find out
// whether this page is worth the trouble -- so, unlike a calculator whose
// fields already hold numbers, an upload-only tool shows nothing until it is
// already trusted. This ledger is small enough to read at a glance and carries
// one row pair for each of the four things `detectDuplicates` can say, plus
// three rows that correctly stay quiet. It runs the identical
// readRecords -> detectDuplicates -> render path; only the source of the text
// differs.
const EXAMPLE_CSV = `vendor,invoice_number,payment_date,amount
Northwind Office Supply,INV-4471,2026-03-02,1284.00
Northwind Office Supply,INV-4471,2026-03-14,1284.00
Cascade Freight Lines,INV-88120,2026-03-05,2450.00
Cascade Freight Lines,INV-88120,2026-03-09,245.00
Bayline Electrical Supply,INV-70214,2026-02-11,3120.75
Bayline Electrical Supply,INV-70215,2026-03-19,3120.75
Harborview Property Mgmt,INV-2211,2026-03-01,6000.00
Harborview Property Mgmt,INV-7788,2026-03-04,6000.00
Pine Ridge Sanitation,INV-5510,2026-03-06,418.90
Pine Ridge Sanitation,INV-5511,2026-03-20,522.40
Trellis Software,INV-9002,2026-03-10,199.00
`;

function audit(text, event) {
  const { records, hasInvoiceColumn } = readRecords(text);
  const flags = detectDuplicates(records, { dateWindowDays: Number($('window').value) });
  latest = flags;
  render(flags, records.length);
  if (!hasInvoiceColumn) say('No invoice/reference column found — running the same-amount, near-date check only.', false);
  count(event);
  if (flags.some(f => f.confidence === 'high')) count('high_confidence_flag');
}

// #message carries the `error` class, so anything written there reads as a
// failure and is announced as one by `role="alert"`. The example's status line
// is not a failure, so it swaps the class rather than borrowing the styling.
function say(text, isError) {
  $('message').textContent = text;
  $('message').className = isError ? 'error' : 'hint';
}

async function run() {
  say('', true);
  try {
    if (!$('ledger').files[0]) throw new Error('Choose a payment ledger CSV first.');
    audit(await readFile($('ledger')), 'audit_run');
  } catch (error) {
    say(error.message, true);
  }
}

$('run').addEventListener('click', run);
// Counted as its own event rather than as `audit_run`, so the usage figures
// keep "somebody tried the demo" apart from "somebody audited a real ledger".
$('loadExample').addEventListener('click', () => {
  audit(EXAMPLE_CSV, 'example_loaded');
  say('Showing a worked example — choose your own CSV above to audit a real ledger.', false);
});
$('window').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); run(); } });
$('download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([reviewCsv(latest)], { type: 'text/csv' }));
  link.download = 'duplicate-payment-review.csv';
  link.click();
  count('review_exported');
});
$('usage').addEventListener('change', event => { localStorage.setItem('duplicate-payment-audit-disable', event.target.checked ? '0' : '1'); });

// Restore the visitor's usage-counting choice on arrival. The control's own
// change listener above has always written `duplicate-payment-audit-disable`, and the
// recorder has always read it -- the only thing missing was reading it back,
// so the choice came back in its default state and was silently undone.
//
// It reads that key rather than a preference key of its own: a second flag
// would let the recorder and the control disagree, which is the failure this
// is here to remove, not a new way to have it.
(() => {
  // A few ventures import this file under `node --test`, with no DOM or a
  // stub one. Remembering a preference must not be what breaks that.
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;
  if (typeof document.getElementById !== 'function') return;
  const usageControl = document.getElementById('usage');
  if (!usageControl) return;
  try { usageControl.checked = localStorage.getItem('duplicate-payment-audit-disable') !== '1'; }
  catch { /* a browser refusing site data simply does not remember */ }
})();
