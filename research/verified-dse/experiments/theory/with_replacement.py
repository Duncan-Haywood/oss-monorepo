"""Coverage of the independent-pairs (with-replacement) pilot quantile on the cached rung_bias table (milestone 36).
Runs no flow. Writes with_replacement_results.txt. Usage: python3 with_replacement.py"""
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

DRAWS, ALPHA, DELTA = 2000, 0.2, 0.2
NP = bound.pairs_needed(ALPHA, DELTA)
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))

out = [f"alpha = delta = {ALPHA}: {NP} independent pilot pairs (at most {2 * NP} points); {DRAWS} pilots per group and rung",
       "clock | design | rung | q median (indep) | q median (disjoint) | mean distinct points | coverage (indep)"]
cover, close, distinct = [], [], []
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        for g in ("r1", "r2", "r3"):
            s = [p[g] for p in sc]
            vals = bound.pair_values(s, y)
            rng = random.Random(f"w{tag}{d}{g}")
            qs, qd, shares, pts = [], [], [], []
            for _ in range(DRAWS):
                pairs = [rng.sample(range(n), 2) for _ in range(NP)]
                flat = [i for pr in pairs for i in pr]
                q = bound.pilot_quantile(s, y, flat)
                qs.append(q)
                shares.append(sum(v > q + 1e-12 for v in vals) / len(vals))
                pts.append(len(set(flat)))
                qd.append(bound.pilot_quantile(s, y, rng.sample(range(n), 2 * NP)))
            ok = sum(x <= ALPHA for x in shares) / DRAWS
            cover.append(ok)
            distinct.append(statistics.mean(pts))
            close.append(abs(statistics.median(qs) - statistics.median(qd)) <= 0.02)
            out.append(f"{tag} | {d} | {g} | {statistics.median(qs):.3f} | {statistics.median(qd):.3f} | {statistics.mean(pts):.2f} | {ok:.3f}")
bar = (1 - DELTA) - 1.96 * math.sqrt((1 - DELTA) * DELTA / DRAWS)
out.append("")
out.append(f"coverage over {len(cover)} cells: min {min(cover):.3f}, median {statistics.median(cover):.3f}; cells under {1 - DELTA}: "
           f"{sum(c < 1 - DELTA for c in cover)}; under {bar:.3f}: {sum(c < bar for c in cover)}")
out.append(f"median q within 0.02 of the disjoint scheme in {sum(close)} of {len(close)} cells")
out.append(f"mean distinct points per pilot: {statistics.mean(distinct):.2f} of {2 * NP} (min over cells {min(distinct):.2f})")
(HERE / "with_replacement_results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out[-4:]))
