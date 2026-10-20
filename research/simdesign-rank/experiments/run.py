"""Rank 80 random cantilever designs with four models; compare to the 3D reference.
Writes results.txt. About 4 minutes (the 3D solves dominate)."""
import os, sys, time
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_rank.rank import sample_designs, merit, MODELS, kendall_tau, topk_overlap

N, SEEDS, K = 80, (1, 2, 3), 8
cheap = ["euler", "timoshenko", "fe2d"]
out = [f"# {N} random designs per seed (L 20-160, h 4-30, b 5-60 mm, log-uniform, L/h >= 2), F = 100 N; merit = stiffness per mass; seeds {SEEDS}"]
t0 = time.time()
agg = {m: {"tau": [], "topk": [], "best3d_rank": [], "tau_stubby": [], "tau_wide": []} for m in cheap}
for seed in SEEDS:
    D = sample_designs(N, seed)
    M = {m: np.array([merit(MODELS[m], *d) for d in D]) for m in MODELS}
    stubby = D[:, 0] / D[:, 1] < 6          # L/h < 6
    wide = D[:, 2] / D[:, 1] > 2            # b/h > 2
    ref = M["fe3d"]
    best_ref = int(np.argmax(ref))
    out.append(f"seed {seed}: stubby (L/h<6) {int(stubby.sum())}, wide (b/h>2) {int(wide.sum())}, 3D-best design L,h,b = {np.round(D[best_ref], 1).tolist()}")
    for m in cheap:
        order = np.argsort(-M[m])
        rank_of_best = int(np.where(order == best_ref)[0][0]) + 1   # where the 3D winner sits in the cheap ranking
        a = agg[m]
        a["tau"].append(kendall_tau(M[m], ref))
        a["topk"].append(topk_overlap(M[m], ref, K))
        a["best3d_rank"].append(rank_of_best)
        a["tau_stubby"].append(kendall_tau(M[m][stubby], ref[stubby]))
        a["tau_wide"].append(kendall_tau(M[m][wide], ref[wide]))
    # worst single-design merit error vs 3D
    for m in cheap:
        out.append(f"  {m}: merit/3D median {np.median(M[m]/ref):.3f}, min {np.min(M[m]/ref):.3f}, max {np.max(M[m]/ref):.3f}")
out.append("")
out.append(f"model | Kendall tau vs 3D (all) | top-{K} overlap | rank of 3D winner (of {N}) | tau stubby | tau wide")
for m in cheap:
    a = agg[m]
    f = lambda k: ", ".join(f"{v:.3f}" if isinstance(v, float) else str(v) for v in a[k])
    out.append(f"{m} | {f('tau')} | {f('topk')} | {f('best3d_rank')} | {f('tau_stubby')} | {f('tau_wide')}")
out.append(f"# elapsed {time.time()-t0:.0f} s")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
