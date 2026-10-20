"""Experiments for robofab-cell-ctmc. Writes results.txt and results.json. Fixed seeds.

Single job class: load 2 min, unload 2 min, inspect 3 min (one inspector), failure probability q = 0.15
(only scales the good-part rate), print time 20 or 60 min with Erlang-k variability. Rates are good parts/h.
"""
import json, pathlib, sys, math
import numpy as np
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_ctmc.ctmc import build, stationary, throughput
from robofab_cell_ctmc.mva import mva, cell_demands, balanced_bounds
from robofab_cell_ctmc.sim import replicate

LOAD, UNLOAD, INSP, Q = 2.0, 2.0, 3.0, 0.15
SEEDS = range(10)
lines, out = [], {"validation": [], "decomposition": []}
def say(s=""):
    lines.append(s); print(s)

def mva_pred(tp, P, N, held):
    T = [dict(weight=1, print=tp, load=LOAD, unload=UNLOAD, inspect=INSP, q=Q)]
    D, m = cell_demands(T, P, 1, hold_printer=held)
    return 60 * mva(D, m, N)[0], 60 * balanced_bounds(D, m, N)

say("1. Validation: exact CTMC against a discrete-event simulation with the same rules (10 seeds, 200000 min, 5000 min warm-up).")
say("   z = (sim - ctmc) / s.e.; rates in good parts/h; ln = lognormal print time with the same mean and cv.\n")
zs = []
for tp, P, N, k in [(20, 2, 3, 1), (20, 4, 4, 4), (20, 4, 8, 4), (20, 6, 6, 4), (20, 6, 12, 4), (60, 4, 6, 4),
                    (60, 6, 12, 4), (20, 4, 8, 9), (60, 4, 8, 9), (20, 4, 8, 1)]:
    rate, stall, ns = throughput(N, P, k, tp, LOAD, UNLOAD, INSP, Q)
    s = replicate(N, P, k, tp, LOAD, UNLOAD, INSP, Q, seeds=SEEDS)
    z = (60 * s[0] - 60 * rate) / (60 * s[1])
    zs.append(z)
    say(f"   print {tp:2d} P={P} N={N:2d} k={k}  states {ns:6d}  ctmc {60*rate:6.3f}  sim {60*s[0]:6.3f}+/-{60*s[1]:.3f}  z {z:+.2f}")
    out["validation"].append(dict(print=tp, P=P, N=N, k=k, states=ns, ctmc=60 * rate, sim=[60 * s[0], 60 * s[1]], z=z))
say(f"\n   rows {len(zs)}, |z| max {max(abs(z) for z in zs):.2f}, mean z {sum(zs)/len(zs):+.2f}, rows with |z|>2: {sum(abs(z)>2 for z in zs)}\n")
out["z_max_abs"] = max(abs(z) for z in zs)

say("2. Where the MVA error comes from. exact(k) is the CTMC with Erlang-k print (cv = 1/sqrt(k)).")
say("   The k=1 rows use exponential times throughout, as MVA assumes, so the gap between MVA and exact(k=1) is the cell's")
say("   structure alone (printer held through load and unload, finite printers, unload priority). The last column,")
say("   exact(k=1) against exact(k), is what variability in the print time adds. Other columns: percent error of each")
say("   predictor against exact(k).\n")
rows = []
for tp in (20, 60):
    for P in (2, 4, 6):
        for N in sorted({P, P + 2, 2 * P}):
            ex = {}
            for k in (1, 4, 9):
                if k == 9 and P > 4:
                    continue
                ex[k] = 60 * throughput(N, P, k, tp, LOAD, UNLOAD, INSP, Q)[0]
            plain, bound = mva_pred(tp, P, N, False)
            held, bound_h = mva_pred(tp, P, N, True)
            for k, e in ex.items():
                pe = lambda v: 100 * (v - e) / e
                rows.append(dict(print=tp, P=P, N=N, k=k, exact=e, k1=ex[1], plain=pe(plain), held=pe(held),
                                 bound=pe(bound), bound_h=pe(bound_h), exp_vs_k=pe(ex[1])))
                say(f"   print {tp:2d} P={P} N={N:2d} k={k}  exact {e:6.3f}  plain {pe(plain):+6.1f}  held {pe(held):+6.1f}  bound {pe(bound):+6.1f}  bound-h {pe(bound_h):+6.1f}  exact(k=1) {pe(ex[1]):+6.1f}")
out["decomposition"] = rows
say()
def mae(sel, key):
    v = [abs(r[key]) for r in rows if sel(r)]
    return sum(v) / len(v), len(v)
for name, sel in [("all rows", lambda r: True), ("k=1 (exponential)", lambda r: r["k"] == 1),
                  ("k=4 (cv 0.5)", lambda r: r["k"] == 4), ("k=9 (cv 0.33)", lambda r: r["k"] == 9),
                  ("N = 2P (saturated)", lambda r: r["N"] == 2 * r["P"]), ("N < 2P (not saturated)", lambda r: r["N"] < 2 * r["P"])]:
    say(f"   mean |error| vs exact, {name}: " + ", ".join(f"{key} {mae(sel, key)[0]:.1f}" for key in ("plain", "held", "bound", "bound_h", "exp_vs_k")) + f"  ({mae(sel, 'plain')[1]} rows)")
    out.setdefault("mae", {})[name] = {key: mae(sel, key)[0] for key in ("plain", "held", "bound", "bound_h", "exp_vs_k")}

say("\n3. Does the Erlang choice matter? Same mean and cv, lognormal print time, simulated (10 seeds), against the Erlang CTMC.\n")
ln = []
for tp, P, N, k in [(20, 4, 8, 4), (20, 6, 12, 4), (60, 4, 8, 4), (20, 4, 8, 9)]:
    rate = 60 * throughput(N, P, k, tp, LOAD, UNLOAD, INSP, Q)[0]
    s = replicate(N, P, k, tp, LOAD, UNLOAD, INSP, Q, print_dist="ln", seeds=SEEDS)
    z = (60 * s[0] - rate) / (60 * s[1])
    ln.append(dict(print=tp, P=P, N=N, k=k, ctmc=rate, sim=[60 * s[0], 60 * s[1]], z=z))
    say(f"   print {tp:2d} P={P} N={N:2d} cv {1/math.sqrt(k):.2f}  erlang ctmc {rate:6.3f}  lognormal sim {60*s[0]:6.3f}+/-{60*s[1]:.3f}  z {z:+.2f}")
out["lognormal"] = ln
(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(out, indent=1))
