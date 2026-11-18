"""Milestone 68: sampled recomputation when only every s-th checkpoint is committed (storage priced), from ../sampled_recompute/results_jobs.json.
Stall positions were not recorded in milestone 67, only the count m of stalled steps inside the 200-step window starting at t0, so the catch is bounded, not estimated:
  packed bound: the m stalled steps sit in the fewest segments, q = ceil(m/s);  spread bound: q = min(m, segments overlapping the window).
A verifier samples k of the 600/s segments (without replacement), replays each whole segment from its committed start checkpoint (cost k*s steps) and catches the job if any sampled
segment holds a stalled step (the end checkpoint then differs by far more than fp drift; assumed, as in milestone 67).  catch = 1 - C(N-q,k)/C(N,k).
Reports, at equal replay budget B steps, E[harmful jobs caught] as [packed, spread] and the commitments to store (600/s)."""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = 600
jobs = json.load(open(os.path.join(HERE, "..", "sampled_recompute", "results_jobs.json")))["jobs"]
H = [j for j in jobs if j["harm"]]
def catch(q, N, k):
    return 1.0 - math.comb(N - q, k) / math.comb(N, k) if k <= N - q else 1.0
def seg_counts(j, s):
    N = STEPS // s
    m, t0 = j["stalled"], j["t0"]
    spanned = (t0 + 200 - 1) // s - t0 // s + 1
    return N, min(N, math.ceil(m / s)), min(m, spanned, N)
L = ["%d harmful jobs of %d (R=1.01 adaptive stall); median stalled steps %d" % (len(H), len(jobs), sorted(j["stalled"] for j in jobs)[len(jobs) // 2])]
L.append("budget B = replayed steps; s = checkpoint spacing; k = B/s sampled segments; commitments stored = 600/s")
L.append("B    s    commitments  k   E[caught of %d] packed..spread   (share)" % len(H))
for B in [10, 20, 40]:
    for s in [1, 2, 5, 10, 20]:
        k = B // s
        if k < 1: continue
        lo = hi = 0.0
        for j in H:
            N, qlo, qhi = seg_counts(j, s)
            lo += catch(qlo, N, k); hi += catch(qhi, N, k)
        L.append("%-4d %-4d %-12d %-3d %5.1f..%5.1f   (%.0f%%..%.0f%%)" % (B, s, STEPS // s, k, lo, hi, 100 * lo / len(H), 100 * hi / len(H)))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
