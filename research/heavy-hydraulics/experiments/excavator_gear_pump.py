"""Milestone 6k: the excavator break-even with a measured gear pump as the fixed pump.

6g to 6j priced the open-centre pump as Kauranne's axial piston pump locked at full stroke. Here it is a
Casappa KAPPA 30 external gear pump, from the catalogue's own flow, power and torque curves (50 C, 36 cSt oil;
data/casappa_kp30_curves.csv, digitise_casappa_kappa30.py, vector paths). At the working speed 2100 r/min each
size s has q_nom(s) = its 20 bar flow; a fixed pump of size q_p takes eta_t(p) = Q(p) p / (600 P(p)) and its
idle power P(pn(q_p n_r)) per unit of q_nom, both linear in q_nom between the two catalogue sizes around q_p and
held at the end sizes outside 27 to 73 cm3/r (disclosed). Moving: eta_OC = eta_t(p + m*); idle: the gear pump's
absorbed power at the neutral pressure (drag included, read off the curves, extrapolated below 50 bar along the
line through 50 and 100 bar). Load-sensing is unchanged (6i's anchored piston pump, 6j's standby).
Predictions GK1 to GK6 are in LOG.md (6k), registered before any curve was digitised.

Usage: python excavator_gear_pump.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py (cache shared with 5z to 6j).
"""
import csv
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import (gear_pump_point, idle_hours_per_work_hour, idle_pump_power,  # noqa: E402
                                       part_stroke_eta)
from measured_excavator_flow import load, CYL, Q_PUMP, COV  # noqa: E402
from measured_excavator_pump_size import Trace, KIN  # noqa: E402
from excavator_breakeven_geometry import case_curves, GRID, JOINTS, M_C, P_C  # noqa: E402
from excavator_part_stroke_eta import tables, B_C  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402
from excavator_idle_standby import READINGS, CENTRAL, SETTINGS, S_C, SHARES, fcurve  # noqa: E402
from digitise_casappa_kappa30 import SIZES, DISPLACEMENT  # noqa: E402

T = 60
N_W = 2100.0                                   # working speed, r/min (6f)
F6J = {"central_rec": 5.605, "central_38": 5.07, "share_38": 74.0, "median_38": 4.79}  # 6j committed


def gear_rows():
    with open(os.path.join(HERE, "data", "casappa_kp30_curves.csv")) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


class Gear:
    """A gear-pump family (default the KP 30) at one speed ratio, interpolated in 20-bar flow at working speed."""

    def __init__(self, rows, n_r=1.0, sizes=SIZES, skip_short=False):
        self.sizes = tuple(sizes)
        self.pts = {s: gear_pump_point(rows, s, N_W * n_r, skip_short) for s in self.sizes}
        self.work = {s: gear_pump_point(rows, s, N_W) for s in self.sizes}
        self.qn = np.array([self.work[s][0](20.0) for s in self.sizes])
        self.n_r = n_r

    def _blend(self, q, f):
        qn = self.qn
        if q <= qn[0]:
            return f(self.sizes[0])
        if q >= qn[-1]:
            return f(self.sizes[-1])
        j = int(np.searchsorted(qn, q))
        w = (q - qn[j - 1]) / (qn[j] - qn[j - 1])
        return (1 - w) * f(self.sizes[j - 1]) + w * f(self.sizes[j])

    def eta(self, q, p):
        def e(s):
            fl, pw = self.work[s]
            return fl(p) * p / (600.0 * pw(p))
        return self._blend(q, e)

    def idle(self, q, pn):
        """Absorbed power (kW) of a q L/min gear pump at speed ratio n_r against the neutral pressure pn."""
        return q * self._blend(q, lambda s: self.pts[s][1](pn) / self.qn[self.sizes.index(s)])


def gear_powers(gear, coef, reading, q_sb, n_r):
    pn = READINGS[reading]
    poc = np.array([gear.idle(float(q), pn(float(q) * n_r)) for q in GRID])
    pls = idle_pump_power(coef, 100.0, 0.0, Q_PUMP, M_C, q_sb, n_r)[1]
    return poc, pls


