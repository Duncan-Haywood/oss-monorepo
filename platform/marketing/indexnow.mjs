#!/usr/bin/env node
/**
 * Tell IndexNow-participating search engines (Bing, Yandex, Seznam, Naver —
 * not Google, which has no equivalent push API) that this catalogue's pages
 * exist, without waiting for them to discover it by crawling.
 *
 * ## Why this exists
 *
 * `platform/ci/pages_state.py`'s `indexing` row (added 2026-09-09, PR #4362)
 * found that this site's `robots.txt` — and the `Sitemap:` line inside it —
 * is unreachable to a crawler. The site is served from a project-Pages
 * *subpath* (`https://duncan-haywood.github.io/monorepo-projects/`), but
 * `robots.txt` is fetched at the *host* root
 * (`https://duncan-haywood.github.io/robots.txt`), which belongs to the
 * owner's separate user-level Pages site. So sitemap auto-discovery has
 * never happened, for any of the 881 pages this catalogue publishes, and
 * `portfolio/usage/usage.yaml` records zero visitors across every one of
 * them. The owner-only fixes (submit the sitemap directly in Search
 * Console, or set a custom domain) are named in that row and in
 * `portfolio/ledger/decision_queue.py` — this script is not either of
 * those; it is the piece of the same problem that does not need the
 * owner's login.
 *
 * IndexNow's key file does not have to sit at the host root the way
 * `robots.txt` does — the protocol lets a submitter name the key's location
 * explicitly in each request (`keyLocation`), and a participating engine
 * fetches *that* URL rather than assuming the host root. So the same
 * subpath that defeats `robots.txt` auto-discovery does not defeat this:
 * `build.mjs` publishes the key file at the site's own root
 * (`indexNowKeyFileName()`), and every submission below names it.
 *
 * ## What this does not claim
 *
 * IndexNow is not a Google mechanism, so this is a complement to sitemap
 * submission, not a replacement for it — Search Console is still the
 * owner's to do. And a 200/202 from the API means the engines *accepted*
 * the submission, not that they crawled or indexed anything; there is no
 * confirmation API. Treat a clean submit as "asked", not as "done".
 *
 * ## Usage
 *
 *   node platform/marketing/indexnow.mjs               # dry run: prints what
 *                                                       # would be submitted
 *   node platform/marketing/indexnow.mjs --submit       # actually POSTs
 *   node platform/marketing/indexnow.mjs --submit --ref gh-pages
 *   node platform/marketing/indexnow.mjs --submit --dir /path/to/built/site
 *   node platform/marketing/indexnow.mjs --submit --dir dist --base-url https://marisstella.dev/
 *
 * `--base-url` names the origin explicitly, for a publisher that is not the
 * `gh-pages` snapshot. Without it the origin is read from the artifact's own
 * `catalog.json` — see `resolveBaseUrl` for the order and for the one case
 * that refuses rather than guesses.
 *
 * `--ref` (default `gh-pages`) reads `catalog.json` from that git ref via
 * `git show`, matching how `published-base-url.mjs` reads the serving
 * branch's `CNAME` — this script asks "what did we actually publish?", not
 * "what would the next build produce?". `--dir` overrides that with a
 * filesystem path instead (a freshly built `dist/`, or a checkout), for
 * testing and for a session that already has one on disk.
 *
 * This session's own sandbox cannot reach `api.indexnow.org` — the agent
 * egress proxy 403s any host outside its allowlist, the same limit
 * `CLAUDE.md` already records for `github.io` — so `--submit` only does
 * anything useful from a GitHub Actions runner or another host with real
 * egress. That is also why the default is a dry run: this script never
 * makes a network call unless asked to.
 */

import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { INDEXNOW_KEY, indexNowKeyFileName, REPO_ROOT } from '../pages/build.mjs';
import { publishedBaseUrl, SERVING_BRANCH } from '../pages/published-base-url.mjs';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

// The protocol's own ceiling (https://www.indexnow.org/documentation) — a
// single request may name at most 10,000 URLs. This catalogue is well under
// that (roughly one hub page, a dozen categories, and one URL per venture),
// but the guard is here so a catalogue that grows past it fails loudly with
// a name for the fix (batch the calls) rather than filing a request the API
// silently truncates.
export const MAX_URLS_PER_REQUEST = 10000;

// Exit code for "the request never left this machine". Distinct from 1 so a
// caller can tell "this host cannot reach IndexNow" (expected, and not a
// reason to fail a deploy that already succeeded) from "IndexNow refused what
// we sent" (a real defect in the payload or the published key file).
// `platform/pages/publish-branch.sh` is the caller that makes that
// distinction — see its `announce_to_indexnow`.
export const EXIT_NO_EGRESS = 3;

