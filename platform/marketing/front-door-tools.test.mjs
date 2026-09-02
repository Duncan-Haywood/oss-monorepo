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
  MIRROR_BYTE_CEILING,
  SHARD_BYTE_CEILING,
  packShards,
  shardName,
  CLIENT_SIDE_APPLY_CEILING,
  SYNC_OPTIONS,
  SYNC_OPTIONS_ANNOTATION,
  ROUTABLE_FILE,
  ROUTABLE_SLUG,
  OUTPUT_DIR,
  STARTER_SET,
  WHY_CATEGORY_WORD,
  claimedCategory,
  TOOLS_URL,
  buildMirror,
  canonicalUrl,
  injectMirrorTags,
  APEX_ROOT_PATHS,
  FAVICON_FILE,
  mirrorUrl,
  pageTitle,
  renderKustomization,
  validateLinks,
  ventureFiles,
} from './front-door-tools.mjs';
import { FAVICON_FILE as FRONT_DOOR_FAVICON, renderFrontDoor } from './front-door.mjs';

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
  const { shards } = await buildMirror();
  const onDisk = await fs.readFile(path.join(OUTPUT_DIR, 'kustomization.yaml'), 'utf8');
  assert.equal(onDisk, renderKustomization(shards), `stale — run \`${REGENERATE}\``);
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

test('a venture-declared robots directive is replaced, not contradicted', () => {
  // The real shape: `build.mjs` is not what puts `index, follow` on these
  // pages — the venture sources carry it themselves, so it arrives inside the
  // bytes this module copies. Prepending `noindex,follow` in front of it left
  // 24 of the 45 mirrored pages telling a crawler both things at once.
  const html =
    '<head><meta charset="utf-8"><title>x</title>\n<meta name="robots" content="index, follow"></head>';
  const out = injectMirrorTags(html, { slug: 'demo', file: 'index.html' });
  const robots = out.match(/<meta[^>]*name="robots"[^>]*>/g);
  assert.equal(robots.length, 1, 'two robots directives let the crawler choose which one to believe');
  assert.equal(robots[0], '<meta name="robots" content="noindex,follow">');
  assert.ok(!out.includes('index, follow'));
});

