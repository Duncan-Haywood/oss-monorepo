"""Milestone 7: dollars per clean sheet, by robot class and house volume.

    python experiments/m7_cost/run.py > experiments/m7_cost/results.txt

Reads ../m5_cycle/results.json (missed nails per pipeline); writes results.json beside this file.
4,000 draws, seed 11; a few seconds.
"""
import itertools
import json
import os
import platform
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import cost as K  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402

N, SEED = 4000, 11
M5 = json.load(open(os.path.join(HERE, "..", "m5_cycle", "results.json")))
MISSED = {(a["framing"], a["placement"], a["warp"], a["policy"]): (a["missed"], a["clean"])
          for a in M5["A"] if a["recoil"] == "none"}
LEDGER, LIFT = "ledger, s_x 1 mm", "lift-tack 0.25 deg / 5 mm"
PLACEMENTS = {"h1": (LEDGER,), "base": (LEDGER, LIFT), "gantry": (LEDGER,)}
POLICIES = ("single", "three")
FRAMINGS = ("2x", "2x2x")
p = K.draw(N, SEED)
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "draws": N, "seed": SEED}


def pipelines(cls, framing=None, policy=None, warp="low"):
    for fr, pl, po in itertools.product(FRAMINGS, PLACEMENTS[cls], POLICIES):
        if (framing and fr != framing) or (policy and po != policy):
            continue
        missed, clean = MISSED[(fr, pl, warp, po)]
        reads = {"n": C.reads_per_sheet(po), "ledger": pl == LEDGER}
        yield (fr, pl, po), missed, clean, reads


def best(cls, volume, framing=None, policy=None, warp="low"):
    """Per draw, the cheapest pipeline of a class; returns cost array and the index of the choice."""
    rows, keys = [], []
    for key, missed, clean, reads in pipelines(cls, framing, policy, warp):
        rows.append(K.robot_cost(cls, p, volume, missed, reads, key[0] == "2x2x")["total"])
        keys.append(key)
    rows = np.array(rows)
    return rows.min(axis=0), [keys[i] for i in rows.argmin(axis=0)]


def q(a):
    return np.percentile(a, [5, 50, 95])


hand = K.hand_cost(p)
print("# Milestone 7: dollars per clean sheet, by robot class and house volume (buildbot-sheathing)")
print(f"{N} draws, seed {SEED}, common random numbers across classes; low published warp; missed nails from m5_cycle")
print(f"hand crew: {sum(K.HAND_MIN.values()):.1f} person-minutes a sheet at the taskbook mid, x1/3 to x3 swept; "
      f"loaded wage ${K.WAGE:.2f} x 1.0-1.6\n")
qh = q(hand)
print(f"hand crew $/sheet: median {qh[1]:.2f} [5-95%: {qh[0]:.2f}, {qh[2]:.2f}]")
qs = q(K.stud_cost(p))
print(f"extra joint stud (lumber + framer time) $/sheet: median {qs[1]:.2f} [{qs[0]:.2f}, {qs[2]:.2f}]\n")
out["hand"] = dict(zip(("p5", "median", "p95"), qh.tolist()))
out["stud"] = dict(zip(("p5", "median", "p95"), qs.tolist()))

# A. $/clean sheet by class and volume, best pipeline per draw
print("## A. Dollars per clean sheet, best pipeline per draw: median [5%, 95%]")
print(f"{'class':7s} " + " ".join(f"{str(v) + ' houses/yr':>25s}" for v in K.VOLUMES))
A, CHOICE = {}, {}
for cls in K.ROBOTS:
    cells = []
    for v in K.VOLUMES:
        c, ch = best(cls, v)
        A[(cls, v)], CHOICE[(cls, v)] = c, ch
        a = q(c)
        cells.append(f"{a[1]:7.2f} [{a[0]:6.2f},{a[2]:7.2f}]")
    print(f"{cls:7s} " + " ".join(f"{x:>25s}" for x in cells))
print(f"{'hand':7s} " + " ".join(f"{f'{qh[1]:7.2f} [{qh[0]:6.2f},{qh[2]:7.2f}]':>25s}" for _ in K.VOLUMES))
out["A"] = [{"class": k[0], "volume": k[1], **dict(zip(("p5", "median", "p95"), q(c).tolist()))} for k, c in A.items()]
print()

