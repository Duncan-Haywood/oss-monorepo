# Real DNG NoiseProfiles against the noise in the frame, and a guard for the noise-aware demosaic (2026-11-16)

Flagship item (BUILDABLE HERE, from `eval/xtrans-noise-aware-blend-2026-11-16.md`, "Not done / open"): "More
real NoiseProfiles ... Checking each profile against the in-frame estimate, and refusing a profile that reads
far above it, would make the mode safe enough to be the default for DNGs."

**Verdict.** Real NoiseProfiles are often wrong, and always in the direction that hurts. Of 83 CFA DNGs from
80 bodies on raw.pixls.us, **43 state more than 1.25x the noise their own sensels show, 25 more than 2x and 11
more than 5x, up to 77x.** Fed to `--demosaic noise-aware` unchecked, a 4x-16x overstatement costs 1.4-10.6 dB
colour PSNR on a synthetic scene where the true profile gains 0.2-0.5 dB over the directional default. The developer now checks every
profile against the mosaic (`xtrans_demosaic.profile_ratio`) and scales one that reads over 1.25x down to 1.25x
(`guard_profile`). On the synthetic scene that recovers the true profile's result to within 0.02 dB at every
overstatement from 2x to 100x, on Bayer and X-Trans. The check also found a reader bug: 14 of the 83 profiles
(Samsung, OnePlus, Xiaomi, LG, asus) write a read-noise term of exactly 0, which DNG 1.7.1.0 allows, and the
reader refused them, so those files fell back to the directional demosaic.

The mode stays opt-in. The guard removes the risk the first note named (an overstated profile). What is left
is that every dB figure here is still colour PSNR on synthetic noise.

## What was measured

**The files.** raw.pixls.us lists 262 DNGs (crawled 2026-11-16, 83 makers, 1,035 model folders). Their tags
were read with HTTP range requests (no full download): 105 carry tag 51041. The 84 CFA ones (one or two per
body; the LinearRaw files of newer Samsungs and the iPhone 12 Pro are out of scope, since the blend needs a
mosaic) were downloaded one at a time, checked and deleted. One (Xiaomi HM NOTE 1LTE, FreeDcam) has a broken
IFD chain the reader refuses. That leaves 83 files from 80 bodies.

**The check** (`tools/noise_profile_check.py`). Each file goes through `develop(demosaic="noise-aware")` up to
the white-balanced sensel plane the blend sees. The plane and the profile carried to it (shot x mean gain,
read x mean gain^2) are exactly what the developer uses. Then:

- `profile_ratio`: the 24 x 24 blocks go in eight brightness bins, as the existing noise fit does. Blocks that
  reach the frame's top value are dropped as clipped, and so are bins within 3 sigma of black. In each bin, the
  15th percentile of the blocks' noise spread (the median leave-one-out residual against same-colour
  neighbours) is compared with the profile's sigma at the bin's median level. The reading is the largest ratio
  over the bins, after correcting for the spread's known bias (below).
- For comparison, the older reading: the two-parameter fit of the whole frame
  (`estimate_noise`, which is what `frame_measures(noise=None)` used) compared at the median block level.

**Why the largest bin.** Texture only adds to a block's spread, so a textured bin reads the profile as
*less* overstated than it is. The cleanest bin is the one closest to the truth, and texture elsewhere in the
frame cannot hide an overstated profile. The fitted model, by contrast, mixes bins. On a half-smooth,
half-detailed synthetic scene it read an honest profile as 0.13-0.28 of the frame's noise, so a 4x
overstatement looked honest.

**The bias correction** (`tools/noise_profile_guard_synth.py`, output in
`eval/noise-profile-guard-synth-2026-11-16.out.txt`). On a smooth gradient field with known Poisson-Gaussian
noise, the in-frame estimate reads 0.80 of the true sigma (true over estimate 1.254 Bayer, 1.232 X-Trans).
With texture added it reads higher (0.84 at 4% texture). `ESTIMATE_BIAS = 1.25` corrects for the smooth-field
case only, so the correction can never inflate a textured reading.

## Synthetic check: does the ratio read the overstatement, and does the guard recover?

Scene: 288 x 288, the left half a smooth gradient, the right half a chirp up to near the sampling limit.
Poisson-Gaussian noise at two levels. Colour PSNR (dB) of the directional default, the noise-aware blend with
the true noise, the blend with the noise overstated k times (in sigma), and the blend with that overstated
profile through `guard_profile`.

