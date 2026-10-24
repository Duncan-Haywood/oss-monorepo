"""Experiments for osrobot-weedsrc. `python3 experiments/run.py > experiments/results.txt`."""
import random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_weedsrc import model as M

SEEDS = range(20)
KMH = 1 / 3.6
H = f"{'':<38}{'kill':>7}{'min':>8}{'Wh':>8}{'treats':>8}"
P_SRC, V_SRC = M.fit_detector()


def avg(field_kw=None, **kw):
    rows = []
    for s in SEEDS:
        F = M.Field(s, **(field_kw or {})); r = random.Random(1000 + s)
        rows.append(M.run_passes(F, r, **kw))
    return {k: sum(r[k] for r in rows) / len(rows) for k in rows[0]}


def line(label, r):
    return f"{label:<38}{r['kill']:>7.3f}{r['time_min']:>8.1f}{r['energy_wh']:>8.0f}{r['treatments']:>8.0f}"


print(f"# osrobot-weedsrc results: 60 x 30 m field, {len(SEEDS)} seeds per row, 1 weed/m2, on the move")
print(f"# detector A (osrobot-weedpass, ASSUMED): p_max 0.70, v_blur 2.0 m/s")
print(f"# detector B (fitted to published rates {M.DETECT_POINTS}): p_max {P_SRC:.3f}, v_blur {V_SRC:.2f} m/s")
print("# detector rate at each speed (m/s): " + ", ".join(f"{k}km/h A {0.7*__import__('math').exp(-k*KMH/2.0):.3f} B {P_SRC*__import__('math').exp(-k*KMH/V_SRC):.3f}" for k in (1, 2, 4)))
dets = (("A assumed", 0.7, 2.0), ("B fitted", P_SRC, V_SRC))

print(f"\n# Sweep 1: passes x speed (km/h) under each detector\n{H}")
for name, pm, vb in dets:
    M.V_BLUR = vb
    for p in (1, 2, 3):
        for kmh in (1.0, 2.0, 4.0):
            print(line(f"{name[0]} {p} pass {kmh} km/h", avg(field_kw=dict(density=1.0), passes=p, v=kmh * KMH, p_max=pm, on_move=True)))

print(f"\n# Sweep 2: detector B, share of weeds never seen (hidden), 2 km/h\n{H}")
M.V_BLUR = V_SRC
for h in (0.0, 0.05, 0.1, 0.2, 0.3):
    for p in (1, 2, 3):
        print(line(f"B hidden={h} {p} pass", avg(field_kw=dict(density=1.0), passes=p, v=2 * KMH, p_max=P_SRC, on_move=True, hidden_share=h)))

print(f"\n# Sweep 3: detector B, how much a second pass gains vs density, 2 km/h\n{H}")
for d in (0.3, 1.0, 3.0):
    for p in (1, 2):
        print(line(f"B d={d} {p} pass", avg(field_kw=dict(density=d), passes=p, v=2 * KMH, p_max=P_SRC, on_move=True)))
