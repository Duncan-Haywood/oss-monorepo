// A read statement as an Excel workbook (.xlsx) that checks itself.
//
// "Convert bank statement to Excel" is what most people type, and what the
// paid per-page converters sell. A CSV opened in Excel loses what made the
// rows trustworthy here: dates arrive as text (or as the wrong day, when
// Excel guesses 03/04 the other way), amounts as text with commas, and the
// balance proof stays behind on the page. This workbook keeps it:
//
// - dates are real Excel dates and amounts real numbers, so they sort, sum
//   and pivot;
// - every transaction sheet carries a running-balance column written as a
//   formula (the row above plus this row) next to the balance the statement
//   printed, and a Check column that says "ok" or "off by 12.34" on each
//   row, so an edit made later in Excel (a row deleted, a sign changed) is
//   caught by the workbook itself, live, without this page;
// - a Summary sheet totals money in and out with SUM formulas over those
//   sheets and compares opening + net with the printed closing balance, per
//   account, and for a year of joined statements lists each file;
// - the findings are a sheet of their own.
//
// Every formula is also written with its value, computed here in integer
// cents, so a reader that does not recalculate (a phone preview, pandas)
// shows the same numbers. eval/xlsx-check.mjs has LibreOffice recalculate a
// copy written without those values and compares the two.
//
// Runs in Node and the browser with no dependency.
//
//   workbookSheets(result) -> [{ name, rows, widths? }]
//     a cell: string | number | null | { date: serial } | { money: cents }
//             | { f: formula, v: cached value, money?: true }
//   await toXlsx(result, { cache = true, deflate }) -> Uint8Array

const pad = (n, w = 2) => String(n).padStart(w, '0');
const colName = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const fmtCents = (c) => { const a = Math.abs(c); return `${c < 0 ? '-' : ''}${Math.floor(a / 100).toLocaleString('en-US')}.${pad(a % 100)}`; };
const isDate = (d) => d && d.ok && d.y;
// Excel's 1900 serial for a calendar day (25569 = 1970-01-01).
export const dateSerial = (d) => Date.UTC(d.y, d.m - 1, d.d) / 86400000 + 25569;

