"""Group real raws into cards (one body each) and drop repeat scenes, for ``noise_aware_estimated.py sweep --cards``.

A card-level noise floor (the lowest patch-PCA reading across one body's frames at one ISO) rests on the frames
sharing the sensor's noise and not their texture. Public sample sets break the second half quietly: raw.pixls.us
holds many bodies as one scene saved several ways (12/14-bit, compressed or not, aspect ratios, an ISO series of
one view). Two copies of one scene share their texture, so a floor taken over both strips nothing. This tool
reads each file's binned truth (``xtrans_frame_choice._truth``, so a sweep with the same ``--cache`` reuses it),
compares the centre ``--crop`` x ``--crop`` of every pair of files from one body at the same pixel scale, and
calls two files one scene when the correlation of their log-luma thumbnails is at least ``--same``. The first
file of each scene (by name) is kept.

Input: a JSON list of ``{"body": ..., "file": path}`` (``--manifest``). Output, on stdout, one JSON object
``{basename: {"card": body, "scene": k, "keep": bool, "r": best correlation with a kept file}}``; a summary
goes to stderr.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/card_scenes.py --manifest manifest.json --cache /tmp/truths > cards.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict

import numpy as np


def thumb(truth: np.ndarray, crop: int = 256, down: int = 4) -> np.ndarray | None:
    """Log luma of the centre ``crop`` x ``crop`` of a binned truth, averaged ``down`` x ``down``, zero mean,
    unit norm; None when the frame is smaller than the crop."""

    h, w, _ = truth.shape
    if h < crop or w < crop:
        return None
    y, x = (h - crop) // 2, (w - crop) // 2
    lum = truth[y : y + crop, x : x + crop].mean(axis=2)
    lum = lum.reshape(crop // down, down, crop // down, down).mean(axis=(1, 3))
    v = np.log(lum + 1e-3).ravel()
    v = v - v.mean()
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else None


def group(thumbs: dict, same: float) -> dict:
    """Greedy, in name order: a file joins the first kept scene it correlates with at >= ``same``."""

    out, kept = {}, []
    for name in sorted(thumbs):
        t = thumbs[name]
        best, scene = -1.0, None
        for k, (kname, kt) in enumerate(kept):
            r = float(t @ kt) if t is not None and kt is not None else -1.0
            if r > best:
                best = r
            if r >= same and scene is None:
                scene = k
        if scene is None:
            kept.append((name, t))
            out[name] = {"scene": len(kept) - 1, "keep": True, "r": round(best, 4)}
        else:
            out[name] = {"scene": scene, "keep": False, "r": round(best, 4)}
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--cache")
    ap.add_argument("--crop", type=int, default=256)
    ap.add_argument("--same", type=float, default=0.9, help="correlation at or above which two files are one scene")
    args = ap.parse_args(argv)

    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    from xtrans_frame_choice import _truth

    bodies: dict = defaultdict(dict)
    skipped = 0
    for m in json.load(open(args.manifest)):
        name = m["file"].rsplit("/", 1)[-1]
        try:
            bodies[m["body"]][name] = thumb(_truth(m["file"], args.cache), args.crop)
        except Exception as exc:  # noqa: BLE001
            print(f"skip {name}: {type(exc).__name__}: {exc}", file=sys.stderr)
            skipped += 1
    out = {}
    for body, thumbs in sorted(bodies.items()):
        for name, row in group(thumbs, args.same).items():
            out[name] = {"card": body, **row}
        n = sum(r["keep"] for r in out.values() if r["card"] == body)
        print(f"{body}: {len(thumbs)} files, {n} scenes", file=sys.stderr)
    print(f"{len(out)} files read, {skipped} skipped, {sum(r['keep'] for r in out.values())} scenes kept",
          file=sys.stderr)
    print(json.dumps(out, indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
