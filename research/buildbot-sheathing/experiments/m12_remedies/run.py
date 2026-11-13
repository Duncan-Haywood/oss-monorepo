"""Milestone 12: do the single-2x remedies (a mid push, per-nail reads, a slide and a shim) survive
measured studs?

    python experiments/m12_remedies/run.py > experiments/m12_remedies/results.txt

Reads ../m11_measured/profiles.json (the scanned studs, committed) and ../m6b_bowed_edge/results.json
(the smooth-bow seats); writes results.json beside this file. Hypotheses H53-H56 were registered in
LOG.md before this script was run. About a minute on one CPU.
"""
import itertools
import json
import math
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import straighten as S  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN, U_JOINT  # noqa: E402

T0 = time.time()
MM = 1e-3
N = 20000
D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
MID = S.Straightener("mid", U_JOINT, "pinned", 0.5e-3)
STUDS = {"measured": M.model_profiles(D["members"], "smooth", STUD_LEN),
         "measured, common removed": M.model_profiles(D["members"], "common removed", STUD_LEN),
         "own parabola": M.model_profiles(D["members"], "parabola", STUD_LEN),
         "straight": None}
ESTIMATES = ("three", "dense", "local")
PUSH = {"no push": None, "mid push": MID}
PLACE = {"ledger": {}, "slide+shim 0.5 mm": dict(slide=0.5 * MM, shim=0.5 * MM)}
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "trials": N, "seed": 7}


def cell(framing, studs, est, push, place, **kw):
    prof = STUDS[studs]
    return Q.clean(framing=framing, policy=est, rock_draw=ROCK, straighten=PUSH[push], profiles=prof,
                   warp="straight", trials=N, seed=7, **PLACE[place], **kw)


print("# Milestone 12: the single-2x remedies on measured studs (buildbot-sheathing)")
print(f"ledger pipeline (milestone 11), smooth-rock Drake seats, tool {C.S_ROBOT / MM:.1f} mm, stud reads "
      f"{Q.S_READ / MM:.1f} mm, edge reads {Q.S_EDGE / MM:.1f} mm, slide {Q.S_X / MM:.1f} mm, edge aim; "
      f"{N:,} sheets, seed 7; measured = the six scanned studs of Adel et al. (2024), 110 mm running mean, "
      "random flips, scaled to the 2353 mm stud by length squared\n")

# ------------------------------------------------------------------ A. the grid
print("## A. Single 2x: clean sheets [95% Wilson], missed nails a sheet")
print("studs                      estimate  push      placement            clean   [95%]            missed")
rows = {}
for studs, est, push, place in itertools.product(STUDS, ESTIMATES, PUSH, PLACE):
    r = cell("2x", studs, est, push, place)
    lo, hi = C.wilson(r["clean"], N)
    rows[f"{studs}|{est}|{push}|{place}"] = {**r, "lo": lo, "hi": hi}
    print(f"{studs:26s} {est:9s} {push:9s} {place:20s} {r['clean']:.4f} [{lo:.4f}, {hi:.4f}]  {r['missed']:.3f}")
out["A"] = rows


def v(studs, est, push="no push", place="ledger"):
    return rows[f"{studs}|{est}|{push}|{place}"]["clean"]


print(f"\ncheck: milestone 11 gave 0.4253 (measured), 0.4707 (common removed), 0.5792 (own parabola) for "
      f"three reads, no push, ledger; here {v('measured', 'three'):.4f}, {v('measured, common removed', 'three'):.4f}, "
      f"{v('own parabola', 'three'):.4f}\n")

# ------------------------------------------------------------------ B. hypotheses
print("## B. Hypotheses (registered in LOG.md before this run)")
m3, p3, ml = v("measured", "three"), v("own parabola", "three"), v("measured", "local")
bar53 = m3 + (p3 - m3) / 2
h53 = ml >= bar53
print(f"H53: local reads on measured studs {ml:.4f}; three-read measured {m3:.4f}, own parabola {p3:.4f}; "
      f"bar (half the gap) {bar53:.4f} -> {'held' if h53 else 'refuted'}")
mp = v("measured", "three", "mid push")
h54 = mp - m3 >= 0.10
print(f"H54: mid push, three reads, ledger: {m3:.4f} -> {mp:.4f} ({(mp - m3) * 100:+.1f} points; bar +10) -> "
      f"{'held' if h54 else 'refuted'}")
best_key = max((k for k in rows if k.startswith("measured|") and k.endswith("slide+shim 0.5 mm")),
               key=lambda k: rows[k]["clean"])
