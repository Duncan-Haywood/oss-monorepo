# `mpcws` with a collapse test on its own model: a fifth blind draw from the full HDR+ set (J5, 2026-11-23)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "a slope-based collapse test (j4 note)"). J4
(`eval/hdrplus-joint-check-j4-2026-11-23.md`) passed with a fallback to the shipped read wherever the `mpcws` read's
sigma at 18% grey was under 0.6x the shipped read's. That note found the ratio cannot tell "`mpcws` collapsed" from
"the shipped read over-read": 3 of its 7 fallbacks were good `mpcws` reads, and falling back gave up 0.008 dB
colour off the mean. It asked for a test on `mpcws`'s own model, committed before a fifth draw.

## The rule (committed before the fifth draw was fetched)

**What a collapse looks like.** In every collapsed read the J3 and J4 notes list, the `mpcws` shot slope is 0 to
0.15 of the truth's. The total noise does not vanish with it: the fit moves it into the read term. On the first
11 bursts re-prepped for this note (a reading of the J1 list, before anything was scored), the three collapsed
`mpcws` reads were (slope, read) = (0, 1.5e-6), (8.8e-6, 5.3e-6) and (2.4e-4, 8.4e-5, at ISO 765 where the truth's
slope is 1.9e-3), and the eight healthy ones had read terms 10 to 100 times under their shot term at 18% grey.

**The test.** The shot term's share of the model's variance at 18% grey, `s*0.18 / (s*0.18 + r)`. The truth's share
is above 0.9 on every burst seen; the three collapsed reads above give 0, 0.23 and 0.34; the healthy ones 0.94 to
0.99. The line is put at **0.5**, half way, without tuning: the reading on the four earlier lists below is
reported, not used to move it. Unlike a slope floor it needs no ISO or white level, and unlike J4's ratio it needs
no second read, so it means the same on a camera raw as on a phone burst.

**Arm `j5`:** the `mpcws` noise read, colour ramp (0.3, 1.0), the shipped luma ramp (0.8, 1.5), lifted by
`NEAR_DETAIL` 12 (the `j3`/`j4` arm); on a frame where the `mpcws` model's shot share at 18% grey is under 0.5 it is
exactly `ship` (read and ramps). Code: `tools/hdrplus_joint_check.py` (`SHOT_SHARE_J5`, `shot_share`, arm `j5`),
committed with this section before the draw.

**Draw:** 240 bursts, `--seed 20261126`, from the full set less the 153-burst subset and the J1 to J4 lists
(1,113 excluded). Same prep, same skips.

**Tests, `j5` against `ship`:** h1, h2, h3 and h4o as in J4 (h1 means at least -0.005 dB and every third at least
-0.02; h2 no new loser to directional and no more losers in all; h3 mean luma at least +0.02; h4o no burst more
than 0.1 dB under `ship` where the oracle on its own ramps is not also more than 0.1 dB under). **A pass** replaces
the ratio test inside `--noise-read mpcws` (`xtrans_demosaic.frame_noise_read`) with this one. The default stays
`ship` either way: every burst is a 10-bit Google phone, and the drawn-noise check on camera raws (J4's Next 1)
still waits on a camera set no ramp fit has used.
