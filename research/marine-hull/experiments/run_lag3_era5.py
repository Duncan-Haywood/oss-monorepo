"""Milestone 6zzm: is the lag-3 learning year (2007 when scoring L, 2012 when scoring E), which wipes out every learned
seasonal correction at the nine high-amplitude points, real weather or an artefact of the NASA POWER record?

Why: 6zzj and 6zzk's "Next" asked to diagnose lag 3 "against ERA5 or buoy cloud records". At the nine high-amplitude
points every rule learned on lag 3 wins almost nothing (6zzj, 168 pooled cells: LC_3 1, HR_3 9; no correction 25;
lag 2 153), while over all 30 points lag 3 is a middling year (LC_3 132). Milestone 6zzl (PR #16349, a sibling run)
takes the same failure apart by month, season, level and shape inside the NASA POWER record. This milestone asks the
question that decides what the paper may say about it: if a second, independent estimate of surface sunlight shows
the same lag-3 departures, the failure is a property of the weather (an unrepresentative learning year, which a
designer has to guard against); if not, it is a property of one satellite product (which a designer fixes by
changing data source). Every number of the programme's seasonal-correction line so far comes from NASA POWER alone.

Design (fixed here, before any comparison below was computed; the ERA5 series were fetched, not yet analysed):
  Sources. NASA POWER ALLSKY_SFC_SW_DWN (satellite retrieval; the programme's series, 2005 to 2024) and ERA5
  shortwave_radiation_sum (reanalysis, Open-Meteo, experiments/fetch_era5_sun.py) at the same nine coordinates.
  Anomaly a_S(p, y, m) = month-m sum in year y / mean month-m sum over 2015 to 2024 - 1, per source S. Irradiance
  only: the harvest model is a fixed function of daily irradiance, so this is the data question without the boat.
  Lag error. For scored half h (E 2005 to 2009, L 2010 to 2014) and lag g (learning year as 6zzi's years_of), the
  learned ratio 1 + a(y_g) against the scored half's mean 1 + a: e_S(g, p, h, m) = a(y_g, m) - mean_h a(., m)
  (unclamped). Energy weights w_m: the source's own 2015 to 2024 share of annual energy in month m at that point.
  Summaries per source and lag: energy-weighted mean |e| over 9 points x 2 halves.
Predictions (priors in brackets):
  M1 Pearson r between NASA and ERA5 month anomalies over 9 points x 12 months x {2007, 2012} is at least 0.6. [70%]
  M2 Pearson r between NASA's and ERA5's lag-3 errors over 9 points x 2 halves x 12 months is at least 0.5. [65%]
  M3 ERA5's energy-weighted mean |e| is largest at lag 3 of the five lags (ERA5 would have flagged the same year). [55%]
  M4 The anomaly r of 2007 and 2012 (mean of the two) is within 0.1 of the mean r of the other eight years, or above
     it: the lag-3 years are not years in which the two sources disagree unusually. [70%]
  M5 Among lag-3 (point, half, month) cases with NASA |e| >= 0.05 and month weight w_m >= 1/24, ERA5's error has the
     same sign in at least 75%. [65%]
Descriptive: per year r and mean anomalies; per lag and source the weighted mean |e| and mean e; per point the
lag-3 error correlation; per month the lag-3 errors pooled over points and halves; the ERA5 / NASA annual level.

Run (from research/marine-hull): python3 experiments/run_lag3_era5.py > experiments/results_lag3_era5.txt
(stdlib, deterministic, a few seconds; needs experiments/data/era5_sun_hiamp_2005_2024.json)"""
import datetime
import json
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_subset_years as su  # noqa: E402

HI = ("P-60", "P-30", "P+50", "P+60", "A-50", "A+50", "A+60", "North-Sea", "Gulf-of-Alaska")  # 6zza
HALVES = fy.HALVES
CLIM = tuple(range(2015, 2025))
YEARS = tuple(range(2005, 2015))
LAGS = (1, 2, 3, 4, 5)
LAG3_YEARS = (2007, 2012)
MONTHS = tuple(range(12))
MNAME = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
HI168_LC = (77, 153, 1, 124, 50)  # 6zzi / 6zzl: LC learned on lag 1..5, high-amplitude 168 cells
ERA5_FILE = os.path.join(HERE, "data", "era5_sun_hiamp_2005_2024.json")


def nasa_daily(p):
    s = rc.series(p)
    return {d: s[d.strftime("%Y%m%d")] for yr in range(2005, 2025) for d in rc.dates(yr)}


def era5_daily(p, data):
    d0 = datetime.date(2005, 1, 1)
    return {d0 + datetime.timedelta(days=i): v for i, v in enumerate(data[p]["values"])}


def month_sums(daily, years):
    s = [0.0] * 12
    for yr in years:
        for d in rc.dates(yr):
            s[d.month - 1] += daily[d]
    return s


def profile(daily):
    """({year: 12 anomalies} for 2005 to 2014, 12 energy weights, mean annual sum over 2015 to 2024)."""
    clim = [x / len(CLIM) for x in month_sums(daily, CLIM)]
    tot = sum(clim)
    an = {yr: [s / c - 1.0 for s, c in zip(month_sums(daily, (yr,)), clim)] for yr in YEARS}
    return an, [c / tot for c in clim], tot


