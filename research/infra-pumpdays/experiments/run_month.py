"""Bill a month of varying days on PG&E B-19 and compare ways of running the pumps.
   PYTHONPATH=src python experiments/run_month.py > experiments/results.txt   (needs experiments/cache_<m>.npz)

A month is DAYS_IN_MONTH days; each day has a demand multiplier m (all Net3 demands x m, the pattern's shape unchanged).
Energy is summed over the days; each demand charge is its rate times the highest 15-minute kW *of the month* in its period.
Policies, each judged only on days where its schedule is feasible (tanks, pressure, 0.1 % periodic drift) at that day's m:
  fixed-shipped     the shipped schedule every day (the booster runs as the tanks call for it)
  fixed-avg         the cheapest schedule feasible on an average day (m = 1), run every day, even when it fails on a high day
  fixed-robust      the cheapest single schedule feasible on every day of the month
  daily             a schedule chosen each day for that day's m (the cheapest feasible one, ignoring the month's peak)
  daily-peak-aware  each day's schedule chosen to minimise the month's bill given the others (greedy over a peak cap)
"""
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_pumpdays.net import MIN_PRESSURE_M, TANK_MARGIN_M, window  # noqa: E402
from infra_pumpdays.tariff import DAYS_PER_MONTH, SEASONS, hourly_price  # noqa: E402

MULTS = (0.8, 1.0, 1.2, 1.4, 1.6)  # `python run_month.py 1.0 1.2` runs a subset
TOL = 0.001


def load(m):
    z = np.load(HERE / f"cache_{m:g}.npz")
    rows = z["rows"]
    return z["masks"], rows[:, :96] + rows[:, 96:192], rows[:, 192:]


def feas(ext):
    return (ext[:, 0] >= MIN_PRESSURE_M) & (ext[:, 1] >= TANK_MARGIN_M) & (np.abs(ext[:, 2]) <= TOL * ext[:, 3])


def label(m):
    on = [h for h in range(24) if m[h]]
    if not on:
        return "off"
    if len(on) == 24:
        return "24h"
    runs = []
    for h in range(24):
        if m[h] and not m[h - 1]:
            e = h
            while m[(e + 1) % 24]:
                e += 1
            runs.append(f"{h:02d}-{(e + 1) % 24:02d}")
    return "+".join(runs)


def demand_charge(kwmax_any, kwmax_p, kwmax_pp, season):
    d = SEASONS[season]["demand"]
    return d["ANY"] * kwmax_any + d["P"] * kwmax_p + d["PP"] * kwmax_pp


