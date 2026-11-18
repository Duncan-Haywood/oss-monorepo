# A per-frame noise scale for `--demosaic noise-aware`: tune-only picks fail held-out, one tile decides it (2026-11-17, evening)

Flagship item (portfolio/flagships.yaml `buildable:`, NEXT.md "Raws without a profile"): with no NoiseProfile the
noise-aware demosaic reads the noise from the frame (patch PCA, sigma x 0.8, guarded;
eval/noise-pca-estimator-2026-11-17.md). The 0.8 gives up gain on noisy frames: on Bayer held tiles it keeps
41-71% of the true model's luma gain. The item was to win that back with a scale picked on tune rows only.
The earlier note said the 0.8 was itself chosen after reading held rows.

**Verdict: nothing shipped to the defaults. No tune-only rule tried here beats 0.8 without held-out losses.**
I tried a constant scale on a finer grid, and two-level rules that use a higher scale where the frame's own
statistics say its spread is mostly noise (three features, 861 rules). The fit rule picks a scale of 1.25,
from a constant or a rule, and on held tiles that loses up to 2.51 dB on 11 rows. Even 0.9 loses 0.21 dB on 4
held rows. At every scale up to 1.1, every held row that loses comes from the same tile: one Sony NEX-5N crop
out of 30 held tiles. None of the three frame features can tell it apart from a noisy frame. `frame_noise` stays
at 0.8.

What this run adds:

- `noise_pca.estimate_noise_pca(..., info=)` reports how many patches the weak-texture test kept. This
  costs nothing extra.
- `noise_pca.bin_mosaic` and `noise_pca.whiteness`.
- `tools/noise_aware_estimated.py` gains `sweep --features-only`, `sweep --card` and `adapt`.
- The rows, so the next try starts from data, not from a re-run.

## Method

The scenes, tiles, tune/held split, SNRs (200/60/25/12 at 18% grey), two noise scenarios and seeds are
eval/noise-pca-estimator-2026-11-17.md's. There are 45 readable Bayer files from drewnoakes/metadata-extractor-images,
binned 4 x 4, giving 216 tune rows (27 tiles, 21 files) and 240 held rows (30 tiles, 24 files). Arms are
`pcaguard@s`: the patch-PCA model times s^2, through `guard_profile`, with s in 0.8, 0.9, 1, 1.1, 1.25 and 1.5.
The shipped model is s = 0.8. The `pcaguard@0.8` gains reproduce the earlier note's to the last digit (456 of
456 rows).

Per noisy tile, three frame-only features (`sweep --features-only`, the same draws):

- `ratio`: sigma at 18% grey by block spread (`estimate_noise`) over sigma by patch PCA. Texture inflates
  block spread far more than PCA's small eigenvalues, so a ratio near 1 should mean "mostly noise".
- `kept`: the share of patches PCA's weak-texture test keeps.
- `white`: PCA's sigma on the mosaic binned 2 x 2 in same-colour sensels, over its sigma on the mosaic itself.
  White noise halves under binning; scene texture does not.

The `adapt` rule takes s_hi where the feature is on its noise side of a threshold t and s_lo elsewhere. Thresholds
are the 5th to 95th percentiles of the tune rows' feature values, and both scales come from the grid; constants
are included. It keeps the rule with the best tune mean of luma + colour gain over directional, subject to no tune
row worse than directional by over 0.1 dB in either metric. Held rows are scored once, after the pick.

## Results

Constant scales, gain over directional in dB (mean luma, mean colour, worst row, held rows worse than
directional by over 0.1 dB):

| scale | tune luma | tune colour | tune worst | held luma | held colour | held worst | held rows < -0.1 |
|---|---|---|---|---|---|---|---|
| 0.8 (ships) | +0.695 | +0.420 | -0.01 | +0.519 | +0.362 | -0.03 | 0 |
| 0.9 | +0.820 | +0.456 | -0.01 | +0.619 | +0.404 | -0.21 | 4 |
| 1.0 | +0.913 | +0.469 | -0.02 | +0.681 | +0.412 | -0.73 | 5 |
| 1.1 | +0.977 | +0.465 | -0.03 | +0.710 | +0.396 | -1.44 | 9 |
| 1.25 | +1.027 | +0.437 | -0.07 | +0.711 | +0.338 | -2.51 | 13 |
| 1.5 | +1.029 | +0.368 | -0.15 | +0.657 | +0.210 | -3.87 | 33 |
| true model | +0.939 | +0.414 | | +0.783 | +0.378 | | 0 |

- **The tune rows cannot see the failure.** Every scale up to 1.25 keeps every tune row within 0.07 dB of
  directional. So the rule climbs to 1.25: tune luma +1.027, more than the true model's +0.939. On held rows
  that scale has 11 rows (luma) and 12 (colour) worse than directional, worst -2.51 dB (`adapt`; 730 of 861
  rules pass the tune check). A stricter tune margin (0.03 dB) picks `ratio <= 2.19 ? 1.25 : 1.0`, which still
  has 7 held rows (luma) and 9 (colour) worse, worst -2.51.
