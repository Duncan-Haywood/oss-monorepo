"""Milestone 6f: no-load diesel fuel from the tractor-test standard, carried to the XE80E.

    python3 experiments/asabe_no_load_fuel.py   (stdlib only, under 1 s)

Sources (opened 2026-11-13): Grisso, Perumpral, Vaughan, Roberson, Pitman, "Predicting Tractor
Diesel Fuel Consumption", Virginia Cooperative Extension 442-073 (2010): eq. 2 (ASABE D497.6
general model, over 500 Nebraska-tested tractors) Q_F = (0.0434 X + 0.019) P_PTO gal/h, eq. 3
Q_R = Q_F [1 - (N - 1)(0.45 X - 0.877)], and its Figure 1, the varying-power table of NTTL test
1725 (John Deere 7610). XE80E engine: Kubota V3307, 54.6 kW at 2200 rpm (XCMG brochure, as 6e).
6c's per-case thresholds: excavator_breakeven_geometry_cases.csv. Predictions H1 to H6: LOG.md.
"""
import csv
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from heavy_hydraulics.measured import asabe_fuel_lph  # noqa: E402
from heavy_hydraulics.screening import ols  # noqa: E402

# NTTL 1725, Varying power and fuel consumption (full throttle): PTO kW, engine rpm, fuel L/h
T1725 = [(86.47, 2100, 25.82), (76.12, 2170, 23.95), (57.76, 2202, 19.91),
         (38.81, 2233, 16.18), (19.59, 2257, 11.81), (0.77, 2267, 7.77)]
P1725 = 86.47          # kW rated PTO power at 2100 rpm
B_6C = 0.2332          # L/kWh, slope used in 6b to 6e
P_XE = 54.6            # kW, V3307 rated (brochure)
N_RATED_XE = 2200.0
FLOOR_6E = 2.53        # L/h, 6e floor at 2100 rpm by rating
LOADER_IDLE = (83.0, 800.0, 1.463)  # kW rated, rpm, measured L/h (6e)


def share(vals, thr):
    return 100.0 * sum(v > thr for v in vals) / len(vals)


