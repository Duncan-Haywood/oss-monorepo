# A twin fitted to finite real data is wrong by a computable amount however long it runs: exact instability, sample size, and false certification

*Stylised: the M/M/1 waiting time of a shared lab instrument (service rate 1), fitted from exponential data drawn from a simulated "real" system. Pure Python; every number is from `experiments/results.txt` (seeded, ~3 min). No lab data. Negative results are reported as such.*

## Question
Simulation noise shrinks with run length; input error does not. If a twin's rates are estimated from `n` real observations, how large is the error of its steady-state answer, when does the fitted twin not even exist, and what does it do to a certification claim?

## Model
Real system: M/M/1, arrival rate `λ=ρ`, service rate `μ=1`, true mean wait `W=ρ/(1−ρ)`. Twin: `λ̂=n/ΣA`, `μ̂=n/ΣS` from `n` interarrival and `n` service times; its infinite-run wait is `Ŵ=λ̂/(μ̂(μ̂−λ̂))`, infinite when `λ̂≥μ̂`. (i) Delta method: `∂ln W/∂ln λ = 1/(1−ρ)`, `∂ln W/∂ln μ = −(2−ρ)/(1−ρ)`, `Var ln λ̂ ≈ 1/n`, so `sd(ln Ŵ) ≈ √(1+(2−ρ)²)/((1−ρ)√n)` and a target relative sd `r` needs `n=(1+(2−ρ)²)/((1−ρ)r)²`. (ii) Exact instability: with `G₁,G₂` gamma(n), `λ̂≥μ̂ ⇔ (G₂/n)/(G₁/n) ≥ 1/ρ`, i.e. `P[F(2n,2n) ≥ 1/ρ]`, evaluated by a continued-fraction incomplete beta. (iii) Certification rules: point (certify if `Ŵ≤S`), log-scale delta upper 95% bound, parametric-bootstrap percentile bound (200 refits, unstable refits `+∞`), and posterior bound under the scale-invariant prior (`λ~Gamma(n, ΣA)`, `μ~Gamma(n, ΣS)`, 200 draws).

## Results
1. **Delta-method sd is accurate away from the stability edge** (4000 fits, sd of `ln Ŵ`, unstable fits dropped): 0.255/0.257 (ρ=0.5, n=200), 0.081/0.079 (0.5, 2000), 0.175/0.179 (0.8, 2000), 0.105/0.107 (0.9, 20 000); at ρ=0.9, n=2000 it is 0.332 vs 0.381 simulated (ratio 1.15).
2. **Required data grows as `(1−ρ)⁻²`**: for a 10% relative sd, 1300, 2989, 6100, 22 100, 84 100 observations per stream at ρ=0.5, 0.7, 0.8, 0.9, 0.95 (5%: four times as many).
3. **The fitted twin may not exist** (20 000 fits; exact/simulated): ρ=0.9: 0.370/0.369 (n=20), 0.300/0.299 (50), 0.146/0.142 (200); ρ=0.95: 0.436/0.431, 0.399/0.404, 0.304/0.301; ρ=0.8, n=200: 0.0130/0.0128.
4. **Point accuracy is poor at high load.** The median ratio `Ŵ/W` is about 1 (0.96 at ρ=0.9, n=100, where 23% of fits are unstable), but P(within ±10%) is 0.053 / 0.167 / 0.501 at ρ=0.9 for n=100 / 1000 / 10 000 (ρ=0.5: 0.213 / 0.624 / 0.996).
5. **False certification** (real wait = 1.1·SLA; 1500 fits per cell): the point twin certifies 41.6% / 35.5% (ρ=0.8, n=200/1000) and 45.6% / 42.7% (ρ=0.9). Upper bounds give 5.1% / 2.9% / 9.0% / 5.7% (delta), 3.9% / 2.1% / 4.2% / 4.4% (bootstrap), 3.5% / 1.9% / 5.3% / 4.3% (posterior). The price is power: with real wait 0.7·SLA the point twin certifies 62–91%, the bounds only 22% / 42% / 21% / 24% (delta), 15% / 37% / 10% / 18% (bootstrap), 14% / 39% / 11% / 16% (posterior).
6. **Coverage of the upper 95% bound** (1500 fits): at ρ=0.5 all three are 0.94–0.955. At ρ=0.8/0.9 the delta bound is 0.899/0.919/0.933 and 0.869/0.889/0.894 (n=50/200/1000), so it under-covers where input error matters most, and does not recover with n as fast as one would hope; bootstrap 0.939–0.947 and posterior 0.936–0.948 are close to nominal.

## Limitations
One model, two parameters, exponential data; the twin is simulated to infinite length, so the trade-off between run length and real-data size under a fixed budget is not measured. Coverage and certification rates have standard errors of about 0.6 points (coverage) and 1 point (certification). The bootstrap and posterior bounds were tested with 200 draws only. The SLA margins (10% violation, 30% slack) are one choice. A misspecified input family (heavy-tailed service, see `queue-twin`) is not combined with estimation error here. Negative: the bounds that restore validity make the twin much less useful for certifying a compliant system at these sample sizes.

## Next steps
Combine input and simulation variance under a fixed budget (how many jobs to simulate per fitted parameter draw); a misspecified family plus estimation error; correlated parameters from shared log data; real instrument logs; propagate the same analysis to the workcell and radar twins in this repository.

## References
- Cheng, R. C. H. & Holland, W. (1997). Sensitivity of computer simulation experiments to errors in input data. *Journal of Statistical Computation and Simulation* 57, 219–241.
- Barton, R. R. & Schruben, L. W. (2001). Resampling methods for input modeling. *Proceedings of the Winter Simulation Conference*.
- Henderson, S. G. (2003). Input model uncertainty: why do we care and what should we do about it? *Proceedings of the Winter Simulation Conference*.
- Barton, R. R. (2012). Input uncertainty in output analysis. *Proceedings of the Winter Simulation Conference*.
- Press, W. H. et al. (2007). *Numerical Recipes*, 3rd ed., §6.4 (incomplete beta function).
