import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, matchArchiveSignature, detectSqlDump, sqlLineKind } from './analyze.mjs';

function raw(path, { ok = true, status = 200, bytes = new Uint8Array(0), error = null, url } = {}) {
  return { path, ok, status, bytes, error, url: url ?? `https://x.example/${path}` };
}

function utf8(text) {
  return new TextEncoder().encode(text);
}

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const GZIP_BYTES = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
const HTML_BYTES = utf8('<html><body>Welcome</body></html>');

const REAL_MYSQLDUMP = [
  '-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)',
  '-- Host: localhost    Database: shopdb',
  'CREATE TABLE `customers` (`id` int, `email` varchar(255), `card_last4` varchar(4));',
  "INSERT INTO `customers` VALUES (1,'alice@example.com','4242'),(2,'bob@example.com','1337');",
].join('\n');

// Structurally dump-shaped but with no explicit dump-tool header comment.
const HEADERLESS_DUMP = [
  'CREATE TABLE `orders` (`id` int, `total` decimal(10,2));',
  "INSERT INTO `orders` VALUES (1,19.99),(2,42.00);",
  'DROP TABLE IF EXISTS `sessions`;',
].join('\n');

test('matchArchiveSignature recognizes a ZIP header', () => {
  const m = matchArchiveSignature(ZIP_BYTES);
  assert.ok(m);
  assert.match(m.name, /ZIP/);
});

test('matchArchiveSignature recognizes a gzip header', () => {
  const m = matchArchiveSignature(GZIP_BYTES);
  assert.ok(m);
  assert.match(m.name, /gzip/);
});

test('matchArchiveSignature returns null for unrelated bytes', () => {
  assert.equal(matchArchiveSignature(HTML_BYTES), null);
});

test('sqlLineKind classifies header, schema, and data lines distinctly', () => {
  assert.equal(sqlLineKind('-- MySQL dump 10.13'), 'header');
  assert.equal(sqlLineKind('CREATE TABLE `x` (`id` int);'), 'schema');
  assert.equal(sqlLineKind("INSERT INTO `x` VALUES (1);"), 'data');
  assert.equal(sqlLineKind('this is just prose'), null);
});

test('detectSqlDump finds the real mysqldump header and never returns row data', () => {
  const result = detectSqlDump(REAL_MYSQLDUMP);
  assert.equal(result.severity, 'critical');
  assert.match(result.headerLine, /MySQL dump/);
  assert.equal(result.dataCount, 1);
  // The INSERT statement's actual values must never appear anywhere in the result.
  assert.doesNotMatch(JSON.stringify(result), /alice@example\.com|4242/);
});

test('detectSqlDump flags a headerless-but-structurally-dump-shaped body as danger', () => {
  const result = detectSqlDump(HEADERLESS_DUMP);
  assert.equal(result.severity, 'danger');
  assert.equal(result.headerLine, null);
  assert.doesNotMatch(JSON.stringify(result), /19\.99|42\.00/);
});

test('detectSqlDump ignores a soft-404 HTML page', () => {
  assert.equal(detectSqlDump('<html><body>Not found</body></html>'), null);
});

test('detectSqlDump ignores prose that mentions CREATE TABLE once in passing', () => {
  const prose = 'This migration guide explains how to run CREATE TABLE statements safely in production.';
  assert.equal(detectSqlDump(prose), null);
});

test('buildReport: a live ZIP archive is a critical finding with only a hex sample as evidence', () => {
  const results = [raw('backup.zip', { bytes: ZIP_BYTES })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 1);
  assert.equal(report.findings[0].kind, 'archive');
  assert.match(report.findings[0].evidence.sampleHex, /^50 4b/);
});

test('buildReport: a real dump header is critical, and row values never appear in the serialized report', () => {
  const results = [raw('backup.sql', { bytes: utf8(REAL_MYSQLDUMP) })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 1);
  assert.doesNotMatch(JSON.stringify(report), /alice@example\.com|4242|bob@example\.com/);
});

test('buildReport: a headerless structural dump is danger, not critical', () => {
  const results = [raw('dump.sql', { bytes: utf8(HEADERLESS_DUMP) })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 0);
  assert.equal(report.dangerCount, 1);
});

test('a clean site (everything 401/403/404) reports ok:true with nothing exposed', () => {
  const results = [
    raw('backup.zip', { ok: false, status: 404, bytes: null }),
    raw('db.sql', { ok: false, status: 403, bytes: null }),
  ];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, true);
  assert.equal(report.exposedCount, 0);
  assert.equal(report.blocked.length, 2);
});

test('a soft-404 catch-all (200 for everything, but HTML) is not-backup, not exposed', () => {
  const results = [raw('backup.zip', { bytes: HTML_BYTES })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, true);
  assert.equal(report.notBackup.length, 1);
});

test('an empty 200 response is not-backup, not exposed', () => {
  const results = [raw('backup.zip', { bytes: new Uint8Array(0) })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, true);
  assert.equal(report.notBackup.length, 1);
});

test('a network error is reported as error, never folded into exposed or blocked', () => {
  const results = [raw('backup.zip', { ok: false, status: null, bytes: null, error: 'network error' })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.errors.length, 1);
  assert.equal(report.incomplete, true);
  assert.equal(report.exposedCount, 0);
});

test('buildReport handles an empty result set without throwing', () => {
  const report = buildReport('https://x.example/', []);
  assert.equal(report.ok, true);
  assert.equal(report.pathsChecked, 0);
});

test('buildReport accepts plain arrays as well as Uint8Array (JSON round-trip safety)', () => {
  const results = [raw('backup.zip', { bytes: Array.from(ZIP_BYTES) })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 1);
});
