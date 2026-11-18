"""Milestone 11ak: a sourced reference mismatch. 11aj swept sigma_m, the sd of the difference between the common
altitude errors of barometric and GNSS drones, over 0 to 5 m because no pressure data could be reached. Here it is
measured: NOAA's Integrated Surface Database (ISD, Smith et al. 2011, doi:10.1175/2011BAMS3015.1) hourly and special
observations for 2014 (the year of the demand data) at five New York airports, read from the public bucket
noaa-isd-pds on AWS (reachable from the session where the IEM, NCEI and Open-Meteo hosts were refused).

Why. 11aj found that a 3 m mismatch costs a stack 2.6% to 3.5% more losses of separation than one shared reference,
5% to 8% at 5 m, and that the planner can do little about it. Whether that matters depends on the size of the
mismatch in a real city, and on its shape: fronts make pressure changes heavy-tailed, and 11aj assumed a Gaussian.

Data. ISD records of type FM-15 (METAR) and FM-16 (SPECI) at JFK (744860-94789), LGA (725030-14732), EWR
(725020-14734), Central Park (KNYC, 725053-94728) and Teterboro (725025-94741). The MA1 group gives the altimeter
setting (the QNH a pilot sets, as reported) and the station pressure, both in tenths of hPa; only quality codes 1 and
5 (passed checks) are used. The barometric-altitude error of a pressure setting P_set where the true QNH is P_true is
(P_set - P_true) x 8.32 m/hPa (hypsometric, standard atmosphere, ref_mix.M_PER_HPA): a falling pressure makes a
barometric drone read high and fly low. The true QNH at a station between reports is its station pressure plus the
station's median (altimeter setting - station pressure) offset, interpolated linearly in time between reports at most
3 h apart.

Scenarios for the class mismatch delta (GNSS common error not included; no source for it was reachable, see Limits):
 * S1 stale setting: barometric operators set the latest METAR/SPECI altimeter setting of the airport they fly
   from, so delta(t) = 8.32 (A_set(last report <= t) - QNH_A(t)), t uniform over the year (every minute).
   It holds the reporting age (up to an hour, less after specials) and the inHg rounding of the report.
 * S2 stale and distant: the setting comes from airport A and the drones fly near airport B (10 to 30 km away),
   delta(t) = 8.32 (A_set(last) - QNH_B(t)); every ordered pair of the five stations. Reported with and without
   the pair's mean offset (a constant offset is a calibration matter an operator could remove; the varying part
   is weather).
 * S0 zeroed at take-off (an individual error, not a class mismatch): a drone that zeroes its barometer at launch
   drifts by 8.32 (QNH(t0) - QNH(t0 + u)) after u minutes in the air, u uniform over a T-minute flight, T = 15, 30
   and 60 min. Its sd is a sourced figure for part of 11ai's per-drone sigma (swept there over 0.5 to 3 m).

Planner analysis (ref_mix_run's inputs and planners; Z = 7.62 m, sigma = 1 m, H = 120 m, 11aj's h grid and 200
descents). The mixed-pair loss probability under an empirical mismatch is the mixture
p_mix(gap) = mean over delta samples of P(|gap + delta + e| < Z), e ~ N(0, 2 sigma^2). Conditions: S1 at JFK and
S2 JFK -> LGA (the main pair, 17 km), q = 0.5 and 0.25, both M. Planners, all scored under the empirical F:
aware-empirical (knows the classes and the empirical distribution), aware-Gaussian (knows the classes, assumes a
Gaussian mismatch of the same sd: 11aj's aware planner at the sourced sigma_m), naive (11ai at sigma), mandate
(one reference) and cautious (11ai at sqrt(sigma^2 + sigma_m^2 / 2)).

Predictions (written and committed before any pressure statistic was computed and before any layout was scored; only
the first lines of one ISD file had been looked at to check the format; 11aj's results were known):
 P1 S1 at JFK: the sd of delta is between 1.0 and 3.5 m (0.12 to 0.42 hPa).
 P2 S2 JFK -> LGA (mean offset removed): the sd of delta is larger than S1's and between 1.5 and 5 m.
 P3 Heavy tails: the excess kurtosis of delta is > 1 in S1 and S2 (fronts and squall lines), and P(|delta| > 3 sd)
    is at least twice the Gaussian 0.27%.
 P4 S0: the sd of the take-off-zero drift after a 30-min flight (u uniform on [0, 30] min) is between 0.5 and 2 m.
 P5 The planner result survives the sourced input: at S2, q = 0.5, both M, the median F(aware-empirical) /
    F(mandate) is between 1.00 and 1.06, the median h* is 13.3 m, and the aware-empirical plan is segregated in at
    most 5 of 24 layouts.
 P6 Matching the sd is enough: the median F(aware-Gaussian plan) / F(aware-empirical plan), both scored under the
    empirical F, is <= 1.01 at both M, and the median ratio F_emp / F_gauss of the same plan scored both ways is
    within [0.97, 1.03].
Reported without a prediction: the per-station S1 sd, every S2 pair's sd and offset, the monthly sd (seasonality),
the share of hours whose |delta| exceeds 3 and 5 m, naive and cautious against aware-empirical.
Preliminary.
"""
import gzip
import math
import os

