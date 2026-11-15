# run_workflow_locally, 2026-11-15: portfolio-pages can reach a verdict here

Process track, Critique mode (the backlog held only owner rows). Lens: the
doc-friction cluster on `platform/ci/run_workflow_locally.py`. Seven run
records from 2026-11-14 23:39 to 2026-11-15 04:07 (`prompts/runs/*.json`,
after the 2026-11-14 card-cache fix) still said `--for-changes` on a post,
research or venture diff ended NO VERDICT for portfolio-pages.yml, and a
re-run by name cost another ~10 minutes for the same result.

## What was actually wrong: two things, not one

Measured in this 4-core container with
`python3 platform/ci/run_workflow_locally.py --foreground portfolio-pages.yml`:

| run | Build the site | Check the built artifact | Test the site builder | exit |
|---|---|---|---|---|
| before, cold share-card cache, no budget | skipped (`${{ }}` in env) | UNRUN (no dist/) | 368.6 s | **4, no verdict** |
| after, warm cache, no budget | ok, 118.8 s | ok, 24.1 s | 121.8 s | **0**, 12/12 steps passed, 4 m 37 s |

1. **No budget could have helped.** `Build the site` reads
   `${{ github.event_name != 'pull_request' && '1' || '' }}` and
   `${{ needs.gate.outputs.base }}` in `env:`, so it was skipped, and
   `Check the built artifact` then failed for want of `dist/` and was marked
   UNRUN (after-skip). Every local portfolio-pages run therefore ended exit 4
   however long it was given. The 2026-11-14 note's "Re-run by name to get a
   verdict" could not work.
2. **The budget was per workflow.** Cold, the site-builder suite alone takes
   369 s against a 300 s budget, while the other workflows a post diff
   selects finish in seconds and their unused time was thrown away.

## Changes

- `local_context` answers `github.event_name` as `pull_request` (a local run
  already models a pull request: `if:` conditions false on one are skipped),
  evaluates the `github.event_name ==/!= 'x' && 'a' || 'b'` form on it, and
  answers `needs.gate.outputs.base` with `https://marisstella.app/`, the
  gate's real output with Cloudflare configured and build.mjs's
  `DEFAULT_BASE_URL` (a test pins the two together). Other `needs.*` and
  `inputs.*` expressions keep the skip.
- `_run_selected` runs workflows cheapest-declared first (summed
  `timeout-minutes`) and pools the budget (`pooled_budget`): each workflow
  gets what the earlier ones left, less a full share for each later one, and
  never less than before. The sweep's worst case (n x 300 s) is unchanged.

- Found by the end-to-end sweep: every diff selects agent-cross-review.yml,
  whose one runnable step reads `github.event.pull_request.number` and always
  skips. `report()` called that "nothing executed" a failure, so every
  `--for-changes` sweep exited 1 with nothing failed (three run records on
  2026-11-14 noted it in passing). It now returns `NOTHING_RAN`, which a
  sweep counts as no verdict (exit 5) and a by-name run still maps to 1.

Sweep on this branch before that third fix (`--for-changes`, 8 workflows):
portfolio-validate 100/100 run steps passed with a 2,082 s pooled budget,
portfolio-pages 12/12 with 2,184 s, and the only red was agent-cross-review's
"nothing executed".

## What is still open

A cold first run in a new container still costs ~370 s for the suite plus
~110 s for the build. A docs/posts-only diff selects six workflows
(agent-cross-review, conflict-markers, control-plane-guard, doc-refs,
portfolio-validate, portfolio-pages, in that order now), so portfolio-pages
runs last with whatever of the 1,800 s pool is left. A diff that selects
portfolio-pages alone keeps one 300 s budget and still needs the by-name
re-run the sweep prints, which now does give a verdict. Next run reading
this: search `prompts/runs/` doc_friction after 2026-11-15 for
"portfolio-pages" with "NO VERDICT" to see whether the pool is enough.
