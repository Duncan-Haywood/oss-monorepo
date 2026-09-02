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
 * about *crawlers*, and it is correct, so this mirror is built to be invisible
 * to them and visible only to people:
 *
 * - every mirrored page carries `<meta name="robots" content="noindex,follow">`
 *   and *only* that one — `injectMirrorTags` strips whatever the venture
 *   source already declared, so no page ships two directives that disagree;
 *   so no copy here is eligible to be indexed at all; and
 * - every mirrored page carries a `<link rel="canonical">` pointing at its own
 *   `tools.marisstella.dev/<slug>/` URL, so any signal that does reach a
 *   crawler consolidates exactly where the existing design intends.
 *
 * `front-door/default.conf` adds `X-Robots-Tag: noindex` on these paths too, so
 * the claim holds for a crawler that never parses the HTML.
 *
 * The consequence worth stating plainly: these pages are a fallback for humans,
 * not a second front in search. They win nothing in rankings and are not meant
 * to. When `portfolio-site-repo` is sealed, the mirror becomes redundant and
 * can be deleted in one commit — `STARTER_SET` is the only thing to remove.
 *
 * ## Usage
 *
 *   node platform/marketing/front-door-tools.mjs --write   # writes gitops/prod/front-door-tools/
 *   node platform/marketing/front-door-tools.mjs           # prints a manifest summary
 *   node --test platform/marketing/front-door-tools.test.mjs
 *
 * The output is committed for the same reason `front-door/index.html` is: Argo
 * CD delivers it, not a CI job, so the files in git *are* the artifact.
 * `front-door-tools.test.mjs` regenerates and compares, and fails a stale
 * commit with the command that fixes it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const VENTURES_DIR = path.join(REPO_ROOT, 'ventures');

/** Where `--write` puts the mirror; a kustomization in the same directory reads it. */
export const OUTPUT_DIR = path.join(REPO_ROOT, 'gitops', 'prod', 'front-door-tools');

/** The canonical host every tool page belongs to; see `build.mjs`. */
export const TOOLS_URL = 'https://tools.marisstella.dev/';

/** The apex path the mirror is served under. Matches `front-door/default.conf`. */
export const MIRROR_PREFIX = 'tools/';

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
 */
export const SHARD_BYTE_CEILING = 706 * 1024;

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
 */
export const MIRROR_BYTE_CEILING = 5 * 1024 * 1024;

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
 * the tools host and describe URLs this mirror does not serve; nothing on any
 * page links to them, which `validateLinks` confirms rather than assumes.
 */
const SERVABLE_EXTENSIONS = new Set(['.html', '.mjs', '.css', '.js']);
const SERVABLE_NAMES = new Set(['LICENSE']);

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
  logistics: 'logistics',
  more: 'more',
};

/** The category a `why` string claims, for checking against `categoryFor`. */
export const claimedCategory = (why) => why.split('—')[0].trim();

