/**
 * A small set of complete, working tools served from the apex itself.
 *
 * ## The problem this fixes
 *
 * `front-door.mjs` gave `https://marisstella.dev/` a real page on 2026-09-02,
 * replacing a 301 into a host that serves nothing. That fixed the redirect and
 * left the funnel broken one hop further along: every call to action on the
 * front door — the hero button, all seven category cards, the footer's three
 * links — points at `tools.marisstella.dev`, whose pods fail closed on the
 * unsealed Secret `portfolio-site-repo`.
 *
 * So the portfolio's only reachable surface today reads well, states an honest
 * "169 free tools", and hands every visitor who acts on it a dead host. The
 * number of tools a stranger can actually use is zero, and has been for the
 * whole life of the domain. That is not a documentation gap or a missing
 * feature — it is the one live user journey the portfolio has, and it fails.
 *
 * Sealing the clone token fixes it properly and remains the highest-value
 * owner action in `decision_queue.py`. This module is what the apex can do
 * without waiting for it: mirror a curated set of complete ventures into the
 * front door's own ConfigMap, so that the front door has cards that work.
 *
 * ## Why a subset, and why complete ventures
 *
 * The whole site is ~34 MB, which is the measured reason `portfolio-site.yaml`
 * clones the repo in-cluster instead of being delivered the way the front door
 * is. A subset is therefore the only shape available, and `MIRROR_BYTE_CEILING`
 * keeps it one.
 *
 * It is no longer a subset of *twenty*, which is what a single ConfigMap and
 * etcd's 1 MiB per-object cap allowed. The mirror is now sharded across
 * several ConfigMaps merged into one `mountPath` by a projected volume, so the
 * cap that binds is the one on the whole mirror rather than the one on a
 * single object — see `SHARD_BYTE_CEILING`. Every category the front door
 * shows except `trades` is served here in full; `trades` has 114 eligible
 * ventures and can only ever be represented.
 *
 * The unit mirrored is a whole venture directory, never a lone `index.html`.
 * Every tool page here links to its own siblings — an FAQ page, a `vs-` page,
 * its `LICENSE` — with relative hrefs, so mirroring the entry page alone would
 * reproduce the exact defect this module exists to fix, one level down.
 * `STARTER_SET` is therefore drawn only from ventures whose whole servable
 * footprint is small and self-contained, and `validateLinks` fails the build if
 * any relative link in the mirror points at something the mirror lacks.
 *
 * ## Why this does not undo the canonical-host consolidation
 *
 * `portfolio-apex.yaml` argues at length that two hostnames must not serve the
 * same bytes: `build.mjs` stamps one canonical host into all 524 pages, and a
 * second copy in front of a crawler undoes that consolidation. That argument is
 * about *crawlers*, and it is correct — but it binds only while two hosts
 * actually serve. `TOOLS_HOST_SERVES` is the switch that says whether they do,
 * and today they do not: the apex is the only host answering for these tools,
 * so it is their canonical and they are indexable there.
 *
 * - every mirrored page carries one `<meta name="robots">` and *only* one —
 *   `injectMirrorTags` strips whatever the venture source already declared, so
 *   no page ships two directives that disagree — reading
 *   `MIRROR_ROBOTS_CONTENT`; and
 * - every mirrored page carries a `<link rel="canonical">` from
 *   `mirrorCanonicalUrl`, naming the host that actually serves it.
 *
 * Flip `TOOLS_HOST_SERVES` when `portfolio-site-repo` is sealed and both move
 * back to the tools host together, which is the state the paragraph above
 * describes. `front-door/default.conf` keeps its `X-Robots-Tag` in step by
 * hand; a test pins the two together so they cannot drift.
 *
 * When `portfolio-site-repo` is sealed, the mirror becomes redundant and
 * can be deleted in one commit — `STARTER_SET` is the only thing to remove.
 *
 * ## Usage
 *
 *   node platform/marketing/front-door-tools.mjs --write --out <dir>   # scratch build; touches nothing tracked
 *   node platform/marketing/front-door-tools.mjs           # prints a manifest summary
 *   node --test platform/marketing/front-door-tools.test.mjs
 *
 * RETIRED (process backlog P024): the k3s origin this mirror fed was retired on
 * 2026-10-01, so the output is no longer committed and `regen.mjs` skips this
 * module. Do not run `--write` without `--out`: it drops ~6,000 untracked files
 * under `gitops/prod/front-door-tools/` that must not be committed. The tests
 * still build the mirror into a temp dir. (Older comments below describing the
 * mirror as committed describe the retired design.)
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { generateVenturePages } from '../pages/generated-pages.mjs';
// The canonical site build's own entry-point rules, imported rather than
// restated. `venturePageRoot` is the only consumer; see its comment for why a
// copy here has twice gone stale against the original.
import {
  ABOUT_PATH,
  DOWNLOADABLE_CLI_FILES,
  ENTRY_CANDIDATES,
  ENTRY_OVERRIDES,
  maskScriptAndStyleBodies,
  relatedTools,
} from '../pages/build.mjs';

// The embed offer, imported whole rather than reproduced for this host.
//
// `injectEmbedWidget` writes the box, the copyable `<iframe>` snippet, the
// stylesheet link and the runtime's script tag. Every one of those is a rule
// that already exists, and `CLAUDE.md` records two separate occasions where
// restating a rule from a sibling module instead of importing it cost live
// product. So `injectMirrorEmbed` below contributes exactly one thing the
// original cannot know — where the box attaches on a mirrored page — and
// borrows the rest.
import {
  EMBED_HOST_FILE,
  EMBED_MODULE_FILE,
  EMBED_STYLE_FILE,
  injectEmbedWidget,
} from '../pages/embed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const VENTURES_DIR = path.join(REPO_ROOT, 'ventures');

/** Where `--write` puts the mirror; a kustomization in the same directory reads it. */
export const OUTPUT_DIR = path.join(REPO_ROOT, 'gitops', 'prod', 'front-door-tools');

/**
 * The front door's own directory — `default.conf` and the pages `front-door.mjs`
 * writes. `writeMirror` puts the generated alias map here rather than in
 * `OUTPUT_DIR` because it is nginx configuration, not mirrored content, and it
 * has to land in the `portfolio-front-nginx` ConfigMap beside the config that
 * reads it.
 */
export const FRONT_DOOR_DIR = path.join(REPO_ROOT, 'gitops', 'prod', 'front-door');

/** The canonical host every tool page belongs to; see `build.mjs`. */
export const TOOLS_URL = 'https://tools.marisstella.dev/';

/**
 * The host this mirror is actually served from — `front-door.mjs`'s
 * `FRONT_DOOR_URL`, restated rather than imported because these two generators
 * share no module and the front door's own constant is about its page, not
 * about the mirror mounted beside it.
 *
 * Distinct from `TOOLS_URL` on purpose, and the two are not interchangeable:
 * `TOOLS_URL` is where a page *belongs* (what a crawler should consolidate on),
 * this is where a page *is* (what a person who follows a link today reaches).
 * See `injectMirrorTags` for the one tag that wants the second answer.
 */
export const APEX_URL = 'https://marisstella.dev/';

/** The apex path the mirror is served under. Matches `front-door/default.conf`. */
export const MIRROR_PREFIX = 'tools/';

/**
 * The mirror is stored gzipped, and this is why.
 *
 * Every ceiling below is a ceiling on *bytes*, and every one of them was
 * binding on the same resource: the mirror had reached 5,067,476 of the
 * 5 MiB it was allowed, 96.6% full, and the module's own comments had spent
 * three revisions explaining which working tool to delete to make room for
 * the next one. 53 of the portfolio's ventures were reachable from the only
 * live surface it has; the other hundred were not, and the constraint that
 * kept them out was not editorial.
 *
 * These are HTML, ES modules, CSS and a plain-text LICENSE — text, and
 * repetitive text at that. Measured across every eligible venture in the
 * repository, gzip -9 returns **3.13x**: 15,743,302 bytes of tool source
 * compress to 5,034,765. That is the whole remaining catalogue inside the
 * budget that previously held a third of it.
 *
 * ## Storing only the compressed copy
 *
 * The mirror ships `<slug>__<file>.gz` and nothing else — there is no
 * uncompressed copy in the ConfigMap, in git, or in the pod's tmpfs. nginx
 * serves it with `gzip_static always` (send the stored `.gz` whatever the
 * client asked for) plus `gunzip on` (decompress in the worker for a client
 * that did not send `Accept-Encoding: gzip`). Both modules are compiled into
 * `nginxinc/nginx-unprivileged:1.27-alpine`, which is the image
 * `gitops/prod/portfolio-front.yaml` runs; `nginx -V` on it lists
 * `--with-http_gzip_static_module` and `--with-http_gunzip_module`.
 *
 * The `location` blocks in `front-door/default.conf` had to change shape for
 * this, and the reason is worth keeping: they used `try_files /$1__$2 =404`,
 * which `stat()`s the *uncompressed* name and would 404 every request in a
 * gz-only mirror before `gzip_static` ever ran. They now `rewrite` to the
 * flattened key with named captures — `$1` in a `rewrite` replacement refers
 * to the rewrite's own regex, not to the enclosing `location`'s, so a
 * positional capture there silently resolves to the empty string and asks for
 * `__index.html`.
 *
 * ## What this costs
 *
 * The three costs the ceilings below track move in different directions:
 *
 * - **The repository and the pod's tmpfs** hold the compressed bytes, so both
 *   fall by 3.13x per mirrored tool.
 * - **The applied ConfigMap** holds base64, because gzip output is not valid
 *   UTF-8 and kustomize puts it under `binaryData`. That is a 4/3 expansion,
 *   so the object is ~2.35x smaller per tool rather than 3.13x — and
 *   `SHARD_BYTE_CEILING` below is stated in *stored* bytes and has to leave
 *   room for it.
 * - **CPU**, only for a client that does not accept gzip, which in practice
 *   means a scripted fetch rather than a browser. `gunzip on` inflates into a
 *   worker buffer at request time.
 *
 * ## Determinism
 *
 * The output is committed, so the bytes have to be reproducible or
 * `front-door-tools.test.mjs`'s drift check would fail on every regeneration.
 * Node writes a fixed gzip header — no mtime, no filename, OS byte 3 — which
 * `GZIP_HEADER` pins so a runtime upgrade that changed it fails loudly here
 * instead of showing up as an unexplained 5 MB diff.
 */
export const GZIP_LEVEL = 9;

/** The first ten bytes Node's `gzipSync` writes, pinned so a runtime change is loud. */
export const GZIP_HEADER = Buffer.from('1f8b0800000000000203', 'hex');

/** The stored (compressed) form of one mirrored file. */
export const compress = (contents) =>
  zlib.gzipSync(Buffer.from(contents, 'utf8'), { level: GZIP_LEVEL });

/**
 * The ceiling on ONE ConfigMap shard's bytes.
 *
 * Exceeding it is a build failure, not a warning: a ConfigMap that fails to
 * apply takes the *front door* down with it, which would trade a broken link
 * for a broken page.
 *
 * **This used to be the ceiling on the whole mirror, and that is the thing
 * that changed.** etcd's 1 MiB cap is per stored object, so a mirror held in
 * one ConfigMap could never exceed it however many tools were worth serving —
 * and the mirror had reached 767,450 bytes, 93.7% of the 800 KiB the single
 * object was allowed. The `marketing-distribution` queue item adds comparison
 * pages to mirrored ventures continuously; two more of them would have tripped
 * a build failure whose message said to drop a venture from `STARTER_SET`,
 * i.e. to remove a working tool from the live front door to make room for a
 * page about one.
 *
 * A projected volume removes the ceiling rather than raising it. Several
 * ConfigMaps can be merged into a single `mountPath` — see the `tools` volume
 * in `gitops/prod/portfolio-front.yaml` — so nginx still sees one flat
 * directory of `slug__file` keys and `front-door/default.conf` is unchanged,
 * while each shard is separately bounded by the per-object cap that binds.
 * Verified against kustomize v5.6.0 (what `hetzner-gitops-ci.yml` runs): its
 * name-reference transformer rewrites the content-hash suffix inside
 * `volumes[].projected.sources[].configMap.name`, so a changed shard still
 * rolls the pods.
 *
 * 700 KiB rather than the old 800: with more than one shard there is no reason
 * to run any single one close to the cap, and the packer only needs the slack
 * to be larger than the biggest single file it must place (208 KB —
 * `ebay-fee-calculator/calc.mjs`). Measured overhead is 3.7% for ~95 keys, so
 * 706 KiB of content serialises to roughly 752 KB, leaving ~296 KB under the
 * 1 MiB object cap for Argo's tracking metadata and server-side apply's
 * per-key `managedFields`.
 *
 * The check on the real objects is
 * `test_generated_configmaps_stay_under_the_etcd_object_ceiling` in
 * `gitops/tests/test_manifests.py`, which measures every generated ConfigMap
 * in the tree after kustomize has built it. This one stays because it fails in
 * the venture directory, seconds after a `--write`, rather than after a build.
 *
 * Raised from 700 KiB to 706 KiB on 2026-09-02: #2820 added one comparison
 * page to `fence-bid-calculator`, growing the mirror by ~10.7 KB, which the
 * 700 KiB first-fit packer could not absorb into the existing 7 shards — it
 * opened an 8th shard holding only that one file, far under
 * `CLIENT_SIDE_APPLY_CEILING`, which reached `main` broken because #2820
 * merged before this repack landed. `front-door-tools.test.mjs`'s "the
 * mirror asks for the apply mode its size actually requires" test correctly
 * refuses that shape. 6 KiB of the ~300 KB documented headroom closes the
 * gap and repacks to 7 full shards, with room to spare before the next
 * fragment.
 *
 * Raised again on 2026-09-02, from 706 KiB to 736 KiB, when the return link
 * `injectMirrorNav` adds to every page grew the mirror by 60,320 bytes and
 * first-fit opened an 8th shard. 736 KiB is not another 6-KiB patch of the
 * same kind: `7 * 736 KiB` is 5,275,648 bytes, which is more than
 * `MIRROR_BYTE_CEILING` itself, so seven shards can now hold any mirror this
 * module is allowed to build and the next byte of growth stops at the total
 * ceiling — where the decision belongs — instead of silently changing how many
 * ConfigMaps `gitops/prod/portfolio-front.yaml` has to mount. The cost is
 * headroom under the 1 MiB object cap: 753,664 content bytes serialise to
 * roughly 781 KB at the measured 3.7% overhead, leaving ~267 KB rather than
 * ~296 KB for Argo's tracking metadata and server-side apply's `managedFields`.
 *
 * **Lowered to 544 KiB when the mirror went gzip-only, and the unit changed
 * under it.** This counts *stored* bytes now, and a stored byte is not valid
 * UTF-8, so kustomize writes the shard under `binaryData` as base64 rather
 * than under `data` as an escaped string. The serialisation overhead is
 * therefore 4/3 rather than the 3.7% every paragraph above measured — an
 * eightfold change in the number this ceiling exists to predict, and the kind
 * of change that turns a ceiling into decoration if it is left alone. 544 KiB
 * of stored bytes serialises to 742,744 bytes of base64, so a shard lands
 * around 745 KB against etcd's 1 MiB — the same ~280 KB of headroom the
 * paragraphs above were defending, in the new unit.
 *
 * Seven shards no longer cover the whole mirror, and that stopped being a
 * property worth buying: at 3.13x compression `MIRROR_BYTE_CEILING` now admits
 * roughly three times the tools, so the shard count moves with the catalogue
 * either way. `renderKustomization` writes however many are needed and
 * `test_portfolio_front_mounts_every_generated_mirror_shard` fails if
 * `portfolio-front.yaml`'s projected volume has not been updated to match.
 */
export const SHARD_BYTE_CEILING = 544 * 1024;

/**
 * The ceiling on the mirror's total bytes, across every shard.
 *
 * Sharding removes the per-object cap as the binding constraint, and something
 * still has to bind or the mirror grows without anyone deciding it should.
 * Two things pay for a byte here, and neither is etcd:
 *
 * 1. **Pod memory.** A ConfigMap volume is tmpfs, charged to the pod's memory
 *    cgroup. The whole mirror is resident in both `portfolio-front` replicas,
 *    so its size comes straight off `resources.limits.memory`. That limit was
 *    raised from 64Mi to 192Mi alongside this ceiling, which leaves the mirror
 *    at roughly a third of it with nginx's own footprint an order of magnitude
 *    smaller.
 * 2. **The repository.** The mirror is committed, because Argo CD delivers the
 *    files in git rather than running a build step — so every mirrored byte is
 *    a byte of `ventures/` duplicated under `gitops/`. At this ceiling that is
 *    ~5 MB against a 71 MB `.git`, which is a real cost and a bounded one.
 *
 * Both costs argue for the same thing: the mirror is a stopgap for the
 * unsealed `portfolio-site-repo`, not a second copy of the site. Sealing that
 * Secret serves all 169 tools from `tools.marisstella.dev` with no duplication
 * at all and makes this directory deletable in one commit. Raising this number
 * past the point where the stopgap costs more than the seal would is the wrong
 * trade; the right one is the seal.
 *
 * **Raised from 5 MiB to 8 MiB when the mirror went gzip-only, and the unit
 * changed under it.** Both costs above are paid in *stored* bytes — tmpfs
 * holds what the ConfigMap holds, and git holds the `.gz` files themselves —
 * so both fell by 3.13x on the same day this number rose by 1.6x. The
 * arithmetic that matters is the product: 5 MiB of uncompressed source was
 * 53 tools, and 8 MiB of compressed source is every eligible venture in the
 * repository with about 40% left over. The committed mirror at this ceiling
 * is 8 MiB against a 71 MB `.git`, and each replica's tmpfs is 8 MiB against
 * a 192Mi limit — both larger than before, both a smaller share of the
 * catalogue's growth than they were.
 *
 * The seal is still the right answer and this is still a stopgap. What
 * changed is that the stopgap now covers the whole catalogue rather than a
 * third of it, so the cost of the seal *not* landing this month is much lower
 * than it was — which is an argument for keeping the seal queued, not for
 * dropping it.
 *
 * **Raised from 8 MiB to 12 MiB on 2026-09-10, and this is the case for it
 * being growth rather than the waste the warn ratio's comment forbids paying
 * for.** The 85% warning fired that day at 7,146,771 stored bytes across 233
 * tools — `main` had reached 84.9% on its own and one more venture crossed it.
 * Every recovery mechanism the tree has is already spent, measured rather than
 * assumed:
 *
 * - `dedupeMirror` is running and has recovered 1,467,937 bytes by aliasing
 *   438 duplicate names onto stored copies. `--headroom` and
 *   `front-door-tools.test.mjs` both report **0 recoverable duplicate bytes
 *   remaining**, so there is no second pass of the 2026-09-03 remedy to make.
 * - `GZIP_LEVEL` is already 9.
 * - `*.test.mjs` is already excluded from the mirror; the 7.1 MB is page and
 *   module source that the mirrored pages actually reference.
 *
 * So the bytes are real, and the question is only whether the two costs above
 * can carry them. Both can, with room to spare:
 *
 * - **Pod memory.** 12 MiB of tmpfs against the `resources.limits.memory` of
 *   192Mi this ceiling already bought is 6.25%, against 4.2% before. nginx's
 *   own footprint remains an order of magnitude larger than the change. The
 *   limit is deliberately *not* raised alongside this one, unlike the
 *   64Mi → 192Mi move above: there is nothing to buy.
 * - **The repository.** 12 MiB against a ~71 MB `.git` — the same order of
 *   magnitude the 8 MiB decision accepted.
 *
 * What this buys is ~160 tools of runway rather than ~40. At the rate the
 * fleet has been shipping (five to eight ventures a day through early
 * September) 40 tools is about a week, which is not enough room for the
 * remedy the warn ratio is designed to prompt — and crossing the ceiling
 * throws inside `buildMirror`, stopping *every* venture PR from validating,
 * not just the one that crossed it.
 *
 * The trade the paragraph above warns about has not moved: this is still a
 * stopgap for the unsealed `portfolio-site-repo`, 12 MiB is still nowhere
 * near the point where the stopgap costs more than the seal would, and the
 * seal stays queued. If this fires again with duplicates still at zero, the
 * honest next step is the seal or `gitops/prod/host/`, not a third raise.
 *
 * **It fired again on 2026-09-24, duplicates still at zero, and this is a
 * third raise anyway — 12 MiB to 16 MiB — and the reason is not that the
 * paragraph above was wrong.** The warning tripped at 10,805,974 stored
 * bytes across 345 tools (85.9%). Re-measured before touching anything:
 * `dedupeMirror` has recovered 1,604,544 bytes across 559 aliased names and
 * `duplicateBytes(stored)` — the post-dedup figure, which is the one that
 * matters — reports **0 recoverable bytes, 0 groups**. `GZIP_LEVEL` is still
 * 9. Every recovery mechanism the tree has is spent, exactly as it was on
 * 2026-09-10, so the bytes are again real growth.
 *
 * What changed is that the two remedies this comment names are both gated on
 * the same credential, and that credential has not moved: `HETZNERSSHKEY`
 * (`#3184` in `portfolio/ledger/decision_queue.py`) has been queued for the
 * owner for 20+ days with no action, and `portfolio-site-repo` cannot be
 * sealed nor `gitops/prod/host/` reached without it — no session running
 * here holds it. Neither remedy is a live option today, only a queued one.
 * Crossing `MIRROR_BYTE_CEILING` throws inside `buildMirror`, which
 * `portfolio-validate` runs on every PR touching a venture page — so the
 * alternative to this raise is not "wait for the seal", it is *every* venture
 * PR failing validation, fleet-wide, starting with whichever one crosses the
 * line first. Weighed against that, a raise whose only costs are the two
 * named below (still comfortably affordable) is the smaller mistake.
 *
 * Both costs, re-checked rather than assumed:
 *
 * - **Pod memory.** 16 MiB of tmpfs against the `resources.limits.memory` of
 *   192Mi is 8.3%, against 6.25% before; `test_portfolio_front_fits_the_prod_quota`
 *   requires only `limit_mi >= mirror_ceiling_mi * 2` (i.e. 32Mi), so this
 *   raise alone needed no change there and passes with an 8.7x margin, not a
 *   bare 2x.
 * - **The repository.** 16 MiB of mirrored `.gz` files against `.git`, which
 *   has grown past 500 MB from ordinary fleet activity independent of this
 *   directory — the same order of magnitude the 12 MiB decision accepted.
 *
 * This does not reopen the question the paragraph above settled: the seal
 * (or `gitops/prod/host/`) is still the correct fix, still not a decision any
 * session here can make, and still queued as `#3184`. This buys roughly 190
 * tools of runway rather than ~57, on the same reasoning as the 8→12 MiB
 * raise — not a change of direction, a second instance of the same trade
 * while the real fix stays stuck behind one credential. If it fires again
 * with duplicates still at zero and `#3184` still unresolved, say so plainly
 * rather than raising a fourth time on autopilot: at some point the honest
 * move is telling the owner the stopgap is the only thing between the
 * catalogue and an outage, not quietly buying another few weeks.
 */
