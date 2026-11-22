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
`NEAR_DETAIL` 12 as Bayer ships, the blend is scored on every colour ramp of a 46-point grid (q_low 0.2 to 1.2,
q_high 0.8 to 4.0) with the shipped luma ramp, every luma ramp of the same grid with the shipped colour ramp, and
a 7 x 7 joint neighbourhood (`JOINT_C`, `JOINT_L`).

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

## Result

(Filled in after the held-out bursts were scored.)
