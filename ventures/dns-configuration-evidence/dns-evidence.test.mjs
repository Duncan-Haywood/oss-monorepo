import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESOLVERS, UNCERTAIN, buildReport, captureSnapshot, markdownReport, nameInAuthorizedDomain,
  normalizeAnswer, observationValue, queryResolver, utcNow, validateSnapshot,
} from './dns-evidence.mjs';

const CF = RESOLVERS[0];

const observation = (over = {}) => ({
  name: 'example.test', type: 'A', resolver: 'cloudflare',
  observed_at: '2026-09-04T10:00:00Z', answers: ['192.0.2.1'], ...over,
});

const snapshot = (observations, over = {}) => ({
  authorized: true, domain: 'example.test', captured_at: '2026-09-04T10:00:00Z', observations, ...over,
});

// --- The safety property the whole product rests on -------------------------
// A record we failed to observe must never be reported as one that did not
// change. Every uncertain status is checked, not just the common one, because
// a snapshot can arrive from the Python CLI carrying any of them.

test('an uncertain status on either side is inconclusive, never unchanged', () => {
  for (const status of UNCERTAIN) {
    const before = snapshot([observation()]);
    const after = snapshot([observation({ status, answers: undefined })]);
    const [finding] = buildReport(before, after).findings;
    assert.equal(finding.status, 'inconclusive', `${status} must not read as unchanged`);
    assert.equal(finding.after_answers, null);

    const reversed = buildReport(after, before).findings[0];
    assert.equal(reversed.status, 'inconclusive', `${status} must not read as unchanged when it is the "before"`);
  }
});

test('an observation present on only one side is inconclusive, not dropped', () => {
  const before = snapshot([observation(), observation({ type: 'TXT', answers: ['v=spf1 -all'] })]);
  const after = snapshot([observation()]);
  const report = buildReport(before, after);
  assert.equal(report.findings.length, 2, 'the union of both sides is reported');
  const txt = report.findings.find((f) => f.type === 'TXT');
  assert.equal(txt.status, 'inconclusive');
  assert.equal(txt.after_status, 'missing');
});

test('two answers do not compare equal to one answer containing a separator', () => {
  // `buildReport` compares answer sets by joining them. DNS text contains
  // spaces (any TXT record) and colons (any SPF record), so joining on one of
  // those would make ['a b'] and ['a', 'b'] identical and report a real change
  // as `unchanged`. This pins the separator choice, not the implementation.
  const before = snapshot([observation({ type: 'TXT', answers: ['a b'] })]);
  const after = snapshot([observation({ type: 'TXT', answers: ['a', 'b'] })]);
  assert.equal(buildReport(before, after).findings[0].status, 'changed');
});

test('the source carries no raw NUL byte, which would make git treat it as binary', async () => {
  // The separator is a real NUL at runtime and must stay one; writing it as a
  // literal byte instead of an escape turned the whole module binary to git,
  // costing the diff and line comments on review. Caught by CI, pinned here.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const source = fs.readFileSync(
    path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'dns-evidence.mjs'));
  assert.equal(source.includes(0x00), false, 'write NUL as the \\u0000 escape, not a literal byte');
});

test('identical answers in a different order are unchanged', () => {
  const before = snapshot([observation({ answers: ['192.0.2.1', '192.0.2.2'] })]);
  const after = snapshot([observation({ answers: ['192.0.2.2', '192.0.2.1'] })]);
  assert.equal(buildReport(before, after).findings[0].status, 'unchanged');
});

test('a real difference is changed, and both sides are carried into the finding', () => {
  const before = snapshot([observation({ answers: ['192.0.2.1'] })]);
  const after = snapshot([observation({ answers: ['198.51.100.7'] })]);
  const [finding] = buildReport(before, after).findings;
  assert.equal(finding.status, 'changed');
  assert.deepEqual(finding.before_answers, ['192.0.2.1']);
  assert.deepEqual(finding.after_answers, ['198.51.100.7']);
});

