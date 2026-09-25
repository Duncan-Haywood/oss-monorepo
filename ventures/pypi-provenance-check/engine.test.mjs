import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePackageName, parseDependencySpecifier, parseInput,
  metadataUrl, provenanceUrl, pickDistributionFile,
  rowFromMetadata, rowFromProvenance, lookupPackage,
  summarizeReport, mapWithConcurrency,
} from './engine.mjs';

test('normalizePackageName: PEP 503 -- lowercase, runs of -_. collapse to one dash', () => {
  assert.equal(normalizePackageName('Django'), 'django');
  assert.equal(normalizePackageName('typing_extensions'), 'typing-extensions');
  assert.equal(normalizePackageName('zope.interface'), 'zope-interface');
  assert.equal(normalizePackageName('foo--bar'), 'foo-bar');
});

test('parseDependencySpecifier: bare name is unpinned', () => {
  assert.deepEqual(parseDependencySpecifier('requests'), { name: 'requests', version: null });
});

test('parseDependencySpecifier: exact == pin', () => {
  assert.deepEqual(parseDependencySpecifier('requests==2.31.0'), { name: 'requests', version: '2.31.0' });
});

test('parseDependencySpecifier: extras are dropped, pin still recognised', () => {
  assert.deepEqual(parseDependencySpecifier('requests[security]==2.31.0'), { name: 'requests', version: '2.31.0' });
});

test('parseDependencySpecifier: a range or compound specifier is unpinned, not the range string', () => {
  assert.deepEqual(parseDependencySpecifier('Django>=4.2,<5.0'), { name: 'Django', version: null });
  assert.deepEqual(parseDependencySpecifier('click~=8.1'), { name: 'click', version: null });
});

test('parseDependencySpecifier: environment marker is dropped', () => {
  assert.deepEqual(parseDependencySpecifier("click==8.1.7; python_version<'3.11'"), { name: 'click', version: '8.1.7' });
});

test('parseDependencySpecifier: no name-like token returns null', () => {
  assert.equal(parseDependencySpecifier('   '), null);
});

test('parseInput: requirements.txt -- pins, ranges, comments, options and VCS refs', () => {
  const text = `
    # top-level deps
    requests==2.31.0
    Django>=4.2,<5.0
    -r other.txt
    -e .
    click  # inline comment
    git+https://github.com/example/pkg.git#egg=pkg
    https://example.com/pkg.whl
  `;
  const entries = parseInput(text).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(entries, [
    { name: 'click', version: null },
    { name: 'Django', version: null },
    { name: 'requests', version: '2.31.0' },
  ]);
});

test('parseInput: a pinned mention wins over an unpinned mention of the same name', () => {
  const entries = parseInput('requests\nrequests==2.31.0\nrequests');
  assert.deepEqual(entries, [{ name: 'requests', version: '2.31.0' }]);
});

test('parseInput: pyproject.toml PEP 621 [project] dependencies array', () => {
  const toml = `
[build-system]
requires = ["setuptools"]

[project]
name = "my-app"
dependencies = [
  "requests>=2.31.0",
  "click==8.1.7",
  "pkg[extra]==1.2.3; python_version<'3.12'",
]

[tool.other]
ignored = ["not-a-dep==9.9.9"]
`;
  const entries = parseInput(toml).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(entries, [
    { name: 'click', version: '8.1.7' },
    { name: 'pkg', version: '1.2.3' },
    { name: 'requests', version: null },
  ]);
});

test('parseInput: pyproject.toml extras bracket inside a string does not truncate the array scan', () => {
  const toml = `[project]
dependencies = ["requests[security]>=2.31.0", "click==8.1.7"]`;
  const entries = parseInput(toml).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(entries, [
    { name: 'click', version: '8.1.7' },
    { name: 'requests', version: null },
  ]);
});

test('parseInput: empty input yields an empty list, not an error', () => {
  assert.deepEqual(parseInput(''), []);
  assert.deepEqual(parseInput('   \n  '), []);
});

