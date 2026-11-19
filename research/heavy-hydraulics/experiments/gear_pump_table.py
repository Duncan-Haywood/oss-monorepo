"""Milestone 7q: a pick table by drag-curve class, the builder-side stand-in for 7p's leak-free own picks.

7p's owdm read the held-out pump's own picks at e_m (the other maker groups' mean central E50) and kept two thirds of
7n's oracle gain (0.0047 against owh's 0.0056 in (A)), but those picks still run the full motion model on the held-out
pump. 7q replaces them with a table a publisher could print once: the picks of the pumps it has modelled (donors, all
outside the held-out maker group), at the same e_m, looked up by one data-sheet number, the bend of the idle curve

  b(k)    = P_idle,k(79 L/min) / P_idle,k(64 L/min)    (central condition; 7m's pick quartiles)
  w_j(q)  = share of the 384 geometries picking q for donor j at e_m(k)
  kW_t1   = sum_q w_j*(q) P_idle,k(q; c),  j* the donor nearest in |log b|
  kW_t3   = the same with the mean weight of the three nearest donors
  kW_tp   = the same with the mean weight of every donor (no class)

  owh, owdw, owds, owdm   references (7j, 7k, 7n, 7p)
  owdt1, owdt3, owdtp     owds form; the fold's test rows read kW_t1 / kW_t3 / kW_tp, training rows keep kW_s

Scored exactly as 7j to 7p. Predictions PQ1 to PQ7 are in LOG.md (7q).

Usage: python gear_pump_table.py [cache dir] > gear_pump_table_results.txt
Needs numpy and h5py; reuses 7j's cell cache (<cache>/onerule_cells_7i.json; built by gear_pump_onerule.py if absent).
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import gear_pump_five as g5  # noqa: E402
import gear_pump_chosen as gc  # noqa: E402
import gear_pump_pickdrag as gd  # noqa: E402
import gear_pump_settings as st  # noqa: E402
import gear_pump_onerule as one  # noqa: E402
import gear_pump_ratio as gr  # noqa: E402
import gear_pump_onepoint as op  # noqa: E402
import gear_pump_ownpick as ow  # noqa: E402
import gear_pump_leak as lk  # noqa: E402
import gear_pump_shape as gs  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

Q_LO, Q_HI = 64.0, 79.0
RULES = ("owh", "owdw", "owds", "owdm", "owdt1", "owdt3", "owdtp")
TABLE = {"owdt1": "kwt1", "owdt3": "kwt3", "owdtp": "kwtp"}


def bend(poc):
    """b = P_idle(79) / P_idle(64) on an idle curve sampled on GRID."""
    return float(poc[gd.grid_index(Q_HI)] / poc[gd.grid_index(Q_LO)])


def donors(b, grp, k, n=None):
    """Variants outside k's maker group, nearest first in |log b| (ties by name); the first n, or all."""
    out = sorted((j for j in b if grp[j] != grp[k]), key=lambda j: (abs(math.log(b[j] / b[k])), str(j)))
    return out if n is None else out[:n]


def mean_weight(ws):
    """Equal-share mean of {q: share} weights."""
    tot = {}
    for w in ws:
        for q, v in w.items():
            tot[q] = tot.get(q, 0.0) + v / len(ws)
    return tot


def row(rule, r, test=False):
    if rule in TABLE:
        x = r[TABLE[rule] if test else "kws"]
        return [1.0, r["h"] * (x - r["pls"]), r["kw"]]
    return lk.row(rule, r, test)


def design(recs, rule, test=False):
    return np.array([row(rule, r, test) for r in recs])


def fit(recs, rule):
    beta, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def held_out(recs, grp, held, rule):
    """As 7j to 7p (training rows read kW_s); the fold's test rows read the table feature."""
    err = {}
    for gname in sorted(set(grp.values()), key=str):
        train = [r for r in recs if r["c"] not in held and grp[r["f"]] != gname and grp[r["g"]] != gname]
        b = fit(train, rule)
        test = [r for r in recs if r["c"] in held and r["f"] == r["g"] and grp[r["f"]] == gname]
        for r, p in zip(test, design(test, rule, test=True) @ b):
            err[(r["c"], r["f"])] = r["e50"] - float(p)
    return err