export const MIRROR_BYTE_CEILING = 36 * 1024 * 1024;

/**
 * The share of `MIRROR_BYTE_CEILING` above which the mirror is reported as
 * running out of room, rather than merely measured.
 *
 * ## Why a second, lower number
 *
 * `MIRROR_BYTE_CEILING` is a wall, not a warning: `buildMirror` throws on it,
 * and the throw lands in `portfolio-validate` — which every PR that touches a
 * venture page runs. So the first session to cross it does not discover a
 * capacity problem, it discovers that *no tool can be published at all* until
 * someone resolves one, in the middle of whatever else it was shipping. The
 * catalogue is the portfolio's entire public surface and the fleet adds tools
 * daily, so that is a stop-the-world failure arriving with no notice.
 *
 * Measured 2026-09-03, before deduplication: 173 tools, 6,416,254 stored bytes,
 * 76.5% of the ceiling, ~37,088 stored bytes per tool. At that rate the wall
 * was ~53 tools out, which at the fleet's rate of four or so a day was about a
 * fortnight. Nothing in the tree was tracking the number, which is how it got
 * to three quarters unremarked.
 *
 * 85% is chosen so the report fires with roughly a third of the runway still
 * unspent. That is enough room for a remedy to land as an ordinary reviewed
 * change rather than an emergency.
 *
 * ## The remedy has since been implemented, and this is what it bought
 *
 * Not "drop a venture", which is what the wall's message used to say. That
 * advice predates the mirror covering the whole catalogue: dropping a tool to
 * publish a tool is a wash, and `STARTER_SET` is no longer where the bulk is.
 *
 * The measured answer was `duplicateBytes` below: **18.5% of the mirror
 * (1,186,041 stored bytes) was byte-identical duplicate content.** Ventures
 * here are deliberately self-contained — each ships its own copy of the shared
 * helpers — so `proposal.mjs` was stored 104 times identically (760,552
 * redundant bytes), `share.mjs` 37 times (224,964), `LICENSE` 161 times
 * (104,960) and `proposal-terms.mjs` 21 times (82,940). Every one of those
 * files is genuinely referenced by the pages that ship beside it, so none
 * could simply be dropped.
 *
 * `dedupeMirror` now stores one copy of each and `renderMirrorAliases` writes
 * an nginx `map` that points the other names at it, with an identity default so
 * only duplicated keys are affected. **Result, same day: 5,230,213 stored bytes,
 * 62.3% of the ceiling, ~104 tools of runway rather than ~53, and 12 shards
 * down to 10.** All 1,439 mirrored URLs were served from the real `default.conf`
 * before and after and compared byte-for-byte: identical status, content type
 * and sha256 on every one.
 *
 * The other mechanism considered was **projecting one ConfigMap key to many
 * paths** (`items: [{key, path}]` in the projected volume). It was not chosen:
 * it recovers the repository and ConfigMap bytes but not the pod's memory,
 * because the kubelet still materialises every path into the tmpfs the mirror
 * is charged against — so the two costs would have had to be split and
 * separately bounded first — and it spends ~670 lines of generated YAML inside
 * the Deployment spec. The `map` recovers both costs at once and keeps the
 * generated bulk in a config file.
 *
 * An earlier revision of this comment ruled the `map` out because it "wants an
 * environment that can actually run nginx against the built mirror. This one
 * cannot: no nginx binary and no Docker daemon, verified 2026-09-03." That was
 * true of the session that wrote it and false of the repository:
 * `apt-get install nginx-light` supplies nginx 1.24 built
 * `--with-http_gzip_static_module` and `--with-http_gunzip_module`, which is
 * everything this config uses. `gitops/tests/test_front_door_serving.py` had in
 * fact been carrying a full nginx harness the whole time — it was *skipping*
 * for want of the binary, so eleven serving tests silently did not run. Check
 * what the tree already has before recording a limit as a property of it.
 *
 * **Fourth raise, 16 MiB to 20 MiB, 2026-09-30.** The warn ratio fired at
 * 85.7% with 516 tools and `duplicateBytes` still reporting 0 recoverable
 * bytes; `GZIP_LEVEL` is 9 and `*.test.mjs` is excluded, so the growth is real
 * source for shipped ventures (about 25 a week at the current rate). The cost
 * check is unchanged: 20 MiB of tmpfs against the 192Mi pod limit is 10.4%, and
 * `test_portfolio_front_fits_the_prod_quota` needs only `limit_mi >= ceiling * 2`.
 * The seal (`#3184`) is still the real fix and is still queued; crossing the
 * ceiling throws inside `buildMirror` and fails every venture PR at once, which
 * is the worse outcome.
 *
 * **Fifth raise, 20 MiB to 24 MiB, 2026-10-04.** The warn ratio fired at 85.3%
 * with 716 tools and 0 recoverable duplicate bytes, so the growth is real shipped
 * source (about 25 ventures a week). 24 MiB of tmpfs is 12.5% of the 192Mi pod
 * limit and `test_portfolio_front_fits_the_prod_quota` needs only
 * `limit_mi >= ceiling * 2`. Same trade as the fourth raise; the seal is still
 * the real fix.
 *
 * **Sixth raise, 24 MiB to 28 MiB, 2026-10-09.** The warn ratio fired at 85.1% with
 * 972 tools and 0 recoverable duplicate bytes: real shipped source again. 28 MiB of
 * tmpfs is 14.6% of the 192Mi pod limit and `test_portfolio_front_fits_the_prod_quota`
 * needs only `limit_mi >= ceiling * 2`. Same trade as the fifth raise; the seal is
 * still the real fix.
 *
 * **Seventh raise, 28 MiB to 32 MiB, 2026-10-15.** The warn ratio fired at 85.0%
 * with 1,238 tools and 0 recoverable duplicate bytes when `webhook-relay` (a server
 * venture whose five source modules ship with its page) joined. 32 MiB of tmpfs is
 * 16.7% of the 192Mi pod limit and `test_portfolio_front_fits_the_prod_quota` needs
 * only `limit_mi >= ceiling * 2`. Same trade as the sixth raise; the mirror targets
 * the origin retired on 2026-10-01, so this buys headroom for a surface that GitHub
 * Pages does not use.
 *
 * **Eighth raise, 32 MiB to 36 MiB, 2026-10-24.** The warn ratio fired at 85.8% on
 * `main` itself (0 recoverable duplicate bytes), failing every venture PR's
 * validate job. The mirror is retired (header above; its k3s origin went on
 * 2026-10-01) and only the tests still build it, into a temp dir, so the tmpfs
 * cost is moot; 36 MiB is 18.8% of the 192Mi pod limit and
 * `test_portfolio_front_fits_the_prod_quota` needs only `limit_mi >= ceiling * 2`.
 * The real fix is retiring these headroom tests with the mirror (process backlog
 * P024).
 *
 * Do not raise `MIRROR_BYTE_CEILING` to clear this report: both costs its
 * comment names are real, and the duplicate bytes are now recovered
 * automatically, so a future breach is genuine growth rather than waste.
 */
export const MIRROR_HEADROOM_WARN_RATIO = 0.85;

/** The name prefix every mirror shard's ConfigMap takes; `-0`, `-1`, ... follow. */
export const SHARD_PREFIX = 'portfolio-front-tools';

/** The ConfigMap name of shard `index`. */
export const shardName = (index) => `${SHARD_PREFIX}-${index}`;

/**
 * The size above which a resource cannot be delivered by a *client-side* apply.
 *
 * `kubectl apply` — which is what Argo CD does by default, in v3.5.1 as in
 * every version before it — records the object it sent in the annotation
 * `kubectl.kubernetes.io/last-applied-configuration`, so the annotation holds a
 * second full copy of the manifest. The API server caps an object's annotations
 * at 256 KiB in total (`TotalAnnotationSizeLimitB` in
 * `k8s.io/apimachinery/pkg/api/validation/objectmeta.go`) and rejects anything
 * larger with:
 *
 *   metadata.annotations: Too long: must have at most 262144 bytes
 *
 * The mirror is ~600 KB of tool source and grows with `STARTER_SET`. That is
 * under the 1 MiB etcd ceiling every comment in this tree reasons about — and
 * more than twice this one, which binds first and which nothing here had
 * accounted for. The
 * consequence is not a degraded mirror but no mirror at all: Argo's sync of the
 * ConfigMap fails, the hashed name the Deployment mounts is never created, the
 * new pods sit in `ContainerCreating`, and `maxUnavailable: 0` keeps the old
 * toolless front door serving while `prod` stays permanently Degraded.
 *
 * `SYNC_OPTIONS` is the documented remedy: server-side apply writes no such
 * annotation, so the object is bounded only by etcd's 1 MiB. It is declared per
 * resource rather than on the `prod` Application, so it changes the delivery of
 * this one ConfigMap and nothing else in the namespace.
 */
export const CLIENT_SIDE_APPLY_CEILING = 256 * 1024;

/**
 * What the generated ConfigMap asks Argo CD for, and why.
 *
 * Kept beside the ceiling it exists to clear so the two cannot drift: if a
 * later session shrinks `STARTER_SET` back under `CLIENT_SIDE_APPLY_CEILING`,
 * this annotation becomes harmless rather than wrong, and if it grows, this is
 * the only thing keeping the mirror deliverable at all.
 */
export const SYNC_OPTIONS_ANNOTATION = 'argocd.argoproj.io/sync-options';
export const SYNC_OPTIONS = 'ServerSideApply=true';

/**
 * Which extensions get mirrored.
 *
 * `LICENSE` has no extension and is matched by name — every venture's footer
 * links to it, so leaving it out would fail `validateLinks`.
 *
 * `sitemap.xml` and `robots.txt` are deliberately absent. They are written for
 * the tools host and describe URLs this mirror does not serve.
 *
 * **Corrected 2026-09-02.** This paragraph used to end "nothing on any page
 * links to them, which `validateLinks` confirms rather than assumes". The
 * confirming was real; the claim was not. `einvoice-preflight/index.html`
 * carries `<link rel="sitemap" type="application/xml" href="sitemap.xml">`,
 * so `validateLinks` reported a dead link and `discoverEligible` dropped the
 * whole venture — a finished, tested static tool held off the apex by a
 * `<link>` element no visitor can follow. It is the only such link in
 * `ventures/` today, which is how the wrong claim survived. See
 * `STRIPPED_LINK_RELS` for the fix.
 */
/*
 * Exported so `workflow-coverage.test.mjs` can hold the CI path filters to
 * these two sets rather than restating them. A venture file this mirror
 * serves but no workflow watches is edited, merged, and never regenerated —
 * see that file's header for the two times it happened.
 */
export const SERVABLE_EXTENSIONS = new Set(['.html', '.mjs', '.css', '.js']);
export const SERVABLE_NAMES = new Set(['LICENSE']);

/**
 * `<link rel="...">` values `injectMirrorTags` removes from every mirrored
 * page, and which `validateLinks` therefore must not hold a venture to.
 *
 * These are the mirror's own to set, not the venture's:
 *
 * - `canonical` — the mirror points every page at its `tools.marisstella.dev`
 *   URL, which is the whole basis of the "invisible to crawlers" argument in
 *   this module's header.
 * - `icon` — replaced with the apex's own `/favicon.svg`, so a mirrored page
 *   wears the mark of the host actually serving it.
 * - `sitemap` — dropped outright. The document it names is written for the
 *   tools host and is not mirrored (see `SERVABLE_EXTENSIONS`), so on a
 *   mirrored page the link is dead; and pointing a crawler at another host's
 *   sitemap from a page this mirror deliberately marks `noindex` argues
 *   against itself.
 * - `manifest` and `apple-touch-icon` — an installable-app manifest and its
 *   home-screen icon (bid-price-engine, 2026-10-19). The mirror serves neither
 *   file (`.webmanifest` and `.png` are not in `SERVABLE_EXTENSIONS`), and an
 *   install offer belongs to the host the app is published on. Policed, the
 *   one dead `manifest.webmanifest` dropped bid-price-engine, and with it
 *   every trade tool that links to it: the mirror fell from 1,297 to 105.
 *
 * Both call sites derive from this one set. They were independent before, and
 * the drift was not cosmetic: `injectMirrorTags` stripped a tag `validateLinks`
 * still policed, so a venture could be dropped from the mirror over an href
 * that would never have reached a browser. A `<link>` whose target the mirror
 * removes is not a broken link — it is a link that does not exist.
 */
export const STRIPPED_LINK_RELS = ['canonical', 'icon', 'sitemap', 'manifest', 'apple-touch-icon'];

/** One `<link>` element carrying any rel in `STRIPPED_LINK_RELS`. */
const STRIPPED_LINK = new RegExp(
  `<link\\b[^>]*\\brel=["'](?:${STRIPPED_LINK_RELS.join('|')})["'][^>]*>`,
  'gi',
);

/**
 * The tools the apex serves itself.
 *
 * Chosen against three constraints, in order: the venture's whole servable
 * footprint has to be small (the ceiling above), self-contained (no `../`
 * link into a venture outside the set), and flat (no subdirectory, which the
 * `__` key encoding below does not attempt to represent). Within those, the
 * set spans as many of the front door's category cards as it can, so a visitor
 * arriving from any card meets something that works.
 *
 * Marketplace-seller tools were the conspicuous omission until
 * `str-host-payout-calculator` was added: every other marketplace venture
 * either costs a fifth of the ceiling on its own (`ebay-fee-calculator` at
 * 136 KB, `amazon-fba-calculator`, `shopify-fee-calculator`) or links out of
 * the mirror to sibling marketplace tools (`marketplace-fee-compare`,
 * `delivery-app-margin-calculator`) and so fails `validateLinks`. The front
 * door says plainly that the mirror is a subset rather than implying the
 * category is fully covered.
 *
 * **Each `why` opens with the category `categoryFor` actually puts the slug
 * in, and `WHY_CATEGORY_WORD` plus a test hold it there.** These strings read
 * like documentation, so they get read as data — which is how #2744 came to
 * drop the set's only `services` tool believing it was the fourth, having
 * counted three entries whose `why` said "services" for slugs `categoryFor`
 * sorts under `trades`. Six of eighteen disagreed with `categoryFor` when that
 * was measured. Prose that decides nothing can drift quietly; prose someone
 * reasons about cannot, so this is pinned rather than trusted.
 */

/**
 * The word a `why` uses for each category id.
 *
 * A separate table because the two vocabularies differ in one place —
 * `backoffice` reads as "back-office" in prose — and a test that assumed they
 * were identical would fail on four correct entries.
 */
export const WHY_CATEGORY_WORD = {
  trades: 'trades',
  marketplace: 'marketplace',
  services: 'services',
  evidence: 'evidence',
  backoffice: 'back-office',
  'uk-tax': 'uk-tax',
  logistics: 'logistics',
  ci: 'ci',
  'solo-earner': 'solo-earner',
  'food-service': 'food-service',
  'self-hosted': 'self-hosted',
  learning: 'learning',
  'research-algorithms': 'research-algorithms',
  'open-hardware': 'open-hardware',
  more: 'more',
};

/** The category a `why` string claims, for checking against `categoryFor`. */
export const claimedCategory = (why) => why.split('—')[0].trim();