test('parseInput: no recognisable package name throws', () => {
  assert.throws(() => parseInput('-r requirements-dev.txt\n-e .'), /couldn't find a package name/i);
});

test('metadataUrl: pinned vs. latest, name normalised', () => {
  assert.equal(metadataUrl('Django', '5.0'), 'https://pypi.org/pypi/django/5.0/json');
  assert.equal(metadataUrl('requests', null), 'https://pypi.org/pypi/requests/json');
});

test('provenanceUrl builds the integrity API URL', () => {
  assert.equal(
    provenanceUrl('pip', '26.2.1', 'pip-26.2.1-py3-none-any.whl'),
    'https://pypi.org/integrity/pip/26.2.1/pip-26.2.1-py3-none-any.whl/provenance',
  );
});

test('pickDistributionFile prefers the wheel over the sdist', () => {
  const files = [
    { filename: 'pip-1.0.tar.gz', packagetype: 'sdist' },
    { filename: 'pip-1.0-py3-none-any.whl', packagetype: 'bdist_wheel' },
  ];
  assert.deepEqual(pickDistributionFile(files), { filename: 'pip-1.0-py3-none-any.whl', packagetype: 'bdist_wheel' });
});

test('pickDistributionFile falls back to the first file when there is no wheel', () => {
  const files = [{ filename: 'pip-1.0.tar.gz', packagetype: 'sdist' }];
  assert.deepEqual(pickDistributionFile(files), { filename: 'pip-1.0.tar.gz', packagetype: 'sdist' });
});

test('pickDistributionFile returns null for an empty or missing file list', () => {
  assert.equal(pickDistributionFile([]), null);
  assert.equal(pickDistributionFile(undefined), null);
});

test('rowFromMetadata: 404 is not-found, not a generic error', () => {
  const result = rowFromMetadata({ name: 'left-pad-but-typo-xyz', version: '1.0.0' }, { httpStatus: 404, body: null });
  assert.equal(result.done, true);
  assert.equal(result.row.status, 'not-found');
  assert.match(result.row.detail, /not found/i);
});

test('rowFromMetadata: no files at all is a terminal error row', () => {
  const result = rowFromMetadata({ name: 'pkg', version: '1.0.0' }, { httpStatus: 200, body: { info: { version: '1.0.0' }, urls: [] } });
  assert.equal(result.done, true);
  assert.equal(result.row.status, 'error');
  assert.match(result.row.detail, /no published distribution/i);
});

test('rowFromMetadata: resolves latest version and picks a file, does not finish yet', () => {
  const body = { info: { version: '2.31.0' }, urls: [{ filename: 'requests-2.31.0-py3-none-any.whl', packagetype: 'bdist_wheel' }] };
  const result = rowFromMetadata({ name: 'requests', version: null }, { httpStatus: 200, body });
  assert.equal(result.done, false);
  assert.deepEqual(result.pending, { name: 'requests', requestedVersion: null, resolvedVersion: '2.31.0', filename: 'requests-2.31.0-py3-none-any.whl' });
});

test('rowFromMetadata: a thrown fetch error is reported as an error row, not a crash', () => {
  const result = rowFromMetadata({ name: 'requests', version: null }, { error: new Error('network down') });
  assert.equal(result.row.status, 'error');
  assert.match(result.row.detail, /network down/);
});

const PENDING = { name: 'pip', requestedVersion: '26.2.1', resolvedVersion: '26.2.1', filename: 'pip-26.2.1-py3-none-any.whl' };

test('rowFromProvenance: attestation present, publisher surfaced in the detail', () => {
  const row = rowFromProvenance(PENDING, {
    httpStatus: 200,
    body: { attestation_bundles: [{ publisher: { kind: 'GitHub', repository: 'pypa/pip', workflow: 'release.yml' } }] },
  });
  assert.equal(row.status, 'ok');
  assert.equal(row.hasProvenance, true);
  assert.match(row.detail, /pypa\/pip/);
  assert.match(row.detail, /release\.yml/);
});

test('rowFromProvenance: 404 means no provenance, and is not an error', () => {
  const row = rowFromProvenance(PENDING, { httpStatus: 404, body: { message: 'No provenance available' } });
  assert.equal(row.status, 'ok');
  assert.equal(row.hasProvenance, false);
});

test('rowFromProvenance: empty attestation_bundles means no provenance', () => {
  const row = rowFromProvenance(PENDING, { httpStatus: 200, body: { attestation_bundles: [] } });
  assert.equal(row.hasProvenance, false);
});

test('rowFromProvenance: an unexpected status is an error row, not silently "no provenance"', () => {
  const row = rowFromProvenance(PENDING, { httpStatus: 500, body: null });
  assert.equal(row.status, 'error');
  assert.equal(row.hasProvenance, null);
});

test('rowFromProvenance: a thrown fetch error is an error row', () => {
  const row = rowFromProvenance(PENDING, { error: new Error('boom') });
  assert.equal(row.status, 'error');
  assert.match(row.detail, /boom/);
});

function fakeFetch(routes) {
  return async (url) => {
    for (const [pattern, respond] of routes) {
      if (pattern.test(url)) return respond(url);
    }
    throw new Error(`unhandled URL in fake fetch: ${url}`);
  };
}

test('lookupPackage: full round trip, provenance present', async () => {
  const fetchImpl = fakeFetch([
    [/\/pypi\/pip\/json$/, async () => ({
      ok: true, status: 200,
      json: async () => ({ info: { version: '26.2.1' }, urls: [{ filename: 'pip-26.2.1-py3-none-any.whl', packagetype: 'bdist_wheel' }] }),
    })],
    [/\/integrity\//, async () => ({
      status: 200,
      json: async () => ({ attestation_bundles: [{ publisher: { kind: 'GitHub', repository: 'pypa/pip' } }] }),
    })],
  ]);
  const row = await lookupPackage({ name: 'pip', version: null }, { fetchImpl });
  assert.equal(row.status, 'ok');
  assert.equal(row.hasProvenance, true);
  assert.equal(row.resolvedVersion, '26.2.1');
});

