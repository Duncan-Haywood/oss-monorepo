"""Milestone 6zw: can the boat measure its climatology's bias on the water and choose its battery feedback from it?

Why: 6zv's "Next". 6zv found the blend rule's dominance over the trailing-mean rule B is a window in the climatology's
bias about 3 to 4 points wide, and read (post hoc, pooled by effective optimism eff = s / realised) a feedback-time
table: tau 60 days when eff < 0.985, 30 for 0.985 to 1.015, 20 for 1.015 to 1.025, 10 above. A boat does not know
eff. It does know, every day, how much it harvested and how much its climatology promised for the same days. This
milestone tests whether that running ratio is enough to pick tau (and/or to correct the climatology term) online.

Design (fixed here, before any configuration below was run):
  Everything is 6zv's: cross climatology (half "T" scores 2020-2024 with a 2015-2019 climatology; half "R" scores
  2015-2019 with a 2020-2024 climatology), climatology hc multiplied by s in {0.97, ..., 1.03} before anything uses
  it (estimate term K and the 45-day-lead target T every rule steers to, B included), 50 W payload, packs 2.5, 5, 10,
  20 kWh, the 30 points, launched full each 1 January, 56 (s x half x pack) cells, "dominates B" = cell km >= B's and
  cell excess dark hours (over an idle boat's) <= B's. The plan speed is p = W + (SOC - T(d)) / (tau 24) as 6zt.
  Weights a are PS's per pack (0.5, 0.5, 0.375, 0.375 for 2.5, 5, 10, 20 kWh) in every new rule.
  Running ratio on day d, window N days:
     r(d) = (sum h[d-N..d-1] + P) / (sum hc_s[d-N..d-1] + P),  P = 14 x mean(hc_s) (a 14-day prior at ratio 1,
     so the first days of a year do not swing on one cloudy day). eff_hat(d) = 1 / r(d).
  Table (6zv's, fixed): tau(eff) = 60 if eff < 0.985; 30 if eff < 1.015; 20 if eff < 1.025; else 10.
  Rules:
    AT_N  adaptive tau: tau(eff_hat(d)) each day, W(a) with the biased K. N in {30, 60, 90}; N = 60 is primary.
    DC    debiased K: W(a) with K = r(d) x hc_s[d] (N = 60), PS's tau. The target is left biased.
    AD    both: debiased K and adaptive tau (N = 60).
    OR    oracle: tau(eff) with the cell's true eff (s / realised-over-climatology of that half, all points), fixed
          for the whole cell, W(a) with the biased K. Not available to a boat; the yardstick for AT.
    PS, PSS as 6zv (for reference; their 6zv counts were 30 and 36 of 56).
Predictions:
  P1  AT_60 dominates B in at least 40 of the 56 cells.
  P2  AT_60 dominates B in at least 5 of the 8 (half x pack) cells at every s.
  P3  DC dominates B in more of the 56 cells than PS does.
  P4  AT_60's dominance count is within 4 of OR's.
  P5  AT_60's km / B is at least 1.0 in at least 50 of the 56 cells.
  P6  AT_60 dominates in at least as many cells as AT_30 and as AT_90.
  P7  The estimator is unbiased in aggregate: in each of the 14 (s, half) pairs, the day-weighted mean of eff_hat over
      all points, years and days (pack-independent) is within 0.01 of the pair's eff.
Descriptive: per cell km/B, ex/B, dominance for AT_60, DC, AD, OR, PS, PSS; counts per s; the share of days AT_60 spends
  at each tau, per s and half; AT_30 and AT_90 counts.
Caveat fixed in advance: the tau table was read from 6zv's cells, which are these cells. So this is a test of whether an
  online estimate can realise the table, not an out-of-sample test of the table; the oracle carries the same
  in-sample advantage.

Data: as 6zk to 6zv (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_self_bias.py > experiments/results_self_bias.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_bias_sweep as bs  # noqa: E402
import run_blend_transfer as bt  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_wave_vs_sun_sites as y  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, SCALES, HALVES, BASE = bs.PACKS, bs.HOTEL, bs.SCALES, bs.HALVES, bs.BASE
PS, PSS = bs.PS, bs.PSS
WINDOWS = (30, 60, 90)
PRIMARY = 60
PRIOR_DAYS = 14
TAU_STEPS = (60, 30, 20, 10)
TAUS_OUT = TAU_STEPS
REALISED = {"T": 1.0108, "R": 0.9893}  # 6zv, realised / unscaled climatology, all points, by half
RULES = ("AT_30", "AT_60", "AT_90", "DC", "AD", "OR", "PS", "PSS")


def tau_of(eff):
    """6zv's feedback-time table."""
    if eff < 0.985:
        return 60
    if eff < 1.015:
        return 30
    if eff < 1.025:
        return 20
    return 10