M_PER_HPA = 287.05 * 288.15 / (9.80665 * 101325.0) * 100.0   # 8.32 m per hPa (ref_mix.M_PER_HPA)
STATIONS = {"JFK": "744860-94789", "LGA": "725030-14732", "EWR": "725020-14734",
            "NYC": "725053-94728", "TEB": "725025-94741"}
# Station coordinates (deg) from the ISD records themselves; distances below are great-circle.
GOOD_Q = set("15")
MAX_GAP_MIN = 180


def parse_isd_line(line):
    """(minute of 2014, altimeter hPa or None, station pressure hPa or None, report type) for one ISD record, or None
    if it is not a METAR/SPECI. Minutes count from 2014-01-01 00:00 UTC."""
    rtype = line[41:46]
    if rtype not in ("FM-15", "FM-16"):
        return None
    y, mo, d = int(line[15:19]), int(line[19:21]), int(line[21:23])
    hh, mm = int(line[23:25]), int(line[25:27])
    import datetime as _dt
    t = (_dt.datetime(y, mo, d, hh, mm) - _dt.datetime(2014, 1, 1)).total_seconds() / 60.0
    add = line[105:]
    for stop in ("REM", "EQD", "QNN"):
        j = add.find(stop)
        if j >= 0:
            add = add[:j]
    k = add.find("MA1")
    if k < 0:
        return (t, None, None, rtype)
    g = add[k + 3:k + 15]
    alt = stn = None
    if len(g) == 12:
        if g[0:5] != "99999" and g[5] in GOOD_Q:
            alt = int(g[0:5]) / 10.0
        if g[6:11] != "99999" and g[11] in GOOD_Q:
            stn = int(g[6:11]) / 10.0
    return (t, alt, stn, rtype)


def latlon(line):
    return int(line[28:34]) / 1000.0, int(line[34:41]) / 1000.0


def load_station(path):
    """Sorted list of (t_min, alt, stn) with duplicates at the same minute merged (last wins), plus (lat, lon)."""
    rows, ll = {}, None
    with gzip.open(path, "rt", encoding="ascii", errors="replace") as f:
        for line in f:
            r = parse_isd_line(line)
            if r is None:
                continue
            ll = latlon(line)
            t, a, s, _ = r
            if a is None and s is None:
                continue
            pa, ps = rows.get(t, (None, None))
            rows[t] = (a if a is not None else pa, s if s is not None else ps)
    return [(t, a, s) for t, (a, s) in sorted(rows.items())], ll


