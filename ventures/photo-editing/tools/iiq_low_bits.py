"""How much do a 16-bit IIQ's two extra bits carry? One JSON line per file.

For each file: the share of image sensels with each value of the two low bits (a 14-bit file stores every
value times four, so all its sensels have 0 there), and the spread of the masked columns left of the image
(columns 8 to the left margin less 8, the image's rows), in 16-bit steps and in 14-bit steps. If that
read noise is several 14-bit steps, rounding to 14 bits adds little to it: quantisation noise is
4 / sqrt(12) = 1.15 of the 16-bit steps. Only meaningful where those columns are masked (optical black);
check the mean is near the black level.

Usage (from ``ventures/photo-editing``, numpy in the environment)::

    PYTHONPATH=src python tools/iiq_low_bits.py FILE.IIQ [...]
"""

from __future__ import annotations

import json
import sys

import numpy as np

from shootflow import iiq


def main(argv: list[str]) -> int:
    for name in argv:
        data = open(name, "rb").read()
        f = iiq.info(data)
        values, _ = iiq.decode_sensor(data, dict(f, black_col=None, black_row=None))
        a = np.frombuffer(values, dtype=np.uint16).reshape(f["height"], f["width"])
        t, left = f["top"], f["left"]
        img = a[t : t + f["image_height"], left : left + f["image_width"]]
        low = np.bincount((img & 3).ravel(), minlength=4) / img.size
        ob = a[t : t + f["image_height"], 8 : left - 8].astype(np.float64)
        print(json.dumps({
            "file": name.rsplit("/", 1)[-1], "camera": iiq.camera_model(data), "format": f["format"],
            "black": f["black"], "low2_share": [round(float(x), 4) for x in low],
            "masked_mean": round(float(ob.mean()), 1), "masked_std": round(float(ob.std()), 2),
            "masked_std_14bit_steps": round(float(ob.std()) / 4, 2),
            "rounding_adds_pct": round((np.sqrt(ob.std() ** 2 + (4 / np.sqrt(12)) ** 2) / ob.std() - 1) * 100, 2),
        }), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
