"""Milestone 6b: is the bowed-edge rock a property of the sheet, or of three feet?

    python experiments/m6b_bowed_edge/run.py > experiments/m6b_bowed_edge/results.txt

Needs ``pip install drake mujoco numpy`` (checked with Drake 1.51.1, MuJoCo 4.0.1). Writes
results.json beside this file. Four worker processes; about ten minutes on four CPUs.
Hypotheses H37-H40 were written in LOG.md before this was run.
"""
import itertools
import json
import math
import os
import platform
import sys
import time
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
from buildbot_sheathing import bowed_edge as B  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import drake_seat as DS  # noqa: E402
from buildbot_sheathing import ledger as L  # noqa: E402

D = math.radians
deg = math.degrees
IN = L.IN


def _seat(kw):
    kw = dict(kw)
    sim = kw.pop("sim")
    prof = kw.pop("profile", None)
    if prof is not None:
        kw["edge"] = B.profile(**prof)
    r = (L.seat if sim == "mujoco" else DS.seat)(**kw)
    return float(r["theta"])


def run(pool, cells):
    """cells: list of seat kwargs without ``sim``. Returns (drake, mujoco) tilts in degrees."""
    args = [dict(c, sim=s) for s in ("drake", "mujoco") for c in cells]
    out = pool.map(_seat, args, chunksize=4)
    n = len(cells)
    return [deg(x) for x in out[:n]], [deg(x) for x in out[n:]]


