"""Run: python3 experiments/run.py > experiments/results.txt  (deterministic; a few minutes).
For each (p0, p1) pair and cap: the fixed test, the test minimising the AVERAGE of the means at p0 and p1 (the objective of
free-sprtopt, here solved as an exact LP), and the MINIMAX test minimising the largest mean over p in [p1, p0]."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtcert"))
from sprtcert import fixed_n  # noqa: E402
from sprtminimax import solve, minimax, worst_case, evaluate  # noqa: E402

ALPHA = BETA = 0.05
CASES = [(0.10, 0.05), (0.05, 0.01), (0.20, 0.10)]
MS = (1.0, 1.25, 1.5, 2.0, 3.0)

print("Exact LP optima over randomised capped tests; A = P(accept|p0) <= 0.05 and B = P(reject|p1) <= 0.05 in both.")
print("avg = test minimising (E_p0[N] + E_p1[N]) / 2; minimax = test minimising max over p in [p1, p0] of E_p[N] (cutting planes, tol 0.001).")
print("Columns: p0 p1 m cap | fixed_n | avg: mean_p0 mean_p1 value worst p_worst | minimax: mean_p0 mean_p1 worst p_worst | gain% (1 - minimax_worst / avg_worst)")
for p0, p1 in CASES:
    n, _ = fixed_n(p0, p1, ALPHA, BETA)
    for m in MS:
        cap = max(2, round(m * n))
        ps = [p1 + (p0 - p1) * i / 8 for i in range(9)]
        a = solve(p0, p1, ALPHA, BETA, cap, ps, "average")
        aw, apw = worst_case(a["policy"], cap, p1, p0)
        am0, am1 = evaluate(a["policy"], p0, cap)[2], evaluate(a["policy"], p1, cap)[2]
        r = minimax(p0, p1, ALPHA, BETA, cap, p1, p0)
        m0, m1 = evaluate(r["policy"], p0, cap)[2], evaluate(r["policy"], p1, cap)[2]
        print(f"{p0:.2f} {p1:.2f} {m} {cap} | {n} | {am0:.1f} {am1:.1f} {a['value']:.2f} {aw:.1f} {apw:.4f} | "
              f"{m0:.1f} {m1:.1f} {r['worst']:.1f} {r['p_worst']:.4f} | {100 * (1 - r['worst'] / aw):.1f}", flush=True)
