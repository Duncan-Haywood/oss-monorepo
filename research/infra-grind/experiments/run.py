"""Writes results.txt. Deterministic; takes about a minute."""
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from infra_grind import *

OUT = []
def w(s=""):
    OUT.append(s); print(s)

P80 = 100.0
CL_MAX = 3.5   # circulating load (return/fresh feed) a real circuit tolerates; 300-400% is "untuned" per a vendor guide
CUTS = [0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5]

def best_closed(p=None, target=P80, clmax=CL_MAX):
    rows = [energy_closed(target, c, p) for c in CUTS]
    ok = [r for r in rows if r["circ_load"] <= clmax]
    return (min(ok, key=lambda r: r["energy"]) if ok else None), rows

w("A. Open versus closed circuit at P80 = 100 um, feed F80 = 1500 um (default shape parameters; energy in model units, see README)")
eo = energy_open(P80)
w(f"open circuit: {eo:.2f} kWh/t (model units)")
w("cut/P80  circ.load  E_pass  E_fresh  vs_open")
best, rows = best_closed()
for r in rows:
    w(f"{r['cut_ratio']:.2f}      {r['circ_load']*100:6.0f}%   {r['E_pass']:6.2f}  {r['energy']:6.2f}   {r['energy']/eo:5.2f}")
w(f"best with circulating load <= {CL_MAX*100:.0f}%: cut {best['cut_ratio']}, load {best['circ_load']*100:.0f}%, saving {100*(1-best['energy']/eo):.0f}% ({eo/best['energy']:.2f}x open/closed)")

w("")
w("B. Local exponent m in E ~ P80^-m (closed circuit, cut = 1.25 P80) against Bond's, by selection exponent alpha")
w("alpha  m(50-200um)  Bond_m(50-200um, F80=1500)")
bm = math.log(bond_energy(1, 50, 1500) / bond_energy(1, 200, 1500)) / math.log(4)
for a in (0.4, 0.6, 0.8, 0.9, 1.0, 1.2):
    p = {"alpha": a}
    e50 = energy_closed(50, 1.25, p)["energy"]; e200 = energy_closed(200, 1.25, p)["energy"]
    w(f"{a:4.1f}   {math.log(e50/e200)/math.log(4):6.2f}        {bm:6.2f}")

w("")
w("C. Saving of the best feasible closed circuit over open, swept one input at a time (P80 100 um)")
w("input        value   open   best_closed  cut  load   saving")
def sweep(name, vals):
    for v in vals:
        p = {name: v}
        e_o = energy_open(P80, p)
        b, _ = best_closed(p)
        if b is None:
            w(f"{name:12s} {v:6}  {e_o:6.2f}  none within load limit"); continue
        w(f"{name:12s} {v:6}  {e_o:6.2f}  {b['energy']:6.2f}   {b['cut_ratio']:.2f} {b['circ_load']*100:4.0f}%  {100*(1-b['energy']/e_o):4.0f}%")
sweep("tanks", [1, 2, 3, 4, 6, 10])
sweep("sharp", [2.0, 3.0, 4.0, 6.0, 8.0])
sweep("bypass", [0.0, 0.1, 0.2, 0.3])
sweep("alpha", [0.6, 0.9, 1.2])
sweep("beta", [2.5, 3.5, 5.0])
sweep("gamma", [0.5, 0.8, 1.2])
sweep("phi", [0.2, 0.4, 0.6])

w("")
w("D. Circulating load versus energy at P80 = 100 um (default, cut swept finely)")
w("cut/P80  load   E_fresh/E_open")
for c in (0.85, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0, 3.0):
    r = energy_closed(P80, c)
    w(f"{c:.2f}    {r['circ_load']*100:5.0f}%   {r['energy']/eo:.2f}")

w("")
w("E. Cross-check of the open-circuit penalty against Bond's EF2 = 1.20 (Rowland, as tabulated by metdynamics)")
w("Open/closed energy ratio at the best feasible cut, tanks x sharpness grid (ratio):")
w("tanks\\sharp  " + "  ".join(f"{s:4.1f}" for s in (3.0, 4.0, 6.0, 8.0)))
for t in (1, 3, 6, 10):
    row = []
    for s in (3.0, 4.0, 6.0, 8.0):
        p = {"tanks": t, "sharp": s}
        b, _ = best_closed(p)
        row.append(f"{energy_open(P80, p)/b['energy']:4.2f}" if b else " n/a")
    w(f"{t:5d}        " + "  ".join(row))

w("")
w("F. Fines slowing: S_i / (1 + (xfine/x_i)^kfine), swept. Does the open/closed ratio fall toward Bond's EF2 = 1.20? (P80 100 um)")
w("xfine  kfine  open_E  best_closed_E  cut  load  open/closed")
for xf in (0.0, 10.0, 30.0, 60.0, 100.0, 200.0):
    for kf in ((2.0,) if xf == 0 else (1.0, 2.0, 4.0)):
        p = {"xfine": xf, "kfine": kf}
        b, _ = best_closed(p)
        e_o = energy_open(P80, p)
        if b is None:
            w(f"{xf:5.0f}  {kf:4.1f}  {e_o:7.2f}  none within load limit"); continue
        w(f"{xf:5.0f}  {kf:4.1f}  {e_o:7.2f}  {b['energy']:7.2f}   {b['cut_ratio']:.2f} {b['circ_load']*100:4.0f}%  {e_o/b['energy']:5.2f}")

open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(OUT) + "\n")
