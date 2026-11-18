"""Milestone 69: exact sampled-segment catch from recorded stall positions (./results_jobs.json), against milestone 68's [packed, spread] bounds.
For checkpoint spacing s the job's stalled steps fall in q = |{pos // s}| of N = 600/s segments; k sampled segments (replay budget B = k s steps) catch it with 1 - C(N-q,k)/C(N,k)."""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = 600
res = json.load(open(os.path.join(HERE, "results_jobs.json")))
jobs = res["jobs"]
H = [j for j in jobs if j["harm"]]
def catch(q, N, k):
    return 1.0 - math.comb(N - q, k) / math.comb(N, k) if k <= N - q else 1.0
def bounds(j, s):
    N = STEPS // s; m, t0 = j["stalled"], j["t0"]
    spanned = (t0 + 199) // s - t0 // s + 1
    return min(N, math.ceil(m / s)), min(m, spanned, N)
L = ["%d harmful of %d jobs; flagged %d; harmful and unflagged %d" % (len(H), len(jobs), sum(j["flagged"] for j in jobs), sum(j["harm"] and not j["flagged"] for j in jobs)),
     "positions consistent with counts: %s; contiguous runs per job (median): %s" % (all(len(j["pos"]) == j["stalled"] for j in jobs),
        sorted(sum(1 for i, p in enumerate(j["pos"]) if i == 0 or p != j["pos"][i-1] + 1) for j in jobs)[len(jobs)//2]),
     "B    s    commitments  k   exact E[caught of %d]  (share)   m68 bounds packed..spread" % len(H)]
for B in [10, 20, 40]:
    for s in [1, 2, 5, 10, 20]:
        k = B // s
        if k < 1: continue
        N = STEPS // s; ex = lo = hi = 0.0
        for j in H:
            q = len({p // s for p in j["pos"]})
            ex += catch(q, N, k); ql, qh = bounds(j, s); lo += catch(ql, N, k); hi += catch(qh, N, k)
        L.append("%-4d %-4d %-12d %-3d %5.1f  (%.0f%%)   %5.1f..%5.1f" % (B, s, N, k, ex, 100 * ex / len(H), lo, hi))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
