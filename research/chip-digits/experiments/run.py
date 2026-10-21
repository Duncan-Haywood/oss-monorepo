"""Sweep weight bits x activation bits on the digits data over 5 train/test splits; check the RTL lane against
NumPy on real layer-1 dot products of every configuration; write results.txt."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from chip_digits import flow, model

SEEDS = range(5)
BITS = range(2, 9)
rows, fl = {}, []
for seed in SEEDS:
    xtr, xte, ytr, yte = model.load(seed)
    p = model.train_float(xtr, ytr, seed, epochs=1500)
    fl.append(model.float_acc(p, xte, yte))
    for wb in BITS:
        for ab in BITS:
            q = model.quantise(p, xtr, wb, ab)
            rows.setdefault((wb, ab), []).append(model.int_acc(q, xte, yte))
out = [f"# float test accuracy over {len(SEEDS)} splits: mean {np.mean(fl):.4f} min {min(fl):.4f} max {max(fl):.4f}",
       "# wb ab acc_mean acc_min acc_max lane_cells lane_ff rtl_ok(dots checked)"]
xtr, xte, ytr, yte = model.load(0)
p = model.train_float(xtr, ytr, 0, epochs=1500)
for (wb, ab), accs in sorted(rows.items()):
    q = model.quantise(p, xtr, wb, ab)
    xi = q["xq"](xte[:4])                               # 4 real images x 16 layer-1 neurons = 64 dot products
    a = np.repeat(xi, model.NHID, axis=0)
    w = np.tile(q["w1"].T, (4, 1))
    got = flow.simulate(wb, ab, a, w)
    ok = got == list((a * w).sum(1))
    s = flow.score(wb, ab)
    out.append(f"{wb} {ab} {np.mean(accs):.4f} {min(accs):.4f} {max(accs):.4f} {s['cells']} {s['ff']} {'ok' if ok else 'MISMATCH'}({len(got)})")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