test('an observed absence of records is a real finding, not an uncertain one', () => {
  // NXDOMAIN and "no records of this type" are evidence. A tool that treated
  // them as uncertain could never show a record being *removed* -- which is
  // half of what a migration review is looking for.
  const before = snapshot([observation({ answers: ['192.0.2.1'] })]);
  const after = snapshot([observation({ answers: [] })]);
  const [finding] = buildReport(before, after).findings;
  assert.equal(finding.status, 'changed');
  assert.deepEqual(finding.after_answers, []);
  assert.equal(observationValue(observation({ answers: [] })).length, 0);
});

test('counts cover every finding and the same domain is required', () => {
  const before = snapshot([observation(), observation({ resolver: 'google' })]);
  const after = snapshot([observation({ answers: ['198.51.100.7'] }), observation({ resolver: 'google' })]);
  const report = buildReport(before, after);
  assert.deepEqual(report.finding_counts, { changed: 1, unchanged: 1 });
  assert.equal(report.limitations.length, 3);
  assert.throws(() => buildReport(before, snapshot([observation()], { domain: 'other.test' })), /same domain/);
});

// --- Snapshot validation ----------------------------------------------------

test('validateSnapshot accepts a well-formed snapshot and rejects each defect', () => {
  assert.doesNotThrow(() => validateSnapshot(snapshot([observation()])));
  assert.throws(() => validateSnapshot(snapshot([observation()], { authorized: false })), /authorized/);
  assert.throws(() => validateSnapshot(snapshot([observation()], { domain: '' })), /domain/);
  assert.throws(() => validateSnapshot({ authorized: true, domain: 'x.test' }), /observations list/);
  assert.throws(() => validateSnapshot(snapshot([observation({ resolver: '' })])), /missing required fields/);
  assert.throws(() => validateSnapshot(snapshot([observation({ observed_at: 'not-a-date' })])), /ISO 8601/);
  assert.throws(() => validateSnapshot(snapshot([observation({ answers: undefined })])), /require answers/);
  assert.throws(() => validateSnapshot(snapshot([observation({ answers: '192.0.2.1' })])), /must be a list/);
  assert.throws(() => validateSnapshot(snapshot([observation(), observation()])), /duplicate/);
  assert.throws(() => validateSnapshot(snapshot([observation()], { captured_at: 'nope' })), /captured_at/);
});

test('an uncertain observation is valid without answers', () => {
  assert.doesNotThrow(() => validateSnapshot(snapshot([observation({ status: 'timeout', answers: undefined })])));
});

// --- Authorization scope ----------------------------------------------------

test('authorization is scoped to the declared domain', () => {
  assert.ok(nameInAuthorizedDomain('example.test', 'example.test'));
  assert.ok(nameInAuthorizedDomain('mail.example.test', 'example.test'));
  assert.ok(nameInAuthorizedDomain('Mail.Example.Test.', 'example.test'), 'case and root dot are not significant');
  assert.ok(!nameInAuthorizedDomain('example.test.evil.test', 'example.test'), 'suffix must be a label boundary');
  assert.ok(!nameInAuthorizedDomain('notexample.test', 'example.test'));
  assert.ok(!nameInAuthorizedDomain('', 'example.test'));
});

test('captureSnapshot refuses a query outside the authorized domain', async () => {
  const plan = {
    authorized: true, domain: 'example.test',
    queries: [{ name: 'elsewhere.test', type: 'A' }], resolvers: [CF],
  };
  await assert.rejects(() => captureSnapshot(plan, { querier: async () => observation() }), /outside the authorized domain/);
});

test('captureSnapshot refuses without the authorization confirmation', async () => {
  const plan = { authorized: false, domain: 'example.test', queries: [], resolvers: [] };
  await assert.rejects(() => captureSnapshot(plan), /authorization confirmation/);
});

