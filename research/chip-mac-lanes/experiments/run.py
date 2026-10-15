"""Exhaustive MAC-lane sweep: every lane count P = 1..20 for the F-16-4 quantised MLP at F = 16 and 32, RTL simulated in Icarus
against the integer NumPy reference (32 vectors) with measured cycles checked against the formula, scored with Yosys.
Writes experiments/results.txt. Run: PYTHONPATH=src python experiments/run.py"""
import os
import subprocess
from chip_mac_lanes import baseline_gen, flow, model

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
FS, PS, WB, NCHECK = (16, 32), range(1, 21), 4, 32
ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
iv = subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0]
lines = []
def emit(l):
    lines.append(l)
    print(l, flush=True)
    open(OUT, "w").write("\n".join(lines) + "\n")

emit(f"# {ver}; {iv}")
emit("# F-16-4 MLP, WB=%d, same data/seed/weights as chip-systolic-hidewide; cells = Yosys generic-gate cells incl. flip-flops" % WB)
emit("# every P: RTL simulated on %d vectors, compared bit for bit with the NumPy reference; cycles measured == formula" % NCHECK)
emit("F  P   cycles  cells  depth  cells*cycles  rtl==numpy")
for f in FS:
    xtr, ytr = model.make_data(0, 400, f)
    xte, _ = model.make_data(1, 400, f)
    q = model.quantise(model.train_float(xtr, ytr), xtr, WB)
    xi = q["xq"](xte[:NCHECK])
    ref = model.int_forward(q, xi)
    rows = []
    for p in PS:
        out, cs = flow.simulate(q, p, xi)
        cy = baseline_gen.cycles(p, f, model.H)
        ok = bool((out == ref).all()) and set(cs) == {cy}
        s = flow.score(q, p)
        rows.append((s["cells"] * cy, p))
        emit(f"{f:2d} {p:2d} {cy:7d} {s['cells']:6d} {s['depth']:5d} {s['cells']*cy:11d}  {ok}")
    m, p = min(rows)
    emit(f"F={f}: best P = {p} ({m} cells*cycles)")
