# Slip twin: a kinematic-bicycle twin of a car ignores tyre slip, so how wrong is its turning radius, and does calibrating that reveal the speed at which a twin-tuned steering loop goes unstable?

Pure Python, no dependencies. Real system: linear single-track car with tyre slip; twin: kinematic bicycle `ψ' = vδ/L`; calibrated twin adds the understeer gradient `K`. Results (all from `experiments/results.txt`): (1) steering the real car with the twin's angle gives radius `R(1 + Kv²/L)`, matched by simulation (understeer car, R = 100 m: 104.6, 118.5, 174.0, 266.4 m at 5, 10, 20, 30 m/s, twin 4–63% too small, exactly half at the characteristic speed 23.26 m/s; oversteer car: twin radius too large by up to 136% at 20 m/s); (2) calibrating `K` removes the radius error exactly; (3) the kinematic and calibrated twins both certify `δ = −k_p y − k_d ψ` as stable at every speed and gain, but 11 of a 30-point gain grid lose stability on the real car below 60 m/s (e.g. kp 0.4, kd 0.5: 14.0 m/s; kp 0.1, kd 0.5: 36.3 m/s), confirmed in the time domain (offset 1.1·10⁻⁹ m at 8 m/s, 4.6·10⁷ m at 20 m/s); (4) an oversteer car with feedback loses stability at 23.7 m/s, below its open-loop critical speed 26.33 m/s. The closed-loop limit is not derived in closed form. Stylised: linear tyres, constant speed, no actuator lag or delay; see `paper/whitepaper.md`.

```bash
cd research/slip-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, about 1 s
PYTHONPATH=src python3 experiments/run.py                 # a few seconds; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>; field vehicles); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Single-track vehicle dynamics are classical (Rajamani 2012; Gillespie 1992; Polack et al. 2017 on the kinematic bicycle). Companion to `sample-twin`, `latency-twin`, `terrain-twin` and `gravity-twin` in this repository.

Stylised: simulated "real" system, no field data. MIT.
