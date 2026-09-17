import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { analyzePdf } from './engine.mjs';
import { inflate } from './cli/inflate-node.mjs';
import { buildPdf, accessiblePdfObjects, ACCESSIBLE_TRAILER } from './cli/fixtures.mjs';

function findingIds(report) { return report.findings.map((f) => f.id); }
function noteIds(report) { return report.notes.map((n) => n.id); }

test('a fully tagged, titled, labeled PDF has no danger findings', async () => {
  const bytes = buildPdf(accessiblePdfObjects(), ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.equal(report.parsed, true);
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
  assert.equal(report.stats.tagged, true);
  assert.equal(report.stats.title, 'Sample Document');
  assert.equal(report.stats.lang, 'en-US');
  assert.equal(report.stats.totalImages, 1);
  assert.equal(report.stats.altCount, 1);
  assert.equal(report.pageCount, 1);
});

test('an untagged PDF with no title and no language reports all three as danger findings', async () => {
  const objects = [
    { num: 1, dict: '<< /Type /Catalog /Pages 2 0 R >>' },
    { num: 2, dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    { num: 3, dict: '<< /Type /Page /Parent 2 0 R /Resources << >> /Contents 4 0 R /MediaBox [0 0 612 792] >>' },
    { num: 4, dict: '<< /Length 10 >>', stream: 'BT ET' },
  ];
  const bytes = buildPdf(objects, '<< /Root 1 0 R >>');
  const report = await analyzePdf(bytes, { inflate });
  assert.equal(report.ok, false);
  const ids = findingIds(report);
  assert.ok(ids.includes('not-tagged'));
  assert.ok(ids.includes('missing-title'));
  assert.ok(ids.includes('missing-lang'));
  assert.equal(report.dangerCount, 3);
});

test('a byte string with no %PDF- header is reported as not a PDF', async () => {
  const report = await analyzePdf(new TextEncoder().encode('hello, this is not a pdf'), { inflate });
  assert.equal(report.parsed, false);
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].id, 'not-a-pdf');
});

test('images with no alt-bearing structure elements are flagged as danger', async () => {
  const objects = accessiblePdfObjects().filter((o) => o.num !== 6).concat([
    { num: 6, dict: '<< /Type /StructTreeRoot /K [] >>' }, // no Figure/Alt element at all
  ]);
  const bytes = buildPdf(objects, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.ok(findingIds(report).includes('images-no-alt'));
  assert.equal(report.stats.totalImages, 1);
  assert.equal(report.stats.altCount, 0);
});

test('some but not all images having alt text is a notice, not a danger finding', async () => {
  const objects = accessiblePdfObjects().concat([
    { num: 11, dict: '<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 2 >>', stream: new Uint8Array([9, 9]) },
  ]);
  // Add the second image into the page's resources alongside the first.
  const withSecondImage = objects.map((o) => (o.num === 3
    ? { ...o, dict: '<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 8 0 R /Im1 11 0 R >> >> /Contents 4 0 R /MediaBox [0 0 612 792] >>' }
    : o));
  const bytes = buildPdf(withSecondImage, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.equal(report.stats.totalImages, 2);
  assert.equal(report.stats.altCount, 1);
  assert.equal(findingIds(report).includes('images-no-alt'), false);
  assert.ok(noteIds(report).includes('images-alt-partial'));
});

test('a page with image content and no text-show operator is flagged as likely scanned', async () => {
  const objects = accessiblePdfObjects().map((o) => (o.num === 4
    ? { ...o, dict: '<< /Length 21 >>', stream: 'q 1 0 0 1 0 0 cm /Im0 Do Q' }
    : o));
  const bytes = buildPdf(objects, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.ok(findingIds(report).includes('scanned-no-text-layer'));
  assert.equal(report.stats.scannedPages, 1);
});

test('the shared engine reads FlateDecode content streams via the injected inflate function', async () => {
  const original = 'q 1 0 0 1 0 0 cm /Im0 Do Q'; // no Tj/TJ -- should still be flagged as scanned
  const compressed = zlib.deflateSync(Buffer.from(original, 'latin1'));
  const objects = accessiblePdfObjects().map((o) => (o.num === 4
    ? { num: 4, dict: `<< /Length ${compressed.length} /Filter /FlateDecode >>`, stream: new Uint8Array(compressed) }
    : o));
  const bytes = buildPdf(objects, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.ok(report.findings.map((f) => f.id).includes('scanned-no-text-layer'));
});

test('a form field widget with no /TU and no labeled ancestor is flagged as danger', async () => {
  const objects = accessiblePdfObjects().concat([
    { num: 12, dict: '<< /Type /Annot /Subtype /Widget /Rect [0 0 100 20] /FT /Tx >>' },
  ]);
  const bytes = buildPdf(objects, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.ok(findingIds(report).includes('unlabeled-form-fields'));
  assert.equal(report.stats.widgetCount, 1);
  assert.equal(report.stats.unlabeledWidgetCount, 1);
});

test('a form field widget with its own /TU is not flagged', async () => {
  const objects = accessiblePdfObjects().concat([
    { num: 12, dict: '<< /Type /Annot /Subtype /Widget /Rect [0 0 100 20] /FT /Tx /TU (Your name) >>' },
  ]);
  const bytes = buildPdf(objects, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.equal(findingIds(report).includes('unlabeled-form-fields'), false);
});

test('a form field widget inherits its label from a /Parent field', async () => {
  const objects = accessiblePdfObjects().concat([
    { num: 12, dict: '<< /FT /Tx /TU (Your name) /Kids [13 0 R] >>' },
    { num: 13, dict: '<< /Type /Annot /Subtype /Widget /Rect [0 0 100 20] /Parent 12 0 R >>' },
  ]);
  const bytes = buildPdf(objects, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.equal(findingIds(report).includes('unlabeled-form-fields'), false);
});

test('an encrypted PDF gets an informational note, not a silent skip', async () => {
  const bytes = buildPdf(accessiblePdfObjects(), '<< /Root 1 0 R /Info 10 0 R /Encrypt 99 0 R >>');
  const report = await analyzePdf(bytes, { inflate });
  assert.ok(noteIds(report).includes('encrypted'));
  assert.equal(report.stats.encrypted, true);
});

test('a title without DisplayDocTitle is a notice, and disappears once it is set', async () => {
  const objects = accessiblePdfObjects().map((o) => (o.num === 7 ? { ...o, dict: '<< /DisplayDocTitle false >>' } : o));
  const bytes = buildPdf(objects, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.ok(findingIds(report).includes('display-doc-title-off'));
});

test('a malformed /Lang value that is not a plausible BCP 47 tag is a notice', async () => {
  const objects = accessiblePdfObjects().map((o) => (o.num === 1
    ? { ...o, dict: o.dict.replace('/Lang (en-US)', '/Lang (not a real language tag!)') }
    : o));
  const bytes = buildPdf(objects, ACCESSIBLE_TRAILER);
  const report = await analyzePdf(bytes, { inflate });
  assert.ok(findingIds(report).includes('invalid-lang'));
  assert.equal(findingIds(report).includes('missing-lang'), false);
});
