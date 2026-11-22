# The noise-aware demosaic on real sensor noise: an HDR+ burst dB sweep (2026-11-22)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "on real noise (57 HDR+ bursts ...) ... next a dB
sweep there"; eval/hdrplus-noise-truth-2026-11-22.md, "Next"). That note found that on real noise `mpcws` reads
above the truth (1.16 x before the frame scale) where the synthetic sweeps had it closest, and that what ships
(`frame_mpcw`) reads under the truth on 55 of 57 bursts. Whether either costs or buys demosaic quality is what
reads cannot say; a dB sweep can.

## How a burst becomes a demosaic test

`tools/hdrplus_demosaic_sweep.py` (its docstring has every step). For each burst the noise-truth tool already
fits the merge to the reference per 32 x 32 cell; here that fit is kept on the sensel grid:

- **Clean scene:** the fitted merge, binned 4 x 4 (each colour the mean of that block's sensels of it), as the
  drawn-noise sweeps bin LibRaw's truths. A phone's 12 MP gives about 976 x 720.
- **Noise:** at each site of the binned mosaic, the reference-minus-fit residual of a full-size sensel of the
  same colour inside that block, rescaled from that sensel's level to the truth's level by the burst's own
  per-colour truth model and by `1 / sqrt(1 - m)` (so its level is the reference's whole noise, not the part
  the merge removed). Its distribution, 10-bit steps, hot sensels and spatial pattern are the sensor's, not
  drawn. The oracle arm (`true`) is that per-colour model pooled as the synthetic sweeps pool it (mean of R, G, B).
- **Whole frame:** the binned frame is too small for the drawn-noise sweeps' three 480 x 480 tiles, and the
  developer reads a whole frame, so each burst is one row. Sites past 6 sigma of the truth model (a subject the
  merge rejected, a misalignment) and blocks whose cell fit failed are left out of the score with a 4-site
  margin; they stay in the frame that the reads and the blend see. A burst with over 25% masked is skipped.
- **The truth is not noise-free:** the merge keeps a fraction `m` (median 0.15) of the reference's noise, and
  the bin averages it over 4 (R, B) or 8 (G) sensels, so the truth holds about 0.2 of the input's noise sigma.
  That error is shared by every arm; it compresses differences, it does not favour one read.

Arms, each unlifted and at the lift that ships on Bayer (`+12`): `D` (directional), `true`, `ship`
(`frame_noise` as it ships: `mpcw`, x 0.8, guarded), `chen`, `mpcws`, `mpcw1` (`frame_noise` with that `eig`),
and `profile`, the phone's NoiseProfile as the developer uses it for a DNG that has one (carried per colour,
guarded per plane, then the one-gain carry; `raw_develop_np._directional`). Scores: colour and luma PSNR,
peak 1, as `xtrans_demosaic_check.scores` takes them.

**Pilot (4 bursts, the first 4 of the 57: `0006_20160727_185921_651`, `0006_20160727_200154_366`,
`0009_20160702_154921_383`, `0030_20151121_161242_822`; used to build the tool, left out of the set below; rows:
`hdrplus-demosaic-sweep-pilot-2026-11-22.jsonl`).** A first version cut 480 x 480 tiles and fit only one in a
frame; the whole-frame read replaced it before anything below was run. On the 4: `mpcws+12` over `ship+12`
+0.29 dB luma, +0.11 colour, none of the 4 worse; `profile+12` +0.26 luma but -0.22 colour; `true+12` +0.34 luma.

## What is asked, and what each answer decides (committed before the 53 other bursts were scored)

Data: the other 53 of the 57 bursts scored on 2026-11-22 (`hdrplus-demosaic-sweep-bursts-2026-11-22.txt`), one
row each; a burst the tool cannot read or masks over 25% of is reported as skipped, not dropped. Nothing is
tuned on this set. Cells are thirds of the bursts by the true sigma at 18% grey (low, mid, high noise).

- **R1 (does `mpcws` buy dB on real noise):** `mpcws+12` against `ship+12`:
  - h1: mean luma and mean colour gain each at least -0.005 dB, every third's mean luma and colour at least -0.02 dB;
  - h2: no burst loses over 0.1 dB to `D` (luma or colour) that did not with `ship+12`, and no more such in all;
  - h3: mean luma gain at least +0.02 dB;
  - h4: no burst more than 0.1 dB under `ship+12` on luma or colour.

  All four pass: `mpcws` becomes `frame_noise`'s default eigenvalue read on Bayer (X-Trans keeps Chen's), with
  README, NEXT.md and the flagship row updated. The 2026-11-21 set's held-out split already passed `mpcws` on
  every test hypothesis; it failed only the pick, on one file whose truth is noisy, and this set has a truth
  that is the noise. Any fails: defaults stay, and this note says which and where.
- **R2 (the phone's NoiseProfile against the frame read, for DNGs that carry one):** `profile+12` against
  `ship+12`, mean luma and colour, reported. If `ship+12` is ahead on both by at least 0.05 dB, an item is
  opened to test the same on camera DNGs; no developer change rests on phones alone.
- **R3 (headroom):** `true+12` minus `ship+12` and minus the R1 winner, reported.

## Result

(Filled in after the run.)
