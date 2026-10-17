"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random, statistics as st
from crn_twin import *

T = 20
PROFILES = ("flat", "discount", "ramp", "terminal")
QS = (0.01, 0.05, 0.1, 0.3)


def mc(w, q, reps, seed, mode="stream"):
    rng = random.Random(seed)
    pairs = [sample_pair(w, q, rng, mode) for _ in range(reps)]
    a = [p[0] for p in pairs]; b = [p[1] for p in pairs]
    rho = sum(x * y for x, y in pairs) / math.sqrt(sum(x * x for x in a) * sum(y * y for y in b))
    vd = st.variance([x - y for x, y in pairs])
    return rho, vd


print(f"== E1  correlation of seed-paired returns, T={T}: exact rho (formula) | simulated (30,000 episodes); discount gamma=0.9")
print("  profile    " + "".join(f"  q={q:<4}         " for q in QS))
for k in PROFILES:
    w = weights(k, T)
    cells = []
    for q in QS:
        r, _ = mc(w, q, 30000, 7)
        cells.append(f"{rho_exact(w, q):.3f} | {r:.3f}  ")
    print(f"  {k:9s}  " + "  ".join(cells))

print("\n== E2  what pairing buys: Var(R_A-R_B)/(2 sigma_R^2) = 1-rho (formula | simulated), and episodes for a 90%-power 5% test of a gap of 0.3 sigma_R")
print("  independent streams need n =", f"{n_required(2.0, 0.3):.0f}", "episodes per comparison")
for k in ("flat", "terminal"):
    w = weights(k, T)
    sR2 = sum_w2(w)
    for q in QS:
        _, vd = mc(w, q, 30000, 11)
        ex = 1 - rho_exact(w, q)
        n = n_required(2 * sR2 * ex, 0.3 * math.sqrt(sR2))
        print(f"  {k:8s} q={q:<4}  1-rho={ex:.3f} | {vd / (2 * sR2):.3f}   n needed {n:5.1f}")

print("\n== E3  sizing trap: plan n assuming seeds stay synchronised (rho_assumed = 0.95) for a 90%-power test of a 0.3 sigma_R gap")
n_plan = math.ceil(n_required(2 * (1 - 0.95), 0.3))
print(f"  planned n = {n_plan} paired episodes (independent streams would need {math.ceil(n_required(2.0, 0.3))})")
for k, q in (("flat", 0.05), ("flat", 0.3), ("terminal", 0.05), ("terminal", 0.1)):
    w = weights(k, T)
    sR = math.sqrt(sum_w2(w))
    rng = random.Random(21)
    gap = 0.3 * sR
    pw = paired_test_power(w, q, gap, n_plan, 4000, rng)
    need = math.ceil(n_required(2 * sum_w2(w) * (1 - rho_exact(w, q)), gap))
    print(f"  {k:8s} q={q:<4} true rho={rho_exact(w, q):.3f}  power at n={n_plan}: {pw:.3f} (nominal 0.90)   n actually needed ~{need}")

print("\n== E4  repair: counter-based draws keyed by (episode, step), extras from a separate stream (same q)")
for k in ("flat", "terminal"):
    w = weights(k, T)
    r, vd = mc(w, 0.3, 5000, 31, "counter")
    print(f"  {k:8s} q=0.3: rho={r:.6f}  Var(R_A-R_B)={vd:.2e}  (stream mode rho={rho_exact(w, 0.3):.3f})")
rng = random.Random(41)
w = weights("terminal", T)
pw = paired_test_power(w, 0.3, 0.3 * math.sqrt(sum_w2(w)), 3, 4000, rng, "counter")
print(f"  terminal q=0.3, n=3 paired episodes, gap 0.3 sigma_R, counter mode: power {pw:.3f}")

print("\n== E5  binary success 1{R > 0}, R_A centred at +0.15 sigma_R, R_B at -0.15 sigma_R (mean gap 0.3 sigma_R)")
print("  variance of the paired success difference relative to independent streams (simulated, 60,000 episodes)")
for k in ("flat", "terminal"):
    w = weights(k, T)
    sR = math.sqrt(sum_w2(w))
    for q in (0.05, 0.3):
        for mode in ("stream", "counter"):
            rng = random.Random(51)
            d = []
            for _ in range(60000):
                a, b = sample_pair(w, q, rng, mode)
                d.append((1 if a + 0.15 * sR > 0 else 0) - (1 if b - 0.15 * sR > 0 else 0))
            rng = random.Random(52)
            sa = sb = 0
            for _ in range(60000):
                a, _ = sample_pair(w, q, rng, mode)
                _, b = sample_pair(w, q, rng, mode)
                sa += a + 0.15 * sR > 0; sb += b - 0.15 * sR > 0
            pa, pb = sa / 60000, sb / 60000
            vind = pa * (1 - pa) + pb * (1 - pb)
            print(f"  {k:8s} q={q:<4} {mode:8s} ratio {st.variance(d) / vind:.3f}")
