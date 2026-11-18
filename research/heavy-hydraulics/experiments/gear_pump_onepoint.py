"""Milestone 7l: a builder-side drag read for 7k's one-number idle rule. The drag at one flow, the picks' median.

7k found the one-number rule owdw = a + b H (kW_w - P_LS) + c k_w scores as well as 7j's two-price rule once the
drag is read at the optimum's picks (kW_w = sum_q w(q) P_idle,g(q; c)), but kW_w needs 7e's pick weight w(q), which a
builder does not have. Here the drag is read at one flow q*, the w-weighted median of the central picks (fixed before
any 7l number was computed), from each variant's own idle curve at each condition:

  owh  = a + b H kW_o + c k_w + d H P_LS       (7j, reference)
  owd  = a + b H (kW_o - P_LS) + c k_w         (7j, reference)
  owdw = a + b H (kW_w - P_LS) + c k_w         (7k, reference; needs w(q))
  owhq = a + b H kW_q* + c k_w + d H P_LS
  owdq = a + b H (kW_q* - P_LS) + c k_w

Scored exactly as 7j/7k: (A) leave-one-condition-and-maker-family-out over 308 diagonals, (B1) the nine half-speed
conditions held out, (B2) S = 0.20 and 0.50 held out. Diagnostic: kappa_q, the slope of kW_w on kW_q* over the 14
variants with a condition fixed effect. Sensitivity: owdq's (A) with the read at 60, 65, 72, 80 and 85 L/min.
Predictions PX1 to PX7 are in LOG.md (7l).

Usage: python gear_pump_onepoint.py [cache dir] > gear_pump_onepoint_results.txt
Needs numpy and h5py; reuses 7j's cell cache (<cache>/onerule_cells_7i.json; built by gear_pump_onerule.py if absent).
"""
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
import gear_pump_settings as st  # noqa: E402
import gear_pump_onerule as one  # noqa: E402
import gear_pump_ratio as gr  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

RULES = ("owh", "owd", "owdw", "owhq", "owdq")
SWEEP = (60.0, 65.0, 72.0, 80.0, 85.0)


def weighted_median(w):
    """Smallest q whose cumulative weight reaches one half; w: {q: weight}, weights summing to 1."""
    acc = 0.0
    for q in sorted(w):
        acc += w[q]
        if acc >= 0.5 - 1e-12:
            return float(q)
    raise ValueError("weights do not reach one half")


def row(rule, r, key="kwq"):
    """Design row of one cell record for one rule; key names the one-point feature for owhq/owdq."""
    h = r["h"]
    if rule == "owh":
        return [1.0, h * r["kwo"], r["kw"], h * r["pls"]]
    if rule == "owd":
        return [1.0, h * (r["kwo"] - r["pls"]), r["kw"]]
    if rule == "owdw":
        return [1.0, h * (r["kww"] - r["pls"]), r["kw"]]
    if rule == "owhq":
        return [1.0, h * r[key], r["kw"], h * r["pls"]]
    if rule == "owdq":
        return [1.0, h * (r[key] - r["pls"]), r["kw"]]
    raise KeyError(rule)


def design(recs, rule, key="kwq"):
    return np.array([row(rule, r, key) for r in recs])


