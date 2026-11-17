"""How far is the shipped battery plan from the joint optimum?

For every complete building-month in check/data/opsd_months.json (real meters,
see fetch_opsd.py), three illustrative tariffs and four battery sizes, this
solves the month's dispatch exactly as one linear programme (HiGHS via SciPy)
and compares it with tou.mjs planMonth (run through check/twostep.mjs).
With --no-joint it scores the older two-step plan (demand caps first, then
energy) that planMonth used before jointLP was added on 2026-11-13.

The LP is the same model the page states: facility cap Cf on every interval,
on-peak cap Cp on on-peak intervals, grid-side charge c_t <= kW, delivered
discharge d_t <= kW, stored energy s in [0, E] with s_0 = E and
s_{t+1} = s_t + h (eta c_t - d_t / eta), eta = sqrt(round trip), no export
(L_t + c_t - d_t >= 0), and a terminal charge for refilling to E at the
month's cheapest price. Objective: rateF Cf + rateP Cp + energy cost. The LP
also allows charging and discharging in the same interval, so it is a lower
bound on any physical dispatch (and equal to the best one whenever it does
not use that, which the script counts).

Usage: python3 check/joint_gap.py [--limit N] [--no-joint] [--out FILE]
Needs numpy, scipy and node; about 1 minute with --no-joint, 3-4 with jointLP.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import time

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

HERE = os.path.dirname(os.path.abspath(__file__))
H = 0.25

# Illustrative tariffs (not any utility's): one demand-heavy, one with both
# demand charges, one energy-heavy with a wide on/off spread.
TARIFFS = {
    "demand-heavy": dict(facilityRate=15, onDemandRate=0, onStart=12, onEnd=18, weekdaysOnly=True, onPrice=0.12, offPrice=0.12),
    "both-demand": dict(facilityRate=10, onDemandRate=12, onStart=12, onEnd=18, weekdaysOnly=True, onPrice=0.20, offPrice=0.10),
    "energy-heavy": dict(facilityRate=4, onDemandRate=4, onStart=16, onEnd=21, weekdaysOnly=True, onPrice=0.35, offPrice=0.10),
}
# Battery kW as a share of the building's highest peak, x hours; 90% usable, 88% round trip.
SIZES = [(0.10, 1), (0.10, 2), (0.25, 1), (0.25, 2)]


def on_flags(walls, tr):
    out = np.zeros(len(walls), dtype=bool)
    for i, w in enumerate(walls):
        y, mo, d = int(w[0:4]), int(w[5:7]), int(w[8:10])
        hr = int(w[11:13]) + int(w[14:16]) / 60
        dow = (math.floor((np.datetime64(w[:10]) - np.datetime64("1970-01-01")).astype(int)) + 4) % 7  # 0 = Sunday
        if tr["weekdaysOnly"] and dow in (0, 6):
            continue
        a, b = tr["onStart"], tr["onEnd"]
        out[i] = (a <= hr < b) if a <= b else (hr >= a or hr < b)
    return out


def solve_lp(load, on, price, bat, rf, rp):
    n = len(load)
    E, P, eta = bat["kwh"], bat["kw"], math.sqrt(bat["roundTrip"])
    pmin = float(price.min())
    # variable layout: c[0:n], d[n:2n], s[2n:3n+1] (s_0..s_n), Cf, Cp
    ic, id_, is_, iF, iP = 0, n, 2 * n, 3 * n + 1, 3 * n + 2
    nv = 3 * n + 3
    cost = np.zeros(nv)
    cost[ic:ic + n] = H * price
    cost[id_:id_ + n] = -H * price
    cost[is_ + n] = -pmin / eta
    cost[iF], cost[iP] = rf, rp
    const = float(H * (price * load).sum() + E / eta * pmin)
    t = np.arange(n)
    # equalities: s_{t+1} - s_t - h eta c_t + h/eta d_t = 0 ; s_0 = E
    r = np.concatenate([t, t, t, t, [n]])
    cidx = np.concatenate([is_ + t + 1, is_ + t, ic + t, id_ + t, [is_]])
    v = np.concatenate([np.ones(n), -np.ones(n), -H * eta * np.ones(n), H / eta * np.ones(n), [1.0]])
    Aeq = coo_matrix((v, (r, cidx)), shape=(n + 1, nv)).tocsr()
    beq = np.zeros(n + 1)
    beq[n] = E
    # inequalities: -(c-d) <= L ; (c-d) - Cf <= -L ; on: (c-d) - Cp <= -L
    onx = np.flatnonzero(on)
    m = len(onx)
    rows = [t, t, n + t, n + t, n + t, 2 * n + np.arange(m), 2 * n + np.arange(m), 2 * n + np.arange(m)]
    cols = [ic + t, id_ + t, ic + t, id_ + t, np.full(n, iF), ic + onx, id_ + onx, np.full(m, iP)]
    vals = [-np.ones(n), np.ones(n), np.ones(n), -np.ones(n), -np.ones(n), np.ones(m), -np.ones(m), -np.ones(m)]
    Aub = coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(2 * n + m, nv)).tocsr()
    bub = np.concatenate([load, -load, -load[onx]])
    bounds = [(0, P)] * (2 * n) + [(0, E)] * (n + 1) + [(0, None), (0, None)]
    res = linprog(cost, A_ub=Aub, b_ub=bub, A_eq=Aeq, b_eq=beq, bounds=bounds, method="highs")
    if res.status != 0:
        raise RuntimeError(res.message)
    x = res.x
    c, d = x[ic:ic + n], x[id_:id_ + n]
    both = int(np.sum((c > 1e-6) & (d > 1e-6)))
    g = load + c - d
    # Score from the dispatch itself (as the page bills it), and the LP value.
    fac = float(g.max())
    onk = float(g[on].max()) if m else 0.0
    return dict(score=res.fun + const, facKw=fac, onKw=onk, simultaneous=both)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-joint", action="store_true", help="score the older two-step plan (planMonth without jointLP)")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    if args.out is None:
        args.out = os.path.join(HERE, "joint_gap_twostep.json" if args.no_joint else "joint_gap_results.json")
    months = json.load(open(os.path.join(HERE, "data", "opsd_months.json")))
    if args.limit:
        months = months[: args.limit]
    peaks = {}
    for mo in months:
        peaks[mo["building"]] = max(peaks.get(mo["building"], 0), max(mo["kw"]))
    cases = []
    for mi, mo in enumerate(months):
        for tname, tr in TARIFFS.items():
            for frac, hrs in SIZES:
                kw = max(1.0, peaks[mo["building"]] * frac)
                cases.append(dict(m=mi, tname=tname, tariff=tr, size=f"{int(frac*100)}%x{hrs}h",
                                  bat=dict(kw=kw, kwh=kw * hrs * 0.9, roundTrip=0.88)))
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump({"months": months, "cases": cases}, f)
        tmp = f.name
    t0 = time.time()
    js = json.loads(subprocess.check_output(["node", os.path.join(HERE, "twostep.mjs"), tmp] + (["--no-joint"] if args.no_joint else [])))
    os.unlink(tmp)
    print(f"two-step: {len(cases)} cases in {time.time()-t0:.0f} s", file=sys.stderr)
    onc = {}
    rows = []
    t0 = time.time()
    for c, j in zip(cases, js):
        mo = months[c["m"]]
        key = (c["m"], c["tname"])
        if key not in onc:
            onc[key] = on_flags(mo["t"], c["tariff"])
        on = onc[key]
        load = np.array(mo["kw"], dtype=float)
        price = np.where(on, c["tariff"]["onPrice"], c["tariff"]["offPrice"])
        lp = solve_lp(load, on, price, c["bat"], c["tariff"]["facilityRate"], c["tariff"]["onDemandRate"])
        before = j["scoreBefore"]
        rows.append(dict(building=mo["building"], month=mo["month"], tariff=c["tname"], size=c["size"],
                         before=before, twostep=j["score"], joint=lp["score"], method=j["method"],
                         twostepFacKw=j["facKw"], twostepOnKw=j["onKw"], jointFacKw=lp["facKw"], jointOnKw=lp["onKw"],
                         simultaneous=lp["simultaneous"], jsMs=j["ms"]))
    print(f"LP: {len(cases)} cases in {time.time()-t0:.0f} s", file=sys.stderr)
    for r in rows:
        for k, v in r.items():
            if isinstance(v, float):
                r[k] = round(v, 4)
    with open(args.out, "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(r) for r in rows) + "\n]\n")
    summarise(rows)


def summarise(rows):
    def pct(a):
        return f"{np.mean(a):.2f}% mean, {np.median(a):.2f}% median, {np.max(a):.2f}% max"
    print(f"{len(rows)} building-month x tariff x battery cases")
    for tname in TARIFFS:
        rs = [r for r in rows if r["tariff"] == tname]
        if not rs:
            continue
        bill_gap = [100 * (r["twostep"] - r["joint"]) / r["before"] for r in rs]
        best = [r["before"] - r["joint"] for r in rs]
        got = [r["before"] - r["twostep"] for r in rs]
        share = 100 * (1 - sum(got) / sum(best)) if sum(best) > 0 else 0
        print(f"{tname}: gap as % of the month's bill {pct(bill_gap)}; "
              f"the plan captures {100-share:.1f}% of the joint optimum's total saving "
              f"(${sum(got):,.0f} of ${sum(best):,.0f}); worse than LP by >1% of bill in "
              f"{sum(g > 1 for g in bill_gap)} of {len(rs)}; LP below two-step in {sum(g > 1e-6 for g in bill_gap)}")
    print("LP intervals charging and discharging at once:", sum(r["simultaneous"] for r in rows))


if __name__ == "__main__":
    main()
