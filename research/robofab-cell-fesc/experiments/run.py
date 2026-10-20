"""Experiments for robofab-cell-fesc: flow-equivalent-server decomposition against the exact chain.

Same cell and settings as robofab-cell-ctmc: load 2 min, unload 2 min, inspect 3 min, failure q = 0.15
(only scales the good-part rate), print 20 or 60 min with Erlang-k variability. Rates are good parts/h.
Deterministic; no seeds.
"""
import json, pathlib, sys, time
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_fesc.ctmc import throughput
from robofab_cell_fesc.fesc import fesc_rate
from robofab_cell_fesc.mva import mva, cell_demands

LOAD, UNLOAD, INSP, Q = 2.0, 2.0, 3.0, 0.15
lines = []
def say(s=""):
    lines.append(s); print(s)

def mva_pred(tp, P, N, held):
    T = [dict(weight=1, print=tp, load=LOAD, unload=UNLOAD, inspect=INSP, q=Q)]
    D, m = cell_demands(T, P, 1, hold_printer=held)
    return 60 * mva(D, m, N)[0]

say("Percent error against the exact Markov chain (robofab-cell-ctmc's model), good parts/h.")
say("fesc = flow-equivalent-server decomposition; plain, held = mean value analysis as in robofab-cell-ctmc.")
say("states: exact chain size, and the largest subsystem chain the decomposition solved.\n")
rows = []
for tp in (20, 60):
    for P in (2, 4, 6):
        for N in sorted({P, P + 2, 2 * P}):
            for k in (1, 4, 9):
                if k == 9 and P > 4:
                    continue
                t0 = time.perf_counter(); ex, _, ns = throughput(N, P, k, tp, LOAD, UNLOAD, INSP, Q); te = time.perf_counter() - t0
                t0 = time.perf_counter(); fe, nsub = fesc_rate(N, P, k, tp, LOAD, UNLOAD, INSP, Q); tf = time.perf_counter() - t0
                ex *= 60; fe *= 60
                pe = lambda v: 100 * (v - ex) / ex
                r = dict(print=tp, P=P, N=N, k=k, exact=ex, fesc=pe(fe), plain=pe(mva_pred(tp, P, N, False)),
                         held=pe(mva_pred(tp, P, N, True)), states=ns, sub_states=nsub, t_exact=te, t_fesc=tf)
                rows.append(r)
                say(f"print {tp:2d} P={P} N={N:2d} k={k}  exact {ex:6.3f}  fesc {r['fesc']:+6.2f}  plain {r['plain']:+6.1f}  held {r['held']:+6.1f}  states {ns:5d}/{nsub:5d}")

def mae(sel, key):
    v = [abs(r[key]) for r in rows if sel(r)]
    return sum(v) / len(v), max(v), len(v)
say()
groups = [("all rows", lambda r: True), ("N = P", lambda r: r["N"] == r["P"]), ("N = P+2", lambda r: r["N"] == r["P"] + 2 and r["N"] != 2 * r["P"]),
          ("N = 2P", lambda r: r["N"] == 2 * r["P"] and r["P"] > 2 or (r["P"] == 2 and r["N"] == 4)), ("k=1", lambda r: r["k"] == 1), ("k=9", lambda r: r["k"] == 9)]
summary = {}
for name, sel in groups:
    s = {key: mae(sel, key) for key in ("fesc", "plain", "held")}
    summary[name] = {key: dict(mean=v[0], max=v[1], n=v[2]) for key, v in s.items()}
    say(f"{name:9s} ({s['fesc'][2]:2d} rows)  mean |err| / max |err|:  " + "  ".join(f"{key} {v[0]:.2f}/{v[1]:.2f}" for key, v in s.items()))
big = [r for r in rows if r["states"] > 1000]
say(f"\nLargest settings (exact chain > 1000 states, {len(big)} rows): exact solve {sum(r['t_exact'] for r in big):.1f} s in total, decomposition {sum(r['t_fesc'] for r in big):.1f} s; "
    f"largest chain {max(r['states'] for r in rows)} states against {max(r['sub_states'] for r in rows)} for the decomposition.")
signed = [r["fesc"] for r in rows]
say(f"Sign of the decomposition's error: {sum(e > 0 for e in signed)} rows over, {sum(e < 0 for e in signed)} under, mean signed {sum(signed)/len(signed):+.2f}%.")

say("\nLarger cells (print 20 min, N = 2P), where the exact chain is still solvable here but is much bigger than the subsystems:")
big_rows = []
for P, N, k in [(8, 16, 2), (8, 16, 4), (10, 20, 1), (12, 24, 1), (12, 24, 2)]:
    t0 = time.perf_counter(); ex, _, ns = throughput(N, P, k, 20, LOAD, UNLOAD, INSP, Q); te = time.perf_counter() - t0
    t0 = time.perf_counter(); fe, nsub = fesc_rate(N, P, k, 20, LOAD, UNLOAD, INSP, Q); tf = time.perf_counter() - t0
    e = 100 * (fe - ex) / ex
    big_rows.append(dict(P=P, N=N, k=k, exact=60 * ex, fesc_err=e, states=ns, sub_states=nsub, t_exact=te, t_fesc=tf))
    say(f"P={P:2d} N={N:2d} k={k}  exact {60*ex:6.3f}  fesc {e:+6.2f}%  states {ns:6d}/{nsub:5d}  seconds {te:.1f}/{tf:.1f}")
(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(dict(rows=rows, summary=summary, larger=big_rows), indent=1))
