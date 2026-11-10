"""Milestone 74: cheapest commitment spacing s under the measured drift cap (stdlib, exact arithmetic + Monte Carlo).
Cost model from milestone 71: replay budget B = k*s steps, storage spacing K (multiple of s), training length T = 600.
Expected challenge compute = k*((K-s)/2 + s) = B*((K/s - 1)/2 + 1). Drift cap: s <= 20 (milestone 73, fp16 referee).
Detection: a one-step stall lies in exactly one of T/s segments; the verifier samples k distinct segments uniformly."""
import os, random
HERE = os.path.dirname(os.path.abspath(__file__))
T = 600; S = [1, 2, 5, 10, 20]; B = 20
L = ["T = %d, replay budget B = %d steps; admissible s <= 20 (milestone 73). Expected challenge compute in B-units = (K/s - 1)/2 + 1." % (T, B), ""]
L.append("%-5s | " % "K" + " ".join("s=%-6d" % s for s in S) + "| cheapest admissible s | storage 1e9 params")
ok = True
for K in [20, 40, 60, 100, 200, 300, 600]:
    row = {s: ((K / s - 1) / 2 + 1) if K % s == 0 else None for s in S}
    adm = {s: v for s, v in row.items() if v is not None}
    best = min(adm, key=lambda s: (adm[s], -s))
    ok &= best == max(adm)
    L.append("%-5d | " % K + " ".join(("%-8.1f" % row[s]) if row[s] is not None else "%-8s" % "-" for s in S) + "| s=%-19d | %.0f GB" % (best, 4e9 * T / K / 1e9))
L.append("")
L.append("Prediction (i) cheapest admissible s is the largest dividing K: %s" % ok)
L.append("Prediction (ii) K=100, B=20: s=20 costs %.1f B-units, s=1 costs %.1f (ratio %.1fx)" % ((100/20-1)/2+1, (100/1-1)/2+1, ((100-1)/2+1)/((100/20-1)/2+1)))
L.append("")
random.seed(0); N = 20000
L.append("Prediction (iii) detection of a random one-step stall, k = B/s segments sampled without replacement, %d trials per cell (target B/T = %.4f):" % (N, B / T))
worst = 0
for s in [1, 5, 20]:
    k = B // s; m = T // s; hit = 0
    for _ in range(N):
        stall = random.randrange(T) // s
        if stall in random.sample(range(m), k): hit += 1
    p = hit / N; se = (B / T * (1 - B / T) / N) ** 0.5; z = (p - B / T) / se; worst = max(worst, abs(z))
    L.append("  s=%-3d detect %.4f  z = %+.2f" % (s, p, z))
L.append("  max |z| = %.2f -> %s" % (worst, "held (<= 3)" if worst <= 3 else "REFUTED"))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
