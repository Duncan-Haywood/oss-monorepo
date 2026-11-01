# Pages build: is a lower deflate level worth it? (2026-11-01)

Perf track run. Reading: a cold Pages build (`node platform/pages/build.mjs
--out=<dir>`) took 2 m 12 s real, 3 m 22 s user, 4 cores. The previous pass
(`pages-build-perf-2026-10-31-run-length.md`) ranked `zlib.deflateSync` level 6
in `sharecard.mjs` (lines 400, 519) first in "not changed", because a level
change alters bytes and needs a size decision.

Measurement (30 real share-card PNGs over 20 kB from that build, inflated back to
raw scanlines, then re-deflated in one process, `hrtime`, mean per card):

| setting | ms/card | bytes/card |
|---|---|---|
| level 6 (current) | 6.9 | 48,615 |
| level 4 | 3.7 | 57,662 (+19%) |
| level 3 | 2.7 | 59,815 (+23%) |
| level 1 | 2.3 | 65,884 (+36%) |
| level 6, Z_FILTERED | 7.1 | 51,572 |
| level 6, Z_RLE | 2.5 | 119,623 (+146%) |

Decision: no change. Over ~2,800 cards, level 4 saves about 9 s of CPU, roughly
2 to 3 s of wall clock on 4 threads (about 2% of a build), and every card gets
about 19% heavier for every visitor and crawler that fetches it. Visitors wait
on page weight, which this track also owns, so the trade is the wrong way round.

Not changed, ranked: 1. the main thread idles about 60% of a cold build waiting
on the card worker pool (more workers or smarter chunking is the next lever);
2. `spawnSync` Python children (3.9 s); 3. `field()` per accent (cached).
