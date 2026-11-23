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

## Result: `j5` fails h4o on one burst; the J4 ratio test stays

240 drawn (`hdrplus-joint-check-bursts5-2026-11-23.txt`): 126 scored; 89 skipped for a missing NoiseProfile, 14
because merge and reference differ in size, 11 with over 25% of the frame masked. Models: Nexus 6P 45, Pixel XL 24,
angler 19, Nexus 6 18, marlin 9, sailfish 8, bullhead 1, Nexus 5X 1, Pixel 1. Prep and scoring took about 25 minutes
on 2 cores. All the numbers: `hdrplus-joint-check-j5-2026-11-23.txt`; every row, with each burst's three models'
shot shares and slopes on the `j5` row: `hdrplus-joint-check-j5-rows-2026-11-23.jsonl.gz`.

| test | `j5` | bar | | `j4` (what `--noise-read mpcws` does today), same draw |
|---|---|---|---|---|
| h1 means and thirds | colour +0.053, luma +0.079; lowest third +0.034 | at least -0.005 / -0.02 | pass | +0.059 / +0.099; lowest third +0.037 |
| h2 losers to `D` | 1, none new (ship 1) | no new, no more | pass | 1, none new |
| h3 mean luma | +0.079 | at least +0.02 | pass | +0.099 |
| h4o over 0.1 dB under `ship` where the oracle is not | **1** (0919_20150905_181312_630, -0.349 dB luma) | none | **fail** | **0** (worst -0.024) |

**Verdict: the shot-share test does not replace the ratio test.** `--noise-read mpcws` keeps J4's 0.6 ratio line.

## Why it failed: the split between the two terms is not the signal

- **The one loss is a total collapse.** On 0919_20150905_181312_630 the `mpcws` model is (1.4e-11, 4.4e-13): sigma
  at 18% grey 1.7e-6 against the truth's 6.2e-3. Both terms vanished together, so their ratio is still 0.85, over
  the line. The test only sees a collapse that moves the noise from one term to the other. J4's ratio to the
  shipped read sees this one (0.0005x) and fell back.
- **A zero slope is common and mostly harmless.** The `mpcws` slope is exactly 0 on 22 of 126 bursts. With the read
  term carrying the whole noise, the blend still gains on most of them: `colour_only` over `ship` there is +0.036 dB
  colour, +0.076 luma on average, with 3 of the 22 more than 0.1 dB worse. What decides the blend is the noise
  level at the tones that matter, not how the fit splits it between shot and read.
- **So the line fired far too often.** It fell back on 31 of 126 bursts (J4's line on 12). The 25 that only `j5`
  sent back gave up +0.042 colour / +0.087 luma on average where `mpcws` was right, 0.008 / 0.017 dB off the mean.
- **The 11-burst look that set the line was not representative.** On the 233 bursts of the J1 to J4 lists that
  were re-prepped before the reading was stopped (models only, not scored), the share is under 0.5 on 39 (17%) and
  the slope exactly 0 on 19. Had this reading been finished before the line was committed it would have shown the
  problem; the four-list reading was stopped once the fifth draw had decided.

## Readings after the verdict (they decide nothing)

- **J4's arm passes again, on its second independent draw.** On these 126 bursts `j4` gains +0.059 dB colour and
  +0.099 luma over what ships, 0 bursts 0.1 dB worse, no new loser to directional. Across J4 and J5 (237 scored
  bursts no rule was fitted on) the shipped opt-in has lost more than 0.1 dB on none.
- `candidate`, `fallback`, `j3` and `colour_only` each lose 0.1 dB or more on 2 to 4 bursts; the oracle on its own
  ramps (`true_pick`) gains +0.104 / +0.154 and loses on none, so there is still headroom for a better read.

## Next

1. The drawn-noise check on Bayer camera raws (J4's Next 1) is still the gate for making `mpcws` the default; it
   needs a camera set no ramp fit has used (raw.pixls.us was refused from this session).
2. If a collapse test is tried again, test the level, not the split: the `mpcws` sigma at a few grey levels against
   a floor that does not need a second read (for instance against the frame's own darkest-block spread), committed
   with a full reading of the five lists before a sixth draw.
