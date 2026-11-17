# check.mjs: sync page reads, read once for every pass (2026-11-15)

Perf run (`prompts/perf/prompt-0.md`). Follow-up to
`ci-perf-2026-11-09-check-page-reads-shared.md`, whose "not changed" list
ranked "the remaining reads" first.

## Reading

`ci_profile.py --runs 600 --steps 30` (600 runs, 2026-11-15T04:37Z to 05:38Z,
459 job-minutes): "Check the built artifact" is 8.4 min over 35 Portfolio
Pages build jobs, 16 s median. Everything above it is either a step with a
dozen earlier passes (`Test the site builder`, `Build the site`) or owner-gated
workflow work (P063, P064: `.github/` is in CODEOWNERS).

Locally (4 cores, this sandbox): `node build.mjs --out=<dist>` (1 m 53 s;
1,365 products, 9,943 pages, 264 M characters of HTML), then
`time node check.mjs <dist>`: **21.9, 22.3 s** (also 21.9 with a profiler).

Phase timestamps (`performance.now()` printed between sections) showed where
the wall time went, and `node --cpu-prof` summed by self time agreed:
5.0 s idle, file open/read/fstat/close about 2.6 s, path.resolve/normalize/
relative 3.8 s.

| phase | before |
|---|---|
| start to walk (incl. 1,365 llms.txt reads, awaited one at a time) | 1.6 s |
| inline scripts (9,943 page reads, awaited one at a time) | 4.3 s, of which `parse-batch` 0.3 s |
| link pass (32-wide async reads of ~9,000 .mjs/.txt/.xml/.json files; 450k link resolutions) | 5.7 s |
| sitemap coverage (re-read **every** page with an awaited `fs.readFile` for a noindex test) | 2.5 s |
| `main`: `loadPages` re-reads every page for title/h1 hygiene | 0.9 s read + 0.6 s check |

So the site was read three times, and two of those reads were serial awaited
promises: each one a round trip through libuv's thread pool for a file that
takes microseconds to read.

## Change

- `readPage` (shared by every pass) reads with `readFileSync` and caches the
  string, not a promise.
- The sitemap-coverage noindex test uses `readPage` instead of its own read.
- The link pass reads non-HTML text files synchronously too.
- `checkSite` takes an optional `pageCache` Map; `main` passes one and hands it
  to `loadPages(site, { cache })`, which still walks the tree itself, so keys
  and order are what an uncached load gives (new test in
  `page-identity.test.mjs`).
- The per-product `llms.txt` date check reads synchronously.
- Link resolution: the site root is resolved once (it was resolved twice per
  link) and each (directory, link) pair once (450k lookups, 276k distinct).

## Verification

| | wall |
|---|---|
| before | 21.9, 22.3 s |
| after | 15.6, 15.9, 16.4 s |

About 27% off the step, same machine and same artifact. Memory is unchanged
in kind: the old code already held every page's text for the run.

Same answers: on the clean artifact both print "1365 products, 45 category
pages, 9943 pages, no dead links". On a broken hard-link copy (an orphan page
with a dead link, a root-escaping link, an unparseable inline script, two h1s,
no sitemap entry; a noindex orphan; a dead link added to a product index) the
old `check.mjs` (from `HEAD`) and the new one print byte-identical output: 9
problems, same order, exit 1 both. `node --test check.test.mjs
page-identity.test.mjs` 110 pass; `typecheck.test.mjs` 5 pass.

The CI figure comes from the next `ci_profile.py` reading of "Check the built
artifact" (16 s median before this change).

## Not changed (ranked)

1. GC (2.3 s) and the link pass's own regex work (`[...matchAll]` spread into
   arrays three times per file): a single combined scan per file would cut
   allocation.
2. The 276k-entry resolution memo hits only 39%; keying by link for
   root-absolute targets, or resolving with string ops instead of
   `path.resolve`, would do better.
3. The section reads before the walk (hub, about, guides pages) are still
   awaited `fs.readFile`, but there are only a few hundred.
4. P063 and P064 (owner, `.github/`).
