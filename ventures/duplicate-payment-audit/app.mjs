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
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How close do a payout and a deposit have to be to count as a match?","acceptedAnswer":{"@type":"Answer","text":"The same amount to the cent, landing within the date tolerance you set (default 3 days, adjustable up to 30). A payout that settles a few days after the customer payment is expected; the tolerance is there for that gap, not to paper over a real discrepancy."}},{"@type":"Question","name":"What if one payout was deposited as several smaller amounts?","acceptedAnswer":{"@type":"Answer","text":"The tool also checks whether a payout matches the sum of several nearby bank deposits, searching up to the first 18 eligible deposits per payout to keep the browser work bounded. Each deposit can only explain one payout, so a single deposit is never counted toward two different exceptions. See why one payout shows up as two bank deposits for a worked example, including what happens when the split does not add up exactly."}},{"@type":"Question","name":"What does the \"What to check\" column mean?","acceptedAnswer":{"@type":"Answer","text":"Where an unmatched payout has a nearby deposit that could explain it, the workbench pairs them and states the gap in money and as a percentage. If that gap falls in the roughly 0.1%–6% range typical of card-processor fees, it says so. Where the amount is exactly right but the deposit landed later than your tolerance allows, it says that instead and names the gap in days, so you can decide whether to widen the tolerance and re-run. Either way this is a lead to verify against your processor statement, not a confirmed match."}},{"@type":"Question","name":"Why is a payout unmatched when the deposit is the right amount?","acceptedAnswer":{"@type":"Answer","text":"Because the deposit landed outside the date tolerance you set. Banks post a few days after the processor releases a payout, and weekends, holidays, and month-end batches stretch that further. The workbench looks a week past your tolerance when it pairs exceptions, so a row like this reads \"same amount, 5 days apart — outside the date tolerance you set\" rather than leaving the What to check column empty. Raise the tolerance to cover the gap and run it again, and the pair matches outright."}},{"@type":"Question","name":"Does it recognize my processor's CSV format automatically?","acceptedAnswer":{"@type":"Answer","text":"It looks for common header names — date, payout_date, deposit_date, net, and amount — which cover typical Stripe, Square, and PayPal exports. If your export uses different column names, rename the header row before uploading."}},{"@type":"Question","name":"Is this an accounting system or does it move money?","acceptedAnswer":{"@type":"Answer","text":"No. It is a local, browser-only review aid that reads two CSV files you choose and produces an exception list. It does not connect to any payment provider, does not move money, and is not a system of record — download the review CSV if you need to keep the result."}},{"@type":"Question","name":"Are my payout and bank files uploaded anywhere?","acceptedAnswer":{"@type":"Answer","text":"No. Everything runs in your browser; the files never leave your device. The optional usage counter records only that a reconciliation ran, not any amounts, dates, or file contents."}},{"@type":"Question","name":"How is this different from Synder, A2X, or another paid sync tool?","acceptedAnswer":{"@type":"Answer","text":"Those connect live to your payment processor and your accounting platform and keep posting transactions automatically, every day, on a paid plan. This workbench has no connection: you choose two CSV files you already exported, it matches them once in your browser, and nothing is kept between runs unless you download the review CSV. See this workbench vs. Synder for the full comparison."}}]}// Remember the visitor's usage-counting choice between visits. The// control gates the counter correctly and was never stored, so it came// back in its default state and the choice was silently undone -- a// control that quietly stops working is worse than none, because the// visitor believes they have already used it. Polarity-agnostic on// purpose: this page's control may mean "count me" or "do not", and// what has to survive is whichever the visitor chose.(() => {  const usagePreference = 'duplicate-payment-audit-usage-preference';  const usageControl = document.getElementById('usage');  if (!usageControl) return;  try {    const saved = localStorage.getItem(usagePreference);    if (saved !== null) usageControl.checked = saved === '1';  } catch { /* a browser refusing site data simply does not remember */ }  usageControl.addEventListener('change', () => {    try { localStorage.setItem(usagePreference, usageControl.checked ? '1' : '0'); }    catch { /* as above */ }  });})();