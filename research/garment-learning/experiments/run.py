"""Writes results.txt. Deterministic, stdlib only. Replica cost and minutes come from garment-teardown."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "garment-teardown" / "src"))
sys.path.insert(0, str(HERE.parent / "src"))
from garment_teardown import TRENCH, replica, cost_breakdown, SCENARIOS
from garment_learning import *

rep = replica(TRENCH)
mat = cost_breakdown(rep, SCENARIOS["mid-wage"])
materials = mat["fabric"] + mat["lining"] + mat["trims"]
F = rep.sam_minutes + rep.cutting_finishing_minutes      # experienced-operator minutes per coat
out = []
w = out.append
w(f"replica trench: materials ${materials:.0f}, experienced-operator minutes {F:.0f} (sewing {rep.sam_minutes:.0f} + cutting {rep.cutting_finishing_minutes:.0f}), from garment-teardown")
w("")
w("== A. coats until unit time <= 2x the experienced-operator minutes (floor = experienced time)")
w("first_coat_multiple  rate  coats_to_2x  first_coat_hours  coat_at_2x_hours")
for k in (4, 8):
    for r in (0.80, 0.85, 0.90):
        n = units_to_reach(2 * F, k * F, r, floor=F)
        w(f"{k} {r:.2f} {n} {k*F/60:.1f} {2*F/60:.1f}")
w("")
w("== B. own sewing time valued at a wage: total cost of the n-th coat, materials + labour (first coat 4x, rate 0.85)")
w("wage_per_hour  coat_1  coat_5  coat_20  coat_100")
for wage in (0, 6, 15):
    row = [materials + labour_cost_per_unit(n, 4 * F, 0.85, wage, floor=F) for n in (1, 5, 20, 100)]
    w(f"{wage} " + " ".join(f"{x:.0f}" for x in row))
w("")
w("== C. wage at which the n-th coat still costs <= $50 (first coat 4x, rate 0.85; $0 if materials alone exceed $50)")
w("coat  unit_hours  max_wage_per_hour")
for n in (1, 5, 20, 100):
    h = unit_minutes(n, 4 * F, 0.85, floor=F) / 60
    w(f"{n} {h:.1f} {max(0.0, (50 - materials) / h):.2f}")
w("")
w("== D. factory view: mean sewing labour per coat over a production run, mid-wage ($6/h, efficiency 0.55), first coat 2x, rate 0.90")
w("run_length  mean_labour_per_coat  steady_state_labour")
ss = F / 60 * 6 / 0.55
for n in (1, 10, 50, 200, 1000):
    w(f"{n} {average_cost_over(n, 2*F, 0.90, 6, floor=F, efficiency=0.55):.1f} {ss:.1f}")
Path(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
