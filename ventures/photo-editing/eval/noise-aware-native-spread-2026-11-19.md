# The noise reading's residual and block medians in C: the same bytes, 31% less added time (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing; NEXT.md "Raws without a profile": "next there: whether
`auto` should pick noise-aware"). `--demosaic auto` stays directional because noise-aware costs about twice
directional's time (eval/noise-fallback-real-2026-11-17.md, eval/noise-aware-full-frame-cost-2026-11-17.md).
This run cut that cost. It is a speed change only: no threshold, ramp or model changed.

**Verdict: shipped. On the 14 largest public sample raws every output is the same bytes as main's. The time
noise-aware adds over directional fell by a median 31%, from 0.124 to 0.085 s per megapixel. Noise-aware's own
time is a median 1.18x faster (1.04-1.30x), and it now takes 1.77x directional's time, down from 2.05x.**
Peak memory is unchanged (within 0.05 GB either way).

## Why this run and not the planned one

The row's first open item was the blend near clean: on a Pentax K-3 Mark III tile at SNR 200 even the true
noise model loses 0.58 dB to directional (eval/noise-card-floor-rank-2026-11-18.md). That frame and the other
card sets come from raw.pixls.us, and this session's proxy refuses that host by policy (403 on CONNECT). The
46 GitHub-hosted sample raws (drewnoakes/metadata-extractor-images) cannot stand in for it, because the loss
never shows on them: across every eval row file with a `true` arm, their worst SNR 200 tile is -0.02 dB
(`bayer-` and `xtrans-noise-aware-estimated-2026-11-17.jsonl`, 116 tiles each). So this run took the item that
needs no outside frame: the cost that keeps noise-aware from being the default.

## Where the time went

A cProfile of one noise-aware develop of the 24 MP Sony NEX-7 (5.3 s, directional alone 2.0 s) showed the profile
guard (`guard_profile` -> `profile_ratio` -> `_block_spread`) using 1.47 s. Of that, 0.77 s was `_residual`:
twelve 3 x 3 box sums per band on float64 planes. Most of the other 0.6 s was the median of each 24 x 24 block,
taken through a reshaped copy of the whole frame. After the change the guard takes 0.43 s and the develop 3.9 s.
Next are `blend` (0.55 s), `frame_measures` (0.36 s), the bilinear image (0.58 s) and patch PCA (0.30 s).

## What changed

- `src/shootflow/noise_native.py` (new): both steps in C, built on first use with the system compiler and
  cached, as the other native helpers are (`SHOOTFLOW_NATIVE=0` turns it off; with no compiler the numpy path
  runs). The residual uses numpy's arithmetic in numpy's order: masked planes (a negative sensel masked out is
  -0.0), `(a + b) + c` column sums then row sums, edges reflected, `(9c) * m`, and `(|c - pred| * 1.4826) *
  0.85`. It is compiled with `-ffp-contract=off`. It reads a rolling ring of four first-sum rows, so a thread
  holds about 30 w doubles, not a band of planes. The median is a quickselect, with `(a + b) / 2` of the two
  middle values as `np.median` takes it, and NaN for a block that holds a NaN.
- `src/shootflow/xtrans_demosaic.py`: `_residual` calls the C path first. The numpy code is now
  `_residual_np`, the reference. `_block_spread` takes its block medians from C. Both go through
  `raw_develop_np._run_bands`, so the thread count changes no bit.
- `tests/test_noise_native.py`: bit-for-bit equality with numpy on 36 random planes (all four Bayer phases and
  X-Trans, sizes 2 to 89, negative values, random band heights and thread counts), and block medians with ties,
  NaN and odd block sizes.

Microbenchmark, a 24 MP plane on four cores, best of three: residual 0.81 s to 0.11 s (7.5x Bayer, 7.9x
X-Trans), block medians 0.42 s to 0.08 s (5x).

## Results

`tools/noise_aware_cost.py` on main's `src` (`git archive origin/main`) and on this branch's, one file at a
time, alternating, on four cores. Rows: `noise-aware-native-spread-main-2026-11-19.jsonl` and
`noise-aware-native-spread-new-2026-11-19.jsonl`. "Extra" is noise-aware's time minus directional's in the
same process. The directional column is this branch's run; directional is untouched, and main's run read
within timing noise of it.

