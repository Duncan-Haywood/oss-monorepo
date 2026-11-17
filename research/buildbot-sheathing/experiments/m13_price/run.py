"""Milestone 13: what the single-2x remedies cost per clean sheet on measured studs, and whether the
doubled joint stud pays.

    python experiments/m13_price/run.py > experiments/m13_price/results.txt

Reads ../m12_remedies/results.json (clean sheets and missed nails of the single-2x cells),
../m11_measured/profiles.json and ../m6b_bowed_edge/results.json (for one new cell: doubled joints,
single read, on the measured studs); writes results.json beside this file. Hypotheses H57-H59 were
registered in LOG.md before this script was run. Milestone 7's 4,000 cost draws (seed 11); the
milestone-13 seconds are drawn with seed 29. About ten seconds on one CPU.
"""
import itertools
import json
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import cost as K  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import price as P  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN  # noqa: E402

T0 = time.time()
N, SEED = 4000, 11
VOLUMES = (100, 300, 1000)
M12 = json.load(open(os.path.join(HERE, "..", "m12_remedies", "results.json")))
D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
p = K.draw(N, SEED)
t = P.draw_times(N)
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "draws": N, "seed": SEED,
       "time_seed": 29}

ESTIMATES = ("three", "dense", "local")
PUSHES = ("no push", "mid push")
PLACES = ("ledger", "slide+shim 0.5 mm")


def pipelines(studs):
    """Every single-2x pipeline: (label, clean, missed, policy, hw, slide_shim, push)."""
    for est, push, place in itertools.product(ESTIMATES, PUSHES, PLACES):
        r = M12["A"][f"{studs}|{est}|{push}|{place}"]
        for hw in (("point",) if est == "three" else ("point", "line")):
            lab = f"{est:5s} {hw:5s} {'push' if push == 'mid push' else '-':4s} {'slide+shim' if place != 'ledger' else 'ledger':10s}"
            yield lab, r["clean"], r["missed"], est, hw, place != "ledger", push == "mid push"


# doubled joints, single read, ledger, on the measured studs (new cell; milestone 12 ran three/dense/local only)
DBL = {}
for studs, kind in (("measured", "smooth"), ("measured, common removed", "common removed")):
    prof = M.model_profiles(D["members"], kind, STUD_LEN)
    DBL[studs] = Q.clean(framing="2x2x", policy="single", rock_draw=ROCK, profiles=prof, warp="straight",
                         trials=20000, seed=7)
out["doubled"] = DBL
reads_dbl = {"n": C.reads_per_sheet("single"), "ledger": True}


def q(a):
    return np.percentile(a, [5, 50, 95])


print("# Milestone 13: what the single-2x remedies cost per clean sheet on measured studs (buildbot-sheathing)")
print(f"G1 on a drive-and-lift base (milestone 7), {N:,} cost draws (seed {SEED}); every missed nail found and "
      "re-driven; clean sheets and missed nails from milestone 12 (20,000 sheets, seed 7)")
print("seconds added (seed 29, unsourced, swept): mid push U(10, 40) s; slide and shim U(5, 30) s + 2 edge reads; "
      "line-laser sweep 3 x 2.353 m / v, v log-uniform 0.05-0.5 m/s; point reads t_read U(1, 3) s each "
      f"(three {P.stud_reads('three')}, dense {P.stud_reads('dense')}, local {P.stud_reads('local')} a sheet, + 2 edge)\n")

RES = {}
for studs in ("measured", "measured, common removed"):
    rows = []
    for lab, clean, missed, est, hw, ss, push in pipelines(studs):
        c = {v: P.pipeline_cost(p, t, v, missed, est, hw, ss, push) for v in VOLUMES}
        rows.append({"label": lab, "clean": clean, "missed": missed, "policy": est, "hw": hw, "slide_shim": ss,
                     "push": push, "cost": {v: c[v]["total"] for v in VOLUMES}, "seconds": c[100]["seconds"]})
    d = DBL[studs]
    cd = {v: K.robot_cost("base", p, v, d["missed"], reads_dbl, True) for v in VOLUMES}
    RES[studs] = {"rows": rows, "dbl": {"label": "2x2x  point -    ledger    ", "clean": d["clean"],
                                        "missed": d["missed"], "cost": {v: cd[v]["total"] for v in VOLUMES},
                                        "seconds": cd[100]["seconds"]}}

