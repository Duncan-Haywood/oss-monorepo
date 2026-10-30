"""Pilot quantile of pair inversions and the quantile halving bound on the cached rung_bias table (milestone 7a).
Runs no flow. Writes quantile_results.txt and quantile_summary.json. Usage: python3 quantile.py"""
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

DRAWS, ETA, ALPHA, DELTA = 2000, 3, 0.2, 0.2
M = 2 * bound.pairs_needed(ALPHA, DELTA)
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))

out = [f"alpha = delta = {ALPHA}: {M // 2} disjoint pilot pairs ({M} points); {DRAWS} pilots per group and rung",
       "clock | design | rung | iota | q median | q/iota median | share of pairs with v>q (median, 90th pct) | draws with share <= alpha",
       ]
summ, cover, ratios, qb_rows = {}, [], [], []
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
        k1 = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
        rec = {}
        qmed = {}
        for g in s:
            vals = sorted(bound.pair_values(s[g], y))
            iota = bound.inversion(s[g], y)
            rng = random.Random(f"q{tag}{d}{g}")
            qs, shares = [], []
            for _ in range(DRAWS):
                idx = rng.sample(range(n), M)
                q = bound.pilot_quantile(s[g], y, idx)
                qs.append(q)
                shares.append(sum(v > q + 1e-12 for v in vals) / len(vals))
            ok = sum(x <= ALPHA for x in shares) / DRAWS
            cover.append(ok)
            qmed[g] = statistics.median(qs)
            if iota > 0:
                ratios.append(qmed[g] / iota)
            rec[g] = {"iota": iota, "q_median": qmed[g], "coverage": ok, "share_median": statistics.median(shares)}
            out.append(f"{tag} | {d} | {g} | {iota:.3f} | {qmed[g]:.3f} | {'n/a' if iota <= 0 else f'{qmed[g] / iota:.2f}'} | "
                       f"{statistics.median(shares):.3f}, {sorted(shares)[int(0.9 * DRAWS)]:.3f} | {ok:.3f}")
        # quantile bound for halving vs the realised regret of milestone 6 (same tie-break seeds and draws)
        for name, rungs, keep in (("r1", ("r1", "r2", "r3"), k1), ("r2", ("r2", "r3"), k1[:2])):
            rng = random.Random(f"{tag}{d}{name}")
            reg = statistics.mean(math.log(bound.halve([s[g] for g in rungs], y, keep, rng)) - math.log(min(y)) for _ in range(200))
            qb = sum(qmed[g] for g in rungs)
            mb = sum(rec[g]["iota"] for g in rungs)
            qb_rows.append({"cell": f"{tag}:{d}:{name}", "realised": reg, "quantile_bound": qb, "max_bound": mb})
        summ[f"{tag}:{d}"] = rec
out.append("")
low = [c for c in cover if c < ALPHA * 0 + (1 - DELTA)]
bar = (1 - DELTA) - 1.96 * math.sqrt((1 - DELTA) * DELTA / DRAWS)
out.append(f"coverage (draws with exceedance share <= {ALPHA}) over {len(cover)} group-rung cells: min {min(cover):.3f}, median {statistics.median(cover):.3f}; "
           f"cells under {1 - DELTA}: {len(low)}; cells under {bar:.3f} (nominal minus 95% binomial margin): {sum(c < bar for c in cover)}")
out.append(f"median q/iota over cells with iota > 0: {statistics.median(ratios):.2f} ({len(ratios)} cells)")
viol = [r for r in qb_rows if r["realised"] > r["quantile_bound"] + 1e-9]
out.append(f"halving cells where realised regret > sum of median pilot quantiles: {len(viol)} of {len(qb_rows)}")
for name in ("r1", "r2"):
    for tag in ("tight", "relaxed"):
        sel = [r for r in qb_rows if r["cell"].startswith(tag) and r["cell"].endswith(name)]
        out.append(f"{tag} from {name}: median quantile bound {statistics.median(r['quantile_bound'] for r in sel):.3f}, median max-inversion bound "
                   f"{statistics.median(r['max_bound'] for r in sel):.3f}, median realised {statistics.median(r['realised'] for r in sel):.3f}, "
                   f"quantile bound under 0.1 on {sum(r['quantile_bound'] < 0.1 for r in sel)} of {len(sel)}, violated on {sum(r['realised'] > r['quantile_bound'] + 1e-9 for r in sel)}")
(HERE / "quantile_results.txt").write_text("\n".join(out) + "\n")
(HERE / "quantile_summary.json").write_text(json.dumps({"groups": summ, "halving": qb_rows}, indent=1))
print("\n".join(out[-12:]))
