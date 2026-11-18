# check.mjs reads each served page once (2026-11-09)

Perf run, follow-up to `ci-perf-2026-11-09-inline-parse-batch.md`, whose
"not changed" list ranked "read each page once" first.

## Reading

`check.mjs /tmp/pdist` on the built site (7,864 pages, 185 MB of HTML): 18.9 s
wall. The profile has about 6 s of file open/read/fstat/close and `Buffer.slice`
(utf8 decode) self time. Four passes each read every served page: inline
scripts, hidden-attribute contrast, canonical origin, and the placeholder-origin
sweep.

## Change

`checkSite` keeps one promise per page (`readPage`) and the four passes share
it, so each page is read and decoded once. Non-HTML text files still read
directly. Holds about 185 MB of strings for the length of the run.

## Verification

| | wall, 3 runs |
|---|---|
| before | 18.8, 18.9, 19.5 s |
| after | 14.3, 14.2, 15.8 s |

Same verdict line both ways ("1331 products, 45 category pages, 7864 pages, no
dead links"). `node --test platform/pages/check.test.mjs`: 97 pass. One local
machine, not a CI runner; the CI number comes from the next `ci_profile.py`
reading of "Check the built artifact" (27 s median before this change).

## Not changed (ranked)

1. The remaining reads: hub subsets (lines ~733-912), noindex checks, and the
   non-HTML text sweep.
2. P063 and P064 (owner, `.github/`).
3. `Test the site builder`: waits on a share-card cache hit in CI.
