"""Pilot-by-pilot coverage of two halving bounds: random-pair quantile (7a) vs the pilot's best few against all (7b).
Runs no flow. Writes topk_results.txt and topk_summary.json. Usage: python3 topk.py [table_dir]  (default rung_bias; e.g. large writes topk_results_large.txt)"""
import json
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound, flow  # noqa: E402

PILOTS, TIEBREAKS, ETA, M, TOP, NOMINAL = 300, 20, 3, 16, 3, 0.8
TABLE = sys.argv[1] if len(sys.argv) > 1 else "rung_bias"
SUF = "" if TABLE == "rung_bias" else "_" + TABLE
rows = [json.loads(l) for l in (HERE.parent / TABLE / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))

out = [f"pilot m = {M}, {PILOTS} pilots x {TIEBREAKS} tie-breaks per cell; A = max over {M // 2} random disjoint pairs, B = best {TOP} pilot points vs all pilot points",
       "clock | design | start | coverage A | coverage B | median bound A | median bound B | realised regret (mean)"]
cells = []
for tag in ("tight", "relaxed"):
    for d in sorted({k[1] for k in by}) if SUF else flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
        keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
        for name, rungs, kp in (("r1", ("r1", "r2", "r3"), keep), ("r2", ("r2", "r3"), keep[:2])):
            rng = random.Random(f"topk{tag}{d}{name}")
            reg = [math.log(bound.halve([s[g] for g in rungs], y, kp, random.Random(f"tb{tag}{d}{name}{t}"))) - math.log(min(y))
                   for t in range(TIEBREAKS)]
            hit_a = hit_b = 0
            ba, bb = [], []
            for _ in range(PILOTS):
                idx = rng.sample(range(n), M)
                a = sum(bound.pilot_quantile(s[g], y, idx) for g in rungs)
                b = sum(bound.pilot_top_inversion(s[g], y, idx, TOP) for g in rungs)
                ba.append(a), bb.append(b)
                hit_a += sum(r <= a + 1e-9 for r in reg)
                hit_b += sum(r <= b + 1e-9 for r in reg)
            tot = PILOTS * TIEBREAKS
            c = {"cell": f"{tag}:{d}:{name}", "cov_a": hit_a / tot, "cov_b": hit_b / tot, "bound_a": statistics.median(ba),
                 "bound_b": statistics.median(bb), "realised": statistics.mean(reg), "max_realised": max(reg)}
            cells.append(c)
            out.append(f"{tag} | {d} | {name} | {c['cov_a']:.3f} | {c['cov_b']:.3f} | {c['bound_a']:.3f} | {c['bound_b']:.3f} | {c['realised']:.3f}")
out.append("")
for st in ("a", "b"):
    cv = [c[f"cov_{st}"] for c in cells]
    out.append(f"{st.upper()}: coverage median {statistics.median(cv):.3f}, min {min(cv):.3f}; cells under {NOMINAL}: {sum(x < NOMINAL for x in cv)} of {len(cv)}; "
               f"pooled mean {statistics.mean(cv):.3f}")
out.append(f"B covers more than A in {sum(c['cov_b'] > c['cov_a'] + 1e-9 for c in cells)} cells, less in {sum(c['cov_b'] < c['cov_a'] - 1e-9 for c in cells)}")
for name in ("r1", "r2"):
    for tag in ("tight", "relaxed"):
        sel = [c for c in cells if c["cell"].startswith(tag) and c["cell"].endswith(name)]
        ok = [c for c in sel if c["cov_b"] >= NOMINAL]
        out.append(f"{tag} from {name}: median bound A {statistics.median(c['bound_a'] for c in sel):.3f}, B {statistics.median(c['bound_b'] for c in sel):.3f}; "
                   f"B covers >= {NOMINAL} on {len(ok)} of {len(sel)} (of those, bound under 0.1 on {sum(c['bound_b'] < 0.1 for c in ok)}); "
                   f"A covers >= {NOMINAL} on {sum(c['cov_a'] >= NOMINAL for c in sel)}; realised regret above 0 in {sum(c['realised'] > 0 for c in sel)}")
(HERE / f"topk_results{SUF}.txt").write_text("\n".join(out) + "\n")
(HERE / f"topk_summary{SUF}.json").write_text(json.dumps(cells, indent=1))
print("\n".join(out[-8:]))
