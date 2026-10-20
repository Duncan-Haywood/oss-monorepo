// @ts-check
// Ebooks and print books from Markdown chapters:
//   - buildEpub: a reflowable EPUB 3 (with an EPUB 2 toc.ncx for older
//     readers), the file KDP, Apple Books, Kobo, Google Play Books and
//     Draft2Digital all accept;
//   - buildPrintHtml: one print-ready HTML file sized to a trim size with
//     mirrored gutter margins, which a browser prints to the interior PDF;
//   - paperbackCover: the full-wrap cover size (back + spine + front + bleed)
//     for a page count, trim and paper;
//   - checkEpub / lintBook / checkCover: what is missing or out of spec.
// Pure and browser-safe; the CLI supplies file bytes and a deflate function.

import { xml, uuidv4, slugify } from './util.mjs';
import { markdownToXhtml } from './markdown.mjs';
import { buildZip, listZip } from './zip.mjs';

/**
 * @typedef {{
 *   title: string, subtitle?: string, author?: string, authors?: string[],
 *   language: string, identifier?: string, publisher?: string, date?: string,
 *   description?: string, rights?: string, subjects?: string[], cover?: string,
 *   series?: string, seriesIndex?: number,
 * }} BookMeta
 * @typedef {{severity: 'danger'|'notice', field: string, message: string, fix?: string}} Finding
 * @typedef {{data: Uint8Array, mime: string}} Asset
 */

/** @param {BookMeta} book */
export function authorsOf(book) {
  return book.authors?.length ? book.authors : book.author ? [book.author] : [];
}

/**
 * @param {{book: BookMeta, chapters?: string[]}} project
 * @returns {Finding[]}
 */
export function lintBook(project) {
  /** @type {Finding[]} */
  const out = [];
  const b = project.book ?? /** @type {BookMeta} */ ({});
  if (!b.title) out.push({ severity: 'danger', field: 'book.title', message: 'The book has no title.' });
  if (!authorsOf(b).length) out.push({ severity: 'danger', field: 'book.author', message: 'No author. Every store requires a contributor name.' });
  if (!b.language) out.push({ severity: 'danger', field: 'book.language', message: 'No language. EPUB requires dc:language.', fix: 'a BCP 47 code such as "en" or "en-GB"' });
  else if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(b.language)) out.push({ severity: 'danger', field: 'book.language', message: `"${b.language}" is not a BCP 47 language code.`, fix: 'e.g. "en", "es", "pt-BR"' });
  if (!b.identifier) out.push({ severity: 'notice', field: 'book.identifier', message: 'No identifier; a random urn:uuid will be written. Set one so rebuilds keep the same identity (an ISBN if you have one, else the uuid printed after the first build).' });
  else if (/^(isbn:|97[89])/i.test(b.identifier) && !isValidIsbn13(b.identifier.replace(/^isbn:/i, ''))) out.push({ severity: 'danger', field: 'book.identifier', message: `"${b.identifier}" fails the ISBN-13 check digit.` });
  if (!b.cover) out.push({ severity: 'notice', field: 'book.cover', message: 'No cover image. Stores take the cover separately, but readers show the one inside the EPUB in the library view.' });
  if (!b.description) out.push({ severity: 'notice', field: 'book.description', message: 'No description. It becomes dc:description and is what store listings and search snippets show.' });
  if (!project.chapters?.length) out.push({ severity: 'danger', field: 'chapters', message: 'No chapters listed.', fix: 'chapters: ["chapters/01.md", ...] in publish.json' });
  return out;
}

