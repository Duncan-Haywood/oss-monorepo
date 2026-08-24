// Build a spreadsheet-friendly export from the same rows shown in the UI.
// This stays pure so exporting never needs to send seller inputs anywhere.
const columns = [
  ['Item price', row => row.price.toFixed(2)],
  ['Price change', row => `${row.offset}%`],
  ['Batch net profit', row => row.profit.toFixed(2)],
  ['Profit per unit', row => row.unitProfit.toFixed(2)],
  ['Net margin', row => `${row.margin.toFixed(1)}%`],
  ['Change vs current', row => row.profitDelta.toFixed(2)],
  ['Units', row => String(row.quantity)],
];

function csvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function repricingCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('At least one repricing row is required');
  return [
    columns.map(([heading]) => heading),
    ...rows.map(row => columns.map(([, value]) => value(row))),
  ].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}
