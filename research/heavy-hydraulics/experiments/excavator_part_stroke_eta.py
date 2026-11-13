"""Milestone 6g: the excavator's break-even rest-of-machine fuel rate with a measured efficiency-against-
displacement curve in place of one borrowed pump efficiency.

6c priced both circuits with the loader's record-wide eta = 0.818. A load-sensing variable pump runs at part
stroke most of the time; a fixed pump runs at full stroke. Kauranne (2022, Energies 15:4030, doi:10.3390/
en15114030, CC BY) measured one axial piston pump with its swash plate locked at four strokes; Figure 13 is
digitised in data/kauranne2022_fig13_total_efficiency.csv (digitise_kauranne_eta.py). Here:
  eta_LS: flow-weighted harmonic mean of eta(min(q, 219)/219, p + m) over the moving samples;
  eta_OC: eta(1, p + m*) (fixed pump at full stroke), m* = 0.78 (r - 1) p (5u);
  f_t*(q_p) = (b / 600) Q_LS [(p + m) / eta_LS - (p + m*) / eta_OC] / (tau - 1)
(measured.breakeven_rest_rate_two_eta), maximised over the fixed pump size. Predictions G1 to G6 are in
LOG.md (6g), registered before this script existed.

Usage: python excavator_part_stroke_eta.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py (cache shared with 5z, 6a and 6c).
"""
import csv
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import (breakeven_rest_rate_two_eta, eta_table,  # noqa: E402
                                       part_stroke_eta)
from measured_excavator_flow import load, CYL, Q_PUMP, COV  # noqa: E402
from measured_excavator_pump_size import Trace, KIN  # noqa: E402
from excavator_breakeven_geometry import (case_curves, fstar, GRID, JOINTS, M_C, P_C, MARGINS,  # noqa: E402
                                          PRESS)

B_C = 0.2203                                   # 6f, ASABE D497.6 general model
BS = (0.2116, B_C, 0.2332)                     # 6f's measured tractor, the model, the loader
NO_LOAD_2100 = (3.986, 4.022, 4.298, 4.689, 4.731, 5.056)   # 6f, XE80E carried no-load rates at 2100 rpm, L/h
TEMPS = (60, 25)


def tables():
    with open(os.path.join(HERE, "data", "kauranne2022_fig13_total_efficiency.csv")) as fh:
        rows = [r for r in csv.DictReader(l for l in fh if not l.startswith("#"))]
    return {t: eta_table(rows, t) for t in TEMPS}


def eta_ls(tab, q, w, p_out):
    x = np.minimum(q, Q_PUMP) / Q_PUMP
    e = np.array([part_stroke_eta(tab, float(v), p_out) for v in x])
    return float((q * w).sum() / (q * w / e).sum())


def eta_ls_fast(tab, q, w, p_out):
    """Same as eta_ls on a 0.001 grid of fractions (used inside the sweep)."""
    xs = np.linspace(0, 1, 1001)
    es = np.array([part_stroke_eta(tab, float(v), p_out) for v in xs])
    e = np.interp(np.minimum(q, Q_PUMP) / Q_PUMP, xs, es)
    return float((q * w).sum() / (q * w / e).sum())


def fstar2(tab, r, tau, q_ls, m, p, b, e_ls, e_oc_fixed=None, oc_scale=1.0):
    """f_t*(q_p) on GRID; e_oc_fixed overrides the full-stroke curve, oc_scale multiplies it."""
    out = np.zeros_like(r)
    for k in range(len(r)):
        ms = COV * (r[k] - 1.0) * p
        e_oc = e_oc_fixed if e_oc_fixed is not None else oc_scale * part_stroke_eta(tab, 1.0, p + ms)
        v = breakeven_rest_rate_two_eta(m, ms, p, q_ls, tau[k], b, e_ls, e_oc)
        out[k] = 0.0 if v is None else v
    return out


