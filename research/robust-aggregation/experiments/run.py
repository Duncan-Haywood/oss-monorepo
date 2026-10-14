import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robust_aggregation import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

p("E1. mean vs median, n=2001, adversary at +B, honest N(0,1)")
for beta in (0.05, 0.2, 0.4):
    p(f"  beta={beta}: mean bias B=1e2:{simulate(2001, beta, 'mean', B=1e2, reps=20):9.2f} B=1e6:{simulate(2001, beta, 'mean', B=1e6, reps=20):11.1f}"
      f" | median B=1e2:{simulate(2001, beta, 'median', B=1e2, reps=20):.4f} B=1e6:{simulate(2001, beta, 'median', B=1e6, reps=20):.4f} closed form {median_bias(beta):.4f}")
p("E2. worst-case median bias sigma*Phi^-1(1/(2(1-beta))): blows up at beta -> 1/2")
for beta in (0.1, 0.3, 0.45, 0.49, 0.499):
    p(f"  beta={beta}: {median_bias(beta):.3f} sigma")
p("E3. trimmed mean (n=6000): closed form vs simulation")
for beta, tau in ((0.05, 0.05), (0.05, 0.1), (0.1, 0.2), (0.2, 0.3), (0.2, 0.4)):
    p(f"  beta={beta} tau={tau}: sim {simulate(6000, beta, 'trimmed', tau=tau, reps=30):.4f} closed {trimmed_mean_bias(beta, tau):.4f}  (median {median_bias(beta):.4f})")
p("E4. trimming below the Byzantine fraction fails: tau=0.05 < beta=0.10 (n=6000, B=1e6) ->",
  f"{simulate(6000, 0.10, 'trimmed', tau=0.05, reps=5):.1f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
