# The noise-aware demosaic's luma, white-balanced noise and per-plane profiles (2026-11-16)

Flagship item (BUILDABLE HERE): "Noise-aware demosaic (opt-in): ... score its luma; per-plane profiles."

**Verdict.**

- **Luma.** The blend helps luma more than colour. On 25 held-out files it raises luma PSNR over the directional default by
  +0.61 dB (Bayer) and +0.92 dB (X-Trans) with the old noise model. With noise drawn before white balance, as a
  sensor draws it, the gain is +0.91 / +1.31 dB. No tile is worse in luma by more than 0.01 dB in any of the
  522 tile x noise x scenario rows per layout (tune and held). The open worry ("luma unscored") is settled.
- **White balance changes the noise the blend sees.** Earlier synthetic noise was drawn on the white-balanced plane,
  the same on every colour. A real sensor's noise is drawn before the gains, so red and blue carry their gain times
  green's sigma (1.13-2.96x on these 46 files' as-shot balances). The blend still gains under that noise (colour +0.29 / +0.45 dB). But the guard's reading of an honest
  profile drifted up through the one-gain carry: 95th percentile 1.16-1.19, up to 1.55. With the Pixel 6 Pro's
  per-plane ratios, honest profiles were trimmed on 12 (Bayer) and 33 (X-Trans) of 174 tiles, and
  a trim cost up to 0.68 dB luma on a tile (Sony NEX-7 scene, SNR 12).
- **Per-plane guard: shipped.** Each colour's pair is now carried by its own gain and checked against that
  colour's sensels (`plane_ratios`). An honest profile then reads 1.02-1.03 at the 95th percentile in every
  scenario, and its trims cost at most 0.12 dB on any tile. A profile overstated on one plane is found and
  scaled on that plane alone. On 24 real DNGs the
  per-plane reading agrees with the mixed one: no real file overstates a single plane. The overstated ones
  (Huawei, LG, OnePlus, Motorola, Pixel 7/8 Pro) overstate all three planes alike.
- **Per-plane blend: measured, not shipped.** Feeding the blend one noise model per colour gave +0.01-0.05 dB
  colour, but cost 0.05-0.07 dB luma against the one-gain carry the ramps were tuned with. It is available as
  `frame_measures(noise=<(3, 2) array>)`. The developer keeps the tuned carry.

The mode stays opt-in. Every number here is still synthetic noise on binned real scenes. A real low- and high-ISO
pair is the missing check.

## Set-up

`tools/noise_aware_planes.py` (new) uses the scenes, tiles, split and ramps of
`eval/xtrans-noise-aware-blend-2026-11-16.md`. That is every raw in drewnoakes/metadata-extractor-images LibRaw
0.22.2 reads (46 files; 31 others are JPEGs or unreadable and skipped), binned 4 x 4, up to three 480 x 480 tiles,
"tune"/"held" by a SHA-1 of the name. Only held rows are reported (25 files, 93 rows per scenario). The ramps are
the shipped `RAMPS`, with no fitting. SNR 60, 25 and 12 at 18% grey, 80% shot noise.

Scenarios:

- **equal**: the old model, noise on the white-balanced plane, the same on every colour;
- **wb**: one raw-scale profile, noise drawn before white balance with the file's own as-shot gains (rawpy
  `camera_whitebalance`, green 1; e.g. Sony A500 R 2.39, B 1.19);
- **pixel**: as wb, with the Pixel 6 Pro's NoiseProfile ratios (red and blue 1.69x green's shot term, 2.25x its
  read term).

