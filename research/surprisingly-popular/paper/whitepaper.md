# Surprisingly popular verdicts when faults are rare to spot

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Majority vote among verifiers of a decentralised training job fails whenever a fault is detected by fewer than half of them, however many verifiers vote: with detection probability 0.45 and false-alarm probability 0.05 the majority is wrong on faulty jobs with probability 0.84 at n=101 and 0.96 at n=301. The surprisingly-popular (SP) rule of Prelec, Seung and McCoy (2017), which asks each verifier for a verdict plus a prediction of others' verdicts and answers "faulty" iff the flag fraction exceeds the mean predicted fraction, needs no knowledge of the detector. For Bayesian verifiers with truthful reports I show it collapses to an exact threshold on the flag fraction, `θ = v/(1−u+v)`, and give its exact finite-n error: 2.1×10⁻⁵ (faulty) at n=101, 47 votes for 10⁻³ total error against 36 for the Bayes rule that knows the detector. A wrong believed *prior* never breaks the limit but ruins finite-n accuracy (error 0.51 at believed prior 0.99, n=101); a wrong believed *detector quality* does break it; and Byzantine verifiers who vote "clean" and predict "everyone flags" break it at exactly `ρ* = gap/(1+gap)` = 13.6%, which a trimmed mean prediction removes in simulation. Stylised: one binary signal, common model.

## 1. Model
A job is faulty (A, prior `π`) or sound (B). Each of `n` verifiers independently flags with probability `s` (sensitivity) under A and `1−c` (`c` = specificity) under B. A Bayesian verifier who knows `(π,s,c)` and sees flag/no flag predicts the fraction of flags to be `u = P(flag|flag)` or `v = P(flag|no flag)`, with `u > v` iff the signal is informative. SP outputs A iff `n_a/n` exceeds the mean prediction. Verdict quality is scored by exact binomial sums (`error_at_threshold`).

## 2. SP is a fraction threshold
With truthful reports the mean prediction is `(n_a u + (n−n_a)v)/n`, so SP says A iff `n_a/n > θ = v/(1−u+v)`. For `π=0.5, s=0.45, c=0.95`: `u=0.41, v=0.1967, θ=0.25`. The test `test_threshold_identity` checks this against brute-force SP on random reports. Majority is the threshold ½ and is right in the limit iff `s>½` and `c>½` (true for 50.2% of random draws with `s+c>1`); SP is right in the limit iff `1−c < θ < s`, which held in 99,612 of 99,612 common-prior draws with `s+c>1` (an instance of Prelec's theorem, checked numerically here, not proved). The Bayes rule with known `(π,s,c)` is a different threshold (≈0.20 here), so SP pays a finite-n price for not knowing the detector.

## 3. Finite-n cost (E1, E2)
Overall error at prior ½: majority 0.32 (n=11) rising to 0.48 (n=301) as it locks onto "sound"; SP 4.0×10⁻² (n=11), 6.3×10⁻⁴ (51), 1.0×10⁻⁵ (101); Bayes 4.0×10⁻² , 8.6×10⁻⁵, 6.3×10⁻⁸. Votes for 10⁻³: SP 47, Bayes 36 (×1.3). SP's error is dominated by the faulty state, because `θ=0.25` sits closer to the faulty flag rate 0.45 than to 0.05 in relative terms.

## 4. What breaks SP (E4, E4b, E5)
- **Believed prior** wrong (truth ½): limit correct for every believed prior in [0.001, 0.999] since `θ` stays inside `(1−c, s)`, but n=101 error in A is 2×10⁻¹⁵ (believed 0.02), 2×10⁻⁵ (0.5), 0.22 (0.9), 0.51 (0.99): verifiers who expect flags find them unsurprising.
- **Believed detector quality** wrong: `θ` from believed `(0.9, 0.5)` is 0.70 > 0.45, so SP is wrong in the limit; likewise `(0.9,0.9)` and `(0.55,0.55)` (θ=0.5). Underestimating quality is safe here.
- **Byzantine** fraction `ρ` voting "no flag" and predicting 1: SP is right in A in the limit iff `(1−ρ)(s−m_A) > ρ`, `ρ* = 0.136` for `m_A=0.293`. Simulation (n=2000, 60 runs): 1.00 at 0.10, 0.78 at 0.13, 0.03 at 0.15. Dropping the largest and smallest `ρn` predictions before averaging keeps SP right at ρ=0.20 (1.00) but fails at 0.30; it needs an upper bound on ρ.

## 5. Limits and links
Not shown: incentive compatibility of the reports. Truthful reporting of both verdict and prediction is what Bayesian truth serum (Prelec 2004) scores; here it is assumed. Signals are conditionally independent and share one model; correlated or focal signals (`focal-laziness`, `verifier-cascades`) violate the threshold identity. This complements `peer-prediction-effort` and `robust-aggregation`: SP removes the need for a ground-truth-free detector model, at the price of a prediction report that Byzantines can poison.

## References
Prelec, Seung, McCoy (2017), *A solution to the single-question crowd wisdom problem*, Nature 541. Prelec (2004), *A Bayesian truth serum for subjective data*, Science 306.
