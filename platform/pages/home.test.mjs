import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ICON_NAMES,
  cardName,
  icon,
  renderCategoryCard,
  finderChoices,
  finderCss,
  renderFinder,
  renderLatestWriting,
  renderResearchBand,
  researchMotif,
  siteStructuredData,
} from './home.mjs';

test('every catalogue section the hub draws has its own icon', () => {
  for (const id of ['self-hosted', 'sales', 'imports', 'marketplace', 'trades', 'food-service', 'services', 'logistics', 'bookkeeping', 'evidence',
    'personal-tax', 'household', 'uk-tax', 'backoffice', 'ci', 'solo-earner', 'research-algorithms', 'learning', 'more', 'apps', 'cli']) {
    assert.ok(ICON_NAMES.includes(id), `${id} has no icon`);
  }
  const svg = icon('trades');
  assert.match(svg, /^<svg /);
  assert.match(svg, /aria-hidden="true"/, 'icons are decorative');
  assert.match(svg, /stroke="currentColor"/, 'tinted by the tile, not hard-coded');
});

test('a card name drops the search-result tagline', () => {
  assert.equal(cardName('State Residency Day Counter — free, private, in your browser'), 'State Residency Day Counter');
  assert.equal(cardName('Capital allowances calculator: what can I deduct for equipment? Free, private'),
    'Capital allowances calculator: what can I deduct for equipment?');
  assert.equal(cardName('Childcare costs after free hours and Tax-Free Childcare: free, private calculator'),
    'Childcare costs after free hours and Tax-Free Childcare');
  assert.equal(cardName('Bid Price Engine'), 'Bid Price Engine');
});

