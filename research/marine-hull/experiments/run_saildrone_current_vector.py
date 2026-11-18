"""Milestone 6v: is 6s's scalar drift c = 0.48 m/s a coherent current or random drift? In near-calm blocks (true wind < 1 m/s) the
drone's sail makes no thrust, so its velocity over ground (SOG east/north from cog) is current plus wave drift. If that is one coherent
current, the mean vector per drone-year has magnitude near the p90 SOG; if it is random, the mean is small beside the spread.
Reported: per year, the mean vector (m/s), the share of mean squared SOG that is coherent (|mean|^2 / mean|v|^2), the along-heading
and cross-heading means, and the same for drone-day (blocks sharing a drone and calendar day, >= 6 blocks).
Run: PYTHONPATH=src python3 experiments/run_saildrone_current_vector.py > experiments/results_saildrone_current_vector.txt"""
import csv, gzip, math, collections
def pct(v, p): v = sorted(v); return v[min(len(v) - 1, int(p * len(v)))]
R = []
for r in csv.DictReader(gzip.open("experiments/data/saildrone_10min.csv.gz", "rt")):
    u, v = float(r["u"]), float(r["v"])
    if math.hypot(u, v) >= 1.0: continue
    sog, cog, hdg = float(r["sog"]), math.radians(float(r["cog"])), math.radians(float(r["hdg"]))
    e, n = sog * math.sin(cog), sog * math.cos(cog)
    along = sog * math.cos(cog - hdg); cross = sog * math.sin(cog - hdg)
    R.append((r["year"], r["drone"], r["block"][:10], e, n, sog, along, cross))
def summ(rows):
    k = len(rows); me = sum(x[3] for x in rows) / k; mn = sum(x[4] for x in rows) / k
    ms = sum(x[5] ** 2 for x in rows) / k
    return k, me, mn, math.hypot(me, mn), (me * me + mn * mn) / ms, sum(x[6] for x in rows) / k, sum(x[7] for x in rows) / k
print("near-calm blocks (wind < 1 m/s); coherent share = |mean vector|^2 / mean(SOG^2)")
for y in ("2018", "2019"):
    rows = [x for x in R if x[0] == y]
    k, me, mn, mag, coh, al, cr = summ(rows)
    print(f"{y}: n={k} mean E {me:+.3f} N {mn:+.3f} |mean| {mag:.3f} m/s; p90 SOG {pct([x[5] for x in rows], .9):.3f}; "
          f"coherent share {coh:.3f}; along-heading mean {al:+.3f}, cross-heading {cr:+.3f}")
g = collections.defaultdict(list)
for x in R: g[(x[0], x[1], x[2])].append(x)
for y in ("2018", "2019"):
    days = [summ(v) for k, v in g.items() if k[0] == y and len(v) >= 6]
    mags = [d[3] for d in days]; cohs = [d[4] for d in days]
    print(f"{y} drone-days (>= 6 calm blocks): {len(days)}; median |daily mean| {pct(mags,.5):.3f} (p90 {pct(mags,.9):.3f}); "
          f"median coherent share {pct(cohs,.5):.3f}")
# transfer: day-mean vector as the current estimate; residual p90 of |SOG - day mean| versus p90 SOG
for y in ("2018", "2019"):
    res, raw = [], []
    for k, v in g.items():
        if k[0] != y or len(v) < 6: continue
        me = sum(x[3] for x in v) / len(v); mn = sum(x[4] for x in v) / len(v)
        for x in v: res.append(math.hypot(x[3] - me, x[4] - mn)); raw.append(x[5])
    print(f"{y}: p90 SOG {pct(raw,.9):.3f} -> p90 residual after removing the drone-day mean vector {pct(res,.9):.3f} m/s (n={len(raw)})")
