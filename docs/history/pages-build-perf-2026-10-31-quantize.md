# Pages build: quantize the card palette with a counting sort (2026-10-31)

Perf track run. Reading: a cold Pages build took 2 m 49 s here (real, 4 cores);
with `--cpu-prof` the main thread was idle for 76 of 126 s, waiting on the card
worker pool, so the cost is in `renderCard`. A single-process profile of 60
cards showed `quantize` (median-cut to 256 colours) as the largest function,
about 16 ms of ~60 ms per card: histogram 4.6 ms, median-cut 7.8 ms (mostly
`Array.sort` with a comparator on a regular array), index pass 3.4 ms.

Change: `quantize` in `platform/pages/sharecard.mjs` keeps the distinct colours
in one `Int32Array` and boxes as `[start, end)` ranges. Each split is a stable
counting sort on the widest channel, which gives the same order as the old
stable `Array.sort`, so the palette and indices are the same.

Verification:
- Old module against new, `quantize` on noise, 1, 2, 3, 40 and 256 level
  images up to 700k pixels at n = 256, 16, 2, 1: identical SHA-1 of palette and
  indices. `renderCard` (three option sets), `renderSiteCard` and three
  `renderMarkIcon` variants: byte-identical.
- 60 distinct cards, same SHA-1 over all PNGs before and after.
- Per card (`hrtime`, one process): 59.9 ms before, 50.7 ms after.
  Across 2,761 cards that is about 25 s of CPU, roughly 6 s of wall clock on 4 threads.

Not changed, ranked: 1. the histogram and index passes (4.6 and 3.4 ms; the
index pass is a random read of a 32 MB table); 2. `field()` per accent (11 ms,
cached); 3. `zlib.deflateSync` level 6 on the index raster (~8 ms per card;
changing the level changes bytes, so it needs a size trade-off decision);
4. `spawnSync` Python children (3.9 s).
