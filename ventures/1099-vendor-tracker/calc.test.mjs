import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  reportingThreshold,
  necDeadline,
  isCorporateEntity,
  reviewVendor,
  reviewAll,
  removeVendor,
  markW9Received,
  tinFormatCheck,
  sampleVendors,
  toCsv,
  loadVendors,
  OBBBA_THRESHOLD_YEAR,
  THRESHOLD_BEFORE_OBBBA,
  THRESHOLD_FROM_OBBBA,
} from './calc.mjs';

test('the reporting threshold is $600 before the OBBBA year and $2,000 from it on', () => {
  assert.equal(reportingThreshold(2025), THRESHOLD_BEFORE_OBBBA);
  assert.equal(reportingThreshold(OBBBA_THRESHOLD_YEAR), THRESHOLD_FROM_OBBBA);
  assert.equal(reportingThreshold(2030), THRESHOLD_FROM_OBBBA);
});

test('an explicit override wins over the year-derived threshold, for the year a real inflation adjustment ships', () => {
  assert.equal(reportingThreshold(2026, 2100), 2100);
  // A non-positive or non-finite override is ignored rather than zeroing the threshold out.
  assert.equal(reportingThreshold(2026, 0), THRESHOLD_FROM_OBBBA);
  assert.equal(reportingThreshold(2026, -5), THRESHOLD_FROM_OBBBA);
  assert.equal(reportingThreshold(2026, NaN), THRESHOLD_FROM_OBBBA);
});

test('the 1099-NEC deadline is January 31, rolled to the next business day on a weekend', () => {
  // 2027-01-31 is a Sunday -- verified against reporting that the real 2027
  // cutoff is February 1.
  assert.equal(necDeadline(2026), '2027-02-01');
  // 2026-01-31 is a Saturday -> rolls two days to Monday.
  assert.equal(necDeadline(2025), '2026-02-02');
  // 2027-01-31 is a Monday -> stays put.
  assert.equal(necDeadline(2026 + 1), '2028-01-31');
});

test('corporate entity types are recognised, non-corporate ones are not', () => {
  assert.equal(isCorporateEntity('cCorp'), true);
  assert.equal(isCorporateEntity('sCorp'), true);
  assert.equal(isCorporateEntity('llcTaxedAsCorp'), true);
  assert.equal(isCorporateEntity('individual'), false);
  assert.equal(isCorporateEntity('singleMemberLlc'), false);
  assert.equal(isCorporateEntity('partnership'), false);
  assert.equal(isCorporateEntity('multiMemberLlc'), false);
});

test('an individual paid above the threshold with no W-9 needs a 1099 and is flagged for the missing W-9', () => {
  const row = reviewVendor(
    { name: 'A', entityType: 'individual', paymentCategory: 'services', totalPaid: 3000, w9OnFile: false },
    { taxYear: 2026 },
  );
  assert.equal(row.status, 'Needs 1099 — W-9 missing');
  assert.equal(row.threshold, 2000);
  assert.equal(row.deadline, '2027-02-01');
});

test('the same vendor with a W-9 on file still needs the form, just not flagged for missing paperwork', () => {
  const row = reviewVendor(
    { name: 'A', entityType: 'individual', paymentCategory: 'services', totalPaid: 3000, w9OnFile: true },
    { taxYear: 2026 },
  );
  assert.equal(row.status, 'Needs 1099 — W-9 on file');
});

test('a payment below the year\'s threshold is not yet reportable', () => {
  const row = reviewVendor(
    { name: 'A', entityType: 'individual', paymentCategory: 'services', totalPaid: 1500, w9OnFile: false },
    { taxYear: 2026 },
  );
  assert.equal(row.status, 'Below threshold — not yet reportable');
  // The same $1,500 crosses the pre-OBBBA $600 threshold.
  const before = reviewVendor(
    { name: 'A', entityType: 'individual', paymentCategory: 'services', totalPaid: 1500, w9OnFile: false },
    { taxYear: 2025 },
  );
  assert.equal(before.status, 'Needs 1099 — W-9 missing');
});

