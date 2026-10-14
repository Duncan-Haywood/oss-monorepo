# Grid twin: a twin that plans on a k-connected grid over-states every route by a heading-dependent factor that cell size does not shrink, so which of two routes is "shorter" can depend on how the map is oriented

Pure Python, no dependencies. Real system: a straight route of Euclidean length `L` in free space; twin: the shortest path on a 4-, 8- or 16-connected lattice (an occupancy-grid twin of an environment). Results (all from `experiments/results.txt`): (1) the grid/Euclid length ratio depends only on heading `φ` and connectivity, not on cell size: for 8-connectivity it is `cos φ + (√2−1) sin φ` on `[0, 45°]`, mean over heading exactly `8(√2−1)/π = 1.0548` (4-connected `4/π = 1.2732`, 16-connected 1.0144 numerically), worst case 1.0824 at 22.5° (4-conn 1.4142 at 45°, 16-conn 1.0275 at 13.3°); Dijkstra on the lattice matches the closed forms to 3 decimals; (2) refining the cell from 8 m to 0.1 m leaves the ratio of a 100 m route at 22.5° at 1.0824 throughout (the error is a property of the move set, not of resolution); (3) calibrating by the mean factor leaves −5.2% to +2.6% (8-conn; −21.5% to +11.1% for 4-conn); (4) for two routes of Euclid lengths 1 and 1.03 at independent uniform headings the 8-connected twin ranks the longer one shorter with probability 0.194 (quadrature, matched by 2·10⁵-sample Monte Carlo); the probability is 0.50 at equal lengths, 0.086 at 1.05 and exactly 0 at `ρ ≥ 1.0824`; (5) for the same pair of routes at 22.5° apart and ρ = 1.03, rotating the map flips the ranking for 31% of map orientations. Free space only: obstacles are not modelled. Stylised; see `paper/whitepaper.md`.

```bash
cd research/grid-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, about 2 s
PYTHONPATH=src python3 experiments/run.py                 # about 1 min; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>; occupancy and generative environment twins), the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>; UAV and field-robot route planning); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Grid metric distortion is classical (octile distance; Rivera et al. 2020 survey of grid heuristics; Daniel et al. 2010 on any-angle planning, Theta*). Companion to `occupancy-twin`, `terrain-twin` and `uav-energy-twin` in this repository.

Stylised: simulated "real" system, no field data. MIT.
