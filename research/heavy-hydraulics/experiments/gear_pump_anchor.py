"""Milestone 7t: read the bend's anchor off the measured families' own curves (7s's Next y4)

7s found that 7r's bend table holds when a steeper synthetic curve keeps its level at 64 L/min (power, hinge and
exponential shapes: 0.0052 to 0.0053 in (A)) and fails when it keeps its level at 79 L/min (0.0059, worse than the
two-price rule's 0.0056). Which anchor is right is a property of real pumps: when a measured idle drag curve bends
more, does its level at 64 L/min stay put and the large sizes get dearer, or the reverse?

One-parameter family of anchors. A power bend pivoting at q*(lam) = 64 (79/64)^lam:

  P_j^beta(q) = P_idle,j(q) (q / q*)^gamma,  gamma = ln(beta / b_j) / ln(79/64)

lam = 0 is 7r's shape p (level held at 64), lam = 1 is 7s's shape v (level held at 79). If real curves follow
P_j(q) = A (q/q*)^gamma_j with gamma_j = ln b_j / ln(79/64), the slope of ln P_j(64) on ln b_j across pumps is -lam.

Builder-side estimates, per held-out maker group, from the donors only (variants outside that group, the same donors
7r's rows use; the held-out pump's curve enters only through its own data-sheet bend):
  lam_pool  minus the OLS slope of ln P_j(64) on ln b_j over the donor variants (equal weight per variant);
  lam_fe    the same slope within maker groups (each donor group demeaned; only groups with two or more donor
            variants carry information: the AZPF and AZPN families, whose variants differ by drive speed and gear).
Both on the central idle curve. Rules: owh, owdm (references), owdb (lam 0, 7r), owdbv (lam 1, 7s), owdbq (lam_pool),
owdbf (lam_fe); each table rule is 7r's owds form (the fold's test rows read the table feature, training rows 7n's
kW_s). Scores as 7j to 7s: (A), (B1), (B2). Diagnostic: (A) over a fixed sweep lam = -0.5 .. 1.0 by 0.25, and
Danfoss's own residual from the donors' pooled line (never used in a fit). Predictions PT1 to PT8 are in LOG.md (7t).

Usage: python gear_pump_anchor.py [cache dir] > gear_pump_anchor_results.txt
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
import gear_pump_bendtable as bt  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

Q_LO, Q_HI = tb.Q_LO, tb.Q_HI
BETAS = bt.BETAS
SWEEP = (-0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0)
RULES = ("owh", "owdm", "owdb", "owdbv", "owdbq", "owdbf")


def pivot(lam):
    """The flow (L/min) at which a bend with anchor lam holds the curve's level."""
    return Q_LO * (Q_HI / Q_LO) ** lam


def anchored(poc, beta, lam):
    """The idle curve poc (on GRID) bent to two-point bend beta, its level held at pivot(lam)."""
    gamma = math.log(beta / tb.bend(poc)) / math.log(Q_HI / Q_LO)
    return poc * (GRID / pivot(lam)) ** gamma


