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
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How close do a payout and a deposit have to be to count as a match?","acceptedAnswer":{"@type":"Answer","text":"The same amount to the cent, landing within the date tolerance you set (default 3 days, adjustable up to 30). A payout that settles a few days after the customer payment is expected; the tolerance is there for that gap, not to paper over a real discrepancy."}},{"@type":"Question","name":"What if one payout was deposited as several smaller amounts?","acceptedAnswer":{"@type":"Answer","text":"The tool also checks whether a payout matches the sum of several nearby bank deposits, searching up to the first 18 eligible deposits per payout to keep the browser work bounded. Each deposit can only explain one payout, so a single deposit is never counted toward two different exceptions. See why one payout shows up as two bank deposits for a worked example, including what happens when the split does not add up exactly."}},{"@type":"Question","name":"What does the \"What to check\" column mean?","acceptedAnswer":{"@type":"Answer","text":"Where an unmatched payout has a nearby deposit that could explain it, the workbench pairs them and states the gap in money and as a percentage. If that gap falls in the roughly 0.1%–6% range typical of card-processor fees, it says so. Where the amount is exactly right but the deposit landed later than your tolerance allows, it says that instead and names the gap in days, so you can decide whether to widen the tolerance and re-run. Either way this is a lead to verify against your processor statement, not a confirmed match."}},{"@type":"Question","name":"Why is a payout unmatched when the deposit is the right amount?","acceptedAnswer":{"@type":"Answer","text":"Because the deposit landed outside the date tolerance you set. Banks post a few days after the processor releases a payout, and weekends, holidays, and month-end batches stretch that further. The workbench looks a week past your tolerance when it pairs exceptions, so a row like this reads \"same amount, 5 days apart — outside the date tolerance you set\" rather than leaving the What to check column empty. Raise the tolerance to cover the gap and run it again, and the pair matches outright."}},{"@type":"Question","name":"Does it recognize my processor's CSV format automatically?","acceptedAnswer":{"@type":"Answer","text":"It looks for common header names — date, payout_date, deposit_date, net, and amount — which cover typical Stripe, Square, and PayPal exports. If your export uses different column names, rename the header row before uploading."}},{"@type":"Question","name":"Is this an accounting system or does it move money?","acceptedAnswer":{"@type":"Answer","text":"No. It is a local, browser-only review aid that reads two CSV files you choose and produces an exception list. It does not connect to any payment provider, does not move money, and is not a system of record — download the review CSV if you need to keep the result."}},{"@type":"Question","name":"Are my payout and bank files uploaded anywhere?","acceptedAnswer":{"@type":"Answer","text":"No. Everything runs in your browser; the files never leave your device. The optional usage counter records only that a reconciliation ran, not any amounts, dates, or file contents."}},{"@type":"Question","name":"How is this different from Synder, A2X, or another paid sync tool?","acceptedAnswer":{"@type":"Answer","text":"Those connect live to your payment processor and your accounting platform and keep posting transactions automatically, every day, on a paid plan. This workbench has no connection: you choose two CSV files you already exported, it matches them once in your browser, and nothing is kept between runs unless you download the review CSV. See this workbench vs. Synder for the full comparison."}}]}// Remember the visitor's usage-counting choice between visits. The// control gates the counter correctly and was never stored, so it came// back in its default state and the choice was silently undone -- a// control that quietly stops working is worse than none, because the// visitor believes they have already used it. Polarity-agnostic on// purpose: this page's control may mean "count me" or "do not", and// what has to survive is whichever the visitor chose.(() => {  const usagePreference = 'payment-reconciliation-workbench-usage-preference';  const usageControl = document.getElementById('usage');  if (!usageControl) return;  try {    const saved = localStorage.getItem(usagePreference);    if (saved !== null) usageControl.checked = saved === '1';  } catch { /* a browser refusing site data simply does not remember */ }  usageControl.addEventListener('change', () => {    try { localStorage.setItem(usagePreference, usageControl.checked ? '1' : '0'); }    catch { /* as above */ }  });})();