def month(days_kw, season):
    """days_kw: (n_days, 96). Energy over n_days (scaled to a 365/12-day month) + demand on the month's maxima."""
    s = SEASONS[season]
    per = np.array(s["periods"])[np.arange(96) // 4]
    price = np.repeat(hourly_price(season), 4)
    energy = DAYS_PER_MONTH * float((days_kw * 0.25 * price).sum(axis=1).mean())
    pk = days_kw[:, per == "P"].max() if (per == "P").any() else 0.0
    pp = days_kw[:, per == "PP"].max() if (per == "PP").any() else 0.0
    return energy + demand_charge(days_kw.max(), pk, pp, season)


def bill(kwA, kwB, k_hot, season, days=30):
    """Month with days-k_hot ordinary days run on kwA and k_hot hot days on kwB (arrays of 96, or None for no hot days)."""
    w = DAYS_PER_MONTH / days
    rows = [kwA] * (days - k_hot) + [kwB] * k_hot
    return month(np.array(rows), season) if k_hot < days else month(np.array(rows), season)


def best_pair(kwA, kwB, okA, okB, k_hot, season, top=300):
    """Cheapest (A, B) with A feasible on ordinary days and B on hot days, searched over the `top` cheapest of each."""
    cand = lambda kw, ok: np.where(ok)[0][np.argsort([month(kw[i][None], season) for i in np.where(ok)[0]])[:top]]
    ca, cb = cand(kwA, okA), cand(kwB, okB)
    best = (1e18, None, None)
    for a in ca:
        for b in cb:
            v = bill(kwA[a], kwB[b], k_hot, season)
            if v < best[0]:
                best = (v, a, b)
    return best


def main():
    global MULTS
    if sys.argv[1:]:
        MULTS = tuple(sorted(float(a) for a in sys.argv[1:]))
    data = {m: load(m) for m in MULTS}
    masks = data[1.0][0]
    for m in MULTS:
        assert (data[m][0] == masks).all()
    ship = masks.tolist().index(list(window(1, 14)))
    ok = {m: feas(data[m][2]) for m in MULTS}
    kw = {m: data[m][1] for m in MULTS}
    print(f"== A. One schedule on days of different demand (drift {TOL * 100:g} %, {len(masks)} masks)")
    print("m | demand m3/day | shipped: kWh, peak kW, feasible | feasible masks | least-energy feasible: label, kWh, peak kW | lowest feasible peak kW")
    for m in MULTS:
        k, e = kw[m], data[m][2]
        kwh = k.sum(axis=1) * 0.25
        f = np.where(ok[m])[0]
        if len(f) == 0:
            print(f"{m:g} | {e[ship, 3]:,.0f} | {kwh[ship]:,.0f}, {k[ship].max():.0f}, {bool(ok[m][ship])} | 0 | none | none")
            continue
        i = f[np.argmin(kwh[f])]
        j = f[np.argmin(k[f].max(axis=1))]
        print(f"{m:g} | {e[ship, 3]:,.0f} | {kwh[ship]:,.0f}, {k[ship].max():.0f}, {bool(ok[m][ship])} | {len(f)} | {label(masks[i])}, {kwh[i]:,.0f}, {k[i].max():.0f} | {k[j].max():.0f}")

    print("\n== B. A 30-day month: the rest at m = 1, k hot days at m_hot. Monthly pumping bill ($, B-19 energy + demand on the month's maxima)")
    print("season | m_hot | k | policy | schedule(s) | bill $ | peak kW | vs shipped %")
    for season in SEASONS:
        for mh in [m for m in MULTS if m > 1.0]:
            for k_hot in (1, 3, 10):
                rows = []
                sh = bill(kw[1.0][ship], kw[mh][ship], k_hot, season)
                rows.append(("shipped every day", label(masks[ship]), sh, max(kw[1.0][ship].max(), kw[mh][ship].max())))
                f1 = np.where(ok[1.0])[0]
                a = f1[np.argmin([month(kw[1.0][i][None], season) for i in f1])]
                both = ok[1.0] & ok[mh]
                if both.any():
                    fb = np.where(both)[0]
                    r = fb[np.argmin([bill(kw[1.0][i], kw[mh][i], k_hot, season) for i in fb])]
                    rows.append(("one schedule feasible on every day", label(masks[r]), bill(kw[1.0][r], kw[mh][r], k_hot, season), max(kw[1.0][r].max(), kw[mh][r].max())))
                rows.append(("cheapest average-day schedule every day" + ("" if ok[mh][a] else " (INFEASIBLE on hot days)"), label(masks[a]),
                             bill(kw[1.0][a], kw[mh][a], k_hot, season), max(kw[1.0][a].max(), kw[mh][a].max())))
                if ok[mh].any():
                    v, ia, ib = best_pair(kw[1.0], kw[mh], ok[1.0], ok[mh], k_hot, season)
                    rows.append(("a schedule per day type", f"{label(masks[ia])} / {label(masks[ib])}", v, max(kw[1.0][ia].max(), kw[mh][ib].max())))
                for name, lab, v, pk in rows:
                    print(f"{season} | {mh:g} | {k_hot} | {name} | {lab} | {v:,.0f} | {pk:.0f} | {100 * (v / sh - 1):+.1f}")


if __name__ == "__main__":
    main()
