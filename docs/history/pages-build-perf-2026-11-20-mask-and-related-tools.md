# Pages build: the embed mask and the related-tools ranking (2026-11-20)

A perf-track run. Both CI-side perf backlog items (P063, P064) touch
`.github/` and wait for the owner, so this run took a fresh reading instead.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-20, 562 jobs,
614 job-minutes): Portfolio Pages is the largest consumer, 191.6 job-minutes
in 94 jobs, and its heaviest step is "Test the site builder" (58.2 min).

Each of the 120 Pages test files run alone (`node --test <file>`, two at a
time, cold card cache, this container): 579 s summed, and two files are most
of it.

| file | s |
|---|---:|
| `build.test.mjs` | 330.0 |
| `custom-domain.test.mjs` | 49.1 |
| `clauses.test.mjs` | 10.5 |
| `siblings.test.mjs` | 9.7 |
| next ten | 6 to 9 each |

Inside `build.test.mjs` (TAP `duration_ms`), the first test to await the
shared build takes 211 s; no other test passes 7.2 s. So the cost is
`buildSite` itself, which this file runs twice (in process, plus a child
for the determinism test) beside the hub fixture, and which
`custom-domain.test.mjs`, the CI build job and the deploy each run again.

`node --cpu-prof platform/pages/build.mjs --out=<dir>` with a warm
`PAGES_CARD_CACHE` (50.4 s wall; a cold cache is 125 s, the cards), self time
per function:

| self ms | what |
|---:|---|
| 5,029 | `writeFileUtf8` (9,244 files, 382 MB) |
| 3,553 | garbage collector |
| 2,799 | idle |
| 1,605 + 455 + 488 | `maskScriptAndStyleBodies` (`embed.mjs`): its per-character callback, the outer replace, the `[^\n]` regex |
| 1,554 + 1,006 | `relatedToolScore` + `relatedTools` (`build.mjs`) |
| about 1,300 each | file handles, reads, `close` |

The rest is flat (no other function of ours above 0.9 s).

## Change

1. **`maskScriptAndStyleBodies`** replaced every character of each
   script/style block but newlines with a space through
   `block.replace(/[^\n]/g, ' ')`, a callback-free regex but one match per
   character, run twice per tool entry page. It now builds a run of spaces
   per line with `indexOf('\n')` and `' '.repeat`. Both count UTF-16 code
   units, so the strings are identical. On 4,000 built pages plus a CRLF and
   astral-character case: 1,794 / 1,673 ms before, 273 / 267 ms after,
   every result equal.
2. **`relatedTools`** scored every other tool pairwise (about 1.9 million
   pairs for 1,378 tools, each a loop over one tool's words with an `idf()`
   call per word) and then sorted all 1,377 candidates to keep four. Now the
   index keeps each tool's non-zero-idf words as `[word, idf * weight]` plus a
   posting list per word; `relatedToolScores(surfaces, a)` scores `a`
   against every tool in one pass, adding each pair's terms in the order the
   pairwise loop added them (same floats), and the ranking keeps a sorted
   top-`limit` list instead of sorting everything. The order is total
   (positions are unique), so the top `limit` are the ones the full sort
   picked.

## Verification

- `diff -rq` of a full build before and after: only `version.json` differs
  (its `built_at` timestamp). Every page, sitemap, search index and footer
  link is byte-identical.
- `related-tools.test.mjs` gains a test that keeps the old ranking verbatim
  (pairwise scores, full sort) and compares it with the new one on a seeded
  150-tool catalogue spanning several category and sub-category tiers, at
  limits 1, 4 and 20, plus every pairwise score against
  `relatedToolScores`. The fixture asserts it has more than ten tools whose
  top five contain a tie, and changing the insertion's `<` to `<=` (ties
  broken the wrong way) turns it red.
- `node --test build.test.mjs embed.test.mjs related-tools.test.mjs
  custom-domain.test.mjs` after the change: 370 tests, 370 pass. Before it,
  all 120 Pages test files passed alone (the reading above).

## Numbers

| | before | after |
|---|---:|---|
| self time, mask (ms, profiled build) | 2,548 | 252 |
| self time, related tools (ms, profiled build) | 2,560 | 257 |
| build wall, warm cards, paired runs (s) | 48.0, 54.1, 59.3 | 46.3, 53.4, 54.6 |

About 4.6 s of CPU per build. Wall time in this container drifted by 11 s
across the six runs (disk), so the paired difference (0.7 to 4.7 s, mean
2.4 s) is the honest wall figure. A PR that reaches the Pages workflow runs
`buildSite` on the full tree at least four times (the test file's two, the
build job, and on main the deploy).

## Not changed, ranked for the next run

1. **Writes: 5.0 s of self time in `writeFileUtf8`** for 382 MB. 310 MB of
   it is `writing/`: `search.json` alone is 15.8 MB, `posts.json` 4.2 MB,
   `feed.xml` 3.7 MB, and 7,032 post and page files average 39 KB. Smaller
   output is a product question (what the search index and feed carry), not
   a speed one; check what a visitor downloads before trimming.
2. **Garbage collection, 3.6 s.** Unexamined; a heap profile of the build
   would say which pass allocates most.
3. **`custom-domain.test.mjs` (33 to 49 s)** is its own fixture build of
   posts and research (9,244 files); still the second-slowest file. Its
   profile matches the full build's: writes first.
4. **`<meta>` regex (0.9 s)** and the sponsor-link regex (0.4 s) in the
   chrome passes: small, unprofiled per caller.
