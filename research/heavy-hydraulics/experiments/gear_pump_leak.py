"""Milestone 7p: does 7n's own-pick oracle leak the answer? Own picks read at an efficiency the held-out cell never saw.

7n read each variant's own picks at the grid E nearest that variant's own central diagonal E50, the quantity the
held-out score (A) then predicts. 7p keeps everything else of 7n fixed and moves only the held-out variant's pick
efficiency to one that does not use its own E50:

  e_m(k)   = grid E nearest the mean central diagonal E50 of the variants outside k's maker group
  e_c(k)   = grid E nearest k's own catalogue index E (7e's index, read off the data sheet)
  kW_s,m / kW_s,c = 7n's kW_s with the picks taken at e_m / e_c

  owh   = a + b H kW_o + c k_w + d H P_LS      (7j, reference)
  owdw  = a + b H (kW_w - P_LS) + c k_w        (7k, reference)
  owds  = a + b H (kW_s - P_LS) + c k_w        (7n's oracle, reference)
  owdm  = owds form; the fold's test rows use kW_s,m, training rows keep kW_s
  owdc  = owds form; the fold's test rows use kW_s,c, training rows keep kW_s
  owdcc = owds form with kW_s,c on every row

Scored exactly as 7j to 7o. Predictions PX1 to PX6 are in LOG.md (7p).

Usage: python gear_pump_leak.py [cache dir] > gear_pump_leak_results.txt
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
import gear_pump_ownpick as ow  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

RULES = ("owh", "owdw", "owds", "owdm", "owdc", "owdcc")
# rule -> (feature on training rows, feature on the fold's test rows)
FEAT = {"owds": ("kws", "kws"), "owdm": ("kws", "kwm"), "owdc": ("kws", "kwc"), "owdcc": ("kwc", "kwc")}


def nearest(e):
    """Grid E nearest e (7n's rule for the pick efficiency)."""
    return float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - e)))])


def others_mean(e50, grp, k):
    """Mean central diagonal E50 over the variants outside k's maker group (e50: {key: E50})."""
    return float(np.mean([v for j, v in e50.items() if grp[j] != grp[k]]))


def row(rule, r, test=False):
    if rule in FEAT:
        x = r[FEAT[rule][1 if test else 0]]
        return [1.0, r["h"] * (x - r["pls"]), r["kw"]]
    return ow.row(rule, r)


def design(recs, rule, test=False):
    return np.array([row(rule, r, test) for r in recs])


def fit(recs, rule):
    beta, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def held_out(recs, grp, held, rule):
    """As 7j to 7o (training rows as 7n); the fold's test rows read their own feature (FEAT)."""
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
        picks.append(gc.picks(rows, norm[f], nearest(cells0[(f, f)]), idle0[f])[0])
    w = ow.weight(np.concatenate(picks))
    e50 = {k: float(cells0[(k, k)]) for k in keys}
    eff = {"s": {k: nearest(e50[k]) for k in keys},
           "m": {k: nearest(others_mean(e50, grp, k)) for k in keys},
           "c": {k: nearest(float(E[k])) for k in keys}}
    own = {v: {k: ow.weight(gc.picks(rows, norm[k], eff[v][k], idle0[k])[0]) for k in keys} for v in eff}
    coef = LossCurves(tables()).full[gs.T]

    feat = {"kww": [], "kws": [], "kwm": [], "kwc": []}
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        feat["kww"].append({k: gd.pick_weighted_idle(idle[k][0], w) for k in keys})
        for v in eff:
            feat["kw" + v].append({k: gd.pick_weighted_idle(idle[k][0], own[v][k]) for k in keys})

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
    p("Milestone 7p: 7n's own-pick oracle kW_s with the held-out variant's picks read at an efficiency that does not "
      "use its own E50 (e_m: the other maker groups' mean central E50; e_c: its catalogue index E); 7j's 22 idle "
      "conditions, 14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")
    p("Per variant at the central condition: pick efficiency at E50 / e_m / e_c (grid E), own-pick median (L/min) at "
      "each, kW_s, kW_s,m/kW_s, kW_s,c/kW_s:")
    for k in keys:
        s = feat["kws"][central][k]
        p(f"  {gc.name(k):28s}  E {eff['s'][k]:.4f} / {eff['m'][k]:.4f} / {eff['c'][k]:.4f}  median "
          f"{op.weighted_median(own['s'][k]):5.1f} / {op.weighted_median(own['m'][k]):5.1f} / "
          f"{op.weighted_median(own['c'][k]):5.1f}  kW_s {s:.3f}  m/s {feat['kwm'][central][k] / s:.3f}  "
          f"c/s {feat['kwc'][central][k] / s:.3f}")
    gap = {v: float(np.mean([abs(eff[v][k] - eff["s"][k]) for k in keys])) for v in ("m", "c")}
    p(f"Mean |pick E - E50 grid E| over the 14 variants: e_m {gap['m']:.4f}, e_c {gap['c']:.4f}")
    p("")

    allfit = {r: fit(recs, r) for r in RULES}
    diag = [r for r in recs if r["f"] == r["g"]]
    y = np.array([x["e50"] for x in recs])
    yd = np.array([x["e50"] for x in diag])
    p("Fits to all 4312 cells (training-row features; coefficients; in-sample RMS over all cells and the 308 "
      "diagonals):")
    for r in RULES:
        p(f"  {r:5s}  " + ", ".join(f"{v:+.4f}" for v in allfit[r]) +
          f";  cells {g5.rms((y - design(recs, r) @ allfit[r]).tolist()):.4f}, "
          f"diagonals {g5.rms((yd - design(diag, r) @ allfit[r]).tolist()):.4f}")
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
    show = ("owh", "owds", "owdm", "owdc", "owdcc")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(show))
    for k in keys:
        vals = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in show]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in vals))
    p("")

    A = {r: g5.rms(list(score["A"][r].values())) for r in RULES}
    B1 = g5.rms(list(score["B1"]["owdm"].values()))
    dmed = op.weighted_median(own["m"]["danfoss"])
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7p):")
    p(f"  PX1 Danfoss own-pick median at e_m below 72 L/min: {ok(dmed < 72)} ({dmed:g} L/min; at E50 "
      f"{op.weighted_median(own['s']['danfoss']):g})")
    p(f"  PX2 owdm (A) at most 0.0049: {ok(round(A['owdm'], 4) <= 0.0049)} ({A['owdm']:.4f}; owds {A['owds']:.4f})")
    p(f"  PX3 owdc (A) at most 0.0049: {ok(round(A['owdc'], 4) <= 0.0049)} ({A['owdc']:.4f})")
    p(f"  PX4 owdm and owdc both below owh in (A): {ok(A['owdm'] < A['owh'] and A['owdc'] < A['owh'])} "
      f"({A['owdm']:.4f}, {A['owdc']:.4f} against {A['owh']:.4f})")
    p(f"  PX5 owdcc (A) below owh's: {ok(A['owdcc'] < A['owh'])} ({A['owdcc']:.4f} against {A['owh']:.4f})")
    p(f"  PX6 owdm B1 at most 0.0056: {ok(round(B1, 4) <= 0.0056)} ({B1:.4f})")
    p("")
    p("Sources: as gear_pump_onerule.py (7j), gear_pump_ratio.py (7k) and gear_pump_ownpick.py (7n); every feature read "
      "on each condition's own idle curves with the pick weight fixed at the central setting.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
