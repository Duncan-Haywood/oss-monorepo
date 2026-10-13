# Stiction twin: a twin with the right sliding friction says the PID loop converges, what does the real one do?

Pure Python, no dependencies. Unit mass under PID with Coulomb friction: kinetic level `Fc`, breakaway level `Fs ≥ Fc`; twin has no friction and is stable (error <1e-58). With `Fs = Fc` (sliding friction correctly identified) the real loop converges in all 15 cases tried (<5e-14), so that twin validates. With a stiction excess `ΔF = Fs − Fc` it hunts in stick-slip at 0.54–0.93 `ΔF/kp` in four of five gain settings, independent of `Fc` (0 to 20) and start, falling with damping and rising weakly with integral gain; one setting (kd=4, ki=5) converges. Scaling is bit-exact for power-of-two scales; the cycle is unique only to ~3 digits. Negative result: short runs show a motionless "converged" error for large `Fc/ki` while a 20 000 s run still hunts. No closed form for the amplitude constant. See `paper/whitepaper.md`.

```bash
cd research/stiction-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # about a minute; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), HIRO Group (<https://hiro-group.ronc.one/>, manipulation) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The friction models and hunting phenomenon are classical (Armstrong-Hélouvry, Dupont & Canudas de Wit 1994; Olsson et al. 1998). Companion to `backlash-twin`, `deadband-twin`, `slew-twin` and `control-twin` in this repository.

Stylised: unit mass, Coulomb plus static friction only, noiseless, five gain settings, a simulated "real" system, no field data. MIT.
