# The noise-aware blend and its bilinear image in C: the same bytes, 43% less added time (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing, "noise-aware's blend in C"; NEXT.md "Raws without a
profile": "next there: the blend and bilinear image in C (blend's luma step is a BLAS product: its own check)").
It follows eval/noise-aware-native-spread-2026-11-19.md, which moved the noise reading to C the same morning. It
is a speed change: no threshold, ramp or model changed.

**Verdict: shipped. On the 14 largest public sample raws every output is the same bytes as main's. The time
noise-aware adds over directional fell by a median 43%, from 0.094 to 0.053 s per megapixel. The noise-aware
develop is a median 1.24x faster (1.06-1.33x) and now takes 1.46x directional's time, down from 1.74x. The
memory it adds at peak fell by a median 16% (up to 18%).**

## Where the time went

A cProfile of one noise-aware develop of the 24 MP Sony NEX-7 on main (4.3 s): `blend` 0.65 s and the bilinear
image `raw_develop_np._bilinear` 0.56 s, plus a separate clip pass over the (h, w, 3) float32 result. The
bilinear image built two padded full-frame copies (a float64 plane and an int64 in-frame mask) and, per CFA
phase and colour, strided sums of up to eight neighbours. The blend made (rows, w) weight maps and several
(rows, w, 3) float64 temporaries per band.

## What changed

- `src/shootflow/noise_native.py`: two more C functions in the same helper (built on first use, cached,
  `SHOOTFLOW_NATIVE=0` or no compiler keeps numpy, `-ffp-contract=off`).
  - `shootflow_bilinear_rows`: `_bilinear`'s sink path. Per sensel and missing colour, `(0.0 + v0) + v1 ...`
    over the 3 x 3 neighbours holding that colour in row order (out-of-frame ones add 0.0, as the zero pad
    did), divided by the in-frame count; an X-Trans edge sensel with none in frame takes the reflected ones
    as numpy does. Then times the channel's multiplier and clipped as `_clip`. No padded copies.
  - `shootflow_blend_rows`: the block weights spread to pixels with `_interp_taps`' two taps per axis (rows
    then columns, the products then the sum, as `_weights`), `a * d + (1 - a) * b`, the luma ramp's
    `(a_l - a) * Y` added to each channel, and stored. With `clip_hi` the float32 store is clipped in float32
    in the same pass, as `_clip` does on that array, so the develop's separate clip pass is gone.
- `src/shootflow/xtrans_demosaic.py`: `blend` tries the C path first; the numpy code stays as the reference
  and fallback. **One reference change:** the luma of D - B was `(d - b) @ LUMA_WEIGHTS`, a BLAS
  matrix-vector product. OpenBLAS (here 0.3.34, Haswell kernels) computes it with fused multiply-adds, so on
  random data it differs from the plain order `(x0 * 0.2126 + x1 * 0.7152) + x2 * 0.0722` in 23% of values, by
  up to 1.8e-15, and which bits it gives depends on the BLAS build and the CPU. The numpy path now uses the
  plain elementwise order, which is the same on every machine and which C copies exactly. On the 14 raws below
  this changed no output byte (the float32 store and the 16-bit encode absorb a last-bit difference).
