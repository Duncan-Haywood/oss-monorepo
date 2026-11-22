# `mpcws` with the shipped luma ramp: a third blind draw from the full HDR+ set (J3, 2026-11-22)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next mpcws, colour ramp only, h4 vs the oracle").
J1 and J2 (`eval/hdrplus-joint-check-2026-11-22.md`) found `mpcws` on its refit ramps gains about +0.08 dB colour
and +0.10 dB luma over what ships across 247 fresh bursts with no new loser to directional, but fails "no burst
over 0.1 dB worse" (h4) on both draws. J2's three losses were all luma and all came from the candidate's luma
ramp (1.0, 2.0); `mpcws` on the shipped ramps lost under 0.1 dB on each. And the oracle (the true noise on its own
ramps) also failed h4 on J2's draw, so the absolute h4 is partly the score's own noise.

## The rule (committed before the third draw was fetched)

**Arm `j3`:** the `mpcws` noise read, colour ramp (0.3, 1.0), the shipped luma ramp (0.8, 1.5), all lifted by
`NEAR_DETAIL` 12; on a frame where the `mpcws` read's sigma at 18% grey is under 0.25 x the shipped read's
(`COLLAPSE`, fixed in J2), exactly `ship` (read and ramps). Reported beside it, deciding nothing: `colour_only`
(the same with no fallback) and every J1/J2 arm.

**Draw:** 240 bursts, `random.Random(20261124)`, from the full set (`storage.googleapis.com/hdrplusdata/20171106`)
less the 153-burst subset, J1's 240 and J2's 240 (`hdrplus-joint-check-bursts3-2026-11-22.txt`). Same prep, same
skips (no NoiseProfile, size mismatch, over 25% masked). No burst is added or dropped after scoring starts.

**Tests, `j3` against `ship`:** J1's h1, h2 and h3 unchanged, and

- **h4o** (decides): no burst more than 0.1 dB under `ship` on luma or colour *where the oracle on its own ramps
  (`true_pick`, (0.2, 0.8) / (0.8, 1.5)) is not also more than 0.1 dB under `ship`*. A loss the truth itself takes
  is the scene's or the score's, not the read's.
- **h4** (absolute, the J1/J2 bar): reported beside it.

**A pass** of h1, h2, h3 and h4o adds the pair as a named option (`--noise-read mpcws` with these ramps and the
fallback) and opens the drawn-noise check on Bayer files no ramp fit has used; it does not change the default
(every burst is a 10-bit Google phone). **A fail** keeps `mpcw` and the shipped ramps, and the failing bursts say
what the next read must handle. Code: `tools/hdrplus_joint_check.py` (arms `colour_only`, `j3`; test `h4o`).

## Result

**`j3` fails h4o on 2 bursts, so `mpcw` and the shipped ramps stay.** It passes h1, h2 and h3; its two losses are
luma, on frames where the oracle gains, so the oracle-relative bar does not forgive them. Every number:
`hdrplus-joint-check-j3-2026-11-22.txt`.

240 drawn: 137 scored; 79 skipped for a missing NoiseProfile, 17 because merge and reference differ in size, 7
over 25% masked. Models: Nexus 6P 45, Pixel XL 31, angler 22, sailfish 13, marlin 11, Nexus 6 10, bullhead 3,
Nexus 5X 2. The collapse fallback fired on 4 scenes.

| test | reading | bar | |
|---|---|---|---|
| h1 means and thirds | colour **+0.068**, luma **+0.102**; thirds (luma/colour) +0.080/+0.056, +0.058/+0.029, +0.167/+0.119 | each at least -0.005; thirds at least -0.02 | pass |
| h2 losers to `D` | 1, not new (what ships loses on 2) | no new, no more | pass |
| h3 mean luma | **+0.102** | at least +0.02 | pass |
| h4o over 0.1 dB under `ship` where the oracle is not | **2 of 137**: `0030_20151007_174433_246` (-0.136 luma), `1125_20151201_121436_471` (-0.134 luma) | none | **fail** |
| h4 (absolute, reported) | the same 2 | none | fail |

**The oracle-relative bar did not bite this time:** the oracle on its own ramps lost over 0.1 dB on 1 burst
(`0030_20151008_091558_025`, -0.14), and neither the candidate nor `j3` lost there. Both `j3` losers are frames
where the oracle *gains* (+0.005 and +0.358 luma).

## Readings after the verdict (they decide nothing)

- **The shipped luma ramp did its job.** J2's losses came from the candidate's luma ramp (1.0, 2.0); with the
  shipped one, `j3` loses on none of the bursts J1/J2's arm loses on here (`candidate` loses on 4 of this draw,
  2 after its own fallback, all different frames from `j3`'s).
- **The two losses are a partial collapse of the read.** On both, `mpcws` fits a near-zero shot-noise slope
  (1.5e-5 and 0 against the truth's 1.0e-4 and 1.2e-4) and reads sigma at 18% grey at 0.58x and 0.34x the truth.
  That is 0.45x and 0.55x the shipped read's sigma, above the 0.25 `COLLAPSE` line, so the fallback did not fire.
  The luma blend then trusts the edge-follower too much: directional itself loses 0.36 and 0.51 dB there.
  The candidate's wider luma ramp hid this under-read on these frames and made new losses on others: read and
  ramps are one calibration, as the refit found.
- **A higher collapse line, on this draw only (circular):** falling back to `ship` where `mpcws` reads under
  0.5x the shipped sigma fires on 6 scenes and leaves 1 loser; under 0.6x fires on 10 (7%) and leaves 0, with
  means +0.065 colour / +0.101 luma; 0.7x fires on 21 and costs 0.016 dB colour. 0.6 is picked on this draw, so it
  proves nothing here.
- **Across three draws (384 bursts)** `mpcws` with the refit colour ramp gains about +0.07 to +0.08 dB colour and
  +0.10 luma over what ships, with no new loser to directional; every remaining h4 loss is a read under the
  truth by more than 1.7x or a luma ramp that does not match the read.

## Next (committed here, before any fourth draw is fetched)

**J4:** arm `j3` with `COLLAPSE` 0.6 (fall back to exactly `ship` where the `mpcws` read's sigma at 18% grey is
under 0.6x the shipped read's), on a fourth seeded draw (`--seed 20261125 --n 240`, `--exclude` all three burst
lists), under h1, h2, h3 and h4o exactly as above. A pass adds the option and opens the drawn-noise check on
Bayer files no ramp fit has used; a fail keeps everything. The 0.6 is not to be re-tuned on the fourth draw.
