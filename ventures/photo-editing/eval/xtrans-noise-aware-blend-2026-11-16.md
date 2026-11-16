# Per-frame or per-region? A noise-aware blend of the directional and bilinear demosaics (2026-11-16)

Flagship item (BUILDABLE HERE, from `eval/xtrans-fresh-truths-2026-11-16.md`, Open): "Per-frame choice:
the A7 IV wants less edge-keeping ... A frame-level measure that predicts which, checked on held-out
truths, is untried."

**Verdict.** A frame-level choice is the wrong granularity. Even its ceiling (the best single blend
weight per tile, chosen with the truth in hand) is beaten by a per-block blend that needs no truth.
That blend works only when the sensor noise is **known**. On 25 held-out files it gains **+0.43 dB**
colour PSNR on X-Trans and **+0.31 dB** on Bayer over the directional default, averaged over four noise
levels. It is +0.93 / +0.68 dB at SNR 12, and no held-out tile is worse by more than 0.01 dB. With the
noise **estimated** from the mosaic, every rule loses up to 3.5-6.6 dB on some tiles, because texture is
read as noise. Shipped as `--demosaic noise-aware` (opt-in). It is driven by the DNG's own NoiseProfile
tag and falls back to directional without one.

## Set-up

`tools/xtrans_frame_choice.py` (new). Every raw in drewnoakes/metadata-extractor-images that LibRaw 0.22.2
reads (46 files from 41 bodies across Sony, Nikon, Canon, Olympus/OM, Panasonic, Samsung and Fujifilm) is
rendered, binned 4 x 4 (as `--truth-from` does) and cut into up to three 480 x 480 tiles (centre and
corners). Each tile is mosaicked with the X-E1's X-Trans layout (or RGGB with `--bayer`), noise is drawn
at SNR 0 (none), 60, 25 and 12 at 18% grey (the existing Poisson-Gaussian model, 80% shot), and the tile
is demosaiced by bilinear (B) and the directional default (D). The rows record:

- the colour PSNR of every fixed blend `a D + (1 - a) B`, with a from 0 to 1 in steps of 0.05. The best
  one is the **oracle**, the ceiling of any frame-level rule;
- measures from the mosaic alone. `q` is, per 24 x 24 block, the RMS of D - B over the noise expected
  at that block's level. The noise is either **estimated** (a shot-plus-read model fitted to the
  quietest blocks' leave-one-out residuals) or **known** (the model the noise was drawn from, which is
  what a DNG NoiseProfile states);
- the **local blend** (`xtrans_demosaic.blend`). Each block takes a = 0 at q <= q_low and a = 1 at
  q >= q_high, linear between, interpolated between block centres. It is run on a 6 x 4 grid of ramps,
  for both noise sources.

Files go to "tune" or "held" by a SHA-1 of the name (21 and 25 files). Every rule is fitted on tune only
(`tools/xtrans_frame_choice_fit.py`) and scored on held. That gives 232 rows per layout and 124 held-out
tile x noise rows.

## Held-out results

Mean gain over the directional default / worst tile / tiles worse by over 0.1 dB, colour PSNR (dB).
"Frame" rules set one weight per tile from the median block q; "fixed a" is one weight for every tile.

**X-Trans** (ramps fitted on tune: local known 0.4-2.0, frame known 0.2-1.5, fixed a = 0.85)

| held | local, known noise | frame, known | fixed a | local, estimated | frame, estimated | oracle (per tile) | bilinear |
|---|---|---|---|---|---|---|---|
| all | **+0.43 / +0.00 / 0** | +0.22 / -2.62 / 9 | +0.08 / -1.25 / 38 | +0.06 / -5.09 / 31 | -0.07 / -6.58 / 25 | +0.41 | -4.41 |
| SNR 12 | **+0.93 / +0.00 / 0** | +0.64 / -0.50 / 2 | +0.39 / -0.23 / 1 | +0.71 / -3.56 / 4 | +0.52 / -1.25 / 2 | +0.80 | -1.71 |
| SNR 25 | **+0.55 / +0.00 / 0** | +0.19 / -1.16 / 6 | +0.19 / -0.47 / 6 | +0.20 / -4.45 / 5 | +0.10 / -1.83 / 7 | +0.46 | -3.80 |
| SNR 60 | **+0.25 / +0.00 / 0** | +0.05 / -2.62 / 1 | -0.04 / -0.90 / 13 | -0.20 / -4.67 / 7 | -0.33 / -3.57 / 8 | +0.25 | -5.53 |
| none | +0.00 / +0.00 / 0 | +0.00 | -0.21 / -1.25 / 18 | -0.47 / -5.09 / 15 | -0.58 / -6.58 / 8 | +0.12 | -6.59 |

