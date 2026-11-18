---
kind: note
date: 2026-11-15
topics: [redteam, ci]
---
# usage.mjs escapes are a measurement artefact (redteam, 2026-11-15)

**State after this run.** `prompts/redteam.py` still measures a
`ventures/<v>/usage.mjs` target with that venture's `node --test` suite only.
CI also runs `platform/ci/usage_contract.mjs` over every copy (portfolio-validate,
via `check_storage_guard.py`), so a mutant the contract rejects never reaches
`main` unnoticed, yet the campaign records it as escaped. A ready fix with a
failing-first test is in
[`patches/2026-11-15-redteam-usage-contract.patch`](patches/2026-11-15-redteam-usage-contract.patch)
(`git apply` it from the repository root). It is control plane (`/prompts/`),
so it goes in its own PR and waits for owner approval; this session could push
only its own branch. It is listed as an open defect in
`prompts/runs/2026-11-15-session_01XpHqydnZiv8HySGxMCUFqT.json`, so step 0 of
the next red-team run starts on it.

## What the patch does

For a `ventures/<v>/usage.mjs` target, and only when
`platform/ci/usage_contract.mjs` exists, `suite_for` returns
`sh -c "node --test 'ventures/<v>/**/*.test.mjs' && node platform/ci/usage_contract.mjs ventures"`.
The contract over all 1,331 copies takes about 1.3 s. Every other target is
unchanged. `python3 -m unittest test_redteam` (in `prompts/`) passes with it, 16 tests.

## Evidence

- Across 18 earlier records, campaigns on a `usage.mjs` copy seeded 152
  mutants and 43 escaped (28%), against 30% for every target together. The
  usage copies are 1,331 of the 5,576 guarded files (24%), so about one
  random draw in four lands on this template.
- Same target and seed, before and after the patch:
  `ventures/1099-vendor-csv-checker/usage.mjs`, `--mutants 12 --seed 11`:
  8 of 12 caught with the current tool, 12 of 12 with the patch.
- This run's three escapes on `ventures/mortgage-points-break-even-calculator/usage.mjs`
  (`return false` to `true` in the blocked-store branch of `usageOptedOut()`,
  and `||`/`&&` swaps in both stored-shape checks) were each rejected by the
  contract when run on a scratch copy.

## Why not keep adding per-copy tests

Runs on 2026-11-11, 2026-11-14 and twice on 2026-11-15 each added two or three
tests to one copy's `usage.test.mjs`. There are 1,278 such suites; the contract
already runs them all in CI. Per-copy tests help the copy's own suite stand
alone, but they do not change what CI catches. After the patch lands, an
escaped `usage.mjs` mutant means the contract itself has a hole, and the fix
belongs in `usage_contract.mjs`, not in one copy.
