"""Milestone 6j: idle and still time charged to both pumps on the excavator break-even.

6b to 6i charge pump energy only on the moving samples. Here the no-function time is charged too:
the fixed pump circulates q_p through the open-centre neutral passage at p_n(q_p) and pays its own loss
at full stroke; the load-sensing pump sits at standby pressure (the margin) at zero stroke and pays its
zero-stroke loss on the full 219 L/min displacement, plus a standby flow (measured.idle_pump_power,
loss from 6h's 4-term fit at 60 C). No-function share S of all machine hours (the record's own still
time included) is swept around the telematics anchors 0.20, 0.30, 0.38, 0.40 (Moore 2020, LOG.md 6j).
The moving part is 6i's anchored case, unchanged (checked: S = s0 with idle power zeroed reproduces 6i).
Predictions J1 to J6 are in LOG.md (6j), registered before this script existed.

Usage: python excavator_idle_standby.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py (cache shared with 5z, 6a, 6c, 6g and 6i).
"""
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import (breakeven_rest_rate_idle, idle_hours_per_work_hour,  # noqa: E402
                                       idle_pump_power, part_stroke_eta)
from measured_excavator_flow import load, CYL, Q_PUMP, COV  # noqa: E402
from measured_excavator_pump_size import Trace, KIN  # noqa: E402
from excavator_breakeven_geometry import case_curves, GRID, JOINTS, M_C, P_C  # noqa: E402
from excavator_part_stroke_eta import tables, fstar2, B_C, NO_LOAD_2100  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402

T = 60
SHARES = (0.20, 0.30, 0.38, 0.40, 0.50)
S_C = 0.38                                   # Komatsu, ~75,000 machines, 12 months (Moore 2020)
F6I = {"central": 5.635, "share_3986": 66.7, "median": 4.63, "q_central": 101.0}   # 6i committed, anchored, 60 C
N_SEC = 7


def pn_pvg(q):
    """Danfoss PVG 32 open-centre bypass in neutral, 8.5 bar at no flow to 16 bar at 140 L/min (2n)."""
    return 8.5 + 7.5 * q / 140.0


def pn_salami_text(q):
    """Salami VD8A text, about 1 bar per spool at 75 L/min, as Q^2 (2i), 7 sections."""
    return N_SEC * (q / 75.0) ** 2


def pn_salami_curve(q):
    """Salami VD8A 8-spool curve, 12.7 bar at 90 L/min, scaled to 7 sections, as Q^2 (2i)."""
    return 12.7 * (N_SEC / 8.0) * (q / 90.0) ** 2


READINGS = {"PVG32": pn_pvg, "Salami-text": pn_salami_text, "Salami-curve": pn_salami_curve}
CENTRAL = ("PVG32", 2.0, 1.0)                # neutral reading, standby flow L/min, idle speed ratio
SETTINGS = [CENTRAL] + [(r, qs, n) for r in READINGS for qs in (0.0, 2.0, 5.0) for n in (1.0, 0.5)
                        if (r, qs, n) != CENTRAL]


def powers(coef, reading, q_sb, n_r, p_sb=M_C):
    """(P_OC on GRID, P_LS) in kW for one setting."""
    pn = READINGS[reading]
    poc = np.array([idle_pump_power(coef, float(q), pn(float(q) * n_r), Q_PUMP, p_sb, q_sb, n_r)[0] for q in GRID])
    pls = idle_pump_power(coef, 100.0, 0.0, Q_PUMP, p_sb, q_sb, n_r)[1]
    return poc, pls


def fcurve(row, poc, pls, share):
    """breakeven_rest_rate_idle on GRID, vectorised (0 where it returns None; checked against it below)."""
    h = idle_hours_per_work_hour(share, row["s0"])
    s = row["sm"] + B_C * (pls - poc) * h
    tau = row["tau"]
    ok = (s > 0) & (tau > 1)
    out = np.zeros_like(s)
    out[ok] = s[ok] / (tau[ok] - 1.0)
    return out


