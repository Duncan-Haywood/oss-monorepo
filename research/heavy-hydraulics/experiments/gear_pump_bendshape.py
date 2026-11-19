"""Milestone 7s: does 7r's bend table survive a different bend shape? (7r's Next y3)

7r built its rows by bending each donor's central idle curve with a power of flow pivoting at 64 L/min. 7s rebuilds
them with three other one-parameter shapes that give the same two-point bend b = P(79)/P(64) = beta exactly:

  p  power, pivot 64 (7r):  P(q) (q/64)^gamma,                gamma = ln(beta/b_j)/ln(79/64)
  h  hinge:                 P(q) for q <= 64, P(q) (q/64)^gamma above
  v  power, pivot 79:       P(q) (q/79)^gamma                 (level held at 79 L/min, not 64)
  x  exponential:           P(q) exp(kappa (q - 64)),        kappa = ln(beta/b_j)/15

Everything else is 7r's: the grid beta 1.2 .. 1.9, donors outside the held-out maker group at 7p's e_m, the grid
row nearest b(k), the owds form (the fold's test rows read the table feature, training rows keep 7n's kW_s), and
the scores (A), (B1), (B2). Predictions PS1 to PS8 are in LOG.md (7s). A sensitivity: every bent curve is synthetic.

Usage: python gear_pump_bendshape.py [cache dir] > gear_pump_bendshape_results.txt
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
SHAPES = ("p", "h", "v", "x")
SHAPE_NAME = {"p": "power, pivot 64 (7r)", "h": "hinge above 64", "v": "power, pivot 79", "x": "exponential"}
RULE_OF = {"p": "owdb", "h": "owdbh", "v": "owdbv", "x": "owdbx2"}
RULES = ("owh", "owdm", "owdtp") + tuple(RULE_OF[s] for s in SHAPES)
FEAT = {"owdtp": "kwtp", **{RULE_OF[s]: "kw_" + s for s in SHAPES}}


def shaped(poc, beta, shape):
    """The idle curve poc (on GRID) bent to two-point bend beta with the given shape."""
    r = math.log(beta / tb.bend(poc))
    if shape == "p":
        return bt.bent(poc, beta)
    if shape == "h":
        gamma = r / math.log(Q_HI / Q_LO)
        return poc * np.where(GRID > Q_LO, (GRID / Q_LO) ** gamma, 1.0)
    if shape == "v":
        gamma = r / math.log(Q_HI / Q_LO)
        return poc * (GRID / Q_HI) ** gamma
    if shape == "x":
        return poc * np.exp(r / (Q_HI - Q_LO) * (GRID - Q_LO))
    raise ValueError(shape)


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
    """As 7j to 7r (training rows read kW_s); the fold's test rows read the table feature."""
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

    def pw(j, e, beta=None, shape=None):
        key = (j, e, beta, shape)
        if key not in memo:
            poc, pls = idle0[j]
            idle = (poc, pls) if beta is None else (shaped(poc, beta, shape), pls)
            memo[key] = ow.weight(gc.picks(rows, norm[j], e, idle)[0])
        return memo[key]

    def table_row(k, beta, shape):
        return tb.mean_weight([pw(j, em[k], beta, shape) for j in tb.donors(b, grp, k)])

    own_s = {k: pw(k, es[k]) for k in keys}
    own_m = {k: pw(k, em[k]) for k in keys}
    tp = {k: tb.mean_weight([pw(j, em[k]) for j in tb.donors(b, grp, k)]) for k in keys}
    bstar = {k: bt.nearest_beta(b[k]) for k in keys}
    src = {"kws": own_s, "kwm": own_m, "kwtp": tp}
    for s in SHAPES:
        src["kw_" + s] = {k: table_row(k, bstar[k], s) for k in keys}
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

    out = []
    p = out.append
    p("Milestone 7s: 7r's bend table rebuilt with four shapes of synthetic bend (each gives b = P_idle(79)/P_idle(64) "
      "= beta exactly): p power pivot 64 (7r), h hinge above 64, v power pivot 79, x exponential; grid beta 1.2 .. 1.9, "
      "donors outside the held-out maker group at 7p's e_m; 7j's 22 idle conditions, 14 variants, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py). The bent curves are synthetic: a sensitivity, not a measured family.")
    p("")
    dan = "danfoss"
    p(f"Danfoss-fold row median pick (L/min) by beta and shape, donors at e_m {em[dan]:.4f}:")
    p("  beta  " + "  ".join(f"{s:>6s}" for s in SHAPES))
    meds = {s: {} for s in SHAPES}
    for beta in BETAS:
        for s in SHAPES:
            meds[s][beta] = op.weighted_median(table_row(dan, beta, s))
        p(f"  {beta:.1f}  " + "  ".join(f"{meds[s][beta]:6.1f}" for s in SHAPES))
    p("")
    p("Per variant at the central condition: b, grid beta, own-pick median at e_m; kW_shape/kW_s for p / h / v / x:")
    for k in keys:
        s0 = feat["kws"][central][k]
        p(f"  {gc.name(k):28s}  b {b[k]:.3f}  beta {bstar[k]:.1f}  median {op.weighted_median(own_m[k]):5.1f}  "
          + " / ".join(f"{feat['kw_' + s][central][k] / s0:.3f}" for s in SHAPES))
    m = feat["kwm"][central][dan]
    ratio = {s: feat["kw_" + s][central][dan] / m for s in SHAPES}
    p("Danfoss kW_shape/kW_m at the central condition: " + ", ".join(f"{s} {ratio[s]:.3f}" for s in SHAPES))
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
        p(f"  {r:6s}  {g5.rms(list(e.values())):.4f}  (max {max(pc):.4f}; bias {np.mean(list(e.values())):+.4f})")
    p("")
    for name, label in (("B1", "nine half-idle-speed conditions held out together, RMS over 126 diagonals"),
                        ("B2", "S = 0.20 and 0.50 held out together, RMS over 28 diagonals")):
        p(f"({name}) {label} (mean bias):")
        for r in RULES:
            e = list(score[name][r].values())
            p(f"  {r:6s}  {g5.rms(e):.4f}  ({np.mean(e):+.4f})")
    p("")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(RULES))
    for k in keys:
        per = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in RULES]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in per))
    rest = [k for k in keys if k != dan]
    p("Post hoc (not registered): (A) RMS over the 286 diagonals of the 13 variants other than Danfoss: " +
      ", ".join(f"{r} {g5.rms([v for (_, f), v in score['A'][r].items() if f in rest]):.4f}" for r in RULES))
    p("")

    A, B1, B2 = ({r: round(g5.rms(list(score[x][r].values())), 4) for r in RULES} for x in ("A", "B1", "B2"))
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    sh = [RULE_OF[s] for s in SHAPES]
    span = round(max(A[r] for r in sh) - min(A[r] for r in sh), 4)
    beats = [r for r in sh if A[r] < A["owh"] and B1[r] < B1["owh"] and B2[r] < B2["owh"]]
    p("Predictions (LOG.md 7s):")
    p(f"  PS1 owdb reproduces 7r's 0.0052 in (A): {ok(A['owdb'] == 0.0052)} ({A['owdb']:.4f})")
    for tag, r in (("PS2", "owdbh"), ("PS3", "owdbv"), ("PS4", "owdbx2")):
        p(f"  {tag} {r} (A) below owh: {ok(A[r] < A['owh'])} ({A[r]:.4f} against {A['owh']:.4f})")
    p(f"  PS5 the four shapes' (A) span at most 0.0005: {ok(span <= 0.0005)} ({span:.4f})")
    p(f"  PS6 all four shapes' (A) below owdtp: {ok(all(A[r] < A['owdtp'] for r in sh))} "
      f"({', '.join(f'{A[r]:.4f}' for r in sh)} against {A['owdtp']:.4f})")
    p(f"  PS7 hinge row median at beta 1.8 at least 68.0: {ok(meds['h'][1.8] >= 68.0)} ({meds['h'][1.8]:.1f})")
    p(f"  PS8 at least three shapes beat owh in A, B1 and B2: {ok(len(beats) >= 3)} ({', '.join(beats) or 'none'})")
    p("")
    p("Sources: as gear_pump_bendtable.py (7r); every feature read on each condition's own idle curves with the pick "
      "weight fixed at the central setting.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
