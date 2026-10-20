"""Loop-closure gating: twin-tuned vs real-tuned.  Every number in the README / white paper is printed here."""
import math, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from loopclosure_twin import *

S_T, TAU2, C_MISS, C_FALSE, PF = 0.10, 1.0, 1.0, 20.0, 0.10
S2T = S_T ** 2
A, B = C_MISS * (1 - PF), C_FALSE * PF
print(f"setup: twin residual sd {S_T} m/axis, false-closure offset sd {math.sqrt(TAU2)} m, A={A}, B={B}, k=2")
gt = opt_gate_k2(S2T, TAU2, A, B)
print(f"twin-optimal gate g_t={gt:.4f} (radius {math.sqrt(gt):.3f} m = {sigma_gate(gt, S2T):.2f} twin sd); twin claims "
      f"reject_true={reject_true(gt, S2T):.4f}, accept_false={accept_false(gt, S2T, TAU2):.4f}, cost={cost(gt, S2T, TAU2, A, B):.4f}")

print("\n1. exact gate law, k=2 and k=3, vs Monte Carlo (200000 draws)")
for k in (2, 3):
    for rho in (1.0, 2.0):
        s2 = rho ** 2 * S2T
        rt, ra = mc_rates(gt, s2, TAU2, k, 200000, 7)
        print(f"k={k} rho={rho}: reject_true exact {reject_true(gt, s2, k):.4f} MC {rt:.4f}; "
              f"accept_false exact {accept_false(gt, s2, TAU2, k):.4f} MC {ra:.4f}")

print("\n2. design-alpha gate: rejection of true closures = alpha^(1/rho^2)  (k=2, alpha=0.01)")
g01 = -2 * S2T * math.log(0.01)
for rho in (0.5, 1.0, 1.5, 2.0, 3.0):
    print(f"rho={rho}: real rejection {reject_true(g01, rho**2 * S2T):.4f} (claimed 0.0100)")

print("\n3. twin-tuned gate in a real system whose per-axis residual sd is rho times the twin's")
print("rho | twin cost claim | real cost at g_t | real-opt gate (twin sd) | real opt cost | regret | regret % | reject_true | accept_false")
for rho in (0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0):
    s2 = rho ** 2 * S2T
    gr = opt_gate_k2(s2, TAU2, A, B)
    cr, co = cost(gt, s2, TAU2, A, B), cost(gr, s2, TAU2, A, B)
    print(f"{rho:.2f} | {cost(gt, S2T, TAU2, A, B):.4f} | {cr:.4f} | {math.sqrt(gr)/S_T:.2f} | {co:.4f} | {cr-co:.4f} | "
          f"{100*(cr-co)/co:.1f} | {reject_true(gt, s2):.4f} | {accept_false(gt, s2, TAU2):.4f}")

print("\n4. claim vs delivery: real cost / twin-claimed cost at the twin gate")
for rho in (1.5, 2.0, 3.0):
    print(f"rho={rho}: {cost(gt, rho**2*S2T, TAU2, A, B)/cost(gt, S2T, TAU2, A, B):.2f}x")

print("\n5. does the answer depend on the false-closure cost? (rho=2)")
for cf in (2.0, 5.0, 20.0, 100.0, 1000.0):
    Bc = cf * PF
    g_t, g_r = opt_gate_k2(S2T, TAU2, A, Bc), opt_gate_k2(4 * S2T, TAU2, A, Bc)
    rg = cost(g_t, 4 * S2T, TAU2, A, Bc) - cost(g_r, 4 * S2T, TAU2, A, Bc)
    print(f"c_false={cf:g}: gates twin {math.sqrt(g_t):.3f} m, real-opt {math.sqrt(g_r):.3f} m, regret {rg:.4f} "
          f"({100*rg/cost(g_r, 4*S2T, TAU2, A, Bc):.1f}% of optimal cost)")

print("\n6. repair: re-fit the residual variance from n ground-truthed real closures (rho=2)")
s2 = 4 * S2T
base = regret(gt, s2, TAU2, A, B)
print(f"twin-gate regret {base:.5f}")
for n in (1, 2, 3, 5, 10, 30, 100, 1000):
    fr = fitted_regret(n, s2, TAU2, A, B)
    print(f"n={n}: expected regret {fr:.5f}  ({100*fr/base:.1f}% of the twin-gate regret)")
print("n needed for regret < 1% of twin-gate regret:",
      next(n for n in range(1, 5000) if fitted_regret(n, s2, TAU2, A, B) < 0.01 * base))

print("\n7. cheap repair: inflate the twin variance by a fixed factor c (rho=2 real, and rho=1 real = twin right)")
for c in (1, 2, 3, 4, 6, 9, 16):
    print(f"c={c}: regret if real rho=2 {gate_inflation_regret(c, S2T, 4*S2T, TAU2, A, B):.5f}; "
          f"if twin was right (rho=1) {gate_inflation_regret(c, S2T, S2T, TAU2, A, B):.5f}")
