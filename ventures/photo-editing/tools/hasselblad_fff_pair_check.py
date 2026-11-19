"""Check a Phocus .fff against the 3FR of the same frame: the sensels, the gains, and the developed colour.

Phocus exports a 3FR as a ``.fff``. Read with ``shootflow.hasselblad.parse_3fr``, the pair should hold the
same capture, so this compares them directly, with no third-party reader:

* green sensels equal, R and B sensels (above black) scaled by the ``.fff``'s AnalogBalance: the median
  ratio per channel, reported, and the green sensels that differ (gated: none may differ by more than 1);
* both developed at half size with the DNG colour model (the 3FR with its own ColorMatrix1, the ``.fff``
  with what the reader gives it: ColorMatrix2, or the body's own from ``OWN_MATRICES``, and its AsShotNeutral
  scaled by AnalogBalance), the mean linear-light colour over pixels unclipped in both, and the largest
  chromaticity gap between the two means (gated: under 0.001). ``--raw-neutral`` also develops the ``.fff``
  with its AsShotNeutral as written (what LibRaw does), reported, to show the cast the scaling removes.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src /tmp/v/bin/python tools/hasselblad_fff_pair_check.py [--raw-neutral] A.3FR A.fff [B.3FR B.fff ...]

Prints one JSON line per pair and exits 1 if a gate fails. Pairs used on 2026-11-18 (raw.pixls.us):
``eval/hasselblad-fff-reader-2026-11-18.md``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from shootflow import hasselblad
from shootflow import raw_develop as rd

GATE = 0.001


def _develop(raw: rd.RawImage):
    import numpy as np

    raw.ifd0.entries[rd.TAG_ORIENTATION] = (1,)
    w, h, rgb, report = rd.develop(raw, rd.DevelopSettings(half=True))
    a = np.frombuffer(rgb, dtype=np.uint16).reshape(h, w, 3).astype(np.float32) / 65535
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4), report


def _gap(ref, got) -> tuple[float, list[float]]:
    keep = (ref.max(axis=2) < 0.95) & (got.max(axis=2) < 0.95)
    mr, mg = ref[keep].mean(axis=0), got[keep].mean(axis=0)
    cr, cg = mr / mr.sum(), mg / mg.sum()
    return float(max(abs(cr[0] - cg[0]), abs(cr[2] - cg[2]))), [round(float(v), 4) for v in mg / mr]


def check(tfr: Path, fff: Path, raw_neutral: bool = False) -> dict:
    import numpy as np

    a_data, f_data = tfr.read_bytes(), fff.read_bytes()
    a, f = hasselblad.parse_3fr(a_data), hasselblad.parse_3fr(f_data)
    out: dict = {"3fr": tfr.name, "fff": fff.name, "camera": [hasselblad.camera_model(a_data), hasselblad.camera_model(f_data)]}
    if (a.width, a.height) != (f.width, f.height):
        out["error"] = f"sizes differ: {a.width} x {a.height} and {f.width} x {f.height}"
        out["ok"] = False
        return out
    black = float(a.ifd.get(rd.TAG_BLACK_LEVEL)[0])
    x = np.frombuffer(a.values, dtype=np.uint16).reshape(a.height, a.width).astype(np.float64)
    y = np.frombuffer(f.values, dtype=np.uint16).reshape(f.height, f.width).astype(np.float64)
    ab = hasselblad._ifds(f_data)[0].get(rd.TAG_ANALOG_BALANCE) or (1.0, 1.0, 1.0)
    out["analog_balance"] = [round(float(v), 5) for v in ab]
    ratios, green_off = {}, 0
    for r, c, name in ((0, 0, "R"), (0, 1, "G1"), (1, 0, "G2"), (1, 1, "B")):
        xs, ys = x[r::2, c::2], y[r::2, c::2]
        lit = (xs > black + 2000) & (xs < 40000)
        ratios[name] = round(float(np.median((ys[lit] - black) / (xs[lit] - black))), 5)
        if name.startswith("G"):
            green_off += int((np.abs(xs - ys) > 1).sum())
    out["median_ratio"] = ratios
    out["green_sensels_off_by_more_than_1"] = green_off
    out["matrix"] = [m for m in f.notes if "matrix" in m] or ["in the file"]
    ref, _ = _develop(a)
    got, _ = _develop(f)
    gap, ratio = _gap(ref, got)
    out["chroma_gap"] = round(gap, 5)
    out["mean_ratio_fff_over_3fr"] = ratio
    if raw_neutral:
        f2 = hasselblad.parse_3fr(f_data)
        f2.ifd0.entries[rd.TAG_AS_SHOT_NEUTRAL] = hasselblad._ifds(f_data)[0].get(rd.TAG_AS_SHOT_NEUTRAL)
        got2, _ = _develop(f2)
        gap2, ratio2 = _gap(ref, got2)
        out["raw_neutral_chroma_gap"] = round(gap2, 5)
        out["raw_neutral_mean_ratio"] = ratio2
    out["ok"] = green_off == 0 and gap < GATE
    return out


def main(argv=None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    raw_neutral = "--raw-neutral" in args
    files = [Path(a) for a in args if a != "--raw-neutral"]
    if not files or len(files) % 2:
        print(__doc__.split("\n")[0], file=sys.stderr)
        print("give pairs: A.3FR A.fff [B.3FR B.fff ...]", file=sys.stderr)
        return 2
    bad = 0
    for tfr, fff in zip(files[::2], files[1::2]):
        row = check(tfr, fff, raw_neutral)
        print(json.dumps(row), flush=True)
        bad += not row["ok"]
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
