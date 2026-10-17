import math, random
from module_entry import *

def mean(x): return sum(x) / len(x)

n0, K = 4, 12
N = n0 + K
print(f"E1 certificate coefficients c_i (nats), n0={n0}, K={K} arrivals; Kraft sum = 1 for every rule; ln(n0+K) = {math.log(N):.3f}")
rules = {
    "uniform 1/(n+1)": uniform_shares(n0, K),
    "half (pi=0.5)": [0.5] * K,
    "constant 0.2": [0.2] * K,
}
rho = 0.8
Pgeo = [rho ** (K - j) for j in range(K + 1)]     # index 0 = initial pool (as a whole), then arrivals; recent likelier
z = sum(Pgeo); Pgeo = [x / z for x in Pgeo]
rules["recency-optimal (rho=.8)"] = prior_shares(Pgeo, n0)
for name, sh in rules.items():
    c = certificate(n0, sh)
    print(f"  {name:26s} Kraft {kraft_sum(n0, sh):.6f}  max c {max(c):.3f}  initial {c[0]:.3f}  first arr {c[1]:.3f}  last arr {c[-1]:.3f}  "
          f"prior-expected {Pgeo[0]*c[0] + sum(Pgeo[j+1]*c[j+1] for j in range(K)):.3f}")
print(f"  entropy of the recency prior H(P) + P0 ln n0 = {entropy(Pgeo) + Pgeo[0]*math.log(n0):.3f}")

print("E2 exact price of entry, incumbent constant loss .5 (n0=1), eta=0.05, arrival better/worse by delta (T=60/(eta*delta))")
eta = 0.05
for pi in (0.02, 0.1, 0.3, 0.5):
    out = []
    for delta, good in ((0.2, True), (0.05, True), (0.2, False), (0.05, False)):
        T = int(60 / (eta * delta))
        rows = [[0.5, 0.5 - delta if good else 0.5 + delta] for _ in range(T)]
        l, paths = run(rows, 1, [0], [pi], eta)
        reg = regret_from_arrival(l, rows, 1 if good else 0, 0) * eta
        out.append(f"{'good' if good else 'bad '} d={delta:.2f}: {reg:.3f}")
    print(f"  pi={pi:4.2f}  theory good ln(1/pi)={math.log(1/pi):.3f}  bad ln(1/(1-pi))={math.log(1/(1-pi)):.3f} | " + " | ".join(out))

print("E3 catch-up and break-even lifetime, eta=0.1, gap delta=0.1, uniform entry pi=1/(n+1) into a pool of n identical modules")
for n in (4, 16, 64, 256, 1024):
    pi = 1.0 / (n + 1)
    t_half = catchup_time(pi, 0.1, 0.1)
    print(f"  n={n:5d}  catch-up to half the mass {t_half:7.0f} rounds   entry cost ln(n+1)/eta = {math.log(n+1)/0.1:6.1f} loss units   break-even lifetime {math.log(n+1)/(0.1*0.1):6.0f} rounds")

print("E4 simulation: n0=4, K=12 arrivals every 100 rounds (T=1300), Bernoulli losses mean .5, champion mean .3, eta=0.2, 300 runs")
eta = 0.2
def sim(shares, champion, runs, seed):
    rng = random.Random(seed)
    regs = []
    for _ in range(runs):
        rows, arr = random_run(rng, n0, K, 100, champion, 0.2)
        l, _ = run(rows, n0, arr, shares, eta)
        start = 0 if champion < n0 else arr[champion - n0]
        regs.append(regret_from_arrival(l, rows, champion, start) * eta)
    return mean(regs)
champs = [0, n0 + 0, n0 + 3, n0 + 6, n0 + 9, n0 + 11]
print("   regret*eta vs champion from its arrival   [certificate coefficient c in brackets]")
print("   champion         " + "  ".join(f"{name[:14]:>18s}" for name in rules))
for ch in champs:
    row = []
    for name, sh in rules.items():
        c = certificate(n0, sh)
        ci = c[0] if ch < n0 else c[ch - n0 + 1]
        row.append(f"{sim(sh, ch, 300, 10 + ch):6.2f} [{ci:5.2f}]")
    lab = "initial" if ch < n0 else f"arrival {ch - n0 + 1:2d}"
    print(f"   {lab:15s}  " + "  ".join(f"{r:>18s}" for r in row))

print("E5 champion drawn from the recency prior (rho=.8): mean regret*eta vs each rule (600 draws) and certificate expectation")
rng = random.Random(77)
idx = list(range(K + 1))
for name, sh in rules.items():
    c = certificate(n0, sh)
    tot = []
    for r in range(600):
        e = rng.choices(idx, Pgeo)[0]
        ch = rng.randrange(n0) if e == 0 else n0 + e - 1
        rows, arr = random_run(rng, n0, K, 100, ch, 0.2)
        l, _ = run(rows, n0, arr, sh, eta)
        start = 0 if ch < n0 else arr[ch - n0]
        tot.append(regret_from_arrival(l, rows, ch, start) * eta)
    exp_c = Pgeo[0] * c[0] + sum(Pgeo[j + 1] * c[j + 1] for j in range(K))
    print(f"  {name:26s} realised {mean(tot):5.2f}   certificate expectation {exp_c:5.2f}")