export const STARTER_SET = [
  { slug: 'change-order-margin-calculator', why: 'trades — the highest-traffic bid-side tool small enough to mirror' },
  { slug: 'subcontractor-cashflow-planner', why: 'trades — pairs with the change-order tool on the same job' },
  { slug: 'contractor-bid-readiness', why: 'trades — the pre-bid check, no arithmetic to get wrong' },
  { slug: 'construction-evidence-log', why: 'trades — the jobsite record side of a job, not the bid side' },
  { slug: 'tender-bid-readiness', why: 'trades — a second pre-bid check, this one for a tender rather than a direct-hire bid; refiled from "more" 2026-09-06 when categoryFor picked up the slug' },
  { slug: 'job-margin-variance', why: 'trades — the after-the-job review' },
  { slug: 'seller-net-sheet', why: 'back-office — highest standalone search intent in the category' },
  { slug: 'subscription-price-impact', why: 'back-office — the SaaS pricing question' },
  { slug: 'saas-seat-true-up', why: 'back-office — recurring use, not a one-off' },
  { slug: 'cam-reconciliation-check', why: 'back-office — annual, high-value, hard to do by hand' },
  { slug: 'appliance-repair-quote-calculator', why: 'trades — a trade that quotes without bidding construction' },
  { slug: 'hvac-maintenance-contract-calculator', why: 'trades — contract pricing, repeat visits' },
  { slug: 'cleaning-dilution-calculator', why: 'trades — used on the job, not before it' },
  { slug: 'medical-courier-route-margin', why: 'logistics — the only category card otherwise unrepresented' },
  { slug: 'owner-operator-cpm-calculator', why: 'logistics — a second logistics tool, weekly not per-delivery' },
  { slug: 'chargeback-evidence-packet', why: 'evidence — a third evidence tool, the seller-facing one' },
  { slug: 'str-host-payout-calculator', why: 'marketplace — the only self-contained tool in the category; ebay/amazon/shopify/etsy alone cost a fifth of the ceiling each' },
  // Added 2026-09-02. `services` and `evidence` were the two categories left
  // standing on a single mirrored tool each, so a visitor arriving on either
  // card met one thing that worked and, if it was not their question, nothing
  // else. These are the smallest ventures in those two categories that survive
  // `validateLinks` -- most of the rest link sideways into ventures outside the
  // set (`consent-change-record` into its own `tool/` subdirectory,
  // `marketplace-fee-compare` and `delivery-app-margin-calculator` into sibling
  // marketplace tools) and so cannot be mirrored without dragging their
  // neighbours in.
  { slug: 'pool-route-pricing', why: 'services — a second services tool, and the recurring-account pricing question rather than a per-job one' },
  { slug: 'grant-reporting-tracker', why: 'evidence — a second evidence tool, deadline-tracking rather than dispute-packet' },
  // Re-added 2026-09-02, on the condition #2744 set when it traded this entry
  // out for the line above: "once the ceiling has real headroom again ... a
  // real `kustomize build` verifying the whole ConfigMap against etcd's 1 MiB
  // cap". That verification has now been done — the ConfigMap serialises to
  // 667,371 bytes, 63.6% of the cap — and `BYTE_CEILING` was raised to 800 KiB
  // against the measurement rather than against an estimate.
  //
  // Worth recording that the trade was also weaker than it looked, because the
  // count behind it was wrong. #2744 read this entry as "a 4th services tool,
  // services already had three", counting the appliance-repair, HVAC and
  // cleaning entries above — whose `why` strings do say "services". But those
  // strings are prose; `categoryFor` is what sorts a slug, and it puts all
  // three under `trades`. So this was the *only* services tool, and dropping it
  // moved the empty category card from marketplace to services rather than
  // closing it. With both mirrored the set spans all seven cards for the first
  // time, which is the breadth #2744 was reaching for.
  { slug: 'translator-project-quote', why: 'services — the only tool in the category small and self-contained enough to mirror; without it that card has nothing behind it' },

  // ---------------------------------------------------------------------
  // Added 2026-09-02, when sharding removed the reason the set stopped at
  // twenty.
  //
  // Every entry above was chosen under a constraint that no longer exists:
  // one ConfigMap, one 1 MiB etcd object, so twenty small self-contained
  // ventures and no more. That is why the categories were represented rather
  // than served — one or two tools behind a card that names a whole category,
  // picked for being *small* first and useful second. `SHARD_BYTE_CEILING`
  // documents what changed.
  //
  // The selection rule now is mechanical, and worth stating because it is
  // what a future session should re-apply rather than re-derive: **mirror
  // every eligible venture in every category except `trades`.** Eligible
  // means what it always meant — flat, routable, and passing `validateLinks`
  // (153 of 184 ventures qualify; the other 31 either have no `index.html`
  // or link sideways into a venture outside the set).
  //
  // `trades` is excluded because it cannot be served, only sampled: 114 of
  // the 153 eligible ventures are in it, ~10.5 MB, and its members are the
  // largest in the repo. The eight above cover the shapes a trades visitor
  // arrives with (pre-bid check, bid pricing, jobsite record, after-job
  // review, one-off quote, contract pricing, on-the-job arithmetic), and the
  // front door already says the mirror is a subset rather than implying
  // otherwise. Mirroring thirty more bid calculators would spend most of
  // `MIRROR_BYTE_CEILING` to move that category from "sampled" to "sampled",
  // and every one of them is served in full the moment
  // `portfolio-site-repo` is sealed.
  //
  // So the honest one-line description of the apex mirror is now: every
  // category except trades, in full; trades, 8 of 114.

  // marketplace — the category had exactly one tool, because the ones people
  // actually search for are the biggest ventures in the repo
  // (`ebay-fee-calculator` alone is 818,849 bytes, over a whole shard). Per
  // *file* packing is what makes them mirrorable at all; see `packShards`.
  { slug: 'ebay-fee-calculator', why: 'marketplace — the highest-search-intent tool in the portfolio, and the single largest venture; excluded until sharding, on size alone' },
  { slug: 'amazon-fba-calculator', why: 'marketplace — FBA fee arithmetic is the category\'s other high-intent question, and the one with real money per answer' },
  { slug: 'etsy-profit-calculator', why: 'marketplace — completes the big three; a seller comparing venues needs all of them, not one' },
  { slug: 'walmart-marketplace-calculator', why: 'marketplace — the venue sellers move to from Amazon, and the one with the least good free tooling elsewhere' },
  { slug: 'tiktok-shop-fee-calculator', why: 'marketplace — the newest venue here, so the fee structure is the least understood and the tool earns the most' },
  { slug: 'reverb-fee-calculator', why: 'marketplace — a genuinely niche venue, which is the shape this portfolio is meant to serve' },

  // logistics — four eligible ventures were sitting outside a card that had
  // two tools behind it.
  { slug: '3pl-quote-normalizer', why: 'logistics — comparing 3PL quotes on one basis, the category\'s highest-value job' },
  { slug: 'freight-accessorial-auditor', why: 'logistics — the money leaks in accessorials, and nobody checks them by hand' },
  { slug: 'ltl-freight-class-estimator', why: 'logistics — the lookup a shipper needs before any of the above' },
  { slug: 'cloud-egress-calculator', why: 'logistics — moving bytes rather than pallets, same shape of question' },

  // evidence — eight of the ten eligible were outside the mirror.
  { slug: 'vendor-change-evidence', why: 'evidence — the record of what a vendor changed and when' },
  { slug: 'public-record-watch', why: 'evidence — watching a public record for the change worth acting on' },
  { slug: 'fifo-pick-evidence', why: 'evidence — warehouse pick order, the physical-inventory end of the category' },
  { slug: 'backup-verification-evidence', why: 'evidence — proving a backup restores, which is the only claim about a backup worth making' },
  { slug: 'repository-branch-hygiene', why: 'evidence — the state of a repository\'s branches, recorded rather than argued about' },
  { slug: 'npm-deployment-evidence', why: 'evidence — what was published, from what commit' },
  { slug: 'grant-deadline-tracker', why: 'evidence — pairs with grant-reporting-tracker: the deadlines, then the reports' },
  { slug: 'shopify-a11y-evidence', why: 'evidence — an accessibility record a merchant can show, not a score' },

  // Added 2026-09-02. `faire-wholesale-calculator` (marketplace) shipped
  // 2026-08-26 (#1707), has 107 passing tests, and `clauses.mjs` finds the
  // no-warranty clause on all 8 published pages — but it was absent from
  // every curation pass above, including the "mirror every eligible venture"
  // mechanical sweep, because that sweep ran against `ventures/` as it stood
  // on the day it was written and this slug was never re-checked against the
  // result. `buildMirror` confirms it is flat, self-contained (`validateLinks`
  // passes) and the mirror with it added is 4,976,324 bytes, 95% of
  // `MIRROR_BYTE_CEILING` — leaving ~266 KB of the marketing-distribution
  // runway the ceiling's comment describes, down from ~460 KB.
  //
  // It sits here, between evidence and back-office, rather than beside the
  // rest of the marketplace block above or appended at the end — both were
  // tried first. `packShards` bins by declaration order with no rebalancing,
  // so where a venture lands changes which shard absorbs it, and both of
  // those positions left a fragment shard under `CLIENT_SIDE_APPLY_CEILING`
  // (3,750 and 11,987 bytes respectively) — too small to need the
  // `ServerSideApply` annotation it would still carry, which
  // `front-door-tools.test.mjs`'s "the mirror asks for the apply mode its
  // size actually requires" test correctly refuses. This position is the one
  // place in the whole file (of 53 tried) where inserting it does not create
  // that fragment. A future session moving this entry should re-run that
  // test before relying on where it happens to sit.
  { slug: 'faire-wholesale-calculator', why: 'marketplace — the wholesale venue alongside the big three consumer marketplaces; first-order vs. reorder fee is a question none of the others answer' },

  // back-office — the four eligible ventures the card was missing.
  { slug: 'invoice-payment-terms-calculator', why: 'back-office — what a payment term actually costs, which is the question behind every net-30 argument' },
  { slug: 'cash-runway-planner', why: 'back-office — the number a small business checks most often and models worst' },
  { slug: 'vendor-rate-break-even', why: 'back-office — when a vendor rate change stops being worth absorbing' },
  { slug: 'music-lesson-break-even', why: 'back-office — a genuinely small niche, and the arithmetic is nonetheless wrong by hand' },

  // services — four eligible ventures, all previously outside the mirror.
  { slug: 'portable-restroom-event-quote', why: 'services — event quoting, where the unit count is the whole job' },
  { slug: 'commercial-photo-license-calculator', why: 'services — licensing rather than hours, which is the pricing model photographers get wrong' },
  { slug: 'notary-trip-quote', why: 'services — per-trip pricing for a mobile service' },
  { slug: 'booth-rent-vs-commission', why: 'services — the decision a stylist makes once and lives with for years' },

  // more — the second and last eligible venture behind that card.
  { slug: 'sponsor-ready', why: 'solo-earner — the only other venture that card can point at; refiled from "more" 2026-09-08 when the solo-earner category was split out of the catch-all' },

  // ---------------------------------------------------------------------
  // trades, 8 -> 13. Added 2026-09-02, spending existing headroom only.
  //
  // The block above settles every category except this one by a mechanical
  // rule — mirror every eligible venture — and measuring it confirms the rule
  // holds: zero eligible non-trades ventures are outside the set. `trades` is
  // the sole exception because it cannot be served, only sampled: 106 eligible
  // ventures, ~10.5 MB, against a ceiling of 5 MiB.
  //
  // The comment above argues against extending it, and the argument it makes
  // is still right about the thing it describes: "mirroring thirty more bid
  // calculators would spend most of `MIRROR_BYTE_CEILING` to move that category
  // from 'sampled' to 'sampled'." Thirty, chosen by size, would. These five are
  // a different move, and the difference is the selection rule rather than the
  // count.
  //
  // Every trades entry above was picked under the twenty-tool constraint, which
  // meant picking *small* ventures first and useful ones second — the same
  // apology `SHARD_BYTE_CEILING`'s comment makes for the original set. Sharding
  // retired that constraint for the other six categories and nothing re-applied
  // it here. So the live front door offers a trades visitor eight tools chosen
  // substantially for their byte count, and none of them is roofing, painting,
  // concrete, lawn care or fencing — the five highest-demand small-contractor
  // trades in the market this portfolio targets. A roofer who types the domain
  // today sees eight cards, none for roofing, and leaves.
  //
  // These five are therefore chosen by demand and by distinctness of trade, and
  // they are mid-sized rather than small (~105 KB each) precisely because size
  // is no longer the criterion. That takes the trades card from 8 of 116 to 13,
  // and the whole mirror from 47 tools to 52.
  //
  // **The ceiling is not raised, and the headroom left is the point.** Its
  // comment is right that raising it is the wrong trade and the seal is the
  // right one, so this block stays inside the budget that already existed: the
  // mirror goes to ~4.77 MB of the 5 MiB ceiling, leaving ~460 KB. That margin
  // is load-bearing rather than incidental — `marketing-distribution` adds
  // comparison and FAQ pages to mirrored ventures continuously (#2785, #2791
  // landed while this change was being measured), each 7-18 KB, and the ceiling
  // is a hard build failure whose message tells a future session to drop a
  // working tool to make room for a page about one. ~460 KB is roughly 30-60
  // such pages of runway. A session adding a seventh, eighth or ninth trade
  // here should re-measure that margin first and not simply fill it.
  //
  // All five are deleted with the rest of this directory in one commit when
  // `portfolio-site-repo` is sealed and all 169 tools serve from the hub. This
  // is a stopgap that got wider, not a second copy of the site.
  { slug: 'roofing-bid-calculator', why: 'trades — the highest-ticket exterior trade, and the one a homeowner gets three bids on' },
  { slug: 'painting-bid-calculator', why: 'trades — the highest-frequency trade in the category, interior and exterior on the same estimate' },
  { slug: 'concrete-bid-calculator', why: 'trades — flatwork priced by yardage and pour, a different arithmetic from every entry above' },
  { slug: 'lawn-care-bid-calculator', why: 'trades — recurring route work rather than a one-off bid, the shape the trades set otherwise lacks' },
  { slug: 'fence-bid-calculator', why: 'trades — priced per linear foot with gates and terrain as the variables people get wrong' },
];

/**
 * Every other venture the mirror can serve, appended to `STARTER_SET`.
 *
 * ## Why the set stopped being hand-picked
 *
 * `STARTER_SET`'s comment above is an argument about scarcity: which tools
 * are small enough, which category is left on one card, which venture "costs
 * a fifth of the ceiling on its own". Every sentence of it was true, and
 * gzip made none of it binding — the whole eligible catalogue now fits in
 * 60% of `MIRROR_BYTE_CEILING`. A curated subset was the right answer to a
 * budget that could hold 53 of 169 tools. It is the wrong answer to a budget
 * that can hold all of them: the visitor who arrives on a category card and
 * finds their exact question missing does not care that the omission was
 * once well reasoned.
 *
 * So `STARTER_SET` keeps its job — it is the *order*, and the tools whose
 * presence someone argued for — and this adds everything else that can be
 * served, in slug order after it. Two consequences worth stating:
 *
 * - **New ventures reach the live front door on merge**, with no edit here.
 *   That is the point: `gitops/prod/` is the deploy, so a venture that lands
 *   on `main` with a flat, self-contained `index.html` is public as soon as
 *   the mirror is regenerated, which `front-door-tools.test.mjs` requires of
 *   the same commit.
 * - **Ordering still matters for churn, not for correctness.** Shard names
 *   carry a content hash that rolls the pods, and `STARTER_SET` stays first
 *   so the shards holding it are undisturbed by a new venture landing in the
 *   middle of the alphabet.
 *
 * ## What "can be served" means, and why it is computed rather than listed
 *
 * A venture is eligible when its servable files are flat (the `__` key
 * encoding represents no subdirectory), its slug and filenames match what
 * `front-door/default.conf` routes, it has an `index.html`, and every
 * relative link in its pages resolves inside the mirror.
 *
 * That last one is not a property of the venture alone — it is a property of
 * the venture *and the set*. `marketplace-fee-compare` links sideways to its
 * sibling marketplace calculators, which is exactly why `STARTER_SET`'s
 * comment records it as unmirrorable; with the siblings now in the set those
 * links resolve and it is fine. So eligibility is computed by fixpoint:
 * assume every candidate is in, drop the ones with dead links, and repeat,
 * because dropping a venture can break the links of one that pointed at it.
 *
 * A `STARTER_SET` entry is never dropped this way. Someone argued for it, and
 * a curated tool silently vanishing from the front door because a neighbour
 * changed a link is the failure this whole module exists to prevent —
 * `buildMirror` still throws for those.
 */
export async function discoverEligible({ set = STARTER_SET, venturesDir = VENTURES_DIR } = {}) {
  const named = new Set(set.map((entry) => entry.slug));
  const candidates = [];
  for (const entry of await fs.readdir(venturesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || named.has(entry.name) || !ROUTABLE_SLUG.test(entry.name)) continue;
    const names = await ventureFiles(entry.name, venturesDir);
    if (!names.includes('index.html') || !names.every((n) => ROUTABLE_SUBPATH.test(n))) continue;
    candidates.push({ slug: entry.name, names });
  }
  candidates.sort((a, b) => a.slug.localeCompare(b.slug));

  // Read once; the fixpoint below only ever removes ventures, so re-reading on
  // each pass would be the same bytes off disk two or three times over.
  const read = async ({ slug, names }) =>
    Promise.all(
      names.map(async (file) => ({
        slug,
        file,
        contents: await fs.readFile(await ventureFilePath(slug, file, venturesDir), 'utf8'),
      })),
    );
  const namedFiles = (
    await Promise.all(set.map(async ({ slug }) => read({ slug, names: await ventureFiles(slug, venturesDir) })))
  ).flat();
  const byCandidate = new Map(
    await Promise.all(candidates.map(async (c) => [c.slug, await read(c)])),
  );

  let admitted = candidates.map((c) => c.slug);
  // Why each venture left, and on which pass. Pass 1 is a venture's own doing;
  // a later pass means it only became ineligible when something it linked to
  // was dropped, which is the difference between "this page is unmirrorable"
  // and "this page is collateral". `explainIneligible` reports that difference
  // because the two call for completely different responses.
  const dropped = new Map();
  for (let pass = 1; ; pass += 1) {
    const files = [...namedFiles, ...admitted.flatMap((slug) => byCandidate.get(slug))];
    const failing = new Map();
    for (const problem of validateLinks(files)) {
      const slug = problem.split('/')[0];
      if (named.has(slug) || failing.has(slug)) continue;
      failing.set(slug, problem);
    }
    if (!failing.size) return withDrops(admitted, dropped);
    for (const [slug, problem] of failing) dropped.set(slug, { pass, problem });
    admitted = admitted.filter((slug) => !failing.has(slug));
  }
}

/**
 * The discovered slugs, with the drop log hung off them as a non-enumerable
 * property.
 *
 * An array so every existing caller — `mirrorSet`, the tests that assert
 * ordering — keeps working unchanged; non-enumerable so `assert.deepEqual`
 * against a plain array of slugs still passes. `explainIneligible` is the only
 * thing that reads it, and it needs the *reason* the fixpoint dropped each
 * venture, which cannot be recovered afterwards by re-checking that venture on
 * its own: in isolation every cross-venture link looks dead, so a page that is
 * only collateral would be reported as if it were broken.
 */
function withDrops(admitted, dropped) {
  Object.defineProperty(admitted, 'dropped', { value: dropped, enumerable: false });
  return admitted;
}

/** `STARTER_SET`, then every other venture the mirror can serve. */
export async function mirrorSet(venturesDir = VENTURES_DIR) {
  const discovered = await discoverEligible({ venturesDir });
  return [...STARTER_SET, ...discovered.map((slug) => ({ slug }))];
}