test('lookupPackage: package not found short-circuits before the provenance call', async () => {
  const fetchImpl = fakeFetch([
    [/\/pypi\//, async () => ({ ok: false, status: 404, json: async () => { throw new Error('no body'); } })],
  ]);
  const row = await lookupPackage({ name: 'left-pad-but-typo-xyz', version: '1.0.0' }, { fetchImpl });
  assert.equal(row.status, 'not-found');
});

test('lookupPackage: no provenance on the resolved file', async () => {
  const fetchImpl = fakeFetch([
    [/\/pypi\/six\/json$/, async () => ({
      ok: true, status: 200,
      json: async () => ({ info: { version: '1.17.0' }, urls: [{ filename: 'six-1.17.0-py2.py3-none-any.whl', packagetype: 'bdist_wheel' }] }),
    })],
    [/\/integrity\//, async () => ({ status: 404, json: async () => ({ message: 'No provenance available' }) })],
  ]);
  const row = await lookupPackage({ name: 'six', version: null }, { fetchImpl });
  assert.equal(row.status, 'ok');
  assert.equal(row.hasProvenance, false);
});

test('summarizeReport counts each status bucket exactly once per row', () => {
  const rows = [
    rowFromProvenance({ ...PENDING, name: 'a' }, { httpStatus: 200, body: { attestation_bundles: [{}] } }),
    rowFromProvenance({ ...PENDING, name: 'b' }, { httpStatus: 404, body: {} }),
    rowFromMetadata({ name: 'c', version: '1' }, { httpStatus: 404, body: null }).row,
    rowFromProvenance({ ...PENDING, name: 'd' }, { error: new Error('boom') }),
  ];
  assert.deepEqual(summarizeReport(rows), { total: 4, withProvenance: 1, withoutProvenance: 1, notFound: 1, errors: 1 });
});

test('mapWithConcurrency runs every item exactly once, preserves order, respects the cap', async () => {
  const seenConcurrent = { current: 0, max: 0 };
  const items = Array.from({ length: 12 }, (_, i) => i);
  const results = await mapWithConcurrency(items, 3, async (i) => {
    seenConcurrent.current += 1;
    seenConcurrent.max = Math.max(seenConcurrent.max, seenConcurrent.current);
    await new Promise((r) => setTimeout(r, 1));
    seenConcurrent.current -= 1;
    return i * 2;
  });
  assert.deepEqual(results, items.map((i) => i * 2));
  assert.ok(seenConcurrent.max <= 3, `expected at most 3 concurrent, saw ${seenConcurrent.max}`);
});
