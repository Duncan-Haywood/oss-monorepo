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
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  GZIP_HEADER,
  compress,
  storedKey,
  discoverEligible,
  explainIneligible,
  MIRROR_BYTE_CEILING,
  MIRROR_HEADROOM_WARN_RATIO,
  duplicateBytes,
  dedupeMirror,
  renderMirrorAliases,
  MIRROR_ALIAS_FILE,
  FRONT_DOOR_DIR,
  mirrorHeadroom,
  SHARD_BYTE_CEILING,
  packShards,
  shardName,
  CLIENT_SIDE_APPLY_CEILING,
  SYNC_OPTIONS,
  SYNC_OPTIONS_ANNOTATION,
  ROUTABLE_FILE,
  ROUTABLE_SLUG,
  ROUTABLE_SUBPATH,
  STRIPPED_LINK_RELS,
  blankStrippedLinks,
  writeMirror,
  FRONT_DOOR_DEPLOYMENT,
  renderMountSources,
  writeMountList,
  assertNoConflictMarkers,
  STARTER_SET,
  WHY_CATEGORY_WORD,
  claimedCategory,
  TOOLS_URL,
  APEX_URL,
  SOCIAL_CARD_FILE,
  SOCIAL_CARD_ALT,
  SOCIAL_CARD_WIDTH,
  SOCIAL_CARD_HEIGHT,
  buildMirror,
  canonicalUrl,
  mirrorCanonicalUrl,
  MIRROR_ROBOTS_CONTENT,
  TOOLS_HOST_SERVES,
  apexUrl,
  injectMirrorTags,
  injectMirrorNav,
  injectMirrorRelated,
  blankScriptBodies,
  dynamicLinks,
  NAV_CLASS,
  NAV_STYLE,
  RELATED_CLASS,
  RELATED_LIMIT,
  RELATED_STYLE,
  APEX_ROOT_PATHS,
  decodeCharacterReferences,
  FAVICON_FILE,
  mirrorUrl,
  pageTitle,
  renderKustomization,
  validateLinks,
  ventureFiles,
} from './front-door-tools.mjs';
import {
  FAVICON_FILE as FRONT_DOOR_FAVICON,
  SOCIAL_CARD_ALT as FRONT_DOOR_SOCIAL_CARD_ALT,
  escapeHtml,
  renderFrontDoor,
} from './front-door.mjs';
import {
  SOCIAL_CARD_FILE as FRONT_DOOR_SOCIAL_CARD,
  discoverSurfaces,
  relatedTools,
} from '../pages/build.mjs';
import {
  SOCIAL_CARD_WIDTH as OFFLINE_CARD_WIDTH,
  SOCIAL_CARD_HEIGHT as OFFLINE_CARD_HEIGHT,
} from '../pages/offline.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Deliberately the whole-surface command, not this generator alone: a session
// handed `front-door-tools.mjs --write` fixes the mirror, sees its test go
// green, and ships a stale sitemap from the *other* generator. That is what
// #3257 and #3258 each did on 2026-09-05. See platform/marketing/regen.mjs.
const REGENERATE = 'node platform/marketing/regen.mjs';

// The mirror is built into a scratch directory, never read from the committed
// gitops/prod/front-door-tools tree, so these tests keep passing when that
// tree is removed (process backlog P014 / P022). One build is shared.
let scratch;
const scratchMirror = () => (scratch ??= (async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'front-door-mirror-'));
  await writeMirror(dir);
  return dir;
})());
process.on('exit', () => {
  // best effort; the OS tmp cleaner covers a crash
  if (scratch) scratch.then((d) => fsSync.rmSync(d, { recursive: true, force: true }), () => {});
});

test('the alias map is parsed before the config whose maps it must precede', () => {
  // nginx accepts `map_hash_bucket_size` only before the first `map` block it
  // parses; afterwards it is rejected as a duplicate directive and the server
  // refuses to start. `default.conf` opens with three maps of its own, and
  // `include /etc/nginx/conf.d/*.conf` expands in sorted order — so this file
  // has to sort first. Renaming it to something tidier reads as cosmetic and
  // takes the apex down, which is why the ordering is asserted rather than
  // merely commented.
  assert.ok(
    MIRROR_ALIAS_FILE < 'default.conf',
    `${MIRROR_ALIAS_FILE} must sort before default.conf inside conf.d, or nginx will not start`,
  );
});

test('every alias resolves to bytes the mirror actually stores', async () => {
  const { stored, aliases, files } = await buildMirror();
  const storedKeys = new Set(stored.map((f) => f.key));
  const bytesByKey = new Map(files.map((f) => [f.key, f.bytes]));
  for (const alias of aliases) {
    assert.ok(
      storedKeys.has(alias.canonical),
      `${alias.key} aliases ${alias.canonical}, which is not stored — its URL would 404`,
    );
    assert.ok(
      !storedKeys.has(alias.key),
      `${alias.key} is both aliased and stored, so the saving was not taken`,
    );
    // The whole mechanism is only sound while the two are byte-identical.
    assert.ok(
      bytesByKey.get(alias.key).equals(bytesByKey.get(alias.canonical)),
      `${alias.key} would be served ${alias.canonical}'s bytes, which differ`,
    );
  }
});

test('an entry page is never aliased', async () => {
  // Entry and subpage documents carry slug-specific injected content, so two
  // cannot be byte-identical today — but `dedupeMirror` refuses them
  // structurally rather than relying on that. The two `index.html` location
  // blocks in `default.conf` deliberately still rewrite straight to their key
  // with no `map` lookup, so an aliased entry page would 404 a tool's front
  // page, which is the one URL the catalogue cannot afford to lose.
  const { aliases } = await buildMirror();
  for (const alias of aliases) {
    assert.ok(
      !alias.key.endsWith('__index.html'),
      `${alias.key} is an entry page and must never be aliased`,
    );
  }
});

test('dedupeMirror keeps one copy and picks the same one every run', () => {
  const bytes = Buffer.from('shared helper');
  const other = Buffer.from('distinct');
  const file = (key, buf) => ({ key, file: key.split('__').pop(), stored: `${key}.gz`, bytes: buf });
  // Declaration order deliberately puts the later-sorting key first, so a
  // canonical chosen by position rather than by name would show up here.
  const input = [
    file('zulu__proposal.mjs', bytes),
    file('alpha__proposal.mjs', bytes),
    file('mike__proposal.mjs', bytes),
    file('alpha__calc.mjs', other),
  ];
  const { stored, aliases } = dedupeMirror(input);
  assert.deepEqual(
    stored.map((f) => f.key).sort(),
    ['alpha__calc.mjs', 'alpha__proposal.mjs'],
  );
  assert.deepEqual(
    aliases.map((a) => [a.key, a.canonical]).sort(),
    [
      ['mike__proposal.mjs', 'alpha__proposal.mjs'],
      ['zulu__proposal.mjs', 'alpha__proposal.mjs'],
    ],
  );
  // Same input in a different order produces the same canonical, so a mirror
  // regenerated on an unchanged tree cannot churn the committed alias file.
  const reversed = dedupeMirror([...input].reverse());
  assert.deepEqual(
    reversed.aliases.map((a) => a.canonical).sort(),
    aliases.map((a) => a.canonical).sort(),
  );
});

