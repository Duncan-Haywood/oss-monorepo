import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPANY_FIELDS,
  addDays,
  buildProposal,
  escapeHtml,
  forgetCompany,
  formatDate,
  lines,
  loadCompany,
  referenceFor,
  renderProposalHtml,
  saveCompany,
} from './proposal.mjs';

/** Minimal in-memory stand-in for `localStorage`. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get size() { return map.size; },
  };
}

const VALID = Object.freeze({
  companyName: 'Kowalski Masonry LLC',
  companyPhone: '(312) 555-0148',
  companyEmail: 'bids@kowalskimasonry.example',
  companyLicense: 'IL-MAS-88412',
  clientName: 'R. Okafor',
  clientAddress: '1140 W Cornelia Ave\nChicago, IL',
  jobTitle: 'Tuckpointing — north and west elevations',
  scope: 'Grind and point 864 sq ft\nReplace 24 face brick\n\nReset one lintel',
  price: 9840.5,
  depositPercent: 30,
  validDays: 30,
  issuedOn: '2026-08-26',
  paymentTerms: 'Deposit on acceptance, balance on completion.',
  proposalExclusions: 'Permit fees\nChimney rebuild',
});

test('a proposal computes the deposit split, the expiry, and a reference', () => {
  const proposal = buildProposal(VALID);
  assert.equal(proposal.pricing.price, 9840.5);
  assert.equal(proposal.pricing.depositAmount, 2952.15);
  assert.equal(proposal.pricing.balanceAmount, 9840.5 - 2952.15);
  assert.equal(proposal.validUntil, '2026-09-25');
  assert.match(proposal.reference, /^Q-20260826-[0-9A-Z]{4}$/);
});

test('the deposit and balance always add back to the price', () => {
  for (const depositPercent of [0, 1, 12.5, 33.3, 50, 99, 100]) {
    const { pricing } = buildProposal({ ...VALID, depositPercent });
    assert.ok(
      Math.abs(pricing.depositAmount + pricing.balanceAmount - pricing.price) < 1e-9,
      `deposit + balance != price at ${depositPercent}%`,
    );
  }
});

test('the figures as printed add up to the total as printed', () => {
  // The customer reads two decimal places and adds them. Rounding the deposit
  // and the balance independently misses the total by a cent often enough to
  // matter: a 30% deposit on $15,014.45 is one of those cases.
  const cents = (value) => Math.round(value * 100);
  for (const price of [15014.45, 9840.5, 1688.88, 7333.33, 101.01, 12345.67]) {
    for (const depositPercent of [0, 5, 10, 15, 25, 30, 33.3, 50, 66.7, 100]) {
      const { pricing } = buildProposal({ ...VALID, price, depositPercent });
      assert.equal(
        cents(pricing.depositAmount) + cents(pricing.balanceAmount),
        cents(pricing.price),
        `printed deposit + balance != printed total at ${price} / ${depositPercent}%`,
      );
      assert.ok(pricing.depositAmount >= 0 && pricing.balanceAmount >= 0,
        'neither printed line may be negative');
    }
  }
});

test('a zero validity period means the price is not held, not "expires today"', () => {
  const proposal = buildProposal({ ...VALID, validDays: 0 });
  assert.equal(proposal.validUntil, null);
  assert.doesNotMatch(renderProposalHtml(proposal), /price is held/);
});

test('the details that would embarrass the contractor are refused, not rendered blank', () => {
  assert.throws(() => buildProposal({ ...VALID, companyName: '  ' }), /business name/i);
  assert.throws(() => buildProposal({ ...VALID, clientName: '' }), /customer name/i);
  assert.throws(() => buildProposal({ ...VALID, price: 0 }), /Price a job/i);
  assert.throws(() => buildProposal({ ...VALID, price: 'abc' }), /must be a number/i);
  assert.throws(() => buildProposal({ ...VALID, depositPercent: 101 }), /at most 100/i);
  assert.throws(() => buildProposal({ ...VALID, depositPercent: -1 }), /at least 0/i);
});

test('blank lines in a pasted scope do not become empty bullets', () => {
  assert.deepEqual(lines('  a \n\n\n b  \n'), ['a', 'b']);
  assert.deepEqual(lines(''), []);
  assert.deepEqual(lines(null), []);
  const proposal = buildProposal(VALID);
  assert.deepEqual(proposal.job.scope, [
    'Grind and point 864 sq ft',
    'Replace 24 face brick',
    'Reset one lintel',
  ]);
});

test('date arithmetic does not drift across a DST boundary', () => {
  // US DST ends 2026-11-01. Local-time arithmetic loses or gains a day here.
  assert.equal(addDays('2026-10-25', 14), '2026-11-08');
  assert.equal(addDays('2026-03-01', 14), '2026-03-15');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.throws(() => addDays('26/08/2026', 30), /YYYY-MM-DD/);
});

test('dates print unambiguously for a US and a non-US reader', () => {
  assert.equal(formatDate('2026-08-26'), '26 August 2026');
  assert.equal(formatDate('2026-01-05'), '5 January 2026');
});

test('a reference is stable per customer and per day, and differs between customers', () => {
  assert.equal(
    referenceFor('2026-08-26', 'R. Okafor'),
    referenceFor('2026-08-26', 'r. okafor'),
    'case should not change the reference the customer was quoted',
  );
  assert.notEqual(
    referenceFor('2026-08-26', 'R. Okafor'),
    referenceFor('2026-08-26', 'J. Alvarez'),
  );
  assert.notEqual(
    referenceFor('2026-08-26', 'R. Okafor'),
    referenceFor('2026-08-27', 'R. Okafor'),
  );
});

test('customer-supplied text cannot inject markup into the printed page', () => {
  const html = renderProposalHtml(buildProposal({
    ...VALID,
    companyName: 'Ace <script>alert(1)</script> Masonry',
    clientName: '"><img src=x onerror=alert(1)>',
    proposalNotes: 'Job & site: <b>north</b> wall',
  }));
  // The property that matters is that no customer-supplied text survives as
  // markup: `onerror=` as escaped *text* is inert, `<img onerror=` is not.
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /Job &amp; site/);
  assert.equal(escapeHtml(`<&">'`), '&lt;&amp;&quot;&gt;&#39;');
});

test('the printed page carries everything the customer needs to act on it', () => {
  const html = renderProposalHtml(buildProposal(VALID), {
    disclaimer: 'Estimate prepared by the contractor named above.',
  });
  assert.match(html, /Kowalski Masonry LLC/);
  assert.match(html, /R. Okafor/);
  assert.match(html, /\$9,840\.50/, 'the total price must be on the page');
  assert.match(html, /\$2,952\.15/, 'the deposit must be on the page');
  assert.match(html, /26 August 2026/);
  assert.match(html, /25 September 2026/);
  assert.match(html, /Grind and point 864 sq ft/);
  assert.match(html, /Permit fees/, 'exclusions protect the contractor and must print');
  assert.match(html, /Customer signature/, 'a proposal the customer cannot accept is not a proposal');
  assert.match(html, /Estimate prepared by the contractor named above\./);
  assert.match(html, /Licence IL-MAS-88412/);
});

test('the document invents no legal terms of its own', () => {
  // Only the contractor's own words may appear as terms. A calculator that
  // shipped boilerplate warranty or lien language would be giving legal advice.
  const html = renderProposalHtml(buildProposal({
    ...VALID,
    paymentTerms: '',
    proposalNotes: '',
    proposalExclusions: '',
  }));
  assert.doesNotMatch(html, /warrant|lien|arbitrat|governing law|indemnif/i);
  assert.doesNotMatch(html, /Payment terms/, 'an empty terms block should be omitted, not printed empty');
  assert.doesNotMatch(html, /Not included/);
});

test('the business block is remembered but the customer block never is', () => {
  const storage = fakeStorage();
  saveCompany(storage, 'k', VALID);
  const raw = storage.getItem('k');
  assert.match(raw, /Kowalski Masonry LLC/);
  assert.doesNotMatch(raw, /Okafor/, 'a third party’s details must not be persisted');
  assert.doesNotMatch(raw, /Cornelia/);

  const loaded = loadCompany(storage, 'k');
  assert.deepEqual(Object.keys(loaded).sort(), [...COMPANY_FIELDS].sort());
  assert.equal(loaded.companyName, 'Kowalski Masonry LLC');
  assert.equal(loaded.companyLicense, 'IL-MAS-88412');
});

test('a corrupt or missing saved block yields empty fields rather than throwing', () => {
  assert.equal(loadCompany(fakeStorage({ k: 'not json' }), 'k').companyName, '');
  assert.equal(loadCompany(fakeStorage(), 'k').companyName, '');
  assert.equal(loadCompany(null, 'k').companyName, '');
  assert.doesNotThrow(() => saveCompany(null, 'k', VALID));
  assert.doesNotThrow(() => forgetCompany(null, 'k'));
});

test('forgetting the business block removes it', () => {
  const storage = fakeStorage();
  saveCompany(storage, 'k', VALID);
  forgetCompany(storage, 'k');
  assert.equal(storage.getItem('k'), null);
  assert.equal(loadCompany(storage, 'k').companyName, '');
});
