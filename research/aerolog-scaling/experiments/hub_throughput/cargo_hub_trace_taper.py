"""Milestone 6g: do 6d's taper and 6f's daily demand shape compound? Spares at a fixed 6.0 flights/h mean.

Predictions (written before the first run, before the counts were read):
 (1) 20-90% charge window (42 min, charger limit 11.4/h; the daily peak of 1.76x the mean is 10.6/h, under the limit):
     the Wednesday trace needs at most 16 spares for p95 wait <= 300 s (Poisson at this rate needs about 9, 6d).
 (2) 30-100% window (CC-CV, 72.0 min, limit 6.7/h): the daily peak (10.6/h) is above the limit, so the Wednesday trace
     needs at least 2x the Poisson count (Poisson: 24 in 6d), i.e. >= 48 spares, or more than the largest grid value.
 (3) The Wednesday-to-Saturday difference at 30-100% is under 25% (6f found Sat needed 25% more only at 85% load).
Same hub, demand shape and Chicago ride-hail stand-in as 6f (shape only, scaled to the stated mean). Charge times from 6d's
fit to the Molicel INR-21700-P45B datasheet (CV decay shape assumed). Preliminary.
"""
import random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cargo_hub_trace as T
from cargo_hub_taper import charge_time_h

if __name__ == "__main__":
    days = T.load_profile()
    rate, REP = 6.0, 4
    grid = (9, 12, 16, 20, 24, 28, 32, 40, 48, 64, 96, 128)
    for name, t in (("20-90%", charge_time_h(.2, .9) * 3600), ("30-100%", charge_time_h(.3, 1.0) * 3600)):
        T.T_CHG = t
        print(f"\nWindow {name}: {t/60:.1f} min, charger limit {8*3600/t:.2f} flights/h, mean load {rate/(8*3600/t):.0%}")
        n = T.need(lambda sd: T.poisson(rate, REP, random.Random(sd)), grid)
        print(f"  Poisson            : {n or '>128'}")
        for day, counts in days.items():
            n = T.need(lambda sd: T.arrivals(counts, rate, "uniform", random.Random(sd), REP), grid)
            print(f"  {day} uniform : {n or '>128'}")
