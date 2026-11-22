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

### J1 on the first draw: `candidate` fails h4 on 2 bursts; both are frames where the `mpcws` read collapsed to zero

240 drawn: 125 scored; 92 skipped for a missing NoiseProfile, 15 because the merge and reference differ in size,
8 over 25% masked. Models scored: Nexus 6P 54, angler 20, Pixel XL 15, Nexus 6 14, sailfish 11, marlin 8, one each
Pixel, bullhead, Nexus 5X. Every number: `hdrplus-joint-check-j1-2026-11-22.txt`.

| test | reading | bar | |
|---|---|---|---|
| h1 means and thirds | colour **+0.076**, luma **+0.084**; thirds (luma/colour) +0.093/+0.070, +0.067/+0.048, +0.092/+0.110 | each at least -0.005; thirds at least -0.02 | pass |
| h2 losers to `D` | 0 (what ships loses on 3) | no new, no more | pass |
| h3 mean luma | **+0.084** | at least +0.02 | pass |
| h4 bursts over 0.1 dB under `ship` | **2 of 125**: `0543_20150918_202017_556` (-1.72 luma), `4KK2_20150910_145202_958` (-0.17) | none | **fail** |

So by the rule **`mpcw` and the shipped ramps stay**, no option is added.

**Why the two lose (reading after the verdict).** On both, the `mpcws` read is effectively zero (sigma at 18% grey
7.5e-13 and 6.2e-12 slope terms; the truth reads 0.058 and 0.0055): every block's `q` goes to zero, the blend is
all directional, and the candidate scores exactly `D`'s numbers. `mpcws` on the shipped ramps loses on the same two
by the same amounts, so it is the read, not the ramps. Neither is an oracle loss: `true` on its own pick gains on
both. Collapse is not `mpcws`'s alone: a read under a quarter of the truth's sigma at 18% grey happens on 17 of 125
scenes for what ships and 11 for `mpcws` (several are the same frames, often heavily masked night or indoor
scenes); where both collapse, both equal `D` and neither loses to the other. This is the open NEXT.md item "a noise
floor for frames with no smooth region".

**Reported arms.** `mpcws` on the shipped ramps: +0.027 / +0.074, 3 worse (the dB sweep's h4 failure again, on
fresh bursts). `ship` on its refit pick: +0.065 / +0.057, **10 worse** and 4 new losers to `D` (the refit's h3/h4
failure again, worse here). The oracle `true` on the shipped ramps: -0.001 / +0.145, 14 worse; **on its own pick
(0.2, 0.8) / (0.8, 1.5): +0.113 / +0.145, 0 worse, worst -0.051, passes all four tests** — the refit's R2 holds on
a fresh draw: an accurate read on its own ramps beats what ships everywhere.

A post-hoc floor (`candidate_floor`: the `ship` read where `mpcws` reads under half its sigma, on the candidate's
ramps) fixed the two but made two new losers (`0382_20150913_114822_649`, `1125_20151229_175611_751`): the
shipped read on ramps tuned for `mpcws` is the mismatch the refit found. A fallback to the whole shipped pair
where `mpcws` collapses passes all four on this set, by construction, so it was committed as J2 and tested blind.

## J2 (committed after J1, before the second draw was fetched)

**Arm `fallback`:** `candidate`, except on a frame where the `mpcws` read's sigma at 18% grey is under 0.25 x the
shipped read's (`COLLAPSE`), where it is exactly `ship` (read and ramps). The 0.25 was fixed from J1's frames
(3 of 125 trip it there), and is not tuned on the second draw.

**Draw:** 240 more bursts, `random.Random(20261123)`, from the full set less the subset and less J1's 240
(`hdrplus-joint-check-bursts2-2026-11-22.txt`). Same prep, same skips.

**Tests:** J1's h1 to h4, `fallback` against `ship`. **A pass** adds the pair (`mpcws` read with ramps (0.3, 1.0) /
(1.0, 2.0), collapse fallback to the shipped pair) as a named option and opens the drawn-noise check on Bayer files
no ramp fit has used; it does not change the default (phones only). **A fail** keeps everything and the failing
bursts say what the next read must handle.
