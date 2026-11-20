// Related tools in every tool's footer: ranked by shared words within the
// category tiers, then balanced so no tool is left without an inbound link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relatedTools, relatedToolScore, relatedToolScores, relatedToolsTable, categoryFor, subcategoryFor } from './build.mjs';

const tool = (slug, title, description = '') => ({ slug, title, description });

// Vendor Watch's footer offered whichever four tools sorted after it in the
// alphabet (a VPAT generator, a Wise statement converter) before 2026-11-16.
test('a tool offers the same-category tools that share its words, not its alphabet neighbours', () => {
  const surfaces = [
    tool('vendor-watch', 'Vendor Watch', "Watch a vendor's public terms or privacy policy and get a diff when the text changes."),
    tool('vpat-acr-generator', 'VPAT Generator', 'Write an accessibility conformance report.'),
    tool('wise-statement-to-journal', 'Wise Statement to Journal', 'Turn a Wise statement into a journal.'),
    tool('vendor-change-evidence', 'Vendor Change Evidence', 'Evidence of a change to vendor terms.'),
    tool('public-record-watch', 'Public-Record Watch', 'Watch a public record page and keep a diff when it changes.'),
    tool('xero-bank-statement-csv-check', 'Xero Bank Statement CSV Check', 'Check a bank statement CSV.'),
    tool('zoho-crm-import-csv-check', 'Zoho CRM Import CSV Check', 'Check a CRM import.'),
  ];
  const related = relatedTools(surfaces, 'vendor-watch', 2).map((s) => s.slug).sort();
  assert.deepEqual(related, ['public-record-watch', 'vendor-change-evidence']);
});

test('the score counts rare shared words and ignores catalogue boilerplate', () => {
  const surfaces = [
    tool('a-roof', 'Metal Roof Bid Calculator — free, private, in your browser', 'Price a metal roofing job.'),
    tool('b-roof', 'Shingle Roof Bid Calculator — free, private, in your browser', 'Price a roofer job.'),
    tool('c-fee', 'eBay Fee Calculator — free, private, in your browser', 'Fees and profit.'),
    tool('d-fee', 'Etsy Fee Calculator — free, private, in your browser', 'Fees and profit.'),
  ];
  assert.ok(relatedToolScore(surfaces, 'a-roof', 'b-roof') > 0, 'roof and roofing meet');
  assert.equal(relatedToolScore(surfaces, 'a-roof', 'c-fee'), 0, '"free", "calculator", "browser" connect nothing');
  assert.equal(relatedToolScore(surfaces, 'a-roof', 'b-roof'), relatedToolScore(surfaces, 'b-roof', 'a-roof'), 'symmetric');
});

test('with no shared words the tier order still holds', () => {
  const surfaces = [
    tool('metal-roof-bid-calculator', 'A'),
    tool('furnace-bid-calculator', 'B'),
    tool('siding-bid-calculator', 'C'),
    tool('ebay-fee-calculator', 'D'),
  ];
  assert.deepEqual(
    relatedTools(surfaces, 'metal-roof-bid-calculator', 3).map((s) => s.slug),
    ['siding-bid-calculator', 'furnace-bid-calculator', 'ebay-fee-calculator'],
  );
});

test('a strong match outside the category beats a same-category tool that shares nothing', () => {
  const surfaces = [
    tool('amazon-fba-calculator', 'Amazon FBA Calculator'),
    tool('etsy-profit-calculator', 'Etsy Profit Calculator'),
    tool('toilet-replacement-bid-calculator', 'Toilet Replacement Bid'),
    tool('amazon-fba-inbound-placement-fee', 'Amazon FBA Inbound Placement Fee'),
    tool('amazon-settlement-to-journal', 'Amazon Settlement to Journal'),
  ];
  // Only meaningful when the two Amazon tools sit in different categories.
  const outside = surfaces.filter((s) => s.slug.startsWith('amazon-') && categoryFor(s.slug).id !== categoryFor('amazon-fba-calculator').id);
  const first = relatedTools(surfaces, 'amazon-fba-calculator', 1)[0].slug;
  if (outside.length) assert.ok(first.startsWith('amazon-'), first);
  else assert.ok(first.startsWith('amazon-') || first === 'etsy-profit-calculator', first);
});

