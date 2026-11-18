"""Milestone 7k: where 7j's 1.22 price ratio comes from. The idle-hour rule with the drag read at the optimum's picks.

7j's rule prices a kW of load-sensing standby at 1.22 kW of gear-pump drag, yet the break-even model (`fcurve`) charges
idle as b (P_LS - P_OC(q)) h, so a uniform kW added to either side moves every crossing by the same amount with opposite
sign. The ratio must come from the drag feature: kW_o reads the drag at 85 L/min, the cells pay it at the picked sizes.
Here 7f's pick-weighted drag kW_w = sum_q w(q) P_idle,g(q; c), read from each condition's own idle curve, replaces kW_o:

  owh  = a + b H kW_o + c k_w + d H P_LS       (7j, reference)
  owd  = a + b H (kW_o - P_LS) + c k_w         (7j, reference)
  owhw = a + b H kW_w + c k_w + d H P_LS
  owdw = a + b H (kW_w - P_LS) + c k_w

Scored exactly as 7j: (A) leave-one-condition-and-maker-family-out over 308 diagonals, (B1) the nine half-speed
conditions held out, (B2) S = 0.20 and 0.50 held out. Diagnostic: kappa, the slope of kW_w on kW_o over the 14
variants (per condition, and pooled with a condition fixed effect). Check: at the central condition, +0.5 kW on P_LS
and +0.5 kW on the whole P_OC(q) curve move each diagonal's E50 by equal and opposite amounts. Predictions RW1 to RW6
are in LOG.md (7k), registered before any 7k number was computed.

Usage: python gear_pump_ratio.py [cache dir] > gear_pump_ratio_results.txt
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
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_part_stroke_eta import tables  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

RULES = ("owh", "owd", "owhw", "owdw")
DELTA = 0.5


def row(rule, r):
    """Design row of one cell record (kwo, kww, kw, pls, h) for one rule."""
    h = r["h"]
    if rule == "owh":
        return [1.0, h * r["kwo"], r["kw"], h * r["pls"]]
    if rule == "owd":
        return [1.0, h * (r["kwo"] - r["pls"]), r["kw"]]
    if rule == "owhw":
        return [1.0, h * r["kww"], r["kw"], h * r["pls"]]
    if rule == "owdw":
        return [1.0, h * (r["kww"] - r["pls"]), r["kw"]]
    raise KeyError(rule)


def design(recs, rule):
    return np.array([row(rule, r) for r in recs])


def fit(recs, rule):
    beta, *_ = np.linalg.lstsq(design(recs, rule), np.array([r["e50"] for r in recs]), rcond=None)
    return beta


def held_out(recs, grp, held, rule):
    """As 7j: errors on the held conditions' diagonals, fitted without them, leave-one-maker-family-out."""
    err = {}
    for gname in sorted(set(grp.values()), key=str):
        train = [r for r in recs if r["c"] not in held and grp[r["f"]] != gname and grp[r["g"]] != gname]
        b = fit(train, rule)
        test = [r for r in recs if r["c"] in held and r["f"] == r["g"] and grp[r["f"]] == gname]
        for r, p in zip(test, design(test, rule) @ b):
            err[(r["c"], r["f"])] = r["e50"] - float(p)
    return err


def kappa(pairs):
    """Least-squares slope of kW_w on kW_o with a fixed effect per condition; pairs: {cond: [(kwo, kww), ...]}."""
    x, y = [], []
    for v in pairs.values():
        a = np.array(v, float)
        x.extend(a[:, 0] - a[:, 0].mean())
        y.extend(a[:, 1] - a[:, 1].mean())
    x, y = np.array(x), np.array(y)
    return float(x @ y / (x @ x))


_MEMO = {}
_RAW_BUILD = gc.build


def memo_build(cache):
    """gc.build once per cache (7j's build calls it too)."""
    if cache not in _MEMO:
        _MEMO[cache] = _RAW_BUILD(cache)
    return _MEMO[cache]


