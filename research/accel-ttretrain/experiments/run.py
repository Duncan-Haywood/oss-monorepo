"""Retrain the accel-kws grid on Speech Commands and test every model against the Tiny Tapeout tile's limits.

usage: python run.py <features.npz>   (features from accel-kws/experiments/prepare_features.py)
Writes results.json and results.txt here and models.npz (the trained integer models) next to them.
"""
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import accel_ttretrain as tt  # noqa: E402
from accel_kws import mfcc, model  # noqa: E402

GRID = [(seg, h, b) for seg in (7, 12) for h in (8, 16, 32, 64) for b in (2, 3, 4, 8)]
SEEDS = (0, 1, 2)
EPOCHS = 40


def acc(m, xq, y, fwd):
    return float((np.argmax(fwd(m, xq)[0], axis=1) == y).mean())


def main(feats):
    z = np.load(feats)
    rows, saved = [], {}
    t0 = time.time()
    for seg, h, b in GRID:
        x = {s: mfcc.pool_segments(z[f"{s}_x"].astype(np.float64), seg) for s in ("train", "test")}
        y = {s: z[f"{s}_y"] for s in ("train", "test")}
        per = []
        for sd in SEEDS:
            m = model.train_qat(x["train"], y["train"], h, b, epochs=EPOCHS, seed=sd)
            xtr = model.quantise_inputs(x["train"], m.mean, m.std)
            xte = model.quantise_inputs(x["test"], m.mean, m.std)
            s_tr, s_te = tt.stats(m, xtr), tt.stats(m, xte)
            st = {k: max(s_tr[k], s_te[k]) if k.startswith("max") else s_tr[k] + s_te[k] for k in s_tr}
            t = tt.tile_model(m)
            per.append(dict(seed=sd, fits=tt.fits(st), **st,
                            acc_ref=acc(m, xte, y["test"], model.int_forward),
                            acc_tile=acc(t, xte, y["test"], tt.tile_forward),
                            s1=m.s1))
            saved[f"{seg}_{h}_{b}_{sd}"] = np.concatenate([m.w1.ravel(), m.b1, m.w2.ravel(), m.b2, [m.s1]])
        rows.append(dict(segments=seg, inputs=per and int(x["train"].shape[1]), hidden=h, wbits=b, seeds=per))
        print(seg, h, b, [round(p["acc_ref"], 3) for p in per], [round(p["acc_tile"], 3) for p in per],
              [p["fits"] for p in per], f"{time.time() - t0:.0f}s", flush=True)
    json.dump(dict(epochs=EPOCHS, rows=rows), open(os.path.join(HERE, "results.json"), "w"), indent=1)
    np.savez_compressed(os.path.join(HERE, "models.npz"), **saved)


if __name__ == "__main__":
    main(sys.argv[1])