def main(cache):
    rows_g = gear_rows()
    tabs = tables()
    lc = LossCurves(tabs)
    coef = lc.full[T]
    tab = tabs[T]
    out = []
    p = out.append
    p("Milestone 6k: excavator break-even with a measured gear pump (Casappa KAPPA 30) as the fixed pump")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pump: Casappa KAPPA catalogue K 05 T A, pp. 9-11, 50 C, read from vector paths)")
    p("")
    p(f"Gear pump at {N_W:.0f} r/min, from the catalogue curves:")
    p("  size  V cm3/r  Q20 L/min  eta_v(150)  eta_t(100)  eta_t(150)  eta_t(200)  eta_hm(150)  P(0) kW  "
      "drag bar  drag(LSQ) bar")
    drag = {}
    for s in SIZES:
        fl, pw = gear_pump_point(rows_g, s, N_W)
        V = DISPLACEMENT[s]
        tq = sorted((int(float(r[2])), float(r[4])) for r in rows_g
                    if int(r[0]) == s and r[1] == "torque" and int(float(r[3])) == int(N_W))
        m150 = np.interp(150.0, [a for a, _ in tq], [b for _, b in tq])
        press = sorted({int(float(r[2])) for r in rows_g if int(r[0]) == s and r[1] == "power"})
        pp = np.array(press, float)
        ww = np.array([pw(x) for x in pp])
        lsq0 = float(np.polyfit(pp, ww, 1)[1])
        q20 = fl(20.0)
        drag[s] = (600.0 * pw(0.0) / q20, 600.0 * lsq0 / q20)
        et = [fl(x) * x / (600.0 * pw(x)) for x in (100.0, 150.0, 200.0)]
        p(f"  {s:4d}  {V:6.2f}  {q20:9.2f}  {fl(150.0) / (V * N_W / 1000):10.3f}  {et[0]:10.3f}  {et[1]:10.3f}  "
          f"{et[2]:10.3f}  {150.0 * V / (20 * np.pi) / m150:11.3f}  {pw(0.0):7.2f}  {drag[s][0]:8.2f}  "
          f"{drag[s][1]:13.2f}")
    # consistency of the two drawn quantities: P against M n / 9549 at 2000 r/min
    cons = []
    for s in SIZES:
        for r in rows_g:
            if int(r[0]) == s and r[1] == "power" and int(float(r[3])) == 2000:
                m = next(float(x[4]) for x in rows_g if int(x[0]) == s and x[1] == "torque"
                         and x[2] == r[2] and int(float(x[3])) == 2000)
                cons.append((s, int(float(r[2])), float(r[4]) / (m * 2000 / 9549.3)))
    c = np.array([x[2] for x in cons])
    k43 = next(x[2] for x in cons if x[0] == 43 and x[1] == 150)
    p(f"  power curve over torque curve x n / 9549 at 2000 r/min, all {len(c)} curves: median {np.median(c):.3f}, "
      f"range {c.min():.3f} to {c.max():.3f}; KP 30.43 at 150 bar {k43:.3f}")
    p(f"  piston pump (6g table, 60 C, full stroke): eta {part_stroke_eta(tab, 1.0, 150.0):.3f} at 150 bar; "
      f"zero-stroke drag k0 {coef[0]:.2f} bar of full-stroke flow (6h)")
    gear = Gear(rows_g)
    p(f"  q_nom range of the family: {gear.qn[0]:.1f} to {gear.qn[-1]:.1f} L/min (sizes outside held at the ends)")
    p("")
    p("Idle power, kW (PVG32 neutral, working speed): q_p " + ", ".join(
        f"{q:.0f}: gear {gear.idle(q, READINGS['PVG32'](q)):.2f} / piston "
        f"{idle_pump_power(coef, q, READINGS['PVG32'](q), Q_PUMP, M_C, 2.0, 1.0)[0]:.2f}"
        for q in (60.0, 80.0, 100.0, 150.0)) +
        f"; load-sensing standby {idle_pump_power(coef, 100.0, 0.0, Q_PUMP, M_C, 2.0, 1.0)[1]:.2f}")
    poc_c, pls_c = gear_powers(gear, coef, *CENTRAL)
    d = poc_c - pls_c
    cross = None
    if d[0] < 0 < d[-1]:
        j = int(np.argmax(d > 0))
        cross = GRID[j - 1] + 0.5 * (-d[j - 1]) / (d[j] - d[j - 1])
    p(f"  gear idle power equals load-sensing standby at q_p {cross:.1f} L/min (piston fixed pump, 6j: 83.4)"
      if cross is not None else "  gear idle power never equals load-sensing standby on the grid")
    p("")

    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    po = P_C + M_C
    variants = {"gear": None, "piston (6j)": None, "gear at catalogue 0.88": None}
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
                eo = {"gear": np.array([gear.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]),
                      "piston (6j)": np.array([part_stroke_eta(tab, 1.0, P_C + v) for v in ms]),
                      "gear at catalogue 0.88": np.full_like(ms, 0.88)}
                A, Bv = B_C * q_ls / 600.0 * po / e, B_C * q_ls / 600.0 * (P_C + ms)
                row = {"key": (fb, fa, fu, bs, s_sw), "tau": tau, "s0": t_still / t_ls, "eo": eo, "A": A, "Bv": Bv,
                       "sm": {k: A - Bv / v for k, v in eo.items()}, "pms": P_C + ms}
                rows.append(row)
    cen = next(x for x in rows if x["key"] == (1.0, 1.0, 1.0, 1, 0.5))

    def idle_for(variant, setting):
        if variant == "piston (6j)":
            from excavator_idle_standby import powers
            return powers(coef, *setting)
        g = gear if setting[2] == 1.0 else Gear(rows_g, setting[2])
        return gear_powers(g, coef, *setting)

    cache_idle = {}

    def result(variant, setting, share):
        key = (variant, setting)
        if key not in cache_idle:
            cache_idle[key] = idle_for("piston (6j)" if variant == "piston (6j)" else "gear", setting)
        poc, pls = cache_idle[key]
        fmax, qarg, fc = [], [], None
        for x in rows:
            xx = {"sm": x["sm"][variant], "tau": x["tau"], "s0": x["s0"]}
            f = fcurve(xx, poc, pls, x["s0"] if share is None else share)
            k = int(f.argmax())
            fmax.append(float(f[k]))
            qarg.append(float(GRID[k]))
            if x is cen:
                fc = (float(f[k]), float(GRID[k]), f)
        return np.array(fmax), np.array(qarg), fc

    def summary(res):
        fm, qa, fc = res
        return (f"central {fc[0]:.3f} L/h at q_p {fc[1]:.1f}; median {np.median(fm):.2f} (p10 "
                f"{np.percentile(fm, 10):.2f}, p90 {np.percentile(fm, 90):.2f}); beats 3.986: "
                f"{np.mean(fm > 3.986) * 100:.1f}%, 5.056: {np.mean(fm > 5.056) * 100:.1f}%; median maximising q_p "
                f"{np.median(qa):.1f}")

    pis = result("piston (6j)", CENTRAL, S_C)
    p(f"check: the piston variant reproduces 6j at S = {S_C}: central {pis[2][0]:.3f} (6j {F6J['central_38']}), "
      f"share {np.mean(pis[0] > 3.986) * 100:.1f}% (6j {F6J['share_38']}%)")
    assert abs(pis[2][0] - F6J["central_38"]) < 0.005 and abs(np.mean(pis[0] > 3.986) * 100 - F6J["share_38"]) < 0.05
    ec = cen["eo"]["gear"]
    k101 = int(round((101.0 - GRID[0]) / 0.5))
    p(f"central geometry, fixed-pump efficiency at q_p 101 L/min (p + m* = {cen['pms'][k101]:.1f} bar): gear "
      f"{ec[k101]:.3f}, piston {cen['eo']['piston (6j)'][k101]:.3f}")
    p("")
    res = {}
    for variant in variants:
        p(f"{variant}, central setting (PVG32 neutral, standby 2 L/min, working speed):")
        for share in (None,) + SHARES:
            res[(variant, share)] = result(variant, CENTRAL, share)
            p(f"  {'record only (S = s0)' if share is None else f'S = {share:.2f}'}: {summary(res[(variant, share)])}")
        p("")
    p(f"Gear pump, all settings at S = {S_C} (reading, standby flow L/min, idle speed ratio):")
    shares_all = []
    for setting in SETTINGS:
        rr = result("gear", setting, S_C)
        shares_all.append(np.mean(rr[0] > 3.986) * 100)
        p(f"  {setting[0]:12s} q_sb {setting[1]:.0f} n_r {setting[2]:.1f}: {summary(rr)}")
    p(f"  share beating 3.986 L/h over the 18 settings: {min(shares_all):.1f}% to {max(shares_all):.1f}%")
    p("")
    # how much better the gear pump would have to be to give 6j's piston result back
    p("Gear pump efficiency (moving part) scaled by c, idle as read, S = 0.38, central setting:")
    poc, pls = cache_idle[("gear", CENTRAL)]
    for cfac in (1.0, 1.05, 1.10, 1.15):
        fm, fcen = [], None
        for x in rows:
            xx = {"sm": x["A"] - x["Bv"] / (cfac * x["eo"]["gear"]), "tau": x["tau"], "s0": x["s0"]}
            f = fcurve(xx, poc, pls, S_C)
            fm.append(float(f.max()))
            if x is cen:
                fcen = float(f.max())
        fm = np.array(fm)
        p(f"  c {cfac:.2f}: central {fcen:.3f} L/h; median {np.median(fm):.2f}; beats 3.986: {np.mean(fm > 3.986) * 100:.1f}%")
    gap = np.array([np.median(x["eo"]["piston (6j)"] - x["eo"]["gear"]) for x in rows])
    p(f"  median piston-minus-gear full-stroke efficiency over pump sizes and geometries: {np.median(gap):.3f} "
      f"(range {gap.min():.3f} to {gap.max():.3f})")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    e43 = gear_pump_point(rows_g, 43, N_W)
    e51 = gear_pump_point(rows_g, 51, N_W)
    v43 = e43[0](150.0) * 150.0 / (600.0 * e43[1](150.0))
    v51 = e51[0](150.0) * 150.0 / (600.0 * e51[1](150.0))
    d43 = drag[43][0]
    p("Predictions (LOG.md 6k):")
    p(f"  GK1 KP 30.43 and 30.51 eta_t at 150 bar, 2100 r/min in 0.80-0.90: {ok(0.8 <= min(v43, v51) and max(v43, v51) <= 0.9)}"
      f" ({v43:.3f}, {v51:.3f})")
    p(f"  GK2 KP 30.43 power within 5% of M n / 9549 at 150 bar, 2000 r/min: {ok(abs(k43 - 1) <= 0.05)} ({k43:.3f})")
    p(f"  GK3 within 0.04 of the piston pump's 0.84: {ok(max(abs(v43 - 0.84), abs(v51 - 0.84)) <= 0.04)} "
      f"({v43 - 0.84:+.3f}, {v51 - 0.84:+.3f})")
    dr = [drag[s][0] for s in SIZES]
    p(f"  GK4 gear zero-pressure drag below 7.86 bar of full-stroke flow: {ok(max(dr) < 7.86)} (KP 30.43 {d43:.2f}; "
      f"sizes {min(dr):.2f} to {max(dr):.2f})")
    g38 = res[("gear", S_C)]
    sh = np.mean(g38[0] > 3.986) * 100
    p(f"  GK5 share above 3.986 L/h at S 0.38 > 50%: {ok(sh > 50)} ({sh:.1f}%)")
    p(f"  GK6 central f_t,max at S 0.38 within 1 L/h of 5.07: {ok(abs(g38[2][0] - 5.07) <= 1.0)} ({g38[2][0]:.3f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Casappa KAPPA catalogue K 05 T A (2012), pp. 4 and 9-11; PVG 32 and Salami neutral curves; "
      "Moore 2020 (idle shares).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
