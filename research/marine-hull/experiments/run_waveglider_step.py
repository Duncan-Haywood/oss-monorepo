"""Milestone 6t: is the Wave Glider's mid-mission speed loss a step or a ramp?

Why: 6p found a slow loss of about 30% in monthly median speed between July and August 2015 on the MAGI mission's
Wave Glider; 6q showed that this vehicle state, not sea state, carries the forecastable part of speed; 6r showed it
decides a km/day plan (state ratio 1.64 against site ratios 1.20 to 1.34); 6s showed wave period does not explain it.
Its cause is unrecorded. The two usual candidates leave different shapes in time: biofouling of the float and wings
grows smoothly over weeks (a ramp), while a mode change, a payload or thruster setting, damage or a tangle shows as a
step. Which shape the data favour tells a planner whether to carry a decay rate (clean on a schedule) or watch for an
event (inspect on a drop). Same data as 6p to 6s (experiments/data/waveglider_hourly.csv, from fetch_waveglider.py).

Rules (fixed before the first run):
  Hours: speed >= 0.1 m/s, matched buoy <= 300 km. Sea-state-corrected residual e = log u - b log Hs with b = 0.218
  (6q's within-month exponent, training hours), so the series is the vehicle state at a fixed sea state.
  Daily series: median e per UTC day with >= 6 hours, from 2015-06-01 (May is the launch month; 6r flagged its low
  speed as possibly commissioning) to the end of the record. t = days since 2015-06-01.
  Models on the daily series, least squares, BIC = n ln(RSS/n) + k ln n (a breakpoint counts as one parameter):
    C   constant (k = 1)
    R   linear ramp a + c t (k = 2)
    S   single step at tau: a1 before, a2 from tau on (k = 3)
    SR  step at tau plus one common slope (k = 4)
    H   hinge, continuous piecewise linear with a kink at tau (k = 4)
  tau runs over day boundaries leaving >= 7 days on each side; each model picks its own best tau.
  Uncertainty: moving-block residual bootstrap of the S fit (5-day blocks, 1,000 resamples, seed 1), refitting tau.
Predictions:
  P1  S beats R by Delta BIC = BIC_R - BIC_S >= 6 (a step is strongly preferred to a ramp).
  P2  S's best tau lies in 2015-07-15 to 2015-08-20.
  P3  S's step is a loss of at least 20%: exp(a2 - a1) <= 0.80.
  P4  On the days from S's tau on, the OLS slope of e on t is negative with its 1-day block bootstrap 95% upper bound
      below 0 (a fouling-like decline continues after the step).
  P5  A mode-change signature sits at S's tau: over the 7 days on either side, the median telemetry samples per hour
      changes by more than 25%, or the median daily track straightness (net over-ground displacement over through-water
      distance, all hours of the day) changes by more than 0.2.
Also reported (descriptive): the full BIC table, b in {0, 0.3} instead of 0.218, the series from launch (2015-05-20),
and the 150 km buoy cut.

Run: python3 experiments/run_waveglider_step.py > experiments/results_waveglider_step.txt   (a few seconds)"""
import csv
import math
import random
import statistics as st
from datetime import datetime

D = "experiments/data/"
B = 0.218
START = datetime(2015, 6, 1)
LAUNCH = datetime(2015, 5, 20)
MIN_SIDE = 7


def load_all():
    rows = []
    for r in csv.DictReader(open(D + "waveglider_hourly.csv")):
        rows.append({"t": datetime.strptime(r["hour"], "%Y-%m-%dT%H"), "u": float(r["speed"]), "n": int(r["n"]),
                     "lat": float(r["lat"]), "lon": float(r["lon"]), "hs": float(r["wvht"]),
                     "km": float(r["dist_km"])})
    return rows


def daily(rows, b=B, start=START, max_km=300.0, min_hours=6):
    """[(t_days, median residual)] for days with >= min_hours qualifying hours."""
    by = {}
    for r in rows:
        if r["u"] < 0.1 or r["km"] > max_km or r["hs"] <= 0 or r["t"] < start:
            continue
        by.setdefault(r["t"].date(), []).append(math.log(r["u"]) - b * math.log(r["hs"]))
    out = []
    for d in sorted(by):
        if len(by[d]) >= min_hours:
            out.append(((datetime(d.year, d.month, d.day) - start).days, st.median(by[d])))
    return out


