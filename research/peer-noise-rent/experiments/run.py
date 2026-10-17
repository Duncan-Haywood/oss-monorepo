import math, random
from peer_noise_rent import *

def sim(t, n, reps, seed):
    rng = random.Random(seed)
    P, F = [], []
    for _ in range(reps):
        pr = sample_pairs(t, n, rng)
        P.append(score_plugin(pr))
        F.append(score_fresh(pr, sample_pairs(t, n, rng)))
    return P, F

def ms(x):
    m = sum(x) / len(x)
    return m, sum((v - m) ** 2 for v in x) / (len(x) - 1)

print("E1 exact plug-in variance (formula vs full enumeration) and fresh-penalty variance (formula vs 40000-run simulation)")
t = joint(.4, .8, .7, .75, .9)
for n in (2, 4, 6):
    m, v = enumerate_plugin(t, n); pm, pv = plugin_stats(t, n)
    print(f" n={n}: enumerated mean {m:.5f} var {v:.6f} | formula mean {pm:.5f} var {pv:.6f}")
for n in (20, 100):
    P, F = sim(t, n, 40000, n)
    pm, pv = plugin_stats(t, n); fm, fv = fresh_stats(t, n)
    (m1, v1), (m2, v2) = ms(P), ms(F)
    print(f" n={n}: plug-in sim {m1:.4f}/{v1:.5f} vs {pm:.4f}/{pv:.5f} | fresh sim {m2:.4f}/{v2:.5f} vs {fm:.4f}/{fv:.5f}")

print("\nE2 SD ratio fresh/plug-in (n=200), same expected pay; symmetric verifiers a=b=(1+g)/2")
print("   p     g   mean pay   sd fresh  sd plug-in  ratio")
for p in (.5, .2):
    for g in (.2, .5, .8):
        a = (1 + g) / 2
        t = joint(p, a, a, a, a)
        m, vp = plugin_stats(t, 200); fm, vf = fresh_stats(t, 200)
        print(f" {p:.1f}  {g:.1f}   {m:.4f}   {math.sqrt(vf):.4f}    {math.sqrt(vp):.4f}   {math.sqrt(vf/vp):.2f}")

print("\nE3 noise rent of a verifier who does no work, paid max(S - tau, 0) (limited liability), n=100, p=.5, peer g=.6")
a = .8; peer = joint(.5, .5, .5, a, a)   # x_i is an independent fair coin
n = 100
const = joint(.5, 1., 0., a, a)          # constant report x_i=1: a=1,b=0 gives x_i=1 always
hon = joint(.5, .85, .85, a, a)
for name, t in (("random coin", peer), ("constant 1", const)):
    P, F = sim(t, n, 30000, 5)
    print(f" {name:12s}: fresh E[S+] {sum(max(x,0) for x in F)/len(F):.4f} (normal {normal_rent(*[fresh_stats(t,n)[0], math.sqrt(fresh_stats(t,n)[1])]):.4f})"
          f"  plug-in E[S+] {sum(max(x,0) for x in P)/len(P):.4f}")
hm, hv = plugin_stats(hon, n); print(f" honest (g_i=.7) plug-in mean pay {hm:.4f}, sd {math.sqrt(hv):.4f}")
lm, lv = plugin_stats(peer, n)
print(" deductible tau making the coin's plug-in rent <= eps, and honest pay lost")
for eps in (.005, .001, .0002):
    tau = deductible_for_rent(lm, math.sqrt(lv), eps)
    P, F = sim(peer, n, 30000, 6); Ph, _ = sim(hon, n, 30000, 7)
    print(f" eps={eps}: tau={tau:.4f} coin rent sim {sum(max(x-tau,0) for x in P)/len(P):.5f}; honest pay {normal_rent(hm, math.sqrt(hv), tau):.4f} (vs {hm:.4f}), simulated {sum(max(x-tau,0) for x in Ph)/len(Ph):.4f}")

print("\nE4 tasks to detect a verifier of informativeness g against a lazy coin (alpha=beta=.05), p=.5, peer g=.6; predicted vs simulated power at that n")
for g in (.3, .5, .7):
    a = (1 + g) / 2; ap = .8
    alt = joint(.5, a, a, ap, ap); null = joint(.5, .5, .5, ap, ap)
    mean = plugin_stats(alt, 10 ** 9)[0]
    sd1 = math.sqrt(plugin_stats(alt, 10 ** 9)[1] * 10 ** 9); sd0 = math.sqrt(plugin_stats(null, 10 ** 9)[1] * 10 ** 9)
    n = math.ceil(sample_size(mean, sd1, sd0, .05, .05))
    rng = random.Random(8); cut = phi_inv(.95) * sd0 / math.sqrt(n)
    fa = sum(score_plugin(sample_pairs(null, n, rng)) > cut for _ in range(20000)) / 20000
    pw = sum(score_plugin(sample_pairs(alt, n, rng)) > cut for _ in range(20000)) / 20000
    print(f" g={g}: n={n:5d}  false-pass {fa:.3f}  power {pw:.3f}")

print("\nE5 tasks to rank verifier 1 (g=.7) above verifier 2 with 95% probability, vs peer (g=.6), p=.5")
ap = .8
for g2 in (.6, .5, .3):
    a1 = .85; a2 = (1 + g2) / 2
    t = rank_table(.5, a1, a1, a2, a2, ap, ap)
    mean = 2 * table_stats(t)[4]
    sd = math.sqrt(4 * (table_stats(t)[5] - table_stats(t)[4] ** 2))
    n = math.ceil((phi_inv(.95) * sd / mean) ** 2)
    rng = random.Random(9); ok = 0
    for _ in range(20000):
        pr = sample_pairs(t, n, rng); ok += score_plugin(pr) > 0
    print(f" g2={g2}: gap {mean:.4f} sd/task {sd:.3f} -> n={n:5d}; correct-order rate {ok/20000:.3f}")
