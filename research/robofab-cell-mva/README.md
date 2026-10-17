# Does exact queueing analysis predict a robot-printer cell's throughput better than a utilisation bound? Mean value analysis against a discrete-event twin

A stylised, simulation-only follow-up to `research/robofab-cell-bound` (track `robofab`, milestone 4's next step "compare with an analytic queueing network"). I treat the arm, the P printers and the inspection station as a closed single-class queueing network, solve it exactly with mean value analysis (MVA), and check the answer against my own discrete-event simulation, with switches that add one departure from the analytic assumptions at a time. All numbers are from `experiments/results.txt` (20 seeds, 24 h horizon after a 4 h warm-up, mean ± standard error, good parts per hour). Job types and times are the ones used in `robofab-cell-bound` (A: 20 min print, 10% fail; B: 60 min print, 20% fail; load and unload 2 min; inspect 3 min); they are illustrative, not measured.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-cell-mva/

- **The MVA code is exact where it should be.** It matches the stationary solution of the underlying Markov chain to 9 decimal places on three small networks (a unit test), and a simulation of the product-form model (single job type, exponential times) agrees with it within about two standard errors at 4 of 5 sizes and 2.3 standard errors at the fifth (P=4: 8.86 against 9.10 ± 0.11). I do not read that as a discrepancy; with five comparisons one such value is not surprising.
- **Against the model it is meant for, the error is a few per cent.** With an equal mix of A and B (so the printing station violates the equal-mean FCFS condition) and exponential times, MVA is within −6.3% to +3.9% of the simulation for 1 to 8 printers, never more than 1.3 standard errors from it.
- **With less variable times MVA is pessimistic.** Exponential service is more variable than the lognormal (cv 0.3) or deterministic times of the cell. In the product-form-compatible variant at 12 printers (work in process 14), MVA is 8.2% below the lognormal simulation and 10.9% below the deterministic one (11.02 against 12.00 ± 0.08 and 12.37 ± 0.10).
- **With the real printer-holding semantics, MVA beats the utilisation bound in most rows but not all.** In the variant that matches `robofab-cell-bound` (a printer is held from the start of its load to the end of its unload), the bound overestimates by 10.9%, 17.4%, 9.3% and 0.8% at 4, 8, 12 and 16 printers (lognormal times); plain MVA errs by +7.2%, +2.5%, −5.2% and −3.8%. At 16 printers the bound is as good or better. Modelling the held printer as extra printer demand ("MVA-h") is worse at 8 printers and above (−3.9% to −8.8%) and slightly better only at 4 (−1.6%), so I would not recommend it.
- **At high work in process MVA misses the plateau.** At 8 printers with real semantics, the simulation saturates at 8.3 to 8.6 parts/h from a work in process of 10 on (8.56 ± 0.09 at 20), while MVA keeps rising (9.79 at 20, 14% too high; MVA-h 8.97, 5% too high). The cause I suspect is printers idling while waiting for the arm, which the product-form model cannot express. I did not test this separately.
- **Consistency check, not a validation.** My simulation's real-semantics values at 8 printers (8.07 ± 0.08 at work in process 8 and 8.41 ± 0.10 at 10) are close to those reported in `robofab-cell-bound`'s README (8.07 ± 0.08 and 8.3 to 8.5), though the two programs were written independently and I did not run them side by side.

```bash
pip install numpy
cd research/robofab-cell-mva
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, < 1 s
python3 experiments/run.py                                # about 3 s; writes experiments/results.{txt,json}
```
Produced with numpy and Python 3.13.

## Motivation

Track 4 wants arms that run a manufacturing cell, and a fast model that says where an extra machine pays off. A closed-form analysis costs microseconds where a simulation costs seconds, so the question is how much accuracy that buys or loses. It is a fidelity question, like the twin projects: which model is enough to decide?

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and `research/robofab-cell-bound` in this repository, whose model and parameters I reuse. No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Methods: mean value analysis, Reiser and Lavenberg (1980); the load-dependent recursion for multi-server stations, Bolch et al. (2006), ch. 8; product-form networks, Baskett et al. (1975) and Buzen (1973); Little (1961). Full entries in `paper/refs.bib`. This run had no web access, so I could not re-check these references online: verify them before citing.

## Method

- **Network** (`src/robofab_cell_mva/mva.py`). Three stations in a cycle: the arm (1 server), printing (P servers), inspection (K servers). The demand of a station per good part is the type-weighted mean of (service time per pass)/(1 − q), as in `robofab-cell-bound`'s bound. A job's type mix is thereby folded into one class, which is an approximation. The recursion is the load-dependent MVA for rate min(n, m) at a station with m servers.
- **Simulation** (`src/robofab_cell_mva/sim.py`), written for this project. Mode `pf`: the arm does load plus unload as one service, the printer is held only while printing; this is the exact analytic model. Mode `hold`: a printer is seized when its load starts and released when its unload ends, the arm does the two as separate FIFO services. Distributions: exponential, deterministic, lognormal with cv 0.3.
- **Variants** change one assumption at a time, so a gap can be assigned to a cause: `pf/exp` (analytic assumptions), `pf/ln` and `pf/det` (service variability), `hold/ln` and `hold/det` (printer held while waiting for the arm).
- All parameter values are my choice for illustration.

## Results

See the bullets above, `experiments/results.txt` and `paper/whitepaper.md`.

## Limitations

Stylised and simulation-only. One job class (types are averaged), one arm with no travel or kinematics, no breakdowns or changeovers, independent failures, closed loop. Twenty seeds give standard errors of about 1% of the rate, so differences of one or two per cent are not resolved. The explanation offered for the high-work-in-process gap is untested. Which of the models is "right" for a physical cell is not addressed; no claim concerns a physical cell.

## Next steps

Multi-class MVA or approximate MVA with a blocking correction for the held printer; Seidmann-style or Marie-type approximations for the arm-printer interaction; sweep the coefficient of variation to find where the bound overtakes MVA; use measured step times from a MuJoCo arm.

## Owner steps

None; nothing was built or ordered. A real cell would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

`numpy` only. No language model or hardware was used. Produced with AI assistance (Claude).

MIT.