// Sheet names: 31 characters, none of []:*?/\, unique case-insensitively,
// and not "History" (reserved by Excel).
function sheetNamer() {
  const used = new Set(['history']);
  return (want) => {
    let base = String(want || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim() || 'Sheet';
    base = base.slice(0, 31);
    let name = base, n = 2;
    while (used.has(name.toLowerCase())) { const tag = ` (${n++})`; name = base.slice(0, 31 - tag.length) + tag; }
    used.add(name.toLowerCase());
    return name;
  };
}
const quoteSheet = (name) => `'${name.replace(/'/g, "''")}'`;

/** The accounts of a read (or joined) statement, each with its rows, the
 * balance its first row starts from, and its printed closing. */
function accounts(result) {
  const r = result.reconcile || {};
  const tx = result.transactions || [];
  if (r.method === 'sections' && r.sections) {
    return r.sections.map((s) => ({ title: s.title || `Account ${s.account + 1}`, rows: tx.filter((t) => t.account === s.account), opening: s.opening, closing: s.closing, totalIn: s.totalIn, totalOut: s.totalOut }));
  }
  let opening = r.opening ?? null;
  const first = tx[0];
  let openingFrom = 'statement';
  if (opening === null && first && first.balance !== null && first.balance !== undefined) { opening = first.balance - first.delta; openingFrom = 'first row'; }
  if (opening === null) openingFrom = 'none';
  return [{ title: 'Transactions', rows: tx, opening, openingFrom, closing: r.closing ?? null }];
}

/**
 * The sheets, as rows of cells. Money is written as a number of currency
 * units; formulas carry their value computed in cents.
 */
export function workbookSheets(result) {
  const name = sheetNamer();
  const card = result.kind === 'card';
  const joined = Array.isArray(result.statements);
  const accts = accounts(result);
  const tx = result.transactions || [];
  const hasPost = tx.some((t) => isDate(t.postDate));
  // Sheet names are fixed first so the Summary can point at them.
  const summaryName = name('Summary');
  accts.forEach((a) => { a.sheet = name(accts.length === 1 ? 'Transactions' : a.title); });
  const findingsName = name('Findings');

  // Columns of a transaction sheet.
  const cols = ['Date'];
  if (hasPost) cols.push(card ? 'Posted' : 'Value date');
  cols.push('Description', 'Money out', 'Money in', 'Amount', card ? 'Balance owed (statement)' : 'Balance (statement)', card ? 'Balance owed (running)' : 'Balance (running)', 'Check', 'Line', 'Sign from');
  if (joined) cols.push('File');
  const L = Object.fromEntries(cols.map((c, i) => [c, colName(i)]));
  const cOut = L['Money out'], cIn = L['Money in'], cAmt = L.Amount;
  const cStated = colName(cols.findIndex((c) => c.startsWith('Balance') && c.endsWith('(statement)')));
  const cRun = colName(cols.findIndex((c) => c.startsWith('Balance') && c.endsWith('(running)')));

  const txSheets = accts.map((a) => {
    const rows = [cols.slice()];
    // The running balance moves with the statement's own balance: a bank
    // balance rises with money in; a card's balance owed rises with a charge
    // (money out).
    const step = card ? `-${cAmt}` : `+${cAmt}`;
    let run = a.opening;
    a.rows.forEach((t, i) => {
      const r = i + 2;
      run = run === null ? null : run + t.delta;
      const prevRef = i === 0 ? null : `${cRun}${r - 1}`;
      const runF = i === 0 ? (a.opening === null ? null : `ROUND(${(a.opening / 100).toFixed(2)}${step}${r},2)`) : `ROUND(${prevRef}${step}${r},2)`;
      const stated = t.balance === null || t.balance === undefined ? null : t.balance;
      const off = stated === null || run === null ? null : run - stated;
      const checkF = runF === null ? null : `IF(${cStated}${r}="","",IF(ROUND(${cRun}${r}-${cStated}${r},2)=0,"ok","off by "&TEXT(ABS(${cRun}${r}-${cStated}${r}),"#,##0.00")))`;
      const row = [isDate(t.date) ? { date: dateSerial(t.date) } : t.dateText || ''];
      if (hasPost) row.push(isDate(t.postDate) ? { date: dateSerial(t.postDate) } : '');
      row.push(
        t.description,
        t.amount < 0 ? { money: -t.amount } : null,
        t.amount > 0 ? { money: t.amount } : null,
        { f: `ROUND(N(${cIn}${r})-N(${cOut}${r}),2)`, v: t.amount, money: true },
        stated === null ? null : { money: stated },
        runF === null ? null : { f: runF, v: run, money: true },
        checkF === null ? null : { f: checkF, v: off === null ? '' : off === 0 ? 'ok' : `off by ${fmtCents(Math.abs(off))}` },
        t.line ?? null,
        t.source || '',
      );
      if (joined) row.push(t.file || '');
      rows.push(row);
    });
    a.last = a.rows.length + 1;
    a.moneyIn = a.rows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    a.moneyOut = -a.rows.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    a.breaks = a.rows.filter((t, i) => {
      if (t.balance === null || t.balance === undefined || a.opening === null) return false;
      let x = a.opening; for (let k = 0; k <= i; k++) x += a.rows[k].delta;
      return x !== t.balance;
    }).length;
    const widths = cols.map((c) => (c === 'Description' ? 44 : c === 'File' ? 28 : c === 'Check' ? 16 : c.startsWith('Balance') ? 22 : c === 'Sign from' ? 12 : c === 'Line' ? 7 : 13));
    return { name: a.sheet, rows, widths };
  });

  // Summary.
  const r = result.reconcile || {};
  const proof = r.ok === true ? (r.method === 'sections' ? `Proved: ${accts.length} accounts, each adds up` : 'Proved: the rows add up to the statement') : r.ok === false ? 'NOT proved: the rows do not add up to the statement (see Findings)' : 'Unproven: no opening and closing balance to check against';
  const sectioned = r.method === 'sections';
  const sum = [
    ['Bank statement read by bank-statement-pdf-to-csv', null],
    [card ? 'Credit card statement' : 'Bank statement', null],
    ['Result when read', proof],
    ['Transactions', tx.length],
    [],
    ['Account', 'Sheet', 'Rows', card ? 'Balance owed at start' : 'Opening balance', 'Money in', 'Money out', card ? 'Owed at start + charges - payments' : 'Opening + in - out', card ? 'Balance owed at end (statement)' : 'Closing balance (statement)', 'Difference', 'Adds up?', 'Rows whose running balance is off', ...(sectioned ? ['Money in (statement total)', 'Money out (statement total)', 'Totals agree?'] : [])],
  ];
  const head = sum.length; // 1-based row of the header
  accts.forEach((a, i) => {
    const row = head + 1 + i;
    const s = quoteSheet(a.sheet);
    const rng = (c) => `${s}!${c}2:${c}${Math.max(2, a.last)}`;
    const reach = a.opening === null ? null : a.opening + (card ? a.moneyOut - a.moneyIn : a.moneyIn - a.moneyOut);
    const diff = reach === null || a.closing === null ? null : a.closing - reach;
    const reachF = card ? `ROUND(D${row}+F${row}-E${row},2)` : `ROUND(D${row}+E${row}-F${row},2)`;
    sum.push([
      accts.length === 1 && !(r.method === 'sections') ? (joined ? `${result.statements.length} statements joined` : 'This statement') : a.title,
      a.sheet,
      a.rows.length,
      a.opening === null ? null : { money: a.opening },
      { f: `SUM(${rng(cIn)})`, v: a.moneyIn, money: true },
      { f: `SUM(${rng(cOut)})`, v: a.moneyOut, money: true },
      a.opening === null ? null : { f: reachF, v: reach, money: true },
      a.closing === null ? null : { money: a.closing },
      a.opening === null || a.closing === null ? null : { f: `ROUND(H${row}-G${row},2)`, v: diff, money: true },
      a.opening === null || a.closing === null ? 'cannot tell' : { f: `IF(ROUND(I${row},2)=0,"yes","no, off by "&TEXT(ABS(I${row}),"#,##0.00"))`, v: diff === 0 ? 'yes' : `no, off by ${fmtCents(Math.abs(diff))}` },
      a.opening === null ? null : { f: `COUNTIF(${rng(L.Check)},"off*")`, v: a.breaks },
    ]);
    if (sectioned) {
      // A statement holding several accounts proves each by its printed totals.
      const tin = a.totalIn ?? null, tout = a.totalOut ?? null;
      const agree = tin === null && tout === null ? 'none printed' : (tin === null || tin === a.moneyIn) && (tout === null || tout === a.moneyOut) ? 'yes' : 'no';
      sum[sum.length - 1].push(tin === null ? null : { money: tin }, tout === null ? null : { money: tout },
        { f: `IF(AND(L${row}="",M${row}=""),"none printed",IF(AND(OR(L${row}="",ROUND(E${row}-L${row},2)=0),OR(M${row}="",ROUND(F${row}-M${row},2)=0)),"yes","no"))`, v: agree });
    }
  });
  if (joined) {
    sum.push([], ['Statements joined', null], ['File', 'From', 'To', 'Rows', 'Opening', 'Closing', 'Gap before it', 'Proved on its own']);
    const day = (k) => ({ date: dateSerial({ y: Math.floor(k / 10000), m: Math.floor(k / 100) % 100, d: k % 100, ok: true }) });
    for (const st of result.statements) {
      const gap = (result.breaks || []).find((b) => b.before === st.name);
      sum.push([st.name, day(st.from), day(st.to), st.rows, st.opening === null ? null : { money: st.opening }, st.closing === null ? null : { money: st.closing }, gap ? { money: gap.gap } : null, st.proved ? 'yes' : 'no']);
    }
  }
  const howTo = sum.length + 2;
  const joinedHead = joined ? head + accts.length + 2 : null;
  sum.push([], ['How to read this workbook', null],
    ['Each transaction sheet works out the running balance itself: the opening balance, then the row above plus each row. Check says "ok" where that equals the balance the statement printed, or how far off it is. Edit a row and the checks and this summary recalculate.'],
    ['Money in and money out are from the account holder\'s side: a card charge is money out, a payment to the card is money in.'],
    ['Read the Findings sheet before importing. A clean check means the rows add up to the statement\'s own figures, not that every description was read right. Not legal, tax, accounting or financial advice; check against your bank before relying on it.'],
  );

  const findings = [['Severity', 'Line', 'Finding', 'Detail']].concat((result.findings || []).map((x) => [x.severity, x.line || null, x.title, x.detail]));
  return [
    { name: summaryName, rows: sum, header: false, widths: [36, 22, 10, 22, 14, 14, 26, 26, 12, 22, 18, 18, 18, 14], boldRows: [1, head, howTo, ...(joined ? [joinedHead, joinedHead + 1] : [])], wrapFrom: howTo + 1 },
    ...txSheets,
    { name: findingsName, rows: findings, widths: [10, 7, 48, 100] },
  ];
}

// ------------------------------------------------------------- xlsx writer

const xmlText = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlAttr = (s) => xmlText(s).replace(/"/g, '&quot;');
const CELL_MAX = 32767;

// styles: 0 general, 1 bold, 2 date, 3 money, 4 wrapped text
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0.00;-#,##0.00"/></numFmts>'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function cellXml(v, ref, bold, wrap, cache) {
  if (v === null || v === undefined || v === '') return '';
  const s = (n) => (bold ? 1 : n);
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${bold ? ' s="1"' : ''}><v>${v}</v></c>` : '';
  if (typeof v === 'object' && 'date' in v) return `<c r="${ref}" s="2"><v>${v.date}</v></c>`;
  if (typeof v === 'object' && 'f' in v) {
    const f = `<f>${xmlText(v.f)}</f>`;
    if (typeof v.v === 'string') return `<c r="${ref}" t="str">${f}${cache ? `<v>${xmlText(v.v)}</v>` : ''}</c>`;
    const num = v.v === null || v.v === undefined ? null : v.money ? v.v / 100 : v.v;
    return `<c r="${ref}"${v.money ? ' s="3"' : ''}>${f}${cache && num !== null ? `<v>${num}</v>` : ''}</c>`;
  }
  if (typeof v === 'object' && 'money' in v) return `<c r="${ref}" s="3"><v>${v.money / 100}</v></c>`;
  let t = String(v);
  if (t.length > CELL_MAX) t = t.slice(0, CELL_MAX);
  return `<c r="${ref}" t="inlineStr" s="${s(wrap ? 4 : 0)}"><is><t xml:space="preserve">${xmlText(t)}</t></is></c>`;
}

function sheetXml(sh, cache) {
  const header = sh.header !== false;
  const rows = sh.rows;
  const ncol = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const bold = new Set(header ? [1] : sh.boldRows || []);
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];
  if (header && rows.length > 1) out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  if (sh.widths) out.push(`<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  out.push('<sheetData>');
  rows.forEach((r, ri) => {
    const n = ri + 1;
    const wrap = sh.wrapFrom && n >= sh.wrapFrom;
    out.push(`<row r="${n}"${wrap && r.length === 1 ? ' ht="48" customHeight="1"' : ''}>${r.map((v, ci) => cellXml(v, colName(ci) + n, bold.has(n), wrap, cache)).join('')}</row>`);
  });
  out.push('</sheetData>');
  if (header && rows.length > 1) out.push(`<autoFilter ref="A1:${colName(ncol - 1)}${rows.length}"/>`);
  if (sh.wrapFrom) {
    // the notes at the foot of the Summary span the table's width
    const merges = [];
    for (let n = sh.wrapFrom; n <= rows.length; n++) if (rows[n - 1].length === 1) merges.push(`<mergeCell ref="A${n}:${colName(ncol - 1)}${n}"/>`);
    if (merges.length) out.push(`<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>`);
  }
  out.push('</worksheet>');
  return out.join('');
}

export async function xlsxFromSheets(sheets, { cache = true, deflate = defaultDeflate() } = {}) {
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const filters = sheets.map((sh, i) => {
    if (sh.header === false || sh.rows.length < 2) return '';
    const ncol = sh.rows.reduce((m, r) => Math.max(m, r.length), 1);
    return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlText(quoteSheet(sh.name))}!$A$1:$${colName(ncol - 1)}$${sh.rows.length}</definedName>`;
  }).join('');
  // fullCalcOnLoad: Excel and LibreOffice recompute every formula on open,
  // so the cached values are only for readers that never calculate.
  const files = [
    { name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xmlAttr(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh, cache) })),
  ];
  return zip(files, deflate);
}

/** The workbook's bytes. cache: false leaves formula values out (for
 * checking that a spreadsheet's own recalculation gives the same numbers). */
export async function toXlsx(result, opts = {}) {
  if (!result || !(result.transactions || []).length) throw new Error('No transactions to write.');
  return xlsxFromSheets(workbookSheets(result), opts);
}

// --------------------------------------------------------------- zip writer

function defaultDeflate() {
  if (typeof CompressionStream !== 'function') return null;
  return async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Entries deflated when that is smaller, else stored; a fixed timestamp so
// the same statement always gives the same bytes.
async function zip(files, deflate) {
  const enc = new TextEncoder();
  const le = (n, v) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (v >>> (8 * i)) & 0xff; return a; };
  const parts = [], central = [];
  let offset = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    let body = data, method = 0;
    if (deflate && data.length > 64) { const z = await deflate(data); if (z.length < data.length) { body = z; method = 8; } }
    const common = [le(2, 20), le(2, 0x0800), le(2, method), le(2, 0), le(2, dosDate), le(4, crc), le(4, body.length), le(4, data.length), le(2, name.length), le(2, 0)];
    const head = [le(4, 0x04034b50), ...common];
    parts.push(...head, name, body);
    central.push(le(4, 0x02014b50), le(2, 20), ...common, le(2, 0), le(2, 0), le(2, 0), le(4, 0), le(4, offset), name);
    offset += head.reduce((n, x) => n + x.length, 0) + name.length + body.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const all = [...parts, ...central, le(4, 0x06054b50), le(2, 0), le(2, 0), le(2, files.length), le(2, files.length), le(4, cdSize), le(4, offset), le(2, 0)];
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
