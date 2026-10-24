"""Grid of pump-10 windows on Net3 against time-of-use tariffs.   PYTHONPATH=src python experiments/run.py > experiments/results.txt"""
import itertools
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_pumpsched.sched import cost, simulate, tariff, total_kwh  # noqa: E402

STARTS = range(24)
HOURS = list(range(6, 23)) + [24]
DRIFT_MAX = 0.01      # share of the day's demand that the tanks may gain or lose over the scored day
TANK_MARGIN = 0.5     # m above each tank's minimum level, all of days 2-3
BASE = (1, 14)        # Net3 as shipped: 01:00 to 15:00


def fmt(x, n=0):
    return f"{x:,.{n}f}"


def main():
    res = {}
    for s, h in itertools.product(STARTS, HOURS):
        if h == 24 and s > 0:
            continue
        res[(s, h)] = simulate(s, h)
    base = res[BASE]

    def ok(r, pmin):
        return (r["min_pressure"] >= pmin and r["tank_min_margin"] >= TANK_MARGIN
                and abs(r["drift_m3"]) <= DRIFT_MAX * r["demand_m3"])

    print("== A. Net3 as shipped (pump 10 01:00-15:00), last of 3 days")
    print(f"energy {fmt(total_kwh(base))} kWh (pump 10 {fmt(base['kwh']['10'].sum())}, pump 335 {fmt(base['kwh']['335'].sum())}); "
          f"pump 10 delivers {fmt(base['pump10_m3'])} m3 of {fmt(base['demand_m3'])} m3 demand; "
          f"min service pressure {base['min_pressure']:.1f} m; tank margin {base['tank_min_margin']:.2f} m; drift {base['drift_m3']:.0f} m3")
    print(f"windows simulated {len(res)}")

    feas = {pm: [k for k, r in res.items() if ok(r, pm)] for pm in (14.06, 20.0, 25.0)}
    print("\n== B. Feasible windows by minimum service pressure (tank margin >= 0.5 m, drift <= 1 % of demand)")
    for pm, ks in feas.items():
        print(f"min pressure {pm:5.2f} m | {len(ks)} of {len(res)} windows feasible")

    print("\n== C. Flat tariff: energy only (which window uses least kWh), min pressure 14.06 m")
    ks = feas[14.06]
    best = min(ks, key=lambda k: total_kwh(res[k]))
    print(f"best window start {best[0]:02d}:00 for {best[1]} h: {fmt(total_kwh(res[best]))} kWh vs {fmt(total_kwh(base))} shipped "
          f"({100 * (1 - total_kwh(res[best]) / total_kwh(base)):.1f} % less); worst feasible {fmt(max(total_kwh(res[k]) for k in ks))} kWh")

    print("\n== D. Cost saved against the shipped window, best feasible window per tariff, min pressure 14.06 m")
    print("tariff | peak/off-peak | best start | hours | cost saved % | of which kWh saved % | cost saved % at 25 m")
    rows = []
    for kind in ("evening", "daytime", "midday-cheap"):
        for ratio in (1.5, 2, 3, 5, 10):
            pr = tariff(kind, ratio)
            c0, e0 = cost(base, pr), total_kwh(base)
            out = []
            for pm in (14.06, 25.0):
                k = min(feas[pm], key=lambda k: cost(res[k], pr))
                out.append((k, 100 * (1 - cost(res[k], pr) / c0), 100 * (1 - total_kwh(res[k]) / e0)))
            (k, sv, ekw), (_, sv25, _) = out
            print(f"{kind} | {ratio} | {k[0]:02d}:00 | {k[1]} | {sv:.1f} | {ekw:.1f} | {sv25:.1f}")
            rows.append((kind, ratio, k, sv, ekw))

    print("\n== E. Where the saving comes from: pump 10 hours inside the cheap hours (evening tariff, ratio 3), min pressure 14.06 m")
    pr = tariff("evening", 3)
    kbest = min(feas[14.06], key=lambda k: cost(res[k], pr))
    for lab, k in (("shipped", BASE), ("best", kbest)):
        r = res[k]
        e10, e335 = r["kwh"]["10"], r["kwh"]["335"]
        print(f"{lab:8s} {k[0]:02d}:00 {k[1]:2d} h | pump 10 {fmt(e10.sum())} kWh, share in 16-21: {100 * e10[16:21].sum() / max(e10.sum(), 1e-9):.0f} % | "
              f"pump 335 {fmt(e335.sum())} kWh, share in 16-21: {100 * e335[16:21].sum() / e335.sum():.0f} % | cost {cost(r, pr):,.0f}")

    print("\n== F. Cost at evening tariff ratio 3 by start hour, shortest feasible duration at each start (14.06 m)")
    print("start | hours | cost / shipped cost")
    c0 = cost(base, pr)
    for s in STARTS:
        cand = [k for k in feas[14.06] if k[0] == s]
        if cand:
            k = min(cand, key=lambda k: cost(res[k], pr))
            print(f"{s} | {k[1]} | {cost(res[k], pr) / c0:.3f}")
        else:
            print(f"{s} | none | nan")

    print("\n== G. What the tariff adds beyond the flat-tariff best window (min pressure 14.06 m)")
    print("tariff | peak/off-peak | flat-best window cost / shipped | tariff-best window cost / shipped | extra saving from the tariff, % of shipped cost")
    kflat = min(feas[14.06], key=lambda k: total_kwh(res[k]))
    for kind in ("evening", "daytime", "midday-cheap"):
        for ratio in (1.5, 3, 10):
            pr = tariff(kind, ratio)
            c0 = cost(base, pr)
            kb = min(feas[14.06], key=lambda k: cost(res[k], pr))
            a, b = cost(res[kflat], pr) / c0, cost(res[kb], pr) / c0
            print(f"{kind} | {ratio} | {a:.3f} | {b:.3f} | {100 * (a - b):.1f}")

    print("\n== H. Share of pump energy in the peak hours, shipped window and flat-best window")
    for lab, k in (("shipped", BASE), ("flat-best", kflat)):
        e = res[k]["kwh"]["10"] + res[k]["kwh"]["335"]
        print(f"{lab:9s} {k[0]:02d}:00 {k[1]} h | in 16-21: {100 * e[16:21].sum() / e.sum():.0f} % | in 08-20: {100 * e[8:20].sum() / e.sum():.0f} %")


if __name__ == "__main__":
    main()
