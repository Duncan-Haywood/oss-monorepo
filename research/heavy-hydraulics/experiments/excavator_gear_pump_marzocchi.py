"""Milestone 6o: the excavator break-even with a third gear-pump maker (Marzocchi ALP3) as the fixed pump: an
out-of-sample test of 6n's crux (the ranking flips at a fixed gear pump of about 0.83 overall efficiency at 150 bar,
2100 r/min and about 85 L/min of 20 bar flow; fitted on Casappa and Danfoss).

The fixed pump is the ALP3 family from Marzocchi's own published flow and absorbed-power curves (50 C, 30 cSt;
data/marzocchi_alp3_curves.csv, digitise_marzocchi_alp3.py, vector paths). Everything else is 6m's method: at
2100 r/min each size has q_nom = its flow line evaluated at 20 bar (linear in p between the 25 bar and maximum-
pressure lines, so 5 bar of extrapolation); a fixed pump of size q_p takes eta_t(p) = Q(p) p / (600 P(p)) and idle
power P(pn) per unit q_nom, linear in q_nom between the sizes around q_p and held at the end sizes outside the family.
Marzocchi draws power at 25 and 50 bar, so the zero-pressure drag is the line through those two continued 25 bar to
zero (Casappa's ran through 50 and 100, Danfoss's through 100 and 150: the shortest continuation of the three).
ALP3-135 is rated to 2000 r/min but its power curves are drawn to 2500 and its flow lines to 2000 (extended linearly
to 2100, disclosed); its 20 bar flow (180 L/min) is outside the range 6n's index uses. Load-sensing is unchanged
(6i's anchored piston pump, 6j's standby). 6n's two efficiency indices are computed for the ALP3 exactly as for the
other makers (index 1: median eta_t(150) over sizes with 20 bar flow in 6n's shared 55.81 to 157.35 L/min; index 2:
eta_t(150) interpolated in 20 bar flow at 85 L/min), and the c sweep is placed on them.
Predictions GM1 to GM6 are in LOG.md (6o), registered before any curve was digitised.

Usage: python excavator_gear_pump_marzocchi.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py (cache shared with 5z to 6m).
"""
import csv
import itertools
import os
import statistics
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import gear_pump_point, part_stroke_eta  # noqa: E402
from measured_excavator_flow import load, CYL, Q_PUMP, COV  # noqa: E402
from measured_excavator_pump_size import Trace, KIN  # noqa: E402
from excavator_breakeven_geometry import case_curves, GRID, JOINTS, M_C, P_C  # noqa: E402
from excavator_part_stroke_eta import tables, B_C  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402
from excavator_idle_standby import CENTRAL, SETTINGS, S_C, SHARES, READINGS, fcurve, powers  # noqa: E402
from excavator_gear_pump import Gear, gear_powers, gear_rows, N_W  # noqa: E402
import digitise_marzocchi_alp3 as mz  # noqa: E402
import contextlib  # noqa: E402
import io  # noqa: E402
with contextlib.redirect_stdout(io.StringIO()):            # gear_pump_crux prints 6n's report at import
    from gear_pump_crux import Q_SHARED, Q_REF, crossing, interp, cross as CROSS_6N  # noqa: E402

T = 60
F6K = {"central_38": 1.884, "share_38": 9.9}   # 6k committed (Casappa)
F6J = {"central_38": 5.070, "share_38": 74.0}  # 6j committed (piston)
CRUX = 0.83                                    # 6n's rule, stated in LOG.md 6n before this milestone
C_SWEEP = (0.86, 0.88, 0.90, 0.91, 0.92, 0.93, 0.94, 0.95, 0.96, 0.98, 1.00)


