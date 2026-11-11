"""Milestone 6u, post hoc: three checks written AFTER reading experiments/results_waveglider_onboard.txt.

None of this was pre-registered; it follows three things the registered run showed, and is reported as exploratory.
  H1  A3 found a strong period term (c = -0.71 on T_avg, b rising to 0.54). The quasi-steady foil model of 6p makes
      speed a function of heave velocity, i.e. of Hs / T: is the fitted pair close to b = -c, and how much fit is lost
      by forcing log u ~ month + a log(Hs / T_avg)?
  H2  total_power peaks at local midday and bottoms out before dawn (a battery energy level charged by the solar
      panels, not an instantaneous power). The August step began at 15 UTC (05 local), near the daily low. Was the
      battery unusually low that morning, and did the overnight drain rate (the vehicle's load) change after the step,
      as switching off a load (a thruster, a payload) would make it? Also telemetry samples per hour (6t's
      reporting-rate cut) before and after.
  H3  A5 found an on-board oracle Hs makes the 24 h persistence forecast worse. Does adding the period (training fit
      of b and c, same rules as A5) change that?
  H4  A6 found the A4 model (Hs, headwind) explains 27% of the August log step. How much does H1's Hs-and-period
      model explain, from the windows' median Hs_ob and T_avg, for the August step and the June drop and recovery?
Run: python3 experiments/run_waveglider_onboard_posthoc.py > experiments/results_waveglider_onboard_posthoc.txt"""
import math
import statistics as st
from datetime import datetime, timedelta

import run_waveglider_onboard as o
from run_waveglider_drift import ols

LOCAL = timedelta(hours=-10)


def rss(rows, cols):
    months = sorted({r["t"].month for r in rows})
    X = [[1.0 if r["t"].month == m else 0.0 for m in months] + [f(r) for f in cols] for r in rows]
    y = [math.log(r["u"]) for r in rows]
    beta = ols(X, y)
    return sum((yy - sum(a * b for a, b in zip(x, beta))) ** 2 for x, yy in zip(X, y)), len(beta)


def night_drain(rows, a, b):
    """Median fall of total_power per hour over local 19:00 to 05:00 nights in [a, b) (units of the field per hour)."""
    by = {r["t"]: r["power"] for r in rows if r["power"] is not None}
    out = []
    d = a
    while d < b:
        t19 = datetime(d.year, d.month, d.day, 19) - LOCAL  # local 19:00 -> UTC
        t05 = t19 + timedelta(hours=10)
        if t19 in by and t05 in by and t05 < b:
            out.append((by[t19] - by[t05]) / 10)
        d += timedelta(days=1)
    return out


