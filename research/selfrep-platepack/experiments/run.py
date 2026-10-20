import math, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_platepack.model import DIVISORS, effective_doubling, plated, work_hours

REPS, N0, TARGET = 100, 1, 64
CHANGE = (0.0, 0.25, 0.5, 1.0)
W0 = work_hours(plated(1, 0.0))
out = [f"assumed inputs (as selfrep-partpool): 44 printed parts of 1.0 h each, assembly 6 h, work per copy {W0:.1f} h without changeover",
       f"plate = k parts printed together, k divides 44; plate job = k h + changeover (ASSUMED 0, 0.25, 0.5, 1 h per plate)",
       f"fleet {N0} -> {TARGET}, no import limit, job CV 0.2, {REPS} runs per cell, seed 0; effective doubling = time / 6 (hours), median",
       f"fluid floor for zero changeover W ln2 = {W0*math.log(2):.1f} h", ""]

def med(p, pol):
    return effective_doubling(p, pol, N0, TARGET, REPS)[1]

res = {}
for pol in ("focus", "whole"):
    for k in DIVISORS:
        for c in CHANGE:
            res[pol, k, c] = med(plated(k, c), pol)
for sec, pol in (("A", "focus"), ("B", "whole")):
    out.append(f"== {sec}. policy {pol}: median effective doubling (h) by parts per plate k (rows) and changeover per plate (columns, h)")
    out.append(f"{'k':>4}  {'plates':>6}  " + "  ".join(f"{'c=' + format(c, 'g'):>7}" for c in CHANGE))
    for k in DIVISORS:
        out.append(f"{k:4d}  {44 // k:6d}  " + "  ".join(f"{res[pol, k, c]:7.1f}" for c in CHANGE))
    out.append("")
out.append("== C. best k per changeover")
out.append(f"{'c':>5}  {'focus k':>8}  {'focus h':>8}  {'whole k':>8}  {'whole h':>8}  {'focus gain %':>12}")
for c in CHANGE:
    bf = min(DIVISORS, key=lambda k: res["focus", k, c])
    bw = min(DIVISORS, key=lambda k: res["whole", k, c])
    out.append(f"{c:5g}  {bf:8d}  {res['focus', bf, c]:8.1f}  {bw:8d}  {res['whole', bw, c]:8.1f}  "
               f"{100 * (1 - res['focus', bf, c] / res['whole', bw, c]):12.1f}")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
