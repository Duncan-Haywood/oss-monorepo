"""Sweep MAC lanes P x bit width WB. Writes experiments/results.txt. Run: PYTHONPATH=src python experiments/run.py"""
import os
import subprocess
import numpy as np
from chip_accel import flow, gen, model

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
PS, WBS, NCHECK = (1, 2, 4, 8), (4, 6, 8), 40
xtr, ytr = model.make_data(0, 400)
xte, yte = model.make_data(1, 400)          # held-out draw from the same four clusters
params = model.train_float(xtr, ytr)
h = np.maximum(xte @ params[0] + params[1], 0)
facc = float((np.argmax(h @ params[2] + params[3], 1) == yte).mean())
ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
iv = subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0]
lines = [f"# {ver}; {iv}", f"# float model held-out accuracy {facc:.3f} (400 test points, 4 clusters in 8-D)", ""]
lines.append("WB  P  cycles  cells   ff  depth  cells*cycles  int_acc  rtl==numpy(%d vecs)" % NCHECK)
for wb in WBS:
    q = model.quantise(params, xtr, wb)
    ref_all = model.int_forward(q, q["xq"](xte))
    acc = float((model.predict(ref_all) == yte).mean())
    xi = q["xq"](xte[:NCHECK])
    for p in PS:
        out, cs = flow.simulate(q, p, xi)
        ok = bool((out == ref_all[:NCHECK]).all()) and set(cs) == {gen.cycles(p)}
        s = flow.score(q, p)
        lines.append(f"{wb:2d} {p:2d} {gen.cycles(p):7d} {s['cells']:6d} {s['ff']:4d} {s['depth']:6d} {s['cells']*gen.cycles(p):13d}  {acc:.3f}    {ok}")
open(OUT, "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