def main():
    rows = o.load()
    S2 = [r for r in o.s2(rows) if r["tavg"] and r["tavg"] > 0]
    print("Milestone 6u post hoc (written after reading results_waveglider_onboard.txt; exploratory)")

    print("\nH1  does speed follow Hs / T (heave velocity), as the quasi-steady model's scaling says?")
    free, kf = rss(S2, [o.LOG_OB, lambda r: math.log(r["tavg"])])
    ratio, kr = rss(S2, [lambda r: math.log(r["hs"] / r["tavg"])])
    hs_only, kh = rss(S2, [o.LOG_OB])
    a = o.fit(S2, [lambda r: math.log(r["hs"] / r["tavg"])])[0]
    b, c = o.fit(S2, [o.LOG_OB, lambda r: math.log(r["tavg"])])
    n = len(S2)
    for lab, s, k in (("Hs only", hs_only, kh), ("Hs / T_avg", ratio, kr), ("Hs and T_avg free", free, kf)):
        print(f"  {lab:18s} RSS {s:8.3f}  BIC {n * math.log(s / n) + k * math.log(n):9.1f}")
    lo, hi = o.boot(S2, lambda rr: sum(o.fit(rr, [o.LOG_OB, lambda r: math.log(r["tavg"])])))
    print(f"  {n} hours: free b {b:.3f}, c {c:+.3f}, b + c {b + c:+.3f} (95% {lo:+.3f} to {hi:+.3f}); "
          f"ratio exponent a {a:.3f}")
    corr = st.correlation([math.log(r["hs"]) for r in S2], [math.log(r["tavg"]) for r in S2])
    print(f"  corr(log Hs_ob, log T_avg) {corr:+.3f}; median T_avg {st.median(r['tavg'] for r in S2):.2f} s")

    print("\nH2  the battery around the August step")
    pw = [r for r in rows if r["power"] is not None and r["t"] >= o.START]
    daymin = {}
    for r in pw:
        d = (r["t"] + LOCAL).date()
        daymin[d] = min(daymin.get(d, 1e12), r["power"])
    ordered = sorted(daymin)
    step_day = (o.STEP + LOCAL).date()
    prior = [daymin[d] for d in ordered if d < step_day]
    print(f"  local-day minimum of total_power on {step_day}: {daymin[step_day]:.0f}; lowest of the "
          f"{len(prior)} earlier days {min(prior):.0f}; median earlier daily minimum {st.median(prior):.0f}")
    rank = sorted(daymin.values()).index(daymin[step_day]) + 1
    print(f"  rank of that minimum among all {len(daymin)} mission days (1 = lowest): {rank}")
    low = sorted(daymin.items(), key=lambda kv: kv[1])[:8]
    print("  the 8 lowest daily minima: " + ", ".join(f"{d:%m-%d} {v / 1000:.0f}k" for d, v in low))
    for lab, a0, b0 in (("7 days before", o.STEP - timedelta(days=7), o.STEP),
                        ("7 days after", o.STEP, o.STEP + timedelta(days=7)),
                        ("June 6-12", datetime(2015, 6, 6), datetime(2015, 6, 13)),
                        ("June 13-19", datetime(2015, 6, 13), datetime(2015, 6, 20)),
                        ("June 21-27", datetime(2015, 6, 21), datetime(2015, 6, 28))):
        dr = night_drain(rows, a0, b0)
        ns = [r for r in rows if a0 <= r["t"] < b0]
        print(f"  {lab:14s} overnight drain {st.median(dr):7.0f}/h over {len(dr)} nights "
              f"(range {min(dr):.0f} to {max(dr):.0f}); median speed {st.median(r['u'] for r in ns):.3f} m/s")
    month_drain = {}
    for m in range(6, 11):
        a0 = datetime(2015, m, 1)
        b0 = datetime(2015, m + 1, 1)
        month_drain[m] = night_drain(rows, a0, b0)
    print("  overnight drain by month (median /h): " +
          ", ".join(f"{m}: {st.median(v):.0f}" for m, v in month_drain.items()))

    print("\nH3  forecast with the period term (A5 rules, training 2015-06-01 to 2015-07-31)")
    tr = [r for r in S2 if r["t"] < o.SPLIT]
    bt, ct = o.fit(tr, [o.LOG_OB, lambda r: math.log(r["tavg"])])
    print(f"  training b {bt:.3f}, c {ct:+.3f} ({len(tr)} hours)")
    use = [r for r in o.usable(rows) if r["tavg"] and r["tavg"] > 0]
    by_t = {r["t"]: r for r in use}
    for h in (6, 24, 72):
        e1, e2, ts = [], [], []
        for r in use:
            if r["t"] < o.SPLIT:
                continue
            t0 = r["t"] - timedelta(hours=h)
            w = [by_t[t0 - timedelta(hours=k)] for k in range(1, 25) if (t0 - timedelta(hours=k)) in by_t]
            if len(w) < 6:
                continue
            u1 = st.median(x["u"] for x in w)
            u2 = (u1 * (r["hs"] / st.median(x["hs"] for x in w)) ** bt
                  * (r["tavg"] / st.median(x["tavg"] for x in w)) ** ct)
            e1.append(abs(u1 - r["u"]))
            e2.append(abs(u2 - r["u"]))
            ts.append(r["t"])
        lo, hi = o.ratio_boot(e2, e1, ts)
        print(f"  h {h:2d}: {len(e1)} targets, MAE M1 {st.fmean(e1):.4f}, M2 (Hs, T) {st.fmean(e2):.4f}, "
              f"ratio {st.fmean(e2) / st.fmean(e1):.3f} (95% {lo:.3f} to {hi:.3f})")

    print("\nH4  share of the 6t events the Hs-and-period model explains (free b, c from H1)")
    wins = {"Aug before": (o.STEP - timedelta(days=7), o.STEP), "Aug after": (o.STEP, o.STEP + timedelta(days=7)),
            "Jun 6-12": (datetime(2015, 6, 6), datetime(2015, 6, 13)),
            "Jun 13-19": (datetime(2015, 6, 13), datetime(2015, 6, 20)),
            "Jun 21-27": (datetime(2015, 6, 21), datetime(2015, 6, 28))}
    med = {}
    for k, (a0, b0) in wins.items():
        w = [r for r in S2 if a0 <= r["t"] < b0]
        med[k] = (st.median(r["u"] for r in w), st.median(r["hs"] for r in w), st.median(r["tavg"] for r in w))
    for x, y in (("Aug before", "Aug after"), ("Jun 6-12", "Jun 13-19"), ("Jun 13-19", "Jun 21-27")):
        obs = med[y][0] / med[x][0]
        pred = (med[y][1] / med[x][1]) ** b * (med[y][2] / med[x][2]) ** c
        print(f"  {x} -> {y}: T_avg {med[x][2]:.2f} -> {med[y][2]:.2f} s, Hs {med[x][1]:.2f} -> {med[y][1]:.2f} m; "
              f"observed {obs:.3f}, model {pred:.3f}, share of log change {math.log(pred) / math.log(obs):+.2f}")


if __name__ == "__main__":
    main()
