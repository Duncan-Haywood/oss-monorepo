"""Experiments for osrobot-scoutpair. `python3 experiments/run.py > experiments/results.txt`."""
import random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_scoutpair import model as M

SEEDS = range(30)
KEYS = ("kill", "ground_min", "fly_min", "makespan_min", "energy_wh", "treatments", "targets")


def avg(planner, field_kw=None, **kw):
    rows = []
    for s in SEEDS:
        F = M.Field(s, **(field_kw or {})); r = random.Random(1000 + s)
        if planner == "inline":
            x = M.run_inline(F, r, **kw); x.update(ground_min=x["time_min"], fly_min=0.0, makespan_min=x["time_min"], targets=0)
        else:
            x = M.run_pair(F, r, **kw)
        rows.append(x)
    return {k: sum(x[k] for x in rows) / len(rows) for k in KEYS}


H = f"{'':<30}{'kill':>7}{'ground':>8}{'fly':>7}{'total':>8}{'Wh':>7}{'treats':>8}"


def line(label, r):
    return (f"{label:<30}{r['kill']:>7.3f}{r['ground_min']:>8.1f}{r['fly_min']:>7.1f}"
            f"{r['makespan_min']:>8.1f}{r['energy_wh']:>7.0f}{r['treatments']:>8.0f}")


print(f"# osrobot-scoutpair results: 60 x 30 m field, {len(SEEDS)} seeds per row (fields and random draws shared across rows)")
print("# Reference: weeds 0.3/m2 clustered, 20% muddy blocks. Ground robot: p_max 0.7 inline at v=1.0; as treater v_tour=1.5.")
print("# Scout: 3 m swath, p_max 0.6, 0.01 false positives/m2, 150 W. ground = treater minutes; fly = scout minutes; total = ground + fly (no overlap).")
print(f"\n# Sweep 1: one platform against two, scout v=5 m/s\n{H}")
print(line("inline v=1.0", avg("inline", v=1.0)))
for plan in ("euclid", "mud"):
    print(line(f"pair plan={plan}", avg("pair", v_scout=5.0, plan=plan)))

print(f"\n# Sweep 2: scout speed (mud-aware tour)\n{H}")
for v in (1.0, 2.0, 3.0, 5.0, 8.0, 12.0):
    print(line(f"pair scout v={v}", avg("pair", v_scout=v, plan="mud")))

print(f"\n# Sweep 3: scout detection p_max at v=5 (mud-aware tour)\n{H}")
for p in (0.3, 0.45, 0.6, 0.8, 0.95):
    print(line(f"pair scout p_max={p}", avg("pair", v_scout=5.0, p_max=p, plan="mud")))

print(f"\n# Sweep 4: weed density, inline against pair (scout v=5, mud-aware)\n{H}")
for d in (0.05, 0.15, 0.3, 0.6, 1.2):
    print(line(f"inline d={d}", avg("inline", field_kw=dict(density=d), v=1.0)))
    print(line(f"pair d={d}", avg("pair", field_kw=dict(density=d), v_scout=5.0, plan="mud")))

print(f"\n# Sweep 5: mud share, inline against pair (scout v=5), euclid then mud-aware tour\n{H}")
for mu in (0.0, 0.2, 0.5, 0.8):
    print(line(f"inline mud={mu}", avg("inline", field_kw=dict(mud=mu), v=1.0)))
    print(line(f"pair euclid mud={mu}", avg("pair", field_kw=dict(mud=mu), v_scout=5.0, plan="euclid")))
    print(line(f"pair mud-aware mud={mu}", avg("pair", field_kw=dict(mud=mu), v_scout=5.0, plan="mud")))

print(f"\n# Sweep 6: the one-platform frontier, inline speed (no scout), for matching kill against sweep 2\n{H}")
for v in (0.5, 1.0, 1.5, 2.0, 3.0):
    print(line(f"inline v={v}", avg("inline", v=v)))

print(f"\n# Sweep 7: scout swath (m) at scout v=1.0, mud-aware tour; the 3 m rows are sweep 2's v=1.0 row\n{H}")
for w in (1.0, 2.0, 3.0, 4.0, 6.0):
    print(line(f"pair swath={w}", avg("pair", v_scout=1.0, plan="mud", swath=w)))

print(f"\n# Sweep 8: scout speed at 1 m swath (same swath as the ground robot), mud-aware tour\n{H}")
for v in (0.5, 1.0, 2.0):
    print(line(f"pair swath=1 v={v}", avg("pair", v_scout=v, plan="mud", swath=1.0)))
