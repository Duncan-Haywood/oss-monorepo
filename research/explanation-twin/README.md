# Explanation twin: how optimistic is the cost a planner quotes from its own twin rollouts?

Pure Python, no dependencies. A planner scores `K` candidate plans by the sample mean of `n` digital-twin rollouts each, picks the cheapest, and explains the choice by quoting that simulated cost and its margin over the runner-up. With Gaussian sample means (sd `s=σ/√n`) everything is exact by quadrature. With equal true costs the quoted cost is low by exactly `e_K·s`, `e_K` the expected maximum of `K` standard normals (0.564 / 0.846 / 1.163 / 1.539 / 1.868 for `K`=2/3/5/10/20; Monte-Carlo agrees to 0.5%), so a 95% interval around the quote covers the true cost 88% / 78% / 60% of the time at `K`=5/10/20 (fresh rollouts: 95%). With two plans a true gap of zero is quoted as 1.13 `s`; the quoted cost bias has the closed form `−θφ(d/θ)`, `θ=s√2`, and vanishes once the gap exceeds ~5 `s`. Reporting from fresh rollouts removes the bias exactly (|bias| < 0.003) but the rollouts spent on reporting are taken from selection: at 20 rollouts per plan, selecting on 12 raises regret 0.069 → 0.104 and lowers the share picking the best plan 0.76 → 0.68. It does **not** remove the twin's own model error `b_k~N(0,τ²)`: the quoted-vs-real bias is `−e_K τ²/√(τ²+s²)` (formula −0.531, simulated −0.530 at `τ=0.5`, `K=5`) however many rollouts are run. See `paper/whitepaper.md`.

```bash
cd research/explanation-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~20 s; output in experiments/results.txt
```

**Builds on.** The explainable-planning and human-robot-collaboration direction of the CAIRO Lab (<https://cairo-lab.com/>), e.g. Hayes & Shah (2017) on robots explaining their policies, and the simulation-based validation practice of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no result from those groups is reproduced and nothing here is affiliated with or endorsed by them. The statistics are classical: the optimizer's curse (Smith & Winkler 2006), post-selection inference (Berk et al. 2013) and data splitting (Cox 1975); on explanation, Miller (2019) and Chakraborti et al. (2017), who treat explanation as reconciling the robot's model with the human's, which is the twin-versus-real gap studied here. Companion to `twin-audit`, `twin-transfer` and `handover-twin` in this repository.

Stylised: independent Gaussian sample means (one non-Gaussian check), chosen parameters, a simulated planner, no human study and no robot. MIT.
