"""Milestone 6w: with ERA5 reanalysis waves at the vehicle's position in place of 6u's on-board oracle, does a model
sea state keep the Wave Glider's speed law U ~ (Hs/T)^a and its forecast skill?

Why: 6u's H3 showed an *oracle* on-board Hs and period (the observed target-hour values) cut the persistence error of
a speed forecast to 0.95 / 0.77 / 0.67 at 6 / 24 / 72 h, and 6v planned km/day from U = s (Hs/T)^0.53 at buoys. A
planner has neither the future on-board record nor, away from a buoy, any measurement: only a model. ERA5 at the
vehicle's hourly position (experiments/fetch_era5_waveglider.py) is the best a wave model can do with the analysis
in hand (a reanalysis, so it carries model error but no forecast-lead error): it bounds from above what an archived
WAVEWATCH III or ECMWF forecast would give, and says how much of the oracle's skill survives the model.

Rules (fixed before the first run; this docstring is committed before any output is read):
  Hours: 6u's S2 (speed >= 0.1 m/s, on-board MOSE Hs in [0.2, 10] m, from 2015-06-01) with T_avg > 0 and ERA5 present.
  q_ob = Hs_ob / T_avg (MOSE); q_e = Hs_e / Tm_e (ERA5 swh / mwp). Month intercepts carry the vehicle state, as 6q.
  A1  Calibration: median Hs_e / Hs_ob, Tm_e / T_avg, q_e / q_ob. Reliability: within-month (month-demeaned)
      correlation of log q_e and log q_ob, and lambda = cov_w(log q_ob, log q_e) / var_w(log q_e).
  A2  Exponents on the same hours: log u ~ month + a log q, for q_ob (a_ob) and q_e (a_e); moving-block bootstrap,
      1-day blocks, 2,000 resamples, seed 1, for a_e and a_ob - a_e. ERA5 peak period (pp1d) in place of mwp reported.
  A3  Forecast (6u A5/H3 rules): targets from 2015-08-01, trailing 24 h window (>= 6 hours) ending h hours before,
      h in 6, 24, 72. M1 = trailing median speed. Mq = M1 x (q target / trailing median q)^a, a fitted on the hours
      before 2015-08-01, for q_ob (Mob, the oracle) and q_e (Me, the reanalysis). MAE ratios to M1 with the same block
      bootstrap; the share of the oracle's gain Me recovers, (1 - Me/M1) / (1 - Mob/M1).
  A4  Model-only plan (no recent speed, 6v's rule): km/day = 86.4 x s_m x mean q^a over each month, s_m = median of
      u / q^a over the month's hours, a and s_m from the same source; compare the ERA5 plan with the on-board plan
      and with the observed 86.4 x mean u per month (descriptive).
Predictions:
  P1  Within-month corr(log q_e, log q_ob) lies in 0.5 to 0.85 (collocated, so far better than the buoy's 0.20, but
      a 0.5 degree model misses local sea).
  P2  a_e < a_ob and a_e lies in 0.25 to 0.50 (a noisier regressor attenuates the exponent).
  P3  At 24 h, Me/M1 <= 0.90 and its 95% upper bound < 1 (a reanalysis sea state still adds at least 10% skill).
  P4  Me recovers 40% to 90% of the oracle's 24 h gain.
  P5  Median Hs_e / Hs_ob lies in 0.85 to 1.15, and median Tm_e / T_avg > 1.1 (ERA5's mwp is an m-1 energy period,
      longer than a zero-crossing-type average period).
  P6  At 72 h, Me/M1 <= 0.85.

Run: python3 experiments/run_waveglider_era5.py > experiments/results_waveglider_era5.txt   (seconds, stdlib)"""
import csv
import math
import statistics as st
from datetime import datetime, timedelta

import run_waveglider_onboard as o

D = "experiments/data/"


