// Related tools in every tool's footer: ranked by shared words within the
// category tiers, then balanced so no tool is left without an inbound link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relatedTools, relatedToolScore, relatedToolsTable, categoryFor } from './build.mjs';

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
