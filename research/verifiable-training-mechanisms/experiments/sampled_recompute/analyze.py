"""Milestone 67 analysis: expected catch rate of k sampled recomputed steps against the adaptive stall, from results_jobs.json (run.py).
Stalled step => submitted update 0 vs honest norm lr|g| (>= 1e-3 here, fp drift <= 1e-7 in milestone 3), caught with certainty if sampled.
catch(m,k) = 1 - C(600-m,k)/C(600,k). Reports, for each k: expected share of harmful jobs caught by recomputation alone, and harmful jobs missed by BOTH the progress check and recomputation (expectation), cost k/600 of training."""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = 600
jobs = json.load(open(os.path.join(HERE, "results_jobs.json")))["R1.01"] if False else json.load(open(os.path.join(HERE, "results_jobs.json")))["jobs"]
def catch(m, k):
    return 1.0 - math.comb(STEPS - m, k) / math.comb(STEPS, k)
L = ["n=%d jobs, harmful %d, flagged by progress check %d, harmful and unflagged %d, median stalled steps %d" % (
    len(jobs), sum(j["harm"] for j in jobs), sum(j["flagged"] for j in jobs), sum(j["harm"] and not j["flagged"] for j in jobs),
    sorted(j["stalled"] for j in jobs)[len(jobs) // 2])]
L.append("k  cost  E[harmful caught by recompute]  E[harmful missed by both]  E[all jobs caught]  min catch among harmful")
for k in [1, 2, 5, 10, 20, 40]:
    H = [j for j in jobs if j["harm"]]
    c = sum(catch(j["stalled"], k) for j in H)
    miss = sum((1 - catch(j["stalled"], k)) for j in H if not j["flagged"])
    allc = sum(catch(j["stalled"], k) for j in jobs)
    L.append("%-3d %.1f%%  %5.1f of %d (%.0f%%)  %5.1f  %5.1f of %d  %.2f" % (k, 100 * k / STEPS, c, len(H), 100 * c / len(H), miss, allc, len(jobs), min(catch(j["stalled"], k) for j in H)))
open(os.path.join(HERE, "results.txt"), "a").write("\n".join(L) + "\n")
print("\n".join(L))
