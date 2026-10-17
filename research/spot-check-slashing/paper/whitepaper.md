# Stake and audits are complements: sampled audits of committed training traces under capped slashing

*Working note, MIT licensed. Stylised model; exact computation (hypergeometric), no empirical claims about any deployed protocol.*

## Motivation
Refereed verification of decentralised training commits to a trace of T states (Merkle root) and lets verifiers audit
sampled steps; a caught deviation triggers slashing. The sibling notes (`verification-game`, `verifier-bribery`,
`reproducible-refereed-training`) price stake against a *single* deviation. A solver can instead corrupt any subset
of steps, and one may hope that stake and audit rate trade off smoothly ("more stake, fewer audits"). We ask when
that is true.

## Model
Solver corrupts j∈{0..T} steps, gaining g each; each corrupted step exceeds the tolerance, so it is caught iff
audited. The verifier audits k steps uniformly without replacement, so hits H ~ Hypergeometric(T, j, k). The
solver is slashed S(H)=min(F, f·H): F is the stake, f the per-hit slash. Flat slashing is f=∞, proportional F=∞.
Payoff φ(j)=jg − E[S(H_j)]. Cheating is *deterred* if max_j φ(j)=0. `src/spot_check/model.py` computes φ exactly.

## Results
**R1 (all-or-nothing).** The expected slash is concave-in-hits but φ is convex in j: for flat slashing P(miss)=C(T−j,k)/C(T,k)
is convex in j; for proportional slashing E[S]=f·jk/T is linear. On a grid (T∈{12,25}, F,f varied, all k) the
hybrid φ was also convex, so the best response is always j=0 or j=T (tested; a proof for the hybrid is not given
here). There is no profitable "cheat a little" regime, so partial-cheating analysis reduces to the full-trace
cheat.

**R2 (corner condition).** At j=T the hit count is exactly k, so deterrence ⇔ **min(F, f·k) ≥ T·g**. Necessity
is immediate; sufficiency uses R1 (checked exhaustively in the tests over a grid; exact for flat and proportional).
Hence: flat slashing needs F ≥ Tg and a single audit (k=1); proportional slashing needs k ≥ Tg/f; the hybrid needs
*both* F ≥ Tg and k ≥ Tg/f. Experiments E1–E3 (T=100, g=1): F=99 is infeasible for every k, F=100 needs k=1;
f=2,5,10,25,50 give k*=50,20,10,4,2 = ⌈Tg/f⌉; the hybrid with f=10 has k*=None for F≤80 and k*=10 at F=100.

**R3 (no capital/compute frontier).** Because the binding constraints separate, the cost-minimising deterrent
under cost r·F + c·k is the corner F=Tg, k=⌈Tg/f⌉ for every (r,c) tried (E4). Extra stake above Tg buys nothing
and stake below Tg cannot be compensated by any number of audits; likewise for audits. Under-deterred (E5,
F=40<Tg) the solver corrupts the whole trace at every k.

## Implications
1. **Stake must scale with the job**, F ≥ T·g, not with the per-step gain. A protocol with fixed stake is safe
   only for bounded T·g; long training runs need per-job or per-checkpoint stake (re-committing stake per
   window of W steps gives F ≥ W·g).
2. **Audit effort scales with 1/f**: raising the per-hit slash (e.g. slashing proportional to divergence found) is
   the lever that cuts audits, while stake is the lever that caps exposure — they are not interchangeable.
3. Windowing is the cheap fix: T→W in both conditions, at the cost of W-fold more commitment/stake events.

## Limitations
Single solver, risk-neutral, known uniform sampling; corruptions are all-detectable-when-sampled (no tolerance blind
zone — see `reproducible-refereed-training` R4/R5 for that), constant per-step gain g (heterogeneous g would make
high-value steps the natural audit target; not modelled), no bribery or collusion (see `verifier-bribery`), no
false slashing of honest solvers. Convexity for the hybrid is empirical.

## Reproduce
```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py
```
