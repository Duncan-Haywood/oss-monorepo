"""Milestone 7zc: 7r's bend table keyed on the relative bend r at each condition's own idle setting (7zb's Next r).

7r keys every condition's table row on b(k), the bend of variant k's idle curve at the central condition (PVG32
neutral reading, idle speed ratio 1). 7zb showed that b moves with the neutral reading and the idle speed, and that
the drag-free bend b0 moves with them, so a builder's pump is better described by r = b / b0 at the setting it will
run at; at half idle speed on both Salami readings the Casappa KP30, not Danfoss, has the largest r. This step asks
whether keying the table on that changes the rule's held-out error.

For condition c (its neutral reading and idle speed ratio n_r; the standby flow and idle share do not enter a fixed
pump's idle curve) and variant k:

  b_c(k)  = P_idle,k(79; c) / P_idle,k(64; c)          (bend of k's idle curve at the condition)
  b0_c    = 79 p_n(79 n_r) / (64 p_n(64 n_r))           (gear_pump_floor.floor; drag-free bend, 7zb)
  r_c(k)  = b_c(k) / b0_c
  beta_r  = r_c(k) * b0_central                         (central-equivalent bend: the table's rows are central rows)

  kW_r    = sum_q row(nearest grid beta_r; k)(q) P_idle,k(q; c)          (grid 1.2 .. 1.9, clamped, as 7r)
  kW_rx   = the same with the row built at beta_r exactly (rounded to 0.001 for the memo)
  kW_c    = the same keyed on b_c(k) itself, unnormalised (grid), the naive per-condition key

  owdb    7r's reference (row keyed on the central b(k), every condition)
  owdr, owdrx, owdc       owds form; the fold's test rows read kW_r / kW_rx / kW_c, training rows keep kW_s

Rows are 7r's rows: donors' central idle curves bent to beta, picks at 7p's e_m(k), donors outside k's maker
group. Scored exactly as 7r: (A) leave-one-condition-and-maker-family-out, (B1) the nine half-speed conditions held
out together, (B2) S = 0.20 and 0.50 held out. Predictions PC1 to PC4 are in LOG.md (7zc), written before this ran.
A sensitivity on synthetic bent curves, as 7r.

Usage: python gear_pump_rkey.py [cache dir] > gear_pump_rkey_results.txt
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
import gear_pump_ownpick as ow  # noqa: E402
import gear_pump_leak as lk  # noqa: E402
import gear_pump_shape as gs  # noqa: E402
import gear_pump_table as tb  # noqa: E402
import gear_pump_bendtable as bt  # noqa: E402
from gear_pump_floor import floor  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

RULES = ("owh", "owdm", "owdb", "owdr", "owdrx", "owdc")
FEAT = {"owdb": "kwb", "owdr": "kwr", "owdrx": "kwrx", "owdc": "kwc", "owdbx": "kwbx", "owdtp": "kwtp"}
B0_C = floor(CENTRAL[0], CENTRAL[2])


def key_beta(b_c, b0_c):
    """Central-equivalent bend of a curve with bend b_c at a setting whose drag-free bend is b0_c."""
    return b_c / b0_c * B0_C


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
    """As 7r: training rows read kW_s; the fold's test rows read the table feature."""
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
        key = (j, e, beta)
        if key not in memo:
            poc, pls = idle0[j]
            idle = (poc, pls) if beta is None else (bt.bent(poc, beta), pls)
            memo[key] = ow.weight(gc.picks(rows, norm[j], e, idle)[0])
        return memo[key]

    rowmemo = {}

    def table_row(k, beta):
        key = (k, beta)
        if key not in rowmemo:
            rowmemo[key] = tb.mean_weight([pw(j, em[k], beta) for j in tb.donors(b, grp, k)])
        return rowmemo[key]

    own_s = {k: pw(k, es[k]) for k in keys}
    own_m = {k: pw(k, em[k]) for k in keys}
    rowb = {k: table_row(k, bt.nearest_beta(b[k])) for k in keys}
    coef = LossCurves(tables()).full[gs.T]

    names = ("kws", "kwm", "kwb", "kwr", "kwrx", "kwc")
    feat = {n: [] for n in names}
    keyed = {}                      # (setting, k) -> (b_c, r_c, beta_r, grid beta_r, grid beta_c)
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        b0c = floor(setting[0], setting[2])
        wr, wrx, wc = {}, {}, {}
        for k in keys:
            bc = tb.bend(idle[k][0])
            beta = key_beta(bc, b0c)
            keyed[(setting[0], setting[2], k)] = (bc, bc / b0c, beta, bt.nearest_beta(beta), bt.nearest_beta(bc))
            wr[k] = table_row(k, bt.nearest_beta(beta))
            wrx[k] = table_row(k, round(beta, 3))
            wc[k] = table_row(k, bt.nearest_beta(bc))
        src = {"kws": own_s, "kwm": own_m, "kwb": rowb, "kwr": wr, "kwrx": wrx, "kwc": wc}
        for name, wts in src.items():
            feat[name].append({k: gd.pick_weighted_idle(idle[k][0], wts[k]) for k in keys})

    recs = one.records(conds)
    for r in recs:
        for name, s in feat.items():
            r[name] = s[r["c"]][r["g"]]
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}

    out = []
    p = out.append
    p("Milestone 7zc: 7r's bend table keyed on the relative bend r = b / b0 at each condition's own neutral reading "
      "and idle speed (row at beta_r = r * b0_central), against 7r's key (central b) and the raw per-condition b; "
      "7j's 22 idle conditions, 14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py). Rows are 7r's synthetic bent curves: a sensitivity, not a measured family.")
    p(f"b0 at the central setting {B0_C:.3f}")
    p("")
    p("Keys per variant and idle setting (neutral reading, n_r): b_c, r_c, beta_r, grid beta_r | grid beta_c "
      "(7r's grid beta at the central b in brackets)")
    settings = sorted({(s, n) for (s, n, _) in keyed}, key=lambda x: (x[0], -x[1]))
    for k in keys:
        p(f"  {gc.name(k):28s}  [7r {bt.nearest_beta(b[k]):.1f}]")
        for s, n in settings:
            bc, rc, beta, gb, gcb = keyed[(s, n, k)]
            p(f"    {s:12s} n_r {n:.1f}  b {bc:.3f}  r {rc:.3f}  beta_r {beta:.3f}  grid {gb:.1f} | {gcb:.1f}")
    moved = sorted({k for (s, n, k), v in keyed.items() if v[3] != bt.nearest_beta(b[k])}, key=str)
    p(f"Variants whose grid row under the r key differs from 7r's in at least one setting: "
      f"{', '.join(gc.name(k) for k in moved) or 'none'}")
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
    full = [j for j in range(n_c) if j not in half]
    p(f"Post hoc (not registered; gear_pump_halfspeed.py): the factorial reads the gear pump at working-speed curves "
      f"in the half-speed conditions, so (A) RMS over the {len(full)} working-speed conditions only "
      f"({sum(1 for e in score['A']['owh'] if e[0] in full)} diagonals): " +
      ", ".join(f"{r} {g5.rms([v for (j, _), v in score['A'][r].items() if j in full]):.4f}" for r in RULES))
    p("")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): " + " / ".join(RULES))
    per = {}
    for k in keys:
        per[k] = dict(zip(RULES, [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in RULES]))
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{per[k][r]:.4f}" for r in RULES))
    p("Per variant, (A) error over the 9 half-speed conditions only (RMS): owdb / owdr")
    for k in keys:
        hb = g5.rms([v for (j, f), v in score["A"]["owdb"].items() if f == k and j in half])
        hr = g5.rms([v for (j, f), v in score["A"]["owdr"].items() if f == k and j in half])
        p(f"  {gc.name(k):28s}  {hb:.4f} / {hr:.4f}")
    p("")

    A = {r: round(g5.rms(list(score["A"][r].values())), 4) for r in RULES}
    B1 = {r: round(g5.rms(list(score["B1"][r].values())), 4) for r in RULES}
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    cas = "casappa"
    pc = {k: v for k, v in per.items() if gc.name(k) == cas}
    ck = next(iter(pc))
    p("Predictions (LOG.md 7zc):")
    p(f"  PC1 |owdr - owdb| in (A) at most 0.0003: {ok(round(abs(A['owdr'] - A['owdb']), 4) <= 0.0003)} "
      f"({A['owdr']:.4f} against {A['owdb']:.4f})")
    p(f"  PC2 owdr B1 at most owdb's: {ok(B1['owdr'] <= B1['owdb'])} ({B1['owdr']:.4f} against {B1['owdb']:.4f})")
    p(f"  PC3 Casappa KP30 (A) under owdr at most under owdb: "
      f"{ok(round(per[ck]['owdr'], 4) <= round(per[ck]['owdb'], 4))} "
      f"({per[ck]['owdr']:.4f} against {per[ck]['owdb']:.4f})")
    p(f"  PC4 owdc (A) above owdb: {ok(A['owdc'] > A['owdb'])} ({A['owdc']:.4f} against {A['owdb']:.4f})")
    p("")
    p("Sources: as gear_pump_bendtable.py (7r) and gear_pump_floor.py (7zb); every feature read on each condition's "
      "own idle curves with the pick weight fixed at the central setting.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
