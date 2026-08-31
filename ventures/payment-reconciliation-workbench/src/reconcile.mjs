const DATE_NAMES = ['date', 'payout_date', 'deposit_date', 'created', 'transaction_date'];
const AMOUNT_NAMES = ['amount', 'net', 'net_amount', 'deposit', 'deposit_amount', 'payout_amount'];

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
      row = []; cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
  if (rows.length < 2) throw new Error('CSV must include a header and at least one row.');
  return { headers: rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_')), rows: rows.slice(1) };
}

function column(headers, names) { return headers.findIndex(h => names.includes(h)); }
// A blank cell, a bare currency symbol, or whitespace all strip down to an
// empty string. `Number('')` is 0, not NaN, so without the digit check below
// a missing amount silently became a real $0.00 record instead of the
// invalid-row error the tool promises — and a phantom $0.00 payout or
// deposit then sits in the exception queue (or worse, pairs with a genuine
// $0.00 row) instead of the export being sent back for a fix.
function cents(value) { const clean = String(value).replace(/[$€£,\s]/g, ''); if (!/\d/.test(clean)) return NaN; const number = Number(clean); return Number.isFinite(number) ? Math.round(number * 100) : NaN; }
function dateValue(value) { const parsed = Date.parse(value); return Number.isNaN(parsed) ? NaN : parsed; }

export function readRecords(text, label) {
  const csv = parseCsv(text); const dateIndex = column(csv.headers, DATE_NAMES); const amountIndex = column(csv.headers, AMOUNT_NAMES);
  if (dateIndex < 0 || amountIndex < 0) throw new Error(`${label} CSV needs recognizable date and amount columns.`);
  const records = csv.rows.map((row, index) => ({ row: index + 2, date: row[dateIndex], time: dateValue(row[dateIndex]), cents: cents(row[amountIndex]) }));
  if (!records.length || records.some(record => !Number.isFinite(record.time) || !Number.isFinite(record.cents))) throw new Error(`${label} CSV contains a row with an invalid date or amount.`);
  return records;
}

export function reconcile(payouts, deposits, toleranceDays = 3) {
  const available = deposits.map((record, index) => ({ ...record, index, used: false })); const day = 86400000; const matches = [];
  for (const payout of payouts) {
    const candidate = available.filter(deposit => !deposit.used && deposit.cents === payout.cents && Math.abs(deposit.time - payout.time) <= toleranceDays * day).sort((a, b) => Math.abs(a.time - payout.time) - Math.abs(b.time - payout.time))[0];
    if (candidate) { candidate.used = true; matches.push({ status: 'matched', payout, deposit: candidate, deposits: [candidate] }); continue; }
    const nearby = available.filter(deposit => !deposit.used && Math.abs(deposit.time - payout.time) <= toleranceDays * day);
    const grouped = findDepositGroup(nearby, payout.cents);
    if (grouped) {
      grouped.forEach(deposit => { deposit.used = true; });
      matches.push({ status: 'matched', payout, deposit: grouped[0], deposits: grouped });
    } else matches.push({ status: 'unmatched payout', payout });
  }
  available.filter(deposit => !deposit.used).forEach(deposit => matches.push({ status: 'unmatched deposit', deposit, deposits: [deposit] }));
  return explainExceptions(matches, toleranceDays);
}

// A processor payout and its bank deposit legitimately differ whenever the
// processor nets its fee out of the transfer, or a refund lands in the same
// batch. Those rows are the bulk of a real exception list, and the tool used to
// hand them back as two unexplained halves the operator had to line up by eye —
// which is the manual spreadsheet comparison this product exists to remove.
//
// Pairing each unmatched payout with its nearest unmatched deposit and naming
// the gap is what makes the queue actionable. The pairing is a hint, never a
// match: the amounts genuinely disagree, so the operator still has to decide
// whether the difference is a fee they accept or a discrepancy they chase.
const FEE_LIKE_MIN_PERCENT = 0.1;
// Card processors land between roughly 2.5% and 3.5% plus a fixed cent charge.
// Six percent leaves room for a small payout where the fixed charge dominates,
// while still refusing to call a half-missing deposit a fee.
const FEE_LIKE_MAX_PERCENT = 6;

