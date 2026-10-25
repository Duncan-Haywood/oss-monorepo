"""Milestone 7f: the tail-ratio k an upper bound on E[R] would need, per pair, on the m7c cost pools.
python3 tailratio.py  ->  results/tailratio.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7f)
k* = E[(R-c)+] / E[(T-c)+], c the twin q-quantile. An upper bound U_clip + k * E_T[(T-c)+] is valid iff k >= k*."""
import csv, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m7c_cost", "results", "pool.csv")
QS = (0.99, 0.999)

rows = list(csv.reader(open(POOL)))
a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
D = {n: a[:, j] for j, n in enumerate(rows[0][1:])}
T = D["twin"]
out, res = [], []
for q in QS:
    c = float(np.quantile(T, q))
    tt = float(np.maximum(T - c, 0).mean())
    for name, R in D.items():
        if name == "twin":
            continue
        tr = float(np.maximum(R - c, 0).mean())
        k = tr / tt if tt > 0 else float("inf")
        res.append([name, q, round(c, 3), round(tt, 6), round(tr, 6), round(k, 3), round(tr / R.mean(), 4)])
    s = [r for r in res if r[1] == q]
    ks = np.array([r[5] for r in s])
    out.append(f"q={q}: c={c:.3f}, twin tail mass E_T[(T-c)+]={tt:.5f}; k* median {np.median(ks):.2f}, max {ks.max():.1f}; "
               f"k*<=1 on {(ks<=1).sum()}/21, k*<=3 on {(ks<=3).sum()}/21, k*<=10 on {(ks<=10).sum()}/21")
    big = [r for r in s if r[5] > 10]
    out.append("  k*>10: " + ", ".join(f"{r[0]} ({r[5]})" for r in big))
with open(os.path.join(HERE, "results", "tailratio.csv"), "w", newline="") as f:
    w = csv.writer(f); w.writerow(["pair", "q", "c", "twin_tail", "real_tail", "k_star", "tail_share_of_meanR"]); w.writerows(res)
open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
