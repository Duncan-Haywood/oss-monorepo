export function auditCharges(rows) {
  const seen = new Set();
  return rows.map((row, index) => {
    const billed = Number(row.billed) || 0;
    const expected = Number(row.expected) || 0;
    const key = `${row.invoice}|${row.reference}|${row.code}|${billed.toFixed(2)}`;
    const flags = [];
    if (seen.has(key)) flags.push('Possible duplicate');
    seen.add(key);
    if (billed > expected) flags.push(`Over expected by $${(billed - expected).toFixed(2)}`);
    if (!row.code.trim()) flags.push('Missing accessorial code');
    return { ...row, billed, expected, variance: billed - expected, flags, index };
  });
}

export function auditTotals(results) {
  return results.reduce((totals, row) => ({
    billed: totals.billed + row.billed,
    expected: totals.expected + row.expected,
    flagged: totals.flagged + (row.flags.length ? 1 : 0),
    recoverable: totals.recoverable + Math.max(0, row.variance),
  }), { billed: 0, expected: 0, flagged: 0, recoverable: 0 });
}

export function csvForReview(results) {
  const escape = value => `"${String(value).replaceAll('"', '""')}"`;
  const lines = ['Invoice,Reference,Code,Billed,Expected,Variance,Flags'];
  for (const row of results) {
    lines.push([row.invoice, row.reference, row.code, row.billed.toFixed(2), row.expected.toFixed(2), row.variance.toFixed(2), row.flags.join('; ')].map(escape).join(','));
  }
  return `${lines.join('\n')}\n`;
}
