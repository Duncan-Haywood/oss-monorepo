import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBid, decodeBid, saveBid, loadBid, clearBid, restoreBid } from './share.mjs';

const VALUES = {
  tipCreditTaken: true, tipCreditPerHour: '5.12', weeksExposed: '4',
  rows: [
    { name: 'Servers', category: 'front', inPool: true, hoursPerWeek: '30', headcount: '6' },
    { name: 'Dishwashers', category: 'back', inPool: true, hoursPerWeek: '35', headcount: '2' },
  ],
};

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('round-trips every global field and every row field', () => {
  const encoded = encodeBid(VALUES);
  const decoded = decodeBid(encoded);
  assert.equal(decoded.tipCreditTaken, 'true');
  assert.equal(decoded.tipCreditPerHour, '5.12');
  assert.equal(decoded.weeksExposed, '4');
  assert.equal(decoded.rows.length, 2);
  assert.equal(decoded.rows[0].name, 'Servers');
  assert.equal(decoded.rows[0].category, 'front');
  assert.equal(decoded.rows[0].inPool, 'true');
  assert.equal(decoded.rows[1].category, 'back');
});

test('a tip credit of "no" round-trips as false, not as absent', () => {
  const encoded = encodeBid({ tipCreditTaken: false, rows: [] });
  const decoded = decodeBid(encoded);
  assert.equal(decoded.tipCreditTaken, 'false');
});

test('drops non-numeric and negative values rather than sharing junk', () => {
  const encoded = encodeBid({ tipCreditPerHour: 'nope', weeksExposed: '-1', rows: [] });
  const decoded = decodeBid(encoded);
  assert.equal(decoded.tipCreditPerHour, undefined);
  assert.equal(decoded.weeksExposed, undefined);
});

test('an unrecognised category drops out rather than reaching a form control', () => {
  const encoded = encodeBid({ rows: [{ name: 'Odd role', category: 'wizard', inPool: true, hoursPerWeek: '10', headcount: '1' }] });
  const decoded = decodeBid(encoded);
  assert.equal(decoded.rows[0].category, undefined);
  assert.equal(decoded.rows[0].name, 'Odd role');
});

test('a crafted link cannot write more than ROLE_COUNT rows', () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ name: `Role ${i}`, category: 'front', inPool: true, hoursPerWeek: '10', headcount: '1' }));
  const decoded = decodeBid(encodeBid({ rows }));
  assert.equal(decoded.rows.length, 6);
});

test('an empty or malformed source decodes to nothing, not a throw', () => {
  assert.deepEqual(decodeBid(''), {});
  assert.deepEqual(decodeBid(undefined), {});
  assert.deepEqual(decodeBid('#'), {});
});

test('does not encode fields outside the allowlist', () => {
  const encoded = encodeBid({ tipCreditPerHour: '5', managerName: 'Pat Smith', rows: [{ name: 'Servers', category: 'front', notes: 'confidential' }] });
  assert.equal(encoded.includes('Smith'), false);
  assert.equal(encoded.includes('managerName'), false);
  assert.equal(encoded.includes('confidential'), false);
});

test('save, load and clear round-trip through storage', () => {
  const storage = new FakeStorage();
  assert.equal(saveBid(storage, VALUES), true);
  const loaded = loadBid(storage);
  assert.equal(loaded.tipCreditTaken, 'true');
  assert.equal(loaded.rows.length, 2);
  assert.equal(clearBid(storage), true);
  assert.deepEqual(loadBid(storage), {});
});

test('a link wins over storage, and storage wins over nothing', () => {
  const storage = new FakeStorage();
  saveBid(storage, { tipCreditPerHour: '3', rows: [] });
  const fromLink = restoreBid({ hash: '#tipCreditPerHour=9', storage });
  assert.equal(fromLink.source, 'link');
  assert.equal(fromLink.values.tipCreditPerHour, '9');

  const fromStorage = restoreBid({ hash: '', storage });
  assert.equal(fromStorage.source, 'storage');
  assert.equal(fromStorage.values.tipCreditPerHour, '3');

  const fromNothing = restoreBid({ hash: '', storage: new FakeStorage() });
  assert.equal(fromNothing.source, 'none');
});

test('storage that throws does not break saving or loading', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(saveBid(hostile, VALUES), false);
  assert.deepEqual(loadBid(hostile), {});
});
