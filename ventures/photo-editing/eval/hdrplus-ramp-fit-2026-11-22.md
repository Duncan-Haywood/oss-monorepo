# The blend's q ramps refitted on real sensor noise: HDR+ tune bursts, 91 fresh held-out bursts (2026-11-22)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next the blend's q ramps on real noise, then mpcws
again"). The HDR+ dB sweep (`eval/hdrplus-demosaic-sweep-2026-11-22.md`) found that on real noise a noise model
nearer the truth sometimes costs: the oracle (`true+12`) is over 0.1 dB under what ships on 9 of 48 bursts, and
both bursts that stopped `mpcws` becoming the default lose as much with the oracle. It put that on the blend's
ramps, `RAMPS[2]` (0.4, 1.2) for colour and `LUMA_RAMPS[2]` (0.8, 1.5) for luma, which were fitted on drawn
Gaussian noise (`eval/xtrans-noise-aware-blend-2026-11-16.md`, `eval/noise-aware-luma-ramp-2026-11-17.md`).

## Method

`tools/hdrplus_ramp_fit.py` (its docstring has every step). Each burst becomes the scene the sweep scores: the
merge, cell-fitted to the reference and binned 4 x 4, is the truth; the reference's own residual, rescaled to the
truth's level, is the noise; sites past 6 sigma and failed cells are masked from the score; a burst over 25%
masked is skipped. The scene on one tune burst (`0030_20151214_101221_477`) reproduces the sweep's row exactly
(D 47.913 / 51.289, `ship+12` 47.973 / 51.438 colour / luma dB).

Per burst and arm (`ship` = `frame_noise` as it ships, `mpcws`, and `true`, the oracle), all lifted by
`NEAR_DETAIL` 12 as Bayer ships, the blend is scored on every colour ramp of a 74-point grid (q_low 0.2 to 1.2,
q_high 0.8 to 8.0) with the shipped luma ramp, every luma ramp of the same grid with the shipped colour ramp, and
a 7 x 7 joint neighbourhood (`JOINT_C`, `JOINT_L`). The grid first stopped at q_high 4.0; a smoke test of the
fit on one tune burst picked a luma ramp on that edge, so q_high 6.0 and 8.0 were added before any set was scored.

**Sets.**

- **Tune: the 48 bursts the sweep scored** (`hdrplus-demosaic-sweep-bursts-2026-11-22.txt` less its 5 skips; the
  pilot's 4 are not used). They are spent for the `mpcws` question, so they serve here as the fitting set.
- **Held out: the 91 bursts the noise-truth note skipped because a file carries no NoiseProfile**
  (`hdrplus-noise-truth-2026-11-22.jsonl`, skip "no NoiseProfile"). No photo-editing demosaic score has used them.
  Without both profiles the merge's kept noise fraction `m` is not measured, so the tune set's median, **0.1532**
  (range 0.05 to 0.45), stands in. That scales each frame's noise by up to about 20% from what its reference
  had; its distribution, quantisation and spatial pattern stay the sensor's, and the `true` arm is fitted under
  the same `m`, so it remains the oracle for the noise in the frame. The `profile` arm cannot be scored there.

## What is asked, and what each answer decides (committed before any held-out burst was scored)

Picks are made on tune only, per arm: the grid row with the largest mean colour gain plus mean luma gain over the
shipped ramps on the same arm. The decision is on the `ship` arm, what the developer runs.

- **R1 (do other ramps buy dB on real noise, for what ships):** the `ship` pick against the shipped ramps on the 91
  held-out bursts (those scored):
  - h1: mean colour and mean luma gain each at least -0.005 dB, and their sum at least +0.03 dB;
  - h2: every third (by the true sigma at 18% grey) at least -0.02 dB on luma and colour;
  - h3: no held-out burst more than 0.1 dB under the shipped ramps on luma or colour;
  - h4: no new loser to `D` (over 0.1 dB under directional on either metric) that the shipped ramps did not have.
- **What a pass does.** The shipped ramps were fitted on drawn noise over many DSLR and mirrorless bodies; this set
  is phones of one family at 10 bits. So a pass alone **does not change `RAMPS` or `LUMA_RAMPS`**: it adds the
  pick as a named option and opens a drawn-noise check of it on Bayer files no ramp fit has used (the
  metadata-extractor-images samples, which this session reaches), whose pass would make it the default. A fail
  of any of h1 to h4 keeps the ramps and closes this item: the drawn-noise ramps hold on real noise.
- **R2 (is the oracle's loss the ramps'):** with each arm's own tune pick, the number of held-out bursts where
  `true` is over 0.1 dB under `ship`, against the same count on the shipped ramps. Reported; if the picks cut it
  by half or more, the next `mpcws` question is asked on the picked ramps.
- **R3 (headroom):** the best single grid row on held (an oracle pick, chosen on held) over the shipped ramps,
  reported only, to say how much any ramp could buy here.

## Result: the refit for what ships fails h3 and h4, so the ramps stay; with an accurate model the oracle's losses vanish

139 bursts prepared (about 25 minutes on 4 cores, then the grid about 22 minutes): all 48 tune bursts scored; of
the 91 held out, 79 scored and 12 skipped, each with 0.27 to 0.89 of its frame masked by moving subjects the
merge rejected. The held-out phones are older than the tune set's: Nexus 6 (43), Nexus 5 (11) and 25 whose
files name no model, against the tune set's Nexus 6P, Pixel and Pixel XL, Nexus 5X and 8 Nexus 6. Rows (589 per
burst): `hdrplus-ramp-fit-2026-11-22.jsonl.gz`; scenes and their reads: `hdrplus-ramp-fit-scenes-2026-11-22.jsonl`;
held-out ids: `hdrplus-ramp-fit-held-2026-11-22.txt`; every number below: `hdrplus-ramp-fit-2026-11-22.txt`
(`fit`) and `.json`.

