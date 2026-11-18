"""Milestone 10o: break-even range with pack inputs taken from manufacturer cell specifications (closes 10n's "Next").

Predictions (written before the first run):
 (P1) at 10k's base case (engine 1 kW/kg, eta_chain 0.20, tank 0.25, climb 100 m at 2 m/s, transition 30 s at 0.6 x hover) every
      one of the four Molicel cells below gives a break-even against the 250 Wh/kg battery aircraft between 25 and 60 km;
 (P2) the P50S (highest rated current, 5,070 W/kg cell-level) has the lowest break-even of the four, below 30 km;
 (P3) over 10m's uniform ranges for the other ten inputs, the median break-even differs by less than a factor of 2
      between the P42A and the P50S, and the 10th-90th percentile bands overlap.
Inputs: Molicel product pages (https://www.molicel.com/, read 2026-11-09): nominal voltage 3.6 V; INR-21700-P42A 4.2 Ah, 230 Wh/kg,
max weight 70 g, discharge current 45 A; P45B 4.5 Ah (16.2 Wh), 242 Wh/kg, 45 A; P50B 5.0 Ah, 265 Wh/kg, 60 A; P50S 5.0 Ah, 260 Wh/kg,
max weight 71 g, 100 A. Cell-level power density = I_max x 3.6 V / cell mass (mass = Wh / (Wh/kg) where the page gives no weight).
The page's "discharge current" is a maximum rating, not a flight-pack continuous rating (cell heating limits a real pack), so the
cell-level figure is an upper bound; the pack figure applies 10k's pack factor kpack = 0.7 (itself an assumption) to both energy and power.
"""
import random, sys
from climb_transition_hybrid import hyb_ct
from hybrid_mass_law import bat_free
from global_sensitivity import RANGES, be

V_NOM = 3.6
KPACK = 0.7
# name: (capacity Ah, Wh/kg gravimetric, max discharge A, mass kg or None)
CELLS = {"P42A": (4.2, 230, 45, 0.070), "P45B": (4.5, 242, 45, None),
         "P50B": (5.0, 265, 60, None), "P50S": (5.0, 260, 100, 0.071)}

def cell(name):
    ah, wkg, amax, m = CELLS[name]
    m = m or ah * V_NOM / wkg
    return {"e_cell": wkg, "p_cell": amax * V_NOM / m, "p_batt": KPACK * amax * V_NOM / m}

BASE = dict(p_eng=1.0, eta_chain=0.20, k_tank=0.25, V=30.0, LD=12.0, h=100.0, vc=2.0, t_tr=30.0, f_tr=0.6)

def pct(v, q):
    v = sorted(v); return v[int(q * (len(v) - 1))]

def main(N=3000, seed=5):
    print("Milestone 10o: break-even range (km) with pack inputs from Molicel cell specifications")
    print("cell   e_cell Wh/kg  cell W/kg  pack W/kg(k=0.7)  base-case km   others sampled: median [p10, p90]   engine 2 kW/kg base km")
    rng = random.Random(seed)
    draws = [{k: rng.uniform(*RANGES[k]) for k in RANGES if k not in ("e_cell", "p_batt")} for _ in range(N)]
    for name in CELLS:
        c = cell(name)
        b = be({**BASE, "fnon": 0.479, "e_cell": c["e_cell"], "p_batt": c["p_batt"]})
        b2 = be({**BASE, "p_eng": 2.0, "fnon": 0.479, "e_cell": c["e_cell"], "p_batt": c["p_batt"]})
        ys = [be({**d, "e_cell": c["e_cell"], "p_batt": c["p_batt"]}) for d in draws]
        print(f"{name}  {c['e_cell']:8}  {c['p_cell']:9.0f}  {c['p_batt']:9.0f}  {b:10}  {pct(ys,.5):10.0f} [{pct(ys,.1):.0f}, {pct(ys,.9):.0f}]  {b2:18}")

if __name__ == "__main__":
    main(*(int(a) for a in sys.argv[1:]))
