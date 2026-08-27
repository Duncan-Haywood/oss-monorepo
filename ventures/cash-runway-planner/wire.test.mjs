// The browser half of app.mjs, exercised without a DOM library.
//
// test.mjs covers the arithmetic, which stays green even when the page never
// runs. These checks cover the wiring that actually reaches a visitor: that a
// bad figure produces a visible message rather than a button that does
// nothing, and that a browser set to block site data still gets a forecast.
//
// app.mjs attaches its handlers at import time when `document` exists, so the
// stubs below are installed on globalThis before the dynamic import.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeDom({ values, storageThrows = false } = {}) {
  const fields = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { name, value }]));
  const handlers = new Map();
  const output = { innerHTML: '', textContent: '' };
  const usage = { checked: false };
  const buttons = { '#download': {}, '#reset': {} };
  for (const button of Object.values(buttons)) {
    button.addEventListener = (type, fn) => { button[type] = fn; };
  }
  const form = {
    elements: fields,
    addEventListener: (type, fn) => handlers.set(type, fn),
    reset: () => { form.wasReset = true; },
  };
  const nodes = { '#forecast': form, '#output': output, '#usage': usage, ...buttons };

  const store = new Map();
  const storage = {
    getItem: (key) => { if (storageThrows) throw new Error('blocked'); return store.get(key) ?? null; },
    setItem: (key, value) => { if (storageThrows) throw new Error('blocked'); store.set(key, value); },
    removeItem: (key) => { if (storageThrows) throw new Error('blocked'); store.delete(key); },
  };

  globalThis.document = {
    querySelector: (selector) => nodes[selector],
    createElement: () => ({ click() {}, set href(_v) {}, get href() { return ''; } }),
  };
  globalThis.localStorage = storage;
  // Node ships a read-only `navigator`, so the browser one has to be defined
  // over it rather than assigned.
  Object.defineProperty(globalThis, 'navigator', {
    value: { doNotTrack: null, globalPrivacyControl: false },
    configurable: true,
    writable: true,
  });
  globalThis.FormData = class {
    constructor() { return Object.entries(fields).map(([name, field]) => [name, field.value])[Symbol.iterator](); }
  };
  globalThis.URL.createObjectURL = () => 'blob:stub';
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.Blob = class { constructor(parts) { this.parts = parts; } };

  return { form, output, buttons, handlers, store };
}

// Each import needs its own module instance, so the specifier is varied.
let instance = 0;
async function loadApp(dom) {
  const mod = await import(`./app.mjs?wire=${instance++}`);
  return { ...dom, mod };
}

const GOOD = { cash: '5000', weeklyIncome: '1800', collectionWeeks: '2', weeklyCosts: '1400' };
const FRACTIONAL = { ...GOOD, collectionWeeks: '1.5' };

test('submitting good figures renders the forecast and the first shortfall week', async () => {
  const dom = await loadApp(fakeDom({ values: { ...GOOD, cash: '100', weeklyIncome: '500', weeklyCosts: '75', collectionWeeks: '3' } }));
  dom.handlers.get('submit')({ preventDefault() {} });
  assert.match(dom.output.innerHTML, /Cash shortfall/);
  assert.match(dom.output.innerHTML, /First projected shortfall: <strong>week 2<\/strong>/);
  assert.match(dom.output.innerHTML, /balance \$25\.00/);
});

test('a healthy forecast says so instead of naming a shortfall week', async () => {
  const dom = await loadApp(fakeDom({ values: GOOD }));
  dom.handlers.get('submit')({ preventDefault() {} });
  assert.match(dom.output.innerHTML, /Cash stays positive/);
  assert.match(dom.output.innerHTML, /No projected negative balance in this 12-week window/);
  assert.doesNotMatch(dom.output.innerHTML, /First projected shortfall/);
});

test('a rejected figure on submit shows the reason rather than leaving the panel stale', async () => {
  const dom = await loadApp(fakeDom({ values: FRACTIONAL }));
  dom.handlers.get('submit')({ preventDefault() {} });
  assert.match(dom.output.innerHTML, /Check the figures/);
  assert.match(dom.output.innerHTML, /whole number of weeks/);
});

test('Download CSV reports a bad figure instead of doing nothing', async () => {
  // The download button is type="button", so it never runs the form's own
  // validation. Before this guard it threw and the click was simply inert.
  const dom = await loadApp(fakeDom({ values: FRACTIONAL }));
  assert.doesNotThrow(() => dom.buttons['#download'].click({}));
  assert.match(dom.output.innerHTML, /Check the figures/);
  assert.match(dom.output.innerHTML, /whole number of weeks/);
});

test('a browser blocking site data still gets a forecast and a working reset', async () => {
  const dom = await loadApp(fakeDom({ values: GOOD, storageThrows: true }));
  assert.doesNotThrow(() => dom.handlers.get('submit')({ preventDefault() {} }));
  assert.match(dom.output.innerHTML, /Cash stays positive/);
  assert.doesNotThrow(() => dom.buttons['#reset'].click({}));
  assert.equal(dom.form.wasReset, true);
  assert.equal(dom.output.textContent, 'Enter your numbers to see the forecast.');
});

test('the draft is saved locally and restored into the form on the next visit', async () => {
  const dom = fakeDom({ values: GOOD });
  const first = await loadApp(dom);
  first.handlers.get('submit')({ preventDefault() {} });
  assert.equal(JSON.parse(dom.store.get('cash-runway-draft')).cash, '5000');

  dom.form.elements.cash.value = '';
  await loadApp(dom);
  assert.equal(dom.form.elements.cash.value, '5000');
});