test('no mirrored page ships more than one robots directive', async () => {
  // The end-to-end form of the check above, over what is actually committed —
  // the unit test would still pass if `injectMirrorTags` stopped being the
  // only thing that writes these tags.
  const { files } = await buildMirror();
  for (const { slug, file, contents } of files.filter((f) => f.file.endsWith('.html'))) {
    const robots = contents.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/gi) ?? [];
    assert.equal(robots.length, 1, `${slug}/${file} has ${robots.length} robots directives`);
    assert.match(robots[0], /noindex/);
  }
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

test('every shard stays under the ConfigMap ceiling, and the mirror under its own', async () => {
  // Not a style rule, and now two rules rather than one.
  //
  // A ConfigMap over 1 MiB fails to apply, and these are mounted by the front
  // door's own pod — so blowing the per-object ceiling would trade a broken
  // link for a broken apex. Sharding means that cap binds per shard, which is
  // what makes 47 tools possible where 20 was the limit.
  //
  // `MIRROR_BYTE_CEILING` is the one that binds the whole mirror now, and it
  // is not about etcd at all: the mirror is tmpfs-resident in both replicas
  // (so it is charged to `resources.limits.memory`) and committed to git (so
  // every byte duplicates one under `ventures/`). Both costs are real and
  // bounded; see the constant's comment.
  const { bytes, shards } = await buildMirror();
  assert.ok(
    bytes <= MIRROR_BYTE_CEILING,
    `${bytes} bytes is over the ${MIRROR_BYTE_CEILING}-byte mirror ceiling`,
  );
  for (const shard of shards) {
    assert.ok(
      shard.bytes <= SHARD_BYTE_CEILING,
      `${shard.name} is ${shard.bytes} bytes, over the ${SHARD_BYTE_CEILING}-byte shard ceiling`,
    );
  }
});

test('shards are named in order and hold every file exactly once', async () => {
  // The projected volume in `portfolio-front.yaml` names shards by index, so a
  // gap or a repeat in the sequence is a mount that silently drops a shard's
  // worth of tools. And a file that lands in two shards is a duplicate key,
  // which makes the volume fail to mount outright.
  const { files, shards } = await buildMirror();
  assert.deepEqual(
    shards.map((s) => s.name),
    shards.map((_, i) => shardName(i)),
  );
  const packed = shards.flatMap((s) => s.files.map((f) => f.key));
  assert.deepEqual(packed.slice().sort(), files.map((f) => f.key).sort());
  assert.equal(new Set(packed).size, packed.length, 'a file was packed into two shards');
});

test('packShards refuses a file no shard could hold', () => {
  // A single file larger than the shard ceiling cannot be placed anywhere, and
  // the packer has to say so rather than emit a shard over the cap — which
  // would apply cleanly right up until etcd rejected it.
  assert.throws(
    () => packShards([{ key: 'a__big.mjs', contents: 'x'.repeat(2048) }], 1024),
    /larger than the 1024-byte shard ceiling/,
  );
});

test('a duplicate ConfigMap key is refused rather than mounted', () => {
  // Two sources of a projected volume offering the same key makes the volume
  // fail to mount, and `maxUnavailable: 0` turns that into a stale front door
  // rather than a visible failure. Cheaper to catch here.
  assert.throws(
    () => packShards([
      { key: 'a__index.html', contents: 'x' },
      { key: 'a__index.html', contents: 'y' },
    ]),
    /appears twice in the mirror/,
  );
});

test('a title that arrives HTML-encoded is decoded before the front door escapes it', () => {
  // `front-door.mjs` escapes every string it renders. A `<title>` is parsed
  // HTML text, so an ampersand reaches us as `&amp;` and would be escaped a
  // second time into visible markup on the card. `notary-trip-quote` is the
  // first mirrored venture with one.
  assert.equal(pageTitle('<title>Mobile Notary &amp; Loan Signing</title>'), 'Mobile Notary & Loan Signing');
  assert.equal(pageTitle('<title>A &lt;b&gt; and &#39;q&#39; | tail</title>'), "A <b> and 'q'");
  // An unknown reference is left alone rather than guessed at.
  assert.equal(pageTitle('<title>100 &widget; each</title>'), '100 &widget; each');
});

test('no test file is published to the apex', async () => {
  // Two ventures name their suite plainly `test.mjs` rather than
  // `calc.test.mjs`, which the `.test.` check did not catch — so
  // `cam-reconciliation-check__test.mjs` and
  // `chargeback-evidence-packet__test.mjs` were both served to strangers out
  // of a mirror that was refusing new tools for want of room.
  const { files } = await buildMirror();
  const published = files.filter((f) => /(^|\.)test\.(m?js)$/.test(f.file));
  assert.deepEqual(published, [], `${published.map((f) => f.key).join(', ')} is a test file`);
});

test('the mirror asks for the apply mode its size actually requires', async () => {
  // 1 MiB is not the first ceiling this hits, which is what the test above and
  // every size comment in the tree missed. Argo CD applies client-side by
  // default: `kubectl apply` copies the whole object into the
  // `kubectl.kubernetes.io/last-applied-configuration` annotation, and the API
  // server rejects any object whose annotations total more than 262144 bytes.
  //
  // At ~600 KB most shards are over that by more than a factor of two, so
  // without `ServerSideApply=true` those ConfigMaps never apply at all — the
  // front door keeps serving its old, toolless pods and `prod` sits Degraded.
  //
  // Next-fit packing in declaration order can also leave one trailing shard
  // well under the ceiling: a venture's file lands just past a full shard and
  // opens a small new one of its own, and that shard does not need the
  // annotation to apply client-side. This test used to assert the annotation
  // on every shard unconditionally, which broke the day that first happened
  // (`fence-bid-calculator__vs-fence-cloud.html`, 10756 bytes, alone in
  // `portfolio-front-tools-7`) — asserting an annotation that guards nothing
  // on a shard that never needed it. `renderKustomization` now emits the
  // annotation per shard rather than for the whole mirror, so pin the real
  // invariant instead: a shard carries the annotation exactly when its size
  // requires it, never more and never less.
  const { shards } = await buildMirror();
  const kustomization = renderKustomization(shards);
  const needsIt = shards.filter((s) => s.bytes > CLIENT_SIDE_APPLY_CEILING);
  const annotations = kustomization.match(
    new RegExp(`${SYNC_OPTIONS_ANNOTATION}: ${SYNC_OPTIONS}`, 'g'),
  ) ?? [];
  // One per generator that needs it, not just one somewhere in the file: an
  // annotation on the first shard and not the fourth (when the fourth needs
  // it too) is the same outage, three shards later.
  assert.equal(annotations.length, needsIt.length);
  for (const shard of shards) {
    const shardBlock = kustomization.slice(kustomization.indexOf(`  - name: ${shard.name}\n`));
    const nextShard = shardBlock.indexOf('\n  - name: ', 1);
    const block = nextShard === -1 ? shardBlock : shardBlock.slice(0, nextShard);
    const annotated = block.includes(SYNC_OPTIONS_ANNOTATION);
    assert.equal(
      annotated,
      shard.bytes > CLIENT_SIDE_APPLY_CEILING,
      `${shard.name} is ${shard.bytes} bytes ` +
        (annotated
          ? `— carries ${SYNC_OPTIONS_ANNOTATION} but is under the ${CLIENT_SIDE_APPLY_CEILING}-byte client-side apply cap, so it does not need it`
          : `— over the ${CLIENT_SIDE_APPLY_CEILING}-byte client-side apply cap but missing ${SYNC_OPTIONS_ANNOTATION}: ${SYNC_OPTIONS}`),
    );
    if (annotated) {
      // Under this shard's own `options:`, not as a stray top-level key that
      // kustomize would reject.
      assert.match(
        block,
        /\n    options:\n      annotations:\n        argocd\.argoproj\.io\/sync-options: ServerSideApply=true\n/,
      );
    }
  }
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

test('the front door compresses every non-HTML type the mirror actually serves', async () => {
  // `gzip_types` in `default.conf` is a hand-written list, so nothing forces
  // it to grow when `STARTER_SET` starts mirroring a new file type — which is
  // exactly how `text/css`, `application/javascript` and `LICENSE`'s
  // `text/plain` went uncompressed for as long as they did (see the comment
  // beside `gzip_types`). This derives the real extension set from the
  // mirror itself, so a future venture bringing a `.json` or `.svg` file
  // fails here instead of quietly shipping uncompressed.
  const EXT_TO_MIME = {
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'text/javascript',
  };
  // Matches the `default_type text/plain;` in the `LICENSE` `location` block
  // below — `LICENSE` has no extension for `EXT_TO_MIME` to key off.
  const NAME_TO_MIME = { LICENSE: 'text/plain' };

  const mimeTypes = new Set();
  for (const { slug } of STARTER_SET) {
    for (const file of await ventureFiles(slug)) {
      if (file.endsWith('.html')) continue; // text/html — nginx always gzips it.
      const mime = NAME_TO_MIME[file] ?? EXT_TO_MIME[path.extname(file)];
      assert.ok(
        mime,
        `${slug}/${file}: no known MIME type for this test — add one before adding the file to STARTER_SET`,
      );
      mimeTypes.add(mime);
    }
  }
  assert.ok(mimeTypes.size > 0, 'expected at least one non-HTML file across the mirror');

  const conf = await fs.readFile(
    path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', 'default.conf'),
    'utf8',
  );
  const gzipLine = conf.match(/^\s*gzip_types\s+([^;]+);/m);
  assert.ok(gzipLine, 'default.conf has no gzip_types directive');
  const gzipped = new Set(gzipLine[1].trim().split(/\s+/));
  for (const mime of mimeTypes) {
    assert.ok(
      gzipped.has(mime),
      `${mime} is served by the mirror but missing from default.conf's gzip_types`,
    );
  }
});

test('every why names the category categoryFor actually sorts the slug into', async () => {
  // Not a documentation nit. These strings read like documentation, so they
  // get read as data: #2744 dropped the set's only `services` tool believing
  // it was a fourth, having counted three entries whose `why` said "services"
  // for slugs `categoryFor` sorts under `trades`. That left the services card
  // on the live front door with nothing behind it. Six of eighteen `why`
  // strings disagreed with `categoryFor` when this was first measured.
  const { categoryFor } = await import('../pages/build.mjs');
  for (const { slug, why } of STARTER_SET) {
    const expected = WHY_CATEGORY_WORD[categoryFor(slug).id];
    assert.equal(
      claimedCategory(why),
      expected,
      `${slug}'s why opens "${claimedCategory(why)}" but categoryFor puts it in ` +
        `${categoryFor(slug).id} ("${expected}"). Fix the string — someone will count these.`,
    );
  }
});

test('the category words a why may use are exactly the categories that exist', async () => {
  // Guards the other direction: a new category in build.mjs with no entry here
  // would make the test above throw `undefined` rather than report a mismatch.
  const { ALL_CATEGORIES } = await import('../pages/build.mjs');
  assert.deepEqual(Object.keys(WHY_CATEGORY_WORD).sort(), ALL_CATEGORIES.map((c) => c.id).sort());
});

test('every mirrored page declares the tab mark the apex actually serves', async () => {
  // A document that declares no icon makes the browser request `/favicon.ico`
  // unprompted; nothing on this host serves that, so all 47 mirrored pages
  // showed a blank tab and logged a miss on every view. `front-door.mjs` fixed
  // exactly this for the apex page and its comment explains why it is worth
  // fixing; the mirrored pages are on the same origin and were left out.
  //
  // One declaration per page, not two: a venture that later grows its own
  // `rel="icon"` must be replaced rather than contradicted, the same rule the
  // canonical and robots tags already follow.
  const { files } = await buildMirror();
  for (const { key, file, contents } of files) {
    if (!file.endsWith('.html')) continue;
    const icons = contents.match(/<link\b[^>]*\brel=["']icon["'][^>]*>/gi) ?? [];
    assert.equal(icons.length, 1, `${key} declares ${icons.length} icons`);
    assert.match(icons[0], new RegExp(`href="/${FAVICON_FILE}"`));
  }
});

test('the mirror names the same favicon file the front door writes', () => {
  // The two modules are deliberately decoupled — `front-door.mjs` imports this
  // one dynamically so its tests survive the mirror being deleted — so the
  // filename is declared twice and has to be pinned rather than shared. If they
  // drift, every mirrored page points at a file the apex does not serve.
  assert.equal(FAVICON_FILE, FRONT_DOOR_FAVICON);
  assert.ok(APEX_ROOT_PATHS.has(`/${FAVICON_FILE}`));
});

test('a root-absolute link is checked against the apex root, not the mirror', () => {
  // `validateLinks` resolves relative hrefs inside the venture directory. A
  // root-absolute href is answered by the front door's own document root
  // instead, so treating it as relative both misreports the tag this module
  // injects and misses a genuinely dead one.
  assert.deepEqual(
    validateLinks([{ slug: 'a', file: 'index.html', contents: '<a href="/favicon.svg">' }]),
    [],
  );
  const dead = validateLinks([
    { slug: 'a', file: 'index.html', contents: '<a href="/nothing-here.css">' },
  ]);
  assert.equal(dead.length, 1);
  assert.match(dead[0], /apex document root serves only/);
});