Tune picks (colour ramp, luma ramp), and their mean gain over the shipped ramps on the same arm:

| arm | tune pick | tune colour / luma | held colour / luma | held bursts > 0.1 dB worse |
|---|---|---|---|---|
| `ship` (what ships) | (0.3, 1.0) / (1.2, 2.0) | +0.106 / +0.115 | +0.104 / +0.096 | 6 |
| `mpcws` | (0.3, 1.0) / (1.0, 2.0) | +0.080 / +0.027 | +0.086 / +0.047 | 2 |
| `true` (oracle) | (0.2, 0.8) / (0.8, 1.5) | +0.161 / 0 | +0.163 / 0 | 0 |

The `ship` pick's luma q_low (1.2) is the grid's largest q_low, so a still higher one is untested for that arm;
no other pick touches an edge. On held each arm's tune pick is also the best row chosen on held itself (R3), so
the picks transfer; what fails is the tail.

**R1, the `ship` pick against the shipped ramps on 79 held-out bursts: h1 and h2 pass, h3 and h4 fail.**

| | reading | bar | |
|---|---|---|---|
| h1 means | colour **+0.104**, luma **+0.096**, sum +0.199 | each at least -0.005, sum at least +0.03 | pass |
| h2 thirds (luma / colour) | +0.098 / +0.097, +0.084 / +0.082, +0.104 / +0.131 | each at least -0.02 | pass |
| h3 bursts over 0.1 dB worse | **6 of 79** (worst -0.62 dB luma) | none | **fail** |
| h4 new losers to `D` | **1** (shipped ramps lose to `D` on 2) | none | **fail** |

So by the rule, **`RAMPS` and `LUMA_RAMPS` stay**, no option is added, and the drawn-noise check is not opened.
All six bursts that lose are luma losses (-0.16 to -0.62 dB) on the held set's older phones (four Nexus 6, two
with no model named); the pick's luma ramp (1.2, 2.0) leans toward bilinear for luma, and on those frames
directional luma was the better one. The median luma gain is +0.038 against the mean +0.096: most of the gain is
on a minority of bursts.

**R2, is the oracle's loss the ramps': yes.** On the shipped ramps `true` is over 0.1 dB under `ship` on 14 of 79
held-out bursts (9 of 48 on tune). With each arm on its own tune pick, on **0**. The cut is more than half, so by
the rule the next `mpcws` question is asked on picked ramps.

**Readings after the verdict (they decide nothing).**

- **The ramps and the read are one calibration.** What ships reads the noise under the truth (median 0.77 x,
  the 0.8 frame scale), which raises every block's `q` and moves the blend toward directional; its best ramps move
  the luma ramp up (toward bilinear) to take that back. The oracle, reading the noise right, wants the opposite:
  the same luma ramp and a colour ramp lower and narrower, (0.2, 0.8) against (0.4, 1.2), so more directional
  colour. Tuning the ramps to an under-read makes an accurate read look worse than it is, which is what the
  dB sweep's two `mpcws` h4 bursts were.
- **Headroom.** Against what ships today, the oracle on its own pick gains +0.180 dB colour and +0.224 luma on
  held, with no burst over 0.1 dB worse (tune: +0.148 / +0.193, one). `mpcws` on its pick gains +0.133 / +0.152,
  with 2 held bursts worse (tune: +0.119 / +0.161, none). That is more than either the read change or the ramp
  change bought alone (`mpcws` on shipped ramps: +0.047 / +0.105, 2 worse).
- **A fresh pool.** The subset's 153 bursts are now all spent for ramp questions. The full HDR+ set
  (`https://storage.googleapis.com/hdrplusdata/20171106`, listed through the JSON API on 2026-11-22: 3,640 bursts
  under `results_20171023/`, the same layout) is reachable from this session; `prep --bucket` reads it.

## Next

A joint question, committed before scoring, on a fresh draw from the full 3,640-burst set (a seeded sample of
bursts whose files carry NoiseProfiles, so `m` is measured): `mpcws` with the colour ramp (0.3, 1.0) and luma
ramp (1.0, 2.0) against what ships on its shipped ramps, under the same four tests as the dB sweep's R1, plus a
drawn-noise check on Bayer files no ramp fit has used (metadata-extractor-images) before any default changes,
since every burst here is a phone.
