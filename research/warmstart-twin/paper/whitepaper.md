# Cold-start bias of a short twin run: an empty-queue start biases the mean wait by −5.6 (of 9) at 50 jobs, but by less than 0.1 standard deviations at any run length long enough for a valid interval

*Stylised: stationary-mean-0 Gaussian AR(1) output and the M/M/1 waiting time of a shared lab instrument (service rate 1). Pure Python; every number is from `experiments/results.txt` (seeded, a few minutes). The "real" system is itself simulated; no lab data. The closed form `C = ρ/(1−ρ)³` is a numerically verified identity, not a proof.*

## Question
A digital twin is reset to a default state (empty queue, zero error) and averaged over `n` steps. The run mean is then biased toward that default. How large is the bias relative to the noise, when does it matter, and do the usual remedies (delete a warm-up, MSER-5 truncation, start from a state estimate) help?

## Model
(i) AR(1) with marginal variance 1, mean 0, lag-one correlation `φ`, started at `x₀ = a`. Deleting the first `d` steps of a budget `n` gives an exact bias `aφ^{d+1}(1−φ^{n−d})/((1−φ)(n−d))` and an exact variance (a sum of squared weights, `ar1_start_var`). (ii) M/M/1 wait started empty (first wait 0). By Spitzer's identity the summed bias is `C = Σ_{k≥1} E[S_k⁺]` with `S_k` a difference of Gamma(k) variables, a finite sum per `k`; the large-`n` bias of the mean of `n` waits is `−C/n`.

## Results
1. **AR(1) bias and variance are exact** (φ=0.9, a=3, 20 000 runs): at n=20/100/500/2500 the bias is 1.186/0.270/0.054/0.0108 (simulated 1.190/0.272/0.057/0.0108) and the sd 0.631/0.405/0.192/0.087 (simulated 0.631/0.403/0.192/0.087). Bias/sd falls as `1/√n`: 1.88, 0.67, 0.28, 0.12.
2. **Deleting a warm-up is worth it only when the start is far off and the correlation is long.** MSE-optimal `d*` is 0 for a=1 at φ≤0.9; for a=3 it is 10 of 100 at φ=0.9 (MSE ×0.84) but 9 of 1000 (×0.98); at φ=0.99, a=3 it deletes half of a 100-step budget (×0.68) and 110 of 1000 (×0.81).
3. **Required accuracy of a warm-start state** (largest error in marginal-sd units with |bias| ≤ κ·sd): at φ=0.9, κ=0.25 it is 1.15 at n=100, 3.81 at n=1000, 12.1 at n=10 000; at φ=0.99, n=100 it is 0.34, i.e. a highly persistent short run needs a real-state estimate within a third of a standard deviation.
4. **M/M/1 empty-start bias constant** `C` from the exact series equals `ρ/(1−ρ)³` to 9 printed digits at ρ=0.3/0.5/0.7/0.9 (0.8746, 4, 25.93, 900). Paired-coupled simulation (same increments, empty vs stationary start) matches `−C/n`: −0.0388 vs −0.0400 (ρ=0.5, n=100), −0.0915±0.0035 vs −0.0864 (0.7, 300), −0.3025±0.0165 vs −0.3000 (0.9, 3000), −0.0492±0.0064 vs −0.0450 (0.9, 20 000).
5. **Bias equals one asymptotic sd only at `n* = C²/V = ρ/((1−ρ)²(2+5ρ−4ρ²+ρ³))`**: 0.19/0.55/2.0/22.6 jobs at ρ=0.3/0.5/0.7/0.9, tiny next to the relaxation scale `1/(1−√ρ)²` = 5/12/37/380. So in the regime where the asymptotics hold the cold-start bias is a minor term next to autocorrelation (`autocorr-twin`).
6. **Short runs are a different regime** (ρ=0.9, true mean 9, 6000 runs): from an empty start the mean of 50 / 100 / 300 / 1000 / 3000 waits is low by 5.57 / 4.38 / 2.44 / 0.93 / 0.26 (62% of the mean at n=50), with sd 2.6–4.3, so bias exceeds sd for n ≤ 300 and a twin would systematically report a faster instrument than the real one. Starting at the mean (9) cuts the bias to −1.29/−1.50/−1.10/−0.47/−0.10, but not always the RMSE. Starting from an exact stationary draw or a noisy (σ=3) real-state estimate is unbiased (|bias| ≤ 0.36) but has a much larger sd (9.3 at n=50) because the run inherits the real state's randomness. RMSE therefore *favours the biased empty start* at n=50–300 (6.1, 5.5, 4.9 vs 9.3, 8.9, 7.6 for a stationary start): a lower RMSE from a deterministic start is variance reduction bought with bias, not fidelity.
7. **MSER-5 truncation did not help here.** It deleted 9/15/35/97/260 jobs on average at n=50…3000 but left bias −4.97/−3.79/−2.16/−1.32/−0.98 and RMSE at or above the empty start (e.g. 6.23 vs 6.13 at n=50; 5.55 vs 4.39 at n=1000).
8. **Interval coverage at ρ=0.9** (30 batch means, 1000–1500 runs): empty start / stationary start / empty+MSER-5 cover 62.6% / 65.4% / 52.7% at n=3000, 77.9% / 79.0% / 67.3% at 10 000, 89.0% / 89.2% / 82.1% at 30 000 (predicted bias/sd 0.087/0.047/0.027). The empty start costs only 1–3 points of coverage; the undercoverage is the correlation-time problem of `autocorr-twin`, and MSER-5 made it worse by discarding data.

## Limitations
One start error model (deterministic, or independent Gaussian noise on a stationary real state); AR(1) and M/M/1 only; one MSER variant (batch 5, deletion ≤ half the run) and one interval rule; the closed form `ρ/(1−ρ)³` is verified numerically, not proved; `−C/n` is checked in the regime `n` ≳ the relaxation time and is *not* claimed at n=50–300, where item 6 is measured directly. "Stationary start" here is the real system's state at a random time, so its variance is not a flaw of the twin. Simulation standard errors are 0.0008–0.017 in item 4 and about 1.2 points on coverage.

## Next steps
A proper (non-numerical) derivation of `C`; conditional forecasts from an observed real state (bias vs a state-estimate error and sampling across states) with a filter such as `filter-twin`; multi-server and heavy-tailed instruments; regenerative-cycle starts.

## References
- Spitzer, F. (1956). A combinatorial lemma and its application to probability theory. *Trans. AMS* 82, 323–339.
- White, K. P., Jr. (1997). An effective truncation heuristic for bias reduction in simulation output. *Simulation* 69(6), 323–334.
- Daley, D. J. (1968). The serial correlation coefficients of waiting times in a stationary single server queue. *J. Austral. Math. Soc.* 8, 683–699.
- Whitt, W. (1989). Planning queueing simulations. *Management Science* 35(11), 1341–1366.
- Law, A. M. & Kelton, W. D. (2000). *Simulation Modeling and Analysis*, 3rd ed. McGraw-Hill.
