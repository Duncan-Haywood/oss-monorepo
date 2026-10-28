"""Table of the median's excess loss against coalition size k at M = 16, for the
independent -10x flip (5j, 5k, 5k-b) and the coordinated same-vector attack
(5l, 5m, 5n). Reads the recorded jsonl files; excess is over the clean median of
the same seed (median_m16_full.jsonl, agg=median, offset=1.0).

    python3 paper/breakdown_table.py > paper/breakdown_table.md
"""
import json, math, pathlib

E = pathlib.Path(__file__).resolve().parent.parent / "experiments"


def rows(p):
    return [json.loads(l) for l in (E / p).read_text().splitlines() if l.strip()]


clean = {r["seed"]: r["loss"] for r in rows("gpt_median_m16/median_m16_full.jsonl")
         if r["agg"] == "median" and r["offset"] == 1.0}


def curve(files):
    out = {}
    for f in files:
        for r in rows(f):
            out.setdefault(r["k"], {})[r["seed"]] = r["loss"]  # same seed+k reruns are bit-identical
    return out


def cell(d):
    ex = {s: l - clean[s] for s, l in d.items()}
    if any(not math.isfinite(l) or l > 3 for l in d.values()):
        return "diverged", len(d)
    return f"{sum(ex.values()) / len(ex):+.3f}", len(d)


indep = curve(["gpt_median_coalition/coalition.jsonl", "gpt_median_k7/k7.jsonl"])
coord = curve(["gpt_median_coalition/coordinated.jsonl"])
print("| k of 16 | independent -10x flip (excess nats, seeds) | coordinated same-vector (excess nats, seeds) |")
print("|---|---|---|")
for k in range(2, 10):
    a = "not run" if k not in indep else "{} ({})".format(*cell(indep[k]))
    b = "not run" if k not in coord else "{} ({})".format(*cell(coord[k]))
    print(f"| {k} | {a} | {b} |")