Arms: D (directional default), B (bilinear), **mean** (the blend with the carry the developer ships: pairs
averaged, shot x mean gain, read x mean gain^2), **planes** (the blend with each colour's own carried pair), and
each again through `guard_profile` (+g).

## Held-out results

Mean gain over D / worst tile / tiles worse by over 0.1 dB, dB, held-out rows.

**Bayer**

| scenario | colour, mean | colour, planes | luma, mean | luma, planes | luma, B |
|---|---|---|---|---|---|
| equal | +0.41 / +0.00 / 0 | +0.41 / +0.00 / 0 | **+0.61** / +0.00 / 0 | +0.61 / +0.00 / 0 | -2.07 / -9.89 / 65 |
| wb | +0.29 / -0.04 / 0 | +0.30 / -0.02 / 0 | **+0.91** / +0.00 / 0 | +0.86 / +0.00 / 0 | -1.66 / -9.66 / 60 |
| pixel | +0.15 / -0.15 / 2 | +0.17 / -0.11 / 1 | **+1.24** / +0.00 / 0 | +1.19 / +0.00 / 0 | -1.12 / -9.32 / 56 |
| wb, SNR 12 | +0.45 | +0.47 | +1.45 | +1.37 | +0.61 |

**X-Trans**

| scenario | colour, mean | colour, planes | luma, mean | luma, planes | luma, B |
|---|---|---|---|---|---|
| equal | +0.58 / +0.00 / 0 | +0.58 / +0.00 / 0 | **+0.92** / +0.00 / 0 | +0.92 / +0.00 / 0 | -2.32 / -12.08 / 65 |
| wb | +0.45 / -0.05 / 0 | +0.48 / +0.00 / 0 | **+1.31** / +0.00 / 0 | +1.26 / +0.00 / 0 | -1.70 / -11.68 / 57 |
| pixel | +0.34 / -0.32 / 3 | +0.39 / -0.14 / 1 | **+1.76** / +0.00 / 0 | +1.69 / +0.00 / 0 | -0.93 / -11.13 / 52 |
| wb, SNR 12 | +0.68 | +0.74 | +2.03 | +1.96 | +0.91 |

The tables give the unguarded arms. The guard moves their means by under 0.01 dB; its cost on single tiles is
in the next section. Per-SNR rows: run the summary over the jsonl.

How to read it:

- **Luma gains more than colour, everywhere.** It is up to +2.7 dB at SNR 12 on X-Trans. That fits the earlier
  finding that bilinear's luma is better under noise. Bilinear alone is still far worse on average (-0.9 to
  -2.3 dB), because it loses on detailed tiles. The blend keeps both.
- **The "equal" colour gains here (+0.41 / +0.58) are higher than the first note's (+0.31 / +0.43).** That note
  averaged in noise-free rows (gain 0), which this one leaves out.
- **Per-colour noise in the blend is a trade, not a win.** The one-gain carry slightly overstates red and blue's
  share on a green-heavy CFA, which leans the blend toward bilinear. Luma likes that; colour a little less.

## The guard on honest profiles

`guard_profile`'s reading of the true noise (all 174 rows per layout; 1.0 is exact, the cap is 1.25):

| layout, scenario | one-gain carry: median / 95th / max, tiles over 1.25 | per plane: median / 95th / max, over 1.25 |
|---|---|---|
| Bayer equal | 0.83 / 0.99 / 1.31, 1 | 0.88 / 1.03 / 1.38, 2 |
| Bayer wb | 0.97 / 1.16 / 1.49, 3 | 0.89 / 1.03 / 1.38, 2 |
| Bayer pixel | 1.07 / 1.29 / 1.63, **12** | 0.92 / 1.02 / 1.38, 2 |
| X-Trans equal | 0.83 / 0.99 / 1.33, 1 | 0.89 / 1.03 / 1.37, 1 |
| X-Trans wb | 0.98 / 1.19 / 1.55, 4 | 0.89 / 1.03 / 1.37, 1 |
| X-Trans pixel | 1.10 / 1.35 / 1.67, **33** | 0.91 / 1.03 / 1.37, 1 |

