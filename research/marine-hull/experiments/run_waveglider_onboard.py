"""Milestone 6u: with the Wave Glider's own on-board wave and wind records in place of a buoy up to 300 km away, is its
weak sea-state response (6q: speed ~ Hs^0.22 at a fixed vehicle state) real, or the attenuation a noisy proxy gives?

Why: 6p refuted the quasi-steady foil model (speed linear in Hs) and 6q to 6s planned km/day from U = s Hs^0.22, but
every Hs so far came from the nearest NDBC buoy (median 144 km, up to 300 km; up to ~1,000 km post hoc in 6t). Under
classical errors-in-variables a noisy regressor shrinks the slope toward 0 by the reliability ratio, so the sub-linear
exponent could be an artefact of the match. The same ERDDAP server carries the vehicle's own Datawell MOSE wave
record, its weather station and its telemetry's heading and total_power fields
(experiments/fetch_waveglider_onboard.py -> experiments/data/waveglider_onboard_hourly.csv); no earlier milestone used
them. 6t also asked what happened on 7 August 2015 (a persistent -25 to -30% step in hour-scale speed): on-board sea
state, wind and power across that hour are now observable.

Rules (fixed before the first run; this docstring is committed before any output is read):
  Hours: speed >= 0.1 m/s and an on-board MOSE Hs in [0.2, 10] m. Month intercepts carry the vehicle state, as 6q.
  S1 = 6q's training hours that also have MOSE: before 2015-08-01, buoy <= 300 km, buoy Hs present.
  S2 = every hour from 2015-06-01 with MOSE (any buoy distance; May is launch and transit, as 6t).
  A1  b_buoy and b_ob: OLS of log u on month dummies + log Hs, buoy Hs and on-board Hs, on the same S1 hours; b_ob
      also on S2. Moving-block bootstrap, 1-day blocks, 2,000 resamples, seed 1, for b_ob (S1, S2) and b_ob - b_buoy (S1).
  A2  Reliability on S1: within-month (month-demeaned) correlation of log Hs_ob and log Hs_buoy, and the attenuation
      factor lambda = cov_w(log Hs_ob, log Hs_buoy) / var_w(log Hs_buoy); EIV predicts b_buoy ~= lambda * b_ob.
  A3  Period on S2: log u ~ month + b log Hs_ob + c log T_avg (MOSE average period); bootstrap c. T_dom reported too.
  A4  Wind on S2 hours with wind: head = wind * cos(wind_from - sub_heading) (m/s, + = wind on the bow),
      cross = |wind * sin(...)|; log u ~ month + b log Hs_ob + d head + e cross; bootstrap d.
  A5  Forecast (6q's test): targets from 2015-08-01, any distance, trailing 24 h window (>= 6 hours) ending h hours
      before, h in 6, 24, 72. M1 = trailing median speed; M2ob = M1 x (Hs_ob target / trailing median Hs_ob)^b, b from
      A1 fitted on hours before 2015-08-01 (S2 rule); the observed target Hs is an oracle forecast. MAE ratio M2ob/M1
      at 24 h with the same block bootstrap. M2w (adds exp(d (head - trailing median head)), d from the same training
      hours) reported, not predicted.
  A6  Events of 6t: medians of u, Hs_ob, wind, head, total_power and |sub_heading - desired_heading| over 7 days
      either side of 2015-08-07T15 (the step); the speed ratio the A4 model (b, d from S2) predicts from those
      sea-state and wind medians, against the observed ratio. Same for the June event: 6-12 June, 13-19 June,
      21-27 June. Descriptive: total_power by local hour (UTC-10) to say what the unlabelled field tracks.
Predictions:
  P1  On S1, b_ob > b_buoy, and b_ob lies in 0.25 to 0.70 (still well sub-linear; >= 0.8 would rehabilitate the
      quasi-steady shape 6p refuted).
  P2  On S1 the within-month correlation of log Hs_ob and log Hs_buoy lies in 0.3 to 0.8 (the buoy is a noisy proxy).
  P3  On S2 the 95% interval of c contains 0 (6s's "no period effect at a fixed state" survives on-board periods).
  P4  d < 0 with its 95% interval below 0, and d <= -0.01 (a 5 m/s headwind costs at least 5% of speed).
  P5  At 24 h, M2ob/M1 >= 0.95 (an on-board oracle Hs still adds under 5% skill once recent speed is known).
  P6  Across the August step, the on-board Hs median changes by under 15% and the wind median by under 30%, and the
      A4 model's predicted ratio explains under a third of the observed log step (not the sea, not the wind).
  P7  total_power's median over the 7 days after the step differs from the 7 days before by more than 5% (a
      power-budget or mode change coincides with the step).

Run: python3 experiments/run_waveglider_onboard.py > experiments/results_waveglider_onboard.txt   (seconds, stdlib)"""
import csv
import math
import random
import statistics as st
from datetime import datetime, timedelta

