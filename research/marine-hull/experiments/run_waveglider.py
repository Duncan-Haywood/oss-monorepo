"""Milestone 6p: does a quasi-steady two-body foil model predict a fielded Wave Glider's speed from buoy sea state, and
how far does a wave-powered vehicle go per day at the programme's buoy sites, against 6o's wind drone and the solar
ceiling?

Data (experiments/fetch_waveglider.py): Wave Glider "Honey Badger" (MAGI mission, Hawaii, May to Nov 2015), hourly mean
through-water speed, matched to the nearest NDBC buoy with a wave record within +-1 h (WVHT, DPD). Model:
src/marine_hull/waveglider.py, one fitted parameter r = S / (C_D A).

Predictions, written before this script was first run (commit before the results file):
  Rules: keep hours with buoy distance <= 300 km and mean speed >= 0.1 m/s (below that the vehicle is taken to be out
  of the water or holding). Train on hours before 2015-08-01, test on the rest. Tp = buoy DPD.
  P1  Spearman(speed, WVHT) >= 0.3 over the kept hours.
  P2  At fixed height, longer period means slower (heave velocity ~ Hs/T): the residual of speed from its 0.25 m
      WVHT-bin median has Spearman(residual, DPD) < 0.
  P3  The one-parameter model's held-out mean absolute error is <= 0.85 x the constant (training median) baseline's and
      <= 1.10 x a two-parameter power law U = a Hs^b fitted on the same training hours.
  P4  The data are sub-linear in height: the median speed at WVHT >= 2.5 m over the median at WVHT <= 1.5 m is between
      1.2 and 2.0 (the model, linear in Hs at fixed Tp, will put it near the ratio of mean heights; a ratio well below
      that refutes the model's shape).
  P5  Run on hourly WVHT and DPD at the twelve open-water programme buoys (Jan and Jul 2024; 46042 has no 2024 file),
      the fitted model's median buoy-month distance is below the 86 km/day solar ceiling in both months, and below
      6o's capability wind drone (126 km/day in January, 80 in July) in both.
Sensitivity: the foil constants (theta_stop 20/30/40 deg, aspect 1/2/4, C_L_max 0.8/1.2) are swept, r refitted each time;
the 150 km distance cut is also reported. Nothing about the foils is sourced.

Run: PYTHONPATH=src python3 experiments/run_waveglider.py > experiments/results_waveglider.txt   (about 1 min)"""
import csv
import math
import statistics as st
from marine_hull.waveglider import Foils, Table

D = "experiments/data/"


