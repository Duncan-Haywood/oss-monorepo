"""Deterministic experiments; output in results.txt."""
import math
from market_sandwich import *

print("E1  exact identity: attacker profit == eps * victim fair cost (fee-free), grid of 216 instances")
worst = 0.0
for q in (-6, -2, 0, 2, 6):
    for v in (0.5, 2, 5):
        for b in (3, 10, 50):
            for eps in (0.005, 0.02, 0.1):
                a = attack(q, v, b, eps)
                if a["x"] > 0 and not math.isinf(a["x"]):
                    worst = max(worst, abs(a["profit"] - eps * a["c0"]))
print(f"  max |profit - eps*C0| = {worst:.2e}")

print("\nE2  front-run size and capital (q=0, v=5, eps=0.02): x* ~ eps*b/(1-p) is the drift the victim tolerates")
for b in (5, 20, 100, 500):
    a = attack(0, 5, b, 0.02)
    print(f"  b={b:4d}  x*={a['x']:8.3f}  first-order {first_order_drift_limit(0.5, b, 0.02):8.3f}  capital {a['capital']:8.3f}  profit {a['profit']:.4f}  return on capital {a['profit']/a['capital']:.3f}")

print("\nE3  break-even proportional fee vs first-order v(1-p)/(2b) (q=0, b=100)")
for v in (10, 5, 1, 0.1):
    row = []
    for eps in (1e-4, 1e-2, 1e-1):
        row.append(fee_threshold(0, v, 100.0, eps))
    fo = v * 0.5 / 200.0
    print(f"  v={v:5.1f} v/b={v/100:5.3f}  phi*(eps=1e-4,1e-2,1e-1) = " + ", ".join(f"{r:.5f}" for r in row) + f"   first-order {fo:.5f}  ratio {row[0]/fo:.3f}")

print("\nE4  victim's optimal tolerance (drift sd sigma, opportunity value G, attacker always present)")
for b, v, sig, G in ((10, 5, 3, 50), (100, 5, 10, 50), (100, 5, 10, 5), (100, 2, 5, 20), (400, 5, 10, 50)):
    p = price(0, b); c0 = trade_cost(0, v, b)
    e_cf = optimal_tolerance(p, b, sig, c0, G)
    e_num, l_num = best_tolerance_numeric(0, v, b, sig, G, grid=1000, emax=0.5)
    l0 = expected_loss(0, v, b, 0.0, sig, G)
    print(f"  b={b:4d} v={v} sigma={sig:3d} G={G:3d}  eps* closed {e_cf:.4f}  numeric {e_num:.4f}  loss {l_num:.3f} vs eps=0 {l0:.3f}")

print("\nE5  batching (q=0, v=5, b=10) : pro-rata average price, attacker unwinds next batch")
q, v, b = 0.0, 5.0, 10.0
c0 = trade_cost(q, v, b)
print(f"  no victim limit: profit -> v - C0 = {v - c0:.4f} (x=1e8 gives {batch_pro_rata_profit(q, 1e8, v, b):.4f}); sequential sandwich profit at x=400 is {sandwich_profit(q, 400, v, b):.4f}")
for eps in (0.01, 0.05, 0.2):
    L = (1 + eps) * c0
    best = (0.0, 0.0)
    for i in range(1, 20001):
        x = i * b * 40 / 20000
        if v * (cost(q + x + v, b) - cost(q, b)) / (x + v) > L:
            break
        best = (x, batch_pro_rata_profit(q, x, v, b))
    a = attack(q, v, b, eps)
    print(f"  average-price limit eps={eps:4.2f}: batch profit {best[1]:.4f} = {best[1]/(eps*c0):.4f} x eps*C0 using x={best[0]:.2f} (sequential x*={a['x']:.2f}, profit {a['profit']:.4f})")

print("\nE6  random ordering of {attacker buy, victim, attacker sell} (x=20): expected profit / sequential profit")
for x in (1, 5, 20, 100):
    print(f"  x={x:4d}  ratio {shuffle_expected_profit(0, x, 5, 10) / sandwich_profit(0, x, 5, 10):.6f}")
