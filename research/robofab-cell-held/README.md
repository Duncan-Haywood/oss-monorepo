# Does holding the printer through load and unload fix mean value analysis of a robot-printer cell? A mixed result

A stylised, simulation-only follow-up to `research/robofab-cell-cv` (track `robofab`, milestone 4's next steps). That project's accounting suggested that most of mean value analysis' (MVA) overshoot at saturation comes from the printer being held through the arm's load and unload. The obvious analytic repair is to add load and unload time to the printer's service demand (`cell_demands(..., hold_printer=True)`). Here I test it as a predictor against the discrete-event simulation, in 32 settings. All numbers are from `experiments/results.txt` (20 seeds, 24 h horizon after a 4 h warm-up, mean rates in good parts per hour). Job types and times are those of `robofab-cell-mva` (A: 20 min print, 10% fail; B: 60 min print, 20% fail; load and unload 2 min; inspect 3 min; equal mix), illustrative and not measured.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-cell-held/

- **Overall the repair does not help.** Mean absolute error against the simulation, over all 32 rows (cv 0.3 and 1.0, 4 to 16 printers, work in process P/2, P, P+2, 2P): plain MVA 4.7%, held-demand MVA 6.2%, plain utilisation bound 8.0%, held-demand bound 5.5%.
- **It helps only when the cell is saturated.** On the 8 rows with work in process 2P, held-demand MVA errs by 2.9% on average against 8.2% for plain MVA (bounds: 4.7% held, 9.8% plain). On the other 24 rows it is worse: 7.3% against 3.6%. Held demand underestimates at low and moderate work in process (errors of −3% to −12% in the table), where printers are rarely stalled, and plain MVA is already within a few percent.
- **So no single demand setting is right across loads.** A predictor that switches on load, or a model of the blocking itself (Next steps), would be needed. I did not build one.

```bash
pip install numpy
cd research/robofab-cell-held
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, < 1 s
python3 experiments/run.py                                # about 5 s; writes experiments/results.{txt,json}
```
Produced with numpy 2.5.3 and Python 3.13.

## Motivation

A cheap analytic model of a cell is only useful if one knows which version to trust and when. `robofab-cell-cv` found an accounting identity at saturation; this project checks whether it can be turned into a better model across loads. It is a fidelity question, like the twin projects.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), and `research/robofab-cell-cv`, `research/robofab-cell-mva` and `research/robofab-cell-bound` in this repository, whose model and code I reuse (copied so the project is self-contained). No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Methods: mean value analysis, Reiser and Lavenberg (1980); the load-dependent recursion, Bolch et al. (2006). Entries in `paper/refs.bib`. This run had no web access, so I could not re-check them online: verify before citing.

## Method

`src/robofab_cell_held/` is a copy of `robofab-cell-cv`'s `mva.py` and `sim.py`, unchanged. `experiments/run.py` simulates the real-cell semantics (printer seized at the start of load, released at the end of unload) with lognormal times, and compares four predictors with the simulated rate: MVA on plain demands; MVA with the printer demand including load and unload; the asymptotic bound on each set of demands. Error is (prediction − simulation)/simulation. The "saturated" rows are those with work in process equal to twice the number of printers; the grouping was chosen before the numbers were computed, but after seeing `robofab-cell-cv`'s results.

## Results

See the bullets above and `experiments/results.txt`.

## Limitations

Stylised and simulation-only. One arm, no travel, no breakdowns, independent failures, closed loop, one job class in the analytic models. Twenty seeds give standard errors of 1% to 2% of the rate (the table lists them), so differences of that size within a row are not resolved. Only two cv values and one job mix were tried; the grouping into saturated and other rows has 8 and 24 rows and the averages mix settings. No claim concerns a physical cell.

## Next steps

A blocking-aware approximation (for example a Seidmann-style or Marie-type correction for the held printer), a load-dependent printer demand, more job mixes, and measured step times from a MuJoCo arm.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

`numpy` only. No language model or hardware was used. Produced with AI assistance (Claude).

MIT.