def main():
    import drake
    import mujoco
    t0 = time.time()
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": mujoco.__version__, "drake": getattr(drake, "__version__", None)},
           "constants": {"R_parabola_m": B.radius(), "h0_m": B.h0(), "r_bar_mid_m": B.r_bar_mid(),
                         "three_foot_rock_deg": deg(B.three_foot_rock()),
                         "corner_reach_deg": deg(4 * L.STRAIGHT / L.W)}}
    print("# Milestone 6b: the bowed bottom edge as a curve (Drake SAP [MuJoCo])\n")
    print(f"parabolic 1/16 in bow: R = {B.radius():.1f} m at mid-width, h0 = {B.h0():.3f} m, "
          f"r_bar from mid-width = {B.r_bar_mid():.3f} m; three-foot rock 2s/W = "
          f"{deg(B.three_foot_rock()):.4f} deg\n")
    pool = Pool(4)

    # A. H37: smooth bow, the stick band
    print("## A. Parabolic bow (p = 2, n = 49): seated tilt against the stick band theta_s")
    print("s_in    theta0  mu   F_n | band_deg  drake_deg  mujoco_deg")
    A = [dict(s=s, th=th, mu=mu, fn=fn) for s in (1 / 32, 1 / 16) for th in (1.0, -1.0, 0.25, -0.25)
         for mu in (0.3, 0.5) for fn in (5.0, 20.0, 50.0)]
    cells = [dict(theta0=D(a["th"]), mu=a["mu"], f_n=a["fn"], profile=dict(p=2.0, s=a["s"] * IN, n=49))
             for a in A]
    dA, mA = run(pool, cells)
    out["A"] = []
    ok37 = []
    for a, d, m in zip(A, dA, mA):
        band = deg(B.stick_band(a["mu"], a["fn"], a["s"] * IN))
        ok = abs(d) <= band + 0.005 and abs(m) <= band + 0.005
        ok37.append(ok)
        out["A"].append({**a, "band_deg": band, "drake_deg": d, "mujoco_deg": m, "within": ok})
        print(f"{a['s']:.4f}  {a['th']:+5.2f}  {a['mu']:.1f}  {a['fn']:4.0f} | {band:8.4f}  {d:+9.4f}  "
              f"{m:+10.4f}{'' if ok else '  OUTSIDE'}")
    print()

    # B. H38: a kink (tent) and the three-foot model at a light press
    print("## B. A kink at mid-width (tent, p = 1, n = 49) and the three-foot model; s = 1/16 in, F_n 5 N")
    print("theta0  mu  | tent drake  tent mujoco | three-foot drake  three-foot mujoco   (2s/W = "
          f"{deg(B.three_foot_rock()):.4f})")
    Bc = [dict(th=th, mu=mu) for th in (1.0, -1.0, 0.25, -0.25) for mu in (0.3, 0.5)]
    tent = [dict(theta0=D(b["th"]), mu=b["mu"], f_n=5.0, profile=dict(p=1.0, n=49)) for b in Bc]
    three = [dict(theta0=D(b["th"]), mu=b["mu"], f_n=5.0, sag=L.STRAIGHT) for b in Bc]
    dT, mT = run(pool, tent)
    d3, m3 = run(pool, three)
    out["B"] = []
    rock = deg(B.three_foot_rock())
    ok38 = []
    for b, a1, a2, a3, a4 in zip(Bc, dT, mT, d3, m3):
        ok = abs(a1) >= 0.8 * rock and abs(a2) >= 0.8 * rock
        ok38.append(ok)
        out["B"].append({**b, "tent_drake": a1, "tent_mujoco": a2, "three_drake": a3, "three_mujoco": a4})
        print(f"{b['th']:+5.2f}  {b['mu']:.1f} | {a1:+10.4f}  {a2:+11.4f} | {a3:+16.4f}  {a4:+17.4f}")
    print()

    # C. H39: discretisation
    print("## C. Parabolic bow, number of feet (mu 0.4)")
    print("theta0   F_n | n=25 drake [mujoco]   n=49   n=97 | max change 25->97 drake, mujoco")
    Cc = [dict(th=th, fn=fn) for th in (1.0, -1.0, 0.25, -0.25) for fn in (5.0, 20.0, 50.0)]
    res = {}
    for n in (25, 49, 97):
        res[n] = run(pool, [dict(theta0=D(c["th"]), mu=0.4, f_n=c["fn"], profile=dict(p=2.0, n=n)) for c in Cc])
    out["C"] = []
    worst39 = 0.0
    for i, c in enumerate(Cc):
        row = {n: (res[n][0][i], res[n][1][i]) for n in res}
        ch = (abs(row[97][0] - row[25][0]), abs(row[97][1] - row[25][1]))
        worst39 = max(worst39, *ch)
        out["C"].append({**c, **{f"n{n}": row[n] for n in row}, "change": ch})
        print(f"{c['th']:+5.2f}  {c['fn']:4.0f} | " + "  ".join(f"{row[n][0]:+.4f} [{row[n][1]:+.4f}]" for n in res)
              + f" | {ch[0]:.4f}, {ch[1]:.4f}")
    print()

    # D. shape exponent
    print("## D. Edge shape z = -s (1 - |2y/W|^p), s = 1/16 in, n = 49, mu 0.4, theta0 +1 deg")
    print("p    F_n | drake_deg  mujoco_deg")
    Dc = [dict(p=p, fn=fn) for p in (1.0, 1.5, 2.0, 4.0) for fn in (5.0, 50.0)]
    dD, mD = run(pool, [dict(theta0=D(1.0), mu=0.4, f_n=c["fn"], profile=dict(p=c["p"], n=49)) for c in Dc])
    out["D"] = []
    for c, a1, a2 in zip(Dc, dD, mD):
        out["D"].append({**c, "drake_deg": a1, "mujoco_deg": a2})
        print(f"{c['p']:.1f}  {c['fn']:4.0f} | {a1:+9.4f}  {a2:+10.4f}")
    print()

    # E. a bump (grit on the ledger, or a burr) under a straight edge
    print("## E. A 1 mm bump under a straight edge at a random point (n = 49 + 1), mu 0.4, F_n 20 N")
    rng = np.random.default_rng(5)
    yb = rng.uniform(-0.45, 0.45, 20) * L.W
    tb = rng.uniform(-1, 1, 20)
    dE, mE = run(pool, [dict(theta0=D(t), mu=0.4, f_n=20.0, profile=dict(bump=(float(y), 1e-3), n=49))
                        for y, t in zip(yb, tb)])
    out["E"] = [{"y": float(y), "theta0": float(t), "drake_deg": a, "mujoco_deg": b}
                for y, t, a, b in zip(yb, tb, dE, mE)]
    # a sheet pivoting on a bump at y, its corner landing: tilt 1 mm / (W/2 + |y|) or / (W/2 - |y|)
    print("y_mm    theta0 | drake_deg  mujoco_deg  (corner-to-bump slopes)")
    for y, t, a, b in zip(yb, tb, dE, mE):
        s1, s2 = deg(1e-3 / (L.W / 2 + abs(y))), deg(1e-3 / (L.W / 2 - abs(y)))
        print(f"{1000 * y:+6.0f}  {t:+5.2f} | {a:+9.4f}  {b:+10.4f}  ({s1:.4f}, {s2:.4f})")
    for name, v in (("drake", dE), ("mujoco", mE)):
        a = np.abs(v)
        out[f"E_{name}"] = {"median": float(np.median(a)), "max": float(a.max())}
        print(f"{name}: median |tilt| {np.median(a):.4f}, max {a.max():.4f} deg")
    print()

    # F. H40: clean sheets with the smooth-bow rock
    N = 2000
    rng = np.random.default_rng(13)
    th0s, mus, fns = rng.uniform(-1, 1, N), rng.uniform(0.3, 0.5, N), rng.uniform(5, 50, N)
    draws = [dict(theta0=D(a), mu=float(b), f_n=float(c), profile=dict(p=2.0, n=49))
             for a, b, c in zip(th0s, mus, fns)]
    t1 = time.time()
    rD, rM = run(pool, draws)
    rD, rM = np.radians(rD), np.radians(rM)
    out["F_seats_s"] = time.time() - t1
    out["F_draws"] = {"f_n": fns.tolist(), "drake_deg": deg(1) * rD, "mujoco_deg": deg(1) * rM}
    print(f"## F. Seated tilt on a 1/16 in parabolic bow, {N} draws (holder error U(-1,1) deg, mu U(0.3,0.5), "
          "F_n U(5,50) N; seed 13)")
    print("sim      mean_deg   sd_deg   p99_abs   max_abs   corr_with_F_n")
    out["F_rock"] = {}
    for name, r in (("drake", rD), ("mujoco", rM)):
        a = np.abs(deg(1) * r)
        c = float(np.corrcoef(a, fns)[0, 1])
        out["F_rock"][name] = {"mean_deg": float(np.mean(deg(1) * r)), "sd_deg": float(np.std(deg(1) * r)),
                               "p99_abs_deg": float(np.quantile(a, 0.99)), "max_abs_deg": float(a.max()),
                               "corr_abs_with_fn": c}
        print(f"{name:8s} {np.mean(deg(1) * r):+9.5f}  {np.std(deg(1) * r):8.5f}  {np.quantile(a, 0.99):8.5f}  "
              f"{a.max():8.5f}  {c:+.3f}")
    print(f"(three-foot model: |rock| uniform in 0 to {rock:.4f} deg for half the sheets)\n")

    print("## F2. First-pass clean sheets, milestone 5's ledger pipelines (20,000 sheets, seed 7, recoil none)")
    print("framing s_x  warp  policy | three-foot  smooth Drake  smooth MuJoCo  no bow rock | change pts (Drake, MuJoCo)")
    out["F_clean"] = []
    for fr, sx, w, pol in itertools.product(("2x", "2x2x"), (1, 3), ("low", "high"), ("single", "three", "dense")):
        base = dict(framing=fr, policy=pol, warp=w, s_x=sx * C.MM)
        v = {"three_foot": C.clean_cell(**base)["clean"],
             "drake": C.clean_cell(**base, rock_draw=rD)["clean"],
             "mujoco": C.clean_cell(**base, rock_draw=rM)["clean"],
             "none": C.clean_cell(**base, rock_draw=np.zeros(1))["clean"]}
        ch = (100 * (v["drake"] - v["three_foot"]), 100 * (v["mujoco"] - v["three_foot"]))
        out["F_clean"].append({"framing": fr, "s_x_mm": sx, "warp": w, "policy": pol, **v, "change_pts": ch})
        print(f"{fr:6s} {sx:3d}  {w:5s} {pol:6s} | {v['three_foot']:.4f}      {v['drake']:.4f}        "
              f"{v['mujoco']:.4f}         {v['none']:.4f}      | {ch[0]:+6.2f}, {ch[1]:+6.2f}")
    print()

    # hypotheses
    best = next(r for r in out["F_clean"] if r["framing"] == "2x" and r["s_x_mm"] == 1
                and r["warp"] == "low" and r["policy"] == "three")
    two = [r for r in out["F_clean"] if r["framing"] == "2x2x"]
    worst_two = max(max(abs(x) for x in r["change_pts"]) for r in two)
    h40 = min(best["change_pts"]) >= 2.0 and worst_two < 0.5
    hyp = {"H37": {"held": all(ok37), "share": float(np.mean(ok37))},
           "H38": {"held": all(ok38), "share": float(np.mean(ok38))},
           "H39": {"held": worst39 < 0.005, "worst_deg": worst39},
           "H40": {"held": h40, "best_single_2x_change_pts": best["change_pts"], "worst_two_2x_pts": worst_two}}
    out["hypotheses"] = hyp
    print("## Hypotheses")
    print(f"H37 smooth bow within theta_s + 0.005 deg: {np.mean(ok37):.0%} of {len(ok37)} cells -> "
          f"{'held' if all(ok37) else 'refuted'}")
    print(f"H38 tent keeps >= 0.8 x 2s/W at 5 N: {np.mean(ok38):.0%} of {len(ok38)} cells -> "
          f"{'held' if all(ok38) else 'refuted'}")
    print(f"H39 n = 25 vs 97 within 0.005 deg: worst {worst39:.4f} deg -> {'held' if worst39 < 0.005 else 'refuted'}")
    print(f"H40 best single-2x pipeline +{best['change_pts'][0]:.2f} (Drake), +{best['change_pts'][1]:.2f} "
          f"(MuJoCo) points, bar 2; worst two-2x change {worst_two:.2f}, bar 0.5 -> {'held' if h40 else 'refuted'}")
    out["wall_s"] = time.time() - t0
    print(f"\nwall time {out['wall_s']:.0f} s on {os.cpu_count()} CPUs")
    out["F_draws"]["drake_deg"] = out["F_draws"]["drake_deg"].tolist()
    out["F_draws"]["mujoco_deg"] = out["F_draws"]["mujoco_deg"].tolist()
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)


if __name__ == "__main__":
    main()