- `src/shootflow/raw_develop_np.py`: `_bilinear` with a sink tries the C path first (this
  also covers `--demosaic bilinear` for X-Trans at half size and the warp path's linear image);
  `_noise_aware_plane` passes `clip_hi` instead of clipping afterwards.
- `tests/test_noise_native.py`: four new tests. Bit-for-bit equality of the C bilinear sink with numpy on 30
  random planes (all four Bayer phases and X-Trans, 1 to 69 on a side, negative values, float32 and float64
  sinks, three clip levels, random thread counts); of the C blend with numpy on 24 random frames (float32 and
  float64 inputs and outputs, with and without the luma ramp and the clip); the in-place blend over the
  bilinear image; and the luma order against a hand computation.

Microbenchmark, a 24 MP plane on four cores, best of three: bilinear image 0.45 s to 0.10 s (4.5x), blend with
luma ramp and clip 0.71 s to 0.11 s (6.5x).

## Results

`tools/noise_aware_cost.py` on main's `src` (`git archive origin/main`) and on this branch's, one file at a
time, alternating main and branch, on four cores. Rows: `noise-aware-native-blend-main-2026-11-19.jsonl` and
`noise-aware-native-blend-new-2026-11-19.jsonl`. `--compare` output:

| file | MP | CFA | noise-aware s, old | new | speed-up | added peak GB, old | new | per MP, new | same bytes |
|---|---|---|---|---|---|---|---|---|---|
| nef/Nikon D810.nef | 36.4 | RGGB | 7.52 | 5.96 | 1.26x | 2.43 | 2.04 | 0.056 | yes |
| nef/Nikon 800E.nef | 36.3 | RGGB | 6.75 | 5.55 | 1.22x | 2.45 | 2.04 | 0.056 | yes |
| pef/Pentax K-1 Mark II.pef | 36.1 | RGGB | 7.27 | 5.48 | 1.33x | 2.46 | 2.05 | 0.057 | yes |
| arw/Sony ILCE-7M4 (A7M4).ARW | 32.7 | RGGB | 15.01 | 12.92 | 1.16x | 2.45 | 2.09 | 0.064 | yes |
| srw/Samsung NX1.srw | 28.0 | GRBG | 5.25 | 4.51 | 1.16x | 1.92 | 1.58 | 0.056 | yes |
| arw/Sony NEX-7.arw | 24.3 | RGGB | 4.68 | 3.52 | 1.33x | 1.69 | 1.39 | 0.057 | yes |
| arw/Sony ILCE-7M3 (A7M3).arw | 24.0 | RGGB | 10.03 | 8.59 | 1.17x | 1.70 | 1.55 | 0.065 | yes |
| srw/Samsung NX20.srw | 20.0 | GRBG | 3.97 | 3.12 | 1.27x | 1.47 | 1.23 | 0.062 | yes |
| srw/Samsung NX3000.srw | 20.0 | GRBG | 4.10 | 3.22 | 1.27x | 1.48 | 1.22 | 0.061 | yes |
| srw/Samsung EK-GN120 (Galaxy NX).srw | 19.9 | GRBG | 4.20 | 3.17 | 1.32x | 1.45 | 1.21 | 0.061 | yes |
| dng/Leica T (Typ 701).dng | 16.1 | RGGB | 5.52 | 4.81 | 1.15x | 1.18 | 1.16 | 0.072 | yes |
| raf/FujiFilm EX-2.raf | 16.0 | RBGBRGGGRGGBGGBGGRBRGRBGGGBGGRGGRGGB | 4.90 | 3.80 | 1.29x | 1.38 | 1.20 | 0.075 | yes |
| raf/Fujifilm X-E1.raf | 16.0 | GGRGGBGGBGGRBRGRBGGGBGGRGGRGGBRBGBRG | 5.01 | 4.43 | 1.13x | 1.41 | 1.23 | 0.077 | yes |
| dng/LG Nexus 5X.dng | 12.1 | RGGB | 4.27 | 4.01 | 1.06x | 0.93 | 0.93 | 0.077 | yes |

14 of 14 outputs byte-identical

Over directional, from the same rows (noise-aware minus directional in the same process, per megapixel):
median 0.094 s on main, 0.053 s on this branch (each file's own cut: median 43%). Noise-aware over
directional's time: median 1.74x on main, 1.46x now. ("per MP, new" in the table is the added peak memory in GB
per megapixel.)

- **Same bytes: 14 of 14** (SHA-256 of the 16-bit output), the luma-order change included.
- **Memory.** The added peak fell on 13 of 14 files (the Nexus 5X, a 12 MP DNG with a NoiseProfile, is
  unchanged at 0.93 GB): the C bilinear makes no padded float64 and int64 copies of the frame.
- **Time.** The smallest gain is the Nexus 5X (1.06x): it skips the frame read, and at 12 MP fixed costs
  weigh more. Wall-clock on a shared 4-core container; a row can move by 0.3 s between runs. Main's
  over-directional median read 0.094 s/MP here against 0.085 s in the morning's note: the same code, a
  different moment on a shared machine, which is why both arms were run alternately in one session.

## What it does not settle

Noise-aware still takes about 1.5x directional's time, 1-2 s more on a 24-36 MP frame. Whether `auto` should
pick it is the product question this was clearing the way for. The time is now mostly elsewhere:
`frame_noise` (the patch-PCA noise read on raws without a profile, about 0.8 s on the NEX-7) and
`frame_measures`. The near-clean loss (a K-3 Mark III tile at SNR 200 losing 0.58 dB) is still open and still
needs a raw.pixls.us frame, which this container's proxy refuses.

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw nef raf pef srw dng)
    git archive origin/main ventures/photo-editing/src ventures/photo-editing/tools | tar -x -C /tmp/main
    # for each of the 14 files (list in the jsonl rows), one at a time, alternating:
    PYTHONPATH=/tmp/main/ventures/photo-editing/src SHOOTFLOW_CACHE=/tmp/cache-main python tools/noise_aware_cost.py FILE >> main.jsonl
    PYTHONPATH=src python tools/noise_aware_cost.py FILE >> new.jsonl
    python tools/noise_aware_cost.py --compare main.jsonl new.jsonl
    python -m pytest tests/test_noise_native.py
