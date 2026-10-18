# Does an arm-wait-aware printer demand fix mean value analysis of a robot-printer cell? No: a negative result

A stylised, simulation-only follow-up to `research/robofab-cell-held` (track `robofab`, milestone 4's next steps, "a blocking-aware approximation"). That project found that adding load and unload time to the printer's demand in mean value analysis (MVA) helps only when the cell is saturated. Here I add the missing piece the held-printer model ignores: a printer also sits finished while it waits for the arm to unload it. I estimate that wait from the arm's own queue (a fixed point) and add it to the printer's demand. All numbers are from `experiments/results.txt` (20 seeds, 24 h horizon after a 4 h warm-up, mean rates in good parts per hour; 32 settings; job types and times as in `robofab-cell-held`, illustrative and not measured).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-cell-stall/

- **The repair makes MVA worse, not better.** Mean absolute error against the simulation over all 32 rows: plain MVA 4.7%, held-demand MVA 6.2%, stall-aware MVA 7.9%. A sensitivity variant that adds all of the arm's waiting rather than half ("stall_full") reaches 10.6%.
- **It does not even keep the saturated-row gain.** On the 8 rows with work in process 2P, stall-aware MVA errs by 3.1% against 2.9% for held and 8.2% for plain. On the other 24 rows it is worse than held: 9.5% against 7.3% (plain: 3.6%). Its error is negative in all 32 rows: it systematically underpredicts.
- **Why, as far as these data show:** held-demand MVA already underestimates throughput at low and moderate work in process (errors of −3% to −12%), and the added wait only pushes it further down. The extra wait is real in the simulation but is paid when the printers are not the bottleneck, so charging it to the printer's demand counts it twice. I did not test that explanation directly (for example by simulating without the wait); treat it as a hypothesis.
- **So a demand-side patch to product-form MVA is the wrong tool for this cell.** The next thing to try is a model that represents the blocking explicitly (Next steps), not another demand adjustment.

```bash
pip install numpy
cd research/robofab-cell-stall
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, < 1 s
python3 experiments/run.py                                # about 6 s; writes experiments/results.{txt,json}
python3 experiments/figure.py                             # needs matplotlib; draws experiments/error.png
```
Produced with numpy and Python 3.11.

## Motivation

A cheap analytic model of a cell is only useful if one knows which version to trust. `robofab-cell-held` left open whether a model of the blocking could fix MVA across loads. This is the cheapest such model, so it is the right first check before building a heavier one. It is a fidelity question, like the twin projects.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), and `research/robofab-cell-held`, `research/robofab-cell-blocking` (which adds a *fitted* stall to held demand and reaches a similar conclusion at low load; here the stall is derived from the arm's own queue with no fitted parameter), `research/robofab-cell-cv` and `research/robofab-cell-mva` in this repository, whose model and code I reuse (copied so the project is self-contained). No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Methods: mean value analysis, Reiser and Lavenberg (1980); load-dependent recursion, Bolch et al. (2006). Entries in `paper/refs.bib`. This run had no web access, so I could not re-check them online: verify before citing.

## Method

`src/robofab_cell_stall/` is a copy of `robofab-cell-held`'s `mva.py` and `sim.py`, plus `stall_aware_rate` in `mva.py`. A printer is seized at the start of the load and released at the end of the unload, so its holding time is load + print + wait for the arm + unload. The function sets the printer demand to `D_held + s * (R_arm - D_arm)` and recomputes the arm's mean residence time `R_arm` per good part from MVA at that demand, iterating (damped) to a fixed point. `s = 0.5` because half of the arm's visits are unloads; loads wait for the arm before the printer is seized, so their wait is not held. The value 0.5 was fixed before the numbers were computed. `s = 1` ("stall_full") was added afterwards as a sensitivity check, not as a competing hypothesis. The simulation uses the real-cell semantics with lognormal times, cv 0.3 and 1.0, 4 to 16 printers, one inspector, work in process P/2, P, P+2 and 2P. Error is (prediction − simulation)/simulation.

## Results

See the bullets above and `experiments/results.txt`; `experiments/error.png` plots the mean errors.

## Limitations

Stylised and simulation-only. One arm, no travel, no breakdowns, independent failures, closed loop, one job class in the analytic models, two cv values and one job mix. Twenty seeds give standard errors of 1% to 2% of the rate (the table lists them), so differences of that size are not resolved. The average errors mix settings, and I changed nothing after seeing results except adding the `stall_full` check. The fixed-point stall estimate is one heuristic; a different one could behave differently. No claim concerns a physical cell.

## Next steps

Model the blocking explicitly (a two-stage approximation with a blocked-after-service printer, or a small continuous-time Markov chain on the arm-and-printers subsystem, as `robofab-cell-ctmc` does for its case); a predictor that switches on load; more job mixes; measured step times from a MuJoCo arm.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

`numpy` only (`matplotlib` for the figure). No language model or hardware was used. Produced with AI assistance (Claude).

MIT.