/**
 * Every venture the mirror does *not* serve, and the reason for each.
 *
 * Reported rather than checked, and printed by a bare run of this module. It
 * exists because "why isn't venture X on the front door?" became the only
 * interesting question this file answers that its output did not, and
 * answering it took a throwaway script that re-implemented half of
 * `discoverEligible` — and got the answer wrong, because a venture checked on
 * its own has every cross-venture link read as dead.
 *
 * So the reasons come from the fixpoint's own drop log, not from re-checking.
 * The pass number is the whole point:
 *
 * - **Dropped on pass 1** — the venture's own pages link somewhere the mirror
 *   cannot follow. That is a fact about the venture.
 * - **Dropped on a later pass** — it was fine until something it linked to
 *   was dropped. It is collateral, and it comes back for free if the venture
 *   that blocked it ever becomes eligible.
 *
 * Measured 2026-09-02 over 28 excluded ventures:
 *
 * - **16 have no `index.html` anywhere the mirror looks** — `print-atelier`,
 *   `ubuntu-agent-server`, `local-site-studio` and the rest are CLIs,
 *   servers, watch faces, or apps with a build step. Not static pages, so not
 *   a gap the mirror can close. If one grows a browser entry point it becomes
 *   eligible on its own — which is why this is reported rather than written
 *   down as a list.
 *
 * **Corrected 2026-09-03: that bullet used to read "21", name
 * `quote-margin-check` and `tender-radar` among them, and tell future
 * sessions not to try.** Five of those 21 were not apps with a build step at
 * all. `quote-margin-check`, `tender-radar`, `equipment-rental-break-even`,
 * `mcp-supply-chain-watch` and `shopify-permission-drift` each keep a
 * completely flat static site in `site/`, and `platform/pages/build.mjs` — the
 * canonical build, the thing that decides what `tools.marisstella.dev` serves
 * — had resolved entry points as `ENTRY_CANDIDATES = ['index.html',
 * path.join('site', 'index.html')]` the whole time. So the apex and the
 * canonical host disagreed about which ventures are static pages, this module
 * was the one that was wrong, and the note said the disagreement was a fact
 * about the ventures. `venturePageRoot` now applies the same two candidates in
 * the same order.
 *
 * That was six tools, not five: `delivery-app-margin-calculator` is a flat,
 * eligible calculator that links to `../quote-margin-check/` and dropped as
 * collateral on pass 2 for as long as the target was unmirrorable. It came
 * back for free, which is the fixpoint working as designed.
 *
 * The earlier "one venture costing three" case — `no-show-fee-calculator`
 * loading `src/app.mjs` — is fixed and gone; all three of those tools are
 * served. There are no dead-link or collateral exclusions left at all.
 *
 * **Fixed 2026-09-02.** This paragraph used to name a fourth entry —
 * `marketplace-fee-compare`, held out because `validateLinks` scanned the whole
 * document including `<script>`, so its channel list's JS template strings read
 * as a literal `href="../${escapeHtml(channel.deepTool)}/"`. It argued the
 * check was "conservative in the safe direction" and that narrowing it "would
 * trade one missing tool for a class of genuinely dead link it currently
 * catches".
 *
 * That trade was never on offer. On an interpolated href the old scan compared
 * unexpanded template source against the mirror, which cannot match whatever
 * the expression evaluates to — so it failed every such link unconditionally
 * rather than detecting anything. `validateLinks` now scans script bodies as
 * JavaScript: fully literal hrefs in a script are resolved exactly as markup
 * ones are (that is the real detection, and it is kept and tested), and
 * interpolated ones go to `dynamicLinks` as advisory. The tool is served.
 */
