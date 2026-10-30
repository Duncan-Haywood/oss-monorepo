// Share cards and share tags: the type rasteriser, the card, and the pass.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { fillText, fitText, font, measureText, wrapText } from './fontraster.mjs';
import { accentFor, cardKey, cardTitle, completeShareTags, crumbsOf, mapLimit, pageCardPlan, renderCards, researchTopicColour, siteAddress } from './share.mjs';
import { CARD_HEIGHT, CARD_WIDTH, quantize, renderCard, renderMarkIcon, renderSiteCard } from './sharecard.mjs';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BASE = 'https://example.github.io/site/';

test('the vendored Inter subsets parse and carry the characters titles use', () => {
  const bold = font('InterDisplay-Bold');
  assert.equal(bold.unitsPerEm, 2048);
  for (const ch of 'Aa0&—’“é€') assert.ok(bold.has(ch.codePointAt(0)), `missing ${ch}`);
  // A composite glyph (an accented letter) resolves to outlines.
  assert.ok(bold.glyph('é'.codePointAt(0)).contours.length >= 2);
});

test('kerning tightens a pair the face kerns', () => {
  const bold = font('InterDisplay-Bold');
  assert.ok(bold.kern('A', 'V') < 0);
  assert.ok(measureText(bold, 'AV', 80) < measureText(bold, 'A', 80) + measureText(bold, 'V', 80));
});

test('text fills pixels inside its box and nowhere else', () => {
  const canvas = { width: 300, height: 100, data: Buffer.alloc(300 * 100 * 3), channels: 3 };
  const advance = fillText(canvas, font('Inter-SemiBold'), 'Hi', { x: 10, y: 70, size: 60 });
  assert.ok(advance > 20);
  let lit = 0;
  let stray = 0;
  for (let y = 0; y < 100; y += 1) {
    for (let x = 0; x < 300; x += 1) {
      const v = canvas.data[(y * 300 + x) * 3];
      if (v > 128) { lit += 1; if (x > 10 + advance + 4) stray += 1; }
    }
  }
  assert.ok(lit > 400, `only ${lit} pixels drawn`);
  assert.equal(stray, 0);
});

test('wrapping fits the width or reports that it cannot', () => {
  const bold = font('InterDisplay-Bold');
  const lines = wrapText(bold, 'Does time-of-use pricing make a home battery pay', 60, 700, 3);
  assert.ok(lines && lines.length > 1);
  for (const line of lines) assert.ok(measureText(bold, line, 60) <= 700);
  assert.equal(wrapText(bold, 'Supercalifragilisticexpialidocious', 90, 200, 3), null);
  const fitted = fitText(bold, 'word '.repeat(60), { maxWidth: 600, maxLines: 2, maxSize: 60, minSize: 40 });
  assert.equal(fitted.lines.length, 2);
  assert.ok(fitted.lines[1].endsWith('…'), 'an overlong title is cut with an ellipsis, not overflowed');
});

test('a card is a 1200x630 PNG, deterministic, and differs by headline and accent', () => {
  const opts = { accent: '#1d4ed8', headline: 'eBay Fee & Profit Calculator', kicker: 'Marketplace seller tools', footer: 'Free', address: 'example.github.io/site' };
  const card = renderCard(opts);
  assert.deepEqual([...card.subarray(0, 8)], PNG);
  assert.equal(card.readUInt32BE(16), CARD_WIDTH);
  assert.equal(card.readUInt32BE(20), CARD_HEIGHT);
  assert.ok(card.equals(renderCard(opts)), 'same arguments, same bytes');
  assert.ok(!card.equals(renderCard({ ...opts, headline: 'Etsy Profit Calculator' })));
  assert.ok(!card.equals(renderCard({ ...opts, accent: '#c2410c' })));
  // Indexed colour keeps two thousand cards to a size the deploy can carry.
  assert.equal(card[25], 3, 'colour type 3 (palette)');
  assert.ok(card.length < 120_000, `card is ${card.length} bytes`);
});

test('the site card and the icons render', () => {
  assert.deepEqual([...renderSiteCard({ address: 'example.github.io/site' }).subarray(0, 8)], PNG);
  const touch = renderMarkIcon({ size: 180, opaque: true });
  assert.equal(touch.readUInt32BE(16), 180);
  assert.equal(touch[25], 2, 'the touch icon has no alpha channel');
  assert.equal(renderMarkIcon({ size: 192 })[25], 6, 'the plain icon keeps transparent corners');
});

test('quantize keeps at most 256 colours and maps every pixel', () => {
  const data = Buffer.alloc(64 * 64 * 3);
  for (let i = 0; i < data.length; i += 1) data[i] = (i * 37) % 251;
  const { palette, indices } = quantize(data);
  assert.ok(palette.length / 3 <= 256);
  assert.equal(indices.length, 64 * 64);
  assert.ok(Math.max(...indices) < palette.length / 3);
});

