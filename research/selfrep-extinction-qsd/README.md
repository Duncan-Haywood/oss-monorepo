# selfrep-extinction-qsd: can a quasi-stationary approximation predict how long a small printer fleet lasts? (stylised)

Follow-up to `selfrep-extinction-kits` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking two items of that project's next steps: a quasi-stationary approximation of the exact mean extinction time, and a seed fleet of more than one machine. Produced with AI assistance (Claude).

**Builds on.** `research/selfrep-extinction-kits` (the Markov chain of machines, idle/building state and vitamin kits, imported by relative path, not copied) and, through it, `selfrep-wearout`, `selfrep-growth` and `selfrep-closure`: work per copy W = 50.0 h and vitamins per copy V = 170.3 (assumed units). Quasi-stationary distributions of absorbing Markov chains are standard material (the decay rate of the sub-generator, and mean time to absorption ~ 1/rate); I cite no specific paper for the method. The project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Chain.** Exactly the `selfrep-extinction-kits` chain: Poisson kits at rate a = B/V, exponential builds (mean W) and lives (mean L), no failure, no recycling. Extinction (fleet 0) is absorbing; truncation 30 machines, 12 kits.
- **Quasi-stationary rate.** lambda0 is the slowest decay rate of the sub-generator on the non-extinct states, found by power iteration on the uniformised matrix I + Q/Lambda (stopped when the state vector itself stops moving). 1/lambda0 is the approximation of the mean time to extinction; the left eigenvector is the quasi-stationary distribution (QSD).
- **Exact times.** Gauss-Seidel on the jump chain gives the mean extinction time T from every state, including a seed of n0 idle machines with empty stock.
- **Correction.** A lone machine often dies before the fleet ever reaches the QSD. I tested T ~ (1 - p6)/lambda0, where p6 is the exact chance (from `selfrep-extinction-kits`) of hitting 0 before 6 machines. **This correction was chosen after I saw the uncorrected estimate overshoot, so it is a post-hoc fit checked on the same cases, not an independent prediction.**
- A bug was caught by the tests while writing this: I first estimated lambda0 as -log(survival) x Lambda instead of (1 - survival) x Lambda, which is off by 20% for slow uniformisation.

## Reproduce
```bash
cd research/selfrep-extinction-qsd
python3 -m unittest discover -s tests -v     # 4 tests, standard library only
python3 experiments/run.py                   # about 10 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; B = 4 units/h unless stated)
- **The uncorrected QSD estimate overshoots a lone machine.** 1/lambda0 is 1.2 to 1.9 times the exact mean time T1 from one new machine in every case (T1 x lambda0 between 0.61 and 0.81), e.g. L = 200 h: 2388 h against 1465 h exact; L = 300 h: 16103 against 10996.
- **With the early-extinction correction it is close when the fleet usually survives its start.** (1 - p6)/lambda0 matches T1 within 5% for L = 300 h (ratio 1.044), L = 500 h (0.999), and B = 8 at L = 200 h (1.018) and 300 h (0.989). It is poor where p6 is high: 1.40 at L = 200 h, 10 at L = 100 h and 42 at L = 75 h, where the fleet rarely reaches the QSD and the estimate is not meaningful.
- **Seed fleets.** At L = 200 h, B = 4, mean extinction time from 1 / 2 / 4 / 8 seed machines is 1465 / 1983 / 2388 / 2666 h; four seeds already reach the QSD value (2388 h). At L = 500 h the gain from 1 to 8 seeds is 751712 to 933446 h (QSD 934066). Extra seeds help a short-lived small fleet only up to 1/lambda0, consistent with `selfrep-wearout` where larger seeds did not stop die-out at L = 200 h within a 20000 h horizon (the exact time there is about 1500 to 2700 h, far below the horizon).
- **Equilibrium fleet.** The QSD mean fleet is 2.0 / 2.4 / 4.1 / 6.2 / 10.7 machines at L = 75 / 100 / 200 / 300 / 500 h.
- **Truncation.** Raising the truncation to 40 machines and 20 kits changed 1/lambda0 and T1 by under 0.01% in the three cases checked.

## Limitations
- Same idealisation as `selfrep-extinction-kits`: Markov times, no failures or recycling, whole kits. Simulated only; every input is assumed. That project found regular kits and lognormal builds roughly double the long extinction times, so these numbers are lower guides for the `selfrep-wearout` simulator, which I did not re-run.
- The correction factor is post hoc and tested on seven cases; the threshold 6 in p6 is a choice.
- The multi-hour runs at L = 500 h are far beyond any plausible machine lifetime of interest; they are checks of the approximation, not predictions about a printer.

## Next steps
Derive why (1 - p6)/lambda0 works (an absorbing-then-QSD decomposition) and test other thresholds; add recycling and build failure to the chain; compare the QSD fleet with the fluid equilibrium of `selfrep-wearout`.

## Owner steps
- Measure real time to failure for a printer's wear parts and replace the assumed lives; get dated quotes for vitamin costs as in `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-extinction-kits`, `selfrep-growth` and `selfrep-closure` source trees (relative paths). The printers' vitamins are those of `selfrep-closure`.
