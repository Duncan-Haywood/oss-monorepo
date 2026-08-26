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
function cents(value) { const clean = String(value).replace(/[$€£,\s]/g, ''); const number = Number(clean); return Number.isFinite(number) ? Math.round(number * 100) : NaN; }
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
    if (candidate) { candidate.used = true; matches.push({ status: 'matched', payout, deposit: candidate }); } else matches.push({ status: 'unmatched payout', payout });
  }
  available.filter(deposit => !deposit.used).forEach(deposit => matches.push({ status: 'unmatched deposit', deposit }));
  return matches;
}
