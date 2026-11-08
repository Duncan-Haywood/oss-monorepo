# Shed Designer gallery search: bbox and clash checks as plain loops (2026-11-06)

**Reading.** On main, the Pages `build` job spends 40 s in "Search the Shed
Designer gallery" (run 42275568724: 18:59:53 to 19:00:33), the largest step
before the site build itself (67 s). The `.gallery-stamp` skip never hits in
CI because the checkout is fresh. Also answered from the same run: the
`share-cards-*` cache restore took 3 s and "Save the share cards" was skipped,
so main gets a cache hit (the open item from the last two docs).

**Profile** (`node --cpu-prof`, self time, `make-gallery.mjs`, 4 vCPU): `bbox`
(integrity.mjs) 8.5 s, the `touches`/`overlap` closures 4.3 s, GC 6.9 s: about
20 of ~42 s, all allocation from `.map`, `Math.min(...spread)` and `.every`
over arrays, called for every member of every design the searches price.

**Change.** `bbox` is one pass of plain loops; `touches` and `overlap` are
unrolled over three axes. No behaviour change.

**Verification.**
- `gallery-data.mjs` byte-identical before and after (`cmp`).
- `make-gallery.mjs` with no stamp: 42.9 s -> 28.5 s.
- `node --test integrity.test.mjs gallery.test.mjs connections.test.mjs`:
  47.6 s -> 28.3 s, 20 pass, 0 fail.

**Not changed, ranked.**
1. Cache the gallery result in CI keyed on the venture's sources (the stamp's
   hash): would make the 28 s step ~0 on most builds, but it edits a workflow.
2. The remaining profile is spread thin (optimize.mjs, model.mjs); `integrity`'s
   BFS still uses `queue.shift()` and an O(n^2) scan.
3. Conflict markers and Page integrity checkouts: sparse-checkout PRs already open.

## Follow-up: grounded flood shrinks its scan (2026-11-06, later run)

`integrity.mjs` tested every item against every reached item (`queue.shift()`
plus a full `items` scan). It now keeps only unreached items in the scan, which
shrinks as the flood spreads; `floating` still reads `items`, so order is
unchanged. `make-gallery.mjs` (no stamp): 27.6 s -> 25.4 s, `gallery-data.mjs`
byte-identical (`cmp`), `integrity.test.mjs` 3 pass 0 fail. A fresh self-time
profile is flat (GC 3.3 s, `optimize.mjs` dfs 2.0 s, `plan` 1.6 s): the next
real gain is caching the gallery in CI keyed on the stamp hash (workflow edit).
