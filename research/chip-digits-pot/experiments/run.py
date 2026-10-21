"""Float -> per-tensor max / MSE-clip (chip-digits-qat), per-channel float-scale reference, and the integer
per-channel power-of-two lane ('pot_max', 'pot_mse'); W in 2..4, A in 3..5, 5 splits."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from chip_digits_pot import pot
from chip_digits import model
from chip_digits_qat import qat

SEEDS, WS, AS = range(5), (2, 3, 4), (3, 4, 5)
M = ("ptq_max", "ptq_clip", "perchannel_float", "pot_max", "pot_mse")
rows, fl, cost = {}, [], {}
for seed in SEEDS:
    xtr, xte, ytr, yte = model.load(seed)
    p = model.train_float(xtr, ytr, seed, epochs=1500)
    fl.append(model.float_acc(p, xte, yte))
    for wb in WS:
        for ab in AS:
            r = rows.setdefault((wb, ab), {k: [] for k in M})
            r["ptq_max"].append(model.int_acc(model.quantise(p, xtr, wb, ab), xte, yte))
            r["ptq_clip"].append(model.int_acc(qat.quantise_scales(p, xtr, wb, ab, qat.clip_scale), xte, yte))
            r["perchannel_float"].append(qat.perchannel_acc(p, xtr, xte, yte, wb, ab))
            for how in ("max", "mse"):
                q = pot.quantise(p, xtr, wb, ab, how)
                r["pot_" + how].append(pot.int_acc(q, xte, yte))
                if ab == 4:
                    c = pot.shift_cost(q)
                    cost.setdefault((wb, how), []).append(c)
out = [f"# float test accuracy over {len(SEEDS)} splits: mean {np.mean(fl):.4f}",
       "# wb ab " + " ".join(f"{k}_mean {k}_min" for k in M)]
for (wb, ab), r in sorted(rows.items()):
    out.append(f"{wb} {ab} " + " ".join(f"{np.mean(r[k]):.4f} {min(r[k]):.4f}" for k in M))
out.append("# shift cost at A=4, max over 5 splits: wb how l1_range l2_range stages1 stages2")
for (wb, how), cs in sorted(cost.items()):
    out.append(f"# {wb} {how} " + " ".join(str(max(c[k] for c in cs)) for k in ("l1_range", "l2_range", "stages1", "stages2")))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
