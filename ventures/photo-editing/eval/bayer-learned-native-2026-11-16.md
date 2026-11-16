# The learned Bayer demosaic in C (2026-11-16)

Flagship item (BUILDABLE HERE): "Bayer: a C path for --demosaic learned". The learned per-sensel
Laplacian weight (`eval/bayer-learned-laplace-2026-11-16.md`) was shipped opt-in and numpy-only. It ran
at 4-6x the default's C time, and the C path refused it. This note adds it to the C path.

## What was built

`src/shootflow/bayer_native.py`: a second C function, `learned_map`, computes the eight features of
`bayer_demosaic._laplace_features` and the fitted quadratic of `_laplace_learned` for every sensel of a
band. `shootflow_bayer_piece` then uses that per-sensel weight where it used the fixed `laplace`. It
uses the same float32 operations in the same order as the numpy code. Every intermediate that numpy
shifts (the two colour-difference lines, their Laplacian lines, the curvature, slope, disagreement and
3/16 colour-difference planes) is stored as a plane and read through the clamped-index tables, so
edge reads repeat the way `_sh` repeats them. `-ffp-contract=off` stays on. It was written from this
repository's numpy code.

- `directional(..., laplace="learned")` and `--demosaic learned` now run in C whenever the library
  builds, the same rule as the default. `native=False` forces numpy, `SHOOTFLOW_NATIVE=0` turns every C
  path off, and `laplace="adaptive"` and the median clean-up stay numpy-only.
- A weight tuple (9 linear or 45 pairwise weights, as the trainer passes when it scores a fit) runs
  in C as well. Any other length is refused.
- The 15 feature planes are freed before the 13 demosaic planes are taken, so peak memory per band
  stays at the default's.

## How it was checked

`tools/bayer_native_check.py --laplace learned` (new option) on seven real frames from
drewnoakes/metadata-extractor-images (not committed). The sensor data is read through rawpy 0.25
(LibRaw 0.22), black-subtracted, scaled and white-balanced as the developer does, then demosaiced with
`native=False` and `native=True`. Best of two runs on four CPUs. Rows:
`eval/bayer-learned-native-2026-11-16.jsonl`.

| frame | size | equal bit for bit | numpy, 1 thread | numpy, 4 | **C, 1** | **C, 4** | C vs numpy (4) | default (3/16) C, 4 | LibRaw AHD postprocess |
|---|---|---|---|---|---|---|---|---|---|
| Canon EOS 70D | 5496 x 3670 | yes | 10.46 s | 3.33 s | 5.81 s | **1.24 s** | 2.7x | 0.45 s | 1.31 s |
| Nikon D810 | 7380 x 4928 | yes | 20.30 s | 6.61 s | 11.18 s | **3.35 s** | 2.0x | 1.04 s | 2.30 s |
| Sony A7 III | 6024 x 4024 | yes | 12.80 s | 3.90 s | 7.41 s | **2.01 s** | 1.9x | 0.61 s | 1.24 s |
| Olympus E-M10 | 4640 x 3472 | yes | 8.10 s | 2.98 s | 4.67 s | **1.05 s** | 2.8x | 0.36 s | 1.02 s |
| Pentax K-1 II | 7376 x 4932 | yes | 19.43 s | 6.64 s | 11.18 s | **3.13 s** | 2.1x | 1.21 s | 2.39 s |
| Sony A7 IV | 7028 x 4688 | yes | 18.62 s | 6.56 s | 10.35 s | **3.01 s** | 2.2x | 1.11 s | 2.20 s |
| Canon EOS 7D | 5202 x 3464 | yes | 10.04 s | 3.48 s | 6.23 s | **1.56 s** | 2.2x | 0.56 s | 1.45 s |

- **Every output equals numpy's bit for bit** (largest difference 0.0) on all seven frames, which
  include the 7D's G-B/R-G phase. So every quality number in the learned note holds unchanged for the
  C path.
- **The C path is 1.9-2.8x faster than numpy on four CPUs** and 1.7-1.8x on one. That is less than the
  default's 4.2-4.9x: most of the time goes to the 15 feature passes, which are memory-bound sums.
- **The learned demosaic now costs 2.6-3.3x the default's time**, down from 3.9-6.0x. On a 24 MP frame
  it takes 2.0 s against 0.6 s. That is still the slower choice, so it stays opt-in. The other reason it
  is opt-in is unchanged: it loses on the synthetic sheet.
- The machine was shared with nothing else during the run, but timings on a cloud container vary by
  about 10-20%, so take the ratios from one row, not across rows.
- Synthetic checks (`tests/test_bayer_native.py`, two new tests): bit-identical on all four Bayer
  phases, both red/blue modes, frames from 2 x 2 to 97 x 131, for the fitted model, a linear 9-weight
  model and a constant one. Band height and thread count change no bit. A wrong-length weight list is
  refused. `tests/test_bayer_demosaic.py` now expects `native=True` to equal numpy when the C path
  builds, and to be refused when it does not.

## Open

- Speed: the features recompute neighbour means and Laplacians in several passes. Fusing the passes
  (one pass for the eight raw sums, then the boxes) or building with vectorisation (`-O3`, a separate
  library so the default's bits are untouched) are the next steps. Either one must keep bit equality.
- Whether to make it the default: that depends on the sheet loss (near-Nyquist detail), not on speed
  now. A real photograph with fabric moiré or fine print, with known truth, would settle it.

## Command (from `ventures/photo-editing`)

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/bayer_native_check.py --laplace learned FILE.cr2 [...] > rows.jsonl
