import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildResidentialTakeoffApp, localImports, rewritePage } from './residential-takeoff-app.mjs';
import { RESIDENTIAL_TAKEOFF_DIR, SITE_OWN_DIRS } from './check.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'residential-takeoff-'));

test('copies the app, its imported modules and the wasm, and leaves tests and calculator copies out', async () => {
  const out = tmp();
  try {
    const written = await buildResidentialTakeoffApp(out);
    for (const f of ['index.html', 'branded-bid-package-for-framers.html', 'sample-bid-package.html', 'engine.mjs', 'materiallist.mjs', 'roofplan.mjs', 'hipframe.mjs', 'checkout.mjs', 'ifc-engine.wasm', 'LICENSE.txt', 'llms.txt', 'sitemap.xml']) {
      assert.ok(written.includes(`residential-takeoff/${f}`), f);
      assert.ok(existsSync(path.join(out, 'residential-takeoff', f)), f);
    }
    assert.ok(!written.some((f) => /\.test\.mjs$|bench|cli\.mjs|fixtures|eval-/.test(f)), 'no tests, benches, CLI or fixtures');
    assert.ok(!written.includes('residential-takeoff/roof-calculator.html'), 'calculator copies stay on the free edition');
    const home = readFileSync(path.join(out, 'residential-takeoff/index.html'), 'utf8');
    assert.match(home, /<link rel="canonical" href="https:\/\/marisstella\.app\/residential-takeoff\/">/);
    assert.match(home, /href="\.\.\/wall-framing-takeoff\/roof-calculator\.html"/);
    assert.match(home, /href="branded-bid-package-for-framers\.html"/);
    assert.match(home, /href="LICENSE\.txt"/);
    assert.match(home, /no warranty/i);
    assert.match(home, /paid edition/i);
    // Every module the page imports was copied (a missing one would break the page).
    for (const rel of localImports(home)) assert.ok(existsSync(path.join(out, 'residential-takeoff', rel)), rel);
    const sitemap = readFileSync(path.join(out, 'residential-takeoff/sitemap.xml'), 'utf8');
    assert.match(sitemap, /<loc>https:\/\/marisstella\.app\/residential-takeoff\/<\/loc>/);
    assert.doesNotMatch(sitemap, /sample-bid-package/);
    assert.match(readFileSync(path.join(out, 'residential-takeoff/llms.txt'), 'utf8'), /Checkout is not open/);
    await assert.rejects(buildResidentialTakeoffApp(out), /already written/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('canonical and llms.txt follow the build origin', async () => {
  const out = tmp();
  try {
    await buildResidentialTakeoffApp(out, { baseUrl: 'https://example.test/' });
    for (const f of ['index.html', 'sitemap.xml', 'llms.txt']) {
      assert.doesNotMatch(readFileSync(path.join(out, 'residential-takeoff', f), 'utf8'), /\/\/marisstella\.app\//, f);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('rewritePage keeps hashes and copied pages, and reads every import form', () => {
  assert.equal(rewritePage('<a href="./x.html#a">', 'index.html'), '<a href="../wall-framing-takeoff/x.html#a">');
  assert.equal(rewritePage('<a href="./index.html">', 'index.html'), '<a href="./index.html">');
  assert.deepEqual(localImports('import { a } from "./a.mjs";\nawait import("./b.mjs");\nimport "./c.mjs";').sort(), ['a.mjs', 'b.mjs', 'c.mjs']);
});

test('a missing app (sparse checkout) writes nothing, and the folder is a site dir', async () => {
  const out = tmp();
  try {
    assert.deepEqual(await buildResidentialTakeoffApp(out, { app: path.join(out, 'nope') }), []);
    assert.ok(SITE_OWN_DIRS.has(RESIDENTIAL_TAKEOFF_DIR));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
