# selfrep-extinction: does a birth-death chain with an exact extinction time explain why short-lived printer fleets die out? (stylised)

Follow-up to `selfrep-wearout` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking the last item of that project's next steps ("test the extinction explanation with a birth-death model that has a known extinction time"). Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-extinction/

**Builds on.** `research/selfrep-wearout` (simulator, imported by relative path), `research/selfrep-growth` and `research/selfrep-closure` (work per copy W = 50.0 h, imported vitamins per copy V = 170.3, both assumed units). Behind them: the RepRap project (Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>) and the question of von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. The mean time to absorption of a birth-death chain is a standard result for Markov chains; I give no reference for it. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Chain.** State n = machines. Death rate n/L (exponential life, mean L). Birth rate b(n) = min(n/W, B/V) for n >= 1: each machine makes one copy per W hours at most, and the import stream B limits the shop to B/V copies per hour. State 0 is absorbing. It ignores the wait for stock, build-time spread, builds cut short by retirement, failures and recycling.
- **Exact answer.** The mean time to reach 0 from n solves a tridiagonal linear system (Thomas algorithm, states capped at 400). Tests check it against the closed form L x H<sub>n</sub> for a chain with no births, and against Gillespie sample paths of the same chain.
- **Comparison.** Mean extinction time of `selfrep-wearout.simulate` (exponential life, no failures, no recycling, B = 4 units/h), from 1 and from 4 seed machines, for lognormal build-time CV 0.2 and 1.0. The DES samples the fleet every 10 h, so each extinction time is resolved to 10 h. Means are exponential maximum-likelihood estimates (total observed time / extinctions) over 150 runs with a 40000 h horizon, so runs that survived are censored, not dropped.
- **Post-hoc adjustment.** Column `exact+int` scales the birth rates by exp(-W/L), the chance a build outlives its machine. **I added it after seeing the DES die out faster than the plain chain, so it is a fit checked on the same runs, not an independent prediction.**

## Reproduce
```bash
cd research/selfrep-extinction
python3 -m unittest discover -s tests -v     # 6 tests, standard library only (needs ../selfrep-wearout, ../selfrep-growth for the experiment)
python3 experiments/run.py                   # about 5 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; hours; all inputs assumed)
- **The solver is right.** For L = 100 to 300 h the plain chain's exact mean extinction time agrees with its own Monte Carlo (e.g. L = 200, n0 = 1: 3967 against 4520 from 150 paths; L = 300, n0 = 4: 51169 against 56111 from 77 extinctions). Extinction time grows steeply with L: from 1 machine, 358 h at L = 100, 3967 h at 200, 41602 h at 300 and 4.6 million h at 500.
- **The plain chain over-estimates survival in the simulation.** DES extinction times are 1.8 to 2.5 times shorter for n0 = 1: 151 h against 358 (L = 100), 2177 / 1577 h (CV 0.2 / 1.0) against 3967 (L = 200), 19848 / 18240 h against 41602 (L = 300). So the die-out seen in `selfrep-wearout` is the right kind of event (a small birth-death population with an equilibrium of 2 to 7 machines), but the plain chain is not accurate enough to predict its time.
- **The interruption-adjusted chain is closer.** For n0 = 1: 203 against 151 / 154 (L = 100), 1789 against 2177 / 1577 (L = 200), 16664 against 19848 / 18240 (L = 300). For n0 = 4 it is within about 15% at L = 100 and 200 (373 against 383 / 359; 2652 against 2905 / 3085) but 1.7 to 1.9 times too short at L = 300 (21384 against 40117 / 35539). I did not look for the cause of the L = 300, n0 = 4 gap.
- **Build-time spread has little effect** here: CV 0.2 and 1.0 agree within the sampling noise of 150 runs, apart from L = 200 where they differ by 38% (2177 against 1577, n0 = 1), which I did not resolve.
- **L = 500 rows are not usable.** Only 17 to 33 extinctions were seen from 1 seed machine, one or none from 4, and a single exponential fits badly there (early die-out mixes with rare late extinction). The Monte Carlo (314224 h) and exact (4.6 million h) values for n0 = 1 differ by 14 times for that reason, not because the solver is wrong.

## Limitations
- Every input is assumed (see `selfrep-wearout`); nothing here measures a real printer or its lifetime.
- The chain has no stock, no queueing, one machine type and exponential life only. The Weibull shapes and recycling in `selfrep-wearout` are not covered.
- The single-exponential estimate of the DES mean is crude; I did not test the exponential assumption, and no confidence intervals are given. With 150 runs, differences below about 20% should not be read.
- The `exact+int` adjustment is fitted after the fact. Its agreement is suggestive, not evidence of the mechanism.

## Next steps
Model the stock explicitly (a two-dimensional chain on machines and stock) instead of the post-hoc factor; report the extinction probability by a fixed time from the transient chain, which avoids the exponential assumption; add recycling and Weibull wear-out.

## Owner steps
- Measure real time to failure of a printer's wear parts and replace the assumed lifetimes (as in `selfrep-wearout`).

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-wearout`, `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
