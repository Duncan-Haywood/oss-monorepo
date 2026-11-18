"""Milestone 7m: a two-point builder-side drag read for 7k's one-number idle rule (7l's Next u).

7l found one catalogue read at the picks' median (q* = 72 L/min) misses the bend of a curved idle curve and the drive
extra of a spun or geared pump, which sits only above the family's largest size. Two two-number reads, both fixed
before any 7m number was computed:

  kW_2   = (P_idle,g(q25) + P_idle,g(q75)) / 2       q25, q75: smallest sizes whose cumulative pick weight reaches 1/4, 3/4
  kW_72x = P_idle,g(q*) + sum_{q > Q_L} w(q) (P_idle,g(q) - P_idle,h(q))   (kW_o's drive-extra term, 85 L/min read -> q*)

  owh  = a + b H kW_o + c k_w + d H P_LS       (7j, reference)
  owdw = a + b H (kW_w - P_LS) + c k_w         (7k, reference; needs w(q))
  owdq = a + b H (kW_q* - P_LS) + c k_w        (7l, reference)
  owh2 = a + b H kW_2 + c k_w + d H P_LS
  owd2 = a + b H (kW_2 - P_LS) + c k_w
  owdx = a + b H (kW_72x - P_LS) + c k_w

Scored exactly as 7j to 7l: (A) leave-one-condition-and-maker-family-out over 308 diagonals, (B1) the nine half-speed
conditions held out, (B2) S = 0.20 and 0.50 held out. Predictions PT1 to PT7 are in LOG.md (7m).

Usage: python gear_pump_twopoint.py [cache dir] > gear_pump_twopoint_results.txt
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
from excavator_breakeven_geometry import GRID  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

RULES = ("owh", "owdw", "owdq", "owh2", "owd2", "owdx")
POST = ("owdh",)  # post hoc, not registered: kW_72x with the read on the family's catalogue curve (see LOG.md 7m)


def weighted_quantile(w, p):
    """Smallest q whose cumulative weight reaches p; w: {q: weight}, weights summing to 1."""
    acc = 0.0
    for q in sorted(w):
        acc += w[q]
        if acc >= p - 1e-12:
            return float(q)
    raise ValueError(f"weights do not reach {p}")


def two_point(poc, q_lo, q_hi):
    """Mean of the idle power at two flows on GRID."""
    return 0.5 * (float(poc[gd.grid_index(q_lo)]) + float(poc[gd.grid_index(q_hi)]))


def read_plus_extra(poc_g, poc_h, w, q_read, q_l):
    """The drag at q_read plus kW_o's pick-weighted drive extra of g over its catalogue reading h above Q_L."""
    return float(poc_g[gd.grid_index(q_read)] + sum(wq * (poc_g[gd.grid_index(q)] - poc_h[gd.grid_index(q)])
                                                    for q, wq in w.items() if q > q_l))


def row(rule, r):
    h = r["h"]
    if rule == "owh":
        return [1.0, h * r["kwo"], r["kw"], h * r["pls"]]
    if rule == "owdw":
        return [1.0, h * (r["kww"] - r["pls"]), r["kw"]]
    if rule == "owdq":
        return [1.0, h * (r["kwq"] - r["pls"]), r["kw"]]
    if rule == "owh2":
        return [1.0, h * r["kw2"], r["kw"], h * r["pls"]]
    if rule == "owd2":
        return [1.0, h * (r["kw2"] - r["pls"]), r["kw"]]
    if rule == "owdx":
        return [1.0, h * (r["kwx"] - r["pls"]), r["kw"]]
    if rule == "owdh":
        return [1.0, h * (r["kwh"] - r["pls"]), r["kw"]]
    raise KeyError(rule)


def design(recs, rule):
    return np.array([row(rule, r) for r in recs])


