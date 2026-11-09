"""Pick the shipped 80% interval per city/target from results/prior_table3_cov_2024.json.

Rule (stated here, applied after the numbers were seen, so post hoc): among the three
models (readable table, per-type baseline, full LightGBM) using the dequantised_nonempty
interval, ship the narrowest whose coverage is at least 0.77 (3 points under nominal);
widths within 1% of the narrowest count as ties and go to the more readable model
(baseline, then table, then full).
Readability matters because the shipped prior is a data file a practitioner reads.
Usage: python3 src/ship_decision.py [results/prior_table3_cov_2024.json]
"""
import json
import sys

FLOOR = 0.77
ORDER = ["baseline", "table3", "full"]  # readability, most readable first


def decide(rows, floor=FLOOR, arm="dequantised_nonempty"):
    out = []
    for r in rows:
        cands = []
        for i, m in enumerate(ORDER):
            a = r["models"][m][arm]
            if a["coverage"] >= floor:
                cands.append((a["width"], i, m, a["coverage"]))
        wmin = min(c[0] for c in cands)
        cands = sorted(c for c in cands if c[0] <= wmin * 1.01)
        # cands sorted by width; re-sort by readability among the near-ties
        w, _, m, c = min(cands, key=lambda t: t[1])
        out.append({"city": r["city"], "target": r["target"], "ship": m,
                    "coverage": round(c, 3), "width": round(w, 1),
                    "widths": {k: round(r["models"][k][arm]["width"], 1) for k in ORDER}})
    return out


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "results/prior_table3_cov_2024.json"
    res = decide(json.load(open(path)))
    for x in res:
        print(f"{x['city']:8s} {x['target']}  ship={x['ship']:8s} cov={x['coverage']} width={x['width']}  all={x['widths']}")
    json.dump(res, open("results/ship_decision_2024.json", "w"), indent=1)