test('the table gives an orphan a slot from a related tool without making a new orphan', () => {
  // Five "lawn" tools that all rank each other first, and one lawn tool that
  // ranks last for everyone with limit 1.
  const surfaces = [
    tool('lawn-a', 'Lawn Mowing Aeration Seeding'),
    tool('lawn-b', 'Lawn Mowing Aeration Seeding'),
    tool('lawn-c', 'Lawn Mowing Aeration'),
    tool('lawn-d', 'Lawn Mowing'),
    tool('lawn-e', 'Lawn'),
    tool('other-x', 'Unrelated Thing'),
    tool('other-y', 'Something Else'),
    tool('other-z', 'Another Matter'),
    tool('other-w', 'Different Topic'),
    tool('other-v', 'Separate Concern'),
    tool('other-u', 'Distinct Subject'),
  ];
  const plain = new Map(surfaces.map((s) => [s.slug, relatedTools(surfaces, s.slug, 2)]));
  const table = relatedToolsTable(surfaces, 2);
  const inbound = (t) => {
    const m = new Map();
    for (const list of t.values()) for (const r of list) m.set(r.slug, (m.get(r.slug) ?? 0) + 1);
    return m;
  };
  const before = inbound(plain);
  const after = inbound(table);
  const orphans = (m) => surfaces.filter((s) => !m.get(s.slug)).map((s) => s.slug);
  assert.ok(orphans(after).length <= orphans(before).length);
  for (const slug of surfaces.map((s) => s.slug)) {
    if (before.get(slug)) assert.ok(after.get(slug), `${slug} lost its only inbound link`);
  }
  for (const [slug, list] of table) {
    assert.ok(!list.some((r) => r.slug === slug), `${slug} lists itself`);
    assert.equal(new Set(list.map((r) => r.slug)).size, list.length, `${slug} lists a tool twice`);
  }
});

// relatedTools ranked every candidate with a full sort and scored each pair
// word by word until 2026-11-20; it now keeps the top `limit` and scores one
// tool against all others through a word index
// (docs/history/pages-build-perf-2026-11-20-mask-and-related-tools.md). The
// old ranking, kept here verbatim over relatedToolScore, must pick the same
// tools in the same order on a catalogue with many ties and many overlaps.
test('the indexed ranking picks exactly what the full sort picked', () => {
  let seed = 20261120;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const words = ['roof', 'metal', 'shingle', 'fee', 'ebay', 'etsy', 'invoice', 'tax', 'payroll', 'mileage',
    'deck', 'fence', 'paint', 'tile', 'solar', 'vendor', 'watch', 'statement', 'bank', 'csv', 'import', 'check'];
  const pick = (n) => Array.from({ length: n }, () => words[Math.floor(rand() * words.length)]);
  const surfaces = Array.from({ length: 150 }, (_, k) => {
    const name = pick(1 + Math.floor(rand() * 3));
    return tool(`${name.join('-')}-${k}-${k % 3 ? 'bid-calculator' : 'log'}`, name.join(' '), pick(Math.floor(rand() * 6)).join(' '));
  });
  const BONUS = 5;
  const reference = (slug, limit) => {
    const others = surfaces.filter((s) => s.slug !== slug);
    const category = categoryFor(slug).id;
    const subcategory = subcategoryFor(slug)?.id ?? null;
    const inCategory = (s) => categoryFor(s.slug).id === category;
    const inSub = (s) => subcategory !== null && inCategory(s) && subcategoryFor(s.slug)?.id === subcategory;
    const sameSubcategory = others.filter(inSub);
    const sameCategory = others.filter((s) => inCategory(s) && !inSub(s));
    const rest = others.filter((s) => !inCategory(s));
    const offset = Math.max(0, surfaces.findIndex((s) => s.slug === slug));
    const rotate = (list, bonus) => {
      if (list.length === 0) return [];
      const at = offset % list.length;
      return [...list.slice(at), ...list.slice(0, at)].map((surface) => ({ surface, bonus }));
    };
    return [...rotate(sameSubcategory, 2 * BONUS), ...rotate(sameCategory, BONUS), ...rotate(rest, 0)]
      .map((x, i) => ({ ...x, i, s: x.bonus + relatedToolScore(surfaces, slug, x.surface.slug) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, limit)
      .map((x) => x.surface.slug);
  };
  let ties = 0;
  const tiers = new Set(surfaces.map((s) => `${categoryFor(s.slug).id}/${subcategoryFor(s.slug)?.id ?? ''}`));
  assert.ok(tiers.size >= 3, `the fixture must span tiers (${[...tiers]})`);
  for (const s of surfaces) {
    const scores = relatedToolScores(surfaces, s.slug);
    for (const o of surfaces) assert.equal(scores.get(o.slug) ?? 0, relatedToolScore(surfaces, s.slug, o.slug));
    for (const limit of [1, 4, 20]) {
      assert.deepEqual(relatedTools(surfaces, s.slug, limit).map((x) => x.slug), reference(s.slug, limit), `${s.slug} @ ${limit}`);
    }
    const top = reference(s.slug, 5).map((slug) => relatedToolScore(surfaces, s.slug, slug));
    if (new Set(top).size < top.length) ties++;
  }
  assert.ok(ties > 10, `the fixture must exercise ties (${ties})`);
});
