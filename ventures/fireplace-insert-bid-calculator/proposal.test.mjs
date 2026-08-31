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
  money,
  referenceFor,
  renderProposalHtml,
  saveCompany,
  scopeLines,
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

// ---- scopeLines -----------------------------------------------------------
//
// These guard the defect that has cost every adoption batch a line: a field
// name guessed from the input rather than read off the result, resolving to
// `undefined` and printing that word on a customer's quote.

test('scope templates fill from the result', () => {
  assert.deepEqual(
    scopeLines(['Install {feet} ft of {name}', 'Haul away debris'], { feet: 180, name: '6 ft cedar privacy' }),
    ['Install 180 ft of 6 ft cedar privacy', 'Haul away debris'],
  );
});

test('a line whose field is missing is dropped, never printed as undefined', () => {
  const result = { totalFeet: 90 };
  const filled = scopeLines(
    ['{totalFeet} ft of fence', '{linearFeet} ft of {material}', 'Site left clean'],
    result,
  );
  assert.deepEqual(filled, ['90 ft of fence', 'Site left clean']);
  assert.ok(!filled.join('\n').includes('undefined'));
});

test('null, empty string, NaN and Infinity drop their line too', () => {
  const values = { a: null, b: '', c: Number.NaN, d: Number.POSITIVE_INFINITY, e: 0 };
  assert.deepEqual(
    scopeLines(['x {a}', 'x {b}', 'x {c}', 'x {d}', 'x {e}'], values),
    // Zero is a real figure — "0 gates" is a fact, not a hole.
    ['x 0'],
  );
});

test('dotted paths read into nested result objects', () => {
  assert.deepEqual(
    scopeLines(['{job.rooms} rooms', '{job.missing} rooms'], { job: { rooms: 4 } }),
    ['4 rooms'],
  );
});

test('a `when` guard keeps optional work off the sheet when it is not happening', () => {
  const templates = [
    { line: 'Remove {tearOutFeet} ft of existing fence', when: 'tearOutFeet' },
    'Set posts in concrete',
  ];
  assert.deepEqual(scopeLines(templates, { tearOutFeet: 0 }), ['Set posts in concrete']);
  assert.deepEqual(scopeLines(templates, { tearOutFeet: 40 }),
    ['Remove 40 ft of existing fence', 'Set posts in concrete']);
});

test('a `when` guard on a missing field is false rather than an error', () => {
  assert.deepEqual(scopeLines([{ line: 'x', when: 'nope.deeper' }], {}), []);
});

test('empty and malformed templates yield no lines rather than throwing', () => {
  assert.deepEqual(scopeLines([], {}), []);
  assert.deepEqual(scopeLines(undefined, {}), []);
  assert.deepEqual(scopeLines([null, 42, { noLine: true }, '   '], {}), []);
});

// ---- `each`: the itemised job ---------------------------------------------
// Half the calculators here price a job made of rows — rooms, gutter runs,
// trees, exhaust components — and the homeowner comparing three bids compares
// the line items. Without `each` the best scope such a trade could draft is
// the generic sentence the README says is worth less than no proposal.

test('`each` prints one line per row, reading the row rather than the root', () => {
  assert.deepEqual(
    scopeLines([{ each: 'rooms', line: '{name} — {squareFeet} sq ft' }], {
      name: 'THE WHOLE JOB',
      rooms: [
        { name: 'Living room', squareFeet: 280 },
        { name: 'Kitchen', squareFeet: 180 },
      ],
    }),
    ['Living room — 280 sq ft', 'Kitchen — 180 sq ft'],
  );
});

test('`each` drops the row the contractor left at zero, not the whole line', () => {
  const templates = [{ each: 'runs', when: 'linearFeet', line: 'Clear {linearFeet} ft of {name}' }];
  assert.deepEqual(
    scopeLines(templates, {
      runs: [
        { name: 'front gutter', linearFeet: 80 },
        { name: 'garage gutter', linearFeet: 0 },
        { name: 'rear gutter', linearFeet: 40 },
      ],
    }),
    ['Clear 80 ft of front gutter', 'Clear 40 ft of rear gutter'],
  );
});

test('a row missing a figure drops by the same rule as a top-level line', () => {
  // The defect this exists to stop: `run.material` is really `run.name`, the
  // lookup yields undefined rather than throwing, and the customer's quote
  // reads "undefined ft of undefined" while every suite stays green.
  assert.deepEqual(
    scopeLines([{ each: 'trees', line: 'Remove the {species} — {dbhInches}" DBH' }], {
      trees: [
        { species: 'oak', dbhInches: 24 },
        { species: 'pine' },
      ],
    }),
    ['Remove the oak — 24" DBH'],
  );
});