| CFA, shot | k | directional | true noise | overstated | guarded | ratio read |
|---|---|---|---|---|---|---|
| Bayer 5e-5 | 1 | 47.77 | 48.15 | 48.15 | 48.15 | 0.95 |
| | 4 | | | 46.51 | **48.16** | 3.81 |
| | 16 | | | 37.54 | **48.16** | 15.25 |
| | 100 | | | 37.37 | **48.16** | 95.33 |
| Bayer 2e-4 | 1 | 42.49 | 43.01 | 43.01 | 43.01 | 1.02 |
| | 4 | | | 39.40 | **43.03** | 4.09 |
| | 16 | | | 36.80 | **43.03** | 16.34 |
| X-Trans 5e-5 | 1 | 43.40 | 43.63 | 43.63 | 43.63 | 0.96 |
| | 4 | | | 42.24 | **43.63** | 3.85 |
| | 16 | | | 34.94 | **43.63** | 15.40 |
| X-Trans 2e-4 | 1 | 40.50 | 40.99 | 40.99 | 40.99 | 0.95 |
| | 4 | | | 36.81 | **40.97** | 3.81 |
| | 16 | | | 34.28 | **40.97** | 15.22 |

The ratio reads k to within 5%. An overstated profile is worse than plain directional from 4x up (by 1.2-3.7
dB at 4x and 5.7-10.2 dB at 16x). Guarded, every row is within 0.02 dB of the true-noise result. The 2x rows (in the .out.txt) cost
0.0-0.5 dB unguarded and nothing guarded. The limit: a frame with **no** smooth region anywhere has no clean
bin, so the ratio reads low and the guard lets more through. A whole-frame chirp read an honest profile as
0.09-0.17.

## The real profiles

`eval/noise-profile-real-dngs-2026-11-16.jsonl` holds one row per file. `profile_ratio`, by who wrote the DNG:

| writer | files | profile_ratio | over 1.25x |
|---|---|---|---|
| Adobe DNG Converter / Lightroom (5D Mark III, 7D Mark II, D80, X100S) | 4 | 0.94-1.20 | 0 |
| Apple's own camera (iPhone 8) | 1 | 0.74 | 0 |
| iPhone third-party apps (VSCO, ProCamera 10.2, Camera+ 9; ProCamera 12.4) | 4 | 14, 30, 32; 0.91 | 3 |
| Samsung (Galaxy S6 to S10) | 11 | 0.71-1.19, median 0.92 | 0 |
| Google phones (Nexus 5X, Nexus 6, Pixel 2 XL to 8 Pro) and HDR+ on a Xiaomi Mi 8 | 10 | 0.84-2.16, median 0.93 | 2 (Pixel 7 Pro 1.82, 8 Pro 2.16) |
| Hasselblad (L1D-20c, L2D-20c), Sigma fp L | 3 | 1.08-1.14 | 0 |
| Sigma fp (ISO 3200) | 2 | 1.68, 1.72 | 2 |
| Huawei and Honor | 18 | 0.86-7.10, median 2.2 | 17 |
| DJI | 6 | 0.92-3.44 | 4 |
| OnePlus, LG, motorola, Nokia, Microsoft, Xiaomi, HTC, HMD, Realme, asus, bq | 21 | 0.45-77, median 1.44 | 12 (LG H850 17x, US996 30x, Moto G5S Plus 18x, bq Aquaris U Plus 77x) |
| KanDao QooCam, QooCam 8K | 3 | 1.93-4.95 | 3 |

How to read it:

- **Where a profile is likely honest, the ratio says so.** Adobe-written profiles read 0.94-1.20, Apple's own
  0.74, Samsung's 0.71-1.19 and Hasselblad's about 1.08. That is the synthetic check's 0.95-1.02 for an honest
  profile, plus real-file spread, so the cap at 1.25 sits just above the honest cluster.
