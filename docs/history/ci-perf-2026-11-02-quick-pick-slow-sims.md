# quick-pick-survey CI: minutes-long simulations out of the default gate (2026-11-02)

**Reading.** `python3 platform/ci/ci_profile.py --runs 200 --top 15`: the
quick-pick-survey CI `Test` step was 20.4 job-minutes over 3 jobs (about 6.8
min each), the largest consumer after Pages and Portfolio validate.

**Profile.** `npx vitest run --reporter=verbose` locally: 8m20s wall. The
slowest listed case was `poolCap.simulation.test.ts` "500 items, 2000 answers"
at 165 s; `hybridDip.simulation` took 23 s. The file's other cases carry
timeouts of 30 to 60 minutes by design: they are measurement experiments for
`docs/INFORMATION-GAIN-SELECTOR.md`. A second run to get per-file timings hit
my 15-minute limit and was killed, so per-file numbers for the other
simulation files were not taken.

**Change.** `poolCap.simulation.test.ts` is excluded from `npm test` unless
`QPS_SLOW=1`; `npm run test:slow` runs it. CI runs it on pushes to main and on
PRs whose diff touches `src/lib/`, `vitest.config*` or `package-lock.json`
(it imports only `src/lib`, so other changes cannot alter its result).
Nothing was deleted or weakened.

**After.** Not measured here: the next CI profile of the workflow is the
check. Expected: `Test` step drops by roughly the poolCap file's share on
PRs outside `src/lib`.

**Not changed (ranked).** Other `*.simulation.test.ts` files (no per-file
timing yet; take it with `--reporter=json`, in the background, 20+ min
timeout); Portfolio Pages "Test the site builder" (53 min, worked on in
earlier passes).
