# The patch-PCA noise read in C, in a fixed order: same bytes, 1.25x faster, no BLAS left in it (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing, "noise-aware's patch PCA in a fixed order (0.33 s of its
0.73 s on 24 MP)"). It follows eval/noise-aware-native-levels-2026-11-19.md, which moved the block statistics to C
and left `noise_pca.estimate_noise_pca` as the last numpy step of `frame_noise`, and the last one whose result hung
on BLAS. This is a speed and reproducibility change. No threshold, bin, test or model changed.

**Verdict: shipped. All 12 of the 12 largest public sample raws tried develop to the same bytes as main's. The
patch-PCA step is a median 1.25x faster on their own planes (0.202 to 0.152 s; 0.98x to 2.07x), and the
(shot, read) model it returns moves by at most 1.8e-12 relative. The whole noise-aware develop is a median 1.03x
faster: the time it adds over directional fell from 0.035 to 0.028 s per megapixel, and it now takes 1.26x
directional's time (median), down from 1.31x. Peak memory is unchanged. More important than the speed: the noise
read no longer calls BLAS, so its bits no longer depend on which BLAS library or how many threads it has.** The
one library call left in it is LAPACK's `eigvalsh` on a 36 x 36 matrix (see "What it does not settle").

## Where the time went

`estimate_noise_pca` on a 24 MP Bayer mosaic (4024 x 6048), cProfile, main:

| step | s |
|---|---|
| `estimate_noise_pca`, all | 0.44 |
| `np.cov` (53 calls: 8 bins x the weak-texture iterations) | 0.22 |
| `p @ D.T` and its square sum, the texture energy (once per bin) | 0.09 |
| patch extraction, means, quantiles, medians | ~0.13 |

Both large steps were BLAS products: `np.cov` hands the centred patches to `dot`, and the texture energy was a
matrix product with the difference matrix `D`. BLAS picks its own summation order, with blocking and FMA that
vary by library, CPU and thread count. So the same raw could give a noise model a few ulps apart on two machines.
The levels note measured that such an error would have to be about 10,000 times larger before a 16-bit code
moved. That is a margin, not a guarantee.

## What changed

- `src/shootflow/noise_pca.py`: two fixed-order references replace the BLAS calls.
  - `_cov_ref(p, idx)`: each column's mean is `np.add.reduce` along a contiguous axis (numpy's pairwise sum) over
    the count. Each covariance entry is the pairwise sum of the centred products over count - 1.
  - `_energy_ref(p, rowptr, cols, coef)`: per row of `D`, t = 0 then t + coef * x over its nonzero columns in
    ascending order; g = 0 then g + t * t row after row.
  `pca_bins` now computes the texture energy once for every patch (a patch's energy does not depend on its bin)
  and passes each bin as an index array, so no bin's patches are copied. The bins run on the thread pool
  (`raw_develop_np._run_bands`, one bin per task). Bins are independent, so the thread count changes no bit.
  `eig_sigma2` and `weak_texture_sigma2` keep their signatures.
- `src/shootflow/noise_native.py`: `shootflow_patch_energy` and `shootflow_patch_cov` give the same bits in C.
  The covariance walks numpy's pairwise tree over the kept rows (under 8 rows a plain loop; up to 128, eight lanes
  joined `((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7))` then the tail; above that, a split at n / 2 rounded
  down to a multiple of 8) for all 666 upper-triangle entries at once. Each leaf centres its rows into a block and
  keeps one row-entry's eight lane sums in L1. Before the kernel was written, numpy 2.5.3's `np.add.reduce` was
  checked against a Python transcription of that tree on lengths 129 to 100,001 (27 arrays, values over six
  decades), and all 27 matched. The helper's flags went from `-O2` to `-O3`, still with `-ffp-contract=off` and no
  `-ffast-math`, so nothing is fused or reordered. Every earlier kernel's bit-for-bit test still passes.
- `tests/test_noise_native.py`: three new tests.
  - C covariance against `_cov_ref` bit for bit on 30 random sets: 4, 16 or 36 columns, 2 to 5,000 rows across
    every branch of the tree, scattered index sets, scales over five decades.
  - C energy against `_energy_ref` for the grad, near and colour matrices at 1 and 3 threads.
  - `estimate_noise_pca` on Bayer and X-Trans gives the same model with C, without C (`SHOOTFLOW_NATIVE=0`) and on
    one thread.

Microbenchmark, one bin of 21,105 patches of 36: C covariance 7.1 ms at `-O2`, 5.6 ms at `-O3`; `np.cov` on 4
BLAS threads 5.1-6.4 ms. One call is no faster than threaded BLAS. The gain comes from not copying each bin, from
computing the energy once instead of per bin, and from running the bins side by side.

## Results

### The step on its own

Each file was developed once on this branch to capture the white-balanced plane `frame_noise` hands to
`estimate_noise_pca`. Then main's `noise_pca.py` and this branch's ran on that same plane, best of three, 4 cores.
Rows: `noise-pca-native-step-2026-11-19.jsonl`.