def rank(x):
    o = sorted(range(len(x)), key=lambda i: x[i])
    r = [0.0] * len(x)
    i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and x[o[j + 1]] == x[o[i]]:
            j += 1
        for k in range(i, j + 1):
            r[o[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = rank(a), rank(b)
    ma, mb = st.fmean(ra), st.fmean(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    return num / math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))


def load(max_km=300.0):
    out = []
    for r in csv.DictReader(open(D + "waveglider_hourly.csv")):
        if float(r["dist_km"]) <= max_km and float(r["speed"]) >= 0.1:
            out.append((r["hour"], float(r["speed"]), float(r["wvht"]), float(r["dpd"])))
    return out


def mae(pred, obs):
    return st.fmean(abs(p - o) for p, o in zip(pred, obs))


R_GRID = [0.02 * 1.15 ** i for i in range(70)]   # 0.02 to about 300


def fit_r(tab, rows):
    best = None
    for r in R_GRID:
        m = mae([tab.speed(r, h, t) for _, _, h, t in rows], [u for _, u, _, _ in rows])
        if best is None or m < best[1]:
            best = (r, m)
    return best


def powerlaw(rows):
    xs = [math.log(h) for _, _, h, _ in rows]
    ys = [math.log(u) for _, u, _, _ in rows]
    mx, my = st.fmean(xs), st.fmean(ys)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return math.exp(my - b * mx), b


def evaluate(rows, tab, label):
    tr = [x for x in rows if x[0] < "2015-08-01"]
    te = [x for x in rows if x[0] >= "2015-08-01"]
    obs = [u for _, u, _, _ in te]
    r, m_tr = fit_r(tab, tr)
    model = [tab.speed(r, h, t) for _, _, h, t in te]
    c = st.median(u for _, u, _, _ in tr)
    a, b = powerlaw(tr)
    pl = [a * h ** b for _, _, h, _ in te]
    out = {"r": r, "model": mae(model, obs), "const": mae([c] * len(obs), obs), "power": mae(pl, obs),
           "bias": st.fmean(p - o for p, o in zip(model, obs)), "a": a, "b": b, "n_tr": len(tr), "n_te": len(te),
           "train_mae": m_tr}
    print(f"{label}: train {out['n_tr']} h, test {out['n_te']} h; fitted r {r:.3f} (train MAE {m_tr:.3f} m/s)")
    print(f"  held-out MAE m/s: model {out['model']:.3f} (bias {out['bias']:+.3f}), constant {out['const']:.3f}, "
          f"power law {out['power']:.3f} (U = {a:.3f} Hs^{b:.3f})")
    print(f"  model/constant {out['model'] / out['const']:.3f}, model/power {out['model'] / out['power']:.3f}")
    return out


def main():
    rows = load()
    print(f"kept hours (<= 300 km, speed >= 0.1 m/s): {len(rows)}")
    sp = [u for _, u, _, _ in rows]
    hs = [h for _, _, h, _ in rows]
    tp = [t for _, _, _, t in rows]
    print(f"speed median {st.median(sp):.3f} m/s ({st.median(sp) * 86.4:.1f} km/day), WVHT median {st.median(hs):.2f} m, "
          f"DPD median {st.median(tp):.1f} s")

    rho1 = spearman(sp, hs)
    print(f"\nP1 Spearman(speed, WVHT) = {rho1:.3f}: {'held' if rho1 >= 0.3 else 'refuted'} (>= 0.3)")
    bins = {}
    for u, h in zip(sp, hs):
        bins.setdefault(int(h / 0.25), []).append(u)
    med = {k: st.median(v) for k, v in bins.items()}
    res = [u - med[int(h / 0.25)] for u, h in zip(sp, hs)]
    rho2 = spearman(res, tp)
    print(f"P2 Spearman(residual from WVHT-bin median, DPD) = {rho2:.3f}: {'held' if rho2 < 0 else 'refuted'} (< 0)")
    print("  speed by WVHT bin (m): n, median m/s")
    for k in sorted(bins):
        if len(bins[k]) >= 20:
            print(f"    {k * 0.25:.2f}-{k * 0.25 + 0.25:.2f}: {len(bins[k]):5d} {st.median(bins[k]):.3f}")

    print()
    tab = Table()
    base = evaluate(rows, tab, "P3 default foils (theta_stop 30, AR 2, CL_max 1.0)")
    ok3 = base["model"] <= 0.85 * base["const"] and base["model"] <= 1.10 * base["power"]
    print(f"P3: {'held' if ok3 else 'refuted'} (model <= 0.85 x constant and <= 1.10 x power law)")

    hi = [u for u, h in zip(sp, hs) if h >= 2.5]
    lo = [u for u, h in zip(sp, hs) if h <= 1.5]
    ratio = st.median(hi) / st.median(lo)
    r = base["r"]
    mh = [tab.speed(r, h, t) for h, t in zip(hs, tp) if h >= 2.5]
    ml = [tab.speed(r, h, t) for h, t in zip(hs, tp) if h <= 1.5]
    print(f"\nP4 median speed WVHT >= 2.5 m ({len(hi)} h) / WVHT <= 1.5 m ({len(lo)} h): data {ratio:.3f}, "
          f"model {st.median(mh) / st.median(ml):.3f}, mean-height ratio "
          f"{st.fmean(h for h in hs if h >= 2.5) / st.fmean(h for h in hs if h <= 1.5):.3f}: "
          f"{'held' if 1.2 <= ratio <= 2.0 else 'refuted'} (data in 1.2 to 2.0)")

    print("\nSensitivity, foil constants (r refitted on the training hours each time):")
    print("  theta_stop AR CL_max | r | test MAE model / constant / power")
    for ts in (20.0, 30.0, 40.0):
        for ar in (1.0, 2.0, 4.0):
            for clm in (0.8, 1.2):
                t2 = Table(Foils(theta_stop=ts, aspect=ar, cl_max=clm))
                tr = [x for x in rows if x[0] < "2015-08-01"]
                te = [x for x in rows if x[0] >= "2015-08-01"]
                rr, _ = fit_r(t2, tr)
                m = mae([t2.speed(rr, h, t) for _, _, h, t in te], [u for _, u, _, _ in te])
                print(f"  {ts:4.0f} {ar:3.0f} {clm:4.1f} | {rr:7.3f} | {m:.3f} / {base['const']:.3f} / {base['power']:.3f}")
    print("\nSensitivity, buoy distance <= 150 km:")
    evaluate(load(150.0), tab, "  default foils")

    print("\nP5 km/day at the programme buoys, 2024 (fitted default model; hourly WVHT and DPD):")
    by = {}
    for x in csv.DictReader(open(D + "ndbc_waves_2024.csv")):
        by.setdefault((x["buoy"], int(x["month"])), []).append(tab.speed(r, float(x["wvht"]), float(x["dpd"])))
    a, b = base["a"], base["b"]
    pl = {}
    for x in csv.DictReader(open(D + "ndbc_waves_2024.csv")):
        pl.setdefault((x["buoy"], int(x["month"])), []).append(a * float(x["wvht"]) ** b)
    held = True
    for m, wind in ((1, 126), (7, 80)):
        days = sorted((st.fmean(v) * 86.4, k[0]) for k, v in by.items() if k[1] == m and len(v) >= 500)
        pdays = [st.fmean(v) * 86.4 for k, v in pl.items() if k[1] == m and len(v) >= 500]
        md = st.median(d for d, _ in days)
        print(f"  month {m}: {len(days)} buoys, model median {md:.1f} km/day (min {days[0][0]:.1f} at {days[0][1]}, "
              f"max {days[-1][0]:.1f} at {days[-1][1]}); power law median {st.median(pdays):.1f}; "
              f"solar ceiling 86, wind drone {wind}")
        held = held and md < 86 and md < wind
    print(f"P5: {'held' if held else 'refuted'} (model median below solar ceiling and wind drone in both months)")


if __name__ == "__main__":
    main()
