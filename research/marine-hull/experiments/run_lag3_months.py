"""Milestone 6zzl: why does learning from the lag-3 year (2007 when scoring L, 2012 when scoring E) fail at the nine
high-amplitude points, which months carry the failure, and is that year's weather real or a NASA POWER artefact?

Why: 6zzj and 6zzk's "Next". At the nine high-amplitude points of 6zza, every rule learned on the lag-3 year wins
almost nothing (6zzj, 168 pooled cells: LC_3 1, LHF_3 1, LAP_3 2, LB_3 4, HR_3 9, HX_3 9; no correction AT_90 25;
the other four lags average LC 101.0), and a second learning year dilutes but does not cancel it (6zzk: LC 59.0 with
lag 3 against 114.5 without). Over all 30 points lag 3 is a middling year (LC_3 132 of 168), so the damage is local.
A designer who is told "a single unlucky year can undo the correction" needs to know what such a year looks like
before trusting a high-latitude correction, and the paper needs to say whether it is weather or data.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp, dominance and the nine points exactly as 6zzj (NASA POWER daily
  ALLSKY_SFC_SW_DWN 2005 to 2014, climatology 2015 to 2024, halves E 2005 to 2009 and L 2010 to 2014, 50 W, packs
  2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes; 168 pooled cells at the nine points).
  A. Month errors (real shape). For point p, scored half h and lag g, LC's clamped factor learned on the lag-g year
     (c_m, as 6zzi) against the scored half's own unclamped month ratio over its five years (o_m, harvest / climatology,
     the correction an oracle would apply): e_m = c_m - o_m. Per lag: mean |e| over 9 points x 2 halves x 12 months,
     and the mean signed e. Lag 3's excess per month: its mean |e_m| minus the mean of the other four lags' |e_m|.
  B. Month repair (all 21 shapes, the 168 pooled cells at the nine points). For LC and HR, the lag-3 factors with
     month m replaced by that rule's factor learned on the other four lags ({1, 2, 4, 5}), m = 1 to 12, one at a time
     (LC_Rm, HR_Rm); and every month replaced (LC_F, HR_F, the four-year rules). Gap G = F - lag 3. Gain of month m =
     Rm - lag 3.
  C. ERA5 check. ERA5 shortwave_radiation_sum (Open-Meteo, experiments/fetch_era5_sun.py) at the same nine
     coordinates. Month anomaly in year y: month sum / mean of that month over 2015 to 2024, minus 1, for NASA POWER
     irradiance and ERA5 alike. Also the lag-3 month error of part A recomputed on irradiance for each source (lag-3
     year's anomaly ratio against the scored half's), to see whether ERA5 would have taught the same wrong lesson.
Predictions (priors in brackets):
  Z1 Lag 3 has the largest mean |e| of the five lags at the nine points. [65%]
  Z2 The three months with the largest lag-3 excess carry at least half of the summed positive excess. [55%]
  Z3 Lag 3's mean signed error is positive (the year was sunnier than the scored half: optimistic targets). [50%]
  Z4 Repairing the single best month recovers at least a third of LC's gap G. [50%]
  Z5 HR's best repair month is LC's best repair month, or a neighbour of it (circularly). [60%]
  Z6 Pearson r between NASA and ERA5 month anomalies over the nine points x 12 months x {2007, 2012} is at least
     0.6. [70%]
  Z7 For Z2's three months, ERA5's lag-3 irradiance error has the same sign as NASA's in at least two thirds of the
     (point, half, month) cases. [65%]
Descriptive: per-lag error tables; lag-3 errors by month, half and point; per-month repair gains; NASA against ERA5
anomaly correlation for every year 2005 to 2014.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_lag3_months.py > experiments/results_lag3_months.txt
(stdlib, deterministic; uses up to 4 processes; needs experiments/data/era5_sun_hiamp_2005_2024.json)"""
import datetime
import json
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reml_season as rm  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, N = ls.REAL, ls.SHAPES, ls.N
LAGS = (1, 2, 3, 4, 5)
OTHER = (1, 2, 4, 5)
MONTHS = tuple(range(12))
MNAME = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
REPAIRED = ("LC", "HR")
RULES = (("AT_90",) + tuple(f"{t}_3" for t in REPAIRED) + tuple(f"{t}_F" for t in REPAIRED)
         + tuple(f"{t}_R{m + 1}" for t in REPAIRED for m in MONTHS))
