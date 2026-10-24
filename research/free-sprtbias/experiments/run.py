"""Run: python3 experiments/run.py > experiments/results.txt  (exact, deterministic)."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from sprtbias import false_certify, tolerated_ratio, derated_size  # noqa: E402
from sprtcert import fixed_n  # noqa: E402

A = B = 0.05
CASES = [(0.10, 0.05), (0.05, 0.01), (0.02, 0.005), (0.20, 0.10)]

print("1. P(certify an unacceptable policy) when real rate = p0 and the twin fails at p0 * r. Columns: p0 p1 r fixed_n P_fixed P_sprt")
for p0, p1 in CASES:
    n = fixed_n(p0, p1, A, B)[0]
    for r in (1.0, 0.95, 0.9, 0.8, 0.7, 0.5):
        print(f"{p0:.3f} {p1:.3f} {r} {n} {false_certify(p0, r, p0, p1, A, B, 'fixed'):.4f} {false_certify(p0, r, p0, p1, A, B, 'sprt'):.4f}")

print()
print("2. Optimism ratio r at which false-certify reaches 10% and 50% (bisection). Columns: p0 p1 kind r_at_10pct r_at_50pct")
for p0, p1 in CASES:
    for kind in ("fixed", "sprt"):
        print(f"{p0:.3f} {p1:.3f} {kind} {tolerated_ratio(0.10, p0, p1, A, B, kind):.4f} {tolerated_ratio(0.50, p0, p1, A, B, kind):.4f}")

print()
print("3. Fixed-test size when guarding against optimism up to R (test p0/R against p1). Columns: p0 p1 R n (blank = p0/R <= p1) ratio_to_R1")
for p0, p1 in CASES:
    n1 = derated_size(1.0, p0, p1, A, B)[0]
    for R in (1.0, 1.1, 1.25, 1.5, 2.0):
        d = derated_size(R, p0, p1, A, B)
        print(f"{p0:.3f} {p1:.3f} {R} " + (f"{d[0]} {d[0] / n1:.2f}" if d else "none none"))

print()
print("4. Case p0 = 0.05, p1 = 0.01: false-certify against r. Columns: r P_fixed P_sprt")
for i in range(0, 21):
    r = 1.0 - 0.025 * i
    print(f"{r:.3f} {false_certify(0.05, r, 0.05, 0.01, A, B, 'fixed'):.4f} {false_certify(0.05, r, 0.05, 0.01, A, B, 'sprt'):.4f}")
