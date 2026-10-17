# Where does a small robot-printer-inspection cell lose time? A discrete-event twin for job-shop scheduling and bottleneck analysis

A stylised, simulation-only study for milestone 4 (`robofab-cell`) of the `robofab` track. A robot arm loads and unloads 3D printers and a station inspects each part. The cell is modelled as a discrete-event twin (standard library only), scheduled as a small job shop, and probed for its bottleneck. All numbers are from `experiments/results.txt` (deterministic: seeds 0 to 199, common random numbers). All parameters are illustrative; none were measured on a real cell.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-cell/

- **Utilisation names the wrong bottleneck.** With 1 arm and 1 inspection station, the printers have the highest utilisation at every size from 1 to 8 printers (0.71 at 8; arm 0.47, inspection 0.70), and the makespan of 30 parts falls from 1609 min (1 printer) to 285 min (8). At 6 printers (338 min), one extra printer saves 32.2 min (95% half-width 1.3), one extra arm 10.9 (0.7), one extra inspection station 2.3 (0.7), halving load and unload time from 2 to 1 min 21.1 (0.7), and halving inspection time 6.8 (0.8). The arm is under 40% utilised, but a printer is held while it waits for the arm, so arm delay is printer idle time.
- **Dispatching trades makespan for flow time.** Paired against (unload-first, FIFO) at 3 printers: shortest-print-first ordering lowers mean flow time by 58 min and raises makespan by 14 min; longest-first raises mean flow time by 71 min and lowers makespan by 4 (loading before unloading as well: 14). This matches the textbook behaviour of these rules (Graham 1969; Pinedo 2016); it is a check that the twin behaves, not a new result.
- **A deterministic twin is optimistic.** Using mean print times and no rejects, the twin underestimates the stochastic mean makespan by 133 min at 1 printer, 17 at 6 and 1 at 7 (non-monotone: 9 min at 4, 11 at 8). The twin's value lies below the realised makespan in 41 to 78% of replications. Mean-value twins hide the spread, and the spread is what a schedule must absorb.

```bash
cd research/robofab-cell
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, < 1 s
python3 experiments/run.py                                # about 3 s; writes experiments/results.{txt,json}
```
Produced with Python 3.11, standard library only.

## Motivation

Track 4 asks for general-purpose robot cells that make parts, including for the self-replicating shop of track 1. Before programming a real cell, a discrete-event twin shows where it will wait. This is the repository's digital-twin theme applied to throughput rather than control, and the question "how faithful must the twin be?" appears as experiment E4.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from that group is reproduced; nothing here is affiliated with or endorsed by them. Scheduling background, cited for context and not reproduced: Graham (1969), "Bounds on Multiprocessing Timing Anomalies", *SIAM J. Appl. Math.* 17(2), 416-429 (longest-processing-time rule); Pinedo (2016), *Scheduling: Theory, Algorithms, and Systems*, 5th ed., Springer. Existence, title, venue, year and pages (Graham) and edition and year (Pinedo) were checked against web search results on 2026-10-13 (SIAM DOI 10.1137/0117039; Springer DOI 10.1007/978-3-319-26580-3); the paper text itself was paywalled and not read, so the LPT/SPT behaviour is attributed to textbook knowledge, not to a quoted passage. See `paper/refs.bib`.

## Method

- **Resources** (`src/robofab_cell/cell.py`): `n_arms` arms, `n_printers` printers, `n_inspect` inspection stations. Base: 1 arm, 4 printers, 1 station.
- **Job**: LOAD (arm, 2 min; needs a free printer, which is then held) → PRINT (lognormal, mean 45 min, CV 0.5, same part keeps its print time on rework) → UNLOAD (arm, 2 min, frees the printer) → INSPECT (6 min). With probability 0.08 the part is rejected and goes back to LOAD.
- **Batch**: 30 parts, all available at time 0; makespan is the time the last part passes inspection. 200 replications; every configuration sees the same draws.
- **Dispatching**: when the arm is free it picks an unload (FIFO) or a load (by job order) according to `unload_first` or `load_first`; job order is FIFO (index), SPT or LPT by print time. A reworked part rejoins the load queue and is ranked by the same key.
- **Lower bound**: largest of printer hold time / printers, arm time / arms, inspection time / stations, ignoring rework and start-up and drain. It is loose.
- **Experiments**: E1 printer sweep with utilisation, E2 dispatch rules (paired differences), E3 what-if upgrades (paired differences), E4 deterministic versus stochastic twin.

Printer utilisation counts the whole hold (load, print, unload), so "printer-bound" includes time spent waiting for the arm; print-only utilisation would be lower.

## Results

See the bullets at the top and `experiments/results.txt`; short discussion in `paper/whitepaper.md`.

## Limitations

Stylised. All times and the reject rate are my own illustrative values, not measurements. One product family, no arm travel or motion planning, no printer failures, material changes or queue limits at inspection, a single batch from an empty cell, a normal-approximation interval over 200 replications. The 6-printer baseline for E3 was chosen after seeing E1. Nothing here is a statement about a physical cell.

## Next steps

Replace the fixed 2 min handling with arm motion times from `research/robofab-program`'s kinematics; add printer failures and filament changes; schedule mixed products with due dates and compare dispatch rules with a mixed-integer or constraint-programming schedule; feed measured times from a real cell.

## Owner steps

None for this milestone; nothing was built or ordered. To use the model for a real cell the owner would time load, unload, print and inspection on actual hardware (for example a low-cost arm and an open printer), with a priced bill of materials and sourced, dated prices, which are not given here.

## Outside dependencies

None: Python standard library only, no language model, no hardware. Produced with AI assistance (Claude).

MIT.
