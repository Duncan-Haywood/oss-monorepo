"""Milestone 10p: how far must a cell's continuous discharge fall below its maximum rating before the hybrid's break-even leaves the tens of km?

No data host answered this session (molicel.com, engine makers: proxy 403), so the continuous-discharge curves 10o asked for could not be read.
This is therefore a sweep, not a sourced result: the maximum current of 10o's four Molicel cells is multiplied by a derating d.
Predictions (written before the first run):
 (P1) at d = 1 the script reproduces 10o (P42A 44, P45B 42, P50B 32, P50S 22 km at the base case);
 (P2) break-even rises monotonically as d falls, for every cell;
 (P3) at d = 0.5 every cell's base-case break-even is above 60 km, and at d = 0.25 above 150 km or never (cap) for at least three of four cells.
"""
import sys
from sourced_cells import CELLS, BASE, V_NOM, KPACK
from global_sensitivity import be

DS = (1.0, 0.75, 0.5, 0.33, 0.25)

def run():
    print("Milestone 10p: base-case break-even (km) against the 250 Wh/kg battery aircraft, max current x derating d")
    print("cell   " + "".join(f"  d={d:<5}" for d in DS) + "  (pack W/kg at d=1 .. 0.25)")
    for name, (ah, wkg, amax, m) in CELLS.items():
        m = m or ah * V_NOM / wkg
        row, pw = [], []
        for d in DS:
            p = KPACK * amax * d * V_NOM / m
            pw.append(p)
            row.append(be({**BASE, "fnon": 0.479, "e_cell": wkg, "p_batt": p}))
        print(f"{name}  " + "".join(f"  {r!s:<7}" for r in row) + f"  {pw[0]:.0f} .. {pw[-1]:.0f}")

if __name__ == "__main__":
    run()
