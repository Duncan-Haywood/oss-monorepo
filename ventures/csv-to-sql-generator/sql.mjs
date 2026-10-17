// CSV -> CREATE TABLE + INSERT for PostgreSQL, MySQL, SQLite, SQL Server and BigQuery.
// Pure text transformation: no network, no storage, no dependencies.

export const DIALECTS = ['postgres', 'mysql', 'sqlite', 'sqlserver', 'bigquery'];
export const DIALECT_LABELS = { postgres: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite', sqlserver: 'SQL Server', bigquery: 'BigQuery' };

const RESERVED = new Set(('add all alter and any as asc between by case check column constraint create cross current database default delete desc distinct drop else end exists false for foreign from full group having in index inner insert into is join key left like limit not null offset on or order outer primary references right select set table then to true union unique update user using values view when where with year month day hour minute second date time timestamp text int integer float double decimal numeric order group value values name type level rank row rows desc lines position').split(' '));

// ---------------------------------------------------------------- CSV parsing

export function detectDelimiter(text) {
  const head = text.replace(/^﻿/, '').split(/\r\n|\n|\r/).slice(0, 5).filter((l) => l.length);
  let best = ',', bestScore = 0;
  for (const d of [',', ';', '\t', '|']) {
    const counts = head.map((l) => countOutsideQuotes(l, d));
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = counts[0] * (consistent ? 2 : 1);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function countOutsideQuotes(line, d) {
  let q = false, n = 0;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
  return n;
}

export function parseCsv(text, delimiter) {
  const src = text.replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [], field = '', inQ = false, i = 0, wasQuoted = false;
  const endField = () => { row.push(field); field = ''; wasQuoted = false; };
  const endRow = () => { endField(); if (!(row.length === 1 && row[0] === '' && !wasQuoted)) rows.push(row); row = []; };
  while (i < src.length) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { inQ = true; wasQuoted = true; i++; continue; }
    if (ch === d) { endField(); i++; continue; }
    if (ch === '\r') { endRow(); i += src[i + 1] === '\n' ? 2 : 1; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (inQ) throw new Error('Unterminated quote: a field opens with " and never closes. Check for a stray quote near the end of the file.');
  if (field !== '' || row.length) endRow();
  return { rows, delimiter: d };
}

// ---------------------------------------------------------------- identifiers

function snake(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function makeIdentifiers(headers, { keepNames = false } = {}) {
  const used = new Map();
  const notes = [];
  const names = headers.map((h, idx) => {
    const original = String(h).trim();
    let base = keepNames ? original : snake(original);
    if (!base) { base = `column_${idx + 1}`; notes.push(`Column ${idx + 1} had no usable header and is named ${base}.`); }
    if (!keepNames && /^[0-9]/.test(base)) base = `col_${base}`;
    let name = base, n = 2;
    while (used.has(name.toLowerCase())) name = `${base}_${n++}`;
    used.set(name.toLowerCase(), true);
    if (name.toLowerCase() !== original.toLowerCase() && original) notes.push(`Column “${original}” became ${name}.`);
    return name;
  });
  return { names, notes };
}

export function quoteIdent(name, dialect, force = false) {
  const needs = force || RESERVED.has(name.toLowerCase()) || !/^[a-z_][a-z0-9_]*$/.test(name);
  if (!needs) return name;
  if (dialect === 'mysql' || dialect === 'bigquery') return '`' + name.replace(/`/g, '``') + '`';
  if (dialect === 'sqlserver') return '[' + name.replace(/]/g, ']]') + ']';
  return '"' + name.replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------- inference

const BOOL_WORDS = { true: true, t: true, yes: true, y: true, false: false, f: false, no: false, n: false };
const RE_INT = /^[+-]?(0|[1-9]\d*)$/;
const RE_DEC = /^[+-]?(\d+\.\d*|\.\d+|\d+)$/;
const RE_EXP = /^[+-]?(\d+\.?\d*|\.\d+)[eE][+-]?\d+$/;
const RE_THOUSANDS = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const RE_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const RE_TS = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}
const p2 = (n) => String(n).padStart(2, '0');

function analyseColumn(values, opts, label, warnings) {
  const nonNull = values.filter((v) => v !== null);
  const info = { nullable: nonNull.length < values.length, nonNull: nonNull.length };
  if (!nonNull.length) { warnings.push(`Column ${label} is empty in every row, so it is typed as text.`); return { ...info, kind: 'text', maxLen: 1 }; }
  const all = (fn) => nonNull.every(fn);

  if (all((v) => Object.hasOwn(BOOL_WORDS, v.toLowerCase()))) {
    return { ...info, kind: 'boolean', convert: (v) => BOOL_WORDS[v.toLowerCase()] };
  }
  if (opts.zeroOneBool && all((v) => v === '0' || v === '1')) return { ...info, kind: 'boolean', convert: (v) => v === '1' };

  if (all((v) => RE_INT.test(v)) && all((v) => v.replace(/^[+-]/, '').length <= 18)) {
    const big = nonNull.some((v) => Math.abs(Number(v)) > 2147483647);
    if (all((v) => v === '0' || v === '1') && new Set(nonNull).size === 2 && !opts.zeroOneBool) warnings.push(`Column ${label} only holds 0 and 1; kept as integer. Tick “treat 0/1 as boolean” if it is a flag.`);
    return { ...info, kind: big ? 'bigint' : 'integer', convert: (v) => String(Number(v)).replace(/^\+/, '') };
  }
  const leadingZero = nonNull.filter((v) => /^[+-]?0\d+$/.test(v));
  if (leadingZero.length && all((v) => /^[+-]?\d+$/.test(v))) {
    warnings.push(`Column ${label} looks numeric but has leading zeros (e.g. ${leadingZero[0]}), so it is kept as text to preserve them.`);
    return { ...info, kind: 'text', maxLen: Math.max(...nonNull.map((v) => v.length)) };
  }
  if (all((v) => RE_INT.test(v) || RE_DEC.test(v) || RE_THOUSANDS.test(v) || RE_EXP.test(v))) {
    const thousands = nonNull.some((v) => RE_THOUSANDS.test(v));
    const clean = (v) => (RE_THOUSANDS.test(v) ? v.replace(/,/g, '') : v);
    if (thousands) warnings.push(`Column ${label} has thousands separators; they are stripped in the INSERT values.`);
    const hasExp = nonNull.some((v) => RE_EXP.test(v));
    let intDigits = 1, scale = 0;
    for (const raw of nonNull) {
      if (RE_EXP.test(raw)) continue;
      const [i, f = ''] = clean(raw).replace(/^[+-]/, '').split('.');
      intDigits = Math.max(intDigits, i.replace(/^0+(?=\d)/, '').length);
      scale = Math.max(scale, f.length);
    }
    const precision = intDigits + scale;
    const asFloat = hasExp || opts.decimal === 'float' || precision > 38;
    if (hasExp) warnings.push(`Column ${label} uses scientific notation, so it is a floating-point column.`);
    return { ...info, kind: asFloat ? 'float' : 'decimal', precision, scale, convert: (v) => clean(v).replace(/^\+/, '') };
  }
  if (all((v) => RE_UUID.test(v))) return { ...info, kind: 'uuid', convert: (v) => v.toLowerCase() };

  if (all((v) => { const m = RE_ISO_DATE.exec(v); return m && validDate(+m[1], +m[2], +m[3]); })) return { ...info, kind: 'date', convert: (v) => v };

  if (all((v) => RE_SLASH_DATE.test(v))) {
    let dmyOnly = false, mdyOnly = false;
    for (const v of nonNull) { const [a, b] = RE_SLASH_DATE.exec(v).slice(1).map(Number); if (a > 12) dmyOnly = true; if (b > 12) mdyOnly = true; }
    if (dmyOnly && mdyOnly) { /* contradictory: fall through to text */ }
    else {
      const order = dmyOnly ? 'dmy' : mdyOnly ? 'mdy' : opts.dateOrder === 'dmy' ? 'dmy' : 'mdy';
      if (!dmyOnly && !mdyOnly) warnings.push(`Column ${label} has dates like ${nonNull[0]} that could be day/month or month/day. Read as ${order === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}; change “ambiguous dates” if that is wrong.`);
      const conv = (v) => { const [a, b, y] = RE_SLASH_DATE.exec(v).slice(1).map(Number); const [mo, da] = order === 'dmy' ? [b, a] : [a, b]; return validDate(y, mo, da) ? `${y}-${p2(mo)}-${p2(da)}` : null; };
      if (all((v) => conv(v))) return { ...info, kind: 'date', convert: conv };
    }
  }
  if (all((v) => { const m = RE_TS.exec(v); return m && validDate(+m[1], +m[2], +m[3]) && +m[4] < 24 && +m[5] < 60 && (m[6] === undefined || +m[6] < 60); })) {
    const hasZone = nonNull.some((v) => RE_TS.exec(v)[8]);
    const mixed = hasZone && nonNull.some((v) => !RE_TS.exec(v)[8]);
    if (mixed) warnings.push(`Column ${label} mixes timestamps with and without a time zone; zone-less values will be interpreted in the database session’s zone.`);
    return {
      ...info, kind: hasZone ? 'timestamptz' : 'timestamp',
      convert: (v) => { const m = RE_TS.exec(v); let z = m[8] || ''; if (/^[+-]\d{4}$/.test(z)) z = `${z.slice(0, 3)}:${z.slice(3)}`; return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}${m[7] || ''}${z}`; },
    };
  }
  const dateish = nonNull.filter((v) => RE_ISO_DATE.test(v) || RE_SLASH_DATE.test(v) || RE_TS.test(v));
  if (dateish.length >= nonNull.length / 2) warnings.push(`Column ${label} mostly holds dates but not in one consistent format (or has an invalid one), so it is kept as text. Clean it and re-run to get a DATE column.`);
  const maxLen = Math.max(...nonNull.map((v) => [...v].length));
  return { ...info, kind: 'text', maxLen };
}

function sqlType(col, dialect) {
  const k = col.kind;
  switch (dialect) {
    case 'postgres':
      return { boolean: 'BOOLEAN', integer: 'INTEGER', bigint: 'BIGINT', decimal: `NUMERIC(${col.precision},${col.scale})`, float: 'DOUBLE PRECISION', date: 'DATE', timestamp: 'TIMESTAMP', timestamptz: 'TIMESTAMPTZ', uuid: 'UUID', text: 'TEXT' }[k];
    case 'mysql':
      if (k === 'text') return col.maxLen <= 255 ? `VARCHAR(${roundUp(col.maxLen)})` : col.maxLen <= 65000 ? 'TEXT' : 'LONGTEXT';
      return { boolean: 'TINYINT(1)', integer: 'INT', bigint: 'BIGINT', decimal: `DECIMAL(${Math.min(65, col.precision)},${col.scale})`, float: 'DOUBLE', date: 'DATE', timestamp: 'DATETIME', timestamptz: 'DATETIME', uuid: 'CHAR(36)' }[k];
    case 'sqlite':
      return { boolean: 'INTEGER', integer: 'INTEGER', bigint: 'INTEGER', decimal: 'NUMERIC', float: 'REAL', date: 'TEXT', timestamp: 'TEXT', timestamptz: 'TEXT', uuid: 'TEXT', text: 'TEXT' }[k];
    case 'sqlserver':
      if (k === 'text') return col.maxLen <= 4000 ? `NVARCHAR(${roundUp(col.maxLen)})` : 'NVARCHAR(MAX)';
      return { boolean: 'BIT', integer: 'INT', bigint: 'BIGINT', decimal: `DECIMAL(${Math.min(38, col.precision)},${col.scale})`, float: 'FLOAT', date: 'DATE', timestamp: 'DATETIME2', timestamptz: 'DATETIMEOFFSET', uuid: 'UNIQUEIDENTIFIER' }[k];
    case 'bigquery':
      if (k === 'decimal') return col.scale <= 9 && col.precision - col.scale <= 29 ? 'NUMERIC' : 'FLOAT64';
      return { boolean: 'BOOL', integer: 'INT64', bigint: 'INT64', float: 'FLOAT64', date: 'DATE', timestamp: 'DATETIME', timestamptz: 'TIMESTAMP', uuid: 'STRING', text: 'STRING' }[k];
    default: throw new Error(`Unknown dialect: ${dialect}`);
  }
}

function roundUp(n) { for (const s of [32, 64, 128, 255, 500, 1000, 2000, 4000]) if (n <= s) return s; return 4000; }

// ---------------------------------------------------------------- literals

function literal(raw, col, dialect) {
  if (raw === null) return 'NULL';
  const v = col.convert ? col.convert(raw) : raw;
  switch (col.kind) {
    case 'boolean': return dialect === 'postgres' || dialect === 'bigquery' ? (v ? 'TRUE' : 'FALSE') : (v ? '1' : '0');
    case 'integer': case 'bigint': case 'decimal': case 'float': return v;
    default: return quoteString(v, dialect, col.kind === 'text');
  }
}

export function quoteString(s, dialect, unicode = false) {
  let body = s.replace(/'/g, "''");
  if (dialect === 'mysql' || dialect === 'bigquery') {
    body = body.replace(/\\/g, '\\\\');
    if (dialect === 'bigquery') body = body.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  }
  if (dialect === 'sqlserver' && unicode) return `N'${body}'`;
  return `'${body}'`;
}

// ---------------------------------------------------------------- main

export function convert(text, options = {}) {
  const opts = {
    dialect: 'postgres', table: 'imported_data', header: true, batch: 500, drop: false, transaction: true, keepNames: false,
    pk: true, decimal: 'numeric', dateOrder: 'mdy', zeroOneBool: false, nullTokens: ['', 'NULL', 'null', '\\N'], insert: 'multi', maxRows: 200000, ...options,
  };
  if (!DIALECTS.includes(opts.dialect)) throw new Error(`dialect must be one of ${DIALECTS.join(', ')}`);
  if (!String(text).trim()) throw new Error('Paste some CSV first.');
  const { rows: all, delimiter } = parseCsv(String(text), opts.delimiter);
  if (!all.length) throw new Error('No rows found.');
  const warnings = [];
  const width = Math.max(...all.map((r) => r.length));
  const headerRow = opts.header ? all[0] : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
  const body = opts.header ? all.slice(1) : all;
  if (!body.length) throw new Error('The CSV has a header row but no data rows.');
  if (body.length > opts.maxRows) throw new Error(`That is ${body.length.toLocaleString('en-US')} rows; this page is for up to ${opts.maxRows.toLocaleString('en-US')}. For bigger files use your database's bulk loader (see the guide).`);
  const headers = headerRow.concat(Array.from({ length: Math.max(0, width - headerRow.length) }, () => ''));

  let ragged = 0;
  const nullSet = new Set(opts.nullTokens);
  const cells = body.map((r) => { if (r.length !== width) ragged++; return Array.from({ length: width }, (_, i) => { const v = r[i]; return v === undefined ? null : nullSet.has(v) ? null : v; }); });
  if (ragged) warnings.push(`${ragged} row${ragged === 1 ? ' has' : 's have'} fewer or more fields than the header; short rows are padded with NULL and extra fields in long rows are kept as extra columns.`);

  const ids = makeIdentifiers(headers, { keepNames: opts.keepNames });
  warnings.push(...ids.notes);
  const tableName = opts.keepNames ? String(opts.table) : (snake(opts.table) || 'imported_data');

  const cols = ids.names.map((name, c) => {
    const values = cells.map((r) => r[c] === null ? null : r[c].trim() === r[c] ? r[c] : r[c].trim());
    const a = analyseColumn(values, opts, name, warnings);
    return { ...a, name, original: headers[c], values };
  });
  const textNull = cols.some((c) => c.kind === 'text' && c.nullable);
  if (textNull) warnings.push('Empty cells and the tokens NULL, null and \\N are loaded as SQL NULL, including in text columns.');

  let pkCol = null;
  if (opts.pk) {
    pkCol = cols.find((c) => /^(id|.*_id|uuid)$/.test(c.name) && !c.nullable && ['integer', 'bigint', 'uuid', 'text'].includes(c.kind) && new Set(c.values).size === c.values.length);
    if (pkCol && cols.indexOf(pkCol) !== 0 && !/^id$/.test(pkCol.name)) pkCol = null;
    if (pkCol) warnings.push(`${pkCol.name} is unique and never empty, so it is the PRIMARY KEY.`);
  }
  const q = (n) => quoteIdent(n, opts.dialect, opts.keepNames);
  const T = quoteIdent(tableName, opts.dialect, opts.keepNames);
  if (opts.dialect === 'postgres' && cols.some((c) => c.kind === 'text')) warnings.push('PostgreSQL uses TEXT for strings; there is no speed penalty versus VARCHAR(n).');
  if (opts.dialect === 'mysql' && cols.some((c) => c.kind === 'timestamptz')) warnings.push('MySQL DATETIME has no time zone: offsets in the data are kept in the literal and MySQL 8.0.19+ converts them to the session zone.');
  if (opts.dialect === 'sqlite') warnings.push('SQLite stores dates and timestamps as ISO-8601 text and booleans as 0/1; it has no separate types for them.');

  const out = [];
  const tx = opts.transaction && opts.dialect !== 'bigquery';
  if (tx) out.push(opts.dialect === 'mysql' ? 'START TRANSACTION;' : opts.dialect === 'sqlserver' ? 'BEGIN TRANSACTION;' : 'BEGIN;', '');
  if (opts.drop) out.push(`DROP TABLE IF EXISTS ${T};`, '');
  const defs = cols.map((c) => {
    const t = sqlType(c, opts.dialect);
    const pk = c === pkCol ? ' PRIMARY KEY' : (c.nullable ? '' : ' NOT NULL');
    return `  ${q(c.name)} ${t}${pk}`;
  });
  out.push(`CREATE TABLE ${T} (`, defs.join(',\n'), ');', '');

  const colList = cols.map((c) => q(c.name)).join(', ');
  const per = opts.insert === 'single' ? 1 : Math.max(1, Math.min(opts.batch, opts.dialect === 'sqlserver' ? 1000 : 10000));
  for (let i = 0; i < cells.length; i += per) {
    const slice = cells.slice(i, i + per);
    const tuples = slice.map((_, k) => `(${cols.map((c) => literal(c.values[i + k], c, opts.dialect)).join(', ')})`);
    out.push(`INSERT INTO ${T} (${colList}) VALUES\n${tuples.join(',\n')};`);
  }
  if (tx) out.push('', 'COMMIT;');
  return {
    sql: out.join('\n') + '\n',
    delimiter, warnings,
    columns: cols.map((c) => ({ name: c.name, original: c.original, type: sqlType(c, opts.dialect), kind: c.kind, nullable: c.nullable })),
    stats: { rows: cells.length, columns: cols.length, statements: Math.ceil(cells.length / per) },
  };
}