def main():
    out = []
    pr = out.append
    # (1) Willans line of the measured tractor
    pw = [r[0] for r in T1725]
    q = [r[2] for r in T1725]
    a0, b0 = ols([(p,) for p in pw], q)
    res = [qi - (a0 + b0 * p) for p, qi in zip(pw, q)]
    pr("NTTL 1725 (JD7610, 86.47 kW rated PTO, high idle 2267 rpm), full-throttle varying-power rows:")
    pr(f"  OLS fuel = {a0:.3f} + {b0:.4f} P  (L/h, P in kW); intercept per rated kW {a0 / P1725:.4f} L/h/kW;"
       f" max |residual| {max(abs(r) for r in res):.3f} L/h")
    pr("  general model (eqs 2-3, full throttle, N = 1) against each row: P kW, measured, model, model/measured")
    for p, n, qi in T1725:
        m = asabe_fuel_lph(p / P1725, 1.0, P1725)
        pr(f"    {p:6.2f}  {qi:6.2f}  {m:6.2f}  {m / qi:.3f}")
    gen_icpt = asabe_fuel_lph(0.0, 1.0, 1.0)
    gen_slope = asabe_fuel_lph(1.0, 1.0, 1.0) - gen_icpt
    pr(f"  general model in SI: Q_F = {gen_slope:.4f} X P + {gen_icpt:.4f} P L/h (P rated kW), slope {gen_slope:.4f} L/kWh")
    pr(f"  JD7610 specific model (appendix A: b = 0.0203 gal/h/hp, from 50% and 75% pull) at X = 0: "
       f"{0.0203 * P1725 / 0.745699872 * 3.785411784:.2f} L/h against measured {T1725[-1][2]:.2f} at 0.77 kW")

    # (2) carried to the XE80E
    rows = list(csv.DictReader(open(HERE / "excavator_breakeven_geometry_cases.csv")))
    cen = [float(r["ft_max_central_lph"]) for r in rows]
    smax = [float(r["ft_max_sweep_max_lph"]) for r in rows]
    scale = gen_slope / B_6C
    cen_s = [v * scale for v in cen]
    pr("")
    pr(f"6c thresholds over {len(rows)} cases: central median {st.median(cen):.3f}, max {max(cen):.3f} L/h;"
       f" rescaled by b {gen_slope:.4f}/{B_6C} = {scale:.4f}: median {st.median(cen_s):.3f}, max {max(cen_s):.3f};"
       f" sweep max over 108 sets: max {max(smax):.3f} L/h")
    pr("XE80E no-load rate (eq 3 at X = 0) and the share of the 384 cases where a smaller fixed pump wins:")
    pr("   k     HI   n rpm   N      no-load L/h  central %  any-set %")
    res_rows = []
    for k in (1.0, 0.85):
        for hi in (2200.0, N_RATED_XE * 2267 / 2100, 2400.0):
            for n in (1500.0, 1800.0, 2100.0, 2200.0):
                nl = asabe_fuel_lph(0.0, n / hi, k * P_XE)
                c_sh, a_sh = share(cen_s, nl), share(smax, nl)
                res_rows.append((k, hi, n, nl, c_sh, a_sh))
                pr(f"  {k:.2f}  {hi:6.1f}  {n:5.0f}  {n / hi:.3f}  {nl:8.3f}    {c_sh:6.1f}    {a_sh:6.1f}")
    at2100 = [r for r in res_rows if r[2] == 2100.0]
    at1500 = [r for r in res_rows if r[2] == 1500.0]
    lo2100 = min(at2100, key=lambda r: r[3])
    pr(f"  at 2100 rpm: no-load {min(r[3] for r in at2100):.3f} to {max(r[3] for r in at2100):.3f} L/h;"
       f" over 6e's floor {FLOOR_6E} by x{min(r[3] for r in at2100) / FLOOR_6E:.2f} to x{max(r[3] for r in at2100) / FLOOR_6E:.2f}")
    pr(f"  at 1500 rpm: no-load {min(r[3] for r in at1500):.3f} to {max(r[3] for r in at1500):.3f} L/h;"
       f" any-set share {min(r[5] for r in at1500):.1f}% to {max(r[5] for r in at1500):.1f}%")
    # 1725 measured intercept carried by rating, as a second reading
    meas = a0 / P1725 * P_XE
    pr(f"  1725 measured intercept carried by rated power (full throttle, no speed correction): {meas:.3f} L/h;"
       f" central {share(cen_s, meas):.1f}%, any-set {share(smax, meas):.1f}%")
    # the rate a fixed pump would need, i.e. which no-load rate would reopen the question
    for pct in (50, 90, 99):
        v = sorted(smax)[int(round(pct / 100 * (len(smax) - 1)))]
        pr(f"  sweep-max p{pct}: {v:.3f} L/h")

    # (4) loader check
    pr("")
    pk, nidle, qmeas = LOADER_IDLE
    pr(f"Loader low idle ({nidle:.0f} rpm, {pk:.0f} kW): measured {qmeas} L/h (6e); eq 3 at X = 0:")
    ratios = []
    for hi in (2200.0, 2300.0, 2400.0):
        m = asabe_fuel_lph(0.0, nidle / hi, pk)
        ratios.append(m / qmeas)
        pr(f"  HI {hi:.0f}: N {nidle / hi:.3f}, model {m:.3f} L/h, model/measured {m / qmeas:.2f}")
    full = asabe_fuel_lph(0.0, 1.0, pk)
    pr(f"  full throttle, no load (eq 2): {full:.3f} L/h; per rev at 800 rpm the measured idle is "
       f"{qmeas / 60 / nidle * 1e6:.1f} mm^3")

    pr("")
    pr("Predictions (LOG.md, 6f):")
    h1 = 0.19 <= b0 <= 0.23 and 6.5 <= a0 <= 8.5
    pr(f"  H1 slope 0.19-0.23 and intercept 6.5-8.5: {b0:.4f}, {a0:.3f} -> {'held' if h1 else 'refuted'}")
    h2 = all(3.5 <= r[3] <= 5.5 and r[3] > FLOOR_6E for r in at2100)
    pr(f"  H2 2100 rpm no-load in 3.5-5.5 in all six scenarios, above 2.53: -> {'held' if h2 else 'refuted'}")
    h3 = all(r[4] == 0.0 for r in at2100)
    pr(f"  H3 central share 0% in every 2100 rpm scenario: max {max(r[4] for r in at2100):.1f}% -> {'held' if h3 else 'refuted'}")
    h4 = lo2100[5] < 5.0
    pr(f"  H4 lowest 2100 rpm scenario ({lo2100[3]:.3f} L/h) any-set share under 5%: {lo2100[5]:.1f}% -> {'held' if h4 else 'refuted'}")
    h5 = all(r[5] < 15.0 for r in at1500)
    pr(f"  H5 1500 rpm any-set share under 15% in every scenario: max {max(r[5] for r in at1500):.1f}% -> {'held' if h5 else 'refuted'}")
    h6 = min(ratios) > 1.5
    pr(f"  H6 loader low-idle over-prediction above 1.5x: {min(ratios):.2f} to {max(ratios):.2f} -> {'held' if h6 else 'refuted'}")
    text = "\n".join(out) + "\n"
    (HERE / "asabe_no_load_fuel_results.txt").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
