"""Milestone 4: tack, then measure. How coarsely may a robot hang the sheet?

    python experiments/m4_tack_measure/run.py > experiments/m4_tack_measure/results.txt

Writes results.json beside this file. Fixed seed 4; about a minute on one CPU.
"""
import json
import math
import os
import platform
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import asbuilt as A  # noqa: E402
from buildbot_sheathing import budget as B  # noqa: E402
from buildbot_sheathing import tack as K  # noqa: E402

MM = 1e-3
IN = B.IN
T = 20000
BAND = A.Band()
FRAMING = {"2x (1.5 in)": None, "3x (2.5 in)": A.Band(face=2.5 * IN), "2 x 2x (3.0 in)": A.Band(face=3.0 * IN)}
STUDS = {"straight": {}, "low warp": dict(bow_mean=0.11 * IN, twist_mean=0.08 * IN)}
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__},
       "trials": T, "seed": 4,
       "fixed": "three reads per stud at 0.5 mm, edge line 0.5 mm, tool 0.9 mm, 1/8 in gap, 10D penetration"}


def kw(framing, studs, **extra):
    return dict(trials=T, band=BAND, joint_band=FRAMING[framing], **STUDS[studs], **extra)


def deg(r):
    return math.degrees(r)


print("# Milestone 4: tack, then measure (buildbot-sheathing)")
print(f"{out['fixed']}; {T} sheets a cell, seed 4")
print(f"top/bottom joint nail lever arm {K.TOP / MM:.0f} mm: 0.1 deg of hang moves it {math.radians(0.1) * K.TOP / MM:.2f} mm\n")

# A. hang budget, no re-hang
print("## A. Hang allowed for 95% clean sheets (1 sigma), tacked (no sway), no re-hang")
print("framing          studs     aim      clean@0  x_only_mm  theta_only_deg  top_mm")
out["A"] = []
for fr in FRAMING:
    for st in STUDS:
        for aim in ("nominal", "edge"):
            k = kw(fr, st, aim=aim)
            c0 = K.success(**k)
            lx = K.largest("s_x", hi=0.03, **k)
            lt = K.largest("s_theta", hi=math.radians(2.0), **k)
            row = {"framing": fr, "studs": st, "aim": aim, "clean0": round(c0, 4),
                   "s_x_mm": round(lx / MM, 3), "s_theta_deg": round(deg(lt), 4),
                   "top_mm": round(lt * K.TOP / MM, 3)}
            out["A"].append(row)
            print(f"{fr:16s} {st:9s} {aim:8s} {c0:7.4f}  {row['s_x_mm']:9.3f}  {row['s_theta_deg']:14.4f}  {row['top_mm']:6.3f}")
print()

# B. grid on the wide joint at the lower published warp
XS = [0, 1, 2, 4, 6]
TH = [0, 0.05, 0.1, 0.2, 0.3]
out["B"] = {}
for fr in ("2x (1.5 in)", "2 x 2x (3.0 in)"):
    print(f"## B. Clean sheets by hang, {fr}, low warp, edge aim, tacked, no re-hang")
    print("s_x_mm \\ s_theta_deg " + " ".join(f"{t:7.2f}" for t in TH))
    grid = []
    for x in XS:
        r = [round(K.success(**kw(fr, "low warp", s_x=x * MM, s_theta=math.radians(t))), 4) for t in TH]
        grid.append(r)
        print(f"{x:20d} " + " ".join(f"{v:7.4f}" for v in r))
    out["B"][fr] = {"s_x_mm": XS, "s_theta_deg": TH, "clean": grid}
    print()

# C. holding through the nailing: sway
SW = [0, 0.25, 0.5, 1, 2, 3, 4]
print("## C. Held sheet: per-nail sway after the edge is measured (perfect hang, edge aim)")
print("framing          studs     sway_allowed_95_mm  " + " ".join(f"{s:>6}" for s in SW))
out["C"] = []
for fr in FRAMING:
    for st in STUDS:
        k = kw(fr, st)
        ls = K.largest("s_sway", hi=0.02, **k)
        cs = [round(K.success(**{**k, "s_sway": s * MM}), 4) for s in SW]
        out["C"].append({"framing": fr, "studs": st, "sway_95_mm": round(ls / MM, 3), "sway_mm": SW, "clean": cs})
        print(f"{fr:16s} {st:9s} {ls / MM:18.3f}  " + " ".join(f"{v:6.3f}" for v in cs))
