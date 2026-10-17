# Skill scores with an in-sample baseline are improper: what normalising by the realised base rate does to verifier incentives

## Question
Verifier pools are often ranked by a Brier *skill* score, 1 − Brier/(ȳ(1−ȳ)), so that scores are comparable across tasks with different base rates. The denominator is the Brier score of the climatological forecast **computed from the realised outcomes**. Does dividing a proper score by an outcome-dependent quantity preserve the incentive to report honestly?

## Model
A verifier believes tasks of type i (n_i independent binary tasks) resolve 1 with probability p_i and reports r_i on each. With n = Σn_i and pooled base rate ȳ = ΣK_i/n (K_i ~ Bin(n_i, p_i)) it is paid BSS = 1 − Brier/(ȳ(1−ȳ)), and 0 when ȳ ∈ {0,1}. Compare a leave-one-out baseline: task j is paid (ȳ₋ⱼ − y_j)² − (r_j − y_j)², where ȳ₋ⱼ is the mean of the other outcomes.

## Results
1. **Exact optimal report.** BSS = 1 − [ΣK_i(1−r_i)² + (n_i−K_i)r_i²]/(n ȳ(1−ȳ)) is quadratic in each r_i, so the maximiser is r_i* = a_i/(a_i+b_i) with a_i = E[K_i w], b_i = E[(n_i−K_i) w], w = 1/(nȳ(1−ȳ)) on the interior. For one task type, r* = A/(A+B), A = E[1/(1−ȳ)], B = E[1/ȳ] (interior). Reports are the hit rate reweighted by the inverse baseline variance, not p.
2. **Improper, with a distortion that shrinks like 1/n.** r* = ½ for every p at n = 2; at p = 0.1 it is 0.232 (n=5), 0.133 (n=10), 0.090 (n=20), 0.081 (n=50), 0.091 (n=100): above p for tiny n, then below p and converging from below: r* − p ≈ −(1−2p)/n (n(r*−p) = −0.80 at n = 6400 for p = 0.1, prediction −0.80). The rare side is under-reported and the common side over-reported, symmetrically (r*(p)+r*(1−p) = 1). Lying is worth having: at n = 5, p = 0.1 the misreport gains 0.042 BSS while costing 0.017 true Brier; at n = 10, 0.0063 vs 0.0011.
3. **Cross-task leakage.** Because ȳ pools all tasks, the optimal report on type 1 depends on type 2's beliefs: with p = (0.1, 0.5) and 10 tasks each, r* = (0.090, 0.467) against (0.133, 0.500) if each type were scored alone; the type-2 report drops by 0.033 although nothing about type 2's own tasks changed. Reports on a task type are tilted by the pooled base rate of the others.
4. **Fixes.** A baseline independent of the task's own outcome restores properness: the leave-one-out score above is a proper score up to a constant (payoff maximised at r = p on both types in the enumeration; BSS is not: its optimum there is r₁ ≈ 0.090, worth 0.0052 over honesty), as is any ex-ante fixed baseline. Skill *differences* are safe; skill *ratios* with in-sample denominators are not.

Exact enumeration in `model.py`, agreement with a 200,000-trial simulation to 0.001 (0.11905 vs 0.11816 at n_i = 8, see `experiments/results.txt`).

## Limitations
Constant reports per task type and independent tasks; the verifier knows p_i exactly and is risk-neutral; pooled ȳ over the verifier's own tasks (a cross-verifier baseline weakens leakage but is not analysed); BSS = 0 convention at ȳ ∈ {0,1} affects small-n numbers; only the Brier skill score is treated (log and spherical analogues not done); the leave-one-out score being proper is checked by enumeration and follows from independence of ȳ₋ⱼ and y_j rather than a full proof for dependent tasks. Related: `score-recalibration`, `noisy-referee`, `categorical-scores`.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v`; `PYTHONPATH=src python3 experiments/run.py`.
