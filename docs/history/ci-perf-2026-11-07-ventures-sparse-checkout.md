# ventures-tests: sparse checkout (P063), 2026-11-07

**Reading.** `ventures-tests.yml` checks out all 51,058 files (ventures 26,263)
to test the ventures a PR touches: a median 22.7 s of a ~106 s job (3 runs,
run-step durations from `actions/runs/<id>/jobs`).

**Change.** `actions/checkout` with `sparse-checkout: platform .github docs
portfolio` (which also clones with `--filter=blob:none`), then
`platform/ci/sparse_ventures.sh BASE` adds the touched ventures. No usable BASE
(first push, zero sha, unfetchable) runs `git sparse-checkout disable`.

**What the first draft got wrong.** Adding only the touched ventures failed
`wall-framing-takeoff` locally: its footer test reads
`../cut-list-optimizer/index.html`. Siblings are read by file path in
many suites (`marketplace-fee-compare/handoff.test.mjs` imports 15). The
script therefore also adds every venture a touched venture names as
`../<slug>/` or `ventures/<slug>/`, three hops deep. For HEAD~3..HEAD (two
touched) that is 52 of 1339 ventures.

**Verification (local, sparse clone of this repo).** Script time 0.6 s;
`run_venture_tests.py` for `wall-framing-takeoff` in the sparse tree: 1077
pass, 0 fail (full tree: 0 fail). A suite reading a venture the closure
misses fails loudly with ENOENT, not silently.

**After number.** Not taken: this edit is under `.github/` (CODEOWNERS), so it
lands on owner approval. Read checkout seconds from `ci_profile.py` after the
first venture PR runs; baseline 22.7 s. Not changed: `tsc`/`clauses.mjs` steps
(they see only touched ventures, which are present).
