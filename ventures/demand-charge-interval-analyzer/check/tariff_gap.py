"""Real utility tariffs (URDB) on full-year buildings: is the shipped plan
optimal, and how far off was the one-window form of the page?

Rates: the two URDB rates in fixtures/urdb/ (SCE GS-2 TOU-B 2015 on the
California buildings, Entergy Arkansas LPS-TOU 2018 on the Arkansas ones).
Buildings: check/data/comstock_ca_ar.json (`python3 check/fetch_comstock.py
--states CA,AR --out comstock_ca_ar.json`; NREL ComStock AMY2018, EnergyPlus
simulations on real 2018 weather, CC BY 4.0, not meters). Batteries: 10% and
25% of the building's peak kW, 2 hours, 90% usable, 88% round trip. No
ratchet; holidays as URDB writes them (none).

(1) Exactness. Every complete month is solved as one linear programme by
HiGHS (SciPy), with every demand period of the month as its own cap variable,
the month's flat demand rate, the per-interval energy price and the battery
model the page states (as check/joint_gap.py), and compared with
tariffBattery's month bill (fixed charge excluded). The per-interval price and
period arrays come from tariff.mjs expand(), which tariff.test.mjs checks by
hand; the LP and its solver are independent.

(2) What the one-window page would have said: check/tariff_gap.mjs
oneWindow() turns each rate into the single window a person would type from
its summer section; touBattery's yearly saving under that is compared with the
real tariff's.

Usage: python3 check/tariff_gap.py   (about 5 minutes; needs numpy, scipy, node)
"""
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
ROOT = os.path.dirname(HERE)
H = 0.25
RATES = {"CA": "sce-gs2-tou-b-2015.json", "AR": "entergy-arkansas-lps-tou-2018.json"}
SIZES = [(0.10, 2), (0.25, 2)]


def solve_month(load, price, period, rates, rate_f, bat):
    n = len(load)
    E, P, eta = bat["kwh"], bat["kw"], math.sqrt(bat["roundTrip"])
    pmin = float(price.min())
    ks = [k for k in range(len(rates)) if rates[k] > 0 and np.any(period == k)]
    ic, id_, is_ = 0, n, 2 * n
    iF = 3 * n + 1
    iK = {k: iF + 1 + j for j, k in enumerate(ks)}
    nv = iF + 1 + len(ks)
    cost = np.zeros(nv)
    cost[ic:ic + n] = H * price
    cost[id_:id_ + n] = -H * price
    cost[is_ + n] = -pmin / eta
    cost[iF] = rate_f
    for k in ks:
        cost[iK[k]] = rates[k]
    const = float(H * (price * load).sum() + E / eta * pmin)
    t = np.arange(n)
    r = np.concatenate([t, t, t, t, [n]])
    cidx = np.concatenate([is_ + t + 1, is_ + t, ic + t, id_ + t, [is_]])
    v = np.concatenate([np.ones(n), -np.ones(n), -H * eta * np.ones(n), H / eta * np.ones(n), [1.0]])
    Aeq = coo_matrix((v, (r, cidx)), shape=(n + 1, nv)).tocsr()
    beq = np.zeros(n + 1)
    beq[n] = E
    rows = [t, t, n + t, n + t, n + t]
    cols = [ic + t, id_ + t, ic + t, id_ + t, np.full(n, iF)]
    vals = [-np.ones(n), np.ones(n), np.ones(n), -np.ones(n), -np.ones(n)]
    bub = [load, -load]
    nr = 2 * n
    for k in ks:
        ix = np.flatnonzero(period == k)
        m = len(ix)
        rr = nr + np.arange(m)
        rows += [rr, rr, rr]
        cols += [ic + ix, id_ + ix, np.full(m, iK[k])]
        vals += [np.ones(m), -np.ones(m), -np.ones(m)]
        bub.append(-load[ix])
        nr += m
    Aub = coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(nr, nv)).tocsr()
    bounds = [(0, P)] * (2 * n) + [(0, E)] * (n + 1) + [(0, None)] * (1 + len(ks))
    res = linprog(cost, A_ub=Aub, b_ub=np.concatenate(bub), A_eq=Aeq, b_eq=beq, bounds=bounds, method="highs")
    if res.status != 0:
        raise RuntimeError(res.message)
    return res.fun + const