/** @param {string} s */
export function isValidIsbn13(s) {
  const d = s.replace(/[-\s]/g, '');
  if (!/^97[89]\d{10}$/.test(d)) return false;
  const sum = [...d].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

const BASE_CSS = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.2; page-break-after: avoid; break-after: avoid; }
h1 { margin: 3em 0 1.5em; text-align: center; }
p { margin: 0; text-indent: 1.5em; }
h1 + p, h2 + p, h3 + p, hr + p, blockquote + p, p:first-child { text-indent: 0; }
hr.scene-break { border: 0; text-align: center; margin: 1.5em 0; }
hr.scene-break::after { content: "* * *"; }
blockquote { margin: 1em 2em; font-style: italic; }
pre { white-space: pre-wrap; font-size: .85em; }
img { max-width: 100%; }
.title-page { text-align: center; margin-top: 20%; }
.title-page p { text-indent: 0; }
`;

/** @param {string} lang @param {string} title @param {string} body @param {string} [extraHead] */
function xhtmlDoc(lang, title, body, extraHead = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(lang)}" lang="${xml(lang)}">
<head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="../style.css"/>${extraHead}</head>
<body>
${body}
</body>
</html>
`;
}

/** @param {string} name */
function mimeFor(name) {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}

/**
 * Builds the EPUB.
 * @param {{
 *   book: BookMeta,
 *   chapters: {name?: string, markdown: string}[],
 *   cover?: Asset,
 *   images?: Record<string, Asset>,
 *   css?: string,
 *   modified?: Date,
 * }} input
 * @param {{deflateRaw?: (d: Uint8Array) => Uint8Array}} [opts]
 * @returns {{epub: Uint8Array, identifier: string, chapters: {file: string, title: string}[], missingImages: string[]}}
 */
