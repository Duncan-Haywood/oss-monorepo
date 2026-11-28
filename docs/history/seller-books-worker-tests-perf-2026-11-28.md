# Seller Books worker tests: one isolate per worker, and three D1 100-parameter fixes (2026-11-28)

Perf track, version 0. No agent-workable `perf:` backlog item (P063, P064, P086 are owner rows).
Item 1 of the "not changed" list in `jobshop-quote-worker-tests-perf-2026-11-27.md`: the cmmc and
seller-books worker pools still used a fresh isolate per file. Seller Books is bet #5
(`ventures/seller-books`). Same recipe as payapps (PR #19715) and jobshop-quote (PR #19837): grep
`inArray(` for lists that grow with the customer first, then `isolate: false` and six shuffled seeds.

## Reading (before, `origin/main` `1576f7b8d`)

Cold (`rm -rf node_modules/.vite`) `pnpm test:worker` in a 4-core cloud container: **28.6 s**
Vitest duration, **30.2 s** wall, 32 files (33 with the new one), 165 tests. Vitest's own hint: "32
workers spawned · ~548ms startup each ... at least ~5.30s faster with isolate: false". As in the
other two products, the hint undercounts, because each fresh isolate also re-transforms and
re-imports the Worker's module graph.

## The bugs (found by the `inArray` sweep, before touching the config)

D1 binds at most 100 parameters per statement. Three reads bound a list that grows with the seller:

| Read | What the customer saw |
| --- | --- |
| `routes/org/sales.ts` `GET /sales`: fees of every listed sale in one `IN (...)` | **The Sales page asks for `limit=500`, so for any seller with 99 or more sales it answered 500.** That is most of the target market: a reseller with a few months of eBay history. |
| `services/admin/metrics.ts` owner lookup | `GET /api/admin/accounts?limit=200` answered 500 from about 100 accounts on (same bug as payapps and jobshop-quote) |
| `services/importers/inventory-store.ts` link step | a sourcing sheet whose SKU matched one order line selling 99+ units (a wholesale lot) failed the whole import |

The `/sales` page's order lookup by `orderId` (`returned-items`) got the same treatment, since it is
one line each. Every other `inArray` in `src/` already sliced at 50 or used a short fixed list.

Fixes: `src/worker/db/in-chunks.ts` (the payapps/jobshop helper: `chunks`, `allInChunks`, slices of
90) and one call each. Each caller groups per sale or per org, and an id sits in exactly one slice,
so the rows are those one statement would give.

## Change to the suite

`vitest.worker.config.ts`: `isolate: false`, with the same comment as the other two products on
what it asks of a test file. `test/worker/setup.ts` comment: the schema is applied once per worker
now (the existing "table exists, skip" check already handled it).

## Verification

- Regression tests: `test/worker/many-sales.test.ts` (150 sales with one fee each, listed at
  `limit=500`; a sheet linking a 120-unit order line) and a 120-org case in `admin.test.ts`. With the
  service changes stashed, all three fail (`500`, and the D1 `Failed query ... in (?, ?, ...)` error);
  with them, they pass.
- Cold `pnpm test:worker`: **6.5 s and 8.75 s** Vitest duration (8.1 s and 10.6 s wall), 33 files,
  **168 passed** (165 plus the three). Before: 28.6 s (30.2 s wall). About 3.5x.
- `--sequence.shuffle.files`, seeds 1 to 6: 168 passed every time.
- `pnpm typecheck` clean; `biome ci .` clean (4 warnings, all there before). No test removed,
  skipped or weakened; include patterns unchanged.

## Not changed (ranked, for the next run)

1. **cmmc worker pool**, the last of the four bets on a fresh isolate per file. Same recipe; read
   its `inArray` calls first.
2. **`in-chunks.ts` now has three copies** (payapps, jobshop-quote, seller-books). The jobshop note
   said a third copy should become a shared package; it did not here because the three products are
   separate pnpm workspaces with no shared package between them, and a cross-workspace dependency
   would tie three deploys together for 30 lines. If a shared `packages/` across ventures appears,
   move it there.
3. **Other list routes with `limit` up to 500** (`pageQuery`): they read one table each and bind
   no id list today. A future change that joins per-row details onto a page should use
   `allInChunks`.
4. Seller Books `test:unit` and `typecheck`: not timed this run.
