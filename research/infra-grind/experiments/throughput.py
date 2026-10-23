"""Section G: does a mill-flow (hold-up) limit close the gap to Bond's EF2? Writes throughput.txt (about 1-2 minutes)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from infra_grind import *

OUT = []
def w(s=""):
    OUT.append(s); print(s)

P80 = 100.0
CUTS = [0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]
w("G. Mill-flow limit. One mill of fixed power; its total flow (fresh + return) may not exceed m x the open circuit's fresh feed.")
w("capacity ratio = closed fresh-feed capacity / open = min(E_open/E_closed, m/(1+load)); best cut chosen per m. Default shape parameters, P80 100 um.")
eo = energy_open(P80)
rows = [energy_closed(P80, c) for c in CUTS]
w("cut/P80  load   E_open/E_closed")
for r in rows:
    w(f"{r['cut_ratio']:.2f}    {r['circ_load']*100:5.0f}%   {eo/r['energy']:5.2f}")
w("")
w("m     best_cut  load   capacity_ratio  binding")
for m in (1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 8.0):
    best = max(rows, key=lambda r: capacity_ratio(eo, r, m))
    cr = capacity_ratio(eo, best, m)
    bind = "power" if eo / best["energy"] <= m / (1 + best["circ_load"]) else "flow"
    w(f"{m:4.2f}  {best['cut_ratio']:.2f}     {best['circ_load']*100:4.0f}%   {cr:6.2f}          {bind}")
open(os.path.join(os.path.dirname(__file__), "throughput.txt"), "w").write("\n".join(OUT) + "\n")