export async function explainIneligible({ venturesDir = VENTURES_DIR } = {}) {
  const discovered = await discoverEligible({ venturesDir });
  const dropped = discovered.dropped ?? new Map();
  const served = new Set([...STARTER_SET.map((entry) => entry.slug), ...discovered]);
  const excluded = [];
  for (const entry of await fs.readdir(venturesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || served.has(entry.name)) continue;
    const slug = entry.name;
    if (!ROUTABLE_SLUG.test(slug)) {
      excluded.push({ slug, kind: 'unroutable', reason: 'slug is not one front-door/default.conf can route' });
      continue;
    }
    const names = await ventureFiles(slug, venturesDir).catch(() => null);
    if (!names?.includes('index.html')) {
      excluded.push({
        slug,
        kind: 'not-a-page',
        reason: `no index.html at the venture root, in ${NESTED_PAGE_ROOT}/, or at its ENTRY_OVERRIDES path — not a static page the mirror can serve`,
      });
      continue;
    }
    const unroutable = names.filter((name) => !ROUTABLE_FILE.test(name));
    if (unroutable.length) {
      excluded.push({ slug, kind: 'unroutable', reason: `filenames nginx cannot route: ${unroutable.join(', ')}` });
      continue;
    }
    const drop = dropped.get(slug);
    if (!drop) {
      // Discovery admitted it and this did not, or neither did. Either way the
      // two disagree, which is a bug in one of them rather than a fact about
      // the venture — say so rather than inventing a reason.
      excluded.push({ slug, kind: 'unexplained', reason: 'not served and not in the drop log — discovery and this disagree' });
      continue;
    }
    excluded.push({
      slug,
      kind: drop.pass === 1 ? 'dead-link' : 'collateral',
      pass: drop.pass,
      reason:
        drop.pass === 1
          ? drop.problem
          : `collateral (pass ${drop.pass}) — became unreachable once something it links to was dropped: ${drop.problem}`,
    });
  }
  return excluded.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The ConfigMap key a mirrored file gets.
 *
 * ConfigMap keys cannot contain `/`, so the venture and the filename are joined
 * with `__` and `front-door/default.conf` maps the URL back. The alternative —
 * an explicit `items:` list on the volume, one entry per file, to rebuild the
 * directory tree at mount time — would put ~90 lines of hand-maintained YAML in
 * `portfolio-front.yaml` that must stay in step with this set. A rewrite rule
 * in nginx does the same job in two lines and cannot drift.
 *
 * A file inside a page subdirectory (`tool/index.html`, see `ventureFiles`)
 * has its separator encoded the same way, so `consent-change-record` +
 * `tool/index.html` becomes `consent-change-record__tool__index.html`. That is
 * unambiguous to decode because `ROUTABLE_SLUG` forbids `_` in both the slug
 * and the directory name, so the nginx captures cannot swallow a separator —
 * but a *filename* may contain `__`, which is why `assertUniqueKeys` still has
 * to run: a venture holding both `tool/index.html` and a flat file literally
 * named `tool__index.html` would encode to one key, and the projected volume
 * would refuse to mount rather than serve the wrong bytes.
 */
export const mirrorKey = (slug, file) => `${slug}__${file.replaceAll('/', '__')}`;

/**
 * The ConfigMap key the *stored* bytes get — the mirror key plus `.gz`.
 *
 * Two keys rather than one because they answer different questions and both
 * are asked. `mirrorKey` is the identity of the file inside the mirror, which
 * is what `validateLinks`, `assertUniqueKeys` and the URL rewrites reason
 * about; `storedKey` is the name on disk and in the ConfigMap, which is what
 * `gzip_static` appends `.gz` to find. Collapsing them would make every link
 * check compare `a.html` against `a.html.gz` and pass nothing.
 */
export const storedKey = (slug, file) => `${mirrorKey(slug, file)}.gz`;

/**
 * The slugs and filenames `front-door/default.conf` can actually route.
 *
 * Kept here beside the encoding they pair with, because a mismatch is silent
 * in the worst way: the generator would happily write files for a venture
 * called `foo_bar`, kustomize would happily put them in the ConfigMap, the
 * pod would happily mount them, and every request would 404 with nothing in
 * the tree failing. These mirror the character classes in those `location`
 * blocks, and `buildMirror` rejects anything they do not match.
 */
export const ROUTABLE_SLUG = /^[a-z0-9][a-z0-9-]*$/;
export const ROUTABLE_FILE = /^[A-Za-z0-9._-]+$/;

/**
 * A path inside a venture that `front-door/default.conf` can route: a flat
 * filename, or one page subdirectory then a filename.
 *
 * Two levels and no more. `ventureFiles` only ever walks one level down, and
 * the `location` blocks only decode one separator — so a deeper path would be
 * generated, stored and mounted, and then 404 with nothing failing. That is
 * the exact silent-mismatch failure the comment above this pair describes, so
 * the depth limit lives in the pattern rather than in a reader's memory.
 */
export const ROUTABLE_SUBPATH = new RegExp(
  `^(?:${ROUTABLE_SLUG.source.slice(1, -1)}/)?${ROUTABLE_FILE.source.slice(1, -1)}$`,
);

/** The apex URL a mirrored file is served at. */
export const mirrorUrl = (slug, file) =>
  `/${MIRROR_PREFIX}${slug}/${file === 'index.html' ? '' : file}`;

/** The `tools.marisstella.dev` URL the same page has (or will have) — its canonical. */
export const canonicalUrl = (slug, file) =>
  `${TOOLS_URL}${slug}/${file === 'index.html' ? '' : file}`;

/** The absolute URL a mirrored file answers on today. `mirrorUrl`, with an origin. */
export const apexUrl = (slug, file) => `${APEX_URL.replace(/\/$/, '')}${mirrorUrl(slug, file)}`;

/**
 * Whether `tools.marisstella.dev` serves anything yet.
 *
 * This is the premise the mirror's whole search posture rests on, and until
 * 2026-09-03 it was stated nowhere and assumed everywhere. Flip it to `true`
 * in the same commit that seals `portfolio-site-repo`, and the canonical, the
 * robots meta and the apex sitemap all move back together.
 *
 * ## Why this exists
 *
 * The mirror was built as a stopgap for a host that was about to go live, and
 * every SEO decision in this module was made for the world one commit after
 * the seal: mark the copies `noindex`, canonicalise them to the tools host,
 * and the crawler consolidates on the real home the moment it appears. That is
 * the correct design *if the seal is imminent*, and `portfolio-apex.yaml` is
 * right that two hosts serving the same bytes undoes the consolidation
 * `build.mjs` stamps in.
 *
 * The seal was not imminent. It is owner-only (decision-queue
 * `portfolio-site-hetzner-deploy`, #1999), has been queued for weeks, and no
 * session can perform it. Meanwhile the apex serves 168 of the 169 tools
 * itself, and the standing posture pointed every one of their canonicals at a
 * hostname that answers nothing while telling crawlers, twice — a `noindex`
 * meta and an `X-Robots-Tag` header — not to index the copies that do answer.
 *
 * The net effect was that the portfolio's entire public catalogue was
 * deliberately excluded from search, on behalf of a host that does not exist
 * yet. `PRODUCT_PLAYBOOK.md` names organic search and AI discovery as the
 * acquisition channel, and `portfolio/usage/usage.yaml` has recorded zero
 * observed users across all 184 products. Those two facts are the same fact:
 * a catalogue nothing may index earns no organic visit, however good it is.
 *
 * ## Why flipping is safe, and cheaper to reverse than to leave
 *
 * The duplicate-content risk this guarded against needs two hosts serving the
 * same bytes *at the same time*, and that state never arrives. The mirror is a
 * stopgap that `MIRROR_BYTE_CEILING`'s comment expects to be "deletable in one
 * commit" the day the seal lands — so the tools host replaces the mirror
 * rather than competing with it.
 *
 * A canonical pointing at a URL that does not resolve is not a neutral
 * placeholder either: it is a hint a crawler discards, leaving the `noindex`
 * to decide alone. So the pre-flip state bought no consolidation and paid the
 * full cost of exclusion.
 *
 * Reversing costs one boolean and a regeneration. Leaving it costs every
 * organic visit the catalogue would have earned in the meantime.
 */
export const TOOLS_HOST_SERVES = false;

/**
 * What `injectMirrorTags` writes into every mirrored page's robots meta.
 *
 * `follow` in both directions: the mirrored pages link to each other and back
 * to the front door, and a crawler that will not follow them cannot discover
 * the catalogue even when it is allowed to index it.
 */
export const MIRROR_ROBOTS_CONTENT = TOOLS_HOST_SERVES ? 'noindex,follow' : 'index,follow';

/**
 * The canonical a mirrored page claims: the address that actually serves it.
 *
 * A canonical naming a host that answers nothing is worse than none — see
 * `TOOLS_HOST_SERVES`. While the tools host is dark the apex *is* the tool's
 * home, so it says so; once sealed, `canonicalUrl` names the long-run home
 * again and consolidation happens against a host that responds.
 */
export const mirrorCanonicalUrl = (slug, file) =>
  TOOLS_HOST_SERVES ? canonicalUrl(slug, file) : apexUrl(slug, file);

/**
 * A test file, by either convention this repository uses to name one.
 *
 * `.test.` catches `calc.test.mjs`, which is what most ventures write and what
 * this check was originally written for. It does not catch a file called
 * plainly `test.mjs`, and two ventures name theirs that way — so
 * `cam-reconciliation-check__test.mjs` and
 * `chargeback-evidence-packet__test.mjs` were both being published to the
 * apex, 6,895 bytes of `node:test` source served to strangers out of a mirror
 * that was 93.7% full and refusing new tools for want of room.
 *
 * Nothing links to them, so `validateLinks` had no reason to notice, and they
 * are inert in a browser rather than a leak. The cost was the bytes and the
 * noise, both of which this removes.
 */
/**
 * The tab mark, and the other paths the front door's own document root serves.
 *
 * A mirrored page lives at `marisstella.dev/tools/<slug>/`, so a root-absolute
 * href on it is answered by `front-door/`'s ConfigMap rather than by the
 * mirror. `injectMirrorTags` adds `/favicon.svg` for the same reason
 * `front-door.mjs` added it to the apex page: a document that declares no icon
 * makes the browser request `/favicon.ico` unprompted, which nothing here
 * serves, so every tool page showed a blank tab and logged a miss. The
 * ventures declare no icon of their own — checked across all 47 mirrored
 * entry pages — so this is an addition rather than an override, and the
 * `rel="icon"` strip beside the canonical one keeps it that way if a venture
 * later grows one.
 *
 * `validateLinks` needs the same list: it resolves relative hrefs inside the
 * mirror, and a root-absolute href is not one of those. Before this it treated
 * `/favicon.svg` as `<slug>/favicon.svg` and would have failed the build on the
 * tag this module itself injects.
 */
export const FAVICON_FILE = 'favicon.svg';

/**
 * The share card the apex already serves, and the dimensions and alt text that
 * describe it.
 *
 * Declared here rather than imported for the same reason `FAVICON_FILE` is —
 * this module builds a mirror that must survive the front door's own generator
 * being absent — and pinned against `front-door.mjs` and `pages/offline.mjs`
 * by a test, for the same reason again: if they drift, every mirrored page
 * points at a file the apex does not serve, or lies about its shape.
 */
export const SOCIAL_CARD_FILE = 'social-card.png';
export const SOCIAL_CARD_WIDTH = 1200;
export const SOCIAL_CARD_HEIGHT = 630;
export const SOCIAL_CARD_ALT =
  'The site mark: a simple calculator — a display above two rows of three keys — centred on a plain coloured field. The card carries no text.';

export const APEX_ROOT_PATHS = new Set([
  '/',
  `/${FAVICON_FILE}`,
  `/${SOCIAL_CARD_FILE}`,
  '/healthz',
  // The embed runtime and its stylesheet, written to the apex document root by
  // `front-door.mjs --write` and linked absolutely from every mirrored entry
  // page. Named from `embed.mjs`'s own constants so this allowlist cannot
  // drift from the filenames the injector writes.
  `/${EMBED_MODULE_FILE}`,
  `/${EMBED_STYLE_FILE}`,
  // The resizer. Not linked from any page here — the embed snippet names it,
  // and the page that runs it is somebody else's — but it is served from this
  // document root and so belongs in the same allowlist.
  `/${EMBED_HOST_FILE}`,
  // The About and press-kit page, `renderFrontDoorAbout` in `front-door.mjs`,
  // served from the document root by `default.conf`'s `^/about/?$` block. In
  // the allowlist so a mirrored page may link to it — the injected chrome does
  // not today, but `validateLinks` rejects any absolute link this root does not
  // serve, and a page that *can* be linked to belongs here rather than being
  // discovered as a build failure by whoever first adds the link.
  `/${ABOUT_PATH}`,
]);

const isTestFile = (name) => name.includes('.test.') || /^test\.(m?js)$/.test(name);

const isServable = (name) =>
  (SERVABLE_EXTENSIONS.has(path.extname(name)) || SERVABLE_NAMES.has(name)) && !isTestFile(name);

/**
 * Is this subdirectory a page of the venture, or part of how it is built?
 *
 * The mirror walks exactly one level down, and only into directories that
 * carry their own `index.html`. That single condition is what separates the
 * two kinds of subdirectory `ventures/` actually contains:
 *
 * - `consent-change-record/tool/` is a second tool — its own page, its own
 *   modules, linked from the venture's front page as "HAR before/after diff".
 * - `src/`, `tests/`, `examples/`, `scripts/`, `docs/` are how a venture is
 *   built or checked. None of them holds an `index.html`, and mirroring one
 *   would put a Node source tree behind a public URL and spend the mirror's
 *   byte ceiling on files no visitor can use.
 *
 * Measured across all 184 ventures on 2026-09-02: exactly one subdirectory
 * anywhere in `ventures/` satisfies this, and it is `consent-change-record/
 * tool/`. So the rule admits the page it was written for and nothing else,
 * and it stays that way by construction rather than by a hand-kept list — a
 * future venture that grows a genuine sub-page is picked up, and one that
 * grows a `src/` is not.
 *
 * The directory name must also pass `ROUTABLE_SLUG`, because
 * `front-door/default.conf` routes it with the same character class it routes
 * a venture slug with. A `.cursor/` or `.github/` could never be reached even
 * if it somehow held a page, so it is refused here rather than shipped dark.
 */
async function isPageDirectory(pageRoot, name) {
  if (!ROUTABLE_SLUG.test(name)) return false;
  return fs
    .access(path.join(pageRoot, name, 'index.html'))
    .then(() => true)
    .catch(() => false);
}

/**
 * The subdirectory a venture may keep its browser entry point in, when it does
 * not keep one at its root.
 *
 * This is not a rule invented here. `platform/pages/build.mjs` — the canonical
 * site build, the thing that decides what `tools.marisstella.dev` publishes —
 * has resolved a venture's entry point as `ENTRY_CANDIDATES = ['index.html',
 * path.join('site', 'index.html')]` for as long as this mirror has existed.
 * The mirror knowing only the first of the two is what made the apex disagree
 * with the canonical host about which ventures are static pages at all.
 *
 * **That disagreement recurred on 2026-09-03, and this constant is now a label
 * rather than the rule.** Restating `build.mjs`'s resolution here fixed the
 * `site/` half and froze the mistake in place: `build.mjs` also carries
 * `ENTRY_OVERRIDES`, for ventures whose surface is at neither standard path,
 * and a copied constant could not know that. `ai-engineering-academy` declares
 * `tools`, so the canonical build published its hub and six working
 * electronics calculators while this module reported the venture as "not a
 * static page the mirror can serve" — and since the canonical host serves
 * nothing until `portfolio-site-repo` is sealed, those seven pages were public
 * nowhere.
 *
 * `venturePageRoot` therefore imports both `ENTRY_CANDIDATES` and
 * `ENTRY_OVERRIDES` from `build.mjs` instead of restating either. This name is
 * kept only because the prose and the exclusion message read better with a
 * word for the `site/` case; nothing resolves a path through it.
 */
const NESTED_PAGE_ROOT = 'site';

/**
 * Where a venture's servable files actually live.
 *
 * `ventures/<slug>` for almost every venture. `ventures/<slug>/site` for one
 * that keeps its pages there and its Node sources beside them — the shape
 * `build.mjs` already publishes and this module used to read as "no flat
 * index.html, therefore not a static page".
 *
 * Root wins when both exist, matching `ENTRY_CANDIDATES`' order, so a venture
 * cannot be served from two roots depending on which file you asked about.
 *
 * The nested root is *only* consulted for the entry point. Everything the
 * mirror does afterwards — flatness, `ROUTABLE_SUBPATH`, link resolution, the
 * `<slug>__<file>` key encoding, `/tools/<slug>/` — is unchanged and still
 * measured relative to whatever this returns. So a `site/` venture whose pages
 * are not flat, or link outside the set, is dropped by exactly the checks that
 * would drop a root-level one; nothing here weakens them.
 */
async function venturePageRoot(slug, venturesDir = VENTURES_DIR) {
  const root = path.join(venturesDir, slug);
  // An override replaces the candidate list rather than extending it, exactly
  // as `discoverSurfaces` does — a venture that declares where its surface
  // lives is not also searched at the standard paths, so it cannot be served
  // from two roots depending on which file you asked about.
  const override = ENTRY_OVERRIDES[slug];
  const candidates = override ? [path.join(override, 'index.html')] : ENTRY_CANDIDATES;
  for (const candidate of candidates) {
    const dir = path.join(root, path.dirname(candidate));
    if (await fs.access(path.join(root, candidate)).then(() => true, () => false)) return dir;
  }
  // No entry point anywhere. Return the venture root so callers report "no
  // index.html" against the directory a reader would go looking in, rather
  // than against a `site/` that may not exist.
  return root;
}

/**
 * Files a `site/`-rooted venture keeps at its root, one level above its pages,
 * and which its pages nonetheless link to as if they were siblings.
 *
 * Only `LICENSE`, and it is not a special case invented here either.
 * `build.mjs` copies exactly this file into exactly these ventures' published
 * trees, for exactly this reason — its comment names the six of them: their
 * pages carry an `<a href="LICENSE">` footer, the file lives one level up, and
 * without the copy that link resolves to nothing. The mirror has the same
 * footer to satisfy and needs the same answer.
 *
 * README.md is deliberately not here, matching `build.mjs`: it is repo
 * bookkeeping and no published tree carries one.
 */
const ROOT_FALLBACK_FILES = new Set(['LICENSE']);

/**
 * The on-disk path of one file `ventureFiles` returned.
 *
 * Every read of a mirrored file goes through this rather than joining
 * `venturesDir`, `slug` and `file` directly, because the middle term is the
 * page root and not always the venture directory — and because a `LICENSE`
 * the page root does not hold is read from the venture root instead.
 */
export async function ventureFilePath(slug, file, venturesDir = VENTURES_DIR) {
  const pageRoot = await venturePageRoot(slug, venturesDir);
  const atPageRoot = path.join(pageRoot, file);
  if (!ROOT_FALLBACK_FILES.has(file)) return atPageRoot;
  if (await fs.access(atPageRoot).then(() => true, () => false)) return atPageRoot;
  return path.join(venturesDir, slug, file);
}

/**
 * The servable files of one venture, sorted so the output is deterministic.
 *
 * Returns flat filenames (`index.html`, `calc.mjs`) plus, for any subdirectory
 * `isPageDirectory` admits, that directory's own servable files as posix paths
 * one level deep (`tool/index.html`). Everything downstream — `mirrorKey`,
 * `mirrorUrl`, `validateLinks` — treats the result as an opaque path relative
 * to the venture root, so a `/` inside one needs no special case beyond the
 * key encoding and the two `location` blocks that decode it.
 *
 * Paths are relative to `venturePageRoot`, not to `ventures/<slug>`. For a
 * `site/`-rooted venture that means `index.html`, not `site/index.html` — the
 * mirror serves it at `/tools/<slug>/` exactly as the canonical site does, and
 * the venture's own relative links resolve against the same base they were
 * written for.
 */
export async function ventureFiles(slug, venturesDir = VENTURES_DIR) {
  const dir = await venturePageRoot(slug, venturesDir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && isServable(entry.name))
    .map((entry) => entry.name);
  // A `site/`-rooted venture's LICENSE is one level up. Offer it at the page
  // root so the footer link every one of these pages carries resolves inside
  // the mirror, exactly as `build.mjs` does for the published site.
  if (dir !== path.join(venturesDir, slug)) {
    for (const name of ROOT_FALLBACK_FILES) {
      if (files.includes(name)) continue;
      if (await fs.access(path.join(venturesDir, slug, name)).then(() => true, () => false)) {
        files.push(name);
      }
    }
  }
  // Same reasoning as `build.mjs`'s own `DOWNLOADABLE_CLI_FILES` loop: a `.py`
  // CLI a venture's own page offers as a same-origin download is not
  // `isServable` (`.py` is not in `SERVABLE_EXTENSIONS`, on purpose -- most
  // ventures' CLI source is not a public deliverable), so the specific files
  // named there have to be added back explicitly, imported rather than
  // restated, or the mirror's own copy of these 18 pages links to a file the
  // mirror itself never serves.
  for (const name of DOWNLOADABLE_CLI_FILES[slug] ?? []) {
    if (files.includes(name)) continue;
    if (await fs.access(path.join(venturesDir, slug, name)).then(() => true, () => false)) {
      files.push(name);
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!(await isPageDirectory(dir, entry.name))) continue;
    const nested = await fs.readdir(path.join(dir, entry.name), { withFileTypes: true });
    for (const child of nested) {
      if (child.isFile() && isServable(child.name)) files.push(`${entry.name}/${child.name}`);
    }
  }
  return files.sort();
}

/**
 * Add the tags that keep this copy out of the index, pointed home, and looking
 * like part of the site it is actually served from.
 *
 * Inserted after the charset declaration rather than after `<head>`, because
 * the charset has to stay inside the first 1024 bytes for a browser to honour
 * it and these tags are large enough to push it out on a compact page.
 *
 * A venture source carries no canonical of its own — `build.mjs` injects one
 * when it publishes — so there is nothing here to replace. The regex still
 * strips a pre-existing one rather than leaving two, since a page with two
 * canonicals has the crawler pick, which is the failure mode being avoided.
 *
 * **`robots` is stripped for exactly that reason, and until 2026-09-02 it was
 * not.** The sentence above was written about canonicals and the same argument
 * was never carried across, so the mirror prepended its `noindex,follow` and
 * left whatever the venture already had: 24 of the 45 mirrored pages went out
 * carrying `noindex,follow` on line 4 and `index, follow` on line 8. Unlike
 * the canonical case, these tags are not merely two of a kind — they say
 * opposite things.
 *
 * Google resolves conflicting robots directives by taking the most
 * restrictive, so `noindex` almost certainly won, and `default.conf`'s
 * `X-Robots-Tag: noindex` on these paths is an independent backstop that does
 * not depend on the markup at all. So this is a hardening, not a live
 * indexing incident. It is still worth fixing, because the module header above
 * claims the mirror is invisible to crawlers *structurally* — and a claim that
 * rests on every crawler resolving a contradiction we shipped the way Google
 * documents is not structural. Bing and the AI crawlers do not all publish a
 * conflict rule, and "most restrictive wins" is not the only plausible one;
 * "last tag wins" would have indexed all 24.
 *
 * ## `og:url` is the third tag with the same story, fixed 2026-09-03
 *
 * The two paragraphs above are each about a tag the venture source already
 * carried, which the mirror had to reconcile rather than merely prepend. The
 * argument was never carried to `og:url` either, and there it was not a
 * hardening: 52 mirrored pages went out declaring
 * `<meta property="og:url" content="https://example.invalid/...">`.
 *
 * That placeholder is deliberate in the sources — it predates the portfolio
 * having any origin at all, and `build.mjs` overwrites it with the real one
 * when it publishes to the canonical host (`PLACEHOLDER_ORIGIN` there names
 * it). This mirror is the *other* publisher, and it never learned that step.
 *
 * Unlike the robots conflict, nothing downstream rescues this. A share card is
 * built from `og:url` alone: paste a mirrored tool's link into Slack, LinkedIn,
 * Facebook or WhatsApp and the scraper keys the card to `example.invalid`, a
 * reserved-by-RFC-2606 domain that resolves nowhere. `X-Robots-Tag` does not
 * apply — this is not a crawler path — and the `rel="canonical"` two lines
 * above does not either, because a scraper reads `og:url` in preference to it.
 * `build.mjs`'s own comment calls organic sharing into trade groups a named
 * acquisition channel here, so this is that channel broken on the only surface
 * the portfolio actually serves.
 *
 * ## Why the apex URL and not the canonical
 *
 * `canonicalUrl` is `tools.marisstella.dev`, which serves nothing until
 * `portfolio-site-repo` is sealed. `renderFrontDoorFeed` faced this exact
 * choice and its comment settles it: a link a reader follows must work, and "a
 * feed whose every entry is a dead link is worse than no feed". A share card is
 * the same object — a human clicks it — so it gets `apexUrl`, the address that
 * answers today, while `rel="canonical"` keeps naming the long-run home. The
 * SEO cost is nil for the reason the feed gives: these pages are `noindex` in
 * markup and in the header, so nothing here competes for consolidation.
 *
 * ## Repair, never insert
 *
 * Only a page that already has the tag gets one. A page with no `og:url` lets
 * the scraper key the card to the pasted URL, which is the working apex URL
 * already — strictly better than what the 52 had, and free. Injecting the tag
 * everywhere would spend mirror bytes (`MIRROR_BYTE_CEILING` is the binding
 * constraint) to buy nothing.
 *
 * The matcher is `build.mjs`'s whole-tag form rather than `[^>]*`: a
 * hand-written `og:description` may contain a bare `>` ("net > 0"), and a
 * matcher that stops at it would mangle the tag it lands on.
 *
 * ## `og:image`, added the same day
 *
 * Fixing `og:url` makes a mirrored tool's share card resolve; it does not make
 * it worth looking at. No venture source declares an `og:image` — `build.mjs`
 * found "no page had one" across all 442 it publishes — so every mirrored tool
 * pasted anywhere renders as a bare text row. That module calls the image "the
 * single largest determinant of whether anyone clicks", and it is the half of
 * the share card this mirror could fix for almost nothing.
 *
 * Almost nothing, because the card is already served. `/social-card.png` sits
 * at the apex document root in `portfolio-front-html` beside `/favicon.svg`,
 * which these pages already reference the same way — so the mirror carries the
 * tag and not the image, and `MIRROR_BYTE_CEILING` barely moves. The URL is
 * absolute because a scraper fetching a card off a pasted link does not
 * reliably resolve a relative one, and `twitter:card` is what upgrades the row
 * to `summary_large_image` on the readers that honour it.
 *
 * This is an insert rather than a repair — the opposite of `og:url` above, and
 * for the opposite reason. There is nothing here to reconcile, and the
 * fallback if we skipped it is not "the scraper works it out" but "no image".
 * The card is the site's generic mark rather than one drawn per tool: that is
 * `build.mjs`'s own documented fallback when a page has no card of its own
 * (`cardFile || SOCIAL_CARD_FILE`), and a per-tool card would cost ~6 KB
 * apiece against a mirror that is the one place in this repo where bytes are
 * the binding constraint. `SOCIAL_CARD_ALT` says the card carries no text,
 * which stays true of a generic card on a specific tool's page — the reason
 * that alt text is worded the way it is.
 */
export function injectMirrorTags(html, { slug, file }) {
  const tags =
    `<meta name="robots" content="${MIRROR_ROBOTS_CONTENT}">` +
    `<link rel="canonical" href="${mirrorCanonicalUrl(slug, file)}">` +
    `<link rel="icon" href="/${FAVICON_FILE}" type="image/svg+xml">` +
    `<meta property="og:image" content="${APEX_URL.replace(/\/$/, '')}/${SOCIAL_CARD_FILE}">` +
    `<meta property="og:image:width" content="${SOCIAL_CARD_WIDTH}">` +
    `<meta property="og:image:height" content="${SOCIAL_CARD_HEIGHT}">` +
    `<meta property="og:image:alt" content="${SOCIAL_CARD_ALT}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    NAV_STYLE +
    // Only entry pages carry the cross-link block, so only they need its rule.
    // Shipping it on all 544 mirrored pages would spend bytes on 375 that have
    // no element to match.
    (file === 'index.html' ? RELATED_STYLE : '');
  const stripped = html
    .replace(STRIPPED_LINK, '')
    .replace(/<meta\b[^>]*\bname=["']robots["'][^>]*>/gi, '')
    .replace(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
      if (/\bproperty=["']og:url["']/i.test(tag)) {
        return `<meta property="og:url" content="${apexUrl(slug, file)}">`;
      }
      // No venture declares these today, so this drops nothing. It is here so
      // that one which later does gets its tag reconciled rather than
      // duplicated — the same rule the canonical and robots strips above keep,
      // and the reason `og:url` was a live defect is that this rule had a gap.
      if (/\b(?:property=["']og:image(?::\w+)?["']|name=["']twitter:card["'])/i.test(tag)) {
        return '';
      }
      return tag;
    });
  const charset = stripped.match(/<meta\s+charset=["'][^"']*["']\s*\/?>/i);
  if (charset) {
    const at = stripped.indexOf(charset[0]) + charset[0].length;
    return stripped.slice(0, at) + tags + stripped.slice(at);
  }
  return stripped.replace(/<head\b[^>]*>/i, (open) => open + tags);
}

/**
 * The class the return link and its rule share.
 *
 * Prefixed rather than named something a venture might already use. The rule
 * below lands near the top of `<head>`, *before* the venture's own `<style>`,
 * so on a collision the venture would win and the return link would inherit
 * whatever that class means to it — a silently unreadable link rather than a
 * visible break. A test asserts no mirrored page's source already uses it.
 */
export const NAV_CLASS = 'fd-back';

/**
 * The rule for the return link, injected into every mirrored page's head.
 *
 * Inline `style` on the anchor would cost about the same and lose the
 * `@media print` rule, which is not optional here: every mirrored venture's
 * print stylesheet hides `header, main, footer` with `!important` so that
 * printing yields the customer proposal and nothing else. An unhidden bar
 * would put "All 53 free tools" across the top of a contractor's printed bid,
 * which is the one page of this portfolio that a stranger's customer sees.
 *
 * The colour is `front-door.mjs`'s `--cta-bg`/`--cta-fg` pair, stated
 * literally because the venture pages do not define those custom properties.
 * It is a fixed dark blue in both schemes: the venture pages carry their own
 * light and dark palettes, and a bar that inverted with them would need each
 * venture's variables rather than the front door's.
 */
export const NAV_STYLE =
  `<style>.${NAV_CLASS}{display:block;margin:0 0 1rem;padding:.55rem 1rem;background:#12506b;` +
  `color:#fff;font:600 14px system-ui,sans-serif;text-decoration:none}` +
  `@media print{.${NAV_CLASS}{display:none!important}}` +
  // Hidden when this page is the one inside someone else's iframe. The embed
  // runtime puts `.pf-embed` on <html> and replaces the site nav with a single
  // "open the full tool" bar; `renderEmbedStyle` does this for the chrome
  // `build.mjs` writes, and cannot know about a class that belongs to the
  // mirror. Kept here, beside the rule it overrides, rather than appended to
  // the shared stylesheet — this is the mirror's own nav, so its visibility
  // rules stay in one place.
  `.pf-embed .${NAV_CLASS}{display:none}</style>`;

/**
 * Give every mirrored page a way back to the front door.
 *
 * ## The defect this fixes
 *
 * The module header explains that the front door's cards used to hand every
 * visitor a dead host, and that this mirror is what fixed it. It fixed the
 * hop *into* a tool and left the hop *out* of one missing, which is the same
 * defect one level down: a mirrored page's only links are its own siblings,
 * its `LICENSE`, and a canonical to the host that still serves nothing. So a
 * visitor who opens the fence calculator — from the front door, a bookmark, or
 * a link someone sent them — has no route to the other 52 tools and no way to
 * learn they exist. Every tool the apex serves is a cul-de-sac, and the
 * portfolio's one working funnel is one page deep.
 *
 * A returning visitor is the cheapest adoption this portfolio can get: the
 * tools share an audience (a contractor who bids fences also bids concrete),
 * they cost nothing to serve, and the front door already groups them by
 * category. The link is what makes that grouping reachable from where people
 * actually land.
 *
 * ## Why one link, at the top
 *
 * It reaches every tool, because the front door is already the catalogue, and
 * it costs one anchor on a page where bytes are the binding constraint — see
 * `MIRROR_BYTE_CEILING`.
 *
 * This comment used to end "rather than a related-tools block", on the grounds
 * that a per-page list of siblings "would cost several times this and go stale
 * against `STARTER_SET`". `injectMirrorRelated` is that block, and its own
 * comment records why both halves of that argument expired: there is no
 * `STARTER_SET` left to drift against, and the measured cost of the block is
 * 48 KB against ~2 MB of headroom. The two are complements now — this one is
 * the hop back to the catalogue, that one is the hop sideways to the three or
 * four tools the same visitor actually sells.
 *
 * It goes immediately after `<body>` rather than in the footer because a
 * calculator page is long: a footer link is below a form nobody scrolls past
 * once they have their number. It is a plain anchor with a class, not a fixed
 * or sticky bar, so it cannot overlap a venture's own layout — checked against
 * the mirrored ventures' stylesheets, none of which style `body > *`.
 *
 * The count is passed in rather than read from `STARTER_SET` so that a test
 * fixture, and any future partial build, states a number that is true of the
 * mirror it is actually building.
 */
export function injectMirrorNav(html, { toolCount }) {
  const nav =
    `<a class="${NAV_CLASS}" href="/">` +
    `&#8592; All ${toolCount} free tools on this site</a>`;
  // Matched against the masked copy, not `html` directly: a venture's own
  // JSON-LD can carry the literal text of a `<body>` tag as data (see
  // `maskScriptAndStyleBodies`'s comment), ahead of the page's real one. The
  // masked copy is the same length, so `body.index` still names the right
  // place to splice into the real, unmasked `html`.
  const body = maskScriptAndStyleBodies(html).match(/<body\b[^>]*>/i);
  // A page with no <body> tag is not one the mirror should be inventing
  // markup around; `validateLinks` and the noindex tests all assume a
  // well-formed document, and silently prepending to the file would put the
  // anchor outside <html>.
  if (!body) {
    throw new Error('a mirrored page has no <body> tag, so the return link has nowhere to go');
  }
  const at = body.index + body[0].length;
  return html.slice(0, at) + nav + html.slice(at);
}

/**
 * The class the cross-link block takes. Same reasoning as `NAV_CLASS`: an
 * `fd-` prefix no venture uses, asserted by a test over the mirrored sources.
 */
export const RELATED_CLASS = 'fd-related';

/** How many sibling tools an entry page offers. `relatedTools`' own default. */
export const RELATED_LIMIT = 4;

/**
 * The rule for the cross-link block. Injected into the head beside
 * `NAV_STYLE`, and for the same three reasons: a `@media print` rule the
 * venture stylesheets would otherwise not apply (a contractor's printed bid
 * must not carry a list of other calculators), a `.pf-embed` rule so the block
 * disappears when this page is the one inside someone else's iframe, and
 * literal colours because the venture pages do not define the front door's
 * custom properties.
 *
 * Deliberately quiet: a bordered-top list in the page's own text colour at
 * inherited size, not a second call-to-action competing with the tool. The
 * visitor came for a number; this is what they see after they have it.
 */
export const RELATED_STYLE =
  // `display` is declared on all three elements, and that is not padding.
  // These rules are injected ahead of the venture's own <style>, so on a tie
  // the venture wins; a class selector outranks a bare element one, so we win
  // — but only for properties we actually state. Three mirrored ventures set
  // `display` on a bare `nav`, `ul` or `p` (`nav{display:flex}` in
  // faire-wholesale-calculator lays the heading beside the list;
  // `p{display:none}` would delete the heading outright), and every one of
  // those would have reached the block through a property this rule left
  // unmentioned. Stating the layout is what makes the block's appearance a
  // property of the block rather than of whichever venture it lands in.
  `<style>.${RELATED_CLASS}{display:block;margin:2.5rem 0 0;padding:1rem 0 0;` +
  `border-top:1px solid #c9d4da;font:400 14px system-ui,sans-serif}` +
  `.${RELATED_CLASS} p{display:block;margin:0 0 .5rem;font-weight:600}` +
  `.${RELATED_CLASS} ul{display:block;margin:0;padding:0 0 0 1.1rem;list-style:disc}` +
  `.${RELATED_CLASS} li{display:list-item;margin:.25rem 0}` +
  `.${RELATED_CLASS} a{color:#12506b}` +
  `@media print{.${RELATED_CLASS}{display:none!important}}` +
  `.pf-embed .${RELATED_CLASS}{display:none}</style>`;

/**
 * Offer four sibling tools at the foot of a mirrored entry page.
 *
 * ## Why this exists, and why the old answer stopped being right
 *
 * `injectMirrorNav`'s comment argues for one link to the front door "rather
 * than a related-tools block", on two grounds: that a block "would cost
 * several times this" against `MIRROR_BYTE_CEILING`, and that it would "go
 * stale against `STARTER_SET`". Both were true when written and neither is
 * now.
 *
 * `STARTER_SET` is gone — the mirror covers every eligible venture, so there
 * is no curated subset for a per-page list to drift out of step with. And the
 * ceiling stopped binding at this scale when the mirror went gzip-only: the
 * committed mirror is ~6.0 MB against 8 MiB, and four anchors on 169 entry
 * pages is a fraction of the ~2.0 MB spare. The byte argument was sound
 * arithmetic against a 5 MiB ceiling holding 53 uncompressed tools; it is not
 * arithmetic about the mirror that exists.
 *
 * What the one link cannot do is the part that matters. It reaches the
 * catalogue, but it asks a visitor who has just got their number to go back to
 * a page of 169 tools and work out which of them also applies to them. A
 * contractor on the fence calculator is one click from the concrete, deck and
 * retaining-wall bids — *if* something names them. Internal links between
 * related pages are also the single largest on-site lever a static catalogue
 * has for search, and these are the pages that carry it: while
 * `TOOLS_HOST_SERVES` is false the apex is each tool's canonical and the only
 * indexable copy.
 *
 * ## Why it imports `relatedTools` rather than choosing its own four
 *
 * `build.mjs` already ranks siblings — same sub-group first, then the rest of
 * the category, then the rest of the site, rotated by the tool's own position
 * so neighbouring tools do not all advertise the same four. That ranking is
 * the reason a metal-roof page offers another roof and not a music-lesson
 * break-even, and it is tested where it lives. `CLAUDE.md` records two
 * occasions where restating a `build.mjs` rule here instead of importing it
 * cost live product; this module already imports `ENTRY_CANDIDATES` and
 * `injectEmbedWidget` for exactly that reason.
 *
 * The links are root-absolute `/tools/<slug>/` rather than `../<slug>/`
 * because a mirrored page can be served from `/tools/<slug>/` or from a
 * subdirectory below it, so a relative hop would resolve differently by depth.
 * `validateLinks` checks them against the mirror's own file list, so a link
 * here can no more go dead than a venture's own can.
 */
export function injectMirrorRelated(html, { file, related }) {
  if (file !== 'index.html' || !related?.length) return html;
  const items = related
    .map(({ slug, title }) => `<li><a href="${mirrorUrl(slug, 'index.html')}">${title}</a></li>`)
    .join('');
  const block =
    `<nav class="${RELATED_CLASS}" aria-label="Other free tools">` +
    `<p>Other free tools for the same work</p><ul>${items}</ul></nav>`;
  const bodyCloses = [...html.matchAll(/<\/body>/gi)];
  if (!bodyCloses.length) {
    throw new Error('a mirrored entry page has no </body>, so the related tools have nowhere to go');
  }
  // The *last* `</body>`, not the first: the same literal-text-in-JSON-LD
  // risk `maskScriptAndStyleBodies` documents, but the real closing tag is
  // always structurally the last one in the document, so no masking is
  // needed here to find it.
  const at = bodyCloses[bodyCloses.length - 1].index;
  return html.slice(0, at) + block + html.slice(at);
}

/**
 * Offer the embed on a mirrored entry page.
 *
 * ## Why the mirror needs its own entry point into `embed.mjs`
 *
 * `injectEmbedWidget` attaches the offer inside the `<aside class="pf-chrome
 * pf-chrome-foot">` that `build.mjs`'s `injectChrome` writes, and returns the
 * page untouched when there is none. The mirror does not run `injectChrome` —
 * it writes one anchor (`injectMirrorNav`) and nothing else, on purpose — so
 * every mirrored page hit that guard and the offer appeared on none of them.
 *
 * The fix is to give the page the footer the offer expects rather than to
 * reimplement the offer. An empty `pf-chrome-foot` immediately before
 * `</body>` is that footer, and passing it through the real
 * `injectEmbedWidget` means the box, the snippet, the stylesheet link and the
 * script tag all stay defined in exactly one place. The alternative — a second
 * copy of `offerMarkup` shaped for this host — is the mistake `CLAUDE.md`
 * documents twice.
 *
 * It also buys the framed-view behaviour for free: `renderEmbedStyle` hides
 * `.pf-chrome-foot` under `.pf-embed`, so the box disappears when this page is
 * itself the one inside someone's iframe. An embedded calculator does not need
 * instructions for embedding a calculator.
 *
 * ## Which URL the snippet points at
 *
 * `mirrorCanonicalUrl`, which is "the address that actually serves" — the apex
 * while `TOOLS_HOST_SERVES` is false, the tools host after the seal. Not
 * `canonicalUrl`: a snippet is copied once into a stranger's page and then
 * outlives every deploy here, so pointing it at a host that answers nothing
 * would hand out iframes that render blank and stay blank. This is the same
 * defect `portfolio-site.yaml`'s framing map exists to prevent, one layer out.
 *
 * Entry pages only. The deep subpages inside a tool are articles, not the
 * calculator, and `injectEmbedWidget` gates on `isEntry` for that reason.
 */
export function injectMirrorEmbed(html, { slug, file, title } = {}) {
  if (file !== 'index.html') return html;
  const bodyCloses = [...html.matchAll(/<\/body>/gi)];
  if (!bodyCloses.length) {
    throw new Error('a mirrored entry page has no </body>, so the embed offer has nowhere to go');
  }
  // The *last* `</body>` -- see `injectMirrorRelated`'s comment just above.
  const at = bodyCloses[bodyCloses.length - 1].index;
  const withFoot = html.slice(0, at) + '<aside class="pf-chrome pf-chrome-foot"></aside>' + html.slice(at);
  return injectEmbedWidget(withFoot, {
    slug,
    // Absolute, not `./`: the runtime and its stylesheet are one copy at the
    // apex document root, and a mirrored page can be served from either
    // `/tools/<slug>/` or `/tools/<slug>/<dir>/`, so a relative path would
    // resolve to a different (missing) file depending on the page's depth.
    toRoot: '/',
    canonical: mirrorCanonicalUrl(slug, file),
    title,
    isEntry: true,
  });
}

/**
 * Every relative link in the mirror has to resolve inside the mirror.
 *
 * This is the check that makes "complete venture" mean something. A venture
 * that grows a link to a sibling venture, or to a file this module does not
 * consider servable, fails here at build time rather than becoming a 404 on the
 * one page the portfolio can actually show a stranger.
 *
 * Absolute URLs, fragments, `mailto:` and `data:` are external by definition and
 * are not this function's business. A bare `.` or `./` is the venture's own
 * entry page, which is `index.html` by nginx's `try_files`.
 *
 * ## Script bodies are scanned, but as JavaScript rather than as markup
 *
 * This function used to run one regex over the whole document, `<script>`
 * included. That is not what a browser does — text inside a script element is
 * program source, not markup — and it cost the mirror a finished tool:
 * `marketplace-fee-compare` builds its channel list from template strings, so
 * the scan read the literal source text `href="../${escapeHtml(channel.deepTool)}/"`
 * and reported a missing directory named `${escapeHtml(channel.deepTool)}`.
 * The page is fine; the checker was reading the wrong language.
 *
 * The previous revision knew this and left it, on the argument that narrowing
 * the scan "would trade one missing tool for a class of genuinely dead link it
 * currently catches". That trade is not the one on offer, because the scan
 * never detected anything in the interpolated case: it compared unexpanded
 * template source against the mirror, which cannot match whatever the
 * expression evaluates to. It failed every such link unconditionally, which is
 * not detection.
 *
 * So the markup scan now runs over the document with script and style bodies
 * blanked, and script bodies are scanned separately under the rule that
 * actually applies to them:
 *
 * - a **fully literal** href/src in a script (no `${`) is a real path the page
 *   will hand the browser, and is resolved exactly as a markup one is — this
 *   is the genuine detection the old comment was protecting, and it is kept;
 * - an **interpolated** one cannot be resolved statically, so it is not judged
 *   here at all. `dynamicLinks` reports those separately: advisory, never a
 *   reason to drop a venture, but surfaced so a page whose runtime links go
 *   somewhere the mirror lacks is a thing a human can see rather than a thing
 *   that vanished. It is a separate function rather than a property on the
 *   returned array because `validateLinks` is compared with `deepStrictEqual`
 *   in several tests, and an array carrying an extra own property is not
 *   deep-equal to the plain `[]` those assertions expect.
 *
 * `marketplace-fee-compare`'s seven `deepTool` targets are all mirrored, which
 * is what makes admitting it correct and not merely quieter.
 *
 * Blanking preserves byte offsets so nothing downstream that indexes into the
 * document shifts; only the characters inside the element change.
 */
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;

/**
 * Blank out the `<link>` elements `injectMirrorTags` will delete, so their
 * hrefs are not held against a venture that is otherwise perfectly mirrorable.
 *
 * Blanked to spaces rather than removed, matching `blankScriptBodies`: byte
 * offsets stay put, so a problem string this function's caller builds still
 * points where a human reading the source would look.
 */
export function blankStrippedLinks(html) {
  return html.replace(STRIPPED_LINK, (match) => ' '.repeat(match.length));
}

export function blankScriptBodies(html) {
  return html.replace(SCRIPT_OR_STYLE, (match, tag, body) => {
    const open = match.length - body.length - `</${tag}>`.length;
    return match.slice(0, open) + ' '.repeat(body.length) + match.slice(open + body.length);
  });
}

export function scriptBodies(html) {
  return [...html.matchAll(SCRIPT_OR_STYLE)]
    .filter(([, tag]) => tag.toLowerCase() === 'script')
    .map(([, , body]) => body);
}

/**
 * Relative href/src literals a page builds at runtime inside a `<script>`.
 *
 * Advisory only — these cannot be resolved without evaluating the page, so
 * nothing is dropped for appearing here. Reported so the interpolated case is
 * visible rather than merely un-judged.
 */
export function dynamicLinks(files) {
  const found = [];
  for (const { slug, file, contents } of files) {
    if (!file.endsWith('.html')) continue;
    for (const body of scriptBodies(contents)) {
      for (const [, href] of body.matchAll(/(?:href|src)="([^"]*)"/g)) {
        // `${` is the only interpolation form that reaches here: these are
        // HTML fragments inside JS template literals, and a fragment built by
        // concatenation would not carry a quoted attribute this regex matches.
        if (href.includes('${')) found.push(`${slug}/${file} → "${href}"`);
      }
    }
  }
  return found;
}

/**
 * Every hyperlink and asset reference the mirror's own files hold each other
 * to, checked against what the mirror actually serves.
 *
 * **Prose describing a tag, not a real link, reads as one anyway — measured
 * 2026-09-24, and it is worth knowing before writing a worked example on a
 * comparison page.** A `canonical-tag-check` comparison page once wrote its
 * worked example as `&lt;link rel="canonical" href="/products/old-page"&gt;`
 * inside a `<code>` block — HTML-escaped for display, and never a real
 * `<link>` element. This regex scan does not decode entities or parse the
 * DOM; it matches `href="..."` and `rel="..."` as raw text, so the escaped
 * `&lt;`/`&gt;` around the tag made no difference and the literal
 * `href="/products/old-page"` inside the prose was read as a genuine
 * root-relative link the mirror does not serve. That single false positive
 * dropped the venture from `discoverEligible`'s fixpoint on pass 1, which
 * then cascaded through the security/compliance "-check" family's own
 * cross-links and collaterally dropped 66 ventures from the mirror — caught
 * before merging only because the generator's own ineligibility report was
 * read, not because `regen --verify` (which only checks self-consistency
 * against whatever the generator currently produces) could show it.
 * `build.test.mjs`'s "every published page declares exactly one canonical
 * URL" test caught the same escaped snippet a second way, for the same
 * reason: it counts `rel="canonical"` occurrences in raw text too. Describe
 * an example tag in prose without embedding literal `href="..."` or
 * `rel="..."` attribute syntax — name the value instead ("a relative href
 * that reads /products/old-page") — and both checks stay silent about text
 * that was never a link.
 */
export function validateLinks(files) {
  const present = new Set(files.map((f) => `${f.slug}/${f.file}`));
  const problems = [];
  for (const { slug, file, contents } of files) {
    if (!file.endsWith('.html')) continue;
    const markup = blankStrippedLinks(blankScriptBodies(contents));
    const hrefs = [...markup.matchAll(/(?:href|src)="([^"]*)"/g)].map(([, href]) => href);
    for (const body of scriptBodies(contents)) {
      for (const [, href] of body.matchAll(/(?:href|src)="([^"]*)"/g)) {
        // A fully literal href in a script is a real path the page will hand
        // the browser, so it is checked exactly as a markup one is. The
        // interpolated ones are `dynamicLinks`' business.
        if (!href.includes('${')) hrefs.push(href);
      }
    }
    for (const href of hrefs) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href) || href === '') continue;
      const target = href.split(/[?#]/)[0];
      if (target === '' || target === '.' || target === './') continue;
      // A root-absolute href is answered by the front door's own document
      // root, not by this mirror, so it is checked against what that root
      // actually holds rather than resolved against the venture directory.
      if (target.startsWith('/')) {
        // `/tools/<slug>/` is this mirror's own address space, not the front
        // door's document root, so it is checked against the file list rather
        // than the root allowlist. `injectMirrorRelated` is the only injector
        // that writes one, and this is what stops it offering a tool the
        // mirror does not serve — the same guarantee a venture's own relative
        // links get below.
        if (target.startsWith(`/${MIRROR_PREFIX}`)) {
          const within = target.slice(`/${MIRROR_PREFIX}`.length);
          const candidate = within.endsWith('/') ? `${within}index.html` : within;
          if (!present.has(candidate)) {
            problems.push(`${slug}/${file} → "${href}" (no ${candidate} in the mirror)`);
          }
          continue;
        }
        if (!APEX_ROOT_PATHS.has(target)) {
          problems.push(
            `${slug}/${file} → "${href}" (the apex document root serves only ` +
              `${[...APEX_ROOT_PATHS].join(', ')})`,
          );
        }
        continue;
      }
      // Resolved against the linking file's own directory, not the venture
      // root. The two are the same thing for every flat page — which is why
      // this read `join(slug, target)` until page subdirectories existed — but
      // for `tool/index.html` they differ, and getting it wrong is silent in
      // both directions: `../LICENSE` would resolve to a path outside the
      // venture and be reported as dead, while a sibling `har-diff.mjs` would
      // resolve to the venture root and be judged present when the file the
      // browser actually asks for is one level down.
      const base = path.posix.dirname(path.posix.join(slug, file));
      const resolved = path.posix.normalize(path.posix.join(base, target));
      const candidate = resolved.endsWith('/') ? `${resolved}index.html` : resolved;
      if (!present.has(candidate)) {
        problems.push(`${slug}/${file} → "${href}" (no ${candidate} in the mirror)`);
      }
    }
  }
  return problems;
}

