"""Required nominal clearance for 99% and 99.9% assembly yield, by Monte Carlo, against the worst-case and RSS rules.

    PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # writes results.json too
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from robofab_tolstack.model import (required_clearance, yield_mc, yield_closed, clearance_worst, clearance_rss)  # noqa: E402

N = 20000
SEED = 0
SP = (0.05, 0.10, 0.20)      # position sd per axis, mm (assumed)
SD = (0.05, 0.10)            # diameter sd, mm (assumed)
BIAS = (0.0, -0.15)          # hole diameter bias, mm (assumed; negative = holes print small)


def main():
    rows = []
    print("# robofab-tolstack: nominal diametral clearance c (mm) for a target assembly yield")
    print(f"# Monte Carlo n={N} per evaluation, seed {SEED}, common random numbers, bisection to 0.001 mm")
    print("# worst/rss rules use k=3 and ignore bias (c is the clearance after bias; add |bias| for the bias rows)")
    print("# columns: sp sd bias | c99 c999 | yield_at_worst yield_at_rss | worst rss")
    for bias in BIAS:
        for sp in SP:
            for sd in SD:
                c99 = required_clearance(0.99, sp, sd, bias, N, SEED)
                c999 = required_clearance(0.999, sp, sd, bias, N, SEED)
                w, r = clearance_worst(sp, sd), clearance_rss(sp, sd)
                yw, yr = yield_mc(w, sp, sd, bias, N, SEED), yield_mc(r, sp, sd, bias, N, SEED)
                rows.append(dict(sp=sp, sd=sd, bias=bias, c99=c99, c999=c999, worst=w, rss=r, yield_worst=yw, yield_rss=yr))
                print(f"{sp:.2f} {sd:.2f} {bias:+.2f} | {c99:.3f} {c999:.3f} | {yw:.4f} {yr:.4f} | {w:.3f} {r:.3f}")
    print("== yield curve, sp=0.10, sd=0.05, bias 0; columns: c yield_mc yield_closed(sd=0) yield_mc(sd=0)")
    curve = []
    for i in range(1, 21):
        c = 0.1 * i
        a, b = yield_mc(c, 0.10, 0.05, 0.0, N, SEED), yield_mc(c, 0.10, 0.0, 0.0, N, SEED)
        curve.append(dict(c=c, yield_mc=a, yield_closed_sd0=yield_closed(c, 0.10), yield_mc_sd0=b))
        print(f"{c:.2f} {a:.4f} {yield_closed(c, 0.10):.4f} {b:.4f}")
    rows.append(dict(curve=curve))
    (HERE / "results.json").write_text(json.dumps(rows, indent=1))


main()