def main(cache):
    tabs = tables()
    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    out = []
    p = out.append
    p("Milestone 6g: excavator break-even rest-of-machine fuel rate with part-stroke pump efficiency")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; efficiency: Kauranne 2022, Energies 15:4030, "
      "Fig. 13, CC BY, digitised)")
    p(f"central: 60 C (21 cSt), margin {M_C} bar, p {P_C:.0f} bar (load-sensing outlet {P_C + M_C:.0f} bar), "
      f"b {B_C} L/kWh (6f); fixed pump at full stroke, load-sensing at min(q, 219)/219 of stroke")
    p("")
    p("Digitised efficiency used (fraction of 45 cm3/r -> total efficiency):")
    for t in TEMPS:
        for pr in (100.0, P_C + M_C, 200.0):
            p(f"  {t} C, {pr:.0f} bar: " + ", ".join(f"{x:.2f}: {part_stroke_eta(tabs[t], x, pr):.3f}"
                                                     for x in (12 / 45, 0.4, 0.6, 0.8, 1.0)))
    p("")
    fs = (1.0, 1.5, 2.0, 2.5)
    rows = []
    for fb, fa, fu in itertools.product(fs, repeat=3):
        lev = [lev0[0] / fb, lev0[1] / fa, lev0[2] / fu]
        for bs in (1, -1):
            for s_sw in (0.0, 0.5, 1.0):
                tr = Trace(recs, lev, KIN + (bs,), s_sw)
                r, tau, q_ls, mu, phi, r219 = case_curves(tr)
                central = (fb, fa, fu, bs, s_sw) == (1.0, 1.0, 1.0, 1, 0.5)
                res = {"key": (fb, fa, fu, bs, s_sw), "q_ls": q_ls, "r219": r219}
                for t in TEMPS:
                    e = (eta_ls if central else eta_ls_fast)(tabs[t], tr.q, tr.w, P_C + M_C)
                    f = fstar2(tabs[t], r, tau, q_ls, M_C, P_C, B_C, e)
                    k = int(f.argmax())
                    res[t] = {"eta_ls": e, "f": float(f[k]), "q": float(GRID[k]), "tau": float(tau[k]),
                              "eta_oc": part_stroke_eta(tabs[t], 1.0, P_C + COV * (r[k] - 1) * P_C)}
                    # stock pump (219 L/min): fuel gap per hour at f_t = 0 (positive = open-centre burns more)
                    ms = COV * (r219 - 1) * P_C
                    res[t]["stock_gap"] = B_C * q_ls / 600 * ((P_C + ms) / part_stroke_eta(tabs[t], 1.0, P_C + ms)
                                                             - (P_C + M_C) / e)
                    if central:
                        res[t]["curve"] = f
                f6c = fstar(r, tau, q_ls, M_C, P_C, B_C, 0.818)
                res["f6c"] = float(f6c.max())
                if central:
                    eq = fstar2(tabs[60], r, tau, q_ls, M_C, P_C, B_C, 0.818, e_oc_fixed=0.818)
                    res["equal_eta_check"] = (float(eq.max()), res["f6c"])
                    assert abs(res["equal_eta_check"][0] - res["f6c"]) < 1e-9
                # the fixed pump's efficiency (as a fraction of the curve's full-stroke value) at which this
                # geometry's f_t,max falls to 6f's lowest and highest 2100 rpm no-load rates
                e60 = eta_ls_fast(tabs[60], tr.q, tr.w, P_C + M_C)
                res["scale_at"] = {}
                for v in (NO_LOAD_2100[0], NO_LOAD_2100[-1]):
                    lo, hi = 0.80, 1.0
                    if fstar2(tabs[60], r, tau, q_ls, M_C, P_C, B_C, e60, oc_scale=hi).max() <= v:
                        res["scale_at"][v] = None          # load-sensing already wins at the curve's value
                        continue
                    for _ in range(30):
                        mid = 0.5 * (lo + hi)
                        if fstar2(tabs[60], r, tau, q_ls, M_C, P_C, B_C, e60, oc_scale=mid).max() > v:
                            hi = mid
                        else:
                            lo = mid
                    res["scale_at"][v] = 0.5 * (lo + hi)
                # sweep: margin x pressure x b at 60 C (eta from the curve, so it is no longer swept)
                allf = []
                for m in MARGINS:
                    for pr in PRESS:
                        e = eta_ls_fast(tabs[60], tr.q, tr.w, pr + m)
                        for b in BS:
                            allf.append(float(fstar2(tabs[60], r, tau, q_ls, m, pr, b, e).max()))
                res["sweep_min"], res["sweep_max"] = min(allf), max(allf)
                rows.append(res)
    cen = next(x for x in rows if "curve" in x[60])
    c60, c25 = cen[60], cen[25]
    p("Central geometry (levers 1/1/1, bucket +1, swing 0.5):")
    p(f"  check: the new formula with eta_LS = eta_OC = 0.818 gives f_t,max {cen['equal_eta_check'][0]:.4f}, "
      f"6c's formula {cen['equal_eta_check'][1]:.4f} L/h (b {B_C})")
    p(f"  60 C: eta_LS {c60['eta_ls']:.4f} (flow-weighted), eta_OC at the maximising pump {c60['eta_oc']:.4f}; "
      f"f_t,max {c60['f']:.3f} L/h at q_p {c60['q']:.1f} L/min (tau {c60['tau']:.3f}); 6c at b {B_C}: {cen['f6c']:.3f}")
    p(f"  25 C: eta_LS {c25['eta_ls']:.4f}, eta_OC {c25['eta_oc']:.4f}; f_t,max {c25['f']:.3f} L/h at q_p {c25['q']:.1f}")
    p("  f_t*(q_p) at 60 C, L/h:")
    for q in (40.0, 60.0, 80.0, 100.0, 120.0, 140.0, 160.0, 180.0, 200.0):
        k = int(round((q - GRID[0]) / 0.5))
        p(f"    q_p {GRID[k]:6.1f}: {c60['curve'][k]:.3f}")
    p("")
    pct = lambda a, k: float(np.percentile(a, k))  # noqa: E731
    for t in TEMPS:
        f = np.array([x[t]["f"] for x in rows])
        e = np.array([x[t]["eta_ls"] for x in rows])
        q = np.array([x[t]["q"] for x in rows])
        p(f"Over the 384 geometries, {t} C, central parameters: eta_LS {e.min():.3f} to {e.max():.3f} (median {np.median(e):.3f}); "
          f"f_t,max min {f.min():.2f}, p10 {pct(f, 10):.2f}, median {np.median(f):.2f}, p90 {pct(f, 90):.2f}, max {f.max():.2f} L/h; "
          f"maximising pump median {np.median(q):.1f} L/min")
        p("  share of geometries where a smaller fixed pump beats 6f's 2100 rpm no-load rate: " +
          "; ".join(f"{v:.3f} L/h: {np.mean(f > v) * 100:.1f}%" for v in NO_LOAD_2100))
        sg = np.array([x[t]["stock_gap"] for x in rows])
        p(f"  stock 219 L/min fixed pump, pump-fuel gap over load-sensing: min {sg.min():+.3f}, median {np.median(sg):+.3f} L/h "
          f"(open-centre loses in {np.mean(sg > 0) * 100:.1f}%)")
    p("Fixed-pump efficiency at which load-sensing wins back (60 C, central parameters), as a multiple of the curve's "
      "full-stroke value (0.840 at 150 bar):")
    for v in (NO_LOAD_2100[0], NO_LOAD_2100[-1]):
        sc = [x["scale_at"][v] for x in rows if x["scale_at"][v] is not None]
        p(f"  at {v:.3f} L/h: central geometry {cen['scale_at'][v]:.4f} (eta_OC {cen['scale_at'][v] * 0.840:.3f}); "
          f"over the {len(sc)} geometries where a fixed pump wins at the curve's value: median {np.median(sc):.4f}, "
          f"min {min(sc):.4f}, max {max(sc):.4f}")
    p("  (a fixed pump less efficient than that, e.g. a gear pump or a smaller unit, hands the geometry back to load-sensing)")
    f6 = np.array([x["f6c"] for x in rows])
    p(f"For comparison, 6c's formula (eta 0.818 both) at b {B_C}: median {np.median(f6):.3f}, max {f6.max():.3f} L/h")
    smin = np.array([x["sweep_min"] for x in rows])
    smax = np.array([x["sweep_max"] for x in rows])
    p(f"Sweep at 60 C (4 margins x 3 pressures x 3 b = 36 sets): f_t,max over all cases {smin.min():.2f} to {smax.max():.2f} L/h")
    for v in (NO_LOAD_2100[0], NO_LOAD_2100[-1]):
        p(f"  at {v:.3f} L/h: fixed pump wins under every set in {np.mean(smin > v) * 100:.1f}%, "
          f"under at least one set in {np.mean(smax > v) * 100:.1f}% of geometries")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    f60 = np.array([x[60]["f"] for x in rows])
    sg60 = np.array([x[60]["stock_gap"] for x in rows])
    p("Predictions (LOG.md 6g):")
    p(f"  G1 central eta_LS in 0.72-0.80 and full-stroke eta in 0.82-0.86: "
      f"{ok(0.72 <= c60['eta_ls'] <= 0.80 and 0.82 <= part_stroke_eta(tabs[60], 1.0, P_C + M_C) <= 0.86)} "
      f"({c60['eta_ls']:.3f}, {part_stroke_eta(tabs[60], 1.0, P_C + M_C):.3f})")
    p(f"  G2 central f_t,max >= 2 x 2.326: {ok(c60['f'] >= 2 * 2.326)} ({c60['f']:.3f})")
    p(f"  G3 median over 384 >= 2.0 L/h: {ok(np.median(f60) >= 2.0)} ({np.median(f60):.2f})")
    p(f"  G4 share above 3.986 L/h >= 10%: {ok(np.mean(f60 > 3.986) >= 0.10)} ({np.mean(f60 > 3.986) * 100:.1f}%)")
    p(f"  G5 stock pump loses in every geometry: {ok(bool((sg60 > 0).all()))} ({np.mean(sg60 > 0) * 100:.1f}%)")
    d = abs(c25["f"] / c60["f"] - 1)
    p(f"  G6 25 C central within 25% of 60 C: {ok(d <= 0.25)} ({c25['f']:.3f} vs {c60['f']:.3f}, {d * 100:.1f}%)")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0), digitised.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
