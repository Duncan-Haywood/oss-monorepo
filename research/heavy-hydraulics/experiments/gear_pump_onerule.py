"""Milestone 7j: one selection rule for every idle setting, an independent replication of 7i with two new tests.

7h found that the rule's slopes transfer across idle settings but its intercept does not: the setting changes the
load-sensing pump's standby power P_LS, which the rule does not carry, and the kW_o slope scales with the idle share.
The break-even model charges idle as b (P_LS - P_OC) h, so here the rule takes the idle powers multiplied by the idle
hours per working hour H = S / (1 - S) and is fitted once over all 22 conditions of 7h (4312 cells):

  ow  = a + b kW_o + c k_w                         (7g's rule, setting-blind)
  owl = a + b kW_o + c k_w + d P_LS                (share-blind)
  owh = a + b H kW_o + c k_w + d H P_LS            (idle-hour prices)
  owd = a + b H (kW_o - P_LS) + c k_w              (one price-difference number)
  owc = a + b S kW_o + c k_w + d S P_LS            (7i's owC, scored here post hoc, not registered)

Scores: (A) leave-one-condition-and-maker-family-out, RMS over the 22 x 14 = 308 diagonals; (B1) the nine half-idle-
speed conditions held out together; (B2) S = 0.20 and 0.50 held out together (both also leave-one-maker-family-out).
Check: each condition's own refitted ow reproduces 7h. Predictions SI1 to SI7 are in LOG.md (7j); they were
registered before 7i (gear_pump_idlecost.py) landed, by a parallel run that did not know of it.

Usage: python gear_pump_onerule.py [cache dir] > gear_pump_onerule_results.txt
Needs numpy and h5py (cache shared with 5z to 7h). The 22 conditions' cells are built in parallel (fork, about 14 min
on 4 cores) and kept in <cache>/onerule_cells_7i.json, so a rerun only refits.
"""
import json
import multiprocessing as mp
import os
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

RULES = ("ow", "owl", "owh", "owd", "owc")
CHECK_7H = os.path.join(HERE, "gear_pump_settings_results.txt")
_G = {}


def hours(share):
    """Idle hours per working hour, the record's own still share dropped."""
    return share / (1.0 - share)


def row(rule, kwo, kw, pls, h, s=None):
    """Design row of one cell for one rule (s, the idle share, only for owc)."""
    if rule == "owc":
        return [1.0, s * kwo, kw, s * pls]
    if rule == "ow":
        return [1.0, kwo, kw]
    if rule == "owl":
        return [1.0, kwo, kw, pls]
    if rule == "owh":
        return [1.0, h * kwo, kw, h * pls]
    if rule == "owd":
        return [1.0, h * (kwo - pls), kw]
    raise KeyError(rule)


def design(recs, rule):
    return np.array([row(rule, r["kwo"], r["kw"], r["pls"], r["h"], r.get("s")) for r in recs])


def fit(recs, rule):
    beta, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def records(conds):
    """Flatten per-condition cells into one record per cell: condition index, shape f, drag g, features, E50."""
    out = []
    for j, c in enumerate(conds):
        h = hours(c["share"])
        for (f, g), v in c["cells"].items():
            out.append({"c": j, "f": f, "g": g, "kwo": c["kwo"][g], "kw": c["kwf"][f], "pls": c["pls"], "h": h,
                        "s": c["share"], "e50": v})
    return out


def held_out(recs, grp, held, rule):
    """Errors on the diagonals of the held conditions, fitted without them, leave-one-maker-family-out."""
    err = {}
    for gname in sorted(set(grp.values()), key=str):
        train = [r for r in recs if r["c"] not in held and grp[r["f"]] != gname and grp[r["g"]] != gname]
        b = fit(train, rule)
        test = [r for r in recs if r["c"] in held and r["f"] == r["g"] and grp[r["f"]] == gname]
        for r, p in zip(test, design(test, rule) @ b):
            err[(r["c"], r["f"])] = r["e50"] - float(p)
    return err


