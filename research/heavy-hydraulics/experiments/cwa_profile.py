"""Milestone 5k: what a published electric-excavator power profile says about the duty-cycle shape.

Data: Arrinda, Popp, Chevillard, Michalow-Mauke, "Off-road electric power profile", Zenodo 18862594 (CC BY 4.0, 2026-03-04),
raw electric power (W) at 0.1 s for an electric excavator, part of a CWA pre-normative profile. Three csv files, fetched by
the script into a temp dir (not committed; 450 kB). Machine size is not stated in the record (peak 133 kW, so far larger
than the 1.5 to 3 t class): only dimensionless shape statistics are carried over.
"""
import csv, io, os, sys, urllib.request, statistics as st

BASE = "https://zenodo.org/api/records/18862594/files/%s.csv/content"
def load(name, cache):
    path = os.path.join(cache, name + ".csv")
    if not os.path.exists(path):
        urllib.request.urlretrieve(BASE % name, path)
    rows = list(csv.reader(open(path)))[1:]
    return [float(r[0]) for r in rows], [float(r[1]) for r in rows]

def pct(xs, q):
    s = sorted(xs); return s[min(len(s) - 1, int(q * len(s)))]

def stats(label, t, p):
    dt = 0.1; n = len(p)
    pos = sum(x for x in p if x > 0) * dt; neg = -sum(x for x in p if x < 0) * dt
    mean = sum(p) / n; peak = max(p)
    print(f"{label}: {t[-1]-t[0]:.0f} s, mean {mean/1e3:.1f} kW, peak {peak/1e3:.1f} kW, peak/mean {peak/mean:.2f}, "
          f"p95/mean {pct(p,.95)/mean:.2f}, share of time above mean {sum(x>mean for x in p)/n:.2f}, "
          f"time <1 kW {sum(abs(x)<1e3 for x in p)/n:.2f}, energy {pos/3.6e6:.3f} kWh, negative-power energy {neg/3.6e6:.5f} kWh ({neg/pos*100:.3f}% of positive)")
    # largest 3 s window mean vs overall mean (the harvest window of 5d)
    w = 30; best = max(sum(p[i:i+w]) / w for i in range(n - w + 1))
    print(f"   best 3 s window mean {best/1e3:.1f} kW = {best/mean:.2f} x mean; 1 s step change max {max(abs(p[i+10]-p[i]) for i in range(n-10))/1e3:.1f} kW")

cache = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
for name in ("Digging_profile", "Grading_profile", "ElectricExcavator_profile"):
    t, p = load(name, cache); stats(name, t, p)
t, p = load("ElectricExcavator_profile", cache)
print("runtime on a battery of E kWh at the profile mean = E / mean kW; hours per 100 kWh:", f"{100/(sum(p)/len(p)/1e3):.2f}")