ERA5_FILE = os.path.join(HERE, "data", "era5_sun_hiamp_2005_2024.json")
REF_6ZZJ = {"AT_90": 25, "LC_3": 1, "HR_3": 9}  # 6zzj hi168


def fac(tag, p, years, shape):
    if tag == "LC":
        return ly.learned(p, years, shape)[0]
    return rm.corrections(p, years, shape)["HR"][0]


def repaired(tag, p, hn, shape):
    """{rule: 12 factors} for the lag-3 rule, its one-month repairs and the full repair."""
    f3 = list(fac(tag, p, su.years_of(hn, (3,)), shape))
    f4 = fac(tag, p, su.years_of(hn, OTHER), shape)
    out = {f"{tag}_3": tuple(f3), f"{tag}_F": tuple(f4)}
    for m in MONTHS:
        r = list(f3)
        r[m] = f4[m]
        out[f"{tag}_R{m + 1}"] = tuple(r)
    return out


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)})."""
    cap, p, yr, s0, amp, phi = key
    shape = (s0, amp, phi)
    sun, h = fy._sun(p, yr)
    h = list(h)
    hc = ls.scaled(p, yr, shape)[1]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, None)}
    a = PS[cap][0]
    ones = [1.0] * len(h)
    runs = {"AT_90": (T, hc)}
    hn = fy.half_of(yr)
    for tag in REPAIRED:
        for name, f in repaired(tag, p, hn, shape).items():
            hm = [ls.interp(f, d) * x for d, x in enumerate(hc)]
            runs[name] = (pt.target(hm, cap, HOTEL), hm)
    for name, (TT, cc) in runs.items():
        taus = [sb.tau_of(1.0 / x) for x in sb.ratios(h, cc, N)]
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[name] = (km, dark - idle_dark, days)
    return key, out


def evaluate(points, shapes=SHAPES, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in shapes]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def pooled(cells, points, shapes):
    n = dict.fromkeys(RULES, 0)
    for sh in shapes:
        for yrs in HALVES.values():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + sh for p in points for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def month_sums(vals_by_date, years):
    """12 month sums over the given years from {date: value}."""
    s = [0.0] * 12
    for yr in years:
        for d in rc.dates(yr):
            s[d.month - 1] += vals_by_date[d]
    return s


def oracle(p, hn):
    """Unclamped month ratio harvest / climatology over the scored half's five years (real shape)."""
    hs, cs = [0.0] * 12, [0.0] * 12
    for yr in HALVES[hn]:
        h = fy._sun(p, yr)[1]
        hc = ls.scaled(p, yr, REAL)[1]
        for d, x, y in zip(rc.dates(yr), h, hc):
            hs[d.month - 1] += x
            cs[d.month - 1] += y
    return [x / y for x, y in zip(hs, cs)]


def errors(points):
    """{(lag, point, half): 12 errors e_m = learned clamped c_m - oracle o_m} (LC, real shape)."""
    out = {}
    for p in points:
        for hn in HALVES:
            o = oracle(p, hn)
            for g in LAGS:
                c = ly.learned(p, su.years_of(hn, (g,)), REAL)[0]
                out[(g, p, hn)] = [x - y for x, y in zip(c, o)]
    return out


def nasa_daily(p):
    s = rc.series(p)
    out = {}
    for yr in range(2005, 2025):
        for d in rc.dates(yr):
            out[d] = s[d.strftime("%Y%m%d")]
    return out


def era5_daily(p, data):
    d0 = datetime.date(2005, 1, 1)
    return {d0 + datetime.timedelta(days=i): v for i, v in enumerate(data[p]["values"])}


