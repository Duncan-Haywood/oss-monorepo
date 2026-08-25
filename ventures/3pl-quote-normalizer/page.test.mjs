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
});

test('calculator keeps input warnings in the copied report path', async () => {
  const script = await readFile(new URL('./calc.mjs', import.meta.url), 'utf8');
  assert.match(script, /Input warnings/);
  assert.match(script, /inputWarnings/);
});

test('calculator exposes editable return fee assumptions', async () => {
  const script = await readFile(new URL('./return-fields.js', import.meta.url), 'utf8');
  assert.match(script, /returnFee/);
  assert.match(script, /restockFee/);
  assert.match(script, /Return handling \/ order/);
});

test('sensitivity page exposes volume assumptions, results, and disclaimer', async () => {
  const page = await readFile(new URL('./sensitivity.html', import.meta.url), 'utf8');
  assert.match(page, /Volume Sensitivity/);
  assert.match(page, /minimumMonthly/);
  assert.match(page, /volumeSensitivity/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
});