def slope(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    xc = x - x.mean()
    return float(xc @ (y - y.mean()) / (xc @ xc))


def lam_pool(lvl, b, js):
    """Minus the OLS slope of ln P_j(64) on ln b_j over donor variants js."""
    return -slope([math.log(b[j]) for j in js], [math.log(lvl[j]) for j in js])


def lam_fe(lvl, b, grp, js):
    """Minus the within-maker-group slope of ln P_j(64) on ln b_j (groups with one donor variant drop out)."""
    xs, ys = [], []
    for g in sorted({grp[j] for j in js}, key=str):
        m = [j for j in js if grp[j] == g]
        if len(m) < 2:
            continue
        x = np.array([math.log(b[j]) for j in m])
        y = np.array([math.log(lvl[j]) for j in m])
        xs.extend(x - x.mean())
        ys.extend(y - y.mean())
    xs, ys = np.array(xs), np.array(ys)
    return -float(xs @ ys / (xs @ xs))


def row(rule, r, test=False):
    if rule in RULES[2:] or rule.startswith("sw"):
        x = r[rule if test else "kws"]
        return [1.0, r["h"] * (x - r["pls"]), r["kw"]]
    return lk.row(rule, r, test)


def design(recs, rule, test=False):
    return np.array([row(rule, r, test) for r in recs])


def fit(recs, rule):
    coef, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return coef


def held_out(recs, grp, held, rule):
    """As 7j to 7s (training rows read kW_s); the fold's test rows read the table feature."""
    err = {}
    for gname in sorted(set(grp.values()), key=str):
        train = [r for r in recs if r["c"] not in held and grp[r["f"]] != gname and grp[r["g"]] != gname]
        c = fit(train, rule)
        test = [r for r in recs if r["c"] in held and r["f"] == r["g"] and grp[r["f"]] == gname]
        for r, p in zip(test, design(test, rule, test=True) @ c):
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
    lvl = {k: float(idle0[k][0][gd.grid_index(Q_LO)]) for k in keys}
    lvl79 = {k: float(idle0[k][0][gd.grid_index(Q_HI)]) for k in keys}
    don = {k: tb.donors(b, grp, k) for k in keys}
    lq = {k: lam_pool(lvl, b, don[k]) for k in keys}
    lf = {k: lam_fe(lvl, b, grp, don[k]) for k in keys}

    memo = {}

    def pw(j, e, beta=None, lam=None):
        key = (j, e, beta, None if lam is None else round(lam, 12))
        if key not in memo:
            poc, pls = idle0[j]
            idle = (poc, pls) if beta is None else (anchored(poc, beta, lam), pls)
            memo[key] = ow.weight(gc.picks(rows, norm[j], e, idle)[0])
        return memo[key]

    def table_row(k, beta, lam):
        return tb.mean_weight([pw(j, em[k], beta, lam) for j in don[k]])

    bstar = {k: bt.nearest_beta(b[k]) for k in keys}
    src = {"kws": {k: pw(k, es[k]) for k in keys}, "kwm": {k: pw(k, em[k]) for k in keys}}
    src["owdb"] = {k: table_row(k, bstar[k], 0.0) for k in keys}
    src["owdbv"] = {k: table_row(k, bstar[k], 1.0) for k in keys}
    src["owdbq"] = {k: table_row(k, bstar[k], lq[k]) for k in keys}
    src["owdbf"] = {k: table_row(k, bstar[k], lf[k]) for k in keys}
    sweep_rule = {lam: f"sw{lam:+.2f}" for lam in SWEEP}
    for lam, name in sweep_rule.items():
        src[name] = {k: table_row(k, bstar[k], lam) for k in keys}
    coef = LossCurves(tables()).full[gs.T]

    feat = {name: [] for name in src}
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
    dan = "danfoss"

    out = []
    p = out.append
    p("Milestone 7t: the bend's anchor read off the measured curves. 7r's bend table with a power bend pivoting at "
      "q*(lam) = 64 (79/64)^lam (lam 0 = 7r's shape p, lam 1 = 7s's shape v); lam estimated per held-out maker group "
      "from the donors' own idle curves; grid beta 1.2 .. 1.9, donors outside the held-out maker group at 7p's e_m; "
      "7j's 22 idle conditions, 14 variants, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py). The bent curves are synthetic; the anchor is read from the measured families.")
    p("")
    p("Measured idle drag at the central condition (kW at a 64 and a 79 L/min pump), bend b, maker group:")
    for k in keys:
        p(f"  {gc.name(k):28s}  P(64) {lvl[k]:.4f}  P(79) {lvl79[k]:.4f}  b {b[k]:.3f}  group {grp[k]}")
    allj = list(keys)
    p(f"All 14 variants (descriptive, not used in a fold): lam_pool {lam_pool(lvl, b, allj):+.3f}, "
      f"lam_fe {lam_fe(lvl, b, grp, allj):+.3f}")
    p("")
    p("Per held-out maker group: donors' lam_pool, lam_fe and the pivots they imply (L/min):")
    for g in sorted(set(grp.values()), key=str):
        k = next(k for k in keys if grp[k] == g)
        p(f"  {str(g):10s}  donors {len(don[k]):2d}  lam_pool {lq[k]:+.3f} (pivot {pivot(lq[k]):5.1f})  "
          f"lam_fe {lf[k]:+.3f} (pivot {pivot(lf[k]):5.1f})")
    others = [j for j in don[dan]]
    xs = np.array([math.log(b[j]) for j in others])
    ys = np.array([math.log(lvl[j]) for j in others])
    s = slope(xs, ys)
    pred = ys.mean() + s * (math.log(b[dan]) - xs.mean())
    resid = math.log(lvl[dan]) - pred
    p(f"Danfoss's own ln P(64) against its donors' pooled line at b {b[dan]:.3f}: residual {resid:+.3f} "
      f"(measured {lvl[dan]:.4f} kW, line {math.exp(pred):.4f} kW); diagnostic, enters no fit")
    p("")
    p(f"Danfoss-fold row median pick (L/min) by beta, donors at e_m {em[dan]:.4f}: lam 0 / lam 1 / "
      f"lam_pool {lq[dan]:+.3f} / lam_fe {lf[dan]:+.3f}")
    meds = {}
    for beta in BETAS:
        m = [op.weighted_median(table_row(dan, beta, lam)) for lam in (0.0, 1.0, lq[dan], lf[dan])]
        meds[beta] = m
        p(f"  {beta:.1f}  " + "  ".join(f"{v:6.1f}" for v in m))
    p(f"Danfoss's own-pick median at e_m: {op.weighted_median(src['kwm'][dan]):.1f}")
    s0 = feat["kwm"][central][dan]
    p("Danfoss kW_table/kW_m at the central condition: " + ", ".join(
        f"{r} {feat[r][central][dan] / s0:.3f}" for r in RULES[2:]))
    p("")

    score = {"A": {}}
    for r in RULES + tuple(sweep_rule.values()):
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
        p(f"  {r:6s}  {g5.rms(list(e.values())):.4f}  (max {max(pc):.4f}; bias {np.mean(list(e.values())):+.4f})")
    p("")
    for name, label in (("B1", "nine half-idle-speed conditions held out together, RMS over 126 diagonals"),
                        ("B2", "S = 0.20 and 0.50 held out together, RMS over 28 diagonals")):
        p(f"({name}) {label} (mean bias):")
        for r in RULES:
            e = list(score[name][r].values())
            p(f"  {r:6s}  {g5.rms(e):.4f}  ({np.mean(e):+.4f})")
    p("")
    p("Sweep (diagnostic): (A) RMS over 308 diagonals and Danfoss's (A) RMS with every fold at a fixed anchor lam:")
    for lam, name in sweep_rule.items():
        e = score["A"][name]
        p(f"  lam {lam:+.2f}  pivot {pivot(lam):5.1f}  (A) {g5.rms(list(e.values())):.4f}  Danfoss "
          f"{g5.rms([v for (_, f), v in e.items() if f == dan]):.4f}")
    p("")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(RULES))
    for k in keys:
        per = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in RULES]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in per))
    p("")

    A, B1, B2 = ({r: round(g5.rms(list(score[x][r].values())), 4) for r in RULES} for x in ("A", "B1", "B2"))
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7t):")
    p(f"  PT1 owdb and owdbv reproduce 7s's 0.0052 and 0.0059 in (A): "
      f"{ok(A['owdb'] == 0.0052 and A['owdbv'] == 0.0059)} ({A['owdb']:.4f}, {A['owdbv']:.4f})")
    p(f"  PT2 Danfoss-fold lam_pool in [-0.5, 0.5]: {ok(-0.5 <= lq[dan] <= 0.5)} ({lq[dan]:+.3f})")
    p(f"  PT3 Danfoss-fold lam_fe in [-0.5, 0.5]: {ok(-0.5 <= lf[dan] <= 0.5)} ({lf[dan]:+.3f})")
    p(f"  PT4 owdbq (A) below owh: {ok(A['owdbq'] < A['owh'])} ({A['owdbq']:.4f} against {A['owh']:.4f})")
    p(f"  PT5 owdbf (A) below owh: {ok(A['owdbf'] < A['owh'])} ({A['owdbf']:.4f} against {A['owh']:.4f})")
    d = round(abs(A["owdbq"] - A["owdbf"]), 4)
    p(f"  PT6 owdbq and owdbf within 0.0003 in (A): {ok(d <= 0.0003)} ({d:.4f})")
    p(f"  PT7 Danfoss's ln P(64) below its donors' pooled line: {ok(resid < 0)} ({resid:+.3f})")
    beats = all(x[r] < x["owh"] for x in (A, B1, B2) for r in ("owdbq",))
    p(f"  PT8 owdbq beats owh in A, B1 and B2: {ok(beats)} "
      f"({A['owdbq']:.4f}/{B1['owdbq']:.4f}/{B2['owdbq']:.4f} against {A['owh']:.4f}/{B1['owh']:.4f}/{B2['owh']:.4f})")
    p("")
    p("Sources: as gear_pump_bendtable.py (7r) and gear_pump_bendshape.py (7s); every feature read on each "
      "condition's own idle curves with the pick weight fixed at the central setting.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
