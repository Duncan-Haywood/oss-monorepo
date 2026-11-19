# platform/fuzz: repair fuzzer for file-check ventures

`repair.mjs` damages each venture's sample files with seeded random edits (deletes, inserted separators
and markers, duplicated or overwritten spans) and checks three properties on every mutant: `validate()`
does not throw, `repair()` does not throw, and repairing twice gives the same text as repairing once.

- **Used by:** about 50 ventures, each through a three-line `repair-fuzz.test.mjs` that asserts
  `checkRepair(calc)` returns `[]`.
- **Sweep:** `node platform/fuzz/repair.mjs [--n 1500] [--seed N] [slug ...]` (exit 1 on any failure,
  2 on a bad `--n` or `--seed`).
- **Its own tests:** `node --test platform/fuzz/repair.selftest.mjs` (planted modules with known faults, the
  generator's reach, the CLI's argument checks). They are named `.selftest.mjs` because
  `platform/ci/checklist_coverage.py` fails any `*.test.mjs` directory the merge checklist does not list,
  and that checklist (`.github/prompts/verify-and-merge.md`) needs the owner's approval to change; no CI job
  runs them yet.

Limits: a pass means no failure among the mutants drawn, not that none exist; there is no input minimiser
beyond keeping the shortest failing input per message; the slow-repair check uses the wall clock, so it
can vary with the machine. `ventures-tests.yml` triggers on `ventures/**` only, so a change here is not
re-checked against the 50 guards in CI unless a venture also changes (run them locally:
`node --test ventures/*/repair-fuzz.test.mjs`). Audit: [`2026-11-19-fuzz.json`](../../portfolio/quality/audits/2026-11-19-fuzz.json).
