"""Sweeps for garment-bowdenbend. Writes experiments/results.txt."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_bowdenbend.bend import bowden_eff, critical_bend, waist_net
from garment_assistloc.location import net_change

out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))
P("Waist-layout net change (%) at gain 0.3, 4 h, ratio 3, mu 0.1, by total cable bend (rad); shank layout is the last column")
P("bend  eff  waist  shank")
for th in (0, 1, 2, 3, 4, 6, 8):
    P(f"{th:>4}  {bowden_eff(0.1, th):.2f}  {waist_net(0.3, 4, 3, 0.1, th):+6.1f}  {net_change('shank', 0.3, 4, 3):+6.1f}")
P("\nCritical total bend (rad) beyond which the shank layout wins, by friction mu and ratio (gain 0.3, 4 h)")
ratios = (1.5, 2, 3, 5)
P("mu     " + "  ".join(f"{r:>6}" for r in ratios))
for mu in (0.05, 0.1, 0.15, 0.2, 0.3):
    row = []
    for r in ratios:
        c = critical_bend(0.3, 4, r, mu)
        row.append("  none" if c is None else f"{c:6.2f}")
    P(f"{mu:<6} " + "  ".join(row))
P("\nSame at 40 N m/kg motor density (mu 0.1)")
from garment_assistpower.powertrain import PowerTrain
P("ratio  critical_bend_rad")
for r in ratios:
    c = critical_bend(0.3, 4, r, 0.1, PowerTrain(motor_nm_per_kg=40))
    P(f"{r:>5}  {'none' if c is None else format(c, '.2f')}")
txt = "\n".join(out)
print(txt)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write(txt + "\n")
