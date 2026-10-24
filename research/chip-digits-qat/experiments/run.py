"""Float -> PTQ(max), PTQ(MSE clip), per-channel, QAT on digits, W in 2..4, A in 3..5, 5 splits."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from chip_digits_qat import qat
from chip_digits import model

SEEDS, WS, AS = range(5), (2, 3, 4), (3, 4, 5)
M = ("ptq_max", "ptq_clip", "perchannel", "qat")
rows, fl = {}, []
for seed in SEEDS:
    xtr, xte, ytr, yte = model.load(seed)
    p = model.train_float(xtr, ytr, seed, epochs=1500)
    fl.append(model.float_acc(p, xte, yte))
    for wb in WS:
        for ab in AS:
            r = rows.setdefault((wb, ab), {k: [] for k in M})
            r["ptq_max"].append(model.int_acc(model.quantise(p, xtr, wb, ab), xte, yte))
            r["ptq_clip"].append(model.int_acc(qat.quantise_scales(p, xtr, wb, ab, qat.clip_scale), xte, yte))
            r["perchannel"].append(qat.perchannel_acc(p, xtr, xte, yte, wb, ab))
            pq = qat.qat_train(p, xtr, ytr, wb, ab)
            r["qat"].append(model.int_acc(qat.quantise_scales(pq, xtr, wb, ab, qat.max_scale), xte, yte))
out = [f"# float test accuracy over {len(SEEDS)} splits: mean {np.mean(fl):.4f}",
       "# wb ab " + " ".join(f"{k}_mean {k}_min" for k in M)]
for (wb, ab), r in sorted(rows.items()):
    out.append(f"{wb} {ab} " + " ".join(f"{np.mean(r[k]):.4f} {min(r[k]):.4f}" for k in M))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
