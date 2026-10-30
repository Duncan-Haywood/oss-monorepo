"""Check the halving regret bound (sum of rung inversions) on the cached rung_bias table (milestone 6).
Runs no flow. Writes results.txt and summary.json. Usage: python3 bound.py"""
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

DRAWS, PILOT, ETA = 200, 10, 3
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))

M = statistics.mean
out, summ = [], {}
out.append("log-units; bound = sum of rung inversions over the cut rungs; realised = mean over 200 random tie-breaks of log(best routed found / pool minimum)")
out.append("clock | design | n | iota1 | iota2 | iota3 | bound R1->R4 | realised R1->R4 | bound R2->R4 | realised R2->R4 | pilot10/iota (r1 r2 r3, median)")
viol = 0
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
        iota = {g: bound.inversion(s[g], y) for g in s}
        k1 = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
        res = {}
        for name, rungs, keep in (("r1", ("r1", "r2", "r3"), k1), ("r2", ("r2", "r3"), k1[:2])):
            rng = random.Random(f"{tag}{d}{name}")
            reg = M(math.log(bound.halve([s[g] for g in rungs], y, keep, rng)) - math.log(min(y)) for _ in range(DRAWS))
            b = bound.bound([iota[g] for g in rungs])
            viol += reg > b + 1e-9
            res[name] = {"bound": b, "realised": reg}
        rng = random.Random(f"pilot{tag}{d}")
        ratio = {}
        for g in s:
            if iota[g] <= 0:
                ratio[g] = None
                continue
            vals = []
            for _ in range(DRAWS):
                idx = rng.sample(range(n), PILOT)
                vals.append(bound.inversion([s[g][i] for i in idx], [y[i] for i in idx]) / iota[g])
            ratio[g] = statistics.median(vals)
        summ[f"{tag}:{d}"] = {"n": n, "iota": iota, "halving": res, "pilot_ratio": ratio}
        f = lambda v: "n/a" if v is None else f"{v:.2f}"
        out.append(f"{tag} | {d} | {n} | {iota['r1']:.2f} | {iota['r2']:.2f} | {iota['r3']:.2f} | {res['r1']['bound']:.2f} | {res['r1']['realised']:.3f} | "
                   f"{res['r2']['bound']:.2f} | {res['r2']['realised']:.3f} | {f(ratio['r1'])} {f(ratio['r2'])} {f(ratio['r3'])}")
out.append("")
out.append(f"violations of the bound (realised > bound): {viol} of {2 * len(flow.DESIGNS) * 2} cells")
for tag in ("tight", "relaxed"):
    for g in ("r1", "r2", "r3"):
        v = [summ[f"{tag}:{d}"]["iota"][g] for d in flow.DESIGNS]
        out.append(f"{tag} iota_{g[1]}: median {statistics.median(v):.2f}, groups with iota < 0.05: {sum(x < 0.05 for x in v)} of {len(v)}, with iota > 0.3: {sum(x > 0.3 for x in v)}")
for tag in ("tight", "relaxed"):
    for name in ("r1", "r2"):
        b = [summ[f"{tag}:{d}"]["halving"][name]["bound"] for d in flow.DESIGNS]
        r = [summ[f"{tag}:{d}"]["halving"][name]["realised"] for d in flow.DESIGNS]
        out.append(f"{tag} halving from {name}: median bound {statistics.median(b):.2f}, median realised {statistics.median(r):.3f}, bound below 0.05 on {sum(x < 0.05 for x in b)} of {len(b)}, "
                   f"median realised/bound {statistics.median(x / y for x, y in zip(r, b) if y > 0):.2f}")
for g in ("r1", "r2", "r3"):
    v = [summ[k]["pilot_ratio"][g] for k in summ if summ[k]["pilot_ratio"][g] is not None]
    out.append(f"pilot of {PILOT} sees median {statistics.median(v):.2f} of iota_{g[1]} (across {len(v)} groups, median over draws)")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summ, indent=1))
print("\n".join(out))
