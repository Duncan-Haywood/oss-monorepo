// Scanned statements: the picture out of an image-only PDF, OCR word boxes into
// column-aligned lines, digit look-alikes, and the balance-checked repair
// (parseStatement { ocr: true }) with its misread gate. No OCR engine runs here;
// eval/scans.mjs runs the whole route through tesseract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { pageImages, linesFromWords, wordsFromTsv, cleanAmountWord, unpredict, toRgba, readScanImages, OCR_URLS } from './ocr.mjs';
import { parseStatement, parseStatementText, plausibleMisread, parseStatementPdf } from './calc.mjs';

const inflate = async (b) => { try { return new Uint8Array(inflateSync(b)); } catch { return null; } };

// A tiny PDF whose pages each draw one image stream (dict text, raw bytes).
function imagePdf(images) {
  const objs = [null, '<< /Type /Catalog /Pages 2 0 R >>', null];
  const kids = [];
  for (const im of images) {
    const page = objs.length, img = page + 1;
    kids.push(`${page} 0 R`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${im.rotate ? ` /Rotate ${im.rotate}` : ''} /Resources << /XObject << /Im0 ${img} 0 R >> >> >>`);
    objs.push({ dict: `<< /Type /XObject /Subtype /Image ${im.dict} /Length ${im.data.length} >>`, data: im.data });
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  const parts = [Buffer.from('%PDF-1.4\n')];
  let pos = parts[0].length;
  const offs = [];
  for (let i = 1; i < objs.length; i++) {
    offs[i] = pos;
    const o = objs[i];
    const b = typeof o === 'string' ? Buffer.from(`${i} 0 obj\n${o}\nendobj\n`) : Buffer.concat([Buffer.from(`${i} 0 obj\n${o.dict}\nstream\n`), Buffer.from(o.data), Buffer.from('\nendstream\nendobj\n')]);
    parts.push(b); pos += b.length;
  }
  parts.push(Buffer.from(`xref\n0 ${objs.length}\n0000000000 65535 f \n${offs.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}

test('pageImages: a JPEG scan comes out byte for byte, a Flate grey image as pixels, CCITT is named', async () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const grey = deflateSync(Buffer.from([0, 128, 255, 64]));
  const pdf = imagePdf([
    { dict: '/Width 300 /Height 400 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode', data: jpeg, rotate: 90 },
    { dict: '/Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode', data: grey },
    { dict: '/Width 8 /Height 8 /ImageMask true /BitsPerComponent 1 /Filter /CCITTFaxDecode', data: Buffer.from([1, 2, 3]) },
  ]);
  const { encrypted, pages } = await pageImages(pdf, inflate);
  assert.equal(encrypted, false);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].kind, 'jpeg');
  assert.deepEqual([...pages[0].bytes], [...jpeg]);
  assert.deepEqual([pages[0].width, pages[0].height, pages[0].rotate], [300, 400, 90]);
  assert.equal(pages[1].kind, 'pixels');
  assert.deepEqual([...pages[1].rgba].filter((_, i) => i % 4 === 0), [0, 128, 255, 64]);
  assert.equal(pages[2].kind, 'unsupported');
  assert.equal(pages[2].filter, 'CCITTFaxDecode');
});

test('the scan PDF has no text, so the text reader says to press Read the scan', async () => {
  const pdf = imagePdf([{ dict: '/Width 3 /Height 3 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode', data: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]) }]);
  const r = await parseStatementPdf(pdf, inflate);
  assert.equal(r.findings[0].title, 'No text in this PDF');
  assert.match(r.findings[0].detail, /Read the scan \(OCR\)/);
  assert.deepEqual([r.flags.pageCount, r.flags.pagesWithText], [1, 0]);
});

test('PNG predictors (Up, Sub, Paeth) are undone, and 1-bit rows unpacked', () => {
  // width 3 gray: row 1 filter None [10,20,30], row 2 Up [+1,+1,+1], row 3 Sub [5,+5,+5]
  const data = Uint8Array.from([0, 10, 20, 30, 2, 1, 1, 1, 1, 5, 5, 5]);
  assert.deepEqual([...unpredict(data, 3, 1, 8, 15)], [10, 20, 30, 11, 21, 31, 5, 10, 15]);
  const paeth = Uint8Array.from([0, 10, 20, 4, 0, 0]);
  assert.deepEqual([...unpredict(paeth, 2, 1, 8, 15)], [10, 20, 10, 20]);
  assert.deepEqual([...toRgba(Uint8Array.from([0b10100000]), 3, 1, 1, 1)].filter((_, i) => i % 4 === 0), [255, 0, 255]);
});