/**
 * Build the whole mirror in memory.
 *
 * Returns one entry per file with its ConfigMap key and final contents, plus
 * the per-venture titles the front door needs to name its cards.
 */
export async function buildMirror({ set, venturesDir = VENTURES_DIR } = {}) {
  // Pages a venture builds rather than commits must be on disk before packing,
  // or the mirror packs a different set than the site serves.
  generateVenturePages(venturesDir);
  // Resolved here rather than in the parameter list because it reads the
  // filesystem; a caller passing an explicit `set` (every test that exercises
  // packing or a deliberate failure) must not pay for a scan of `ventures/`.
  set ??= await mirrorSet(venturesDir);

  // Read every venture first, inject afterwards.
  //
  // The passes used to be one loop, and could be until `injectMirrorRelated`
  // arrived: what a page needs to name its siblings is *their* titles, and a
  // single pass has only read the ventures before it. Reading first is the
  // cheap fix — the raw contents were already all held in `files` by the end
  // of the old loop, so this costs no memory the function did not spend
  // anyway, and the filesystem reads are unchanged in number and order.
  const sources = [];
  for (const { slug, why } of set) {
    // Before the filesystem read, so an unroutable slug reports why it is
    // unroutable rather than an ENOENT from a directory nobody should add.
    if (!ROUTABLE_SLUG.test(slug)) {
      throw new Error(
        `${slug} does not match the slug pattern in front-door/default.conf, so nginx ` +
          `could never route it — every page would 404 with nothing else failing`,
      );
    }
    const names = await ventureFiles(slug, venturesDir);
    if (!names.includes('index.html')) {
      throw new Error(`${slug} has no index.html — it cannot be an entry in STARTER_SET`);
    }
    const raws = new Map();
    for (const file of names) {
      if (!ROUTABLE_SUBPATH.test(file)) {
        throw new Error(
          `${slug}/${file} does not match the filename pattern in front-door/default.conf`,
        );
      }
      raws.set(file, await fs.readFile(await ventureFilePath(slug, file, venturesDir), 'utf8'));
    }
    sources.push({ slug, why, names, raws });
  }

  // What `relatedTools` ranks over, and the titles the block displays. The
  // title is the venture's own `<title>` taken from `raw`, which is what a
  // link to that page should say — the same source `tools` below uses.
  const surfaces = sources.map(({ slug, raws }) => ({
    slug,
    title: pageTitle(raws.get('index.html')),
  }));
  const bySlug = new Map(surfaces.map((surface) => [surface.slug, surface]));

  const files = [];
  const tools = [];
  for (const { slug, why, names, raws } of sources) {
    // Resolved once per venture rather than per file: only `index.html`
    // carries the block, and `relatedTools` is a ranking over all 169.
    const related = relatedTools(surfaces, slug, RELATED_LIMIT).map(({ slug: id }) => bySlug.get(id));
    for (const file of names) {
      const raw = raws.get(file);
      // The title is read from the venture's own markup before any pass runs.
      // `pageTitle` is applied to the *injected* contents further down for the
      // feed, and either would do here — but taking it from `raw` keeps the
      // snippet's title independent of what the mirror's own passes add, which
      // is what a stranger's page ends up displaying.
      const contents = file.endsWith('.html')
        ? injectMirrorEmbed(
            injectMirrorRelated(
              injectMirrorNav(injectMirrorTags(raw, { slug, file }), { toolCount: set.length }),
              { file, related },
            ),
            { slug, file, title: file === 'index.html' ? pageTitle(raw) : undefined },
          )
        : raw;
      files.push({
        slug,
        file,
        key: mirrorKey(slug, file),
        stored: storedKey(slug, file),
        contents,
        // The bytes that reach git, the ConfigMap and the pod. Computed once
        // here because every ceiling below measures it and gzip -9 over a
        // 5 MB mirror is the most expensive thing this module does.
        bytes: compress(contents),
      });
    }
    const entry = files.find((f) => f.slug === slug && f.file === 'index.html');
    tools.push({
      slug,
      why,
      title: pageTitle(entry.contents),
      // The venture's own meta description, carried so `renderFrontDoorFeed`
      // can summarise the entry without a second read of the same file.
      description: pageDescription(entry.contents),
      url: mirrorUrl(slug, 'index.html'),
    });
  }

  const problems = validateLinks(files);
  if (problems.length) {
    throw new Error(`the mirror would serve dead links:\n  ${problems.join('\n  ')}`);
  }

  // Before the size and packing checks: a page with a conflict marker in it is
  // not a page worth measuring, and this is the last point where it is still a
  // candidate rather than something the apex serves.
  assertNoConflictMarkers(files);

  // Deduplication happens before every measurement below, because after it the
  // aliased copies are not written anywhere: not to `gitops/prod/front-door-tools/`,
  // not into a shard, and not into either replica's tmpfs. `bytes` is therefore
  // what the mirror actually costs, which is what `MIRROR_BYTE_CEILING` bounds.
  const { stored, aliases } = dedupeMirror(files);
  const bytes = stored.reduce((sum, f) => sum + f.bytes.length, 0);
  // What the same catalogue would have cost stored one-copy-per-name. Reported
  // rather than checked: it is the number that says whether the alias map is
  // still earning its place, and nothing stores it.
  const undedupedBytes = files.reduce((sum, f) => sum + f.bytes.length, 0);
  if (bytes > MIRROR_BYTE_CEILING) {
    // Name the measured remedy, not a guess. This message used to say "drop a
    // venture from STARTER_SET", which stopped being the answer when the
    // mirror grew to cover the whole catalogue: dropping a tool to publish a
    // tool is a wash, and the bulk is no longer in `STARTER_SET`. It then named
    // byte-identical duplication, which `dedupeMirror` above now recovers
    // automatically — so by the time this throws, that remedy is already spent
    // and quoting it again would send a session after bytes that are gone.
    const dup = duplicateBytes(stored);
    throw new Error(
      `the mirror is ${bytes} stored bytes, over the ${MIRROR_BYTE_CEILING}-byte ceiling.\n` +
        `Aliasing has already recovered ${undedupedBytes - bytes} bytes across ${aliases.length} ` +
        `duplicate name(s); ${dup.redundant} bytes in ${dup.groups} group(s) remain duplicated and ` +
        `are content the alias map deliberately does not touch (see dedupeMirror).\n` +
        `Do not raise MIRROR_BYTE_CEILING without reading its comment: both costs it names are real.`,
    );
  }
  // What the mirror would have cost uncompressed, reported rather than
  // checked: it is the number that says whether gzip is still earning its
  // place, and it has no ceiling of its own because nothing stores it.
  const sourceBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.contents), 0);

  return {
    files,
    stored,
    aliases,
    tools,
    bytes,
    undedupedBytes,
    sourceBytes,
    shards: packShards(stored),
  };
}

