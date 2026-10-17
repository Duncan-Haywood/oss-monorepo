import math, random
from order_flow_liquidity import *

print("E1 GM-consistent LMSR liquidity b* = 1/(2 atanh m), m = mu(2q-1)")
print(" mu    q     m       k=1/b*   b*      trades to 95% (Wald)")
for mu, q in ((0.05, 1.0), (0.1, 1.0), (0.2, 1.0), (0.2, 0.8), (0.5, 0.8), (0.9, 1.0)):
    m = mu * (2 * q - 1)
    print(f" {mu:<5} {q:<5} {m:<7.3f} {flow_slope(m):<8.4f} {b_star(m):<7.3f} {trades_to_confidence(m, 0.95):.1f}")
print(" check: max |GM posterior from raw trade likelihoods - logit-linear price| over 60 histories:",
      f"{max(abs(bayes_price_bruteforce(B, S, 0.3, 0.3) - gm_price(B - S, 0.3, 0.3)) for B in range(0, 60, 3) for S in range(0, 60, 3)):.1e}")

print("\nE2 peak-over-horizon excess log loss of LMSR liquidity b* / lam (lam>1 overconfident), n up to 1500")
lams = (0.25, 0.5, 0.7, 1.4, 2, 4)
print(" m      " + "  ".join(f"lam={l:<5}" for l in lams))
for m in (0.05, 0.1, 0.3):
    row = []
    for l in lams:
        ns = sorted(set(max(1, int(x / (m * m))) for x in [0.02 * 1.15 ** i for i in range(45)]))
        best = max((excess_log_loss(n, m, b_star(m) / l), n) for n in ns if n <= 1500)
        row.append(f"{best[0]:.4f}@{best[1]}")
    print(f" {m:<6} " + "  ".join(f"{r:<10}" for r in row))

print("\nE3 exact market-maker expected profit over n trades, m=0.3, prior 1/2 (per state; GM is 0 in each)")
m = 0.3
bs = b_star(m)
print(" n     GM|s=1   LMSR(b*)|s=1  LMSR(b*)|s=0   b* ln2   LMSR fee/trade to break even")
for n in (5, 20, 80, 320):
    l1 = lmsr_mm_pnl(n, m, bs, 1)
    print(f" {n:<5} {gm_mm_pnl(n, m, 1):<8.1e} {l1:<13.3f} {lmsr_mm_pnl(n, m, bs, 0):<13.3f} {bs * math.log(2):<8.3f} {-l1 / n:.4f}")
print(" GM with prior 0.2 (n=80): profit given s=1", f"{gm_mm_pnl(80, m, 1, 0.2):.3f}", "given s=0", f"{gm_mm_pnl(80, m, 0, 0.2):.3f}", "prior-weighted", f"{0.2 * gm_mm_pnl(80, m, 1, 0.2) + 0.8 * gm_mm_pnl(80, m, 0, 0.2):.1e}")
print(" LMSR profit against pure noise flow (m=0), b=3.33:", *(f"n={n}: {lmsr_mm_pnl(n, 0.0, 3.33, 1):.2f}" for n in (5, 20, 80, 320)))

print("\nE4 not knowing the informed share: excess log loss of the mixture price over the known-m Bayes price")
ms = [0.02 * i for i in range(1, 50)]
w = [1 / len(ms)] * len(ms)
print(" true m   n=10     n=40     n=160    n=640")
for m in (0.1, 0.3, 0.6):
    row = []
    for n in (10, 40, 160, 640):
        row.append(log_loss_expected(n, m, None or (lambda F, n=n: mixture_price((n + F) // 2, (n - F) // 2, ms, w))) - log_loss_expected(n, m, lambda F: gm_price(F, m)))
    print(f" {m:<8} " + "  ".join(f"{r:<8.4f}" for r in row))
print(" (a fixed LMSR with b* for the wrong m=0.1 when truth is m=0.3, n=40:",
      f"{excess_log_loss(40, 0.3, b_star(0.1)):.4f}; truth 0.1 with b*(0.3): {excess_log_loss(40, 0.1, b_star(0.3)):.4f})")

print("\nE5 trades to 95% confidence: Wald approximation vs Monte-Carlo mean (4000 runs)")
rng = random.Random(0)
for m in (0.1, 0.3, 0.6):
    tot = 0
    for _ in range(4000):
        F, t = 0, 0
        while gm_price(F, m) < 0.95:
            F += 1 if rng.random() < (1 + m) / 2 else -1
            t += 1
        tot += t
    print(f" m={m}: approx {trades_to_confidence(m, 0.95):.1f}  MC {tot / 4000:.1f}")