- **One tile decides it.** At 0.9 and 1.0, all 4 and 5 held losing rows are the Sony NEX-5N crop at (168, 372).
  On that crop PCA reads sigma about 0.024 at every SNR, including SNR 200, where the true sigma is 0.0009. The
  crop's own fine detail reads as noise. Leaving that tile out, 1.0 would keep 92% of the true luma gain (+0.718
  of +0.783, worst -0.06). That number is reported only to show the size of the prize. Dropping a held tile
  after looking is not a test.
- **None of the three features flags that crop.** Its `ratio` is 1.95-2.23, inside the middle half of held rows
  (1.38-2.51). Its `kept` is 0.03-0.28, about the held median of 0.10. Its `white` is 0.54-0.66 on seven of its eight rows (0.82 on one), against a held
  median of 0.63, so it reads as about as white as a noisy frame: its texture is grain-like at sensel scale.
  Every two-level rule that raises the scale on the "noisy" side also raises it on this crop.
- **`white` is weak on these tiles for a second reason.** The binned plane of a 480 x 480 tile is 240 x 240,
  and PCA under-reads there. On pure white noise `white` reads 0.39 on 480 x 480 and 0.50 from 960 x 960 up
  (`tests/test_noise_pca.py` pins the 960 case). On whole frames it would be closer to its design. On these
  tiles it is noisy by construction.

## A card-level reading: the right idea, not testable on this set

Frames from one body at one ISO share the sensor's noise and do not share their texture. So the lowest PCA
reading across a card's frames at the same ISO should strip out scene texture that a single frame cannot.
`sweep --card` stands in each file's tiles for one card's frames: `card@s` rescales the frame's model to s times
the lowest sigma of its file's tiles at the same SNR and scenario.

The data cannot test it. 39 of the 45 files yield one 480 x 480 tile, and only 6 yield three, because the
binned scenes are small. The NEX-5N file is one of the single-tile files, so its card floor is its own reading.
The results are in line with that:

- Tune picks `card@1.25` (luma +0.994).
- Held `card@1.25` has 11 rows worse, worst -2.51.
- Held `card@0.9` and `card@1.0` lose only on the NEX-5N crop, as before.
- On held files with three tiles, the floor lowers the reading, so `card@0.8` gains less than `pcaguard@0.8`
  (+0.451 against +0.519).

Testing the idea needs several real frames per body at one ISO, scored against truth. That can be a real ISO
series: dark frames, or a flat field shot at rising ISO. It can also be many synthetic crops cut from one
larger, unbinned frame.

## What would move this

1. A card-level floor tested on real cards. raw.pixls.us carries several files for many bodies. Take the
   lowest PCA reading among frames of one body at one ISO, and score it on crops whose truth is known. The
   shootflow ingest already groups a card by body; the floor would sit there, not in `frame_noise`.
2. A texture-free read-noise floor from the optical-black (masked) area of real raws (LibRaw exposes it).
   It bounds `read`, not `shot`, so it helps the dark end only.
3. More tune tiles with loud, grain-like texture, so a tune-only pick can see the failure before held rows
   do. Today only one of 57 tiles has it.

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 nef orf rw2 srw raf)
    find "$PWD"/mei/{arw,cr2,nef,orf,rw2,srw,raf} -type f ! -name 'Fujifilm X-E1.raf' ! -name '*.txt' > bayer.txt  # 50, 45 open
    tr '\n' '\0' < bayer.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/noise_aware_estimated.py sweep --bayer --pca --scales 0.8,0.9,1,1.1,1.25,1.5 --cache /tmp/truths > sweep.jsonl
    tr '\n' '\0' < bayer.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/noise_aware_estimated.py sweep --bayer --features-only --cache /tmp/truths > feats.jsonl
    python tools/noise_aware_estimated.py adapt sweep.jsonl --feats feats.jsonl --grain eval/noise-estimated-scene-grain-2026-11-17.jsonl
    tr '\n' '\0' < bayer.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/noise_aware_estimated.py sweep --bayer --card feats.jsonl --scales 0.8,0.9,1,1.1,1.25,1.5 --cache /tmp/truths > card.jsonl
    python tools/noise_aware_estimated.py fit card.jsonl

The sweeps took about 10 minutes each at four processes; the features pass took 1.5 minutes (Python 3.13,
numpy 2.5.3, LibRaw 0.22.2 through rawpy). Files:

- `noise-scale-per-frame-sweep-2026-11-17.jsonl`: rows, with ratio and kept.
- `noise-scale-per-frame-feats-2026-11-17.jsonl`: all three features.
- `noise-scale-per-frame-fit-2026-11-17.jsonl`: the `adapt` output.
- `noise-scale-card-2026-11-17.jsonl`: the card arms.
