# An instantaneous-exposure twin of a camera with finite exposure certifies detection at every speed: the real speed limit, and what a blur-matched filter buys back

## Question
Synthetic training and test images are usually rendered at an instant. A real camera integrates over an exposure `T`, so a target moving at `v` px/s is smeared over `d = vT` px. The twin therefore certifies a detector at all speeds. How fast can a target really go before a detector tuned on the twin misses it, and how much of that is recoverable by a filter that knows the blur?

## Model
1-D bar of width `w` px and contrast `C`, occupying `[0, w]` at the start of the exposure and moving `d` px during it. Time-averaged intensity at `x`:
`I(x) = C·|[x−w, x] ∩ [0, d]| / d`, a trapezoid with knots `0, min(w,d), max(w,d), w+d`, peak `C·min(1, w/d)`, plateau width `|d−w|`, base `w+d`, and `∫I = Cw` for every `d`. The forward simulation (`profile_sim`) averages 2000 sub-exposures of the moving indicator and does not use this formula. Pixels are unit boxes (exact integrals of the piecewise-linear profile), noise is i.i.d. `N(0, σ²)`. The test statistic is either the largest pixel ("peak") or the largest sum of `L` consecutive pixels divided by `√L` (unit-noise box filter). The threshold is set on noise alone for false-alarm rate `α = 10⁻³`; `Pd = Q(Q⁻¹(α) − μ/σ)` with `μ` the noiseless statistic. Let `z = Q⁻¹(α) − Q⁻¹(Pd)`; for Pd = 0.9, `z = 4.372`.
- Peak detector (`d ≥ w`): `μ = Cw/d`, speed limit `d*_peak = wC/(σz)`.
- Box of full length `w+d`: `μ = Cw/√(w+d)`, limit `d* = (wC/(σz))² − w`.
- Box of length `d` (`d ≥ w`): dropping two triangular corners of area `w²/8` each gives `μ = Cw/√d · (1 − w/(4d))`; the limit solves `μ = σz` by bisection.
For large SNR `d*_box/d*_peak ≈ wC/(σz) ≈ d*_peak`.

## Results
(all numbers from `experiments/results.txt`; `T = 10 ms`, so `v = 100·d` px/s)
1. **Profile.** Closed form vs simulation: max error 5.0·10⁻⁴, equal to the 1/2000 quantisation of the simulation. Peak = `min(1, w/d)` and energy = 6.000 (`w = 6`) for all `d` tried.
2. **A twin-tuned peak detector fails at once.** `w = 6`, `C/σ = 10`: Pd = 1.000, 1.000, 0.972, 0.278, 0.077, 0.033, 0.018 at `d = 0, 6, 12, 24, 36, 48, 60` (Monte Carlo with 20 000 draws agrees to ≤ 0.002). The twin gives 1.000 everywhere. Limit `d*_peak = 13.72` px (1372 px/s); numeric bisection on the pixel outputs gives the same to 0.01 px, because at phase 0 the peak pixel lies on the plateau.
3. **A blur-matched box buys back a quadratic speed range.** At the same setting the best box has Pd = 1.000 at every `d` up to 60 (output 7.6σ at `d = 60`) and limit `d* = 185.3` (closed form, length `d`), numeric 185.30, versus 182.4 for the cruder full-length analysis; speed 18 530 px/s vs 1372. Over `w ∈ {3, 6, 12}`, `C/σ ∈ {8, 10, 15, 20}` the numeric speed gain is 5.2× to 54.8× and tracks `d*_peak` (for example 13.50× against `d*_peak = 13.72`). The length-`d` closed form is exact in the pixel model at integer `d` (tested), and the numeric argmax over all integer lengths equals `d` for `d ≥ 2w` (12, 24, 48 at `w = 6`); for `w ≤ d < 2w` it is `d + 2` (8 at `d = 6`, 11 at `d = 9`), a gain of at most 2.6% in output.
4. **Filter tuned on the twin.** A box of fixed length `w` (what the instantaneous render suggests) gives Pd 1.000 (d = 12), 0.999 (24), 0.839 (36), 0.489 (48), 0.261 (60): better than the peak detector but far from the matched box, with no certification from the twin of where it breaks.

## Limitations
1-D, one bar, known location; constant velocity during the exposure, noise independent of `T` and the blur-free contrast `C` held fixed (a real sensor also collects more light with longer `T`, which offsets part of the loss; not modelled); pixel noise Gaussian and white; the false-alarm threshold is not corrected for searching over box positions; the matched box needs `d` (the speed) which the real system must estimate or bank over, and I did not cost that search; pixel phase fixed at 0 in the limit tables. Numeric limits use a restricted set of lengths near `d` for speed; the full argmax is checked only at the `d` in (3). The "real" camera is a model, not measured images, and I did not compare against footage or a rendered blur pipeline. Closed forms restate textbook blur and matched-filter results for this special case; nothing here is a new method.

## Next steps
Unknown velocity (filter bank, cost of the search, or blur width as a speed estimator, cf. `shutter-twin`); 2-D images and rotation blur; signal that scales with exposure (the real trade-off in choosing `T`); a learned detector trained on twin renders with randomised blur versus the matched filter; connect to `latency-twin` and `doppler-twin`.

## References
- Nayar, S. K. & Ben-Ezra, M. (2004). Motion-based motion deblurring. *IEEE TPAMI* 26(6).
- Kay, S. M. (1998). *Fundamentals of Statistical Signal Processing, Vol. II: Detection Theory*. Prentice Hall.
- Tobin, J., Fong, R., Ray, A., Schneider, J., Zaremba, W. & Abbeel, P. (2017). Domain randomization for transferring deep neural networks from simulation to the real world. *IROS*.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
