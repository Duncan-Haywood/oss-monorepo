import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('page persists quote inputs locally', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /localStorage\.setItem\(saveKey/);
  assert.match(page, /localStorage\.getItem\(saveKey/);
  assert.match(page, /Saved locally in this browser/);
});

test('comparison page exposes two monthly quote inputs and disclaimer', async () => {
  const page = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  assert.match(page, /name="first"/);
  assert.match(page, /name="second"/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /name="target"/);
  assert.match(page, /comparison_target_viewed/);
});

test('comparison page loads savings insights and provider labels', async () => {
  const page = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./comparison-insights.mjs', import.meta.url), 'utf8');
  assert.match(page, /comparison-insights\.mjs/);
  assert.match(script, /comparison_savings_viewed/);
  assert.match(script, /firstName/);
  assert.match(script, /annualDifference/);
});

test('comparison page exposes a local CSV export', async () => {
  const page = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  assert.match(page, /exportComparisonCsv/);
  assert.match(page, /comparison_csv_exported/);
  assert.match(page, /3pl-quote-comparison\.csv/);
});

test('calculator keeps input warnings in the copied report path', async () => {
  const script = await readFile(new URL('./calc.mjs', import.meta.url), 'utf8');
  assert.match(script, /Input warnings/);
  assert.match(script, /inputWarnings/);
});

test('calculator surfaces input warnings in the live decision snapshot', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./warnings-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /warnings-page\.mjs/);
  assert.match(script, /role/);
  assert.match(script, /textContent = warning/);
});

test('calculator exposes editable return fee assumptions', async () => {
  const script = await readFile(new URL('./return-fields.js', import.meta.url), 'utf8');
  assert.match(script, /returnFee/);
  assert.match(script, /restockFee/);
  assert.match(script, /Return handling \/ order/);
});

test('calculator exposes a local CSV export from its live form', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./export-page.mjs', import.meta.url), 'utf8');
  assert.match(script, /new FormData\(form\)/);
  assert.match(script, /quote_csv_exported/);
  assert.match(page, /return-fields\.js/);
});

test('inbound page compares pallet, carton, and loose receiving', async () => {
  const page = await readFile(new URL('./inbound.html', import.meta.url), 'utf8');
  assert.match(page, /name="palletInboundFee"/);
  assert.match(page, /name="cartonInboundFee"/);
  assert.match(page, /name="receivingPerUnit"/);
  assert.match(page, /compareInboundMethods/);
  assert.match(page, /inbound_methods_compared/);
  assert.match(page, /not financial, tax, legal/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
});

test('inbound SEO page explains the container-fee arithmetic', async () => {
  const page = await readFile(new URL('./pallet-vs-carton-inbound.html', import.meta.url), 'utf8');
  assert.match(page, /\$10/);
  assert.match(page, /inbound.html/);
  assert.match(page, /not financial, tax, legal/);
});

test('main calculator links to the inbound comparison', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /inbound.html/);
});

test('sensitivity page exposes volume assumptions, results, and disclaimer', async () => {
  const page = await readFile(new URL('./sensitivity.html', import.meta.url), 'utf8');
  assert.match(page, /Volume Sensitivity/);
  assert.match(page, /minimumMonthly/);
  assert.match(page, /volumeSensitivity/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
});
