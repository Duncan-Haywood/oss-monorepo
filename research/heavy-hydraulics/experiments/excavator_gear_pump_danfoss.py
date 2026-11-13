"""Milestone 6m: the excavator break-even with a second manufacturer's gear pump (Danfoss GearMe Group 3, SNP3)
as the fixed pump, beside 6k's Casappa KAPPA 30 and 6j's piston pump.

6k priced the open-centre pump as a Casappa KAPPA 30 external gear pump (catalogue curves, 0.71 to 0.80 overall
efficiency at 150 bar and 2100 r/min) and found the fixed pump loses in about nine excavator geometries of ten, with
the ranking flipping near 1.09 times those curves. Here the fixed pump is the Danfoss SNP3 family, from its own
published flow and input-power curves (ISO VG46 at 50 C, 28 mm2/s; data/danfoss_snp3_curves.csv,
digitise_danfoss_snp3.py, vector paths). Everything else is 6k's method: at 2100 r/min each size has q_nom = its
20 bar flow (flow linear in p between the 7 bar and high-pressure lines); a fixed pump of size q_p takes
eta_t(p) = Q(p) p / (600 P(p)) and idle power P(pn) per unit q_nom, linear in q_nom between the sizes around q_p and
held at the end sizes outside the family (disclosed). Danfoss draws power at 100, 150 and a high pressure, so the
zero-pressure drag is the line through 100 and 150 bar continued to 0 (Casappa's ran through 50 and 100: a longer
extrapolation here, disclosed); SNP3 090's power is drawn at 100 and 140 bar only, so its 150 bar point is that
line continued 10 bar. Load-sensing is unchanged (6i's anchored piston pump, 6j's standby).
Predictions GD1 to GD6 are in LOG.md (6m), registered before any curve was digitised.

Usage: python excavator_gear_pump_danfoss.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py (cache shared with 5z to 6k).
"""
import csv
import itertools
import os
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
from excavator_idle_standby import CENTRAL, SETTINGS, S_C, SHARES, fcurve, powers  # noqa: E402
from excavator_gear_pump import Gear, gear_powers, gear_rows, N_W  # noqa: E402
import digitise_casappa_kappa30 as cas  # noqa: E402
import digitise_danfoss_snp3 as dan  # noqa: E402

T = 60
F6K = {"central_38": 1.884, "share_38": 9.9, "drag_43": 8.21}   # 6k committed (Casappa)