test('digit look-alikes in figures are fixed, words left alone', () => {
  assert.equal(cleanAmountWord('4.5O'), '4.50');
  assert.equal(cleanAmountWord('1,2OO.00'), '1,200.00');
  assert.equal(cleanAmountWord('O.87'), '0.87');
  assert.equal(cleanAmountWord('2,202:33'), '2,202.33');
  assert.equal(cleanAmountWord('1,335,22'), '1,335.22');
  assert.equal(cleanAmountWord('146..57'), '146.57');
  assert.equal(cleanAmountWord('12.50CR'), '12.50CR');
  assert.equal(cleanAmountWord('BLUE DOOR COFFEE'), 'BLUE DOOR COFFEE');
  assert.equal(cleanAmountWord('SOLD'), 'SOLD');
  assert.equal(cleanAmountWord('1,234,567'), '1,234,567'); // whole thousands stay
});

// Word boxes in pixels for a row: [text, x0, x1]; characters are 10 px wide.
const row = (y, ...ws) => ws.map(([text, x0]) => ({ text, bbox: { x0, y0: y, x1: x0 + text.length * 10, y1: y + 18 }, confidence: 90 }));

test('word boxes keep their columns, so amounts land under Withdrawals, Deposits and Balance', () => {
  const words = [
    ...row(0, ['Statement', 0], ['period', 100], ['1', 170], ['March', 190], ['2026', 250], ['to', 300], ['31', 330], ['March', 360], ['2026', 420]),
    ...row(40, ['Date', 0], ['Description', 100], ['Withdrawals', 400], ['Deposits', 560], ['Balance', 720]),
    ...row(70, ['Opening', 100], ['balance', 180], ['1,000.00', 720]),
    ...row(100, ['03/02', 0], ['COFFEE', 100], ['SHOP', 170], ['4.5O', 470], ['995.50', 740]),
    ...row(130, ['03/05', 0], ['SALARY', 100], ['2,000.00', 580], ['2,995.50', 720]),
    ...row(160, ['03/09', 0], ['RENT', 100], ['1,200.00', 430], ['1,795.50', 720]),
    ...row(190, ['Closing', 100], ['balance', 180], ['1,795.50', 720]),
  ];
  const lines = linesFromWords(words);
  assert.deepEqual(lines[3].items.map((i) => i.text), ['03/02', 'COFFEE SHOP', '4.50', '995.50']);
  const r = parseStatement(lines, { ocr: true, dateOrder: 'mdy' });
  assert.deepEqual(r.transactions.map((t) => t.delta), [-450, 200000, -120000]);
  assert.equal(r.reconcile.ok, true);
});

test('a page turned a little is straightened before words are put into rows', () => {
  // a 1.5 degree slope: the balance column sits 20 px lower than the date
  const slope = Math.tan((1.5 * Math.PI) / 180);
  const tilt = (ws) => ws.map((w) => ({ ...w, bbox: { ...w.bbox, y0: w.bbox.y0 + w.bbox.x0 * slope, y1: w.bbox.y1 + w.bbox.x0 * slope } }));
  const words = tilt([
    ...row(0, ['Date', 0], ['Description', 100], ['Amount', 500], ['Balance', 700]),
    ...row(22, ['03/02', 0], ['COFFEE', 100], ['4.50', 520], ['995.50', 720]),
    ...row(44, ['03/05', 0], ['SALARY', 100], ['2,000.00', 480], ['2,995.50', 700]),
    ...row(66, ['03/09', 0], ['RENT', 100], ['1,200.00', 480], ['1,795.50', 700]),
  ]);
  const lines = linesFromWords(words);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[2].items.map((i) => i.text), ['03/05', 'SALARY', '2,000.00', '2,995.50']);
});

test('a lone run of digits on a row with decimal figures is an amount that lost its point', () => {
  const lines = linesFromWords(row(0, ['03/31', 0], ['CITY', 100], ['WATER', 150], ['21713', 400], ['6,209.13', 600]));
  assert.deepEqual(lines[0].items.map((i) => i.text), ['03/31', 'CITY WATER', '217.13', '6,209.13']);
  // a reference number with no decimal figure beside it is left alone
  assert.deepEqual(linesFromWords(row(0, ['Ref', 0], ['100431', 100]))[0].items.map((i) => i.text), ['Ref', '100431']);
});