best = rows[best_key]["clean"]
h55 = best >= 0.90
print(f"H55: best measured single-2x cell with slide+shim: {best_key.split('|')[1:3]} {best:.4f} (bar 0.90) -> "
      f"{'held' if h55 else 'refuted'}")
out["B"] = {"H53": h53, "bar53": bar53, "H54": h54, "H54_gain": mp - m3, "H55": h55, "best": best_key,
            "best_clean": best}

# ------------------------------------------------------------------ C. doubled joints
print("\n## C. Doubled joints (2x2x) on measured studs, no push")
dbl = {}
for est, place in itertools.product(ESTIMATES, PLACE):
    r = cell("2x2x", "measured", est, "no push", place)
    dbl[f"{est}|{place}"] = r
    print(f"{est:6s} {place:20s} clean {r['clean']:.4f}, missed {r['missed']:.3f}")
h56 = min(r["clean"] for r in dbl.values()) >= 0.99
print(f"H56: every doubled cell >= 0.99 -> {'held' if h56 else 'refuted'}\n")
out["C"] = {"rows": dbl, "H56": h56}

# ------------------------------------------------------------------ D. decomposition (reported, not scored)
print("## D. Where the measured-stud loss sits (ledger, no push; points of clean sheets)")
dec = {}
for est in ESTIMATES:
    st, pa, me, cr = (v(s, est) for s in ("straight", "own parabola", "measured", "measured, common removed"))
    dec[est] = {"straight": st, "parabola": pa, "measured": me, "common_removed": cr}
    print(f"{est:6s} straight {st:.4f}  own parabola {pa:.4f}  measured {me:.4f}  common removed {cr:.4f}  "
          f"(bow costs {100 * (st - pa):.1f}, waviness {100 * (pa - me):.1f})")
out["D"] = dec

# ------------------------------------------------------------------ E. tool scatter for 95% (reported, not scored)
print("\n## E. Largest tool scatter (1 sigma) that still gives 95% clean, slide+shim 0.5 mm (bisection, 12 steps)")


def need(studs, est, push, target=0.95):
    f = lambda s: cell("2x", studs, est, push, "slide+shim 0.5 mm", s_robot=s)["clean"]  # noqa: E731
    if f(1e-9) < target:
        return 0.0
    lo_, hi_ = 0.0, 2.0 * MM
    for _ in range(12):
        mid = (lo_ + hi_) / 2
        lo_, hi_ = (mid, hi_) if f(mid) >= target else (lo_, mid)
    return lo_


need_rows = []
for studs, est, push in [("straight", "three", "no push"), ("measured", "three", "mid push"),
                         ("measured", "local", "no push"), ("measured", "local", "mid push"),
                         ("measured, common removed", "local", "mid push")]:
    s = need(studs, est, push)
    need_rows.append({"studs": studs, "estimate": est, "push": push, "s_robot_mm": s / MM})
    print(f"{studs:26s} {est:6s} {push:9s} {s / MM:.3f} mm" + ("  (not reachable with a perfect tool)" if s == 0 else ""))
out["E"] = need_rows

# ------------------------------------------------------------------ F. the push on the measured studs
print("\n## F. The mid push each measured stud needs (offset of mid-height from its chord, pinned ends)")
g, Dm, _ = STUDS["measured"]
Dm = Dm - (Dm[:, :1] + (Dm[:, -1:] - Dm[:, :1]) * g[None, :])     # about the chord through the ends
mid = np.array([np.interp(0.5, g, d) for d in Dm])
E = np.mean(list(S.E_STUD_PSI.values())) * S.PSI
F = S.force(S.mid_coeff("pinned"), E, mid)
left = Dm - mid[:, None] * S.shape(g)[None, :]
print("stud | mid offset mm | force N (E = mean of the four species) | RMS about the end chord mm before -> after push")
for i in range(len(mid)):
    print(f"{i + 1} | {mid[i] / MM:6.2f} | {F[i]:6.1f} | {np.sqrt((Dm[i] ** 2).mean()) / MM:.2f} -> "
          f"{np.sqrt((left[i] ** 2).mean()) / MM:.2f}")
out["F"] = {"mid_mm": (mid / MM).tolist(), "force_N": F.tolist(),
            "rms_before_mm": (np.sqrt((Dm ** 2).mean(axis=1)) / MM).tolist(),
            "rms_after_mm": (np.sqrt((left ** 2).mean(axis=1)) / MM).tolist()}

out["seconds"] = time.time() - T0
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
print(f"\nwall time {out['seconds']:.0f} s")
