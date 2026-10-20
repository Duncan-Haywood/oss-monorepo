"""Experiments for osrobot-field. Prints tables; `python3 experiments/run.py > experiments/results.txt`."""
import random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_field import model as M

SEEDS = range(30)


def avg(planner, field_kw=None, **kw):
    field_kw = field_kw or {}
    rows = []
    for s in SEEDS:
        F = M.Field(s, **field_kw); r = random.Random(1000 + s)
        rows.append((M.run_inline if planner == "inline" else M.run_scout)(F, r, **kw))
    n = len(rows)
    return {k: sum(r[k] for r in rows) / n for k in rows[0]} | {"kill_sd": (sum((r["kill"] - sum(q["kill"] for q in rows) / n) ** 2 for r in rows) / n) ** 0.5}


def speed_kw(planner, v, **kw):
    return dict(v=v, **kw) if planner == "inline" else dict(v_scout=v, v_tour=1.5, **kw)


def line(label, r):
    return f"{label:<24}{r['kill']:>7.3f}{r['time_min']:>9.1f}{r['energy_wh']:>9.0f}{r['treatments']:>8.0f}{r['wasted']:>8.1f}"


H = f"{'':<24}{'kill':>7}{'min':>9}{'Wh':>9}{'treats':>8}{'wasted':>8}"
print(f"# osrobot-field results: 60 x 30 m field, {len(SEEDS)} seeds per row (fields and random draws are common across rows)")
print("# Reference: weeds 0.3/m2 clustered, 20% of 5 m blocks muddy, p_max 0.7, false positives 0.01/m2, lane overlap 0")
for n, hdr in ((1, "Sweep 1: travel speed during the detecting pass (scout tour speed fixed at 1.5 m/s)"),):
    print(f"\n# {hdr}\n{H}")
    for v in (0.25, 0.5, 1.0, 1.5, 2.0, 3.0):
        for pl in ("inline", "scout"):
            print(line(f"{pl} v={v}", avg(pl, **speed_kw(pl, v))))

print(f"\n# Sweep 2: lane overlap at v=1.0 (both planners), p_max 0.7\n{H}")
for ov in (0.0, 0.25, 0.5, 0.75):
    for pl in ("inline", "scout"):
        print(line(f"{pl} overlap={ov}", avg(pl, **speed_kw(pl, 1.0, overlap=ov))))

print("\n# Sweep 3: cheapest configuration that reaches mean kill >= TARGET, by sensor quality")
print("# grid: planner x speed {0.25,0.5,1,1.5,2,3} x overlap {0,.25,.5,.75}; fp rate 0.01/m2")
for target in (0.8, 0.9):
    print(f"# TARGET {target}\n{'p_max':<8}{'best config':<30}{'kill':>7}{'min':>9}{'Wh':>9}   {'best by energy':<30}{'Wh':>7}")
    for pm in (0.5, 0.7, 0.9, 1.0):
        best_t = best_e = None
        for pl in ("inline", "scout"):
            for v in (0.25, 0.5, 1.0, 1.5, 2.0, 3.0):
                for ov in (0.0, 0.25, 0.5, 0.75):
                    r = avg(pl, **speed_kw(pl, v, overlap=ov, p_max=pm))
                    if r["kill"] >= target:
                        c = f"{pl} v={v} ov={ov}"
                        if best_t is None or r["time_min"] < best_t[1]["time_min"]: best_t = (c, r)
                        if best_e is None or r["energy_wh"] < best_e[1]["energy_wh"]: best_e = (c, r)
        if best_t:
            print(f"{pm:<8}{best_t[0]:<30}{best_t[1]['kill']:>7.3f}{best_t[1]['time_min']:>9.1f}{best_t[1]['energy_wh']:>9.0f}   {best_e[0]:<30}{best_e[1]['energy_wh']:>7.0f}")
        else:
            print(f"{pm:<8}{'none reaches the target':<30}")

print(f"\n# Sweep 4: weed density (per m2), v=1.0, overlap 0, p_max 0.7\n{H}")
for d in (0.05, 0.15, 0.3, 0.6, 1.2):
    for pl in ("inline", "scout"):
        print(line(f"{pl} d={d}", avg(pl, field_kw=dict(density=d), **speed_kw(pl, 1.0))))

print(f"\n# Sweep 5: share of muddy blocks, v=1.0, overlap 0, p_max 0.7\n{H}")
for mud in (0.0, 0.2, 0.4, 0.6):
    for pl in ("inline", "scout"):
        print(line(f"{pl} mud={mud}", avg(pl, field_kw=dict(mud=mud), **speed_kw(pl, 1.0))))

print(f"\n# Sweep 6: false-positive rate (per m2), v=1.0, overlap 0, p_max 0.7\n{H}")
for fp in (0.0, 0.01, 0.05, 0.2):
    for pl in ("inline", "scout"):
        print(line(f"{pl} fp={fp}", avg(pl, **speed_kw(pl, 1.0, fp_rate=fp))))

print(f"\n# Sweep 7: blur constant V_BLUR (m/s; detection ~ exp(-v/V_BLUR)), inline, overlap 0, p_max 0.7\n{H}")
_vb = M.V_BLUR
for vb in (1.0, 2.0, 4.0, 8.0):
    M.V_BLUR = vb
    for v in (0.5, 1.0, 2.0):
        print(line(f"V_BLUR={vb} v={v}", avg("inline", **speed_kw("inline", v))))
M.V_BLUR = _vb
