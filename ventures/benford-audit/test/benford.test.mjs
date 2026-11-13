import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedFirst, expectedSecond, expectedFirstTwo, parseAmount, significantDigits, firstDigit, secondDigit,
  firstTwoDigits, lastTwoDigits, zStat, chiSquareP, binomialUpper, bhQValues, madVerdict, digitTest, audit,
  thresholdTest, expectedMad, applicability,
} from '../benford.mjs';
import { rng, exampleCsv } from '../example.mjs';
import { readLedger, parseCsv, flaggedToCsv, sniffDelimiter } from '../csv.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

test('expected distributions sum to one and match published values', () => {
  close(sum(expectedFirst()), 1, 1e-12);
  close(sum(expectedSecond()), 1, 1e-12);
  close(sum(expectedFirstTwo()), 1, 1e-12);
  // Nigrini (2012) table 5.1: P(D1=1) = .30103, P(D2=0) = .11968, P(D2=9) = .08500.
  close(expectedFirst()[1], 0.30103, 5e-6);
  close(expectedFirst()[9], 0.04576, 5e-6);
  close(expectedSecond()[0], 0.11968, 5e-6);
  close(expectedSecond()[9], 0.08500, 5e-6);
  close(expectedFirstTwo()[10], 0.04139, 5e-6);
  close(expectedFirstTwo()[99], 0.00436, 5e-6);
});

test('parseAmount reads the formats ledgers export', () => {
  const cases = [
    ['1234.56', 1234.56], ['$1,234.56', 1234.56], ['(1,234.56)', -1234.56], ['-42', -42], ['42-', -42],
    ['1.234,56', 1234.56], ['1 234,56', 1234.56], ['12,5', 12.5], ['1,234', 1234], ['1,234,567', 1234567],
    ['1.234.567', 1234567], ['USD 99.10', 99.1], ['99.10 EUR', 99.1], ['€ 7,00', 7], ['£0.99', 0.99], ['+5', 5],
    ['', null], ['n/a', null], ['12/31/2025', null], ['1.2.3', null], [' 3 ', 3], ["1'234.50", 1234.5],
  ];
  for (const [raw, want] of cases) assert.equal(parseAmount(raw), want, raw);
});

test('digits are read from the decimal value, not binary noise', () => {
  assert.equal(significantDigits(0.1 + 0.2, 2), '30');
  assert.equal(firstTwoDigits(1999.995), 19);
  assert.equal(firstDigit(0.0042), 4);
  assert.equal(secondDigit(1050), 0);
  assert.equal(firstTwoDigits(-87.2), 87);
  assert.equal(firstDigit(0), null);
  assert.equal(lastTwoDigits(1234.56, true), 56);
  assert.equal(lastTwoDigits(1234.56, false), 35);
  assert.equal(lastTwoDigits(99, false), null);
  assert.equal(lastTwoDigits(0.07, true), 7);
});

test('Z statistic applies the continuity correction only when it does not flip the sign', () => {
  // Hand-computed: p=.35, e=.30103, n=1000 -> (|.04897| - .0005) / sqrt(.30103*.69897/1000) = 3.3415
  close(zStat(0.35, 0.30103, 1000), 3.3415, 1e-3);
  // A difference smaller than 1/(2n) is not corrected below zero.
  assert.ok(zStat(0.3011, 0.30103, 1000) >= 0);
});

test('chi-square p-values match table critical values', () => {
  close(chiSquareP(15.507, 8), 0.05, 2e-4, 'df 8');
  close(chiSquareP(16.919, 9), 0.05, 2e-4, 'df 9');
  close(chiSquareP(112.022, 89), 0.05, 2e-4, 'df 89');
  close(chiSquareP(123.225, 99), 0.05, 2e-4, 'df 99');
  close(chiSquareP(20.090, 8), 0.01, 1e-4, 'df 8 at .01');
  close(chiSquareP(0, 8), 1, 0);
});

test('binomial tail is exact on small cases', () => {
  // P(X >= 2), X ~ Bin(3, .5) = 4/8
  close(binomialUpper(2, 3, 0.5), 0.5, 1e-12);
  close(binomialUpper(0, 3, 0.5), 1, 0);
  close(binomialUpper(4, 3, 0.5), 0, 0);
  close(binomialUpper(10, 10, 0.5), 1 / 1024, 1e-12);
});

test('Benjamini-Hochberg q-values match the textbook example', () => {
  const q = bhQValues([0.01, 0.04, 0.03, 0.005]);
  // sorted .005,.01,.03,.04 -> .02,.02,.04,.04
  assert.deepEqual(q.map((x) => Number(x.toFixed(4))), [0.02, 0.04, 0.04, 0.02]);
});

test('MAD bands follow Nigrini table 7.1 edges', () => {
  assert.equal(madVerdict('first', 0.006), 'close conformity');
  assert.equal(madVerdict('first', 0.0061), 'acceptable conformity');
  assert.equal(madVerdict('first', 0.015), 'marginally acceptable conformity');
  assert.equal(madVerdict('first', 0.0151), 'nonconformity');
  assert.equal(madVerdict('firstTwo', 0.0012), 'close conformity');
  assert.equal(madVerdict('firstTwo', 0.0023), 'nonconformity');
  assert.equal(madVerdict('second', 0.009), 'acceptable conformity');
  assert.equal(madVerdict('lastTwo', 0.1), null);
});

