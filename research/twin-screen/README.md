# Twin screening: how many designs should a digital twin shortlist for real-plant verification?

Pure Python, no dependencies. A digital twin scores `K = 50` candidate designs; only the top `m` are tested on the real plant, which has a fixed budget of `B = 20` noisy trials split evenly. A twin that correlates `ρ` with the truth has an exact value on its own, `ρ·c_K` (`c_K` = expected maximum of `K` standard normals, 2.249 at `K=50`), and the best shortlist shrinks as the twin improves: from `m = 8` at `ρ = 0.6` to `m = 2` at `ρ = 0.95` (grid search, Monte Carlo). Real-only testing of all 50 reaches 1.20 sd; the best twin-screened pipelines reach 1.87 (`ρ=0.6`) and 2.17 (`ρ=0.95`) against an oracle 2.25.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/twin-screen/

```bash
cd research/twin-screen
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, ~5 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # ~1 min, seeded
python3 experiments/figure.py
```

**Why this seemed worth doing.** `selection-twin` and `twin-evaluation` study picking inside a noisy twin and using a twin as a control variate. Neither asks the practical allocation question: given a real-trial budget, how much of it should go to how many twin-ranked designs?

**Builds on.** The sim-to-real direction of the HIRO group (<https://hiro-group.ronc.one/>) and the digital-twin simulation direction of ARPG (<https://arpg.colorado.edu/>). Related ideas: screening/ranking-and-selection in simulation optimisation (Nelson, Swann, Goldsman and Song, 2001, *Operations Research* 49(6)) and the winner's-curse selection bias in this repository's `selection-twin`.

## Method
True values `v_i ~ N(0,1)`; twin scores `t_i = ρ v_i + √(1−ρ²) e_i`. Shortlist the `m` largest `t_i`, measure each on the real plant with noise sd `√(m/B)` (the budget `B` of unit-variance trials is split evenly), choose the best measurement. Exact: `m=1` gives `E[v] = ρ c_K` (jointly normal), and `m=K` is real-only. Everything else is seeded Monte Carlo (20,000 draws per cell in E1, 8,000 in E3).

## Results (`experiments/results.txt`)
- Value rises then falls in `m` for every `ρ` (figure `experiments/value_vs_shortlist.svg`). Best `m` on the grid {1,2,3,5,8,12,20,35,50}: 20, 12, 8, 3, 2 for `ρ` = 0, 0.3, 0.6, 0.8, 0.95.
- Gain over real-only (1.20): +0.42 (`ρ=0.3`), +0.68 (`ρ=0.6`), +0.83 (`ρ=0.8`), +0.96 (`ρ=0.95`).
- **Part of the gain is not the twin.** At `ρ = 0` (a useless twin) the best `m = 20` scores 1.325 vs 1.207 for real-only, a +0.12 gain from random subsetting: concentrating a fixed budget on fewer candidates beats spreading it thin. A twin should be credited only with the gain beyond that baseline (+0.30, +0.56, +0.71, +0.85 for the four useful `ρ`).
- More real budget favours longer shortlists at `ρ=0.6`: best `m` = 3, 5, 5, 12, 20, 20 for `B` = 5, 10, 20, 50, 200, 1000. The curves are flat near their optimum and the grid is coarse, so neighbouring `m` are not distinguishable (Monte-Carlo standard errors are about 0.01 to 0.02).

## Limitations
Stylised: Gaussian values, a single correlation `ρ` between twin and truth, an even budget split, no sequential allocation (successive elimination would do better), independent noise, no cost of a twin run. `ρ` must be known or estimated, which itself costs real trials. Simulated, not a claim about a physical device. No robot data. Preliminary.

## Next steps
Sequential halving instead of an even split; estimating `ρ` from the first real trials; heavy-tailed design values.

## Owner steps
None.

## Outside dependencies
None (Python standard library).

MIT.
