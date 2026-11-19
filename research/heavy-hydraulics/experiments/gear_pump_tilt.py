"""Milestone 7o: a builder-side stand-in for each pump's own picks, the published pick weight tilted by the pump's drag.

7n showed 7k's one-number idle rule beats the two-price rule once each variant's drag is averaged over its own picks
(kW_s, an oracle: it needs the full motion model). 7o replaces the oracle with something a builder can compute from the
published pooled pick weight w(q) and the pump's own idle curve:

  Pbar(q)       = mean of the six BASE families' idle curves, central condition
  wt_g(q; lam)  ~ w(q) exp(-lam (P_idle,g(q) - Pbar(q))), central condition, normalised (lam = 0 gives w)
  kW_t          = sum_q wt_g(q) P_idle,g(q; c)

lam is one published constant, calibrated on the BASE families only (least squares of kW_t against kW_s at the central
condition, grid 0 to 20 per kW in 0.05 steps); in each held-out score the held-out maker family is also dropped from
the calibration. Rules (one pooled fit each):

  owh  = a + b H kW_o + c k_w + d H P_LS       (7j, reference)
  owdw = a + b H (kW_w - P_LS) + c k_w         (7k, reference)
  owds = a + b H (kW_s - P_LS) + c k_w         (7n's oracle, reference)
  owht = a + b H kW_t + c k_w + d H P_LS
  owdt = a + b H (kW_t - P_LS) + c k_w

Scored exactly as 7j to 7n. Predictions PL1 to PL7 are in LOG.md (7o).

Usage: python gear_pump_tilt.py [cache dir] > gear_pump_tilt_results.txt
Needs numpy and h5py; reuses 7j's cell cache (<cache>/onerule_cells_7i.json; built by gear_pump_onerule.py if absent).
"""
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
import gear_pump_twopoint as tp  # noqa: E402
import gear_pump_ownpick as ow  # noqa: E402
import gear_pump_shape as gs  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

RULES = ("owh", "owdw", "owds", "owht", "owdt")
LAMBDAS = np.round(np.arange(0.0, 20.0 + 1e-9, 0.05), 2)
SWEEP = (0.0, 0.5, 1.0, 2.0, 4.0, 8.0)
ALL = "all six"


def tilt(w, poc, pbar, lam):
    """w(q) exp(-lam (poc(q) - pbar(q))), normalised; poc and pbar on GRID, w: {q: share}."""
    qs = sorted(w)
    d = np.array([poc[gd.grid_index(q)] - pbar[gd.grid_index(q)] for q in qs])
    x = np.array([w[q] for q in qs]) * np.exp(-lam * (d - d.min()))
    x /= x.sum()
    return dict(zip(qs, x.tolist()))


def calibrate(w, poc0, pbar, kws0, fams):
    """lam on LAMBDAS minimising sum over fams of (kW_t - kW_s)^2 at the central condition."""
    sse = [sum((gd.pick_weighted_idle(poc0[f], tilt(w, poc0[f], pbar, lam)) - kws0[f]) ** 2 for f in fams)
           for lam in LAMBDAS]
    return float(LAMBDAS[int(np.argmin(sse))])


def row(rule, r):
    h = r["h"]
    if rule == "owht":
        return [1.0, h * r["kwt"], r["kw"], h * r["pls"]]
    if rule == "owdt":
        return [1.0, h * (r["kwt"] - r["pls"]), r["kw"]]
    return ow.row(rule, r)


def design(recs, rule):
    return np.array([row(rule, r) for r in recs])


def fit(recs, rule):
    beta, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def set_lam(recs, kwt, lam):
    for r in recs:
        r["kwt"] = kwt[lam][r["c"]][r["g"]]


