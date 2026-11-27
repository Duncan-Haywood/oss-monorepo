# Job Shop Quote worker tests: one isolate per worker, and two D1 100-parameter fixes (2026-11-27)

Perf track, version 0. No agent-workable `perf:` backlog item (P063, P064, P086 are owner rows).
Bet #2 (`ventures/jobshop-quote`) had the dependency pre-bundle earlier today
(`bet-worker-tests-perf-2026-11-27.md`) but not the bigger lever payapps took in its second pass
(`payapps-worker-tests-perf-2026-11-27.md`, PR #19715): `isolate: false`. That pass also found a
production bug, D1's 100-bound-parameter cap on an `IN (...)` list, so this run checked the same
class of read in jobshop-quote first.

## Reading (before, `origin/main` `fc74c0124`)

Cold (`rm -rf node_modules/.vite`) `pnpm test:worker` in a 4-core cloud container: **99.7 s** wall,
48 files, 292 tests (`Duration 97.20s (tests 53%, transform 39%, import 7%)`). Vitest's own hint:
"48 workers spawned · ~769ms startup each ... at least ~11.54s faster with isolate: false". As in
payapps, the hint undercounts: each fresh isolate also re-transforms and re-imports the Worker's
module graph on its first request.

## Change

1. `vitest.worker.config.ts`: `isolate: false`, with the same comment as payapps on what it asks
   of a test file (scope reads to the file's own ids, no global counts, any file order).
2. **Bug: `GET /api/admin/accounts?limit=200` answered 500 from about 100 orgs on.** The owner
   lookup bound every listed org id in one `IN (...)`; the route allows 200. The owner console
   would have stopped listing accounts at the hundredth shop. Now in slices of 90 ids
   (`allInChunks`); an org's memberships all sit in one slice, so "earliest owner" is unchanged.
3. **Bug: "Still good" on more than ~99 stale materials answered 500.** The rate card's
   confirm-prices request allows 500 ids and bound them all in one `IN (...)`. A shop with a large
   materials list that let prices age past its limit and clicked confirm on the lot got an error
   and nothing saved. Same chunking.
4. `src/worker/db/in-chunks.ts`: payapps' helper (`chunks`, `allInChunks`, `D1_IN_CHUNK = 90`),
   copied rather than shared, since the two apps are separate products with separate trees.
5. Regression tests: `admin.test.ts` inserts 120 owned orgs and checks every one is listed with its
   owner at `limit=200`; `material-prices.test.ts` confirms 120 materials at once.

The other `inArray` calls were checked and are capped below 100 by their schemas: routings per
line (`MAX_LINE_ROUTINGS` 20), repeat-part history RFQs (`MAX_PART_HISTORY` 10), LLM-extracted parts
per RFQ (50), senders of one quote, and the expiry/follow-up claims, which already slice.

## Verification

- With the two service changes stashed, the new tests fail (`too many SQL variables`, 500), and
  so do the two admin tests after them in the same file, since the database now holds more than
  100 orgs. With them, all pass.
- Cold `pnpm test:worker`: **19.5 s and 18.3 s**, 48 files, **294 passed** (292 plus the two
  regression tests). Before: 99.7 s. About 5x.
- `--sequence.shuffle.files`, seeds 1 to 6: 294 passed every time.
- `pnpm typecheck` clean; `biome ci` clean on the changed files. No test removed, skipped or
  weakened; include patterns unchanged.

## Not changed (ranked, for the next run)

1. **cmmc and seller-books worker pools** still use a fresh isolate per file
   (`cmmc-worker-tests-perf-2026-11-27.md` lists it as item 1). Same recipe: grep `inArray(` for
   lists that grow with the customer first, add a >100 regression test where one does, then
   `isolate: false` and six shuffled seeds.
2. **jobshop-quote `test:unit`**: Vitest's hint for `isolate: false` there too; React component
   files share happy-dom state, so it needs the same shuffled proof.
3. `in-chunks.ts` now exists in payapps and here. If a third product needs it, a shared package
   beats a third copy; two copies are cheaper than a cross-venture dependency today.