export function buildEpub(input, opts = {}) {
  const { book } = input;
  const lang = book.language || 'en';
  const identifier = book.identifier || `urn:uuid:${uuidv4()}`;
  const modified = (input.modified ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
  const authors = authorsOf(book);
  /** @type {{name: string, data: Uint8Array|string, store?: boolean}[]} */
  const files = [];
  /** @type {{id: string, href: string, type: string, props?: string}[]} */
  const manifest = [];
  /** @type {string[]} */
  const spine = [];
  const missingImages = /** @type {string[]} */ ([]);
  const imageNames = new Map();

  if (input.cover) {
    const ext = input.cover.mime === 'image/png' ? 'png' : 'jpg';
    files.push({ name: `OEBPS/images/cover.${ext}`, data: input.cover.data, store: true });
    manifest.push({ id: 'cover-image', href: `images/cover.${ext}`, type: input.cover.mime, props: 'cover-image' });
    files.push({ name: 'OEBPS/text/cover.xhtml', data: xhtmlDoc(lang, book.title, `<section epub:type="cover"><img src="../images/cover.${ext}" alt="${xml(book.title)} cover"/></section>`, '<style>body{margin:0;text-align:center}img{max-height:100vh}</style>') });
    manifest.push({ id: 'cover', href: 'text/cover.xhtml', type: 'application/xhtml+xml' });
    spine.push('cover');
  }

  const titleBody = `<section class="title-page" epub:type="titlepage"><h1>${xml(book.title)}</h1>${book.subtitle ? `<p>${xml(book.subtitle)}</p>` : ''}${authors.length ? `<p>${xml(authors.join(', '))}</p>` : ''}${book.publisher ? `<p>${xml(book.publisher)}</p>` : ''}${book.rights ? `<p><small>${xml(book.rights)}</small></p>` : ''}</section>`;
  files.push({ name: 'OEBPS/text/title.xhtml', data: xhtmlDoc(lang, book.title, titleBody) });
  manifest.push({ id: 'titlepage', href: 'text/title.xhtml', type: 'application/xhtml+xml' });
  spine.push('titlepage');

  const toc = /** @type {{file: string, title: string}[]} */ ([]);
  input.chapters.forEach((ch, i) => {
    const { title, body, images } = markdownToXhtml(ch.markdown);
    let html = body;
    for (const src of images) {
      if (/^[a-z]+:/i.test(src)) continue;
      const asset = input.images?.[src];
      if (!asset) { missingImages.push(src); continue; }
      if (!imageNames.has(src)) {
        const base = `${slugify(src.replace(/\.[^.]+$/, ''))}-${imageNames.size + 1}.${src.split('.').pop()?.toLowerCase()}`;
        imageNames.set(src, base);
        files.push({ name: `OEBPS/images/${base}`, data: asset.data, store: true });
        manifest.push({ id: `img-${imageNames.size}`, href: `images/${base}`, type: asset.mime || mimeFor(base) });
      }
      html = html.split(`src="${xml(src)}"`).join(`src="../images/${imageNames.get(src)}"`);
    }
    const n = String(i + 1).padStart(3, '0');
    const chTitle = title || ch.name || `Chapter ${i + 1}`;
    files.push({ name: `OEBPS/text/ch${n}.xhtml`, data: xhtmlDoc(lang, chTitle, `<section epub:type="chapter">\n${html}\n</section>`) });
    manifest.push({ id: `ch${n}`, href: `text/ch${n}.xhtml`, type: 'application/xhtml+xml' });
    spine.push(`ch${n}`);
    toc.push({ file: `text/ch${n}.xhtml`, title: chTitle });
  });

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(lang)}" lang="${xml(lang)}">
<head><meta charset="UTF-8"/><title>Contents</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${toc.map((t) => `<li><a href="${t.file}">${xml(t.title)}</a></li>`).join('\n')}
</ol></nav>
<nav epub:type="landmarks" hidden=""><ol>
${input.cover ? '<li><a epub:type="cover" href="text/cover.xhtml">Cover</a></li>\n' : ''}${toc.length ? `<li><a epub:type="bodymatter" href="${toc[0].file}">Start</a></li>` : ''}
</ol></nav>
</body>
</html>
`;
  manifest.push({ id: 'nav', href: 'nav.xhtml', type: 'application/xhtml+xml', props: 'nav' });
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${xml(identifier)}"/></head>
<docTitle><text>${xml(book.title)}</text></docTitle>
<navMap>
${toc.map((t, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(t.title)}</text></navLabel><content src="${t.file}"/></navPoint>`).join('\n')}
</navMap>
</ncx>
`;
  manifest.push({ id: 'ncx', href: 'toc.ncx', type: 'application/x-dtbncx+xml' });
  manifest.push({ id: 'css', href: 'style.css', type: 'text/css' });

  const meta = [
    `<dc:identifier id="pub-id">${xml(identifier)}</dc:identifier>`,
    `<dc:title id="title">${xml(book.title)}</dc:title>`,
    book.subtitle ? `<dc:title id="subtitle">${xml(book.subtitle)}</dc:title><meta refines="#subtitle" property="title-type">subtitle</meta>` : '',
    `<dc:language>${xml(lang)}</dc:language>`,
    ...authors.map((a, i) => `<dc:creator id="creator${i}">${xml(a)}</dc:creator><meta refines="#creator${i}" property="role" scheme="marc:relators">aut</meta>`),
    book.publisher ? `<dc:publisher>${xml(book.publisher)}</dc:publisher>` : '',
    book.date ? `<dc:date>${xml(book.date)}</dc:date>` : '',
    book.description ? `<dc:description>${xml(book.description)}</dc:description>` : '',
    book.rights ? `<dc:rights>${xml(book.rights)}</dc:rights>` : '',
    ...(book.subjects ?? []).map((s) => `<dc:subject>${xml(s)}</dc:subject>`),
    book.series ? `<meta property="belongs-to-collection" id="series">${xml(book.series)}</meta><meta refines="#series" property="collection-type">series</meta>${book.seriesIndex ? `<meta refines="#series" property="group-position">${book.seriesIndex}</meta>` : ''}` : '',
    `<meta property="dcterms:modified">${modified}</meta>`,
    input.cover ? '<meta name="cover" content="cover-image"/>' : '',
  ].filter(Boolean);
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${xml(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${meta.join('\n')}
</metadata>
<manifest>
${manifest.map((m) => `<item id="${m.id}" href="${xml(m.href)}" media-type="${m.type}"${m.props ? ` properties="${m.props}"` : ''}/>`).join('\n')}
</manifest>
<spine toc="ncx">
${spine.map((id) => `<itemref idref="${id}"${id === 'cover' ? ' linear="no"' : ''}/>`).join('\n')}
</spine>
</package>
`;
  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;
  const epub = buildZip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/toc.ncx', data: ncx },
    { name: 'OEBPS/style.css', data: input.css ? `${BASE_CSS}\n${input.css}` : BASE_CSS },
    ...files,
  ], { deflateRaw: opts.deflateRaw, date: input.modified });
  return { epub, identifier, chapters: toc, missingImages };
}

