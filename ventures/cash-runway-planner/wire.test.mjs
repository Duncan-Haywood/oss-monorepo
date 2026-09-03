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

const MAX_ITEMS = 8;
const VISIBLE_ITEMS = 3;

// Every one-off field exists on the real page whether or not it is filled in,
// because the rows are written into the HTML rather than created at runtime.
// The stub mirrors that: a form whose field set changed between visits is the
// thing the static rows exist to prevent.
function itemFields(overrides = {}) {
  const fields = {};
  for (let index = 1; index <= MAX_ITEMS; index += 1) {
    fields[`item${index}Name`] = '';
    fields[`item${index}Amount`] = '';
    fields[`item${index}Week`] = '';
    fields[`item${index}Kind`] = 'out';
  }
  return { ...fields, ...overrides };
}

function fakeDom({ values, storageThrows = false, hash = '', search = '', clipboardFails = false } = {}) {
  const all = { weeks: '12', ...itemFields(), ...values };
  const fields = Object.fromEntries(Object.entries(all).map(([name, value]) => [name, { name, value }]));
  const handlers = new Map();
  const output = { innerHTML: '', textContent: '' };
  const usage = { checked: false };
  const shareStatus = { textContent: '' };
  const buttons = { '#download': {}, '#reset': {}, '#share': {}, '#add-item': { hidden: false } };
  for (const button of Object.values(buttons)) {
    button.addEventListener = (type, fn) => { button[type] = fn; };
  }
  const rows = {};
  for (let index = 1; index <= MAX_ITEMS; index += 1) {
    rows[`#item-row-${index}`] = { hidden: index > VISIBLE_ITEMS };
  }
  const form = {
    elements: fields,
    addEventListener: (type, fn) => handlers.set(type, fn),
    reset: () => { form.wasReset = true; },
  };
  const nodes = { '#forecast': form, '#output': output, '#usage': usage, '#shareStatus': shareStatus, ...buttons, ...rows };

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
  const clipboard = { writeText: async () => { if (clipboardFails) throw new Error('denied'); } };
  // Node ships a read-only `navigator`, so the browser one has to be defined
  // over it rather than assigned.
  Object.defineProperty(globalThis, 'navigator', {
    value: { doNotTrack: null, globalPrivacyControl: false, clipboard },
    configurable: true,
    writable: true,
  });
  const location = { hash, search, pathname: '/index.html', href: `https://example.test/index.html${search}${hash}` };
  globalThis.location = location;
  globalThis.history = {
    replaceState: (_state, _title, url) => {
      const hashIndex = url.indexOf('#');
      location.hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
      location.href = `https://example.test${url}`;
    },
  };
  globalThis.FormData = class {
    constructor() { return Object.entries(fields).map(([name, field]) => [name, field.value])[Symbol.iterator](); }
  };
  globalThis.URL.createObjectURL = () => 'blob:stub';
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.Blob = class { constructor(parts) { this.parts = parts; } };

  return { form, output, buttons, handlers, store, rows: nodes, shareStatus, location };
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

test('a one-off bill turns a healthy forecast into a named shortfall with a fix', async () => {
  // The reading the tool exists for: smooth weeks look fine, and the quarterly
  // tax bill is what actually empties the account.
  const dom = await loadApp(fakeDom({
    values: {
      ...GOOD, cash: '3000', weeklyIncome: '1000', weeklyCosts: '1000', collectionWeeks: '0', weeks: '8',
      item1Name: 'Quarterly tax', item1Amount: '6000', item1Week: '2', item1Kind: 'out',
      item2Name: 'Invoice 118', item2Amount: '4000', item2Week: '6', item2Kind: 'in',
    },
  }));
  dom.handlers.get('submit')({ preventDefault() {} });
  assert.match(dom.output.innerHTML, /Cash shortfall/);
  assert.match(dom.output.innerHTML, /First projected shortfall: <strong>week 2<\/strong>/);
  assert.match(dom.output.innerHTML, /Moving <strong>Quarterly tax<\/strong> \(\$6000\.00, week 2\) past week 5 closes the gap\./);
  assert.match(dom.output.innerHTML, /Collecting <strong>Invoice 118<\/strong> \(\$4000\.00, due week 6\) before week 2 closes the gap\./);
  // Weekly income covers weekly costs, so this is a timing problem and must
  // not be described as a structural one.
  assert.doesNotMatch(dom.output.innerHTML, /not a timing problem/);
  assert.match(dom.output.innerHTML, /Quarterly tax -6000\.00/);
});

test('a business spending more than it collects is told so instead of sold a date change', async () => {
  const dom = await loadApp(fakeDom({
    values: {
      ...GOOD, cash: '500', weeklyIncome: '0', weeklyCosts: '400', collectionWeeks: '0', weeks: '4',
      item1Name: 'Van', item1Amount: '1000', item1Week: '3', item1Kind: 'out',
    },
  }));
  dom.handlers.get('submit')({ preventDefault() {} });
  assert.match(dom.output.innerHTML, /not a timing problem/);
  assert.match(dom.output.innerHTML, /you spend \$400\.00 more than you collect/);
  // The van payment lands after the first negative week but at or before the
  // trough, so it still deepens the deficit and is still worth naming -- as
  // a partial cover, not a solution, alongside the structural note.
  assert.match(dom.output.innerHTML, /Moving <strong>Van<\/strong> \(\$1000\.00, week 3\) out of this window covers \$1000\.00 of it\./);
});

test('a negative balance puts the minus outside the dollar sign', async () => {
  // `platform/ci/check_money_sign.py` is the site-wide rule; this pins the
  // rendered string, which is what a visitor actually reads.
  const dom = await loadApp(fakeDom({
    values: { ...GOOD, cash: '0', weeklyIncome: '0', weeklyCosts: '100', collectionWeeks: '0', weeks: '1' },
  }));
  dom.handlers.get('submit')({ preventDefault() {} });
  assert.match(dom.output.innerHTML, /-\$100\.00/);
  assert.doesNotMatch(dom.output.innerHTML, /\$-/);
});

test('a half-filled one-off row is reported rather than silently dropped', async () => {
  const dom = await loadApp(fakeDom({ values: { ...GOOD, item1Name: 'Tax', item1Week: '3' } }));
  dom.handlers.get('submit')({ preventDefault() {} });
  assert.match(dom.output.innerHTML, /Check the figures/);
  assert.match(dom.output.innerHTML, /row 1 needs an amount/);
});

test('a description that is markup is shown as text, in the forecast and in an error', async () => {
  const dom = await loadApp(fakeDom({
    values: {
      ...GOOD, cash: '0', weeklyIncome: '0', weeklyCosts: '0', collectionWeeks: '0', weeks: '2',
      item1Name: '<img src=x>', item1Amount: '10', item1Week: '1', item1Kind: 'out',
    },
  }));
  dom.handlers.get('submit')({ preventDefault() {} });
  assert.doesNotMatch(dom.output.innerHTML, /<img/);
  assert.match(dom.output.innerHTML, /&lt;img src=x&gt;/);
});

test('Add another row reveals one hidden row at a time and stops at the last', async () => {
  const dom = await loadApp(fakeDom({ values: GOOD }));
  assert.equal(dom.rows['#item-row-4'].hidden, true);
  dom.buttons['#add-item'].click({});
  assert.equal(dom.rows['#item-row-4'].hidden, false);
  assert.equal(dom.rows['#item-row-5'].hidden, true);
  for (let press = 0; press < 10; press += 1) dom.buttons['#add-item'].click({});
  assert.equal(dom.rows[`#item-row-${MAX_ITEMS}`].hidden, false);
  assert.equal(dom.buttons['#add-item'].hidden, true);
});

test('Copy share link puts the current figures in the address bar and copies it', async () => {
  const dom = await loadApp(fakeDom({ values: { ...GOOD, item1Name: 'Tax', item1Amount: '600', item1Week: '3', item1Kind: 'out' } }));
  await dom.buttons['#share'].click({});
  assert.match(dom.location.hash, /cash=5000/);
  assert.match(dom.location.hash, /item1Amount=600/);
  assert.match(dom.location.hash, /item1Kind=out/);
  assert.match(dom.shareStatus.textContent, /Link copied/);
});

test('Copy share link still puts the figures in the address bar when the clipboard is denied', async () => {
  const dom = await loadApp(fakeDom({ values: GOOD, clipboardFails: true }));
  await dom.buttons['#share'].click({});
  assert.match(dom.location.hash, /cash=5000/);
  assert.match(dom.shareStatus.textContent, /copy it to share/);
});

test('opening a shared link runs the forecast immediately, including its one-off row', async () => {
  const hash = '#cash=3000&weeklyIncome=1000&collectionWeeks=0&weeklyCosts=1000&weeks=8'
    + '&item1Name=Quarterly+tax&item1Amount=6000&item1Week=2&item1Kind=out';
  const dom = await loadApp(fakeDom({ values: GOOD, hash }));
  // No submit event fired -- the forecast should already be on screen.
  assert.match(dom.output.innerHTML, /Cash shortfall/);
  assert.match(dom.output.innerHTML, /Quarterly tax/);
  assert.equal(dom.form.elements.cash.value, 3000);
  assert.equal(dom.rows['#item-row-1'].hidden, false);
});

test('a shared link overrides a saved local draft rather than mixing the two', async () => {
  const dom = fakeDom({ values: { ...GOOD, cash: '9999' } });
  const first = await loadApp(dom);
  first.handlers.get('submit')({ preventDefault() {} });
  assert.equal(JSON.parse(dom.store.get('cash-runway-draft')).cash, '9999');

  const second = fakeDom({ values: GOOD, hash: '#cash=250&weeklyIncome=1800&collectionWeeks=2&weeklyCosts=1400' });
  second.store.set('cash-runway-draft', dom.store.get('cash-runway-draft'));
  await loadApp(second);
  assert.equal(second.form.elements.cash.value, 250);
});

test('a restored draft reveals the hidden row it used', async () => {
  // Otherwise the forecast includes a payment the visitor cannot see, edit, or
  // remove, and the numbers on screen do not add up to the answer below them.
  const dom = fakeDom({ values: { ...GOOD, item6Name: 'Tax', item6Amount: '900', item6Week: '4' } });
  const first = await loadApp(dom);
  first.handlers.get('submit')({ preventDefault() {} });
  assert.equal(JSON.parse(dom.store.get('cash-runway-draft')).item6Amount, '900');

  const second = fakeDom({ values: GOOD });
  second.store.set('cash-runway-draft', dom.store.get('cash-runway-draft'));
  await loadApp(second);
  assert.equal(second.rows['#item-row-6'].hidden, false);
  assert.equal(second.rows['#item-row-5'].hidden, true);
  assert.equal(second.form.elements.item6Amount.value, '900');
});
