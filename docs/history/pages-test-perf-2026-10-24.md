# Pages test job: stop redrawing the same share cards (2026-10-24)

Backlog item P050. Follows `ci-perf-2026-10-24.md`, whose reading put the
Portfolio Pages workflow at 230.7 of 750 job-minutes in an 80-minute window,
with "Test the site builder" its heaviest step (122.2 minutes over 75 jobs).
The same day the owner asked for the clone-only-what's-needed and
run-only-relevant-jobs work (P048, P049) and a standing share of runs for
performance work (`prompts/perf/prompt-0.md`, E84 in `prompts/experiments.md`).

## Where the test job's time went

`node --test "*.test.mjs"` runs test files in parallel and the tests inside
one file in order, so the slowest file sets the job's length.
`build.test.mjs` alone took **460s** wall time on the cloud container
(4 cores). The slowest tests in the full suite were all site builds:

| Test | file | s |
|---|---|---|
| first caller of the shared build | build.test.mjs | 115.6 |
| the worker can be withdrawn (kill-switch build) | build.test.mjs | 80.1 |
| an identical build produces an identical cache name | build.test.mjs | 75.4 |
| a custom-domain build leaves no reference to the default origin | custom-domain.test.mjs | 65.6 |
| /compare/ fixture build | build.test.mjs | 31.1 |
| /guides/ fixture build | build.test.mjs | 30.8 |

The two fixture builds publish only two tools and still take 31s, so most
of a build's cost does not depend on the tools. Phase timestamps in a
throwaway copy of `build.mjs`, on a two-tool fixture (36.9s total):

| Phase | start (s) |
|---|---|
| `addSiteChrome` | 5.9 |
| `markSponsorLinksIn` | 5.9 |
| `addShareCards` | 6.7 |
| `addOfflineSupport` | 34.1 |

`addShareCards` took 27.4s: it draws a 1200x630 PNG for every research and
writing page (about 1,228, present in every build) on a pool of worker
threads. `renderCard` costs 62.7 ms per card on one thread. A CPU profile of
the same run was 71% idle on the main thread, which is the workers drawing.
A full build draws 2,563 cards (133 MB). `build.test.mjs` builds five times
in one process, so it drew the same 2,563 cards up to five times.

## The change

`renderCards` (`platform/pages/share.mjs`) keeps the PNG bytes of every card
it has drawn in this process, keyed by the card's options, and writes a
repeat card from memory instead of drawing it again. The drawing code cannot
change inside one process, so the key needs nothing else. A single build,
such as the deploy, never repeats a card, so it does exactly what it did.

`share.test.mjs` gains two tests: a card is the same bytes every time it is
drawn (what the identical-build test used to prove for cards), and a reused
card is byte for byte a fresh draw.

**What landed.** PR #10208 (merged 2026-10-24) shipped this in-process cache in
`share.mjs`, together with an optional disk cache (`PAGES_CARD_CACHE`)
keyed by the options plus every file a card's pixels depend on, so the
deploy can also reuse cards from the previous build. The numbers below
are for the in-process part alone, measured on 2026-10-24.

## Verification

| Check | Result |
|---|---|
| `node build.mjs` before and after, `diff -rq` | identical, 15,367 files |
| `node build.mjs` wall time | 87s before, 93s after (one sample each; no change expected) |
| `node --test build.test.mjs` wall time | **460s → 325s** (−29%), 304 of 304 pass |
| `node --test share.test.mjs` | 18 of 18 pass |

Read the CI step "Test the site builder" after a day of merges to confirm.

## Two hazards found on the way

- **A commit during a test run fails the identical-build test.** The build
  reads git history (`engineering.mjs`, `updates.mjs`), so a commit between
  the suite's two builds changes the engineering page and the cache name.
  CI never commits mid-run. A local session that commits while
  `node --test` runs will see this failure, and it is not a real one.
- **`main` broke the build four times on 2026-10-24**, each from a content
  file a check rejects: a README link check, two over-long descriptions, a
  research project with no programme. This run did not check whether the
  check that would have caught each one ran on its PR; P049 covers trigger
  coverage.

## Not changed, ranked

1. **The kill-switch build** (80s) builds the whole site to read one file,
   `sw.js`. With cards cached it is cheaper now, but rendering the withdrawn
   worker directly, or running `addOfflineSupport` with `disableWorker` on a
   copy of the shared build (as "changing the worker itself" already does),
   would remove a build.
2. **The /compare/ and /guides/ fixture builds** draw the ~1,228 research and
   writing cards every real build has. They could pass a research and
   writing root that is empty, if `buildSite` took one.
3. **`custom-domain.test.mjs`** builds in its own process, so it gets no
   cache hits. It runs in parallel with `build.test.mjs`, so it is not on
   the critical path today.
4. **P048 and P049** (checkout share 40%, 15 jobs per PR head) are the
   pool-wide items, and are larger than this one.
