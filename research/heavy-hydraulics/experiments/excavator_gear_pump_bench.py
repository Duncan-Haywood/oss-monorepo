"""Milestone 6q: the excavator break-even with the bench-measured Casappa KP30 (Frosina, Senatore, Rigosi 2017,
Energies 10:1113, CC BY; 6p) as the fixed pump, so 6p's lower bound (94.8% of geometries at c = 1.15) is replaced by
a computed share.

The bench gives one unit (44 cm3/r): measured shaft torque at 50, 150 and 250 bar and 1000, 1500 and 2500 r/min
(Figure 11) and volumetric efficiency at 1500 and 2500 r/min (Figure 13, 50 C), digitised in
data/frosina2017_kp30_bench.csv. A bench-shaped family is written in the catalogue schema, one size per Casappa
KAPPA type (6k's displacements V), so Gear and measured.gear_pump_point read it unchanged:
  torque(p, n) = measured torque(p, n) x V / 44 (loss torque proportional to displacement: every size has the
    bench's efficiency map), linear in speed between the bench speeds, drawn from 1000 to 2500 r/min, power =
    torque x 2 pi n / 60; gear_pump_point continues the power curves below 50 bar along the 50 to 150 bar line,
    as for the catalogues, so the zero-pressure drag comes from the same rule;
  flow lines at 20 and 250 bar = V n eta_v, with eta_v from Figure 13 (6p's base: normalised flow over n / 2500),
    linear in speed between 1500 and 2500 r/min and held outside, the 20 bar value continued along the 50 to 150 bar
    line.
Variant "fig12": the torque is the ideal V p / 2 pi plus Figure 12's measured-minus-model delta (larger friction,
6p's sensitivity). The Casappa catalogue scaled by c (6k's method) is rerun on a finer grid, including the
bench-over-catalogue ratio 1.195 (6p). Everything else is 6o's method (384 geometries, central PVG 32 neutral,
standby 2 L/min, working speed, S = record and 0.38, the 18 idle settings). Load-sensing is unchanged.
Predictions GQ1 to GQ7 are in LOG.md (6q), registered before the sweep ran.

Usage: python excavator_gear_pump_bench.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py (cache shared with 5z to 6o).
"""
import contextlib
import csv
import io
import itertools
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import part_stroke_eta  # noqa: E402
from measured_excavator_flow import load, CYL, Q_PUMP, COV  # noqa: E402
from measured_excavator_pump_size import Trace, KIN  # noqa: E402
from excavator_breakeven_geometry import case_curves, GRID, JOINTS, M_C, P_C  # noqa: E402
from excavator_part_stroke_eta import tables, B_C  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402
from excavator_idle_standby import CENTRAL, SETTINGS, S_C, SHARES, READINGS, fcurve, powers  # noqa: E402
from excavator_gear_pump import Gear, gear_powers, gear_rows, N_W  # noqa: E402
from digitise_casappa_kappa30 import SIZES, DISPLACEMENT  # noqa: E402
with contextlib.redirect_stdout(io.StringIO()):            # gear_pump_crux prints 6n's report at import
    from gear_pump_crux import Q_REF, crossing, interp, cross as CROSS_6N  # noqa: E402

T = 60
V_BENCH = 44.0
F6K = {"central_38": 1.884, "share_38": 9.9}   # 6k committed (Casappa)
F6J = {"central_38": 5.070, "share_38": 74.0}  # 6j committed (piston)
SHARE_6K = {1.00: 9.9, 1.05: 28.6, 1.10: 54.9, 1.15: 94.8}   # 6k's committed Casappa c sweep
C_SWEEP = (1.00, 1.05, 1.06, 1.07, 1.08, 1.09, 1.10, 1.12, 1.15, 1.195, 1.25)
C_BENCH = 1.195                                # 6p: bench over catalogue eta_t at 150 bar, 2100 r/min
SPEEDS = tuple(range(1000, 2501, 100))
DRAG_CAT_43 = 8.21                             # 6k: KP 30.43 zero-pressure drag, bar of 20 bar flow


def bench_data():
    with open(os.path.join(HERE, "data", "frosina2017_kp30_bench.csv")) as fh:
        rows = [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]
    tq = {(r[1], int(r[3]), float(r[4])): float(r[5]) for r in rows if r[0] == "fig11_torque_Nm"}
    d12 = {(int(r[3]), float(r[4])): float(r[5]) for r in rows if r[0] == "fig12_delta_torque_Nm"}
    qn = {(int(r[3]), float(r[4])): float(r[5]) for r in rows if r[0] == "fig13_normalised_flow"}
    return tq, d12, qn


