# The noise-aware develop on full frames: 2.2x faster, 41% less memory, the same bytes (2026-11-17)

Flagship item (NEXT.md "Raws without a profile", "cut its time and memory on full frames"): on the night of
2026-11-17 the frame-read noise model became the fallback for `--demosaic noise-aware`, and
eval/noise-fallback-real-2026-11-17.md measured what it costs: a median 6.7 s more than directional per frame
(about 0.49 s per megapixel), 5.8x directional's time, and up to 6.4 GB of process memory on a 36 MP NEF. That
cost is why `--demosaic auto` stays directional.

**Verdict: shipped. On the 14 largest public sample raws the noise-aware develop now takes a median 2.2x less
time (1.7-2.8x) and adds a median 41% less peak memory (25-45%), and every one of the 14 outputs is the same
bytes as before.** Its extra time over directional fell from a median 10.6 s to 3.7 s (0.49 to 0.16 s per
megapixel; 5.9x directional's time to 2.8x); the memory it adds fell from 0.142 to 0.086 GB per megapixel
(5.1 GB to 2.9 GB on the 36 MP Nikon D810).

## Where the time and memory went

A profile of the frame-noise path on a synthetic 24 MP Bayer plane (12.1 s in all) put 5.2 s in
`guard_profile`, almost all in `_residual`: twelve whole-frame 3 x 3 box sums and their pads, each on a
full-frame float64 plane (the leave-one-out residual against same-colour neighbours that the profile guard
reads). The rest was the bilinear image built on one thread (1.9 s), `blend` building two full-frame weight
maps and several (h, w, 3) float64 temporaries (1.2-1.6 s), `frame_measures` building the (h, w, 3) float64
difference of the two demosaics and its square (0.9 s), and a final clip that made two more (h, w, 3) copies.
The directional demosaic itself (native C) was 0.6 s.

## What changed

All in `src/shootflow/xtrans_demosaic.py` and `src/shootflow/raw_develop_np.py`; no threshold, ramp or model
changed.

- `_residual` runs in bands of 240 rows on a thread pool (`_run_bands`, the same pool the bilinear and encode
  steps use), each band read with 4 halo rows. The two nested 3 x 3 sums reach 2 rows, so a band's own
  reflected pad never reaches a row it keeps, and at the frame's top and bottom the band's edge is the frame's
  edge: every kept value is the same arithmetic in the same order, bit for bit (pinned against the
  whole-frame code for both CFAs, odd sizes, bands of 1 to 240 rows and 1 to 4 threads).
- `_block_detail` (new; used by `frame_measures`) takes each block's RMS difference band by band, in whole
  24-row blocks, so the (h, w, 3) difference is never held. Each block's value is the same `_block_stat`
  arithmetic; only the frame-wide `detail` figure, which the blend does not use, sums bands and can differ in
  its last bits.
- `blend` runs in bands and makes each band's weights for its rows only. The weights were a dense product
  `interp_h @ ab @ interp_w.T`, whose BLAS blocking changes with the row count: banded, it moved about 1 value
  in 1,000 by one last bit. They are now taken two taps at a time (`_interp_taps`), the same two non-zero
  weights per row and column, so a band equals the whole frame bit for bit on any BLAS; against the old dense
  product they differ by at most 2.2e-16 (on 0-1 weights). `blend(..., out=)` writes into a given array,
  which may be the bilinear input itself (each band reads its own rows before writing them).
- `_noise_aware_plane` builds the bilinear image on every thread (`_run_bands` documents that the thread count
  changes no byte), blends into it in place, and clips it in place band by band. `_directional` no longer
  keeps a full-frame gains array alive.

## Method

`tools/noise_aware_cost.py`: each file is read with `read_raw` and developed at full size on the numpy engine,
once `demosaic="directional"` (time) and once `"noise-aware"` (no NoiseProfile on 13 of 14: the frame-read
model and its guard; the LG Nexus 5X DNG's own profile and the guard on it). For the noise-aware develop it
records the time, the peak memory the develop adds over what was held before it (`tracemalloc`; numpy reports
its buffers to it, so this is the arrays, not the interpreter), and a SHA-256 of the 16-bit output. The files
are the 14 largest raws of drewnoakes/metadata-extractor-images (36 MP Nikon D810, D800E and Pentax K-1 II
down to the 12 MP Nexus 5X; RGGB and GRBG Bayer, two X-Trans phases), run one at a time on this container's
4 cores, the old code (main before this change) and the new one alternating per file. Raws without a colour
matrix get the sRGB one as a stand-in, as in eval/noise-fallback-real-2026-11-17.md; colour does not enter
the blend.

## Results

`noise-aware-full-frame-cost-2026-11-17.out.txt` (rows: `noise-aware-full-frame-cost-{old,new}-2026-11-17.jsonl`):

| file | MP | CFA | noise-aware s, old | new | speed-up | added peak GB, old | new | same bytes |
|---|---|---|---|---|---|---|---|---|
| nef/Nikon D810.nef | 36.4 | RGGB | 21.58 | 8.57 | 2.52x | 5.09 | 2.89 | yes |
| nef/Nikon 800E.nef | 36.3 | RGGB | 18.84 | 8.18 | 2.30x | 5.09 | 2.85 | yes |
| pef/Pentax K-1 Mark II.pef | 36.1 | RGGB | 18.82 | 8.25 | 2.28x | 5.12 | 2.88 | yes |
| arw/Sony ILCE-7M4 (A7M4).ARW | 32.7 | RGGB | 26.35 | 15.89 | 1.66x | 5.14 | 3.83 | yes |
| srw/Samsung NX1.srw | 28.0 | GRBG | 16.23 | 6.32 | 2.57x | 3.94 | 2.26 | yes |
| arw/Sony NEX-7.arw | 24.3 | RGGB | 13.52 | 5.90 | 2.29x | 3.41 | 1.96 | yes |
| arw/Sony ILCE-7M3 (A7M3).arw | 24.0 | RGGB | 18.97 | 11.00 | 1.72x | 3.41 | 2.60 | yes |
| srw/Samsung NX20.srw | 20.0 | GRBG | 10.21 | 4.39 | 2.33x | 2.94 | 1.73 | yes |
| srw/Samsung NX3000.srw | 20.0 | GRBG | 11.06 | 5.07 | 2.18x | 2.91 | 1.69 | yes |
| srw/Samsung EK-GN120 (Galaxy NX).srw | 19.9 | GRBG | 11.83 | 4.26 | 2.78x | 2.89 | 1.72 | yes |
| dng/Leica T (Typ 701).dng | 16.1 | RGGB | 10.98 | 6.17 | 1.78x | 2.27 | 1.79 | yes |
| raf/FujiFilm EX-2.raf | 16.0 | X-Trans | 10.51 | 5.39 | 1.95x | 2.50 | 1.54 | yes |
| raf/Fujifilm X-E1.raf | 16.0 | X-Trans | 12.43 | 5.93 | 2.10x | 2.56 | 1.56 | yes |
| dng/LG Nexus 5X.dng | 12.1 | RGGB | 8.31 | 4.21 | 1.97x | 1.71 | 1.05 | yes |

- **Same bytes: 14 of 14.** The weights' new two-tap arithmetic can in principle move a value by a last bit
  and so, very rarely, a 16-bit output code; on these 14 frames it moved none.
- **Time.** Median speed-up 2.2x. Extra time over directional: median 10.6 s to 3.7 s, max 18.0 s to 6.0 s;
  0.49 to 0.16 s per megapixel. The two Sony ARWs gain least (1.7x): directional alone takes 7.1 and 9.9 s on them, so
  most of their time is in steps both develops share, not in the blend.
- **Memory.** The peak the develop adds: median 0.142 to 0.086 GB per megapixel, 41% less (25% on the
  A7M4, whose peak is set by steps outside the blend). What is left is mostly the frame itself: the
  white-balanced plane, the bilinear image (h, w, 3) float64 that the blend now overwrites, the directional
  image, and the frame-noise reading's block statistics.
- A synthetic check (a 24 and a 36 MP Bayer plane and a 16 MP X-Trans plane, `_directional` alone):
  10.9 to 4.5 s, 15.1 to 6.0 s and 8.8 to 3.9 s; added peak 0.132-0.144 to 0.070-0.086 GB per megapixel.

## What it does not settle

Noise-aware is still 2.8x directional's time, and `auto` still picks directional: whether the blend's quality
(eval/noise-fallback-real-2026-11-17.md: a median 23% of values moved at ISO 800-6400, little at base ISO) is
worth 3.7 s a frame on a card of 1,000 frames is a product call this note does not make. A next cut: the
frame-noise guard and `frame_measures` each compute block levels of the same plane; the bilinear image could
be float32 as the directional one already is (that would change bytes, so it needs its own quality check).

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 nef orf rw2 srw raf pef dng)
    # the 14 largest raw files, one at a time, with old and new src on PYTHONPATH
    PYTHONPATH=src python tools/noise_aware_cost.py mei/nef/"Nikon D810.nef" ... > new.jsonl
    python tools/noise_aware_cost.py --compare old.jsonl new.jsonl

(numpy 2.5, Python 3.13; about 8 minutes for the 28 runs.) Tests: `tests/test_noise_aware_bands.py`.
