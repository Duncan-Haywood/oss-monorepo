import { readRecords, reconcile, explanation } from './reconcile.mjs';
import { reviewCsv, depositDates } from './export.mjs';
import { count } from './usage.mjs';
const $ = id => document.getElementById(id); let latest = [];
function readFile(input) { return input.files[0]?.text(); }
function money(cents) { return (cents / 100).toFixed(2); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function render(matches) { $('matched').textContent = matches.filter(x => x.status === 'matched').length; $('unmatchedPayouts').textContent = matches.filter(x => x.status === 'unmatched payout').length; $('unmatchedDeposits').textContent = matches.filter(x => x.status === 'unmatched deposit').length; $('explained').textContent = matches.filter(x => x.status === 'unmatched payout' && x.hint).length; $('table').innerHTML = `<table><thead><tr><th>Status</th><th>Payout date</th><th>Deposit date</th><th>Amount</th><th>What to check</th></tr></thead><tbody>${matches.map(x => `<tr><td>${escapeHtml(x.status)}${x.deposits?.length > 1 ? ' (grouped)' : ''}</td><td>${escapeHtml(x.payout?.date || '')}</td><td>${escapeHtml(depositDates(x))}</td><td>${money((x.payout || x.deposit).cents)}</td><td>${escapeHtml(explanation(x))}</td></tr>`).join('')}</tbody></table>`; $('results').hidden = false; }
// This tool needs *two* exports before it does anything at all -- a processor
// payout file and a bank statement -- so the cost of finding out whether it
// helps is higher here than anywhere else in the catalogue, and a first-time
// visitor pays it entirely on faith. These two fixtures are small enough to
// read side by side and are built so the run produces one row of each shape
// the reconciler can emit: an exact match, a payout the bank split across two
// deposits, an exception whose gap looks like a processor fee, a payout with
// no deposit near it, and a deposit nothing explains.
const EXAMPLE_PAYOUTS = `payout_date,net
2026-03-02,1420.00
2026-03-05,2310.50
2026-03-09,890.00
2026-03-16,1750.00
`;
const EXAMPLE_DEPOSITS = `deposit_date,amount
2026-03-03,1420.00
2026-03-06,1200.00
2026-03-06,1110.50
2026-03-10,864.35
2026-03-30,455.00
`;

// #message carries the `error` class and role="alert", so the example's status
// line swaps the class rather than announcing itself as a failure.
function say(text, isError) { $('message').textContent = text; $('message').className = isError ? 'error' : 'hint'; }

function reconcileText(payoutsText, depositsText, event) {
  const payouts = readRecords(payoutsText, 'Processor payouts');
  const deposits = readRecords(depositsText, 'Bank deposits');
  latest = reconcile(payouts, deposits, Number($('tolerance').value));
  render(latest);
  count(event);
  if (latest.some(x => x.status === 'unmatched payout' && x.hint)) count('exceptions_explained');
}

async function run() { say('', true); try { if (!$('payouts').files[0] || !$('deposits').files[0]) throw new Error('Choose both a processor payouts CSV and a bank deposits CSV.'); reconcileText(await readFile($('payouts')), await readFile($('deposits')), 'reconciliation_run'); } catch (error) { say(error.message, true); } }
$('run').addEventListener('click', run);
// Its own event, so the usage figures keep a demo run apart from a real one.
$('loadExample').addEventListener('click', () => { reconcileText(EXAMPLE_PAYOUTS, EXAMPLE_DEPOSITS, 'example_loaded'); say('Showing a worked example — choose your own two CSVs above to reconcile real books.', false); });
// #tolerance sits outside a <form>, so its own Enter key does nothing by
// default. Once results are already showing, editing the tolerance and
// pressing Enter -- the natural close-out on a phone's numeric keypad --
// must re-run the match, or the table keeps showing results from the old
// tolerance with nothing on screen to say they are stale.
$('tolerance').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); run(); } });
$('download').addEventListener('click', () => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([reviewCsv(latest)], { type: 'text/csv' })); link.download = 'reconciliation-review.csv'; link.click(); count('review_exported'); });
$('usage').addEventListener('change', event => { localStorage.setItem('payment-reconciliation-disable', event.target.checked ? '0' : '1'); });
