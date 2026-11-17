# The noise-aware develop's bilinear image in float32: 15% less memory, changes only at tone-table boundaries (2026-11-17)

Flagship item (eval/noise-aware-full-frame-cost-2026-11-17.md, "What it does not settle": "the bilinear image
could be float32 as the directional one already is (that would change bytes, so it needs its own quality
check)"). This is that change and that check.

**Verdict: shipped. On the same 14 public sample raws the memory the noise-aware develop adds falls a median
15% further (0.086 to 0.073 GB per megapixel; 10-36% per file), its time is unchanged (median 1.00x, 0.93-1.04x),
and 13 of 14 outputs change in at most 4.0e-5 of their 16-bit values. Every one of the 7,508 changed values is
exactly one step of the develop's 4,096-entry tone table.** Those are values that sat within float32 rounding
(about 6e-8 of the range) of the midpoint between two table entries; the float64 develop rounds them just as
arbitrarily, so neither output is the more correct one. The PSNR between old and new output is 114-126 dB.

## What changed

- `raw_develop_np._noise_aware_plane` makes the bilinear image `np.float32` instead of `np.float64`. The blend
  writes over it band by band (`xtrans_demosaic.blend(..., out=)`), so the blended image is float32 too. Each
  band's own arithmetic (weights, `a * d + (1 - a) * b`, the luma step) is still float64; only storage is
  float32. Bayer's directional image was already float32 (`bayer_demosaic`); X-Trans's is float64 and stays so.
- Two consumers widen a float32 image back to float64 so their arithmetic is unchanged: `_encode_image`
  (per band, `np.asarray(..., dtype=np.float64)`; numpy 2 would otherwise run the clip, colour matrix and
  table lookup in float32), and `_half_linear`'s 2 x 2 sums (`astype(np.float64)` instead of `0.0 +`). Both
  are no-ops on float64 input, so every other develop (bilinear, directional, learned) keeps its bytes.
- `noise_aware()` called on its own (the eval tools) still builds a float64 bilinear image, so the scores in
  earlier eval notes are unaffected.
- `tests/test_noise_aware_bands.py`: the develop path returns float32, is within 4 float32 steps (2.4e-7) of the
  float64 blend on Bayer and X-Trans under a light and a heavy blend, and its bytes do not depend on the
  thread count.
- `tools/noise_aware_cost.py --keep DIR` saves each output; `--codes OLD NEW` compares two sets code by code.

## Method

`tools/noise_aware_cost.py`, as in eval/noise-aware-full-frame-cost-2026-11-17.md: the 14 largest raws of
drewnoakes/metadata-extractor-images, developed at full size on the numpy engine with
`demosaic="noise-aware"` (13 take the frame-read noise model, the Nexus 5X DNG its own profile), old code
(main before this change) and new alternating per file on this container's 4 cores, peak memory added by
`tracemalloc`, outputs kept as uint16 arrays. The one-step check: for each file, the sorted set of distinct
output values (old and new together; 1,028-4,096 of them, which are the tone table's entries) and, for each
changed value, whether old and new are neighbours in that set.

## Results

`noise-aware-float32-2026-11-17.out.txt` (rows: `noise-aware-float32-{old,new}-2026-11-17.jsonl`):

| file | MP | added peak GB, old | new | change | values changed | share | all one table step |
|---|---|---|---|---|---|---|---|
| nef/Nikon D810.nef | 36.4 | 2.86 | 2.44 | -15% | 187 | 1.7e-6 | yes |
| nef/Nikon 800E.nef | 36.3 | 2.88 | 2.44 | -15% | 471 | 4.3e-6 | yes |
| pef/Pentax K-1 Mark II.pef | 36.1 | 2.86 | 2.46 | -14% | 0 | 0 | (identical) |
| arw/Sony ILCE-7M4 (A7M4).ARW | 32.7 | 3.85 | 2.45 | -36% | 994 | 1.0e-5 | yes |
| srw/Samsung NX1.srw | 28.0 | 2.25 | 1.91 | -15% | 555 | 6.6e-6 | yes |
| arw/Sony NEX-7.arw | 24.3 | 1.98 | 1.67 | -16% | 623 | 8.5e-6 | yes |
| arw/Sony ILCE-7M3 (A7M3).arw | 24.0 | 2.61 | 1.70 | -35% | 583 | 8.1e-6 | yes |
| srw/Samsung NX20.srw | 20.0 | 1.72 | 1.49 | -13% | 27 | 4.5e-7 | yes |
| srw/Samsung NX3000.srw | 20.0 | 1.71 | 1.47 | -14% | 522 | 8.7e-6 | yes |
| srw/Samsung EK-GN120 (Galaxy NX).srw | 19.9 | 1.71 | 1.45 | -15% | 215 | 3.6e-6 | yes |
| dng/Leica T (Typ 701).dng | 16.1 | 1.80 | 1.18 | -34% | 963 | 2.0e-5 | yes |
| raf/FujiFilm EX-2.raf | 16.0 | 1.55 | 1.36 | -12% | 584 | 1.2e-5 | yes |
| raf/Fujifilm X-E1.raf | 16.0 | 1.59 | 1.39 | -13% | 338 | 7.1e-6 | yes |
| dng/LG Nexus 5X.dng | 12.1 | 1.03 | 0.93 | -10% | 1,446 | 4.0e-5 | yes |

- **Memory.** Median 15% less added peak (10-36%). The three files whose peak was set outside the blend in the
  previous note (the two Sony ARWs at 25% there, the Leica T) gain most here, 34-36%: their peak was the moment
  the float64 bilinear and directional images were both held, and that is the array this change halves.
- **Time.** Unchanged within run-to-run noise (0.93-1.04x). The blend is bound by its float64 band arithmetic,
  not by the frame's storage.
- **Output.** The changed values are 16-198 codes apart, which looks large but is one entry of the tone table:
  the develop maps linear values through a 4,096-entry table (`raw_develop.py`, `lut_size = 4096`), so a 16-bit
  output takes at most 4,096 distinct values per channel (1,028-4,096 here), and neighbouring entries are tens
  of codes apart in the midtones (the changed values sit at codes 14,000-34,600). No changed value differs by
  less than a full step, and none by more than one.

## What it shows beyond this change

The tone table, not the working precision, is the develop's coarsest rounding: about 12 bits of tonal
resolution in a 16-bit file, with steps of up to about 200 codes. That is invisible in an 8-bit export but
shows as banding when a 16-bit TIFF is pushed hard in an editor. Interpolating between table entries (or a
larger table) would give the output its full 16 bits; it changes every develop's bytes, so it needs its own
check against the pure path and LibRaw (NEXT.md).

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw nef srw raf pef dng)
    # each of the 14 files, alternating old and new src on PYTHONPATH
    PYTHONPATH=src python tools/noise_aware_cost.py --keep new/ mei/nef/"Nikon D810.nef" ... > new.jsonl
    python tools/noise_aware_cost.py --compare old.jsonl new.jsonl
    python tools/noise_aware_cost.py --codes old/ new/

(numpy 2.5, Python 3.13; about 7 minutes for the 28 runs.) Tests: `tests/test_noise_aware_bands.py`.