print()

# D. measure and re-hang
HANGS = [("1 mm, 0.1 deg", 1.0, 0.1), ("2 mm, 0.2 deg", 2.0, 0.2), ("3 mm, 0.3 deg", 3.0, 0.3)]
THR = [None, 1.0, 1.5, 2.0, 2.5]
CASES = [("2x (1.5 in)", "straight"), ("2x (1.5 in)", "low warp"), ("3x (2.5 in)", "low warp"),
         ("2 x 2x (3.0 in)", "low warp")]
print("## D. Tack, measure, re-hang while the narrowest predicted half-window < threshold (max 5 hangs)")
print("framing          studs     hang (sx, stheta)  threshold_mm  clean   missed  hangs")
out["D"] = []
for fr, st in CASES:
    for name, sx, sth in HANGS:
        for thr in THR:
            r = K.simulate(**kw(fr, st, s_x=sx * MM, s_theta=math.radians(sth),
                                accept_half=None if thr is None else thr * MM, max_hangs=5))
            row = {"framing": fr, "studs": st, "hang": name, "threshold_mm": thr,
                   **{k: round(v, 4) for k, v in r.items()}}
            out["D"].append(row)
            ts = "none" if thr is None else f"{thr:.1f}"
            print(f"{fr:16s} {st:9s} {name:17s}  {ts:>12s}  {r['clean']:.4f}  {r['missed']:6.3f}  {r['hangs']:5.2f}")
print()

# E. hypotheses
def find_a(fr, st, aim="edge"):
    return next(r for r in out["A"] if r["framing"] == fr and r["studs"] == st and r["aim"] == aim)


d10 = [r for r in out["D"] if r["framing"] == "2x (1.5 in)" and r["studs"] == "straight"
       and r["hang"] == "1 mm, 0.1 deg" and r["threshold_mm"] is not None]
best10 = max(d10, key=lambda r: r["clean"])
h10 = any(r["clean"] >= 0.95 and r["hangs"] <= 2 for r in d10)
a11 = find_a("2 x 2x (3.0 in)", "low warp")
h11 = a11["s_theta_deg"] >= 0.2 and a11["s_x_mm"] >= 4
c2 = next(r for r in out["C"] if r["framing"] == "2x (1.5 in)" and r["studs"] == "straight")
cw = next(r for r in out["C"] if r["framing"] == "2 x 2x (3.0 in)" and r["studs"] == "low warp")
h12 = c2["sway_95_mm"] < 0.5 and cw["sway_95_mm"] >= 2
out["hypotheses"] = {
    "H10": {"held": h10, "best": best10},
    "H11": {"held": h11, "s_theta_deg": a11["s_theta_deg"], "s_x_mm": a11["s_x_mm"]},
    "H12": {"held": h12, "sway_2x_straight_mm": c2["sway_95_mm"], "sway_2x2x_low_mm": cw["sway_95_mm"]},
}
print("## E. Pre-registered hypotheses (LOG.md, 2026-11-12)")
print(f"H10 {'held' if h10 else 'refuted'}: best on 2x straight, hang 1 mm / 0.1 deg: threshold {best10['threshold_mm']} mm, "
      f"clean {best10['clean']:.4f}, {best10['hangs']:.2f} hangs")
print(f"H11 {'held' if h11 else 'refuted'}: 2 x 2x low warp allows {a11['s_theta_deg']:.3f} deg and {a11['s_x_mm']:.2f} mm")
print(f"H12 {'held' if h12 else 'refuted'}: sway allowed {c2['sway_95_mm']:.3f} mm (2x straight), {cw['sway_95_mm']:.3f} mm (2 x 2x low warp)")

with open(os.path.join(HERE, "results.json"), "w") as f:
    json.dump(out, f, indent=1)