def half_of(yr):
    return "T" if yr in bs.LATE else "R"


def ratios(h, hc, n):
    """r(d) for every day: trailing-N harvest over trailing-N climatology, with a PRIOR_DAYS prior at ratio 1."""
    prior = PRIOR_DAYS * sum(hc) / len(hc)
    ch, cc = [0.0], [0.0]
    for a, b in zip(h, hc):
        ch.append(ch[-1] + a)
        cc.append(cc[-1] + b)
    out = []
    for d in range(len(h)):
        lo = max(0, d - n)
        out.append((ch[d] - ch[lo] + prior) / (cc[d] - cc[lo] + prior))
    return out


def run(h, T, hc, a, taus, kscale, cap, hotel):
    """bt.run with a per-day tau and a per-day multiplier on the climatology term K: (km, dark hours, tau days)."""
    hd = hotel * 24.0
    soc, km, dark = cap, 0.0, 0.0
    days = dict.fromkeys(TAUS_OUT, 0)
    for d, e in enumerate(h):
        k = kscale[d] * hc[d] / 24.0
        past = h[max(0, d - bt.WEEK):d]
        lw = sum(past) / len(past) / 24.0 if past else hotel
        tau = taus[d]
        days[tau] += 1
        p = a * lw + (1.0 - a) * k + (soc - T[d]) / (tau * 24.0)
        avail = soc + e
        if avail < hd:
            soc = 0.0
            dark += (hd - avail) / hotel
            continue
        v = yp.speed_for_power(p, hotel)
        if avail - yp.load_w(v, hotel) * 24.0 < 0:
            v = y.bisect(lambda x: avail - yp.load_w(x, hotel) * 24.0 >= 0) or 0.0
        soc = min(cap, avail - yp.load_w(v, hotel) * 24.0)
        km += 86.4 * v
    return km, dark, days


def score(key):
    """((cap, point, year, s), {rule: (km, excess dark h, tau-days)}, (sum eff_hat over days, days))."""
    cap, p, yr, s = key
    sun, h = bs._sun(p, yr)
    h = list(h)
    hc = [s * x for x in bs._clim(p, yr)]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, None)}
    a = PS[cap][0]
    ones = [1.0] * len(h)
    r = {n: ratios(h, hc, n) for n in WINDOWS}
    eff_true = s / REALISED[half_of(yr)]
    plans = {f"AT_{n}": ([tau_of(1.0 / x) for x in r[n]], ones) for n in WINDOWS}
    plans["DC"] = ([PS[cap][1]] * len(h), r[PRIMARY])
    plans["AD"] = (plans[f"AT_{PRIMARY}"][0], r[PRIMARY])
    plans["OR"] = ([tau_of(eff_true)] * len(h), ones)
    plans["PS"] = ([PS[cap][1]] * len(h), ones)
    plans["PSS"] = ([PSS[cap][1]] * len(h), ones)
    for name, (taus, ks) in plans.items():
        km, dark, days = run(h, T, hc, a, taus, ks, cap, HOTEL)
        out[name] = (km, dark - idle_dark, days)
    return key, out, (sum(1.0 / x for x in r[PRIMARY]), len(h))


def evaluate(points=bt.PTS, procs=4):
    keys = [(c, p, yr, s) for p in points for yr in bt.YEARS for c in PACKS for s in SCALES]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=7)
    return {k: o for k, o, _ in res}, {k: e for k, _, e in res}


def total(cells, keys):
    """{rule: [km, excess, {tau: days}]} summed over keys."""
    t = {}
    for k in keys:
        for g, (km, ex, days) in cells[k].items():
            x = t.setdefault(g, [0.0, 0.0, dict.fromkeys(TAUS_OUT, 0)])
            x[0] += km
            x[1] += ex
            if days:
                for tau, n in days.items():
                    x[2][tau] += n
    return t


def dominates(t, g):
    return t[g][0] >= t[BASE][0] and t[g][1] <= t[BASE][1]


def cells_of(cells, points=bt.PTS):
    return {(s, hn, c): total(cells, [(c, p, yr, s) for p in points for yr in yrs])
            for s in SCALES for hn, yrs in HALVES.items() for c in PACKS}