/**
 * The mirror's byte-identical duplication, by content.
 *
 * Ventures here are self-contained on purpose — `platform/pages/build.mjs`
 * publishes each one as a standalone directory, so a venture that needs
 * `proposal.mjs` ships its own copy rather than importing a shared one. That
 * is the right call for the product and it is invisible on the canonical host,
 * where each venture is served from its own tree. The mirror is where it costs
 * something: it flattens every venture into one key space under a single
 * ceiling, so the 104th identical copy of `proposal.mjs` spends 7,384 bytes of
 * a budget the other 172 tools share.
 *
 * Grouped by the *stored* (compressed) bytes rather than the source, because
 * stored bytes are what every ceiling in this file measures. gzip is
 * deterministic at a fixed level, so identical source compresses to identical
 * output and the two groupings agree — hashing the stored form just means the
 * number reported is the number recoverable.
 *
 * `redundant` is what deduplication would return: every group's size times one
 * fewer than its member count, since one copy always has to stay.
 *
 * Reported, never enforced. There is no ceiling on duplication itself — it is
 * a property of how the ventures are built, not a defect in any one of them,
 * and the day a venture stops sharing a helper byte-for-byte is not a day
 * anything should fail.
 */
export function duplicateBytes(files) {
  const byHash = new Map();
  for (const file of files) {
    const digest = createHash('sha256').update(file.bytes).digest('hex');
    const group = byHash.get(digest) ?? { size: file.bytes.length, keys: [] };
    group.keys.push(file.key);
    byHash.set(digest, group);
  }
  const duplicated = [...byHash.values()]
    .filter((group) => group.keys.length > 1)
    .map((group) => ({
      size: group.size,
      copies: group.keys.length,
      redundant: group.size * (group.keys.length - 1),
      // The shared filename when every copy has one — `proposal.mjs` for the
      // 104-way group. Falls back to a key so a group of unrelated files that
      // happen to be identical still names something findable.
      file: sharedFileName(group.keys),
    }))
    .sort((a, b) => b.redundant - a.redundant);
  return {
    groups: duplicated.length,
    redundant: duplicated.reduce((sum, group) => sum + group.redundant, 0),
    largest: duplicated,
  };
}

/**
 * Split the mirror into the bytes actually stored and the aliases that point
 * at them.
 *
 * ## What this recovers, and why it is worth a mechanism
 *
 * `duplicateBytes` above measures the problem: ventures here are deliberately
 * self-contained, so `proposal.mjs` is stored 104 times identically, `LICENSE`
 * 161 times, `share.mjs` 37. On 2026-09-03 that was 1,186,041 stored bytes —
 * 18.5% of the whole mirror — spent on content the mirror already had.
 *
 * Every one of those files is genuinely referenced by the pages beside it, so
 * none can be dropped. What can change is how many times the *same* bytes are
 * stored: keep one copy, and have nginx resolve the other 103 names to it.
 * `renderMirrorAliases` writes that resolution as a `map`, and the six asset
 * `location` blocks in `front-door/default.conf` route through it.
 *
 * ## Why the alias goes in nginx rather than the projected volume
 *
 * A projected volume's `items: [{key, path}]` can also present one key under
 * many paths, and `MIRROR_HEADROOM_WARN_RATIO` named it first. It recovers the
 * repository and ConfigMap bytes and *not* the pod's memory, because the
 * kubelet still materialises every path into the tmpfs the mirror is charged
 * against — so the two costs would have to be split and separately bounded
 * before it helped. It also spends ~670 lines of generated YAML inside the
 * Deployment spec.
 *
 * The `map` recovers both costs at once: an aliased file is not written to the
 * volume at all, so it is absent from git, from etcd and from both replicas'
 * tmpfs. That is why this is the mechanism chosen.
 *
 * `MIRROR_HEADROOM_WARN_RATIO` recorded that the `map` "wants an environment
 * that can actually run nginx against the built mirror. This one cannot: no
 * nginx binary and no Docker daemon, verified 2026-09-03." That was true of the
 * session that wrote it and is not a property of the repository:
 * `apt-get install nginx-light` supplies nginx 1.24 with both
 * `--with-http_gzip_static_module` and `--with-http_gunzip_module`, which is
 * everything the front door's config uses. `mirror-nginx.test.mjs` now serves
 * the real `default.conf` over the real generated mirror and asserts every
 * mirrored URL byte-for-byte, which is a stronger check than either mechanism
 * had before.
 *
 * ## Why `index.html` is never aliased
 *
 * Entry and subpage documents carry slug-specific injected content — the
 * canonical link, `og:url`, the return nav — so two of them cannot be
 * byte-identical, and today none are. The guard below makes that structural
 * rather than incidental: the two `index.html` `location` blocks in
 * `default.conf` are deliberately left routing straight to their stored key,
 * so a future injection change that somehow made two entry pages identical
 * would cost duplicate bytes rather than 404 a tool's front page.
 *
 * The canonical copy is the member whose key sorts first, so the choice is
 * stable across runs and independent of venture discovery order — a mirror
 * regenerated on an unchanged tree produces an identical alias file.
 */
export function dedupeMirror(files) {
  const hashes = new Map();
  const byHash = new Map();
  for (const file of files) {
    if (file.file === 'index.html' || file.file.endsWith('/index.html')) continue;
    const hash = createHash('sha256').update(file.bytes).digest('hex');
    hashes.set(file, hash);
    const group = byHash.get(hash);
    if (group) group.push(file);
    else byHash.set(hash, [file]);
  }

  const canonical = new Map();
  for (const [hash, group] of byHash) {
    canonical.set(
      hash,
      group.reduce((best, file) => (file.key < best.key ? file : best)),
    );
  }

  const stored = [];
  const aliases = [];
  for (const file of files) {
    const head = hashes.has(file) ? canonical.get(hashes.get(file)) : null;
    if (!head || head === file) {
      stored.push(file);
    } else {
      aliases.push({ key: file.key, canonical: head.key, bytes: file.bytes.length });
    }
  }
  return { stored, aliases };
}

/**
 * The generated nginx `map` that resolves an aliased mirror key to its stored one.
 *
 * ## Why the name starts with `00-`
 *
 * This file sets `map_hash_bucket_size`, and nginx accepts that directive only
 * *before* the first `map` block it parses — afterwards the value is already
 * fixed and setting it again is rejected as `"map_hash_bucket_size" directive
 * is duplicate`, which is a refusal to start, not a warning. `default.conf`
 * opens with three `map` blocks of its own (`$portfolio_embed_view` and the two
 * framing maps), and nginx's `include /etc/nginx/conf.d/*.conf` expands the
 * glob in sorted order — so a file named `mirror-alias.conf` is parsed after
 * `default.conf` and the front door does not boot.
 *
 * The `00-` prefix is what orders this ahead of it. It is load-bearing, not
 * decoration: `front-door-tools.test.mjs` asserts the name still sorts before
 * `default.conf`, because renaming it to something tidier is a change that
 * looks cosmetic and takes the apex down.
 */
export const MIRROR_ALIAS_FILE = '00-mirror-alias.conf';

/**
 * The nginx variable the asset `location` blocks set, and the one they rewrite
 * to. Named here so `default.conf`, the generated map and the tests cannot
 * drift apart.
 */
export const ALIAS_SOURCE_VAR = 'fd_flat';
export const ALIAS_TARGET_VAR = 'fd_stored';

/**
 * Render the alias map.
 *
 * Always emitted, even with no aliases at all: `default.conf` references
 * `$fd_stored` unconditionally, and nginx refuses to start on an unknown
 * variable. A map carrying only its `default` is the correct empty state, not
 * a missing file.
 *
 * `default $fd_flat` is what makes this safe to route *every* asset request
 * through: a key with no alias resolves to itself, so the map can only ever
 * redirect the names it explicitly lists.
 */
export function renderMirrorAliases(aliases) {
  const entries = [...aliases]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((a) => `  "${a.key}"  "${a.canonical}";`)
    .join('\n');
  const recovered = aliases.reduce((sum, a) => sum + a.bytes, 0);
  // nginx sizes a map's hash buckets at startup and *refuses to start* if a key
  // does not fit — `could not build map_hash, you should increase
  // map_hash_bucket_size`. The default is one cache line (64 bytes on x86-64)
  // and these keys are `<slug>__<file>`, already 59 bytes at their longest, so
  // the default is not enough and the failure mode is the front door not
  // booting at all. Computed from the longest key actually emitted, rounded up
  // to the next power of two and floored at the default, so it tracks the
  // catalogue instead of being a constant someone has to remember to raise.
  // The headroom is not slack: nginx stores each key in an `ngx_hash_elt_t`
  // alongside its length and a value pointer, and pads the entry, so a bucket
  // has to hold rather more than the key's own bytes. 16 is comfortably past
  // that overhead on 64-bit, and rounding to a power of two keeps the value one
  // of the sizes nginx's own documentation uses. Measured: 59-byte keys need
  // 128; 64 is what nginx refuses.
  const longest = aliases.reduce((max, a) => Math.max(max, a.key.length), 0);
  const bucket = Math.max(64, 2 ** Math.ceil(Math.log2(longest + 16)));
  return `# Generated by \`node platform/marketing/front-door-tools.mjs --write\`.
# Do not hand-edit: \`platform/marketing/front-door-tools.test.mjs\` regenerates
# this file beside the mirror and fails if the commit is stale.
#
# Ventures in this repository are self-contained by design — each ships its own
# copy of the shared helpers — which is right for the product and free on the
# canonical host, where every venture is served from its own tree. The mirror
# flattens them all into one key space under one ceiling, so the 104th
# identical copy of \`proposal.mjs\` spends bytes the other tools share.
#
# This map is how the mirror stores one copy and serves it under every name.
# The six asset \`location\` blocks in \`default.conf\` set \`$${ALIAS_SOURCE_VAR}\`
# to the \`<slug>__<file>\` key the request resolves to, then rewrite to
# \`$${ALIAS_TARGET_VAR}\` — this map — instead of to the key directly. The
# \`default\` below is the identity, so a key that is not listed here resolves to
# itself and routing is unchanged for it.
#
# \`index.html\` keys never appear here. Entry pages carry slug-specific injected
# content and cannot be byte-identical; \`dedupeMirror\` refuses to alias them so
# that a tool's front page can never depend on this file being right.
#
# ${aliases.length} alias(es), ${recovered} stored bytes recovered.
#
# Sized for the longest key above (${longest} bytes). nginx refuses to start if a
# map key does not fit its bucket, so this tracks the catalogue rather than
# being a constant to remember.
map_hash_bucket_size ${bucket};
map $${ALIAS_SOURCE_VAR} $${ALIAS_TARGET_VAR} {
  default $${ALIAS_SOURCE_VAR};
${entries}
}
`;
}

/** The file name every one of these `<slug>__<file>` keys shares, or the first key. */
function sharedFileName(keys) {
  const names = new Set(keys.map((key) => key.slice(key.lastIndexOf('__') + 2)));
  return names.size === 1 ? [...names][0] : keys[0];
}

/**
 * How much room the mirror has left, and what it would cost to make more.
 *
 * Exists because `MIRROR_BYTE_CEILING` is a wall with no approach lights: it
 * throws inside `buildMirror`, which `portfolio-validate` runs on every PR
 * touching a venture page, so crossing it stops the whole catalogue from
 * publishing with no warning to the session that happens to be holding the
 * pen. See `MIRROR_HEADROOM_WARN_RATIO` for why 85% and what to do when it
 * trips.
 *
 * `toolsRemaining` divides by the *mean* tool, which is the honest estimate
 * available here and not a promise — tools range from a single page to
 * `ebay-fee-calculator`'s 818,849 bytes, so the next one could spend a
 * twentieth of the remaining room or half of it. It answers "roughly how many
 * more" well enough to tell a comfortable margin from a tight one, which is
 * the decision it exists to inform.
 */
export function mirrorHeadroom({ files, stored, aliases, tools, bytes, undedupedBytes }) {
  const remaining = MIRROR_BYTE_CEILING - bytes;
  const perTool = tools.length ? bytes / tools.length : 0;
  // `stored`/`aliases` are what `buildMirror` returns today. The fallbacks keep
  // this callable with a bare `{ files, tools, bytes }` — which several tests
  // and `--headroom`'s own error paths still build by hand — rather than making
  // every caller construct a deduped mirror to ask a question about size.
  const kept = stored ?? files;
  const aliased = aliases ?? [];
  return {
    bytes,
    ceiling: MIRROR_BYTE_CEILING,
    ratio: bytes / MIRROR_BYTE_CEILING,
    remaining,
    perTool: Math.round(perTool),
    toolsRemaining: perTool > 0 ? Math.floor(remaining / perTool) : Infinity,
    // Below the warn ratio the mirror is merely large; at or above it, the
    // runway is short enough that the remedy has to start now to land before
    // the wall.
    tight: bytes / MIRROR_BYTE_CEILING >= MIRROR_HEADROOM_WARN_RATIO,
    // Residual duplication only — what aliasing has *not* recovered. Measured
    // over `stored` rather than `files` on purpose: reporting the raw catalogue
    // duplication here would keep advertising 18.5% of recoverable bytes that
    // `dedupeMirror` has already recovered, and send a session after them.
    duplicates: duplicateBytes(kept),
    aliases: aliased.length,
    recovered: (undedupedBytes ?? bytes) - bytes,
  };
}

/**
 * Split the mirror into ConfigMap-sized shards.
 *
 * First-fit-decreasing would pack tighter; declaration order packs
 * *predictably*, which matters more. Every shard carries a content hash that
 * reaches the Deployment, so a packer that reshuffles on a size change would
 * roll pods for shards whose files did not change. In declaration order,
 * adding a venture at the end of `STARTER_SET` disturbs at most the last
 * shard.
 *
 * Packing is per file, not per venture. Keeping a venture's files together
 * would be tidier to read and would cap the mirror at whatever the largest
 * single venture is (`ebay-fee-calculator`, 818,849 bytes — already over
 * `SHARD_BYTE_CEILING`, so that rule would exclude the highest-search-intent
 * tool in the portfolio). It buys nothing in exchange: the projected volume
 * merges every shard into one directory, so which shard a file arrives in is
 * invisible to nginx and to the browser.
 *
 * The one thing that must hold across shards is key uniqueness — a projected
 * volume with the same key in two sources fails to mount, and
 * `maxUnavailable: 0` would leave the previous front door serving while the
 * new pods sat in `ContainerCreating`. `mirrorKey` makes collisions impossible
 * within a set (one `slug__file` per file on disk); `assertUniqueKeys` proves
 * it rather than assuming it, because the cost of being wrong is the apex
 * freezing on a stale mirror with nothing failing loudly.
 */
export function packShards(files, ceiling = SHARD_BYTE_CEILING, runtThreshold = CLIENT_SIDE_APPLY_CEILING) {
  assertUniqueKeys(files);
  const shards = [];
  let current = null;
  for (const file of files) {
    const size = file.bytes.length;
    if (size > ceiling) {
      throw new Error(
        `${file.key} is ${size} bytes, larger than the ${ceiling}-byte shard ceiling, ` +
          `so no shard can hold it — raise SHARD_BYTE_CEILING (it has ~300 KB of ` +
          `headroom under etcd's 1 MiB object cap) or drop the venture`,
      );
    }
    if (!current || current.bytes + size > ceiling) {
      current = { name: shardName(shards.length), files: [], bytes: 0 };
      shards.push(current);
    }
    current.files.push(file);
    current.bytes += size;
  }
  // Declaration order packs a trailing shard however small the last venture's
  // remainder happens to be — one file over, and the whole mirror grows a
  // shard that does not need `ServerSideApply` but carries it anyway (see the
  // "the mirror asks for the apply mode its size actually requires" test).
  // Rather than asking a future session to hunt for a `STARTER_SET` position
  // that happens not to fragment (fragile: it changes on every unrelated size
  // edit to any venture ahead of it), or to spend another few KiB of
  // `SHARD_BYTE_CEILING`'s headroom on every growth — both of which were
  // tried, and both of which come back the next time any mirrored venture
  // gains a page — grow the runt by pulling files back from the shard before
  // it until it is big enough to deserve the annotation it carries.
  //
  // Two guards keep the transfer sound, and both are load-bearing rather than
  // defensive: the donor must keep at least one file, so draining it can never
  // leave an empty ConfigMap in the middle of the projected volume; and the
  // recipient must stay under `ceiling`, because it *grows* here. Only the
  // donor shrinks monotonically. Today the recipient could not realistically
  // breach `ceiling` (it stops at `CLIENT_SIDE_APPLY_CEILING` plus one file,
  // and the largest file in the mirror is 208 KB against a 706 KiB ceiling),
  // but that is a fact about today's file sizes, not an invariant: the loop
  // above already admits any file up to `ceiling` itself, and one of those
  // would push the recipient past the etcd object cap this whole sharding
  // design exists to stay under. The guard makes it true by construction.
  // `runtThreshold` is a parameter rather than a direct read of
  // `CLIENT_SIDE_APPLY_CEILING` so that the behaviour can be exercised at a
  // test-sized ceiling. Reading the constant directly made every shard in a
  // small-ceiling test a "runt" by definition, which quietly turned the first
  // draft of these tests into assertions that passed with or without the fix.
  while (shards.length > 1 && shards[shards.length - 1].bytes <= runtThreshold) {
    const last = shards[shards.length - 1];
    const prev = shards[shards.length - 2];
    if (prev.files.length < 2) break;
    const movedSize = prev.files[prev.files.length - 1].bytes.length;
    if (last.bytes + movedSize > ceiling) break;
    const moved = prev.files.pop();
    prev.bytes -= movedSize;
    last.files.unshift(moved);
    last.bytes += movedSize;
  }
  return shards;
}

