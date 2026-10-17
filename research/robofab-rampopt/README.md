# Does tuning the trapezoid's ramp fraction beyond a grid shrink the time-optimal carry's edge, and is it still positive? (stylised)

A follow-up to `research/robofab-edgeconv` (track `robofab`), taking the first item of its "Next steps": refine the trapezoid's ramp-fraction search so both sides of the comparison are tuned. Same toy arm, parts, limits, 14-value ramp grid and ramp-resolved sampling as `robofab-edgeconv`. All numbers below are from `experiments/results.txt` (and `results.json`).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-rampopt/

- **Golden-section refinement of the ramp fraction (between the grid optimum's two neighbours) lowers the six-part trapezoid total by 0.00 to 0.60%** across the 12 rows (3 arm sizes x jaw cap 5x hold force or none x speed limit 2 or 1 rad/s); the gain is above 0.005% in 10 of 12 rows and is largest (0.60%) for the 0.2 m arm at 2 rad/s with the jaw cap.
- **With the solver at n = 6400, the time-optimal edge over the refined trapezoid is still positive in all 12 rows, but smaller: +0.05% to +0.28%**, against +0.11% to +0.88% over the grid-tuned trapezoid (the grid figures reproduce `robofab-edgeconv`).
- **Reading:** in this toy a time-optimal planner saves at most about 0.3% over a trapezoid whose single shape parameter is tuned finely, and in several rows under 0.1%. The earlier 0.8 to 2.9% (`robofab-scurve`) and 0.1 to 0.9% (`robofab-edgeconv`) were upper bounds that included ramp-tuning slack.

```bash
cd research/robofab-rampopt
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 49 tests, < 10 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 2 min; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

The edge of a time-optimal planner over a simple one is only meaningful if the simple one is tuned as well as it can be. `robofab-edgeconv` converged the solver but left the trapezoid's ramp fraction on a 14-value grid, flagging that a finer search "could shave the edge further". This project does that, so later projects (the workcell twin `robofab-cell`, track `selfrep`) can quote an edge that is bounded from both sides.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-edgeconv` and the projects it copies from. Arm model, geometry, solver and trapezoid are copied from `robofab-edgeconv` (renamed package) so this project is self-contained. It does not build on, and is not endorsed by, either group. No external paper is reproduced. Golden-section search is the standard derivative-free line search (see any optimisation text); no source is copied.

## Method

Unchanged from `robofab-edgeconv` except: for each part and row, `trap.best_trap` picks the best ramp fraction f on the grid (0.002 to 0.5); `trap.refine_trap` then runs 14 golden-section iterations on [f-, f+], the grid neighbours of that optimum, evaluating the minimum feasible duration (bisection, tolerance 1e-4 s, 40 extra samples per ramp). Because the duration as a function of f need not be unimodal, the refined result is the minimum of the grid optimum and every point visited, so it is never worse than the grid. The solver runs only at n = 6400. Two tests (49 in all) check that the refinement is never worse than the grid, stays inside the bracket and is feasible.

## Results

`experiments/results.txt` lists, per row, the grid and refined trapezoid totals, the solver total, the gain, both edges and the number of extra trapezoid solves (96 per row, 16 per part). All 12 rows had all six parts feasible. For 0.2 m links, k = 5, wmax = 2 rad/s: grid trapezoid 2.585 s, refined 2.570 s, solver 2.563 s; edge 0.88% over the grid trapezoid and 0.28% over the refined one.

## Limitations

- Stylised. All parameters other than geometry are assumed; simulated results are not claims about physical arms or drives.
- Refinement is local (one bracket around the grid optimum), so it can miss a better f elsewhere; the refined trapezoid is still an upper bound on the best trapezoid. Duration is found by bisection to 1e-4 s, and the torque check samples discrete points, so gains below about 0.01% are within noise.
- The solver's residual error at n = 6400 (a few hundredths of a percent per `robofab-edgeconv`) is comparable to the smallest edges here (0.05%), so the sign of those rows is not firmly established.
- The unlimited-speed torque- and jaw-bound rows, absolute jerk limits and a MuJoCo check of the profiles are not examined.
- One speed limit on both joints, a fixed joint-space line, one planar arm, no motor dynamics.

## Next steps

Re-run the unlimited-speed rows with ramp-resolved sampling and n = 6400; add the S-curve shape parameter to the refinement; an absolute jerk limit in rad/s^3; check the profiles in MuJoCo.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.

## Figure
`python3 experiments/figure.py` plots the time-optimal edge over the grid-tuned and refined trapezoid for the 12 rows from the committed `experiments/results.json` and writes `experiments/edge.png` (needs matplotlib; no new results).