/**
 * Structural checks on an EPUB's ZIP container: the rules readers and store
 * ingestion reject a file for before they look at the content. Not a
 * replacement for EPUBCheck, which also validates every XHTML document.
 * @param {Uint8Array} b
 * @param {{inflateRaw?: (d: Uint8Array) => Uint8Array}} [opts]
 * @returns {Finding[]}
 */
export function checkEpub(b, opts = {}) {
  /** @type {Finding[]} */
  const out = [];
  let entries;
  try { entries = listZip(b); } catch (e) { return [{ severity: 'danger', field: 'zip', message: /** @type {Error} */ (e).message }]; }
  const read = (/** @type {{name: string, method: number, offset: number, compressedSize: number}} */ e) => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
    const raw = b.subarray(start, start + e.compressedSize);
    if (e.method === 0) return new TextDecoder().decode(raw);
    if (e.method === 8 && opts.inflateRaw) return new TextDecoder().decode(opts.inflateRaw(raw));
    return null;
  };
  const first = entries[0];
  if (!first || first.name !== 'mimetype') out.push({ severity: 'danger', field: 'mimetype', message: 'The first ZIP entry must be "mimetype".' });
  else {
    if (first.method !== 0) out.push({ severity: 'danger', field: 'mimetype', message: 'The mimetype entry must be stored, not compressed.' });
    if (read(first) !== 'application/epub+zip') out.push({ severity: 'danger', field: 'mimetype', message: 'The mimetype entry must contain exactly "application/epub+zip".' });
  }
  const byName = new Map(entries.map((e) => [e.name, e]));
  const container = byName.get('META-INF/container.xml');
  if (!container) { out.push({ severity: 'danger', field: 'container', message: 'META-INF/container.xml is missing.' }); return out; }
  const containerXml = read(container);
  const opfPath = containerXml?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath || !byName.has(opfPath)) { out.push({ severity: 'danger', field: 'container', message: `container.xml points at "${opfPath ?? '(nothing)'}", which is not in the file.` }); return out; }
  const opf = read(/** @type {any} */ (byName.get(opfPath)));
  if (opf === null) { out.push({ severity: 'notice', field: 'opf', message: 'The package document is compressed and no inflate function was given, so its contents were not checked.' }); return out; }
  for (const tag of ['dc:title', 'dc:language', 'dc:identifier']) {
    if (!new RegExp(`<${tag}[\\s>]`).test(opf)) out.push({ severity: 'danger', field: 'opf', message: `The package document has no <${tag}>.` });
  }
  if (/version="3/.test(opf) && !/dcterms:modified/.test(opf)) out.push({ severity: 'danger', field: 'opf', message: 'An EPUB 3 package needs <meta property="dcterms:modified">.' });
  if (/version="3/.test(opf) && !/properties="[^"]*\bnav\b/.test(opf)) out.push({ severity: 'danger', field: 'opf', message: 'An EPUB 3 package needs a navigation document (properties="nav").' });
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  for (const m of opf.matchAll(/<item\b[^>]*href="([^"]+)"/g)) {
    const href = decodeURIComponent(m[1]);
    if (!/^[a-z]+:/i.test(href) && !byName.has(dir + href)) out.push({ severity: 'danger', field: 'manifest', message: `The manifest lists "${href}", which is not in the file.` });
  }
  if (!/properties="[^"]*cover-image/.test(opf) && !/name="cover"/.test(opf)) out.push({ severity: 'notice', field: 'cover', message: 'No cover image is declared inside the EPUB.' });
  return out;
}

