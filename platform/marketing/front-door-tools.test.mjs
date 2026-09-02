/**
 * Tests for the apex tool mirror.
 *
 * Two kinds of assertion here, and they fail for different reasons:
 *
 * - **Staleness.** The mirror is committed because Argo CD delivers it, so the
 *   files in git *are* the artifact. These tests regenerate and compare, and
 *   name the command that fixes a stale commit.
 * - **The properties that make the mirror safe to serve.** No dead relative
 *   link, no indexable duplicate, a canonical pointing home, and a size that
 *   cannot take the front door down with it. Each of those is a way this
 *   directory could quietly stop being worth serving.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BYTE_CEILING,
  ROUTABLE_FILE,
  ROUTABLE_SLUG,
  OUTPUT_DIR,
  STARTER_SET,
  TOOLS_URL,
  buildMirror,
  canonicalUrl,
  injectMirrorTags,
  mirrorUrl,
  renderKustomization,
  validateLinks,
} from './front-door-tools.mjs';
import { renderFrontDoor } from './front-door.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REGENERATE = 'node platform/marketing/front-door-tools.mjs --write';

test('the committed mirror matches what the generator produces', async () => {
  const { files } = await buildMirror();
  for (const file of files) {
    const onDisk = await fs.readFile(path.join(OUTPUT_DIR, file.key), 'utf8').catch(() => null);
    assert.notEqual(onDisk, null, `${file.key} is missing from the commit — run \`${REGENERATE}\``);
    assert.equal(onDisk, file.contents, `${file.key} is stale — run \`${REGENERATE}\``);
  }
});

test('the mirror directory holds nothing the generator did not write', async () => {
  const { files } = await buildMirror();
  const expected = new Set([...files.map((f) => f.key), 'kustomization.yaml']);
  const actual = await fs.readdir(OUTPUT_DIR);
  for (const name of actual) {
    assert.ok(
      expected.has(name),
      `${name} is left over from a venture no longer in STARTER_SET — run \`${REGENERATE}\``,
    );
  }
  assert.equal(actual.length, expected.size, `run \`${REGENERATE}\``);
});

test('the committed kustomization matches the file list', async () => {
  const { files } = await buildMirror();
  const onDisk = await fs.readFile(path.join(OUTPUT_DIR, 'kustomization.yaml'), 'utf8');
  assert.equal(onDisk, renderKustomization(files), `stale — run \`${REGENERATE}\``);
});

test('no mirrored page links to something the mirror does not serve', async () => {
  // The property that makes "complete venture" mean something. Mirroring a lone
  // index.html would reproduce, one level down, the dead-end this whole module
  // exists to fix: the tool would load and its own FAQ link would 404.
  const { files } = await buildMirror();
  assert.deepEqual(validateLinks(files), []);
});

test('every mirrored page is noindex and points its canonical at the tools host', async () => {
  // `portfolio-apex.yaml` is right that two hostnames serving the same bytes
  // undoes the canonical consolidation `build.mjs` stamps in. These two tags
  // are why that argument does not apply to the mirror: no copy here is
  // eligible to be indexed, and any signal that leaks consolidates on the
  // tools host. `front-door/default.conf` repeats the first as a header.
  const { files } = await buildMirror();
  const pages = files.filter((f) => f.file.endsWith('.html'));
  assert.ok(pages.length >= STARTER_SET.length);
  for (const page of pages) {
    assert.match(
      page.contents,
      /<meta name="robots" content="noindex,follow">/,
      `${page.key} is missing its noindex`,
    );
    const canonical = canonicalUrl(page.slug, page.file);
    assert.ok(
      page.contents.includes(`<link rel="canonical" href="${canonical}">`),
      `${page.key} should be canonical to ${canonical}`,
    );
    assert.equal(
      page.contents.match(/rel=["']canonical["']/g).length,
      1,
      `${page.key} has more than one canonical, which leaves the crawler to pick`,
    );
    assert.ok(canonical.startsWith(TOOLS_URL));
  }
});

test('the charset declaration survives the injection inside the first 1024 bytes', () => {
  // A browser only honours `<meta charset>` in the first 1024 bytes. The tags
  // are inserted *after* it for exactly this reason; inserting them after
  // `<head>` instead would push it out on a compact page and change how the
  // page decodes.
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body></body></html>';
  const out = injectMirrorTags(html, { slug: 'demo', file: 'index.html' });
  assert.ok(out.indexOf('<meta charset="utf-8">') < 1024);
  assert.ok(out.indexOf('charset') < out.indexOf('noindex'));
});

test('a pre-existing canonical is replaced rather than duplicated', () => {
  const html = '<head><meta charset="utf-8"><link rel="canonical" href="https://example.invalid/"></head>';
  const out = injectMirrorTags(html, { slug: 'demo', file: 'index.html' });
  assert.equal(out.match(/rel="canonical"/g).length, 1);
  assert.ok(!out.includes('example.invalid'));
});

test('every mirrored path is one nginx can actually route', async () => {
  // The silent failure this guards: a venture whose slug or filename falls
  // outside the character classes in `front-door/default.conf` would be
  // generated, committed, mounted, and 404 on every request, with no test in
  // the tree failing. Checked here against the same patterns the config uses.
  const { files } = await buildMirror();
  for (const { slug, file } of files) {
    assert.match(slug, ROUTABLE_SLUG, `${slug} is not routable`);
    assert.match(file, ROUTABLE_FILE, `${slug}/${file} is not routable`);
  }
  const conf = await fs.readFile(
    path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', 'default.conf'),
    'utf8',
  );
  // The patterns here have to stay the ones the config actually uses, or this
  // test passes while agreeing with itself instead of with nginx.
  assert.ok(conf.includes(ROUTABLE_SLUG.source.replace(/^\^|\$$/g, '')));
  assert.ok(conf.includes(ROUTABLE_FILE.source.replace(/^\^|\$$/g, '')));
});

test('buildMirror refuses a slug nginx could not route', async () => {
  await assert.rejects(
    () => buildMirror({ set: [{ slug: 'Not_Routable', why: 'underscore and capitals' }] }),
    /could never route it/,
  );
});

test('the mirror stays under the ConfigMap ceiling', async () => {
  // Not a style rule. A ConfigMap over 1 MiB fails to apply, and this one is
  // mounted by the front door's own pod — so blowing the ceiling would trade a
  // broken link for a broken apex.
  const { bytes } = await buildMirror();
  assert.ok(bytes <= BYTE_CEILING, `${bytes} bytes is over the ${BYTE_CEILING} ceiling`);
});

test('buildMirror refuses a set whose links leave the mirror', async () => {
  // The guard rather than the happy path: a venture that grows a `../` link to
  // a sibling has to fail the build, not ship a 404.
  await assert.rejects(
    () => buildMirror({ set: [{ slug: 'where-to-sell-calculator', why: 'links to three siblings' }] }),
    /dead links/,
  );
});

test('the front door lists exactly the mirrored tools, and links to them by apex path', async () => {
  const { tools } = await buildMirror();
  const html = renderFrontDoor({ slugs: ['ebay-fee-calculator', 'roofing-bid-calculator'], mirrored: tools });
  for (const tool of tools) {
    assert.ok(html.includes(`href="${tool.url}"`), `the front door does not link to ${tool.url}`);
    assert.ok(html.includes(tool.title.replaceAll('&', '&amp;')), `${tool.title} is not named`);
  }
  const linked = html.match(/href="\/tools\/[^"]*"/g) ?? [];
  assert.equal(linked.length, tools.length, 'the front door links to a tool the mirror does not serve');
  for (const { slug } of STARTER_SET) {
    assert.ok(html.includes(mirrorUrl(slug, 'index.html')));
  }
});

test('the front door renders without a mirror, so it survives the mirror being deleted', () => {
  // The state this page returns to once `portfolio-site-repo` is sealed and the
  // mirror is removed in one commit. `mirrored` defaults to empty and the whole
  // section disappears rather than leaving an empty heading behind.
  const html = renderFrontDoor({ slugs: ['ebay-fee-calculator'] });
  assert.ok(!html.includes('/tools/'));
  assert.ok(!html.includes('open-now'));
  assert.ok(html.includes('Browse all 1 tool'));
});

test('the nginx config serves every shape of path the mirror produces', async () => {
  // Pins the two halves together: the generator flattens `<slug>/<file>` to the
  // ConfigMap key `<slug>__<file>`, and only these `location` blocks map a URL
  // back. A change to either encoding without the other is a 404 on every tool.
  const conf = await fs.readFile(
    path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', 'default.conf'),
    'utf8',
  );
  assert.match(conf, /location ~ "\^\/tools\/\(\[a-z0-9\]\[a-z0-9-\]\*\)\/\?\$"/);
  assert.match(conf, /try_files \/\$1__index\.html =404;/);
  assert.match(conf, /try_files \/\$1__\$2 =404;/);
  // `.mjs` must be typed, or the module is refused and every calculator is an
  // inert form that still returns 200.
  assert.match(conf, /\\\.mjs\)\$"[\s\S]{0,200}default_type text\/javascript;/);
  // ...and its block must come before the general file rule, since nginx takes
  // the first matching regex location.
  assert.ok(conf.indexOf('\\.mjs)$"') < conf.indexOf('([A-Za-z0-9._-]+)$"'));
  assert.match(conf, /X-Robots-Tag "noindex"/);
});
