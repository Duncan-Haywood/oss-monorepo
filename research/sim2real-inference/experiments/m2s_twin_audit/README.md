# Milestone 2s: what evidence do the 138 `*-twin` projects carry?

`python3 audit.py` (under a second, stdlib only) reads each twin project's `README.md` and `project.json` and writes `results/audit.csv` (one row per project) and `results/summary.txt`. The rules are keyword matches, so they are a screen, not a judgement; a spot check of 12 random projects found the "no real source" flag correct on all 12.

Result (138 projects): 137 (99%) call themselves "stylised"; 3 (2%) name a real data source (a datasheet, a published value or a public dataset: `gate-twin`, `particle-twin`, `thermal-twin`); 11 (8%) use a paired or control-variate estimator; 20 (14%) state an explicit rho, from 0.03 to 1.0 (median of per-project maxima 0.845).

Reading: the earlier twin projects are analytic and simulated-versus-simulated. They show what a paired estimator would save at a given rho; none of them measures rho for a real policy and a real twin. That is the gap this programme's SIMPLER step (milestone 4) addresses, and why the paper does not cite those projects as evidence about real rho.

Limits: keyword rules miss sources named in other words (false "none") and match incidental words (false "real"); the rho regex reads only `rho = 0.x` forms; project.json for older projects is absent so the README is the only text.