def build_condition(j):
    """Cells and features of condition j (forked worker; reads the central build from _G)."""
    setting, share = st.CONDITIONS[j]
    gears, rows, norm, keys, grp, w, qbig, kwf, coef = (_G[k] for k in (
        "gears", "rows", "norm", "keys", "grp", "w", "qbig", "kwf", "coef"))
    gs.S_C = share
    idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
    kw = {k: float(idle[k][0][st.K85]) for k in keys}
    kwo = {k: gh.held_plus_extra(kw[grp[k]], idle[k][0], idle[grp[k]][0], w, qbig[k]) for k in keys}
    cells = {}
    for f in keys:
        for g in keys:
            sh = gs.shares(rows, lambda x, e, f=f: np.minimum(gs.CAP, e * norm[f][x["i"]]), idle[g])
            cells[(f, g)] = gs.crossing(list(gc.E_GRID), sh)
    return {"setting": list(setting), "share": share, "pls": float(idle[keys[0]][1]), "kwo": kwo,
            "cells": cells}


def kid(k):
    return k if isinstance(k, str) else "|".join(map(str, k))


def build(cache):
    """The 22 conditions (cached as JSON), plus keys, maker groups and the shape numbers k_w."""
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
    path = os.path.join(cache, "onerule_cells_7i.json")
    ids = {kid(k): k for k in keys}
    if os.path.exists(path):
        with open(path) as fh:
            raw = json.load(fh)
        conds = [{"setting": c["setting"], "share": c["share"], "pls": c["pls"],
                  "kwo": {ids[a]: v for a, v in c["kwo"].items()},
                  "cells": {(ids[a], ids[b]): v for a, b, v in c["cells"]}} for c in raw]
    else:
        coef = LossCurves(tables()).full[gs.T]
        _G.update(gears=gears, rows=rows, norm=norm, keys=keys, grp=grp, w=w, qbig=qbig, kwf=kwf, coef=coef)
        with mp.get_context("fork").Pool(min(4, os.cpu_count() or 1)) as pool:
            conds = pool.map(build_condition, range(len(st.CONDITIONS)))
        with open(path, "w") as fh:
            json.dump([{"setting": c["setting"], "share": c["share"], "pls": c["pls"],
                        "kwo": {kid(a): v for a, v in c["kwo"].items()},
                        "cells": [[kid(a), kid(b), v] for (a, b), v in c["cells"].items()]} for c in conds], fh)
    for c in conds:
        c["kwf"] = kwf
    return conds, keys, grp


def own_refit(conds, keys, grp):
    """7h's (i): each condition's own ow, refitted leave-one-maker-family-out (the check against 7h)."""
    out = []
    for c in conds:
        feat = {"kwo": c["kwo"], "w": c["kwf"]}
        out.append(g5.rms(list(gd.lofo(c["cells"], keys, grp, feat, "ow").values())))
    return out


def seven_h_ow():
    """7h's committed per-condition (i) ow RMS, in condition order."""
    vals = []
    with open(CHECK_7H) as fh:
        for line in fh:
            if "(i)" in line and "E50 mean" in line:
                vals.append(float(line.split("(i)")[1].split("ow/two")[0].split("/")[3]))
    return vals


