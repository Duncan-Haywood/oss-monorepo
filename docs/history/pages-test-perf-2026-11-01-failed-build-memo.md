# Pages tests: a failed site build was retried by every test (2026-11-01)

**Reading.** `ci_profile.py --runs 200`: "Test the site builder" is the
heaviest step in the pool (27.3 of 174 job-minutes). With a post on `main`
whose description was 164 characters (limit 160), `buildSite` threw, and
`build.test.mjs` cached the *result* (`built = await buildSite(...)`), so
every one of the ~159 tests that call `site()` re-ran the build and failed
again after about 13 s each (first one 42 s): the log showed one `✖` line per
test, all with the same cause, roughly 35 minutes of one runner.

**Change.** `site()` now memoises the promise, so the first rejection is shared.

**Measure** (same machine, 4 cores, bad post injected then removed):
- before: 159 failed tests x ~13 s each (read off the spec log, run killed at
  about 3 min, projected ~35 min);
- after: `node --test build.test.mjs` with the injected bad post, 19.4 s wall,
  146 pass / 159 fail (the failures are the real signal and still fail);
- good tree, after: 305/305 pass in 330 s (unchanged path; the build is
  built once either way, so the passing case is not faster).

**Not changed, ranked.** 1. The 330 s passing run is dominated by the one
~10 s build plus per-test DOM work; a profile of the other 300 tests is next.
2. A pre-flight `loadPosts()` check as a first test would name the cause in
one line instead of 159.