def fit(recs, rule):
    beta, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def held_out(recs, grp, held, rule):
    """As 7j to 7l: errors on the held conditions' diagonals, fitted without them, leave-one-maker-family-out."""
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
    qs, cnt = np.unique(np.concatenate(picks), return_counts=True)
    w = dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))
    qstar = op.weighted_median(w)
    q25, q75 = weighted_quantile(w, 0.25), weighted_quantile(w, 0.75)
    qbig = {k: float(gears[grp[k]].qn[-1]) for k in keys}
    coef = LossCurves(tables()).full[gs.T]
    for q in (qstar, q25, q75):
        j = gd.grid_index(q)
        if not (0 <= j < len(GRID)) or abs(GRID[j] - q) > 1e-9:
            raise SystemExit(f"{q} L/min is not on the idle-curve grid")

    kww, kwq, kw2, kwx, kwh = [], [], [], [], []
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        kww.append({k: gd.pick_weighted_idle(idle[k][0], w) for k in keys})
        kwq.append({k: float(idle[k][0][gd.grid_index(qstar)]) for k in keys})
        kw2.append({k: two_point(idle[k][0], q25, q75) for k in keys})
        kwx.append({k: read_plus_extra(idle[k][0], idle[grp[k]][0], w, qstar, qbig[k]) for k in keys})
        kwh.append({k: kwx[-1][k] - float(idle[k][0][gd.grid_index(qstar)] - idle[grp[k]][0][gd.grid_index(qstar)])
                    for k in keys})

    recs = one.records(conds)
    for r in recs:
        for name, src in (("kww", kww), ("kwq", kwq), ("kw2", kw2), ("kwx", kwx), ("kwh", kwh)):
            r[name] = src[r["c"]][r["g"]]
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}
    central = next(j for j, c in enumerate(conds) if list(c["setting"]) == list(CENTRAL) and c["share"] == S_C)

    out = []
    p = out.append
    p("Milestone 7m: 7k's one-number idle rule with a two-point drag read (the picks' quartiles; or the 72 L/min "
      "read plus kW_o's drive extra) in place of the pick-weighted kW_w; 7j's 22 idle conditions, 14 variants, "
      "196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")
    p(f"Pick weight w(q) (7e, central setting): {len(w)} sizes from {min(w):g} to {max(w):g} L/min; "
      f"q25 = {q25:g}, q* (median) = {qstar:g}, q75 = {q75:g} L/min")
    p("")
    p("Per variant (central condition): kW_w, kW_q*, kW_2, kW_72x and the ratios kW_w/kW_2, kW_w/kW_72x "
      "(Q_L = the family's largest size):")
    for k in keys:
        b = kww[central][k]
        p(f"  {gc.name(k):28s}  Q_L {qbig[k]:5.1f}  kW_w {b:.3f}  kW_q* {kwq[central][k]:.3f}  "
          f"kW_2 {kw2[central][k]:.3f}  kW_72x {kwx[central][k]:.3f}  "
          f"w/2 {b / kw2[central][k]:.3f}  w/72x {b / kwx[central][k]:.3f}")
    kap = {}
    for name, src in (("2", kw2), ("x", kwx), ("q", kwq)):
        pairs = {j: [(src[j][k], kww[j][k]) for k in keys] for j in range(n_c)}
        per = [gr.kappa({j: pairs[j]}) for j in range(n_c)]
        kap[name] = gr.kappa(pairs)
        p(f"kappa_{name} (slope of kW_w on the read over the 14 variants): pooled with condition fixed effects "
          f"{kap[name]:.3f}; per condition {min(per):.3f} to {max(per):.3f}")
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
    ratio = {r: -allfit[r][3] / allfit[r][1] for r in ("owh", "owh2")}
    p(f"  -d/b (standby kW against drag kW, both per idle hour): owh {ratio['owh']:.2f}, owh2 {ratio['owh2']:.2f}")
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
    show = ("owdw", "owdq", "owd2", "owdx")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(show))
    for k in keys:
        vals = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in show]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in vals))
    p("")

    A = {r: g5.rms(list(score["A"][r].values())) for r in RULES}
    B1 = g5.rms(list(score["B1"]["owd2"].values()))
    B2 = g5.rms(list(score["B2"]["owd2"].values()))
    dan = {r: g5.rms([v for (_, f), v in score["A"][r].items() if f == "danfoss"]) for r in ("owdq", "owd2")}
    d = allfit["owh2"][3]
    best = min(("owd2", "owdx"), key=A.get)
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7m):")
    p(f"  PT1 pooled kappa_2 in [0.95, 1.05]: {ok(0.95 <= kap['2'] <= 1.05)} ({kap['2']:.3f})")
    p(f"  PT2 owh2 d < 0 and -d/b in [0.90, 1.10]: {ok(d < 0 and 0.90 <= ratio['owh2'] <= 1.10)} "
      f"(d {d:+.4f}, -d/b {ratio['owh2']:.2f})")
    p(f"  PT3 owd2 (A) at most 0.0062: {ok(A['owd2'] <= 0.0062)} ({A['owd2']:.4f}; owdw here {A['owdw']:.4f})")
    p(f"  PT4 owdx (A) at most 0.0062: {ok(A['owdx'] <= 0.0062)} ({A['owdx']:.4f})")
    p(f"  PT5 better of owd2/owdx (A) below owdq's 0.0065: {ok(A[best] < 0.0065)} "
      f"({best} {A[best]:.4f}; owdq here {A['owdq']:.4f})")
    p(f"  PT6 Danfoss (A) under owd2 below owdq's: {ok(dan['owd2'] < dan['owdq'])} "
      f"({dan['owd2']:.4f} against {dan['owdq']:.4f})")
    p(f"  PT7 owd2 B1 and B2 both at most 0.0070: {ok(B1 <= 0.0070 and B2 <= 0.0070)} (B1 {B1:.4f}, B2 {B2:.4f})")
    p("")
    p("Post hoc, not registered (found on reading the table above): for the AZPF family q* = 72 L/min lies above "
      "its largest size, so kW_72x's read on the variant's own curve already carries the drive extra and the extra "
      "term counts it twice. kW_72h reads q* on the family's catalogue curve instead, as kW_o reads 85 L/min:")
    pairs = {j: [(kwh[j][k], kww[j][k]) for k in keys] for j in range(n_c)}
    kh = gr.kappa(pairs)
    eh = {}
    for j in range(n_c):
        eh.update(held_out(recs, grp, {j}, "owdh"))
    bh = {n: g5.rms(list(held_out(recs, grp, hd, "owdh").values())) for n, hd in (("B1", half), ("B2", ends))}
    fh = fit(recs, "owdh")
    p("  kW_72h at the central condition: " + ", ".join(f"{gc.name(k)} {kwh[central][k]:.3f}" for k in keys))
    p(f"  kappa_h pooled {kh:.3f}; owdh fit " + ", ".join(f"{v:+.4f}" for v in fh) +
      f"; (A) {g5.rms(list(eh.values())):.4f}; B1 {bh['B1']:.4f}; B2 {bh['B2']:.4f}; Danfoss (A) "
      f"{g5.rms([v for (_, f), v in eh.items() if f == 'danfoss']):.4f}")
    p("")
    p("Sources: as gear_pump_onerule.py (7j), gear_pump_ratio.py (7k) and gear_pump_onepoint.py (7l); kW_2 and kW_72x "
      "read on each condition's own idle curves at quantiles of 7e's central pick weight.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
