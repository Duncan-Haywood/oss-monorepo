# Branch cleanup: sparse checkout (2026-11-06)

## Reading

`ci_profile.py --runs 600 --top 25` (2026-11-06 09:57 to 12:03 UTC): 500.5
job-minutes, checkout 147.6 (29%). Branch cleanup: 18 jobs, 9.0 job-minutes,
median 29 s, checkout 78% of it. The only work is one stdlib-only script.

## Change

Both jobs in `branch-cleanup.yml` check out with `filter: blob:none` and
`sparse-checkout: platform/ci` (cone mode, so root files come too). Same
technique as `ci-perf-2026-11-03-prompts-sparse.md`.

## Verification

`branch_cleanup.py` imports only the standard library and reads no repo
files. A local sparse clone of this branch's tree ran `branch_cleanup.py
--help` fine and the workflow still parses as YAML. The blob filter is
ignored by a file:// remote, so the checkout-time gain is not measured here;
read it from the next `ci_profile.py` run (expect the 78% share to fall).

## Not changed (ranked)

1. "Test the site builder" (69.9 job-minutes): see
   `pages-test-perf-2026-11-06-reading-top-two-tests.md`; needs a real CI
   share-card cache hit reading first.
2. Portfolio validate (90 min): Privacy checker tests are 12 s locally, so
   not the lever; checkout share (21%) is.
3. Page integrity, Sibling links, agent-permission-harness: checkout 45 to 74%.
