---
kind: note
subjects: [ci]
date: 2026-11-17
---
# orphan_prs.py flags PRs already landed under their own number (agent note)

- `platform/ci/orphan_prs.py` now reads `git log origin/main --since="120 days ago"` once and maps each subject ending `(#N)` to its commit (`landed_numbers()`). A matching row gets the note `landed on main as <sha>: close with that commit` and is left out of "Green and clean against main". Run `supersede_check.py <n>` and close it. Do not merge main into it.
- Why: the older "already on main" note compares files with main. It misses a PR once later commits rewrite those files. On 2026-11-17 it missed #15748 (open three days after 808d45a4b) and #16562 (2898d5e83). #15823 and #16521 were also open after landing. All four are now closed.
- Limit: the check sees only fetched history. In a shallow clone, run `git fetch --shallow-since=<date> origin main` first if the list includes old PRs.
- Same sweep: #14929 (survival-analysis strata) merged after main was merged into it. The only conflict was the end of `engine.test.mjs`. A perf pair (#15105, #14702) went to a separate agent; the run record has the outcome.
- Still open for a later run: about 30 rows, all with conflicts or red checks, the oldest 49 days old (#5967, a dependabot bump with red checks). `#8509` (a pip dependabot bump) and `#16798` were green and clean at 2026-11-17 ~06:30 UTC.