print("pipeline chosen (share of draws) at 100 houses a year:")
for cls in K.ROBOTS:
    ch = CHOICE[(cls, 100)]
    shares = {k: ch.count(k) / N for k in sorted(set(ch))}
    print(f"  {cls:7s} " + "; ".join(f"{'/'.join(k)} {v:.3f}" for k, v in shares.items()))
    out.setdefault("choice100", {})[cls] = {"/".join(k): v for k, v in shares.items()}
print()

print("cheapest class (share of draws):")
print(f"{'volume':>7s} " + " ".join(f"{c:>8s}" for c in K.CLASSES))
out["cheapest"] = {}
for v in K.VOLUMES:
    stack = np.vstack([hand] + [A[(c, v)] for c in K.ROBOTS])
    w = stack.argmin(axis=0)
    sh = [float(np.mean(w == i)) for i in range(4)]
    out["cheapest"][v] = dict(zip(K.CLASSES, sh))
    print(f"{v:7d} " + " ".join(f"{s:8.3f}" for s in sh))
print()

# H28: base beats walking H1 at every volume and with either policy forced
worst = 1.0
for v, po in itertools.product(K.VOLUMES, POLICIES):
    b, _ = best("base", v, policy=po)
    h, _ = best("h1", v, policy=po)
    worst = min(worst, float(np.mean(b < h)))
print(f"H28: share of draws the base beats the walking H1, worst over volume and forced policy = {worst:.4f} -> "
      f"{'held' if worst >= 0.95 else 'refuted'} (refuted below 0.95)")
out["H28"] = worst

# H29: gantry vs base crossing in the median draw (median of the difference)
diff = {v: float(np.median(A[("gantry", v)] - A[("base", v)])) for v in K.VOLUMES}
fine = np.unique(np.round(np.logspace(1, 3, 61)).astype(int))
dfine = []
for v in fine:
    g, _ = best("gantry", v)
    b, _ = best("base", v)
    dfine.append(float(np.median(g - b)))
cross = next((int(v) for v, d in zip(fine, dfine) if d < 0), None)
print("H29: median (gantry - base) $/sheet by volume: " + ", ".join(f"{v}: {d:+.2f}" for v, d in diff.items()))
h29 = cross is not None and dfine[0] > 0 and 30 <= cross <= 300
print(f"     first volume (of {len(fine)} log-spaced, 10-1000) with the median below zero: {cross} -> "
      f"{'held' if h29 else 'refuted'} (refuted if no crossing or outside 30-300)")
out["H29"] = {"median_diff": diff, "cross": cross, "fine": dict(zip(fine.tolist(), dfine))}
# per-draw break-even volume: smallest fine volume at which gantry < base
per = np.full(N, np.inf)
for v in fine[::-1]:
    g, _ = best("gantry", v)
    b, _ = best("base", v)
    per = np.where(g < b, v, per)
fin = per[np.isfinite(per)]
print(f"     per-draw crossing: {len(fin) / N:.3f} of draws cross inside 10-1000; "
      f"of those 5/50/95% at {np.percentile(fin, 5):.0f} / {np.percentile(fin, 50):.0f} / {np.percentile(fin, 95):.0f} houses")
out["H29"]["per_draw"] = {"share": len(fin) / N, "q": np.percentile(fin, [5, 50, 95]).tolist()}

# H30: doubled joints pay, by class at 100 houses a year
print("H30: share of draws best two-2x beats best single-2x at 100 houses/yr (stud charged):")
h30 = {}
for cls in K.ROBOTS:
    d2, _ = best(cls, 100, framing="2x2x")
    s2, _ = best(cls, 100, framing="2x")
    h30[cls] = float(np.mean(d2 < s2))
    m = float(np.median(s2 - d2))
    print(f"     {cls:7s} {h30[cls]:.3f} (median saving ${m:+.2f} a sheet) -> {'held' if h30[cls] >= 0.9 else 'refuted'}")
out["H30"] = h30

# H31
mh = float(np.median(hand))
r31 = {"h1@100": float(np.median(A[("h1", 100)])), "base@100": float(np.median(A[("base", 100)])),
       "gantry@300": float(np.median(A[("gantry", 300)])), "gantry@30": float(np.median(A[("gantry", 30)]))}