export const STARTER_SET = [
  { slug: 'change-order-margin-calculator', why: 'trades — the highest-traffic bid-side tool small enough to mirror' },
  { slug: 'subcontractor-cashflow-planner', why: 'trades — pairs with the change-order tool on the same job' },
  { slug: 'contractor-bid-readiness', why: 'trades — the pre-bid check, no arithmetic to get wrong' },
  { slug: 'construction-evidence-log', why: 'trades — the jobsite record side of a job, not the bid side' },
  { slug: 'tender-bid-readiness', why: 'more — smallest complete venture in the repo, and the only thing behind that card' },
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
  { slug: 'sponsor-ready', why: 'more — the only other venture that card can point at' },

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
 * The ConfigMap key a mirrored file gets.
 *
 * ConfigMap keys cannot contain `/`, so the venture and the filename are joined
 * with `__` and `front-door/default.conf` maps the URL back. The alternative —
 * an explicit `items:` list on the volume, one entry per file, to rebuild the
 * directory tree at mount time — would put ~90 lines of hand-maintained YAML in
 * `portfolio-front.yaml` that must stay in step with this set. A rewrite rule
 * in nginx does the same job in two lines and cannot drift.
 */
export const mirrorKey = (slug, file) => `${slug}__${file}`;

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

/** The apex URL a mirrored file is served at. */
export const mirrorUrl = (slug, file) =>
  `/${MIRROR_PREFIX}${slug}/${file === 'index.html' ? '' : file}`;

/** The `tools.marisstella.dev` URL the same page has (or will have) — its canonical. */
export const canonicalUrl = (slug, file) =>
  `${TOOLS_URL}${slug}/${file === 'index.html' ? '' : file}`;

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
export const APEX_ROOT_PATHS = new Set(['/', `/${FAVICON_FILE}`, '/social-card.png', '/healthz']);

const isTestFile = (name) => name.includes('.test.') || /^test\.(m?js)$/.test(name);

const isServable = (name) =>
  (SERVABLE_EXTENSIONS.has(path.extname(name)) || SERVABLE_NAMES.has(name)) && !isTestFile(name);

/** The servable files of one venture, sorted so the output is deterministic. */
export async function ventureFiles(slug, venturesDir = VENTURES_DIR) {
  const dir = path.join(venturesDir, slug);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isServable(entry.name))
    .map((entry) => entry.name)
    .sort();
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
 */
export function injectMirrorTags(html, { slug, file }) {
  const tags =
    `<meta name="robots" content="noindex,follow">` +
    `<link rel="canonical" href="${canonicalUrl(slug, file)}">` +
    `<link rel="icon" href="/${FAVICON_FILE}" type="image/svg+xml">`;
  const stripped = html
    .replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '')
    .replace(/<link\b[^>]*\brel=["']icon["'][^>]*>/gi, '')
    .replace(/<meta\b[^>]*\bname=["']robots["'][^>]*>/gi, '');
  const charset = stripped.match(/<meta\s+charset=["'][^"']*["']\s*\/?>/i);
  if (charset) {
    const at = stripped.indexOf(charset[0]) + charset[0].length;
    return stripped.slice(0, at) + tags + stripped.slice(at);
  }
  return stripped.replace(/<head\b[^>]*>/i, (open) => open + tags);
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
 */
export function validateLinks(files) {
  const present = new Set(files.map((f) => `${f.slug}/${f.file}`));
  const problems = [];
  for (const { slug, file, contents } of files) {
    if (!file.endsWith('.html')) continue;
    for (const [, href] of contents.matchAll(/(?:href|src)="([^"]*)"/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href) || href === '') continue;
      const target = href.split(/[?#]/)[0];
      if (target === '' || target === '.' || target === './') continue;
      // A root-absolute href is answered by the front door's own document
      // root, not by this mirror, so it is checked against what that root
      // actually holds rather than resolved against the venture directory.
      if (target.startsWith('/')) {
        if (!APEX_ROOT_PATHS.has(target)) {
          problems.push(
            `${slug}/${file} → "${href}" (the apex document root serves only ` +
              `${[...APEX_ROOT_PATHS].join(', ')})`,
          );
        }
        continue;
      }
      const resolved = path.posix.normalize(path.posix.join(slug, target));
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
export async function buildMirror({ set = STARTER_SET, venturesDir = VENTURES_DIR } = {}) {
  const files = [];
  const tools = [];
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
    for (const file of names) {
      if (!ROUTABLE_FILE.test(file)) {
        throw new Error(
          `${slug}/${file} does not match the filename pattern in front-door/default.conf`,
        );
      }
      const raw = await fs.readFile(path.join(venturesDir, slug, file), 'utf8');
      const contents = file.endsWith('.html') ? injectMirrorTags(raw, { slug, file }) : raw;
      files.push({ slug, file, key: mirrorKey(slug, file), contents });
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

  const bytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.contents), 0);
  if (bytes > MIRROR_BYTE_CEILING) {
    throw new Error(
      `the mirror is ${bytes} bytes, over the ${MIRROR_BYTE_CEILING}-byte ceiling — ` +
        `drop a venture from STARTER_SET rather than raising it without reading its comment`,
    );
  }

  return { files, tools, bytes, shards: packShards(files) };
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
    const size = Buffer.byteLength(file.contents);
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
    const movedSize = Buffer.byteLength(prev.files[prev.files.length - 1].contents);
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
        shard.files.map((f) => `      - ${f.key}=${f.key}`).join('\n'),
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
# have no such shared cap; nginx still sees one flat directory of \`slug__file\`
# keys, and \`front-door/default.conf\` did not change. \`SHARD_BYTE_CEILING\` in
# \`front-door-tools.mjs\` carries the reasoning and the measurements.
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

export async function writeMirror(outputDir = OUTPUT_DIR) {
  const built = await buildMirror();
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  for (const file of built.files) {
    await fs.writeFile(path.join(outputDir, file.key), file.contents);
  }
  await fs.writeFile(path.join(outputDir, 'kustomization.yaml'), renderKustomization(built.shards));
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

if (isMain) {
  if (process.argv.includes('--write')) {
    const { files, tools, bytes, shards } = await writeMirror();
    console.log(
      `wrote ${path.relative(REPO_ROOT, OUTPUT_DIR)}: ` +
        `${tools.length} tools, ${files.length} files, ${bytes} bytes ` +
        `(${Math.round((bytes / MIRROR_BYTE_CEILING) * 100)}% of the mirror ceiling) ` +
        `in ${shards.length} shards\n${shardSummary(shards)}`,
    );
  } else {
    const { files, tools, bytes, shards } = await buildMirror();
    for (const tool of tools) console.log(`${tool.url.padEnd(46)} ${tool.title}`);
    console.log(
      `\n${tools.length} tools, ${files.length} files, ${bytes} bytes in ` +
        `${shards.length} shards\n${shardSummary(shards)}`,
    );
  }
}
