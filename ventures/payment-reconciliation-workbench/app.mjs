import { readRecords, reconcile, explanation } from './reconcile.mjs';
import { reviewCsv, depositDates } from './export.mjs';
import { count } from './usage.mjs';
const $ = id => document.getElementById(id); let latest = [];
function readFile(input) { return input.files[0]?.text(); }
function money(cents) { return (cents / 100).toFixed(2); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function render(matches) { $('matched').textContent = matches.filter(x => x.status === 'matched').length; $('unmatchedPayouts').textContent = matches.filter(x => x.status === 'unmatched payout').length; $('unmatchedDeposits').textContent = matches.filter(x => x.status === 'unmatched deposit').length; $('explained').textContent = matches.filter(x => x.status === 'unmatched payout' && x.hint).length; $('table').innerHTML = `<table><thead><tr><th>Status</th><th>Payout date</th><th>Deposit date</th><th>Amount</th><th>What to check</th></tr></thead><tbody>${matches.map(x => `<tr><td>${escapeHtml(x.status)}${x.deposits?.length > 1 ? ' (grouped)' : ''}</td><td>${escapeHtml(x.payout?.date || '')}</td><td>${escapeHtml(depositDates(x))}</td><td>${money((x.payout || x.deposit).cents)}</td><td>${escapeHtml(explanation(x))}</td></tr>`).join('')}</tbody></table>`; $('results').hidden = false; }
async function run() { $('message').textContent = ''; try { if (!$('payouts').files[0] || !$('deposits').files[0]) throw new Error('Choose both a processor payouts CSV and a bank deposits CSV.'); const payouts = readRecords(await readFile($('payouts')), 'Processor payouts'); const deposits = readRecords(await readFile($('deposits')), 'Bank deposits'); latest = reconcile(payouts, deposits, Number($('tolerance').value)); render(latest); count('reconciliation_run'); if (latest.some(x => x.status === 'unmatched payout' && x.hint)) count('exceptions_explained'); } catch (error) { $('message').textContent = error.message; } }
$('run').addEventListener('click', run);
// #tolerance sits outside a <form>, so its own Enter key does nothing by
// default. Once results are already showing, editing the tolerance and
// pressing Enter -- the natural close-out on a phone's numeric keypad --
// must re-run the match, or the table keeps showing results from the old
// tolerance with nothing on screen to say they are stale.
$('tolerance').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); run(); } });
$('download').addEventListener('click', () => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([reviewCsv(latest)], { type: 'text/csv' })); link.download = 'reconciliation-review.csv'; link.click(); count('review_exported'); });
$('usage').addEventListener('change', event => { localStorage.setItem('payment-reconciliation-disable', event.target.checked ? '0' : '1'); });
