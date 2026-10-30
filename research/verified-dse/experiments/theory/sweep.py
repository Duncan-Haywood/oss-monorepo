"""Pilot size m and top-k sweep for the top-vs-all halving bound (7c), plus the hypergeometric check. Runs no flow.
Writes sweep_results.txt and sweep_summary.json. Usage: python3 sweep.py"""
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

PILOTS, TIEBREAKS, ETA, NOMINAL = 200, 10, 3, 0.8
MS, TOPS, POOLTOP = (6, 8, 12, 16, 24), (1, 3, 5), 3
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))


def p_hit(n, j, m):
    """P(a pilot of m drawn without replacement from n contains at least one of j given points)."""
    return 1 - math.comb(n - j, m) / math.comb(n, m)


cells = []
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
        keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
        poolbest = set(sorted(range(n), key=lambda i: y[i])[:POOLTOP])
        for name, rungs, kp in (("r1", ("r1", "r2", "r3"), keep), ("r2", ("r2", "r3"), keep[:2])):
            reg = [math.log(bound.halve([s[g] for g in rungs], y, kp, random.Random(f"tb{tag}{d}{name}{t}"))) - math.log(min(y))
                   for t in range(TIEBREAKS)]
            for m in MS:
                rng = random.Random(f"sw{tag}{d}{name}{m}")
                pilots = [rng.sample(range(n), m) for _ in range(PILOTS)]
                emp = statistics.mean(any(i in poolbest for i in p) for p in pilots)
                for top in TOPS:
                    bs = [sum(bound.pilot_top_inversion(s[g], y, p, top) for g in rungs) for p in pilots]
                    cov = sum(r <= b + 1e-9 for b in bs for r in reg) / (PILOTS * TIEBREAKS)
                    cells.append({"clock": tag, "design": d, "start": name, "m": m, "top": top, "n": n, "cov": cov,
                                  "bound": statistics.median(bs), "realised": statistics.mean(reg),
                                  "hit_emp": emp, "hit_theory": p_hit(n, POOLTOP, m)})
out = ["clock, design, start, m, top: coverage of the pilot-by-pilot top-vs-all bound, median bound; per-m summary below"]
for m in MS:
    for top in TOPS:
        sel = [c for c in cells if c["m"] == m and c["top"] == top]
        pos = [c for c in sel if c["realised"] > 0]
        out.append(f"m={m:2d} top={top}: coverage median {statistics.median(c['cov'] for c in sel):.3f}, min {min(c['cov'] for c in sel):.3f}, "
                   f"cells under {NOMINAL}: {sum(c['cov'] < NOMINAL for c in sel)} of {len(sel)} (realised regret > 0: "
                   f"{sum(c['cov'] < NOMINAL for c in pos)} of {len(pos)}); median bound {statistics.median(c['bound'] for c in sel):.3f}; "
                   f"cells covered with bound under 0.1: {sum(c['cov'] >= NOMINAL and c['bound'] < 0.1 for c in sel)}")
out.append("")
out.append(f"hypergeometric check: P(pilot contains one of the pool's best {POOLTOP}); empirical (mean over cells) vs formula")
for m in MS:
    sel = [c for c in cells if c["m"] == m and c["top"] == 1]
    out.append(f"m={m:2d}: empirical {statistics.mean(c['hit_emp'] for c in sel):.3f}, formula {statistics.mean(c['hit_theory'] for c in sel):.3f}")
out.append("")
out.append("mean coverage over cells with realised regret > 0, by m (pool sizes are equal, so a per-cell correlation with the formula is undefined)")
for m in MS:
    sel = [c for c in cells if c["m"] == m and c["realised"] > 0]
    out.append(f"m={m:2d}: top=1 {statistics.mean(c['cov'] for c in sel if c['top'] == 1):.3f}, top=3 {statistics.mean(c['cov'] for c in sel if c['top'] == 3):.3f}, "
               f"top=5 {statistics.mean(c['cov'] for c in sel if c['top'] == 5):.3f}; formula P(hit best {POOLTOP}) {statistics.mean(c['hit_theory'] for c in sel):.3f}")
(HERE / "sweep_results.txt").write_text("\n".join(out) + "\n")
(HERE / "sweep_summary.json").write_text(json.dumps(cells, indent=1))
print("\n".join(out))
