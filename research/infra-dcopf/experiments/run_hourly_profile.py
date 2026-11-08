"""Previous-hour penalty factors on a real hourly load profile (AEP zone, PJM, 2017).

Load shape: AEP_hourly.csv (PJM Data Miner 2 data via a public mirror, see data/README.md),
scaled so the year's peak hour is k=PEAK_K of case118's load. Each hour's case118 load is
scaled by that k. For each hour h of the chosen weeks: plain DC, penalty factors taken at
the AC optimum of hour h-1 (what a real-time operator has), and at hour h itself (oracle).
Metric: AC cost of the dispatch above the AC optimum at hour h. Writes
experiments/results_hourly_profile.txt."""
import csv, sys, statistics as st
from infra_dcopf import (load_case, scaled, solve_ac, solve_dc, ac_check_of_dispatch,
                         ac_optimum_penalty_dc, previous_interval_penalty_dc)

PEAK_K = 1.1
WEEKS = {"winter 2017-01-16": "2017-01-16", "summer 2017-07-17": "2017-07-17"}

def profile():
    rows = [(r[0], float(r[1])) for r in list(csv.reader(open("data/AEP_hourly.csv")))[1:]]
    year = [v for t, v in rows if t.startswith("2017")]
    pk = max(year)
    return {t: v / pk * PEAK_K for t, v in rows}

if __name__ == "__main__":
    prof = profile()
    net = load_case("case118")
    out = open("experiments/results_hourly_profile.txt", "w")
    print(f"case118, AEP 2017 hourly load shape, year peak -> k={PEAK_K}; AC cost above AC optimum (%)", file=out)
    print("hour  k  plain%  prevhour%  oracle%", file=out)
    summary = {}
    for name, start in WEEKS.items():
        keys = sorted(t for t in prof if t >= start + " 00:00:00")[:168]
        prev = None; res = []
        for t in keys:
            k = prof[t]; nc = scaled(net, k)
            ac = solve_ac(nc)
            if ac is None:
                print(f"{t} {k:.3f} no AC solution", file=out, flush=True); prev = None; continue
            dc = solve_dc(nc); orc, _ = ac_optimum_penalty_dc(nc, ac)
            pv = None
            if prev is not None:
                pv, _ = previous_interval_penalty_dc(nc, prev[1], prev[0])
            prev = (nc, ac)
            sols = [dc, pv, orc]
            e = []
            for s in sols:
                c = ac_check_of_dispatch(nc, s) if s is not None else {}
                e.append(100 * (c["cost"] - ac.res_cost) / ac.res_cost if c.get("converged") else float("nan"))
            print(f"{t} {k:.3f} {e[0]:7.3f} {e[1]:8.3f} {e[2]:7.3f}", file=out, flush=True)
            res.append(e)
        summary[name] = res
    print("\nsummary (mean, median, hours counted; nan excluded)", file=out)
    for name, res in summary.items():
        for j, lab in enumerate(["plain", "prevhour", "oracle"]):
            v = [r[j] for r in res if r[j] == r[j]]
            if v:
                print(f"{name} {lab}: mean {st.mean(v):.3f} median {st.median(v):.3f} n {len(v)} of {len(res)}", file=out)
    out.close()
