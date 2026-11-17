"""Milestone 7i: carry the competitor's idle cost in the rule, so one fit covers every idle setting (7h's Next q).

7h rebuilt 7g's 14 variants and 196 (shape, drag) cells in 22 conditions (18 idle settings of 6j at S = 0.38, and
S in {0.20, 0.30, 0.40, 0.50} at the central setting) and found the rule's slopes transfer but its intercept does
not. Here the 22 x 196 = 4312 cells are pooled and three rules fitted across conditions:

  ow  = a + b kW_o + c k_w                         (no setting term; reference)
  owL = ow + d P_LS                                (P_LS: the condition's load-sensing standby kW)
  owC = a + b S kW_o + c k_w + d S P_LS            (idle-cost form: both idle powers scaled by the idle share)

Scored (A) leave-one-condition-out and leave-one-maker-family-out at once, RMS over each condition's 14 diagonals;
(B) the same with every condition at the held idle speed ratio out of training. 7h's per-condition (i) refitted ow
and (iii) frozen slopes, own intercept are recomputed and must reproduce its results file. Predictions IC1 to IC6
are in LOG.md (7i), registered before any number.

Usage: python gear_pump_idlecost.py [cache dir] > gear_pump_idlecost_results.txt
Needs numpy and h5py (cache shared with 5z to 7h). The 22 conditions' cells are built in parallel (fork, about
14 min on 4 cores) and kept in <cache>/idlecost_cells.pkl for reruns.
"""
import multiprocessing as mp
import os
import pickle
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import gear_pump_five as g5  # noqa: E402
import gear_pump_shape as gs  # noqa: E402
import gear_pump_chosen as gc  # noqa: E402
import gear_pump_pickdrag as gd  # noqa: E402
import gear_pump_holddrag as gh  # noqa: E402
import gear_pump_settings as st  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

RULES = ("ow", "owL", "owC")
CONDITIONS = st.CONDITIONS


def columns(rule, kwo, kw, pls, s):
    """Design columns for one cell (or arrays of cells): drag kW_o, shape k_w, standby P_LS, idle share S."""
    one = np.ones_like(np.asarray(kwo, dtype=float))
    if rule == "ow":
        return [one, kwo, kw]
    if rule == "owL":
        return [one, kwo, kw, pls * one]
    if rule == "owC":
        return [one, s * np.asarray(kwo), kw, s * pls * one]
    raise ValueError(rule)


def stack(cond, rule, cells_ok=lambda c, f, g: True):
    """Design matrix X and targets y over all cells (f, g) of the conditions in cond passing cells_ok."""
    X, y = [], []
    for c in cond:
        for (f, g), v in c["cells"].items():
            if cells_ok(c, f, g):
                X.append(columns(rule, c["kwo"][g], c["kw"][f], c["pls"], c["share"]))
                y.append(v)
    return np.array(X, dtype=float), np.array(y)


def fit(cond, rule, cells_ok=lambda c, f, g: True):
    X, y = stack(cond, rule, cells_ok)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return beta


def predict(beta, c, rule, k):
    return float(np.dot(beta, columns(rule, c["kwo"][k], c["kw"][k], c["pls"], c["share"])))


def held_out(res, rule, in_test):
    """Per held condition j: RMS over its 14 diagonals with in_test(j)'s conditions and each maker family held out."""
    keys, grp = res[0]["keys"], res[0]["grp"]
    out = []
    for j, c in enumerate(res):
        train = [r for i, r in enumerate(res) if not in_test(j, i)]
        err = []
        for g in sorted(set(grp.values()), key=str):
            b = fit(train, rule, lambda r, f, h, g=g: grp[f] != g and grp[h] != g)
            err += [c["cells"][(m, m)] - predict(b, c, rule, m) for m in keys if grp[m] == g]
        out.append((g5.rms(err), float(np.mean(err))))
    return out


