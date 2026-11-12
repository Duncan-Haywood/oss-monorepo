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

// Red-team gaps 2026-11-12: the `vulnerable` read is the context a finding
// shows a human, and nothing pinned it, so a flipped flag passed every test.
// Change a provider's read here and in fingerprints.mjs in the same commit,
// with its `note` saying why.
test('each provider keeps its recorded vulnerable read', () => {
  const expected = {
    'aws-s3': true, heroku: true, 'github-pages': true, 'azure-websites': true, 'azure-blob': true,
    'azure-trafficmanager': true, fastly: null, shopify: false, unbounce: true, tumblr: true,
    'wordpress-com': true, zendesk: true, statuspage: true, surge: true, helpjuice: true,
    'helpscout-docs': true, cargocollective: true, uservoice: true, ghost: null, webflow: null,
    netlify: false, vercel: false, pantheon: true, bitbucket: true,
  };
  assert.deepEqual(Object.fromEntries(PROVIDERS.map((p) => [p.id, p.vulnerable])), expected);
});

test('a provider read as anything but claimable says why in its note', () => {
  for (const p of PROVIDERS.filter((x) => x.vulnerable !== true)) {
    assert.ok(typeof p.note === 'string' && p.note.length > 20, `${p.id}: vulnerable ${p.vulnerable} needs a note`);
  }
});

test('matchProvider finds S3 website endpoints in regions with any digit', () => {
  for (const host of ['b.s3-website-us-west-2.amazonaws.com', 'b.s3-website.eu-central-1.amazonaws.com',
    'b.s3-website-ap-southeast-3.amazonaws.com', 'b.s3-website-ca-west-9.amazonaws.com']) {
    assert.equal(matchProvider(host)?.id, 'aws-s3', host);
  }
});