from run_waveglider_drift import ols

D = "experiments/data/"
SPLIT = datetime(2015, 8, 1)
START = datetime(2015, 6, 1)
STEP = datetime(2015, 8, 7, 15)
SEED, NBOOT = 1, 2000


def num(s):
    return float(s) if s not in ("", None) else None


def load():
    buoy = {r["hour"]: r for r in csv.DictReader(open(D + "waveglider_hourly.csv"))}
    rows = []
    for r in csv.DictReader(open(D + "waveglider_onboard_hourly.csv")):
        u, hs = float(r["speed"]), num(r["hs"])
        b = buoy.get(r["hour"])
        rows.append({"t": datetime.strptime(r["hour"], "%Y-%m-%dT%H"), "u": u, "hs": hs,
                     "tavg": num(r["tavg"]), "tdom": num(r["tdom"]), "wind": num(r["wind"]),
                     "wfrom": num(r["wind_from"]), "head_deg": num(r["heading"]), "desired": num(r["desired"]),
                     "power": num(r["power"]), "hs_b": float(b["wvht"]) if b else None,
                     "km": float(b["dist_km"]) if b else None})
    for r in rows:
        if r["wind"] is not None and r["wfrom"] is not None and r["head_deg"] is not None:
            a = math.radians(r["wfrom"] - r["head_deg"])
            r["head"], r["cross"] = r["wind"] * math.cos(a), abs(r["wind"] * math.sin(a))
        else:
            r["head"] = r["cross"] = None
    return rows


def usable(rows):
    return [r for r in rows if r["u"] >= 0.1 and r["hs"] is not None and 0.2 <= r["hs"] <= 10]


def s1(rows):
    return [r for r in usable(rows) if r["t"] < SPLIT and r["km"] is not None and r["km"] <= 300 and r["hs_b"]]


def s2(rows):
    return [r for r in usable(rows) if r["t"] >= START]


def fit(rows, cols):
    """log u on month dummies + the named regressors (callables of a row); returns the regressor coefficients."""
    months = sorted({r["t"].month for r in rows})
    X = [[1.0 if r["t"].month == m else 0.0 for m in months] + [f(r) for f in cols] for r in rows]
    return ols(X, [math.log(r["u"]) for r in rows])[len(months):]


LOG_OB = lambda r: math.log(r["hs"])  # noqa: E731
LOG_B = lambda r: math.log(r["hs_b"])  # noqa: E731


def boot(rows, stat, n=NBOOT, seed=SEED):
    days = sorted({r["t"].date() for r in rows})
    by = {d: [r for r in rows if r["t"].date() == d] for d in days}
    rng = random.Random(seed)
    out = sorted(stat([r for d in rng.choices(days, k=len(days)) for r in by[d]]) for _ in range(n))
    return out[int(0.025 * n)], out[int(0.975 * n) - 1]


def within(rows, f):
    by = {}
    for r in rows:
        by.setdefault(r["t"].month, []).append(f(r))
    mu = {m: st.fmean(v) for m, v in by.items()}
    return [f(r) - mu[r["t"].month] for r in rows]


def reliability(rows):
    x, y = within(rows, LOG_OB), within(rows, LOG_B)
    cxy = sum(a * b for a, b in zip(x, y))
    corr = cxy / math.sqrt(sum(a * a for a in x) * sum(b * b for b in y))
    return corr, cxy / sum(b * b for b in y)


