"""Run: python3 experiments/run.py > experiments/results.txt  (exact, deterministic; about a minute).
Compares the optimal capped test with the grid-tuned one in ../free-sprtcut/experiments/results.txt (parsed, not retyped)."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtcert"))
from sprtcert import fixed_n  # noqa: E402
from sprtopt import solve  # noqa: E402

ALPHA = BETA = 0.05
CASES = [(0.10, 0.05), (0.05, 0.01), (0.20, 0.10)]
MS = (1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 3.0)
SRC = (HERE.parents[1] / "free-sprtcut" / "experiments" / "results.txt").read_text().splitlines()

# grid-tuned means from free-sprtcut: table 1 (3 pairs x 4 caps) and table 2 (1% vs 5%, 8 caps)
tuned = {}
for ln in SRC:
    t = ln.split()
    if len(t) > 11 and t[2] in ("1.0", "1.25", "1.5", "2.0") and "|" in t:
        tuned[(float(t[0]), float(t[1]), float(t[2]))] = (float(t[10]) + float(t[11])) / 2  # mean_p0, mean_p1
i = SRC.index(next(l for l in SRC if l.startswith("2. Mean trials")))
for ln in SRC[i + 1:]:
    t = ln.split()
    if len(t) == 4:
        tuned[(0.05, 0.01, float(t[0]))] = float(t[1])

print("Optimal capped certification test by backward induction; both achieved errors <= 0.05 exactly (A = P(accept|p0), B = P(reject|p1)).")
print("Mean rollouts are the average of the means at p0 and p1. lower = bound valid for every test (randomised too); optimal_det = best deterministic Bayes rule found that holds both errors.")
print("Columns: p0 p1 m cap | lower optimal_det gap% | A B mean_p0 mean_p1 | grid_tuned (free-sprtcut) excess_of_grid_over_optimal% | fixed_n")
for p0, p1 in CASES:
    n, c = fixed_n(p0, p1, ALPHA, BETA)
    for m in MS:
        cap = max(2, round(m * n))
        r = solve(p0, p1, ALPHA, BETA, cap)
        g = tuned.get((p0, p1, m))
        gs = f"{g:.1f} {100 * (g / r['upper'] - 1):.1f}" if g is not None and r["upper"] else "- -"
        if r["upper"]:
            print(f"{p0:.2f} {p1:.2f} {m} {cap} | {r['lower']:.2f} {r['upper']:.2f} {100 * (r['upper'] / r['lower'] - 1):.2f} | "
                  f"{r['A']:.4f} {r['B']:.4f} {r['mean0']:.1f} {r['mean1']:.1f} | {gs} | {n}", flush=True)
        else:
            print(f"{p0:.2f} {p1:.2f} {m} {cap} | {r['lower']:.2f} none - | - - - - | {gs} | {n}", flush=True)

print()
print("2. Mean rollouts against cap, p0 = 0.05, p1 = 0.01 (fixed n = 181). Columns: m optimal_det grid_tuned fixed")
p0, p1 = 0.05, 0.01
n, _ = fixed_n(p0, p1, ALPHA, BETA)
for m in (1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0):
    r = solve(p0, p1, ALPHA, BETA, round(m * n))
    print(f"{m} {r['upper']:.1f} {tuned[(p0, p1, m)]:.1f} {n}", flush=True)
