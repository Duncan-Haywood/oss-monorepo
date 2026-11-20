// CSV input: line splitting, number cells (decimal comma), and series parsing.
// Split out of engine.mjs (quality round 89, 2026-11-19: engine.mjs had grown to 3,004 lines); engine.mjs re-exports
// every name here, so existing imports keep working.


/** Split one CSV line, honouring double quotes. */
export function splitLine(line, semi = false) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (semi ? (c === ';' || c === '\t') : (c === ',' || c === '\t' || c === ';')) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export const numCell = (s, decimalComma = false) => {
  if (s == null) return NaN;
  if (decimalComma) {
    const t = String(s).replace(/[$\s.]/g, '').replace(',', '.');
    return t === '' ? NaN : Number(t);
  }
  // Read a comma by its shape (platform/ci/check_money_comma.py): thousands commas are dropped, a decimal comma
  // ('29,99' from an EU-locale export) becomes a point, and any other comma is not a number (the row is skipped).
  const t = String(s).replace(/[$\s]/g, '');
  if (!t.includes(',')) return t === '' ? NaN : Number(t);
  const m = /^([+-]?)(.*)$/.exec(t), sign = m[1], body = m[2];
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(body)) return Number(sign + body.split(',').join(''));
  if (/^(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$/.test(body)) return Number(sign + body.split('.').join('').replace(',', '.'));
  return NaN;
};

/**
 * Parse CSV text into { labels, values, column, skipped }. A header row is
 * detected when its value cell is not a number. Rows whose value is blank or
 * not numeric are skipped and counted.
 */
export function parseSeries(csv, column = null, labelColumn = null) {
  const lines = String(csv ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) throw new Error('No data: paste a column of numbers or a CSV.');
  // A semicolon-separated file (Excel in a comma-decimal locale) writes 1,5 for 1.5: split on ; only and read the comma as a decimal point.
  const semi = lines.some((l) => l.replace(/"[^"]*"/g, '').includes(';'));
  const rows = lines.map((l) => splitLine(l, semi));
  const num = (s) => numCell(s, semi);
  let width = 0;
  for (const r of rows) if (r.length > width) width = r.length; // a loop, not a spread: spreading every row into one call overflows the stack past ~125k rows
  const first = rows[0];
  const header = first.some((c) => c !== '' && Number.isNaN(num(c))) ? first : null;
  const body = header ? rows.slice(1) : rows;
  const resolve = (ref) => {
    if (ref == null || ref === '') return null;
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const i = Number(ref);
      if (i < 0 || i >= width) throw new Error(`Column ${i} does not exist (the data has ${width}).`);
      return i;
    }
    const i = header ? header.findIndex((h) => h.toLowerCase() === String(ref).toLowerCase()) : -1;
    if (i < 0) throw new Error(`No column named "${ref}".`);
    return i;
  };
  let vi = resolve(column);
  if (vi == null) {
    for (let c = width - 1; c >= 0 && vi == null; c--) {
      const ok = body.filter((r) => Number.isFinite(num(r[c]))).length;
      if (ok >= Math.max(1, body.length / 2)) vi = c;
    }
    if (vi == null) throw new Error('No numeric column found.');
  }
  let li = resolve(labelColumn);
  if (li == null && width > 1 && vi !== 0) li = 0;
  const labels = [];
  const values = [];
  let skipped = 0;
  body.forEach((r, i) => {
    const v = num(r[vi]);
    if (!Number.isFinite(v)) { skipped++; return; }
    values.push(v);
    labels.push(li == null ? String(i + 1) : (r[li] ?? String(i + 1)));
  });
  return { labels, values, column: header ? header[vi] : `column ${vi}`, skipped };
}
