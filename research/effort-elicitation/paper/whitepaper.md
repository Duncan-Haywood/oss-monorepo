# Paying for checking: effort elicitation with proper scoring rules

*Stylised model, exact computation, MIT. Companion to the verification-game / holdout-market notes; complements `research/effort-contracts` (continuous-effort moral hazard with limited liability) by using a discrete sampling model with exact rent and implementability results.*

## Question
Refereed verification (Gensyn-style) needs verifiers to *spend effort*, e.g. re-run n sampled steps, before reporting a probability that a claimed result is faithful. Proper scoring rules (Savage; Frongillo–Waggoner–style elicitation) make *honest reporting* optimal, but do they also make *costly effort* optimal, and at what price? Which rule is cheapest?

## Model
Latent p ~ Beta(a,b). The verifier draws n Bernoulli(p) samples at cost c each, reports the posterior mean q_n (optimal under any strictly proper rule), and is paid α·S(q_n, y) on a fresh outcome y. Since E[S(q_n,y)] = E[G(q_n)] with G the rule's expected-score function, the value of effort is
V(n) = E[G(q_n)] − G(q_0),
computed exactly from the beta-binomial law. The verifier maximises αV(n) − cn.

## Results
1. **Implementable efforts = concave envelope.** Effort n is induced by some scale α iff (n, V(n)) is on the upper concave envelope of V; the exact interval of valid α is [max_{m<n} c(n−m)/(V(n)−V(m)), min_{m>n} c(m−n)/(V(m)−V(n))]. In all nine (rule × prior) cases tested, V was concave on n ≤ 60, so every effort level was implementable.
2. **Brier rent, exact.** For Brier, V(n) = Var(p)·n/(a+b+n). The binding constraint is the one-step deviation to n−1, giving α* = c(s+n)(s+n−1)/(s·Var p) with s=a+b and **information rent / effort cost = (n−1)/(a+b)**. Verified numerically to 1e-6 for several priors. Rent is driven by the prior's pseudo-count: diffuse or U-shaped priors (small a+b) leave the verifier a large surplus (Beta(0.3,0.3), n=20: rent is 31.7× cost), informative priors little (Beta(2,8): 1.9×).
3. **Which rule is cheapest depends on the prior.** For n\*=20, c=10⁻³, measuring the worst-case payout spread needed (a limited-liability / bankroll proxy):
   - uniform prior: spherical 2.31 < Brier 2.52 < log 3.08;
   - rare-fault Beta(0.2,5): **log 10.3 vs Brier 19.3 vs spherical 24.8** — log's curvature weights rare-event resolution, so it needs half the payout range of Brier;
   - U-shaped Beta(0.3,0.3): spherical 4.04 ≈ Brier 4.18 < log 4.52.
   Rent per unit cost is similar across rules on a given prior (uniform: 7.7–10.6; rare-fault: 3.1–3.7); log has the lowest on all three priors here.
4. **Misspecification is asymmetric.** Rules calibrated for n\*=20 on a uniform prior, deployed on a rare-fault prior, induce effort 4 (Brier), 2 (spherical) but 11 (log): the log rule degrades most gracefully when the designer's prior is wrong about event rarity.

## Limits
Single task, risk-neutral verifier, known cost c and prior, honest sampling (effort is unobservable but samples are real), payment against a verified outcome y. No collusion (see verifier-bribery), no strategic sampling, no heterogeneity in c. The log-rule spread is finite here only because reports are posterior means with n finite samples.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests` (6 tests); `PYTHONPATH=src python3 experiments/run.py` → `experiments/results.txt`.

## Implication / open questions
Effort incentives are a distinct design axis from truthfulness: choose the scoring rule by the *shape of V under the deployment prior*, not only by properness. Open: heterogeneous costs (menu of scales), multi-task budget allocation, and effort elicitation when verifier samples can be chosen adaptively.
