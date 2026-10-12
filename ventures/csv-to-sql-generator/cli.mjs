#!/usr/bin/env node
// node cli.mjs data.csv [--dialect postgres|mysql|sqlite|sqlserver|bigquery] [--table name] [--no-header]
//   [--drop] [--batch 500] [--delimiter ';'] [--keep-names] [--float] [--dmy] [--01-bool] [--no-pk] [--no-transaction]
// cat data.csv | node cli.mjs --dialect sqlite | sqlite3 app.db
import { readFileSync } from 'node:fs';
import { convert, DIALECTS } from './sql.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const options = {
  dialect: opt('--dialect') || 'postgres',
  table: opt('--table') || 'imported_data',
  batch: Number(opt('--batch')) || 500,
  delimiter: opt('--delimiter'),
  header: !flag('--no-header'),
  drop: flag('--drop'),
  keepNames: flag('--keep-names'),
  decimal: flag('--float') ? 'float' : 'numeric',
  dateOrder: flag('--dmy') ? 'dmy' : 'mdy',
  zeroOneBool: flag('--01-bool'),
  pk: !flag('--no-pk'),
  transaction: !flag('--no-transaction'),
  maxRows: Infinity,
};
if (!DIALECTS.includes(options.dialect)) { console.error(`--dialect must be one of ${DIALECTS.join(', ')}`); process.exit(2); }
const files = args.filter((a) => a !== '-');
if (files.some((f) => f.startsWith('--'))) { console.error(`unknown arguments: ${files.filter((f) => f.startsWith('--')).join(' ')}`); process.exit(2); }
if (files.length > 1) { console.error('give one CSV file (or pipe it on stdin)'); process.exit(2); }

try {
  const text = readFileSync(files[0] || 0, 'utf8');
  const r = convert(text, options);
  process.stdout.write(r.sql);
  for (const w of r.warnings) console.error(`note: ${w}`);
} catch (e) { console.error(e.message); process.exit(2); }
