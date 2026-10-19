"""Run: python3 experiments/run.py > experiments/results.txt  (exact, deterministic)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sprtcert import sprt, fixed_n, accept_prob_fixed

ALPHA = BETA = 0.05
CASES = [(0.10, 0.05), (0.05, 0.01), (0.02, 0.005), (0.20, 0.10)]

print("1. Sample sizes at alpha = beta = 0.05 (exact). Columns: p0 p1 fixed_n cutoff sprt_asn_p0 sprt_asn_p1 asn_max_over_p p_at_max")
detail = []
for p0, p1 in CASES:
    n, c = fixed_n(p0, p1, ALPHA, BETA)
    grid = [p1 + (p0 - p1) * i / 20 for i in range(-4, 25)]
    grid = [g for g in grid if 0 < g < 1]
    asns = [(sprt(g, p0, p1, ALPHA, BETA, nmax=6 * n)["asn"], g) for g in grid]
    a0 = sprt(p0, p0, p1, ALPHA, BETA, nmax=6 * n)["asn"]
    a1 = sprt(p1, p0, p1, ALPHA, BETA, nmax=6 * n)["asn"]
    amax, gmax = max(asns)
    print(f"{p0:.3f} {p1:.3f} {n} {c} {a0:.1f} {a1:.1f} {amax:.1f} {gmax:.4f}")
    detail.append((p0, p1, n, c))

print()
print("2. Achieved error rates (exact). Columns: p0 p1 sprt_alpha_achieved sprt_beta_achieved undecided_mass fixed_alpha fixed_beta")
for p0, p1, n, c in detail:
    r0 = sprt(p0, p0, p1, ALPHA, BETA, nmax=6 * n)
    r1 = sprt(p1, p0, p1, ALPHA, BETA, nmax=6 * n)
    print(f"{p0:.3f} {p1:.3f} {r0['accept']:.4f} {1 - r1['accept']:.4f} {max(r0['undecided'], r1['undecided']):.1e} "
          f"{accept_prob_fixed(n, c, p0):.4f} {1 - accept_prob_fixed(n, c, p1):.4f}")

print()
print("3. Expected trials against the true rate, case p0 = 0.05, p1 = 0.01. Columns: p sprt_asn fixed_n accept_prob_sprt accept_prob_fixed")
p0, p1, n, c = detail[1]
for i in range(0, 13):
    p = 0.005 + i * 0.005
    r = sprt(p, p0, p1, ALPHA, BETA, nmax=6 * n)
    print(f"{p:.3f} {r['asn']:.1f} {n} {r['accept']:.4f} {accept_prob_fixed(n, c, p):.4f}")
