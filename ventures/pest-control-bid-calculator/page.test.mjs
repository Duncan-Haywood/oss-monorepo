import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('the static page contains its executable module and queried controls', () => {
  assert.match(page, /<script type="module">/);
  assert.match(page, /import \{ calculateBid, SERVICE_PRESETS \} from '\.\/calc\.mjs';/);
  assert.match(page, /import \{ recordUsage \} from '\.\/usage\.mjs';/);

  for (const id of [
    'services',
    'addService',
    'oneWayMinutes',
    'frequency',
    'proposedRecurring',
    'waiveInitial',
    'copySummary',
    'usageOptOut',
    'initialPrice',
    'recurringPrice',
    'verdict',
  ]) {
    assert.match(page, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page exposes the safety and privacy copy to users', () => {
  assert.match(page, /<strong>No warranty\.<\/strong>/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /Do not keep anonymous local usage counts/);
});

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', async () => {
  assert.match(page, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = await readFile(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge for pest control/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});