// Cover-art targets as each platform documents them (checked at build time;
// platforms revise these, so treat a miss as a reason to look, not a verdict).
export const COVER_SPECS = {
  'podcast': { label: 'Apple Podcasts show art', square: true, min: [1400, 1400], max: [3000, 3000], formats: ['jpeg', 'png'] },
  'audiobook': { label: 'ACX / Audible audiobook cover', square: true, min: [2400, 2400], formats: ['jpeg'] },
  'ebook': { label: 'Kindle ebook cover (KDP)', ratio: 1.6, min: [625, 1000], ideal: [1600, 2560], max: [10000, 10000], formats: ['jpeg', 'png'] },
};

/**
 * @param {{format: string, width?: number, height?: number, colorModel?: string, error?: string}} img  from media.probe
 * @param {keyof typeof COVER_SPECS} target
 * @returns {Finding[]}
 */
export function checkCover(img, target) {
  /** @type {any} */
  const spec = COVER_SPECS[target];
  /** @type {Finding[]} */
  const out = [];
  const add = (/** @type {Finding['severity']} */ severity, /** @type {string} */ message) => out.push({ severity, field: 'cover', message });
  if (img.error || !img.width || !img.height) { add('danger', `Could not read the image: ${img.error ?? 'no dimensions'}.`); return out; }
  const { width: w, height: h } = img;
  if (!spec.formats.includes(img.format)) add('danger', `${spec.label}: ${img.format.toUpperCase()} given; expected ${spec.formats.map((/** @type {string} */ f) => f.toUpperCase()).join(' or ')}.`);
  if (img.colorModel === 'cmyk') add('danger', `${spec.label}: the image is CMYK; stores expect RGB.`);
  if (spec.square && w !== h) add('danger', `${spec.label} must be square; this is ${w}×${h}.`);
  if (w < spec.min[0] || h < spec.min[1]) add('danger', `${spec.label}: ${w}×${h} is below the ${spec.min[0]}×${spec.min[1]} minimum.`);
  if (spec.max && (w > spec.max[0] || h > spec.max[1])) add('notice', `${spec.label}: ${w}×${h} is above the ${spec.max[0]}×${spec.max[1]} maximum.`);
  if (spec.ratio && Math.abs(h / w - spec.ratio) > 0.05) add('notice', `${spec.label}: height ÷ width is ${(h / w).toFixed(2)}; the recommended ratio is ${spec.ratio}:1 (ideal ${spec.ideal[0]}×${spec.ideal[1]}).`);
  return out;
}

// KDP's documented paper thickness per page, in inches.
export const PAPER_INCHES_PER_PAGE = { white: 0.002252, cream: 0.0025, 'standard-color': 0.002252, 'premium-color': 0.002347 };
export const BLEED_IN = 0.125;

