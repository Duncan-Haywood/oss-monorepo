# Seller Books and CMMC worker tests: one isolate per worker (2026-11-28)

Perf track, version 0. No agent-workable `perf:` backlog item (P063, P064,
P086 are owner rows). Pool reading first (`python3 platform/ci/ci_profile.py
--runs 600 --top 25`, 2026-11-27 23:17Z to 2026-11-28 00:06Z): 724 jobs,
1,125.9 job-minutes, checkout 340.9. The top consumers (CodeQL, Security
gate, CI policy, Conflict markers) are `priv-*` workflows, owner-gated; the
Pages suite has had ten passes. Among the bets' own CI, `seller-books CI` and
`jobshop-quote CI` spend most of their time in `pnpm test:worker`.

PayApps (bet #1) and jobshop-quote (bet #2) already run their worker suites
with `isolate: false` (`payapps-worker-tests-perf-2026-11-27.md`, "Second
pass"). Seller Books (bet #5) and CMMC (bet #4) did not; CMMC's own write-up
(`cmmc-worker-tests-perf-2026-11-27.md`) ranked it first in "Not changed".

## Reading

4-core cloud container, `pnpm install --frozen-lockfile`, then cold
(`rm -rf node_modules/.vite`) `time pnpm test:worker` in the app directory,
nothing else running.

| suite | before (wall / Vitest) | after (wall / Vitest) | files | tests |
|---|---:|---:|---:|---:|
| seller-books | 35.0 s / 32.75 s | 10.1 s / 8.10 s (11.5 s / 9.59 s before the regression test was added) | 32 | 165 -> 166 |
| cmmc | 54.0 s / 51.82 s | 17.0 s / 15.00 s | 24 | 164 -> 165 |

About 3x on both (after columns include the new regression test). Before, Vitest printed "~665 ms startup each" (seller-books)
and "~711 ms" (cmmc) per file and estimated "at least ~6.4 s / ~5.0 s faster
with isolate: false"; the real saving is larger because each fresh isolate
also re-imports the Worker's module graph on its first request.

## Change

1. `vitest.worker.config.ts` in both apps: `isolate: false`, with the same
   comment PayApps carries on what it asks of a test file (scope reads to the
   file's own ids, no global counts, any file order).
2. **A production bug, the same one PayApps had.** `accountList` in
   `src/worker/services/admin/metrics.ts` looked up org owners with one
   `IN (...)` binding every listed org id. D1 refuses more than 100 bound
   parameters a statement and the route allows `limit` up to 200, so
   **`GET /api/admin/accounts` returned 500 from about 100 orgs on** in both
   apps. PayApps fixed it on 2026-11-27 and jobshop-quote has its own
   `allInChunks`; the fix had not reached CMMC or Seller Books. Ported
   PayApps' chunked lookup (90 ids a statement). An org's memberships all
   land in one chunk, so "earliest owner" is unchanged.
3. `test/worker/admin.test.ts` in both apps: a regression test with 120 orgs
   and `limit=200`. On the old code it fails with the 500 (CMMC: 2 failures
   in `admin.test.ts`, the new test and the webhook-metrics test that lists
   the same page); on the new it passes.

## Verification

- Default order, cold: all files pass, counts in the table.
- `--sequence.shuffle.files --sequence.seed=1..6`: every seed passes in
  both suites (seller-books 166/166, cmmc 165/165; seller-books also 165/165
  before the regression test existed).
- Old-code check: with `metrics.ts` restored from `origin/main`, `admin.test.ts`
  fails 2 of 8 in each app with `500 internal_error`; with the fix, 8 of 8 pass.
- `biome ci .` and `pnpm typecheck` in both workspaces.
- No test removed, skipped or weakened; include patterns unchanged. The
  Worker build (`vite.config.ts`) is untouched.

## Not changed (ranked, for the next run)

1. **The same chunking audit for other `inArray` calls** on user-sized lists
   in the bet Workers (`grep -rn "inArray(" ventures/*/apps/*/src/worker`). The
   admin one was found by a test; any list a customer can grow past 100 has
   the same ceiling.
2. **`pnpm typecheck`** is now longer than the worker suite in both apps.
3. **`exportSchemaSql()`** spawns `drizzle-kit export` per config load
   (1 to 2 s); small, and it guarantees the schema matches.
4. Shared template code drifts between the bet apps (this fix sat in one app
   for a day). A shared package or a sync check would stop the next one.
