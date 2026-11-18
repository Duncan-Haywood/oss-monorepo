"""Milestone 11ak, pressure statistics (predictions P1 to P4 in pressure_ref.py's docstring). Stdlib only.

    python3 pressure_stats.py > pressure_stats_results.txt
Writes pressure_mismatch_samples.json (S1 at JFK and S2 JFK -> LGA, offset removed, as weighted histograms) for
pressure_ref_run.py."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pressure_ref as pr  # noqa: E402


def load():
    d = json.load(open(os.path.join(HERE, "nyc_isd_pressure_2014.json")))
    st = {}
    for name, s in d["stations"].items():
        st[name] = ([(float(t), a, p) for t, a, p in zip(s["t"], s["alt"], s["stn"])], (s["lat"], s["lon"]))
    return st


def fmt(m):
    return "mean %+6.2f  sd %5.2f  exkurt %6.2f  P(>3sd) %6.4f  P(|d|>3m) %6.4f  P(|d|>5m) %6.4f" % m


def main():
    st = load()
    names = list(pr.STATIONS)
    print("# Milestone 11ak: pressure-reference mismatch from NOAA ISD 2014 METAR/SPECI (MA1 group), five NYC airports")
    print("# delta in metres = 8.32 m/hPa x (setting - true QNH); true QNH = station pressure + station median offset,")
    print("# interpolated linearly between reports <= 180 min apart. Samples every minute of 2014 where defined.")
    print("\n## Stations")
    for n in names:
        rows, ll = st[n]
        _, _, off = pr.qnh_series(rows)
        na = sum(a is not None for _, a, _ in rows)
        ns = sum(s is not None for _, _, s in rows)
        gaps = [b[0] - a[0] for a, b in zip(rows, rows[1:])]
        print("  %s  %s  lat %.3f lon %.3f  reports %d (alt %d, stn %d)  median report gap %.0f min  alt-stn offset %.1f hPa"
              % (n, pr.STATIONS[n], ll[0], ll[1], len(rows), na, ns, pr.median(gaps), off))

    print("\n## S1 stale setting (own airport)")
    s1 = {}
    for n in names:
        x = [d for _, d in pr.mismatch_samples(st[n][0], st[n][0])]
        s1[n] = x
        print("  %s  n %d  %s" % (n, len(x), fmt(pr.moments(x))))

    print("\n## S2 stale and distant: setting from A, drones near B (raw; and with the pair's mean offset removed)")
    s2main = None
    for a in names:
        for b in names:
            if a == b:
                continue
            smp = pr.mismatch_samples(st[a][0], st[b][0], step_min=2.0)
            x = [d for _, d in smp]
            mu = sum(x) / len(x)
            xc = [v - mu for v in x]
            km = pr.haversine_km(st[a][1], st[b][1])
            print("  %s -> %s  %5.1f km  raw: %s" % (a, b, km, fmt(pr.moments(x))))
            print("  %s    %s           centred: %s" % (" " * 3, " " * 3, fmt(pr.moments(xc))))
            if (a, b) == ("JFK", "LGA"):
                s2main = pr.mismatch_samples(st[a][0], st[b][0], step_min=1.0)

    print("\n## Monthly sd (m): S1 JFK, S2 JFK -> LGA centred")
    x1 = pr.mismatch_samples(st["JFK"][0], st["JFK"][0])
    mu2 = sum(d for _, d in s2main) / len(s2main)
    import datetime as dt
    for mo in range(1, 13):
        t0 = (dt.datetime(2014, mo, 1) - dt.datetime(2014, 1, 1)).total_seconds() / 60
        t1 = (dt.datetime(2014 + mo // 12, mo % 12 + 1, 1) - dt.datetime(2014, 1, 1)).total_seconds() / 60
        a = [d for t, d in x1 if t0 <= t < t1]
        b = [d - mu2 for t, d in s2main if t0 <= t < t1]
        print("  %02d  S1 %5.2f  S2 %5.2f" % (mo, pr.moments(a)[1], pr.moments(b)[1]))

    print("\n## Daily sd of S2 JFK -> LGA centred (distribution over days)")
    days = {}
    for t, d in s2main:
        days.setdefault(int(t // 1440), []).append(d - mu2)
    sds = sorted(pr.moments(v)[1] for v in days.values() if len(v) > 600)
    q = lambda p: sds[min(len(sds) - 1, int(p * len(sds)))]
    print("  days %d  median %.2f  p90 %.2f  p99 %.2f  max %.2f m" % (len(sds), q(0.5), q(0.9), q(0.99), sds[-1]))

    print("\n## S0 take-off-zero drift (individual error), u uniform on (0, T]")
    for T in (15, 30, 60):
        xs = {n: pr.drift_samples(st[n][0], T) for n in names}
        for n in names:
            print("  T %2d min  %s  n %d  %s" % (T, n, len(xs[n]), fmt(pr.moments(xs[n]))))

    out = {}
    for key, x in (("S1_JFK", s1["JFK"]), ("S2_JFK_LGA", [d - mu2 for _, d in s2main])):
        c, w = pr.histogram_support(x, nbins=400)
        out[key] = {"centres": c, "counts": w, "n": len(x), "sd": pr.moments(x)[1]}
    json.dump(out, open(os.path.join(HERE, "pressure_mismatch_samples.json"), "w"), separators=(",", ":"))


if __name__ == "__main__":
    main()