def build_condition(j):
    """Cells and features of condition j (forked worker; reads the central build from st._G)."""
    setting, share = CONDITIONS[j]
    G = st._G
    keys, grp = G["keys"], G["grp"]
    gs.S_C = share
    idle = {k: gear_powers(g, G["coef"], *setting) for k, g in G["gears"].items()}
    kw85 = {k: float(idle[k][0][st.K85]) for k in keys}
    kwo = {k: gh.held_plus_extra(kw85[grp[k]], idle[k][0], idle[grp[k]][0], G["w"], G["qbig"][k]) for k in keys}
    cells = {}
    for f in keys:
        for g in keys:
            sh = gs.shares(G["rows"], lambda x, e, f=f: np.minimum(gs.CAP, e * G["norm"][f][x["i"]]), idle[g])
            cells[(f, g)] = gs.crossing(list(gc.E_GRID), sh)
    return {"setting": setting, "share": share, "pls": float(idle[keys[0]][1]), "kwo": kwo, "kw": G["kwf"],
            "kw85": kw85, "cells": cells, "keys": keys, "grp": grp}


def build_all(cache):
    path = os.path.join(cache, "idlecost_cells.pkl")
    if os.path.exists(path):
        with open(path, "rb") as fh:
            return pickle.load(fh)
    gears, E, rows, idle, kw, norm, keys, cells = gc.build(cache)
    grp = {k: gc.group(k) for k in keys}
    picks = []
    for f in gc.BASE:
        e = float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - cells[(f, f)])))])
        picks.append(gc.picks(rows, norm[f], e, idle[f])[0])
    qs, cnt = np.unique(np.concatenate(picks), return_counts=True)
    w = dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))
    qbig = {k: float(gears[grp[k]].qn[-1]) for k in keys}
    kwf = {k: sum(wq * g.eta(q, 150.0) for q, wq in w.items()) / E[k] - 1.0 for k, g in gears.items()}
    kwo = {k: gh.held_plus_extra(kw[grp[k]], idle[k][0], idle[grp[k]][0], w, qbig[k]) for k in keys}
    beta_c = gd.fit(cells, {"kwo": kwo, "w": kwf}, "ow")
    coef = LossCurves(tables()).full[gs.T]
    st._G.update(gears=gears, rows=rows, norm=norm, keys=keys, grp=grp, w=w, qbig=qbig, kwf=kwf, coef=coef,
                 beta_c=beta_c)
    with mp.get_context("fork").Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(build_condition, range(len(CONDITIONS)))
    data = {"res": res, "beta_c": [float(x) for x in beta_c]}
    with open(path, "wb") as fh:
        pickle.dump(data, fh)
    return data


def reference_7h(c, beta_c):
    """7h's (i) refitted ow and (iii) frozen slopes, own intercept, for one condition."""
    feat = {"kwo": c["kwo"], "w": c["kw"]}
    i = g5.rms(list(gd.lofo(c["cells"], c["keys"], c["grp"], feat, "ow").values()))
    iii = g5.rms(list(st.frozen_slope_lofo(c["cells"], c["keys"], c["grp"], feat, beta_c[1], beta_c[2]).values()))
    return i, iii


