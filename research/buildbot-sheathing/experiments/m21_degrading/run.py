"""Milestone 21: Weiss's wall under the CUREE history with nails that lose strength as they dissipate energy.

    OMP_NUM_THREADS=1 python experiments/m21_degrading/run.py > experiments/m21_degrading/results.txt

Milestone 20's wall, nails, rods and loading (``wall_cyclic.CyclicWall``; Anderson et al. 2007 fyb 115 nail;
CUREE basic history, delta = 0.6 delta_m from milestone 20's monotonic pushes, read from its results.json), with
every spring's envelope and pinching lines scaled by s = 1 - E / (gamma FU Du) (``Saws.degrading``). gamma is not
sourced and is swept. H98-H102 were registered in LOG.md before this script was run. Writes results.json.
Needs numpy and scipy; about half an hour on four CPUs.
"""
import json
import multiprocessing as mp
import os
import platform
import sys
import time

import numpy as np
import scipy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import wall_cyclic as C  # noqa: E402
from buildbot_sheathing import wall_lp as W  # noqa: E402
from buildbot_sheathing import wall_push as P  # noqa: E402
from buildbot_sheathing.budget import IN  # noqa: E402

T0 = time.time()
MM = 1e-3
STEP = 0.5 * MM
TEST = {"control 6-12": 4688, "decay 6-12": 2649, "control 3-12": 8775, "decay 3-12": 2974}
KEPT = [TEST["decay 6-12"] / TEST["control 6-12"], TEST["decay 3-12"] / TEST["control 3-12"]]
INTACT_RATIO = TEST["control 3-12"] / TEST["control 6-12"]
NDS = 1.2971
ROD_K = P.nds_rod_k(0.625)
CAP = 2.55
WALLS = {e: W.weiss_wall(e) for e in (6.0, 3.0)}
KEEP = {e: W.decay_mask(w.xz) for e, w in WALLS.items()}
NAIL = C.anderson(115)
GAMMAS = [np.inf, 100.0, 50.0, 20.0, 10.0, 5.0]
M_GRID = [0.25, 0.47, 1.0]
LAM, GAP = 1.0, 1 / 16
M20 = json.load(open(os.path.join(HERE, "..", "m20_cyclic", "results.json")))


def m20_row(m):
    for r in M20["D"]:
        if r["m"] == m and r["lam"] == LAM and abs(r["gap_in"] - GAP) < 1e-12:
            return r
    raise KeyError(m)


def build(edge, decayed, m, gamma):
    s = NAIL.degrading(gamma)
    cw = C.CyclicWall(WALLS[edge], KEEP[edge] if decayed else None, s, s.scaled(m * NDS, LAM),
                      rod_gap=GAP * IN, rod_k=ROD_K, rod_cap=CAP * NAIL.FU)
    cw.orient()
    return cw


def cyclic(args):
    """As milestone 20's ``cyclic``: stops after the first primary cycle past delta whose largest load is below
    0.8 of the largest so far, or after the 3.0 delta primary and its trailing cycles. Also reports the strength
    left (mean s) in sheathing nails and joints at the end."""
    edge, decayed, m, gamma, delta = args
    cw = build(edge, decayed, m, gamma)
    amps, prim = C.curee(delta, max_amp=3.0)
    bp, bm, worst, n, stopped = 0.0, 0.0, 0.0, 0, None
    for a, is_p in zip(amps, prim):
        path = C.cycle_path([a], STEP)
        L, res = cw.drive(path)
        worst, n = max(worst, res), n + path.size
        cp, cm = float(L.max()), float(-L.min())
        prev = max(bp, bm)
        bp, bm = max(bp, cp), max(bm, cm)
        if is_p and prev > 0 and max(cp, cm) < 0.8 * prev and a > delta:
            stopped = float(a / delta)
            break
    s = cw.st["s"]
    nn = 2 * cw.m
    return args, {"peak": 0.5 * (bp + bm) / NAIL.FU, "peak_pos": bp / NAIL.FU, "peak_neg": bm / NAIL.FU,
                  "res": worst, "steps": n, "stopped_at": stopped,
                  "s_nails_mean": float(s[:nn].mean()), "s_nails_min": float(s[:nn].min()),
                  "s_joints_mean": float(s[nn:].mean()) if s.size > nn else None}


def mono(args):
    edge, decayed, m, gamma = args
    cw = build(edge, decayed, m, gamma)
    L, res = cw.drive(np.arange(1, 301) * STEP)
    return args, float(L.max() / NAIL.FU)


