"""Milestone 6i: 6g's excavator break-even rerun with the pump's loss continued below the smallest measured
stroke (12 of 45 cm3/r, x0 0.267), and 6h's g measured on the motion trace.

6g held efficiency flat below x0; 6h found 78% of the measured pump's loss at 150 bar does not scale with
stroke and bounded what the hold hid at 10.36 g L/h on the central break-even, g = E[(1 - x/x0)+] over
moving time. Here, below x0 (measured.continued_loss):
  anchored (central): L = L_meas(x0, p) - kc p (x0 - x), kc from 6h's full-range fit;
  model: 6h's 4-term fit everywhere below x0;
  small (post hoc in 6h, labelled): the 4-term fit on 12 to 25 cm3/r only;
  flat: 6g's hold (must reproduce 6g's numbers; checked).
Load-sensing shaft energy per sample is w (q p_out + L(x, p_out) max(Q_max, q)), so a zero-stroke sample still pays
its drag; eta_LS = sum(q w) p_out over that. The fixed pump runs at full stroke from the table, as 6g.
Predictions I1 to I6 are in LOG.md (6i), registered before this script existed.

Usage: python excavator_loss_below_x0.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py (cache shared with 5z, 6a, 6c and 6g).
"""
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import (breakeven_rest_rate_two_eta, continued_loss, fit_pump_loss,  # noqa: E402
                                       part_stroke_eta, stroke_shortfall)
from measured_excavator_flow import load, CYL, Q_PUMP, COV  # noqa: E402
from measured_excavator_pump_size import Trace, KIN  # noqa: E402
from excavator_breakeven_geometry import case_curves, GRID, JOINTS, M_C, P_C, MARGINS, PRESS  # noqa: E402
from excavator_part_stroke_eta import tables, eta_ls as eta_ls_6g, fstar2, B_C, BS, NO_LOAD_2100, TEMPS  # noqa: E402

X0 = 12 / 45
MODES = ("flat", "anchored", "model", "small")
XS = np.linspace(0.0, 1.0, 10001)
G6 = {"f_central": 5.495, "share_3986": 32.8, "scale_central": 0.9622}   # 6g's committed results
BOUND_PER_G = 10.36                                                     # 6h, L/h per unit g (60 C)


class LossCurves:
    """L(x, p_out) on XS for every mode, cached per (temperature, mode, p_out)."""

    def __init__(self, tabs):
        self.tabs = tabs
        self.full = {t: fit_pump_loss(tabs[t]) for t in TEMPS}
        self.small = {t: fit_pump_loss(tabs[t], max_fraction=25 / 45 + 1e-9) for t in TEMPS}
        self.cache = {}

    def curve(self, t, mode, p_out):
        key = (t, mode, p_out)
        if key not in self.cache:
            coef = self.small[t] if mode == "small" else self.full[t]
            m = "model" if mode == "small" else mode
            self.cache[key] = np.array([continued_loss(self.tabs[t], self.full[t][3], float(x), p_out, m, coef)
                                        for x in XS])
        return self.cache[key]

    def eta_ls(self, t, mode, q, w, p_out):
        loss = np.interp(np.minimum(q, Q_PUMP) / Q_PUMP, XS, self.curve(t, mode, p_out))
        loss = loss * np.maximum(1.0, q / Q_PUMP)    # demand above the pump: charged on q at x = 1, as 6g
        return float((q * w).sum() * p_out / (w * (q * p_out + loss * Q_PUMP)).sum())


