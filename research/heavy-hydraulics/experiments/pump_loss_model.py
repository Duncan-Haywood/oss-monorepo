"""Milestone 6h: a stroke-linear loss model fitted to Kauranne's measured efficiency curves, tested by
predicting the smallest measured stroke from the larger ones, and the closed-form bound on how much 6g's
flat hold below 12 cm3/r flattered load-sensing.

Data: data/kauranne2022_fig13_total_efficiency.csv (Kauranne 2022, Energies 15:4030, Fig. 13, CC BY,
digitised by digitise_kauranne_eta.py). Model: L = x p (1/eta - 1) = k0 + kp p + kl p^2 + kc x p
(measured.fit_pump_loss). Bound: measured.flat_hold_shortfall. Predictions K1 to K5 are in LOG.md (6h),
registered before this script existed. Standard library only.
"""
import csv
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from heavy_hydraulics.measured import (eta_table, fit_pump_loss, flat_hold_shortfall,  # noqa: E402
                                       loss_model_eta, part_stroke_eta)

TEMPS = (60, 25)
X0 = 12 / 45
Q_MAX = 219.0          # XE80E main pump, L/min at 2100 r/min (6e brochure); scaled by displacement fraction
P_OUT = 150.0          # central load-sensing outlet, p 130 + m 20 bar (6g)
B_C = 0.2203           # 6f
TAU_C = 1.144          # central geometry's maximising fixed pump (6g)
FT_C = 5.495           # 6g central f_t,max, L/h
NO_LOAD = (3.986, 5.056)


def rms(v):
    return math.sqrt(sum(a * a for a in v) / len(v))


