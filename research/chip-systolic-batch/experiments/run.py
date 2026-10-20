"""Sweep batch size R: R x C systolic array vs chip-accel's P-lane engine run R times in sequence.
Writes experiments/results.txt. Run: PYTHONPATH=src python experiments/run.py"""
import os
import subprocess
import numpy as np
from chip_systolic_batch import baseline_gen, flow, gen, model

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
RS, CS, PS, WBS, NCHECK = (4, 8, 16), (2, 4), (2, 4), (4,), 32
xtr, ytr = model.make_data(0, 400)
xte, yte = model.make_data(1, 400)
params = model.train_float(xtr, ytr)
ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
iv = subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0]
def emit(l):
    lines.append(l)
    print(l, flush=True)
    open(OUT, "w").write("\n".join(lines) + "\n")


lines = [f"# {ver}; {iv}", "# cycles per batch of R vectors; cells = Yosys generic-gate cells incl. flip-flops; cells*cycles per batch", "",
         "WB R   design        MACs cycles  cells    depth  cells*cycles  cells*cycles/R  rtl==numpy(%d vecs)" % NCHECK]
for wb in WBS:
    q = model.quantise(params, xtr, wb)
    xi = q["xq"](xte[:NCHECK])
    ref = model.int_forward(q, xi)
    base = {p: flow.score_baseline(q, p) for p in PS}
    for r in RS:
        for c in CS:
            out, cs = flow.simulate(q, c, r, xi)
            ok = bool((out == ref).all()) and set(cs) == {gen.cycles(c, r)}
            s, cy = flow.score(q, c, r), gen.cycles(c, r)
            emit(f"{wb:2d} {r:2d}  systolic {r}x{c:<2d} {r*c:4d} {cy:6d} {s['cells']:6d} {s['depth']:5d} {s['cells']*cy:13d} {s['cells']*cy//r:14d}  {ok}")
        for p in PS:
            s, cy = base[p], r * baseline_gen.cycles(p)
            emit(f"{wb:2d} {r:2d}  mac-lane P={p:<2d}   {p:4d} {cy:6d} {s['cells']:6d} {s['depth']:5d} {s['cells']*cy:13d} {s['cells']*cy//r:14d}  (r sequential runs; not re-simulated)")
        emit("")
