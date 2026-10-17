"""Run every scenario and a one-at-a-time sweep. Deterministic.  python experiments/run.py > experiments/results.txt"""
import sys
from dataclasses import replace
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from house_schedule import SCENARIOS, Scenario, run, interest_share

N = 4000
print(f"A. scenarios, {N} builds each (seed 1). Calendar days = 1.4 x working days. Interest at 8%/yr on the drawn balance.")
print("   scenario                              mean cal days   p90 cal days   interest % of cost")
base = None
for sc in SCENARIOS:
    r = run(sc, N)
    base = base or r
    print(f"   {sc.name:36s} {r['mean']*1.4:8.0f} ({r['mean']/base['mean']-1:+.1%}) {r['p90']*1.4:8.0f}   {100*interest_share(r['carry']):6.2f} ({100*(interest_share(r['carry'])-interest_share(base['carry'])):+.2f} pts)")
print("\nB. baseline mean calendar days against each assumption (others at baseline)")
for field, vals in [("rain_p", [0.0, 0.05, 0.15, 0.30]), ("inspect_fail", [0.0, 0.15, 0.30]),
                    ("handoff_gap", [0.5, 2.0, 5.0]), ("sd_frac", [0.1, 0.25, 0.4])]:
    for v in vals:
        a = run(Scenario("b", **{field: v}), N)
        b = run(Scenario("all", order_early=True, panel_share=0.6, merge_trades=True, **{field: v}), N)
        print(f"   {field}={v:<5}  baseline {a['mean']*1.4:6.0f}   all-three {b['mean']*1.4:6.0f}   saving {1-b['mean']/a['mean']:6.1%}")
