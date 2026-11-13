---
kind: note
topics: [process, landing]
date: 2026-11-13
---
# Orphan PRs: the queue no gate holds (process run, 2026-11-13)

- **Tool.** `python3 platform/ci/orphan_prs.py` (about 25 s, read-only) lists open same-repo PRs that change no CODEOWNERS path and whose head commit is older than land-your-work.md's stall thresholds (2 h ready, 24 h draft), stalest first, with check-run state on the head, an "already on main" note and a list of PRs whose body says they are open on purpose. It is the other half of `owner_held_prs.py`, which now prints a pointer to it.
- **Reading at 2026-11-13 ~05:30 UTC.** 98 open PRs: 56 held by the owner gate, **35 stalled with no gate**, 3 left open on purpose. Of the 35, 14 had green checks on the head, 16 red, 5 none. Ages ran from 12 h to 45 days; 13 were older than two weeks.
- **Landed this run.** PR #14596 (the site build's `DEFAULT_BASE_URL` moved to `https://marisstella.app/`), a draft idle 2.4 days with green checks. Cherry-picked onto today's main without conflict; `platform/pages` node suite 1,611 tests, 0 failures; `test_pages_state.py` + `test_run_workflow_locally.py` 260 passed. A local build with no flags still named github.io before it (polish friction 2026-11-13T00:45).
- **Next, for any run.** Work the green rows first: #14702 and #15105 (Pages perf), #14815 (ai-bookkeeper Form 2210), #15196 (quality round 53), #13053 (wall-framing cable holes), #12397 (front-matter check). Red rows older than two weeks are close-with-reason candidates once `supersede_check.py` or a rebase says the work is gone or stale.
- **Control plane, not done here.** `land-your-work.md` ("Other agents' unlanded work is yours too") could name the tool; that file is owner-gated, so the pointer lives in `owner_held_prs.py` for now.
