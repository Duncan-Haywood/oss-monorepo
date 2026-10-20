# Where does exact queueing analysis of a robot-printer cell stop working? A variability sweep and a measured printer stall share

A stylised, simulation-only follow-up to `research/robofab-cell-mva` (track `robofab`, milestone 4's next steps). That project left two things open: how the error of mean value analysis (MVA) and of the utilisation bound change with service-time variability, and whether printers idling while they wait for the arm explain MVA's overshoot at high work in process (a conjecture it did not test). Here I sweep the coefficient of variation (cv) and instrument the simulation to measure the idle share directly. All numbers are from `experiments/results.txt` (20 seeds, 24 h horizon after a 4 h warm-up, mean ± standard error, good parts per hour). Job types and times are those of `robofab-cell-mva` (A: 20 min print, 10% fail; B: 60 min print, 20% fail; load and unload 2 min; inspect 3 min; equal mix), illustrative and not measured. Semantics are the real-cell ones: a printer is held from the start of its load to the end of its unload.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-cell-cv/

- **The ranking of MVA and the bound is not stable in cv.** At 12 printers (work in process 14, lognormal times) MVA errs by −6.2% (cv 0), −5.2% (0.3), −3.1% (0.6), −0.6% (1.0), +4.7% (1.5) and +8.4% (2.0) against the simulation; the bound errs by +8.2% to +25.0% over the same range. MVA's error crosses zero near cv 1, the value for exponential times, which is the case MVA is exact for. The bound is closer than MVA only at 16 printers, where the arm is the bottleneck, and only for cv up to about 0.6 (+0.3% to +0.8% against −3.8% to −4.2%); at cv 1.0, 1.5 and 2.0 MVA is closer.
- **At 4 printers the simulated rate barely moves with cv** (4.32 to 4.53 parts/h, standard errors 0.07 to 0.17), so the sweep there shows only noise; MVA errs by +5% to +10% throughout.
- **Printer stall is small and rises with load.** Define stall as the share of printer-time in which a finished part waits for the arm to unload it. At 8 printers and cv 0.3 it is 0.1% at work in process 2, 2.1% at 8 and 4.4% to 4.6% from 10 to 20, so it does not explain a 14% gap between MVA and the plateau (9.79 against 8.56 ± 0.09 at work in process 20) by itself.
- **Holding the printer through load and unload plus the measured stall does account for the saturated rate at 4 and 8 printers.** The held capacity, 60·P divided by the printer demand including load and unload, times (1 − stall) gives 4.44 and 8.59 against simulated 4.35 ± 0.05 and 8.56 ± 0.09. At 12 printers it gives 11.82 against 11.54 ± 0.09 (2.4% high). At 16 printers the arm is the bottleneck (arm capacity 12.71, simulated 12.70 ± 0.11) and the printer formula does not apply. This is an accounting identity checked against one simulation, not a proof of cause; it supports the conjecture of `robofab-cell-mva` only in a weaker form: the held-printer demand does most of the work and the idle wait for the arm the rest.

```bash
pip install numpy
cd research/robofab-cell-cv
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, < 1 s
python3 experiments/run.py                                # about 5 s; writes experiments/results.{txt,json}
```
Produced with numpy 2.5.3 and Python 3.13.

## Motivation

A fast analytic model is only useful if one knows when to trust it. `robofab-cell-mva` found MVA better than the bound in most but not all rows; this project asks how that depends on a property a real cell has (variable step times) and tests one of its untested explanations. It is a fidelity question, like the twin projects.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), `research/robofab-cell-bound` and `research/robofab-cell-mva` in this repository, whose model, parameters and code I reuse (copied here so the project is self-contained). No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Methods: mean value analysis, Reiser and Lavenberg (1980); the load-dependent recursion, Bolch et al. (2006); Little (1961). Entries in `paper/refs.bib`. This run had no web access, so I could not re-check them online: verify before citing.

## Method

`src/robofab_cell_cv/mva.py` and `sim.py` are copied from `robofab-cell-mva` (same author, MIT). The only change is `simulate(..., stats=True)`, which also returns the stall share: the time between a part's print ending and the arm starting its unload, summed over unloads that start after warm-up and divided by P × (horizon − warm-up). `experiments/run.py` runs three experiments: a sweep over cv ∈ {0, 0.3, 0.6, 1, 1.5, 2} at P ∈ {4, 8, 12, 16} (work in process P + 2); stall against work in process at P = 8; and the capacity accounting at work in process 20. Lognormal times with the given cv; cv 0 is deterministic.

## Results

See the bullets above and `experiments/results.txt`.

## Limitations

Stylised and simulation-only. One arm, no travel, no breakdowns, independent failures, closed loop, one job class in MVA (types averaged). Twenty seeds give standard errors of about 1% to 2% of the rate (more at high cv), so differences of that size are not resolved and the exact cv at which signs change is only approximate. The accounting in the last bullet fits the same simulation it describes; its fit at other parameters is untested. No claim concerns a physical cell.

## Next steps

Multi-class or approximate MVA with a blocking correction for the held printer, using the measured stall share as a check; more seeds near the sign changes; measured step times from a MuJoCo arm.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

`numpy` only. No language model or hardware was used. Produced with AI assistance (Claude).

MIT.