def load():
    era = {datetime.strptime(r["hour"], "%Y-%m-%dT%H"): r for r in csv.DictReader(open(D + "era5_waveglider_hourly.csv"))}
    rows = []
    for r in o.load():
        e = era.get(r["t"])
        if e is None:
            continue
        r = dict(r, hs_e=float(e["hs"]), tm_e=float(e["tm"]), tp_e=float(e["tp"]))
        rows.append(r)
    return rows


def ok(r):
    return r["tavg"] and r["tavg"] > 0 and r["hs_e"] > 0 and r["tm_e"] > 0


Q_OB = lambda r: math.log(r["hs"] / r["tavg"])  # noqa: E731
Q_E = lambda r: math.log(r["hs_e"] / r["tm_e"])  # noqa: E731
Q_EP = lambda r: math.log(r["hs_e"] / r["tp_e"])  # noqa: E731


def hours(rows):
    return [r for r in o.s2(rows) if ok(r)]


def wcorr(rows, f, g):
    x, y = o.within(rows, f), o.within(rows, g)
    cxy = sum(a * b for a, b in zip(x, y))
    return cxy / math.sqrt(sum(a * a for a in x) * sum(b * b for b in y)), cxy / sum(b * b for b in y)


def forecast(rows, a_ob, a_e, horizons=(6, 24, 72)):
    """MAE lists for M1 (persistence), Mob (oracle on-board q) and Me (ERA5 q), 6u's trailing-window rules."""
    by_t = {r["t"]: r for r in rows}
    res = {}
    for h in horizons:
        e1, eo, ee, ts = [], [], [], []
        for r in rows:
            if r["t"] < o.SPLIT:
                continue
            t0 = r["t"] - timedelta(hours=h)
            w = [by_t[t0 - timedelta(hours=k)] for k in range(1, 25) if (t0 - timedelta(hours=k)) in by_t]
            if len(w) < 6:
                continue
            u1 = st.median(x["u"] for x in w)
            uo = u1 * math.exp(a_ob * (Q_OB(r) - st.median(Q_OB(x) for x in w)))
            ue = u1 * math.exp(a_e * (Q_E(r) - st.median(Q_E(x) for x in w)))
            e1.append(abs(u1 - r["u"]))
            eo.append(abs(uo - r["u"]))
            ee.append(abs(ue - r["u"]))
            ts.append(r["t"])
        res[h] = (e1, eo, ee, ts)
    return res


def plan(rows, q, a):
    """6v's monthly plan: km/day = 86.4 s_m mean(exp(a q)), s_m = median u / exp(a q) over the month."""
    out = {}
    for m in sorted({r["t"].month for r in rows}):
        mm = [r for r in rows if r["t"].month == m]
        s = st.median(r["u"] / math.exp(a * q(r)) for r in mm)
        out[m] = 86.4 * s * st.fmean(math.exp(a * q(r)) for r in mm)
    return out


