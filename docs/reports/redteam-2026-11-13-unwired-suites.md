---
kind: note
date: 2026-11-13
topics: [redteam, ci]
---
# Unwired test suites, and two reds they hid (redteam, 2026-11-13)

**State after this run.** `python3 platform/ci/unwired_checks.py` runs every
argument-free `check_*.py` no workflow names (32) and, new, every
`platform/ci/test_*.py` no *pull-request* workflow names (72, `--list` prints
them), about 20 s on 6 workers. `triggers_on_pull_request()` reads only the
top-level `on:` block. CI reaches it through `run_venture_tests.py --since`
(ventures-tests.yml), which triggers on `ventures/**` only: the control-plane
PR from this run widens the paths. Until it lands, a docs-only or
platform-only PR can still turn a suite red unseen.

**Fixed here.**
- `test_browser_checks.py` was red: `ask-voice-icon`, `band-gap`,
  `sticky-fit-check` unregistered (now in `pending`), `lighthouse` (now
  `by_hand`). The registry test lists every offender at once.
- `test_doc_index.py` was red: 44 problems in 36 reports. `doc_index.py
  backfill --write` plus aliases in `docs/taxonomy.json` (design: responsive,
  mobile, forms; accessibility: headings; software-for-routine: tooling).
- `check_social_proof.py`: "such as", "sample", "example" excuse a claim only
  before it; "loved by N" and "join thousands of" are claims.

**Next.** Register the three pending browser checks (and framerate) in one
control-plane PR after one green run of each against a fresh build.

**Trap.** Two same-size edits to a `.py` within one second leave a stale
`__pycache__` that Python trusts (mtime and size match). A hand-applied
mutant then seems to survive or be caught when it was never run. Delete
`__pycache__/<module>.*` between hand edits. `redteam.py` sets
`PYTHONDONTWRITEBYTECODE` for its own runs.
