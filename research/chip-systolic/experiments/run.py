"""Compare an R x C systolic array with chip-accel's P-lane engine on a batch of R=4 vectors.
Writes experiments/results.txt. Run: PYTHONPATH=src python experiments/run.py"""
import os
import subprocess
import numpy as np
from chip_systolic import flow, gen, model

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
R, CS, PS, WBS, NCHECK = 4, (1, 2, 4, 8), (1, 2, 4, 8), (4, 6, 8), 40
xtr, ytr = model.make_data(0, 400)
xte, yte = model.make_data(1, 400)
params = model.train_float(xtr, ytr)
ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
iv = subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0]
lines = [f"# {ver}; {iv}", f"# batch R={R}; cycles are per batch of {R} vectors; cells = Yosys generic-gate cells incl. flip-flops", "",
         "WB design        MACs cycles  cells    ff depth  cells*cycles  rtl==numpy(%d vecs)" % NCHECK]
for wb in WBS:
    q = model.quantise(params, xtr, wb)
    ref = model.int_forward(q, q["xq"](xte[:NCHECK]))
    xi = q["xq"](xte[:NCHECK])
    for c in CS:
        out, cs = flow.simulate(q, c, R, xi)
        ok = bool((out == ref).all()) and set(cs) == {gen.cycles(c, R)}
        s = flow.score(q, c, R)
        cy = gen.cycles(c, R)
        lines.append(f"{wb:2d} systolic {R}x{c:<2d} {R*c:4d} {cy:6d} {s['cells']:6d} {s['ff']:5d} {s['depth']:5d} {s['cells']*cy:13d}  {ok}")
    for p in PS:
        s = flow.score_baseline(q, p)
        from chip_systolic import baseline_gen
        cy = R * baseline_gen.cycles(p)
        lines.append(f"{wb:2d} mac-lane P={p:<2d}   {p:4d} {cy:6d} {s['cells']:6d} {s['ff']:5d} {s['depth']:5d} {s['cells']*cy:13d}  (chip-accel design, 4 sequential vectors; not re-simulated here)")
    lines.append("")
open(OUT, "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
