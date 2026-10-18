"""Sweeps for garment-assistloc. Writes experiments/results.txt."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_assistloc.location import net_change, break_even_ratio, Layout
from garment_assistpower.powertrain import PowerTrain

out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))
P("Net whole-body change (%) at gain 0.3, 4 h battery, 8 N m/kg motor, by shank/waist penalty ratio")
P("ratio  shank  waist")
for k in (1, 2, 3, 5, 8):
    P(f"{k:>5}  {net_change('shank', 0.3, 4, k):+6.1f}  {net_change('waist', 0.3, 4, k):+6.1f}")
P("\nBreak-even ratio (waist layout wins above it), by cable efficiency and motor density (gain 0.3, 4 h)")
dens = (8, 20, 40)
P("bowden  " + "  ".join(f"{d:>6}" for d in dens))
for e in (0.6, 0.7, 0.8, 0.9, 1.0):
    row = []
    for d in dens:
        k = break_even_ratio(0.3, 4, PowerTrain(motor_nm_per_kg=d), Layout(bowden_eff=e))
        row.append(f"{k:6.2f}" if k is not None else "  none")
    P(f"{e:>6}  " + "  ".join(row))
P("\nNet change (%) at density 40, cable 0.8, by ratio: does either layout beat no suit-mass penalty at all?")
P("ratio  shank  waist")
for k in (1, 3, 5):
    P(f"{k:>5}  {net_change('shank', 0.3, 4, k, PowerTrain(motor_nm_per_kg=40)):+6.1f}  {net_change('waist', 0.3, 4, k, PowerTrain(motor_nm_per_kg=40)):+6.1f}")
txt = "\n".join(out)
print(txt)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write(txt + "\n")
