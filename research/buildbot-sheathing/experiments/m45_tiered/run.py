"""Milestone 45: a hold-first (two-tier) preload for the zero-press poses whose stance caps the common margin.

Milestone 44 preloaded every leg row of H1 (1.4 m, -0.15 m) and (1.6 m, 0) to 0.9 of the common margin the stance
allows (0.030 and 0.085 N m); (1.4 m, -0.15 m) kept a 0.172 mm residual because its right hip roll, a hold-set
joint and one of those leg rows, sits 0.030 N m above tau_f and a 0.2 N sensor error moves it 0.033 N m (LOG.md,
milestone 45 planned). Here the hold-set rows get their own margin m_H = min(0.1, beta T_H), T_H the largest
common margin on them with the other leg rows at >= 0, and the other leg rows m_L = min(0.1, beta T_L), T_L the
largest with the hold-set rows at >= m_H (both at zero hose force and an exact sensor, the smaller of the two
window ends). Milestone 38's ``plan`` is called unchanged except for the preload step's per-row targets.
A. The tiers per pose. B. Spec stack at the two poses. C. The H1's worst spec stack. D. The worst residual along the
wall ('braked', |e| 0.2 N, S 10 N, H 0/5/20 N) with the flips at each pose's worst case. E. Hypotheses H175-H180.

M45_SMOKE=1 runs a fast code check (numbers not results); M45_PROCS sets the pool (default 4).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import math
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import tiered as TI  # noqa: E402

SMOKE = bool(os.environ.get("M45_SMOKE"))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m44", os.path.join(HERE, "..", "m44_legpreload", "run.py"))
R44 = importlib.util.module_from_spec(spec)
sys.modules["m44"] = R44
spec.loader.exec_module(R44)                     # builds M0 and M1 as milestones 41-44 did; patches M1.plan
R43 = R44.R43
M1 = R44.M1
R44.MLEG.clear()                                 # milestone 44's per-pose preload off: 0.1 N m unless tiered here

M_SPEC = R44.M_SPEC
BETA = R44.BETA
DROPPED = R44.DROPPED
S_STAR = R44.S_STAR
B_E = R44.B_E
HB = [0.0, 5.0] if SMOKE else [0.0, 5.0, 20.0]
CASES = R44.CASES
TIER = {}                                        # key -> (m_H, m_L)
CUR = [None]
PL0 = M1.PL


def tiers(key):
    """(T_H, T_L, binding hold joint at T_H's end) at zero hose force and an exact sensor, or None."""
    n = key[0]
    r, names, legs = M1.ROB[n]
    q = M1.POSE[key].qpos
    th, ends = [], []
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, np.zeros(3))
        fn, _ = M1.GQ.solve(cm, "hold", legs, M1.SIGNS[n], M1.TAUF, hold_idx=M1.light(n))
        if fn is None:
            return None
        rows, kap, d = PL0.margin_rows(cm.tau(fn), legs, M1.TAUF)
        hm = TI.row_mask(rows, M1.light(n))
        t, f = TI.tier_lp(cm, rows, kap, d, hm, np.zeros(len(rows)))
        if t is None:
            return None
        mg = kap * cm.tau(f)[rows] + d
        j = int(rows[hm][np.argmin(mg[hm])])
        th.append(t)
        ends.append((cm, rows, kap, d, hm, names[j], F))
    T_H = min(th)
    m_H = min(M_SPEC, BETA * T_H)
    tl = []
    for cm, rows, kap, d, hm, _, _ in ends:
        t, _ = TI.tier_lp(cm, rows, kap, d, ~hm, np.where(hm, m_H, 0.0))
        tl.append(-np.inf if t is None else t)
    i = int(np.argmin(th))
    return {"T_H": T_H, "m_H": m_H, "T_L": min(tl), "bind": ends[i][5], "F": ends[i][6]}


class TieredPL:
    """Milestone 37's preload module with ``solve_margin`` swapped for the tiered solve at the tiered poses."""
    def __getattr__(self, a):
        return getattr(PL0, a)

    def solve_margin(self, c, legs, rows, kap, d, m, reg=1e-6):
        key = CUR[0]
        if key not in TIER:
            return PL0.solve_margin(c, legs, rows, kap, d, m, reg)
        m_H, m_L = TIER[key]
        mvec = np.where(TI.row_mask(rows, M1.light(key[0])), m_H, m_L)
        return TI.solve_tiered(c, legs, rows, kap, d, mvec, reg)


M1.PL = TieredPL()
PLAN44 = M1.plan


def plan_t(key, f, e, S):
    CUR[0] = key
    try:
        return PLAN44(key, f, e, S)
    finally:
        CUR[0] = None


M1.plan = plan_t

INFO = {}
for k in sorted(M1.KEYS):
    if R44.TMIN.get(k) is not None and BETA * R44.TMIN[k] < M_SPEC:
        INFO[k] = tiers(k)