def main(cache):
    tabs = tables()
    lc = LossCurves(tabs)
    coef = lc.full[T]
    tab = tabs[T]
    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    po = P_C + M_C
    out = []
    p = out.append
    p("Milestone 6j: excavator break-even with idle and still time charged to both pumps")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; efficiency: Kauranne 2022, Energies 15:4030, "
      "Fig. 13, CC BY, digitised; idle share: Moore 2020, Construction Equipment, manufacturer telematics)")
    p(f"central: {T} C, margin {M_C} bar (= standby pressure), p {P_C:.1f} bar, b {B_C} L/kWh, moving part as 6i "
      f"(anchored); idle: {CENTRAL[0]} neutral, standby flow {CENTRAL[1]} L/min, idle pump speed ratio {CENTRAL[2]}")
    k0, kp, kl, kc = coef
    p(f"loss fit {T} C (6h): L = {k0:.3f} + {kp:.5f} p + {kl:.3e} p^2 + {kc:.5f} x p bar of full-stroke flow")
    p("")
    p("Idle pump power, kW (standby flow 2 L/min, working speed; load-sensing at 20 bar standby):")
    for name in READINGS:
        poc, pls = powers(coef, name, 2.0, 1.0)
        diff = poc - pls
        k = int(np.argmin(np.abs(diff)))
        cross = None
        if diff[0] < 0 < diff[-1]:
            j = int(np.argmax(diff > 0))
            cross = GRID[j - 1] + (GRID[j] - GRID[j - 1]) * (-diff[j - 1]) / (diff[j] - diff[j - 1])
        line = ", ".join(f"q_p {q:.0f}: {poc[int(round((q - GRID[0]) / 0.5))]:.2f}" for q in (60, 80, 100, 120, 160, 219))
        p(f"  {name:12s}: open-centre {line}; load-sensing {pls:.2f}; equal at q_p "
          + (f"{cross:.1f} L/min" if cross is not None else "none") +
          f"; stock 219 L/min / load-sensing = {poc[-1] / pls:.2f}; p_n(101) {READINGS[name](101.0):.2f} bar, "
          f"p_n(219) {READINGS[name](219.0):.2f} bar")
    for n_r in (0.5,):
        poc, pls = powers(coef, "PVG32", 2.0, n_r)
        p(f"  PVG32 at idle speed ratio {n_r}: open-centre q_p 100: {poc[180]:.2f}, 219: {poc[-1]:.2f}; "
          f"load-sensing {pls:.2f}")
    p("")
    rows = []
    fs = (1.0, 1.5, 2.0, 2.5)
    for fb, fa, fu in itertools.product(fs, repeat=3):
        lev = [lev0[0] / fb, lev0[1] / fa, lev0[2] / fu]
        for bs in (1, -1):
            for s_sw in (0.0, 0.5, 1.0):
                tr = Trace(recs, lev, KIN + (bs,), s_sw)
                r, tau, q_ls, mu, phi, r219 = case_curves(tr)
                e = lc.eta_ls(T, "anchored", tr.q, tr.w, po)
                ms = COV * (r - 1.0) * P_C
                eoc = np.array([part_stroke_eta(tab, 1.0, P_C + v) for v in ms])
                sm = B_C * q_ls / 600.0 * (po / e - (P_C + ms) / eoc)
                t_ls = sum(float((np.maximum(1.0, q / Q_PUMP) * dt).sum()) for q, _, dt in tr.files)
                t_still = sum(float((~mv).sum() * dt) for _, mv, dt in tr.files)
                row = {"key": (fb, fa, fu, bs, s_sw), "tau": tau, "sm": sm, "s0": t_still / t_ls}
                f6i = fstar2(tab, r, tau, q_ls, M_C, P_C, B_C, e)
                f0 = np.array([breakeven_rest_rate_idle(sm[k], tau[k], B_C, 0.0, 0.0, 0.0) or 0.0
                               for k in range(len(GRID))])
                row["check"] = float(np.abs(f0 - f6i).max())
                row["f6i"] = float(f6i.max())
                ms219 = COV * (r219 - 1.0) * P_C
                row["stock_gap"] = B_C * q_ls / 600.0 * ((P_C + ms219) / part_stroke_eta(tab, 1.0, P_C + ms219) - po / e)
                rows.append(row)
    cen = next(x for x in rows if x["key"] == (1.0, 1.0, 1.0, 1, 0.5))
    chk = max(x["check"] for x in rows)
    s0s = np.array([x["s0"] for x in rows])
    p(f"check: with idle power zeroed the break-even equals 6i's anchored f_t*(q_p) on every pump size and geometry "
      f"(max |diff| {chk:.2e} L/h); central f_t,max {cen['f6i']:.3f} (6i committed {F6I['central']}); share above "
      f"3.986 L/h {np.mean(np.array([x['f6i'] for x in rows]) > 3.986) * 100:.1f}% (6i {F6I['share_3986']}%)")
    assert chk < 1e-9
    p(f"record still share s0 = t_still / t_ls: central {cen['s0']:.4f}; over geometries {s0s.min():.4f} to "
      f"{s0s.max():.4f} (the still samples do not depend on geometry; t_ls does, through slowing at 219 L/min)")
    p("")
    poc_c, pls_c = powers(coef, *CENTRAL)
    h_c = idle_hours_per_work_hour(S_C, cen["s0"])
    scalar = np.array([breakeven_rest_rate_idle(cen["sm"][k], cen["tau"][k], B_C, pls_c, poc_c[k], h_c) or 0.0
                       for k in range(len(GRID))])
    vd = float(np.abs(scalar - fcurve(cen, poc_c, pls_c, S_C)).max())
    assert vd < 1e-12
    p(f"check: vectorised break-even equals measured.breakeven_rest_rate_idle on the central geometry at S {S_C} "
      f"(max |diff| {vd:.1e})")
    p("")
    results = {}
    for setting in SETTINGS:
        poc, pls = powers(coef, *setting)
        for share in (None,) + SHARES:
            fmax, qarg, fc = [], [], None
            for x in rows:
                f = fcurve(x, poc, pls, x["s0"] if share is None else share)
                k = int(f.argmax())
                fmax.append(float(f[k]))
                qarg.append(float(GRID[k]))
                if x is cen:
                    fc = (float(f[k]), float(GRID[k]), f)
            results[(setting, share)] = (np.array(fmax), np.array(qarg), fc)
    def summary(setting, share):
        fm, qa, fc = results[(setting, share)]
        return (f"central {fc[0]:.3f} L/h at q_p {fc[1]:.1f}; median {np.median(fm):.2f} (p10 {np.percentile(fm, 10):.2f}, "
                f"p90 {np.percentile(fm, 90):.2f}); beats 3.986: {np.mean(fm > 3.986) * 100:.1f}%, 5.056: "
                f"{np.mean(fm > 5.056) * 100:.1f}%; median maximising q_p {np.median(qa):.1f}")
    p("Central setting (PVG32 neutral, standby 2 L/min, working speed), f_t,max over the 384 geometries:")
    p(f"  record only (S = s0): {summary(CENTRAL, None)}")
    for share in SHARES:
        p(f"  S = {share:.2f}: {summary(CENTRAL, share)}")
    p("  central geometry f_t*(q_p), record only -> S = 0.38, L/h:")
    fa, fb_ = results[(CENTRAL, None)][2][2], results[(CENTRAL, S_C)][2][2]
    for q in (50.0, 60.0, 70.0, 80.0, 90.0, 100.0, 110.0, 120.0):
        k = int(round((q - GRID[0]) / 0.5))
        p(f"    q_p {q:5.1f}: {fa[k]:.3f} -> {fb_[k]:.3f}")
    p("")
    p(f"All settings at S = {S_C} (reading, standby flow L/min, idle speed ratio):")
    for setting in SETTINGS:
        p(f"  {setting[0]:12s} q_sb {setting[1]:.0f} n_r {setting[2]:.1f}: {summary(setting, S_C)}")
    p("")
    p("No-function share at which the fixed pump stops beating 3.986 L/h (central setting; bisection on S):")
    poc, pls = powers(coef, *CENTRAL)
    def s_cross(x, v=3.986):
        if fcurve(x, poc, pls, x["s0"]).max() <= v:
            return "never wins"
        if fcurve(x, poc, pls, 0.95).max() > v:
            return "above 0.95"
        lo, hi = x["s0"], 0.95
        for _ in range(30):
            mid = 0.5 * (lo + hi)
            lo, hi = (mid, hi) if fcurve(x, poc, pls, mid).max() > v else (lo, mid)
        return 0.5 * (lo + hi)
    sc = s_cross(cen)
    p(f"  central geometry: {sc if isinstance(sc, str) else f'{sc:.3f}'}")
    vals = [s_cross(x) for x in rows]
    num = np.array([v for v in vals if not isinstance(v, str)])
    nw = sum(1 for v in vals if v == "never wins")
    na = sum(1 for v in vals if v == "above 0.95")
    p(f"  geometries: {nw} never win on the record alone, {na} still win at S 0.95, {len(num)} cross in between"
      + (f" (crossing S median {np.median(num):.3f}, p10 {np.percentile(num, 10):.3f}, p90 {np.percentile(num, 90):.3f})"
         if len(num) else ""))
    p("")
    p("Stock 219 L/min fixed pump against load-sensing, pump fuel per hour of load-sensing record (L/h, positive: "
      "open-centre burns more), central setting:")
    for share in (None, S_C):
        g = np.array([x["stock_gap"] - B_C * (pls - poc[-1]) * idle_hours_per_work_hour(
            x["s0"] if share is None else share, x["s0"]) for x in rows])
        p(f"  {'record only' if share is None else f'S = {share}'}: min {g.min():+.3f}, median {np.median(g):+.3f}, "
          f"max {g.max():+.3f}; open-centre burns more in {np.mean(g > 0) * 100:.1f}%")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    fr, qr, fcr = results[(CENTRAL, None)]
    f38, q38, fc38 = results[(CENTRAL, S_C)]
    poc, pls = powers(coef, *CENTRAL)
    diff = poc - pls
    j = int(np.argmax(diff > 0))
    cross = GRID[j - 1] + 0.5 * (-diff[j - 1]) / (diff[j] - diff[j - 1])
    salt = results[(("Salami-text", 2.0, 1.0), S_C)][0]
    p("Predictions (LOG.md 6j):")
    p(f"  J1 record still time moves central f_t,max < 0.1 L/h: {ok(abs(fcr[0] - cen['f6i']) < 0.1)} "
      f"({cen['f6i']:.3f} -> {fcr[0]:.3f}, {fcr[0] - cen['f6i']:+.3f})")
    p(f"  J2 idle-power crossover q_p in 50-120 L/min: {ok(50 <= cross <= 120)} ({cross:.1f})")
    p(f"  J3 stock pump idles >= 3x load-sensing standby: {ok(poc[-1] >= 3 * pls)} ({poc[-1] / pls:.2f}x)")
    p(f"  J4 share above 3.986 L/h at S 0.38 < 50%: {ok(np.mean(f38 > 3.986) < 0.5)} ({np.mean(f38 > 3.986) * 100:.1f}%)")
    p(f"  J5 central maximising q_p at S 0.38 < 101: {ok(fc38[1] < F6I['q_central'])} ({fc38[1]:.1f})")
    p(f"  J6 Salami-text at S 0.38 raises the median f_t,max over 6i's: {ok(np.median(salt) > F6I['median'])} "
      f"({np.median(salt):.2f} vs {F6I['median']})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0), digitised; Danfoss PVG 32 and Salami VD8A neutral curves (2n, 2i); Moore 2020 (idle shares).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
