"""Milestone 4c: glider against AUV with the dive energy anchored on a bench measurement.

Prediction (logged before running): e_cycle of 14 to 35 kJ sits at or above 4b's top value (20 kJ),
so the glider's win share at AUV hotel x1 stays 0%, and the break-even AUV hotel multiple (median 4.87
in 4b) falls, because the glider's energy per metre rises with e_cycle.

Source: SOCIB bench test of Slocum G2 batteries (MARTECH 2025, paper 17): a 3 min (180 s) high-drain
phase at 6.43 A, battery range 15 V to 12 V in regular use. Electrical energy of one such phase:
6.43 A x {12, 13.5, 15} V x 180 s = 13.9, 15.6, 17.4 kJ. The test models the deep inflection of a 1000 m
dive under the harshest expected conditions, so it is an upper-side anchor for one inflection; a full
yo-yo cycle has two, so 2x is also run. The paper's 490/565 "Ah" capacity figures are not used (unit unclear).

Run: PYTHONPATH=src:experiments python3 experiments/run_slocum_socib.py > experiments/results_slocum_socib.txt
"""
import run_slocum as r

I, T = 6.43, 180.0
ONE = [I * v * T for v in (12.0, 13.5, 15.0)]
print("one inflection kJ at 12/13.5/15 V:", ", ".join(f"{e/1e3:.1f}" for e in ONE))
for label, mult in (("one inflection per cycle", 1.0), ("two inflections per cycle", 2.0)):
    r.GRID["e_cycle"] = tuple(e * mult for e in ONE)
    print(f"\n### e_cycle = {label}: {', '.join(f'{e/1e3:.1f}' for e in r.GRID['e_cycle'])} kJ")
    r.main()
