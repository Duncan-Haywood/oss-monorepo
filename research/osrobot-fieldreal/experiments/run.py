"""Experiments for osrobot-fieldreal. `python3 experiments/run.py > experiments/results.txt` (about a minute)."""
import random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_fieldreal import model as M

SEEDS = range(20)
AREA_HA = 60 * 30 / 1e4
KMH = 1 / 3.6
OLD = dict(SWATH=1.0, TREAT_S=3.0, GANTRY_V=0.5, TREAT_OK=0.95)
NEW = dict(SWATH=M.SWATH, TREAT_S=M.TREAT_S, GANTRY_V=M.GANTRY_V, TREAT_OK=M.TREAT_OK)


def avg(planner, consts, field_kw=None, **kw):
    for k, v in consts.items():
        setattr(M, k, v)
    rows = []
    for s in SEEDS:
        F = M.Field(s, **(field_kw or {})); r = random.Random(1000 + s)
        rows.append((M.run_inline if planner == "inline" else M.run_scout)(F, r, **kw))
    n = len(rows)
    out = {k: sum(r[k] for r in rows) / n for k in rows[0]}
    out["ha_h"] = AREA_HA / (out["time_min"] / 60)
    return out


def kw(planner, kmh, **extra):
    v = kmh * KMH
    return dict(v=v, **extra) if planner == "inline" else dict(v_scout=v, v_tour=1.5, **extra)


H = f"{'':<30}{'kill':>7}{'min':>8}{'ha/h':>7}{'Wh':>8}{'treats':>8}{'weeds':>8}"


def line(label, r):
    return f"{label:<30}{r['kill']:>7.3f}{r['time_min']:>8.1f}{r['ha_h']:>7.2f}{r['energy_wh']:>8.0f}{r['treatments']:>8.0f}{r['weeds']:>8.0f}"


print(f"# osrobot-fieldreal results: 60 x 30 m field, {len(SEEDS)} seeds per row (fields and draws common across rows)")
print("# SRC constants: swath 2 m, 0.73 s/weed, 99.2% kill. ASSUMED: p_max 0.7, blur 2 m/s, fp 0.01/m2, mud 20%, energies")
print("# ceiling from the sources: 2 km/h x 2 m = 0.40 ha/h")

print(f"\n# Sweep 1: old constants (1 m swath, 3 s, 0.5 m/s gantry, 95%) against sourced, density 0.3/m2, 1 km/h\n{H}")
for name, c in (("old", OLD), ("sourced", NEW)):
    for pl in ("inline", "scout"):
        print(line(f"{pl} {name}", avg(pl, c, **kw(pl, 1.0))))

print(f"\n# Sweep 2: speed (km/h, the source range 0.5 to 2) x planner, sourced constants, density 0.3/m2\n{H}")
for kmh in (0.5, 1.0, 2.0, 4.0):
    for pl in ("inline", "scout"):
        print(line(f"{pl} {kmh} km/h", avg(pl, NEW, **kw(pl, kmh))))

print(f"\n# Sweep 3: weed density (per m2) x planner, sourced constants, 1 km/h, p_max 0.7\n{H}")
for d in (0.3, 1.0, 3.0, 10.0):
    for pl in ("inline", "scout"):
        if d >= 10 and pl == "scout":
            continue  # nearest-neighbour tour over ~17,000 targets is O(n^2) and too slow here; inline only
        print(line(f"{pl} d={d}", avg(pl, NEW, field_kw=dict(density=d), **kw(pl, 1.0))))

print(f"\n# Sweep 4: beam steering speed (the unsourced input), inline, density 3/m2, 1 km/h\n{H}")
for g in (0.5, 1.0, 5.0, 50.0):
    print(line(f"inline gantry={g} m/s", avg("inline", dict(NEW, GANTRY_V=g), field_kw=dict(density=3.0), **kw("inline", 1.0))))

print(f"\n# Sweep 5: detector hit rate p_max (unsourced), density 1/m2, 1 km/h\n{H}")
for pm in (0.5, 0.7, 0.9, 1.0):
    for pl in ("inline", "scout"):
        print(line(f"{pl} p_max={pm}", avg(pl, NEW, field_kw=dict(density=1.0), **kw(pl, 1.0, p_max=pm))))
