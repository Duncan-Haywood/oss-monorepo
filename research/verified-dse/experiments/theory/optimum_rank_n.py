"""Does rho_j / k_j grow with pool size n? (milestone 45)
Runs no flow. Writes optimum_rank_n_results.txt. Usage: python3 optimum_rank_n.py

Same cells and cut rule as optimum_rank.py (r1 start, keep n//3, n//9, n//27 floored at 1). Each cell's pool is subsampled
without replacement to n' in {20, 30, 40, 50} (cells with fewer candidates are skipped at that n'), the pool optimum x* is
recomputed on the subsample, and rho_j / k_j is taken over the three cuts. 200 subsamples per cell and n'. Pool sizes above
the cached 50 to 52 candidates cannot be measured here."""
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

DRAWS, ETA, SIZES = 200, 3, (20, 30, 40, 50)

if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["n' | cells | median rho/k | mean rho/k | share rho/k<=1 | share rho/k<=2 | median of per-cell medians"]
    summary = {}
    for m in SIZES:
        pooled, cellmed = [], []
        for (tag, d), sc in sorted(by.items()):
            if len(sc) < m:
                continue
            rng = random.Random(f"orn{tag}{d}{m}")
            vals = []
            for _ in range(DRAWS):
                idx = rng.sample(range(len(sc)), m)
                y = [sc[i]["r4"] for i in idx]
                star = min(range(m), key=lambda i: y[i])
                keep = [max(1, m // ETA ** j) for j in (1, 2, 3)]
                ratio = 0.0
                for g, k in zip(("r1", "r2", "r3"), keep):
                    s = [sc[i][g] for i in idx]
                    rho = sum(1 for z in range(m) if z != star and s[z] <= s[star])
                    ratio = max(ratio, rho / k)
                vals.append(ratio)
            pooled += vals
            cellmed.append(statistics.median(vals))
        n_c = len(cellmed)
        row = (m, n_c, statistics.median(pooled), statistics.mean(pooled), sum(v <= 1 for v in pooled) / len(pooled),
               sum(v <= 2 for v in pooled) / len(pooled), statistics.median(cellmed))
        summary[m] = row
        out.append(f"{row[0]} | {row[1]} | {row[2]:.2f} | {row[3]:.2f} | {row[4]:.3f} | {row[5]:.3f} | {row[6]:.2f}")
    (HERE / "optimum_rank_n_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
