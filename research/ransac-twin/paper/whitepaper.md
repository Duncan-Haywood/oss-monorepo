# A fixed-inlier-fraction twin and the RANSAC budget it under-sizes

*Produced with AI assistance. Stylised simulation study; no real data.*

## Question
RANSAC's iteration count is set from an assumed inlier fraction. If that fraction is tuned in a digital twin where every scene has the same fraction, how much does the success probability fall when real scenes vary, and is there a budget that fixes it?

## Model
`N = 100` correspondences, `n_in` inliers, minimal sample `s = 2`. One iteration succeeds with `q(n_in) = C(n_in,s)/C(N,s)`; after `K` iterations a scene fails with probability `(1−q)^K`. Twin: `n_in = 50` always, so `K = ⌈ln(0.01)/ln(1−q)⌉ = 17`. Real: `n_in ~ BetaBinomial(N, mκ, (1−m)κ)`, `m = 0.5`; failure is `Σ_k pmf(k)(1−q(k))^K`, exact. Prior work: Fischler & Bolles (1981), Commun. ACM 24(6):381–395.

## Results
See `experiments/results.txt` (seeded). Exact failure at `K = 17`: 0.8% (twin), 1.3% (binomial variation only), then 2.4%, 7.0%, 14.1%, 21.7%, 30.0% for `κ = 50, 10, 4, 2, 1` respectively. Budgets for 99%: 19, 23, 58, 458; none for `κ ≤ 2` since `P(n_in < 2)` exceeds 1%. Monte-Carlo agrees with the exact values within sampling error. End-to-end line fit at `κ = 4`: 12.6% slope failures with `K = 17`, 1.8% with `K = 458`.

## Limitations
Beta-binomial scene law is assumed, not fitted; `s = 2` only; one noise level; end-to-end failure threshold arbitrary; 1.8% end-to-end residual is above the 1% sampling target (a different event). Real-data validation is future work.

## References
Fischler, M. A. and Bolles, R. C. (1981). Random sample consensus: a paradigm for model fitting with applications to image analysis and automated cartography. *Communications of the ACM* 24(6):381–395.
