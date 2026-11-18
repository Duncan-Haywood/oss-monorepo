"""Milestone 71: price recomputation-on-challenge (stdlib, exact arithmetic).
Worker commits (hash) every s-th checkpoint but STORES only every K-th (K a multiple of s). The verifier samples k committed segments
of s steps. To open segment j the worker restarts from the nearest stored checkpoint at or before it, re-derives the weights at the segment
start, checks them against the commitment, then runs the segment. Offsets from the stored checkpoint are 0, s, ..., K-s (uniform when the
sample is uniform), so expected steps = (K - s)/2 + s per sampled segment (exact), worst case K. Training length T = 600 steps.
Outputs: expected challenge compute as share of training, worst case, and worker storage 4N*T/K bytes."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
T = 600
L = ["T = %d steps. s = commitment spacing, K = storage spacing (multiple of s), k = sampled segments (replay budget B = k s steps)." % T,
     "expected challenge compute per job = k*((K-s)/2 + s) steps; worst case k*K (every sample at the far offset); storage = 4N*T/K bytes", ""]
L.append("%-4s %-4s %-3s %-4s | %-12s %-9s %-9s | storage 1e8 params   1e9 params" % ("s", "K", "k", "B", "exp steps", "% of T", "worst %T"))
for s in [1, 5, 20]:
    for K in [s, 5 * s, 20 * s, T]:
        if K > T: continue
        for B in [20, 40]:
            k = max(1, B // s)
            exp = k * ((K - s) / 2 + s); worst = k * K
            L.append("%-4d %-4d %-3d %-4d | %-12.1f %-9.1f %-9.1f | %-17s %s" % (s, K, k, B, exp, 100 * exp / T, 100 * worst / T,
                     "%.0f GB" % (4e8 * T / K / 1e9), "%.0f GB" % (4e9 * T / K / 1e9)))
L.append("")
L.append("Check: K = s gives exactly B steps (no overhead): " + str(all(k * ((s - s) / 2 + s) == k * s for s in (1, 5, 20) for k in (1, 4, 20))))
L.append("Check: K = T (keep only the initial weights) costs k*((T-s)/2+s) = %.0f steps at s=5,k=4 (%.0f%% of T): replay degenerates to partial retraining." % (4 * ((T - 5) / 2 + 5), 100 * 4 * ((T - 5) / 2 + 5) / T))
# best K for a storage-versus-compute budget: smallest K whose expected overhead is <= 10% of T at s=5, B=20
s, k = 5, 4
best = max(K for K in range(s, T + 1, s) if k * ((K - s) / 2 + s) <= 0.10 * T)
L.append("s=5, B=20: largest K with expected challenge compute <= 10%% of T is K = %d (storage %.1fx smaller than K=s)." % (best, best / s))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
