"""Experiments for osrobot-fieldtour. `python3 experiments/run.py > experiments/results.txt`."""
import random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_fieldtour import model as M

SEEDS = range(30)
KEYS = ("kill", "time_min", "energy_wh", "treatments")


def avg(planner, field_kw=None, **kw):
    rows = []
    for s in SEEDS:
        F = M.Field(s, **(field_kw or {})); r = random.Random(1000 + s)
        rows.append((M.run_inline if planner == "inline" else M.run_scout)(F, r, **kw))
    return {k: sum(x[k] for x in rows) / len(rows) for k in KEYS}


def line(label, r):
    return f"{label:<26}{r['kill']:>7.3f}{r['time_min']:>9.1f}{r['energy_wh']:>9.0f}{r['treatments']:>8.0f}"


H = f"{'':<26}{'kill':>7}{'min':>9}{'Wh':>9}{'treats':>8}"
print(f"# osrobot-fieldtour results: 60 x 30 m field, {len(SEEDS)} seeds per row (fields and random draws shared across rows)")
print("# Reference: weeds 0.3/m2 clustered, 20% muddy blocks, p_max 0.7, false positives 0.01/m2, overlap 0, scout v 1.0, tour v 1.5")
print(f"\n# Sweep 1: tour rule, scout v=1.0\n{H}")
print(line("inline v=1.0", avg("inline", v=1.0)))
for t in ("random", "nn", "nn2opt", "lane"):
    print(line(f"scout tour={t}", avg("scout", v_scout=1.0, v_tour=1.5, tour=t)))

print(f"\n# Sweep 2: weed density, scout v=1.0\n{H}")
for d in (0.05, 0.15, 0.3, 0.6, 1.2):
    print(line(f"inline d={d}", avg("inline", field_kw=dict(density=d), v=1.0)))
    for t in ("nn", "nn2opt", "lane"):
        print(line(f"scout {t} d={d}", avg("scout", field_kw=dict(density=d), v_scout=1.0, v_tour=1.5, tour=t)))

print(f"\n# Sweep 3: tour speed (scout v=1.0), nn2opt against inline v=1.0\n{H}")
for vt in (1.0, 1.5, 2.0, 3.0):
    print(line(f"scout nn2opt vt={vt}", avg("scout", v_scout=1.0, v_tour=vt, tour="nn2opt")))

print(f"\n# Sweep 4: mean straight-line tour length (m) over the same detections, 30 fields, reference setting")
tot = {t: 0.0 for t in ("random", "nn", "nn2opt", "lane")}; ntg = 0
for s in SEEDS:
    F = M.Field(s); r = random.Random(1000 + s)
    seen = {}; fps = []
    for c in M.lanes(F.Y, 0.0):
        for tx, ty, i in M._looks(r, F, c, 0.7, 1.0, 0.01):
            if i is None: fps.append((tx, ty, None))
            elif i not in seen: seen[i] = (tx, ty, i)
    tg = list(seen.values()) + fps; ntg += len(tg)
    for t in tot:
        tot[t] += M.tour_length((F.X, 0.0), M.plan_tour(tg, (F.X, 0.0), t))
print(f"# mean targets per field {ntg/len(SEEDS):.1f}")
for t, v in tot.items():
    print(f"{t:<26}{v/len(SEEDS):>9.0f}")
