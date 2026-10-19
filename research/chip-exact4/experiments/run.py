"""Exact cost of every 4-input NPN class, then ABC's gate count on sampled members under each script.

Usage: python run.py   (needs python-sat and yosys; writes exact_costs.json, abc_counts.json, results.txt)
"""
import json
import random
import sys
from collections import Counter, defaultdict
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from chip_exact4 import abc as A  # noqa: E402
from chip_exact4 import exact as E  # noqa: E402

SEED, MEMBERS = 1, 3  # per class: its representative plus MEMBERS random other members


def exact_costs(rep, classes):
    p = HERE / "exact_costs.json"
    if p.exists():
        return {int(k): v for k, v in json.loads(p.read_text()).items()}
    c = {r: E.cost(r) for r in sorted(classes)}
    p.write_text(json.dumps(c, indent=0))
    return c


def job(a):
    f, v = a
    return f, v, A.count(f, v)


def main():
    rep, classes = E.npn_classes()
    cost = exact_costs(rep, classes)
    rng = random.Random(SEED)
    members = defaultdict(list)
    for f, r in enumerate(rep):
        members[r].append(f)
    sample = []
    for r in sorted(classes):
        others = [f for f in members[r] if f != r]
        sample += [r] + (rng.sample(others, min(MEMBERS, len(others))))
    jobs = [(f, v) for f in sample for v in A.VARIANTS]
    with Pool() as pool:
        got = pool.map(job, jobs, chunksize=8)
    counts = {(f, v): c for f, v, c in got}
    (HERE / "abc_counts.json").write_text(json.dumps({f"{f:04x}|{v}": c for (f, v), c in counts.items()}))
    lines = [f"seed {SEED}; {len(classes)} NPN classes; {len(sample)} functions "
             f"(representative + up to {MEMBERS} random members per class); yosys gates exclude inverters",
             "exact cost histogram (functions, classes) by gates: "
             + ", ".join(f"{c}:{sum(classes[r] for r in cost if cost[r] == c)},{sum(1 for r in cost if cost[r] == c)}"
                         for c in sorted(set(cost.values())))]
    lines.append("== A. gap = ABC gates - exact gates, over the sampled functions")
    lines.append("variant  mean_gap  optimal%  max_gap  mean_gates  mean_inverters")
    for v in A.VARIANTS:
        gaps = [counts[f, v][0] - cost[rep[f]] for f in sample]
        assert min(gaps) >= 0, (v, min(gaps))
        n = len(gaps)
        lines.append(f"{v} {sum(gaps)/n:.3f} {100*sum(g == 0 for g in gaps)/n:.1f} {max(gaps)} "
                     f"{sum(counts[f, v][0] for f in sample)/n:.3f} {sum(counts[f, v][1] for f in sample)/n:.3f}")
    lines.append("== B. mean gap by exact cost (variant default, resyn2_map, resyn2x3_dch_map)")
    lines.append("cost n default resyn2_map resyn2x3_dch_map")
    for c in sorted(set(cost.values())):
        fs = [f for f in sample if cost[rep[f]] == c]
        row = [sum(counts[f, v][0] - c for f in fs) / len(fs) for v in ("default", "resyn2_map", "resyn2x3_dch_map")]
        lines.append(f"{c} {len(fs)} " + " ".join(f"{x:.3f}" for x in row))
    lines.append("== C. does the gap depend on which NPN member is synthesised? (classes where the gap varies)")
    lines.append("variant classes_varying of_total mean_spread")
    for v in A.VARIANTS:
        spreads = []
        for r in classes:
            g = [counts[f, v][0] for f in sample if rep[f] == r]
            spreads.append(max(g) - min(g))
        lines.append(f"{v} {sum(s > 0 for s in spreads)} {len(spreads)} {sum(spreads)/len(spreads):.3f}")
    lines.append("== D. best of all variants per function (a portfolio of scripts)")
    best = [min(counts[f, v][0] for v in A.VARIANTS) - cost[rep[f]] for f in sample]
    lines.append(f"mean_gap {sum(best)/len(best):.3f} optimal% {100*sum(g == 0 for g in best)/len(best):.1f} "
                 f"max_gap {max(best)} still_above_optimum {sum(g > 0 for g in best)} of {len(best)}")
    worst = Counter()
    for f in sample:
        b = min(counts[f, v][0] for v in A.VARIANTS) - cost[rep[f]]
        worst[b] += 1
    lines.append("portfolio gap histogram: " + ", ".join(f"{k}:{worst[k]}" for k in sorted(worst)))
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
