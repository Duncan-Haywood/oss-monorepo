"""Run: python3 experiments/run.py > experiments/results.txt  (exact, deterministic)."""
import math
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0]))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtcert"))
from sprtcert import fixed_n, accept_prob_fixed, wald_bounds  # noqa: E402
from sprtcut import run, accept_prob, tune  # noqa: E402

ALPHA = BETA = 0.05
CASES = [(0.10, 0.05), (0.05, 0.01), (0.20, 0.10)]
SCALES = [0.5 + 0.1 * i for i in range(21)]   # 0.5 .. 2.5 times Wald's boundaries
MS = (1.0, 1.25, 1.5, 2.0)

print("Tuned capped SPRT: both achieved errors <= 0.05 exactly. Grid: boundaries at 0.5-2.5 x Wald's, each side separately, and the best final cut.")
print("Columns: p0 p1 m cap | tuned: s_lo s_hi kc alpha_ach beta_ach mean_p0 mean_p1 | wald+sign: alpha_ach beta_ach mean_p0 mean_p1 | fixed n")
for p0, p1 in CASES:
    n, c = fixed_n(p0, p1, ALPHA, BETA)
    lo, hi = wald_bounds(ALPHA, BETA)
    for m in MS:
        cap = max(2, round(m * n))
        t = tune(p0, p1, ALPHA, BETA, cap, SCALES)
        r0, r1 = run(p0, p0, p1, lo, hi, cap), run(p1, p0, p1, lo, hi, cap)
        # Wald + sign rule: accept left-over runs when LLR > 0, i.e. failures below the zero-crossing
        kz = math.floor(cap * math.log((1 - p1) / (1 - p0)) / (math.log(p0 / p1) + math.log((1 - p1) / (1 - p0))))
        a = accept_prob(r0[0], r0[2], kz)
        b = 1 - accept_prob(r1[0], r1[2], kz)
        tt = (f"{t['s_lo']:.1f} {t['s_hi']:.1f} {t['kc']} {t['alpha_ach']:.4f} {t['beta_ach']:.4f} {t['mean_p0']:.1f} {t['mean_p1']:.1f}"
              if t else "infeasible - - - - - -")
        print(f"{p0:.2f} {p1:.2f} {m} {cap} | {tt} | {a:.4f} {b:.4f} {r0[1]:.1f} {r1[1]:.1f} | {n}")

print()
print("2. Mean trials (average of the values at p0 and p1) against cap, p0 = 0.05, p1 = 0.01 (fixed n = 181). Columns: m tuned wald_sign_rule (errors held / not held) fixed")
p0, p1 = 0.05, 0.01
n, c = fixed_n(p0, p1, ALPHA, BETA)
lo, hi = wald_bounds(ALPHA, BETA)
for m in (1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0):
    cap = round(m * n)
    t = tune(p0, p1, ALPHA, BETA, cap, SCALES)
    r0, r1 = run(p0, p0, p1, lo, hi, cap), run(p1, p0, p1, lo, hi, cap)
    print(f"{m} {t['obj']:.1f} {(r0[1] + r1[1]) / 2:.1f} {n}")
