import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from effort_contracts import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

p("E1. shirking threshold alpha0 (smallest scale inducing effort>0): global search vs local prediction 2c/(k kappa^2)")
for c in (0.05, 0.2, 0.5):
    for sc in ("brier", "log"):
        p(f"  c={c} {sc:5s} global={shirk_threshold(c, sc):.4f} local={local_threshold(c, sc):.4f}")

p("E2. first best vs limited-liability optimum (w=1); surplus = value - cost (FB) or value - payment (SB)")
for c in (0.02, 0.05, 0.1, 0.2, 0.3):
    e0, s0 = first_best(c)
    row = f"  c={c} FB e={e0:.2f} S={s0:.4f}"
    for sc in ("brier", "log"):
        s, a, e = principal_optimum(c, score=sc)
        row += f" | {sc} alpha*={a:.3f} e={e:.2f} S={s:.4f} ({s / s0:.0%} of FB)"
    p(row)

p("E3. with a participation fee, alpha = w is first best (Brier); check induced effort at alpha=w")
for c in (0.05, 0.2):
    e0, _ = first_best(c)
    e1, _ = best_effort(1.0, c)
    p(f"  c={c} first-best e={e0:.3f} agent's e at alpha=w: {e1:.3f}")

p("E4. cost of inducing target effort e (c=0.1): scale, expected payment, worker rent")
for e in (0.3, 0.6, 1.0, 1.5):
    row = f"  e={e}"
    for sc in ("brier", "log"):
        a, pay, rent = induced_payment(e, 0.1, sc)
        row += f" | {sc} alpha={a:.3f} pay={pay:.4f} rent={rent:.4f}"
    p(row)

open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
