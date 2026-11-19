# Block levels and maxima in C: the same bytes, noise-aware develop a median 1.11x faster (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing, "noise-aware's frame_noise in C"). It follows
eval/noise-aware-native-blend-2026-11-19.md, which ended with "the time is now mostly elsewhere: `frame_noise`
... and `frame_measures`". This is a speed change. No threshold, ramp or model changed.

**Verdict: shipped. All 12 of the 12 largest public sample raws tried develop to the same bytes as main's.
The noise-aware develop is a median 1.11x faster (1.02-1.27x). Median time it adds over directional: 0.052
to 0.041 s per megapixel. It now takes 1.32x directional's time (median), down from 1.36x. Peak memory is
unchanged.** The patch-PCA part of `frame_noise` is still numpy (see "What it does not settle").

## Where the time went

`frame_noise` on the Sony NEX-7's white-balanced plane (4024 x 6048), best of three, 4 cores, on main:

| step | s |
|---|---|
| `frame_noise`, all | 0.87 |
| `noise_pca.estimate_noise_pca` (patch PCA) | 0.33 |
| `_block_spread`'s block levels: `_block_stat(np.clip(c, 0, None), mean)` | 0.15 |
| `_residual` (already C) | 0.18 |
| block medians (already C) | 0.14 |
| `_unclipped`: `_block_stat(c, max)` | 0.11 |

The two numpy block statistics each copy the whole frame twice: once for the clipped plane, once more for
`_block_stat`'s reshape into (blocks, 576). `frame_measures` computes the same block levels again later in the
develop, so the level step is paid twice per noise-aware develop.

## What changed

- `src/shootflow/noise_native.py`: `shootflow_block_mean_max`, one pass per block row band on the thread pool.
  For each 24 x 24 block it computes the mean of the values clipped at 0 and the maximum of the raw values. No
  full-frame copies. To give numpy's bits, the mean sums the block's 576 values (row after row, the order of
  the reshaped copy) with **numpy's pairwise summation**: under 8 values a plain loop; up to 128, eight running
  sums joined `((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7))` and then the remainder; above that, split at
  n / 2 rounded down to a multiple of 8. That sum is then divided by 576. Clipping follows `np.clip(a, 0.0,
  None)`: -0.0 becomes +0.0 and NaN is kept. The maximum is NaN when the block holds a NaN, as `np.max` is.
  Before writing the kernel, three candidate orders were checked against `np.sum` and `np.mean` on 2,000 random
  rows each of lengths 7, 64, 100, 129 and 576. Plain pairwise matched 100% of them. "First element plus
  pairwise rest" matched only 40-61%.
- `src/shootflow/xtrans_demosaic.py`: `_block_level` and `_block_top` try the C path first, and the numpy
  expressions stay as the reference and fallback. Callers: `_block_spread`, `_unclipped` (the guard's clipped
  blocks) and `frame_measures`.
- `tests/test_noise_native.py`: three new tests. The first checks bit-for-bit equality of C means and maxima
  with numpy on 24 random planes: block sizes 3, 5, 6, 12 and 24, values spanning six decades, negatives,
  -0.0, NaN, random thread counts. The second checks that the default path is the C one. The third checks
  that planes smaller than a block still go to numpy's single block.

Microbenchmark on the NEX-7 plane, best of five: block levels 0.154 s to 0.024 s (6.4x), block maxima 0.101 s to
0.021 s (4.8x). `frame_noise` 0.87 s to 0.73 s.

**Tried and dropped:** a fused C step that computed the residual and its block medians one band of block rows
at a time, so the 8-bytes-per-sensel residual plane (195 MB at 24 MP) is never held. It gave the same bits.
On the NEX-7 and the D810, run alternately against the unfused branch, it left the develop's added peak
memory unchanged (the peak is elsewhere) and its time inside run-to-run noise (0.29 s vs 0.30 s for the two
steps). So it was not kept.

## Results

`tools/noise_aware_cost.py` was run on main's `src` (main after PR 17515) and on this branch's, one file at a
time, alternating main and branch, on four cores. The 12 largest ARW, NEF and RAF files in
drewnoakes/metadata-extractor-images were used (the session checked out only those three folders). Rows are in
`noise-aware-native-levels-main-2026-11-19.jsonl` and `noise-aware-native-levels-new-2026-11-19.jsonl`.
`--compare` output:

| file | MP | CFA | noise-aware s, old | new | speed-up | added peak GB, old | new | per MP, new | same bytes |
|---|---|---|---|---|---|---|---|---|---|
| nef/Nikon D810.nef | 36.4 | RGGB | 6.64 | 6.46 | 1.03x | 2.04 | 1.97 | 0.054 | yes |
| nef/Nikon 800E.nef | 36.3 | RGGB | 6.16 | 5.46 | 1.13x | 2.04 | 1.97 | 0.054 | yes |
| arw/Sony ILCE-7M4 (A7M4).ARW | 32.7 | RGGB | 14.67 | 13.21 | 1.11x | 2.08 | 2.09 | 0.064 | yes |
| arw/Sony NEX-7.arw | 24.3 | RGGB | 4.08 | 3.76 | 1.09x | 1.39 | 1.36 | 0.056 | yes |
| arw/Sony ILCE-7M3 (A7M3).arw | 24.0 | RGGB | 10.61 | 10.23 | 1.04x | 1.56 | 1.55 | 0.065 | yes |
| arw/Sony ILCE-5000 (A5000).arw | 20.1 | RGGB | 8.21 | 8.02 | 1.02x | 1.35 | 1.34 | 0.067 | yes |
| nef/Nikon D5100.nef | 16.2 | RGGB | 3.22 | 2.92 | 1.10x | 0.99 | 0.99 | 0.061 | yes |
| arw/Sony NEX-5N.arw | 16.1 | RGGB | 2.96 | 2.64 | 1.12x | 0.96 | 0.99 | 0.061 | yes |
| raf/FujiFilm EX-2.raf | 16.0 | X-Trans | 4.36 | 4.09 | 1.07x | 1.15 | 1.20 | 0.075 | yes |
| raf/Fujifilm X-E1.raf | 16.0 | X-Trans | 5.08 | 4.28 | 1.19x | 1.23 | 1.23 | 0.077 | yes |
| arw/Sony DSLR-A500.arw | 12.3 | RGGB | 2.42 | 1.90 | 1.27x | 0.79 | 0.79 | 0.065 | yes |
| nef/NikonD200.nef | 10.2 | GRBG | 2.15 | 1.82 | 1.18x | 0.71 | 0.70 | 0.069 | yes |

12 of 12 outputs byte-identical

- **Same bytes: 12 of 12** (SHA-256 of the 16-bit output), Bayer and X-Trans.
- **Time.** The noise-aware develop is a median 1.11x faster. The time it adds over directional in the same
  process fell from a median 0.052 to 0.041 s/MP. Per file, that difference is noisy: the cut ranges from -15%
  to over 100%, because directional's own time moves by a few tenths of a second between runs on this shared
  container. The total-time column is the steadier reading. (This main read 0.052 s/MP against the 0.053 s
  in the blend note: the same code.)
- **Memory.** The added peak is within ±0.07 GB on every file (median -0.005 GB). The block statistics'
  copies were transient and were never the develop's peak.

## Does the develop's output depend on the machine?

The blend note removed a BLAS product from the blend so that the develop gives the same bits on every machine.
`frame_noise`'s patch PCA still uses BLAS: `p @ D.T`, `np.cov` and `eigvalsh`. A different BLAS build or CPU
can change the noise model's last bits. To see whether that reaches the output, the NEX-7 was developed with
the PCA's (shot, read) multiplied by (1 + eps). The NEX-5N and the NEX-7 were also developed with one-ulp
nudges (`nextafter`) to shot, read and both.

| eps (relative) | 16-bit codes changed, of 73,011,456 | largest change |
|---|---|---|
| one ulp (shot, read, both; NEX-7 and NEX-5N) | 0 | 0 |
| 1e-13 | 0 | 0 |
| 1e-11 | 0 | 0 |
| 1e-9 | 12 | 1 |
| 1e-7 | 1,081 | 1 |
| 1e-5 | 98,301 | 1 |

A BLAS reordering moves a sum of a few hundred thousand terms by about 1e-15 to 1e-13 relative. That is two or
more decades under where the first code moves. So in practice the output is the same across machines. One case
is not covered: a patch sitting exactly on the weak-texture threshold (`g < s2 * tr * q`) could flip between
kept and dropped. That would move sigma^2 by about one part in the kept count (1e-5 to 1e-4) and change ±1
codes in roughly 0.1% of values. That would take a fixed-order PCA to rule out.

## What it does not settle

- The patch PCA (0.33 s on 24 MP, about half of `frame_noise` now) is still numpy and BLAS. A C version would
  need its own order for the covariance and a symmetric eigen-solver. That is the next step for `frame_noise`
  and would also close the threshold case above.
- Whether `auto` should pick noise-aware (1.32x directional's time now) is still the product question.

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw nef raf)
    git archive origin/main ventures/photo-editing/src ventures/photo-editing/tools | tar -x -C /tmp/main
    # for each of the 12 files (list in the jsonl rows), one at a time, alternating:
    PYTHONPATH=/tmp/main/ventures/photo-editing/src SHOOTFLOW_CACHE=/tmp/cache-main python tools/noise_aware_cost.py FILE >> main.jsonl
    PYTHONPATH=src python tools/noise_aware_cost.py FILE >> new.jsonl
    python tools/noise_aware_cost.py --compare main.jsonl new.jsonl
    PYTHONPATH=src python -m unittest tests.test_noise_native