/**
 * Does this response come from an egress proxy that refused the host, rather
 * than from IndexNow?
 *
 * Measured 2026-09-10, and it is the correction to an assumption the previous
 * revision of this file shipped. `EXIT_NO_EGRESS` was added on the premise
 * that a blocked host makes `fetch` *reject* — which is what `curl` sees
 * (`CONNECT tunnel failed, response 403`). Running the real thing showed
 * otherwise: Node's fetch resolves with an ordinary `403` whose body is the
 * proxy's own text, so the run took the generic-failure branch and reported
 * the sandbox limit as "IndexNow refused what we sent" — precisely the
 * confusion `EXIT_NO_EGRESS` exists to remove.
 *
 * Status alone cannot settle it: IndexNow itself answers `403` for an invalid
 * key, which is a real defect in the published key file and must stay loud.
 * The body can, because the proxy names itself:
 *
 *   Host not in allowlist: api.indexnow.org. Add this host to your network
 *   egress settings to allow access.
 *
 * So the match is deliberately narrow — two phrases from that sentence, not a
 * bare "403 plus the word forbidden". A false positive here would bury a
 * genuine key failure, which is the more expensive mistake of the two.
 */
export function isEgressRefusal({ status, body }) {
  if (status !== 403 || !body) return false;
  const text = String(body).toLowerCase();
  return text.includes('not in allowlist') || text.includes('network egress settings');
}

/**
 * Every URL this catalogue considers part of its public surface, read from
 * the artifact `catalog.json` itself rather than re-walked from `ventures/`
 * — the same "read what actually published" preference `--ref` follows
 * above, and it is comprehensive by construction: `check.mjs` already
 * refuses to publish a `catalog.json` missing a tool, so this list is never
 * behind what a visitor can reach.
 */
export function urlsFromCatalog(catalog) {
  const urls = new Set();
  if (typeof catalog.url === 'string') urls.add(catalog.url);
  for (const category of catalog.categories ?? []) {
    if (typeof category.url === 'string') urls.add(category.url);
  }
  for (const tool of catalog.tools ?? []) {
    if (typeof tool.url === 'string') urls.add(tool.url);
  }
  return [...urls].sort();
}

/**
 * A reader for one published site, either a git ref (the default — what is
 * actually live, without checking it out; mirrors `published-base-url.mjs`'s
 * `readServingCname`) or a filesystem directory (a freshly built `dist/`, or
 * a checkout — for testing, and for a session that already has one on disk).
 * Same shape either way so the rest of the script does not care which.
 */
