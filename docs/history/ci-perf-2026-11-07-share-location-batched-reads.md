# Share-location guard: batched reads and a text prefilter (2026-11-07)

**Reading.** `ci_profile.py --runs 600 --top 25`: "Portfolio validate" is the
second-largest workflow (63.6 job-minutes); "Privacy checker unit tests" its
heaviest step. Per file, `share-location.test.mjs` was the slowest of the six
suites (7.0 s).

**Profile.** `node --cpu-prof` over `checkVentures(ventures/)`: the walk is
204 ms; the other ~2.7 s is mostly idle (7 911 sequential `await readFile`),
plus 383 ms in the `URL_CONTEXT` regex and 78 ms in the `.search` regex.

**Change** (`platform/privacy/share-location.mjs`): read files in batches of
64 with `Promise.all` (findings keep sorted file order), and skip the
per-line pass when the text has neither `?` nor `.search` (every write
pattern needs one; `searchParams` contains `.search`).

**Verification.** `checkVentures` JSON output byte-identical before and after
(`cmp`; 7 911 files, 0 findings). 2 881 ms -> 2 216 ms; `node --test
platform/privacy/share-location.test.mjs` 7.0 s -> 5.5 s, 18/18 pass (single
local runs, one machine).

**Not changed, ranked.** 1. Portfolio Pages "Test the site builder" (59
job-minutes of 362) stays the largest consumer; see the 2026-11-06 notes.
2. P063 (sparse checkout in ventures-tests.yml) is waiting on the owner,
since the file is under CODEOWNERS. 3. one-opt-out (5.0 s) and
optout-persistence (3.0 s) are the next privacy suites to profile.
