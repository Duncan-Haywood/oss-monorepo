"""Milestone 7g: the drag at 85 L/min from the pump's own held curve, plus only the spin's and step-up drive's
extra drag, weighted by the fuel optimum's picks above the largest size (LOG.md 7f, Next o).

7f's pick-weighted drag kW_w cleared the registered 20% bar pooled but cost the held panel (0.0034 against
two-number's 0.0022). 7g keeps kW at 85 L/min for the curve a catalogue pump has, and charges the extra drag of the
spin or drive only where the picks fall:

  kW_o(g) = kW_85(h) + sum_{q > Q_L(h)} w(q) [P_idle,g(q) - P_idle,h(q)]

with h the held (never-spun, ungeared) reading of g's family, Q_L its largest size's 20 bar flow at 2100 r/min, w(q)
7e's pooled pick weight, P_idle on GRID at the central setting. For the six never-spun families and the held AZPF and
AZPN, h = g and kW_o = kW_85 by construction.

Rules: two, w, dw, dww (7f's, as checks); o = a + b kW_o; ow = a + b kW_o + c k_w. Scored as 7f. Predictions OD1 to
OD6 are in LOG.md (7g), registered before any 7g number was computed.

Usage: python gear_pump_holddrag.py [cache dir] > gear_pump_holddrag_results.txt
Needs numpy and h5py (cache shared with 5z to 7f).
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
from excavator_breakeven_geometry import GRID  # noqa: E402

SRC, BASE = gc.SRC, gc.BASE
name, group = gc.name, gc.group
RULES = ("two", "w", "dw", "dww", "o", "ow")
gd.SPEC.update({"o": ("kwo", None), "ow": ("kwo", "w")})
CHECK_POOLED = {"two": 0.0084, "w": 0.0069, "dw": 0.0067, "dww": 0.0059}
CHECK_HELD = {"two": 0.0022, "w": 0.0017, "dw": 0.0034, "dww": 0.0034}
W_PANEL = {"spun (7b)": 0.0026, "geared (7c)": 0.0042}


def held_plus_extra(kw85_h, poc_g, poc_h, w, q_l):
    """kW_85 of the held reading plus the pick-weighted extra idle power of g over h above Q_L (poc on GRID)."""
    return float(kw85_h + sum(wq * (poc_g[gd.grid_index(q)] - poc_h[gd.grid_index(q)])
                              for q, wq in w.items() if q > q_l))


def main(cache):
    gears, E, rows, idle, kw, norm, keys, cells = gc.build(cache)
    grp = {k: group(k) for k in keys}

    picks = []
    for f in BASE:
        e = float(gc.E_GRID[int(np.argmin(np.abs(gc.E_GRID - cells[(f, f)])))])
        pk, _ = gc.picks(rows, norm[f], e, idle[f])
        picks.append(pk)
    allq = np.concatenate(picks)
    qs, cnt = np.unique(allq, return_counts=True)
    w = dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))
    qbig = {k: float(gears[grp[k]].qn[-1]) for k in keys}

    feat = {"kw": kw,
            "kww": {k: gd.pick_weighted_idle(idle[k][0], w) for k in keys},
            "kwo": {k: held_plus_extra(kw[grp[k]], idle[k][0], idle[grp[k]][0], w, qbig[k]) for k in keys},
            "w": {k: sum(wq * g.eta(q, 150.0) for q, wq in w.items()) / E[k] - 1.0 for k, g in gears.items()}}

    out = []
    p = out.append
    p("Milestone 7g: the drag read at 85 L/min on the pump's held curve plus the spin's and drive's extra drag weighted "
      "by the picks above the largest size (kW_o), scored as 7f")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py)")
    p("")
    p(f"Picks reused from 7e: {len(allq)} (median {np.median(allq):.1f} L/min)")
    p("")
    p("Variants (held reading h; Q_L of h; share of picks above Q_L; idle kW at 85 L/min; 7f's kW_w; kW_o; k_w; E50):")
    p("  variant        held       Q_L    above   kW85    kW_w    kW_o    k_w      E50")
    for k in keys:
        p(f"  {name(k):13s}  {grp[k]:9s}  {qbig[k]:5.1f}  {float(np.mean(allq > qbig[k])):.3f}  {kw[k]:5.2f}  "
          f"{feat['kww'][k]:6.2f}  {feat['kwo'][k]:6.2f}  {feat['w'][k]:+.4f}  {cells[(k, k)]:.4f}")
    p("")

    p("(i) pooled fits on all 196 cells")
    beta = {}
    rules = ("one",) + RULES
    for r in rules:
        b = gd.fit(cells, feat, r)
        beta[r] = b
        res = np.array(list(cells.values())) - gd.pred(b, list(cells), feat, r)
        p(f"  {r:4s}: coefficients " + ", ".join(f"{x:+.4f}" for x in b) + f"; in-sample RMS {g5.rms(res):.4f}")
    p("")

    p("(ii) pooled leave-one-maker-family-out (8 groups; the AZPF's and the AZPN's four readings held out together)")
    lo = {r: gd.lofo(cells, keys, grp, feat, r) for r in rules}
    p("  variant        diagonal  " + "  ".join(f"{r:>7s}" for r in rules))
    for k in keys:
        p(f"  {name(k):13s}  {cells[(k, k)]:.4f}    " + "  ".join(f"{lo[r][k]:+.4f}" for r in rules))
    prms = {r: g5.rms(list(lo[r].values())) for r in rules}
    p("  RMS over 14 diagonals: " + ", ".join(f"{r} {prms[r]:.4f}" for r in rules) +
      "  (check against 7f: " + ", ".join(f"{r} {prms[r] - v:+.4f}" for r, v in CHECK_POOLED.items()) + ")")
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
        e = {r: gd.lofo(pc, mem, ident, feat, r) for r in rules}
        prm[nm] = {r: g5.rms(list(e[r].values())) for r in rules}
        chk = "" if nm != "held (7a)" else "  (check against 7f: " + ", ".join(
            f"{r} {prm[nm][r] - v:+.4f}" for r, v in CHECK_HELD.items()) + ")"
        p(f"  {nm:12s} diagonal RMS: " + ", ".join(f"{r} {prm[nm][r]:.4f}" for r in rules) + chk)
        p("    diagonal errors two / ow: " + ", ".join(f"{name(m)} {e['two'][m]:+.4f} / {e['ow'][m]:+.4f}"
                                                     for m in mem))
    hp = prm["held (7a)"]
    p(f"  held panel by construction: o - two {hp['o'] - hp['two']:+.4f}, ow - w {hp['ow'] - hp['w']:+.4f}")
    p("")

    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    gn = ("azpn",) + SRC
    p("Predictions (LOG.md 7g):")
    p(f"  OD1 pooled o diagonal RMS below two-number: {ok(prms['o'] < prms['two'])} "
      f"({prms['o']:.4f} against {prms['two']:.4f}, {prms['o'] / prms['two'] - 1:+.0%})")
    p(f"  OD2 pooled ow diagonal RMS at least 20% below two-number: {ok(prms['ow'] <= 0.8 * prms['two'])} "
      f"({prms['ow']:.4f} against {prms['two']:.4f}, {prms['ow'] / prms['two'] - 1:+.0%})")
    p(f"  OD3 pooled ow diagonal RMS at most dww's: {ok(round(prms['ow'], 4) <= round(prms['dww'], 4))} "
      f"({prms['ow']:.4f} against {prms['dww']:.4f})")
    p(f"  OD4 pooled o kW_o slope positive: {ok(beta['o'][1] > 0)} ({beta['o'][1]:+.4f})")
    p(f"  OD5 geared AZPN (sourced) within +-0.005 under ow, pooled out of sample: {ok(abs(lo['ow'][gn]) <= 0.005)} "
      f"({lo['ow'][gn]:+.4f}; two-number {lo['two'][gn]:+.4f}, dww {lo['dww'][gn]:+.4f})")
    both = all(prm[nm]["ow"] < v for nm, v in W_PANEL.items())
    p(f"  OD6 spun and geared panels, ow below w on both: {ok(both)} (" + "; ".join(
        f"{nm} {prm[nm]['ow']:.4f} against {prm[nm]['w']:.4f}" for nm in W_PANEL) + ")")
    p("")
    p("Sources: as gear_pump_stepup.py.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