export function readerFor({ ref, dir }) {
  if (dir) {
    return async (relativePath) => fs.readFile(path.join(dir, relativePath), 'utf8');
  }
  return async (relativePath) => {
    try {
      return execFileSync('git', ['-C', REPO_ROOT, 'show', `${ref}:${relativePath}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      throw new Error(
        `could not read '${relativePath}' from ref '${ref}': ${err.message.trim()}. ` +
          `Is '${ref}' fetched in this clone? (git fetch origin ${ref})`,
      );
    }
  };
}

async function readCatalog(readFile) {
  return JSON.parse(await readFile('catalog.json'));
}

/**
 * Refuse to submit if the published key file does not match what this build
 * would publish. A mismatch means either the snapshot is stale (rebuild and
 * republish first — `platform/ci/pages_state.py` says whether it is) or the
 * key rotated without a republish; either way, submitting a `keyLocation`
 * the API will fetch and fail to verify wastes the call and teaches nothing.
 */
export async function assertKeyFilePublished(readFile) {
  const published = (await readFile(indexNowKeyFileName())).trim();
  if (published !== INDEXNOW_KEY) {
    throw new Error(
      `the published key file does not match INDEXNOW_KEY (got ${JSON.stringify(published)}). ` +
        'The snapshot is stale or was built with a different key — rebuild and republish ' +
        '(platform/ci/pages_state.py says which) before submitting.',
    );
  }
}

/**
 * The origin the artifact under submission was *built for*, read out of the
 * artifact itself.
 *
 * `build.mjs`'s `renderCatalog` writes `url: baseUrl` verbatim, so
 * `catalog.json` carries the origin its own URLs are stamped with. That makes
 * it a reading of what shipped rather than an inference about where it went —
 * the same "read what actually published" preference `--ref` and `--dir`
 * already follow for the URL list.
 *
 * Returns null rather than guessing when the field is missing or is not an
 * absolute http(s) URL, so the caller can fall back and say that it did.
 */
export function originFromCatalog(catalog) {
  const url = catalog?.url;
  if (typeof url !== 'string' || url === '') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  // `buildPayload` concatenates the key filename onto this, so a missing
  // trailing slash would produce a `keyLocation` one path segment short.
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Which origin to announce, and where that answer came from.
 *
 * ## Why this is not just `publishedBaseUrl()`
 *
 * It used to be, and that was a latent defect the `gh-pages` route never
 * exposed. `publishedBaseUrl()` reads the **serving branch's** `CNAME`, so it
 * answers "where does the *gh-pages snapshot* get served?" — correct for the
 * one publisher that existed when this script was written, and wrong for any
 * other. `--dir` says "here is the site I actually published", and the origin
 * was still coming from somewhere else entirely.
 *
 * The caller that makes it concrete is `gitops/prod/host/refresh-site.sh`: it
 * builds on the Hetzner box with `PAGES_BASE_URL=https://marisstella.dev/`
 * from a deploy checkout that tracks `main` and has never fetched `gh-pages`.
 * `publishedBaseUrl()` there returns `assumed-default` — the github.io project
 * URL — so the payload would have declared `host: duncan-haywood.github.io`
 * and a `keyLocation` on that host while every URL in `urlList` was on
 * `marisstella.dev`. IndexNow rejects a host mismatch, so the one route in
 * this repository standing on a host with real egress to the API would have
 * spent every submission on a request that could not be accepted.
 *
 * ## The order, and why a disagreement is not always a conflict
 *
 *   1. `--base-url`, when the caller knows the origin. Explicit wins.
 *   2. the artifact's own `catalog.json`. A reading of what shipped.
 *   3. `publishedBaseUrl()`, when the artifact carries no usable origin.
 *
 * ## When a disagreement is a conflict, and when it is just two sites
 *
 * `publishedBaseUrl()` reads *the serving branch*. So it is a competing
 * measurement of the same fact only when the artifact under submission **is**
 * that snapshot — which is exactly the default, `--ref gh-pages`. Then a
 * disagreement means the snapshot is stale or the domain moved without a
 * republish; submitting either origin would be a guess, so this refuses and
 * names both, the same fail-closed choice `assertKeyFilePublished` makes for a
 * key that does not match.
 *
 * When `--dir` names some other build, or `--ref` names some other branch,
 * gh-pages has nothing to say about it: they are two different sites that
 * differ, not one site measured twice. `comparable` is that distinction, and
 * getting it wrong is not hypothetical — the first draft compared
 * unconditionally, and a `--dir` submission then started refusing the moment
 * the clone happened to have `gh-pages` fetched. Whether an unrelated branch
 * is present locally must not change what this announces.
 *
 * A serving branch that was never read (`assumed-default`, which
 * `publishedBaseUrl`'s own docstring flags as "NOT a reading") is never a
 * conflict either: there is nothing to disagree with.
 */
export function resolveBaseUrl({ explicit = null, catalog = null, published, comparable = false }) {
  if (explicit) {
    let parsed;
    try {
      parsed = new URL(explicit);
    } catch {
      throw new Error(`--base-url is not a valid absolute URL: ${JSON.stringify(explicit)}`);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`--base-url must be http(s): ${JSON.stringify(explicit)}`);
    }
    return {
      baseUrl: explicit.endsWith('/') ? explicit : `${explicit}/`,
      source: 'explicit',
    };
  }

  const fromArtifact = originFromCatalog(catalog);
  if (fromArtifact === null) {
    return { baseUrl: published.baseUrl, source: `published (${published.source})` };
  }
  if (comparable && published.source !== 'assumed-default' && published.baseUrl !== fromArtifact) {
    return {
      baseUrl: null,
      source: 'conflict',
      conflict: { artifact: fromArtifact, published: published.baseUrl, via: published.source },
    };
  }
  return { baseUrl: fromArtifact, source: 'artifact (catalog.json)' };
}

export function buildPayload({ baseUrl, urls }) {
  const host = new URL(baseUrl).host;
  return {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${baseUrl}${indexNowKeyFileName()}`,
    urlList: urls,
  };
}

/**
 * POST the payload, distinguishing the two failures that mean different things.
 *
 * An HTTP status the API chose (`ok: false`, a real `status`) means the request
 * arrived and was refused — a bad key, a host mismatch, a rate limit — and the
 * fix is in the payload. A *transport* failure means the request never left the
 * machine, and the fix is where you are standing rather than what you sent.
 *
 * That second case is the ordinary one here, not an edge: an agent session's
 * sandbox answers `403 to CONNECT` for `api.indexnow.org` (the same egress
 * policy `CLAUDE.md` records for `github.io`), so any run of `--submit` from
 * one hits it. Until now `fetch` simply rejected out of `submit`, and the CLI
 * had no catch — so the single most likely outcome of the flag printed a raw
 * `TypeError: fetch failed` stack trace, which reads as a defect in this script
 * rather than as the environment limit it is. `status: 0` with an `error` is
 * the same shape the caller already handles, so no branch has to grow.
 */
export async function submit(payload) {
  let res;
  try {
    res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { status: 0, ok: false, body: '', error: err?.message || String(err) };
  }
  const body = await res.text();
  return { status: res.status, ok: res.ok, body };
}

function parseArgs(argv) {
  const args = { submit: false, ref: 'gh-pages', dir: null, baseUrl: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--submit') args.submit = true;
    else if (argv[i] === '--ref') args.ref = argv[++i];
    else if (argv[i] === '--dir') args.dir = argv[++i];
    else if (argv[i] === '--base-url') args.baseUrl = argv[++i];
  }
  return args;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const readFile = readerFor(args);
  const catalog = await readCatalog(readFile);

  const resolved = resolveBaseUrl({
    explicit: args.baseUrl,
    catalog,
    published: publishedBaseUrl(),
    // publishedBaseUrl() reads the serving branch, so it is a second reading
    // of *this* artifact only when this artifact is that branch's snapshot.
    comparable: !args.dir && args.ref === SERVING_BRANCH,
  });
  if (resolved.source === 'conflict') {
    const { artifact, published, via } = resolved.conflict;
    console.error(
      `indexnow: two readings of this site's origin disagree, so nothing was submitted.\n` +
        `  the artifact says   ${artifact}   (catalog.json in ${args.dir ? `dir ${args.dir}` : `ref ${args.ref}`})\n` +
        `  the serving branch says ${published}   (${via})\n` +
        '  That means the snapshot is stale or the domain moved without a republish.\n' +
        '  Rebuild and republish, or pass --base-url to say which origin is right.',
    );
    process.exit(1);
  }
  const { baseUrl } = resolved;
  const urls = urlsFromCatalog(catalog);

  if (urls.length === 0) {
    console.error('indexnow: catalog.json named no URLs — refusing to submit an empty list.');
    process.exit(1);
  }
  if (urls.length > MAX_URLS_PER_REQUEST) {
    console.error(
      `indexnow: ${urls.length} URLs exceeds the ${MAX_URLS_PER_REQUEST}-per-request protocol ` +
        'limit. This script does not batch yet — split the call or extend it before running.',
    );
    process.exit(1);
  }

  const payload = buildPayload({ baseUrl, urls });

  console.log(`indexnow: ${urls.length} URL(s) from ${args.dir ? `dir ${args.dir}` : `ref ${args.ref}`}`);
  console.log(`  origin:      ${baseUrl} (from ${resolved.source})`);
  console.log(`  host:        ${payload.host}`);
  console.log(`  keyLocation: ${payload.keyLocation}`);
  console.log(`  sample:      ${urls.slice(0, 3).join(', ')}${urls.length > 3 ? ', …' : ''}`);

  if (!args.submit) {
    console.log('\nDry run — no request sent. Pass --submit to actually notify IndexNow.');
    process.exit(0);
  }

  await assertKeyFilePublished(readFile);

  const result = await submit(payload);

  // Both shapes of "this host cannot reach IndexNow" land here: the request
  // rejecting outright, and an egress proxy answering in IndexNow's place.
  // Neither submitted anything and neither broke anything.
  const noEgress = result.error
    ? `could not be sent: ${result.error}`
    : isEgressRefusal(result)
      ? `${result.status}, from this host's egress proxy rather than from IndexNow`
      : null;
  if (noEgress) {
    console.error(`\nPOST ${INDEXNOW_ENDPOINT} -> ${noEgress}`);
    if (result.body) console.error(`  ${String(result.body).trim()}`);
    console.error(
      'indexnow: the request never reached IndexNow, so nothing was submitted and nothing\n' +
        '  was broken. This host has no egress to api.indexnow.org. Re-run from a host with\n' +
        '  real egress (a GitHub Actions runner, or the Hetzner box once host mode is\n' +
        '  installed).',
    );
    process.exit(EXIT_NO_EGRESS);
  }

  console.log(`\nPOST ${INDEXNOW_ENDPOINT} -> ${result.status}`);
  if (result.body) console.log(result.body);
  if (!result.ok) {
    console.error('indexnow: submission was not accepted — see status and body above.');
    process.exit(1);
  }
}