test('cardTitle drops search-result taglines and "free, private" suffixes', () => {
  assert.equal(cardTitle('Conformal Prediction Intervals Calculator — free, private, in your browser'), 'Conformal Prediction Intervals Calculator');
  assert.equal(cardTitle('Childcare costs after free hours and Tax-Free Childcare: free, private calculator'), 'Childcare costs after free hours and Tax-Free Childcare');
  assert.equal(cardTitle('Does a battery pay? | Open research'), 'Does a battery pay?');
  assert.equal(cardTitle('Writing · Open Tools and Research'), 'Writing');
  assert.equal(cardTitle('No-Show & Cancellation Fee Calculator'), 'No-Show & Cancellation Fee Calculator');
});

test('siteAddress prints host and path without the trailing slash', () => {
  assert.equal(siteAddress(BASE), 'example.github.io/site');
  assert.equal(siteAddress('not a url'), '');
});

const page = ({ image = `${BASE}social-card.png`, title = 'Does a battery pay?', crumbs = '' } = {}) => `<!doctype html><html><head>
<title>${title} | Open research</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="Adds a price to  energy-home 's model ( ten years ) .">
${image ? `<meta property="og:image" content="${image}">` : ''}
<link rel="icon" href="data:image/svg+xml,%3Csvg%3E">
<link rel="apple-touch-icon" href="../../icon-192.png">
</head><body><nav class="pfs-head"><span class="pfs-crumbs" role="group" aria-label="Breadcrumb"><a href="../../">Home</a><span class="pfs-sep">›</span><a href="../">Research</a><span class="pfs-sep">›</span>${crumbs}<span>${title}</span></span></nav></body></html>`;

test('a research page on the site-wide card gets a card of its own, coloured by its topic', () => {
  const html = page({ crumbs: '<a href="../../research/topics/energy/">Energy supply and dense energy storage</a>' });
  assert.deepEqual(crumbsOf(html), ['Research', 'Energy supply and dense energy storage']);
  const plan = pageCardPlan(html, 'research/energy-tou/index.html', { baseUrl: BASE });
  assert.equal(plan.file, 'research/energy-tou/share-card.png');
  assert.equal(plan.options.headline, 'Does a battery pay?');
  assert.equal(plan.options.kicker, 'Research · Energy supply and dense energy storage');
  assert.equal(plan.options.accent, researchTopicColour('energy'));
  assert.equal(plan.options.address, 'example.github.io/site');
});

test('a page with an image of its own, the homepage, and non-index files keep theirs', () => {
  assert.equal(pageCardPlan(page({ image: `${BASE}tool/share-card.png` }), 'tool/index.html', { baseUrl: BASE }), null);
  assert.equal(pageCardPlan(page(), 'index.html', { baseUrl: BASE }), null);
  assert.equal(pageCardPlan(page(), 'research/x/other.html', { baseUrl: BASE }), null);
});