test('a corporation is exempt for ordinary services regardless of amount', () => {
  const row = reviewVendor(
    { name: 'Acme Inc.', entityType: 'cCorp', paymentCategory: 'services', totalPaid: 50000, w9OnFile: false },
    { taxYear: 2026 },
  );
  assert.equal(row.status, 'Likely exempt — corporation');
});

test('an attorney is never exempt by the corporation rule, even organized as an LLC taxed as a corporation', () => {
  const row = reviewVendor(
    { name: 'Law Firm LLC', entityType: 'llcTaxedAsCorp', paymentCategory: 'attorneyFees', totalPaid: 5000, w9OnFile: true },
    { taxYear: 2026 },
  );
  assert.equal(row.status, 'Needs 1099 — W-9 on file');
});

test('an attorney paid below the general threshold is still below threshold, not exempt', () => {
  const row = reviewVendor(
    { name: 'Small Matter LLC', entityType: 'llcTaxedAsCorp', paymentCategory: 'attorneyFees', totalPaid: 500, w9OnFile: true },
    { taxYear: 2026 },
  );
  assert.equal(row.status, 'Below threshold — not yet reportable');
});

test('gross proceeds to an attorney and medical/health-care payments are flagged, never computed', () => {
  const proceeds = reviewVendor(
    { name: 'Settlement counsel', entityType: 'cCorp', paymentCategory: 'attorneyGrossProceeds', totalPaid: 50000, w9OnFile: false },
    { taxYear: 2026 },
  );
  assert.equal(proceeds.status, 'Check separately (not calculated)');
  assert.equal(proceeds.threshold, null);
  assert.equal(proceeds.deadline, null);

  const medical = reviewVendor(
    { name: 'Clinic Inc.', entityType: 'cCorp', paymentCategory: 'medicalHealthcare', totalPaid: 50000, w9OnFile: true },
    { taxYear: 2026 },
  );
  assert.equal(medical.status, 'Check separately (not calculated)');
});

test('a non-numeric or negative paid amount reports "Check inputs" rather than a wrong status', () => {
  const bad = reviewVendor({ name: 'X', entityType: 'individual', paymentCategory: 'services', totalPaid: 'a lot', w9OnFile: false }, { taxYear: 2026 });
  assert.equal(bad.status, 'Check inputs');
  const negative = reviewVendor({ name: 'X', entityType: 'individual', paymentCategory: 'services', totalPaid: -10, w9OnFile: false }, { taxYear: 2026 });
  assert.equal(negative.status, 'Check inputs');
});

test('reviewAll orders missing-W9 first, then on-file, then check-separately, then below-threshold, then exempt', () => {
  const rows = reviewAll(
    [
      { name: 'Exempt corp', entityType: 'cCorp', paymentCategory: 'services', totalPaid: 9000, w9OnFile: false },
      { name: 'Below threshold', entityType: 'individual', paymentCategory: 'services', totalPaid: 100, w9OnFile: false },
      { name: 'Needs 1099, has W9', entityType: 'individual', paymentCategory: 'services', totalPaid: 3000, w9OnFile: true },
      { name: 'Needs 1099, missing W9', entityType: 'individual', paymentCategory: 'services', totalPaid: 4000, w9OnFile: false },
      { name: 'Check separately', entityType: 'cCorp', paymentCategory: 'medicalHealthcare', totalPaid: 9000, w9OnFile: false },
    ],
    { taxYear: 2026 },
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Needs 1099, missing W9', 'Needs 1099, has W9', 'Check separately', 'Below threshold', 'Exempt corp'],
  );
});

test('reviewAll attaches sourceIndex so a queue row can be acted on by identity after sorting', () => {
  const rows = reviewAll(
    [
      { name: 'Exempt corp', entityType: 'cCorp', paymentCategory: 'services', totalPaid: 9000, w9OnFile: false },
      { name: 'Needs 1099', entityType: 'individual', paymentCategory: 'services', totalPaid: 4000, w9OnFile: false },
    ],
    { taxYear: 2026 },
  );
  assert.equal(rows[0].name, 'Needs 1099');
  assert.equal(rows[0].sourceIndex, 1);
});

test('removeVendor drops exactly the row at the given source index and does not mutate the input', () => {
  const vendors = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  assert.deepEqual(removeVendor(vendors, 1), [{ name: 'A' }, { name: 'C' }]);
  assert.equal(vendors.length, 3);
});