def main(cache):
    data = build_all(cache)
    res, beta_c = data["res"], data["beta_c"]
    if any(v is None for c in res for v in c["cells"].values()):
        raise SystemExit("a cell never crosses 50% on the E grid")
    ref = [reference_7h(c, beta_c) for c in res]
    pooled = {r: fit(res, r) for r in RULES}
    A = {r: held_out(res, r, lambda j, i: i == j) for r in RULES}
    speed = [c["setting"][2] for c in res]
    B = {r: held_out(res, r, lambda j, i: speed[i] == speed[j]) for r in RULES}

    out = []
    p = out.append
    p("Milestone 7i: one rule across 7h's 22 idle conditions, with the competitor's idle cost as a feature; "
      "14 variants, 196 cells per condition, 4312 cells pooled")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py; conditions as gear_pump_settings.py)")
    p("")
    names = {"ow": "a, kW_o, k_w", "owL": "a, kW_o, k_w, P_LS", "owC": "a, S*kW_o, k_w, S*P_LS"}
    p("Pooled fits over all 4312 cells (coefficients; in-sample RMS over the 4312 cells):")
    for r in RULES:
        X, y = stack(res, r)
        p(f"  {r:4s} ({names[r]}): " + ", ".join(f"{x:+.4f}" for x in pooled[r]) +
          f";  RMS {g5.rms(list(y - X @ pooled[r])):.4f}")
    p("")
    p("Per condition: LS standby kW; 7h references (i) refitted ow, (iii) frozen slopes own intercept;")
    p("(A) leave-condition-and-family-out RMS (mean bias) for ow / owL / owC; (B) leave-idle-speed-and-family-out RMS")
    for j, c in enumerate(res):
        p("  " + st.label(c["setting"], c["share"]) + f"  LS {c['pls']:.2f}  (i) {ref[j][0]:.4f}  (iii) "
          f"{ref[j][1]:.4f}  (A) " + " / ".join(f"{A[r][j][0]:.4f} ({A[r][j][1]:+.4f})" for r in RULES) +
          "  (B) " + " / ".join(f"{B[r][j][0]:.4f}" for r in RULES))
    p("")
    old = st_reference_file()
    if old:
        d = max(max(abs(round(ref[j][0], 4) - old[j][0]), abs(round(ref[j][1], 4) - old[j][1]))
                for j in range(len(res)))
        p(f"Check against 7h's results file, (i) ow and (iii) per condition: largest difference {d:.4f}")
    cen = next(j for j, c in enumerate(res) if c["setting"] == CENTRAL and c["share"] == S_C)
    p(f"Check, central condition (i) ow against 7g's 0.0056: {ref[cen][0] - 0.0056:+.4f}")
    p("")
    med = lambda v: float(np.median(v))  # noqa: E731
    for lab, S in (("(A)", A), ("(B)", B)):
        for r in RULES:
            v = [x[0] for x in S[r]]
            p(f"  {lab} {r:4s}: median {med(v):.4f}, max {max(v):.4f}")
    ri = [x[0] for x in ref]
    riii = [x[1] for x in ref]
    p(f"  7h (i) ow: median {med(ri):.4f}, max {max(ri):.4f};  (iii): median {med(riii):.4f}, max {max(riii):.4f}")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    mA = {r: med([x[0] for x in A[r]]) for r in RULES}
    xA = {r: max(x[0] for x in A[r]) for r in RULES}
    best = "owL" if mA["owL"] <= mA["owC"] else "owC"
    n5 = sum(A[best][j][0] <= 1.25 * riii[j] for j in range(len(res)))
    xB = max(x[0] for x in B["owC"])
    N = len(res)
    p("Predictions (LOG.md 7i):")
    p(f"  IC1 owL's P_LS coefficient negative: {ok(pooled['owL'][3] < 0)} ({pooled['owL'][3]:+.4f})")
    p(f"  IC2 (A) ow worst above 0.015 and owL worst at most 0.010: {ok(xA['ow'] > 0.015 and xA['owL'] <= 0.010)} "
      f"(ow {xA['ow']:.4f}, owL {xA['owL']:.4f})")
    p(f"  IC3 (A) owL median at most 1.25 x 7h (i) median 0.0056 = 0.0070: {ok(mA['owL'] <= 0.0070)} "
      f"({mA['owL']:.4f})")
    p(f"  IC4 (A) owC median below owL's: {ok(mA['owC'] < mA['owL'])} ({mA['owC']:.4f} against {mA['owL']:.4f})")
    p(f"  IC5 (A) {best} (the better by median) within 1.25 x 7h (iii) in at least 18: {ok(n5 >= 18)} ({n5} of {N})")
    p(f"  IC6 (B) owC worst at most 0.010: {ok(xB <= 0.010)} ({xB:.4f})")
    p("")
    p("Sources: as gear_pump_settings.py (7h).")
    print("\n".join(out))


def st_reference_file():
    """7h's per-condition (i) ow and (iii) from its results file, in condition order (None if absent)."""
    path = os.path.join(HERE, "gear_pump_settings_results.txt")
    if not os.path.exists(path):
        return None
    vals = []
    for line in open(path):
        if "(i) " in line and "(iii) " in line:
            i = float(line.split("(i) ")[1].split("ow/two")[0].split(" / ")[3])
            iii = float(line.split("(iii) ")[1].split()[0])
            vals.append((i, iii))
    return vals


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
