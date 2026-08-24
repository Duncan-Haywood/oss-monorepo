const DATE_NAMES = ['date', 'payout_date', 'deposit_date', 'created', 'transaction_date'];
const AMOUNT_NAMES = ['amount', 'net', 'net_amount', 'deposit', 'deposit_amount', 'payout_amount'];

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const cells = []; let cell = ''; let quoted = false;
    for (const char of line) { if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; } else cell += char; }
    cells.push(cell.trim()); return cells;
  });
  if (rows.length < 2) throw new Error('CSV must include a header and at least one row.');
  return { headers: rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_')), rows: rows.slice(1) };
}

function column(headers, names) { return headers.findIndex(h => names.includes(h)); }
function cents(value) { const clean = String(value).replace(/[$€£,\s]/g, ''); const number = Number(clean); return Number.isFinite(number) ? Math.round(number * 100) : NaN; }
function dateValue(value) { const parsed = Date.parse(value); return Number.isNaN(parsed) ? NaN : parsed; }

export function readRecords(text, label) {
  const csv = parseCsv(text); const dateIndex = column(csv.headers, DATE_NAMES); const amountIndex = column(csv.headers, AMOUNT_NAMES);
  if (dateIndex < 0 || amountIndex < 0) throw new Error(`${label} CSV needs recognizable date and amount columns.`);
  return csv.rows.map((row, index) => ({ row: index + 2, date: row[dateIndex], time: dateValue(row[dateIndex]), cents: cents(row[amountIndex]) })).filter(record => Number.isFinite(record.time) && Number.isFinite(record.cents));
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