def main(cache):
    tabs = tables()
    lc = LossCurves(tabs)
    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    po = P_C + M_C
    out = []
    p = out.append
    p("Milestone 6i: excavator break-even with the pump loss continued below 12 cm3/r, and g on the motion trace")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; efficiency: Kauranne 2022, Energies 15:4030, "
      "Fig. 13, CC BY, digitised)")
    p(f"central: 60 C, margin {M_C} bar, p {P_C:.1f} bar (outlet {po:.1f} bar), b {B_C} L/kWh; x0 = {X0:.4f}")
    p("")
    for t in TEMPS:
        k0, kp, kl, kc = lc.full[t]
        s0, sp, sl, sc = lc.small[t]
        p(f"{t} C fits: full range k0 {k0:.3f} kp {kp:.5f} kl {kl:.3e} kc {kc:.5f}; "
          f"12-25 cm3/r k0 {s0:.3f} kp {sp:.5f} kl {sl:.3e} kc {sc:.5f}")
        p(f"  efficiency at {po:.1f} bar by mode (x: flat / anchored / model / small):")
        for x in (0.0, 0.05, 0.10, 0.15, 0.20, X0):
            vals = []
            for mode in MODES:
                lv = float(np.interp(x, XS, lc.curve(t, mode, po)))
                vals.append(x * po / (x * po + lv) if x > 0 else 0.0)
            p(f"    x {x:.3f}: " + " / ".join(f"{v:.3f}" for v in vals) +
              f"   (loss at x: {float(np.interp(x, XS, lc.curve(t, 'anchored', po))):.2f} bar anchored)")
        l0 = float(np.interp(X0, XS, lc.curve(t, "anchored", po)))
        p(f"  anchored zero-stroke loss A_eff = L_meas(x0) - kc p x0 = {l0:.2f} - {kc * po * X0:.2f} = "
          f"{l0 - kc * po * X0:.2f} bar (6h's full-range A: {k0 + kp * po + kl * po * po:.2f})")
    p("")
    fs = (1.0, 1.5, 2.0, 2.5)
    rows = []
    for fb, fa, fu in itertools.product(fs, repeat=3):
        lev = [lev0[0] / fb, lev0[1] / fa, lev0[2] / fu]
        for bs in (1, -1):
            for s_sw in (0.0, 0.5, 1.0):
                tr = Trace(recs, lev, KIN + (bs,), s_sw)
                r, tau, q_ls, mu, phi, r219 = case_curves(tr)
                x = np.minimum(tr.q, Q_PUMP) / Q_PUMP
                g = float((tr.w * np.maximum(0.0, 1.0 - x / X0)).sum() / tr.w.sum())
                s = float(tr.w[x < X0].sum() / tr.w.sum())
                res = {"key": (fb, fa, fu, bs, s_sw), "g": g, "s": s}
                if (fb, fa, fu, bs, s_sw) == (1.0, 1.0, 1.0, 1, 0.5):
                    res["g_check"] = stroke_shortfall(x.tolist(), tr.w.tolist(), X0)
                    res["eta6g_exact"] = eta_ls_6g(tabs[60], tr.q, tr.w, po)
                for t in TEMPS:
                    for mode in MODES:
                        e = lc.eta_ls(t, mode, tr.q, tr.w, po)
                        f = fstar2(tabs[t], r, tau, q_ls, M_C, P_C, B_C, e)
                        k = int(f.argmax())
                        ms = COV * (r219 - 1) * P_C
                        gap = B_C * q_ls / 600 * ((P_C + ms) / part_stroke_eta(tabs[t], 1.0, P_C + ms) - po / e)
                        res[(t, mode)] = {"eta_ls": e, "f": float(f[k]), "q": float(GRID[k]), "tau": float(tau[k]),
                                          "curve": f, "stock_gap": gap}
                e60 = res[(60, "anchored")]["eta_ls"]
                res["scale_at"] = {}
                for v in (NO_LOAD_2100[0], NO_LOAD_2100[-1]):
                    lo, hi = 0.80, 1.0
                    if fstar2(tabs[60], r, tau, q_ls, M_C, P_C, B_C, e60, oc_scale=hi).max() <= v:
                        res["scale_at"][v] = None
                        continue
                    for _ in range(30):
                        mid = 0.5 * (lo + hi)
                        if fstar2(tabs[60], r, tau, q_ls, M_C, P_C, B_C, e60, oc_scale=mid).max() > v:
                            hi = mid
                        else:
                            lo = mid
                    res["scale_at"][v] = 0.5 * (lo + hi)
                allf = []
                for m in MARGINS:
                    for pr in PRESS:
                        e = lc.eta_ls(60, "anchored", tr.q, tr.w, pr + m)
                        for b in BS:
                            allf.append(float(fstar2(tabs[60], r, tau, q_ls, m, pr, b, e).max()))
                res["sweep_min"], res["sweep_max"] = min(allf), max(allf)
                rows.append(res)
    cen = next(x for x in rows if "g_check" in x)
    pct = lambda a, k: float(np.percentile(a, k))  # noqa: E731
    gs = np.array([x["g"] for x in rows])
    ss = np.array([x["s"] for x in rows])
    p("Stroke shortfall below x0 over moving time (x = min(q, 219)/219):")
    p(f"  central geometry: g {cen['g']:.4f}, s {cen['s']:.4f} (stdlib check: g {cen['g_check'][0]:.4f}, "
      f"s {cen['g_check'][1]:.4f})")
    p(f"  over 384 geometries: g min {gs.min():.4f}, p10 {pct(gs, 10):.4f}, median {np.median(gs):.4f}, "
      f"p90 {pct(gs, 90):.4f}, max {gs.max():.4f}; s median {np.median(ss):.4f} ({ss.min():.4f} to {ss.max():.4f})")
    p("")
    fl, an = cen[(60, "flat")], cen[(60, "anchored")]
    p("Central geometry (levers 1/1/1, bucket +1, swing 0.5), 60 C:")
    p(f"  check: flat mode f_t,max {fl['f']:.3f} L/h at q_p {fl['q']:.1f} (6g committed {G6['f_central']}); "
      f"eta_LS {fl['eta_ls']:.5f} on the 1e-4 loss grid, {cen['eta6g_exact']:.5f} by 6g's exact per-sample loop "
      f"(6g committed 0.7694)")
    for mode in MODES:
        c = cen[(60, mode)]
        p(f"  {mode:8s}: eta_LS {c['eta_ls']:.4f}, f_t,max {c['f']:.3f} L/h at q_p {c['q']:.1f} L/min "
          f"(tau {c['tau']:.3f}), rise over flat {c['f'] - fl['f']:+.3f}")
    k6 = int(round((fl["q"] - GRID[0]) / 0.5))
    rise_same = float(an["curve"][k6] - fl["curve"][k6])
    p(f"  6h bound at the measured g: {BOUND_PER_G} x {cen['g']:.4f} = {BOUND_PER_G * cen['g']:.3f} L/h; "
      f"anchored rise at 6g's maximising pump {rise_same:.3f}, at the new maximum {an['f'] - fl['f']:.3f} "
      f"(ratio to bound {rise_same / (BOUND_PER_G * cen['g']):.3f})")
    c25f, c25a = cen[(25, "flat")], cen[(25, "anchored")]
    p(f"  25 C: flat {c25f['f']:.3f}, anchored {c25a['f']:.3f} L/h (rise {c25a['f'] - c25f['f']:+.3f})")
    p("  f_t*(q_p) at 60 C, flat -> anchored, L/h:")
    for q in (60.0, 80.0, 100.0, 120.0, 140.0, 160.0, 180.0, 200.0):
        k = int(round((q - GRID[0]) / 0.5))
        p(f"    q_p {GRID[k]:6.1f}: {fl['curve'][k]:.3f} -> {an['curve'][k]:.3f}")
    p("")
    for t in TEMPS:
        p(f"Over the 384 geometries, {t} C, central parameters:")
        for mode in MODES:
            f = np.array([x[(t, mode)]["f"] for x in rows])
            e = np.array([x[(t, mode)]["eta_ls"] for x in rows])
            sg = np.array([x[(t, mode)]["stock_gap"] for x in rows])
            p(f"  {mode:8s}: eta_LS median {np.median(e):.3f} ({e.min():.3f} to {e.max():.3f}); f_t,max min {f.min():.2f}, "
              f"p10 {pct(f, 10):.2f}, median {np.median(f):.2f}, p90 {pct(f, 90):.2f}, max {f.max():.2f} L/h; "
              "beats " + ", ".join(f"{v:.3f}: {np.mean(f > v) * 100:.1f}%" for v in (NO_LOAD_2100[0], NO_LOAD_2100[-1])) +
              f"; stock-pump gap min {sg.min():+.3f} (open-centre loses in {np.mean(sg > 0) * 100:.1f}%)")
    rise = np.array([x[(60, "anchored")]["f"] - x[(60, "flat")]["f"] for x in rows])
    p(f"  anchored rise over flat, 60 C: min {rise.min():.3f}, median {np.median(rise):.3f}, max {rise.max():.3f} L/h; "
      f"corr(rise, g) {np.corrcoef(rise, gs)[0, 1]:.3f}")
    p("")
    p("Fixed-pump efficiency at which load-sensing wins back (60 C, anchored), as a multiple of the curve's "
      "full-stroke value (0.840 at 150 bar):")
    for v in (NO_LOAD_2100[0], NO_LOAD_2100[-1]):
        sc = [x["scale_at"][v] for x in rows if x["scale_at"][v] is not None]
        cs = cen["scale_at"][v]
        p(f"  at {v:.3f} L/h: central geometry {cs:.4f} (eta_OC {cs * 0.840:.3f}); over the {len(sc)} geometries "
          f"where a fixed pump wins: median {np.median(sc):.4f}, min {min(sc):.4f}, max {max(sc):.4f}")
    smin = np.array([x["sweep_min"] for x in rows])
    smax = np.array([x["sweep_max"] for x in rows])
    p(f"Sweep at 60 C, anchored (4 margins x 3 pressures x 3 b): f_t,max {smin.min():.2f} to {smax.max():.2f} L/h")
    for v in (NO_LOAD_2100[0], NO_LOAD_2100[-1]):
        p(f"  at {v:.3f} L/h: fixed pump wins under every set in {np.mean(smin > v) * 100:.1f}%, "
          f"under at least one in {np.mean(smax > v) * 100:.1f}% of geometries")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    fa = np.array([x[(60, "anchored")]["f"] for x in rows])
    sga = np.array([x[(60, "anchored")]["stock_gap"] for x in rows])
    bnd = BOUND_PER_G * cen["g"]
    p("Predictions (LOG.md 6i):")
    p(f"  I1 central g in 0.05-0.20: {ok(0.05 <= cen['g'] <= 0.20)} ({cen['g']:.4f})")
    p(f"  I2 central f_t,max rises >= 1.0 L/h over 6g's 5.50: {ok(an['f'] - G6['f_central'] >= 1.0)} "
      f"({an['f']:.3f}, +{an['f'] - G6['f_central']:.3f})")
    p(f"  I3 share above 3.986 L/h >= 45%: {ok(np.mean(fa > 3.986) >= 0.45)} ({np.mean(fa > 3.986) * 100:.1f}%)")
    p(f"  I4 central rise >= bound and within 20% of it: {ok(rise_same >= bnd - 1e-9 and rise_same <= 1.2 * bnd)} "
      f"(rise {rise_same:.3f} at 6g's pump, bound {bnd:.3f})")
    p(f"  I5 stock pump: open-centre loses in every geometry: {ok(bool((sga > 0).all()))} ({np.mean(sga > 0) * 100:.1f}%)")
    p(f"  I6 central win-back scale at 3.986 <= 0.95: {ok(cen['scale_at'][NO_LOAD_2100[0]] <= 0.95)} "
      f"({cen['scale_at'][NO_LOAD_2100[0]]:.4f}; 6g {G6['scale_central']})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0), digitised.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
