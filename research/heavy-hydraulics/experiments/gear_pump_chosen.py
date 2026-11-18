"""Milestone 7e: read the shape where the fuel optimum picks its pumps (LOG.md 7d, Next m).

7d's k_lo reads a family's shape at one flow (57 L/min). The crossing is set by the fixed pump sizes the optimum picks
over the 384 geometries, so 7e weights the shape by where those picks fall:

  picks:  for each of the six never-spun families' diagonal cells, at the grid E nearest that cell's E50, each
          geometry's chosen size is the GRID flow that maximises its break-even rate f_t (fcurve's argmax);
          the 2304 picks are pooled into one weight w(q). The AZPF and AZPN readings never enter it.
  k_w   = sum_q w(q) eta_f(q, 150 bar) / E_f - 1
  s_f   = share of the pooled picks above family f's largest size's 20 bar flow at 2100 r/min

Rules: one; two (a + b kW); lo (7d's k_lo, as a check); w (a + b kW + c k_w); above (a + b kW + c s). Scored as 7d:
pooled 196-cell fit, leave-one-maker-family-out over eight groups (RMS over 14 diagonals), and the 7a, 7b, 7c panels
alone, leave-one-family-out. Predictions WS1 to WS6 are in LOG.md (7e), registered before any 7e number was computed.

Usage: python gear_pump_chosen.py [cache dir] > gear_pump_chosen_results.txt
Needs numpy and h5py (cache shared with 5z to 7d).
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
import gear_pump_third as gt  # noqa: E402
import digitise_rexroth_azpg as rx  # noqa: E402
import digitise_rexroth_azpn as rn  # noqa: E402
import digitise_rexroth_azpu as ru  # noqa: E402
import digitise_rexroth_azpf as rf  # noqa: E402
from excavator_gear_pump import Gear, gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C, fcurve  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = g5.E_GRID
Q85, Q_LO = gt.Q85, gt.Q_LO
SRC, LOSSY, BASE = gt.SRC, gt.LOSSY, gt.BASE
CHECK = {"held (7a)": (0.0022, 0.0022), "spun (7b)": (0.0035, 0.0028), "geared (7c)": (0.0051, 0.0040)}
POOLED_CHECK = (0.0084, 0.0068)
RULES = ("one", "two", "lo", "w", "above")
name, group, fit, pred = gt.name, gt.group, gt.fit, gt.pred


def picks(rows, normf, e, idle):
    """Chosen fixed-pump flow (GRID argmax of f_t) per geometry, shape normf scaled to index e, idle (poc, pls)."""
    poc, pls = idle
    out, flat = [], 0
    for x in rows:
        eta = np.minimum(gs.CAP, e * normf[x["i"]])
        f = fcurve({"sm": x["A"] - x["Bv"] / eta, "tau": x["tau"], "s0": x["s0"]}, poc, pls, S_C)
        flat += int(f.max() <= 0.0)
        out.append(float(GRID[int(np.argmax(f))]))
    return np.array(out), flat


def build(cache):
    gs.E_GRID = E_GRID
    base = gs.families()
    base["rexroth"] = Gear(gr.rexroth_rows(), sizes=rx.SIZES)
    base["azpu"] = Gear(g7.azpu_rows(), sizes=ru.SIZES)
    gears = {f: base[f] for f in BASE}
    rows_of = {"azpf": (g8.azpf_rows(), rf.SIZES), "azpn": (g6.azpn_rows(), rn.SIZES)}
    for f, (r, sz) in rows_of.items():
        gears[f] = Gear(r, sizes=sz)
        gears[f + "_spin"] = gp.SpunGear(r, sz, gp.SPUN[f])
        for e, t in (SRC, LOSSY):
            gears[(f, e, t)] = gu.GearedSpun(r, sz, gp.SPUN[f], gu.P2[f], e, t)
    E = {k: (gs.index2(g, k) if isinstance(k, str) and not k.endswith("_spin") else g.eta(Q85, 150.0))
         for k, g in gears.items()}
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
    cells = {(f, g): cell(f, g) for f in keys for g in keys}
    return gears, E, rows, idle, kw, norm, keys, cells


def main(cache):
    gears, E, rows, idle, kw, norm, keys, cells = build(cache)
    grp = {k: group(k) for k in keys}

    allp, per = [], {}
    for f in BASE:
        e = float(E_GRID[int(np.argmin(np.abs(E_GRID - cells[(f, f)])))])
        pk, flat = picks(rows, norm[f], e, idle[f])
        per[f] = (e, pk, flat)
        allp.append(pk)
    allp = np.concatenate(allp)
    qs, cnt = np.unique(allp, return_counts=True)
    w = dict(zip(qs.tolist(), (cnt / cnt.sum()).tolist()))
    qbig = {k: float(gears[k].qn[-1]) for k in keys}
    feat = {"lo": {k: g.eta(Q_LO, 150.0) / E[k] - 1.0 for k, g in gears.items()},
            "w": {k: sum(wq * g.eta(q, 150.0) for q, wq in w.items()) / E[k] - 1.0 for k, g in gears.items()},
            "above": {k: float(np.mean(allp > qbig[k])) for k in keys}}

    out = []
    p = out.append
    p("Milestone 7e: the shape read where the fuel optimum picks its pumps (k_w, chosen-size-weighted) and the share of "
      "picks above a family's largest size (s), scored as 7d scored k_lo")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps and drive loss as gear_pump_stepup.py)")
    p("")
    p("Picks (chosen fixed-pump flow, argmax of f_t over GRID, 384 geometries) on the six never-spun diagonals:")
    p("  family      E read   p10    median  p90    mean   no positive f_t")
    for f in BASE:
        e, pk, flat = per[f]
        p(f"  {f:10s}  {e:.4f}  {np.percentile(pk, 10):5.1f}  {np.median(pk):6.1f}  {np.percentile(pk, 90):5.1f}  "
          f"{pk.mean():5.1f}  {flat}")
    p(f"  pooled 2304 picks: p10 {np.percentile(allp, 10):.1f}, median {np.median(allp):.1f}, "
      f"p90 {np.percentile(allp, 90):.1f}, mean {allp.mean():.1f} L/min; {len(w)} distinct flows")
    hist = np.histogram(allp, bins=np.arange(10.0, 190.0, 20.0))
    p("  share by 20 L/min bin: " + ", ".join(f"{int(a)}-{int(a) + 20} {c / len(allp):.1%}"
                                              for a, c in zip(hist[1][:-1], hist[0])))
    p("")
    p("Variants (index 2; largest size's 20 bar flow at 2100 r/min; k_lo; k_w; s; idle kW at 85 L/min; diagonal E50):")
    p("  variant        group      index 2  Q_L     k_lo     k_w      s       idle kW  E50")
    for k in keys:
        p(f"  {name(k):13s}  {grp[k]:9s}  {E[k]:.4f}  {qbig[k]:5.1f}  {feat['lo'][k]:+.4f}  {feat['w'][k]:+.4f}  "
          f"{feat['above'][k]:.4f}  {kw[k]:7.2f}  {cells[(k, k)]:.4f}")
    p("")

    p("(i) pooled fits on all 196 cells")
    beta = {}
    for r in RULES:
        b = gt_fit(cells, kw, feat, r)
        beta[r] = b
        res = np.array(list(cells.values())) - gt_pred(b, list(cells), kw, feat, r)
        terms = f"{b[0] + (b[1] * 3.57 if len(b) > 1 else 0.0):.4f}"
        if len(b) > 1:
            terms += f" + {b[1]:.4f} (kW - 3.57)"
        if len(b) > 2:
            terms += f" {b[2]:+.4f} {r}"
        p(f"  {r:5s}: E50 = {terms}; in-sample RMS {g5.rms(res):.4f}")
    p("")

    p("(ii) pooled leave-one-maker-family-out (8 groups; the AZPF's and the AZPN's four readings held out together)")
    lo = {r: lofo(cells, keys, grp, kw, feat, r) for r in RULES}
    p("  variant        diagonal  " + "  ".join(f"{r:>7s}" for r in RULES))
    for k in keys:
        p(f"  {name(k):13s}  {cells[(k, k)]:.4f}    " + "  ".join(f"{lo[r][k]:+.4f}" for r in RULES))
    prms = {r: g5.rms(list(lo[r].values())) for r in RULES}
    p("  RMS over 14 diagonals: " + ", ".join(f"{r} {prms[r]:.4f}" for r in RULES) +
      f"  (check: two {prms['two'] - POOLED_CHECK[0]:+.4f}, lo {prms['lo'] - POOLED_CHECK[1]:+.4f} against 7d)")
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
          f"  (check against 7d: two {prm[nm]['two'] - CHECK[nm][0]:+.4f}, lo {prm[nm]['lo'] - CHECK[nm][1]:+.4f})")
        p("    diagonal errors two / w: " + ", ".join(f"{name(m)} {e['two'][m]:+.4f} / {e['w'][m]:+.4f}"
                                                    for m in mem))
    p("")

    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    gn = ("azpn",) + SRC
    p("Predictions (LOG.md 7e):")
    p(f"  WS1 pooled w-rule diagonal RMS at least 20% below two-number: {ok(prms['w'] <= 0.8 * prms['two'])} "
      f"({prms['w']:.4f} against {prms['two']:.4f}, {prms['w'] / prms['two'] - 1:+.0%})")
    p(f"  WS2 pooled w-rule diagonal RMS below k_lo's: {ok(prms['w'] < prms['lo'])} "
      f"({prms['w']:.4f} against {prms['lo']:.4f})")
    p(f"  WS3 pooled k_w coefficient negative: {ok(beta['w'][2] < 0)} ({beta['w'][2]:+.4f})")
    p(f"  WS4 geared AZPN (sourced) within +-0.005 under the w rule, pooled out of sample: "
      f"{ok(abs(lo['w'][gn]) <= 0.005)} ({lo['w'][gn]:+.4f}; two-number {lo['two'][gn]:+.4f}, "
      f"lo {lo['lo'][gn]:+.4f})")
    p(f"  WS5 held panel w-rule diagonal RMS at most 0.0030: {ok(prm['held (7a)']['w'] <= 0.0030)} "
      f"({prm['held (7a)']['w']:.4f})")
    p(f"  WS6 above rule does not cut the pooled diagonal RMS by 20%: {ok(prms['above'] > 0.8 * prms['two'])} "
      f"({prms['above']:.4f} against {prms['two']:.4f}, {prms['above'] / prms['two'] - 1:+.0%})")
    p("")
    p("Sources: as gear_pump_stepup.py.")
    print("\n".join(out))


def design(keys, kw, feat, rule):
    cols = [np.ones(len(keys))]
    if rule != "one":
        cols.append([kw[g] for _, g in keys])
    if rule in ("lo", "w", "above"):
        cols.append([feat[rule][f] for f, _ in keys])
    return np.column_stack(cols)


def gt_fit(cells, kw, feat, rule):
    keys = list(cells)
    beta, *_ = np.linalg.lstsq(design(keys, kw, feat, rule), np.array([cells[c] for c in keys]), rcond=None)
    return beta


def gt_pred(beta, cellkeys, kw, feat, rule):
    return design(cellkeys, kw, feat, rule) @ beta


def lofo(cells, members, grp, kw, feat, rule):
    """7d's leave-one-group-out, with this milestone's rules."""
    err = {}
    for g in sorted(set(grp[m] for m in members), key=str):
        out = [m for m in members if grp[m] == g]
        train = {c: v for c, v in cells.items() if c[0] in members and c[1] in members
                 and grp[c[0]] != g and grp[c[1]] != g}
        b = gt_fit(train, kw, feat, rule)
        for m in out:
            err[m] = cells[(m, m)] - float(gt_pred(b, [(m, m)], kw, feat, rule)[0])
    return err


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
