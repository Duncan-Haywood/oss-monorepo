"""Milestone 9a: train on MaSTr1325 (block split), score clean, fogged and glinted test frames.

    PYTHONPATH=src python3 experiments/run.py --data <dir with 0001.jpg, 0001m.png ...> [--seeds 0 1 2]

Writes experiments/runs/<model>-<regime>-s<seed>.json; experiments/aggregate.py makes results.txt.
About 12 minutes per LR-ASPP run on 4 CPU cores at 320x240, 10 epochs.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from marine_detect import data, degrade, metrics  # noqa: E402
from marine_detect.model import LRASPP, PixelMLP, predict, train  # noqa: E402

FOG_T = [1.0, 0.7, 0.5, 0.3, 0.15]
GLINT = [0.3, 0.6, 0.9]


def conditions(Xte, Yte):
    for t in FOG_T:
        yield f"fog t={t}", degrade.fog(Xte, t)
    for g in GLINT:
        yield f"glint g={g}", np.stack([degrade.glint(x, y, g, seed=i) for i, (x, y) in enumerate(zip(Xte, Yte))])


def score(P, Y):
    conf = sum(metrics.confusion(p, y) for p, y in zip(P, Y))
    recs = [[i] + list(r) for i, (p, y) in enumerate(zip(P, Y)) for r in metrics.obstacle_records(p, y)]
    pairs = [(r[1], r[2]) for r in recs]
    fa = [metrics.false_alarms(p, y) for p, y in zip(P, Y)]
    ious = metrics.iou(conf)
    return {
        "iou_obstacle": float(ious[0]), "iou_water": float(ious[1]), "iou_sky": float(ious[2]),
        "miou": float(ious.mean()),
        "n_floating": len(pairs),
        "recall": float(np.mean([f for _, f in pairs])) if pairs else None,
        "recall_by_area": metrics.binned_recall(pairs),
        "false_alarms_per_frame": float(np.mean(fa)),
        "objects": recs,  # [frame, area px, found, covered fraction, waterline row]
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2])
    ap.add_argument("--models", nargs="+", default=["pixel-clean", "lraspp-clean", "lraspp-aug"])
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--cache", default=None, help="npz cache of the resized arrays")
    ap.add_argument("--save-models", default=None, help="directory for the trained weights (not committed)")
    a = ap.parse_args()
    torch.set_num_threads(4)

    ids = data.frame_ids(Path(a.data))
    tr, te = data.split(ids)
    print(f"{len(ids)} frames, train {len(tr)}, test {len(te)}", flush=True)
    if a.cache and Path(a.cache).is_file():
        z = np.load(a.cache)
        Xtr, Ytr, Xte, Yte = z["Xtr"], z["Ytr"], z["Xte"], z["Yte"]
    else:
        Xtr, Ytr = data.load(Path(a.data), tr)
        Xte, Yte = data.load(Path(a.data), te)
        if a.cache:
            np.savez(a.cache, Xtr=Xtr, Ytr=Ytr, Xte=Xte, Yte=Yte)
    conds = list(conditions(Xte, Yte))
    out_dir = HERE / "runs"
    out_dir.mkdir(exist_ok=True)
    for name in a.models:
        kind, regime = name.split("-")
        for s in a.seeds:
            f = out_dir / f"{name}-s{s}.json"
            if f.is_file():
                print(f"skip {f.name}", flush=True)
                continue
            t0 = time.time()
            m = LRASPP() if kind == "lraspp" else PixelMLP()
            ep = a.epochs if kind == "lraspp" else max(2, a.epochs // 3)
            print(f"{name} seed {s}", flush=True)
            train(m, Xtr, Ytr, ep, s, regime == "aug", lr=5e-4 if kind == "lraspp" else 3e-3,
                  log=lambda msg: print(msg, flush=True))
            res = {"model": name, "seed": s, "epochs": ep, "n_train": len(tr), "n_test": len(te),
                   "size": [320, 240], "train_seconds": round(time.time() - t0, 1), "conditions": {}}
            for cname, Xc in conds:
                res["conditions"][cname] = score(predict(m, Xc), Yte)
            f.write_text(json.dumps(res, separators=(",", ":")))
            if a.save_models:
                torch.save(m.state_dict(), Path(a.save_models) / f"{name}-s{s}.pt")
            c = res["conditions"]["fog t=1.0"]
            print(f"  clean mIoU {c['miou']:.3f} obstacle IoU {c['iou_obstacle']:.3f} recall {c['recall'] or float('nan'):.3f} n={c['n_floating']} "
                  f"FA/frame {c['false_alarms_per_frame']:.2f}  ({res['train_seconds']} s)", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