// The hint window is deliberately wider than the match window.
//
// A hint is a lead the operator verifies, not a match the tool asserts, so it
// can afford to look further than the matcher does — and it has to. With both
// windows equal, an exact-amount pair could never produce a hint at all: any
// deposit near enough in date to be hinted would already have been matched in
// the first pass, and one that was not is by definition too far away to look
// at. That made explanation()'s "same amount" reading unreachable in practice,
// even though a deposit the bank posted a few days later than the operator's
// tolerance is the most ordinary exception there is. Those rows came back as
// two unexplained halves with an empty "What to check" column — the row a
// human most wants a word about, and the one the tool said least about.
//
// A week beyond the operator's own tolerance covers the weekend, holiday, and
// month-end settlement delays that cause it, without reaching for arbitrarily
// distant rows. Widening it does not weaken the pairing: candidates are ranked
// closest-amount-first, so an exact match a week out still outranks a wildly
// different amount the next day.
const HINT_EXTRA_DAYS = 7;

export function explainExceptions(matches, toleranceDays = 3) {
  const day = 86400000;
  const hintWindow = (toleranceDays + HINT_EXTRA_DAYS) * day;
  const spare = matches.filter(match => match.status === 'unmatched deposit');
  const claimed = new Set();
  const hints = new Map();
  for (const match of matches) {
    if (match.status !== 'unmatched payout') continue;
    let best = null;
    for (const candidate of spare) {
      if (claimed.has(candidate)) continue;
      if (Math.abs(candidate.deposit.time - match.payout.time) > hintWindow) continue;
      // Closest amount first, then closest date — a deposit a cent away is a
      // far better explanation than one a day closer but hundreds off.
      const rank = best === null ? -1
        : (Math.abs(candidate.deposit.cents - match.payout.cents) - Math.abs(best.deposit.cents - match.payout.cents))
          || (Math.abs(candidate.deposit.time - match.payout.time) - Math.abs(best.deposit.time - match.payout.time));
      if (rank < 0) best = candidate;
    }
    if (!best) continue;
    // One deposit explains at most one payout. Offering the same deposit as the
    // answer to two exceptions would invite double-counting it in the books.
    claimed.add(best);
    const difference = match.payout.cents - best.deposit.cents;
    const percent = match.payout.cents === 0 ? null : (difference / match.payout.cents) * 100;
    const hint = {
      deposit: best.deposit,
      payout: match.payout,
      difference,
      percent,
      // Only a shortfall can be a fee: a deposit larger than its payout is
      // never explained by the processor deducting something.
      feeLike: percent !== null && difference > 0 && percent >= FEE_LIKE_MIN_PERCENT && percent <= FEE_LIKE_MAX_PERCENT,
    };
    hints.set(match, hint);
    hints.set(best, hint);
  }
  return matches.map(match => (hints.has(match) ? { ...match, hint: hints.get(match) } : match));
}

/**
 * One-line plain-English reading of a hint, shared by the table and the CSV.
 *
 * The same hint is attached to both halves of a pair, so the sentence names
 * both dates rather than saying "this payout" — on the deposit row that phrase
 * would point at an empty column.
 */
export function explanation(match) {
  if (!match.hint) return '';
  const { difference, percent, deposit, payout, feeLike } = match.hint;
  const pair = `Payout ${payout.date} pairs with deposit ${deposit.date}`;
  if (difference === 0) {
    // Naming the gap is the whole value of this row: the operator's next action
    // is to widen the tolerance to cover it (or accept that the bank was slow),
    // and they cannot judge that from "outside the tolerance" alone.
    const gap = Math.round(Math.abs(deposit.time - payout.time) / 86400000);
    return `${pair}: same amount, ${gap} day${gap === 1 ? '' : 's'} apart — outside the date tolerance you set, so it was not matched automatically.`;
  }
  const size = (Math.abs(difference) / 100).toFixed(2);
  const share = percent === null ? '' : ` (${Math.abs(percent).toFixed(2)}%)`;
  const direction = difference > 0 ? 'short' : 'over';
  const reading = feeLike
    ? 'consistent with a processor fee deducted from the transfer'
    : 'verify against the processor statement';
  return `${pair}: deposit is ${size}${share} ${direction} — ${reading}.`;
}

function findDepositGroup(candidates, target) {
  // Bound the search so a large export cannot freeze the browser.
  const limited = candidates.slice(0, 18).sort((a, b) => b.cents - a.cents);
  let result;
  function search(start, total, group) {
    if (result) return;
    if (group.length > 1 && total === target) { result = group; return; }
    if (total >= target || group.length === 8) return;
    for (let index = start; index < limited.length; index += 1) {
      search(index + 1, total + limited[index].cents, [...group, limited[index]]);
    }
  }
  search(0, 0, []);
  return result;
}