def lin(xs, ys, x):
    """Piecewise linear in x through (xs, ys), held at the ends."""
    return float(np.interp(x, xs, ys))


def bench_rows(friction="fig11"):
    """Rows (size, kind, pressure, speed, value) of the bench-shaped family in the catalogue schema."""
    tq, d12, qn = bench_data()
    nb = (1000, 1500, 2500)

    def torque44(p, n):
        if friction == "fig11":
            return lin(nb, [tq[("measured", m, p)] for m in nb], n)
        return V_BENCH * p / (20.0 * math.pi) + lin(nb, [d12[(m, p)] for m in nb], n)

    def eta_v(p, n):
        def at(pp):
            return lin((1500, 2500), [qn[(m, pp)] / (m / 2500.0) for m in (1500, 2500)], n)
        if p in (50.0, 150.0, 250.0):
            return at(p)
        e50, e150 = at(50.0), at(150.0)
        return e50 + (e150 - e50) * (p - 50.0) / 100.0

    out = []
    for s in SIZES:
        V = DISPLACEMENT[s]
        for n in SPEEDS:
            for p in (20, 250):
                out.append((s, "flow", p, n, V * n / 1000.0 * eta_v(float(p), n)))
            for p in (50, 150, 250):
                t = torque44(float(p), n) * V / V_BENCH
                out.append((s, "power", p, n, t * 2.0 * math.pi * n / 60000.0))
    return out