def forecast(rows, b, d, horizons=(6, 24, 72)):
    by_t = {r["t"]: r for r in rows}
    res = {}
    for h in horizons:
        e1, e2, e3, ts = [], [], [], []
        for r in rows:
            if r["t"] < SPLIT:
                continue
            t0 = r["t"] - timedelta(hours=h)
            w = [by_t[t0 - timedelta(hours=k)] for k in range(1, 25) if (t0 - timedelta(hours=k)) in by_t]
            if len(w) < 6:
                continue
            u1 = st.median(x["u"] for x in w)
            u2 = u1 * (r["hs"] / st.median(x["hs"] for x in w)) ** b
            hw = [x["head"] for x in w if x["head"] is not None]
            u3 = u2 * math.exp(d * (r["head"] - st.median(hw))) if hw and r["head"] is not None else u2
            e1.append(abs(u1 - r["u"]))
            e2.append(abs(u2 - r["u"]))
            e3.append(abs(u3 - r["u"]))
            ts.append(r["t"])
        res[h] = (e1, e2, e3, ts)
    return res


def ratio_boot(e_num, e_den, ts, n=NBOOT, seed=SEED):
    days = sorted({t.date() for t in ts})
    idx = {dd: [i for i, t in enumerate(ts) if t.date() == dd] for dd in days}
    rng = random.Random(seed)
    q = []
    for _ in range(n):
        ii = [i for dd in rng.choices(days, k=len(days)) for i in idx[dd]]
        q.append(sum(e_num[i] for i in ii) / sum(e_den[i] for i in ii))
    q.sort()
    return q[int(0.025 * n)], q[int(0.975 * n) - 1]


def angdiff(a, b):
    return abs((a - b + 180) % 360 - 180)


def window(rows, a, b):
    w = [r for r in rows if a <= r["t"] < b]

    def med(k):
        v = [r[k] for r in w if r[k] is not None]
        return st.median(v) if v else float("nan")
    dev = [angdiff(r["head_deg"], r["desired"]) for r in w if r["head_deg"] is not None and r["desired"] is not None]
    return {"n": len(w), "u": med("u"), "hs": med("hs"), "wind": med("wind"), "head": med("head"),
            "power": med("power"), "hdev": st.median(dev) if dev else float("nan")}


def explained(before, after, b, d):
    """Speed ratio after/before that the A4 model predicts from the windows' sea-state and headwind medians."""
    return (after["hs"] / before["hs"]) ** b * math.exp(d * (after["head"] - before["head"]))