def held_out(recs, grp, held, rule, kwt, lam_of):
    """As 7j to 7n, with kW_t recomputed per fold from lam calibrated without the held-out maker family."""
    err = {}
    for gname in sorted(set(grp.values()), key=str):
        set_lam(recs, kwt, lam_of[gname])
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
    w = ow.weight(np.concatenate(picks))
    own = {}
    for k in keys:
        e = float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - cells0[(k, k)])))])
        own[k] = ow.weight(gc.picks(rows, norm[k], e, idle0[k])[0])
    coef = LossCurves(tables()).full[gs.T]
    central = next(j for j, c in enumerate(conds) if list(c["setting"]) == list(CENTRAL) and c["share"] == S_C)

    curves = []
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        curves.append({k: np.asarray(idle[k][0], float) for k in keys})
    poc0 = curves[central]
    pbar = np.mean([poc0[f] for f in gc.BASE], axis=0)
    kws0 = {k: gd.pick_weighted_idle(poc0[k], own[k]) for k in keys}

    groups = sorted(set(grp.values()), key=str)
    lam_of = {ALL: calibrate(w, poc0, pbar, kws0, gc.BASE)}
    for gname in groups:
        lam_of[gname] = calibrate(w, poc0, pbar, kws0, [f for f in gc.BASE if grp[f] != gname])
    lams = sorted(set(lam_of.values()) | set(SWEEP))
    wt = {lam: {k: tilt(w, poc0[k], pbar, lam) for k in keys} for lam in lams}
    kwt = {lam: [{k: gd.pick_weighted_idle(cv[k], wt[lam][k]) for k in keys} for cv in curves] for lam in lams}
    kww = [{k: gd.pick_weighted_idle(cv[k], w) for k in keys} for cv in curves]
    kws = [{k: gd.pick_weighted_idle(cv[k], own[k]) for k in keys} for cv in curves]

    recs = one.records(conds)
    for r in recs:
        r["kww"], r["kws"] = kww[r["c"]][r["g"]], kws[r["c"]][r["g"]]
        r["kw2"] = r["kww"]  # owd2 is not scored here; ow.row needs the key only for that rule
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}

    out = []
    p = out.append
    p("Milestone 7o: 7k's one-number idle rule with the drag read on the published pick weight tilted by each "
      "variant's own drag (kW_t, builder-side) against 7n's own-pick oracle kW_s; 7j's 22 idle conditions, "
      "14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")
    p(f"Tilt constant lambda (per kW; grid {LAMBDAS[0]:g} to {LAMBDAS[-1]:g} in 0.05 steps), calibrated on the BASE "
      "families' own picks at the central condition:")
    p(f"  {ALL:28s}  {lam_of[ALL]:.2f}")
    for gname in groups:
        p(f"  without {str(gname):20s}  {lam_of[gname]:.2f}")
    p("")
    p("Per variant at the central condition, lambda calibrated without the variant's maker family: tilted median "
      "(L/min; own-pick median in brackets), kW_w, kW_t, kW_s, kW_t/kW_w, kW_t/kW_s:")
    for k in keys:
        lam = lam_of[grp[k]]
        b, t, s = kww[central][k], kwt[lam][central][k], kws[central][k]
        p(f"  {gc.name(k):28s}  lambda {lam:5.2f}  median {op.weighted_median(wt[lam][k]):5.1f} "
          f"({op.weighted_median(own[k]):5.1f})  kW_w {b:.3f}  kW_t {t:.3f}  kW_s {s:.3f}  t/w {t / b:.3f}  "
          f"t/s {t / s:.3f}")
    kap = {}
    for name, (xs, ys) in (("st", (kwt[lam_of[ALL]], kws)), ("sw", (kww, kws))):
        pairs = {j: [(xs[j][k], ys[j][k]) for k in keys] for j in range(n_c)}
        per = [gr.kappa({j: pairs[j]}) for j in range(n_c)]
        kap[name] = gr.kappa(pairs)
        p(f"kappa_{name} (slope of kW_s on kW_{name[1]} over the 14 variants; kW_t at the all-six lambda): pooled "
          f"with condition fixed effects {kap[name]:.3f}; per condition {min(per):.3f} to {max(per):.3f}")
    p("")

    set_lam(recs, kwt, lam_of[ALL])
    allfit = {r: fit(recs, r) for r in RULES}
    diag = [r for r in recs if r["f"] == r["g"]]
    y = np.array([x["e50"] for x in recs])
    yd = np.array([x["e50"] for x in diag])
    p(f"Fits to all 4312 cells, kW_t at the all-six lambda {lam_of[ALL]:.2f} (coefficients; in-sample RMS over all "
      "cells and over the 308 diagonals):")
    for r in RULES:
        p(f"  {r:4s}  " + ", ".join(f"{v:+.4f}" for v in allfit[r]) +
          f";  cells {g5.rms((y - design(recs, r) @ allfit[r]).tolist()):.4f}, "
          f"diagonals {g5.rms((yd - design(diag, r) @ allfit[r]).tolist()):.4f}")
    ratio = {r: -allfit[r][3] / allfit[r][1] for r in ("owh", "owht")}
    p(f"  -d/b (standby kW against drag kW, both per idle hour): owh {ratio['owh']:.2f}, owht {ratio['owht']:.2f}")
    p("")

    score = {"A": {}}
    for r in RULES:
        e = {}
        for j in range(n_c):
            e.update(held_out(recs, grp, {j}, r, kwt, lam_of))
        score["A"][r] = e
    for name, held in (("B1", half), ("B2", ends)):
        score[name] = {r: held_out(recs, grp, held, r, kwt, lam_of) for r in RULES}
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
    show = ("owh", "owdw", "owds", "owdt")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(show))
    for k in keys:
        vals = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in show]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in vals))
    p("")
    p("Sensitivity (not scored): owdt (A) RMS with one fixed lambda in every fold:")
    for lam in SWEEP:
        fixed = {g: lam for g in lam_of}
        e = {}
        for j in range(n_c):
            e.update(held_out(recs, grp, {j}, "owdt", kwt, fixed))
        p(f"  lambda {lam:4.1f}  {g5.rms(list(e.values())):.4f}")
    p("")

    A = {r: g5.rms(list(score["A"][r].values())) for r in RULES}
    B1 = g5.rms(list(score["B1"]["owdt"].values()))
    B2 = g5.rms(list(score["B2"]["owdt"].values()))
    dlam = lam_of[grp["danfoss"]]
    dtw = kwt[dlam][central]["danfoss"] / kww[central]["danfoss"]
    d = allfit["owht"][3]
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7o):")
    p(f"  PL1 lambda on all six BASE families positive: {ok(lam_of[ALL] > 0)} ({lam_of[ALL]:.2f} per kW)")
    p(f"  PL2 Danfoss kW_t/kW_w below 0.90 (lambda without Danfoss): {ok(dtw < 0.90)} ({dtw:.3f}; lambda {dlam:.2f})")
    p(f"  PL3 kappa_st in [0.90, 1.10]: {ok(0.90 <= kap['st'] <= 1.10)} ({kap['st']:.3f})")
    p(f"  PL4 owdt (A) below owh's: {ok(A['owdt'] < A['owh'])} ({A['owdt']:.4f} against {A['owh']:.4f}; "
      f"owds {A['owds']:.4f})")
    p(f"  PL5 owdt (A) at most 0.0049: {ok(round(A['owdt'], 4) <= 0.0049)} ({A['owdt']:.4f})")
    p(f"  PL6 owdt B1 and B2 both at most 0.0056: {ok(round(B1, 4) <= 0.0056 and round(B2, 4) <= 0.0056)} "
      f"(B1 {B1:.4f}, B2 {B2:.4f})")
    p(f"  PL7 owht d < 0 and -d/b in [0.90, 1.10]: {ok(d < 0 and 0.90 <= ratio['owht'] <= 1.10)} "
      f"(d {d:+.4f}, -d/b {ratio['owht']:.2f})")
    p("")
    p("Sources: as gear_pump_onerule.py (7j), gear_pump_ratio.py (7k) and gear_pump_ownpick.py (7n); kW_t read on "
      "each condition's own idle curves with the tilted weight fixed at the central condition.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
