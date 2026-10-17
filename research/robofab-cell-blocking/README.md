# robofab-cell-blocking: can a blocking-aware correction to queueing analysis predict a robot-printer cell across loads?

A stylised, simulation-only follow-up to `research/robofab-cell-held` (track `robofab`, milestone 4's next steps). That project found that adding load and unload time to the printer's demand fixes mean value analysis (MVA) at saturation but breaks it at lower loads, and asked for a blocking-aware model. Here I build two such models and a third that separates latency from capacity, and test them against the discrete-event simulation. All numbers are from `experiments/results.txt` (20 seeds, 24 h horizon after a 4 h warm-up, mean rates in good parts per hour; times illustrative, not measured).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-cell-blocking/

- **The held-demand error at low load is double counting.** Load and unload time is already in the arm station's delay, so also adding it to the printer's demand counts it twice whenever printers are not the bottleneck. Adding a fitted stall (printers wait for the arm to unload them) on top of held demand (`block_prio`, `block_mva`) makes low and moderate loads worse, not better (8.5% and 9.5% on the 24 non-saturated rows, against 7.3% for held demand and 3.6% for plain MVA).
- **At saturation the stall helps.** On the 8 rows with work in process 2P, `block_prio` (an unload-priority M/G/1 estimate of the wait) errs by 1.4%, against 2.9% for held demand and 8.2% for plain MVA.
- **Treating latency and capacity apart works best overall on the design grid.** `split` runs MVA on the *plain* printer demand plus the fitted stall, then caps the rate at the held capacity P/(print + load + unload + stall). Mean absolute error over the 32 design rows: split 3.6%, plain 4.7%, held 6.2%, block_prio 6.7%, block_mva 7.9%.
- **On a held-out job mix it is only a tie with plain MVA.** Twelve rows with a different mix, cv 0.5 and two inspectors, never used to build or choose a predictor: split 3.4%, plain 3.5%, held 6.4%. Split is clearly better near saturation (plain overshoots by up to 15.8%), but it still underestimates by 7 to 8% at work in process equal to the number of printers (up to 8.2%). I picked `split` after seeing the design grid, so its 3.6% there is optimistic; the held-out figure is the fair one.

```bash
pip install numpy
cd research/robofab-cell-blocking
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, < 1 s
python3 experiments/run.py                                # about 6 s; writes experiments/results.{txt,json}
python3 experiments/figure.py                             # needs matplotlib; writes experiments/error.png
```
Produced with numpy 2.x and Python 3.13.

## Motivation

A cheap analytic model of a cell is only useful if one knows which version to trust and when. The held-printer follow-ups showed no single printer demand is right across loads; this project asks whether modelling the blocking itself, or separating latency from capacity, removes that dependence.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), and `research/robofab-cell-held`, `research/robofab-cell-cv` and `research/robofab-cell-mva` in this repository, whose model and code I reuse (copied so the project is self-contained). No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Methods: mean value analysis, Reiser and Lavenberg (1980); the load-dependent recursion, Bolch et al. (2006); the non-preemptive priority M/G/1 waiting time is the standard textbook result. Entries in `paper/refs.bib`. This run had no web access, so I could not re-check them online: verify before citing.

## Method

`src/robofab_cell_blocking/mva.py` adds three functions to the copied model. The stall per pass is the wait of a finished print for the arm. `block_prio` estimates it as the waiting time of an unload at a non-preemptive priority M/G/1 queue (unloads before loads), W = R0/(1 &minus; &rho;<sub>u</sub>) with R0 = X&middot;&Sigma;E[S&sup2;]/2 and lognormal second moments from cv; `block_mva` takes the arm's queueing delay from the MVA itself. Both add the stall times passes per good part to the held printer demand and iterate with the throughput X to a damped fixed point. `split_blocking_mva` uses the plain printer demand plus the stall and caps the result at P/(held demand + stall). Error is (prediction &minus; simulation)/simulation.

## Results

See the bullets above and `experiments/results.txt`; `experiments/error.png` plots the grouped errors.

## Limitations

Stylised and simulation-only. One arm, no travel, no breakdowns, independent failures, closed loop. The M/G/1 estimate treats the arm's load requests as always eligible although in the simulator a load waits for a free printer, and it ignores that unloads are rarer at low load; I did not check it in isolation. `split` was chosen after seeing the design grid (one variant was tried after the first two failed), and the held-out set has only 12 rows from one mix. Twenty seeds give standard errors of 1% to 2% of the rate, so differences of that size within a row are not resolved. No claim concerns a physical cell.

## Next steps

Check the stall estimate directly against the simulator's measured stall share (`simulate(..., stats=True)`); a load-dependent printer station; more mixes for the held-out check; measured step times from a MuJoCo arm.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

`numpy` only (matplotlib for the figure). No language model or hardware was used. Produced with AI assistance (Claude).

MIT.
