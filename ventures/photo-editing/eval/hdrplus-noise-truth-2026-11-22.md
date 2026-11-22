# The frame noise reads against real noise: HDR+ bursts (2026-11-22)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next both on a fresh blind set"; NEXT.md, "Next:
`mpcws` and `mpcw1` as arms on a fresh blind set ... or another public sample set, when one is reachable").
raw.pixls.us refuses this session (CONNECT 403), as it did for the last two sessions sent here, and the
53-file metadata-extractor-images set is spent for selection tests (eval/noise-pca-mpcw1-2026-11-22.md).

## A fresh set, and a truth that is real noise

Google's HDR+ burst dataset (Hasinoff et al., "Burst photography for high dynamic range and low-light imaging
on mobile cameras", SIGGRAPH Asia 2016; CC BY-SA 4.0; `gs://hdrplusdata`, which storage.googleapis.com
serves to this session) has 153 bursts in its public subset (`20171106_subset`). Each has the phone's raw
frames as DNGs and `results_20171023/<id>/merged.dng`, the burst aligned and merged onto the reference
frame's geometry. No photo-editing note has used it before (`grep -ri hdrplus` finds nothing here).

Every earlier noise test added synthetic noise to a near-clean mosaic, so its truth was the noise it drew.
Here the reference frame's own sensor noise is the thing measured: the reference minus the merge is that
noise with the scene removed. `tools/hdrplus_noise_truth.py` (its docstring has every step):

1. Both DNGs go through the developer to the white-balanced plane the noise-aware blend reads.
2. The merge has lens shading corrected and its own exposure scale, so `reference ~= g * merged + o` is fitted per
   colour site in 32 x 32-sensel cells; the residual is what is left.
3. Per colour, the residual's variance (cut at 4 sigma, iterated) in 12 brightness bins of the fitted level,
   using in each bin only the half of the sensels where the merge's own gradient is lowest (a sub-pixel
   misalignment leaves edges; the all-sensel truth is recorded beside it), and `variance = shot x level + read`
   through the bins.
4. The merge keeps a fraction `m` of the reference's noise (its NoiseProfile over the reference's: 0.17 on the
   pilot's 7 frames), so the truth is `var / (1 - m)`. This scales every read's ratio by one factor: it cannot
   change which read is closer.

The reads, all on the reference plane alone: `noise_pca.estimate_noise_pca` with `eig` = `chen`, `mpcw` (the Bayer
default), `mpcws` and `mpcw1`, before `FRAME_SCALE`; `xtrans_demosaic.frame_noise` with each, as it ships
(x 0.8 sigma, `guard_profile`); and the phone's own NoiseProfile carried to the plane, an independent
calibration. Each is a sigma at the plane's 50th and 90th percentile levels and at 18% grey, over the truth's.

**Pilot (one burst, `0006_20160722_115157_431`, a Pixel at ISO 51; used to build the tool, left out of the set
below):** the phone's NoiseProfile reads 0.97-1.00 of this truth at the p90 level and 18% grey and 1.22 at the
p50 level (0.008 of white); `pca_mpcws` 1.02-1.04, `pca_mpcw1` 0.91-0.97, `pca_mpcw` 0.85-0.89, `pca_chen`
0.78; the all-sensel truth is 1.05-1.14x the low-gradient one. While building it, MAD in place of the cut
variance gave dark bins that jumped by 7x between neighbours (the 10-bit frame's noise is under 1 DN there), and
bin medians in place of means put the widest bin off the line; both were changed before anything below was run.

## What is asked, and what each answer decides (committed before the 152 other bursts were scored)

Data: every other burst in `20171106_subset/bursts/` (152), one row each; a burst the tool cannot read is
reported as skipped, not dropped. Nothing is tuned on this set, so there is no split.

- **V (validity of the truth):** the phone's NoiseProfile over the truth at 18% grey, median over bursts, within
  [0.8, 1.25]. Two independent readings of the same sensor (the maker's calibration, the burst's residual)
  agreeing is the check that the truth is the noise. If V fails, only the reads' order is reported, not their
  levels.
- **Q1 (which read is closest):** median |log(read / truth)| at the p50 level, `pca_*` arms. Reported, and
  compared with the synthetic sweeps' order (`mpcws` closest, then `mpcw1`, `mpcw`, `chen`: the 2026-11-22
  notes and `tests/test_noise_pca.py`).
- **Q2 (does `mpcws`'s over-read carry over to real noise):** bursts where the shipped read (`frame_*`) exceeds
  1.3 x truth at the p50 level. If `frame_mpcws` does on more than 5% of bursts, its K-1 II over-read is not one
  file's and it stays opt-in for that reason too. If it does on none and its median is nearer 1 than
  `frame_mpcw`'s, the next step is a demosaic dB sweep on this set with the merge as the clean truth (an
  arm of the 2026-11-21 kind), not a default change here.
- **Q3 (does the shipped scale understate, as intended):** `frame_mpcw`'s share of bursts under 1.0 x truth at
  the p50 level. `FRAME_SCALE` 0.8 exists so a read errs low (an understated model only moves the blend
  toward directional). At least 90% under 1.0 holds that on real noise; under 90% is a finding against it.

No default changes on this note's evidence alone: it measures read accuracy on one camera family's 10-bit
frames, not demosaic quality.