/** Every ConfigMap key in the mirror is distinct, so the projected volume can mount. */
export function assertUniqueKeys(files) {
  const seen = new Set();
  for (const { key } of files) {
    if (seen.has(key)) {
      throw new Error(
        `${key} appears twice in the mirror — a projected volume rejects a duplicate key ` +
          `and the pods would never leave ContainerCreating`,
      );
    }
    seen.add(key);
  }
}

/**
 * Refuse to mirror a page carrying an unresolved merge-conflict marker.
 *
 * WHY THIS IS HERE AND NOT ONLY IN CI
 *
 * On 2026-09-02 the boiler calculator's `index.html` was committed to `main`
 * with a conflict hunk still in its footer, and the next regeneration packed
 * it into `boiler-replacement-bid-calculator__index.html.gz` — so the apex
 * served `<<<<<<< HEAD`, the paragraph twice, and `>>>>>>> origin/main` to
 * every visitor of that tool.
 *
 * Nothing caught it before the bytes shipped. The venture's own suite passed,
 * because its assertions were `assert.match` against links that were present
 * on both sides of the hunk. The repo-wide `Conflict markers` workflow does
 * catch it, but it runs on a pull request, and the mirror is generated and
 * committed by hand before one exists.
 *
 * So the check belongs in the generator too: this is the last point at which
 * a page is still a candidate rather than a deployed artifact, and `--write`
 * is the step that turns one into the other. A marker here is never
 * legitimate content — these are static tool pages, not documentation about
 * merge conflicts.
 */
export function assertNoConflictMarkers(files) {
  // Anchored to the line start, which is where git writes them; a `>>>>>>>`
  // mid-sentence in prose is not a conflict and must not fail the build.
  const marker = /^(<{7}|={7}|>{7})(\s|$)/m;
  for (const { key, contents } of files) {
    if (typeof contents === 'string' && marker.test(contents)) {
      const line = contents.split('\n').find((l) => marker.test(l));
      throw new Error(
        `${key} carries an unresolved merge-conflict marker (${line.trim()}) — ` +
          `resolve it before regenerating, or the apex will serve it to visitors`,
      );
    }
  }
}

/**
 * The character references that can appear in a `<title>`, decoded.
 *
 * `pageTitle` returns *text*, and `front-door.mjs` escapes it again on the way
 * into the card (`escapeHtml(tool.title)`). So a title that arrives already
 * encoded is encoded twice and the card shows the markup: the first venture
 * mirrored with an ampersand in its title, `notary-trip-quote`
 * ("Mobile Notary &amp;amp; Loan Signing Fee Calculator"), would have rendered
 * as `Mobile Notary &amp;amp; Loan Signing Fee Calculator` on the portfolio's
 * one public page.
 *
 * Decoding here rather than teaching the renderer to skip escaping: the
 * renderer is right, and every other string it is handed is plain text. A
 * `<title>`'s content is parsed HTML text, so the encoded form is the odd one
 * out and this is where it stops.
 *
 * The five named references below are the complete set HTML defines for text
 * content, plus `&apos;`; numeric references are handled generically.
 */
const CHARACTER_REFERENCES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeCharacterReferences(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return CHARACTER_REFERENCES[body.toLowerCase()] ?? whole;
  });
}

/**
 * The tool's own name, for a card on the front door.
 *
 * Taken from `<title>` and cut at the first `|`, which is where every venture
 * here puts the SEO tail ("Job Cost Variance Calculator | Estimated vs Actual").
 * Reading the venture's own copy rather than a name typed into `STARTER_SET`
 * keeps the card and the page it opens from ever disagreeing.
 */
export function pageTitle(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  if (!match) throw new Error('a mirrored entry page has no <title>');
  return decodeCharacterReferences(match[1].split('|')[0]).trim();
}

/**
 * The tool's own one-line summary, for the `<summary>` of its Atom entry.
 *
 * Taken from the venture's `<meta name="description">` — the same string
 * `build.mjs` derives from the page's visible copy and stamps into the tools
 * host's own feed — so a reader who subscribes here and a reader who subscribes
 * after the seal are told the same thing about the same tool.
 *
 * Decoded for the reason `pageTitle` is: `renderFrontDoorFeed` escapes it again
 * on the way into XML, and a description that arrives already encoded would
 * reach a feed reader as visible `&amp;amp;`.
 *
 * Returns `''` rather than throwing when a page has no description. Unlike a
 * missing `<title>`, which leaves a card with no name and is worth failing the
 * build over, a missing description costs an entry its summary and nothing
 * else — `check.mjs` is what refuses to publish an undescribed page, and
 * failing here would take the whole front door down over a defect that surface
 * already owns.
 */
export function pageDescription(html) {
  const match = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  return match ? decodeCharacterReferences(match[1]).replace(/\s+/g, ' ').trim() : '';
}

/**
 * The kustomization that reads the mirror into the ConfigMaps the pod mounts.
 *
 * One `configMapGenerator` per shard. `gitops/prod/portfolio-front.yaml` names
 * the same shards, in the same order, as the sources of its projected `tools`
 * volume; `test_portfolio_front_mounts_every_generated_mirror_shard` fails if
 * the two ever disagree, which is the failure mode that matters — a shard this
 * file generates and that file does not mount is a set of tools silently
 * missing from the apex, and a shard mounted but not generated leaves the pods
 * in `ContainerCreating` behind `maxUnavailable: 0`.
 */
export function renderKustomization(shards) {
  const generators = shards
    .map(
      (shard) =>
        `  - name: ${shard.name}\n` +
        `    options:\n` +
        `      annotations:\n` +
        `        ${SYNC_OPTIONS_ANNOTATION}: ${SYNC_OPTIONS}\n` +
        `    files:\n` +
        shard.files.map((f) => `      - ${f.stored}=${f.stored}`).join('\n'),
    )
    .join('\n');
  const sizes = shards.map((s) => `#   ${s.name}: ${s.files.length} files, ${s.bytes} bytes`).join('\n');
  return `# Generated by \`node platform/marketing/front-door-tools.mjs --write\`.
# Do not hand-edit: \`platform/marketing/front-door-tools.test.mjs\` regenerates
# this file and the mirrored pages beside it, and fails if the commit is stale.
#
# A nested kustomization rather than another generator in \`../kustomization.yaml\`
# only because this file list is machine-written, one line per mirrored file;
# there is no behavioural difference. In particular the content-hash suffix
# still reaches the Deployment: kustomize accumulates this generator's output
# before the parent runs its name-reference transformer, so the
# \`projected\` \`tools\` volume in \`portfolio-front.yaml\` resolves each shard to
# its hashed name. Verified against kustomize v5.6.0 — the version
# \`hetzner-gitops-ci.yml\` installs — by
# \`test_portfolio_front_mounts_every_generated_mirror_shard\`, which reads both
# kustomizations, and by the hash test beside it.
#
# WHY THERE IS MORE THAN ONE
#
# etcd caps a stored object at 1 MiB, so a mirror held in a single ConfigMap
# could never serve more than about twenty tools however many were worth
# serving. Several ConfigMaps merged into one \`mountPath\` by a projected volume
# have no such shared cap; nginx sees one flat directory of \`slug__file.gz\`
# keys. \`SHARD_BYTE_CEILING\` in \`front-door-tools.mjs\` carries the reasoning
# and the measurements.
#
# WHY EVERY KEY ENDS IN \`.gz\`
#
# The mirror stores only the compressed copy of each page, and nginx serves it
# with \`gzip_static always\` plus \`gunzip on\` — see the compression section at
# the top of \`front-door-tools.mjs\`. gzip output is not valid UTF-8, so
# kustomize puts these under \`binaryData\` as base64 rather than under \`data\`;
# that is a 4/3 expansion on the applied object and a 3.13x saving on
# everything else, which is what let the mirror grow from 53 tools to the whole
# eligible catalogue inside a comparable budget.
#
# Shards as generated:
${sizes}
#
# The hash is deliberately left ON, matching \`portfolio-front-html\` and
# \`portfolio-front-nginx\`: a Deployment mounts these, so a generated name has
# to change with the content or a regenerated tool never reaches a running pod.
#
# The \`${SYNC_OPTIONS_ANNOTATION}\` option below is not optional
# decoration. Argo CD applies client-side by default, which copies the whole
# object into the \`kubectl.kubernetes.io/last-applied-configuration\`
# annotation, and the API server caps an object's annotations at 262144 bytes.
# A shard is several times that, so a client-side apply of it fails with
# \`metadata.annotations: Too long\` and the mirror never reaches the cluster at
# all — see \`CLIENT_SIDE_APPLY_CEILING\` in \`front-door-tools.mjs\` for the whole
# failure mode. Server-side apply writes no such annotation and is bounded only
# by etcd's 1 MiB, which \`SHARD_BYTE_CEILING\` keeps each shard well inside.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
configMapGenerator:
${generators}
`;
}

/**
 * The Deployment that mounts the mirror, whose `projected` volume has to name
 * every shard this generator writes.
 */
export const FRONT_DOOR_DEPLOYMENT = path.join(REPO_ROOT, 'gitops', 'prod', 'portfolio-front.yaml');

/**
 * The `sources:` entries of the `tools` volume, at the indentation
 * `portfolio-front.yaml` uses. Kept in one place so the writer below and the
 * expectation in `front-door-tools.test.mjs` cannot drift apart.
 */
export const renderMountSources = (shards) =>
  shards.map((s) => `              - configMap:\n                  name: ${s.name}\n`).join('');

/**
 * Rewrite the mirror's mount list in `portfolio-front.yaml` to match `shards`.
 *
 * WHY THIS IS AUTOMATED
 *
 * The shard count is a function of the catalogue: adding one comparison page
 * to a mirrored venture can push the packer over `SHARD_BYTE_CEILING` and open
 * a new shard. Until this function existed, `--write` regenerated the shards
 * and left this file naming the old set, so the two disagreed in whichever
 * direction the mirror had moved — and both directions are silent in the
 * cluster:
 *
 *   generated but not mounted -> those tools are missing from the apex with
 *       every manifest valid and every pod Ready;
 *   mounted but not generated -> pods never leave ContainerCreating and
 *       `maxUnavailable: 0` keeps serving the previous, stale mirror.
 *
 * `test_portfolio_front_mounts_every_generated_mirror_shard` catches both, but
 * only in CI and only as a failure whose remedy was a hand-edit its own message
 * had to spell out. The generator already knows the answer, so it writes it.
 *
 * Deliberately surgical: it replaces only the `- configMap:` entries of the
 * `tools` volume's `projected.sources`, leaving the long comment above them —
 * which explains why the volume is projected at all — untouched. A structural
 * YAML round-trip would reflow that comment away.
 */
export async function writeMountList(shards, file = FRONT_DOOR_DEPLOYMENT) {
  const original = await fs.readFile(file, 'utf8');
  // Anchored on `projected:`/`sources:` so this can only ever match the tools
  // volume; the trailing group is the run of shard entries to replace.
  const block = /( {10}projected:\n {12}sources:\n)((?: {14}- configMap:\n {18}name: [^\n]*\n)+)/;
  const match = original.match(block);
  if (!match) {
    throw new Error(
      `could not find the tools volume's projected sources in ${path.relative(REPO_ROOT, file)} — ` +
        `if the volume was restructured, update writeMountList in front-door-tools.mjs to match`,
    );
  }
  const updated = original.replace(block, `$1${renderMountSources(shards)}`);
  if (updated === original) return { file, changed: false };
  await fs.writeFile(file, updated);
  return { file, changed: true };
}

export async function writeMirror(outputDir = OUTPUT_DIR) {
  const built = await buildMirror();
  // A scratch `--out` build (tests, P022) writes only the mirror itself: the
  // alias map and the Deployment's mount list are tracked files elsewhere in
  // the tree, and a throwaway build must not rewrite them.
  const tracked = path.resolve(outputDir) === path.resolve(OUTPUT_DIR);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  // `built.stored`, not `built.files`: an aliased copy is deliberately never
  // written, which is the whole saving. `renderMirrorAliases` below is what
  // keeps its URL working.
  for (const file of built.stored) {
    await fs.writeFile(path.join(outputDir, file.stored), file.bytes);
  }
  // The alias map rides in the nginx ConfigMap beside `default.conf`, not in
  // this directory: it is configuration for the server, not content for it to
  // serve, and `gitops/prod/kustomization.yaml` generates the two together.
  if (tracked) {
    await fs.writeFile(
      path.join(FRONT_DOOR_DIR, MIRROR_ALIAS_FILE),
      renderMirrorAliases(built.aliases),
    );
  }
  await fs.writeFile(path.join(outputDir, 'kustomization.yaml'), renderKustomization(built.shards));
  // Same call, same commit: the shards and the Deployment that mounts them are
  // one artifact, and a tree where only half of it was regenerated is exactly
  // the state the pinning test exists to reject.
  if (tracked) built.mountList = await writeMountList(built.shards);
  return built;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** One line per shard, so a `--write` says what the Deployment now has to mount. */
const shardSummary = (shards) =>
  shards
    .map(
      (s) =>
        `  ${s.name}: ${String(s.files.length).padStart(3)} files, ${String(s.bytes).padStart(7)} bytes ` +
        `(${Math.round((s.bytes / SHARD_BYTE_CEILING) * 100)}% of the shard ceiling)`,
    )
    .join('\n');

/**
 * The headroom report `--headroom` prints and every other mode appends.
 *
 * Always printed, not only when tight: the number nobody was looking at is how
 * the mirror reached three quarters of its ceiling unremarked, and a figure
 * that appears only once it is already a problem trains no one to watch it.
 */
const headroomSummary = (headroom) => {
  const { bytes, ceiling, ratio, remaining, perTool, toolsRemaining, tight, duplicates } = headroom;
  const lines = [
    `mirror headroom: ${bytes} of ${ceiling} stored bytes (${(100 * ratio).toFixed(1)}%), ` +
      `${remaining} left — roughly ${toolsRemaining} more tools at ${perTool} bytes each`,
  ];
  if (headroom.recovered) {
    lines.push(
      `  ${headroom.recovered} bytes already recovered by aliasing ${headroom.aliases} duplicate ` +
        `name(s) onto stored copies — see dedupeMirror and front-door/${MIRROR_ALIAS_FILE}`,
    );
  }
  if (duplicates.groups) {
    lines.push(
      `  ${duplicates.redundant} of those bytes (${(100 * (duplicates.redundant / bytes)).toFixed(1)}%) ` +
        `are byte-identical duplicates still stored in ${duplicates.groups} group(s):`,
    );
    for (const group of duplicates.largest.slice(0, 5)) {
      lines.push(
        `    ${String(group.copies).padStart(4)}x ${String(group.size).padStart(7)} bytes ` +
          `→ ${String(group.redundant).padStart(8)} recoverable  ${group.file}`,
      );
    }
  }
  if (tight) {
    lines.push(
      '',
      `  WARNING: at or above ${(100 * MIRROR_HEADROOM_WARN_RATIO).toFixed(0)}% of the ceiling.`,
      '  Crossing the ceiling itself throws inside buildMirror, which portfolio-validate runs on',
      '  every PR touching a venture page — so it stops the whole catalogue publishing, not just',
      '  the tool that crossed it. Start the remedy now: read MIRROR_HEADROOM_WARN_RATIO in',
      '  platform/marketing/front-door-tools.mjs for the two mechanisms that recover the',
      '  duplicate bytes above, and why raising MIRROR_BYTE_CEILING is not the first answer.',
    );
  }
  return lines.join('\n');
};

if (isMain) {
  const totals = ({ files, tools, bytes, sourceBytes, shards }) =>
    `${tools.length} tools, ${files.length} files, ${bytes} stored bytes ` +
    `(${Math.round((bytes / MIRROR_BYTE_CEILING) * 100)}% of the mirror ceiling; ` +
    `${sourceBytes} uncompressed, ${(sourceBytes / bytes).toFixed(2)}x) ` +
    `in ${shards.length} shards\n${shardSummary(shards)}`;
  if (process.argv.includes('--headroom')) {
    // The CI mode. Prints the same report the other modes append and exits
    // non-zero once the mirror is tight, so `portfolio-validate` fails while
    // there is still room to act rather than when the ceiling has already
    // stopped every venture PR in the repository. Deliberately skips the
    // per-tool listing and the ineligibility report: this answers one
    // question, and a check whose output has to be scrolled past is a check
    // people stop reading.
    const headroom = mirrorHeadroom(await buildMirror());
    console.log(headroomSummary(headroom));
    if (headroom.tight) process.exitCode = 1;
  } else if (process.argv.includes('--write')) {
    const outIndex = process.argv.indexOf('--out');
    const outDir = outIndex > 0 ? path.resolve(process.argv[outIndex + 1]) : OUTPUT_DIR;
    const built = await writeMirror(outDir);
    console.log(`wrote ${path.relative(REPO_ROOT, outDir)}: ${totals(built)}`);
    console.log(headroomSummary(mirrorHeadroom(built)));
    // Say so out loud: a changed mount list means the shard count moved, which
    // is the one outcome of a regeneration that alters a file outside the
    // mirror directory and so is easy to leave out of a commit.
    if (built.mountList) console.log(
      built.mountList.changed
        ? `updated ${path.relative(REPO_ROOT, built.mountList.file)}: the shard count moved, ` +
            `so its projected volume now mounts ${built.shards.length} shard(s) — commit it with the mirror`
        : `${path.relative(REPO_ROOT, built.mountList.file)} already mounts these ${built.shards.length} shard(s)`,
    );
  } else {
    const built = await buildMirror();
    for (const tool of built.tools) console.log(`${tool.url.padEnd(46)} ${tool.title}`);
    console.log(`\n${totals(built)}`);
    console.log(`\n${headroomSummary(mirrorHeadroom(built))}`);
    // The other half of the answer, and the half that used to need a
    // throwaway script: which ventures are *not* here, and why each one is
    // not. See `explainIneligible` for what the reasons mean and which of
    // them a future session should not try to close.
    const excluded = await explainIneligible();
    if (excluded.length) {
      // Grouped, and the bulk case summarised rather than listed line by line.
      // 21 of these are CLIs and servers that will never be static pages, and
      // printing all of them at equal weight buries the six that a session
      // could actually do something about.
      const notAPage = excluded.filter((e) => e.kind === 'not-a-page');
      const actionable = excluded.filter((e) => e.kind !== 'not-a-page');
      console.log(`\n${excluded.length} venture(s) the mirror does not serve:`);
      console.log(
        `\n  ${notAPage.length} have no flat index.html — CLIs, servers, and apps with a build step.\n` +
          `  Not static pages, so not a gap the mirror can close:\n` +
          `    ${notAPage.map((e) => e.slug).join(', ')}`,
      );
      if (actionable.length) {
        console.log(`\n  ${actionable.length} are static pages held out by a link the mirror cannot follow:`);
        for (const { slug, kind, reason } of actionable) {
          console.log(`    ${slug} [${kind}]\n      ${reason}`);
        }
      }
    }
  }
}
