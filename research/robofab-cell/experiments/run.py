"""Experiments for robofab-cell. Deterministic: seeds 0..N_REP-1, common random numbers across
configurations. Writes experiments/results.{txt,json}. Standard library only."""
import json
import math
import os
import statistics as st
import sys
from dataclasses import replace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_cell import CellParams, draw_batch, simulate, lower_bound  # noqa: E402
from robofab_cell.cell import mean_batch  # noqa: E402

N_JOBS, N_REP = 30, 200
BASE = CellParams()
OUT = []
RES = {}


def say(s=""):
    print(s)
    OUT.append(s)


def reps(p, rule="unload_first", order="fifo"):
    return [simulate(p, draw_batch(p, N_JOBS, s), rule, order) for s in range(N_REP)]


def ci(xs):
    m = st.mean(xs)
    h = 1.96 * st.stdev(xs) / math.sqrt(len(xs))
    return m, h


say(f"robofab-cell: {N_JOBS} parts per batch, {N_REP} replications (seeds 0..{N_REP-1}), minutes.")
say(f"Base: {BASE}")
say("Intervals are 95% normal-approximation half-widths of the mean over replications.")

# E1 -------------------------------------------------------------------------------------
say("\nE1. Printer sweep (1 arm, 1 inspection station, unload_first, fifo)")
say("n_pr  makespan(min)      lower_bnd  util_arm util_prn util_ins  bottleneck  reworks")
RES["E1"] = []
for n in range(1, 9):
    p = replace(BASE, n_printers=n)
    rs = reps(p)
    m, h = ci([r["makespan"] for r in rs])
    lb = st.mean(lower_bound(p, draw_batch(p, N_JOBS, s)) for s in range(N_REP))
    u = {k: st.mean(r["util"][k] for r in rs) for k in ("arm", "printer", "inspect")}
    bn = max(u, key=u.get)
    rw = st.mean(r["reworks"] for r in rs)
    say(f"{n:4d}  {m:7.1f} +- {h:4.1f}   {lb:9.1f}  {u['arm']:8.2f} {u['printer']:8.2f} {u['inspect']:8.2f}  {bn:10s}  {rw:6.2f}")
    RES["E1"].append({"n_printers": n, "makespan": m, "half_width": h, "lower_bound": lb, "util": u, "bottleneck": bn, "reworks": rw})

# E2 -------------------------------------------------------------------------------------
say("\nE2. Dispatch rules, paired against (unload_first, fifo) on identical batches")
RES["E2"] = []
for n in (3, 5):
    p = replace(BASE, n_printers=n)
    base = reps(p, "unload_first", "fifo")
    say(f"n_printers={n}: baseline makespan {st.mean(r['makespan'] for r in base):.1f}, mean flow {st.mean(r['mean_flow'] for r in base):.1f}")
    say("  arm_rule       job_order  d_makespan(min)      d_meanflow(min)")
    for rule in ("unload_first", "load_first"):
        for order in ("fifo", "spt", "lpt"):
            if (rule, order) == ("unload_first", "fifo"):
                continue
            rs = reps(p, rule, order)
            dm = ci([a["makespan"] - b["makespan"] for a, b in zip(rs, base)])
            df = ci([a["mean_flow"] - b["mean_flow"] for a, b in zip(rs, base)])
            say(f"  {rule:13s}  {order:5s}   {dm[0]:+7.2f} +- {dm[1]:4.2f}   {df[0]:+8.2f} +- {df[1]:4.2f}")
            RES["E2"].append({"n_printers": n, "arm_rule": rule, "job_order": order, "d_makespan": dm, "d_meanflow": df})

# E3 -------------------------------------------------------------------------------------
say("\nE3. What-if upgrades, paired against the 6-printer / 1 arm / 1 inspection cell")
p6 = replace(BASE, n_printers=6)
base = reps(p6)
say(f"baseline makespan {st.mean(r['makespan'] for r in base):.1f}")
RES["E3"] = []
for name, p in (("+1 printer", replace(p6, n_printers=7)), ("+1 arm", replace(p6, n_arms=2)),
                ("+1 inspection", replace(p6, n_inspect=2)),
                ("+1 arm +1 inspection", replace(p6, n_arms=2, n_inspect=2)),
                ("inspection 6->3 min", replace(p6, inspect=3.0)),
                ("load+unload 2->1 min", replace(p6, load=1.0, unload=1.0))):
    rs = reps(p)
    d = ci([a["makespan"] - b["makespan"] for a, b in zip(rs, base)])
    say(f"  {name:22s} d_makespan {d[0]:+7.1f} +- {d[1]:4.1f}")
    RES["E3"].append({"change": name, "d_makespan": d})

# E4 -------------------------------------------------------------------------------------
say("\nE4. Fidelity: deterministic twin (mean print time, no rejects) vs the stochastic cell")
say("n_pr  det_twin  stochastic_mean  twin_optimism(min)   share_of_runs_where_twin_below_actual")
RES["E4"] = []
for n in range(1, 9):
    p = replace(BASE, n_printers=n)
    det = simulate(p, mean_batch(p, N_JOBS))["makespan"]
    ms = [r["makespan"] for r in reps(p)]
    m, h = ci(ms)
    below = sum(det < x for x in ms) / len(ms)
    say(f"{n:4d}  {det:8.1f}  {m:8.1f} +- {h:4.1f}   {m-det:+8.1f}            {below:.2f}")
    RES["E4"].append({"n_printers": n, "det": det, "stoch_mean": m, "optimism": m - det, "share_twin_below": below})

here = os.path.dirname(__file__)
open(os.path.join(here, "results.txt"), "w").write("\n".join(OUT) + "\n")
json.dump(RES, open(os.path.join(here, "results.json"), "w"), indent=1)