test('captureSnapshot reports progress and produces a valid snapshot', async () => {
  const plan = {
    authorized: true, domain: 'example.test',
    queries: [{ name: 'example.test', type: 'A' }, { name: 'mail.example.test', type: 'MX' }],
    resolvers: [RESOLVERS[0], RESOLVERS[1]],
  };
  const seen = [];
  const result = await captureSnapshot(plan, {
    querier: async (name, type, resolver) => observation({ name, type, resolver: resolver.id }),
    onProgress: (done, total) => seen.push([done, total]),
  });
  assert.deepEqual(seen, [[1, 4], [2, 4], [3, 4], [4, 4]]);
  assert.equal(result.observations.length, 4);
  assert.doesNotThrow(() => validateSnapshot(result), 'a fresh capture is always comparable');
});

// --- Answer normalisation ---------------------------------------------------

test('normalizeAnswer removes the cosmetic differences between resolvers', () => {
  assert.equal(normalizeAnswer('CNAME', 'Target.Example.Test.'), 'target.example.test');
  assert.equal(normalizeAnswer('MX', '10 Mail.Example.Test.'), '10 mail.example.test');
  assert.equal(normalizeAnswer('TXT', '"v=spf1 include:_spf.example.test -all"'), 'v=spf1 include:_spf.example.test -all');
  assert.equal(normalizeAnswer('TXT', '"part-one" "part-two"'), 'part-onepart-two', 'split TXT chunks concatenate');
  assert.equal(normalizeAnswer('A', ' 192.0.2.1 '), '192.0.2.1');
  assert.equal(normalizeAnswer('A', undefined), '');
});

test('a trailing-dot difference alone does not read as a change', () => {
  const before = snapshot([observation({ type: 'CNAME', answers: [normalizeAnswer('CNAME', 'a.example.test.')] })]);
  const after = snapshot([observation({ type: 'CNAME', answers: [normalizeAnswer('CNAME', 'a.example.test')] })]);
  assert.equal(buildReport(before, after).findings[0].status, 'unchanged');
});

// --- DoH transport ----------------------------------------------------------

const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('a NOERROR answer keeps only the requested type', async () => {
  // Asking for A on a CNAME'd name returns the CNAME too. Recording it as an
  // A record would misreport the zone.
  const fetchImpl = async () => jsonResponse({
    Status: 0,
    Answer: [
      { name: 'www.example.test', type: 5, data: 'target.example.test.' },
      { name: 'target.example.test', type: 1, data: '192.0.2.1' },
    ],
  });
  const result = await queryResolver('www.example.test', 'A', CF, { fetchImpl });
  assert.deepEqual(result.answers, ['192.0.2.1']);
  assert.equal(result.status, undefined, 'a successful observation carries no uncertain status');
});

test('NXDOMAIN records an observed absence rather than a failure', async () => {
  const fetchImpl = async () => jsonResponse({ Status: 3 });
  const result = await queryResolver('gone.example.test', 'A', CF, { fetchImpl });
  assert.deepEqual(result.answers, []);
  assert.ok(!UNCERTAIN.has(result.status));
});

test('each transport failure maps to the status that describes it', async () => {
  const cases = [
    [async () => jsonResponse({ Status: 5 }), 'refused'],
    [async () => jsonResponse({ Status: 2 }), 'error'],
    [async () => jsonResponse({}, false, 429), 'refused'],
    [async () => jsonResponse({}, false, 503), 'error'],
    [async () => { throw new Error('network down'); }, 'error'],
    [async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }, 'timeout'],
  ];
  for (const [fetchImpl, expected] of cases) {
    const result = await queryResolver('example.test', 'A', CF, { fetchImpl });
    assert.equal(result.status, expected);
    assert.ok(UNCERTAIN.has(result.status), 'every failure is comparable as inconclusive');
    assert.ok(!('answers' in result), 'a failure must not carry an empty answer set');
  }
});

test('a failed observation still validates and still compares', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const result = await queryResolver('example.test', 'A', CF, { fetchImpl });
  assert.doesNotThrow(() => validateSnapshot(snapshot([result])));
});

