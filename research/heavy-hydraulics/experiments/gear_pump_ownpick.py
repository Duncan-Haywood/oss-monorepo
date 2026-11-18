"""Milestone 7n: each pump's drag at its own picks, an oracle bound on 7k's one-number idle rule (7m's Next v).

7l and 7m read the drag at one or two flows of the pooled pick weight w(q) (six families' picks, 7e) and found the
one-number rule stays above the two-price rule because one bending family (Danfoss) sets the across-variant slope.
7n reads each variant's drag at the sizes the optimum picks for that variant itself:

  w_g(q) = share of the 384 geometries whose chosen size is q on the diagonal cell (g, g), central setting
  kW_s   = sum_q w_g(q) P_idle,g(q; c)

  owh  = a + b H kW_o + c k_w + d H P_LS       (7j, reference)
  owdw = a + b H (kW_w - P_LS) + c k_w         (7k, reference)
  owd2 = a + b H (kW_2 - P_LS) + c k_w         (7m, reference)
  owhs = a + b H kW_s + c k_w + d H P_LS
  owds = a + b H (kW_s - P_LS) + c k_w

Scored exactly as 7j to 7m: (A) leave-one-condition-and-maker-family-out over 308 diagonals, (B1) the nine half-speed
conditions held out, (B2) S = 0.20 and 0.50 held out. Predictions PV1 to PV7 are in LOG.md (7n).

Usage: python gear_pump_ownpick.py [cache dir] > gear_pump_ownpick_results.txt
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
import gear_pump_onepoint as op  # noqa: E402
import gear_pump_twopoint as tp  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

RULES = ("owh", "owdw", "owd2", "owhs", "owds")


def weight(picks):
    """{q: share} of an array of picked flows."""
    qs, cnt = np.unique(picks, return_counts=True)
    return dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))


def row(rule, r):
    h = r["h"]
    if rule == "owhs":
        return [1.0, h * r["kws"], r["kw"], h * r["pls"]]
    if rule == "owds":
        return [1.0, h * (r["kws"] - r["pls"]), r["kw"]]
    return tp.row(rule, r)


def design(recs, rule):
    return np.array([row(rule, r) for r in recs])


def fit(recs, rule):
    beta, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def held_out(recs, grp, held, rule):
    """As 7j to 7m: errors on the held conditions' diagonals, fitted without them, leave-one-maker-family-out."""
    err = {}
    for gname in sorted(set(grp.values()), key=str):
        train = [r for r in recs if r["c"] not in held and grp[r["f"]] != gname and grp[r["g"]] != gname]
        b = fit(train, rule)
        test = [r for r in recs if r["c"] in held and r["f"] == r["g"] and grp[r["f"]] == gname]
        for r, p in zip(test, design(test, rule) @ b):
            err[(r["c"], r["f"])] = r["e50"] - float(p)
    return err