/** "6x9" -> {w: 6, h: 9} @param {string} trim */
export function parseTrim(trim) {
  const m = String(trim).match(/^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(in)?\s*$/i);
  if (!m) throw new Error(`trim must look like "6x9" (inches), got "${trim}"`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

/**
 * Full-wrap paperback cover dimensions for KDP Print: back + spine + front,
 * with 0.125" bleed on every outside edge.
 * @param {{pages: number, trim?: string, paper?: keyof typeof PAPER_INCHES_PER_PAGE, dpi?: number}} p
 */
export function paperbackCover({ pages, trim = '6x9', paper = 'white', dpi = 300 }) {
  const t = parseTrim(trim);
  const per = PAPER_INCHES_PER_PAGE[paper];
  if (!per) throw new Error(`paper must be one of ${Object.keys(PAPER_INCHES_PER_PAGE).join(', ')}`);
  if (!Number.isFinite(pages) || pages < 1) throw new Error('pages must be a positive number');
  const r = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;
  const spine = pages * per;
  const width = BLEED_IN + t.w + spine + t.w + BLEED_IN;
  const height = BLEED_IN + t.h + BLEED_IN;
  /** @type {string[]} */
  const notes = [];
  if (pages < 24) notes.push('KDP paperbacks need at least 24 pages.');
  if (pages % 2) notes.push('Page counts are even in print; KDP adds a blank page to an odd count.');
  notes.push(pages > 79 ? 'Spine text is allowed (over 79 pages); keep it 0.0625" from each spine edge.' : 'No spine text: KDP allows it only above 79 pages.');
  return {
    trim: t, pages, paper,
    spineIn: r(spine),
    widthIn: r(width), heightIn: r(height),
    widthPx: Math.ceil(width * dpi), heightPx: Math.ceil(height * dpi), dpi,
    frontStartsAtIn: r(BLEED_IN + t.w + spine),
    gutterIn: interiorGutter(pages),
    notes,
  };
}

/** KDP's minimum inside (gutter) margin for a page count, in inches. @param {number} pages */
export function interiorGutter(pages) {
  return pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875;
}

/**
 * One HTML file laid out for print at the trim size, chapters on new right-
 * hand pages, mirrored margins. Print it to PDF with a Chromium-based browser
 * (or headless: chromium --headless --print-to-pdf=interior.pdf book.html).
 * @param {{book: BookMeta, chapters: {name?: string, markdown: string}[], trim?: string, pagesEstimate?: number, css?: string}} input
 */
export function buildPrintHtml(input) {
  const { book } = input;
  const t = parseTrim(input.trim ?? '6x9');
  const gutter = interiorGutter(input.pagesEstimate ?? 200);
  const outside = 0.5;
  const authors = authorsOf(book);
  const chapters = input.chapters.map((ch) => markdownToXhtml(ch.markdown).body).map((b) => `<section class="chapter">\n${b}\n</section>`).join('\n');
  return `<!doctype html>
<html lang="${xml(book.language || 'en')}">
<head>
<meta charset="utf-8">
<title>${xml(book.title)} (print interior)</title>
<style>
@page { size: ${t.w}in ${t.h}in; margin: 0.75in ${outside}in 0.75in ${gutter}in; }
@page :left { margin-left: ${outside}in; margin-right: ${gutter}in; }
@page :right { margin-left: ${gutter}in; margin-right: ${outside}in; }
@page :first { margin-top: 2in; }
html { font: 11pt/1.45 Georgia, "Times New Roman", serif; }
body { margin: 0; }
h1 { font-size: 1.6em; text-align: center; margin: 1.2in 0 .5in; }
h2 { font-size: 1.2em; }
p { margin: 0; text-indent: 1.5em; text-align: justify; hyphens: auto; orphans: 2; widows: 2; }
h1 + p, h2 + p, h3 + p, hr + p, blockquote + p { text-indent: 0; }
.chapter { break-before: right; }
.title-page { text-align: center; break-after: page; }
.title-page h1 { font-size: 2.2em; margin-top: 1.5in; }
.title-page p { text-indent: 0; text-align: center; }
.copyright { break-before: page; break-after: right; font-size: 8.5pt; display: flex; flex-direction: column; justify-content: flex-end; height: ${t.h - 1.5}in; }
.copyright p { text-indent: 0; text-align: left; }
hr.scene-break { border: 0; text-align: center; margin: 1em 0; }
hr.scene-break::after { content: "*  *  *"; }
blockquote { margin: 1em 1.5em; font-style: italic; }
img { max-width: 100%; }
pre { white-space: pre-wrap; font-size: .85em; }
${input.css ?? ''}
</style>
</head>
<body>
<section class="title-page"><h1>${xml(book.title)}</h1>${book.subtitle ? `<p>${xml(book.subtitle)}</p>` : ''}<p>${xml(authors.join(', '))}</p></section>
<section class="copyright"><p>${xml(book.rights || `Copyright © ${new Date().getFullYear()} ${authors.join(', ')}`)}</p>${book.identifier && /97[89]/.test(book.identifier) ? `<p>ISBN ${xml(book.identifier.replace(/^isbn:/i, ''))}</p>` : ''}${book.publisher ? `<p>${xml(book.publisher)}</p>` : ''}</section>
${chapters}
</body>
</html>
`;
}

/** Counts pages in a PDF by its /Type /Page objects (enough for a page count). @param {Uint8Array} b */
export function pdfPageCount(b) {
  const s = new TextDecoder('latin1').decode(b);
  return (s.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}
