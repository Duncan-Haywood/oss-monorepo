"""Milestone 6e: the engine's fuel at zero pump load, measured on the loader, carried to the XE80E.

5n's Willans line regressed the ECU fuel rate on the ECU's own power estimate, which is built from
fuelling, so its intercept (-0.94 L/h) meant nothing. The same record carries the authors' shaft-power
estimates of all four pumps (work, side, HST, HST boost; `Data.AllPumps`), built from pressures,
speeds and loss models. Here, on 1 s means:

    fuel = a + c (n - 2100 rpm) + b P_pumps

a is the fuel at zero pump load at 2100 rpm (the XE80E's pump-rating speed), c its slope with
engine speed, b the marginal fuel per pump-shaft kWh. 95% intervals by resampling the 18 Y-cycles.
a is carried to the XE80E (Kubota V3307, 54.6 kW, brochure) by rated power, a x 54.6 / 83 (central),
and unscaled (upper). 6c's per-case thresholds scale linearly in b, so they are multiplied by
b / 0.2332 before the comparison. Predictions F1 to F6: LOG.md (6e), written before this ran.

Data: Linjama et al., Zenodo doi:10.5281/zenodo.10639199, CC BY 4.0 (see measured_loader.py).
Needs numpy and scipy. Usage: python no_load_fuel.py <path to Short_Y_cycle_data.mat>  (about 20 s)
"""
import csv
import math
import random
import statistics as st
import sys
from pathlib import Path

import numpy as np
import scipy.io

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from heavy_hydraulics.measured import cycle_starts, no_load_line  # noqa: E402

N_REF = 2100.0       # rpm, XE80E main pump rating speed (brochure)
P_XE80E = 54.6       # kW, Kubota V3307CRTE5 rated power at 2200 rpm (brochure)
B_6C = 0.2332        # L/kWh, the slope 6b-6d used (5n)
LOW_P = 10.0         # kW, robustness fit on low-load seconds (F6)
MEDIAN_6C = 1.00     # L/h, 6c's median threshold at b = 0.2332 (checked below)
BOOT = 2000


def load(path):
    D = scipy.io.loadmat(path, squeeze_me=True, struct_as_record=False)["Data"]
    g = lambda o: np.asarray(o.Data, float)  # noqa: E731
    r = dict(dt=float(D.SamplingPeriod), p_rated=float(D.Diesel.Params.EnginePower) / 1e3)
    r["fuel"] = g(D.Diesel.FuelRate)
    r["rpm"] = g(D.Diesel.w) * 60 / (2 * math.pi)
    parts = {k: g(getattr(D, k).ShaftPowerEstimate) / 1e3
             for k in ("WorkPump", "SidePump", "HSTPump", "HSTBoostPump")}
    r["parts"] = parts
    r["sum4"] = sum(parts.values())
    allp = getattr(D, "AllPumps", None)
    names = list(getattr(allp, "_fieldnames", []) or [])
    r["allpumps_fields"] = names
    r["P"] = (g(allp.ShaftPowerEstimate) / 1e3) if "ShaftPowerEstimate" in names else r["sum4"]
    r["x"] = g(D.LiftCylinder.x)
    r["speed"] = g(D.Machine.Speed)
    return r


def seconds(r):
    k = int(round(1.0 / r["dt"]))
    n = len(r["fuel"]) // k
    m = lambda v: np.asarray(v[: n * k]).reshape(n, k).mean(axis=1)  # noqa: E731
    return k, {key: m(r[key]) for key in ("fuel", "rpm", "P", "sum4", "speed")}, {
        key: m(v) for key, v in r["parts"].items()}


def pct(v, q):
    s = sorted(v)
    i = (len(s) - 1) * q
    lo = math.floor(i)
    return s[lo] + (s[min(lo + 1, len(s) - 1)] - s[lo]) * (i - lo)


def fit(sec, idx):
    return no_load_line([sec["fuel"][i] for i in idx], [sec["rpm"][i] for i in idx],
                        [sec["P"][i] for i in idx], N_REF)