def pct(x):
    return f"{100 * x:.1f}%"


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__},
           "gammas": [str(g) for g in GAMMAS]}
    print("# Milestone 21: Weiss's wall under the CUREE protocol with energy-degrading nails (buildbot-sheathing)")
    print("Milestone 20's wall and SAWS nails (Anderson et al. 2007, fyb 115), anchor rods with a 1/16 in gap and a "
          "2.55 FU cap, lambda 1. Every spring's envelope and pinching lines scaled by s = 1 - E/(gamma FU Du), E the "
          "work done on it after its first reversal past yield. gamma swept (not sourced). Loads in FU.\n")

    # ---------------------------------------------------------------- A. single nail
    print("## A. One nail through the CUREE history at delta = 2 Du (calibration)")
    amps, _ = C.curee(2 * NAIL.Du, 3.0)
    h = C.cycle_path(amps, NAIL.Du / 50)
    F0 = NAIL.run(h)
    single = {}
    for g in GAMMAS:
        F = NAIL.degrading(g).run(h)
        single[str(g)] = float(np.abs(F).max() / np.abs(F0).max())
        print(f"gamma {g:>5}: envelope peak {single[str(g)]:.3f} of the undegraded peak")
    out["A"] = single

    # ---------------------------------------------------------------- B. H98, H99 (code checks)
    print("\n## B. Code checks")
    d98 = float(np.abs(NAIL.degrading(np.inf).run(h) - F0).max())
    ref = json.load(open(os.path.join(HERE, "..", "..", "tests", "data", "saws_opensees.json")))
    d98o = float(np.abs(NAIL.degrading(np.inf).run(np.array(ref["d"])) - NAIL.run(np.array(ref["d"]))).max())
    # H99: on the envelope, F = s * E(d) with s from the spring's own history
    sg = NAIL.degrading(10.0)
    st = sg.init_state(1)
    worst99, n_env = 0.0, 0
    Fprev, dprev, Ework, rev, dirn = 0.0, 0.0, 0.0, False, 0.0
    for d in h:
        s_used = st["s"][0]
        y_prev = st["yielded"][0]
        F, _, st = sg.trial(np.array([d]), st)
        if st["env"][0] != 0 and not st["dead"][0]:
            Fe, _ = sg.env_odd(d)
            worst99 = max(worst99, abs(F[0] - s_used * Fe))
            n_env += 1
        inc = d - dprev
        if y_prev and np.sign(inc) * dirn < 0:
            rev = True
        if rev:
            Ework += 0.5 * (Fprev + F[0]) * inc
        dirn = np.sign(inc) if inc != 0 else dirn
        Fprev, dprev = F[0], d
        s_hand = min(1.0, max(0.0, 1 - max(Ework, 0) / (10.0 * sg.FU * sg.Du)))
        worst99 = max(worst99, abs(st["s"][0] - s_hand) * sg.FU)
    print(f"H98: gamma inf against milestone 20's Saws, CUREE trace: largest difference {d98:.1e} N; OpenSees trace "
          f"{d98o:.1e} N")
    print(f"H99: gamma 10, {n_env} steps on the envelope: largest |F - s E(d)| and |s - s_hand| FU {worst99:.1e} N "
          f"({worst99 / NAIL.FU:.1e} FU)")

    # ---------------------------------------------------------------- monotonic and cyclic runs
    walls = [(e, dc) for e in (6.0, 3.0) for dc in (False, True)]
    mjobs = [(e, dc, 1.0, g) for (e, dc) in walls for g in (np.inf, 5.0)]
    cjobs = [(e, dc, m, g, m20_row(m)["delta_mm"][str(e)] * MM) for m in M_GRID for g in GAMMAS for (e, dc) in walls]
    with mp.Pool(4) as pool:
        MO = dict(pool.map(mono, mjobs, chunksize=1))
        cjobs.sort(key=lambda j: (j[3] == np.inf, -j[4]))
        CY = dict(pool.map(cyclic, cjobs, chunksize=1))
    print(f"\nmonotonic pushes {len(MO)}, cyclic runs {len(CY)} ({time.time() - T0:.0f} s); largest residual "
          f"{max(v['res'] for v in CY.values()):.1e} FU; steps per run {min(v['steps'] for v in CY.values())}-"
          f"{max(v['steps'] for v in CY.values())}")
    dmono = max(abs(MO[(e, dc, 1.0, 5.0)] - MO[(e, dc, 1.0, np.inf)]) for (e, dc) in walls)
    reg20 = M20["E"]
    d98w = max(abs(CY[(e, dc, 1.0, np.inf, m20_row(1.0)["delta_mm"][str(e)] * MM)]["peak"]
                   - m20_row(1.0)["peaks_cyclic"][f"{e:.0f}-{'d' if dc else 'c'}"]) for (e, dc) in walls)
    print(f"H98: monotonic peaks at gamma 5 against gamma inf (m 1): largest difference {dmono:.1e} FU; registered-"
          f"point cyclic peaks at gamma inf against milestone 20: largest difference {d98w:.1e} FU")
    h98 = d98 == 0 and d98o == 0 and dmono <= 1e-9 and d98w <= 1e-9
    h99 = worst99 <= 1e-9 * NAIL.FU
    print(f"H98: {'held' if h98 else 'refuted'}; H99 (1e-9 FU): {'held' if h99 else 'refuted'}")
    out["B"] = {"d98_trace": d98, "d98_opensees": d98o, "d98_mono": dmono, "d98_wall": d98w, "h98": h98,
                "worst99_N": worst99, "h99": h99}

    def get(e, dc, m, g):
        return CY[(e, dc, m, g, m20_row(m)["delta_mm"][str(e)] * MM)]

    # ---------------------------------------------------------------- C. grid
    print("\n## C. By gamma and end-nail strength m: shares kept 6-12 | 3-12, intact cyclic/monotonic 6-12 | 3-12, "
          "intact ratio 3-12/6-12 (tested 1.87), rms against the tested shares, strength left in the nails (mean s)")
    rows = []
    for m in M_GRID:
        mono_pk = m20_row(m)["peaks_mono"]
        for g in GAMMAS:
            pk = {f"{e:.0f}-{'d' if dc else 'c'}": get(e, dc, m, g)["peak"] for (e, dc) in walls}
            sh = [pk["6-d"] / pk["6-c"], pk["3-d"] / pk["3-c"]]
            ic = [pk["6-c"] / mono_pk["6-c"], pk["3-c"] / mono_pk["3-c"]]
            rms = float(np.sqrt(((np.array(sh) - np.array(KEPT)) ** 2).mean()))
            sl = {k: get(e, dc, m, g)["s_nails_mean"] for k, (e, dc) in zip(pk, walls)}
            rows.append({"m": m, "gamma": str(g), "peaks": pk, "shares": sh, "intact_vs_mono": ic,
                         "intact_ratio": pk["3-c"] / pk["6-c"], "rms": rms, "s_nails_mean": sl,
                         "s_joints_mean": {k: get(e, dc, m, g)["s_joints_mean"] for k, (e, dc) in zip(pk, walls)},
                         "stopped_at": {k: get(e, dc, m, g)["stopped_at"] for k, (e, dc) in zip(pk, walls)}})
            print(f"m {m:<4} gamma {g:>5}: {pct(sh[0])}|{pct(sh[1])}; intact {pct(ic[0])}|{pct(ic[1])}; ratio "
                  f"{pk['3-c'] / pk['6-c']:.2f}; rms {100 * rms:.1f} pts; s {sl['6-c']:.2f}/{sl['6-d']:.2f}/"
                  f"{sl['3-c']:.2f}/{sl['3-d']:.2f} (6c/6d/3c/3d)")
    print(f"tested: {pct(KEPT[0])}|{pct(KEPT[1])}, intact ratio {INTACT_RATIO:.2f}")
    out["C"] = rows

    # ---------------------------------------------------------------- D. registered checks
    print("\n## D. Registered checks")
    reg = {r["gamma"]: r for r in rows if r["m"] == 1.0}
    h100 = all(reg[str(g)]["shares"][1] >= 0.50 for g in GAMMAS if g >= 10)
    print("H100 (m 1: decayed 3-12 keeps >= 50% for gamma >= 10): "
          + ", ".join(f"{g}: {pct(reg[str(g)]['shares'][1])}" for g in GAMMAS if g >= 10)
          + f": {'held' if h100 else 'refuted'}")
    base = reg[str(np.inf)]["shares"]
    moves = {str(g): [100 * (a - b) for a, b in zip(reg[str(g)]["shares"], base)] for g in GAMMAS}
    h101 = all(abs(x) <= 10 for v in moves.values() for x in v)
    print("H101 (m 1: each share within 10 points of gamma inf): "
          + ", ".join(f"{g}: {v[0]:+.1f}|{v[1]:+.1f}" for g, v in moves.items())
          + f": {'held' if h101 else 'refuted'}")
    near = [r for r in rows if r["m"] >= 0.75 and all(abs(a - b) <= 0.10 for a, b in zip(r["shares"], KEPT))]
    h102 = not near
    print(f"H102 (no m >= 0.75 point within 10 points of both): {len(near)} such points: {'held' if h102 else 'refuted'}")
    best = min(rows, key=lambda r: r["rms"])
    print(f"best overall: m {best['m']}, gamma {best['gamma']}: {pct(best['shares'][0])}|{pct(best['shares'][1])} "
          f"(rms {100 * best['rms']:.1f}), intact {pct(best['intact_vs_mono'][0])}|{pct(best['intact_vs_mono'][1])} "
          f"of monotonic, ratio {best['intact_ratio']:.2f}")
    for g in GAMMAS:
        b = min((r for r in rows if r["gamma"] == str(g)), key=lambda r: r["rms"])
        print(f"  best at gamma {g:>5}: m {b['m']}, {pct(b['shares'][0])}|{pct(b['shares'][1])} (rms {100 * b['rms']:.1f})")
    out["D"] = {"h100": h100, "moves": moves, "h101": h101, "near": near, "h102": h102, "best": best}
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; {os.cpu_count()} CPUs; python {platform.python_version()}, numpy "
          f"{np.__version__}, scipy {scipy.__version__})")
