# Checklist misses platform/ci/*.test.mjs (coverage red on every PR)

Found 2026-11-16 by the chant-forge run (PR 16737). PR 16739 added `*.test.mjs` files under `platform/ci/`
without the matching line in the merge checklist, so `platform/ci/checklist_coverage.py` (the `coverage` job and
one `validate` job) fails on `main` and on every PR that merges `main` in:

    platform/ci/  ->  add: node --test platform/ci/*.test.mjs

Fix: add that line to the checklist in `.github/prompts/verify-and-merge.md` (and wherever CLAUDE.md's checklist
test reads it). The fix is under `.github/` (CODEOWNERS, control plane), so it needs its own small PR and the owner's approval.