def main():
    rows = load()
    S = hours(rows)
    print("Milestone 6w: ERA5 reanalysis waves at the Wave Glider's position in place of the on-board oracle")
    print(f"{len(rows)} hours with ERA5; {len(S)} analysis hours (6u S2 with T_avg and ERA5)")

    print("\nA1  calibration and reliability of the reanalysis against the on-board MOSE")
    rh = st.median(r["hs_e"] / r["hs"] for r in S)
    rt = st.median(r["tm_e"] / r["tavg"] for r in S)
    rq = st.median(r["hs_e"] / r["tm_e"] / (r["hs"] / r["tavg"]) for r in S)
    print(f"  median Hs_e/Hs_ob {rh:.3f}, Tm_e/T_avg {rt:.3f}, Tp_e/T_avg "
          f"{st.median(r['tp_e'] / r['tavg'] for r in S):.3f}, q_e/q_ob {rq:.3f}")
    cq, lam = wcorr(S, Q_OB, Q_E)
    ch, _ = wcorr(S, lambda r: math.log(r["hs"]), lambda r: math.log(r["hs_e"]))
    ct, _ = wcorr(S, lambda r: math.log(r["tavg"]), lambda r: math.log(r["tm_e"]))
    print(f"  within-month corr: log q {cq:.3f} (lambda {lam:.3f}); log Hs {ch:.3f}; log T {ct:.3f}")
    print(f"  P1 (0.5 <= corr log q <= 0.85): {'held' if 0.5 <= cq <= 0.85 else 'refuted'}")
    print(f"  P5 (0.85 <= Hs_e/Hs_ob <= 1.15 and Tm_e/T_avg > 1.1): "
          f"{'held' if 0.85 <= rh <= 1.15 and rt > 1.1 else 'refuted'}")

    print("\nA2  exponent of speed on heave velocity, same hours")
    a_ob = o.fit(S, [Q_OB])[0]
    a_e = o.fit(S, [Q_E])[0]
    a_ep = o.fit(S, [Q_EP])[0]
    lo, hi = o.boot(S, lambda rr: o.fit(rr, [Q_E])[0])
    dlo, dhi = o.boot(S, lambda rr: o.fit(rr, [Q_OB])[0] - o.fit(rr, [Q_E])[0])
    print(f"  a_ob {a_ob:.3f}; a_e (mwp) {a_e:.3f} (95% {lo:.3f} to {hi:.3f}); a_ob - a_e {a_ob - a_e:+.3f} "
          f"(95% {dlo:+.3f} to {dhi:+.3f}); a_e with pp1d {a_ep:.3f}")
    print(f"  lambda x a_ob {lam * a_ob:.3f} (errors-in-variables expectation for a_e)")
    print(f"  P2 (a_e < a_ob, 0.25 <= a_e <= 0.50): {'held' if a_e < a_ob and 0.25 <= a_e <= 0.50 else 'refuted'}")

    print("\nA3  forecast: persistence, + oracle on-board q, + ERA5 q (exponents fitted before 2015-08-01)")
    tr = [r for r in S if r["t"] < o.SPLIT]
    t_ob, t_e = o.fit(tr, [Q_OB])[0], o.fit(tr, [Q_E])[0]
    print(f"  training {len(tr)} hours: a_ob {t_ob:.3f}, a_e {t_e:.3f}")
    fc = forecast(S, t_ob, t_e)
    print("   h     n   MAE M1  Mob    Me     | Mob/M1 (95%)            Me/M1 (95%)             share of oracle gain")
    out = {}
    for h, (e1, eo, ee, ts) in fc.items():
        m1, mo, me = st.fmean(e1), st.fmean(eo), st.fmean(ee)
        olo, ohi = o.ratio_boot(eo, e1, ts)
        elo, ehi = o.ratio_boot(ee, e1, ts)
        share = (1 - me / m1) / (1 - mo / m1) if mo < m1 else float("nan")
        out[h] = (me / m1, ehi, share)
        print(f"  {h:3d} {len(e1):5d}  {m1:.4f} {mo:.4f} {me:.4f} | {mo / m1:.3f} ({olo:.3f} to {ohi:.3f})  "
              f"{me / m1:.3f} ({elo:.3f} to {ehi:.3f})  {share:+.2f}")
    r24, hi24, sh24 = out[24]
    print(f"  P3 (Me/M1 <= 0.90 at 24 h, 95% upper < 1): {'held' if r24 <= 0.90 and hi24 < 1 else 'refuted'}")
    print(f"  P4 (Me recovers 40% to 90% of the oracle's 24 h gain): {'held' if 0.4 <= sh24 <= 0.9 else 'refuted'}")
    print(f"  P6 (Me/M1 <= 0.85 at 72 h): {'held' if out[72][0] <= 0.85 else 'refuted'}")

    print("\nA4  model-only monthly plan (6v rule; descriptive), km/day")
    p_ob, p_e = plan(S, Q_OB, a_ob), plan(S, Q_E, a_e)
    print("  month  hours  observed  on-board plan  ERA5 plan")
    for m in p_ob:
        mm = [r for r in S if r["t"].month == m]
        print(f"  {m:5d}  {len(mm):5d}  {86.4 * st.fmean(r['u'] for r in mm):8.1f}  {p_ob[m]:13.1f}  {p_e[m]:9.1f}")


if __name__ == "__main__":
    main()
