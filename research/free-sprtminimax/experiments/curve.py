"""Run: python3 experiments/curve.py > experiments/curve.txt  (about 10 seconds).
Mean rollouts against the true failure rate p for the fixed test, the average-optimal test and the minimax test,
p0 = 5%, p1 = 1%, cap = 2 x the fixed size."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtcert"))
from sprtcert import fixed_n  # noqa: E402
from sprtminimax import solve, minimax, evaluate  # noqa: E402

p0, p1, A = 0.05, 0.01, 0.05
n, _ = fixed_n(p0, p1, A, A)
cap = 2 * n
a = solve(p0, p1, A, A, cap, [p1 + (p0 - p1) * i / 8 for i in range(9)], "average")["policy"]
m = minimax(p0, p1, A, A, cap, p1, p0)["policy"]
print(f"2. Mean rollouts against p; p0 = {p0}, p1 = {p1}, cap = {cap}, fixed n = {n}. Columns: p fixed avg_optimal minimax")
for i in range(0, 81):
    p = 0.0025 * i if i else 0.0005
    print(f"{p:.4f} {n} {evaluate(a, p, cap)[2]:.1f} {evaluate(m, p, cap)[2]:.1f}")