def fit(recs, rule, key="kwq"):
    beta, *_ = np.linalg.lstsq(design(recs, rule, key), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def held_out(recs, grp, held, rule, key="kwq"):
    """As 7j/7k: errors on the held conditions' diagonals, fitted without them, leave-one-maker-family-out."""
    err = {}
    for gname in sorted(set(grp.values()), key=str):
        train = [r for r in recs if r["c"] not in held and grp[r["f"]] != gname and grp[r["g"]] != gname]
        b = fit(train, rule, key)
        test = [r for r in recs if r["c"] in held and r["f"] == r["g"] and grp[r["f"]] == gname]
        for r, p in zip(test, design(test, rule, key) @ b):
            err[(r["c"], r["f"])] = r["e50"] - float(p)
    return err


def score_A(recs, grp, n_c, rule, key="kwq"):
    err = {}
    for j in range(n_c):
        err.update(held_out(recs, grp, {j}, rule, key))
    return err


def main(cache):
    gc.build = gr.memo_build
    conds, keys, grp = one.build(cache)
    gears, E, rows, idle0, kw0, norm, _, cells0 = gr.memo_build(cache)
    picks = []
    for f in gc.BASE:
        e = float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - cells0[(f, f)])))])
        picks.append(gc.picks(rows, norm[f], e, idle0[f])[0])
    qs, cnt = np.unique(np.concatenate(picks), return_counts=True)
    w = dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))
    qstar = weighted_median(w)
    qmean = float(sum(q * v for q, v in w.items()))
    coef = LossCurves(tables()).full[gs.T]
    for q in (qstar,) + SWEEP:
        j = gd.grid_index(q)
        if not (0 <= j < len(GRID)) or abs(GRID[j] - q) > 1e-9:
            raise SystemExit(f"{q} L/min is not on the idle-curve grid")

    kww, kwq = [], []
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        kww.append({k: gd.pick_weighted_idle(idle[k][0], w) for k in keys})
        kwq.append({q: {k: float(idle[k][0][gd.grid_index(q)]) for k in keys} for q in (qstar,) + SWEEP})

    recs = one.records(conds)
    for r in recs:
        r["kww"] = kww[r["c"]][r["g"]]
        r["kwq"] = kwq[r["c"]][qstar][r["g"]]
        for q in SWEEP:
            r[f"kw{q:g}"] = kwq[r["c"]][q][r["g"]]
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}
    central = next(j for j, c in enumerate(conds) if list(c["setting"]) == list(CENTRAL) and c["share"] == S_C)

    out = []
    p = out.append
    p("Milestone 7l: 7k's one-number idle rule with the drag read at one flow (the picks' median) in place of the "
      "pick-weighted kW_w; 7j's 22 idle conditions, 14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")
    p(f"Pick weight w(q) (7e, central setting): {len(w)} sizes from {min(w):g} to {max(w):g} L/min; weighted median "
      f"q* = {qstar:g} L/min, weighted mean {qmean:.1f} L/min")
    p("")
    p("The drag at q* against the pick-weighted drag, per variant (central condition):")
    for k in keys:
        a, b = kwq[central][qstar][k], kww[central][k]
        p(f"  {gc.name(k):28s}  kW_o {conds[central]['kwo'][k]:.3f}  kW_w {b:.3f}  kW_q* {a:.3f}  "
          f"kW_w/kW_q* {b / a:.3f}")
    pairs = {j: [(kwq[j][qstar][k], kww[j][k]) for k in keys] for j in range(n_c)}
    kap = gr.kappa(pairs)
    per = [gr.kappa({j: pairs[j]}) for j in range(n_c)]
    p(f"kappa_q (slope of kW_w on kW_q* over the 14 variants): pooled with condition fixed effects {kap:.3f}; per "
      f"condition {min(per):.3f} to {max(per):.3f}")
    p("")

    allfit = {r: fit(recs, r) for r in RULES}
    diag = [r for r in recs if r["f"] == r["g"]]
    y = np.array([x["e50"] for x in recs])
    yd = np.array([x["e50"] for x in diag])
    p("Fits to all 4312 cells (coefficients; in-sample RMS over all cells and over the 308 diagonals):")
    for r in RULES:
        p(f"  {r:4s}  " + ", ".join(f"{v:+.4f}" for v in allfit[r]) +
          f";  cells {g5.rms((y - design(recs, r) @ allfit[r]).tolist()):.4f}, "
          f"diagonals {g5.rms((yd - design(diag, r) @ allfit[r]).tolist()):.4f}")
    ratio = {r: -allfit[r][3] / allfit[r][1] for r in ("owh", "owhq")}
    p(f"  -d/b (standby kW against drag kW, both per idle hour): owh {ratio['owh']:.2f}, owhq {ratio['owhq']:.2f}")
    p("")

    score = {"A": {r: score_A(recs, grp, n_c, r) for r in RULES}}
    for name, held in (("B1", half), ("B2", ends)):
        score[name] = {r: held_out(recs, grp, held, r) for r in RULES}
    p("(A) leave-one-condition-and-maker-family-out, RMS over 308 diagonals (max per-condition RMS; mean bias):")
    for r in RULES:
        e = score["A"][r]
        pc = [g5.rms([v for (j, _), v in e.items() if j == c]) for c in range(n_c)]
        p(f"  {r:4s}  {g5.rms(list(e.values())):.4f}  (max {max(pc):.4f}; bias {np.mean(list(e.values())):+.4f})")
    p("")
    for name, label in (("B1", "nine half-idle-speed conditions held out together, RMS over 126 diagonals"),
                        ("B2", "S = 0.20 and 0.50 held out together, RMS over 28 diagonals")):
        p(f"({name}) {label} (mean bias):")
        for r in RULES:
            e = list(score[name][r].values())
            p(f"  {r:4s}  {g5.rms(e):.4f}  ({np.mean(e):+.4f})")
    p("")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): owh / owdw / owdq")
    for k in keys:
        vals = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in ("owh", "owdw", "owdq")]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in vals))
    p("")
    sweep = {}
    for q in SWEEP:
        sweep[q] = g5.rms(list(score_A(recs, grp, n_c, "owdq", f"kw{q:g}").values()))
    A = {r: g5.rms(list(score["A"][r].values())) for r in RULES}
    sweep[qstar] = A["owdq"]
    p("Sensitivity: owdq (A) RMS with the one-point read at q (L/min):")
    for q in sorted(sweep):
        p(f"  q {q:5.1f}  {sweep[q]:.4f}" + ("   (q*)" if q == qstar else ""))
    qbest = min(sweep, key=sweep.get)
    p("")

    B1 = g5.rms(list(score["B1"]["owdq"].values()))
    B2 = g5.rms(list(score["B2"]["owdq"].values()))
    dan = {r: g5.rms([v for (_, f), v in score["A"][r].items() if f == "danfoss"]) for r in ("owdw", "owdq")}
    d = allfit["owhq"][3]
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7l):")
    p(f"  PX1 pooled kappa_q in [0.95, 1.05]: {ok(0.95 <= kap <= 1.05)} ({kap:.3f})")
    p(f"  PX2 owhq d < 0 and -d/b in [0.90, 1.10]: {ok(d < 0 and 0.90 <= ratio['owhq'] <= 1.10)} "
      f"(d {d:+.4f}, -d/b {ratio['owhq']:.2f})")
    p(f"  PX3 owdq (A) at most 0.0062: {ok(A['owdq'] <= 0.0062)} ({A['owdq']:.4f}; owdw here {A['owdw']:.4f})")
    p(f"  PX4 owdq (A) below owd's 0.0068: {ok(A['owdq'] < 0.0068)} ({A['owdq']:.4f}; owd here {A['owd']:.4f})")
    p(f"  PX5 owdq B1 and B2 both at most 0.0070: {ok(B1 <= 0.0070 and B2 <= 0.0070)} (B1 {B1:.4f}, B2 {B2:.4f})")
    p(f"  PX6 Danfoss (A) under owdq below owdw's: {ok(dan['owdq'] < dan['owdw'])} "
      f"({dan['owdq']:.4f} against {dan['owdw']:.4f})")
    p(f"  PX7 best sweep q within 10 L/min of q*: {ok(abs(qbest - qstar) <= 10)} (best {qbest:g}, q* {qstar:g})")
    p("")
    p("Sources: as gear_pump_onerule.py (7j) and gear_pump_ratio.py (7k); kW_q* read on each condition's own idle "
      "curve at the w-weighted median of 7e's central picks.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
