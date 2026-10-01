# Backlash twin: a twin with a rigid drivetrain says the PI loop converges, what does the real one do?

Pure Python, no dependencies. Real drivetrain: load follows the motor through a gap of half-width `h` (the play operator); twin: `y = m`. On the discrete PI loop `z+=z+y, m+=m−kp·y−ki·z` the twin's spectral radius is 0.707–0.894 (twin error <1e-145), yet the real loop settles on a limit cycle of motor amplitude 1.30–2.94 `h`, and the amplitude scales exactly with `h` (1.302317 for `h` = 0.01, 1, 100). The backlash describing function (closed form, matches numerical Fourier to 1.2e-7) is an excitation-dependent gain (0.21 at `A/h`=1.2, 0.99 at 30) with a phase lag; harmonic balance predicts the cycle but overestimates its amplitude by 6.7–10.1%. Negative result: the loop is bistable in some settings, hunting from small starts (1.1654 `h`) yet converging from large steps, so a large-step validation can pass a configuration that hunts. See `paper/whitepaper.md`.

```bash
cd research/backlash-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # <2 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), HIRO Group (<https://hiro-group.ronc.one/>, manipulation) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical: describing functions (Gelb & Vander Velde 1968) and backlash control (Nordin & Gutman 2002). Follow-up to `deadband-twin` and `deadband-noise-twin`, and companion to `control-twin` and `saturation-twin` in this repository.

Stylised: scalar loop, symmetric known gap, noiseless, five gain settings, a simulated "real" system, no field data. MIT.