def lag_error(an, hn, g):
    y = su.years_of(hn, (g,))[0]
    return [an[y][m] - st.fmean(an[yr][m] for yr in HALVES[hn]) for m in MONTHS]


def pearson(x, y):
    mx, my = st.fmean(x), st.fmean(y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    return sxy / (sxx * syy) ** 0.5


def load():
    fy.prepare()
    era = json.load(open(ERA5_FILE))
    return {"NASA": {p: profile(nasa_daily(p)) for p in HI}, "ERA5": {p: profile(era5_daily(p, era)) for p in HI}}


def main():
    P = load()
    print("Milestone 6zzm: the lag-3 learning year at the nine high-amplitude points, NASA POWER against ERA5")
    print(f"points: {', '.join(HI)}; anomalies against each source's own 2015-2024 month means")
    print("lag g: scoring L learns from 2010 - g, scoring E from 2009 + g; lag 3 = 2007 (for L) and 2012 (for E)")

    print("\nAnnual level, ERA5 / NASA (2015-2024 mean annual sum, MJ/m2 against kWh/m2 x 3.6)")
    for p in HI:
        print(f"  {p:15s} {P['ERA5'][p][2] / (P['NASA'][p][2] * 3.6):.3f}")

    print("\nMonth anomalies, NASA against ERA5, 9 points x 12 months per year")
    print("  year |   r    | mean a NASA | mean a ERA5 | energy-weighted mean |a| NASA / ERA5")
    rs = {}
    for yr in YEARS:
        x = [P["NASA"][p][0][yr][m] for p in HI for m in MONTHS]
        y = [P["ERA5"][p][0][yr][m] for p in HI for m in MONTHS]
        rs[yr] = pearson(x, y)
        wn = st.fmean(sum(w * abs(a) for w, a in zip(P["NASA"][p][1], P["NASA"][p][0][yr])) for p in HI)
        we = st.fmean(sum(w * abs(a) for w, a in zip(P["ERA5"][p][1], P["ERA5"][p][0][yr])) for p in HI)
        tag = "  <- lag 3" if yr in LAG3_YEARS else ""
        print(f"  {yr} | {rs[yr]:+.3f} | {st.fmean(x):+.4f}     | {st.fmean(y):+.4f}     | {wn:.4f} / {we:.4f}{tag}")
    x = [P["NASA"][p][0][yr][m] for yr in LAG3_YEARS for p in HI for m in MONTHS]
    y = [P["ERA5"][p][0][yr][m] for yr in LAG3_YEARS for p in HI for m in MONTHS]
    r_l3 = pearson(x, y)
    r_l3_mean = st.fmean(rs[yr] for yr in LAG3_YEARS)
    r_other = st.fmean(rs[yr] for yr in YEARS if yr not in LAG3_YEARS)
    print(f"  2007 and 2012 pooled: r {r_l3:+.3f}; mean of their two r {r_l3_mean:+.3f}; other eight years mean r "
          f"{r_other:+.3f}")

    print("\nLag errors e = a(learning year) - scored half's mean a, energy-weighted mean |e| and mean e over "
          "9 points x 2 halves")
    print("  lag | NASA w|e| | ERA5 w|e| | NASA w e | ERA5 w e | r(NASA e, ERA5 e)")
    wabs = {"NASA": {}, "ERA5": {}}
    r_lag = {}
    for g in LAGS:
        row, xs, ys = {}, [], []
        for S in ("NASA", "ERA5"):
            a_, s_ = [], []
            for p in HI:
                an, w, _ = P[S][p]
                for hn in HALVES:
                    e = lag_error(an, hn, g)
                    a_.append(sum(wi * abs(v) for wi, v in zip(w, e)))
                    s_.append(sum(wi * v for wi, v in zip(w, e)))
                    (xs if S == "NASA" else ys).extend(e)
            wabs[S][g] = st.fmean(a_)
            row[S] = st.fmean(s_)
        r_lag[g] = pearson(xs, ys)
        print(f"  {g:3d} | {wabs['NASA'][g]:.4f}    | {wabs['ERA5'][g]:.4f}    | {row['NASA']:+.4f}  | "
              f"{row['ERA5']:+.4f}  | {r_lag[g]:+.3f}")

    print("\nLag-3 errors per point (12 months x 2 halves): r(NASA, ERA5) and energy-weighted |e| NASA / ERA5")
    for p in HI:
        xs, ys = [], []
        for hn in HALVES:
            xs += lag_error(P["NASA"][p][0], hn, 3)
            ys += lag_error(P["ERA5"][p][0], hn, 3)
        wn = st.fmean(sum(w * abs(v) for w, v in zip(P["NASA"][p][1], lag_error(P["NASA"][p][0], hn, 3)))
                      for hn in HALVES)
        we = st.fmean(sum(w * abs(v) for w, v in zip(P["ERA5"][p][1], lag_error(P["ERA5"][p][0], hn, 3)))
                      for hn in HALVES)
        print(f"  {p:15s} r {pearson(xs, ys):+.3f}   {wn:.3f} / {we:.3f}")

    print("\nLag-3 errors by month: mean e NASA / ERA5 over 9 points x 2 halves, and the mean weight w_m (NASA)")
    for m in MONTHS:
        en = st.fmean(lag_error(P["NASA"][p][0], hn, 3)[m] for p in HI for hn in HALVES)
        ee = st.fmean(lag_error(P["ERA5"][p][0], hn, 3)[m] for p in HI for hn in HALVES)
        wm = st.fmean(P["NASA"][p][1][m] for p in HI)
        print(f"  {MNAME[m]} {en:+.4f} / {ee:+.4f}   w {wm:.3f}")

    print("\nLag-3 errors by point and half, NASA / ERA5, months Jan..Dec (w >= 1/24 marked *)")
    agree = n = 0
    for p in HI:
        for hn in HALVES:
            en, ee = lag_error(P["NASA"][p][0], hn, 3), lag_error(P["ERA5"][p][0], hn, 3)
            w = P["NASA"][p][1]
            parts = []
            for m in MONTHS:
                parts.append(f"{en[m]:+.2f}/{ee[m]:+.2f}{'*' if w[m] >= 1 / 24 else ' '}")
                if abs(en[m]) >= 0.05 and w[m] >= 1 / 24:
                    n += 1
                    agree += (en[m] > 0) == (ee[m] > 0)
            print(f"  {p:15s} {hn} " + " ".join(parts))
    print(f"  sign agreement where NASA |e| >= 0.05 and w >= 1/24: {agree} of {n}")

    print("\nPost hoc (added after the predictions were scored, not a test): unweighted mean |e| over all months, and "
          "over the dark months only (w_m < 1/24 at that point), 9 points x 2 halves")
    print("  lag | NASA all | ERA5 all | NASA dark | ERA5 dark | n dark")
    for g in LAGS:
        out = []
        for S in ("NASA", "ERA5"):
            al, dk = [], []
            for p in HI:
                an, _, _ = P[S][p]
                w = P["NASA"][p][1]
                for hn in HALVES:
                    e = lag_error(an, hn, g)
                    al += [abs(x) for x in e]
                    dk += [abs(x) for x, wi in zip(e, w) if wi < 1 / 24]
            out.append((st.fmean(al), st.fmean(dk), len(dk)))
        print(f"  {g:3d} | {out[0][0]:.4f}   | {out[1][0]:.4f}   | {out[0][1]:.4f}    | {out[1][1]:.4f}    | {out[0][2]}")

    print("\nPost hoc, after 6zzl (PR #16349) landed during this run (not a test): 6zzl's summer-sign reading, that the two "
          "worst learning years (lags 3 and 5) are the only two that learned a brighter local summer than the scored "
          "years saw. Energy-weighted local-summer mean e (DJF south of the equator, JJA north), 9 points x 2 halves, "
          "next to 6zzi's hi168 LC count")
    print("  lag | NASA summer e | ERA5 summer e | hi168 LC (6zzi)")
    summ = {"NASA": [], "ERA5": []}
    for g in LAGS:
        for S in ("NASA", "ERA5"):
            vals = []
            for p in HI:
                an, w, _ = P[S][p]
                ms = [m - 1 for m in dg.season_months(p, "summer")]
                for hn in HALVES:
                    e = lag_error(an, hn, g)
                    vals.append(sum(w[m] * e[m] for m in ms) / sum(w[m] for m in ms))
            summ[S].append(st.fmean(vals))
        print(f"  {g:3d} | {summ['NASA'][-1]:+.4f}       | {summ['ERA5'][-1]:+.4f}       | {HI168_LC[g - 1]}")
    print(f"  Spearman rho(hi168, summer e): NASA {su.spearman(list(HI168_LC), summ['NASA']):+.2f}, "
          f"ERA5 {su.spearman(list(HI168_LC), summ['ERA5']):+.2f} (five lags; two-sided permutation p of |rho| >= 0.7 is 0.23)")

    v = lambda ok: "held" if ok else "refuted"  # noqa: E731
    top_e = max(LAGS, key=lambda g: wabs["ERA5"][g])
    top_n = max(LAGS, key=lambda g: wabs["NASA"][g])
    print("\nPredictions")
    print(f"M1 r(NASA, ERA5 anomalies) over 2007 and 2012 >= 0.6: {v(r_l3 >= 0.6)} ({r_l3:+.3f})")
    print(f"M2 r(NASA, ERA5 lag-3 errors) >= 0.5: {v(r_lag[3] >= 0.5)} ({r_lag[3]:+.3f})")
    print(f"M3 ERA5's weighted mean |e| largest at lag 3: {v(top_e == 3)} (largest lag {top_e}; NASA's largest {top_n})")
    print(f"M4 lag-3 years' r within 0.1 of the others or above: {v(r_l3_mean >= r_other - 0.1)} "
          f"({r_l3_mean:+.3f} against {r_other:+.3f})")
    print(f"M5 sign agreement >= 75% where it matters: {v(agree >= 0.75 * n)} ({agree} of {n})")


if __name__ == "__main__":
    main()
