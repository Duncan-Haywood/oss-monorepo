import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { markdownToXhtml } from './markdown.mjs';
import { buildEpub, checkEpub, lintBook, checkCover, paperbackCover, buildPrintHtml, isValidIsbn13, pdfPageCount } from './book.mjs';
import { buildZip, listZip } from './zip.mjs';
import { png, jpeg } from './fixtures.mjs';

const inflateRaw = (d) => new Uint8Array(inflateRawSync(d));
const deflateRaw = (d) => new Uint8Array(deflateRawSync(d));
const book = { title: 'Tea & Toast', author: 'Ada', language: 'en', identifier: 'urn:uuid:00000000-0000-4000-8000-000000000000', description: 'A test.' };

test('markdown: headings, emphasis, links, lists, quotes, code, breaks; all escaped', () => {
  const { title, body, images } = markdownToXhtml([
    '# One *two*', '', 'A **b** & <c> `x<y>` [l](https://e.com).', '', '![alt](img/a.png)', '', '* * *',
    '', '> q _e_', '', '- a', '- b', '', '1. x', '2. y', '', '```', '<raw>', '```',
  ].join('\n'));
  assert.equal(title, 'One two');
  assert.match(body, /<h1>One <em>two<\/em><\/h1>/);
  assert.match(body, /<p>A <strong>b<\/strong> &amp; &lt;c&gt; <code>x&lt;y&gt;<\/code> <a href="https:\/\/e.com">l<\/a>.<\/p>/);
  assert.match(body, /<img src="img\/a.png" alt="alt"\/>/);
  assert.match(body, /<hr class="scene-break"\/>/);
  assert.match(body, /<blockquote><p>q <em>e<\/em><\/p><\/blockquote>/);
  assert.match(body, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(body, /<ol><li>x<\/li><li>y<\/li><\/ol>/);
  assert.match(body, /<pre><code>&lt;raw&gt;<\/code><\/pre>/);
  assert.deepEqual(images, ['img/a.png']);
});

test('zip round-trips: stored and deflated entries, central directory', () => {
  const z = buildZip([{ name: 'mimetype', data: 'application/epub+zip', store: true }, { name: 'a/b.txt', data: 'hello '.repeat(100) }], { deflateRaw });
  const entries = listZip(z);
  assert.deepEqual(entries.map((e) => [e.name, e.method]), [['mimetype', 0], ['a/b.txt', 8]]);
});

test('EPUB: structure passes checkEpub, with and without compression', () => {
  for (const opts of [{}, { deflateRaw }]) {
    const { epub, chapters, missingImages } = buildEpub({
      book, chapters: [{ markdown: '# First\n\nHello ![f](f.png)' }, { markdown: 'No heading here.' }],
      cover: { data: jpeg(1600, 2560), mime: 'image/jpeg' }, images: { 'f.png': { data: png(4, 4), mime: 'image/png' } },
      modified: new Date('2026-10-20T00:00:00Z'),
    }, opts);
    assert.deepEqual(checkEpub(epub, { inflateRaw }), []);
    assert.deepEqual(chapters.map((c) => c.title), ['First', 'Chapter 2']);
    assert.deepEqual(missingImages, []);
    const names = listZip(epub).map((e) => e.name);
    assert.equal(names[0], 'mimetype');
    for (const n of ['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx', 'OEBPS/images/cover.jpg', 'OEBPS/text/ch001.xhtml']) assert.ok(names.includes(n), n);
  }
});

test('EPUB: a missing image is reported; identifier is generated when absent', () => {
  const r = buildEpub({ book: { ...book, identifier: undefined }, chapters: [{ markdown: '![x](nope.jpg)' }] });
  assert.deepEqual(r.missingImages, ['nope.jpg']);
  assert.match(r.identifier, /^urn:uuid:[0-9a-f-]{36}$/);
});

test('checkEpub catches a compressed mimetype and a missing manifest file', () => {
  const bad = buildZip([
    { name: 'mimetype', data: 'application/epub+zip'.repeat(5) },
    { name: 'META-INF/container.xml', data: '<rootfile full-path="c.opf"/>' },
    { name: 'c.opf', data: '<package version="3.0"><dc:title>x</dc:title><item href="gone.xhtml"/></package>' },
  ], { deflateRaw });
  const msgs = checkEpub(bad, { inflateRaw }).map((f) => f.message).join('\n');
  assert.match(msgs, /must be stored/);
  assert.match(msgs, /dc:language/);
  assert.match(msgs, /gone.xhtml/);
  assert.match(msgs, /dcterms:modified/);
  assert.deepEqual(checkEpub(new Uint8Array(10)).map((f) => f.field), ['zip']);
});

test('lintBook and ISBN-13 check digit', () => {
  assert.equal(isValidIsbn13('978-0-306-40615-7'), true);
  assert.equal(isValidIsbn13('9780306406158'), false);
  const f = lintBook({ book: { title: '', language: 'English', identifier: '9780306406158' }, chapters: [] });
  const fields = f.map((x) => x.field);
  for (const k of ['book.title', 'book.author', 'book.language', 'book.identifier', 'chapters']) assert.ok(fields.includes(k), k);
});

test('cover specs: podcast square 1400-3000, ACX 2400 square, KDP 1.6 ratio, CMYK flagged', () => {
  assert.deepEqual(checkCover({ format: 'jpeg', width: 3000, height: 3000, colorModel: 'rgb' }, 'podcast'), []);
  assert.ok(checkCover({ format: 'jpeg', width: 1000, height: 1000 }, 'podcast').some((f) => /minimum/.test(f.message)));
  assert.ok(checkCover({ format: 'png', width: 2400, height: 2400 }, 'audiobook').some((f) => /PNG given/.test(f.message)));
  assert.ok(checkCover({ format: 'jpeg', width: 2400, height: 2000 }, 'audiobook').some((f) => /square/.test(f.message)));
  assert.deepEqual(checkCover({ format: 'jpeg', width: 1600, height: 2560, colorModel: 'rgb' }, 'ebook'), []);
  assert.ok(checkCover({ format: 'jpeg', width: 1600, height: 1600, colorModel: 'cmyk' }, 'ebook').some((f) => /CMYK/.test(f.message)));
});

test('paperback cover: KDP spine and full-wrap size', () => {
  const c = paperbackCover({ pages: 300, trim: '6x9', paper: 'white' });
  assert.equal(c.spineIn, 0.676); // 300 x 0.002252
  assert.equal(c.widthIn, 12.926); // 0.125 + 6 + 0.6756 + 6 + 0.125
  assert.equal(c.heightIn, 9.25);
  assert.equal(c.widthPx, 3878);
  assert.equal(c.gutterIn, 0.5);
  assert.equal(paperbackCover({ pages: 100, paper: 'cream' }).spineIn, 0.25);
  assert.ok(paperbackCover({ pages: 60 }).notes.some((n) => /No spine text/.test(n)));
  assert.throws(() => paperbackCover({ pages: 100, trim: 'A5' }));
  assert.throws(() => paperbackCover({ pages: 100, paper: /** @type {any} */ ('gold') }));
});

test('print HTML sets the page size and mirrored margins', () => {
  const html = buildPrintHtml({ book, chapters: [{ markdown: '# A\n\ntext' }], trim: '5.5x8.5', pagesEstimate: 320 });
  assert.match(html, /@page \{ size: 5.5in 8.5in;/);
  assert.match(html, /@page :right \{ margin-left: 0.625in; margin-right: 0.5in; \}/);
  assert.match(html, /<section class="chapter">/);
});

test('pdfPageCount counts page objects, not the Pages tree', () => {
  const pdf = new TextEncoder().encode('<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page /Parent 1 0 R >>');
  assert.equal(pdfPageCount(pdf), 2);
});
