"""Run: python3 experiments/run.py > experiments/results.txt  (exact, deterministic)."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0]))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtcert"))
from sprtcert import fixed_n, accept_prob_fixed  # noqa: E402
from sprtcap import stopping_law, quantile, mean, tail  # noqa: E402

ALPHA = BETA = 0.05
CASES = [(0.10, 0.05), (0.05, 0.01), (0.02, 0.005), (0.20, 0.10)]

print("1. Stopping-time law of the untruncated SPRT (exact, DP cut at 20 x fixed n). Columns: p0 p1 true_p fixed_n mean q50 q90 q99 P(N>fixed_n)")
for p0, p1 in CASES:
    n, c = fixed_n(p0, p1, ALPHA, BETA)
    for label, p in (("p0", p0), ("mid", (p0 + p1) / 2), ("p1", p1)):
        r = stopping_law(p, p0, p1, ALPHA, BETA, 20 * n)
        s = r["stop"]
        print(f"{p0:.3f} {p1:.3f} {label}={p:.4f} {n} {mean(s):.1f} {quantile(s, .5)} {quantile(s, .9)} {quantile(s, .99)} {tail(s, n):.3f}")

print()
print("2. Truncated SPRT at cap = m x fixed n. Columns: p0 p1 m cap alpha_ach beta_ach mean_n_p0 mean_n_p1 P(trunc)_p0 P(trunc)_p1   (fixed test alpha_ach beta_ach on the line m=fixed)")
for p0, p1 in CASES:
    n, c = fixed_n(p0, p1, ALPHA, BETA)
    print(f"{p0:.3f} {p1:.3f} fixed {n} {accept_prob_fixed(n, c, p0):.4f} {1 - accept_prob_fixed(n, c, p1):.4f} {n} {n} 0 0")
    for m in (0.5, 0.75, 1.0, 1.5, 2.0):
        cap = max(2, round(m * n))
        r0 = stopping_law(p0, p0, p1, ALPHA, BETA, cap)
        r1 = stopping_law(p1, p0, p1, ALPHA, BETA, cap)
        print(f"{p0:.3f} {p1:.3f} {m} {cap} {r0['accept']:.4f} {1 - r1['accept']:.4f} {mean(r0['stop']):.1f} {mean(r1['stop']):.1f} {r0['truncated']:.3f} {r1['truncated']:.3f}")

print()
print("3. Achieved error rates against truncation cap, case p0 = 0.05, p1 = 0.01 (fixed n = 181). Columns: cap alpha_ach beta_ach")
p0, p1 = 0.05, 0.01
n, c = fixed_n(p0, p1, ALPHA, BETA)
for cap in range(40, 2 * n + 1, 20):
    r0 = stopping_law(p0, p0, p1, ALPHA, BETA, cap)
    r1 = stopping_law(p1, p0, p1, ALPHA, BETA, cap)
    print(f"{cap} {r0['accept']:.4f} {1 - r1['accept']:.4f}")