test('removeVendor is a no-op on an out-of-range or malformed index', () => {
  const vendors = [{ name: 'A' }, { name: 'B' }];
  assert.deepEqual(removeVendor(vendors, -1), vendors);
  assert.deepEqual(removeVendor(vendors, 2), vendors);
  assert.deepEqual(removeVendor(vendors, 1.5), vendors);
  assert.deepEqual(removeVendor(null, 0), []);
});

test('markW9Received stamps only the named row and leaves the rest untouched', () => {
  const vendors = [{ name: 'A', w9OnFile: false }, { name: 'B', w9OnFile: false }];
  const after = markW9Received(vendors, 0);
  assert.equal(after[0].w9OnFile, true);
  assert.equal(after[1].w9OnFile, false);
  assert.equal(vendors[0].w9OnFile, false, 'the saved array is not mutated in place');
});

test('markW9Received is a no-op on an out-of-range index', () => {
  const vendors = [{ name: 'A', w9OnFile: false }];
  assert.deepEqual(markW9Received(vendors, 5), vendors);
});

test('tinFormatCheck recognises SSN- and EIN-shaped input and an unformatted 9 digits, and rejects the rest', () => {
  assert.deepEqual(tinFormatCheck('123-45-6789'), { plausible: true, kind: 'ssn-shaped' });
  assert.deepEqual(tinFormatCheck('12-3456789'), { plausible: true, kind: 'ein-shaped' });
  assert.deepEqual(tinFormatCheck('123456789'), { plausible: true, kind: 'unformatted' });
  assert.equal(tinFormatCheck('123-456-789').plausible, false);
  assert.equal(tinFormatCheck('not a number').plausible, false);
  assert.deepEqual(tinFormatCheck(''), { plausible: null, kind: null });
  assert.deepEqual(tinFormatCheck(undefined), { plausible: null, kind: null });
});

test('tinFormatCheck is a format check only, never a claim of IRS verification', () => {
  const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
  assert.match(readme, /not.{0,40}IRS TIN Matching/i);
});

test('toCsv escapes values and carries every field the queue reads', () => {
  const csv = toCsv([{ name: 'Smith, Jones & Co.', entityType: 'individual', category: 'services', totalPaid: 3000, threshold: 2000, w9OnFile: true, tin: '123-45-6789', status: 'Needs 1099 — W-9 on file', deadline: '2027-02-01' }]);
  const [header, dataLine] = csv.split('\n');
  assert.equal(header, 'name,entityType,category,totalPaid,threshold,w9OnFile,tin,status,deadline');
  assert.match(dataLine, /"Smith, Jones & Co\."/);
  for (const value of ['individual', 'services', '3000', '2000', 'true', '123-45-6789', '2027-02-01']) {
    assert.ok(dataLine.includes(value), `CSV row is missing ${value}: ${dataLine}`);
  }
});

test('loadVendors recovers from damaged local storage instead of blanking the queue', () => {
  assert.deepEqual(loadVendors(null), []);
  assert.deepEqual(loadVendors(''), []);
  assert.deepEqual(loadVendors('{not json'), []);
  assert.deepEqual(
    loadVendors(JSON.stringify([{ name: 'Real vendor' }, null, 'not a vendor'])),
    [{ name: 'Real vendor' }],
  );
});

test('sampleVendors demonstrates every status the queue can show', () => {
  const rows = reviewAll(sampleVendors(), { taxYear: 2026 });
  const statuses = new Set(rows.map((r) => r.status));
  assert.ok(statuses.has('Needs 1099 — W-9 missing'));
  assert.ok(statuses.has('Needs 1099 — W-9 on file'));
  assert.ok(statuses.has('Likely exempt — corporation'));
  assert.ok(statuses.has('Below threshold — not yet reportable'));
  assert.ok(statuses.has('Check separately (not calculated)'));
});

test('reviewVendor does not mutate the vendor object it is given', () => {
  const vendor = { name: 'A', entityType: 'individual', paymentCategory: 'services', totalPaid: 3000, w9OnFile: false };
  const before = JSON.stringify(vendor);
  reviewVendor(vendor, { taxYear: 2026 });
  assert.equal(JSON.stringify(vendor), before);
});
