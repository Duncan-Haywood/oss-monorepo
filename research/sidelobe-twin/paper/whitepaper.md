# A point-response radar twin has no range sidelobes: ghost false alarms around strong targets, and what tapering buys

## Question
Radar simulators often model a target as energy in a single range cell. The real pulse-compression output spreads a strong target into sidelobes. How wrong is the single-cell twin about false alarms near strong targets, how far out does the error reach, and does tapering the window fix it uniformly?

## Model
Range axis `x` in resolution cells. The matched-filter output of a point target is the window response `ρ_w(x) = W_w(x)/W_w(0)` with `W` the Fourier transform of `w` on one integration length: rect `sinc(x)`; Hann `[½ sinc x + ¼(sinc(x−1) + sinc(x+1))]/½`; Hamming `[0.54 sinc x + 0.23(sinc(x−1) + sinc(x+1))]/0.54`. Cell noise is `CN(0,1)`; a target of raw SNR `S` has output amplitude `√(S/ENBW_w)` at its peak (ENBW: 1, 1.5, 1.3628), so a taper pays its noise-bandwidth loss. The cell test is `|y|² > T²`, `T² = −ln Pfa0`. Real, no weak target at offset `x`: `y = √(S/ENBW)·ρ_w(x) + n`, so the exceedance is the Rician (Marcum) `P(|ν + n|² > T²)`, `ν = √(S/ENBW)|ρ_w(x)|`, computed exactly as `Σ_k Pois(k; ν²)·P(Pois(T²) ≤ k)`. The twin has `ρ = δ`, giving `Pfa0` at every offset.

Exact consequence: the ghost depends on `S` only through `(S/ENBW)ρ²`, so the strong-target SNR that keeps the peak-sidelobe ghost below any level improves from rect to taper `w` by exactly `PSL_rect − PSL_w + ENBW_w` (dB).

## Results
(all from `experiments/results.txt`)
1. **Windows.** Peak sidelobe −13.26 dB (x = 1.43), −31.47 (2.36), −42.68 (4.50) for rect, Hann, Hamming; 3 dB widths 0.886, 1.441, 1.303 cells (1.63×, 1.47× rect); ENBW 0, 1.76, 1.34 dB.
2. **Ghost probability at the peak sidelobe (twin: 1e-6).** Rect: 2.2e-5, 0.020, 1.0 at S = 10, 20, 30 dB. Hann: 2.3e-5 at 30, 0.020 at 40, 1.0 at 50. Hamming: 1.6e-5 at 40, 0.010 at 50, 1.0 at 60.
3. **Ghost-free dynamic range** (ghost Pfa ≤ 1e-4 at the peak sidelobe): 12.93, 32.89, 43.68 dB. The gain over rect, 19.97 and 30.76 dB, equals the identity above; it is the same at every Pfa level tested (1e-5 to 1e-2).
4. **Ghost zone.** Smallest offset beyond which every lobe gives Pfa ≤ 1e-4, at S = 20, 30, 40, 50, 60 dB: rect 3, 10, 33, 105, 331 cells (ratio ≈ √10 per 10 dB, as the `1/(πx)` envelope implies); Hann 2, 2, 3, 4, 7; Hamming 2, 2, 2, 13, 42. The lowest-peak-sidelobe window (Hamming) has the larger zone than Hann at 50–60 dB because its far sidelobes decay as `1/x` and Hann's as `1/x³`; ordering windows by peak sidelobe alone is misleading for very strong targets.
5. **Weak target next to a strong one** (weak 13 dB raw, strong 40 dB, uniform relative phase; twin Pd 0.874 rect). Rect, first sidelobe (x = 1.43): real Pd 1.000 but the same cell alarms with probability 1.0 without any weak target, so Pd − Pfa = 0; at x = 5.5: Pd 0.783, Pfa 0.999; at 10.5: 0.698 vs 0.194; at 25.5: 0.768 vs 4.3e-4. With S = 25 dB, rect's first lobe has Pd 0.714 and Pfa 0.618. Tapers at 40 dB: Hann 0.591 vs 0.020 at its peak lobe, then 0.499 (twin 0.499, the taper's loss) beyond; Hamming 0.595–0.598 (twin 0.598).
6. **Numerics.** The Marcum routine matches Monte Carlo (0.18288 vs 0.18297 at ν = 3, T² = 13.8; 0.68988 vs 0.68923 at ν = 4) and numerical integration in the tests.

## Limitations
Stylised, no radar data. One strong target and one weak target at a known cell; white noise in the output cell (a real matched filter correlates noise across adjacent cells); no clutter, Doppler mismatch, quantisation or receiver compression; no CFAR, which would raise the local threshold near the strong target and convert ghosts into masking (the Pd results would then fall); cosine-family windows only. The twin is a deliberately naive baseline, and a twin containing `ρ_w` would reproduce everything here by construction. Zone radii are scanned on an integer grid with 1/8-cell sampling.

## Next steps
Add a CFAR (cell-averaging and ordered-statistic) real system and quantify the ghost/masking trade-off; Doppler-mismatched chirps (ambiguity-function sidelobes); optimal (Dolph–Chebyshev, Taylor) tapers against the 1/x tail; a closed-loop detector tuned in each twin, in the `twin-certification` style; pair with `glint-twin` (same strong/weak target pair, there on angle).

## References
- Harris, F. J. (1978). On the use of windows for harmonic analysis with the discrete Fourier transform. *Proceedings of the IEEE* 66(1), 51–83.
- Richards, M. A. (2014). *Fundamentals of Radar Signal Processing*, 2nd ed. McGraw-Hill.
- Skolnik, M. I. (2008). *Radar Handbook*, 3rd ed. McGraw-Hill.
- Marcum, J. I. (1960). A statistical theory of target detection by pulsed radar. *IRE Transactions on Information Theory* 6(2), 59–267.