- **A ratio above 1 means the sensels are quieter than the profile says.** Either the profile is wrong, or the
  camera denoised the raw data before writing it. The spec allows the second ("When noise reduction has already
  been applied ... this tag may be used to estimate the white component of the residual noise"), but only 4 of
  the 84 files write NoiseReductionApplied (tag 50935): three 0s and Lightroom's "Enhanced NR" file, which reads
  0.96. Either way, the blend has to respond to the noise that is actually in the data, so scaling is right in
  both cases.
- **The worst offenders are the ones a user is most likely to hand us**: phone DNGs from third-party camera
  apps and older Android phones, at 14x-77x. Unguarded, those files would have blended almost every block to
  bilinear.
- **The older reading (whole-frame fit at the median level)** agrees on the extremes but not in the middle:
  Google Pixel 4a 0.56 against `profile_ratio`'s 0.86, Huawei FRD-L09 0.83 against 3.21. It is the comparison
  the synthetic check showed to be fooled by texture, and it is what the first note's "about 20% above the
  in-frame estimate" for the Nexus 5X used. This Nexus 5X file reads 0.85.

## The reader bug: zero read noise

DNG 1.7.1.0, NoiseProfile: "Each S_i term must be positive (S_i > 0), and each O_i term must be non-negative
(O_i >= 0)." `raw_develop.noise_profile` had the test the other way round: it refused O_i = 0 and accepted
S_i = 0. On raw.pixls.us, 14 files write O_i = 0 (Samsung Galaxy S6 to S10, OnePlus 3T and 5, Xiaomi Redmi Note 7
and 8T, LG G3 via FreeDcam, asus ROG Phone), so `--demosaic noise-aware` fell back to directional on all of
them. Now S_i <= 0 or O_i < 0 is refused, and a zero read term is accepted. With the guard in place, 5 of those
14 read over 1.25x (OnePlus 3T 2.25, OnePlus 5 3.43, Redmi Note 7 1.51, Redmi Note 8T 1.66, LG D855 1.52;
Samsung 0.71-1.19).

## What shipped

- `xtrans_demosaic._block_spread`, `estimate_noise` (split out of `frame_measures`; same numbers),
  `profile_ratio`, `guard_profile`, `ESTIMATE_BIAS = 1.25`, `PROFILE_CAP = 1.25`.
- `raw_develop_np._directional` runs the guard on the noise-aware path, full and half size, before the blend.
  When it scales a profile, the develop notes say so ("NoiseProfile states 16.8x the noise in the frame:
  scaled to 1.25x for the noise-aware blend"). The profile's shot/read shape is kept, and both terms are scaled
  by the same factor.
- `raw_develop.noise_profile`: the DNG 1.7.1.0 rule (S > 0, O >= 0).
- Cost: the guard takes a median 2.7 s per file (1.4-14 s, the last a 61 MP Sigma fp L) on four cores, on top of
  the noise-aware develop.
- Tests (`tests/test_demosaic_noise_aware.py`, 12, 4 new): the ratio reads 1x, 4x and 16x within 20% on a
  half-textured scene for both CFAs; the guard keeps an honest profile, scales a 16x one and keeps its shape;
  the guarded blend comes within 5% MSE of the honest one where the unguarded one is over 2x worse; the
  developer notes a 20x profile and gives an honest one at most a trim. Zero read terms parse, and zero shot
  terms are refused.
- `tools/noise_profile_check.py` (the real-file check) and `tools/noise_profile_guard_synth.py` (the synthetic
  tables above).

## Not done / open

- **The default.** The guard removes the overstated-profile risk. What still keeps the mode opt-in: its gains
  (+0.31 / +0.43 dB) are colour PSNR on synthetic noise, and luma is unscored for the local blend. A real low-
  and high-ISO pair of one static scene is still the missing check.
- **Frames with no smooth region** read low (the guard lets an overstatement through). A floor from the
  optical-black area, where the sensor has one, would bound it from the other side.
- **LinearRaw DNGs** (Samsung Galaxy S21 to S23, iPhone 12 Pro ProRAW) carry profiles too, but there is no
  mosaic to blend.
- **Per-plane profiles** are averaged (the developer's existing rule). Nine files write three pairs that
  differ between planes: six Google Pixels (shot terms up to 2.1x apart, read terms up to 4.7x), a Lightroom
  D80, two Xiaomis and the asus. A per-plane guard and blend would use them.

## Commands (from `ventures/photo-editing`, numpy installed)

    # the 262 DNGs: crawl raw.pixls.us/data/ (two directory levels), keep *.dng; then for each CFA file with
    # tag 51041 (one or two per body), download, check, delete:
    PYTHONPATH=src python tools/noise_profile_check.py FILE.dng >> rows.jsonl
    PYTHONPATH=src python tools/noise_profile_guard_synth.py > eval/noise-profile-guard-synth-2026-11-16.out.txt

Python 3.13, numpy, four cores. The real-file pass took about 25 minutes on two processes, most of it
downloading 2.0 GB.