test('the alias map defaults to the identity, so an unlisted key routes unchanged', () => {
  const rendered = renderMirrorAliases([
    { key: 'b__LICENSE', canonical: 'a__LICENSE', bytes: 10 },
  ]);
  assert.match(rendered, /^map \$fd_flat \$fd_stored \{$/m);
  assert.match(rendered, /^ {2}default \$fd_flat;$/m);
  assert.match(rendered, /^ {2}"b__LICENSE" {2}"a__LICENSE";$/m);
  // Sized for the key, not left at nginx's 64-byte default, which these keys
  // outgrow — the failure is a refusal to start, not a slow lookup.
  assert.match(rendered, /^map_hash_bucket_size \d+;$/m);
});

test('an empty mirror still renders a usable alias map', () => {
  // `default.conf` references `$fd_stored` unconditionally and nginx refuses to
  // start on an unknown variable, so "no duplicates" has to mean a map with
  // only its default — never an absent file.
  const rendered = renderMirrorAliases([]);
  assert.match(rendered, /^map \$fd_flat \$fd_stored \{$/m);
  assert.match(rendered, /^ {2}default \$fd_flat;$/m);
});

test('no mirrored page links to something the mirror does not serve', async () => {
  // The property that makes "complete venture" mean something. Mirroring a lone
  // index.html would reproduce, one level down, the dead-end this whole module
  // exists to fix: the tool would load and its own FAQ link would 404.
  const { files } = await buildMirror();
  assert.deepEqual(validateLinks(files), []);
});

test('every mirrored page carries the robots directive and canonical the switch names', async () => {
  // `portfolio-apex.yaml` is right that two hostnames serving the same bytes
  // undoes the canonical consolidation `build.mjs` stamps in — but that binds
  // only while two hosts actually serve. `TOOLS_HOST_SERVES` is that premise,
  // and this asserts against it rather than against either answer, so the test
  // keeps its meaning when the seal lands and the switch flips.
  const { files } = await buildMirror();
  const pages = files.filter((f) => f.file.endsWith('.html'));
  assert.ok(pages.length >= STARTER_SET.length);
  for (const page of pages) {
    assert.ok(
      page.contents.includes(`<meta name="robots" content="${MIRROR_ROBOTS_CONTENT}">`),
      `${page.key} does not carry the ${MIRROR_ROBOTS_CONTENT} directive`,
    );
    const canonical = mirrorCanonicalUrl(page.slug, page.file);
    assert.ok(
      page.contents.includes(`<link rel="canonical" href="${canonical}">`),
      `${page.key} should be canonical to ${canonical}`,
    );
    // Anchored to an actual <link> tag, not a bare `rel="canonical"`
    // substring -- a guide page that discusses canonical tags in its own
    // prose (escaped as `&lt;link rel="canonical"...&gt;`) legitimately
    // contains that substring without shipping a second real tag. Measured
    // 2026-09-24 on canonical-tag-check/why-two-canonical-tags-is-worse-
    // than-none.html: the unanchored regex counted 5, the mirrored page
    // ships 1.
    assert.equal(
      (page.contents.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/g) ?? []).length,
      1,
      `${page.key} has more than one canonical, which leaves the crawler to pick`,
    );
    // The point of the switch: the canonical must name a host that answers.
    // A canonical pointing at the dark tools host is the defect this replaced,
    // and it is silent — a crawler discards the hint and the `noindex` beside
    // it then decides alone.
    assert.ok(canonical.startsWith(TOOLS_HOST_SERVES ? TOOLS_URL : APEX_URL));
  }
});

test('an indexable mirror never also ships a noindex header, in markup or nginx', async () => {
  // The two layers disagreeing is the failure this whole change exists to
  // remove, and it fails in the expensive direction: a header silently beats
  // the markup, so the pages would be excluded while every generated artifact
  // claimed otherwise. Whichever way `TOOLS_HOST_SERVES` points, the page
  // blocks in `default.conf` and `MIRROR_ROBOTS_CONTENT` must agree.
  const conf = await fs.readFile(
    path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', 'default.conf'),
    'utf8',
  );
  // The blocks that serve pages, as opposed to the `.mjs` and `LICENSE` blocks
  // which stay noindex either way because a raw module is not a search result.
  const pageBlocks = [...conf.matchAll(/location ~ "\^\/tools\/[^"]*"\s*\{[^}]*\}/g)]
    .map((m) => m[0])
    .filter((b) => !/\\\.mjs|LICENSE/.test(b));
  assert.ok(pageBlocks.length >= 4, `expected the page-serving blocks, found ${pageBlocks.length}`);
  for (const block of pageBlocks) {
    const hasHeader = /X-Robots-Tag "noindex"/.test(block);
    assert.equal(
      hasHeader,
      TOOLS_HOST_SERVES,
      hasHeader
        ? 'a page block sends X-Robots-Tag: noindex while the mirror claims to be indexable — ' +
            'the header wins and the catalogue silently leaves the index'
        : 'the mirror is noindex in markup but a page block no longer says so to a header-only crawler',
    );
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
  // The injected block is located by the tag the switch actually wrote, not
  // by a hardcoded 'noindex' — that literal stopped appearing when the mirror
  // became indexable, and `indexOf` returning -1 made this pass or fail for
  // reasons unrelated to charset placement.
  assert.ok(out.indexOf('charset') < out.indexOf(`content="${MIRROR_ROBOTS_CONTENT}"`));
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
  assert.equal(robots[0], `<meta name="robots" content="${MIRROR_ROBOTS_CONTENT}">`);
  // The venture's own spacing ("index, follow") must be gone whichever
  // directive replaced it — that is what "replaced, not contradicted" means.
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
    assert.ok(robots[0].includes(MIRROR_ROBOTS_CONTENT));
  }
});

test('a venture-declared og:url is repointed at the URL this host actually serves', () => {
  // The venture sources carry `https://example.invalid/...` deliberately —
  // `build.mjs` calls it `PLACEHOLDER_ORIGIN` and overwrites it when it
  // publishes to the canonical host. This mirror is the other publisher and
  // used to copy the placeholder through, so a mirrored tool pasted into Slack
  // or LinkedIn built its share card against a domain reserved by RFC 2606.
  const html =
    '<head><meta charset="utf-8">' +
    '<meta property="og:url" content="https://example.invalid/demo/vs-jobber.html">' +
    '</head>';
  const out = injectMirrorTags(html, { slug: 'demo', file: 'vs-jobber.html' });
  assert.ok(!out.includes('example.invalid'), 'the placeholder origin must not survive');
  const tags = out.match(/<meta[^>]*property="og:url"[^>]*>/g);
  assert.equal(tags.length, 1, 'two og:url tags let the scraper choose which one to believe');
  assert.equal(tags[0], '<meta property="og:url" content="https://marisstella.dev/tools/demo/vs-jobber.html">');
});

test('og:url and the canonical both name a host that answers', () => {
  // These two used to disagree on purpose: the canonical named
  // `tools.marisstella.dev` for consolidation while `og:url` named the apex so
  // a share card resolved. With `TOOLS_HOST_SERVES` false they agree, because
  // the apex is both the host that answers and the canonical home — and the
  // property worth pinning was never that they differ, but that neither ever
  // names a dead host.
  const html = '<head><meta charset="utf-8"><meta property="og:url" content="https://example.invalid/d/"></head>';
  const out = injectMirrorTags(html, { slug: 'demo', file: 'index.html' });
  assert.ok(out.includes(`<link rel="canonical" href="${mirrorCanonicalUrl('demo', 'index.html')}">`));
  assert.ok(out.includes(`<meta property="og:url" content="${apexUrl('demo', 'index.html')}">`));
  assert.ok(canonicalUrl('demo', 'index.html').startsWith(TOOLS_URL));
  assert.ok(
    mirrorCanonicalUrl('demo', 'index.html').startsWith(TOOLS_HOST_SERVES ? TOOLS_URL : APEX_URL),
  );
  assert.ok(apexUrl('demo', 'index.html').startsWith(APEX_URL));
  // `index.html` drops off both, so neither advertises a second URL for the
  // page the directory itself already answers.
  assert.equal(apexUrl('demo', 'index.html'), 'https://marisstella.dev/tools/demo/');
});

test('a bare `>` inside a neighbouring meta tag does not derail the og:url repair', () => {
  // Why the whole-tag matcher rather than `[^>]*`: venture copy really does
  // contain comparisons, and a matcher that stopped at the first `>` would
  // rewrite the wrong span of the document.
  const html =
    '<head><meta charset="utf-8">' +
    '<meta name="description" content="works when net > 0 and margin > cost">' +
    '<meta property="og:url" content="https://example.invalid/demo/x.html">' +
    '</head>';
  const out = injectMirrorTags(html, { slug: 'demo', file: 'x.html' });
  assert.ok(out.includes('content="works when net > 0 and margin > cost"'), 'the description is untouched');
  assert.ok(out.includes('<meta property="og:url" content="https://marisstella.dev/tools/demo/x.html">'));
});

test('no mirrored page ships a share card pointed at a domain that resolves nowhere', async () => {
  // The end-to-end form, over what is actually committed. `og:url` is repaired
  // where present and never inserted where absent — a page with none lets the
  // scraper key the card to the pasted URL, which is already this host's.
  const { files } = await buildMirror();
  let repaired = 0;
  for (const { slug, file, contents } of files.filter((f) => f.file.endsWith('.html'))) {
    const tags = contents.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*property=["']og:url["'](?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? [];
    assert.ok(tags.length <= 1, `${slug}/${file} has ${tags.length} og:url tags`);
    if (tags.length === 0) continue;
    repaired += 1;
    assert.ok(
      !tags[0].includes('example.invalid'),
      `${slug}/${file} still advertises the placeholder origin to every share scraper`,
    );
    assert.ok(
      tags[0].includes(`content="${apexUrl(slug, file)}"`),
      `${slug}/${file} should key its share card to ${apexUrl(slug, file)}`,
    );
  }
  assert.ok(repaired > 0, 'no page carried an og:url, so this check proved nothing');
});

test('every mirrored page carries a share card the apex actually serves', async () => {
  // `build.mjs` found no venture source declares an `og:image`, so before this
  // every mirrored tool pasted into a chat rendered as a bare text row. The
  // image is not carried in the mirror: `/social-card.png` is already at the
  // apex document root in `portfolio-front-html`, the same place `/favicon.svg`
  // these pages already point at lives.
  const { files } = await buildMirror();
  const pages = files.filter((f) => f.file.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const { slug, file, contents } of pages) {
    const images = contents.match(/<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/gi) ?? [];
    assert.equal(images.length, 1, `${slug}/${file} has ${images.length} og:image tags`);
    assert.equal(
      images[0],
      `<meta property="og:image" content="https://marisstella.dev/${SOCIAL_CARD_FILE}">`,
      `${slug}/${file} should point at the card the apex serves`,
    );
    // Absolute, because a scraper fetching the card off a pasted link does not
    // reliably resolve a relative one.
    assert.ok(images[0].includes('content="https://'), `${slug}/${file}'s card URL is not absolute`);
    assert.match(contents, /<meta name="twitter:card" content="summary_large_image">/);
  }
});

test('the mirror agrees with the front door about the card it points at', () => {
  // Declared in both modules rather than shared, for the reason `FAVICON_FILE`
  // is: this mirror has to build with the front door's generator absent. So
  // the drift that would leave every mirrored page naming a file the apex does
  // not serve, or lying about its shape, is pinned here instead.
  assert.equal(SOCIAL_CARD_FILE, FRONT_DOOR_SOCIAL_CARD);
  assert.equal(SOCIAL_CARD_ALT, FRONT_DOOR_SOCIAL_CARD_ALT);
  assert.equal(SOCIAL_CARD_WIDTH, OFFLINE_CARD_WIDTH);
  assert.equal(SOCIAL_CARD_HEIGHT, OFFLINE_CARD_HEIGHT);
  assert.ok(APEX_ROOT_PATHS.has(`/${SOCIAL_CARD_FILE}`), 'validateLinks would call the card a dead link');
  // The alt text goes into an HTML attribute unescaped, so it must not carry a
  // quote. Pinned rather than escaped at the point of use: a card description
  // that needs escaping is a sign the copy changed shape, not a case to absorb.
  assert.ok(!/["'<>&]/.test(SOCIAL_CARD_ALT), 'card alt text needs escaping');
});

test('a venture that later declares its own card gets it reconciled, not duplicated', () => {
  // No venture does today. The rule exists because the gap in exactly this
  // rule is what let `og:url` ship broken to 64 pages.
  const html =
    '<head><meta charset="utf-8">' +
    '<meta property="og:image" content="https://example.invalid/own-card.png">' +
    '<meta name="twitter:card" content="summary">' +
    '</head>';
  const out = injectMirrorTags(html, { slug: 'demo', file: 'index.html' });
  assert.equal((out.match(/property="og:image"/g) ?? []).length, 1);
  assert.equal((out.match(/name="twitter:card"/g) ?? []).length, 1);
  assert.ok(!out.includes('own-card.png'));
  assert.ok(!out.includes('content="summary">'), 'the venture\'s smaller card type must not survive');
});

test('every mirrored path is one nginx can actually route', async () => {
  // The silent failure this guards: a venture whose slug or filename falls
  // outside the character classes in `front-door/default.conf` would be
  // generated, committed, mounted, and 404 on every request, with no test in
  // the tree failing. Checked here against the same patterns the config uses.
  const { files } = await buildMirror();
  for (const { slug, file } of files) {
    assert.match(slug, ROUTABLE_SLUG, `${slug} is not routable`);
    // `ROUTABLE_SUBPATH`, not `ROUTABLE_FILE`: a mirrored file may sit one
    // page subdirectory down (`tool/index.html`). Two levels is still refused,
    // because only one separator is decoded on the nginx side.
    assert.match(file, ROUTABLE_SUBPATH, `${slug}/${file} is not routable`);
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
  const { stored, shards } = await buildMirror();
  assert.deepEqual(
    shards.map((s) => s.name),
    shards.map((_, i) => shardName(i)),
  );
  const packed = shards.flatMap((s) => s.files.map((f) => f.key));
  // Against `stored` rather than `files`: only the stored copies are packed,
  // and an aliased name is served by the `map` instead of by a shard of its own.
  assert.deepEqual(packed.slice().sort(), stored.map((f) => f.key).sort());
  assert.equal(new Set(packed).size, packed.length, 'a file was packed into two shards');
});

test('packShards refuses a file no shard could hold', () => {
  // A single file larger than the shard ceiling cannot be placed anywhere, and
  // the packer has to say so rather than emit a shard over the cap — which
  // would apply cleanly right up until etcd rejected it.
  assert.throws(
    () => packShards([{ key: 'a__big.mjs', bytes: Buffer.alloc(2048) }], 1024),
    /larger than the 1024-byte shard ceiling/,
  );
});

test('a trailing runt shard is absorbed rather than mounted as its own ConfigMap', () => {
  // Declaration-order packing can leave a last shard holding almost nothing —
  // too small to need `ServerSideApply`, but carrying the annotation anyway,
  // which the "asks for the apply mode its size actually requires" test below
  // refuses. Previous sessions fixed each occurrence by hunting a STARTER_SET
  // position that happened not to fragment, or by spending a few more KiB of
  // ceiling; both come back the next time a mirrored venture gains a page.
  // The packer now pulls files back from the previous shard instead.
  const ceiling = 1000;
  const runt = 150;
  const files = [
    { key: 'a__1.mjs', bytes: Buffer.alloc(600) },
    { key: 'a__2.mjs', bytes: Buffer.alloc(350) },
    // 950 + 100 overflows, so without absorption this lands alone in a
    // 100-byte second shard.
    { key: 'b__1.mjs', bytes: Buffer.alloc(100) },
  ];
  const shards = packShards(files, ceiling, runt);
  const last = shards[shards.length - 1];
  assert.ok(
    last.bytes > runt,
    `the trailing shard was left as a ${last.bytes}-byte runt instead of absorbing from its predecessor`,
  );
  // Absorption must not lose or duplicate a file.
  const packed = shards.flatMap((s) => s.files.map((f) => f.key));
  assert.deepEqual(packed.slice().sort(), files.map((f) => f.key).sort());
  // Every shard still respects the ceiling it was packed against.
  for (const shard of shards) {
    assert.ok(shard.bytes <= ceiling, `${shard.name} is ${shard.bytes} bytes, over the ${ceiling} ceiling`);
    assert.ok(shard.files.length > 0, `${shard.name} is empty and would mount as an empty ConfigMap`);
  }
});

test('absorbing a runt never pushes the receiving shard over the ceiling', () => {
  // The donor shard shrinks monotonically, so it is safe by inspection; the
  // *receiving* shard grows, and nothing about the loop bounds that except
  // the guard. A donor file large enough to breach the ceiling must stop the
  // transfer and leave the runt in place — a small ConfigMap is a cosmetic
  // problem, one over etcd's object cap is an outage.
  const ceiling = 1000;
  const runt = 150;
  const files = [
    { key: 'a__1.mjs', bytes: Buffer.alloc(100) },
    // The only file the donor could give back is 900 bytes, which would take
    // the 120-byte runt to 1020 — over the ceiling. The runt has to stay.
    { key: 'a__2.mjs', bytes: Buffer.alloc(900) },
    { key: 'b__1.mjs', bytes: Buffer.alloc(120) },
  ];
  const shards = packShards(files, ceiling, runt);
  for (const shard of shards) {
    assert.ok(shard.bytes <= ceiling, `${shard.name} is ${shard.bytes} bytes, over the ${ceiling} ceiling`);
  }
  const packed = shards.flatMap((s) => s.files.map((f) => f.key));
  assert.deepEqual(packed.slice().sort(), files.map((f) => f.key).sort());
});

test('absorbing a runt never drains its donor to an empty shard', () => {
  // A projected volume with an empty ConfigMap source is a wasted object at
  // best; draining the donor entirely would also renumber every shard after
  // it. The donor keeps at least one file however small the runt stays.
  const ceiling = 1000;
  const runt = 150;
  const files = [
    // The donor holds exactly one file, so giving it back would empty it.
    { key: 'a__1.mjs', bytes: Buffer.alloc(900) },
    { key: 'b__1.mjs', bytes: Buffer.alloc(150) },
  ];
  const shards = packShards(files, ceiling, runt);
  for (const shard of shards) {
    assert.ok(shard.files.length > 0, `${shard.name} is empty and would mount as an empty ConfigMap`);
  }
  const packed = shards.flatMap((s) => s.files.map((f) => f.key));
  assert.deepEqual(packed.slice().sort(), files.map((f) => f.key).sort());
});

test('a duplicate ConfigMap key is refused rather than mounted', () => {
  // Two sources of a projected volume offering the same key makes the volume
  // fail to mount, and `maxUnavailable: 0` turns that into a stale front door
  // rather than a visible failure. Cheaper to catch here.
  assert.throws(
    () => packShards([
      { key: 'a__index.html', bytes: Buffer.alloc(1) },
      { key: 'a__index.html', bytes: Buffer.alloc(1) },
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
  // At ~600 KB the mirror is over that by more than a factor of two, so without
  // `ServerSideApply=true` the ConfigMap never applies at all — the front door
  // keeps serving its old, toolless pods and `prod` sits Degraded. That is the
  // whole point of the annotation, so pin both halves: that it is emitted, and
  // that the size making it necessary is real rather than assumed.
  const { shards } = await buildMirror();
  for (const shard of shards) {
    assert.ok(
      shard.bytes > CLIENT_SIDE_APPLY_CEILING,
      `${shard.name} is ${shard.bytes} bytes, under the ${CLIENT_SIDE_APPLY_CEILING}-byte ` +
        'client-side apply cap — if that is deliberate, this test and the annotation it ' +
        'guards can go',
    );
  }
  const kustomization = renderKustomization(shards);
  const annotations = kustomization.match(
    new RegExp(`${SYNC_OPTIONS_ANNOTATION}: ${SYNC_OPTIONS}`, 'g'),
  );
  // One per generator, not just one somewhere in the file: an annotation on
  // the first shard and not the fourth is the same outage, three shards later.
  assert.equal(annotations.length, shards.length);
  // Under `options:`, not as a stray top-level key that kustomize would reject.
  assert.match(
    kustomization,
    /\n    options:\n      annotations:\n        argocd\.argoproj\.io\/sync-options: ServerSideApply=true\n/,
  );
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
    // Escape with the renderer's own helper, not a partial copy of it: this
    // line re-escaped only `&`, so the first title containing an apostrophe
    // failed the assertion against perfectly correct output.
    assert.ok(html.includes(escapeHtml(tool.title)), `${tool.title} is not named`);
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
  // The trailing slash is required, not optional. `/?$` here served the entry
  // page at `/tools/<slug>` too, and a browser then resolves that page's
  // relative references against `/tools/` — one directory above the mirror —
  // so every same-directory link, stylesheet and module on it 404s while the
  // page itself renders with a 200. The slashless spelling gets its own
  // redirect block, asserted below.
  assert.match(conf, /location ~ "\^\/tools\/\(\?<slug>\[a-z0-9\]\[a-z0-9-\]\*\)\/\$"/);
  assert.match(conf, /rewrite \^ \/\$\{slug\}__index\.html break;/);
  assert.match(
    conf,
    /location ~ "\^\/tools\/\(\?<rslug>\[a-z0-9\]\[a-z0-9-\]\*\)\$" \{\s*\n\s*return 301 \/tools\/\$rslug\/\$is_args\$args;/,
    'the slashless /tools/<slug> spelling must redirect to the canonical trailing-slash form',
  );

  // The four properties a gz-only mirror needs from every `/tools/` location
  // that serves bytes, each of which is a silent whole-mirror 404 if it is
  // missing. The redirect block above serves none, so it is separated out here
  // rather than exempted by name — a block that stops redirecting and starts
  // serving rejoins the checked set on the next run.
  const allToolBlocks = conf.match(/location ~ "\^\/tools\/[\s\S]*?\n  \}/g) ?? [];
  const redirectBlocks = allToolBlocks.filter((b) => /return 301/.test(b));
  const toolBlocks = allToolBlocks.filter((b) => !/return 301/.test(b));
  assert.equal(redirectBlocks.length, 1, 'exactly one /tools/ block is a redirect');
  // Nine since 18 ventures' own pages started offering a same-origin `.py`
  // CLI download (`DOWNLOADABLE_CLI_FILES` in `build.mjs`): five for a flat
  // venture (root, `.mjs`, `LICENSE`, `.py`, anything else) and the same
  // four one level down -- no venture nests its downloadable CLI inside a
  // page subdirectory, so there is no tenth block for that shape yet.
  assert.equal(toolBlocks.length, 9, 'the mirror is routed by nine location blocks');
  for (const block of toolBlocks) {
    // `gzip_static always`, not `on`: `on` only consults the stored `.gz` when
    // the client sent `Accept-Encoding: gzip`, and falls through to a plain
    // file that a gz-only mirror does not have.
    assert.match(block, /gzip_static always;/, `a /tools/ block does not serve the stored .gz:\n${block}`);
    // `gunzip on`, or every client that did not ask for gzip gets bytes it
    // cannot read with a 200.
    assert.match(block, /gunzip on;/, `a /tools/ block cannot answer a non-gzip client:\n${block}`);
    // `try_files` stats the *uncompressed* name, which does not exist here, so
    // it would 404 before `gzip_static` ran. This is the trap, and it looks
    // correct.
    assert.doesNotMatch(block, /try_files/, `a /tools/ block still uses try_files:\n${block}`);
    // A positional `$1` in a `rewrite` replacement refers to the rewrite's own
    // regex (`^`, which captures nothing), not to the location's — so it
    // resolves to the empty string and asks for `__index.html`.
    assert.doesNotMatch(
      block,
      /rewrite \^ \/\$\d/,
      `a /tools/ block uses a positional capture in its rewrite, which resolves empty:\n${block}`,
    );
    // The `X-Robots-Tag` assertion that used to sit here moved to
    // 'an indexable mirror never also ships a noindex header': it is a policy
    // that follows `TOOLS_HOST_SERVES` and differs between the page blocks and
    // the source-file blocks, where every property above is a routing
    // invariant that holds for all eight regardless.
  }

  // `.mjs` must be typed, or the module is refused and every calculator is an
  // inert form that still returns 200.
  assert.match(conf, /\\\.mjs\)\$"[\s\S]{0,900}default_type text\/javascript;/);
  // ...and its block must come before the general file rule, since nginx takes
  // the first matching regex location.
  assert.ok(conf.indexOf('\\.mjs)$"') < conf.indexOf('<any_file>[A-Za-z0-9._-]+)$"'));
  // The same ordering one level down, where the same trap applies: the
  // subdirectory `.mjs` rule is the only one of the three that can set a type,
  // so a general subdirectory rule placed above it would serve every sub-tool's
  // modules untyped and the page would render inert with a 200.
  assert.ok(
    conf.indexOf('<sdm_file>[A-Za-z0-9._-]+\\.mjs)$"') <
      conf.indexOf('<sda_file>[A-Za-z0-9._-]+)$"'),
    'the subdirectory .mjs rule must precede the general subdirectory rule',
  );
  // The directory-index rule takes the trailing slash and rewrites to
  // `index.html`, for the same reason the venture-root rule does: a flattened
  // key has no `index.html` to append.
  assert.match(
    conf,
    /rewrite \^ \/\$\{sd_slug\}__\$\{sd_dir\}__index\.html break;/,
    'the subdirectory index rule must rewrite to __index.html',
  );
  // Both segments of a subdirectory path are captured with the *slug* class,
  // not the filename class. That is what keeps `/tools/<slug>/calc.mjs` and
  // `/tools/<slug>/LICENSE` from ever being read as a directory: neither a dot
  // nor an uppercase letter can match it.
  for (const prefix of ['sd', 'sdm', 'sdl', 'sda']) {
    assert.ok(
      conf.includes(`(?<${prefix}_dir>${ROUTABLE_SLUG.source.replace(/^\^|\$$/g, '')})`),
      `the ${prefix} block's directory capture is not ROUTABLE_SLUG's class`,
    );
  }
});

test('every stored key is one the nginx rewrites reconstruct', async () => {
  // The encoding lives in two places that cannot import each other: the
  // generator writes `<slug>__<file>.gz`, and `gzip_static` finds it by
  // appending `.gz` to the URI the `rewrite` produced. This walks the real
  // mirror and rebuilds each key the way nginx would, so a change to either
  // side without the other fails here rather than as a 404 in production.
  const { files } = await buildMirror();
  for (const file of files) {
    const url = mirrorUrl(file.slug, file.file);
    const [, slug, tail] = url.match(/^\/tools\/([^/]+)\/(.*)$/);
    // Rebuilt the way the `location` blocks do: every `/` in the tail becomes
    // the same `__` separator that joins the slug, and an empty tail (or one
    // that is only a directory) is `index.html` rather than an empty filename.
    // That last case is why the trailing-slash rules exist at all — a
    // flattened key cannot have `index.html` appended to it by nginx.
    const segments = tail.split('/');
    if (segments[segments.length - 1] === '') segments[segments.length - 1] = 'index.html';
    assert.equal(`${slug}__${segments.join('__')}.gz`, file.stored);
    assert.equal(storedKey(file.slug, file.file), file.stored);
  }
});

test('the stored bytes inflate to the page, with a gzip header that does not drift', async () => {
  // The mirror is committed, so its bytes have to be reproducible or the
  // staleness check fails on every regeneration. Node writes a fixed header —
  // no mtime, no filename — and this pins it so a runtime upgrade that changed
  // it shows up here rather than as an unexplained multi-megabyte diff.
  const sample = '<!doctype html><html><head><title>x</title></head><body>hello</body></html>';
  const gz = compress(sample);
  assert.ok(gz.subarray(0, GZIP_HEADER.length).equals(GZIP_HEADER), gz.subarray(0, 10).toString('hex'));
  assert.equal(zlib.gunzipSync(gz).toString('utf8'), sample);
  assert.ok(compress(sample).equals(gz), 'compression is not deterministic');
});

test('discovery admits every venture the mirror can serve, and no curated one twice', async () => {
  // `STARTER_SET` is the order and the argued-for core; discovery appends
  // everything else that is flat, routable and self-contained. The mirror is
  // worth having only if that second half is substantially larger than the
  // first — that is the whole reason compression was worth doing.
  const discovered = await discoverEligible();
  const curated = new Set(STARTER_SET.map((entry) => entry.slug));
  for (const slug of discovered) {
    assert.ok(!curated.has(slug), `${slug} is both curated and discovered, so it would mirror twice`);
    assert.match(slug, ROUTABLE_SLUG);
  }
  assert.deepEqual(discovered, discovered.slice().sort(), 'discovery order must be stable');
  assert.ok(
    discovered.length > curated.size,
    `discovery found ${discovered.length} ventures beyond the ${curated.size} curated ones`,
  );
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

test('a relative image the mirror does not store is not a dead link, but a missing page still is', () => {
  const files = [{ slug: 'a', file: 'index.html', contents: '<img src="renders/hero.webp"><img src="b.PNG"><a href="gone.html">' }];
  const problems = validateLinks(files);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /gone\.html/);
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

test('an href built from a template string in a script is not a dead link', () => {
  // The defect: `validateLinks` ran one regex over the whole document, so a
  // page building hrefs in JS was judged on its unexpanded source. That is
  // what held `marketplace-fee-compare` — a finished, linked-to comparison
  // page — off the apex, for a link that resolves fine in a browser.
  const page = {
    slug: 'a',
    file: 'index.html',
    contents: '<script>el.innerHTML = `<a href="../${tool}/">go</a>`;</script>',
  };
  assert.deepEqual(validateLinks([page]), []);
  // Not judged is not the same as unseen: it is still reported, advisorily.
  assert.deepEqual(dynamicLinks([page]), ['a/index.html → "../${tool}/"']);
});

test('a fully literal href inside a script is still checked', () => {
  // The detection the previous revision was protecting when it left the whole
  // document in scope. Narrowing to skip script bodies wholesale would lose
  // it; resolving the literal ones keeps it.
  const dead = validateLinks([
    { slug: 'a', file: 'index.html', contents: '<script>x = `<a href="../gone/">g</a>`;</script>' },
  ]);
  assert.equal(dead.length, 1);
  assert.match(dead[0], /no gone\/index\.html in the mirror/);

  // And the same literal resolves when the target is present.
  assert.deepEqual(
    validateLinks([
      { slug: 'a', file: 'index.html', contents: '<script>x = `<a href="../b/">g</a>`;</script>' },
      { slug: 'b', file: 'index.html', contents: '<p>b</p>' },
    ]),
    [],
  );
});

test('a dead link in ordinary markup is still caught', () => {
  // The regression guard that matters most: blanking script bodies must not
  // blank anything else.
  const dead = validateLinks([
    { slug: 'a', file: 'index.html', contents: '<a href="missing.html">x</a>' },
  ]);
  assert.equal(dead.length, 1);
  assert.match(dead[0], /no a\/missing\.html in the mirror/);
});

test('blanking a script body preserves the rest of the document and its length', () => {
  const html = '<a href="keep.html">k</a><script>`<a href="../drop/">d</a>`</script><b>after</b>';
  const blanked = blankScriptBodies(html);
  assert.equal(blanked.length, html.length, 'byte offsets must not shift');
  assert.ok(blanked.includes('href="keep.html"'));
  assert.ok(!blanked.includes('../drop/'));
  assert.ok(blanked.includes('<b>after</b>'), 'markup after the script survives');
  assert.ok(blanked.includes('<script>') && blanked.includes('</script>'), 'tags survive');
});

test('a style body is blanked too', () => {
  // `url(...)` in CSS is not an href/src attribute, but a stylesheet quoting
  // one in a string would read as markup to the attribute scan.
  const blanked = blankScriptBodies('<style>.a{background:url("../gone/x.png")}</style>');
  assert.ok(!blanked.includes('../gone/x.png'));
});

test('marketplace-fee-compare is served by the mirror', async () => {
  // The tool the fix above buys. Its seven `deepTool` links are what made
  // admitting it correct rather than merely quieter, so assert those resolve
  // in the mirror too — that is the property that would make serving the page
  // a disservice if it broke.
  const { files } = await buildMirror();
  const present = new Set(files.map((f) => `${f.slug}/${f.file}`));
  assert.ok(present.has('marketplace-fee-compare/index.html'));
  for (const slug of [
    'ebay-fee-calculator',
    'etsy-profit-calculator',
    'amazon-fba-calculator',
    'walmart-marketplace-calculator',
    'tiktok-shop-fee-calculator',
    'shopify-fee-calculator',
    'faire-wholesale-calculator',
  ]) {
    assert.ok(present.has(`${slug}/index.html`), `${slug} is linked at runtime but not mirrored`);
  }
});

test('every mirrored page carries a way back to the front door', async () => {
  // The defect this guards: before the return link, a mirrored page's only
  // links were its own siblings, its LICENSE, and a canonical to a host that
  // serves nothing. Every one of the tools the apex serves was a cul-de-sac,
  // so the portfolio's one working funnel was a single page deep. Asserted
  // over what is committed rather than over `injectMirrorNav` alone, because
  // the unit test would still pass if `buildMirror` stopped calling it.
  const { files } = await buildMirror();
  const pages = files.filter((f) => f.file.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    assert.ok(
      page.contents.includes(`<a class="${NAV_CLASS}" href="/">`),
      `${page.key} has no link back to the front door`,
    );
    assert.ok(
      page.contents.includes(`.${NAV_CLASS}{`),
      `${page.key} carries the return link with no rule to style it`,
    );
  }
});

test('the return link names the number of tools the mirror actually holds', async () => {
  // A hard-coded count would go stale the first time STARTER_SET changes, and
  // the front door's own copy already states a number a visitor can check by
  // counting the cards. Two surfaces disagreeing about how many free tools
  // exist is the kind of small untruth that costs trust on a page whose whole
  // pitch is that the arithmetic is honest.
  const { files, tools } = await buildMirror();
  for (const page of files.filter((f) => f.file.endsWith('.html'))) {
    assert.ok(
      page.contents.includes(`All ${tools.length} free tools on this site`),
      `${page.key} states a tool count other than ${tools.length}`,
    );
  }
});

test('the return link is hidden when a venture page is printed', () => {
  // Every mirrored venture's print stylesheet hides `header, main, footer`
  // with `!important` so that printing yields the customer proposal alone.
  // A bar that survived that would print "All 53 free tools" across the top
  // of a contractor's bid — the one page of this portfolio a stranger's own
  // customer sees.
  const html = '<head><meta charset="utf-8"></head><body><main>x</main></body>';
  const out = injectMirrorNav(injectMirrorTags(html, { slug: 'demo', file: 'index.html' }), {
    toolCount: 53,
  });
  assert.match(out, /@media print\{\.fd-back\{display:none!important\}\}/);
});

test('the return link sits inside the body it belongs to', () => {
  const html = '<html><head><meta charset="utf-8"></head><body class="x">\n<header>h</header></body></html>';
  const out = injectMirrorNav(html, { toolCount: 7 });
  assert.ok(out.indexOf('<body class="x">') < out.indexOf(`class="${NAV_CLASS}"`));
  assert.ok(out.indexOf(`class="${NAV_CLASS}"`) < out.indexOf('<header>'));
  assert.ok(out.includes('All 7 free tools'));
});

test('a quoted "<body>" inside a script does not fool the return-link injector', () => {
  // git-exposure-check's own soft-404 guide (2026-09-23): its FAQ answer
  // quotes literal markup, `<html><body>404 Not Found</body></html>`, inside
  // a <script type="application/ld+json"> block in <head> -- text describing
  // markup, not markup. A raw regex over the whole document matched that
  // quoted "<body>" first (it sits before the page's real one) and spliced
  // the return-link anchor into the middle of the JSON string.
  const html =
    '<html><head><script type="application/ld+json">' +
    '{"a":"an error page such as <html><body>404 Not Found</body></html>"}' +
    '</script></head><body class="x"><header>h</header></body></html>';
  const out = injectMirrorNav(html, { toolCount: 7 });

  const script = out.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  JSON.parse(script[1]); // throws if the anchor landed inside the JSON string
  assert.ok(out.indexOf('<body class="x">') < out.indexOf(`class="${NAV_CLASS}"`));
  assert.ok(out.indexOf(`class="${NAV_CLASS}"`) < out.indexOf('<header>'));
});

test('injectMirrorNav refuses a document with no body rather than inventing one', () => {
  // Prepending to a bodyless file would put the anchor outside <html>, where
  // it renders but no stylesheet in the document reaches it.
  assert.throws(() => injectMirrorNav('<head><meta charset="utf-8"></head>', { toolCount: 1 }), {
    message: /no <body> tag/,
  });
});

test('no venture source already uses the return link class', async () => {
  // The rule is injected near the top of <head>, ahead of the venture's own
  // <style>, so a venture that used this class would win the cascade and the
  // return link would inherit whatever that class means to it.
  for (const { slug } of STARTER_SET) {
    for (const file of await ventureFiles(slug)) {
      if (!file.endsWith('.html')) continue;
      const raw = await fs.readFile(path.join(REPO_ROOT, 'ventures', slug, file), 'utf8');
      assert.ok(
        !raw.includes(NAV_CLASS),
        `${slug}/${file} already uses "${NAV_CLASS}" — rename NAV_CLASS rather than shipping the collision`,
      );
    }
  }
});

test('every mirrored entry page offers sibling tools, and no other page does', async () => {
  // The defect this guards is the one `injectMirrorNav` half-fixed: the return
  // link reaches the catalogue, but it asks a visitor who has just got their
  // number to go back to a page of 169 and work out which others apply to
  // them. Asserted over what is committed rather than over
  // `injectMirrorRelated` alone, because the unit test below would still pass
  // if `buildMirror` stopped calling it.
  //
  // The negative half matters as much: a venture's sub-pages are its own
  // articles and comparisons, and a block of other trades' calculators at the
  // foot of each would be 375 more places to go stale for no added reach the
  // entry page does not already give.
  const { files } = await buildMirror();
  const pages = files.filter((f) => f.file.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const has = page.contents.includes(`<nav class="${RELATED_CLASS}"`);
    if (page.file === 'index.html') {
      assert.ok(has, `${page.key} is an entry page with no sibling tools offered`);
      assert.ok(
        page.contents.includes(`.${RELATED_CLASS}{`),
        `${page.key} offers siblings with no rule to style them`,
      );
      assert.equal(
        page.contents.match(new RegExp(`<nav class="${RELATED_CLASS}"`, 'g')).length,
        1,
        `${page.key} carries more than one sibling block`,
      );
    } else {
      assert.ok(!has, `${page.key} is not an entry page but offers sibling tools`);
      assert.ok(
        !page.contents.includes(`.${RELATED_CLASS}{`),
        `${page.key} pays for the sibling rule with no element to match it`,
      );
    }
  }
});

test('every tool a mirrored page offers is one the mirror actually serves', async () => {
  // `validateLinks` already refuses a dead *relative* link. These are
  // root-absolute `/tools/<slug>/`, which it used to wave through against the
  // apex root allowlist — so this is the assertion that makes the new links as
  // checked as a venture's own. A stranger following one to a 404 on the one
  // page the portfolio can show them is the failure being ruled out.
  const { files } = await buildMirror();
  const present = new Set(files.map((f) => `${f.slug}/${f.file}`));
  let offered = 0;
  for (const page of files.filter((f) => f.file === 'index.html')) {
    const block = page.contents.match(
      new RegExp(`<nav class="${RELATED_CLASS}"[\\s\\S]*?</nav>`),
    );
    assert.ok(block, `${page.key} has no sibling block to check`);
    const hrefs = [...block[0].matchAll(/href="([^"]*)"/g)].map(([, href]) => href);
    assert.equal(hrefs.length, RELATED_LIMIT, `${page.key} offers ${hrefs.length} tools`);
    for (const href of hrefs) {
      const slug = href.replace(/^\/tools\//, '').replace(/\/$/, '');
      assert.ok(present.has(`${slug}/index.html`), `${page.key} offers ${href}, which is not mirrored`);
      assert.notEqual(slug, page.slug, `${page.key} offers itself`);
      offered += 1;
    }
  }
  assert.ok(offered > 0);
});

test('validateLinks catches a sibling offer the mirror does not serve', () => {
  // The guarantee above is only worth having if the checker can actually fail.
  // Without the `/tools/` branch this link was measured against the apex root
  // allowlist and reported as "the document root serves only /, /favicon.svg,
  // …" — a true sentence about the wrong address space, and one that would
  // have been silenced by adding the path to that allowlist.
  const problems = validateLinks([
    {
      slug: 'demo',
      file: 'index.html',
      contents: '<body><a href="/tools/not-mirrored/">gone</a></body>',
    },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no not-mirrored\/index\.html in the mirror/);
});

test('the tools a page offers come from build.mjs’ ranking, not a second one here', () => {
  // `CLAUDE.md` records two occasions where restating a `build.mjs` rule in
  // this module cost live product, so the ranking is imported. This asserts
  // the import is load-bearing: same sub-group first is what makes a fence
  // page offer another outdoor trade rather than whichever four a flat
  // rotation lands on.
  const surfaces = [
    { slug: 'fence-bid-calculator', title: 'Fence' },
    { slug: 'deck-bid-calculator', title: 'Deck' },
    { slug: 'pergola-bid-calculator', title: 'Pergola' },
    { slug: 'ebay-fee-calculator', title: 'eBay' },
    { slug: 'etsy-profit-calculator', title: 'Etsy' },
  ];
  const picked = relatedTools(surfaces, 'fence-bid-calculator', RELATED_LIMIT).map((s) => s.slug);
  assert.ok(!picked.includes('fence-bid-calculator'));
  // The marketplace tools are in a different category, so they rank last.
  assert.ok(
    picked.indexOf('ebay-fee-calculator') > picked.indexOf('deck-bid-calculator'),
    `a trades page offered a marketplace tool ahead of a trades one: ${picked.join(', ')}`,
  );
});

test('the sibling block states its own layout rather than inheriting a venture’s', async () => {
  // The hazard is not hypothetical and specificity alone does not close it.
  // These rules are injected ahead of the venture's own <style>, so a class
  // selector beats a bare element one — but only for properties the class
  // rule states. Three mirrored ventures set `display` on a bare `nav`, `ul`
  // or `p`: `faire-wholesale-calculator`'s `nav{display:flex}` would lay the
  // heading beside the list, and a bare `p{display:none}` would delete the
  // heading. Both reach the block through a property an unstated rule leaves
  // open.
  for (const selector of [RELATED_CLASS, `${RELATED_CLASS} p`, `${RELATED_CLASS} ul`]) {
    assert.match(
      RELATED_STYLE,
      new RegExp(`\\.${selector.replace(' ', ' \\.?')}\\{[^}]*display:`),
      `.${selector} does not state a display, so a venture's bare element rule decides it`,
    );
  }
  // And the hazard is still live in the mirror — if it ever stops being, this
  // assertion is what says the guard above may be reconsidered rather than
  // quietly kept forever.
  const risky = [];
  for (const { slug } of STARTER_SET) {
    for (const file of await ventureFiles(slug)) {
      if (file !== 'index.html') continue;
      const raw = await fs.readFile(path.join(REPO_ROOT, 'ventures', slug, file), 'utf8');
      if (/(?:^|[;{}>\s])(?:nav|ul|p)\s*\{[^}]*display\s*:/.test(raw)) risky.push(slug);
    }
  }
  assert.ok(risky.length > 0, 'no venture styles a bare nav/ul/p display any more');
});

test('the sibling block is hidden when a venture page is printed or embedded', () => {
  // Same two reasons as the return link. A contractor's printed bid is the one
  // page of this portfolio a stranger's own customer sees, and it must not
  // carry a list of other calculators; and an embedded calculator inside
  // someone else's page has no business advertising the rest of this site.
  assert.match(RELATED_STYLE, /@media print\{\.fd-related\{display:none!important\}\}/);
  assert.ok(RELATED_STYLE.includes(`.pf-embed .${RELATED_CLASS}{display:none}`));
});

test('injectMirrorRelated refuses a document with no closing body', () => {
  assert.throws(
    () =>
      injectMirrorRelated('<body><main>x</main>', {
        file: 'index.html',
        related: [{ slug: 'demo', title: 'Demo' }],
      }),
    { message: /no <\/body>/ },
  );
});

test('injectMirrorRelated leaves a page alone when there is nothing to offer', () => {
  // A one-venture mirror (every fixture-driven test in this file) has no
  // siblings to name, and an empty list rendered as an empty <ul> would be a
  // heading promising links that are not there.
  const html = '<body><main>x</main></body>';
  assert.equal(injectMirrorRelated(html, { file: 'index.html', related: [] }), html);
  assert.equal(injectMirrorRelated(html, { file: 'guide.html', related: [{ slug: 'a', title: 'A' }] }), html);
});

test('no venture source already uses the sibling block class', async () => {
  // Same cascade hazard as the return link: the rule is injected near the top
  // of <head>, ahead of the venture's own <style>.
  for (const { slug } of STARTER_SET) {
    for (const file of await ventureFiles(slug)) {
      if (!file.endsWith('.html')) continue;
      const raw = await fs.readFile(path.join(REPO_ROOT, 'ventures', slug, file), 'utf8');
      assert.ok(
        !raw.includes(RELATED_CLASS),
        `${slug}/${file} already uses "${RELATED_CLASS}" — rename RELATED_CLASS rather than shipping the collision`,
      );
    }
  }
});

test('every unmirrored venture is explained, and a collateral drop is not blamed on itself', async () => {
  // The report is only worth having if its reasons are the fixpoint's real
  // ones. Re-checking an excluded venture on its own does not give those: in
  // isolation every cross-venture link reads as dead, so a page that is merely
  // collateral would be reported as broken and a session would go "fix" a
  // page that is fine. `discoverEligible`'s drop log is what prevents that,
  // and this is what keeps it wired up.
  const excluded = await explainIneligible();
  const served = new Set([...STARTER_SET.map((e) => e.slug), ...(await discoverEligible())]);
  for (const entry of excluded) {
    assert.ok(!served.has(entry.slug), `${entry.slug} is both served and reported as excluded`);
    assert.ok(entry.reason, `${entry.slug} has no reason`);
    assert.notEqual(
      entry.kind,
      'unexplained',
      `${entry.slug} is excluded but the drop log does not know why — discovery and the report disagree`,
    );
  }
  // Every venture is either served or explained; nothing falls between them.
  const dirs = (await fs.readdir(path.join(REPO_ROOT, 'ventures'), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const accounted = new Set([...served, ...excluded.map((e) => e.slug)]);
  for (const slug of dirs) {
    assert.ok(accounted.has(slug), `${slug} is neither mirrored nor explained`);
  }
});

test('a collateral drop names a later pass than the venture that caused it', async () => {
  // The distinction the report exists to make. `appointment-deposit-calculator`
  // is fine on its own and drops only because `no-show-fee-calculator` loads
  // `src/app.mjs` from a subdirectory the flat key encoding cannot represent —
  // one venture costing three off the front door. If that ever stops being
  // true this test should be updated to whatever the new shape is, not deleted:
  // the property under test is that pass 1 and pass 2+ mean different things.
  const excluded = await explainIneligible();
  for (const entry of excluded.filter((e) => e.kind === 'collateral')) {
    assert.ok(entry.pass > 1, `${entry.slug} is collateral but dropped on pass ${entry.pass}`);
    assert.match(entry.reason, /collateral \(pass \d+\)/);
  }
  for (const entry of excluded.filter((e) => e.kind === 'dead-link')) {
    assert.equal(entry.pass, 1, `${entry.slug} is a first-pass drop but reports pass ${entry.pass}`);
  }
});

// --- the Deployment's mount list -------------------------------------------
//
// `writeMirror` regenerates the shards and the Deployment that mounts them in
// one call, because a tree carrying only half of that is the exact state
// `test_portfolio_front_mounts_every_generated_mirror_shard` rejects. These
// pin the writer against a copy of the file rather than the real one, so a
// failing test can never leave `gitops/prod/portfolio-front.yaml` rewritten.

const deploymentFixture = async (shardNames) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mount-list-'));
  const file = path.join(dir, 'portfolio-front.yaml');
  const sources = shardNames
    .map((name) => `              - configMap:\n                  name: ${name}\n`)
    .join('');
  await fs.writeFile(
    file,
    '        - name: tools\n' +
      '          # a comment the writer must not disturb\n' +
      '          projected:\n' +
      '            sources:\n' +
      sources +
      '        - name: conf\n',
  );
  return file;
};

test('the mount list is rewritten when the shard count grows', async () => {
  // The case this automation exists for: one more comparison page tips the
  // packer over SHARD_BYTE_CEILING and opens a shard nothing mounted.
  const file = await deploymentFixture([shardName(0), shardName(1)]);
  const result = await writeMountList([0, 1, 2].map((i) => ({ name: shardName(i) })), file);
  assert.equal(result.changed, true);
  const after = await fs.readFile(file, 'utf8');
  assert.match(after, new RegExp(`name: ${shardName(2)}`));
  assert.equal((after.match(/- configMap:/g) || []).length, 3);
});

test('the mount list is rewritten when the shard count shrinks', async () => {
  // The other direction, which is the one that wedges the cluster: a mounted
  // ConfigMap nothing generates leaves the pods in ContainerCreating.
  const file = await deploymentFixture([0, 1, 2].map((i) => shardName(i)));
  const result = await writeMountList([{ name: shardName(0) }], file);
  assert.equal(result.changed, true);
  const after = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(after, new RegExp(`name: ${shardName(1)}`));
  assert.equal((after.match(/- configMap:/g) || []).length, 1);
});

test('rewriting the mount list leaves the surrounding file intact', async () => {
  // The volume's long comment explains why it is projected at all; a
  // structural YAML round-trip would reflow it away, so the writer is a
  // targeted replacement and this is what says so.
  const file = await deploymentFixture([shardName(0)]);
  await writeMountList([{ name: shardName(0) }, { name: shardName(1) }], file);
  const after = await fs.readFile(file, 'utf8');
  assert.match(after, /# a comment the writer must not disturb/);
  assert.match(after, /^ {8}- name: conf$/m);
});

test('an unchanged mount list is reported as unchanged and not rewritten', async () => {
  const file = await deploymentFixture([shardName(0), shardName(1)]);
  const before = await fs.readFile(file, 'utf8');
  const result = await writeMountList([{ name: shardName(0) }, { name: shardName(1) }], file);
  assert.equal(result.changed, false);
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('a restructured volume fails loudly rather than silently writing nothing', async () => {
  // If someone reshapes the volume, the writer must not quietly no-op and let
  // a stale mount list reach the cluster wearing a successful --write.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mount-list-'));
  const file = path.join(dir, 'portfolio-front.yaml');
  await fs.writeFile(file, '        - name: tools\n          emptyDir: {}\n');
  await assert.rejects(() => writeMountList([{ name: shardName(0) }], file), /could not find/);
});

test('the committed Deployment already mounts exactly the committed shards', async () => {
  // The staleness assertion for this file, matching how the mirror's own
  // freshness is pinned above: the real file must equal what the writer would
  // produce from the shards actually committed in kustomization.yaml.
  const kustomization = await fs.readFile(path.join(await scratchMirror(), 'kustomization.yaml'), 'utf8');
  const generated = [...new Set(kustomization.match(/portfolio-front-tools-\d+/g) || [])].sort(
    (a, b) => Number(a.split('-').pop()) - Number(b.split('-').pop()),
  );
  assert.ok(generated.length > 1, 'expected the committed mirror to be sharded');
  const deployment = await fs.readFile(FRONT_DOOR_DEPLOYMENT, 'utf8');
  assert.ok(
    deployment.includes(renderMountSources(generated.map((name) => ({ name })))),
    'gitops/prod/portfolio-front.yaml does not mount exactly the committed shards — ' +
      'regenerate with `node platform/marketing/front-door-tools.mjs --write`',
  );
});

// --- conflict markers -------------------------------------------------------

test('a page carrying a conflict marker is refused, not mirrored', () => {
  // The regression this exists for: on 2026-09-02 a conflict hunk reached
  // main in a venture's index.html and the next regeneration packed it into
  // the shard the apex serves, so visitors saw `<<<<<<< HEAD` and the
  // paragraph twice. The venture's own suite passed throughout, because its
  // assertions matched links present on both sides of the hunk.
  const files = [{ key: 'demo__index.html', contents: '<p>a</p>\n<<<<<<< HEAD\n<p>b</p>\n' }];
  assert.throws(() => assertNoConflictMarkers(files), /unresolved merge-conflict marker/);
});

test('each conflict marker git writes is caught', () => {
  for (const marker of ['<<<<<<< HEAD', '=======', '>>>>>>> origin/main']) {
    assert.throws(
      () => assertNoConflictMarkers([{ key: 'demo__index.html', contents: `<p>a</p>\n${marker}\n` }]),
      /unresolved merge-conflict marker/,
      `${marker} was not caught`,
    );
  }
});

test('prose that merely contains angle brackets is not a conflict', () => {
  // The check is anchored to the line start. A page explaining a diff, or one
  // with `=======` inside a sentence, is legitimate content and must build.
  const files = [
    { key: 'demo__index.html', contents: '<p>compare a &gt;&gt;&gt;&gt;&gt;&gt;&gt; b</p>\n' },
    { key: 'demo__faq.html', contents: '<p>the ======= rule is a horizontal one</p>\n' },
  ];
  assert.doesNotThrow(() => assertNoConflictMarkers(files));
});

test('no committed mirror page carries a conflict marker', async () => {
  // The end-to-end form, over what is actually committed. `buildMirror` itself
  // now throws on one, so this asserts the committed tree is clean rather than
  // just that the guard exists.
  const { files } = await buildMirror();
  assert.doesNotThrow(() => assertNoConflictMarkers(files));
});

// ---------------------------------------------------------------------------
// Page subdirectories, and the `<link>` rels the mirror strips.
//
// Both of these landed on 2026-09-02 to close the same gap from two sides:
// three finished, tested, free static tools were being held off the apex by
// `discoverEligible`, not because anything about them was wrong but because
// the mirror could not express what their pages linked to. Two of the three
// are now served. The tests below are the regression guards for each half.
// ---------------------------------------------------------------------------

test('a <link> the mirror strips is not held against the venture that carries it', () => {
  // `einvoice-preflight/index.html` carries `<link rel="sitemap" href=
  // "sitemap.xml">`. `sitemap.xml` is deliberately not mirrored — it describes
  // the tools host's URLs — so `validateLinks` reported a dead link and the
  // whole venture was dropped. It is not a dead link: `injectMirrorTags`
  // deletes the element, so no browser ever resolves that href.
  const page =
    '<html><head><meta charset="utf-8">' +
    '<link rel="sitemap" type="application/xml" href="sitemap.xml">' +
    '<link rel="canonical" href="nowhere.html">' +
    '<link rel="icon" href="missing.png">' +
    '</head><body><a href="index.html">home</a></body></html>';
  const files = [{ slug: 'demo', file: 'index.html', contents: page }];
  assert.deepEqual(validateLinks(files), []);

  // ...and the reason it is not a problem is that the tag really is gone.
  const mirrored = injectMirrorTags(page, { slug: 'demo', file: 'index.html' });
  assert.ok(!/rel=["']sitemap["']/i.test(mirrored), 'the sitemap link survived injectMirrorTags');
  assert.ok(!mirrored.includes('nowhere.html'), 'the venture canonical survived');
  assert.ok(!mirrored.includes('missing.png'), 'the venture icon survived');

  // A real navigable link to something absent is still a problem — the point
  // is to stop policing tags the mirror removes, not to stop policing.
  assert.equal(
    validateLinks([
      { slug: 'demo', file: 'index.html', contents: '<a href="gone.html">g</a>' },
    ]).length,
    1,
  );
});

test('blanking a stripped link preserves every byte offset around it', () => {
  // Same contract as `blankScriptBodies`: only the element's own characters
  // change, so anything downstream that indexes into the document still points
  // where a human reading the source would look.
  const html = '<head><link rel="icon" href="a.png"><title>t</title></head>';
  const blanked = blankStrippedLinks(html);
  assert.equal(blanked.length, html.length);
  assert.equal(blanked.indexOf('<title>'), html.indexOf('<title>'));
  assert.ok(!blanked.includes('a.png'));
});

test('every rel the mirror strips is one validateLinks also ignores', () => {
  // The two used to be written out independently, and the drift cost a venture
  // its place in the mirror. Derived from one set now; this asserts the set is
  // what both actually use rather than trusting that they still agree.
  for (const rel of STRIPPED_LINK_RELS) {
    const html = `<head><link rel="${rel}" href="absent-${rel}.html"></head>`;
    assert.deepEqual(
      validateLinks([{ slug: 'demo', file: 'index.html', contents: html }]),
      [],
      `rel="${rel}" is stripped but still policed`,
    );
    assert.ok(
      !injectMirrorTags(html, { slug: 'demo', file: 'index.html' }).includes(`absent-${rel}.html`),
      `rel="${rel}" is ignored by validateLinks but not actually stripped`,
    );
  }
});

test('a subdirectory is mirrored only when it is a page, not a source tree', async () => {
  // The rule is "it holds its own index.html". Everything `ventures/` calls
  // `src`, `tests`, `examples`, `scripts` or `docs` fails it, which is what
  // keeps a Node source tree from being published and from spending the
  // mirror's byte ceiling on files no visitor can use.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fd-subdir-'));
  const venture = path.join(root, 'demo');
  for (const dir of ['src', 'tests', 'tool', '.hidden']) {
    await fs.mkdir(path.join(venture, dir), { recursive: true });
  }
  await fs.writeFile(path.join(venture, 'index.html'), '<html></html>');
  await fs.writeFile(path.join(venture, 'src', 'lib.mjs'), 'export const a = 1;');
  await fs.writeFile(path.join(venture, 'tests', 'run.mjs'), 'export const b = 2;');
  await fs.writeFile(path.join(venture, 'tool', 'index.html'), '<html></html>');
  await fs.writeFile(path.join(venture, 'tool', 'calc.mjs'), 'export const c = 3;');
  await fs.writeFile(path.join(venture, 'tool', 'calc.test.mjs'), 'test');
  // A page directory nginx could not route is refused rather than shipped dark.
  await fs.writeFile(path.join(venture, '.hidden', 'index.html'), '<html></html>');

  const names = await ventureFiles('demo', root);
  assert.deepEqual(names, ['index.html', 'tool/calc.mjs', 'tool/index.html']);
  await fs.rm(root, { recursive: true, force: true });
});

test('a link inside a page subdirectory resolves from its own directory', () => {
  // `consent-change-record/tool/index.html` links `../LICENSE`. Resolved from
  // the venture root instead of the file's own directory that escapes the
  // venture and reads as dead; and a sibling module would resolve one level
  // too high and read as present when the browser asks for a file that is not
  // there. Both directions are silent, so both are pinned.
  const files = [
    { slug: 'demo', file: 'LICENSE', contents: 'MIT' },
    { slug: 'demo', file: 'tool/calc.mjs', contents: '' },
    {
      slug: 'demo',
      file: 'tool/index.html',
      contents: '<a href="../LICENSE">l</a><a href="calc.mjs">c</a>',
    },
  ];
  assert.deepEqual(validateLinks(files), []);

  const wrong = [
    { slug: 'demo', file: 'calc.mjs', contents: '' },
    { slug: 'demo', file: 'tool/index.html', contents: '<a href="calc.mjs">c</a>' },
  ];
  assert.deepEqual(validateLinks(wrong), [
    'demo/tool/index.html → "calc.mjs" (no demo/tool/calc.mjs in the mirror)',
  ]);
});

test('the two ventures these fixes admitted are actually in the committed mirror', async () => {
  // The end-to-end assertion. Both were reported by `explainIneligible` as
  // held out by a link the mirror could not follow, and both are pages a
  // stranger can now open on the apex.
  const { files } = await buildMirror();
  const keys = new Set(files.map((f) => f.key));
  assert.ok(keys.has('einvoice-preflight__index.html'), 'einvoice-preflight is not mirrored');
  assert.ok(
    keys.has('consent-change-record__tool__index.html'),
    'the consent-change-record sub-tool is not mirrored',
  );
  // Its modules have to come with it, or the page renders and does nothing.
  for (const mod of ['har-diff', 'trackers', 'usage']) {
    assert.ok(keys.has(`consent-change-record__tool__${mod}.mjs`), `${mod}.mjs is missing`);
  }
  // And it must not have dragged the venture's `test/` directory along.
  assert.ok(
    ![...keys].some((k) => k.startsWith('consent-change-record__test__')),
    'the venture test directory was mirrored',
  );
});

test('every mirrored URL routes to its own stored key through the real config', async () => {
  // ## Why this test exists
  //
  // `default.conf` is delivered to a pod by Argo CD, so no test in this tree
  // executes it and `nginx -t` is not available in the sessions that change it.
  // Every other assertion about routing in this file compares the config's
  // *text* against a pattern — which catches a typo and misses the thing that
  // actually breaks: two `location` blocks whose regexes overlap, so a request
  // is answered by the wrong one. That failure is invisible in review and
  // silent in production, because the wrong block still returns 200 for some
  // paths and 404 for others.
  //
  // So this walks the mirror's real URLs through nginx's own rule — regex
  // `location` blocks are tried in file order and the first match wins — and
  // asserts each one lands on the block that reconstructs its stored key.
  //
  // The regexes are PCRE in nginx and RegExp here. The patterns in this file
  // use only character classes, anchors and named captures, which mean the same
  // thing in both, so the simulation is faithful for what it is asked to judge.
  const conf = await fs.readFile(
    path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', 'default.conf'),
    'utf8',
  );
  const blocks = [...conf.matchAll(/location ~ "([^"]+)" \{\n([\s\S]*?)\n  \}/g)].map(
    ([, pattern, body]) => {
      // The six asset blocks do not rewrite to the key directly any more: they
      // `set $fd_flat` to it and rewrite to `$fd_stored`, which
      // `00-mirror-alias.conf` maps back to the one stored copy of those bytes.
      // Follow the same indirection here, so this simulation keeps judging the
      // key a request lands on rather than the literal `$fd_stored`.
      const rewrite = body.match(/rewrite \^ \/(\S+) break;/)?.[1] ?? null;
      const flat = body.match(/set \$fd_flat "([^"]+)";/)?.[1] ?? null;
      return {
        pattern: new RegExp(pattern),
        rewrite: rewrite === '$fd_stored' ? flat : rewrite,
        typed: /default_type text\/javascript;/.test(body),
      };
    },
  );
  assert.ok(blocks.length >= 8, `only ${blocks.length} regex locations parsed out of the config`);

  const route = (url) => {
    for (const block of blocks) {
      const m = block.pattern.exec(url);
      if (!m) continue;
      // nginx substitutes `${name}` in the rewrite replacement from the
      // location's own named captures.
      const key = block.rewrite.replace(/\$\{(\w+)\}/g, (_, name) => {
        assert.ok(name in (m.groups ?? {}), `\${${name}} is not a capture of the block that matched`);
        return m.groups[name];
      });
      return { key, typed: block.typed };
    }
    return null;
  };

  const { files, aliases } = await buildMirror();
  // What `00-mirror-alias.conf`'s `map` does, as a lookup: an aliased name
  // resolves to the key that holds the bytes, anything else to itself.
  const canonical = new Map(aliases.map((a) => [a.key, a.canonical]));
  let subdirChecked = 0;
  let aliasChecked = 0;
  for (const file of files) {
    const hit = route(mirrorUrl(file.slug, file.file));
    assert.ok(hit, `no location block matches ${mirrorUrl(file.slug, file.file)}`);
    // `gzip_static` appends `.gz` to whatever the rewrite produced — after the
    // alias map has had its say — so this is the exact filename the pod opens.
    const opened = `${canonical.get(hit.key) ?? hit.key}.gz`;
    const expected = `${canonical.get(file.key) ?? file.key}.gz`;
    assert.equal(opened, expected, `${mirrorUrl(file.slug, file.file)} routes to the wrong key`);
    if (canonical.has(file.key)) aliasChecked += 1;
    // A module served without an explicit JavaScript type is refused by the
    // browser, and the page renders inert with a 200 in the log.
    assert.equal(
      hit.typed,
      file.file.endsWith('.mjs'),
      `${mirrorUrl(file.slug, file.file)} is ${hit.typed ? '' : 'not '}typed as JavaScript`,
    );
    if (file.file.includes('/')) subdirChecked += 1;
  }
  assert.ok(subdirChecked > 0, 'no page-subdirectory file was exercised, so those blocks are unproven');
  // Every aliased name must be one of the URLs walked above, or the saving is
  // being taken on files nothing routes to. Guards against an alias map built
  // over keys the config cannot reach.
  assert.equal(
    aliasChecked,
    aliases.length,
    'an aliased name was never exercised by the routing walk, so its URL is unproven',
  );

  // The directory-index form: a trailing slash has to reach `__index.html`,
  // because a flattened key has nothing for nginx to append `index.html` to.
  assert.equal(route('/tools/consent-change-record/').key, 'consent-change-record__index.html');
  assert.equal(
    route('/tools/consent-change-record/tool/').key,
    'consent-change-record__tool__index.html',
  );

  // The overlap that would be silent: a flat file must never be captured as a
  // directory by the deeper blocks, and a deep path must never be answered by
  // a flat one. Both are asserted through the same first-match-wins walk.
  assert.equal(route('/tools/demo/calc.mjs').key, 'demo__calc.mjs');
  assert.equal(route('/tools/demo/LICENSE').key, 'demo__LICENSE');
  assert.equal(route('/tools/demo/tool/calc.mjs').key, 'demo__tool__calc.mjs');
  assert.equal(route('/tools/demo/tool/LICENSE').key, 'demo__tool__LICENSE');
  assert.ok(route('/tools/demo/calc.mjs').typed, 'a flat module lost its JavaScript type');
  assert.ok(route('/tools/demo/tool/calc.mjs').typed, 'a nested module lost its JavaScript type');
  assert.ok(!route('/tools/demo/tool/LICENSE').typed, 'a LICENSE was typed as JavaScript');

  // Two levels is refused rather than answered wrongly: `ventureFiles` never
  // generates one, and the blocks decode exactly one separator.
  assert.equal(route('/tools/demo/a/b/c.html'), null, 'a two-level path found a block to answer it');
});

// The divergence this pins has now happened twice, and both times it removed
// working tools from the only host serving them.
//
// `build.mjs` decides what the canonical site publishes; this module decides
// what the apex mirrors. They answer the same question — "is this venture a
// static page, and where does it start?" — and every time the mirror has
// restated the answer instead of importing it, the copy has gone stale:
//
//   2026-09-03 (a): the mirror knew `index.html` but not `site/index.html`,
//                   so six flat static ventures were filed as apps.
//   2026-09-03 (b): the mirror knew both candidates but not that
//                   `ENTRY_OVERRIDES` exists, so `ai-engineering-academy` --
//                   a hub page and six working electronics calculators --
//                   was reported as "not a static page the mirror can serve"
//                   while `build.mjs` published all seven. The canonical host
//                   serves nothing until `portfolio-site-repo` is sealed, so
//                   those pages were public nowhere.
//
// Asserting the two agree on the whole real venture tree is what makes a
// third divergence a failing test rather than a silent absence. It compares
// behaviour, not constants, so it still holds if either side grows a rule.
test('every venture the canonical build publishes is one the mirror can resolve', async () => {
  const venturesDir = path.join(REPO_ROOT, 'ventures');
  const surfaces = await discoverSurfaces(venturesDir);
  assert.ok(surfaces.length > 100, 'discoverSurfaces returned implausibly few ventures');

  const unresolvable = [];
  for (const surface of surfaces) {
    const files = await ventureFiles(surface.slug, venturesDir).catch(() => null);
    if (!files?.includes('index.html')) unresolvable.push(surface.slug);
  }

  assert.deepEqual(
    unresolvable,
    [],
    'the canonical build publishes these ventures but the mirror finds no index.html for them — ' +
      'the entry-point rules have diverged again',
  );
});

// ---------------------------------------------------------------------------
// The embed offer.
//
// `platform/pages/embed.mjs` calls itself "Priority 1 of the
// marketing-distribution queue item" and, until 2026-09-03, shipped only on
// `tools.marisstella.dev` -- the host that fails closed on the unsealed
// `portfolio-site-repo` Secret and has never served a byte. The apex served
// all 169 tools and offered no embed at all, so the portfolio's best organic
// -distribution asset reached nobody. These tests pin the three properties
// that make the apex copy worth having rather than a second, drifting one.
// ---------------------------------------------------------------------------

test('every mirrored entry page offers an embed pointing at a host that serves', async () => {
  const { files } = await buildMirror();
  const entries = files.filter((f) => f.file === 'index.html');
  assert.ok(entries.length > 100, 'implausibly few entry pages');

  for (const entry of entries) {
    assert.ok(
      entry.contents.includes('pf-embed-offer'),
      `${entry.slug} has no embed offer — the mirror's best distribution asset is missing from it`,
    );

    // The property that matters most, and the one a reader cannot check by
    // eye across 169 pages: a snippet is copied once into a stranger's page
    // and then outlives every deploy here. Pointed at the tools host it would
    // render a blank iframe today and stay blank until the seal.
    const expected = `${mirrorCanonicalUrl(entry.slug, 'index.html')}?pfEmbed=1`;
    assert.ok(
      entry.contents.includes(expected.replaceAll('&', '&amp;')),
      `${entry.slug}'s embed snippet does not point at ${expected}`,
    );
    assert.equal(
      mirrorCanonicalUrl(entry.slug, 'index.html'),
      apexUrl(entry.slug, 'index.html'),
      'while TOOLS_HOST_SERVES is false the snippet must name the apex, which answers',
    );

    // The runtime and stylesheet, absolute so they resolve from a subpage's
    // depth as well as the entry page's.
    assert.ok(entry.contents.includes('src="/pf-embed.js"'), `${entry.slug} loads no embed runtime`);
    assert.ok(
      entry.contents.includes('href="/pf-embed.css"'),
      `${entry.slug} loads no embed stylesheet`,
    );

    // The resizer the snippet offers. `validateLinks` cannot reach this one:
    // the snippet lives inside a `<textarea>` as escaped text, so it is not a
    // link on this page at all — it becomes one only after somebody pastes it
    // onto their own site, where nothing we run can notice it 404ing. So the
    // URL is resolved here and checked against the paths the apex serves.
    const snippet = entry.contents.match(
      /data-pf-embed-snippet>([\s\S]*?)<\/textarea>/,
    )?.[1];
    assert.ok(snippet, `${entry.slug} carries no embed snippet to check`);
    const resizer = decodeCharacterReferences(snippet).match(/<script src="([^"]+)"/)?.[1];
    assert.ok(resizer, `${entry.slug}'s snippet offers no resizer`);
    const resolved = new URL(resizer);
    assert.equal(
      resolved.origin,
      new URL(APEX_URL).origin,
      `${entry.slug}'s snippet loads its resizer from an origin this host does not serve`,
    );
    assert.ok(
      APEX_ROOT_PATHS.has(resolved.pathname),
      `${entry.slug}'s snippet points at ${resolved.pathname}, which the apex document root `
        + `does not serve (it serves ${[...APEX_ROOT_PATHS].join(', ')})`,
    );
  }
});

test('deep subpages carry no embed offer', async () => {
  // They are articles, not the calculator, and offering to embed one would be
  // offering the wrong page. `injectEmbedWidget` gates on `isEntry` for this
  // reason; `injectMirrorEmbed` has to pass that gate through rather than
  // around it.
  const { files } = await buildMirror();
  const subpages = files.filter((f) => f.file.endsWith('.html') && f.file !== 'index.html');
  assert.ok(subpages.length > 0, 'no subpages in the mirror — this test proves nothing');

  for (const page of subpages) {
    assert.ok(
      !page.contents.includes('pf-embed-offer'),
      `${page.slug}/${page.file} is not the calculator but offers itself for embedding`,
    );
  }
});

test('the mirror nav hides when the page is the one being framed', async () => {
  // `renderEmbedStyle` hides the chrome `build.mjs` writes and cannot know
  // about `.fd-back`, which belongs to the mirror. Without this rule an
  // embedded calculator shows a full-width "All 169 free tools on this site"
  // banner inside someone else's page -- the site nav the embed bar replaces.
  assert.ok(
    NAV_STYLE.includes(`.pf-embed .${NAV_CLASS}{display:none}`),
    'the mirror nav is not hidden under .pf-embed, so it would show inside an embed',
  );
});

test('the embed runtime and stylesheet are reachable paths at the apex root', async () => {
  // `validateLinks` rejects any absolute link the apex document root does not
  // serve, so these two have to be in the allowlist or the whole mirror build
  // fails. Named from `embed.mjs`'s constants rather than as literals, so a
  // rename over there cannot leave this list pointing at the old names.
  const { EMBED_MODULE_FILE, EMBED_STYLE_FILE } = await import('../pages/embed.mjs');
  assert.ok(APEX_ROOT_PATHS.has(`/${EMBED_MODULE_FILE}`));
  assert.ok(APEX_ROOT_PATHS.has(`/${EMBED_STYLE_FILE}`));
});

test('duplicateBytes counts only what deduplication would actually return', () => {
  // One copy of every group always has to stay, so an N-way group recovers
  // N-1 copies and never N. Getting that off by one would overstate the
  // remedy in the one report a session reads when deciding whether the
  // ceiling is worth acting on.
  const file = (key, body) => ({ key, bytes: Buffer.from(body) });
  const { groups, redundant, largest } = duplicateBytes([
    file('a__proposal.mjs', 'shared'),
    file('b__proposal.mjs', 'shared'),
    file('c__proposal.mjs', 'shared'),
    file('a__calc.mjs', 'unique-a'),
    file('b__calc.mjs', 'unique-b'),
  ]);
  assert.equal(groups, 1, 'the two distinct calc.mjs files are not a duplicate group');
  assert.equal(redundant, 'shared'.length * 2, 'three copies recover two, not three');
  assert.deepEqual(largest[0], {
    size: 6,
    copies: 3,
    redundant: 12,
    file: 'proposal.mjs',
  });
});

test('duplicateBytes names the shared file, and falls back when there is none', () => {
  // The report is read to decide what to do about a group, so it has to say
  // *what* is duplicated. When every key ends in the same file name that name
  // is the answer; when they do not, a key is at least findable, where an
  // empty string or a bare count would not be.
  const file = (key, body) => ({ key, bytes: Buffer.from(body) });
  const named = duplicateBytes([file('a__share.mjs', 'x'), file('b__share.mjs', 'x')]);
  assert.equal(named.largest[0].file, 'share.mjs');

  const mixed = duplicateBytes([file('a__robots.txt', 'x'), file('b__humans.txt', 'x')]);
  assert.equal(mixed.largest[0].file, 'a__robots.txt');
});

test('duplicateBytes reports nothing when every file is distinct', () => {
  const file = (key, body) => ({ key, bytes: Buffer.from(body) });
  assert.deepEqual(duplicateBytes([file('a__x.mjs', '1'), file('b__y.mjs', '2')]), {
    groups: 0,
    redundant: 0,
    largest: [],
  });
});

test('mirrorHeadroom warns below the ceiling, not at it', async () => {
  // The point of the warn ratio: `MIRROR_BYTE_CEILING` throws inside
  // `buildMirror`, which `portfolio-validate` runs on every PR touching a
  // venture page — so the session that crosses it discovers that nothing in
  // the catalogue can publish, mid-way through shipping something else. This
  // asserts the warning is strictly earlier than that wall, which is the only
  // property that makes it useful.
  assert.ok(
    MIRROR_HEADROOM_WARN_RATIO > 0 && MIRROR_HEADROOM_WARN_RATIO < 1,
    'a warn ratio at or above 1 fires only once the build already throws',
  );

  // `Math.ceil`, not `Math.round`: `tight` is `bytes / CEILING >= RATIO`, and a
  // rounded probe lands on whichever side of the exact product that particular
  // ceiling happens to round to. At 8 MiB it rounded up and the assertion below
  // passed; raising the ceiling to 12 MiB made the same expression round *down*
  // to 0.8499999, so a test about the warn ratio failed for a reason that had
  // nothing to do with the warn ratio. Ceiling is what "at the ratio" means for
  // a `>=` bound, and it is independent of the ceiling's value.
  const at = (ratio) =>
    mirrorHeadroom({
      files: [],
      tools: [{ slug: 'a' }],
      bytes: Math.ceil(MIRROR_BYTE_CEILING * ratio),
    });
  assert.equal(at(MIRROR_HEADROOM_WARN_RATIO - 0.01).tight, false);
  assert.equal(at(MIRROR_HEADROOM_WARN_RATIO).tight, true, 'the ratio itself is tight, not just above it');
  assert.equal(at(0.99).tight, true);
});

test('mirrorHeadroom estimates the remaining tools from the mean tool', async () => {
  const headroom = mirrorHeadroom({
    files: [],
    tools: Array.from({ length: 10 }, (_, i) => ({ slug: `t${i}` })),
    bytes: 1000,
  });
  assert.equal(headroom.perTool, 100);
  assert.equal(headroom.remaining, MIRROR_BYTE_CEILING - 1000);
  assert.equal(headroom.toolsRemaining, Math.floor((MIRROR_BYTE_CEILING - 1000) / 100));
});

test('mirrorHeadroom does not divide by zero on an empty mirror', () => {
  // Reachable through `--headroom` against a tree with no eligible venture,
  // and a NaN in the one number a session reads to decide whether to act is
  // worse than no report at all.
  const headroom = mirrorHeadroom({ files: [], tools: [], bytes: 0 });
  assert.equal(headroom.perTool, 0);
  assert.equal(headroom.toolsRemaining, Infinity);
  assert.equal(headroom.tight, false);
});

test('the real mirror is under the warn ratio, and its duplication is measured', async () => {
  // The live reading. If this fails the mirror has crossed the warn ratio and
  // the remedy in `MIRROR_HEADROOM_WARN_RATIO`'s comment is now due — that is
  // the test doing its job, not a test to relax. Do not "fix" it by raising
  // either constant without reading both comments.
  const headroom = mirrorHeadroom(await buildMirror());
  assert.equal(
    headroom.tight,
    false,
    `the mirror is at ${(100 * headroom.ratio).toFixed(1)}% of its ceiling, over the ` +
      `${(100 * MIRROR_HEADROOM_WARN_RATIO).toFixed(0)}% warn ratio — ` +
      `${headroom.duplicates.redundant} bytes are recoverable duplicates`,
  );
  // Not an assertion about a number that moves with the catalogue: only that
  // the accounting is wired to the real build and self-consistent. The exact
  // figures live in the constant's comment, dated, where a stale one is prose
  // rather than a false test.
  assert.ok(headroom.duplicates.redundant < headroom.bytes);
  assert.equal(
    headroom.duplicates.redundant,
    headroom.duplicates.largest.reduce((sum, g) => sum + g.redundant, 0),
    'the reported total does not match the groups it is summed from',
  );
});