def lsq(X, y):
    p = len(X[0])
    A = [[sum(x[i] * x[j] for x in X) for j in range(p)] for i in range(p)]
    v = [sum(x[i] * yy for x, yy in zip(X, y)) for i in range(p)]
    for c in range(p):
        piv = max(range(c, p), key=lambda r: abs(A[r][c]))
        A[c], A[piv], v[c], v[piv] = A[piv], A[c], v[piv], v[c]
        for r in range(p):
            if r != c and A[c][c] != 0:
                f = A[r][c] / A[c][c]
                A[r] = [a - f * cc for a, cc in zip(A[r], A[c])]
                v[r] -= f * v[c]
    beta = [v[i] / A[i][i] for i in range(p)]
    rss = sum((yy - sum(bb * xx for bb, xx in zip(beta, x))) ** 2 for x, yy in zip(X, y))
    return beta, rss


def design(model, t, tau):
    if model == "C":
        return [1.0]
    if model == "R":
        return [1.0, t]
    if model == "S":
        return [1.0, 1.0 if t >= tau else 0.0]
    if model == "SR":
        return [1.0, 1.0 if t >= tau else 0.0, t]
    if model == "H":
        return [1.0, t, max(0.0, t - tau)]
    raise ValueError(model)


K = {"C": 1, "R": 2, "S": 3, "SR": 4, "H": 4}


def taus(series):
    ts = [t for t, _ in series]
    return [tau for tau in range(ts[0] + 1, ts[-1] + 1)
            if sum(t < tau for t in ts) >= MIN_SIDE and sum(t >= tau for t in ts) >= MIN_SIDE]


def fit(model, series):
    """(bic, beta, rss, tau) at the model's best tau (None for C and R)."""
    y = [e for _, e in series]
    n = len(y)
    best = None
    for tau in (taus(series) if model in ("S", "SR", "H") else [None]):
        beta, rss = lsq([design(model, t, tau) for t, _ in series], y)
        if best is None or rss < best[2]:
            best = (None, beta, rss, tau)
    _, beta, rss, tau = best
    return n * math.log(rss / n) + K[model] * math.log(n), beta, rss, tau


def slope(pts):
    beta, _ = lsq([[1.0, t] for t, _ in pts], [e for _, e in pts])
    return beta[1]


def km(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    return 6371.0 * math.acos(min(1.0, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl)))


def straightness(rows):
    """{date: net displacement / through-water distance} over each UTC day's hours (all hours, any buoy distance)."""
    by = {}
    for r in sorted(rows, key=lambda r: r["t"]):
        by.setdefault(r["t"].date(), []).append(r)
    out = {}
    for d, rs in by.items():
        water = sum(r["u"] for r in rs) * 3.6  # km, 1 h per row
        if len(rs) >= 12 and water > 0:
            out[d] = km((rs[0]["lat"], rs[0]["lon"]), (rs[-1]["lat"], rs[-1]["lon"])) / water
    return out


def bootstrap(series, seed=1, reps=1000, block=5):
    _, beta, _, tau = fit("S", series)
    fitted = [beta[0] + (beta[1] if t >= tau else 0.0) for t, _ in series]
    res = [e - f for (_, e), f in zip(series, fitted)]
    n = len(res)
    rng = random.Random(seed)
    taus_b, steps = [], []
    for _ in range(reps):
        rr = []
        while len(rr) < n:
            i = rng.randrange(n - block + 1)
            rr.extend(res[i:i + block])
        s2 = [(t, f + r) for (t, _), f, r in zip(series, fitted, rr[:n])]
        _, b2, _, tau2 = fit("S", s2)
        taus_b.append(tau2)
        steps.append(math.exp(b2[1]))
    taus_b.sort()
    steps.sort()
    lo, hi = int(0.025 * reps), int(0.975 * reps) - 1
    return (taus_b[lo], taus_b[hi]), (steps[lo], steps[hi])


def post_slope_boot(pts, seed=1, reps=2000):
    rng = random.Random(seed)
    s = []
    for _ in range(reps):
        smp = rng.choices(pts, k=len(pts))
        if len({t for t, _ in smp}) > 1:
            s.append(slope(smp))
    s.sort()
    return s[int(0.025 * len(s))], s[int(0.975 * len(s)) - 1]


def day(tau, start=START):
    return datetime.fromordinal(start.toordinal() + tau).date()


def table(series, label):
    fits = {m: fit(m, series) for m in ("C", "R", "S", "SR", "H")}
    print(f"{label}: {len(series)} days")
    print("  model  k   RSS      BIC      tau          parameters")
    for m, (bic, beta, rss, tau) in fits.items():
        ts = str(day(tau)) if tau is not None else "-"
        print(f"  {m:5s} {K[m]}  {rss:.4f}  {bic:8.2f}  {ts:11s}  " + ", ".join(f"{b:+.5f}" for b in beta))
    return fits