def main():
    rows = load()
    print("Milestone 6u: the Wave Glider's sea-state response with its own on-board waves and wind")
    print(f"{len(rows)} hours; {len(usable(rows))} usable (speed >= 0.1 m/s, MOSE Hs 0.2 to 10 m)")
    S1, S2 = s1(rows), s2(rows)

    print("\nA1  within-month exponent of speed on Hs (month intercepts)")
    bb = fit(S1, [LOG_B])[0]
    bo = fit(S1, [LOG_OB])[0]
    lo, hi = boot(S1, lambda rr: fit(rr, [LOG_OB])[0])
    dlo, dhi = boot(S1, lambda rr: fit(rr, [LOG_OB])[0] - fit(rr, [LOG_B])[0])
    print(f"  S1 ({len(S1)} hours, before 2015-08-01, buoy <= 300 km): b_buoy {bb:.3f}, b_ob {bo:.3f} "
          f"(95% {lo:.3f} to {hi:.3f}); b_ob - b_buoy {bo - bb:+.3f} (95% {dlo:+.3f} to {dhi:+.3f})")
    b2 = fit(S2, [LOG_OB])[0]
    lo2, hi2 = boot(S2, lambda rr: fit(rr, [LOG_OB])[0])
    print(f"  S2 ({len(S2)} hours from 2015-06-01, any distance): b_ob {b2:.3f} (95% {lo2:.3f} to {hi2:.3f})")
    for m in sorted({r["t"].month for r in S2}):
        mm = [r for r in S2 if r["t"].month == m]
        X = [[1.0, math.log(r["hs"])] for r in mm]
        print(f"    month {m:2d}: {len(mm):4d} hours, median u {st.median(r['u'] for r in mm):.3f} m/s, "
              f"median Hs_ob {st.median(r['hs'] for r in mm):.2f} m, b_ob {ols(X, [math.log(r['u']) for r in mm])[1]:+.3f}")
    print(f"  P1 (S1: b_ob > b_buoy and 0.25 <= b_ob <= 0.70): {'held' if bo > bb and 0.25 <= bo <= 0.70 else 'refuted'}")

    print("\nA2  how good a proxy the buoy is (S1, month-demeaned logs)")
    corr, lam = reliability(S1)
    hb = [r["hs_b"] / r["hs"] for r in S1]
    print(f"  within-month corr(log Hs_ob, log Hs_buoy) {corr:.3f}; lambda {lam:.3f}; lambda x b_ob {lam * bo:.3f} "
          f"against b_buoy {bb:.3f}; median Hs_buoy / Hs_ob {st.median(hb):.3f}")
    print(f"  P2 (0.3 <= corr <= 0.8): {'held' if 0.3 <= corr <= 0.8 else 'refuted'}")

    print("\nA3  wave period at a fixed vehicle state (S2)")
    S3 = [r for r in S2 if r["tavg"] and r["tavg"] > 0]
    bt, c = fit(S3, [LOG_OB, lambda r: math.log(r["tavg"])])
    clo, chi = boot(S3, lambda rr: fit(rr, [LOG_OB, lambda r: math.log(r["tavg"])])[1])
    print(f"  {len(S3)} hours: b {bt:.3f}, c (T_avg) {c:+.3f} (95% {clo:+.3f} to {chi:+.3f})")
    S3d = [r for r in S2 if r["tdom"] and r["tdom"] > 0]
    btd, cd = fit(S3d, [LOG_OB, lambda r: math.log(r["tdom"])])
    print(f"  {len(S3d)} hours: b {btd:.3f}, c (T_dom) {cd:+.3f} (descriptive)")
    print(f"  P3 (95% interval of c contains 0): {'held' if clo <= 0 <= chi else 'refuted'}")

    print("\nA4  wind at a fixed vehicle state (S2 hours with on-board wind)")
    S4 = [r for r in S2 if r["head"] is not None]
    cols = [LOG_OB, lambda r: r["head"], lambda r: r["cross"]]
    bw, d, e = fit(S4, cols)
    lod, hid = boot(S4, lambda rr: fit(rr, cols)[1])
    print(f"  {len(S4)} hours: b {bw:.3f}, d (headwind, per m/s) {d:+.4f} (95% {lod:+.4f} to {hid:+.4f}), "
          f"e (|crosswind|) {e:+.4f}; median wind {st.median(r['wind'] for r in S4):.2f} m/s")
    print(f"  a 5 m/s headwind changes speed by {100 * (math.exp(5 * d) - 1):+.1f}%")
    print(f"  P4 (d < 0, 95% below 0, d <= -0.01): {'held' if d <= -0.01 and hid < 0 else 'refuted'}")

    print("\nA5  forecast: does an on-board oracle Hs (and headwind) add skill to 24 h persistence?")
    tr = [r for r in S2 if r["t"] < SPLIT]
    btr = fit(tr, [LOG_OB])[0]
    trw = [r for r in tr if r["head"] is not None]
    dtr = fit(trw, cols)[1]
    print(f"  training (2015-06-01 to 2015-07-31): b {btr:.3f} ({len(tr)} hours), d {dtr:+.4f} ({len(trw)} hours)")
    fc = forecast(usable(rows), btr, dtr)
    print("   h     n   MAE M1  M2ob   M2w   | M2ob/M1  M2w/M1")
    for h, (e1, e2, e3, ts) in fc.items():
        m1, m2, m3 = st.fmean(e1), st.fmean(e2), st.fmean(e3)
        print(f"  {h:3d} {len(e1):5d}  {m1:.4f} {m2:.4f} {m3:.4f} | {m2 / m1:.3f}    {m3 / m1:.3f}")
    e1, e2, e3, ts = fc[24]
    qlo, qhi = ratio_boot(e2, e1, ts)
    wlo, whi = ratio_boot(e3, e1, ts)
    r24 = st.fmean(e2) / st.fmean(e1)
    print(f"  24 h block bootstrap ({len({t.date() for t in ts})} days): M2ob/M1 95% {qlo:.3f} to {qhi:.3f}; "
          f"M2w/M1 95% {wlo:.3f} to {whi:.3f}")
    print(f"  P5 (M2ob/M1 >= 0.95 at 24 h): {'held' if r24 >= 0.95 else 'refuted'}")

    print("\nA6  the events of 6t, with on-board sea state, wind, power and steering")
    allr = rows
    wk = timedelta(days=7)
    bef, aft = window(allr, STEP - wk, STEP), window(allr, STEP, STEP + wk)
    hdr = "  window                     n    u      Hs_ob  wind   head   power     |hdg-desired|"
    print(hdr)
    for lab, w in (("7 days before 08-07 15h", bef), ("7 days after", aft)):
        print(f"  {lab:24s} {w['n']:4d}  {w['u']:.3f}  {w['hs']:.2f}   {w['wind']:.2f}   {w['head']:+.2f}  "
              f"{w['power']:9.0f} {w['hdev']:.1f}")
    obs = aft["u"] / bef["u"]
    pred = explained(bef, aft, bw, d)
    share = math.log(pred) / math.log(obs)
    dhs, dwind, dpow = aft["hs"] / bef["hs"] - 1, aft["wind"] / bef["wind"] - 1, aft["power"] / bef["power"] - 1
    print(f"  observed speed ratio {obs:.3f}; A4-model ratio from Hs and headwind {pred:.3f} "
          f"(share of the log step {share:+.2f}); Hs {100 * dhs:+.1f}%, wind {100 * dwind:+.1f}%, power {100 * dpow:+.1f}%")
    print(f"  P6 (|dHs| < 15%, |dwind| < 30%, share < 1/3): "
          f"{'held' if abs(dhs) < 0.15 and abs(dwind) < 0.30 and share < 1 / 3 else 'refuted'}")
    print(f"  P7 (|dpower| > 5%): {'held' if abs(dpow) > 0.05 else 'refuted'}")
    print("  hour by hour, 6 to 8 August (UTC): hour  u  Hs_ob  wind  head  power  sub_heading  desired")
    for r in rows:
        if datetime(2015, 8, 7, 6) <= r["t"] < datetime(2015, 8, 8, 0):
            f = lambda v, p: "  -  " if v is None else f"{v:.{p}f}"  # noqa: E731
            print(f"    {r['t']:%m-%d %H}  {r['u']:.3f}  {f(r['hs'], 2)}  {f(r['wind'], 1)}  {f(r['head'], 1)}  "
                  f"{f(r['power'], 0)}  {f(r['head_deg'], 0)}  {f(r['desired'], 0)}")
    jun = [("6-12 June", datetime(2015, 6, 6), datetime(2015, 6, 13)),
           ("13-19 June", datetime(2015, 6, 13), datetime(2015, 6, 20)),
           ("21-27 June", datetime(2015, 6, 21), datetime(2015, 6, 28))]
    print("  June event (6t: dropped 12-13 June, recovered 20 June)")
    ws = []
    for lab, a, b in jun:
        w = window(allr, a, b)
        ws.append(w)
        print(f"  {lab:24s} {w['n']:4d}  {w['u']:.3f}  {w['hs']:.2f}   {w['wind']:.2f}   {w['head']:+.2f}  "
              f"{w['power']:9.0f} {w['hdev']:.1f}")
    for (la, w0), (lb, w1) in (((jun[0][0], ws[0]), (jun[1][0], ws[1])), ((jun[1][0], ws[1]), (jun[2][0], ws[2]))):
        print(f"  {la} -> {lb}: observed {w1['u'] / w0['u']:.3f}, A4-model {explained(w0, w1, bw, d):.3f}")
    print("  total_power by local hour (UTC-10), median over the mission (descriptive: what does the field track?)")
    byh = {}
    for r in rows:
        if r["power"] is not None and r["t"] >= START:
            byh.setdefault((r["t"].hour - 10) % 24, []).append(r["power"])
    print("   " + "  ".join(f"{h:02d}:{st.median(byh[h]) / 1000:.0f}k" for h in sorted(byh)))


if __name__ == "__main__":
    main()
