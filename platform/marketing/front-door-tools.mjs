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
 * The whole site is ~34 MB against a 1 MiB ConfigMap ceiling, which is the
 * measured reason `portfolio-site.yaml` clones the repo in-cluster instead of
 * being delivered the way the front door is. A subset is therefore the only
 * shape available, and `BYTE_CEILING` keeps it one.
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
 * - every mirrored page carries `<meta name="robots" content="noindex,follow">`,
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
 * The ceiling on the mirror's total bytes.
 *
 * A ConfigMap cannot exceed 1 MiB, and this one shares the pod with
 * `portfolio-front-html` (11 KB) rather than the whole budget. 640 KiB leaves
 * room for the YAML overhead kustomize adds around each key and for a few more
 * ventures before anyone has to think about it again. Exceeding it is a build
 * failure, not a warning: a ConfigMap that fails to apply takes the *front
 * door* down with it, which would trade a broken link for a broken page.
 */
export const BYTE_CEILING = 640 * 1024;

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
 * Marketplace-seller tools are the conspicuous omission: `ebay-fee-calculator`
 * alone is 136 KB and the category's other entries are comparable, so one of
 * them would cost a fifth of the ceiling. The front door says plainly that the
 * mirror is a subset rather than implying the category is covered.
 */
export const STARTER_SET = [
  { slug: 'change-order-margin-calculator', why: 'trades — the highest-traffic bid-side tool small enough to mirror' },
  { slug: 'subcontractor-cashflow-planner', why: 'trades — pairs with the change-order tool on the same job' },
  { slug: 'contractor-bid-readiness', why: 'trades — the pre-bid check, no arithmetic to get wrong' },
  { slug: 'construction-evidence-log', why: 'evidence — the category card needs a working example' },
  { slug: 'tender-bid-readiness', why: 'evidence — smallest complete venture in the repo' },
  { slug: 'job-margin-variance', why: 'back-office — the after-the-job review' },
  { slug: 'seller-net-sheet', why: 'back-office — highest standalone search intent in the category' },
  { slug: 'subscription-price-impact', why: 'back-office — the SaaS pricing question' },
  { slug: 'saas-seat-true-up', why: 'back-office — recurring use, not a one-off' },
  { slug: 'cam-reconciliation-check', why: 'back-office — annual, high-value, hard to do by hand' },
  { slug: 'appliance-repair-quote-calculator', why: 'services — a trade that quotes without bidding construction' },
  { slug: 'hvac-maintenance-contract-calculator', why: 'services — contract pricing, repeat visits' },
  { slug: 'cleaning-dilution-calculator', why: 'services — used on the job, not before it' },
  { slug: 'medical-courier-route-margin', why: 'logistics — the only category card otherwise unrepresented' },
  { slug: 'owner-operator-cpm-calculator', why: 'logistics — a second logistics tool, weekly not per-delivery' },
  { slug: 'chargeback-evidence-packet', why: 'evidence — a third evidence tool, the seller-facing one' },
  { slug: 'translator-project-quote', why: 'services — a fourth services tool, project-based not contract-based' },
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

const isServable = (name) =>
  (SERVABLE_EXTENSIONS.has(path.extname(name)) || SERVABLE_NAMES.has(name)) &&
  !name.includes('.test.');

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
 * Add the two tags that keep this copy out of the index and pointed home.
 *
 * Inserted after the charset declaration rather than after `<head>`, because
 * the charset has to stay inside the first 1024 bytes for a browser to honour
 * it and these tags are large enough to push it out on a compact page.
 *
 * A venture source carries no canonical of its own — `build.mjs` injects one
 * when it publishes — so there is nothing here to replace. The regex still
 * strips a pre-existing one rather than leaving two, since a page with two
 * canonicals has the crawler pick, which is the failure mode being avoided.
 */
export function injectMirrorTags(html, { slug, file }) {
  const tags =
    `<meta name="robots" content="noindex,follow">` +
    `<link rel="canonical" href="${canonicalUrl(slug, file)}">`;
  const stripped = html.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '');
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
    tools.push({ slug, why, title: pageTitle(entry.contents), url: mirrorUrl(slug, 'index.html') });
  }

  const problems = validateLinks(files);
  if (problems.length) {
    throw new Error(`the mirror would serve dead links:\n  ${problems.join('\n  ')}`);
  }

  const bytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.contents), 0);
  if (bytes > BYTE_CEILING) {
    throw new Error(
      `the mirror is ${bytes} bytes, over the ${BYTE_CEILING}-byte ceiling — ` +
        `drop a venture from STARTER_SET rather than raising it without reading its comment`,
    );
  }

  return { files, tools, bytes };
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
  return match[1].split('|')[0].trim();
}

/** The kustomization that reads the mirror into the ConfigMap the pod mounts. */
export function renderKustomization(files) {
  const list = files.map((f) => `      - ${f.key}=${f.key}`).join('\n');
  return `# Generated by \`node platform/marketing/front-door-tools.mjs --write\`.
# Do not hand-edit: \`platform/marketing/front-door-tools.test.mjs\` regenerates
# this file and the mirrored pages beside it, and fails if the commit is stale.
#
# A nested kustomization rather than another generator in \`../kustomization.yaml\`
# only because this file list is machine-written, one line per mirrored file;
# there is no behavioural difference. In particular the content-hash suffix
# still reaches the Deployment: kustomize accumulates this generator's output
# before the parent runs its name-reference transformer, so \`portfolio-front.yaml\`
# mounting \`portfolio-front-tools\` resolves to the hashed name. Verified by
# \`test_portfolio_front_mounts_only_generated_configmaps\`, which reads both
# kustomizations, and by the hash test beside it.
#
# The hash is deliberately left ON, matching \`portfolio-front-html\` and
# \`portfolio-front-nginx\`: a Deployment mounts this, so the generated name has
# to change with the content or a regenerated tool never reaches a running pod.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
configMapGenerator:
  - name: portfolio-front-tools
    files:
${list}
`;
}

export async function writeMirror(outputDir = OUTPUT_DIR) {
  const { files, tools, bytes } = await buildMirror();
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  for (const file of files) {
    await fs.writeFile(path.join(outputDir, file.key), file.contents);
  }
  await fs.writeFile(path.join(outputDir, 'kustomization.yaml'), renderKustomization(files));
  return { files, tools, bytes };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes('--write')) {
    const { files, tools, bytes } = await writeMirror();
    console.log(
      `wrote ${path.relative(REPO_ROOT, OUTPUT_DIR)}: ` +
        `${tools.length} tools, ${files.length} files, ${bytes} bytes ` +
        `(${Math.round((bytes / BYTE_CEILING) * 100)}% of the ceiling)`,
    );
  } else {
    const { files, tools, bytes } = await buildMirror();
    for (const tool of tools) console.log(`${tool.url.padEnd(46)} ${tool.title}`);
    console.log(`\n${tools.length} tools, ${files.length} files, ${bytes} bytes`);
  }
}
