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

## Result: `mpcws` gains on real noise but fails h4 on 2 bursts, so defaults stay; the oracle loses on the same 2

53 bursts given, 48 scored, 5 skipped and reported: each had over 25% of its frame masked (0.26 to 0.72) by
moving subjects the merge rejected (four `angler` bursts, `0543_*` and `0919_*`, and one Nexus 6). About 25 minutes
on 4 cores. Rows: `hdrplus-demosaic-sweep-2026-11-22.jsonl`; every number below:
`hdrplus-demosaic-sweep-2026-11-22.txt` (`--summary`).

Every arm over `D` (mean dB, 48 bursts; losers lose over 0.1 dB to `D` on luma or colour):

| arm | luma | colour | losers |
|---|---|---|---|
| `true+12` (oracle) | +0.751 | +0.244 | 0 |
| `ship+12` (`mpcw`, what ships) | +0.558 | +0.257 | 0 |
| `chen+12` | +0.362 | +0.196 | 0 |
| `mpcws+12` | **+0.692** | **+0.296** | 0 |
| `mpcw1+12` | +0.605 | +0.275 | 0 |
| `profile+12` (the phone's NoiseProfile) | +0.721 | +0.132 | 2 |

**R1, `mpcws+12` against `ship+12`: h1, h2 and h3 pass; h4 fails.**

| | reading | bar | |
|---|---|---|---|
| h1 means | luma **+0.134**, colour **+0.039**; lowest third +0.031 | each at least -0.005, thirds at least -0.02 | pass |
| h2 losers to `D` | 0 and 0, none new | no new, no more | pass |
| h3 mean luma | **+0.134** | at least +0.02 | pass |
| h4 bursts over 0.1 dB under `ship+12` | **2 of 48** | none | **fail** |

By thirds of the noise level the luma gain grows with noise: +0.062, +0.124, +0.216 dB (colour +0.031, +0.040,
+0.045). It gains luma on 38 of 48 bursts, colour on 35, both on 28; median +0.049 luma, best +0.98. The two h4
bursts:

- `0043_20160825_193900_964` (Pixel XL, ISO 50): colour -0.157, luma -0.011.
- `0127_20161018_111029_303` (Pixel XL, ISO 826): luma -0.186, colour +0.028.

So by the rule committed above, **defaults stay**: `frame_noise` keeps `mpcw` on Bayer; `mpcws` stays an option.

**R2, the phone's NoiseProfile against the frame read:** `profile+12` over `ship+12` +0.164 dB luma but -0.125
colour, 22 of 48 bursts over 0.1 dB worse on colour (one of them on luma too). `ship+12` is not ahead on both,
so by the rule no item is opened. The profile as the developer pools it reads a median 1.22 x the true model
(p10 1.04, p90 1.39).

**R3, headroom:** `true+12` over `ship+12` +0.193 dB luma, -0.013 colour; over `mpcws+12` +0.059 luma, -0.052
colour. `mpcws` closes about 70% of the luma gap between what ships and the oracle and is ahead of the oracle
on colour.

**Readings after the verdict (they decide nothing).**

- **Both h4 bursts are bursts where the oracle loses too, by as much.** On `0043_20160825_193900_964` `true+12`
  loses -0.24 dB colour to `ship+12` (`mpcws` -0.16); `mpcws` reads 0.88 of the true model there and `ship`
  0.67. On `0127_20161018_111029_303` `true+12` loses -0.18 dB luma (`mpcws` -0.19); there `ship` reads 1.44 of the
  true model and `mpcws` 1.03. On those two frames a read nearer the truth costs, whichever read it is: the loss
  is in what the blend does with an accurate model (its `q` ramps, tuned on drawn noise), not in `mpcws`'s
  over-read, which the 2026-11-22 noise-truth note found before the 0.8 frame scale and which the scale takes back
  (0.80 of the true model here). `true+12` has 9 bursts over 0.1 dB under `ship+12`, more than `mpcws+12`'s 2.
- The lift (`+12`) costs a little on real noise in every arm (-0.02 to -0.03 dB luma, 0 to -0.01 colour against
  the unlifted blend); it was tuned against near-clean leaks on drawn noise, and no burst here loses to `D` either way.
- The NoiseProfile's colour loss comes with a read 1.22 x the true model, and an over-read blends toward
  bilinear; whether the one-gain carry (the planes' mean pair times the mean gain) is the cause is a guess this
  run did not test.
- Limits: one maker's phones, 10-bit, mostly daylight; the truth keeps about 0.2 of the input's noise sigma; the
  noisy mosaic is built on a 4 x 4 binned scene. Nothing here is X-Trans or a large-sensor 14-bit body.

## Next

- The blend's `q` ramps on real noise: on 9 of 48 bursts the oracle model loses over 0.1 dB to what ships. A
  ramp fit on this set (split by burst) would say whether the drawn-noise tuning leaves real-noise dB behind,
  and h4 for `mpcws` should be rerun after it (both its losers are oracle losers).
- The NoiseProfile path's colour loss (-0.125 dB against the frame read on these DNGs): a per-colour carry was
  rejected on 2026-11-16 on drawn noise; real noise is a fresh test.
- The 91 bursts with no NoiseProfile (`m = 1/N`), which would double this set.

## Reproduce

```
cd ventures/photo-editing
PYTHONPATH=src python tools/hdrplus_demosaic_sweep.py --bursts eval/hdrplus-demosaic-sweep-bursts-2026-11-22.txt --cache /tmp/hdrplus > rows.jsonl
PYTHONPATH=src python tools/hdrplus_demosaic_sweep.py --summary rows.jsonl
```

Each burst downloads two DNGs (~17 MB) from storage.googleapis.com/hdrplusdata (CC BY-SA 4.0) and deletes them
after (`--keep` keeps them). Test: `tests/test_hdrplus_demosaic_sweep.py`.
