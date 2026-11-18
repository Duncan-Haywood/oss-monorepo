"""Milestone 7d: a third rule number for the shape below the index point (LOG.md 7c, Next j).

7c found that a step-up drive lowers a spun pump's index point (85 L/min) without touching the smaller pumps the
optimum also picks; normalised to the index, those look better and the crossing falls, while the two-number rule
(which reads only the drag) predicts a later one. The registered third number reads the shape below the index:

  k_lo = eta_f(57 L/min, 150 bar) / E_f - 1      (57 L/min: the only flow inside every family's 2100 r/min size range)

and, for comparison, 6u's size slope above it, k_hi = eta_f(150 L/min, 150 bar) / E_f - 1, which overfit in 6u/FX5.

Pool: 14 variants, the six never-spun families plus four readings each of the AZPF and AZPN (held, 7a; spun lossless,
7b; geared at the sourced point eta_f 0.9934, tare 0.65 and at the swept lossy corner 0.98, 0.65, 7c). The 14 x 14
(shape, drag) factorial, 196 cells, on 7a's pipeline. Rules: one number; a + b kW; a + b kW + c k_lo; a + b kW + c k_hi
(kW: drag family's idle power at 85 L/min; k: the shape family's). Leave-one-maker-family-out over eight groups (the
AZPF's four readings are one group, the AZPN's another); fit on cells with neither shape nor drag in the group, predict
the group's diagonals; RMS over the 14 diagonals. Then the 7a, 7b and 7c eight-family panels alone, leave-one-family-
out as they ran it (check: two-number RMS 0.0022, 0.0035, 0.0051). Predictions TN1 to TN6 are in LOG.md (7d),
registered before any 7d number was computed.

Usage: python gear_pump_third.py [cache dir] > gear_pump_third_results.txt
Needs numpy and h5py (cache shared with 5z to 7c).
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import gear_pump_shape as gs  # noqa: E402
import gear_pump_rexroth as gr  # noqa: E402
import gear_pump_five as g5  # noqa: E402
import gear_pump_six as g6  # noqa: E402
import gear_pump_seven as g7  # noqa: E402
import gear_pump_eight as g8  # noqa: E402
import gear_pump_spin as gp  # noqa: E402
import gear_pump_stepup as gu  # noqa: E402
import digitise_rexroth_azpg as rx  # noqa: E402
import digitise_rexroth_azpn as rn  # noqa: E402
import digitise_rexroth_azpu as ru  # noqa: E402
import digitise_rexroth_azpf as rf  # noqa: E402
from excavator_gear_pump import Gear, gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = g5.E_GRID
Q85, Q_LO, Q_HI = 85.0, 57.0, 150.0
SPUN = gp.SPUN
SRC, LOSSY = (gu.ETA_SRC, gu.T_SRC), (0.98, 0.65)
BASE = ("casappa", "danfoss", "marzocchi", "bench", "rexroth", "azpu")
CHECK = {"held (7a)": 0.0022, "spun (7b)": 0.0035, "geared (7c)": 0.0051}
RULES = ("one", "two", "lo", "hi")


def name(k):
    if isinstance(k, str):
        return k
    return f"{k[0]}_gear" if k[1:] == SRC else f"{k[0]}_gear98"


def group(k):
    return k if isinstance(k, str) and k in BASE else (k if isinstance(k, str) else k[0]).split("_")[0]


def design(keys, kw, feat, rule):
    cols = [np.ones(len(keys))]
    if rule != "one":
        cols.append([kw[g] for _, g in keys])
    if rule in ("lo", "hi"):
        cols.append([feat[rule][f] for f, _ in keys])
    return np.column_stack(cols)


def fit(cells, kw, feat, rule):
    keys = list(cells)
    beta, *_ = np.linalg.lstsq(design(keys, kw, feat, rule), np.array([cells[c] for c in keys]), rcond=None)
    return beta


def pred(beta, cellkeys, kw, feat, rule):
    return design(cellkeys, kw, feat, rule) @ beta


def lofo(cells, members, grp, kw, feat, rule):
    """Diagonal errors, holding out each group in turn (cells with neither shape nor drag in it)."""
    err = {}
    for g in sorted(set(grp[m] for m in members), key=str):
        out = [m for m in members if grp[m] == g]
        train = {c: v for c, v in cells.items() if c[0] in members and c[1] in members
                 and grp[c[0]] != g and grp[c[1]] != g}
        b = fit(train, kw, feat, rule)
        for m in out:
            err[m] = cells[(m, m)] - float(pred(b, [(m, m)], kw, feat, rule)[0])
    return err


def main(cache):
    gs.E_GRID = E_GRID
    base = gs.families()
    base["rexroth"] = Gear(gr.rexroth_rows(), sizes=rx.SIZES)
    base["azpu"] = Gear(g7.azpu_rows(), sizes=ru.SIZES)
    gears = {f: base[f] for f in BASE}
    rows_of = {"azpf": (g8.azpf_rows(), rf.SIZES), "azpn": (g6.azpn_rows(), rn.SIZES)}
    for f, (r, sz) in rows_of.items():
        gears[f] = Gear(r, sizes=sz)
        gears[f + "_spin"] = gp.SpunGear(r, sz, SPUN[f])
        for e, t in (SRC, LOSSY):
            gears[(f, e, t)] = gu.GearedSpun(r, sz, SPUN[f], gu.P2[f], e, t)
    E = {k: (gs.index2(g, k) if isinstance(k, str) and not k.endswith("_spin") else g.eta(Q85, 150.0))
         for k, g in gears.items()}
    feat = {"lo": {k: g.eta(Q_LO, 150.0) / E[k] - 1.0 for k, g in gears.items()},
            "hi": {k: g.eta(Q_HI, 150.0) / E[k] - 1.0 for k, g in gears.items()}}
    rows, coef = gs.geometry_rows(cache, gears)
    idle = {k: gear_powers(g, coef, *CENTRAL) for k, g in gears.items()}
    k85 = int(round((Q85 - GRID[0]) / 0.5))
    kw = {k: float(idle[k][0][k85]) for k in gears}
    for i, x in enumerate(rows):
        x["i"] = i
    norm = {k: [x["eo"][k] / E[k] for x in rows] for k in gears}

    def cell(f, g):
        sh = gs.shares(rows, lambda x, e: np.minimum(gs.CAP, e * norm[f][x["i"]]), idle[g])
        return gs.crossing(list(E_GRID), sh)

    keys = list(gears)
    grp = {k: group(k) for k in keys}
    cells = {(f, g): cell(f, g) for f in keys for g in keys}

    out = []
    p = out.append
    p("Milestone 7d: a third rule number for the shape below the index point, k_lo = eta(57 L/min, 150 bar)/E - 1, "
      "scored leave-one-maker-family-out on held, spun and geared readings pooled")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py)")
    p("")
    p("Variants (index 2 at 85 L/min and 150 bar; k_lo, k_hi; idle kW at 85 L/min; diagonal E50):")
    p("  variant        group      index 2   k_lo      k_hi      idle kW  E50")
    for k in keys:
        p(f"  {name(k):13s}  {grp[k]:9s}  {E[k]:.4f}  {feat['lo'][k]:+.4f}  {feat['hi'][k]:+.4f}  {kw[k]:7.2f}  "
          f"{cells[(k, k)]:.4f}")
    allc = np.array(list(cells.values()))
    p(f"  196 cells: {allc.min():.4f} to {allc.max():.4f}")
    p("")

    p("(i) pooled fits on all 196 cells")
    beta = {}
    for r in RULES:
        b = fit(cells, kw, feat, r)
        beta[r] = b
        res = np.array(list(cells.values())) - pred(b, list(cells), kw, feat, r)
        terms = f"{b[0] + (b[1] * 3.57 if len(b) > 1 else 0.0):.4f}"
        if len(b) > 1:
            terms += f" + {b[1]:.4f} (kW - 3.57)"
        if len(b) > 2:
            terms += f" {b[2]:+.4f} k_{r}"
        p(f"  {r:4s}: E50 = {terms}; in-sample RMS {g5.rms(res):.4f}")
    p("")

    p("(ii) pooled leave-one-maker-family-out (8 groups; the AZPF's and the AZPN's four readings held out together)")
    lo = {r: lofo(cells, keys, grp, kw, feat, r) for r in RULES}
    p("  variant        diagonal  " + "  ".join(f"{r:>7s}" for r in RULES))
    for k in keys:
        p(f"  {name(k):13s}  {cells[(k, k)]:.4f}    " + "  ".join(f"{lo[r][k]:+.4f}" for r in RULES))
    prms = {r: g5.rms(list(lo[r].values())) for r in RULES}
    p("  RMS over 14 diagonals: " + ", ".join(f"{r} {prms[r]:.4f}" for r in RULES))
    sub = {r: g5.rms([lo[r][k] for k in keys if grp[k] in BASE or k in ("azpf", "azpn")]) for r in RULES}
    p("  RMS over the 8 held diagonals only: " + ", ".join(f"{r} {sub[r]:.4f}" for r in RULES))
    p("")

    p("(iii) the 7a, 7b and 7c eight-family panels alone, leave-one-family-out (64 cells each)")
    panels = {"held (7a)": [*BASE, "azpf", "azpn"], "spun (7b)": [*BASE, "azpf_spin", "azpn_spin"],
              "geared (7c)": [*BASE, ("azpf",) + SRC, ("azpn",) + SRC]}
    prm = {}
    for nm, mem in panels.items():
        ident = {m: m for m in mem}
        pc = {c: v for c, v in cells.items() if c[0] in mem and c[1] in mem}
        e = {r: lofo(pc, mem, ident, kw, feat, r) for r in RULES}
        prm[nm] = {r: g5.rms(list(e[r].values())) for r in RULES}
        p(f"  {nm:12s} diagonal RMS: " + ", ".join(f"{r} {prm[nm][r]:.4f}" for r in RULES) +
          f"  (check: two-number {prm[nm]['two']:.4f} against the milestone's {CHECK[nm]:.4f}, "
          f"{prm[nm]['two'] - CHECK[nm]:+.4f})")
        p("    diagonal errors two / lo: " + ", ".join(f"{name(m)} {e['two'][m]:+.4f} / {e['lo'][m]:+.4f}"
                                                     for m in mem))
    p("")

    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    gn = ("azpn",) + SRC
    p("Predictions (LOG.md 7d):")
    p(f"  TN1 pooled three-number (lo) diagonal RMS at least 20% below two-number: "
      f"{ok(prms['lo'] <= 0.8 * prms['two'])} ({prms['lo']:.4f} against {prms['two']:.4f}, "
      f"{prms['lo'] / prms['two'] - 1:+.0%})")
    p(f"  TN2 pooled k_lo coefficient negative: {ok(beta['lo'][2] < 0)} ({beta['lo'][2]:+.4f})")
    p(f"  TN3 three-number (hi) does not cut the pooled diagonal RMS by 20%: {ok(prms['hi'] > 0.8 * prms['two'])} "
      f"({prms['hi']:.4f} against {prms['two']:.4f}, {prms['hi'] / prms['two'] - 1:+.0%})")
    p(f"  TN4 geared AZPN (sourced) within +-0.005 under three-number (lo), pooled out of sample: "
      f"{ok(abs(lo['lo'][gn]) <= 0.005)} ({lo['lo'][gn]:+.4f}; two-number {lo['two'][gn]:+.4f})")
    p(f"  TN5 held panel three-number (lo) diagonal RMS at most 0.0030: {ok(prm['held (7a)']['lo'] <= 0.0030)} "
      f"({prm['held (7a)']['lo']:.4f})")
    p(f"  TN6 geared panel three-number (lo) diagonal RMS below two-number: "
      f"{ok(prm['geared (7c)']['lo'] < prm['geared (7c)']['two'])} ({prm['geared (7c)']['lo']:.4f} against "
      f"{prm['geared (7c)']['two']:.4f})")
    p("")
    p("Sources: as gear_pump_stepup.py.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
