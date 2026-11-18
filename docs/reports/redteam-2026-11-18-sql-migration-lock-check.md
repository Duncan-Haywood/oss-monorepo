---
kind: note
topics: [redteam]
date: 2026-11-18
tagged: auto
---
# Red team 2026-11-18: ventures/sql-migration-lock-check

- Targets: `sql.mjs` and `engine.mjs`, suite `node --test` in the venture
  (0.2 s). Campaigns: 2 x 10 mutants. Caught 13/20 before, 17/20 after four
  gap tests; the remaining 3 are equivalent (loop bounds that only read
  `text[n]` as `undefined`, which `join` drops or which no caller reaches).
- Real defect (patched): transaction-block tracking. `ROLLBACK TO SAVEPOINT`
  closed the block (missed `create-index-concurrently-in-tx` and
  `validate-in-same-transaction`), `ABORT` was unknown, `BEGIN` nested, and
  `COMMIT AND CHAIN` closed the block. Now one `transactionEffect()` in
  `sql.mjs`, used by both the splitter and the engine.
- Open list (`redteam.py open`, 11 entries): all still reproduce and all are
  control-plane edits (workflows, `prompts/redteam.py`,
  `control_plane_guard.py`), so not touched here.
- Guard idea not done: running `check.mjs --fail-on-risk` over new
  `ventures/*/prisma/migrations/**` in CI. It would not start green on the
  five existing quick-pick-survey migrations (one plain `CREATE INDEX`, two
  `ADD COLUMN` with no `lock_timeout`), and those are applied, so it would
  need to check only migrations added in the diff. It needs a workflow
  step (control plane, own PR).
