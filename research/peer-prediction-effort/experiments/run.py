import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from peer_prediction_effort import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

T = STRATEGIES["truthful"]

p("E1. output agreement vs DG, q=0.8 both workers: payoff of truthful/truthful, best uninformative profile, pure equilibria")
for pr in (0.5, 0.3, 0.1):
    for rule in ("oa", "dg"):
        M = payoff_matrix(rule, 0.8, 0.8, pr)
        eq = pure_equilibria(rule, 0.8, pr)
        top = max(v for _, _, v in eq)
        p(f"  p={pr} {rule}: truthful={M[('truthful','truthful')]:.4f} always-majority={max(M[('always0','always0')], M[('always1','always1')]):.4f}"
          f" | truthful is eq: {any(a=='truthful' and b=='truthful' for a,b,_ in eq)} | best-paying eq value={top:.4f}")

p("E2. DG 3-task estimator: Monte Carlo (200k) vs exact, truthful pair")
for qi, qj, pr in ((0.85, 0.75, 0.3), (0.9, 0.9, 0.5), (0.7, 0.95, 0.1)):
    ex = dg_payoff(T, T, qi, qj, pr); mc = dg_monte_carlo(T, T, qi, qj, pr)
    p(f"  qi={qi} qj={qj} p={pr}: exact={ex:.4f} closed=2p(1-p)gigj={dg_truthful_closed_form(qi,qj,pr):.4f} MC={mc:.4f}")

p("E3. continuous effort (c=0.1, kappa=0.9, p=0.5), r=0: zero-effort stability; alpha0 = c/(2p(1-p)kappa^2)")
c, pr = 0.1, 0.5
a0 = alpha_threshold(pr, c)
p(f"  alpha0 = {a0:.4f}")
for mult in (0.5, 0.9, 1.1, 1.5, 3.0):
    eqs = symmetric_equilibria(scale_A(mult * a0, pr), c)
    p(f"  alpha={mult}*alpha0: " + ", ".join(f"e={e:.3f}({'stable' if s else 'unstable'})" for e, s in eqs))

p("E4. same but skewed prior p=0.1: threshold rises by 1/(4p(1-p))")
for pr in (0.5, 0.3, 0.1, 0.02):
    p(f"  p={pr}: alpha0 = {alpha_threshold(pr, 0.1):.3f}  (x{alpha_threshold(pr,0.1)/alpha_threshold(0.5,0.1):.2f} vs p=0.5)")

p("E5. continuous effort, alpha=0.7*alpha0 (below threshold), effect of gold-check rate r on the (unique) equilibrium effort")
A = scale_A(0.7 * a0, 0.5)
for r in (0.0, 0.02, 0.05, 0.1, 0.2, 0.4):
    eqs = symmetric_equilibria(A, 0.1, r)
    p(f"  r={r}: " + ", ".join(f"e={e:.3f}({'stable' if s else 'unstable'})" for e, s in eqs))

p("E6. binary effort (A=1, c=0.3, gH=0.8): equilibria vs gold-check rate; r* = c/(A gH)")
A, c, gH = 1.0, 0.3, 0.8
rs = gold_rate_to_kill_shirking(A, c, gH)
p(f"  r* = {rs:.4f}")
for r in (0.0, 0.2, 0.35, 0.3749, 0.3751, 0.5, 0.9):
    p(f"  r={r}: {binary_equilibria(A, c, gH, r)}")

p("E7. cost-optimal design (gH=0.8): scale u=A gH, gold rate r=c/u, total cost = pay + G r. Grid search vs closed form")
for c, G in ((0.05, 0.5), (0.05, 2.0), (0.2, 1.0), (0.2, 5.0)):
    us = [c * (1.0 + i / 200) for i in range(0, 4000)]
    bu = min(us, key=lambda u: total_cost(u, c, 0.8, G))
    u, r, tc = optimal_gold_design(c, 0.8, G)
    p(f"  c={c} G={G}: closed u*={u:.4f} r*={r:.4f} cost={tc:.4f} | grid u={bu:.4f} cost={total_cost(bu,c,0.8,G):.4f}")

open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
