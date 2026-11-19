"""Milestone 7r: a pick table by bend, with rows the motion model builds for synthetic bending curves (7q's Next y2).

7q's table failed because no donor bends like Danfoss (b 1.781 against 1.281 to 1.497): every row put its picks near
72 L/min. A publisher can still print a row for a bend no measured pump has: bend each donor's own central idle curve
to a target beta, run the motion model on that donor with the bent curve, and tabulate the picks.

  P_j^beta(q) = P_idle,j(q) (q/64)^gamma,  gamma = ln(beta / b_j) / ln(79/64)   (b of the bent curve = beta exactly)
  row(beta; k) = mean over donors j outside k's maker group of j's picks with P_j^beta at 7p's e_m(k)
  kW_b   = sum_q row(beta*; k)(q) P_idle,k(q; c),  beta* the grid value (1.2 .. 1.9 by 0.1) nearest b(k)
  kW_bx  = the same with a row built at beta = b(k) exactly

  owh, owdm, owdtp        references (7j, 7p, 7q)
  owdb, owdbx             owds form; the fold's test rows read kW_b / kW_bx, training rows keep kW_s

Scored exactly as 7j to 7q. Predictions PR1 to PR8 are in LOG.md (7r). A sensitivity: the bent curves are synthetic.

Usage: python gear_pump_bendtable.py [cache dir] > gear_pump_bendtable_results.txt
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
import gear_pump_table as tb  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

Q_LO, Q_HI = tb.Q_LO, tb.Q_HI
BETAS = tuple(round(1.2 + 0.1 * i, 1) for i in range(8))
RULES = ("owh", "owdm", "owdtp", "owdb", "owdbx")
FEAT = {"owdb": "kwb", "owdbx": "kwbx", "owdtp": "kwtp"}


def bent(poc, beta):
    """The idle curve poc (on GRID) bent by (q/64)^gamma so that its bend b is beta; level at 64 L/min unchanged."""
    gamma = math.log(beta / tb.bend(poc)) / math.log(Q_HI / Q_LO)
    return poc * (GRID / Q_LO) ** gamma


def nearest_beta(b):
    return min(BETAS, key=lambda x: (abs(x - b), x))


def row(rule, r, test=False):
    if rule in FEAT:
        x = r[FEAT[rule] if test else "kws"]
        return [1.0, r["h"] * (x - r["pls"]), r["kw"]]
    return lk.row(rule, r, test)


def design(recs, rule, test=False):
    return np.array([row(rule, r, test) for r in recs])


def fit(recs, rule):
    beta, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def held_out(recs, grp, held, rule):
    """As 7j to 7q (training rows read kW_s); the fold's test rows read the table feature."""
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
    e50 = {k: float(cells0[(k, k)]) for k in keys}
    es = {k: lk.nearest(e50[k]) for k in keys}
    em = {k: lk.nearest(lk.others_mean(e50, grp, k)) for k in keys}
    b = {k: tb.bend(idle0[k][0]) for k in keys}

    memo = {}

    def pw(j, e, beta=None):
        """Donor j's picks at efficiency e, on its own idle curve or on it bent to beta (what the publisher prints)."""
        key = (j, e, beta)
        if key not in memo:
            poc, pls = idle0[j]
            idle = (poc, pls) if beta is None else (bent(poc, beta), pls)
            memo[key] = ow.weight(gc.picks(rows, norm[j], e, idle)[0])
        return memo[key]

    def table_row(k, beta):
        return tb.mean_weight([pw(j, em[k], beta) for j in tb.donors(b, grp, k)])

    own_s = {k: pw(k, es[k]) for k in keys}
    own_m = {k: pw(k, em[k]) for k in keys}
    tp = {k: tb.mean_weight([pw(j, em[k]) for j in tb.donors(b, grp, k)]) for k in keys}
    bstar = {k: nearest_beta(b[k]) for k in keys}
    rowb = {k: table_row(k, bstar[k]) for k in keys}
    rowbx = {k: table_row(k, b[k]) for k in keys}
    coef = LossCurves(tables()).full[gs.T]

    feat = {"kws": [], "kwm": [], "kwtp": [], "kwb": [], "kwbx": []}
    src = {"kws": own_s, "kwm": own_m, "kwtp": tp, "kwb": rowb, "kwbx": rowbx}
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        for name, wts in src.items():
            feat[name].append({k: gd.pick_weighted_idle(idle[k][0], wts[k]) for k in keys})

    recs = one.records(conds)
    for r in recs:
        for name, s in feat.items():
            r[name] = s[r["c"]][r["g"]]
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}
    central = next(j for j, c in enumerate(conds) if list(c["setting"]) == list(CENTRAL) and c["share"] == S_C)

    out = []
    p = out.append
    p("Milestone 7r: a pick table by bend (b = P_idle(79)/P_idle(64) L/min, central idle curve) whose rows are the "
      "motion model's picks for donors' idle curves bent by (q/64)^gamma to b = 1.2 .. 1.9; donors outside the held-out "
      "maker group, at 7p's e_m; 7j's 22 idle conditions, 14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py). The bent curves are synthetic: a sensitivity, not a measured family.")
    p("")
    dan = "danfoss"
    p(f"Pooled row by beta, Danfoss's donors at e_m {em[dan]:.4f}: median pick (L/min), share of picks below 64 L/min")
    meds = {}
    for beta in BETAS:
        wt = table_row(dan, beta)
        meds[beta] = op.weighted_median(wt)
        lo = sum(v for q, v in wt.items() if q < Q_LO)
        p(f"  beta {beta:.1f}  median {meds[beta]:5.1f}  below 64: {lo:.3f}")
    p("")
    p("Per variant at the central condition: b, grid beta, own-pick median at e_m, row medians tp / b / bx (L/min), "
      "kW_s, kW_m/kW_s, kW_tp/kW_s, kW_b/kW_s, kW_bx/kW_s, kW_b/kW_m:")
    for k in keys:
        s = feat["kws"][central][k]
        m = feat["kwm"][central][k]
        p(f"  {gc.name(k):28s}  b {b[k]:.3f}  beta {bstar[k]:.1f}  median {op.weighted_median(own_m[k]):5.1f} | "
          f"{op.weighted_median(tp[k]):5.1f} / {op.weighted_median(rowb[k]):5.1f} / {op.weighted_median(rowbx[k]):5.1f}")
        p(f"  {'':28s}  kW_s {s:.3f}  m {m / s:.3f}  tp {feat['kwtp'][central][k] / s:.3f}  "
          f"b {feat['kwb'][central][k] / s:.3f}  bx {feat['kwbx'][central][k] / s:.3f}  "
          f"b/m {feat['kwb'][central][k] / m:.3f}")
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
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(RULES))
    per = {}
    for k in keys:
        per[k] = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in RULES]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in per[k]))
    rest = [k for k in keys if k != dan]
    p("Post hoc (not registered): (A) RMS over the 286 diagonals of the 13 variants other than Danfoss: " +
      ", ".join(f"{r} {g5.rms([v for (_, f), v in score['A'][r].items() if f in rest]):.4f}" for r in RULES))
    p("")

    A = {r: round(g5.rms(list(score["A"][r].values())), 4) for r in RULES}  # verdicts on the printed figures
    B1 = {r: round(g5.rms(list(score["B1"][r].values())), 4) for r in RULES}
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    mono = all(meds[BETAS[i + 1]] <= meds[BETAS[i]] for i in range(len(BETAS) - 1))
    rbm = feat["kwb"][central][dan] / feat["kwm"][central][dan]
    d = dict(zip(RULES, per[dan]))
    p("Predictions (LOG.md 7r):")
    p(f"  PR1 Danfoss-fold row median does not rise with beta and is at most 65 at 1.8: "
      f"{ok(mono and meds[1.8] <= 65.0)} (monotone {mono}; {meds[1.8]:.1f} at 1.8)")
    p(f"  PR2 Danfoss kW_b/kW_m at the central condition in [0.95, 1.10]: {ok(0.95 <= round(rbm, 3) <= 1.10)} "
      f"({rbm:.3f})")
    p(f"  PR3 owdb (A) below owh: {ok(A['owdb'] < A['owh'])} ({A['owdb']:.4f} against {A['owh']:.4f})")
    p(f"  PR4 owdb (A) below owdtp: {ok(A['owdb'] < A['owdtp'])} ({A['owdb']:.4f} against {A['owdtp']:.4f})")
    p(f"  PR5 Danfoss (A) under owdb at most owh's: {ok(round(d['owdb'], 4) <= round(d['owh'], 4))} "
      f"({d['owdb']:.4f} against {d['owh']:.4f})")
    p(f"  PR6 owdb (A) above owdm: {ok(A['owdb'] > A['owdm'])} ({A['owdb']:.4f} against {A['owdm']:.4f})")
    p(f"  PR7 owdb B1 at most owh's: {ok(B1['owdb'] <= B1['owh'])} ({B1['owdb']:.4f} against {B1['owh']:.4f})")
    p(f"  PR8 |owdb - owdbx| in (A) at most 0.0003: {ok(round(abs(A['owdb'] - A['owdbx']), 4) <= 0.0003)} "
      f"({A['owdb']:.4f}, {A['owdbx']:.4f})")
    p("")
    p("Sources: as gear_pump_onerule.py (7j), gear_pump_ownpick.py (7n), gear_pump_leak.py (7p) and "
      "gear_pump_table.py (7q); every feature read on each condition's own idle curves with the pick weight fixed at "
      "the central setting.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