def main():
    with open(os.path.join(HERE, "data", "kauranne2022_fig13_total_efficiency.csv")) as fh:
        rows = [r for r in csv.DictReader(l for l in fh if not l.startswith("#"))]
    out = []
    p = out.append
    p("Milestone 6h: stroke-linear pump loss model fitted to Kauranne (2022) Fig. 13, and the flat-hold bound")
    p("model: L = x p (1/eta - 1) = k0 + kp p + kl p^2 + kc x p  (L in bar of full-stroke flow, p in bar)")
    p("")
    res = {}
    for t in TEMPS:
        tab = eta_table(rows, t)
        fr, ps, grid = tab
        full = fit_pump_loss(tab)
        held = fit_pump_loss(tab, min_fraction=15 / 45 - 1e-9)
        no25 = fit_pump_loss((fr, ps[1:], grid[1:]))
        resid = [loss_model_eta(full, x, pr) - grid[i][j] for i, pr in enumerate(ps) for j, x in enumerate(fr)]
        hold = {pr: loss_model_eta(held, X0, pr) - grid[i][0] for i, pr in enumerate(ps)}
        k0, kp, kl, kc = full
        a150 = k0 + kp * P_OUT + kl * P_OUT ** 2
        res[t] = dict(full=full, resid=resid, hold=hold, a150=a150, tab=tab, no25=no25)
        p(f"{t} C: k0 {k0:.3f} bar, kp {kp:.5f}, kl {kl:.3e} 1/bar, kc {kc:.5f}")
        p(f"  fit to all {len(resid)} cells: RMS efficiency residual {rms(resid):.4f}, max |residual| "
          f"{max(abs(v) for v in resid):.4f}")
        p("  residual by stroke (cm3/r: mean over pressures): " + ", ".join(
            f"{x * 45:.0f}: {sum(resid[i * len(fr) + j] for i in range(len(ps))) / len(ps):+.4f}"
            for j, x in enumerate(fr)))
        p("  holdout: fit on strokes >= 15 cm3/r, predict 12 cm3/r (model - digitised): " + ", ".join(
            f"{pr:.0f} bar {v:+.4f}" for pr, v in hold.items()))
        p(f"  at {P_OUT:.0f} bar: stroke-independent loss A {a150:.2f} bar, full-stroke loss A + B "
          f"{a150 + kc * P_OUT:.2f} bar, A share {a150 / (a150 + kc * P_OUT):.3f}")
        p(f"  zero-stroke drag at {P_OUT:.0f} bar carried to the XE80E pump: A Q_max / 600 = "
          f"{a150 * Q_MAX / 600:.2f} kW, {B_C * a150 * Q_MAX / 600:.3f} L/h at b {B_C}")
        p(f"  without the 25 bar row: k0 {no25[0]:.3f}, kp {no25[1]:.5f}, kl {no25[2]:.3e}, kc {no25[3]:.5f}; "
          f"A at {P_OUT:.0f} bar {no25[0] + no25[1] * P_OUT + no25[2] * P_OUT ** 2:.2f}")
        p(f"  efficiency at {P_OUT:.0f} bar, model vs 6g's table (flat below {X0:.3f}):")
        for x in (0.05, 0.10, 0.15, 0.20, X0, 0.4, 0.6, 1.0):
            p(f"    x {x:.3f}: model {loss_model_eta(full, x, P_OUT):.3f}, table {part_stroke_eta(tab, x, P_OUT):.3f}")
        p("")
    a = res[60]["a150"]
    p(f"Flat-hold shortfall on the central geometry's f_t* (60 C, A {a:.2f} bar, b {B_C}, Q_max {Q_MAX:.0f}, "
      f"tau {TAU_C}): rise = {B_C * Q_MAX * a / (600 * (TAU_C - 1)):.3f} x g L/h")
    for g in (0.02, 0.05, 0.10, 0.15, 0.20):
        d = flat_hold_shortfall(res[60]["full"], P_OUT, Q_MAX, B_C, g, TAU_C)
        p(f"  g {g:.2f}: f_t* rises by at least {d:.3f} L/h (6g central {FT_C} -> at least {FT_C + d:.3f})")
    per_g = flat_hold_shortfall(res[60]["full"], P_OUT, Q_MAX, B_C, 1.0, TAU_C)
    p(f"  g at which the rise is 1 L/h: {1 / per_g:.3f}")
    p("  (g = E[(1 - x/x0)+] over moving samples, x = q/219; g <= s, the time share with demand under "
      f"{X0 * Q_MAX:.1f} L/min. It needs the motion trace, not reachable from this session.)")
    p("")
    p("Post hoc (added after the first run showed residuals that curve with stroke, so A from the whole range may be")
    p("biased): A at 150 bar from the small strokes only, where the extrapolation starts.")
    for t in TEMPS:
        fr, ps, grid = res[t]["tab"]
        small = [j for j, x in enumerate(fr) if x * 45 <= 25.5]
        sub = ([fr[j] for j in small], ps, [[row[j] for j in small] for row in grid])
        loc = fit_pump_loss(sub)
        a_loc = loc[0] + loc[1] * P_OUT + loc[2] * P_OUT ** 2
        # two-parameter line L = A + B x on the 150 bar row alone, strokes <= 25 cm3/r
        i150 = ps.index(P_OUT)
        xs = [fr[j] for j in small]
        ls = [x * P_OUT * (1 / grid[i150][j] - 1) for x, j in zip(xs, small)]
        mx, ml = sum(xs) / len(xs), sum(ls) / len(ls)
        bb = sum((x - mx) * (l - ml) for x, l in zip(xs, ls)) / sum((x - mx) ** 2 for x in xs)
        a_row = ml - bb * mx
        p(f"  {t} C: 4-term fit on strokes 12-25 cm3/r: A {a_loc:.2f} bar (full-range {res[t]['a150']:.2f}); "
          f"line on the 150 bar row, strokes 12-25: A {a_row:.2f} bar, B {bb:.2f}; "
          f"rise per unit g at the central geometry {B_C * Q_MAX * a_loc / (600 * (TAU_C - 1)):.2f} and "
          f"{B_C * Q_MAX * a_row / (600 * (TAU_C - 1)):.2f} L/h")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    r60, r25 = res[60], res[25]
    worst_rms = max(rms(r60["resid"]), rms(r25["resid"]))
    hold50 = {pr: v for pr, v in r60["hold"].items() if pr >= 50}
    k0, kp, kl, kc = r60["full"]
    share = a / (a + kc * P_OUT)
    e10 = loss_model_eta(r60["full"], 0.10, P_OUT)
    p("Predictions (LOG.md 6h):")
    p(f"  K1 RMS residual <= 0.015 at both temperatures: {ok(worst_rms <= 0.015)} "
      f"(60 C {rms(r60['resid']):.4f}, 25 C {rms(r25['resid']):.4f})")
    p(f"  K2 holdout 12 cm3/r within 0.02 at 50-250 bar, 60 C: {ok(max(abs(v) for v in hold50.values()) <= 0.02)} "
      f"(max |error| {max(abs(v) for v in hold50.values()):.4f})")
    p(f"  K3 A share of full-stroke loss at 150 bar in 0.30-0.70: {ok(0.30 <= share <= 0.70)} ({share:.3f})")
    p(f"  K4 rise > 1 L/h at g 0.10: {ok(flat_hold_shortfall(r60['full'], P_OUT, Q_MAX, B_C, 0.10, TAU_C) > 1)} "
      f"({flat_hold_shortfall(r60['full'], P_OUT, Q_MAX, B_C, 0.10, TAU_C):.3f} L/h)")
    p(f"  K5 model eta at x 0.10, 150 bar, 60 C below 0.55: {ok(e10 < 0.55)} ({e10:.3f})")
    p("")
    p("Source: Kauranne 2022, Energies 15:4030, doi:10.3390/en15114030, Fig. 13 (CC BY 4.0), digitised.")
    print("\n".join(out))


if __name__ == "__main__":
    main()
