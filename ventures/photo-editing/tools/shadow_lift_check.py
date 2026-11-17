"""Does the old sRGB encode band when a 16-bit master is pushed 3 stops in an editor?

Usage (from ``ventures/photo-editing``, numpy installed)::

    PYTHONPATH=src python3 tools/shadow_lift_check.py --old OLD_SRC [--half] [--stops 3] FILE [FILE ...]

Each file is developed on the numpy engine three ways, as ``tools/srgb_table_check.py`` does: with
``--old`` (another ``src`` tree, run in a subprocess: main before the interpolated encode, a 4,096-entry
table read at the nearest entry), with this ``src`` (16,384 entries, interpolated), and with this ``src``
and a 1,048,576-entry table (the reference, within 0.0002 codes of the exact curve).

Each 16-bit master then gets what an editor's exposure slider does: decode sRGB to linear light,
multiply by ``2 ** stops``, encode with the exact sRGB curve, and round to 8 bits for the screen or a
JPEG. Only the pixels the lift leaves unclipped (every channel below 1.0 after the lift: the shadows
and lower mid-tones) are scored. One JSON line per file and master:

- ``levels8``: distinct 8-bit codes per channel among the scored pixels, after the lift;
- ``gaps8``: empty 8-bit codes between the darkest and brightest scored code, per channel
  (histogram combing: an editor's histogram shows them as teeth, a smooth gradient as bands);
- ``gaps8_low``: the same, counting only codes 0-63 (the deep shadows, where the old table was coarse);
- ``lost8``: 8-bit codes the reference's lifted pixels use that this master's never reach, per channel
  (the combing the table adds, apart from what the sensor's own levels leave);
- ``off1`` / ``off2``: share of scored channel values 1 or more / 2 or more 8-bit codes from the
  reference's lifted value, and ``max_off``, the largest gap;
- ``step16``: the largest gap between neighbouring occupied 16-bit codes below 4,096 (linear about 0.1%,
  the near-black run), before the lift.

Results: ``eval/shadow-lift-banding-2026-11-17.md``.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, np.power((c + 0.055) / 1.055, 2.4))


def linear_to_srgb(v):
    v = np.asarray(v, dtype=np.float64)
    return np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(np.maximum(v, 1e-300), 1 / 2.4) - 0.055)


def develop(path: str, half: bool, size: int | None = None) -> np.ndarray:
    from shootflow import raw_develop as rd

    if size is not None:
        rd.SRGB_TABLE_SIZE = size
    raw = rd.read_raw(Path(path))
    w, h, px, _ = rd.develop(raw, rd.DevelopSettings(half=half, engine="numpy"))
    return np.frombuffer(px, dtype=np.uint16).reshape(h, w, 3).copy()


def lift(master: np.ndarray, stops: float) -> tuple[np.ndarray, np.ndarray]:
    """``master`` (uint16) pushed ``stops`` in linear light: 8-bit codes, and the unclipped mask."""

    # A table over the 65,536 codes keeps memory to one uint8 image (the masters are 15-50 Mpx values).
    lin = srgb_to_linear(np.arange(65536) / 65535.0) * (2.0 ** stops)
    to8 = np.floor(np.clip(linear_to_srgb(np.minimum(lin, 1.0)), 0, 1) * 255 + 0.5).astype(np.uint8)
    keep = np.all(master < int(np.searchsorted(lin, 1.0)), axis=2)
    return to8[master], keep


def gaps(codes: np.ndarray, hi: int | None = None) -> int:
    used = np.bincount(codes.ravel(), minlength=256) > 0
    idx = np.flatnonzero(used)
    if hi is not None:
        idx = idx[idx <= hi]
    if len(idx) < 2:
        return 0
    return int((idx[-1] - idx[0] + 1) - len(idx))


def step16(master: np.ndarray, c: int, below: int = 4096) -> int:
    v = np.unique(master[..., c])
    v = v[v < below]
    return int(np.diff(v).max()) if len(v) > 1 else 0


def score(master: np.ndarray, ref8: np.ndarray, keep: np.ndarray, stops: float) -> dict:
    out8, _ = lift(master, stops)
    a, r = out8[keep].astype(np.int16), ref8[keep].astype(np.int16)
    d = np.abs(a - r)
    return {
        "levels8": [len(np.unique(a[:, c])) for c in range(3)],
        "gaps8": [gaps(a[:, c]) for c in range(3)],
        "gaps8_low": [gaps(a[:, c], 63) for c in range(3)],
        "lost8": [len(np.setdiff1d(np.unique(r[:, c]), np.unique(a[:, c]))) for c in range(3)],
        "off1": round(float((d >= 1).mean()), 6),
        "off2": round(float((d >= 2).mean()), 6),
        "max_off": int(d.max()),
        "step16": [step16(master, c) for c in range(3)],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--old", help="another src tree (main before the interpolated encode)")
    ap.add_argument("--half", action="store_true")
    ap.add_argument("--stops", type=float, default=3.0)
    ap.add_argument("--_dump", help=argparse.SUPPRESS)
    args = ap.parse_args()
    if args._dump:  # subprocess mode: develop one file with whatever src is on the path
        np.save(args._dump, develop(args.files[0], args.half))
        return 0
    if not args.old:
        ap.error("--old is required")
    for name in args.files:
        with tempfile.TemporaryDirectory() as tmp:
            dump = str(Path(tmp) / "old.npy")
            cmd = [sys.executable, __file__, "--_dump", dump, name] + (["--half"] if args.half else [])
            subprocess.run(cmd, check=True, env={"PYTHONPATH": args.old, "PATH": "/usr/bin:/bin"})
            old = np.load(dump)
        new = develop(name, args.half)
        ref = develop(name, args.half, size=1 << 20)
        from shootflow import raw_develop as rd

        rd.SRGB_TABLE_SIZE = 16384
        ref8, keep = lift(ref, args.stops)
        base = {"file": Path(name).name, "size": f"{ref.shape[1]}x{ref.shape[0]}", "stops": args.stops,
                "scored_share": round(float(keep.mean()), 4)}
        for label, master in (("old", old), ("new", new), ("reference", ref)):
            print(json.dumps({**base, "master": label, **score(master, ref8, keep, args.stops)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
