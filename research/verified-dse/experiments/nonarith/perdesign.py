"""Milestone 15: per-design mean regret (400 paired seeds) of random R4 and fixed arms at the budgets of sweep.py. Runs no flow."""
import json
import random
import sys
import zlib
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = (HERE / "sweep.py").read_text()
src = src[:src.index("out, summary = [], {}")]  # reuse costs, plan, run_sh, random_r4 without rerunning the sweep
exec(compile(src, "sweep_defs", "exec"))
rows = [json.loads(l) for l in (HERE / "results.jsonl").read_text().splitlines()]
C = costs([r for r in rows if r["status"] == "ok" and r["tag"] == "tight"])
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(r)
out = []
for tag in ("tight", "relaxed"):
    out.append(f"## {tag}: mean regret % per design (random | " + " ; ".join(map(str, ETAS)) + ")")
    for B in (20, 40, 80, 150, 250):
        for d in sorted({d for _, d in by}):
            sc = [flow.scores(r) for r in by[(tag, d)]]
            ref = [x["r4"] for x in sc]
            lo = min(ref)
            cells = []
            for s in ("rand",) + ETAS:
                v = []
                for seed in range(SEEDS):
                    rng = random.Random(seed * 7919 + zlib.crc32(d.encode()) % 1000)
                    x = random_r4(C, ref, B, rng) if s == "rand" else run_sh(C, sc, ref, B, s, rng)
                    if x is not None:
                        v.append((x / lo - 1) * 100)
                cells.append(f"{M(v):.2f}" if v else "n/a")
            out.append(f"B={B} {d}: " + " | ".join(cells))
(HERE / "perdesign.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
