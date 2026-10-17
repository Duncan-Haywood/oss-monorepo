# simdesign-llm: how do design proposals written by a language-model agent compare with CMA-ES, Bayesian optimisation and random search at an equal simulation budget?

Fourth milestone of the simulation-first design track (`PROJECTS.md`, track 5). A bracket sizing problem is scored by a finite-element simulator; four ways of choosing designs get the same 40 simulator calls. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-llm/

**What "LLM" means here.** The run environment has no model API key. The proposer is the **session agent itself** (the Claude session that wrote this project), writing 4 rounds of 10 proposals by hand as committed files (`proposals/round1.json` to `round4.json`), reading the simulator's scores between rounds. This is one trajectory by one agent (n = 1), **not a reproducible LLM benchmark**, and the agent had advantages the baselines lack (below). Scoring is fully scripted.

**Builds on.** The finite-element bracket model of `../simdesign-bracket` (scikit-fem: Gustafsson and McBain, *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). CMA-ES: Hansen and Ostermeier, "Completely derandomized self-adaptation in evolution strategies", *Evolutionary Computation* 9(2):159–195, 2001, <https://doi.org/10.1162/106365601750190398>, via the `cma` Python package (Hansen et al.). Bayesian optimisation with expected improvement: Jones, Schonlau and Welch, "Efficient global optimization of expensive black-box functions", *Journal of Global Optimization* 13:455–492, 1998, <https://doi.org/10.1023/A:1008306431147> (own small NumPy GP, Matern-5/2). The Crossref records of the two optimisation papers were checked in this run; the scikit-fem citation is carried over from sibling projects. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Problem (`src/simdesign_llm/problem.py`): minimise the mass of the L-bracket over arm width `w` in [3, 25], inner fillet `r` in [0, 15] and depth `b` in [4, 30] mm, with a 100 N tip load, peak von Mises stress at most **15 MPa** and tip deflection at most **2.5 mm** (tighter than `simdesign-bracket`'s 20 MPa and 4 mm, so that its published optimum is infeasible here; a test checks this). Assumed material, mesh h = 1.5 mm. Every call to the simulator counts.
- Baselines (`optimisers.py`), none using an LLM, each given 40 evaluations and 20 seeds: random search; CMA-ES (population 6, penalised mass); GP-EI Bayesian optimisation (8 Sobol points, then 32 EI steps, penalised log mass).
- Session agent: round 1 written with no scores; rounds 2 to 4 each written after seeing all earlier scores (mass, stress, tip, feasibility). The reasoning is in each file's `notes`.
- Reference: differential evolution with 1,845 evaluations gives a best-known design (not proven optimal).

## Reproduce
```bash
pip install numpy scipy scikit-fem cma matplotlib pytest
cd research/simdesign-llm
python -m pytest -q tests          # 6 tests
python experiments/run.py          # writes experiments/results.txt and curves.png (about 15 minutes)
```

## Results (from `experiments/results.txt`)
Best feasible mass (g) after n evaluations; baselines are the median over 20 seeds.

| method | n=10 | n=20 | n=30 | n=40 |
|---|---|---|---|---|
| random search | 50.04 | 44.68 | 42.27 | 38.96 |
| CMA-ES | 54.13 | 42.37 | 35.75 | 33.28 |
| Bayesian opt (GP-EI) | 52.00 | 37.93 | 34.41 | 32.19 |
| session agent (n = 1) | 29.71 | 23.73 | 23.25 | **22.99** |

- Best-known reference (DE, 1,845 evaluations): 22.39 g at (w, r, b) = (24.95, 14.61, 5.29). The agent's best, (25, 14.5, 5.42), is 2.7% heavier; the median baseline at n = 40 is 44% to 74% heavier. No baseline seed out of 20, for any of the three methods, beat the agent at n = 40. The best seeds reached +10.5% (CMA-ES), +14.8% (BO) and +26.8% (random) above the reference.
- Only 20 of the agent's 40 proposals were feasible (8, 6, 3, 3 per round): the late rounds probed the stress boundary on purpose.
- The stress limit is the active constraint (deflection stays at 1.5–1.6 mm). The optimum sits at the upper bound of `w`.

## Why the agent won, and why that is weak evidence about LLMs
- The agent knew the physics (stress falls roughly as 1/b, deflection is slack) and had read `simdesign-bracket`'s README (optimum at w near the upper bound, a large fillet, a thin depth). The baselines receive no such prior and spend several of their 40 evaluations finding the bounds. A fair test of an LLM's design skill would hide the sibling results and the problem's history; this run did not.
- Round 1 alone (10 evaluations) gave 29.71 g, better than the median of every baseline at n = 40. That is prior knowledge, not search.
- The agent adapted by hand to feedback, including a non-smooth stress-versus-fillet response caused by meshing. One agent, one trajectory, one problem of three variables: no statistical statement about LLMs follows.
- Baselines were not tuned (CMA-ES step size, BO lengthscale grid and initial design are single defaults). A tuned baseline, or one warm-started at the bound, would narrow the gap.

## Limitations
- Stylised: the material and limits are assumed (see `simdesign-bracket`); a 2D plane-stress model; mesh h = 1.5 mm, at which the peak stress is itself mesh-sensitive (about 7% in the sibling project), so the 15 MPa constraint, and with it the ranking of designs within about 2%, is not converged. The "best known" is best on this mesh.
- Mass differences among the agent's last rounds (22.99 vs 23.25 g) are within that mesh uncertainty.
- Nothing has been built or tested.

## Next steps
Hide prior results from the proposer, or use an API-key proposer behind an environment variable with a deterministic stub, for a reproducible comparison; add problems where the prior does not point at the bound (e.g. topology-optimised designs from `simdesign-topopt`); warm-started and tuned baselines; manufacturability constraints (`simdesign-dfm`).

## Owner steps
None needed for this project (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, cma, matplotlib). The proposer is the Claude session that ran this project; no model API is called by the code.