| file | MP | directional s | noise-aware s, main | this PR | extra s, main | this PR | added peak GB, main | this PR | same bytes |
|---|---|---|---|---|---|---|---|---|---|
| pef/Pentax K-1 Mark II.pef | 36.15 | 3.61 | 7.87 | 6.38 | 3.11 | 2.77 | 2.441 | 2.47 | yes |
| nef/Nikon 800E.nef | 36.33 | 3.63 | 8.07 | 6.69 | 4.58 | 3.06 | 2.428 | 2.411 | yes |
| nef/Nikon D810.nef | 36.37 | 4.41 | 8.57 | 7.18 | 4.33 | 2.77 | 2.413 | 2.4 | yes |
| arw/Sony ILCE-7M4 (A7M4).ARW | 32.74 | 11.17 | 14.83 | 14.3 | 3.75 | 3.13 | 2.463 | 2.463 | yes |
| srw/Samsung NX20.srw | 19.96 | 2.11 | 4.35 | 3.77 | 2.32 | 1.66 | 1.484 | 1.473 | yes |
| srw/Samsung NX1.srw | 27.99 | 2.75 | 6.2 | 5.19 | 3.42 | 2.44 | 1.924 | 1.936 | yes |
| raf/FujiFilm EX-2.raf | 15.98 | 2.69 | 5.23 | 4.56 | 2.00 | 1.87 | 1.335 | 1.376 | yes |
| srw/Samsung NX3000.srw | 19.96 | 2.0 | 4.48 | 3.55 | 2.42 | 1.55 | 1.474 | 1.449 | yes |
| raf/Fujifilm X-E1.raf | 15.98 | 2.75 | 5.49 | 4.72 | 2.61 | 1.97 | 1.343 | 1.39 | yes |
| arw/Sony NEX-7.arw | 24.34 | 2.42 | 5.78 | 4.43 | 3.32 | 2.01 | 1.681 | 1.707 | yes |
| arw/Sony ILCE-7M3 (A7M3).arw | 24.0 | 7.51 | 10.98 | 9.27 | 3.63 | 1.76 | 1.697 | 1.681 | yes |
| dng/LG Nexus 5X.dng | 12.08 | 1.45 | 4.61 | 4.21 | 3.06 | 2.76 | 0.929 | 0.929 | yes |
| srw/Samsung EK-GN120 (Galaxy NX).srw | 19.87 | 2.18 | 4.64 | 3.98 | 2.40 | 1.80 | 1.46 | 1.46 | yes |
| dng/Leica T (Typ 701).dng | 16.08 | 4.09 | 6.38 | 5.46 | 2.25 | 1.37 | 1.19 | 1.168 | yes |

- **Same bytes: 14 of 14** (SHA-256 of the 16-bit output). This is the expected result, since every sample
  is the same arithmetic.
- **Time.** Median speed-up of the noise-aware develop is 1.18x. The extra over directional fell by a median
  31%. The Nexus 5X gains least (3.06 to 2.76 s): it carries a NoiseProfile, so it skips the frame read and
  runs the guard only once.
- These are wall-clock times on a shared 4-core container, so a single row can move by 0.3 s or so between
  runs. The direction is the same on all 14 files.

## What it does not settle

Noise-aware still takes 1.77x directional's time, about 2-3 s more on a 24-36 MP frame. So `auto` stays
directional. On a 1,000-frame card that is still about 40 minutes, and whether the gain is worth it is still
the product call that eval/noise-aware-full-frame-cost-2026-11-17.md left open. The rest of the cost now sits
in the blend's (h, w, 3) float64 arithmetic and the bilinear image. Moving those to C would need its own
check, because `blend`'s luma step goes through a BLAS matrix-vector product whose summation order C would not
copy exactly. The near-clean loss is still open. It needs a raw.pixls.us frame or another public frame that
shows it.

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw nef raf pef srw dng)
    git archive origin/main ventures/photo-editing/src | tar -x -C /tmp/main
    # for each of the 14 files (list in the jsonl rows), one at a time:
    PYTHONPATH=/tmp/main/ventures/photo-editing/src SHOOTFLOW_CACHE=/tmp/cache-main python tools/noise_aware_cost.py FILE >> main.jsonl
    PYTHONPATH=src python tools/noise_aware_cost.py FILE >> new.jsonl
    python -m pytest tests/test_noise_native.py