**Bayer** (`bayer_demosaic.directional` default; local known 0.4-1.2, frame known 0.2-1.1, fixed a = 0.9)

| held | local, known noise | frame, known | fixed a | local, estimated | frame, estimated | oracle (per tile) | bilinear |
|---|---|---|---|---|---|---|---|
| all | **+0.31 / -0.01 / 0** | +0.16 / -1.75 / 7 | +0.03 / -0.62 / 35 | +0.04 / -3.54 / 31 | -0.11 / -5.99 / 25 | +0.26 | -3.95 |
| SNR 12 | **+0.68 / +0.00 / 0** | +0.46 / -0.20 / 2 | +0.19 / -0.15 / 1 | +0.50 / -2.66 / 3 | +0.31 / -0.88 / 2 | +0.55 | -1.57 |
| SNR 25 | **+0.39 / +0.00 / 0** | +0.13 / -1.08 / 4 | +0.08 / -0.27 / 4 | +0.14 / -3.27 / 6 | +0.02 / -1.24 / 6 | +0.30 | -3.41 |
| SNR 60 | **+0.17 / -0.01 / 0** | +0.04 / -1.75 / 1 | -0.04 / -0.53 / 13 | -0.14 / -3.47 / 9 | -0.29 / -2.61 / 8 | +0.15 | -4.96 |
| none | +0.00 / +0.00 / 0 | +0.00 | -0.12 / -0.62 / 17 | -0.36 / -3.54 / 13 | -0.49 / -5.99 / 9 | +0.06 | -5.88 |

What the tables say:

- **The ceiling of a frame-level choice is low, and the local blend passes it.** The oracle tile weight
  gains +0.41 / +0.26 dB. The local blend gains +0.43 / +0.31 with no truth, because a frame mixes smooth
  regions (where bilinear's averaging wins) and edges (where directional wins). The 2026-11-16 note's A7
  IV is the extreme case: its tiles' oracle weights are 0.2-0.25 at SNR 25.
- **A frame-level rule with known noise helps on average and hurts some frames** (worst -2.6 dB X-Trans,
  -1.75 Bayer, 7-9 tiles over 0.1 dB worse). The local rule hurts none.
- **Known noise is the whole difference.** With the noise estimated from the mosaic, a detailed frame (Sony
  NEX-5N, Panasonic GF7) has no quiet block. Its texture reads as noise of about 0.05-0.07 against the
  truth's 0, so q is low and the blend leans to bilinear where it should not (NEX-5N: -4.5 dB). No ramp
  fixes that. The estimate is good on smooth frames (A7 IV at SNR 25: 0.0062 against 0.0072 drawn).
- **Noise-free, the local rule does nothing** (q is effectively infinite), while the oracle would still
  gain +0.12 / +0.06 dB there by averaging two estimators' independent errors. That gain is left alone.
- **A blend toward bilinear is always better than bilinear.** Bilinear alone loses 4-6 dB on average.

## Sensitivity to the noise level (a profile that is wrong)

Overstating the noise sigma by k divides q by k, which is the same as stretching the ramp by k. Held-out
rows on the grid (`local` keys in the jsonl) show the cost. On X-Trans, ramps up to about 0.6-2.2 (noise
overstated by about 1.1-1.5x) stay at +0.39 dB with a worst tile of -0.05. Past 0.6-3.8 the losses reach
-1.7 dB. On Bayer, 0.6-1.4 gives +0.29 / -0.06, and 0.6-2.2 gives +0.19 / -0.56. **Understating the noise
is safe** (the ramp shrinks and the blend moves toward directional). **Overstating it by about 1.5x or more
is not.** That is why the mode stays opt-in.

## A real NoiseProfile: the LG Nexus 5X DNG

Of the eight sample DNGs, only the Nexus 5X carries NoiseProfile (tag 51041: shot 2.24e-4, read 1.87e-6
on the 0..1 scale, about SNR 28 at 18% grey). On its own sensel data the in-frame estimate is shot 1.53e-4,
read 8.6e-7, a sigma of 0.0053 at 18% grey against the profile's 0.0065. So the tag's scale and our
normalisation agree, and the profile states about 20% more noise than the estimate finds (inside the safe
range above). With the profile, the frame's blocks carry a mean weight of 0.33 on directional, and no block
is wholly either method. `shootflow develop "LG Nexus 5X.dng" --demosaic noise-aware` takes 4.4 s against
directional's 2.0 s for 12 MP (numpy, four cores; the blend runs bilinear and the measures on top).

## What shipped

- `xtrans_demosaic.frame_measures`, `blend`, `noise_aware` and `RAMPS = {6: (0.4, 2.0), 2: (0.4, 1.2)}`
  (the tune-fitted ramps). They work for both CFAs: `noise_aware` runs the CFA's own directional demosaic.
- `raw_develop.noise_profile(ifd, ifd0)` reads tag 51041 and averages per-plane pairs. It refuses an odd
  count or a non-positive read term.
- `--demosaic noise-aware` (`DevelopSettings(demosaic="noise-aware")`), numpy engine, full and X-Trans half
  size. The profile is carried to the white-balanced plane (shot x mean gain, read x mean gain^2). Without
  a NoiseProfile it develops as directional and says so in the notes. **Not the default**, for three
  reasons: one real profile checked, an overstated profile can cost dB, and the scores are colour PSNR on
  synthetic noise.
- Tests: `tests/test_demosaic_noise_aware.py` (8): the estimate tracks the drawn noise on a flat field, a
  flat noisy field scores better than directional, a clean edge stays directional, sensels keep their
  values, the blend lies between its inputs, the Bayer path uses its own demosaic and ramp, the ramp's
  shape, profile parsing, and the developer path with and without a profile.

## Not done / open

- **Luma** was not scored for the local blend (the jsonl carries colour PSNR per ramp; luma only for the
  fixed weights). The earlier notes found bilinear's luma better under noise, so a regression is unlikely,
  but it is unmeasured.
- **Real noise.** All noise here is synthetic Poisson-Gaussian on binned scenes. A real low- and high-ISO
  pair of one static scene is still the missing check, now for this mode too.
- **More real NoiseProfiles.** Phones and Adobe-converted DNGs usually carry one; only the Nexus 5X is in
  the sample set. Checking each profile against the in-frame estimate, and refusing a profile that reads
  far above it, would make the mode safe enough to be the default for DNGs.
- **Raws without a profile.** Per-camera noise from the optical-black area and ISO could stand in.
- **The noise-free gain** (+0.06-0.12 dB oracle) is untouched.

## Commands (from `ventures/photo-editing`)

    M=<sparse checkout of drewnoakes/metadata-extractor-images with arw nef cr2 rw2 srw orf raf>
    ls $M/{arw,nef,cr2,rw2,srw,orf,raf}/* | grep -vi 'metadata' > files.txt
    tr '\n' '\0' < files.txt | PYTHONPATH=src xargs -0 python tools/xtrans_frame_choice.py \
        --raf "$M/raf/Fujifilm X-E1.raf" --cache /tmp/truths > xtrans.jsonl
    tr '\n' '\0' < files.txt | PYTHONPATH=src xargs -0 python tools/xtrans_frame_choice.py --bayer \
        --cache /tmp/truths > bayer.jsonl
    python tools/xtrans_frame_choice_fit.py xtrans.jsonl

The rows are `eval/xtrans-noise-aware-blend-2026-11-16.jsonl` and `eval/bayer-noise-aware-blend-2026-11-16.jsonl`.
The fits are `eval/*-noise-aware-blend-fit-2026-11-16.jsonl`. The run used rawpy 0.28 with LibRaw 0.22.2,
Python 3.11 and numpy, and took about 25 minutes on four processes. Unreadable files are dropped from the
committed rows: four "Issue 247" NEFs, one RW2 and directory entries.