test('a category card links its page by id, escapes its copy and carries its accent', () => {
  const html = renderCategoryCard({
    id: 'trades', href: 'c/trades/', title: 'Trade <bids>', blurb: 'A & B', count: 3, accent: '#5c4412',
    examples: [{ slug: 'roofing-bid-calculator', title: 'Roofing Bid Calculator — free' }],
  });
  assert.match(html, /href="c\/trades\/" data-category="trades"/);
  assert.match(html, /--cat:#5c4412/);
  assert.match(html, /Trade &lt;bids&gt;/);
  assert.match(html, />Roofing Bid Calculator</);
  assert.match(html, /All 3 tools →/);
});

test('the finder goes business -> problem -> product, and only says live of what is live', async () => {
  const { INDUSTRIES, PRODUCT_LINES } = await import('./business.mjs');
  const html = renderFinder({
    industries: INDUSTRIES, lines: PRODUCT_LINES,
    trades: [{ id: 'for-roofers', name: 'Roofers', href: 'c/for-roofers/' }],
    statusLabel: (s) => (s === 'live' ? 'live' : 'early access'),
  });
  const choices = finderChoices(INDUSTRIES, PRODUCT_LINES);
  assert.equal(choices.at(-1).slug, 'other');
  for (const c of choices) {
    assert.match(html, new RegExp(`id="pro-${c.slug}"`));
    assert.match(html, new RegExp(`id="panel-${c.slug}"`));
    assert.match(finderCss(choices), new RegExp(`#pro-${c.slug}:checked ~ \\.panels #panel-${c.slug}`));
  }
  // Every software problem is a link to its product.
  for (const l of PRODUCT_LINES.filter((x) => x.kind === 'software' && x.industry)) {
    const href = l.status === 'live' ? l.href : `industries/${l.industry}/#${l.id}`;
    for (const p of l.problems) assert.ok(html.includes(`href="${href}" data-funnel-product="${l.id}"`), `${l.id}: ${p}`);
  }
  const live = PRODUCT_LINES.filter((l) => l.status === 'live').length;
  assert.equal((html.match(/· live →/g) || []).length, PRODUCT_LINES.filter((l) => l.status === 'live' && l.industry).reduce((n, l) => n + l.problems.length, 0));
  assert.ok(live >= 0);
  // Funnel markup the counter understands (platform/counter/FUNNEL.md).
  assert.match(html, /id="panel-construction" data-funnel="cta" data-funnel-industry="construction"/);
  assert.match(html, /data-funnel-product="contractor-billing"/);
  for (const v of html.matchAll(/data-funnel="([^"]+)"/g)) assert.equal(v[1], 'cta');
  // "Something else" leads to the trades, the assistant and a custom build.
  const other = html.slice(html.indexOf('id="panel-other"'));
  assert.match(other, /href="c\/for-roofers\/"/);
  assert.match(other, /href="ask\/"/);
  assert.match(other, /href="custom-development\/"/);
  // Self-deploy was retired on 2026-11-24: the front door no longer sells it.
  assert.doesNotMatch(html, /deploy\/|self-host/i);
});

test('the research band shows featured projects with their theme and summary', () => {
  const research = {
    featured: [{ slug: 'p1', title: 'Project <one>' }],
    themes: [{ id: 't1', name: 'Theme one', count: 4 }],
    projects: [{ slug: 'p1', title: 'Project <one>', summary: 'A summary.', themeId: 't1', themeName: 'Theme one' }],
  };
  const html = renderResearchBand(research, 9, { researchPath: 'research/', topicsDir: 'topics' });
  assert.match(html, /9 reproducible research projects/);
  assert.match(html, /href="research\/p1\/"/);
  assert.match(html, /Project &lt;one&gt;/);
  assert.match(html, /<span class="rtheme">Theme one<\/span>/);
  assert.match(html, /A summary\./);
  assert.match(html, /href="research\/topics\/t1\/"/);
  assert.equal(renderResearchBand(research, 0), '', 'no band without research');
});

test('a research motif is deterministic, decorative and inside its box', () => {
  const a = researchMotif('energy-tou', '#a8c7f0');
  assert.equal(a, researchMotif('energy-tou', '#a8c7f0'));
  assert.notEqual(a, researchMotif('house-adufees', '#a8c7f0'));
  assert.match(a, /aria-hidden="true"/);
  for (const slug of ['a', 'energy-tou', 'mimic-webcam', 'chip-abc-orderblocks', 'x'.repeat(40)]) {
    const svg = researchMotif(slug, '#fff');
    for (const [, x, y] of svg.matchAll(/cx="([-\d.]+)" cy="([-\d.]+)"/g)) {
      assert.ok(+x >= 0 && +x <= 140 && +y >= 0 && +y <= 58, `${slug}: node at ${x},${y} is outside the figure`);
    }
  }
});

test('the latest writing lists the newest posts first, with their date and length', () => {
  const posts = [
    { slug: 'old', date: '2026-01-02', title: 'Old', description: 'd', minutes: 3 },
    { slug: 'new', date: '2026-10-20', title: 'New', description: 'd', minutes: 5 },
  ];
  const html = renderLatestWriting(posts, { writingPath: 'writing/', limit: 1 });
  assert.match(html, /href="writing\/new\/"/);
  assert.doesNotMatch(html, /writing\/old\//);
  assert.match(html, /<time datetime="2026-10-20">20 October 2026<\/time> · 5 min read/);
  assert.match(html, /Read all 2 posts/);
  assert.equal(renderLatestWriting([]), '');
});

test('the site structured data declares a search action the hub answers', () => {
  const data = siteStructuredData({
    baseUrl: 'https://example.test/site/', siteName: 'S', description: 'D', repoUrl: 'https://github.com/x/y', logo: 'https://example.test/site/icon-512.png',
  });
  const site = data['@graph'].find((n) => n['@type'] === 'WebSite');
  const org = data['@graph'].find((n) => n['@type'] === 'Organization');
  assert.equal(site.potentialAction.target.urlTemplate, 'https://example.test/site/?q={search_term_string}');
  assert.equal(site.potentialAction['query-input'], 'required name=search_term_string');
  assert.equal(site.publisher['@id'], org['@id']);
  assert.deepEqual(org.sameAs, ['https://github.com/x/y']);
});

test('the Organization names only the live products it offers, with no price', () => {
  const none = siteStructuredData({ baseUrl: 'https://e.test/', siteName: 'S', description: 'D', repoUrl: 'r', logo: 'l' });
  assert.equal(none['@graph'].find((n) => n['@type'] === 'Organization').makesOffer, undefined);

  const data = siteStructuredData({
    baseUrl: 'https://e.test/', siteName: 'S', description: 'D', organizationDescription: 'S builds software.', repoUrl: 'r', logo: 'l',
    offers: [{ name: 'P', url: 'https://e.test/p/', audience: 'small nonprofits', description: 'P does a thing.' }],
  });
  const org = data['@graph'].find((n) => n['@type'] === 'Organization');
  assert.equal(org.description, 'S builds software.');
  assert.equal(org.makesOffer.length, 1);
  const [offer] = org.makesOffer;
  assert.equal(offer['@type'], 'Offer');
  assert.equal(offer.itemOffered.name, 'P');
  assert.equal(offer.itemOffered.url, 'https://e.test/p/');
  assert.equal(offer.itemOffered.audience.audienceType, 'small nonprofits');
  assert.equal(offer.price, undefined, 'prices live on the product page, not here');
});