The per-plane reading does not move with the white-balance gains or the plane ratios. The one-gain reading does,
because it compares a mixed-colour spread against a mixed-colour model whose weights are wrong (the mean of three
gains, not of the sensels). Trimming an honest profile is not free.
On single tiles the guard through the one-gain carry moved luma by more than 0.05 dB on 14 (Bayer) and 20
(X-Trans) of 522 rows, worst -0.68 / -0.59 dB (Sony NEX-7 scene, pixel, SNR 12, read 1.63-1.67). The per-plane
guard did so on 3 and 3 rows, worst -0.10 / -0.12 dB. Averaged over every tile, both stay within 0.01 dB of
unguarded. And only the per-plane reading can name the plane. The synthetic unit test overstates blue 8x
and leaves red and green honest. Per plane, blue reads 8 within 20% and is scaled alone, and the others are kept
(`tests/test_demosaic_noise_aware.py`).

## 24 real DNGs, per plane

`tools/noise_profile_check.py` now also writes `plane_ratios` (R, G, B). It was run on 24 files from raw.pixls.us:
the 10 whose three pairs differ, the other three Adobe-written ones, and 11 others spanning honest and
overstated. Each was downloaded one at a time and deleted. The earlier note counted nine files with per-plane
pairs, but its own list (six Pixels, a D80, two Xiaomis and an asus) is ten. Readings over the 1.25 cap are in
bold; the rows are in `eval/noise-profile-planes-real-2026-11-16.jsonl`.

| file | pairs differ by plane | mixed (old) | R / G / B |
|---|---|---|---|
| Canon 5D Mark III (Adobe) |  | 1.20 | 1.05 / 1.09 / 0.97 |
| iPhone 8 |  | 0.74 | 0.55 / 0.65 / 0.63 |
| Canon 7D Mark II (Lightroom) |  | 0.96 | 0.91 / 0.90 / 0.90 |
| Fujifilm X100S (Adobe) |  | 0.94 | 0.90 / 0.88 / 0.83 |
| Pixel 3a | yes | 0.92 | 0.83 / 0.83 / 0.90 |
| Pixel 4 XL | yes | 1.18 | 0.86 / **1.34** / 0.91 |
| Pixel 4a | yes | 0.86 | 0.70 / 0.68 / 0.79 |
| Pixel 6 Pro | yes | 1.08 | 0.96 / 0.89 / 0.94 |
| Pixel 7 Pro | yes | **1.82** | **1.57** / **1.58** / **1.50** |
| Pixel 8 Pro | yes | **2.16** | **2.16** / **1.94** / **1.98** |
| Huawei P20 (CLT-L09) |  | **5.16** | **4.72** / **4.58** / **4.34** |
| Huawei P9 (EVA-L09) |  | **5.30** | **4.29** / **4.88** / **4.62** |
| Honor 8 (FRD-L09) |  | **3.21** | **3.46** / **2.66** / **3.20** |
| LG G5 (H850) |  | **16.80** | **14.51** / **12.38** / **17.06** |
| Nexus 5X |  | 0.85 | 0.79 / 0.78 / 0.83 |
| Nikon D80 (Lightroom) | yes | 1.00 | 1.01 / 0.92 / 0.82 |
| OnePlus 5 |  | **3.43** | **3.22** / **3.01** / **3.19** |
| Samsung S6 (SM-G920F) |  | 0.71 | 0.70 / 0.68 / 0.73 |
| Samsung S7 (SM-G930F) |  | 1.19 | 1.20 / 1.10 / 1.16 |
| Samsung S9 (SM-G960F) |  | 1.10 | 1.01 / 1.06 / 1.02 |
| Xiaomi POCO (M2010J19CG) | yes | 0.91 | 0.85 / 0.86 / 0.90 |
| Xiaomi Mi 8, HDR+ | yes | 0.87 | 0.81 / 0.81 / 0.86 |
| asus ROG Phone (I01WD) | yes | 0.45 | 0.42 / 0.48 / 0.34 |
| Moto G (5S) Plus |  | **17.66** | **15.75** / **12.93** / **17.27** |