test('`each` carries the plural and rounding suffixes into each row', () => {
  assert.deepEqual(
    scopeLines([{ each: 'piles', line: '{quantity} {name} ({tons~2} ton{tons+s})' }], {
      piles: [
        { quantity: 6, name: 'mixed household junk', tons: 0.6 },
        { quantity: 1, name: 'mattress', tons: 1 },
      ],
    }),
    ['6 mixed household junk (0.6 tons)', '1 mattress (1 ton)'],
  );
});

test('`each` on a missing, empty or non-array path yields nothing rather than throwing', () => {
  const line = { each: 'rows', line: '{name}' };
  assert.deepEqual(scopeLines([line], {}), []);
  assert.deepEqual(scopeLines([line], { rows: [] }), []);
  assert.deepEqual(scopeLines([line], { rows: 'not an array' }), []);
  assert.deepEqual(scopeLines([line], { rows: [null, 7, { name: 'kept' }] }), ['kept']);
});

test('`each` reaches a nested array and does not truncate the rows', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ n: i + 1 }));
  assert.equal(scopeLines([{ each: 'job.rows', line: 'Item {n}' }], { job: { rows } }).length, 30);
});

test('a plural suffix agrees with its count', () => {
  assert.deepEqual(scopeLines(['{gates} gate{gates+s}'], { gates: 1 }), ['1 gate']);
  assert.deepEqual(scopeLines(['{gates} gate{gates+s}'], { gates: 3 }), ['3 gates']);
  assert.deepEqual(scopeLines(['{gates} gate{gates+s}'], { gates: 0 }), ['0 gates']);
  assert.deepEqual(scopeLines(['{n} box{n+es}'], { n: 2 }), ['2 boxes']);
});

test('a plural suffix on a missing field drops its line like any other', () => {
  assert.deepEqual(scopeLines(['{gates} gate{gates+s}'], {}), []);
});

test('a rounded placeholder groups thousands and drops machine decimals', () => {
  // The defect this exists for: `{billYards}` printed "48.888888888888886 yd²"
  // on a customer's quote.
  assert.deepEqual(scopeLines(['{yards~2} yd²'], { yards: 48.888888888888886 }), ['48.89 yd²']);
  assert.deepEqual(scopeLines(['{sf~0} sq ft'], { sf: 1600 }), ['1,600 sq ft']);
  assert.deepEqual(scopeLines(['{sf~0} sq ft'], { sf: 1599.6 }), ['1,600 sq ft']);
  // A round number should not grow a trailing ".00".
  assert.deepEqual(scopeLines(['{n~2} tons'], { n: 12 }), ['12 tons']);
});

test('rounding a non-numeric value drops the line rather than printing NaN', () => {
  assert.deepEqual(scopeLines(['{x~2} ft'], { x: 'wide' }), []);
});

// money() — the sign belongs outside the currency symbol, and zero has no sign.
//
// Both of these shipped wrong in every vendored copy for as long as the copies
// have existed, and they are visible on any tool that prints a difference: a
// "vs keep-it" column, a plan comparison, the "in-house minus 3PL" line of an
// exported quote.

test('a negative amount puts the minus outside the currency symbol', () => {
  assert.equal(money(-9.24), '-$9.24');
  assert.equal(money(-21500), '-$21,500.00');
});

test('a positive amount is unchanged, separators and all', () => {
  assert.equal(money(9.24), '$9.24');
  assert.equal(money(1234.5), '$1,234.50');
  assert.equal(money(0), '$0.00');
});

test('an amount that is zero at cent precision has no sign', () => {
  // -0 is what subtracting two equal figures gives, and a residual below half a
  // cent rounds to the same place. Printing "-$0.00" tells someone a line is
  // down money when it is exactly break-even.
  assert.equal(money(-0), '$0.00');
  assert.equal(money(-0.004), '$0.00');
  assert.equal(money(0.004), '$0.00');
});

test('rounding is symmetric about zero', () => {
  // Half a cent rounds away from zero on both sides; a magnitude-then-sign
  // implementation gets this right only if it rounds the magnitude.
  assert.equal(money(0.005), '$0.01');
  assert.equal(money(-0.005), '-$0.01');
  assert.equal(money(-1.235), '-$1.24');
});
