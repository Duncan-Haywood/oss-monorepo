# selfrep-singulararc: what is the closed form of the replicating shop's smooth switch, and does it match dynamic programming?

Follow-up to `selfrep-satmarket` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking its listed next step: derive the singular-arc condition and compare it with the DP ramp. Produced with AI assistance (Claude). Stylised; every input is assumed.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-singulararc/

**Builds on.** `research/selfrep-satmarket` (model, DP policy and Euler runner, imported not copied) and `research/selfrep-growth` (per-copy work `W` = 50.0 h, imported), which come from `research/selfrep-closure` (RepRap; Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). The method is Pontryagin's maximum principle (Pontryagin et al., 1962; Bryson and Ho, 1975). No paper's result is reproduced, and this project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Problem (as in `selfrep-satmarket`): `n' = k u n`, goods output `g = (1-u) n`, revenue `R(g) = a c (1 - exp(-g/c))`, maximise `int_0^T R dt`, final fleet worth nothing. With costate `lam`, `H = R(g) + lam k u n`, `dH/du = n (lam k - R'(g))` and `lam' = -R'(g)`, `lam(T) = 0`. Derived arcs (my derivation; the numerical check below is the evidence, not a proof of sufficiency):
1. `u = 1` until `t1`.
2. **Singular arc** (`lam k = R'(g)`): differentiating gives `g' = k c`, so goods output grows **linearly**, whatever `a` is. Then `n' = k (n - g)` is linear and `n(t) = k c (t - t1) + c + (n(t1) - c) e^{k (t - t1)}`.
3. `u = 0` for exactly the last `1/k` hours (`lam(t) = R'(n_e)(T - t)` there, and the switching function vanishes at `T - 1/k`). `1/k` is `W/(1 - fail)`, the fleet's e-folding time.
The entry time `t1` solves `n0 e^{k t1} = c (1 - exp(-k (t_e - t1)))`, `t_e = T - 1/k` (bisection in `src/selfrep_singulararc/model.py`). As `c` grows, `t1 -> t_e` and the policy is the bang-bang of `selfrep-reinvest`.

## Reproduce
```bash
cd research/selfrep-singulararc
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, about 1 s (needs ../selfrep-satmarket)
python3 experiments/run.py                                # about 20 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- **The closed form reproduces the DP policy.** Run through the same Euler model (step 1 h) at 7 market sizes and 4 failure shares, the closed-form open-loop policy earns 99.96% to 100.00% of the simulated DP policy's value (it is never above it by more than the printed precision). The best bang-bang earns 93.3% to 99.99% of it.
- **Switch times agree.** At `c` = 1000 and no failures the closed form leaves `u = 1` at t1 = 344.6 h and stops copying at 550.0 h; the DP policy leaves `u = 1` at step 348 and its copy share falls below 0.02 at step 542 (the last stretch of the ramp is tiny and sits inside the DP's `u` grid of 0.05). Across `c` from 100 to 10^6 the DP leaves `u = 1` 0 to 5 h after `t1`. Table 3 of the results lists `u(t)` (largest gap 0.06, at t = 350 h: 0.89 against 0.95): 0.46 / 0.29 / 0.17 against the DP's 0.46 / 0.30 / 0.15 at t = 400 / 450 / 500 h.
- **Failures shorten the interior arc.** With `k = (1 - fail)/W` the last phase is `W/(1 - fail)` long, so at `c` = 1000 the stop time moves from 550 h (no failures) to 537.5, 516.7 and 475.0 h at 20%, 40%, 60% failed builds, matching the DP (533, 516, 475 for u below 0.02).
- **Continuous-time values are not comparable with Euler values.** `Jc/Jdp` in the table is 1.01 to 1.11 because the exact exponential growth beats the Euler step's `(1 + k dt)` compounding; compare the `Je` column, not `Jc`, with the DP.

## Limitations
- Stylised; all parameters assumed, and the concave revenue form is a convenient choice. The singular-arc result depends on the exponential form (`R''/R'` constant); other forms give a different arc.
- Pontryagin conditions are necessary. I did not prove optimality; the evidence is agreement with a DP of independent construction to within 0.04% and a test that no time shift of the policy or bang-bang beats it. The derivation is my own, with no comparison to the singular-control literature beyond the textbook citations; Lackner and Wendt (1995) has not been read for this project.
- Cash never binds, no terminal fleet value, homogeneous continuous fleet, open-loop policy (the DP policy is feedback).
- The DP has its own grid error (see `selfrep-satmarket`), so differences below about 0.1% should not be read as a ranking.

## Next steps
Add a terminal fleet value (the last phase length then changes from `1/k`); a falling-price market form; the two-state version with the cash constraint of `selfrep-reinvest`.

## Owner steps
- Estimate the real demand curve for printed goods the shop could sell and replace `c`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-satmarket` and `selfrep-growth` source trees (relative paths). The printer's own vitamins are those listed in `selfrep-closure`.