def main(cache):
    conds, keys, grp = build(cache)
    if any(v is None for c in conds for v in c["cells"].values()):
        raise SystemExit("a cell never crosses 50% on the E grid")
    recs = records(conds)
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}

    own = own_refit(conds, keys, grp)
    ref = seven_h_ow()
    out = []
    p = out.append
    p("Milestone 7j: one selection rule fitted once over 7h's 22 idle conditions (18 idle settings at S = 0.38, four "
      "other idle shares at the central setting), 14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")
    diff = max(abs(round(a, 4) - b) for a, b in zip(own, ref)) if len(ref) == n_c else float("nan")
    p(f"Check, each condition's own refitted ow against 7h's (i): max difference {diff:.4f} over {len(ref)} of {n_c}")
    p("")
    allfit = {r: fit(recs, r) for r in RULES}
    p("Fits to all 4312 cells (coefficients; in-sample RMS over all cells and over the 308 diagonals):")
    diag = [r for r in recs if r["f"] == r["g"]]
    for r in RULES:
        res_all = np.array([x["e50"] for x in recs]) - design(recs, r) @ allfit[r]
        res_d = np.array([x["e50"] for x in diag]) - design(diag, r) @ allfit[r]
        p(f"  {r:3s}  " + ", ".join(f"{v:+.4f}" for v in allfit[r]) +
          f";  cells {g5.rms(res_all.tolist()):.4f}, diagonals {g5.rms(res_d.tolist()):.4f}")
    b, d = allfit["owh"][1], allfit["owh"][3]
    p(f"  owh: -d/b = {-d / b:.2f} (standby kW against drag kW, both per idle hour)")
    p("")
    score = {}
    for name, sets in (("A", [{j} for j in range(n_c)]), ("B1", [half]), ("B2", [ends])):
        score[name] = {}
        for r in RULES:
            err = {}
            for held in sets:
                err.update(held_out(recs, grp, held, r))
            score[name][r] = err
    p("(A) leave-one-condition-and-maker-family-out, RMS over 308 diagonals (max per-condition RMS; mean bias):")
    for r in RULES:
        e = score["A"][r]
        per = [g5.rms([v for (j, _), v in e.items() if j == c]) for c in range(n_c)]
        p(f"  {r:3s}  {g5.rms(list(e.values())):.4f}  (max {max(per):.4f}; bias {np.mean(list(e.values())):+.4f})")
    p(f"  references using the held condition's own cells (7h): refitted ow median {np.median(own):.4f}, "
      f"pooled over 308 {g5.rms([x for x in own]):.4f} (RMS of per-condition RMS)")
    p("")
    p("Per condition, (A) RMS: ow / owl / owh / owd / owc, and 7h's own refitted ow")
    for j, c in enumerate(conds):
        s, x = c["setting"], c["share"]
        vals = [g5.rms([v for (k, _), v in score["A"][r].items() if k == j]) for r in RULES]
        p(f"  {s[0]:12s} sb {s[1]:3.1f}  n {s[2]:3.1f}  S {x:.2f}  LS {c['pls']:.2f}   " +
          " / ".join(f"{v:.4f}" for v in vals) + f"   own {own[j]:.4f}")
    p("")
    p(f"(B1) nine half-idle-speed conditions held out together (fit on the {n_c - len(half)} working-speed ones), "
      "RMS over 126 diagonals (mean bias):")
    for r in RULES:
        e = list(score["B1"][r].values())
        p(f"  {r:3s}  {g5.rms(e):.4f}  ({np.mean(e):+.4f})")
    p(f"(B2) S = 0.20 and 0.50 held out together (fit on the other {n_c - len(ends)}), RMS over 28 diagonals "
      "(mean bias):")
    for r in RULES:
        e = list(score["B2"][r].values())
        p(f"  {r:3s}  {g5.rms(e):.4f}  ({np.mean(e):+.4f})")
    p("")
    A = {r: g5.rms(list(score["A"][r].values())) for r in RULES}
    B1 = g5.rms(list(score["B1"]["owh"].values()))
    B2 = g5.rms(list(score["B2"]["owh"].values()))
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7j; owc, 7i's form, is post hoc and in no prediction):")
    p(f"  SI1 owh (A) at most 0.0070: {ok(A['owh'] <= 0.0070)} ({A['owh']:.4f})")
    p(f"  SI2 owh (A) at least 50% below ow: {ok(A['owh'] <= 0.5 * A['ow'])} ({A['owh'] / A['ow'] - 1:+.0%})")
    p(f"  SI3 owh (A) below owl: {ok(A['owh'] < A['owl'])} ({A['owh']:.4f} against {A['owl']:.4f})")
    p(f"  SI4 owh d < 0 and -d/b in [0.5, 2]: {ok(d < 0 and 0.5 <= -d / b <= 2)} (d {d:+.4f}, -d/b {-d / b:.2f})")
    p(f"  SI5 owh (B1) at most 0.010: {ok(B1 <= 0.010)} ({B1:.4f})")
    p(f"  SI6 owd (A) within 10% of owh: {ok(abs(A['owd'] / A['owh'] - 1) <= 0.10)} ({A['owd'] / A['owh'] - 1:+.0%})")
    p(f"  SI7 owh (B2) at most 0.010: {ok(B2 <= 0.010)} ({B2:.4f})")
    p("")
    p("Sources: as gear_pump_settings.py (7h); idle hours per working hour H = S / (1 - S), the record's own still "
      "share dropped.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
