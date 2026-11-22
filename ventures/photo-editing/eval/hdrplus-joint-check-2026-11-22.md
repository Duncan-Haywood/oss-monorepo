# `mpcws` on its own ramps against what ships: a fresh seeded draw from the full HDR+ set (2026-11-22)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next mpcws on its ramps, fresh draw from the full
3,640-burst set"). The ramp refit (`eval/hdrplus-ramp-fit-2026-11-22.md`) found that the noise read and the blend
ramps are one calibration: with each read on the ramps picked for it on tune bursts, the oracle's losses to what
ships went from 14 to 0, and `mpcws` on its own pick gained +0.133 / +0.152 dB (colour / luma) over what ships on
held bursts, with 2 bursts worse. Its "Next" committed this question.

## Method

`tools/hdrplus_joint_check.py` (its docstring has every step).

- **Draw.** The full set (`storage.googleapis.com/hdrplusdata/20171106`) listed through the JSON API, less every
  burst of the 153-burst `20171106_subset` the earlier notes read, sampled with `random.Random(20261122)`, 240
  bursts. The draw size was fixed before any burst was fetched; no burst is added or dropped after scoring starts.
- **Scenes.** `tools/hdrplus_ramp_fit.py prep --bucket .../20171106` with no `--m-default`: each scored burst has
  both NoiseProfiles, so the merge's kept noise fraction `m` is measured. The same truth, noise, mask and 25%
  masked-share skip as the sweep and the refit.
- **Arms** (all lifted by `NEAR_DETAIL` 12, as Bayer ships): `ship` = `frame_noise` on the shipped ramps
  (0.4, 1.2) / (0.8, 1.5); `candidate` = `mpcws` on colour (0.3, 1.0) and luma (1.0, 2.0), its tune pick in the
  refit. Reported only: `mpcws` on the shipped ramps (the dB sweep's R1 again), `ship` on its refit pick
  (0.3, 1.0) / (1.2, 2.0) (the refit's R1 again), the oracle `true` on the shipped ramps and on its pick
  (0.2, 0.8) / (0.8, 1.5).

## What is asked, and what each answer decides (committed before any burst was scored)

**J1: `candidate` against `ship`,** the dB sweep's four R1 tests, on every scored burst:

- h1: mean luma and mean colour gain each at least -0.005 dB, and every third (by the true sigma at 18% grey)
  at least -0.02 dB on luma and on colour;
- h2: no burst loses over 0.1 dB to `D` (directional, luma or colour) that did not with `ship`, and no more
  such bursts in all;
- h3: mean luma gain at least +0.02 dB;
- h4: no burst more than 0.1 dB under `ship` on luma or colour.

**What a pass does.** Every burst is a 10-bit phone of one family, so a pass does **not** change the defaults: it
adds the pair as a named option (`--noise-read mpcws` with its ramps) and opens a drawn-noise check on Bayer
files no ramp fit has used (the metadata-extractor-images samples), whose pass would make it the Bayer default.
**A fail** of any test keeps `mpcw` and the shipped ramps, and the reported arms say whether what fails is the
read, the ramps or the pair.

Reported, deciding nothing: each other arm against `ship` under the same four tests; the models drawn; the
bursts that fail h4 and whether the oracle loses on them too.

## Result

(filled after scoring; see below)