# ------------------------------------------------------------------ A. every pipeline
for studs in ("measured", "measured, common removed"):
    R = RES[studs]
    print(f"## A. {studs} studs: median $ per clean sheet [5%, 95% at 100 houses/yr], median seconds a sheet")
    print("pipeline (estimate hw push placement)   clean   missed  seconds |   $100 houses [5-95%]    $300   $1000 | cheapest share @100")
    allc = np.vstack([r["cost"][100] for r in R["rows"]] + [R["dbl"]["cost"][100]])
    win = allc.argmin(axis=0)
    out.setdefault("A", {})[studs] = []
    for i, r in enumerate(R["rows"] + [R["dbl"]]):
        a = q(r["cost"][100])
        share = float(np.mean(win == i))
        print(f"{r['label']:38s} {r['clean']:.4f}  {r['missed']:5.3f}  {np.median(r['seconds']):6.0f} | "
              f"{a[1]:6.2f} [{a[0]:5.2f}, {a[2]:6.2f}]  {np.median(r['cost'][300]):6.2f} "
              f"{np.median(r['cost'][1000]):6.2f} | {share:.3f}")
        out["A"][studs].append({"label": r["label"].split(), "clean": r["clean"], "missed": r["missed"],
                                "median_s": float(np.median(r["seconds"])),
                                "median_usd": {v: float(np.median(r["cost"][v])) for v in VOLUMES},
                                "q100": a.tolist(), "cheapest_share_100": share})
    print()

# ------------------------------------------------------------------ B. H57
print("## B. Hypotheses (registered in LOG.md before this run)")
out["B"] = {}
for studs in ("measured", "measured, common removed"):
    R = RES[studs]
    for v in VOLUMES:
        S = np.vstack([r["cost"][v] for r in R["rows"]])
        mins = S.min(axis=0)
        share = float(np.mean(mins < R["dbl"]["cost"][v]))
        out["B"].setdefault(studs, {})[v] = {"share_single_cheaper": share,
                                            "median_saving": float(np.median(R["dbl"]["cost"][v] - mins))}
s57 = out["B"]["measured"][100]["share_single_cheaper"]
h57 = s57 >= 0.90
print(f"H57: base, 100 houses/yr, measured studs: the per-draw cheapest single-2x pipeline beats doubled joints in "
      f"{s57:.4f} of draws (bar 0.90), median saving ${out['B']['measured'][100]['median_saving']:.2f} a sheet -> "
      f"{'held' if h57 else 'refuted'}")
for studs in ("measured", "measured, common removed"):
    print(f"     {studs}: share single 2x cheaper at 100/300/1000 houses = " +
          " / ".join(f"{out['B'][studs][v]['share_single_cheaper']:.3f}" for v in VOLUMES) +
          "; median saving $ " + " / ".join(f"{out['B'][studs][v]['median_saving']:.2f}" for v in VOLUMES))
out["H57"] = h57

# ------------------------------------------------------------------ C. H58
R = RES["measured"]
full = next(r for r in R["rows"] if r["policy"] == "local" and r["hw"] == "line" and r["push"] and r["slide_shim"])
med = {r["label"]: float(np.median(r["cost"][100])) for r in R["rows"]}
lowest = min(med, key=med.get)
S = np.vstack([r["cost"][100] for r in R["rows"]])
fi = R["rows"].index(full)
full_share = float(np.mean(S.argmin(axis=0) == fi))
h58 = med[full["label"]] > med[lowest]
print(f"H58: full stack (local, line laser, push, slide+shim; clean {full['clean']:.4f}) median ${med[full['label']]:.2f} "
      f"a clean sheet vs the lowest-median single-2x pipeline [{' '.join(lowest.split())}] ${med[lowest]:.2f}; "
      f"full stack cheapest in {full_share:.3f} of draws -> {'held' if h58 else 'refuted'} (held if it costs more)")
out["H58"] = {"held": h58, "full_median": med[full["label"]], "lowest": lowest.split(), "lowest_median": med[lowest],
              "full_cheapest_share": full_share,
              "median_full_minus_per_draw_min": float(np.median(full["cost"][100] - S.min(axis=0)))}

# ------------------------------------------------------------------ D. H59
out["H59"] = {}
for studs in ("measured", "measured, common removed"):
    R = RES[studs]
    S = np.vstack([r["cost"][100] for r in R["rows"]])
    i = S.argmin(axis=0)
    ms = np.array([r["missed"] for r in R["rows"]])[i]
    be = P.breakeven_per_nail(R["dbl"]["cost"][100], S.min(axis=0), ms, R["dbl"]["missed"])
    qb = q(be)
    out["H59"][studs] = {"q": qb.tolist(), "minutes": float(qb[1] / (np.median(K.loaded(p)) / 60)),
                         "missed_chosen_median": float(np.median(ms))}