def marzocchi_rows():
    with open(os.path.join(HERE, "data", "marzocchi_alp3_curves.csv")) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def main(cache):
    rows_c, rows_m = gear_rows(), marzocchi_rows()
    tabs = tables()
    lc = LossCurves(tabs)
    coef = lc.full[T]
    tab = tabs[T]
    out = []
    p = out.append
    p("Milestone 6o: excavator break-even with a third gear-pump maker (Marzocchi ALP3) as the fixed pump")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps: Marzocchi 'Serie ALP' catalogue, printed pp. 38 and 43-46, 50 C, 30 cSt; "
      "Casappa KAPPA K 05 T A (2012) pp. 4 and 9-11, 50 C; both read from vector paths)")
    p("")
    p(f"Marzocchi ALP3 at {N_W:.0f} r/min, from the catalogue curves:")
    p("  size  V cm3/r  Q20 L/min  Q25/(Vn) at 2000  eta_v(150)  eta_t(100)  eta_t(150)  eta_t(hi)  hi bar  P(0) kW  "
      "drag bar  P/(Mn/9549) at 2000")
    et150, qv, q20s, drag, pm = {}, {}, {}, {}, []
    for s in mz.SIZES:
        fl, pw = gear_pump_point(rows_m, s, N_W)
        V = mz.DISPLACEMENT[s]
        q25 = next(float(r[4]) for r in rows_m if int(r[0]) == s and r[1] == "flow" and int(r[2]) == 25
                   and int(float(r[3])) == 2000)
        qv[s] = q25 / (V * 2.0)
        press = sorted({int(float(r[2])) for r in rows_m if int(r[0]) == s and r[1] == "power"})
        ratios = []
        for pr in press:
            P2 = [float(r[4]) for r in rows_m if int(r[0]) == s and r[1] == "power" and int(r[2]) == pr
                  and int(float(r[3])) == 2000]
            M2 = [float(r[4]) for r in rows_m if int(r[0]) == s and r[1] == "torque" and int(r[2]) == pr
                  and int(float(r[3])) == 2000]
            if P2 and M2:
                ratios.append(P2[0] / (M2[0] * 2000.0 / 9549.0))
        pm.extend(ratios)
        q20s[s] = fl(20.0)
        drag[s] = 600.0 * pw(0.0) / q20s[s]
        hi = press[-1]
        et = [fl(x) * x / (600.0 * pw(x)) for x in (100.0, 150.0, float(hi))]
        et150[s] = et[1]
        p(f"  {s:4d}  {V:6.1f}  {q20s[s]:9.2f}  {qv[s]:16.3f}  {fl(150.0) / (V * N_W / 1000):10.3f}  {et[0]:10.3f}  "
          f"{et[1]:10.3f}  {et[2]:9.3f}  {hi:6d}  {pw(0.0):7.2f}  {drag[s]:8.2f}  "
          f"{min(ratios):.3f} to {max(ratios):.3f}")
    p("  (eta_v(150) is over the page 38 displacement; Q25/(Vn) checks the drawing against that table)")
    p(f"  overall efficiency at 150 bar over the eleven sizes: {min(et150.values()):.3f} to {max(et150.values()):.3f}, "
      f"median {statistics.median(et150.values()):.3f}")
    p(f"  power over M n / 9549 at 2000 r/min, all curves: median {statistics.median(pm):.4f} ({min(pm):.4f} to "
      f"{max(pm):.4f}); the torque curves are the power curves redrawn, not an independent reading")
    shared = [s for s in mz.SIZES if Q_SHARED[0] <= q20s[s] <= Q_SHARED[1]]
    idx1 = statistics.median(et150[s] for s in shared)
    idx2 = interp([q20s[s] for s in mz.SIZES], [et150[s] for s in mz.SIZES], Q_REF)
    p(f"  6n index 1 (median eta_t(150) over sizes with Q20 in {Q_SHARED[0]} to {Q_SHARED[1]} L/min: "
      f"{', '.join(str(s) for s in shared)}): {idx1:.4f}; index 2 (at Q20 {Q_REF:.0f} L/min): {idx2:.4f}")
    p(f"  (6n: Casappa {0.7605:.4f} / {0.7593:.4f}, Danfoss {0.8320:.4f} / {0.8485:.4f})")
    gm, gc = Gear(rows_m, sizes=mz.SIZES), Gear(rows_c)
    lo, hi_q = max(gm.qn[0], gc.qn[0]), min(gm.qn[-1], gc.qn[-1])
    qq = np.arange(np.ceil(lo), np.floor(hi_q) + 0.01, 1.0)
    diff = np.array([gm.eta(float(q), 150.0) - gc.eta(float(q), 150.0) for q in qq])
    p(f"  Marzocchi minus Casappa eta_t at 150 bar over the shared {lo:.1f} to {hi_q:.1f} L/min: median "
      f"{np.median(diff):+.3f} (range {diff.min():+.3f} to {diff.max():+.3f})")
    p(f"  piston pump (6g table, 60 C, full stroke): eta {part_stroke_eta(tab, 1.0, 150.0):.3f} at 150 bar")
    p("")
    p("Idle power, kW (PVG32 neutral, working speed): q_p " + ", ".join(
        f"{q:.0f}: Marzocchi {gm.idle(q, READINGS['PVG32'](q)):.2f} / Casappa {gc.idle(q, READINGS['PVG32'](q)):.2f}"
        for q in (60.0, 80.0, 100.0, 150.0)))
    poc_c, pls_c = gear_powers(gm, coef, *CENTRAL)
    d = poc_c - pls_c
    cross = None
    if d[0] < 0 < d[-1]:
        j = int(np.argmax(d > 0))
        cross = GRID[j - 1] + 0.5 * (-d[j - 1]) / (d[j] - d[j - 1])
    p(f"  Marzocchi idle power equals load-sensing standby ({pls_c:.2f} kW) at q_p {cross:.1f} L/min "
      f"(Casappa 6k: 75.6; piston 6j: 83.4)" if cross is not None else
      "  Marzocchi idle power never equals load-sensing standby on the grid")
    p("")

    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    po = P_C + M_C
    variants = {"marzocchi": ("marzocchi", "marzocchi"), "marzocchi moving, casappa idle": ("marzocchi", "casappa"),
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
                eo = {"marzocchi": np.array([gm.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]),
                      "casappa": np.array([gc.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]),
                      "piston": np.array([part_stroke_eta(tab, 1.0, P_C + v) for v in ms])}
                A, Bv = B_C * q_ls / 600.0 * po / e, B_C * q_ls / 600.0 * (P_C + ms)
                rows.append({"key": (fb, fa, fu, bs, s_sw), "tau": tau, "s0": t_still / t_ls, "eo": eo, "A": A,
                             "Bv": Bv, "sm": {k: A - Bv / v for k, v in eo.items()}, "pms": P_C + ms})
    cen = next(x for x in rows if x["key"] == (1.0, 1.0, 1.0, 1, 0.5))
    idle_cache = {}

    def idle_for(kind, setting):
        key = (kind, setting)
        if key not in idle_cache:
            if kind == "piston":
                idle_cache[key] = powers(coef, *setting)
            elif kind == "casappa":
                idle_cache[key] = gear_powers(gc if setting[2] == 1.0 else Gear(rows_c, setting[2]), coef, *setting)
            else:
                g = gm if setting[2] == 1.0 else Gear(rows_m, setting[2], sizes=mz.SIZES)
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

    def summary(res):
        fm, qa, fc = res
        return (f"central {fc[0]:.3f} L/h at q_p {fc[1]:.1f}; median {np.median(fm):.2f} (p10 "
                f"{np.percentile(fm, 10):.2f}, p90 {np.percentile(fm, 90):.2f}); beats 3.986: "
                f"{np.mean(fm > 3.986) * 100:.1f}%, 5.056: {np.mean(fm > 5.056) * 100:.1f}%; median maximising q_p "
                f"{np.median(qa):.1f}")

    for name, ref in (("casappa (6k)", F6K), ("piston (6j)", F6J)):
        chk = result(name, CENTRAL, S_C)
        sh = np.mean(chk[0] > 3.986) * 100
        p(f"check: the {name} variant at S = {S_C}: central {chk[2][0]:.3f} (committed {ref['central_38']}), "
          f"share {sh:.1f}% (committed {ref['share_38']}%)")
        assert abs(chk[2][0] - ref["central_38"]) < 0.005 and abs(sh - ref["share_38"]) < 0.05
    k85 = int(round((85.0 - GRID[0]) / 0.5))
    p(f"central geometry, fixed-pump efficiency at q_p {GRID[k85]:.0f} L/min (p + m* = {cen['pms'][k85]:.1f} bar): "
      + ", ".join(f"{v} {cen['eo'][v][k85]:.3f}" for v in ("marzocchi", "casappa", "piston")))
    gp = np.array([np.median(x["eo"]["marzocchi"] - x["eo"]["piston"]) for x in rows])
    p(f"median Marzocchi minus piston full-stroke efficiency over pump sizes, per geometry: median {np.median(gp):+.3f} "
      f"(range {gp.min():+.3f} to {gp.max():+.3f})")
    p("")
    res = {}
    for variant in ("marzocchi", "marzocchi moving, casappa idle"):
        p(f"{variant}, central setting (PVG32 neutral, standby 2 L/min, working speed):")
        for share in (None,) + SHARES:
            res[(variant, share)] = result(variant, CENTRAL, share)
            p(f"  {'record only (S = s0)' if share is None else f'S = {share:.2f}'}: {summary(res[(variant, share)])}")
        p("")
    p(f"Marzocchi, all settings at S = {S_C} (reading, standby flow L/min, idle speed ratio):")
    shares_all = []
    for setting in SETTINGS:
        rr = result("marzocchi", setting, S_C)
        shares_all.append(np.mean(rr[0] > 3.986) * 100)
        p(f"  {setting[0]:12s} q_sb {setting[1]:.0f} n_r {setting[2]:.1f}: {summary(rr)}")
    p(f"  share beating 3.986 L/h over the 18 settings: {min(shares_all):.1f}% to {max(shares_all):.1f}%")
    p("")
    sweeps = {}
    for v in ("marzocchi", "marzocchi moving, casappa idle"):
        p(f"{v}: moving efficiency scaled by c, idle as read, S = 0.38, central setting (index 1 = c x {idx1:.4f}, "
          f"index 2 = c x {idx2:.4f}):")
        pts = []
        for cfac in C_SWEEP:
            fm, _, fc = result(v, CENTRAL, S_C, cfac)
            sh = float(np.mean(fm > 3.986) * 100)
            pts.append((cfac, sh))
            p(f"  c {cfac:.2f}: central {fc[0]:.3f} L/h; median {np.median(fm):.2f}; beats 3.986: {sh:.1f}%; "
              f"index 1 {cfac * idx1:.4f}, index 2 {cfac * idx2:.4f}")
        c50 = crossing([a for a, _ in pts], [b for _, b in pts])
        sweeps[v] = c50
        p(f"  50% crossing: c {c50:.4f}; index 1 {c50 * idx1:.4f}; index 2 {c50 * idx2:.4f}")
        p("")
    c50 = sweeps["marzocchi"]
    x1, x2 = c50 * idx1, c50 * idx2
    ca, da = CROSS_6N["casappa"], CROSS_6N["danfoss"]
    p("Three makers on 6n's axes (50% crossings; Casappa and Danfoss from gear_pump_crux.py):")
    p(f"  index 1: casappa {ca[1]:.4f}, danfoss {da[1]:.4f}, marzocchi {x1:.4f}; spread "
      f"{max(ca[1], da[1], x1) - min(ca[1], da[1], x1):.4f}")
    p(f"  index 2: casappa {ca[2]:.4f}, danfoss {da[2]:.4f}, marzocchi {x2:.4f}; spread "
      f"{max(ca[2], da[2], x2) - min(ca[2], da[2], x2):.4f}")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    m38 = res[("marzocchi", S_C)]
    sh = float(np.mean(m38[0] > 3.986) * 100)
    side = sh >= 50.0 if idx2 >= CRUX else sh < 50.0
    ref2 = (ca[2] + da[2]) / 2
    p("Predictions (LOG.md 6o):")
    p(f"  GM1 share at S 0.38 on the side 6n's rule gives from index 2 ({idx2:.4f} {'>=' if idx2 >= CRUX else '<'} "
      f"{CRUX}, so {'>= 50%' if idx2 >= CRUX else '< 50%'}): {ok(side)} ({sh:.1f}%)")
    p(f"  GM2 index-2 crossing within 0.02 of {ref2:.4f}: {ok(abs(x2 - ref2) <= 0.02)} ({x2:.4f}, "
      f"{x2 - ref2:+.4f})")
    p(f"  GM3 index 2 between Casappa 0.7593 and Danfoss 0.8485: {ok(0.7593 < idx2 < 0.8485)} ({idx2:.4f})")
    p(f"  GM4 Q25/(Vn) at 2000 r/min within 0.97-1.03 for every size: "
      f"{ok(all(0.97 <= v <= 1.03 for v in qv.values()))} ({min(qv.values()):.3f} to {max(qv.values()):.3f})")
    p(f"  GM5 median P/(Mn/9549) at 2000 r/min in 0.97-1.03: {ok(0.97 <= statistics.median(pm) <= 1.03)} "
      f"({statistics.median(pm):.4f}; redrawn, so no independent check)")
    p(f"  GM6 ALP3-60 eta_t(150 bar, 2100 r/min) in 0.78-0.86: {ok(0.78 <= et150[60] <= 0.86)} ({et150[60]:.3f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Marzocchi Pompe 'Serie ALP' catalogue, printed pp. 38 and 43-46; Casappa KAPPA catalogue "
      "K 05 T A (2012), pp. 4 and 9-11; PVG 32 and Salami neutral curves; Moore 2020 (idle shares).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
