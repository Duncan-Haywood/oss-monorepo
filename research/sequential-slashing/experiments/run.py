import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sequential_slashing import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

P, Q, A = 0.2, 0.3, 0.05
p(f"Setup: claimed fault rate p={P}, cheater's true rate q={Q}, alpha={A}, KL(q||p)={kl(Q,P):.5f} nats")
p("E1. false slashing of HONEST verifiers within T=2000 steps (2000 trials)")
z = false_slash_rate("z", P, A, 2000, 2000)
lr = false_slash_rate("lr", P, A, 2000, 2000, q=Q)
mx = false_slash_rate("mixture", P, A, 2000, 300, K=32)
p(f"  peeking z-test (nominal 0.05): {z:.3f}   LR e-process: {lr:.4f}   mixture e-process: {mx:.4f}   Ville bound: {A}")
p("E2. detection delay of the cheater (T=3000, 600 trials)")
tl = detection_times("lr", P, Q, A, 3000, 600)
tm = detection_times("mixture", P, Q, A, 3000, 300, K=32)
def stats(ts):
    got = sorted(t for t in ts if t is not None)
    return sum(got) / len(got), got[len(got)//2], len(got) / len(ts)
a, b, c = stats(tl); p(f"  oracle LR:  mean {a:.0f}  median {b}  detected {c:.3f}")
a2, b2, c2 = stats(tm); p(f"  mixture:    mean {a2:.0f}  median {b2}  detected {c2:.3f}")
p(f"  Wald lower bound ln(1/alpha)/KL = {wald_lower(A,Q,P):.0f};  oracle overshoot ratio {a/wald_lower(A,Q,P):.2f};  price of not knowing q: x{a2/a:.2f}")
p("E3. delay scaling with alpha (oracle LR, mean over 400 trials)")
for al in (0.2, 0.05, 0.01, 0.001):
    ts = detection_times("lr", P, Q, al, 6000, 400, seed=7)
    m = sum(t for t in ts if t is not None) / max(1, sum(t is not None for t in ts))
    p(f"  alpha={al}: mean {m:.0f}   Wald {wald_lower(al,Q,P):.0f}")
p("E4. delay scaling with effect size (alpha=0.05, oracle LR)")
for q in (0.25, 0.3, 0.4, 0.6):
    ts = detection_times("lr", P, q, A, 6000, 1500, seed=11)
    m = sum(t for t in ts if t is not None) / sum(t is not None for t in ts)
    p(f"  q={q}: KL={kl(q,P):.4f} mean {m:.0f} Wald {wald_lower(A,q,P):.0f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
