"""Experiments for osrobot-weedpass. `python3 experiments/run.py > experiments/results.txt`."""
import random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_weedpass import model as M

SEEDS = range(20)
AREA_HA = 60 * 30 / 1e4
KMH = 1 / 3.6
H = f"{'':<34}{'kill':>7}{'min':>8}{'ha/h':>7}{'Wh':>8}{'treats':>8}"


def avg(field_kw=None, **kw):
    rows = []
    for s in SEEDS:
        F = M.Field(s, **(field_kw or {})); r = random.Random(1000 + s)
        rows.append(M.run_passes(F, r, **kw))
    n = len(rows)
    out = {k: sum(r[k] for r in rows) / n for k in rows[0]}
    out["ha_h"] = AREA_HA / (out["time_min"] / 60)
    return out


def line(label, r):
    return f"{label:<34}{r['kill']:>7.3f}{r['time_min']:>8.1f}{r['ha_h']:>7.2f}{r['energy_wh']:>8.0f}{r['treatments']:>8.0f}"


print(f"# osrobot-weedpass results: 60 x 30 m field, {len(SEEDS)} seeds per row, sourced laser constants (osrobot-fieldreal)")
print("# ASSUMED: p_max 0.7, blur 2 m/s, fp 0.01/m2, mud 20%, energies; detections independent between passes")

print(f"\n# Sweep 1: passes x speed (km/h), stop-and-treat, density 1/m2\n{H}")
for p in (1, 2, 3):
    for kmh in (1.0, 2.0, 4.0):
        print(line(f"{p} pass {kmh} km/h", avg(field_kw=dict(density=1.0), passes=p, v=kmh * KMH)))

print(f"\n# Sweep 2: stop-and-treat against on-the-move, 1 pass, density x speed\n{H}")
for d in (0.3, 1.0, 3.0, 10.0):
    for kmh in (1.0, 2.0, 4.0):
        for mv in (False, True):
            print(line(f"d={d} {kmh} km/h {'move' if mv else 'stop'}",
                       avg(field_kw=dict(density=d), passes=1, v=kmh * KMH, on_move=mv)))

print(f"\n# Sweep 3: detector hit rate x passes, 2 km/h, on the move, density 1/m2\n{H}")
for pm in (0.5, 0.7, 0.9):
    for p in (1, 2, 3):
        print(line(f"p_max={pm} {p} pass", avg(field_kw=dict(density=1.0), passes=p, v=2 * KMH, p_max=pm, on_move=True)))

print(f"\n# Sweep 4: share of weeds the detector never sees (hidden), 2 km/h, on the move, density 1/m2, p_max 0.7\n{H}")
for h in (0.0, 0.1, 0.3):
    for p in (1, 2, 3):
        print(line(f"hidden={h} {p} pass", avg(field_kw=dict(density=1.0), passes=p, v=2 * KMH, on_move=True, hidden_share=h)))
