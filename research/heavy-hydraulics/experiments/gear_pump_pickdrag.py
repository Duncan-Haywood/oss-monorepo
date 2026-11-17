"""Milestone 7f: read the drag where the fuel optimum picks its pumps, and the shape at each pick's own pressure
(LOG.md 7e, Next n).

Every rule since 6u reads the drag as the family's idle kW at 85 L/min; 7e found the optimum's picks centre on
72 L/min. 7f reuses 7e's 14 variants, 196 cells and its pooled pick weight w(q) unchanged and reads:

  kW_w  = sum_q w(q) P_idle,g(q)                       (drag family's fixed-pump idle power on GRID, central setting)
  k_wp  = mean over the 2304 picks (i, q) of eta_f(q, p_c + m*_i(q)) / E_f - 1   (each pick at its own pressure)

Rules: two and w (7e's, as checks); dw = a + b kW_w; dww = a + b kW_w + c k_w; wp = a + b kW + c k_wp;
dwp = a + b kW_w + c k_wp. Scored as 7e. Predictions DP1 to DP6 are in LOG.md (7f), registered before any 7f number
was computed.

Usage: python gear_pump_pickdrag.py [cache dir] > gear_pump_pickdrag_results.txt
Needs numpy and h5py (cache shared with 5z to 7e).
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import gear_pump_five as g5  # noqa: E402
import gear_pump_chosen as gc  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = g5.E_GRID
SRC, BASE = gc.SRC, gc.BASE
name, group = gc.name, gc.group
RULES = ("two", "w", "dw", "dww", "wp", "dwp")
# rule -> (drag feature, shape feature or None)
SPEC = {"one": (None, None), "two": ("kw", None), "w": ("kw", "w"), "dw": ("kww", None), "dww": ("kww", "w"),
        "wp": ("kw", "wp"), "dwp": ("kww", "wp")}
CHECK_POOLED = {"two": 0.0084, "w": 0.0069}
CHECK_HELD = {"two": 0.0022, "w": 0.0017}


def grid_index(q):
    return int(round((q - GRID[0]) / (GRID[1] - GRID[0])))


def design(keys, feat, rule):
    d, s = SPEC[rule]
    cols = [np.ones(len(keys))]
    if d:
        cols.append([feat[d][g] for _, g in keys])
    if s:
        cols.append([feat[s][f] for f, _ in keys])
    return np.column_stack(cols)


def fit(cells, feat, rule):
    keys = list(cells)
    beta, *_ = np.linalg.lstsq(design(keys, feat, rule), np.array([cells[c] for c in keys]), rcond=None)
    return beta


def pred(beta, keys, feat, rule):
    return design(keys, feat, rule) @ beta


def lofo(cells, members, grp, feat, rule):
    err = {}
    for g in sorted(set(grp[m] for m in members), key=str):
        out = [m for m in members if grp[m] == g]
        train = {c: v for c, v in cells.items() if c[0] in members and c[1] in members
                 and grp[c[0]] != g and grp[c[1]] != g}
        b = fit(train, feat, rule)
        for m in out:
            err[m] = cells[(m, m)] - float(pred(b, [(m, m)], feat, rule)[0])
    return err


def pick_weighted_idle(poc, w):
    """sum_q w(q) poc(q) with poc on GRID."""
    return float(sum(wq * poc[grid_index(q)] for q, wq in w.items()))


def main(cache):
    gears, E, rows, idle, kw, norm, keys, cells = gc.build(cache)
    grp = {k: group(k) for k in keys}

    pairs = []                                   # (row index, GRID index) of every pick
    for f in BASE:
        e = float(E_GRID[int(np.argmin(np.abs(E_GRID - cells[(f, f)])))])
        pk, _ = gc.picks(rows, norm[f], e, idle[f])
        pairs += [(i, grid_index(q)) for i, q in enumerate(pk)]
    allq = np.array([GRID[j] for _, j in pairs])
    qs, cnt = np.unique(allq, return_counts=True)
    w = dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))

    feat = {"kw": kw,
            "kww": {k: pick_weighted_idle(idle[k][0], w) for k in keys},
            "w": {k: sum(wq * g.eta(q, 150.0) for q, wq in w.items()) / E[k] - 1.0 for k, g in gears.items()},
            "wp": {k: float(np.mean([rows[i]["eo"][k][j] for i, j in pairs])) / E[k] - 1.0 for k in keys}}
    pm = np.array([rows[i]["pms"][j] for i, j in pairs])

    out = []
    p = out.append
    p("Milestone 7f: the drag read where the fuel optimum picks its pumps (kW_w, idle kW averaged over 7e's picks) and "
      "the shape read at each pick's own outlet pressure (k_wp), scored as 7e")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py)")
    p("")
    p(f"Picks reused from 7e: {len(pairs)} (median {np.median(allq):.1f} L/min, mean {allq.mean():.1f}); "
      f"outlet pressure at the picks p10 {np.percentile(pm, 10):.0f}, median {np.median(pm):.0f}, "
      f"p90 {np.percentile(pm, 90):.0f} bar")
    p("")
    p("Variants (idle kW at 85 L/min; pick-weighted idle kW; ratio; k_w at 150 bar; k_wp at the picks' pressures; "
      "diagonal E50):")
    p("  variant        group      kW85    kW_w    kW_w/kW85  k_w      k_wp     E50")
    for k in keys:
        p(f"  {name(k):13s}  {grp[k]:9s}  {kw[k]:5.2f}  {feat['kww'][k]:6.2f}  {feat['kww'][k] / kw[k]:9.3f}  "
          f"{feat['w'][k]:+.4f}  {feat['wp'][k]:+.4f}  {cells[(k, k)]:.4f}")
    p("")

    p("(i) pooled fits on all 196 cells")
    beta = {}
    for r in ("one",) + RULES:
        b = fit(cells, feat, r)
        beta[r] = b
        res = np.array(list(cells.values())) - pred(b, list(cells), feat, r)
        p(f"  {r:4s}: coefficients " + ", ".join(f"{x:+.4f}" for x in b) + f"; in-sample RMS {g5.rms(res):.4f}")
    p("")

    p("(ii) pooled leave-one-maker-family-out (8 groups; the AZPF's and the AZPN's four readings held out together)")
    rules = ("one",) + RULES
    lo = {r: lofo(cells, keys, grp, feat, r) for r in rules}
    p("  variant        diagonal  " + "  ".join(f"{r:>7s}" for r in rules))
    for k in keys:
        p(f"  {name(k):13s}  {cells[(k, k)]:.4f}    " + "  ".join(f"{lo[r][k]:+.4f}" for r in rules))
    prms = {r: g5.rms(list(lo[r].values())) for r in rules}
    p("  RMS over 14 diagonals: " + ", ".join(f"{r} {prms[r]:.4f}" for r in rules) +
      "  (check against 7e: " + ", ".join(f"{r} {prms[r] - v:+.4f}" for r, v in CHECK_POOLED.items()) + ")")
    sub = {r: g5.rms([lo[r][k] for k in keys if grp[k] in BASE or k in ("azpf", "azpn")]) for r in rules}
    p("  RMS over the 8 held diagonals only: " + ", ".join(f"{r} {sub[r]:.4f}" for r in rules))
    p("")

    p("(iii) the 7a, 7b and 7c eight-family panels alone, leave-one-family-out (64 cells each)")
    panels = {"held (7a)": [*BASE, "azpf", "azpn"], "spun (7b)": [*BASE, "azpf_spin", "azpn_spin"],
              "geared (7c)": [*BASE, ("azpf",) + SRC, ("azpn",) + SRC]}
    prm = {}
    for nm, mem in panels.items():
        ident = {m: m for m in mem}
        pc = {c: v for c, v in cells.items() if c[0] in mem and c[1] in mem}
        e = {r: lofo(pc, mem, ident, feat, r) for r in rules}
        prm[nm] = {r: g5.rms(list(e[r].values())) for r in rules}
        chk = "" if nm != "held (7a)" else "  (check against 7e: " + ", ".join(
            f"{r} {prm[nm][r] - v:+.4f}" for r, v in CHECK_HELD.items()) + ")"
        p(f"  {nm:12s} diagonal RMS: " + ", ".join(f"{r} {prm[nm][r]:.4f}" for r in rules) + chk)
        p("    diagonal errors two / dww: " + ", ".join(f"{name(m)} {e['two'][m]:+.4f} / {e['dww'][m]:+.4f}"
                                                      for m in mem))
    p("")

    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    gn = ("azpn",) + SRC
    p("Predictions (LOG.md 7f):")
    p(f"  DP1 pooled dw diagonal RMS below two-number: {ok(prms['dw'] < prms['two'])} "
      f"({prms['dw']:.4f} against {prms['two']:.4f}, {prms['dw'] / prms['two'] - 1:+.0%})")
    p(f"  DP2 pooled dww diagonal RMS at least 20% below two-number: {ok(prms['dww'] <= 0.8 * prms['two'])} "
      f"({prms['dww']:.4f} against {prms['two']:.4f}, {prms['dww'] / prms['two'] - 1:+.0%})")
    p(f"  DP3 pooled dw kW_w slope positive: {ok(beta['dw'][1] > 0)} ({beta['dw'][1]:+.4f})")
    p(f"  DP4 geared AZPN (sourced) within +-0.005 under dww, pooled out of sample: {ok(abs(lo['dww'][gn]) <= 0.005)} "
      f"({lo['dww'][gn]:+.4f}; two-number {lo['two'][gn]:+.4f}, w {lo['w'][gn]:+.4f})")
    p(f"  DP5 wp and w differ by at most 0.0005 in pooled diagonal RMS: "
      f"{ok(abs(prms['wp'] - prms['w']) <= 0.0005)} ({prms['wp']:.4f} against {prms['w']:.4f})")
    p(f"  DP6 held panel dww diagonal RMS at most 0.0030: {ok(prm['held (7a)']['dww'] <= 0.0030)} "
      f"({prm['held (7a)']['dww']:.4f})")
    p("")
    p("Sources: as gear_pump_stepup.py.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
