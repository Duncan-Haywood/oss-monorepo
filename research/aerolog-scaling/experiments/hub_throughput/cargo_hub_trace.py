"""Milestone 6f: how many spares does the 6b/6c hub need when demand follows a real daily profile?

Predictions (written before the first run, before the counts were read):
 (1) Same hub as 6c (8 pads, 8 chargers, 1C 42 min charge, 180 s swap+load, charger limit 11.4 flights/h).
     Scale the trace so its 24 h mean is 70% of the limit. The daily peak is then well above the limit
     for a weekday profile, so a fixed pack inventory that holds p95 wait <= 300 s under Poisson (12 spares, 6c) fails:
     the trace needs at least 2x those spares (>= 24) for p95 <= 300 s.
 (2) Spreading arrivals uniformly inside each 15-minute bin vs all at the bin start changes the spares needed by
     less than the daily-shape effect (a factor under 1.5 between the two).
 (3) The weekend profile (Saturday) needs a different spare count from the weekday one by more than 20%.
Demand: Chicago "Transportation Network Providers - Trips" (City of Chicago open data, id m6dm-c72p), trips per
15-minute bin, city-wide, Wed 2019-10-09 and Sat 2019-10-12. It is ride-hail demand, a stand-in for an on-demand
service's time-of-day shape, NOT drone-delivery orders; only the shape is used (scaled to the stated mean rate).
Hub inputs as 6b/6c. Preliminary.
"""
import json, os, random, sys
from cargo_hub_bursts import PADS, CH, T_PAD, T_CHG

HERE = os.path.dirname(os.path.abspath(__file__))

def load_profile():
    res = json.load(open(os.path.join(HERE, "chicago_tnp_counts.json")))
    days = {}
    for ts, n in res:
        days.setdefault(ts[:10], []).append(n)
    return days

def arrivals(counts, mean_rate_h, mode, rng, repeat):
    """Event times (s) for `repeat` consecutive days; counts per 15-minute bin scaled to the mean rate."""
    scale = mean_rate_h * 24 / sum(counts)
    ts = []
    for d in range(repeat):
        for b, c in enumerate(counts):
            n = c * scale
            k = int(n) + (1 if rng.random() < n - int(n) else 0)
            t0 = d * 86400 + b * 900
            for _ in range(k):
                ts.append(t0 + (rng.random() * 900 if mode == "uniform" else 0.0))
    ts.sort()
    return ts

def run(ts, spares):
    pad = [0.0] * PADS; chg = [0.0] * CH; pack = [0.0] * spares
    waits = []
    for t in ts:
        i = min(range(PADS), key=pad.__getitem__)
        j = min(range(spares), key=pack.__getitem__)
        start = max(t, pad[i], pack[j]); end = start + T_PAD
        c = min(range(CH), key=chg.__getitem__)
        chg[c] = max(end, chg[c]) + T_CHG
        pack[j] = chg[c]; pad[i] = end
        waits.append(start - t)
    w = sorted(waits[len(waits) // 5:])
    return sum(w) / len(w), w[int(0.95 * len(w))]

def poisson(rate_h, repeat, rng):
    t, out, end = 0.0, [], repeat * 86400
    while True:
        t += rng.expovariate(rate_h / 3600)
        if t > end: return out
        out.append(t)

def need(make, spares_grid, seeds=3):
    for s in spares_grid:
        p95 = sum(run(make(sd), s)[1] for sd in range(seeds)) / seeds
        if p95 <= 300: return s
    return None

if __name__ == "__main__":
    days = load_profile()
    lim = CH * 3600 / T_CHG
    grid = (9, 12, 16, 20, 24, 28, 32, 40, 48, 64, 96, 128)
    REP = 4
    for day, counts in days.items():
        pk = max(counts) * 4 / (sum(counts) / 24)
        print(f"\n{day}: {sum(counts)} trips, peak 15-min hour-rate / daily-mean rate = {pk:.2f}")
    for load in (0.7, 0.85):
        rate = load * lim
        print(f"\nLoad {load:.0%} of charger limit ({rate:.1f} flights/h mean). Fewest spares with p95 wait <= 300 s")
        print(f"  Poisson: {need(lambda sd: poisson(rate, REP, random.Random(sd)), grid) or '>128'}")
        for day, counts in days.items():
            for mode in ("uniform", "start"):
                n = need(lambda sd: arrivals(counts, rate, mode, random.Random(sd), REP), grid)
                print(f"  {day} {mode:7s}: {n if n else '>128'}")
