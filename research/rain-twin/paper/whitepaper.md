# Rain twin: a clear-air or mean-rain-rate radar twin vs real storm-cell attenuation

## Question
Simulators often use clear-air radar range, or a single "average" rain rate. Because rain attenuation is a convex power law of rain rate and rain is intermittent, how wrong is that, does matching the mean attenuation fix it, and what should a twin report instead?

## Model
Real: clear-air detection range `r_fs = 20` km. Detect at `r` iff `40 log10(r_fs/r) ≥ A(r)`, where `A(r) = ∫ 2kR(s)^γ ds` (dB, two-way), `k = 0.012`, `γ = 1.2` (stylised). The path is divided into `ℓ`-km cells (`ℓ = 1` default), each wet with probability `p = 0.2` with exponential rate of mean `m = 10` mm/h, otherwise dry (mean rate `pm = 2`). `A` is non-decreasing and the margin is decreasing, so detection holds exactly on `[0, r_det]`. For uniform rain `R`, `r_det` solves `ln(r_fs/r) = βr`, `β = 2kR^γ ln 10/40`, so `r = W(βr_fs)/β`. For the cell model `E[R^γ] = p m^γ Γ(1+γ)`, hence `E[R^γ]/(E R)^γ = p^{1−γ}Γ(1+γ)`, and `Var A(r) = (2kℓ)² (r/ℓ)(E R^{2γ} − (E R^γ)²)`. Twins: clear air; mean-rate (uniform `R = pm`); mean-matched (uniform `R = E[R^γ]^{1/γ}`); ensembles (independent storm fields, detection probability `P(r_det ≥ r)`).

## Results
(all from `experiments/results.txt`; 6000 storm fields per sample; evaluation fields are independent of the ensemble's.)
1. **Jensen gap.** Ratio 1.5202; mean two-way attenuation 0.0838 dB/km vs 0.0551 for the mean-rate twin; the mean-matched uniform rate is 2.835 mm/h, not 2.
2. **Range.** Clear air 20.00 km; mean-rate twin 18.839; mean-matched 18.309. Real `r_det`: mean 18.372, median 18.563, 5/25/75/95% = 16.308/17.723/19.194/19.836 km. 39.2% of real fields reach the mean-rate twin's range; 58.7% reach the mean-matched twin's. 98.8% of fields lose some range (1.2% are dry on all 20 cells).
3. **Brier over 4–20 km.** Clear air 0.1009; mean-rate 0.0549; mean-matched 0.0542; ensemble with the true model 0.0377 (in-sample irreducible 0.0378); ensemble with `p = 0.1, m = 20` (same mean rate) 0.0399; with `p = 1, m = 2` 0.0457. The mean-matched correction is a negligible gain over the mean-rate twin: it moves the range, not the missing spread.
4. **Cell length.** At the same marginals, `ℓ = 0.5, 1, 2, 4, 10` km: sd of `r_det` 0.806, 1.106, 1.465, 1.868, 2.266 km; share of real fields reaching the mean-rate twin's range 0.299, 0.397, 0.503, 0.610, 0.749; Brier mean-rate 0.0432…0.1037, ensemble 0.0279…0.0601. The mean-rate twin is optimistic for short cells and pessimistic for long ones (the median attenuation falls below the mean for skewed sums); the ensemble degrades much less.

## Limitations
Stylised simulated truth; `k`, `γ` not calibrated to any band; i.i.d. cells, no spatial correlation beyond the cell, no advection, frequency, radome or beam-filling effects; one target; deterministic threshold. The ensemble result assumes the twin knows the wet/dry model family; misspecified intermittency (rows above) degrades it but still beats deterministic twins here, which is a single-parameter-set finding, not a general claim.

## Next steps
Fit `k`, `γ` and the intermittency to measured rain-gauge or weather-radar data; combine with `multipath-twin` (lobing × rain); use the ensemble probability in a detect-and-avoid or targeted-observation planner.

## References
Skolnik, M. I. (2008). *Radar Handbook*, 3rd ed. McGraw-Hill. ITU-R Recommendation P.838 (specific attenuation model for rain).