def main(cache):
    gc.build = gr.memo_build
    conds, keys, grp = one.build(cache)
    gears, E, rows, idle0, kw0, norm, _, cells0 = gr.memo_build(cache)
    picks = []
    for f in gc.BASE:
        e = float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - cells0[(f, f)])))])
        picks.append(gc.picks(rows, norm[f], e, idle0[f])[0])
    w = weight(np.concatenate(picks))
    qstar = op.weighted_median(w)
    q25, q75 = tp.weighted_quantile(w, 0.25), tp.weighted_quantile(w, 0.75)
    own, own_pk = {}, {}
    for k in keys:
        e = float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - cells0[(k, k)])))])
        pk = gc.picks(rows, norm[k], e, idle0[k])[0]
        own_pk[k], own[k] = pk, weight(pk)
    coef = LossCurves(tables()).full[gs.T]

    kww, kw2, kws = [], [], []
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        kww.append({k: gd.pick_weighted_idle(idle[k][0], w) for k in keys})
        kw2.append({k: tp.two_point(idle[k][0], q25, q75) for k in keys})
        kws.append({k: gd.pick_weighted_idle(idle[k][0], own[k]) for k in keys})

    recs = one.records(conds)
    for r in recs:
        for name, src in (("kww", kww), ("kw2", kw2), ("kws", kws)):
            r[name] = src[r["c"]][r["g"]]
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}
    central = next(j for j, c in enumerate(conds) if list(c["setting"]) == list(CENTRAL) and c["share"] == S_C)

    out = []
    p = out.append
    p("Milestone 7n: 7k's one-number idle rule with each variant's drag read at its own picks (kW_s, an oracle) in "
      "place of the pooled pick-weighted kW_w; 7j's 22 idle conditions, 14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")
    p(f"Pooled pick weight w(q) (7e, central setting): q25 = {q25:g}, q* = {qstar:g}, q75 = {q75:g} L/min")
    p("")
    p("Per variant, own picks on the diagonal (central setting; 384 geometries): p25 / median / p75 / mean L/min, "
      "share above Q_L; kW_w, kW_2, kW_s and kW_s/kW_w at the central condition:")
    for k in keys:
        pk = own_pk[k]
        ql = float(gears[grp[k]].qn[-1])
        b = kww[central][k]
        p(f"  {gc.name(k):28s}  {tp.weighted_quantile(own[k], 0.25):5.1f} / {op.weighted_median(own[k]):5.1f} / "
          f"{tp.weighted_quantile(own[k], 0.75):5.1f} / {pk.mean():5.1f}  above {float(np.mean(pk > ql)):.2f}  "
          f"kW_w {b:.3f}  kW_2 {kw2[central][k]:.3f}  kW_s {kws[central][k]:.3f}  s/w {kws[central][k] / b:.3f}")
    kap = {}
    for name, (xs, ys) in (("s2", (kw2, kws)), ("sw", (kww, kws)), ("w2", (kw2, kww))):
        pairs = {j: [(xs[j][k], ys[j][k]) for k in keys] for j in range(n_c)}
        per = [gr.kappa({j: pairs[j]}) for j in range(n_c)]
        kap[name] = gr.kappa(pairs)
        p(f"kappa_{name} (slope of the {'kW_s' if name[0] == 's' else 'kW_w'} on kW_{name[1]} over the 14 variants): "
          f"pooled with condition fixed effects {kap[name]:.3f}; per condition {min(per):.3f} to {max(per):.3f}")
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
    ratio = {r: -allfit[r][3] / allfit[r][1] for r in ("owh", "owhs")}
    p(f"  -d/b (standby kW against drag kW, both per idle hour): owh {ratio['owh']:.2f}, owhs {ratio['owhs']:.2f}")
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
        p(f"  {r:4s}  {g5.rms(list(e.values())):.4f}  (max {max(pc):.4f}; bias {np.mean(list(e.values())):+.4f})")
    p("")
    for name, label in (("B1", "nine half-idle-speed conditions held out together, RMS over 126 diagonals"),
                        ("B2", "S = 0.20 and 0.50 held out together, RMS over 28 diagonals")):
        p(f"({name}) {label} (mean bias):")
        for r in RULES:
            e = list(score[name][r].values())
            p(f"  {r:4s}  {g5.rms(e):.4f}  ({np.mean(e):+.4f})")
    p("")
    show = ("owh", "owdw", "owd2", "owds")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(show))
    for k in keys:
        vals = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in show]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in vals))
    p("")

    A = {r: g5.rms(list(score["A"][r].values())) for r in RULES}
    B1 = g5.rms(list(score["B1"]["owds"].values()))
    B2 = g5.rms(list(score["B2"]["owds"].values()))
    dan = {r: g5.rms([v for (_, f), v in score["A"][r].items() if f == "danfoss"]) for r in ("owdw", "owds")}
    dmed = op.weighted_median(own["danfoss"])
    dsw = kws[central]["danfoss"] / kww[central]["danfoss"]
    d = allfit["owhs"][3]
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7n):")
    p(f"  PV1 Danfoss own-pick median below q* = {qstar:g}: {ok(dmed < qstar)} ({dmed:g} L/min)")
    p(f"  PV2 Danfoss kW_s/kW_w below 0.97: {ok(dsw < 0.97)} ({dsw:.3f})")
    p(f"  PV3 kappa_s2 below 0.859: {ok(kap['s2'] < 0.859)} ({kap['s2']:.3f}; kappa_w2 here {kap['w2']:.3f})")
    p(f"  PV4 owds (A) at most 0.0056: {ok(A['owds'] <= 0.0056)} ({A['owds']:.4f}; owdw {A['owdw']:.4f}, "
      f"owh {A['owh']:.4f})")
    p(f"  PV5 Danfoss (A) under owds below owdw's: {ok(dan['owds'] < dan['owdw'])} "
      f"({dan['owds']:.4f} against {dan['owdw']:.4f})")
    p(f"  PV6 owhs d < 0 and -d/b in [0.90, 1.10]: {ok(d < 0 and 0.90 <= ratio['owhs'] <= 1.10)} "
      f"(d {d:+.4f}, -d/b {ratio['owhs']:.2f})")
    p(f"  PV7 owds B1 and B2 both at most 0.0062: {ok(B1 <= 0.0062 and B2 <= 0.0062)} (B1 {B1:.4f}, B2 {B2:.4f})")
    p("")
    p("Sources: as gear_pump_onerule.py (7j), gear_pump_ratio.py (7k), gear_pump_onepoint.py (7l) and "
      "gear_pump_twopoint.py (7m); kW_s read on each condition's own idle curves at each variant's own central picks.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
