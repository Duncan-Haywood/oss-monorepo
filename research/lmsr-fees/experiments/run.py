import math, random
from lmsr_fees import *

print("E1 no-trade band [q/(1+f), (q+f)/(1+f)] has width f/(1+f) for every belief q; a lone trader ends at q/(1+f) (buying yes)")
for f in (0.01, 0.05, 0.1, 0.25):
    lo, hi = band(0.7, f)
    print(f" f={f:<5} width {hi-lo:.5f} = f/(1+f) = {f/(1+f):.5f}   q=0.7 -> price {lo:.4f} (lag {0.7-lo:.4f})")

print("\nE2 smallest log-likelihood ratio a signal needs to move the price (naive trader), by price p")
print("  f      p=0.05        p=0.2         p=0.5         p=0.8         p=0.95   (up / down)")
for f in (0.02, 0.1, 0.25):
    row = []
    for p in (0.05, 0.2, 0.5, 0.8, 0.95):
        u, d = signal_thresholds(p, f)
        row.append(f"{u:5.2f}/{d:<5.2f}" if d < 99 else f"{u:5.2f}/inf  ")
    print(f" {f:<5} " + "  ".join(row))

print("\nE3 sequential traders (n=10, signal accuracy 0.65, 4000 markets, b=1): information lost to fees")
print("  f     mean Brier(final p)  log loss   mean fee   maker net   frac. of signals ignored   price-truth gap (median |p - full-info posterior|)")
acc, n, b, N = 0.65, 10, 1.0, 4000
lam = math.log(acc / (1 - acc))
for f in (0.0, 0.02, 0.05, 0.1, 0.2, 0.29, 0.31):
    rng = random.Random(1)
    br = ll = fee = net = ign = 0.0
    gaps = []
    for _ in range(N):
        p, s, pnl, fees, path, lams = market_run(n, acc, f, b, rng)
        y = 1.0 if s else 0.0
        br += (p - y) ** 2
        ll += -math.log(p if s else 1 - p)
        fee += fees; net += pnl
        ign += sum(1 for a, c in zip(path, path[1:]) if a == c) / n
        gaps.append(abs(p - sigmoid(sum(lams))))
    gaps.sort()
    print(f" {f:<5} {br/N:.4f}              {ll/N:.4f}     {fee/N:.4f}     {net/N:+.4f}     {ign/N:.3f}                      {gaps[N//2]:.4f}")

print("\nE4 fee revenue on a monotone path is exactly f*b*ln((1-p0)/(1-pT)); subsidy offset (b=1, p0=1/2)")
for pT in (0.6, 0.8, 0.95, 0.99):
    print(f" pT={pT:<5} fee/f = {math.log(0.5/(1-pT)):.4f} b   (fee revenue is unbounded as pT->1; the fee-free loss cap is b ln2 = {math.log(2):.4f} b)")

print("\nE5 informed-trader profit: fee-free vs f=0.1, trader q=0.8 vs price 0.5, b=1")
for f in (0.0, 0.1, 0.25):
    t = trade_target(0.5, 0.8, f)
    print(f" f={f:<5} moves price to {t:.4f}, profit {trader_profit(0.5, t, 0.8, 1.0, f):.4f}, fee paid {f*cost(0.5, t, 1.0):.4f}")

print("\nE6 how much of a fee does an informed trader pass to the maker?  fee share of trader's gross edge, q=0.8, p=0.5")
for f in (0.02, 0.1, 0.25):
    t = trade_target(0.5, 0.8, f)
    gross = trader_profit(0.5, t, 0.8, 1.0, 0.0)
    net = trader_profit(0.5, t, 0.8, 1.0, f)
    print(f" f={f:<5} net {net:.4f}  gross-at-same-trade {gross:.4f}  share paid {1-net/gross:.3f}")

print("\nE7 dead-market cliff: at p=1/2 a signal of LLR lambda moves the price iff f < tanh(lambda/2); for accuracy a that is f < 2a-1")
for a in (0.55, 0.65, 0.8):
    lam = math.log(a / (1 - a))
    u, d = signal_thresholds(0.5, 2 * a - 1 - 1e-9)
    u2, _ = signal_thresholds(0.5, 2 * a - 1 + 1e-9)
    print(f" a={a}: lambda={lam:.4f}, cliff f={math.tanh(lam/2):.4f} = 2a-1 = {2*a-1:.4f};  price-1/2 threshold at the cliff {u:.4f} (= lambda)")
