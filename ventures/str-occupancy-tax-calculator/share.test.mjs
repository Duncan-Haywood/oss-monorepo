import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBid, decodeBid, saveBid, loadBid, clearBid, restoreBid } from './share.mjs';

const VALUES = {
  nightlyRate: '250', nights: '4', cleaningFee: '150', bookingsPerMonth: '6',
  flatFeePerNight: '0', flatFeePlatformCollectsPercent: '0',
  rows: [
    { name: 'Florida state sales tax', ratePercent: '6', platformCollectsPercent: '100' },
    { name: 'County tourist development tax', ratePercent: '5', platformCollectsPercent: '0' },
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
  assert.equal(decoded.nightlyRate, '250');
  assert.equal(decoded.nights, '4');
  assert.equal(decoded.cleaningFee, '150');
  assert.equal(decoded.bookingsPerMonth, '6');
  assert.equal(decoded.rows.length, 2);
  assert.equal(decoded.rows[0].name, 'Florida state sales tax');
  assert.equal(decoded.rows[0].ratePercent, '6');
  assert.equal(decoded.rows[1].platformCollectsPercent, '0');
});

test('drops non-numeric and negative values rather than sharing junk', () => {
  const encoded = encodeBid({ nightlyRate: 'nope', nights: '-1', cleaningFee: '95', rows: [] });
  const decoded = decodeBid(encoded);
  assert.equal(decoded.nightlyRate, undefined);
  assert.equal(decoded.nights, undefined);
  assert.equal(decoded.cleaningFee, '95');
});

test('a crafted link cannot write more than LAYER_COUNT rows', () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ name: `Layer ${i}`, ratePercent: '1', platformCollectsPercent: '0' }));
  const decoded = decodeBid(encodeBid({ rows }));
  assert.equal(decoded.rows.length, 4);
});

test('an empty or malformed source decodes to nothing, not a throw', () => {
  assert.deepEqual(decodeBid(''), {});
  assert.deepEqual(decodeBid(undefined), {});
  assert.deepEqual(decodeBid('#'), {});
});

test('does not encode fields outside the allowlist', () => {
  const encoded = encodeBid({ nightlyRate: '200', listingAddress: '12 Maple St', rows: [{ name: 'State', ratePercent: '5', notes: 'confidential' }] });
  assert.equal(encoded.includes('Maple'), false);
  assert.equal(encoded.includes('listingAddress'), false);
  assert.equal(encoded.includes('confidential'), false);
});

test('save, load and clear round-trip through storage', () => {
  const storage = new FakeStorage();
  assert.equal(saveBid(storage, VALUES), true);
  const loaded = loadBid(storage);
  assert.equal(loaded.nightlyRate, '250');
  assert.equal(loaded.rows.length, 2);
  assert.equal(clearBid(storage), true);
  assert.deepEqual(loadBid(storage), {});
});

test('a link wins over storage, and storage wins over nothing', () => {
  const storage = new FakeStorage();
  saveBid(storage, { nightlyRate: '100', rows: [] });
  const fromLink = restoreBid({ hash: '#nightlyRate=300', storage });
  assert.equal(fromLink.source, 'link');
  assert.equal(fromLink.values.nightlyRate, '300');

  const fromStorage = restoreBid({ hash: '', storage });
  assert.equal(fromStorage.source, 'storage');
  assert.equal(fromStorage.values.nightlyRate, '100');

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
