import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyThemeArea, groupByThemeArea, recordThemeAreaUsage, themeAreasAsText } from './theme-areas.mjs';

test('routes product-form and Shop Pay buttons to the product form, not checkout', () => {
  assert.equal(classifyThemeArea({ target: ['.product-form button.add-to-cart'] }).id, 'product');
  assert.equal(classifyThemeArea({ target: ['.product-form .shopify-payment-button'] }).id, 'product');
});

test('does not treat add-to-cart as the cart drawer', () => {
  assert.equal(classifyThemeArea({ html: '<button class="add-to-cart">Add</button>' }).id, 'product');
  assert.equal(classifyThemeArea({ target: ['.cart-drawer button'] }).id, 'cart');
});

test('prefers collection cards over a generic product match', () => {
  assert.equal(classifyThemeArea({ target: ['.collection .product-card img'] }).id, 'collection');
});

test('groups a mixed storefront scan and names the highest-score area first', () => {
  const grouped = groupByThemeArea({
    url: 'https://shop.test',
    testEngine: { name: 'axe-core' },
    violations: [
      {
        id: 'color-contrast',
        impact: 'serious',
        help: 'Fix contrast',
        nodes: [
          { target: ['.product-form button.add-to-cart'] },
          { target: ['.product-form .shopify-payment-button'] },
        ],
      },
      {
        id: 'link-name',
        impact: 'serious',
        help: 'Name the link',
        nodes: [{ target: ['header nav a.header__icon'] }],
      },
      {
        id: 'button-name',
        impact: 'critical',
        help: 'Name the button',
        nodes: [{ target: ['.cart-drawer button'] }],
      },
      {
        id: 'image-alt',
        impact: 'critical',
        help: 'Add alt',
        nodes: [{ target: ['.collection .product-card img'] }],
      },
    ],
    passes: [{}],
    incomplete: [],
  }, '2026-08-25');

  assert.equal(grouped.empty, false);
  assert.equal(grouped.counts.violations, 4);
  assert.equal(grouped.counts.nodes, 5);
  assert.deepEqual(grouped.areas.map((area) => area.id), ['product', 'cart', 'collection', 'header']);
  assert.equal(grouped.openFirst.id, 'product');
  assert.match(grouped.openFirst.open, /main-product/);
  assert.match(themeAreasAsText(grouped), /Open first: Product form/);
  assert.match(themeAreasAsText(grouped), /2026-08-25/);
  assert.match(themeAreasAsText(grouped), /not a compliance determination/);
});

test('keeps a clean scan from becoming a compliance claim', () => {
  const grouped = groupByThemeArea({ violations: [] });
  assert.equal(grouped.empty, true);
  assert.equal(grouped.openFirst, null);
  assert.match(themeAreasAsText(grouped), /Manual review is still required/);
});

test('rejects a non-object the same way the evidence report does', () => {
  assert.throws(() => groupByThemeArea(null), /valid axe-core JSON/);
});

test('theme-area usage is aggregate, opt-out, and does not invent report_generated', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  recordThemeAreaUsage(storage, false, 'theme_areas_generated');
  recordThemeAreaUsage(storage, false, 'theme_areas_copied');
  recordThemeAreaUsage(storage, true, 'theme_areas_generated');
  assert.deepEqual(JSON.parse(data.get('shopify-a11y-evidence-usage')), {
    theme_areas_generated: 1,
    theme_areas_copied: 1,
  });
});
