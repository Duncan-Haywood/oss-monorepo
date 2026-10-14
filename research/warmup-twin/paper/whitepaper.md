# Start a twin in the wrong state and the transient is real but small: exact warm-up bias, and why deleting it did not help here

*Stylised: Gaussian AR(1) output started at a fixed offset, and the M/M/1 waiting time of a shared lab instrument (service rate 1) started empty. Pure Python; every number is from `experiments/results.txt` (seeded, ~1 min). The "real" system is itself simulated; no lab data. Negative results are reported as such.*

## Question
A digital twin is initialised at a convenient state, so its first outputs are not draws from the steady state a certification claim is about. How large is the resulting bias in the run mean, how many initial outputs are worth discarding, and does a standard automatic rule (MSER-5) choose well?

## Model
(i) AR(1) with marginal variance `s²`, correlation `φ`, and draw 0 fixed at offset `δ` from the mean. Then `E x_t = δφ^t`, and discarding `d` of `n` draws (`m=n−d` kept) gives bias `δφ^d(1−φ^m)/(m(1−φ))` and, since `Cov(x_s,x_t)=s²φ^{t−s}(1−φ^{2s})` for `s≤t`, variance `(s²/m²)[m+2Σ_{k<m}(m−k)φ^k − (Σ_{t=d}^{n−1}φ^t)²]`. The MSE-optimal `d` is found by scanning. (ii) M/M/1 waits by the Lindley recursion from an empty queue at loads ρ=0.5, 0.7, 0.9 (true mean `ρ/(1−ρ)`). (iii) Rules for discarding: none, a fixed fraction, and MSER-5, which batches into means of 5 and minimises `Σ_{i>d}(Y_i−Ȳ_d)²/(k−d)²` over `d ≤ k/2` (White 1997). Intervals are 30 batch means with a Student-t quantile.

## Results
1. **AR(1) formulas are exact** (δ=3, s=1, 20 000 runs): bias 0.1200/0.1228 (φ=0.5, n=50), 0.3000/0.3002 (0.9, 100), 0.7365/0.7453 (0.99, 400), and with d=20 at φ=0.9 0.0456/0.0469; variance 0.1620/0.1614 and 0.2092/0.2065 (d=20). Discarding trades bias for variance: at φ=0.99, n=400, d=200 the bias falls 0.74→0.17 while the variance rises 0.316→0.563.
2. **The optimal warm-up is about one relaxation time and the gain is modest.** Exact MSE-optimal `d*` is 2, 10–11 and 104–111 at φ=0.5, 0.9, 0.99 (relaxation times 2, 10, 100). MSE improves by at most 1.47× (φ=0.99, n=100), 1.26× (φ=0.9, n=100), and by 1.03×/1.003× for n=1000/10 000 at φ=0.9 (100/1000 relaxation times): with n ≈ 100 relaxation times the transient is not worth handling (1.24× is still available at φ=0.99, n=1000, i.e. 10 relaxation times).
3. **M/M/1 empty start** (2000 runs each; bias of the mean wait over the first n jobs, standard errors in the results file): ρ=0.9: −1.88 (−21%), −0.56 (−6.2%), −0.105 (−1.2%) at n=500/2000/10⁴; ρ=0.7: −0.052, −0.035, −0.008; ρ=0.5: within ±0.01. The bias is always optimistic (waits too short) and only material at high load with short runs.
4. **What to discard** (ρ=0.9, n=5000 from empty, 2000 runs; true mean 9). Bias/RMSE/30-batch coverage: none −0.14/2.42/71.7%; fixed 10% (500 jobs) +0.02/2.60/72.1%; fixed 30% +0.05/2.93/68.3%; MSER-5 (mean 376 jobs) −0.77/2.44/60.7%. The transient bias (about 0.14, ≈2.6 standard errors of the 2000-run mean) is small next to the 2.4 run-to-run error, so removing it raises RMSE. **MSER-5 fails here**: it stops discarding too early, leaving more bias than a fixed 10% rule and shrinking the interval (half-width 2.39 vs 2.70).
5. **False certification** (true mean 9, SLA 8 violated; certify when mean + half-width < 8; 2000 runs). n=3000: none 18.1%, fixed 30% 17.7%, MSER-5 28.1%. n=10⁴: none 5.5%, fixed 30% 7.9%, MSER-5 13.1%. Discarding does not help here and MSER-5 is worst; the dominant error is the coverage shortfall of batch means at ρ=0.9 (see `autocorr-twin`), not the start.

## Limitations
One start state per model (δ=3 for AR(1), empty for M/M/1); MSER-5 in its plain form only, with no comparison with Welch's graphical method, MSER-5 with a fixed-fraction cap, or initialising from an estimated steady-state (which avoids a transient altogether); a single run length at ρ=0.9 for the discard comparison and 2000 runs (standard error of the mean 0.05, of coverage 1 point); the M/M/1 bias is measured, not derived, and the transient of a general twin need not decay geometrically. Findings 4–5 say MSER-5 was not useful in this configuration, not that truncation rules are useless.

## Next steps
Initialise the twin from the empirical steady-state distribution of a short pilot run instead of discarding; MSER with a cap on the truncated fraction; parallel short replications versus one long run under a fixed budget; a non-geometric transient (a twin whose battery drains slowly); combine with `autocorr-twin` for the interval that is valid after truncation.

## References
- White, K. P. Jr. (1997). An effective truncation heuristic for bias reduction in simulation output. *Simulation* 69(6), 323–334.
- Law, A. M. & Kelton, W. D. (2000). *Simulation Modeling and Analysis*, 3rd ed. McGraw-Hill.
- Schmeiser, B. (1982). Batch size effects in the analysis of simulation output. *Operations Research* 30(3), 556–568.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
