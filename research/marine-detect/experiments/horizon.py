"""Per test frame, the water edge row from the ground-truth mask: the median over columns of the
topmost water pixel (320x240). Writes experiments/horizon_rows.json, used to place each floating
obstacle by how far its waterline sits below the water edge (a monotone proxy for range on a flat sea).

    PYTHONPATH=src python3 experiments/horizon.py --data <MaSTr1325 dir>
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from marine_detect import data  # noqa: E402


def water_edge(y: np.ndarray) -> float:
    rows = []
    for c in range(y.shape[1]):
        w = np.nonzero(y[:, c] == data.WATER)[0]
        if len(w):
            rows.append(w.min())
    return float(np.median(rows)) if rows else float("nan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--cache", default=None)
    a = ap.parse_args()
    ids = data.frame_ids(Path(a.data))
    _, te = data.split(ids)
    if a.cache:
        Y = np.load(a.cache)["Yte"]
    else:
        _, Y = data.load(Path(a.data), te)
    out = {"ids": te, "water_edge_row": [water_edge(y) for y in Y]}
    (HERE / "horizon_rows.json").write_text(json.dumps(out))
    print(len(te), "frames; median water edge row", float(np.nanmedian(out["water_edge_row"])))


if __name__ == "__main__":
    main()