def main(cache):
    rows_c, rows_b, rows_f = gear_rows(), bench_rows("fig11"), bench_rows("fig12")
    tabs = tables()
    lc = LossCurves(tabs)
    coef = lc.full[T]
    tab = tabs[T]
    out = []
    p = out.append
    p("Milestone 6q: excavator break-even with the bench-measured Casappa KP30 as the fixed pump")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; bench pump: Frosina, Senatore, Rigosi 2017, Energies 10:1113, Figs. 11-13, CC BY, "
      "read by pixel (6p); catalogue: Casappa KAPPA K 05 T A (2012) pp. 4 and 9-11, 50 C (6k))")
    p("")
    gb, gf, gc = Gear(rows_b), Gear(rows_f), Gear(rows_c)
    p(f"Bench-shaped family at {N_W:.0f} r/min (every size has the bench's map; sizes are 6k's KAPPA displacements):")
    p("  variant   eta_v(150)  eta_t(50)  eta_t(100)  eta_t(150)  eta_t(200)  eta_t(250)  P(0)/q20 drag bar")
    for name, g in (("fig11", gb), ("fig12", gf)):
        s = 43
        fl, pw = g.work[s]
        V = DISPLACEMENT[s]
        et = [g.eta(float(g.qn[SIZES.index(s)]), x) for x in (50.0, 100.0, 150.0, 200.0, 250.0)]
        drag = 600.0 * pw(0.0) / fl(20.0)
        p(f"  {name:8s}  {fl(150.0) / (V * N_W / 1000):10.4f}  " + "  ".join(f"{e:9.4f}" for e in et) +
          f"  {drag:17.2f}")
    fl43, pw43 = gc.work[43]
    p(f"  catalogue KP 30.43 (6k): eta_t(150) {gc.eta(float(gc.qn[3]), 150.0):.4f}; drag "
      f"{600.0 * pw43(0.0) / fl43(20.0):.2f} bar of 20 bar flow (6k: {DRAG_CAT_43})")
    drag_b = 600.0 * gb.work[43][1](0.0) / gb.work[43][0](20.0)
    idx2_b = interp(list(gb.qn), [gb.eta(float(q), 150.0) for q in gb.qn], Q_REF)
    idx2_c = interp(list(gc.qn), [gc.eta(float(q), 150.0) for q in gc.qn], Q_REF)
    p(f"  index 2 (eta_t(150) at Q20 {Q_REF:.0f} L/min): bench {idx2_b:.4f}, catalogue {idx2_c:.4f} "
      f"(6n: 0.7593); ratio {idx2_b / idx2_c:.4f}")
    p("")
    p("Idle power, kW (PVG32 neutral, working speed): q_p " + ", ".join(
        f"{q:.0f}: bench {gb.idle(q, READINGS['PVG32'](q)):.2f} / catalogue {gc.idle(q, READINGS['PVG32'](q)):.2f}"
        for q in (60.0, 80.0, 100.0, 150.0)))
    for name, g in (("bench", gb), ("catalogue", gc)):
        poc, pls = gear_powers(g, coef, *CENTRAL)
        d = poc - pls
        if d[0] < 0 < d[-1]:
            j = int(np.argmax(d > 0))
            p(f"  {name} idle power equals load-sensing standby ({pls:.2f} kW) at q_p "
              f"{GRID[j - 1] + 0.5 * (-d[j - 1]) / (d[j] - d[j - 1]):.1f} L/min")
        else:
            p(f"  {name} idle power never equals load-sensing standby ({pls:.2f} kW) on the grid")
    p("")

    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    po = P_C + M_C
    variants = {"bench": ("bench", "bench"), "bench moving, catalogue idle": ("bench", "casappa"),
                "catalogue moving, bench idle": ("casappa", "bench"), "bench, Figure 12 friction": ("fig12", "fig12"),
                "casappa (6k)": ("casappa", "casappa"), "piston (6j)": ("piston", "piston")}
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
                t_ls = sum(float((np.maximum(1.0, q / Q_PUMP) * dt).sum()) for q, _, dt in tr.files)
                t_still = sum(float((~mv).sum() * dt) for _, mv, dt in tr.files)
                eo = {"bench": np.array([gb.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]),
                      "fig12": np.array([gf.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]),
                      "casappa": np.array([gc.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]),
                      "piston": np.array([part_stroke_eta(tab, 1.0, P_C + v) for v in ms])}
                A, Bv = B_C * q_ls / 600.0 * po / e, B_C * q_ls / 600.0 * (P_C + ms)
                rows.append({"key": (fb, fa, fu, bs, s_sw), "tau": tau, "s0": t_still / t_ls, "eo": eo, "A": A,
                             "Bv": Bv, "sm": {k: A - Bv / v for k, v in eo.items()}, "pms": P_C + ms})
    cen = next(x for x in rows if x["key"] == (1.0, 1.0, 1.0, 1, 0.5))
    idle_cache = {}
    fam = {"bench": rows_b, "fig12": rows_f, "casappa": rows_c}

    def idle_for(kind, setting):
        key = (kind, setting)
        if key not in idle_cache:
            if kind == "piston":
                idle_cache[key] = powers(coef, *setting)
            else:
                base = {"bench": gb, "fig12": gf, "casappa": gc}[kind]
                g = base if setting[2] == 1.0 else Gear(fam[kind], setting[2])
                idle_cache[key] = gear_powers(g, coef, *setting)
        return idle_cache[key]

    def result(variant, setting, share, scale=1.0):
        ek, ik = variants[variant]
        poc, pls = idle_for(ik, setting)
        fmax, qarg, fc = [], [], None
        for x in rows:
            sm = x["sm"][ek] if scale == 1.0 else x["A"] - x["Bv"] / (scale * x["eo"][ek])
            f = fcurve({"sm": sm, "tau": x["tau"], "s0": x["s0"]}, poc, pls, x["s0"] if share is None else share)
            k = int(f.argmax())
            fmax.append(float(f[k]))
            qarg.append(float(GRID[k]))
            if x is cen:
                fc = (float(f[k]), float(GRID[k]))
        return np.array(fmax), np.array(qarg), fc

    def share(res):
        return float(np.mean(res[0] > 3.986) * 100)

    def summary(res):
        fm, qa, fc = res
        return (f"central {fc[0]:.3f} L/h at q_p {fc[1]:.1f}; median {np.median(fm):.2f} (p10 "
                f"{np.percentile(fm, 10):.2f}, p90 {np.percentile(fm, 90):.2f}); beats 3.986: "
                f"{share(res):.1f}%, 5.056: {np.mean(fm > 5.056) * 100:.1f}%; median maximising q_p "
                f"{np.median(qa):.1f}")

    for name, ref in (("casappa (6k)", F6K), ("piston (6j)", F6J)):
        chk = result(name, CENTRAL, S_C)
        p(f"check: the {name} variant at S = {S_C}: central {chk[2][0]:.3f} (committed {ref['central_38']}), "
          f"share {share(chk):.1f}% (committed {ref['share_38']}%)")
        assert abs(chk[2][0] - ref["central_38"]) < 0.005 and abs(share(chk) - ref["share_38"]) < 0.05
    k85 = int(round((85.0 - GRID[0]) / 0.5))
    p(f"central geometry, fixed-pump efficiency at q_p {GRID[k85]:.0f} L/min (p + m* = {cen['pms'][k85]:.1f} bar): "
      + ", ".join(f"{v} {cen['eo'][v][k85]:.3f}" for v in ("bench", "fig12", "casappa", "piston")))
    p("")
    res = {}
    for variant in ("bench", "bench moving, catalogue idle", "catalogue moving, bench idle",
                    "bench, Figure 12 friction"):
        p(f"{variant}, central setting (PVG32 neutral, standby 2 L/min, working speed):")
        for sh in (None,) + SHARES:
            res[(variant, sh)] = result(variant, CENTRAL, sh)
            p(f"  {'record only (S = s0)' if sh is None else f'S = {sh:.2f}'}: {summary(res[(variant, sh)])}")
        p("")
    p(f"bench, all settings at S = {S_C} (reading, standby flow L/min, idle speed ratio):")
    shares_all = []
    for setting in SETTINGS:
        rr = result("bench", setting, S_C)
        shares_all.append(share(rr))
        p(f"  {setting[0]:12s} q_sb {setting[1]:.0f} n_r {setting[2]:.1f}: {summary(rr)}")
    p(f"  share beating 3.986 L/h over the 18 settings: {min(shares_all):.1f}% to {max(shares_all):.1f}%")
    p("")
    p(f"catalogue (Casappa KAPPA) moving efficiency scaled by c, catalogue idle, S = {S_C}, central setting "
      f"(index 2 = c x {idx2_c:.4f}):")
    pts = []
    for cfac in C_SWEEP:
        rr = result("casappa (6k)", CENTRAL, S_C, cfac)
        sh = share(rr)
        pts.append((cfac, sh))
        note = f" (6k committed {SHARE_6K[cfac]}%)" if cfac in SHARE_6K else ""
        p(f"  c {cfac:.3f}: central {rr[2][0]:.3f} L/h; median {np.median(rr[0]):.2f}; beats 3.986: {sh:.1f}%{note}; "
          f"index 2 {cfac * idx2_c:.4f}")
        if cfac in SHARE_6K:
            assert abs(sh - SHARE_6K[cfac]) < 0.05
    c50 = crossing([a for a, _ in pts], [b for _, b in pts])
    coarse = crossing(list(SHARE_6K), list(SHARE_6K.values()))
    p(f"  50% crossing: c {c50:.4f}, index 2 {c50 * idx2_c:.4f} (on 6k's coarse grid: c {coarse:.4f}, index 2 "
      f"{coarse * idx2_c:.4f}; 6n's committed {CROSS_6N['casappa'][2]:.4f})")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    s_c1195 = dict(pts)[C_BENCH]
    s_b = share(res[("bench", S_C)])
    s_bmci = share(res[("bench moving, catalogue idle", S_C)])
    fc_b = res[("bench", S_C)][2][0]
    x2 = c50 * idx2_c
    p("Predictions (LOG.md 6q):")
    p(f"  GQ1 catalogue x {C_BENCH} share at S 0.38 >= 97%: {ok(s_c1195 >= 97.0)} ({s_c1195:.1f}%)")
    p(f"  GQ2 bench family share at S 0.38 >= 95%: {ok(s_b >= 95.0)} ({s_b:.1f}%)")
    p(f"  GQ3 bench zero-pressure drag below {DRAG_CAT_43} bar of 20 bar flow: {ok(drag_b < DRAG_CAT_43)} "
      f"({drag_b:.2f}; not blind)")
    p(f"  GQ4 bench central f_t,max at S 0.38 >= 6.0 L/h: {ok(fc_b >= 6.0)} ({fc_b:.3f})")
    p(f"  GQ5 bench moving with catalogue idle >= 90%: {ok(s_bmci >= 90.0)} ({s_bmci:.1f}%)")
    p(f"  GQ6 bench share >= 95% in all 18 settings: {ok(min(shares_all) >= 95.0)} (lowest {min(shares_all):.1f}%)")
    p(f"  GQ7 Casappa index-2 crossing within 0.005 of 0.8281: {ok(abs(x2 - 0.8281) <= 0.005)} ({x2:.4f}, "
      f"{x2 - 0.8281:+.4f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Frosina, Senatore, Rigosi 2017, doi:10.3390/en10081113 (CC BY 4.0), Figs. 11-13 as digitised in "
      "6p; Casappa KAPPA catalogue K 05 T A (2012), pp. 4 and 9-11; PVG 32 and Salami neutral curves; Moore 2020 "
      "(idle shares).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
