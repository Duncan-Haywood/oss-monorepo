import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { summarise, windowDays, renderMarkdown, pct, main, NO_INDUSTRY } from './funnel-report.mjs';

const visits = {
  '2026-11-01': { 'fn:cta_view:salons:salon-suite:old-page': 50 },
  '2026-11-23': {
    'salon-price': 40,
    'src:google': 30,
    'fn:industry_view:salons:_:industries/salons': 20,
    'fn:cta_view:salons:salon-suite:salon-price': 30,
    'fn:cta_click:salons:salon-suite:salon-price': 3,
    'fn:outbound_click:salons:salon-suite:industries/salons': 2,
  },
  '2026-11-24': {
    'fn:products_view:_:_:products': 7,
    'fn:cta_view:restaurants:menu-suite:pour-cost': 10,
    'fn:cta_click:restaurants:menu-suite:pour-cost': 1,
    'fn:nonsense:x:y:z': 99,
    'fn:cta_click:salons:salon-suite:salon-price': -4,
  },
};

test('the window ends on the last day by default and drops older days', () => {
  assert.deepEqual(windowDays(visits, { days: 7 }), ['2026-11-23', '2026-11-24']);
  assert.deepEqual(windowDays(visits, { days: 1, today: '2026-11-23' }), ['2026-11-23']);
  assert.deepEqual(windowDays({}, {}), []);
});

test('summarise folds only fn: keys, per industry, page and product', () => {
  const s = summarise(visits, windowDays(visits, { days: 7 }));
  assert.deepEqual(s.totals, { industry_view: 20, products_view: 7, cta_view: 40, cta_click: 4, outbound_click: 2 });
  assert.equal(s.industries.salons.cta_click, 3);
  assert.equal(s.industries[NO_INDUSTRY].products_view, 7);
  assert.equal(s.pages['salon-price'].cta_view, 30);
  assert.equal(s.products['menu-suite'].cta_click, 1);
  assert.equal(s.pages['old-page'], undefined, 'outside the window');
});

test('the Markdown ranks industries by clicks toward a product and states the unit', () => {
  const md = renderMarkdown(summarise(visits, windowDays(visits, { days: 7 })));
  assert.match(md, /not people/);
  assert.match(md, /\| salons \| 20 \| 0 \| 30 \| 3 \| 10\.0% \| 2 \| 10\.0% \|/);
  assert.ok(md.indexOf('| salons |') < md.indexOf('| restaurants |'));
  assert.match(md, /\| `salon-price` \|/);
  assert.equal(pct(1, 0), '–');
});

test('an empty window says unmeasured, not zero', () => {
  assert.match(renderMarkdown(summarise({}, [])), /unmeasured, not zero/);
});

test('the CLI reads a file and writes the report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'funnel-report-'));
  const data = path.join(dir, 'site-visits.json');
  fs.writeFileSync(data, JSON.stringify({ days: visits }));
  const out = path.join(dir, 'r', 'funnel.md');
  main(['--data', data, '--days', '7', '--out', out]);
  assert.match(fs.readFileSync(out, 'utf8'), /## By industry/);
  assert.equal(JSON.parse(main([`--data=${data}`, '--json'])).totals.cta_click, 4);
  assert.throws(() => main(['--data', data, '--days', '0']));
});
