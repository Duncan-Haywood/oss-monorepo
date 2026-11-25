"""Checks the cull page's raw-data reader (site/rawmosaic.mjs) against shootflow's own.

For every OUT/<name>.u16 written by eval/cull-raw-data-previews.mjs, reads the
same DNG with shootflow.raw_develop.read_raw and counts sensels that differ.
    python3 eval/cull-raw-data-previews-check.py OUT      # numpy
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from shootflow import raw_develop as rd  # noqa: E402

out = Path(sys.argv[1])
total = same = 0
print("file\tsensels\tdiffering\tmax_abs_diff")
for meta in sorted(out.glob("*.json")):
    info = json.loads(meta.read_text())
    js = np.fromfile(out / (meta.stem + ".u16"), dtype="<u2").reshape(info["height"], info["width"])
    raw = rd.read_raw(info["file"])
    py = np.asarray(raw.values, dtype=np.int64).reshape(raw.height, raw.width * raw.samples_per_pixel)
    if py.shape != js.shape:
        print(f"{meta.stem}\tshape {js.shape} vs {py.shape}\t\t")
        continue
    d = np.abs(py - js.astype(np.int64))
    n = int((d > 0).sum())
    total += 1
    same += n == 0
    print(f"{meta.stem}\t{d.size}\t{n}\t{int(d.max())}")
print(f"# {same} of {total} files identical sensel for sensel")