ok = r31["h1@100"] > mh and r31["base@100"] > mh and r31["gantry@300"] < mh and r31["gantry@30"] > mh
# also paired: share of draws each beats hand
pair = {f"{c}@{v}": float(np.mean(A[(c, v)] < hand)) for c in K.ROBOTS for v in K.VOLUMES}
print(f"H31: hand median {mh:.2f}; h1@100 {r31['h1@100']:.2f}, base@100 {r31['base@100']:.2f}, "
      f"gantry@300 {r31['gantry@300']:.2f}, gantry@30 {r31['gantry@30']:.2f} -> {'held' if ok else 'refuted'}")
print("     share of draws cheaper than the hand crew: " +
      "; ".join(f"{c} " + "/".join(f"{pair[f'{c}@{v}']:.2f}" for v in K.VOLUMES) for c in K.ROBOTS) +
      f"  (volumes {'/'.join(map(str, K.VOLUMES))})")
out["H31"] = {**r31, "hand_median": mh, "held": ok, "share_cheaper_than_hand": pair}
print()

# B. where the base's dollars go, 100 houses a year, best two-2x single read ledger
print("## B. Where the dollars go at 100 houses a year (two 2x, ledger, single read): median share of the sheet")
missed, _ = MISSED[("2x2x", LEDGER, "low", "single")]
reads = {"n": C.reads_per_sheet("single"), "ledger": True}
out["B"] = {}
for cls in K.ROBOTS:
    r = K.robot_cost(cls, p, 100, missed, reads, True)
    parts = {k: float(np.median(r[k] / r["total"])) for k in ("own", "people", "stud")}
    out["B"][cls] = {**parts, "median_total": float(np.median(r["total"])),
                     "median_seconds": float(np.median(r["seconds"]))}
    print(f"  {cls:7s} total median ${np.median(r['total']):6.2f}, {np.median(r['seconds']):5.0f} s; "
          f"ownership {parts['own']:.0%}, people {parts['people']:.0%}, extra stud {parts['stud']:.0%}")
print()

# C. sensitivity of base cost at 100 houses/yr: Spearman rank correlation
def rank(a):
    r = np.empty(len(a))
    r[np.argsort(a)] = np.arange(len(a))
    return r


print("## C. What moves the base's cost at 100 houses a year (Spearman rank correlation with $/sheet)")
c100 = A[("base", 100)]
names = ["supervision", "burden", "hand_mult", "site_life_y", "site_upkeep", "interest", "g1_usd", "base_usd",
         "u_nail", "t_place", "t_ledger", "t_read", "t_fix", "stud_usd", "t_frame"]
rho = {k: float(np.corrcoef(rank(p[k]), rank(c100))[0, 1]) for k in names}
for k, v in sorted(rho.items(), key=lambda kv: -abs(kv[1]))[:8]:
    print(f"  {k:12s} {v:+.2f}")
out["C"] = rho
print()

# D. higher warp check, medians at 100 houses/yr
print("## D. Higher published warp (check, unscored): median $/sheet at 100 and 1000 houses a year")
out["D"] = {}
for cls in K.ROBOTS:
    m100, _ = best(cls, 100, warp="high")
    m1000, _ = best(cls, 1000, warp="high")
    out["D"][cls] = [float(np.median(m100)), float(np.median(m1000))]
    print(f"  {cls:7s} {np.median(m100):7.2f} {np.median(m1000):7.2f}")

# E. what a missed nail must cost for doubled joints to pay (base, 100 houses/yr)
m2, _ = MISSED[("2x", LEDGER, "low", "three")]
m22, _ = MISSED[("2x2x", LEDGER, "low", "single")]
d2, _ = best("base", 100, framing="2x2x")
s2, _ = best("base", 100, framing="2x")
gap = d2 - s2                      # $ a sheet doubled framing still costs more
extra = gap / (m2 - m22)           # extra $ per missed nail (on top of the re-drive charged) to break even
qe = q(extra)
print(f"\n## E. Break-even: extra cost of a missed nail for doubled joints to pay (base, 100 houses/yr)")
print(f"  single 2x (three reads) misses {m2:.2f} nails a sheet, two 2x (single read) {m22:.2f}")
print(f"  a missed nail would have to cost ${qe[1]:.2f} more than its re-drive [5-95%: {qe[0]:.2f}, {qe[2]:.2f}] "
      f"(median {qe[1] / (np.median(K.loaded(p)) / 60):.1f} loaded person-minutes)")
out["E"] = {"missed_2x": m2, "missed_2x2x": m22, "extra_per_nail": qe.tolist()}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=str)