Only one real file overstates one plane and not the others. Everywhere else, where the mixed reading flagged a
profile all three planes are over the cap, and where it passed one all three pass. The exception is the Pixel 4
XL, whose green reads 1.34: its green pair has the higher shot term and a 4.7x lower read term. The per-plane guard
trims that plane to 1.25x and keeps red and blue. On real files, then, the per-plane guard changes little. Its value
is a reading of an honest profile that holds still across gains, which the synthetic table shows.

## What shipped

- `xtrans_demosaic`: `as_planes`, `variance_map`, `plane_ratios`, `_colour_block_spread`, `_residual` (split out
  of `_block_spread`; same numbers), `_bin_ratio` (split out of `profile_ratio`; same numbers).
  `frame_measures(noise=)` takes one pair or a (3, 2) array, and with three equal pairs gives the one-pair result
  exactly (tested). `guard_profile` takes either: three pairs are checked and scaled plane by plane.
- `raw_develop.noise_profile_planes`: NoiseProfile as R, G, B pairs, mapped through CFAPlaneColor (tag 50710,
  default 0 1 2). A single pair is repeated. A pair count that does not match the planes, or a plane order that
  does not name R, G and B once each, is refused (develops directional, as with no profile).
- `raw_develop_np._directional` (`--demosaic noise-aware`): the guard runs per plane, each pair carried by its own
  gain, then the guarded pairs are averaged into the one-gain carry the blend was tuned with. On the unit-test DNG
  an honest profile now reads under the cap (it read 1.3x before, which the old test excused).
- Cost: `plane_ratios` takes about 1.5x the single reading (9.8 s against 6.6 s on a 24 MP random plane, four
  cores, under load; 3-21 s per real file while other jobs ran).
- Tests (`tests/test_demosaic_noise_aware.py`, 16, 4 new): three equal pairs give the one-pair blocks exactly; a
  bad shape is refused; per-plane ratios read about 1 on honest noise with red 2x and blue 1.6x green's sigma; blue
  8x is named and scaled alone, on both CFAs; NoiseProfile planes parse, follow CFAPlaneColor and refuse bad
  counts or orders; a DNG whose blue pair is 8x reads 8x in the develop notes; an honest one is no longer trimmed.

## Not done / open

- **A real low- and high-ISO pair** of one static scene, still the check that would make this the default.
- **Ramps refitted for luma.** The ramps were fitted on colour. Luma seems to want a little more bilinear (the
  per-plane carry, which leans less to bilinear, lost luma), so a luma-weighted or joint fit on tune might gain
  more.
- **Frames with no smooth region** still read low (optical-black floor).
- **LinearRaw DNGs** carry profiles but have no mosaic.

## Commands (from `ventures/photo-editing`, numpy and rawpy 0.28 / LibRaw 0.22.2)

    M=<sparse checkout of drewnoakes/metadata-extractor-images with arw nef cr2 rw2 srw orf raf>
    ls $M/{arw,nef,cr2,rw2,srw,orf,raf}/* | grep -vi metadata > files.txt
    tr '\n' '\0' < files.txt | PYTHONPATH=src xargs -0 python tools/noise_aware_planes.py --bayer --cache /tmp/truths > bayer.jsonl
    tr '\n' '\0' < files.txt | PYTHONPATH=src xargs -0 python tools/noise_aware_planes.py --raf "$M/raf/Fujifilm X-E1.raf" --cache /tmp/truths > xtrans.jsonl
    # real DNGs: for each url in eval/noise-profile-planes-real-2026-11-16.jsonl, download, then
    PYTHONPATH=src python tools/noise_profile_check.py FILE.dng >> rows.jsonl

Rows: `eval/bayer-noise-aware-planes-2026-11-16.jsonl`, `eval/xtrans-noise-aware-planes-2026-11-16.jsonl`,
`eval/noise-profile-planes-real-2026-11-16.jsonl`. Python 3.13, four cores. The synthetic pass took about 70 minutes
on two processes, and the real pass about 80 minutes alongside it.
