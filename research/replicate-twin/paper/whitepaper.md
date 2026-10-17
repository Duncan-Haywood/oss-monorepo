# One long twin run or many replications? Exact MSE and exact interval coverage under an initial transient

*Stylised: Gaussian AR(1) output started at a fixed offset δ from steady state, and the M/M/1 waiting time of a shared lab instrument (service rate 1) started empty. Pure Python; every number is from `experiments/results.txt` (seeded, a few minutes). The "real" system is itself simulated; no lab data. Negative and preliminary results are reported as such.*

## Question
A simulation budget of `N` twin draws can be spent as one long run or as `r` independent replications of `n=N/r` draws, each started in the same convenient state and each with its first `d` draws deleted (replication-deletion; Law & Kelton 2000). Replication makes the replication means iid, so a Student-t interval is available without batch means. What does it cost in mean-squared error, and does the interval keep its nominal 95% when the warm-up bias does not shrink with `r` while the interval does?

## Model
AR(1), marginal variance 1, correlation `φ`, draw 0 fixed at offset `δ`. The mean of the kept draws of one replication has exact bias `δφ^d(1−φ^m)/(m(1−φ))` (`m=n−d`) and exact variance `V_n(d)` (closed form, checked against the covariance double sum in the tests). The grand mean of `r` replications has MSE `bias² + V_n(d)/r`. Replication means are exactly Gaussian, so with `Z~N(λ,1)`, `λ = bias·√r/√V`, and an independent `Q~χ²_{r−1}`, the t interval covers iff `|Z| ≤ t_{r−1}√(Q/(r−1))`. The coverage is that integral (Simpson in `√Q`; no simulation), and the mean half-width is `t√(V/r)·E√(Q/(r−1))`. `E2b` checks the coverage integral by simulation.

## Results
1. **One run minimises MSE; the price of replicating is small at `φ=0.9` and large at `φ=0.99`.** With `d` optimised separately for each `r` (N=20 000, δ=3), MSE relative to `r=1` is 1.001, 1.003, 1.008, 1.020, 1.066 at `r`=2, 5, 10, 20, 50 for `φ=0.9`, and 1.007, 1.033, 1.091, 1.254, 2.202 for `φ=0.99` (n=400 is about 4 relaxation times there). The optimal `d` is about one relaxation time (10–34 at φ=0.9, 104–351 at φ=0.99). With no deletion the penalty is larger (MSE at `r=50`, `d=0`: 0.0065 vs 0.00095 at φ=0.9). This is exact, not simulated.
2. **Undercoverage at the MSE-optimal `d` is real but modest, and appears only when `n` is small.** Exact coverage of the nominal-95% interval: at N=20 000, φ=0.9 it is 0.9487–0.9500 for all `r≤50`; at N=2000, φ=0.9 it is 0.9499, 0.9492, 0.9475, 0.9436, 0.9212 for `r`=2, 5, 10, 20, 50; at N=20 000, φ=0.99 it is 0.9499, 0.9490, 0.9474, 0.9431, 0.9179. Simulation agrees (4000 runs, N=2000, φ=0.9: 0.9467/0.9395/0.9207 against exact 0.9492/0.9436/0.9212 at `r`=5/20/50; differences are within about two Monte Carlo standard errors of 0.003–0.004).
3. **A coverage-safe `d` exists up to a point, then does not.** The smallest `d` with exact coverage ≥0.94 is (N=2000, φ=0.9) 8, 16, 24 at `r`=5, 10, 20 and *none* at `r=50` (n=40 draws per replication); at N=20 000, φ=0.99 it is 72, 159, 248 at `r`=5, 10, 20 and none at 50. The search assumes coverage is nondecreasing in `d` (bisection). The interval half-width is nearly flat from `r≈10` (0.218 at N=2000, φ=0.9, `d`=16) to `r=20` (0.216), and MSE at that `d` is 1.12× (r=10) and 1.25× (r=20) the single-run optimum.
4. **No advantage over batch means was found for this AR(1) model.** Single-run 30-batch means at N=2000, φ=0.9 (1500 runs) give coverage 0.945 at `d=0`, 0.929 at `d=10` and 0.925 at `d=30`, mean half-width 0.183–0.186, against a replication half-width of 0.22 at `r=10`. The batch interval is narrower and its coverage is within about 2.5 points of nominal (standard error about 0.6 points), so here replication buys independence of the pieces, not accuracy.
5. **M/M/1 from an empty queue, ρ=0.9, N=6000 jobs (true mean wait 9.0; 500 macro-runs, preliminary).** Single run with 30 batch means: bias 0.007 at `d=0`, RMSE 2.26, coverage 78.4% (low because of the heavy autocorrelation and skew of the wait process, not warm-up bias). Ten replications: bias −1.59, RMSE 2.05, coverage 64.6% at `d=0`; 77.4% at `d=100`; 83.6% at `d=300` with half-width 4.12. Thirty replications of 200 jobs: bias −3.13, coverage 5.8% at `d=0`, 33.2% at `d=50`, 55.6% at `d=100`. No setting reaches 95%.

## Limitations
One start state per model and one `δ`; a single geometric transient, so the AR(1) results do not carry over to an M/M/1 transient, which is why `E4` is simulation only with 500 macro-runs (coverage standard error about 2 points). `N` counts draws and ignores the cost of restarting a replication (which favours `r=1`). Coverage-safe `d` uses a 0.94 floor and a monotonicity assumption. No lab or robot data; the system the twin "represents" is another simulation. Neither Welch's graphical method nor MSER is tried here (see `warmup-twin`).

## Next steps
Start every replication from an estimated steady-state sample instead of deleting; non-geometric transients; allocation with a per-replication restart cost; sequential choice of `r` from a pilot.

## References
- Law, A. M. & Kelton, W. D. (2000). *Simulation Modeling and Analysis*, 3rd ed. McGraw-Hill.
- Schmeiser, B. (1982). Batch size effects in the analysis of simulation output. *Operations Research* 30(3), 556–568.
- White, K. P. Jr. (1997). An effective truncation heuristic for bias reduction in simulation output. *Simulation* 69(6), 323–334.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