def main():
    rows = load_all()
    series = daily(rows)
    fits = table(series, "Pre-registered: daily median of log u - 0.218 log Hs, <= 300 km, from 2015-06-01")
    bic_r, bic_s = fits["R"][0], fits["S"][0]
    _, bs, _, tau = fits["S"]
    step = math.exp(bs[1])
    (tlo, thi), (slo, shi) = bootstrap(series)
    print(f"  S: step at {day(tau)}, speed ratio after/before {step:.3f}; moving-block bootstrap 95%: tau {day(tlo)} to "
          f"{day(thi)}, ratio {slo:.3f} to {shi:.3f}")
    post = [p for p in series if p[0] >= tau]
    pre = [p for p in series if p[0] < tau]
    ps = slope(post)
    plo, phi = post_slope_boot(post)
    print(f"  slope of e on t: before tau {slope(pre) * 100:+.3f} %/day ({len(pre)} days), from tau "
          f"{ps * 100:+.3f} %/day ({len(post)} days; 1-day bootstrap 95% {plo * 100:+.3f} to {phi * 100:+.3f})")
    t_tau = day(tau)
    nd = {}
    for r in rows:
        nd.setdefault(r["t"].date(), []).append(r["n"])
    win_b = [d for d in sorted(nd) if 0 < (t_tau - d).days <= 7]
    win_a = [d for d in sorted(nd) if 0 <= (d - t_tau).days < 7]
    nb = st.median(x for d in win_b for x in nd[d])
    na = st.median(x for d in win_a for x in nd[d])
    sd = straightness(rows)
    sb = st.median(sd[d] for d in win_b if d in sd)
    sa = st.median(sd[d] for d in win_a if d in sd)
    print(f"  7 days either side of {t_tau}: median samples/hour {nb:.1f} -> {na:.1f}; median straightness "
          f"{sb:.3f} -> {sa:.3f}")
    print()
    d1 = bic_r - bic_s
    print(f"P1 BIC_R - BIC_S = {d1:.2f}: {'held' if d1 >= 6 else 'refuted'} (>= 6)")
    ok2 = datetime(2015, 7, 15).date() <= t_tau <= datetime(2015, 8, 20).date()
    print(f"P2 tau = {t_tau}: {'held' if ok2 else 'refuted'} (2015-07-15 to 2015-08-20)")
    print(f"P3 step ratio = {step:.3f}: {'held' if step <= 0.80 else 'refuted'} (<= 0.80)")
    ok4 = ps < 0 and phi < 0
    print(f"P4 post-tau slope {ps * 100:+.3f} %/day, 95% upper {phi * 100:+.3f}: {'held' if ok4 else 'refuted'} "
          "(negative, upper < 0)")
    ok5 = abs(na / nb - 1) > 0.25 or abs(sa - sb) > 0.2
    print(f"P5 samples/hour change {na / nb - 1:+.1%}, straightness change {sa - sb:+.3f}: "
          f"{'held' if ok5 else 'refuted'} (> 25% or > 0.2)")
    print("\nDescriptive:")
    best = min(fits, key=lambda m: fits[m][0])
    print(f"  lowest BIC: {best}; Delta BIC to it: " +
          ", ".join(f"{m} {fits[m][0] - fits[best][0]:.2f}" for m in fits))
    for b in (0.0, 0.3):
        f = {m: fit(m, daily(rows, b=b)) for m in ("R", "S", "H")}
        print(f"  b = {b}: BIC_R - BIC_S = {f['R'][0] - f['S'][0]:.2f}, BIC_R - BIC_H = {f['R'][0] - f['H'][0]:.2f}; "
              f"S tau {day(f['S'][3])}, ratio {math.exp(f['S'][1][1]):.3f}")
    for label, s, st0 in (("from launch 2015-05-20", daily(rows, start=LAUNCH), LAUNCH),
                          ("<= 150 km", daily(rows, max_km=150.0), START)):
        f = {m: fit(m, s) for m in ("R", "S", "H")}
        print(f"  {label} ({len(s)} days): BIC_R - BIC_S = {f['R'][0] - f['S'][0]:.2f}, "
              f"BIC_R - BIC_H = {f['R'][0] - f['H'][0]:.2f}; S tau {day(f['S'][3], st0)}, "
              f"ratio {math.exp(f['S'][1][1]):.3f}")
    print("  daily series (date, median residual, speed at Hs = 1.78 m in m/s):")
    for t, e in series:
        print(f"    {day(t)}  {e:+.4f}  {math.exp(e) * 1.78 ** B:.3f}")


if __name__ == "__main__":
    main()