def median(v):
    v = sorted(v)
    n = len(v)
    return 0.5 * (v[(n - 1) // 2] + v[n // 2])


def qnh_series(rows):
    """Times and true-QNH estimates: station pressure + the station's median (alt - stn) offset."""
    off = median([a - s for _, a, s in rows if a is not None and s is not None])
    pts = [(t, s + off) for t, _, s in rows if s is not None]
    return [p[0] for p in pts], [p[1] for p in pts], off


def interp_at(ts, vs, t):
    """Linear interpolation of (ts, vs) at t, None if t is outside or the bracketing reports are > MAX_GAP_MIN apart."""
    import bisect
    j = bisect.bisect_right(ts, t)
    if j == 0 or j >= len(ts):
        return None
    t0, t1 = ts[j - 1], ts[j]
    if t1 - t0 > MAX_GAP_MIN:
        return None
    if t1 == t0:
        return vs[j - 1]
    w = (t - t0) / (t1 - t0)
    return vs[j - 1] * (1 - w) + vs[j] * w


def last_setting(rows):
    """Times and altimeter settings as reported (for 'the latest report at or before t')."""
    pts = [(t, a) for t, a, _ in rows if a is not None]
    return [p[0] for p in pts], [p[1] for p in pts]


def setting_at(ts, vs, t):
    import bisect
    j = bisect.bisect_right(ts, t)
    if j == 0 or t - ts[j - 1] > MAX_GAP_MIN:
        return None
    return vs[j - 1]


def mismatch_samples(rows_a, rows_b, step_min=1.0, t_end=365 * 1440.0):
    """S1 (rows_b is rows_a) or S2: delta(t) in metres at every step over the year where both are defined."""
    sts, svs = last_setting(rows_a)
    qts, qvs, _ = qnh_series(rows_b)
    out = []
    t = 0.0
    while t < t_end:
        a = setting_at(sts, svs, t)
        if a is not None:
            q = interp_at(qts, qvs, t)
            if q is not None:
                out.append((t, (a - q) * M_PER_HPA))
        t += step_min
    return out


def drift_samples(rows, T_min, step_min=5.0, n_u=30, t_end=365 * 1440.0):
    """S0: 8.32 (QNH(t0) - QNH(t0 + u)), t0 every step_min, u on a regular grid of n_u points in (0, T]."""
    qts, qvs, _ = qnh_series(rows)
    out = []
    t0 = 0.0
    while t0 < t_end:
        q0 = interp_at(qts, qvs, t0)
        if q0 is not None:
            for i in range(1, n_u + 1):
                q1 = interp_at(qts, qvs, t0 + T_min * i / n_u)
                if q1 is not None:
                    out.append((q0 - q1) * M_PER_HPA)
        t0 += step_min
    return out


def moments(x):
    """(mean, sd, excess kurtosis, P(|x - mean| > 3 sd), P(|x| > 3), P(|x| > 5))."""
    n = len(x)
    mu = sum(x) / n
    m2 = sum((v - mu) ** 2 for v in x) / n
    m4 = sum((v - mu) ** 4 for v in x) / n
    sd = math.sqrt(m2)
    return (mu, sd, m4 / (m2 * m2) - 3.0 if m2 > 0 else 0.0, sum(abs(v - mu) > 3 * sd for v in x) / n,
            sum(abs(v) > 3 for v in x) / n, sum(abs(v) > 5 for v in x) / n)


def haversine_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _ncdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def p_gap_mixture(gap, Z, s, deltas, weights=None):
    """P(|gap + delta + e| < Z) averaged over delta samples (optionally weighted), e ~ N(0, s^2)."""
    if weights is None:
        weights = [1.0] * len(deltas)
    tot = 0.0
    for d, w in zip(deltas, weights):
        g = gap + d
        if s <= 0:
            tot += w * (1.0 if abs(g) < Z else 0.0)
        else:
            tot += w * (_ncdf((Z - g) / s) - _ncdf((-Z - g) / s))
    return tot / sum(weights)


def histogram_support(x, nbins=400):
    """Compress samples to a weighted support (bin centres, counts) for fast mixture sums; exact at the bin width."""
    lo, hi = min(x), max(x)
    if hi == lo:
        return [lo], [float(len(x))]
    w = (hi - lo) / nbins
    cnt = [0] * nbins
    tot = [0.0] * nbins
    for v in x:
        b = min(nbins - 1, int((v - lo) / w))
        cnt[b] += 1
        tot[b] += v
    c = [(tot[i] / cnt[i], float(cnt[i])) for i in range(nbins) if cnt[i]]
    return [a for a, _ in c], [b for _, b in c]


def weights_mixture(h, Z, sigma, k, deltas, weights=None):
    """ref_mix.weights_sd's (pw, px) for a mixed pair under an empirical mismatch: same level arrangement as 11ai
    (W pairs 2d levels apart; X pairs half at 2d + 1 and half at |2d - 1|), the mismatch added to the gap. The gap
    error is symmetric in sign (either drone may be above), so delta and -delta are averaged."""
    s = sigma * math.sqrt(2.0)
    p = lambda n: 0.5 * (p_gap_mixture(n * h, Z, s, deltas, weights) + p_gap_mixture(-n * h, Z, s, deltas, weights))
    pw = [p(2 * d) for d in range(k)]
    px = [0.5 * (p(2 * d + 1) + p(abs(2 * d - 1))) for d in range(k)]
    return pw, px