qb = out["H59"]["measured"]["q"]
h59 = qb[1] < 5.00
print(f"H59: extra cost a missed nail must carry, beyond its re-drive, for doubled joints to tie the per-draw "
      f"cheapest single-2x pipeline: median ${qb[1]:.2f} [5-95%: {qb[0]:.2f}, {qb[2]:.2f}] "
      f"({out['H59']['measured']['minutes']:.1f} loaded person-minutes; bar below $5.00; milestone 7 $6.51) -> "
      f"{'held' if h59 else 'refuted'}")
qc = out["H59"]["measured, common removed"]["q"]
print(f"     common part removed: median ${qc[1]:.2f} [{qc[0]:.2f}, {qc[2]:.2f}]; missed nails of the chosen pipeline, "
      f"median {out['H59']['measured']['missed_chosen_median']:.3f} (measured)")
out["H59"]["held"] = h59
print()

# ------------------------------------------------------------------ E. price of first-pass quality
print("## E. The price of first-pass quality (measured studs, 100 houses/yr): the lowest-median pipeline "
      "reaching each clean-sheet level")
R = RES["measured"]
out["E"] = []
for level in (0.40, 0.50, 0.60, 0.65, 0.70, 0.75, 0.99):
    cand = [r for r in R["rows"] + [R["dbl"]] if r["clean"] >= level]
    b = min(cand, key=lambda r: np.median(r["cost"][100]))
    m = float(np.median(b["cost"][100]))
    print(f"  clean >= {level:.2f}: {' '.join(b['label'].split()):34s} clean {b['clean']:.4f}  ${m:.2f}  "
          f"{np.median(b['seconds']):.0f} s")
    out["E"].append({"level": level, "pipeline": b["label"].split(), "clean": b["clean"], "median_usd": m,
                     "median_s": float(np.median(b["seconds"]))})
print()

# ------------------------------------------------------------------ F. how fast must the line laser be
print("## F. Line-laser speed at which per-nail reads tie three point reads (measured, ledger, no push, "
      "median draw of the cost difference, 100 houses/yr)")
R = RES["measured"]
three = next(r for r in R["rows"] if r["policy"] == "three" and not r["push"] and not r["slide_shim"])
loc = next(r for r in R["rows"] if r["policy"] == "local" and r["hw"] == "line" and not r["push"] and not r["slide_shim"])
locp = next(r for r in R["rows"] if r["policy"] == "local" and r["hw"] == "point" and not r["push"] and not r["slide_shim"])
vs = np.exp(np.linspace(np.log(0.01), np.log(1.0), 201))
diffs = []
for v in vs:
    tv = {**t, "v": np.full(N, v)}
    c = P.pipeline_cost(p, tv, 100, loc["missed"], "local", "line", False, False)["total"]
    diffs.append(float(np.median(c - three["cost"][100])))
diffs = np.array(diffs)
cross = next((float(v) for v, d in zip(vs, diffs) if d < 0), None)
print(f"  local by line laser beats three point reads in the median draw above v = "
      f"{cross if cross is None else round(cross, 4)} m/s (searched 0.01-1 m/s); "
      f"at 0.25 m/s the median difference is ${float(np.interp(np.log(0.25), np.log(vs), diffs)):+.3f}")
print(f"  local by point reads ({P.stud_reads('local')} + 2 a sheet) vs three point reads: median "
      f"${float(np.median(locp['cost'][100] - three['cost'][100])):+.3f} a clean sheet, "
      f"{float(np.median(locp['seconds'] - three['seconds'])):+.0f} s")
out["F"] = {"cross_v": cross, "v": vs.tolist(), "median_diff": diffs.tolist(),
            "local_point_minus_three": float(np.median(locp["cost"][100] - three["cost"][100]))}
print()

# ------------------------------------------------------------------ G. where a sheet's dollars go
print("## G. Where the dollars go (measured, 100 houses/yr, median shares): ownership, people (supervision + carry), stud")
out["G"] = {}
for r in (three, full, RES["measured"]["dbl"]):
    if r is RES["measured"]["dbl"]:
        c = K.robot_cost("base", p, 100, r["missed"], reads_dbl, True)
    else:
        c = P.pipeline_cost(p, t, 100, r["missed"], r["policy"], r["hw"], r["slide_shim"], r["push"])
    sh = {k: float(np.median(c[k] / c["total"])) for k in ("own", "people", "stud")}
    out["G"][" ".join(r["label"].split())] = sh
    print(f"  {' '.join(r['label'].split()):34s} own {sh['own']:.0%}  people {sh['people']:.0%}  stud {sh['stud']:.0%}")

out["wall_s"] = time.time() - T0
print(f"\nwall time {out['wall_s']:.0f} s")
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
