"""Milestone 49 post hoc (after section A; not registered): what limits the stance at the 24 backward-hose cells.

Section A found no balancing force inside the friction cones at the 50 N press end of every cell. Per cell:
(1) does the base balance with unlimited friction (only f_z >= 0: the centre of pressure inside the soles)?
(2) the smallest friction coefficient that balances it (bisected up to 5); (3) the largest press (N) that balances
it at mu 0.5 (bisected between the 25 N end, which balances, and 50 N); (4) the net horizontal load the soles must
react at 50 N (|press + hose, horizontal|) against mu times the vertical load.
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m49", os.path.join(HERE, "run.py"))
D = importlib.util.module_from_spec(spec)
sys.modules["m49"] = D
spec.loader.exec_module(D)
M1, GQ0, R = D.M1, D.GQ0, D.R
GQ = sys.modules["buildbot_sheathing.grf_qp"]
T0 = time.time()


def balances(cm, mu):
    return GQ0.margin_lp(GQ.Contact(cm.h, cm.Jc, mu), [], [])[1] is not None


def cell(args):
    key, H, phi, _ = args
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    fh = np.asarray(M1.hose_f(key, H, phi), float)
    cm = lambda F: M1.contact(r, q, F, M1.TOOL_KG, fh)  # noqa: E731
    c50 = cm(M1.F_HI)
    inf_ok = balances(c50, 1e6)
    lo, hi = M1.MU, 5.0
    mu_min = None
    if balances(c50, hi):
        for _ in range(30):
            mid = (lo + hi) / 2
            lo, hi = (lo, mid) if balances(c50, mid) else (mid, hi)
        mu_min = hi
    a, b = M1.F_HI / 2, M1.F_HI                  # a balances (section A), b does not
    if not balances(cm(a), M1.MU):
        fmax = None
    else:
        for _ in range(30):
            mid = (a + b) / 2
            a, b = (mid, b) if balances(cm(mid), M1.MU) else (a, mid)
        fmax = a
    # the top of the press window with no hose (same pose, mu 0.5), bisected up to 200 N
    c0 = lambda F: M1.contact(r, q, F, M1.TOOL_KG, np.zeros(3))  # noqa: E731
    a0, b0 = M1.F_HI / 2, 200.0
    if not balances(c0(a0), M1.MU):
        top0 = None
    elif balances(c0(b0), M1.MU):
        top0 = b0
    else:
        for _ in range(30):
            mid = (a0 + b0) / 2
            a0, b0 = (mid, b0) if balances(c0(mid), M1.MU) else (a0, mid)
        top0 = a0
    # net horizontal and vertical loads the soles carry: minus the base wrench's force part (any balancing f)
    f, *_ = np.linalg.lstsq(c50.Aeq, c50.beq, rcond=None)
    Fx, Fy, Fz = f[0::3].sum(), f[1::3].sum(), f[2::3].sum()
    return {"robot": key[0], "pose": list(key[1:]), "H": H, "phi": round(np.degrees(phi)),
            "hose": [float(x) for x in fh], "inf_mu_balances": bool(inf_ok), "mu_min": mu_min,
            "press_max": fmax, "top_nohose": top0, "sole_Fx": float(Fx), "sole_Fy": float(Fy), "sole_Fz": float(Fz),
            "ratio": float(np.hypot(Fx, Fy) / Fz)}


if __name__ == "__main__":
    jobs = [j for j in D.failing() if j[3] == M1.F_HI]
    with M1.mp.get_context("fork").Pool(4) as pool:
        res = pool.map(cell, jobs, chunksize=1)
    print("# Milestone 49 post hoc: what limits the stance at the 50 N end of the 24 cells (mu 0.5)")
    print("robot | pose | H | phi | hose force at the hand (N) | balances with unlimited friction | smallest mu that "
          "balances | largest press that balances at mu 0.5 (N) | same, no hose (N) | net sole load Fx, Fy, Fz (N) | |F_h|/F_z")
    for c in res:
        print(f"  {c['robot']} {c['pose']} | {c['H']:g} | {c['phi']} | "
              + ", ".join(f"{x:+.1f}" for x in c["hose"]) + f" | {c['inf_mu_balances']} | "
              + ("> 5" if c["mu_min"] is None else f"{c['mu_min']:.3f}") + " | "
              + ("none" if c["press_max"] is None else f"{c['press_max']:.1f}") + " | "
              + ("none" if c["top_nohose"] is None else f"{c['top_nohose']:.1f}")
              + f" | {c['sole_Fx']:+.1f}, {c['sole_Fy']:+.1f}, {c['sole_Fz']:.1f} | {c['ratio']:.3f}")
    for n in ("g1", "h1"):
        xs = [c for c in res if c["robot"] == n]
        pm = [c["press_max"] for c in xs if c["press_max"] is not None]
        mm = [c["mu_min"] for c in xs if c["mu_min"] is not None]
        print(f"  {n}: {len(xs)} cells; balance with unlimited friction {sum(c['inf_mu_balances'] for c in xs)}; "
              +
              ("smallest mu " + (f"{min(mm):.3f}-{max(mm):.3f}" if mm else "> 5 at every cell")) + f"; largest press {min(pm):.1f}-{max(pm):.1f} N; "
              f"press window top with no hose {min(c['top_nohose'] for c in xs):.1f}-{max(c['top_nohose'] for c in xs):.1f} N; "
              f"largest |F_h|/F_z {max(c['ratio'] for c in xs):.3f} (mu {M1.MU})")
    json.dump(res, open(os.path.join(HERE, "posthoc.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s)")
