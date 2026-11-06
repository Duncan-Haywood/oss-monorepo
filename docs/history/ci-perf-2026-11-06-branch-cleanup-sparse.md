# Branch cleanup: sparse checkout of the one script it runs (2026-11-06)

**Reading.** `ci_profile.py --runs 600` (09:20 to 11:00 UTC): Branch cleanup
was 18 jobs, 9.0 job-minutes, median 30 s, checkout 78% of the time. Every
merged PR starts an on-close job and a sweep runs every 6 hours; each cloned
the whole tree to run one file.

**Cause.** `platform/ci/branch_cleanup.py` imports only the standard library
and opens no repo file (grep for `open(`, `Path(`, `__file__`: only the API
`urlopen`), but both jobs used a full checkout.

**Change.** Both jobs use `filter: blob:none` plus a non-cone sparse checkout
of that single path (same pattern as `conflict-markers-ci.yml`).

**Verification.** The workflow parses as YAML; the script's file reads were
checked as above. Not timed on a runner from the cloud container: the expected
saving is most of the ~23 s checkout per job (about 7 of 9 job-minutes per 100
minutes of pool time). Check the next `ci_profile.py` reading. This touches
`.github/`, so it waits for the owner's approval (CODEOWNERS).

**Not changed, ranked.** Portfolio Pages site-builder tests (67 min of 205,
already worked many times, see pages-test-perf notes); Portfolio validate
checkout share (22%); Conflict markers (76% checkout, already sparse).
