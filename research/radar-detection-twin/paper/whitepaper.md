# Detection loss from a Gaussian-clutter twin: exact Pd for CA- and OS-CFAR, and an SNR shortfall that no threshold repair removes

*Stylised: square-law detection, `N=16` reference cells, Swerling-I target of constant local SNR that shares the test cell's texture, unit-mean gamma texture of shape ν independent per reference cell (K-distributed power), thresholds set in a Gaussian-clutter twin. Pure Python; every number is from `experiments/results.txt`, and each law is checked against direct simulation (`tests/`, results section 2).*

## Question
`radar-clutter-twin` showed that a CA-CFAR threshold set in a Gaussian twin inflates the real false-alarm probability (Pfa), and that raising the threshold repairs it. It left open (i) whether a different detector, OS-CFAR, is less exposed, and (ii) what the repair costs in *detection*: how much stronger a target must be to reach the same detection probability (Pd) once the threshold is honest. That second number is what a twin should be promising when it is used to size a sensor or a mission.

## Model
Cell power is `τ·e`, `e~Exp(1)` speckle, `τ~Gamma(ν,1/ν)` texture (ν→∞ is the twin). A target of local SNR `s` makes the test cell `τ0(1+s)e0`. CA-CFAR compares it with `α·mean(reference)`, OS-CFAR with `α·` the `k`-th smallest reference cell (`k=8,12,14` of 16). Scaling the test cell by `1+s` is the same as dividing `α` by `1+s`, so Pd(α,s)=Pfa(α/(1+s)) in every world, twin or real.
- Twin: CA `Pfa=(1+α/N)^{-N}`; OS `Pfa=Π_{i<k}(N−i)/(N−i+α)`.
- Real, CA: the one-dimensional integral of `radar-clutter-twin`.
- Real, OS (new here): reference cells are iid with marginal survival `S(z)=E exp(−z/τ)`, `F=1−S`, so `F(Z_(k))~Beta(k,N−k+1)` and `Pfa=∫ S(αz)·kC(N,k)F^{k−1}(1−F)^{N−k} dF`, evaluated on a fine grid.

## Results
1. **Exact laws.** Against 400k-trial simulation at design 1e-2: OS k=12 Pfa 0.0361 vs exact 0.0364 (ν=2), 0.0214 vs 0.0215 (ν=5); Pd at 9 dB SNR, CA 0.4752 vs 0.4743 (ν=2), 0.5193 vs 0.5194 (ν=5), OS 0.4889 vs 0.4877, 0.5149 vs 0.5159.
2. **OS-CFAR is not immune.** Real/design Pfa at design 1e-4, twin thresholds: ν=2: CA 30×, OS k=8/12/14 42×/35×/26×; ν=5: 9.2×, 8.5×/9.2×/8.1×; ν=20: 2.4×, 2.0×/2.3×/2.2×. Order statistics do not fix a marginal-shape error: the ordering of detectors varies with rank, ν and design Pfa (at 1e-6, OS k=8 is better than CA: 322× vs 358× at ν=2). The threshold repair costs about the same as for CA: 3.7 dB (CA) and 3.7–4.6 dB (OS) at ν=2, 1.9–2.1 dB at ν=5, 0.6 dB at ν=20.
3. **Detection loss is real and larger than the threshold repair.** SNR for Pd=0.9 at Pfa 1e-4 (dB): the twin promises 20.7 (CA); real clutter with an honest threshold needs 27.0 (ν=2), 23.5 (ν=5), 21.5 (ν=20), a shortfall of 6.3, 2.8, 0.8 dB. The shortfall exceeds the threshold correction alone (3.7, 1.9, 0.6 dB) because the real Pd curve is also shallower than the twin's, so the ν=2 target must be about 6 dB above what the twin said. OS k=12 has shortfall 6.1, 2.7, 0.8 dB: the same story.
4. **Uncalibrated, the twin's detector is wrong on both axes.** At the twin's threshold and the twin's promised 20.7 dB target, real Pd is 0.84 (ν=2) and 0.88 (ν=5), not 0.90, while real Pfa is 30× and 9× the design. False alarms are inflated and detections are missing at the same time.
5. **No ranking reversal here.** In the twin the SNR ordering is CA < OS k=14 (+0.50 dB) < OS k=12 (+0.62) < OS k=8 (+1.48). In real clutter CA stays best at every ν tested down to 1.5; the OS penalty only shrinks (k=12: +0.62 dB in the twin, +0.43 at ν=2, +0.33 at ν=1.5). A twin would have picked the right detector in this model; a reversal, if one exists, needs a different clutter model (e.g. outliers in the reference window, which this model excludes by construction) — this is a negative result on the detector-selection question.
6. **Spatial correlation again cancels the problem.** With one texture draw per window, Pfa is on design for both CA (0.0101, 0.0102) and OS (0.0102, 0.0103) at design 0.0100.

## Limitations
Not evidence about any real radar: no measured data, iid per-cell texture, a target that shares the test cell's texture and has constant local SNR (a target whose return is independent of clutter texture would give a different Pd law), single-pulse detection, no interfering targets in the reference window (where OS-CFAR is normally preferred), one window length, and Pd/Pfa laws for the two detectors only. The grid quadrature is checked against simulation and the ν→∞ limit but not against a closed-form K-distribution survival function. Detection loss is reported at a single operating point (Pd 0.9, Pfa 1e-4).

## Next steps
Interfering targets in the reference window (where OS should win, testing whether a twin that omits them mis-ranks detectors); a target return independent of texture; calibrate ν from real cells and propagate that estimation error into an SNR shortfall interval; connect to `randomized-twin` by randomizing ν in the twin.

## References
- Finn, H. M. & Johnson, R. S. (1968). Adaptive detection mode with threshold control as a function of spatially sampled clutter-level estimates. *RCA Review* 29(3), 414–464.
- Rohling, H. (1983). Radar CFAR thresholding in clutter and multiple target situations. *IEEE Trans. Aerospace and Electronic Systems* 19(4), 608–621.
- Ward, K. D. (1981). Compound representation of high resolution sea clutter. *Electronics Letters* 17(16), 561–563.