def main(cache):
    gc.build = gr.memo_build
    conds, keys, grp = one.build(cache)
    gears, E, rows, idle0, kw0, norm, _, cells0 = gr.memo_build(cache)
    picks = []
    for f in gc.BASE:
        picks.append(gc.picks(rows, norm[f], lk.nearest(cells0[(f, f)]), idle0[f])[0])
    w = ow.weight(np.concatenate(picks))
    e50 = {k: float(cells0[(k, k)]) for k in keys}
    es = {k: lk.nearest(e50[k]) for k in keys}
    em = {k: lk.nearest(lk.others_mean(e50, grp, k)) for k in keys}
    b = {k: bend(idle0[k][0]) for k in keys}

    memo = {}

    def pw(j, e):
        """Donor j's own picks at efficiency e (what the publisher tabulates)."""
        if (j, e) not in memo:
            memo[(j, e)] = ow.weight(gc.picks(rows, norm[j], e, idle0[j])[0])
        return memo[(j, e)]

    own_s = {k: pw(k, es[k]) for k in keys}
    own_m = {k: pw(k, em[k]) for k in keys}
    tab = {"t1": {}, "t3": {}, "tp": {}}
    near = {}
    for k in keys:
        d = donors(b, grp, k)
        near[k] = d[:3]
        tab["t1"][k] = pw(d[0], em[k])
        tab["t3"][k] = mean_weight([pw(j, em[k]) for j in d[:3]])
        tab["tp"][k] = mean_weight([pw(j, em[k]) for j in d])
    coef = LossCurves(tables()).full[gs.T]

    feat = {"kww": [], "kws": [], "kwm": [], "kwt1": [], "kwt3": [], "kwtp": []}
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        feat["kww"].append({k: gd.pick_weighted_idle(idle[k][0], w) for k in keys})
        feat["kws"].append({k: gd.pick_weighted_idle(idle[k][0], own_s[k]) for k in keys})
        feat["kwm"].append({k: gd.pick_weighted_idle(idle[k][0], own_m[k]) for k in keys})
        for v in tab:
            feat["kw" + v].append({k: gd.pick_weighted_idle(idle[k][0], tab[v][k]) for k in keys})

    recs = one.records(conds)
    for r in recs:
        for name, src in feat.items():
            r[name] = src[r["c"]][r["g"]]
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}
    central = next(j for j, c in enumerate(conds) if list(c["setting"]) == list(CENTRAL) and c["share"] == S_C)

    out = []
    p = out.append
    p("Milestone 7q: a pick table by drag-curve class (bend b = P_idle(79)/P_idle(64) L/min, central idle curve); the "
      "held-out variant's drag read on its own idle curve over donor picks at 7p's e_m, donors outside its maker "
      "group; 7j's 22 idle conditions, 14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")
    p("Per variant at the central condition: bend b, three nearest donors (nearest first), own-pick median at e_m, "
      "table medians t1 / t3 / tp (L/min), kW_s, kW_m/kW_s, kW_t1/kW_s, kW_t3/kW_s, kW_tp/kW_s:")
    for k in keys:
        s = feat["kws"][central][k]
        p(f"  {gc.name(k):28s}  b {b[k]:.3f}  donors {', '.join(gc.name(j) for j in near[k])}")
        p(f"  {'':28s}  median {op.weighted_median(own_m[k]):5.1f} | {op.weighted_median(tab['t1'][k]):5.1f} / "
          f"{op.weighted_median(tab['t3'][k]):5.1f} / {op.weighted_median(tab['tp'][k]):5.1f}  kW_s {s:.3f}  "
          f"m {feat['kwm'][central][k] / s:.3f}  t1 {feat['kwt1'][central][k] / s:.3f}  "
          f"t3 {feat['kwt3'][central][k] / s:.3f}  tp {feat['kwtp'][central][k] / s:.3f}")
    p("")

    score = {"A": {}}
    for r in RULES:
        e = {}
        for j in range(n_c):
            e.update(held_out(recs, grp, {j}, r))
        score["A"][r] = e
    for name, held in (("B1", half), ("B2", ends)):
        score[name] = {r: held_out(recs, grp, held, r) for r in RULES}
    p("(A) leave-one-condition-and-maker-family-out, RMS over 308 diagonals (max per-condition RMS; mean bias):")
    for r in RULES:
        e = score["A"][r]
        pc = [g5.rms([v for (j, _), v in e.items() if j == c]) for c in range(n_c)]
        p(f"  {r:5s}  {g5.rms(list(e.values())):.4f}  (max {max(pc):.4f}; bias {np.mean(list(e.values())):+.4f})")
    p("")
    for name, label in (("B1", "nine half-idle-speed conditions held out together, RMS over 126 diagonals"),
                        ("B2", "S = 0.20 and 0.50 held out together, RMS over 28 diagonals")):
        p(f"({name}) {label} (mean bias):")
        for r in RULES:
            e = list(score[name][r].values())
            p(f"  {r:5s}  {g5.rms(e):.4f}  ({np.mean(e):+.4f})")
    p("")
    show = ("owh", "owdm", "owdt1", "owdt3", "owdtp")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(show))
    per = {}
    for k in keys:
        per[k] = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in show]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in per[k]))
    rest = [k for k in keys if k != "danfoss"]
    p("Post hoc (not registered): (A) RMS over the 286 diagonals of the 13 variants other than Danfoss: " +
      ", ".join(f"{r} {g5.rms([v for (_, f), v in score['A'][r].items() if f in rest]):.4f}" for r in RULES))
    p("")

    A = {r: round(g5.rms(list(score["A"][r].values())), 4) for r in RULES}  # verdicts on the printed figures
    B1 = {r: g5.rms(list(score["B1"][r].values())) for r in RULES}
    rd = feat["kwt1"][central]["danfoss"] / feat["kws"][central]["danfoss"]
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7q):")
    p(f"  PQ1 Danfoss kW_t1/kW_s at the central condition at least 1.05: {ok(round(rd, 3) >= 1.05)} ({rd:.3f})")
    p(f"  PQ2 owdt1 (A) below owh: {ok(A['owdt1'] < A['owh'])} ({A['owdt1']:.4f} against {A['owh']:.4f})")
    p(f"  PQ3 owdtp (A) below owh: {ok(A['owdtp'] < A['owh'])} ({A['owdtp']:.4f} against {A['owh']:.4f})")
    p(f"  PQ4 owdt1 (A) at most owdtp: {ok(A['owdt1'] <= A['owdtp'])} ({A['owdt1']:.4f}, {A['owdtp']:.4f})")
    best = min(A["owdt1"], A["owdt3"], A["owdtp"])
    p(f"  PQ5 no table rule reaches owdm in (A): {ok(best > A['owdm'])} (best {best:.4f}; owdm {A['owdm']:.4f})")
    dan = dict(zip(show, per["danfoss"]))
    p(f"  PQ6 Danfoss (A) under owdt1 above owh's: {ok(dan['owdt1'] > dan['owh'])} "
      f"({dan['owdt1']:.4f} against {dan['owh']:.4f})")
    p(f"  PQ7 owdt1 B1 at most owh's: {ok(round(B1['owdt1'], 4) <= round(B1['owh'], 4))} "
      f"({B1['owdt1']:.4f} against {B1['owh']:.4f})")
    p("")
    p("Sources: as gear_pump_onerule.py (7j), gear_pump_ratio.py (7k), gear_pump_ownpick.py (7n) and gear_pump_leak.py "
      "(7p); every feature read on each condition's own idle curves with the pick weight fixed at the central setting.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
