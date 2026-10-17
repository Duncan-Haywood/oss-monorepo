"""Small fixed arrays reused over a stream of vectors: R x C systolic array (R = 1, 2, 4) vs chip-accel's P-lane engine.
Each array is run on 8 vectors as 8/R successive batches (the same hardware reused), RTL checked against NumPy.
Writes experiments/results.txt. Run: PYTHONPATH=src python experiments/run.py"""
import os
import subprocess
import numpy as np
from chip_systolic_small import baseline_gen, flow, gen, model

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
RS, CS, PS, WB, NCHECK = (1, 2, 4), (2, 4), (2, 4), 4, 32
xtr, ytr = model.make_data(0, 400)
xte, yte = model.make_data(1, 400)
params = model.train_float(xtr, ytr)
ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
iv = subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0]
lines = []
def emit(l):
    lines.append(l)
    print(l, flush=True)
    open(OUT, "w").write("\n".join(lines) + "\n")

emit(f"# {ver}; {iv}")
emit("# cycles per batch of R vectors (array reused for %d vectors = %d/R batches); cells = Yosys generic-gate cells incl. flip-flops" % (NCHECK, NCHECK))
emit("# cells*cycles/vec = cells * cycles_per_batch / R")
emit("WB R   design        MACs cycles/batch  cells  depth  cells*cycles/vec  rtl==numpy(%d vecs)" % NCHECK)
q = model.quantise(params, xtr, WB)
xi = q["xq"](xte[:NCHECK])
ref = model.int_forward(q, xi)
for r in RS:
    for c in CS:
        out, cs = flow.simulate(q, c, r, xi)
        ok = bool((out == ref).all()) and set(cs) == {gen.cycles(c, r)}
        s, cy = flow.score(q, c, r), gen.cycles(c, r)
        emit(f"{WB:2d} {r:2d}  systolic {r}x{c:<2d} {r*c:4d} {cy:6d} {s['cells']:8d} {s['depth']:5d} {s['cells']*cy//r:14d}  {ok}")
for p in PS:
    s, cy = flow.score_baseline(q, p), baseline_gen.cycles(p)
    emit(f"{WB:2d}  1  mac-lane P={p:<2d}   {p:4d} {cy:6d} {s['cells']:8d} {s['depth']:5d} {s['cells']*cy:14d}  (formula from chip-accel; not re-simulated)")