def anomalies(daily, years):
    """{year: 12 anomalies} month sum / 2015 to 2024 mean of that month - 1."""
    clim = [x / len(fy.CLIM_YEARS) for x in month_sums(daily, fy.CLIM_YEARS)]
    return {yr: [s / c - 1.0 for s, c in zip(month_sums(daily, (yr,)), clim)] for yr in years}


def pearson(x, y):
    mx, my = st.fmean(x), st.fmean(y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    return sxy / (sxx * syy) ** 0.5


def irr_error(anom, hn):
    """Lag-3 irradiance error per month: (1 + a_lag3) / mean over the scored half of (1 + a) - 1."""
    y3 = su.years_of(hn, (3,))[0]
    sc = [st.fmean(1.0 + anom[yr][m] for yr in HALVES[hn]) for m in MONTHS]
    return [(1.0 + anom[y3][m]) / sc[m] - 1.0 for m in MONTHS]


def main():
    fy.prepare()
    hi = ls.high_amp_points()
    print("Milestone 6zzl: the lag-3 learning year at the nine high-amplitude points, month by month (50 W)")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    print("lag 3: scoring L learns from 2007, scoring E from 2012")

    # A. month errors
    E = errors(hi)
    print("\nA. LC month errors e = learned clamped factor - scored half's own ratio (real shape), 9 points x 2 halves")
    print("  lag | mean |e| | mean e  | share e > 0")
    mae = {}
    for g in LAGS:
        v = [x for (gg, p, hn), es in E.items() if gg == g for x in es]
        mae[g] = st.fmean(abs(x) for x in v)
        print(f"  {g:3d} | {mae[g]:.4f}   | {st.fmean(v):+.4f} | {sum(x > 0 for x in v) / len(v):.2f}")
    print("\n  mean |e| by month and lag; lag-3 excess = lag 3 - mean of the other four; mean signed e of lag 3")
    print("  month | " + " | ".join(f"lag {g}" for g in LAGS) + " | excess  | e lag 3")
    excess, signed3 = [], []
    for m in MONTHS:
        row = {g: st.fmean(abs(es[m]) for (gg, p, hn), es in E.items() if gg == g) for g in LAGS}
        ex = row[3] - st.fmean(row[g] for g in OTHER)
        s3 = st.fmean(es[m] for (gg, p, hn), es in E.items() if gg == 3)
        excess.append(ex)
        signed3.append(s3)
        print(f"  {MNAME[m]}   | " + " | ".join(f"{row[g]:.3f}" for g in LAGS) + f" | {ex:+.4f} | {s3:+.4f}")
    top3 = sorted(MONTHS, key=lambda m: -excess[m])[:3]
    pos = sum(x for x in excess if x > 0)
    share = sum(excess[m] for m in top3) / pos if pos > 0 else float("nan")
    print(f"  top-3 excess months: {', '.join(MNAME[m] for m in top3)}; share of summed positive excess {share:.2f}")
    print("\n  lag-3 signed e by point and half, months Jan..Dec")
    for p in hi:
        for hn in HALVES:
            print(f"  {p:15s} {hn} | " + " ".join(f"{x:+.2f}" for x in E[(3, p, hn)]))

    # B. month repair
    cells = evaluate(hi)
    t = pooled(cells, hi, SHAPES)
    print("\nB. Month repair at the nine points, 168 pooled cells (all 21 shapes)")
    print("  " + ", ".join(f"{g} {t[g]} (6zzj {REF_6ZZJ[g]})" for g in REF_6ZZJ))
    gain = {}
    for tag in REPAIRED:
        G = t[f"{tag}_F"] - t[f"{tag}_3"]
        gain[tag] = [t[f"{tag}_R{m + 1}"] - t[f"{tag}_3"] for m in MONTHS]
        print(f"  {tag}: lag 3 {t[f'{tag}_3']}, all months repaired (four-year rule) {t[f'{tag}_F']}, gap G {G}")
        print("    gain by repaired month: " + ", ".join(f"{MNAME[m]} {gain[tag][m]:+d}" for m in MONTHS))
        print(f"    sum of single-month gains {sum(gain[tag])}")

    # C. ERA5
    era = json.load(open(ERA5_FILE))
    yrs = tuple(range(2005, 2015))
    AN = {p: anomalies(nasa_daily(p), yrs) for p in hi}
    AE = {p: anomalies(era5_daily(p, era), yrs) for p in hi}
    print("\nC. NASA POWER against ERA5 month anomalies (month sum / 2015-2024 mean - 1), nine points x 12 months")
    rs = {}
    for yr in yrs:
        x = [AN[p][yr][m] for p in hi for m in MONTHS]
        y = [AE[p][yr][m] for p in hi for m in MONTHS]
        rs[yr] = pearson(x, y)
        print(f"  {yr}: r {rs[yr]:+.3f}   mean NASA {st.fmean(x):+.3f}  mean ERA5 {st.fmean(y):+.3f}")
    x = [AN[p][yr][m] for yr in (2007, 2012) for p in hi for m in MONTHS]
    y = [AE[p][yr][m] for yr in (2007, 2012) for p in hi for m in MONTHS]
    r_lag3 = pearson(x, y)
    print(f"  2007 and 2012 together: r {r_lag3:+.3f}; other eight years: mean r "
          f"{st.fmean(rs[yr] for yr in yrs if yr not in (2007, 2012)):+.3f}")
    print("\n  lag-3 irradiance error (lag-3 year against the scored half) by point and half, NASA / ERA5, top-3 months")
    agree = n = 0
    xs, ys = [], []
    for p in hi:
        for hn in HALVES:
            en, ee = irr_error(AN[p], hn), irr_error(AE[p], hn)
            xs += en
            ys += ee
            parts = []
            for m in top3:
                agree += (en[m] > 0) == (ee[m] > 0)
                n += 1
                parts.append(f"{MNAME[m]} {en[m]:+.2f} / {ee[m]:+.2f}")
            print(f"  {p:15s} {hn} | " + " | ".join(parts))
    r_err = pearson(xs, ys)
    print(f"  sign agreement on the top-3 months: {agree} of {n}; r over all 12 months x 9 points x 2 halves {r_err:+.3f}")

    hr = lambda ok: "held" if ok else "refuted"  # noqa: E731
    lc_best = max(MONTHS, key=lambda m: gain["LC"][m])
    hr_best = max(MONTHS, key=lambda m: gain["HR"][m])
    G = t["LC_F"] - t["LC_3"]
    print("\nPredictions")
    print(f"Z1 lag 3 has the largest mean |e|: {hr(mae[3] >= max(mae.values()))} ("
          + ", ".join(f"lag {g} {mae[g]:.4f}" for g in LAGS) + ")")
    print(f"Z2 top-3 months carry >= half the positive excess: {hr(share >= 0.5)} ({share:.2f})")
    s3 = st.fmean(x for (g, p, hn), es in E.items() if g == 3 for x in es)
    print(f"Z3 lag 3's mean signed e > 0: {hr(s3 > 0)} ({s3:+.4f})")
    print(f"Z4 best single-month repair >= G/3: {hr(gain['LC'][lc_best] * 3 >= G)} "
          f"({MNAME[lc_best]} {gain['LC'][lc_best]:+d} of G {G})")
    near = (hr_best - lc_best) % 12 in (0, 1, 11)
    print(f"Z5 HR's best repair month = LC's or a neighbour: {hr(near)} (LC {MNAME[lc_best]}, HR {MNAME[hr_best]})")
    print(f"Z6 r(NASA, ERA5) over 2007 and 2012 >= 0.6: {hr(r_lag3 >= 0.6)} ({r_lag3:+.3f})")
    print(f"Z7 ERA5 sign agreement on the top-3 months >= 2/3: {hr(agree * 3 >= 2 * n)} ({agree} of {n})")


if __name__ == "__main__":
    main()