def main(cache):
    gc.build = memo_build
    conds, keys, grp = one.build(cache)
    gears, E, rows, idle0, kw0, norm, _, cells0 = memo_build(cache)
    picks = []
    for f in gc.BASE:
        e = float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - cells0[(f, f)])))])
        picks.append(gc.picks(rows, norm[f], e, idle0[f])[0])
    qs, cnt = np.unique(np.concatenate(picks), return_counts=True)
    w = dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))
    coef = LossCurves(tables()).full[gs.T]

    kww = []
    for j, c in enumerate(conds):
        setting = tuple(st.CONDITIONS[j][0])
        if list(setting) != list(c["setting"]) or st.CONDITIONS[j][1] != c["share"]:
            raise SystemExit(f"condition {j} does not match 7j's cache")
        idle = {k: gear_powers(g, coef, *setting) for k, g in gears.items()}
        if abs(float(idle[keys[0]][1]) - c["pls"]) > 1e-9:
            raise SystemExit(f"condition {j}: standby kW does not match 7j's cache")
        kww.append({k: gd.pick_weighted_idle(idle[k][0], w) for k in keys})

    recs = one.records(conds)
    for r in recs:
        r["kww"] = kww[r["c"]][r["g"]]
    n_c = len(conds)
    half = {j for j, c in enumerate(conds) if c["setting"][2] == 0.5}
    ends = {j for j, c in enumerate(conds) if c["share"] in (0.20, 0.50)}
    central = next(j for j, c in enumerate(conds) if list(c["setting"]) == list(CENTRAL) and c["share"] == S_C)

    out = []
    p = out.append
    p("Milestone 7k: 7j's idle-hour rule with the drag read at the optimum's picks (kW_w) in place of kW_o; 7j's 22 "
      "idle conditions, 14 variants, 196 cells each, 4312 cells")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py; neutral readings as "
      "excavator_idle_standby.py)")
    p("")

    # Check: uniform +DELTA on P_LS against uniform +DELTA on the P_OC(q) curve, central condition, 14 diagonals.
    gs.S_C = S_C
    idle_c = {k: gear_powers(g, coef, *CENTRAL) for k, g in gears.items()}
    worst, same, shifts = 0.0, 0.0, []
    for f in keys:
        eta = lambda x, e, f=f: np.minimum(gs.CAP, e * norm[f][x["i"]])  # noqa: E731
        poc, pls = idle_c[f]
        base = gs.crossing(list(gc.E_GRID), gs.shares(rows, eta, (poc, pls)))
        up_ls = gs.crossing(list(gc.E_GRID), gs.shares(rows, eta, (poc, pls + DELTA)))
        up_oc = gs.crossing(list(gc.E_GRID), gs.shares(rows, eta, (poc + DELTA, pls)))
        both = gs.crossing(list(gc.E_GRID), gs.shares(rows, eta, (poc + DELTA, pls + DELTA)))
        same = max(same, abs(both - base))
        if abs(base - conds[central]["cells"][(f, f)]) > 1e-12:
            raise SystemExit(f"central diagonal {f} does not reproduce 7j's cell")
        shifts.append((up_ls - base, up_oc - base))
        worst = max(worst, abs((up_ls - base) + (up_oc - base)))
    p(f"Check, central condition, 14 diagonals: +{DELTA} kW on P_LS moves E50 by {min(a for a, _ in shifts):+.4f} to "
      f"{max(a for a, _ in shifts):+.4f}; +{DELTA} kW on the whole P_OC(q) curve by "
      f"{min(b for _, b in shifts):+.4f} to {max(b for _, b in shifts):+.4f}; largest |sum| {worst:.1e} (registered bar 1e-9: "
      f"{'met' if worst <= 1e-9 else 'not met'}; equal and opposite only to first order, the crossing being "
      "nonlinear in the idle charge)")
    p(f"Post hoc: +{DELTA} kW on both at once moves no diagonal's E50 (largest |change| {same:.1e}): the model "
      "sees standby and drag only as their difference")
    p("")

    p("The drag at the picks against the drag at 85 L/min, per variant (central condition):")
    for k in keys:
        p(f"  {gc.name(k):28s}  kW_o {conds[central]['kwo'][k]:.3f}  kW_w {kww[central][k]:.3f}  "
          f"ratio {kww[central][k] / conds[central]['kwo'][k]:.3f}")
    pairs = {j: [(conds[j]["kwo"][k], kww[j][k]) for k in keys] for j in range(n_c)}
    per = [kappa({j: pairs[j]}) for j in range(n_c)]
    kap = kappa(pairs)
    p(f"kappa (slope of kW_w on kW_o over the 14 variants): pooled with condition fixed effects {kap:.3f} "
      f"(1/kappa {1 / kap:.2f}); per condition {min(per):.3f} to {max(per):.3f}, median {np.median(per):.3f}")
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
    ratio = {r: -allfit[r][3] / allfit[r][1] for r in ("owh", "owhw")}
    p(f"  -d/b (standby kW against drag kW, both per idle hour): owh {ratio['owh']:.2f}, owhw {ratio['owhw']:.2f}")
    p("")

    score = {}
    for name, sets in (("A", [{j} for j in range(n_c)]), ("B1", [half]), ("B2", [ends])):
        score[name] = {}
        for r in RULES:
            err = {}
            for held in sets:
                err.update(held_out(recs, grp, held, r))
            score[name][r] = err
    p("(A) leave-one-condition-and-maker-family-out, RMS over 308 diagonals (max per-condition RMS; mean bias):")
    for r in RULES:
        e = score["A"][r]
        pc = [g5.rms([v for (j, _), v in e.items() if j == c]) for c in range(n_c)]
        p(f"  {r:4s}  {g5.rms(list(e.values())):.4f}  (max {max(pc):.4f}; bias {np.mean(list(e.values())):+.4f})")
    p("")
    p("Per condition, (A) RMS: owh / owd / owhw / owdw")
    for j, c in enumerate(conds):
        s, x = c["setting"], c["share"]
        vals = [g5.rms([v for (k, _), v in score["A"][r].items() if k == j]) for r in RULES]
        p(f"  {s[0]:12s} sb {s[1]:3.1f}  n {s[2]:3.1f}  S {x:.2f}  LS {c['pls']:.2f}   " +
          " / ".join(f"{v:.4f}" for v in vals) + f"   kappa {per[j]:.3f}")
    p("")
    for name, label in (("B1", "nine half-idle-speed conditions held out together, RMS over 126 diagonals"),
                        ("B2", "S = 0.20 and 0.50 held out together, RMS over 28 diagonals")):
        p(f"({name}) {label} (mean bias):")
        for r in RULES:
            e = list(score[name][r].values())
            p(f"  {r:4s}  {g5.rms(e):.4f}  ({np.mean(e):+.4f})")
    p("")
    p("Per variant, (A) error pooled over the 22 conditions (RMS): owh / owhw / owdw")
    for k in keys:
        vals = [g5.rms([v for (_, f), v in score["A"][r].items() if f == k]) for r in ("owh", "owhw", "owdw")]
        p(f"  {gc.name(k):28s}  " + " / ".join(f"{v:.4f}" for v in vals))
    p("")

    A = {r: g5.rms(list(score["A"][r].values())) for r in RULES}
    d = allfit["owhw"][3]
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7k):")
    p(f"  RW1 owhw d < 0 and -d/b in [0.90, 1.10]: {ok(d < 0 and 0.90 <= ratio['owhw'] <= 1.10)} "
      f"(d {d:+.4f}, -d/b {ratio['owhw']:.2f})")
    p(f"  RW2 owhw -d/b closer to 1 than owh's: {ok(abs(ratio['owhw'] - 1) < abs(ratio['owh'] - 1))} "
      f"({ratio['owhw']:.2f} against {ratio['owh']:.2f})")
    p(f"  RW3 pooled kappa within 0.10 of 1/1.22: {ok(abs(kap - 1 / 1.22) <= 0.10)} ({kap:.3f} against 0.820)")
    p(f"  RW4 owdw (A) within 10% of owhw: {ok(abs(A['owdw'] / A['owhw'] - 1) <= 0.10)} "
      f"({A['owdw'] / A['owhw'] - 1:+.0%})")
    p(f"  RW5 owdw (A) below owd's 0.0068: {ok(A['owdw'] < 0.0068)} ({A['owdw']:.4f}; owd here {A['owd']:.4f})")
    p(f"  RW6 owhw (A) at most 0.0062: {ok(A['owhw'] <= 0.0062)} ({A['owhw']:.4f})")
    p("")
    p("Sources: as gear_pump_onerule.py (7j); kW_w as gear_pump_pickdrag.py (7f), read on each condition's own idle "
      "curve with 7e's central pick weight w(q).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