| file | plane | main s | new s | speed-up | largest relative change in (shot, read) |
|---|---|---|---|---|---|
| nef/Nikon 800E.nef | 4924 x 7378 | 0.246 | 0.201 | 1.23x | 1.6e-14 |
| nef/Nikon D810.nef | 4928 x 7380 | 0.205 | 0.172 | 1.19x | 2.4e-14 |
| arw/Sony ILCE-7M4 (A7M4).ARW | 5120 x 7168 | 0.270 | 0.170 | 1.59x | 9.6e-16 |
| raf/FujiFilm EX-2.raf | 3296 x 4992 | 0.182 | 0.135 | 1.35x | 7.7e-15 |
| raf/Fujifilm X-E1.raf | 3288 x 5120 | 0.199 | 0.152 | 1.31x | 4.2e-13 |
| arw/Sony NEX-7.arw | 4024 x 6048 | 0.260 | 0.146 | 1.78x | 6.6e-16 |
| arw/Sony ILCE-7M3 (A7M3).arw | 4024 x 6048 | 0.213 | 0.168 | 1.27x | 0 |
| arw/Sony ILCE-5000 (A5000).arw | 3656 x 5504 | 0.160 | 0.148 | 1.08x | 0 |
| nef/Nikon D5100.nef | 3280 x 4948 | 0.194 | 0.159 | 1.22x | 3.1e-14 |
| arw/Sony NEX-5N.arw | 3276 x 4928 | 0.124 | 0.126 | 0.98x | 1.8e-12 |
| nef/NikonD200.nef | 2616 x 3899 | 0.264 | 0.127 | 2.07x | 1.3e-15 |
| arw/Sony DSLR-A500.arw | 2858 x 4288 | 0.177 | 0.152 | 1.17x | 4.8e-14 |

### The whole develop

`tools/noise_aware_cost.py` ran on main's `src` (main at feea69157) and on this branch's, one file at a time,
alternating main and branch, on four cores. The files were the 12 largest ARW, NEF and RAF in
drewnoakes/metadata-extractor-images, the same set as the levels note. Rows: `noise-pca-native-main-2026-11-19.jsonl`
and `noise-pca-native-new-2026-11-19.jsonl`. `--compare` output:

| file | MP | CFA | noise-aware s, old | new | speed-up | added peak GB, old | new | per MP, new | same bytes |
|---|---|---|---|---|---|---|---|---|---|
| nef/Nikon D810.nef | 36.4 | RGGB | 5.22 | 4.80 | 1.09x | 1.93 | 1.97 | 0.054 | yes |
| nef/Nikon 800E.nef | 36.3 | RGGB | 5.04 | 4.61 | 1.09x | 1.97 | 1.97 | 0.054 | yes |
| arw/Sony ILCE-7M4 (A7M4).ARW | 32.7 | RGGB | 11.01 | 10.82 | 1.02x | 2.08 | 2.08 | 0.064 | yes |
| arw/Sony NEX-7.arw | 24.3 | RGGB | 3.29 | 2.98 | 1.10x | 1.39 | 1.39 | 0.057 | yes |
| arw/Sony ILCE-7M3 (A7M3).arw | 24.0 | RGGB | 7.98 | 7.87 | 1.01x | 1.54 | 1.54 | 0.064 | yes |
| arw/Sony ILCE-5000 (A5000).arw | 20.1 | RGGB | 6.24 | 6.05 | 1.03x | 1.33 | 1.35 | 0.067 | yes |
| nef/Nikon D5100.nef | 16.2 | RGGB | 2.16 | 2.16 | 1.00x | 0.95 | 0.99 | 0.061 | yes |
| arw/Sony NEX-5N.arw | 16.1 | RGGB | 2.14 | 2.01 | 1.06x | 0.99 | 0.99 | 0.061 | yes |
| raf/FujiFilm EX-2.raf | 16.0 | X-Trans | 3.62 | 3.57 | 1.01x | 1.20 | 1.20 | 0.075 | yes |
| raf/Fujifilm X-E1.raf | 16.0 | X-Trans | 3.86 | 3.73 | 1.03x | 1.23 | 1.23 | 0.077 | yes |
| arw/Sony DSLR-A500.arw | 12.3 | RGGB | 1.70 | 1.70 | 1.00x | 0.80 | 0.80 | 0.065 | yes |
| nef/NikonD200.nef | 10.2 | GRBG | 1.69 | 1.32 | 1.28x | 0.70 | 0.70 | 0.069 | yes |

12 of 12 outputs byte-identical. The added peak moves by up to 0.04 GB in both directions; that is tracemalloc's
run-to-run noise, the same spread the levels note saw. The step saves about 0.05 s a file, so on the 7-11 s
Sony files the develop barely moves. The patch read is now a small share of a noise-aware develop.

## What it does not settle

- **LAPACK.** `np.linalg.eigvalsh` on each 36 x 36 covariance is still numpy's LAPACK (`dsyevd`). Its input is now
  the same bits everywhere. Different LAPACK builds (OpenBLAS, MKL, Accelerate) could still return eigenvalues a
  few ulps apart. A Jacobi eigen-solver in C would close that. It was not written: the model's error budget before
  a code moves is about four orders of magnitude, and every eigenvalue an ulp off is far inside it.
- **Whether `auto` should pick noise-aware.** That is the next flagship item. It is a question about quality on
  real noise, not about time. Noise-aware now takes 1.26x directional's time.
- **The rest of `frame_noise`'s time.** Patch extraction (`mosaic_patches`, 0.03-0.04 s on 24 MP), the per-bin
  medians and quantiles are still numpy. At this size none of them is worth a kernel.

## Reproduce

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git r
(cd r && git sparse-checkout set arw nef raf)
PYTHONPATH=<main src> python tools/noise_aware_cost.py FILE ... > main.jsonl   # alternate per file
PYTHONPATH=src        python tools/noise_aware_cost.py FILE ... > new.jsonl
python tools/noise_aware_cost.py --compare main.jsonl new.jsonl
python -m pytest tests/test_noise_native.py tests/test_noise_pca.py
```
