import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseISODate,
  daysBetween,
  hasNyNexus,
  classify,
  initialDeadline,
  daysUntil,
  emptyOwnerRow,
  ownerRowIssues,
  loadOwners,
  removeOwner,
  buildOrganizerText,
  ownerRowsToCsv,
} from './calc.mjs';

test('parseISODate rejects malformed and non-date strings', () => {
  assert.equal(parseISODate(''), null);
  assert.equal(parseISODate('not-a-date'), null);
  assert.equal(parseISODate('2026-13-40'), null);
  assert.ok(parseISODate('2026-09-17') instanceof Date);
});

test('daysBetween counts whole days both directions', () => {
  assert.equal(daysBetween('2026-09-17', '2026-12-31'), 105);
  assert.equal(daysBetween('2026-12-31', '2026-09-17'), -105);
  assert.equal(daysBetween('2026-09-17', '2026-09-17'), 0);
  assert.equal(daysBetween('bad', '2026-09-17'), null);
});

test('hasNyNexus is true if either NY-formed or authorized to do business in NY', () => {
  assert.equal(hasNyNexus({ formedInNY: true, authorizedInNY: false }), true);
  assert.equal(hasNyNexus({ formedInNY: false, authorizedInNY: true }), true);
  assert.equal(hasNyNexus({ formedInNY: false, authorizedInNY: false }), false);
  assert.equal(hasNyNexus({}), false);
});

test('classify: no NY nexus is outside scope regardless of formation country', () => {
  assert.equal(classify({ formedInNY: false, authorizedInNY: false, formedOutsideUS: true }), 'outside-scope');
  assert.equal(classify({ formedInNY: false, authorizedInNY: false, formedOutsideUS: false }), 'outside-scope');
});

test('classify: NY nexus + formed outside the US is likely-reporting', () => {
  assert.equal(classify({ formedInNY: true, authorizedInNY: false, formedOutsideUS: true }), 'likely-reporting');
  assert.equal(classify({ formedInNY: false, authorizedInNY: true, formedOutsideUS: true }), 'likely-reporting');
});

test('classify: NY nexus + formed inside the US (including NY itself) is likely-exempt', () => {
  assert.equal(classify({ formedInNY: true, authorizedInNY: false, formedOutsideUS: false }), 'likely-exempt');
  assert.equal(classify({ formedInNY: false, authorizedInNY: true, formedOutsideUS: false }), 'likely-exempt');
});

test('initialDeadline: entities with a pre-2026 nexus date get the fixed 2026-12-31 deadline', () => {
  assert.equal(initialDeadline('2020-05-01'), '2026-12-31');
  assert.equal(initialDeadline('2025-12-31'), '2026-12-31');
});

test('initialDeadline: entities formed/registered on or after 2026-01-01 get 30 days from that date', () => {
  assert.equal(initialDeadline('2026-01-01'), '2026-01-31');
  assert.equal(initialDeadline('2026-03-15'), '2026-04-14');
  // Crosses a month/year boundary correctly.
  assert.equal(initialDeadline('2026-12-15'), '2027-01-14');
});

test('initialDeadline rejects an invalid date', () => {
  assert.equal(initialDeadline(''), null);
  assert.equal(initialDeadline('not-a-date'), null);
});

test('daysUntil is negative once the deadline has passed', () => {
  assert.equal(daysUntil('2026-01-31', '2026-02-05'), -5);
  assert.equal(daysUntil('2026-12-31', '2026-09-17'), 105);
});

test('emptyOwnerRow has every field blank', () => {
  const row = emptyOwnerRow();
  assert.deepEqual(Object.values(row), ['', '', '', '', '', '']);
});

test('ownerRowIssues lists every missing required field by its human label', () => {
  assert.deepEqual(ownerRowIssues({}), [
    'Full legal name',
    'Residential or business street address',
    'Date of birth',
    'ID type (passport, driver license, or other government ID)',
    'Unique ID number',
    'Issuing state or country',
  ]);
  assert.deepEqual(
    ownerRowIssues({ name: 'Pat Lee', address: '1 Main St', dob: '', idType: '', idNumber: '', idJurisdiction: '' }),
    ['Date of birth', 'ID type (passport, driver license, or other government ID)', 'Unique ID number', 'Issuing state or country'],
  );
  assert.deepEqual(
    ownerRowIssues({
      name: 'Pat Lee', address: '1 Main St', dob: '1980-01-01',
      idType: 'passport', idNumber: 'X123', idJurisdiction: 'NY',
    }),
    [],
  );
});

test('loadOwners tolerates missing, malformed, and non-array JSON', () => {
  assert.deepEqual(loadOwners(''), []);
  assert.deepEqual(loadOwners('not json'), []);
  assert.deepEqual(loadOwners('{"a":1}'), []);
  assert.deepEqual(loadOwners('[{"name":"Pat"}, null, "x"]'), [{ name: 'Pat' }]);
});

test('removeOwner drops only the targeted index and copies otherwise', () => {
  const owners = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  assert.deepEqual(removeOwner(owners, 1), [{ name: 'A' }, { name: 'C' }]);
  assert.deepEqual(removeOwner(owners, 99), owners);
  assert.notEqual(removeOwner(owners, 99), owners);
});

test('buildOrganizerText names the category, the deadline countdown, and flags missing owner fields', () => {
  const text = buildOrganizerText({
    entityName: 'Acme Imports LLC',
    classification: 'likely-reporting',
    formationOrRegistrationDate: '2026-03-01',
    deadline: '2026-03-31',
    todayISO: '2026-03-10',
    owners: [
      { name: 'Pat Lee', address: '1 Main St', dob: '1980-01-01', idType: 'passport', idNumber: 'X1', idJurisdiction: 'NY' },
      { name: 'Sam Ide' },
    ],
  });
  assert.match(text, /Acme Imports LLC/);
  assert.match(text, /Likely a Reporting Company/);
  assert.match(text, /Days remaining as of 2026-03-10: 21/);
  assert.match(text, /1\. Pat Lee/);
  assert.match(text, /2\. Sam Ide/);
  assert.match(text, /MISSING: Residential or business street address/);
  assert.doesNotMatch(text.split('2. Sam Ide')[0], /MISSING/);
  assert.match(text, /not a determination of your actual filing status/);
  assert.match(text, /has not been sent anywhere/);
});

test('buildOrganizerText past a deadline reports it as past, not as remaining', () => {
  const text = buildOrganizerText({
    entityName: 'Old LLC',
    classification: 'likely-exempt',
    formationOrRegistrationDate: '2020-01-01',
    deadline: '2026-12-31',
    todayISO: '2027-01-05',
    owners: [],
  });
  assert.match(text, /5 day\(s\) past/);
  assert.match(text, /not needed for an Attestation of Exemption/);
});

test('ownerRowsToCsv quotes fields containing a comma, quote, or newline', () => {
  const csv = ownerRowsToCsv([
    { name: 'Lee, Pat', address: '1 "Main" St', dob: '1980-01-01', idType: 'passport', idNumber: 'X1', idJurisdiction: 'NY' },
  ]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^"Lee, Pat","1 ""Main"" St",1980-01-01,passport,X1,NY$/);
});

test('ownerRowsToCsv on an empty list is just the header row', () => {
  const csv = ownerRowsToCsv([]);
  assert.equal(csv.split('\n').length, 1);
  assert.match(csv, /^Full legal name,/);
});
