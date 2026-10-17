# selfrep-extinction-kits: is the lone-printer die-out an early accident of the first copies? A Markov chain with vitamin kits (stylised)

Follow-up to `selfrep-wearout` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking the last item of that project's next steps: test its extinction explanation with a birth-death model whose extinction probability and time can be computed exactly. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-extinction-kits/

**Companion to `research/selfrep-extinction`**, written in parallel by another run: that project solves a chain on fleet size alone (births min(n/W, B/V)) and compares mean extinction times with the `selfrep-wearout` simulator. This one tracks the kit stock and idle/building machines, so it can also give the probability of early extinction and the first-generation bound; the two use different chains and I did not reconcile their numbers.

**Builds on.** `research/selfrep-wearout` (the observation: a lone seed printer often dies out although the fluid model predicts a stable fleet) and, through `research/selfrep-growth` and `research/selfrep-closure`, the work per copy W = 50.0 h and vitamins per copy V = 170.3 (assumed currency units; imported by relative path). Behind them: the RepRap project (Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>) and the question of von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. Absorption probabilities and expected absorption times of a continuous-time Markov chain are textbook material (any text on Markov chains); no paper's result is reproduced and I cite none for the method. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Chain** (`src/selfrep_extinction_kits/chain.py`, standard library). Vitamin kits (one kit = V units, enough for one copy) arrive as a Poisson process of rate a = B/V; a build takes an exponential time of mean W; a machine's life is exponential with mean L; no failed builds and no recycling. State = (machines building, machines idle, kits in stock). A retiring builder loses its kit. This is the `selfrep-wearout` shop with every random time made memoryless.
- **Exact solutions.** Gauss-Seidel on the embedded jump chain gives (i) the probability that the fleet hits zero before it first reaches 6 machines ("early extinction"), and (ii) the expected time to extinction. State space truncated at a maximum fleet and kit stock; every row is also solved on a larger truncation to show the answer does not move.
- **First-generation bound** (closed form): the seed retires before delivering one copy, i.e. before a kit arrives and the build ends. It is a lower bound on early extinction.
- **Simulation** (`src/selfrep_extinction_kits/des.py`) of the same shop with switches that relax one Markov assumption at a time: kits regular instead of Poisson, build time lognormal (CV 0.2, as in `selfrep-wearout`) or fixed, and Weibull life. 4000 runs per early-extinction row, 2000 per extinction-time row, seeds 0 upward.
- Every input (W, V, B, L) is an assumption carried over from `selfrep-growth`; nothing here is a measurement.

## Reproduce
```bash
cd research/selfrep-extinction-kits
python3 -m unittest discover -s tests -v     # 7 tests, standard library only
python3 experiments/run.py                   # about 1 minute; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- **The exact chain reproduces the simulation.** Early-extinction probability at L = 500 h, B = 4 units/h: chain 0.194; simulation of the same Markov shop 0.198 ± 0.006. Across seven (L, B) cases the chain and the Poisson/exponential simulation agree within about two standard errors; raising the truncation changes nothing at three decimals.
- **The die-out at 500 h is mostly a first-generation accident.** The seed machine alone fails to deliver a copy with probability 0.162 (closed form); the chain adds the later chances of losing the first few machines for 0.194. That matches the 20% of runs that died out in `selfrep-wearout` at L = 500 h (a figure that also did not change with recycling there, as early extinction predicts, since little has been recycled yet). It falls to 0.047 at L = 2000 h (`selfrep-wearout` saw 3%).
- **Relaxing the Markov assumptions barely matters for early extinction.** Regular kits, lognormal or fixed builds shift the probability by at most about 0.04 (largest at L = 200 h, B = 16: chain 0.297, fixed builds 0.335 ± 0.007), so the chain is a usable predictor of the `selfrep-wearout` simulation.
- **Wear-out lives remove it.** At the same mean life (L = 500 h) Weibull shape 1 / 2 / 3 / 5 gave early extinction 0.194 / 0.028 / 0.004 / 0.000, because a machine with wear-out life almost never dies before its first copy. This is the mechanism behind the shape result in `selfrep-wearout`.
- **Small equilibrium fleets die out in finite, computable time.** Exact mean time to extinction (hours) for L = 75 / 100 / 200 / 300 h at B = 4: 117 / 201 / 1464 / 10994, against Poisson-exponential simulation 112 ± 3 / 196 ± 6 / 1511 ± 50 / 10625 ± 325. With fluid equilibria of 1.8 to 7 machines, the mean times for L ≤ 200 h are far below the 20000 h horizon of `selfrep-wearout`, consistent with every run there dying out. At L = 300 h the mean (about 11000 h) is over half the horizon, so some runs would still be alive at 20000 h; I did not check that.
- **Variance matters for the long times.** With regular kits and lognormal builds the mean extinction time at L = 300 h was 23460 h against 10995 h exact for the Markov shop, and 26173 h against 13257 h at L = 200 h, B = 8 (these two are about double). Less random timing makes a small fleet last longer, so the Markov chain is a lower guide for the `selfrep-wearout` shop at larger equilibria. I did not isolate which of the three assumptions (kits, builds, both) causes this.
- **Seed fleets.** `selfrep-wearout` reported that larger seed fleets did not help at L = 200 h. That is consistent with extinction in finite time at an equilibrium of 4.7 machines, but I did not run seed fleets here.

## Limitations
- The Markov shop is an idealisation of `selfrep-wearout`, not the same system: kits arrive in whole units, there is no recycling, failure or machine-specific wear, and builds never queue for stock. The comparison to `selfrep-wearout` numbers is by reading its published results, not by re-running them.
- "Early extinction" is defined as reaching 0 before 6 machines. The threshold of 6 is a choice; the probability would change with it, though the first-generation part does not.
- Chain truncation (maximum fleet 30, 12 kits) is checked against larger truncations only in the cases shown.
- All inputs are assumed (see `selfrep-growth`); nothing says anything about a real printer. Simulated only.

## Next steps
Add recycling and build failure to the chain (a larger state, same method); give the seed fleet n0 > 1 and check it against the chain; find which Markov assumption drives the longer extinction times of the regular/lognormal shop; derive a quasi-stationary approximation and compare it with the exact mean times.

## Owner steps
- Measure real time to failure for a printer's wear parts and real print and assembly times, and replace the assumed L and W (see `selfrep-wearout`, `selfrep-growth`).
- Replace assumed vitamin costs with dated quotes (source and date for every price), as for `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