def main():
    blds = json.load(open(os.path.join(HERE, "data", "comstock_ca_ar.json")))
    rates = {st: json.load(open(os.path.join(ROOT, "fixtures", "urdb", f))) for st, f in RATES.items()}
    cases = []
    for bi, b in enumerate(blds):
        peak = max(b["kw"])
        for frac, hrs in SIZES:
            kw = round(peak * frac, 3)
            cases.append(dict(b=bi, rate=rates[b["state"]], bat=dict(kw=kw, kwh=round(kw * hrs * 0.9, 3), roundTrip=0.88), size=f"{int(frac*100)}%x{hrs}h"))
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump({"buildings": blds, "cases": [{k: c[k] for k in ("b", "rate", "bat")} for c in cases]}, f)
        tmp = f.name
    t0 = time.time()
    js = json.loads(subprocess.run(["node", "--max-old-space-size=8000", os.path.join(HERE, "tariff_gap.mjs"), tmp], capture_output=True, check=True).stdout)
    os.unlink(tmp)
    print(f"node: {len(cases)} cases in {time.time()-t0:.0f} s", file=sys.stderr)
    series = {}
    for c, j in zip(cases, js):
        if "series" in j:
            series[c["b"]] = j.pop("series")
    out = []
    worst = 0.0
    t0 = time.time()
    for c, j in zip(cases, js):
        b = blds[c["b"]]
        rate = c["rate"]
        drates = [sum(float(t.get(x, 0) or 0) for x in ("rate", "adj")) for t in (p[0] for p in rate.get("demandratestructure", []))]
        months = []
        for mo, ser in zip(j["real"]["months"], series[c["b"]]):
            assert mo["month"] == ser["month"]
            lp = solve_month(np.array(ser["kw"]), np.array(ser["price"]), np.array(ser["period"]), drates, ser["rateF"], c["bat"])
            gap = mo["after"] - lp
            worst = max(worst, gap)
            months.append(dict(month=mo["month"], before=round(mo["before"], 2), shipped=round(mo["after"], 4), highs=round(lp, 4), gap=round(gap, 4), method=mo["method"]))
        out.append(dict(building=b["building"], state=b["state"], peakKw=round(max(b["kw"]), 1), size=c["size"], bat=c["bat"],
                        realBefore=round(j["real"]["before"], 2), realAfter=round(j["real"]["after"], 2), realSaving=round(j["real"]["saving"], 2),
                        demandSaving=round(j["real"]["demandSaving"], 2), energySaving=round(j["real"]["energySaving"], 2),
                        oneWindowBefore=round(j["oneWindow"]["before"], 2), oneWindowSaving=round(j["oneWindow"]["saving"], 2),
                        approx=j["approx"], msNode=round(j["real"]["ms"]), months=months))
    print(f"HiGHS: {sum(len(o['months']) for o in out)} months in {time.time()-t0:.0f} s", file=sys.stderr)
    with open(os.path.join(HERE, "tariff_gap_results.json"), "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(o) for o in out) + "\n]\n")
    print(f"{len(out)} building-years, {sum(len(o['months']) for o in out)} months; worst month above HiGHS ${worst:.4f}")
    for st in RATES:
        rs = [o for o in out if o["state"] == st]
        real = sum(o["realSaving"] for o in rs)
        one = sum(o["oneWindowSaving"] for o in rs)
        print(f"{st} ({RATES[st]}): real-tariff saving ${real:,.0f}/yr total, one-window claimed ${one:,.0f} ({100*(one/real-1):+.0f}%)")
        for o in rs:
            print(f"  {o['building']:<28} {o['size']:<7} bill ${o['realBefore']:>9,.0f} (one-window ${o['oneWindowBefore']:>9,.0f})  saving ${o['realSaving']:>8,.0f} (one-window ${o['oneWindowSaving']:>8,.0f})  node {o['msNode']} ms")


if __name__ == "__main__":
    main()
