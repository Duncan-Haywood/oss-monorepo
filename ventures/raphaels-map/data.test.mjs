import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLoader, isMissing, loadCore, statesWithCounties, milesBetween, metricIndex } from './data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'tests', 'fixtures', 'data');

/** A fetch that serves the fixtures directory, 404 for anything else. */
function fixtureFetch(root = FIX, { base = 'data/' } = {}) {
  return async (url) => {
    const rel = String(url).slice(base.length);
    try {
      const body = readFileSync(path.join(root, rel), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => { throw new Error('no body'); } };
    }
  };
}

test('missing file resolves to {missing: true} and never throws', async () => {
  const d = createLoader({ fetchImpl: fixtureFetch() });
  const r = await d.get('not/there.json');
  assert.equal(r.missing, true);
  assert.equal(r.status, 404);
  assert.equal(isMissing(r), true);
});

test('network errors and bad JSON are missing, not exceptions', async () => {
  const boom = createLoader({ fetchImpl: async () => { throw new Error('offline'); } });
  const r1 = await boom.get('sources.json');
  assert.equal(r1.missing, true);
  assert.match(r1.reason, /offline/);
  const bad = createLoader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) });
  assert.equal((await bad.get('sources.json')).missing, true);
  const nullRes = createLoader({ fetchImpl: async () => null });
  assert.equal((await nullRes.get('x.json')).missing, true);
  const scalar = createLoader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => 42 }) });
  assert.equal((await scalar.get('x.json')).missing, true);
});

test('results are cached per path and synthetic files are reported', async () => {
  let calls = 0;
  const base = fixtureFetch();
  const d = createLoader({ fetchImpl: async (u) => { calls++; return base(u); } });
  const a = await d.get('sources.json');
  const b = await d.get('sources.json');
  assert.equal(a, b);
  assert.equal(calls, 1);
  assert.deepEqual(d.syntheticPaths(), ['sources.json']);
});

test('loadCore loads the four core files; helpers tolerate missing files', async () => {
  const d = createLoader({ fetchImpl: fixtureFetch() });
  const core = await loadCore(d);
  assert.ok(!isMissing(core.metrics) && !isMissing(core.geos) && !isMissing(core.county) && !isMissing(core.sources));
  assert.deepEqual(statesWithCounties(core.geos).map((s) => s.id), ['08', '56']);
  assert.deepEqual(statesWithCounties({ missing: true }), []);
  assert.equal(metricIndex({ missing: true }).size, 0);
  const empty = await loadCore(createLoader({ fetchImpl: fixtureFetch('/nonexistent') }));
  assert.ok(Object.values(empty).every(isMissing));
});

test('milesBetween: zero for the same point, null for missing coordinates', () => {
  assert.equal(milesBetween({ lat: 40, lon: -105 }, { lat: 40, lon: -105 }), 0);
  const oneDeg = milesBetween({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  assert.ok(oneDeg > 68 && oneDeg < 70);
  assert.equal(milesBetween({ lat: 40 }, { lat: 41, lon: 1 }), null);
});

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('every fixture says synthetic: true, and FIPS ids are zero-padded strings', () => {
  const files = walk(FIX).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 10);
  for (const f of files) assert.equal(JSON.parse(readFileSync(f, 'utf8')).synthetic, true, f);
  const geos = JSON.parse(readFileSync(path.join(FIX, 'us/geographies.json'), 'utf8'));
  for (const c of geos.counties) {
    assert.equal(typeof c.id, 'string');
    assert.match(c.id, /^\d{5}$/);
    assert.equal(c.id, c.state + c.county);
  }
});

test('the shipped page never references the fixtures', () => {
  const shipped = readdirSync(HERE).filter((n) => /\.(mjs|html|css)$/.test(n) && !/\.test\.mjs$/.test(n));
  for (const n of shipped) {
    const text = readFileSync(path.join(HERE, n), 'utf8');
    assert.ok(!/test\/fixtures|fixtures=/.test(text), `${n} mentions the fixtures`);
  }
});
