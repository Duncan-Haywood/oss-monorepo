"""Wider-hidden fan-in sweep: small output-stationary systolic arrays vs chip-accel's P-lane MAC engine on an F-16-4 quantised MLP, F = 16, 32.
Arrays: R = 1 with C = 4, 8, 16 columns, and R = 2 with C = 8; MAC lanes P = 4, 8, 16. RTL checked against the integer NumPy
reference on 32 test vectors (run as 32/R back-to-back batches on one instance). Writes experiments/results.txt.
Run: PYTHONPATH=src python experiments/run.py"""
import os
import subprocess
from chip_systolic_hidewide import baseline_gen, flow, gen, model

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
FS, ARRAYS, PS, WB, NCHECK = (16, 32), ((1, 4), (1, 8), (1, 16), (2, 8)), (4, 8, 16), 4, 32
ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
iv = subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0]
lines = []
def emit(l):
    lines.append(l)
    print(l, flush=True)
    open(OUT, "w").write("\n".join(lines) + "\n")

emit(f"# {ver}; {iv}")
emit("# F-16-4 MLP, WB=%d; cells = Yosys generic-gate cells incl. flip-flops; cells*cycles/vec = cells * cycles_per_batch / R" % WB)
emit("# array RTL simulated on %d vectors and compared with the NumPy reference; MAC-lane cycles from the chip-accel formula (not simulated)" % NCHECK)
emit("F  design        cycles/batch  cells  depth  cells*cycles/vec  rtl==numpy")
for f in FS:
    xtr, ytr = model.make_data(0, 400, f)
    xte, _ = model.make_data(1, 400, f)
    q = model.quantise(model.train_float(xtr, ytr), xtr, WB)
    xi = q["xq"](xte[:NCHECK])
    ref = model.int_forward(q, xi)
    best_arr = best_mac = None
    for r, c in ARRAYS:
        out, cs = flow.simulate(q, c, r, xi)
        cy = gen.cycles(c, r, f, model.H)
        ok = bool((out == ref).all()) and set(cs) == {cy}
        s = flow.score(q, c, r)
        m = s["cells"] * cy // r
        best_arr = m if best_arr is None else min(best_arr, m)
        emit(f"{f:2d} systolic {r}x{c:<2d} {cy:8d} {s['cells']:8d} {s['depth']:5d} {m:14d}  {ok}")
    for p in PS:
        cy = baseline_gen.cycles(p, f, model.H)
        s = flow.score_baseline(q, p)
        m = s["cells"] * cy
        best_mac = m if best_mac is None else min(best_mac, m)
        emit(f"{f:2d} mac-lane P={p:<2d} {cy:7d} {s['cells']:8d} {s['depth']:5d} {m:14d}  -")
    emit(f"F={f}: best array / best MAC engine (cells*cycles/vec) = {best_arr / best_mac:.2f}")
