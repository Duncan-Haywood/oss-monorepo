# Flex twin: a rigid-body twin certifies every controller bandwidth, what does the real two-mass plant allow?

Pure Python, no dependencies. A twin treats motor plus load as one rigid inertia, so its PD loop `M s² + kd s + kp` is stable at any bandwidth. The real plant has a flexible joint (two masses, spring, damper) and the load position is sensed. Exact result: the critical bandwidth ratio `ε_c = w/ws` does not depend on the mass ratio at all; it is the smallest root of a cubic in `(δ, ζ)`, `ε_c ≈ δ/ζ` for small modal damping `δ` (exact to `O(δ⁵)` at `ζ = 1/√2`: 0.0143, 0.0714, 0.286 of `ws` for `δ` = 0.01, 0.05, 0.2), and the loop is unstable at every gain with no modal damping. Motor-side sensing was stable on all 7 320 grid points. Twin and real step responses differ by under 1% at 0.9 `ε_c`, so ordinary validation gives no warning; a twin that overstates `δ` by `f` certifies `ε_c` high by the same factor, and a design at fraction `m` of the certified bandwidth tolerates `f ≈ 1/m`. See `paper/whitepaper.md`.

```bash
cd research/flex-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # about 20 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), HIRO Group (<https://hiro-group.ronc.one/>, manipulation) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Flexible-joint and non-collocated control are classical (Cannon & Schmitz 1984; Spong 1987; Preumont 2011). Companion to `backlash-twin`, `stiction-twin`, `latency-twin` and `control-twin` in this repository.

Stylised: one flexible mode, linear, PD only, continuous-time, noiseless, a simulated "real" system, no hardware data; collocated stability checked on a grid, not proved. MIT.
