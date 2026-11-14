"""Does putting the ratchet inside the battery plan pay, and is it optimal?

For each full-year building in check/data/comstock_year.json (NREL ComStock
simulations, see fetch_comstock.py), three illustrative tariffs with an 80%
ratchet and two battery sizes, this compares:

  month-by-month   tou.mjs touBattery with {yearPlan: false}: each month
                   planned alone (jointLP), the ratchet applied afterwards
                   (the shipped behaviour before 2026-11-14);
  shipped          touBattery as shipped: also plans the whole year as one
                   programme with the ratchet inside it (yearLP) and keeps
                   whichever bills less;
  optimum          the same whole-year LP solved by HiGHS (SciPy), an
                   independent reference written from the model's statement.

The LP: every month is the jointLP block (grid-side charge c_t <= kW,
delivered discharge d_t <= kW, stored energy s in [0, E] starting full each
month, s_{t+1} = s_t + h (eta c_t - d_t / eta), no export, refill to full at
the month's cheapest price), with a facility cap Cf_m and an on-peak cap Cp_m
per month, and billed demand B_m >= Cf_m, B_m >= ratchet x Cf_k for the 11
months before. Objective: sum of rateF B_m + rateP Cp_m + energy.
It allows charging and discharging in one interval, so it is a lower bound
on any physical dispatch.

Usage: python3 check/ratchet_gap.py [--limit N] [--jobs 4] [--out FILE]
Needs numpy, scipy and node; about 15 minutes on 4 cores.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix, hstack, vstack, block_diag, csr_matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from joint_gap import TARIFFS, on_flags  # noqa: E402

H = 0.25
RATCHET = 80
SIZES = [(0.10, 2), (0.25, 2)]


def month_lp(load, on, price, bat):
    """One month's jointLP pieces without the caps' objective terms.
    Variables: c[0:n], d[n:2n], s[2n:3n+1]; returned with the rows that tie the
    month's grid draw to its caps: (c-d) - Cf <= -L (facility), on: (c-d) - Cp <= -L."""
    n = len(load)
    E, P, eta = bat["kwh"], bat["kw"], math.sqrt(bat["roundTrip"])
    pmin = float(price.min())
    nv = 3 * n + 1
    ic, id_, is_ = 0, n, 2 * n
    cost = np.zeros(nv)
    cost[ic:ic + n] = H * price
    cost[id_:id_ + n] = -H * price
    cost[is_ + n] = -pmin / eta
    const = float(H * (price * load).sum() + E / eta * pmin)
    t = np.arange(n)
    r = np.concatenate([t, t, t, t, [n]])
    cidx = np.concatenate([is_ + t + 1, is_ + t, ic + t, id_ + t, [is_]])
    v = np.concatenate([np.ones(n), -np.ones(n), -H * eta * np.ones(n), H / eta * np.ones(n), [1.0]])
    Aeq = coo_matrix((v, (r, cidx)), shape=(n + 1, nv)).tocsr()
    beq = np.zeros(n + 1)
    beq[n] = E
    # no export: -(c - d) <= L
    noexp = coo_matrix((np.concatenate([-np.ones(n), np.ones(n)]), (np.concatenate([t, t]), np.concatenate([ic + t, id_ + t]))), shape=(n, nv)).tocsr()
    fac = coo_matrix((np.concatenate([np.ones(n), -np.ones(n)]), (np.concatenate([t, t]), np.concatenate([ic + t, id_ + t]))), shape=(n, nv)).tocsr()
    onx = np.flatnonzero(on)
    m = len(onx)
    onr = coo_matrix((np.concatenate([np.ones(m), -np.ones(m)]), (np.concatenate([np.arange(m)] * 2), np.concatenate([ic + onx, id_ + onx]))), shape=(m, nv)).tocsr()
    bounds = [(0, P)] * (2 * n) + [(0, E)] * (n + 1)
    return dict(n=n, nv=nv, cost=cost, const=const, Aeq=Aeq, beq=beq, noexp=noexp, noexp_b=load.copy(),
                fac=fac, fac_b=-load, onr=onr, on_b=-load[onx], bounds=bounds)


