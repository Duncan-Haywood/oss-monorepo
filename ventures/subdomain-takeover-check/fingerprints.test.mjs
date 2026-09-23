import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, matchProvider } from './fingerprints.mjs';

test('every provider has a complete, correctly-shaped entry', () => {
  for (const p of PROVIDERS) {
    assert.equal(typeof p.id, 'string', `${p.name}: id must be a string`);
    assert.ok(p.id.length > 0);
    assert.equal(typeof p.name, 'string');
    assert.ok(p.name.length > 0);
    assert.ok(p.cnamePattern instanceof RegExp, `${p.id}: cnamePattern must be a RegExp`);
    assert.ok(p.fingerprint instanceof RegExp, `${p.id}: fingerprint must be a RegExp`);
    assert.ok(['boolean', 'object'].includes(typeof p.vulnerable), `${p.id}: vulnerable must be boolean or null`);
    assert.equal(typeof p.docsUrl, 'string');
    assert.match(p.docsUrl, /^https:\/\//);
  }
});

test('no two providers share an id', () => {
  const ids = PROVIDERS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('no provider pattern is broad enough to match an unrelated random host', () => {
  // Catches an accidentally too-broad pattern (e.g. a bare `.com$`), which
  // would make every hostname on that TLD misreport as a provider match.
  for (const p of PROVIDERS) {
    assert.equal(p.cnamePattern.test('totally-unrelated-host.example.com'), false, `${p.id}'s pattern is too broad`);
  }
});

test('matchProvider finds S3 for a real S3 static-website hostname shape', () => {
  const provider = matchProvider('some-bucket.s3-website-us-east-1.amazonaws.com');
  assert.ok(provider);
  assert.equal(provider.id, 'aws-s3');
});

test('matchProvider finds S3 for the plain (non-website) REST endpoint too', () => {
  const provider = matchProvider('some-bucket.s3.amazonaws.com');
  assert.ok(provider);
  assert.equal(provider.id, 'aws-s3');
});

test('matchProvider finds Heroku', () => {
  assert.equal(matchProvider('old-app.herokuapp.com').id, 'heroku');
});

test('matchProvider finds GitHub Pages', () => {
  assert.equal(matchProvider('someuser.github.io').id, 'github-pages');
});

test('matchProvider is case-insensitive and strips a trailing root dot', () => {
  assert.equal(matchProvider('OLD-APP.HEROKUAPP.COM.').id, 'heroku');
});

test('matchProvider returns null for an unrecognised target', () => {
  assert.equal(matchProvider('mail.example.com'), null);
});

test('matchProvider returns null for empty/nullish input', () => {
  assert.equal(matchProvider(''), null);
  assert.equal(matchProvider(null), null);
  assert.equal(matchProvider(undefined), null);
});

test('cnamePattern anchors on the target ending, not a substring anywhere', () => {
  // A hostname that merely *contains* "herokuapp.com" earlier in the label
  // (attacker-controlled subdomain trickery) must not match.
  assert.equal(matchProvider('herokuapp.com.evil.example'), null);
});