test('tesseract TSV is read into word boxes (header row, conf -1 rows dropped)', () => {
  const tsv = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t800\t600\t-1\t\n5\t1\t1\t1\t1\t1\t10\t20\t50\t18\t96.2\t03/02\n5\t1\t1\t1\t1\t2\t100\t20\t60\t18\t91\tCOFFEE\n';
  assert.deepEqual(wordsFromTsv(tsv), [
    { text: '03/02', bbox: { x0: 10, y0: 20, x1: 60, y1: 38 }, confidence: 96.2 },
    { text: 'COFFEE', bbox: { x0: 100, y0: 20, x1: 160, y1: 38 }, confidence: 91 },
  ]);
});

test('readScanImages numbers lines across pages and reports mean confidence', async () => {
  const engine = { words: async (img) => row(0, ['03/0' + img, 0], ['X', 100], ['1.00', 300], ['2.00', 500]) };
  const { lines, meanConfidence } = await readScanImages([1, 2], engine);
  assert.deepEqual(lines.map((l) => [l.page, l.lineNo]), [[1, 1], [2, 2]]);
  assert.equal(meanConfidence, 90);
});

const stmt = (rows) => `Statement period 1 March 2026 to 31 March 2026
Date    Description          Withdrawals    Deposits     Balance
        Opening balance                                 1,000.00
${rows}
        Closing balance                                 1,795.50`;

test('OCR mode: a misread amount is corrected from the balances on both sides, and listed', () => {
  const t = stmt(`03/02   COFFEE SHOP                 4.50                  995.50
03/05   SALARY ACME                         2,800.00    2,995.50
03/09   RENT                    1,200.00                1,795.50`);
  const off = parseStatementText(t, { dateOrder: 'mdy' });
  assert.equal(off.reconcile.ok, false); // pasted text is checked, never repaired
  const on = parseStatementText(t, { dateOrder: 'mdy', ocr: true });
  assert.equal(on.reconcile.ok, true);
  assert.deepEqual(on.transactions[1].ocrFix, { field: 'amount', from: 280000 });
  assert.equal(on.transactions[1].delta, 200000);
  assert.match(on.findings.find((f) => /misread by OCR/.test(f.title)).detail, /line 5: amount read as 2,800\.00, corrected to 2,000\.00/);
});

test('OCR mode: a misread balance is corrected when only one reading chains to the next row', () => {
  const t = stmt(`03/02   COFFEE SHOP                 4.50                  995.50
03/05   SALARY ACME                         2,000.00    2,995.80
03/09   RENT                    1,200.00                1,795.50`);
  const on = parseStatementText(t, { dateOrder: 'mdy', ocr: true });
  assert.deepEqual(on.transactions[1].ocrFix, { field: 'balance', from: 299580 });
  assert.equal(on.transactions[1].balance, 299550);
  assert.equal(on.reconcile.ok, true);
});

test('OCR mode: a row lost from the scan is reported, never absorbed into its neighbour', () => {
  const t = stmt(`03/02   COFFEE SHOP                 4.50                  995.50
03/09   RENT                    1,200.00                1,795.50`);
  const on = parseStatementText(t, { dateOrder: 'mdy', ocr: true });
  assert.equal(on.reconcile.ok, false);
  assert.ok(!on.transactions.some((x) => x.ocrFix));
  assert.ok(on.findings.some((f) => /running balance breaks/.test(f.title)));
});

test('OCR mode: the first row is not repaired against the opening balance alone', () => {
  const t = stmt(`03/02   COFFEE SHOP                 9.50                  995.50
03/05   SALARY ACME                         2,000.00    2,995.50
03/09   RENT                    1,200.00                1,795.50`);
  const on = parseStatementText(t, { dateOrder: 'mdy', ocr: true });
  assert.ok(!on.transactions.some((x) => x.ocrFix));
});

test('plausibleMisread: one digit, or two in the same length, OCR look-alikes half', () => {
  assert.equal(plausibleMisread(78713, 75713), true); // one digit
  assert.equal(plausibleMisread(123456, 12356), true); // one dropped
  assert.equal(plausibleMisread(1112, 7772), true); // three 1-for-7: 1.5
  assert.equal(plausibleMisread(4512, 4987), false);
  assert.equal(plausibleMisread(120000, 80000), false); // a lost 2,000.00 row, not a misread
  assert.equal(plausibleMisread(1234, 1243), true); // two swapped, same length
});

test('the OCR engine is pinned and comes only from jsDelivr; the module itself makes no requests', () => {
  for (const u of Object.values(OCR_URLS)) assert.match(u, /^https:\/\/cdn\.jsdelivr\.net\/npm\/(@[a-z.-]+\/)?[a-z.-]+@\d+\.\d+\.\d+/);
  const src = readFileSync(new URL('./ocr.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
});