test('the query is sent to the resolver endpoint with the DoH JSON accept header', async () => {
  let seenUrl; let seenInit;
  await queryResolver('mail.example.test', 'mx', CF, {
    fetchImpl: async (url, init) => { seenUrl = url; seenInit = init; return jsonResponse({ Status: 0, Answer: [] }); },
  });
  assert.ok(seenUrl.startsWith(CF.endpoint));
  assert.match(seenUrl, /name=mail\.example\.test/);
  assert.match(seenUrl, /type=mx/);
  assert.equal(seenInit.headers.accept, 'application/dns-json');
});

test('the observation records the resolver id and normalises the question', async () => {
  const result = await queryResolver('WWW.Example.Test', 'a', CF, {
    fetchImpl: async () => jsonResponse({ Status: 0, Answer: [] }),
  });
  assert.equal(result.resolver, 'cloudflare');
  assert.equal(result.name, 'www.example.test');
  assert.equal(result.type, 'A');
});

// --- Report rendering -------------------------------------------------------

test('markdownReport states the counts and cannot be broken out of its table', () => {
  const before = snapshot([observation({ type: 'TXT', answers: ['a|b'] })]);
  const after = snapshot([observation({ type: 'TXT', status: 'timeout', answers: undefined })]);
  const markdown = markdownReport(buildReport(before, after));
  assert.match(markdown, /# DNS evidence: `example\.test`/);
  assert.match(markdown, /\*\*inconclusive:\*\* 1/);
  assert.match(markdown, /timeout \(not observed\)/);
  assert.ok(markdown.includes('&#124;'), 'a pipe in DNS text is escaped, not left to split the row');
  assert.ok(!/\|\s*a\|b\s*\|/.test(markdown));
  for (const limit of buildReport(before, after).limitations) assert.ok(markdown.includes(limit));
});

test('utcNow is the ISO-8601 shape the Python capture writes', () => {
  assert.equal(utcNow(new Date('2026-09-04T10:11:12.345Z')), '2026-09-04T10:11:12Z');
});

// --- Parity with the canonical Python implementation ------------------------

test('the Markdown matches `python3 -m dns_evidence compare` byte for byte', async () => {
  // The product's claim is that a snapshot captured in the browser is the same
  // evidence artefact as one captured by the CLI. That is only true while both
  // renderers agree, and the two are separate codebases that drift silently --
  // the limitations strings had already diverged once when this was written.
  // Skips rather than fails where python3 is unavailable, so the suite stays
  // runnable in a bare Node environment.
  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const url = await import('node:url');

  const here = path.dirname(url.fileURLToPath(import.meta.url));
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
  } catch {
    return; // no interpreter here; the parity claim is checked wherever there is one
  }

  const before = snapshot([
    observation({ answers: ['192.0.2.1'] }),
    observation({ type: 'TXT', answers: ['v=spf1 -all'] }),
    observation({ name: 'mail.example.test', type: 'MX', resolver: 'google', status: 'timeout', answers: undefined }),
  ]);
  const after = snapshot([
    observation({ answers: ['198.51.100.7'] }),
    observation({ type: 'TXT', answers: ['v=spf1 -all'] }),
    observation({ name: 'mail.example.test', type: 'MX', resolver: 'google', answers: ['10 mail.example.test'] }),
  ], { captured_at: '2026-09-04T11:00:00Z' });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-evidence-parity-'));
  try {
    const beforePath = path.join(dir, 'before.json');
    const afterPath = path.join(dir, 'after.json');
    fs.writeFileSync(beforePath, JSON.stringify(before));
    fs.writeFileSync(afterPath, JSON.stringify(after));
    const python = execFileSync('python3', [
      '-m', 'dns_evidence', 'compare', '--before', beforePath, '--after', afterPath, '--format', 'markdown',
    ], { env: { ...process.env, PYTHONPATH: path.join(here, 'src') }, encoding: 'utf8' });
    assert.equal(markdownReport(buildReport(before, after)), python);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
