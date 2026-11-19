# Should `--demosaic auto` pick noise-aware? (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "whether `auto` should pick noise-aware"). On
2026-11-17 noise-aware stayed opt-in because it took 5.8x directional's time and up to 6.4 GB on a 36 MP frame
(eval/noise-fallback-real-2026-11-17.md). Six speed and memory changes since then (float32 bilinear, the guard's
statistics, the blend, the block levels and the patch PCA in C) report it at 1.26x directional's time
(eval/noise-pca-native-2026-11-19.md). None of those notes put the two demosaics' peak memory side by side.

## Decision rule, committed before any cost row was measured

**Quality** (rows already scored by earlier runs; seen before this rule, so this half is a summary, not a test):
`pcaguard@0.8`, what `--demosaic noise-aware` ships for a raw with no NoiseProfile, against `D` (directional) in
the three raw.pixls.us sweeps of 2026-11-18 (`noise-card-floor-cap-`, `-fresh-cap-`, `-fourth-cap-2026-11-18.jsonl`;
real scenes binned 4 x 4 into truths, noise added at SNR 12, 25, 60 and 200, `equal` and `wb` scenarios). It
passes if (q1) mean luma and mean colour gain are positive in every set x SNR x scenario cell, (q2) at most 1% of
rows lose over 0.1 dB in either metric, and (q3) at SNR 200, rows gaining over 0.1 dB luma outnumber rows losing
over 0.1 dB at least 5 to 1.

**Cost** (measured after this rule is committed, with `tools/noise_aware_cost.py --peaks` on the public sample raws
of drewnoakes/metadata-extractor-images, full size, numpy engine, C helpers built, two files at a time):
(c1) median time noise-aware / directional at most 1.5x and median added time at most 0.1 s per MP;
(c2) median added peak memory noise-aware / directional at most 1.5x, and no file over 2x.

If all five hold, `auto` picks noise-aware wherever it now picks directional (full size, numpy engine; X-Trans
half size too, which demosaics at full size), and `--demosaic directional` keeps the old default. If any fails,
`auto` stays directional and this note names the one that failed.