def set_tier(on):
    TIER.clear()
    if on:
        for k, v in INFO.items():
            if v is not None and v["T_L"] >= 0:
                TIER[k] = (v["m_H"], min(M_SPEC, BETA * v["T_L"]))
    M1.PLANS.clear()


def task_D(args):
    n, H = args
    set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")
    t1 = time.time()
    best = {"all": None, "other": None}
    for k in DROPPED:
        best[k] = None
    miss, cases = 0, 0
    for i in M1.phis_for(H):
        phi = M1.PHIS[i] if H > 0 else 0.0
        for a in M1.AXES:
            e = B_E * a
            rg = M1.residuals(n, H, phi, e, S_STAR)
            for k in DROPPED:
                if k[0] == n:
                    cases += 1
                    miss += k not in rg
            for key, mu in rg.items():
                y = abs(mu["y"][0]) / M1.MM
                for g in ("all", key if key in DROPPED else "other"):
                    if best[g] is None or y > best[g]["y"]:
                        best[g] = {"y": y, "at": list(key[1:]), "phi": round(math.degrees(phi)),
                                   "e": [float(x) for x in e]}
    flips = {}
    for k in DROPPED:
        b = best[k]
        if b is None:
            continue
        ta, tp = M1.plan(k, M1.hose_f(k, H, math.radians(b["phi"])), np.array(b["e"]), S_STAR)[:2]
        cnt = {"hold": 0, "leg": 0, "waist": 0, "arm": 0}
        for j in np.flatnonzero(PL0.flips(ta, tp, M1.TAUF) & M1.POSE[k].rows[2]):
            cnt[M1.kind(n, j)] += 1
        flips[str(list(k[1:]))] = cnt
    return {"robot": n, "H": H, "worst": {("all" if g == "all" else "other" if g == "other" else str(list(g[1:]))): v
                                          for g, v in best.items()},
            "miss": miss, "cases": cases, "flips": flips, "s": time.time() - t1}


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "m_spec": M_SPEC, "beta": BETA, "S": S_STAR,
           "b": B_E, "H": HB}
    print(f"# Milestone 45: a hold-first two-tier preload (beta {BETA:g}) on the poses milestone 44 re-planned")
    set_tier(True)
    print("## A. Tiers at zero hose force, exact sensor: robot | pose | t_min common (m44) | T_H | binding hold joint "
          "(window end) | m_H | T_L | m_L")
    out["A"] = []
    for k, v in sorted(INFO.items()):
        mL = TIER[k][1] if k in TIER else None
        print(f"  {k[0]} {list(k[1:])} | {R44.TMIN[k]:.4f} | {v['T_H']:.4f} | {v['bind']} ({v['F']:g} N) | "
              f"{v['m_H']:.4f} | {v['T_L']:.4f} | " + ("-" if mL is None else f"{mL:.4f}"))
        out["A"].append({"robot": k[0], "pose": list(k[1:]), "t_min": R44.TMIN[k], **v, "m_L": mL})
    out["changed"] = sorted(INFO) == sorted(DROPPED)
    print(f"  (tiered poses are exactly milestone 44's two: {out['changed']})")
    print()

    m44 = json.load(open(os.path.join(HERE, "..", "m44_legpreload", "results.json")))
    B44 = {(r["case"], tuple(r["pose"])): r for r in m44["B"] if r["beta"] == BETA}
    print("## B. No-hose clean-sheet spec stack at the two poses: robot | pose | case | tiered | squeeze (N) | "
          "milestone 44 (common preload) | change (points)")
    out["B"] = []
    for k in DROPPED:
        for c in CASES:
            r = R43.task(("zero", c, k))
            v, o = r["spec"], B44[(c, k[1:])]["spec"]
            out["B"].append({"robot": k[0], "pose": list(k[1:]), "case": c, "spec": v, "squeeze": r.get("squeeze"),
                             "m44": o})
            print(f"  {k[0]} {list(k[1:])} | {c:6s} | " + ("   -  " if v is None else f"{v:.4f}") + " | "
                  + ("-" if r.get("squeeze") is None else f"{r['squeeze']:+.2f}") + f" | {o:.4f} | "
                  + ("-" if v is None else f"{100 * (v - o):+.2f}"))
    print()

    m43 = json.load(open(os.path.join(HERE, "..", "m43_specstack", "results.json")))
    S43 = {(r["lean"], r["case"], r["robot"], tuple(r["pose"])): r for r in m43["rows"]}
    print("## C. H1 worst spec stack over its zero-press poses: case | worst | at | poses with a plan | milestone 44")
    W = {}
    for c in CASES:
        vals = []
        for k in sorted(kk for kk in M1.KEYS if kk[0] == "h1"):
            if k in DROPPED:
                v = [r["spec"] for r in out["B"] if r["case"] == c and tuple(r["pose"]) == k[1:]][0]
            else:
                v = S43[("zero", c, "h1", k[1:])]["spec"]
            if v is not None:
                vals.append((v, k[1:]))
        v, at = min(vals)
        W[c] = v
        print(f"  {c:6s} | {v:.4f} | {list(at)} | {len(vals)} | {m44['C'][c]:.4f}")
    out["C"] = W
    print()

    procs = int(os.environ.get("M45_PROCS", "4"))
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resD = pool.map(task_D, [("h1", H) for H in HB], chunksize=1)
    out["D"] = resD
    m41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
    W41 = {x["H"]: x["worst"]["all"]["y"] for x in m41["B"] if x["robot"] == "h1"}
    W44 = {x["H"]: x["worst"]["two"]["y"] for x in m44["D"]}
    print("(section D tasks: " + ", ".join(f"H {x['H']:g} {x['s']:.0f} s" for x in resD) + ")")
    print(f"## D. H1 worst residual along the wall (mm), 'braked', |e| {B_E} N, S {S_STAR:g} N: H | all poses | other "
          "poses (milestone 41) | (1.4, -0.15) [flips hold/leg/waist/arm] | (1.6, 0) [flips] | milestone 44, the two | "
          "cases at the two poses with no plan")
    chk, WD, WP = 0.0, {}, {}
    for x in sorted(resD, key=lambda x: x["H"]):
        a, o = x["worst"]["all"], x["worst"]["other"]
        WD[x["H"]] = a["y"]
        chk = max(chk, abs(round(o["y"], 3) - round(W41[x["H"]], 3)))
        cells = []
        for k in DROPPED:
            s = str(list(k[1:]))
            w = x["worst"].get(s)
            WP[(x["H"], s)] = None if w is None else w["y"]
            fl = x["flips"].get(s)
            cells.append("-" if w is None else f"{w['y']:.3f} (phi {w['phi']}) ["
                         + "/".join(str(fl[t]) for t in ("hold", "leg", "waist", "arm")) + "]")
        print(f"  {x['H']:5.1f} | {a['y']:.3f} | {o['y']:.3f} ({W41[x['H']]:.3f}) | " + " | ".join(cells)
              + f" | {W44[x['H']]:.3f} | {x['miss']} of {x['cases']}")
    out["check_m41"] = chk
    print(f"check: the other poses reproduce milestone 41's H1 worst residual to {chk:.3f} mm (expect 0.000)")
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    E = {}
    a14 = [v for k, v in INFO.items() if k == ("h1", 1.4, -0.15)][0]
    E["H175"] = a14["T_H"] >= 0.05
    print(f"H175 (T_H at (1.4, -0.15) at least 0.05 N m): {a14['T_H']:.4f} -> {'held' if E['H175'] else 'refuted'}")
    E["H176"] = all(k in TIER for k in DROPPED)
    print(f"H176 (both poses have a tiered plan, T_L >= 0): "
          + ", ".join(f"{list(k[1:])} T_L {INFO[k]['T_L']:.4f}" for k in DROPPED)
          + f" -> {'held' if E['H176'] else 'refuted'}")
    s14 = str([1.4, -0.15])
    lim = {0.0: 0.03, 5.0: 0.03, 20.0: 0.05}
    v14 = {H: WP.get((H, s14)) for H in HB}
    E["H177"] = all(v is not None and v <= lim[H] for H, v in v14.items())
    print("H177 ((1.4, -0.15) at most 0.03 / 0.03 / 0.05 mm at 0 / 5 / 20 N): "
          + ", ".join("-" if v is None else f"{v:.3f}" for v in v14.values()) + f" -> {'held' if E['H177'] else 'refuted'}")
    g5, g20 = WD.get(5.0), WD.get(20.0)
    E["H178"] = g5 is not None and g5 <= 0.03 and (SMOKE or (g20 is not None and g20 <= 0.05))
    print(f"H178 (the H1's worst residual at most 0.03 mm at 5 N and 0.05 mm at 20 N): {g5:.3f}, "
          + ("-" if g20 is None else f"{g20:.3f}") + f" -> {'held' if E['H178'] else 'refuted'}")
    miss = sum(x["miss"] for x in resD)
    E["H179"] = miss <= 24
    print(f"H179 (cases at the two poses with no plan at most milestone 44's 24): {miss} of "
          f"{sum(x['cases'] for x in resD)} -> {'held' if E['H179'] else 'refuted'}")
    bb = [r for r in out["B"] if r["case"] == "braked"]
    dv = [abs(100 * (r["spec"] - r["m44"])) if r["spec"] is not None else float("inf") for r in bb]
    E["H180"] = max(dv) <= 0.1 + 1e-9
    print(f"H180 ('braked': each pose within 0.1 points of milestone 44's stack): "
          + ", ".join(f"{v:.2f}" for v in dv) + f" -> {'held' if E['H180'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
