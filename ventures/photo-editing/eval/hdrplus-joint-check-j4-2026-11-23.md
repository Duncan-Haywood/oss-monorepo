# `mpcws` with a collapse line at 0.6: a fourth blind draw from the full HDR+ set (J4, 2026-11-23)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next J4, collapse line 0.6, seed 20261125").
J3 (`eval/hdrplus-joint-check-j3-2026-11-22.md`) failed its decisive test on 2 bursts where the `mpcws` read
partly collapsed (0.45x and 0.55x the shipped read's sigma at 18% grey, above J3's 0.25 fallback line). That note
committed J4 before this draw was fetched: the J3 arm with the line at 0.6, on a fourth seeded draw, under the same
tests. The 0.6 was picked on J3's draw, so it could prove nothing there; this draw is where it gets tested.

## The rule (from the J3 note, unchanged)

**Arm `j4`:** the `mpcws` noise read, colour ramp (0.3, 1.0), the shipped luma ramp (0.8, 1.5), lifted by
`NEAR_DETAIL` 12. On a frame where the `mpcws` read's sigma at 18% grey is under 0.6x the shipped read's, it is
exactly `ship` (read and ramps). Code: `tools/hdrplus_joint_check.py` (`COLLAPSE_J4`, arm `j4`), committed with
the draw list before any burst was scored (first commit of PR #18354).

**Draw:** 240 bursts, `--seed 20261125`, from the full set (`storage.googleapis.com/hdrplusdata/20171106`, 3,640
bursts) less the 153-burst subset and the J1, J2 and J3 lists (873 excluded; pool 2,767):
`hdrplus-joint-check-bursts4-2026-11-23.txt`. Same prep, same skips.

**Tests, `j4` against `ship`:** h1 (mean luma and colour at least -0.005 dB, every third at least -0.02), h2 (no
new loser to directional and no more losers in all), h3 (mean luma at least +0.02), h4o (no burst more than 0.1 dB
under `ship` where the oracle on its own ramps is not also more than 0.1 dB under). **A pass** adds the read as a
named option and opens a drawn-noise check on Bayer camera files no ramp fit has used. It does not change the
default, because every burst comes from a 10-bit Google phone.

## Result: `j4` passes all four, so `--noise-read mpcws` ships as an opt-in

240 drawn: 111 scored; 96 skipped for a missing NoiseProfile, 15 because merge and reference differ in size, 18
with over 25% of the frame masked. Models: Nexus 6P 34, Pixel XL 24, angler 21, Nexus 6 11, sailfish 10, marlin
6, bullhead 2, Nexus 5X 2, Pixel 1. Prep and scoring took about 10 minutes on 4 cores. All the numbers:
`hdrplus-joint-check-j4-2026-11-23.txt`; every row: `hdrplus-joint-check-j4-rows-2026-11-23.jsonl.gz`.

| test | reading | bar | |
|---|---|---|---|
| h1 means and thirds | colour **+0.079**, luma **+0.121**; thirds (luma/colour) +0.065/+0.043, +0.044/+0.029, +0.255/+0.164 | each at least -0.005; thirds at least -0.02 | pass |
| h2 losers to `D` | 2, none new (what ships loses on 3) | no new, no more | pass |
| h3 mean luma | **+0.121** | at least +0.02 | pass |
| h4o over 0.1 dB under `ship` where the oracle is not | **0 of 111** (worst -0.024) | none | pass |
| h4 (absolute, reported) | 0 | none | pass |

The 0.6 line fell back on 7 of 111 frames, the J2/J3 0.25 line on 4.

## Readings after the verdict (they decide nothing)

- **The J3 arm also passes on this draw** (colour +0.087, luma +0.127, 0 bursts 0.1 dB worse). This draw has no
  frame like J3's two partial collapses, so it cannot tell the two lines apart on losses.
- **The higher line cost gains here.** The 3 frames under 0.6 but over 0.25 are ones where `mpcws` was right:
  without the fallback they gain +0.59/+0.33, +0.03/+0.06 and +0.24/+0.29 dB (colour/luma) over `ship`, about
  what the oracle gains there (+0.59/+0.31, +0.04/+0.06, +0.23/+0.26). Falling back to `ship` gave that up: 0.008 dB
  colour off the mean. On those 3 it was the shipped read that was wrong, not `mpcws`: shot slopes (`mpcws` /
  `ship` / truth) 7.8e-4 / 3.4e-3 / 9.3e-4, 7.4e-5 / 2.7e-4 / 1.2e-4 and 8.9e-5 / 7.7e-4 / 1.2e-4, so `mpcws`
  read 0.6 to 0.85 of the truth's slope and `ship` 2.2 to 6.6x. On the 4 frames under the old 0.25 line `mpcws`'s
  slope is 0 to 0.11 of the truth's (4.5e-13, 1.7e-5, 2.0e-11, 7.5e-6 against 1.2e-4 to 2.6e-3). A ratio to the
  shipped read cannot tell "`mpcws` collapsed" from "`ship` over-read". J3's two losers also had a near-zero slope
  (1.5e-5 and 0 against the truth's ~1e-4), so `mpcws`'s own slope looks like the better test.
- **Across four draws (495 scored bursts)** `mpcws` with the earlier colour ramp gains about +0.07 to +0.09 dB colour
  and +0.10 to +0.13 dB luma over what ships, with no new loser to directional.
- `candidate` (J1's luma ramp (1.0, 2.0)) fails h2 and h4o here again. `ship_pick` loses on 9. `true_pick`, the
  oracle, gains +0.14 colour / +0.20 luma and loses on none: there is headroom left for a better read.

## What changed in the developer

`shootflow develop --noise-read mpcws` (`DevelopSettings.noise_read`, `xtrans_demosaic.frame_noise_read`): used
with the noise-aware demosaic on Bayer raws that carry no NoiseProfile. It reads the frame with `mpcws`, blends
colour on (0.3, 1.0), and falls back to exactly the shipped read and ramps under the 0.6 line, saying so in the
develop notes. X-Trans and files with a NoiseProfile are unchanged and get a note. `ship` stays the default, so
the default output is byte for byte the same (`tests/test_demosaic_noise_aware.py`, `NoiseReadTests` and the
develop test).

## Next

1. A drawn-noise check on Bayer camera raws that no ramp fit has used, with the `mpcws` option against `ship`
   (the committed follow-up to a pass). A pass there makes it a candidate default.
2. A collapse test on `mpcws`'s own shot slope instead of the ratio to the shipped read. Every collapsed frame
   seen so far has a slope at most 0.15 of the truth's, and the frames that should be kept have at least 0.6, but
   a rule cannot use the truth. Commit an absolute or ISO-scaled slope floor before a fifth draw, and score it on
   the four lists only as a reading.
