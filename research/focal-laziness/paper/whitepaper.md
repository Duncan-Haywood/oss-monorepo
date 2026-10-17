# Focal laziness: when peers share a default, agreement pay rewards coordinated shirking

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Multi-task peer prediction (Dasgupta–Ghosh) pays a verifier for agreeing with a peer on the same task minus agreeing on unrelated tasks, and needs no ground truth. Its guarantee that laziness pays nothing assumes lazy answers are independent across verifiers. If lazy verifiers instead copy a shared per-task default (the same public model's guess), that assumption fails. We give an exact model. (i) Pay is `2G·Cov(X_i,X_j) = 2G[a_i a_j pq + (1−a_i)(1−a_j)s]` with `s=d(1−d)`. (ii) Effort with linear cost `k` is a coordination game with interior threshold `a* = (k/2G + s)/(pq + s)`; (iii) the all-lazy profile is *always* an equilibrium and pays `2Gs`, equal to honest pay `2Gpq` when the default matches the prior (`d=p`) and 1.19× it at `p=0.3, d=0.5`; (iv) closing the lazy equilibrium with gold checks needs payment mass `gR ≥ (2Gs+k)/(1−acc_D)`, which exceeds the whole honest payment in our examples. A deterministic default (`s=0`) is harmless, so the problem is specifically shared *randomness*.

## 1. Model
Task truth `Y~Bern(p)`, `q=1−p`. Verifier `i` works w.p. `a_i` and reports `Y`; otherwise reports a default `D~Bern(d)` independent of `Y` and common to all lazy verifiers on that task. Working costs `k` per unit `a_i` (linear, so `a_i` is the fraction of tasks worked). Payment on a task: `G(1{X_i=X_j} − 1{X_i'=X_j''})` with the subtracted term on two independent other tasks. Since `P(agree)=1−E X_i−E X_j+2E[X_iX_j]`, the expected payment is `2G·Cov(X_i,X_j)`. Cross terms `Y`–`D` vanish by independence, giving `Cov = a_i a_j pq + (1−a_i)(1−a_j) s`. Monte Carlo over 4·10^5 tasks agrees to ≤0.003 (E2).

## 2. Coordination game
Utility of `i` is linear in `a_i`, with slope `2G[a_j pq − (1−a_j)s] − k`. So work iff the partner's effort exceeds `a* = (k/2G + s)/(pq + s)`. `a*>1` iff `k>2Gpq` (effort never pays at any partner level), and `a*` rises with the default's entropy `s`. E3 (`p=0.3, d=0.5, k=0.1`): `a*=0.652`; best-response dynamics started at 0.632 collapse to 0, at 0.672 converge to 1. With `n` verifiers each paid against one uniformly random peer, the slope depends on the others' mean effort, so the same `a*` governs the mean field.

## 3. The lazy equilibrium is always there and pays
At `a_j=0` the slope is `−2Gs−k<0`, so all-lazy is an equilibrium for every parameter, and it pays `2Gs` for doing nothing. E1 (`p=0.3`): honest pay 0.42; lazy pay 0.50 (`d=0.5`), 0.42 (`d=0.3=p`, exactly equal), 0.18 (`d=0.1`), 0 (`d=0`). Honest verifiers are paid *less than shirkers* when the default is closer to a fair coin than the truth is. The lazy default need not be sophisticated; a public model's guess that is uninformative about `Y` suffices.

## 4. Gold checks
Check a fraction `g` of tasks against ground truth paying `R` for a matching report; the default matches truth w.p. `acc_D = pd+q(1−d)`. Effort is dominant even against a fully lazy partner iff `gR(1−acc_D) ≥ 2Gs+k`. E4: `gR` between 0.68 and 1.24, versus honest pay 0.42, so the audit budget is *larger than the peer-prediction pay itself*; the trade is only worthwhile if truth is scarce but nonzero. Cheaper repairs (not analysed): randomise or hide task order so no default is available, or subtract an estimate of `s` (needs a reference estimate of the shared default's marginal).

## 5. Limits and implications
Binary tasks, one shared default, linear effort cost, two-player pay. Real lazy behaviour is heterogeneous (some copy, some randomise), which lowers `s`-effective. The design rule: peer-prediction-only verification is safe only if the ecosystem has no cheap shared oracle for the task; otherwise treat agreement pay as a *complement* to audits (see `peer-prediction-effort` for the gold-check rate trade-off) and monitor the report marginal against the public model's marginal.
