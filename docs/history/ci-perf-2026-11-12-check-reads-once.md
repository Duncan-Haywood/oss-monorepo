# Perf, 2026-11-12: check.mjs reads each page once, for every pass

Perf track. Follow-up to `ci-perf-2026-11-09-check-page-reads-shared.md`, whose
"not changed" list ranked "the remaining reads" first. Shipped:
`platform/pages/check.mjs` (and `page-identity.mjs`'s `loadPages`) now read
each served page from disk once per run, and the dead-link loop stops
recomputing per-run paths for each of its ~456k targets. Same report, byte for
byte. The CLI goes from **16.0 s to 12.0 s** (median, 4-core container), about 25% less.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --steps 30` (2026-11-12, 587 jobs):
Portfolio Pages build's `Check the built artifact` was the fourth-heaviest single
step in the pool, 9.3 job-minutes over 38 runs, 18 s median. The heavier three
are already being worked (`Test the site builder`), owner-gated (P064, the
gallery search stamp) or a per-venture fan-out (`ventures tests`).

Local site: `node platform/pages/build.mjs --out=<dist>` (8,813 pages, 216 MB of HTML).

## Profile

Phase timestamps (`performance.now()` at each section of `checkSite` and the CLI),
before:

| phase | s | what it was doing |
|---|---:|---|
| inline scripts | 3.3 | first read of every page, **serially** (one `await` per page), then hash and parse |
| dead-link scan | 5.2 | 456,496 targets; three `path.resolve`, one `path.relative`, an awaited lookup each |
| sitemaps | 2.1 | the noindex test **re-read every page with `fs.readFile`, serially**, bypassing the shared reads |
| page identity (CLI) | 2.0 | `loadPages` **re-read all 8,813 pages** after `checkSite` had them in memory |

`node --cpu-prof` agreed: 3.9 s idle (waiting on reads), and open/read/fstat/close
plus utf8 `slice` about 3.7 s of self time, `path.resolve`/`normalizeString`/`relative`
1.6 s.

## Change

1. `checkSite(site, { pageReads })` takes an optional Map for its page reads
   (default a fresh one, as before). The sitemap noindex test reads through it.
2. `loadPages(site, read)` takes an optional reader; the CLI passes one that
   returns `checkSite`'s promise, falling back to disk for any page the check did
   not read. The walk still decides the keys and their order.
3. Before the serial inline-script pass, the reads are started 32 at a time
   (`mapLimit(servedPages, 32, readPage)`), so the serial loop finds them decoded.
4. In the dead-link loop: the page's directory is resolved once per page, not per
   target; the deploy and dev prefixes once per run; `path.relative(root, x).startsWith('..')`
   is replaced by the same test on the string (root itself is `''`, a path under
   `root + sep` is its remainder, anything else is `..`), which keeps the old
   behaviour even for a directory named `..x`; and a target the walk already listed
   (`known.has`) skips the `await`.

## Verification

- `node check.mjs <dist>` output is byte-identical (`cmp`) before and after on the
  built site, and also on a deliberately broken copy (one page given a dead link,
  an escaping link and a noindex tag): both versions print the same two problems.
- `node --test check.test.mjs page-identity.test.mjs`: 112 pass. New tests: an
  escaping link into a same-prefix sibling (`<site>2/`) and to `../../outside.html`
  are both reported, and `../tool/` is not; `checkSite` fills the `pageReads` map
  with every served page; `loadPages` reads through a given reader. Mutation: the
  root test written as `startsWith(siteRoot)` without the separator fails the
  sibling test. The original code passes the new escape test.

## Numbers

Same container, interleaved runs, wall seconds of `node check.mjs <dist>`:

| | runs | median |
|---|---|---:|
| before | 15.9, 16.0, 15.9, 16.5, 16.5 | **16.0** |
| after | 10.9, 11.2, 11.8, 12.0, 12.2, 12.3 | **12.0** |

Phases after: inline 2.5 (prefetch 1.2 + pass 1.3), dead links 3.5, sitemaps 0.5,
identity 0.9. CI figure: the next `ci_profile.py --steps` reading of `Check the
built artifact` (18 s median before this change).

## Not changed (ranked)

1. Dead-link loop body, about 1.2 s self time: string hashing of fresh resolved
   paths into `known`, `inboundLinks` and `navigable`. 312k of the 456k
   (dir, target) pairs are distinct, so a memo would save little.
2. The meta-description whole-tag regex (0.3 s) runs a fresh `RegExp` per tag;
   one pass that collects `name=` once would do.
3. P064 (gallery search stamp, 18 s per build job) and P063 still wait on the owner.
