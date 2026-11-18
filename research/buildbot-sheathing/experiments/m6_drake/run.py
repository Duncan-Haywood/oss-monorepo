"""Milestone 6: do the MuJoCo results hold on a second contact model (Drake SAP)?

    python experiments/m6_drake/run.py > experiments/m6_drake/results.txt

Needs ``pip install drake mujoco numpy`` (checked with Drake 1.51.1, MuJoCo 3.x). Writes
results.json beside this file. Four worker processes; about ten minutes on four CPUs. The
MuJoCo numbers for sections A to C and G are milestone 3's and 3b's (their results.json); section F
reruns MuJoCo on the same draws as Drake.
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
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import drake_seat as DS  # noqa: E402
from buildbot_sheathing import humanoid as HM  # noqa: E402
from buildbot_sheathing import ledger as L  # noqa: E402

D = math.radians
deg = math.degrees
MM = 1e-3


def _seat(kw):
    sim = kw.pop("sim", "drake")
    if sim == "mujoco":
        r = L.seat(**kw)
    else:
        r = DS.seat(**kw)
    return {"theta": r["theta"], "creep": r["creep"]}


def _threshold(kw):
    """Least press leaving over half of a 1 deg error (milestone 3's bisection, 14 steps)."""
    th0, lo, hi = D(1.0), 1.0, 1500.0

    def stuck(fn):
        return DS.seat(theta0=th0, f_n=fn, **kw)["theta"] > th0 / 2
    if stuck(lo):
        return lo
    if not stuck(hi):
        return float("inf")
    for _ in range(14):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if stuck(mid) else (mid, hi)
    return hi


def _tip(kw):
    return DS.tip_threshold(**kw)


def main():
    import drake
    import mujoco
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": mujoco.__version__,
                        "drake": getattr(drake, "__version__", None) or _drake_version()}}
    m3 = json.load(open(os.path.join(ROOT, "experiments", "m3_ledger", "results.json")))
    m3b = json.load(open(os.path.join(ROOT, "experiments", "m3b_humanoid", "results.json")))
    pool = Pool(4)
    t0 = time.time()
    print("# Milestone 6: the ledger seat and slide on a second contact model (buildbot-sheathing)")
    print(f"Drake {out['versions']['drake']} MultibodyPlant, point contact, SAP, 1 ms, k 1e6 N/m, "
          f"Hunt-Crossley 5 s/m; MuJoCo {mujoco.__version__} as milestone 3 (elliptic cone, impratio 10, "
          f"noslip 20, 0.5 ms)\n")

    # A. released seat grid
    MUS = [0.2, 0.3, 0.4, 0.5, 0.7]
    FNS = [5, 25, 50, 100, 150, 200, 250, 300, 400, 600]
    TH0 = [0.25, 0.5, 1.0, 2.0]
    cells = list(itertools.product(TH0, MUS, FNS))
    res = pool.map(_seat, [dict(theta0=D(th), mu=mu, f_n=fn) for th, mu, fn in cells])
    mj = {(r["theta0_deg"], r["mu"], r["f_n"]): r["theta_deg"] for r in m3["A"]}
    out["A"] = []
    print("## A. Released seat, corner contacts: tilt left (deg), Drake SAP [MuJoCo milestone 3]")
    flips = 0
    for th in TH0:
        print(f"theta0 = {th} deg")
        print("mu \\ F_n N " + " ".join(f"{f:>15d}" for f in FNS))
        for mu in MUS:
            row = []
            for fn in FNS:
                r = res[cells.index((th, mu, fn))]
                td, tm = deg(r["theta"]), mj[(th, mu, fn)]
                stuck_d, stuck_m = abs(td) > th / 2, abs(tm) > th / 2
                flips += stuck_d != stuck_m
                out["A"].append({"theta0_deg": th, "mu": mu, "f_n": fn, "drake_deg": td, "mujoco_deg": tm})
                row.append(f"{td:7.4f} [{tm:6.4f}]")
            print(f"{mu:10.1f} " + " ".join(row))
        print()
    print(f"cells where one simulator seats (< theta0/2) and the other sticks: {flips} of {len(cells)}\n")
    out["A_flips"] = flips

    # B. press thresholds
    print("## B. Press threshold F_n* (N): least press leaving over half of a 1 deg error")
    print("layout   mu    drake_sap  mujoco_m3  closed   drake/closed  drake/mujoco")
    B_cases = [(lay, mu) for lay in ("corners", "studs") for mu in MUS]
    thr = pool.map(_threshold, [dict(mu=mu, layout=lay) for lay, mu in B_cases])
    mjB = {(r["layout"], r["mu"]): r["sim"] for r in m3["B"]}
    out["B"] = []
    for (lay, mu), s in zip(B_cases, thr):
        p = L.press_threshold(mu, lay)
        m = mjB[(lay, mu)]
        out["B"].append({"layout": lay, "mu": mu, "drake": s, "mujoco": m, "closed": p})
        print(f"{lay:8s} {mu:4.1f}  {s:9.1f}  {m:9.1f}  {p:7.1f}  {s / p:12.3f}  {s / m:12.3f}")
    print()

    # C. held wrist
    KS = [300, 1000, 3000, 10000, 30000]
    C_cases = [(fn, th, k) for fn in (5, 100) for th in (0.5, 1.0, 2.0) for k in KS]
    resC = pool.map(_seat, [dict(theta0=D(th), mu=0.4, f_n=fn, k_hold=k) for fn, th, k in C_cases])
    mjC = {(r["f_n"], r["theta0_deg"], r["k"]): r["sim_deg"] for r in m3["C"]}
    print("## C. Held wrist, mu 0.4: tilt left (deg), Drake SAP, MuJoCo (m3), closed form")
    print("F_n  theta0  k_N_m_per_rad  drake    mujoco   closed")
    out["C"] = []
    for (fn, th, k), r in zip(C_cases, resC):
        pr = deg(L.held_residual(D(th), k, 0.4, fn))
        out["C"].append({"f_n": fn, "theta0_deg": th, "k": k, "drake_deg": deg(r["theta"]),
                         "mujoco_deg": mjC[(fn, th, k)], "pred_deg": pr})
        print(f"{fn:4d}  {th:6.2f}  {k:13d}  {deg(r['theta']):7.4f}  {mjC[(fn, th, k)]:7.4f}  {pr:7.4f}")
    print()

    # D. sensitivity of the Drake model itself
    print("## D. Drake settings: released seat (mu 0.4, F_n 50 N, theta0 1 deg) and the mu 0.4 corner threshold")
    variants = [("SAP default (k 1e6, d 5, 1 ms)", {}),
                ("k 1e5 N/m", dict(k_contact=1e5)), ("k 1e7 N/m", dict(k_contact=1e7)),
                ("dissipation 0.5 s/m", dict(dissipation=0.5)), ("dissipation 50 s/m", dict(dissipation=50.0)),
                ("time step 0.5 ms", dict(time_step=5e-4)), ("time step 2 ms", dict(time_step=2e-3)),
                ("TAMSI, stiction 1e-4 m/s", dict(solver="tamsi")),
                ("TAMSI, stiction 1e-3 m/s", dict(solver="tamsi", stiction_tol=1e-3)),
                ("lagged (Drake's default)", dict(solver="lagged"))]
    seatsD = pool.map(_seat, [dict(theta0=D(1.0), mu=0.4, f_n=50.0, **kw) for _, kw in variants])
    thrD = pool.map(_threshold, [dict(mu=0.4, layout="corners", **kw) for _, kw in variants])
    out["D"] = []
    print(f"{'variant':32s} tilt_deg   F_n*_N  (closed {L.press_threshold(0.4):.1f}, MuJoCo {mjB[('corners', 0.4)]:.1f})")
    for (name, kw), s, t in zip(variants, seatsD, thrD):
        out["D"].append({"variant": name, "theta_deg": deg(s["theta"]), "threshold": t})
        print(f"{name:32s} {deg(s['theta']):8.5f}  {t:7.1f}")
    print()

    # E. bowed bottom edge, tilted ledger, creep
    print("## E. Bowed bottom edge (1/16 in), tilted ledger, creep; Drake SAP [MuJoCo]")
    E_cases = [("sag", th) for th in (1.0, -1.0, 0.25, -0.25)] + [("ledger_dz", dz) for dz in (1.0, -1.0, 3.0)]
    argsE = []
    for kind, v in E_cases:
        if kind == "sag":
            argsE.append(dict(theta0=D(v), mu=0.4, f_n=50.0, sag=L.STRAIGHT))
        else:
            argsE.append(dict(theta0=D(0.5), mu=0.4, f_n=50.0, ledger_dz=v * MM))
    eD = pool.map(_seat, [dict(a) for a in argsE])
    eM = pool.map(_seat, [dict(a, sim="mujoco") for a in argsE])
    out["E"] = []
    pred = deg(2 * L.STRAIGHT / L.W)
    for (kind, v), rd, rm in zip(E_cases, eD, eM):
        out["E"].append({"case": kind, "value": v, "drake_deg": deg(rd["theta"]), "mujoco_deg": deg(rm["theta"])})
        lab = (f"bow, theta0 {v:+.2f} deg (predicted +/-{pred:.4f})" if kind == "sag"
               else f"ledger {v:+.0f} mm over the sheet width, relative to the ledger (predicted 0)")
        print(f"{lab:62s} {deg(rd['theta']):+.4f} [{deg(rm['theta']):+.4f}]")
    cr = DS.seat(theta0=D(1.0), mu=0.4, f_n=400.0, settle=10.0)
    out["E_creep"] = {"theta_deg_after_10s": deg(cr["theta"]), "creep_deg_per_s": deg(cr["creep"]),
                      "mujoco_m3": m3["E_creep"]}
    print(f"stuck at F_n 400 N, after 10 s: Drake tilt {deg(cr['theta']):.4f} deg, creep "
          f"{deg(cr['creep']):.2e} deg/s [MuJoCo {m3['E_creep']['theta_deg_after_10s']:.4f}, "
          f"{m3['E_creep']['creep_deg_per_s']:.2e}]\n")

    # F. H-E: seated residuals into milestone 5's clean sheets
    N = 2000
    rng = np.random.default_rng(13)
    th0s = rng.uniform(-1, 1, N)
    mus = rng.uniform(0.3, 0.5, N)
    fns = rng.uniform(5, 50, N)
    draws = [dict(theta0=D(a), mu=float(b), f_n=float(c)) for a, b, c in zip(th0s, mus, fns)]
    t1 = time.time()
    rD = np.array([r["theta"] for r in pool.map(_seat, [dict(d) for d in draws], chunksize=20)])
    tD = time.time() - t1
    t1 = time.time()
    rM = np.array([r["theta"] for r in pool.map(_seat, [dict(d, sim="mujoco") for d in draws], chunksize=20)])
    tM = time.time() - t1
    out["F_residual"] = {}
    print(f"## F. Seated residual over {N} draws (holder error U(-1,1) deg, mu U(0.3,0.5), F_n U(5,50) N; seed 13)")
    print("sim      mean_deg   sd_deg    p99_abs_deg  max_abs_deg  wall_s_per_seat(4 procs)")
    for name, r, tt in (("drake", rD, tD), ("mujoco", rM, tM)):
        a = np.abs(deg(1) * r)
        out["F_residual"][name] = {"mean_deg": float(np.mean(deg(1) * r)), "sd_deg": float(np.std(deg(1) * r)),
                                   "p99_abs_deg": float(np.quantile(a, 0.99)), "max_abs_deg": float(a.max()),
                                   "s_per_seat": tt / N}
        print(f"{name:8s} {np.mean(deg(1) * r):+9.5f}  {np.std(deg(1) * r):8.5f}  {np.quantile(a, 0.99):11.5f}  "
              f"{a.max():11.5f}  {tt / N:.3f}")
    corr = float(np.corrcoef(rD, th0s)[0, 1])
    out["F_residual"]["drake_corr_with_theta0"] = corr
    print(f"Drake residual's correlation with the holder error: {corr:+.3f}\n")

    print("## F2. First-pass clean sheets, milestone 5's ledger pipelines (20,000 sheets, seed 7, recoil none)")
    print("framing s_x  warp  policy | no residual  MuJoCo     Drake      |Drake-MuJoCo| pts")
    out["F_clean"] = []
    worst = 0.0
    for fr, sx, w, pol in itertools.product(("2x", "2x2x"), (1, 3), ("low", "high"), ("single", "three", "dense")):
        vals = {}
        for name, res_ in (("none", np.zeros(1)), ("mujoco", rM), ("drake", rD)):
            vals[name] = C.clean_cell(framing=fr, policy=pol, warp=w, s_x=sx * MM, residual=res_)["clean"]
        d = 100 * abs(vals["drake"] - vals["mujoco"])
        worst = max(worst, d)
        out["F_clean"].append({"framing": fr, "s_x_mm": sx, "warp": w, "policy": pol, **vals, "diff_pts": d})
        print(f"{fr:6s} {sx:3d}  {w:5s} {pol:6s} | {vals['none']:.4f}      {vals['mujoco']:.4f}     "
              f"{vals['drake']:.4f}     {d:6.2f}")
    print()

    # G. slide and tip (milestone 3b, section A)
    G_cases = [(mu, fn) for mu in (0.3, 0.4, 0.5, 0.6, 0.7) for fn in (50.0, 100.0)]
    tips = pool.map(_tip, [dict(mu_l=mu, f_n=fn) for mu, fn in G_cases])
    mjG = {(r["mu_l"], r["f_n"]): r["h_sim"] for r in m3b["A"] if r["h_press"] is None}
    print("## G. Push height that tips a sliding sheet (m above its bottom edge), pushed at the press height")
    print("mu_l  F_n | closed  mujoco_m3b  drake  drake/closed")
    out["G"] = []
    for (mu, fn), h in zip(G_cases, tips):
        hc = HM.tip_height(mu)
        out["G"].append({"mu_l": mu, "f_n": fn, "closed": hc, "mujoco": mjG[(mu, fn)], "drake": h})
        hs = f"{h:6.3f}" if h is not None else "  none"
        rs = f"{h / hc:12.3f}" if h is not None else "           -"
        print(f"{mu:4.1f} {fn:4.0f} | {hc:6.3f}  {mjG[(mu, fn)]:10.3f}  {hs}  {rs}")
    print()

    # hypotheses
    print("## Hypotheses")
    corners = [r for r in out["B"] if r["layout"] == "corners"]
    h32 = all(abs(r["drake"] / r["closed"] - 1) <= 0.25 and abs(r["drake"] / r["mujoco"] - 1) <= 0.15
              for r in corners)
    worst32 = max(abs(r["drake"] / r["mujoco"] - 1) for r in corners)
    h33_cells = [r for r in out["A"] if r["f_n"] <= 50 and 0.3 <= r["mu"] <= 0.5]
    h33_max = max(abs(r["drake_deg"]) for r in h33_cells)
    c_ok = [abs(r["drake_deg"] - r["pred_deg"]) <= max(0.005, 0.1 * abs(r["pred_deg"])) for r in out["C"]]
    g_ok = [r["drake"] is not None and abs(r["drake"] / r["closed"] - 1) <= 0.10 for r in out["G"]]
    hyp = {
        "H32": {"held": h32, "worst_drake_vs_mujoco": worst32},
        "H33": {"held": h33_max <= 0.005, "max_abs_deg": h33_max},
        "H34": {"held": np.mean(c_ok) >= 0.9, "share": float(np.mean(c_ok))},
        "H35": {"held": worst <= 10.0, "worst_pts": worst},
        "H36": {"held": all(g_ok), "share": float(np.mean(g_ok))},
    }
    out["hypotheses"] = hyp
    print(f"H32 press threshold: Drake within 25% of closed form and 15% of MuJoCo on corners -> "
          f"{'held' if h32 else 'refuted'} (worst Drake/MuJoCo off by {100 * worst32:.1f}%)")
    print(f"H33 light press seats: max |tilt| at F_n <= 50, mu 0.3-0.5 = {h33_max:.4f} deg -> "
          f"{'held' if h33_max <= 0.005 else 'refuted'} (bar 0.005)")
    print(f"H34 held wrist: {np.mean(c_ok):.0%} of cells within max(0.005 deg, 10%) -> "
          f"{'held' if hyp['H34']['held'] else 'refuted'}")
    print(f"H35 (H-E) clean sheets: worst |Drake - MuJoCo| = {worst:.2f} points over 24 pipelines -> "
          f"{'held' if worst <= 10 else 'refuted'} (bar 10)")
    print(f"H36 slide tip height within 10% of closed form: {np.mean(g_ok):.0%} -> "
          f"{'held' if all(g_ok) else 'refuted'}")
    out["wall_s"] = time.time() - t0
    print(f"\nwall time {out['wall_s']:.0f} s on {os.cpu_count()} CPUs")
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)


def _drake_version():
    try:
        from importlib.metadata import version
        return version("drake")
    except Exception:
        return None


if __name__ == "__main__":
    main()