def solve_year(months, bat, rf, rp, ratchet):
    blocks = [month_lp(mo["load"], mo["on"], mo["price"], bat) for mo in months]
    M = len(blocks)
    nvb = sum(b["nv"] for b in blocks)
    # extra variables after the blocks: Cf_m, Cp_m, B_m
    iCf, iCp, iB = nvb, nvb + M, nvb + 2 * M
    nv = nvb + 3 * M
    cost = np.concatenate([b["cost"] for b in blocks] + [np.zeros(M), rp * np.ones(M), rf * np.ones(M)])
    const = sum(b["const"] for b in blocks)
    Aeq = block_diag([b["Aeq"] for b in blocks], format="csr")
    Aeq = hstack([Aeq, csr_matrix((Aeq.shape[0], 3 * M))]).tocsr()
    beq = np.concatenate([b["beq"] for b in blocks])
    ub_rows, ub_b = [], []
    off = 0
    for m, b in enumerate(blocks):
        def place(A, extra_col=None):
            A = A.tocoo()
            rows, cols, vals = list(A.row), list(A.col + off), list(A.data)
            if extra_col is not None:
                rows += list(range(A.shape[0]))
                cols += [extra_col] * A.shape[0]
                vals += [-1.0] * A.shape[0]
            return coo_matrix((vals, (rows, cols)), shape=(A.shape[0], nv))
        ub_rows.append(place(b["noexp"])); ub_b.append(b["noexp_b"])
        ub_rows.append(place(b["fac"], iCf + m)); ub_b.append(b["fac_b"])
        if b["onr"].shape[0]:
            ub_rows.append(place(b["onr"], iCp + m)); ub_b.append(b["on_b"])
        off += b["nv"]
    # ratchet: coef Cf_k - B_m <= 0
    rr, rc, rv = [], [], []
    k_row = 0
    for m in range(M):
        for k in range(max(0, m - 11), m + 1):
            coef = 1.0 if k == m else ratchet / 100
            rr += [k_row, k_row]; rc += [iCf + k, iB + m]; rv += [coef, -1.0]
            k_row += 1
    ub_rows.append(coo_matrix((rv, (rr, rc)), shape=(k_row, nv))); ub_b.append(np.zeros(k_row))
    Aub = vstack(ub_rows).tocsr()
    bub = np.concatenate(ub_b)
    bounds = sum((b["bounds"] for b in blocks), []) + [(0, None)] * (3 * M)
    res = linprog(cost, A_ub=Aub, b_ub=bub, A_eq=Aeq, b_eq=beq, bounds=bounds, method="highs")
    if res.status != 0:
        raise RuntimeError(res.message)
    return res.fun + const


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--out", default=os.path.join(HERE, "ratchet_gap_results.json"))
    args = ap.parse_args()
    buildings = json.load(open(os.path.join(HERE, "data", "comstock_year.json")))
    if args.limit:
        buildings = buildings[: args.limit]
    cases = []
    for bi, bd in enumerate(buildings):
        peak = max(bd["kw"])
        for tname, tr in TARIFFS.items():
            for frac, hrs in SIZES:
                kw = max(1.0, peak * frac)
                cases.append(dict(b=bi, tname=tname, tariff=tr, size=f"{int(frac*100)}%x{hrs}h", ratchet=RATCHET,
                                  bat=dict(kw=kw, kwh=kw * hrs * 0.9, roundTrip=0.88)))

    def run_js(chunk):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"buildings": buildings, "cases": chunk}, f)
            tmp = f.name
        out = json.loads(subprocess.check_output(["node", os.path.join(HERE, "ratchet_gap.mjs"), tmp]))
        os.unlink(tmp)
        return out

    t0 = time.time()
    chunks = [cases[i::args.jobs] for i in range(args.jobs)]
    with ThreadPoolExecutor(args.jobs) as ex:
        parts = list(ex.map(run_js, chunks))
    js = [None] * len(cases)
    for i, part in enumerate(parts):
        for k, r in enumerate(part):
            js[i + k * args.jobs] = r
    print(f"node: {len(cases)} cases in {time.time()-t0:.0f} s", file=sys.stderr)

    def months_of(bd, tr):
        walls = np.array(bd["walls"])
        kw = np.array(bd["kw"], dtype=float)
        on = on_flags(list(walls), tr)
        price = np.where(on, tr["onPrice"], tr["offPrice"])
        keys = np.array([w[:7] for w in walls])
        out = []
        for k in sorted(set(keys)):
            sel = keys == k
            out.append(dict(load=kw[sel], on=on[sel], price=price[sel]))
        return out

    def run_lp(c):
        mos = months_of(buildings[c["b"]], c["tariff"])
        return solve_year(mos, c["bat"], c["tariff"]["facilityRate"], c["tariff"]["onDemandRate"], c["ratchet"])

    t0 = time.time()
    with ThreadPoolExecutor(args.jobs) as ex:
        opt = list(ex.map(run_lp, cases))
    print(f"HiGHS: {len(cases)} cases in {time.time()-t0:.0f} s", file=sys.stderr)
    rows = []
    for c, j, o in zip(cases, js, opt):
        rows.append(dict(building=buildings[c["b"]]["building"], tariff=c["tname"], size=c["size"], ratchet=c["ratchet"],
                         before=j["before"], monthByMonth=j["monthByMonth"], shipped=j["shipped"], optimum=o,
                         yearPlanUsed=j["used"], solverIterations=j["iterations"], msMonth=j["msMonth"], msYear=j["msYear"]))
    for r in rows:
        for k, v in r.items():
            if isinstance(v, float):
                r[k] = round(v, 2)
    with open(args.out, "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(r) for r in rows) + "\n]\n")
    summarise(rows)


def summarise(rows):
    print(f"{len(rows)} building x tariff x battery cases, {RATCHET}% ratchet")
    for tname in TARIFFS:
        rs = [r for r in rows if r["tariff"] == tname]
        if not rs:
            continue
        best = sum(r["before"] - r["optimum"] for r in rs)
        mbm = sum(r["before"] - r["monthByMonth"] for r in rs)
        shp = sum(r["before"] - r["shipped"] for r in rs)
        gap_mbm = [100 * (r["monthByMonth"] - r["optimum"]) / r["before"] for r in rs]
        gap_shp = [r["shipped"] - r["optimum"] for r in rs]
        print(f"{tname}: optimum saves ${best:,.0f}/yr in total; month-by-month captures {100*mbm/best:.1f}% "
              f"(worst case {max(gap_mbm):.2f}% of the yearly bill above optimum); shipped captures {100*shp/best:.2f}% "
              f"(worst case ${max(gap_shp):,.2f}/yr above optimum); whole-year plan kept in "
              f"{sum(r['yearPlanUsed'] for r in rs)} of {len(rs)}")


if __name__ == "__main__":
    main()
