# selfrep-reconcile: why do two exact extinction chains of the same printer shop disagree by 1.5 to 7 times? (stylised)

Follow-up in the self-replicating manufacturing track (`PROJECTS.md`, track 1). Two sibling projects, written in parallel, compute the mean time to extinction of a lone replicating printer shop with different Markov chains and did not reconcile their numbers (`selfrep-extinction-kits` says so). This project does that, using their code by relative path. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-reconcile/

**Builds on.** `research/selfrep-extinction` (fleet-size chain, birth rate min(n/W, a)), `research/selfrep-extinction-kits` (chain on building machines, idle machines and kit stock), `research/selfrep-growth` and `research/selfrep-closure` (W = 50 h work per copy, V = 170.3 import units per copy, both assumed). Behind them: Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Hypothesis, fixed before running.** The fleet-size chain takes b(n) = min(n/W, a), a = B/V, the envelope of what machines and the kit stream could deliver if they never waited for each other. The kit-stock chain makes a machine wait for a Poisson kit. So the fleet chain should over-estimate births and extinction time. A one-line repair is b(n) = 1/(W/n + 1/a), which adds the two waits (exact for one machine alone, where a build takes W and the wait for a kit averages 1/a).
- **Comparison.** Exact mean extinction time of: the `min` chain from n = 1; the `serial` chain from n = 1; the kit-stock chain from one idle machine with empty stock (its own start state). Same W, V, mean life L and import stream B. Nothing is simulated; the kit-stock chain is truncated at 30 machines and 12 kits as in its own project.
- A test checks that this project's solver reproduces the `selfrep-extinction` numbers for the `min` law.

## Reproduce
```bash
cd research/selfrep-reconcile
python3 -m unittest discover -s tests -v   # 4 tests, standard library only (needs the sibling source trees)
python3 experiments/run.py                 # under 1 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; hours; all inputs assumed)
| L (h) | B | min | serial | kit-stock | min / kits | serial / kits |
|---|---|---|---|---|---|---|
| 75 | 4 | 186 | 121 | 117 | 1.59 | 1.04 |
| 100 | 4 | 358 | 198 | 201 | 1.78 | 0.98 |
| 200 | 4 | 3967 | 1110 | 1465 | 2.71 | 0.76 |
| 300 | 4 | 41602 | 6696 | 10996 | 3.78 | 0.61 |
| 200 | 8 | 92881 | 5323 | 13277 | 7.00 | 0.40 |
| 200 | 2 | 806 | 508 | 524 | 1.54 | 0.97 |
| 100 | 16 | 6566 | 544 | 1268 | 5.18 | 0.43 |

- **The disagreement is the birth law, as predicted.** The `min` chain is always longer than the kit-stock chain, by 1.5 to 7 times. The two projects' numbers are consistent: each solves its own chain correctly, and the chains differ.
- **The one-line repair works only where the fleet stays small.** It is within 5% of the kit-stock chain at L = 75 and 100 (B = 4) and L = 200 (B = 2), where the equilibrium fleet is 1 to 3 machines.
- **It over-corrects as the fleet grows.** It falls below the kit-stock chain by 24% (L = 200), 39% (L = 300) and 60% (B = 8 or 16). With several machines, kits that arrive while all machines are busy wait in stock and are used later, so waits do not simply add. The `serial` law ignores that pooling. I did not derive a law that is right for both regimes.
- So neither fleet-size law is a substitute for the kit-stock chain when the fleet exceeds a few machines; the `min` law is an upper bound on extinction time here, `serial` is a lower bound in those cases (observed, not proved).

## Limitations
- The kit-stock chain is itself an abstraction (exponential builds and lives, no failures, no recycling). Its agreement with a simulation is shown in `selfrep-extinction-kits`; I did not re-run any simulation here.
- Only seven parameter settings; the bound statements are observations on them.
- Every input is assumed; nothing measures a real printer.

## Next steps
Derive the stationary kit-stock occupancy to get an effective b(n) between the two laws; test it against the exact chain; carry the repaired law into the Weibull wear-out and recycling cases.

## Owner steps
- Measure real time to failure and real print times and replace the assumed L and W (see `selfrep-wearout`, `selfrep-growth`).
- Replace assumed vitamin costs with dated quotes (source and date for every price), as for `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-extinction`, `selfrep-extinction-kits`, `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