test('completeShareTags points at the page card and fills the twitter: and size tags', () => {
  const out = completeShareTags(page(), { card: `${BASE}research/energy-tou/share-card.png`, toRoot: '../../' });
  assert.match(out, /<meta property="og:image" content="https:\/\/example\.github\.io\/site\/research\/energy-tou\/share-card\.png">/);
  assert.ok(!out.includes('social-card.png'));
  for (const tag of ['og:site_name', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:image:type']) {
    assert.ok(out.includes(`property="${tag}"`), `missing ${tag}`);
  }
  for (const tag of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
    assert.ok(out.includes(`name="${tag}"`), `missing ${tag}`);
  }
  // Whitespace left by stripped markup is tidied in the description.
  assert.match(out, /og:description" content="Adds a price to energy-home's model \(ten years\)\."/);
  // One logo: the inline data: icon goes, the site's SVG icon is linked, and
  // the touch icon is the opaque one.
  assert.ok(!out.includes('data:image/svg+xml'));
  assert.match(out, /<link rel="icon" href="\.\.\/\.\.\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(out, /rel="apple-touch-icon" href="\.\.\/\.\.\/apple-touch-icon\.png"/);
  // Idempotent: a second pass changes nothing.
  assert.equal(completeShareTags(out, { card: `${BASE}research/energy-tou/share-card.png`, toRoot: '../../' }), out);
});

test("a page's own relative og:image is kept, made absolute, and copied to twitter:image", () => {
  const html = page({ image: 'renders/og-8x12-share.jpg' });
  const url = `${BASE}ventures/shed-designer/`;
  assert.equal(pageCardPlan(html, 'ventures/shed-designer/index.html', { baseUrl: BASE }), null);
  const out = completeShareTags(html, { url, toRoot: '../../' });
  assert.match(out, /property="og:image" content="https:\/\/example\.github\.io\/site\/ventures\/shed-designer\/renders\/og-8x12-share\.jpg"/);
  assert.match(out, /name="twitter:image" content="https:\/\/example\.github\.io\/site\/ventures\/shed-designer\/renders\/og-8x12-share\.jpg"/);
  // Not ours, so no PNG type or card size is claimed for it.
  assert.ok(!out.includes('og:image:type'));
  assert.equal(completeShareTags(out, { url, toRoot: '../../' }), out);
  // An absolute or protocol-relative image is left alone; with no page URL nothing is guessed.
  for (const image of ['https://cdn.example/x.jpg', '//cdn.example/x.jpg']) {
    assert.ok(completeShareTags(page({ image }), { url }).includes(`content="${image}"`));
  }
  assert.ok(completeShareTags(html, {}).includes('content="renders/og-8x12-share.jpg"'));
});

test('completeShareTags leaves a tag a page already set', () => {
  const html = page().replace('</head>', '<meta name="twitter:title" content="Own title">\n</head>');
  const out = completeShareTags(html, {});
  assert.equal((out.match(/twitter:title/g) ?? []).length, 1);
  assert.ok(out.includes('content="Own title"'));
});

test('a page written with no og: tags gets title, description, url and type from its own head', () => {
  const html = '<!doctype html><html><head><title>Deploy your own copy</title>\n<meta name="description" content="Run  your own copy .">\n</head><body><svg><title>chart</title></svg></body></html>';
  const out = completeShareTags(html, { card: `${BASE}deploy/share-card.png`, url: `${BASE}deploy/`, toRoot: '../' });
  assert.match(out, /property="og:title" content="Deploy your own copy"/);
  assert.match(out, /property="og:description" content="Run your own copy\."/);
  assert.match(out, /property="og:url" content="https:\/\/example\.github\.io\/site\/deploy\/"/);
  assert.match(out, /property="og:type" content="website"/);
  assert.match(out, /property="og:image" content="https:\/\/example\.github\.io\/site\/deploy\/share-card\.png"/);
  assert.match(out, /name="twitter:title" content="Deploy your own copy"/);
  // An SVG chart's <title> is not the page's.
  assert.equal(pageCardPlan(html, 'deploy/index.html', { baseUrl: BASE }).options.headline, 'Deploy your own copy');
  assert.equal(completeShareTags(out, { card: `${BASE}deploy/share-card.png`, url: `${BASE}deploy/`, toRoot: '../' }), out);
});

test('crumbsOf reads at most 4000 characters from the trail when no </nav> closes it', () => {
  // A link whose </a> ends at character 4000 is read; one ending at 4001 is cut.
  const head = '<nav class="crumbs">';
  const link = (endAt, label) => {
    const open = '<a href="/x">';
    const pad = 'y'.repeat(endAt - head.length - open.length - '</a>'.length - label.length);
    return `${head}${open}${label}${pad}</a>`;
  };
  assert.deepEqual(crumbsOf(link(4000, 'Edge')).length, 1);
  assert.deepEqual(crumbsOf(link(4001, 'Edge')), []);
});

test('the CLI reads --base= and --only= values whole', async () => {
  const { execFile } = await import('node:child_process');
  const { mkdtemp, mkdir, readFile, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'share-cli-'));
  try {
    await mkdir(join(dir, 'a'));
    await mkdir(join(dir, 'b'));
    const page = '<!doctype html><html><head><title>T</title></head><body></body></html>';
    await writeFile(join(dir, 'a', 'index.html'), page);
    await writeFile(join(dir, 'b', 'index.html'), page);
    const script = new URL('./share.mjs', import.meta.url).pathname;
    const stdout = await new Promise((resolve, reject) => execFile(
      process.execPath, [script, dir, '--base=https://example.test/site', '--only=a'],
      (err, out, errOut) => (err ? reject(new Error(errOut)) : resolve(out)),
    ));
    assert.match(stdout, /Drew 1 share card\(s\)/);
    assert.match(await readFile(join(dir, 'a', 'index.html'), 'utf8'), /content="https:\/\/example\.test\/site\/a\/"/);
    assert.equal(await readFile(join(dir, 'b', 'index.html'), 'utf8'), page);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the card cache copies an unchanged card and draws a changed one', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cards-'));
  const cacheDir = path.join(dir, 'cache');
  const job = (name, headline) => ({ file: path.join(dir, 'out', name), options: { headline } });
  // A drawn card is stored under its key, byte for byte.
  await renderCards([job('a.png', 'Cache A')], { cacheDir });
  const key = cardKey({ headline: 'Cache A' });
  assert.deepEqual(readdirSync(cacheDir), [`${key}.png`]);
  assert.deepEqual(readFileSync(path.join(cacheDir, `${key}.png`)), readFileSync(path.join(dir, 'out', 'a.png')));

  // An entry planted for a card this process never drew proves a later build
  // (a new CI run) copies from the directory rather than drawing.
  const planted = cardKey({ headline: 'Cache planted' });
  writeFileSync(path.join(cacheDir, `${planted}.png`), 'cached');
  await renderCards([job('p.png', 'Cache planted'), job('b.png', 'Cache B')], { cacheDir });
  assert.equal(readFileSync(path.join(dir, 'out', 'p.png'), 'utf8'), 'cached');
  assert.deepEqual(readFileSync(path.join(dir, 'out', 'b.png')), renderCard({ headline: 'Cache B' }));
  assert.ok(existsSync(path.join(cacheDir, `${cardKey({ headline: 'Cache B' })}.png`)));
  assert.notEqual(cardKey({ headline: 'Cache A' }), cardKey({ headline: 'Cache B' }));
});

test('a card drawn earlier in the process is reused byte for byte, with no cache directory', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cards-mem-'));
  const options = { headline: 'Gutter guard bid calculator', kicker: 'Trades', address: 'example.test/gutter/' };
  await renderCards([{ file: path.join(dir, 'a.png'), options }], { cacheDir: '' });
  await renderCards([{ file: path.join(dir, 'b.png'), options }], { cacheDir: '' });
  assert.deepEqual(readFileSync(path.join(dir, 'b.png')), renderCard(options));
});