def main():
    cells, est = evaluate()
    C = cells_of(cells)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zw: the boat estimates its climatology's bias and picks its feedback time (50 W payload)")
    print(f"6zv's cross climatology and bias scales s in {SCALES}; weights a = PS's per pack; "
          f"tau table 60 / 30 / 20 / 10 at eff < 0.985 / 1.015 / 1.025 / above; prior {PRIOR_DAYS} days at ratio 1")
    print("AT_N: tau from the trailing-N ratio; DC: K x r(d), PS's tau; AD: both (N 60); OR: tau from the true eff")

    print("\nEstimator: day-weighted mean eff_hat (N 60) per (s, half), all points x years, against the true eff")
    errs = []
    for s in SCALES:
        for hn, yrs in HALVES.items():
            ks = [(PACKS[0], p, yr, s) for p in bt.PTS for yr in yrs]
            m = sum(est[k][0] for k in ks) / sum(est[k][1] for k in ks)
            e = s / REALISED[hn]
            errs.append(abs(m - e))
            print(f"   s {s:4.2f} {hn}: eff {e:.4f}  mean eff_hat {m:.4f}  diff {m - e:+.4f}")

    show = ("AT_60", "DC", "AD", "OR", "PS", "PSS")
    print("\nPer cell (half, pack, s): km/B ex/B dominates, for " + ", ".join(show))
    print("  half C kWh   s  | " + " | ".join(f"{g:>5s} km/B ex/B d" for g in show))
    for hn in HALVES:
        for c in PACKS:
            for s in SCALES:
                t = C[(s, hn, c)]
                b = t[BASE]
                parts = [f"{t[g][0] / b[0]:10.4f} {bt.ratio(t[g][1], b[1]):4.2f} {yn(dominates(t, g))}"
                         for g in show]
                print(f"  {hn:4s} {c / 1000:5.1f} {s:4.2f} | " + " | ".join(parts))

    print("\nDominance counts per s (of 8 half x pack cells)")
    print("     s  | " + " | ".join(f"{g:>5s}" for g in RULES))
    cnt = {}
    for s in SCALES:
        ks = [(s, hn, c) for hn in HALVES for c in PACKS]
        cnt[s] = {g: sum(dominates(C[k], g) for k in ks) for g in RULES}
        print(f"  {s:4.2f}  | " + " | ".join(f"{cnt[s][g]:5d}" for g in RULES))
    tot = {g: sum(cnt[s][g] for s in SCALES) for g in RULES}
    print("  total | " + " | ".join(f"{tot[g]:5d}" for g in RULES))

    print("\nShare of days AT_60 spends at each tau (all packs), per s and half")
    print("     s  half | " + " | ".join(f"tau {t:2d}" for t in TAUS_OUT))
    for s in SCALES:
        for hn in HALVES:
            days = dict.fromkeys(TAUS_OUT, 0)
            for c in PACKS:
                for t, n in C[(s, hn, c)]["AT_60"][2].items():
                    days[t] += n
            n = sum(days.values())
            print(f"  {s:4.2f}  {hn:4s} | " + " | ".join(f"{days[t] / n:6.3f}" for t in TAUS_OUT))

    print("\nPredictions")
    print(f"P1 AT_60 dominates in >= 40 of 56: {'held' if tot['AT_60'] >= 40 else 'refuted'} ({tot['AT_60']} of 56)")
    per = [cnt[s]["AT_60"] for s in SCALES]
    print(f"P2 AT_60 dominates in >= 5 of 8 at every s: {'held' if min(per) >= 5 else 'refuted'} ({per})")
    print(f"P3 DC dominates in more cells than PS: {'held' if tot['DC'] > tot['PS'] else 'refuted'} "
          f"(DC {tot['DC']}, PS {tot['PS']})")
    print(f"P4 AT_60 within 4 of OR: {'held' if abs(tot['AT_60'] - tot['OR']) <= 4 else 'refuted'} "
          f"(AT_60 {tot['AT_60']}, OR {tot['OR']})")
    km = [C[(s, hn, c)]["AT_60"][0] / C[(s, hn, c)][BASE][0] for s in SCALES for hn in HALVES for c in PACKS]
    n5 = sum(x >= 1.0 for x in km)
    print(f"P5 AT_60 km/B >= 1.0 in >= 50 of 56: {'held' if n5 >= 50 else 'refuted'} ({n5} of 56; min {min(km):.4f})")
    ok6 = tot["AT_60"] >= tot["AT_30"] and tot["AT_60"] >= tot["AT_90"]
    print(f"P6 AT_60 >= AT_30 and AT_90: {'held' if ok6 else 'refuted'} "
          f"(AT_30 {tot['AT_30']}, AT_60 {tot['AT_60']}, AT_90 {tot['AT_90']})")
    print(f"P7 mean eff_hat within 0.01 of eff in 14 of 14: {'held' if max(errs) <= 0.01 else 'refuted'} "
          f"({sum(e <= 0.01 for e in errs)} of 14; max |diff| {max(errs):.4f})")


if __name__ == "__main__":
    main()