def main(path):
    r = load(path)
    k, sec, parts = seconds(r)
    n = len(sec["fuel"])
    print(f"Record: {n} s of 1 s means; loader engine {r['p_rated']:.0f} kW; "
          f"AllPumps fields: {', '.join(r['allpumps_fields'])}")
    diff = float(np.max(np.abs(sec["P"] - sec["sum4"])))
    print(f"AllPumps shaft power vs the four pumps summed: max |difference| {diff:.4f} kW")
    print("Mean pump-side shaft power (kW): " + ", ".join(f"{k2} {float(v.mean()):.2f}" for k2, v in parts.items())
          + f"; all {float(sec['P'].mean()):.2f}")
    rp = sorted(sec["rpm"])
    lo5, hi95 = pct(rp, 0.05), pct(rp, 0.95)
    print(f"Engine speed: p5 {lo5:.0f}, median {pct(rp, 0.5):.0f}, p95 {hi95:.0f} rpm (2100 rpm "
          f"{'inside' if lo5 <= N_REF <= hi95 else 'OUTSIDE'} p5-p95)")
    print(f"Fuel rate (1 s means): p5 {pct(sec['fuel'], 0.05):.2f}, median {pct(sec['fuel'], 0.5):.2f}, "
          f"mean {float(sec['fuel'].mean()):.2f} L/h; pump-side power p5 {pct(sec['P'], 0.05):.2f}, "
          f"median {pct(sec['P'], 0.5):.2f} kW")

    allidx = list(range(n))
    a, c, b = fit(sec, allidx)
    pred = [a + c * (sec["rpm"][i] - N_REF) + b * sec["P"][i] for i in allidx]
    res = [sec["fuel"][i] - pred[i] for i in allidx]
    my = float(sec["fuel"].mean())
    r2 = 1 - sum(e * e for e in res) / sum((y - my) ** 2 for y in sec["fuel"])
    print("\nFull fit: fuel = a + c (n - 2100) + b P")
    print(f"  a (zero pump load, 2100 rpm) {a:.3f} L/h; c {c * 1000:.3f} L/h per 1000 rpm; b {b:.4f} L/kWh; "
          f"R^2 {r2:.3f}; residual sd {st.pstdev(res):.3f} L/h")

    # cycle resampling
    starts = cycle_starts(list(r["x"]), 0.30)
    sec_starts = sorted({s // k for s in starts})
    bounds = [0] + sec_starts[1:] + [n]  # first block includes the lead-in
    blocks = [list(range(bounds[i], bounds[i + 1])) for i in range(len(bounds) - 1)]
    blocks = [bl for bl in blocks if bl]
    rng = random.Random(0)
    boot = []
    for _ in range(BOOT):
        idx = [i for _ in blocks for i in blocks[rng.randrange(len(blocks))]]
        boot.append(fit(sec, idx))
    ci = lambda j: (pct([t[j] for t in boot], 0.025), pct([t[j] for t in boot], 0.975))  # noqa: E731
    print(f"  {len(blocks)} blocks resampled {BOOT} times (seed 0); 95% intervals: a {ci(0)[0]:.3f} to "
          f"{ci(0)[1]:.3f}; c {ci(1)[0] * 1000:.3f} to {ci(1)[1] * 1000:.3f} per 1000 rpm; "
          f"b {ci(2)[0]:.4f} to {ci(2)[1]:.4f}")

    low = [i for i in allidx if sec["P"][i] < LOW_P]
    a6, c6, b6 = fit(sec, low)
    print(f"\nLow-load fit (P < {LOW_P:.0f} kW, {len(low)} s): a {a6:.3f} L/h, c {c6 * 1000:.3f} per 1000 rpm, "
          f"b {b6:.4f}; a / full a = {a6 / a:.3f}")
    still = [i for i in allidx if abs(sec["speed"][i]) < 0.1]
    if len(still) > 20:
        a7, c7, b7 = fit(sec, still)
        print(f"Machine-still fit (|speed| < 0.1, {len(still)} s): a {a7:.3f} L/h, c {c7 * 1000:.3f}, b {b7:.4f}")
    print("No-load fuel a + c (n - 2100) by engine speed (full fit): "
          + ", ".join(f"{s} rpm {a + c * (s - N_REF):.2f}" for s in (1000, 1500, 1800, 2100, 2200)))

    # carry to the XE80E and compare with 6c
    rows = list(csv.DictReader(open(HERE / "excavator_breakeven_geometry_cases.csv")))
    f6c = [float(x["ft_max_central_lph"]) for x in rows]
    print(f"\n6c check: median f_t,max {st.median(f6c):.3f} L/h over {len(f6c)} cases (b {B_6C})")
    scale = b / B_6C
    fnew = [v * scale for v in f6c]
    med = st.median(fnew)
    print(f"Rescaled by b / {B_6C} = {scale:.3f}: median {med:.3f}, p90 {pct(fnew, 0.9):.3f}, "
          f"max {max(fnew):.3f} L/h")
    rated = P_XE80E / r["p_rated"]
    for name, ft in (("(i) by rated power x %.3f" % rated, a * rated), ("(ii) unscaled", a)):
        win = sum(v > ft for v in fnew) / len(fnew)
        print(f"  XE80E no-load {name}: {ft:.3f} L/h; fixed pump wins in {100 * win:.1f}% of cases")
    lo_i, hi_i = ci(0)
    lo_b, hi_b = ci(2)
    ft_lo, ft_hi = lo_i * rated, hi_i * rated
    win_hi = sum(v * hi_b / b > ft_lo for v in fnew) / len(fnew)
    win_lo = sum(v * lo_b / b > ft_hi for v in fnew) / len(fnew)
    print(f"  over the 95% intervals of a and b (carried by rating): fixed pump wins in {100 * win_lo:.1f}% "
          f"to {100 * win_hi:.1f}% of cases")
    win_sw = [sum(float(x["ft_max_sweep_max_lph"]) * scale > a * rated for x in rows) / len(rows)]
    print(f"  at (i), share with a fixed-pump win under at least one of 6c's 108 parameter sets "
          f"(sweep max rescaled): {100 * win_sw[0]:.1f}%")

    ft_i = a * rated
    print("\nPredictions (LOG.md, 6e):")
    print(f"  F1 a in 1.5 to 4.0 L/h: {a:.3f} -> {'held' if 1.5 <= a <= 4.0 else 'refuted'}")
    print(f"  F2 b in 0.20 to 0.28 L/kWh: {b:.4f} -> {'held' if 0.20 <= b <= 0.28 else 'refuted'}")
    print(f"  F3 c > 0, interval excludes 0: c {c * 1000:.3f}, CI {ci(1)[0] * 1000:.3f} to {ci(1)[1] * 1000:.3f}"
          f" -> {'held' if ci(1)[0] > 0 else 'refuted'}")
    print(f"  F4 carried rate above rescaled 6c median: {ft_i:.3f} vs {med:.3f} -> "
          f"{'held' if ft_i > med else 'refuted'}")
    w = sum(v > ft_i for v in fnew) / len(fnew)
    print(f"  F5 fixed pump wins in under 20%: {100 * w:.1f}% -> {'held' if w < 0.20 else 'refuted'}")
    print(f"  F6 low-load intercept within 25%: ratio {a6 / a:.3f} -> "
          f"{'held' if abs(a6 / a - 1) <= 0.25 else 'refuted'}")
    print("  Validity: a diesel cannot turn fuel into shaft work at under about 0.2 L/kWh, so a slope of "
          f"{b:.3f} L/kWh means P misses most of the engine's load; F4 and F5 rest on this fit and are void.")

    posthoc(r, k, sec, parts, rows, b)


def posthoc(r, k, sec, parts, rows, b_reg):
    """Not registered: written after the registered fit failed (LOG.md, 6e). Labelled as such."""
    D = scipy.io.loadmat(sys.argv[1], squeeze_me=True, struct_as_record=False)["Data"]
    n = len(sec["fuel"])
    sm = lambda v: np.asarray(v, float)[: n * k].reshape(n, k).mean(axis=1)  # noqa: E731
    peng = sm(D.Diesel.PowerEstimate.Data) / 1e3
    hst_shaft = sm(D.HSTPump.ShaftPowerEstimate.Data) / 1e3
    hst_hyd = sm(D.HSTPump.HydraulicPowerEstimate.Data) / 1e3
    print("\nPost hoc (not registered), why the registered fit fails:")
    print(f"  mean ECU engine power {float(peng.mean()):.2f} kW against pump-side shaft power "
          f"{float(sec['P'].mean()):.2f} kW ({100 * float(sec['P'].mean() / peng.mean()):.0f}%)")
    print(f"  HST pump: mean shaft power {float(hst_shaft.mean()):.2f} kW but mean hydraulic power "
          f"{float(hst_hyd.mean()):.2f} kW (a pump cannot deliver more than its shaft takes); "
          f"corr(fuel, HST shaft) {float(np.corrcoef(sec['fuel'], hst_shaft)[0, 1]):+.2f}")
    f, rpm, P = sec["fuel"], sec["rpm"], sec["P"]
    print("  by engine speed (1 s means): bin, seconds, median fuel L/h, median pump-side kW, median ECU kW")
    for lo, hi in ((700, 900), (900, 1200), (1200, 1400), (1400, 1600), (1600, 1800), (1800, 2000), (2000, 2300)):
        sel = (rpm >= lo) & (rpm < hi)
        if sel.sum():
            print(f"    {lo}-{hi}: {int(sel.sum()):3d}, {float(np.median(f[sel])):5.2f}, "
                  f"{float(np.median(P[sel])):6.2f}, {float(np.median(peng[sel])):5.1f}")

    # the one clean no-load reading: low idle with the pumps near zero load
    idle = (rpm < 900) & (np.abs(P) < 3.0)
    f_idle = float(np.median(f[idle]))
    n_idle = float(np.median(rpm[idle]))
    q = sorted(f[idle])
    print(f"\n  low idle, |pump-side power| < 3 kW: {int(idle.sum())} s at median {n_idle:.0f} rpm; fuel median "
          f"{f_idle:.3f} L/h (p25 {pct(q, 0.25):.2f}, p75 {pct(q, 0.75):.2f}); ECU power median "
          f"{float(np.median(peng[idle])):.1f} kW")
    per_rev = f_idle / n_idle   # L/h per rpm = fuel per revolution, scaled
    print(f"  fuel per engine revolution at low idle: {f_idle / (n_idle * 60) * 1e6:.1f} mm^3/rev")
    rated = P_XE80E / r["p_rated"]
    rows_c = [float(x["ft_max_central_lph"]) for x in rows]
    rows_x = [float(x["ft_max_sweep_max_lph"]) for x in rows]
    print("  floor: zero-load fuel per revolution does not fall with speed (friction mean effective pressure and"
          " fan load rise with speed), so no-load fuel at n >= low-idle fuel x n / n_idle.")
    print("  6c thresholds at b = 0.2332 (unchanged). Fixed pump wins where f_t,max > floor:")
    for nn in (1500, 1800, 2100, 2200):
        for name, sc in (("by rating x %.3f" % rated, rated), ("unscaled", 1.0)):
            fl = per_rev * nn * sc
            w = sum(v > fl for v in rows_c) / len(rows_c)
            wx = sum(v > fl for v in rows_x) / len(rows_x)
            print(f"    {nn} rpm, {name}: floor {fl:.2f} L/h; central parameters {100 * w:.1f}% of 384 cases; "
                  f"under at least one of 108 parameter sets {100 * wx:.1f}%")
    cen = [float(x["ft_max_central_lph"]) for x in rows
           if (x["boom_lever"], x["arm_lever"], x["bucket_lever"], x["bucket_sign"], x["swing_share"]) == ("1", "1", "1", "1", "0.5")]
    print(f"  central geometry f_t,max {cen[0]:.3f} L/h against the 2100 rpm floor by rating "
          f"{per_rev * 2100 * rated:.2f} L/h")


if __name__ == "__main__":
    main(sys.argv[1])