test('mapLimit keeps input order', async () => {
  const out = await mapLimit([30, 10, 20], 2, (ms, i) => new Promise((r) => setTimeout(() => r(i), ms)));
  assert.deepEqual(out, [0, 1, 2]);
});

test('crumbsOf decodes hex character references, zeros and upper case included', () => {
  const html = '<nav class="crumbs"><a href="/">Home</a><a href="/a/">Tax &#x2014; VAT</a><a href="/b/">Cost &#X1F4B0; &#x20AC;10</a></nav>';
  assert.deepEqual(crumbsOf(html), ['Tax — VAT', 'Cost 💰 €10']);
});

test('the card kicker: a section the site names, an unnamed one, a long crumb and no topic', () => {
  const crumbs = (...labels) => labels.map((l) => `<a href="../">${l}</a>`).join('');
  const kickerOf = (relative, html) => pageCardPlan(html, relative, { baseUrl: BASE }).options.kicker;
  // An unnamed section takes its first crumb as the name and the next as the topic.
  const unnamed = page({ crumbs: crumbs('Alpha', 'Beta') }).replace('<a href="../">Research</a>', '');
  assert.equal(kickerOf('zzz/x/index.html', unnamed), 'Alpha · Beta');
  // A crumb of 70 characters is too long to be a topic; 69 is not.
  assert.equal(kickerOf('research/x/index.html', page({ crumbs: crumbs('t'.repeat(70)) })), 'Research');
  assert.equal(kickerOf('research/x/index.html', page({ crumbs: crumbs('t'.repeat(69)) })), `Research · ${'t'.repeat(69)}`);
  // With no topic the kicker is the section alone, with no dangling separator.
  assert.equal(kickerOf('research/x/index.html', page()), 'Research');
});

test('accentFor hashes section and topic to a stable palette colour', () => {
  assert.deepEqual(['a', 'Energy', 'Housing', 'Tax and pay', 'Long topic name here'].map((t) => accentFor('research', t)), ['#1d4ed8', '#c2410c', '#9333ea', '#b91c1c', '#0f766e']);
});

test('only a section front page carries a subtitle on its card', () => {
  const html = page();
  const plan = (relative) => pageCardPlan(html, relative, { baseUrl: BASE });
  assert.equal(plan('writing/index.html').options.subtitle, "Adds a price to energy-home's model (ten years).");
  assert.equal(plan('writing/post/index.html').options.subtitle, '');
});

test('renderCards takes its cache directory from PAGES_CARD_CACHE', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cards-env-'));
  const cacheDir = path.join(dir, 'cache');
  const saved = process.env.PAGES_CARD_CACHE;
  process.env.PAGES_CARD_CACHE = cacheDir;
  try {
    await renderCards([{ file: path.join(dir, 'out', 'e.png'), options: { headline: 'Env cache' } }]);
    assert.deepEqual(readdirSync(cacheDir), [`${cardKey({ headline: 'Env cache' })}.png`]);
  } finally {
    if (saved === undefined) delete process.env.PAGES_CARD_CACHE; else process.env.PAGES_CARD_CACHE = saved;
  }
});
