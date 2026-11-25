// Read data/fredmd-vintages/<SERIES>.csv (written by eval/fredmd-vintages.py; source and format in its header and
// data/SOURCE.md, "FRED-MD vintages").
//
// readVintages(series) -> [{ last, first, values }] in file order: `last` and `first` are 'YYYY-MM', `values` the
// levels from `first` to `last`, exactly as that FRED-MD vintage published them.
// vintageAsOf(rows, published, lagged) -> the newest row a user could have held at the end of month `published`
// (see below), or null.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fredmd-vintages');
export const monthIndex = (m) => { const [y, mo] = m.split('-').map(Number); return y * 12 + mo - 1; };
export const monthLabel = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;

const cache = new Map();
export function readVintages(series) {
  if (cache.has(series)) return cache.get(series);
  const lines = readFileSync(join(DIR, `${series}.csv`), 'utf8').trim().split('\n').slice(1);
  const out = [];
  let prev = null;
  for (const l of lines) {
    const [last, first, from, vals] = l.split(',');
    const tail = vals === '' ? [] : vals.split(';').map(Number);
    const keep = monthIndex(from) - monthIndex(first);
    if (keep > 0 && (!prev || prev.first !== first)) throw new Error(`${series} ${last}: 'from' after 'first' with no earlier row to copy`);
    const values = [...(keep > 0 ? prev.values.slice(0, keep) : []), ...tail];
    if (values.length !== monthIndex(last) - monthIndex(first) + 1) throw new Error(`${series} ${last}: ${values.length} values`);
    prev = { last, first, values };
    out.push(prev);
  }
  cache.set(series, out);
  return out;
}

// The files keep, per series, the first vintage to reach each month (AQLT's files dropped the rest), so a row's
// publication month is known only through its lag. Payrolls and industrial production reach month V-1 in the
// vintage of month V on every row (267 rows, one per vintage 1999-08 to 2021-10, no gaps), so a row ending `last`
// was published at last + 1. Real personal income less transfers (213 rows) is one or two months behind: its rows
// step by 1 or 2 months and never more, so the row ending V-2 was out by V; when there is none (a 2-month step
// over V-2), the row ending V-1 was the first to follow the row ending V-3 and was published at V. A row ending
// V-1 that is not such a step may be from V+1, so it is never taken (the first row, ending 1999-07, is the first
// vintage's, 1999-08).
//   lagged = false: the newest row with last <= published - 1 (payrolls, industrial production);
//   lagged = true:  the row ending published - 2, else the one ending published - 1.
// Rows that start later than `from` (one W875RX1 row, to 1999-10, holds only 1992 on) are passed over for the
// newest earlier row that starts in time.
export function vintageAsOf(rows, published, lagged, from) {
  const V = monthIndex(published);
  const ok = (r) => !from || monthIndex(r.first) <= monthIndex(from);
  let pick = null;
  if (!lagged) {
    for (const r of rows) if (monthIndex(r.last) <= V - 1 && ok(r)) pick = r;
    return pick;
  }
  const at = (k) => rows.findIndex((r) => monthIndex(r.last) === k);
  let j = at(V - 2);
  if (j < 0) {
    j = at(V - 1);
    // only a 2-month step (or the first vintage, 1999-08, whose row ends 1999-07) dates the row ending V-1 to V
    if (j < 0 || !(j === 0 ? published === '1999-08' : monthIndex(rows[j - 1].last) === V - 3)) return null;
  }
  while (j >= 0 && !ok(rows[j])) j--;
  return j >= 0 ? rows[j] : null;
}
