import math, random, statistics as st
from hetero_pipeline import *

def mean(x): return sum(x) / len(x)

print("E1 price of heterogeneity, L=240 equal layers, m=8 (seed 1, 200 draws per sigma_v)")
rng = random.Random(1)
for sv in (0.0, 0.25, 0.5, 0.75, 1.0):
    r_opt, r_eq, r_pred = [], [], []
    for _ in range(200):
        w, v = random_instance(rng, 240, 8, 0.0, sv)
        lb = sum(w) / sum(v)
        r_opt.append(order_heuristic(w, v, "desc")[0] / lb)
        r_eq.append(equal_split_time(w, v) / lb)
        r_pred.append(mean(v) / min(v))
    print(f"  sigma_v={sv:4.2f}  aware/LB {mean(r_opt):.3f}   equal-split/LB {mean(r_eq):.3f}   predicted vmean/vmin {mean(r_pred):.3f}")

print("E2 granularity: aware bottleneck / (W/V) vs layer count, m=8, sigma_v=0.5, sigma_w=0.5 (100 draws)")
rng = random.Random(2)
for L in (8, 16, 32, 64, 128, 512):
    g, ub = [], []
    for _ in range(100):
        w, v = random_instance(rng, L, 8, 0.5, 0.5)
        t = order_heuristic(w, v, "desc")[0]
        g.append(t / (sum(w) / sum(v)))
        ub.append(upper_bound(w, v) / (sum(w) / sum(v)))
    print(f"  L={L:4d}  mean ratio {mean(g):.3f}  max {max(g):.3f}   worst-case bound ratio {mean(ub):.3f}")

print("E3 device order, L=14, m=6, sigma_v=0.8, sigma_w=0.6, exact best over 720 orders (100 draws); ratio to best")
rng = random.Random(3)
res = {k: [] for k in ("given", "desc", "asc", "valley", "local")}
spread = []
for _ in range(100):
    w, v = random_instance(rng, 14, 6, 0.6, 0.8)
    best, _ = best_order_bruteforce(w, v)
    for k in ("given", "desc", "asc", "valley"):
        res[k].append(order_heuristic(w, v, k)[0] / best)
    res["local"].append(local_search_order(w, v, rng=random.Random(0), restarts=3)[0] / best)
    ts = [bottleneck(w, [v[i] for i in p]) for p in __import__("itertools").permutations(range(6))]
    spread.append(max(ts) / best)
for k, x in res.items():
    print(f"  {k:7s} mean {mean(x):.3f}  worst {max(x):.3f}  optimal in {sum(1 for y in x if y < 1 + 1e-6)}/100")
print(f"  worst order / best order: mean {mean(spread):.3f} max {max(spread):.3f}")

print("E4 memory caps, L=64 layers (mem 1 each), m=8, sigma_v=0.5, cap_j = kappa*L/m*(v_j/vmean)^gamma (200 draws)")
rng = random.Random(4)
for gam, kap in ((0.0, 1.05), (0.0, 1.3), (1.0, 1.05), (1.0, 1.3), (-1.0, 1.3)):
    inf, infl = 0, []
    for _ in range(200):
        w, v = random_instance(rng, 64, 8, 0.0, 0.5)
        vm = mean(v)
        cap = [kap * 64 / 8 * (x / vm) ** gam for x in v]
        base = order_heuristic(w, v, "desc")[0]
        t = order_heuristic(w, v, "desc", [1.0] * 64, cap)[0]
        best = min(order_heuristic(w, v, k, [1.0] * 64, cap)[0] for k in ("given", "desc", "asc", "valley"))
        if math.isinf(best): inf += 1
        else: infl.append(best / base)
    print(f"  gamma={gam:+.0f} kappa={kap:.2f}: infeasible in every heuristic order {inf}/200; bottleneck inflation {mean(infl):.3f} (max {max(infl):.3f})")

print("E5 order stops mattering with granularity: m=6, sigma_v=0.8, sigma_w=0.6, 100 random orders each (30 draws); worst/best over sampled orders")
rng = random.Random(5)
for L in (14, 28, 56, 112, 224):
    sp = []
    for _ in range(30):
        w, v = random_instance(rng, L, 6, 0.6, 0.8)
        ts = []
        for _ in range(100):
            p = list(range(6)); rng.shuffle(p)
            ts.append(bottleneck(w, [v[i] for i in p]))
        sp.append(max(ts) / min(ts))
    print(f"  L={L:4d}  worst/best sampled order: mean {mean(sp):.3f}  max {max(sp):.3f}")