def danfoss_rows():
    with open(os.path.join(HERE, "data", "danfoss_snp3_curves.csv")) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def main(cache):
    rows_c, rows_d = gear_rows(), danfoss_rows()
    tabs = tables()
    lc = LossCurves(tabs)
    coef = lc.full[T]
    tab = tabs[T]
    out = []
    p = out.append
    p("Milestone 6m: excavator break-even with a second gear-pump maker (Danfoss GearMe Group 3, SNP3) as the fixed pump")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps: Danfoss BC319661777599en-000202 (2023) pp. 6 and 19-21, ISO VG46 at 50 C; "
      "Casappa KAPPA K 05 T A (2012) pp. 4 and 9-11, 50 C; both read from vector paths)")
    p("")
    p(f"Danfoss SNP3 at {N_W:.0f} r/min, from the technical-information curves:")
    p("  size  V cm3/r  Q20 L/min  Q7/(Vn) at 2000  eta_v(150)  eta_t(100)  eta_t(150)  eta_t(hi)  hi bar  P(0) kW  "
      "drag bar  drag(LSQ) bar")
    drag, et150, qv = {}, {}, {}
    for s in dan.SIZES:
        fl, pw = gear_pump_point(rows_d, s, N_W)
        V = dan.DISPLACEMENT[s]
        q7 = next(float(r[4]) for r in rows_d if int(r[0]) == s and r[1] == "flow" and int(r[2]) == 7
                  and int(float(r[3])) == 2000)
        qv[s] = q7 / (V * 2.0)
        press = sorted({int(float(r[2])) for r in rows_d if int(r[0]) == s and r[1] == "power"})
        pp = np.array(press, float)
        ww = np.array([pw(x) for x in pp])
        lsq0 = float(np.polyfit(pp, ww, 1)[1])
        q20 = fl(20.0)
        drag[s] = (600.0 * pw(0.0) / q20, 600.0 * lsq0 / q20)
        hi = press[-1]
        et = [fl(x) * x / (600.0 * pw(x)) for x in (100.0, 150.0, float(hi))]
        et150[s] = et[1]
        p(f"  {s:4d}  {V:6.1f}  {q20:9.2f}  {qv[s]:15.3f}  {fl(150.0) / (V * N_W / 1000):10.3f}  {et[0]:10.3f}  "
          f"{et[1]:10.3f}  {et[2]:9.3f}  {hi:6d}  {pw(0.0):7.2f}  {drag[s][0]:8.2f}  {drag[s][1]:13.2f}")
    p("  (eta_v(150) is over the page 6 displacement; Q7/(Vn) checks the drawing against that table)")
    p(f"  overall efficiency at 150 bar over the ten sizes: {min(et150.values()):.3f} to {max(et150.values()):.3f}, "
      f"median {np.median(list(et150.values())):.3f}")
    gd = Gear(rows_d, sizes=dan.SIZES)
    gc = Gear(rows_c)
    lo, hi_q = max(gd.qn[0], gc.qn[0]), min(gd.qn[-1], gc.qn[-1])
    qq = np.arange(np.ceil(lo), np.floor(hi_q) + 0.01, 1.0)
    diff = {pr: np.array([gd.eta(float(q), pr) - gc.eta(float(q), pr) for q in qq]) for pr in (100.0, 150.0, 200.0)}
    p(f"  q_nom range: Danfoss {gd.qn[0]:.1f} to {gd.qn[-1]:.1f} L/min, Casappa {gc.qn[0]:.1f} to {gc.qn[-1]:.1f}; "
      f"over the shared {lo:.1f} to {hi_q:.1f}, Danfoss minus Casappa eta_t: " + "; ".join(
          f"{pr:.0f} bar median {np.median(d):+.3f} (range {d.min():+.3f} to {d.max():+.3f})"
          for pr, d in diff.items()))
    ratio = np.array([gd.eta(float(q), 150.0) / gc.eta(float(q), 150.0) for q in qq])
    p(f"  Danfoss over Casappa at 150 bar: median ratio {np.median(ratio):.3f} (range {ratio.min():.3f} to "
      f"{ratio.max():.3f}); 6k's sign flip sits near 1.09")
    p(f"  piston pump (6g table, 60 C, full stroke): eta {part_stroke_eta(tab, 1.0, 150.0):.3f} at 150 bar; "
      f"zero-stroke drag k0 {coef[0]:.2f} bar of full-stroke flow (6h)")
    p("")
    from excavator_idle_standby import READINGS
    p("Idle power, kW (PVG32 neutral, working speed): q_p " + ", ".join(
        f"{q:.0f}: Danfoss {gd.idle(q, READINGS['PVG32'](q)):.2f} / Casappa {gc.idle(q, READINGS['PVG32'](q)):.2f}"
        for q in (60.0, 80.0, 100.0, 150.0)))
    poc_c, pls_c = gear_powers(gd, coef, *CENTRAL)
    d = poc_c - pls_c
    cross = None
    if d[0] < 0 < d[-1]:
        j = int(np.argmax(d > 0))
        cross = GRID[j - 1] + 0.5 * (-d[j - 1]) / (d[j] - d[j - 1])
    p(f"  Danfoss idle power equals load-sensing standby ({pls_c:.2f} kW) at q_p {cross:.1f} L/min "
      f"(Casappa 6k: 75.6; piston 6j: 83.4)" if cross is not None else
      "  Danfoss idle power never equals load-sensing standby on the grid")
    p("")

    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    po = P_C + M_C
    gd8 = Gear(rows_d, sizes=dan.SIZES[:-1])                # without SNP3 090, whose chart implies eta_t 0.5
    # variant: (moving-efficiency key, idle-power key)
    variants = {"danfoss": ("danfoss", "danfoss"), "danfoss without 090": ("danfoss8", "danfoss8"),
                "danfoss moving, casappa idle": ("danfoss", "casappa"), "casappa (6k)": ("casappa", "casappa"),
                "piston (6j)": ("piston", "piston")}
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
                eo = {"danfoss": np.array([gd.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]),
                      "danfoss8": np.array([gd8.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]),
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
                sz = dan.SIZES if kind == "danfoss" else dan.SIZES[:-1]
                g = (gd if kind == "danfoss" else gd8) if setting[2] == 1.0 else \
                    Gear(rows_d, setting[2], sizes=sz, skip_short=True)
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

    cas38 = result("casappa (6k)", CENTRAL, S_C)
    sh_c = np.mean(cas38[0] > 3.986) * 100
    p(f"check: the Casappa variant reproduces 6k at S = {S_C}: central {cas38[2][0]:.3f} (6k {F6K['central_38']}), "
      f"share {sh_c:.1f}% (6k {F6K['share_38']}%)")
    assert abs(cas38[2][0] - F6K["central_38"]) < 0.005 and abs(sh_c - F6K["share_38"]) < 0.05
    k101 = int(round((101.0 - GRID[0]) / 0.5))
    k85 = int(round((85.0 - GRID[0]) / 0.5))
    for kk in (k85, k101):
        p(f"central geometry, fixed-pump efficiency at q_p {GRID[kk]:.0f} L/min (p + m* = {cen['pms'][kk]:.1f} bar): "
          + ", ".join(f"{v} {cen['eo'][v][kk]:.3f}" for v in ("danfoss", "danfoss8", "casappa", "piston")))
    gap = np.array([np.median(x["eo"]["danfoss"] - x["eo"]["casappa"]) for x in rows])
    gp = np.array([np.median(x["eo"]["piston"] - x["eo"]["danfoss"]) for x in rows])
    p(f"median Danfoss minus Casappa full-stroke efficiency over pump sizes, per geometry: median {np.median(gap):+.3f} "
      f"(range {gap.min():+.3f} to {gap.max():+.3f}); piston minus Danfoss {np.median(gp):+.3f} "
      f"({gp.min():+.3f} to {gp.max():+.3f})")
    p("")
    res = {}
    for variant in variants:
        p(f"{variant}, central setting (PVG32 neutral, standby 2 L/min, working speed):")
        for share in (None,) + SHARES:
            res[(variant, share)] = result(variant, CENTRAL, share)
            p(f"  {'record only (S = s0)' if share is None else f'S = {share:.2f}'}: {summary(res[(variant, share)])}")
        p("")
    p(f"Danfoss, all settings at S = {S_C} (reading, standby flow L/min, idle speed ratio; at ratio 0.5 a power curve "
      f"not drawn down to 1050 r/min is left out):")
    shares_all = []
    for setting in SETTINGS:
        rr = result("danfoss", setting, S_C)
        shares_all.append(np.mean(rr[0] > 3.986) * 100)
        p(f"  {setting[0]:12s} q_sb {setting[1]:.0f} n_r {setting[2]:.1f}: {summary(rr)}")
    p(f"  share beating 3.986 L/h over the 18 settings: {min(shares_all):.1f}% to {max(shares_all):.1f}%")
    sh_mix = [np.mean(result("danfoss moving, casappa idle", st, S_C)[0] > 3.986) * 100 for st in SETTINGS]
    p(f"  Danfoss moving with Casappa idle, over the 18 settings: {min(sh_mix):.1f}% to {max(sh_mix):.1f}%")
    p("")
    for v in ("danfoss", "danfoss moving, casappa idle"):
        p(f"{v}: moving efficiency scaled by c, idle as read, S = 0.38, central setting:")
        for cfac in (0.94, 0.95, 0.96, 0.97, 0.98, 1.0, 1.05):
            fm, _, fc = result(v, CENTRAL, S_C, cfac)
            p(f"  c {cfac:.2f}: central {fc[0]:.3f} L/h; median {np.median(fm):.2f}; beats 3.986: "
              f"{np.mean(fm > 3.986) * 100:.1f}%")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 6m):")
    p(f"  GD1 SNP3 044 and 048 eta_t at 150 bar, 2100 r/min in 0.80-0.90: "
      f"{ok(0.8 <= min(et150[44], et150[48]) and max(et150[44], et150[48]) <= 0.9)} ({et150[44]:.3f}, {et150[48]:.3f})")
    m150 = float(np.median(diff[150.0]))
    p(f"  GD2 median Danfoss minus Casappa eta_t at 150 bar >= +0.03: {ok(m150 >= 0.03)} ({m150:+.3f})")
    p(f"  GD3 Q7/(Vn) at 2000 r/min within 0.97-1.03 for every size: "
      f"{ok(all(0.97 <= v <= 1.03 for v in qv.values()))} ({min(qv.values()):.3f} to {max(qv.values()):.3f})")
    p(f"  GD4 SNP3 044 drag below Casappa KP 30.43's {F6K['drag_43']}: {ok(drag[44][0] < F6K['drag_43'])} "
      f"({drag[44][0]:.2f}; sizes {min(v[0] for v in drag.values()):.2f} to {max(v[0] for v in drag.values()):.2f})")
    d38 = res[("danfoss", S_C)]
    sh = np.mean(d38[0] > 3.986) * 100
    p(f"  GD5 share above 3.986 L/h at S 0.38 < 50%: {ok(sh < 50)} ({sh:.1f}%)")
    p(f"  GD6 central f_t,max at S 0.38 within 1 L/h of 6k's 1.88: {ok(abs(d38[2][0] - 1.884) <= 1.0)} "
      f"({d38[2][0]:.3f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Danfoss GearMe Group 3 technical information (2023), pp. 6 and 19-21; Casappa KAPPA catalogue "
      "K 05 T A (2012), pp. 4 and 9-11; PVG 32 and Salami neutral curves; Moore 2020 (idle shares).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
