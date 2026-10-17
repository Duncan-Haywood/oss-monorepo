"""Sweep hidden width x weight bits x pooling, then check the RTL on the seed-0 models.

usage: python run.py <features.npz>   (writes results.json and results.txt next to this file)
"""
import json
import os
import subprocess
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_kws import cost, mfcc, model, rtl  # noqa: E402

SEGMENTS = [7, 12]
HIDDEN = [8, 16, 32, 64, 128]
BITS = [2, 3, 4, 8]
SEEDS = [0, 1, 2]
EPOCHS = 40
N_RTL = 200
RATE_HZ = 4.0
# ambient-wearable (this repository): always-on microphone 0.6 mA at 3 V
MIC_FLOOR_UW = 0.6e-3 * 3.0 * 1e6


def acc(m, x, y):
    return float((model.int_predict(m, model.quantise_inputs(x, m.mean, m.std)) == y).mean())


def main(feats):
    z = np.load(feats)
    rows = []
    t0 = time.time()
    for seg in SEGMENTS:
        x = {s: mfcc.pool_segments(z[f"{s}_x"].astype(np.float64), seg) for s in ("train", "validation", "test")}
        y = {s: z[f"{s}_y"] for s in ("train", "validation", "test")}
        for h in HIDDEN:
            for b in BITS:
                va, te, models = [], [], []
                for sd in SEEDS:
                    m = model.train_qat(x["train"], y["train"], h, b, epochs=EPOCHS, seed=sd)
                    va.append(acc(m, x["validation"], y["validation"]))
                    te.append(acc(m, x["test"], y["test"]))
                    models.append(m)
                m0 = models[0]
                nmac = model.macs(m0.inputs, h)
                # RTL check on the seed-0 model: N_RTL evenly spaced test clips
                # the shards are sorted by label, so take evenly spaced test clips, not the first ones
                pick = np.linspace(0, len(y["test"]) - 1, N_RTL).astype(int)
                xq = model.quantise_inputs(x["test"][pick], m0.mean, m0.std)
                cls, cyc, lg = rtl.simulate(m0, xq)
                ref_lg, _ = model.int_forward(m0, xq)
                bit_exact = bool((lg == ref_lg).all() and (cls == ref_lg.argmax(1)).all())
                syn = rtl.synth(m0)
                e_nj = cost.energy_per_inference_nj(nmac, b)
                row = {
                    "segments": seg, "inputs": m0.inputs, "hidden": h, "wbits": b, "macs": nmac,
                    "val_acc": va, "test_acc": te,
                    "val_mean": float(np.mean(va)), "test_mean": float(np.mean(te)),
                    "test_std": float(np.std(te)),
                    "rtl_vectors": N_RTL, "rtl_bit_exact": bit_exact,
                    "rtl_classes_seen": int(len(set(cls.tolist()))),
                    "rtl_true_classes": int(len(set(y["test"][pick].tolist()))),
                    "cycles": sorted(set(int(c) for c in cyc)),
                    "cells": syn["cells"], "flops": syn["flops"],
                    "storage_kbit": cost.storage_kbit(m0.inputs, h, model.OUT, b),
                    "energy_nj": e_nj, "energy_nj_lo": e_nj / 3, "energy_nj_hi": e_nj * 3,
                    "uw_at_rate": cost.always_on_uw(e_nj, RATE_HZ),
                    "min_clock_khz": nmac * RATE_HZ / 1000.0,
                }
                rows.append(row)
                print(seg, h, b, f"val {row['val_mean']:.3f} test {row['test_mean']:.3f}",
                      "rtl", bit_exact, row["cycles"], syn["cells"], f"{time.time()-t0:.0f}s", flush=True)
    versions = {
        "yosys": subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip(),
        "iverilog": subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0],
        "numpy": np.__version__,
    }
    meta = json.load(open(feats.replace(".npz", ".json")))
    out = {"versions": versions, "data": meta, "epochs": EPOCHS, "seeds": SEEDS, "rate_hz": RATE_HZ,
           "mic_floor_uw": MIC_FLOOR_UW, "rows": rows}
    here = os.path.dirname(__file__)
    json.dump(out, open(os.path.join(here, "results.json"), "w"), indent=1)
    with open(os.path.join(here, "results.txt"), "w") as fh:
        fh.write(f"{versions}\n")
        fh.write("seg in  H bits macs | val(mean of 3) test(mean+-sd) | rtl_exact cycles cells flops | kbit  nJ  uW@4Hz\n")
        for r in rows:
            fh.write(f"{r['segments']:3d} {r['inputs']:3d} {r['hidden']:3d} {r['wbits']}  {r['macs']:6d} | "
                     f"{r['val_mean']:.3f} {r['test_mean']:.3f}+-{r['test_std']:.3f} | {r['rtl_bit_exact']} "
                     f"{r['cycles']} {r['cells']} {r['flops']} | {r['storage_kbit']:.1f} {r['energy_nj']:.1f} "
                     f"{r['uw_at_rate']:.3f}\n")


if __name__ == "__main__":
    main(sys.argv[1])