test('an exactly-Benford sample conforms; a uniform one does not', () => {
  const r = rng(7);
  const benford = Array.from({ length: 20000 }, () => 10 ** (1 + 4 * r()));
  const uniform = Array.from({ length: 20000 }, () => 10 + r() * 990);
  const b = digitTest(benford.map(firstDigit), expectedFirst(), 'first');
  const u = digitTest(uniform.map(firstDigit), expectedFirst(), 'first');
  assert.equal(b.verdict, 'close conformity');
  assert.ok(b.p > 0.001, `benford p ${b.p}`);
  assert.equal(u.verdict, 'nonconformity');
  assert.ok(u.p < 1e-10);
  const b2 = digitTest(benford.map(firstTwoDigits), expectedFirstTwo(), 'firstTwo');
  assert.equal(b2.verdict, 'close conformity');
  // The observed MAD of a conforming sample sits near its expected MAD.
  close(b2.mad, expectedMad(expectedFirstTwo(), 20000), 0.0004);
});

test('the threshold test flags piling up under a limit and not a smooth sample', () => {
  const r = rng(3);
  const smooth = Array.from({ length: 5000 }, (_, i) => ({ row: i, value: 10 ** (1 + 4 * r()) }));
  const [clean] = thresholdTest(smooth, [5000]);
  assert.equal(clean.flagged, false);
  const shaved = smooth.concat(Array.from({ length: 80 }, (_, i) => ({ row: 10000 + i, value: 4600 + i * 5 })));
  const [hit] = thresholdTest(shaved, [5000]);
  assert.equal(hit.flagged, true);
  assert.ok(hit.rows.includes(10000));
  // Under 1/x density a little over half the window is below the limit.
  close(hit.expectedBelow / (hit.below + hit.above), Math.log(1 / 0.9) / (Math.log(1 / 0.9) + Math.log(1.1)), 1e-12);
});

test('applicability warns about narrow, small or symmetric data', () => {
  const narrow = Array.from({ length: 500 }, (_, i) => 100 + (i % 50));
  const a = applicability(narrow, {});
  assert.equal(a.ok, false);
  assert.ok(a.notes.some((n) => /orders of magnitude/.test(n)));
  assert.ok(applicability([20, 30], {}).notes.some((n) => /Only 2 amounts/.test(n)));
});

test('the worked example finds each planted problem', () => {
  const ledger = readLedger(exampleCsv());
  assert.equal(ledger.header[ledger.amountColumn], 'amount');
  assert.equal(ledger.header[ledger.groupColumn], 'vendor');
  const res = audit(ledger.records, { thresholds: [5000, 10000] });
  assert.equal(res.first.verdict, 'close conformity');
  const t5 = res.thresholds.find((t) => t.threshold === 5000);
  assert.equal(t5.flagged, true);
  assert.equal(res.thresholds.find((t) => t.threshold === 10000).flagged, false);
  assert.equal(res.duplication.rows[0].amount, 1250);
  assert.equal(res.duplication.rows[0].count, 25);
  const flaggedGroups = res.groups.rows.filter((g) => g.flagged).map((g) => g.group).sort();
  assert.deepEqual(flaggedGroups, ['Employee J. Doe', 'Northgate Supplies']);
  assert.ok(res.flagged.length > 0);
  assert.ok(res.flagged.every((f) => f.reasons.length === f.score));
  // The flagged list is ordered by how many tests caught a row.
  for (let i = 1; i < res.flagged.length; i++) assert.ok(res.flagged[i - 1].score >= res.flagged[i].score);
});

test('sign filter: negatives can be tested on their own', () => {
  const recs = [{ row: 2, amount: -120 }, { row: 3, amount: 340 }, { row: 4, amount: 0 }, { row: 5, amount: 5 }, { row: 6, amount: null }];
  const pos = audit(recs, { sign: 'positive' });
  assert.equal(pos.counts.kept, 1);
  assert.equal(pos.counts.small, 1);
  assert.equal(pos.counts.zero, 1);
  assert.equal(pos.counts.unparsed, 1);
  assert.equal(audit(recs, { sign: 'negative' }).counts.kept, 1);
  assert.equal(audit(recs, { sign: 'both' }).counts.kept, 2);
});

test('CSV reader handles quotes, semicolons, BOM and picks columns', () => {
  const text = '﻿Date;Payee;Betrag\n2025-01-02;"Müller; GmbH";"1.234,50"\r\n2025-01-03;Acme;99,00\n';
  assert.equal(sniffDelimiter(text.slice(1)), ';');
  const rows = parseCsv(text);
  assert.equal(rows[1][1], 'Müller; GmbH');
  const led = readLedger(text);
  assert.equal(led.amountColumn, 2);
  assert.equal(led.groupColumn, 1);
  assert.deepEqual(led.records.map((r) => r.amount), [1234.5, 99]);
  assert.equal(led.records[0].row, 2);
  assert.match(flaggedToCsv([{ row: 2, amount: 1.5, group: 'A, Inc', score: 1, reasons: ['x'] }]), /"A, Inc"/);
});
