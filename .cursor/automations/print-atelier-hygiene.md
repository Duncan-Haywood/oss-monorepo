# Print Atelier — Hygiene Automation (optional parallel)

Lightweight pass (optional; schedule at `15,45 * * * *`). Run **only** if `node scripts/orchestrator-gate.mjs` exits 0 (active campaign).

## Step 0 — Gate

Run `node scripts/orchestrator-gate.mjs --status`. If not allowed, append skip line to `docs/PROGRESS.md` and **stop**.

## Hygiene only

1. `git fetch --all --prune`
2. Merge/cherry-pick valuable `origin/cursor/*` branches (ahead > 0)
3. Close PRs superseded by `main`
4. Delete remote branches 0 ahead / 10+ behind `main`
5. `npm ci && npm run build` on `main` — fix if broken
6. Log actions in `docs/PROGRESS.md`
7. Open PR only if fixes were needed; otherwise merge directly if trivial

Do **not** invent features in this automation — leave product work to the main orchestrator.
