# A radar twin without range–Doppler coupling reads the true range of a moving target; the real sawtooth radar does not

*Stylised: one target or a stationary ring, a single up-ramp, noise-free beat tone, exact closed forms plus a signal-level check; the "real" radar is a simulation, not radar data. Pure Python; every number is from `experiments/results.txt`. Preliminary.*

## Question
A sawtooth FMCW radar measures range from the beat frequency between the transmitted and received chirp. A moving target adds a Doppler shift to that beat, so range and velocity are coupled (Richards 2005; Winkler 2007). Radar twins that render range directly omit this. How large is the error the twin does not see, when does it matter, and does using the radar's own Doppler to remove it help?

## Model
Chirp bandwidth `B`, duration `T`, slope `S = B/T`, carrier `f_c`, repetition interval `T_pri`, `V = λ/(4T_pri)`. A target at range `R` receding at `v` gives beat frequency `2SR/c + 2vf_c/c`, so an up ramp reads `R + κv` with `κ = f_c/S = f_cT/B`. The twin reads `R`.
- **In range cells.** Cell size is `c/2B`, so the bias is `2f_cTv/c = f_D T` cells, independent of `B`. In terms of the unambiguous speed it is `(v/V)·T/(2T_pri)`: at most half a cell for `|v| ≤ V`.
- **Signal level.** The beat tone is simulated with the exact two-way delay `τ = 2(R₀+vt)/(c+v)` and read by a Hann-windowed, zero-padded FFT with parabolic peak refinement. The reading equals `R₀ + κv + vT` (the last term is the target moving during the ramp, `R₀` at ramp start).
- **Compensation with a wrapped Doppler.** Subtracting `κ·wrap(v)` leaves `κ(v − wrap(v)) = 2κV·k`, `k = round(v/2V)`: `k·T/T_pri` cells. Doing nothing leaves `x·T/T_pri` cells, `x = v/2V`. Compensation is worse iff `|k| > |x|`.
- **Stationary scene.** A radar moving forward at `v` reads each stationary point at azimuth `θ` short by `κv cosθ` along the ray. For `θ` uniform on `[−φ,φ]`, a centroid (translation) fit absorbs `κv⟨cos²θ⟩`, `⟨cos²θ⟩ = ½ + sin2φ/(4φ)`, as along-track position error; what remains after removing the translation has rms `κv√(⟨cos²⟩−⟨cos²⟩²)` (rotation is zero by symmetry; numerical Procrustes agrees).

## Results
1. **Signal-level formula is exact.** Simulated read minus `R₀ + κv + vT` is ≤ 1×10⁻⁴ cells for 3 presets × speeds −25, 10, 25 m/s. Presets (fc, B, T, T_pri): fast 77 GHz/1 GHz/40 µs/60 µs, mid 77 GHz/1 GHz/200 µs/250 µs, slow 24 GHz/250 MHz/1 ms/1.2 ms.
2. **Size.** κ = 3.1 ms, 15.4 ms, 96 ms; at 30 m/s the bias is 0.092 m (0.62 cells), 0.46 m (3.1 cells), 2.88 m (4.8 cells).
3. **Within the unambiguous speed it is sub-cell** (≤ 0.33, 0.40, 0.42 cells at `v = V` for the three presets), but `V` is only 16.2, 3.9, 2.6 m/s, so at 30 m/s the two slower presets are far beyond it.
4. **Wrapped compensation is worse than none on exactly half of the over-range speeds** (fraction 0.5000 over `(V, 21V)`): at `v = 1.5V` it leaves 0.67 cells vs 0.50 uncorrected; it helps only for `x ∈ (k, k+½)`.
5. **Map consequence** at 30 m/s, ±60° field of view: along-track position bias `0.707κv` = 6.5 cm, 33 cm, 2.04 m, plus an unabsorbable distortion of rms `0.455κv` = 4.2 cm, 21 cm, 1.31 m (cells 15, 15, 60 cm). For ±30° the split is 0.91 / 0.28; for ±90° it is 0.50 / 0.50.

## Limitations
Single up ramp, one target or one ring, noise-free beat tone; a triangular (up/down) ramp cancels the coupling for constant speed (residual `κaT/2` under acceleration) but introduces peak-pairing ambiguity with several targets, which is not modelled. Real chirp-sequence radars estimate Doppler across chirps and correct the range jointly; this note models only the failure of a twin that does not. The map result applies the verified per-point shift analytically; no point cloud was rendered through the signal model. Preliminary.

## Next steps
Joint range–Doppler 2-D FFT with range migration; triangular-ramp pairing ambiguity; the effect on a radar odometry or scan-matching pipeline in a rendered scene (`mount-twin`, `doppler-twin`, `alias-twin`).

## References
See `references.bib`. Richards (2005), *Fundamentals of Radar Signal Processing*; Winkler (2007), Range Doppler detection for automotive FMCW radars, EuRAD; Kellner et al. (2013), Instantaneous ego-motion estimation using Doppler radar, ITSC; Zhao, Queralta & Westerlund (2020), Sim-to-real transfer in deep reinforcement learning for robotics: a survey, IEEE SSCI.
