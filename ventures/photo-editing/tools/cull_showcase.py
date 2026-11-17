"""Make the cull-report picture on ShootFlow's page from real photos, repeatably.

ShootFlow's page described the cull report but showed none. This script builds
a small "shoot" from five OpenCV sample photos (Apache-2.0, fetched at run time
and not stored here), adds the frames a real burst has (a soft frame, a dark
frame, a slightly reframed one), runs the real ``shootflow cull`` command with
``--thumbs`` and writes ``cull_report.html`` and ``cull_report.json`` to the
folder you name. ``site/cull-report.webp`` is a screenshot of that HTML.

The degradations are known, so the picture is checkable: each soft or dark copy
should be flagged reject or lose its group to the original. The script prints
the summary and exits non-zero if a degraded copy is chosen as a keeper.

    PYTHONPATH=src python3 tools/cull_showcase.py --out /tmp/cull-showcase
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

BASE = "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/"
# name -> the frames made from it: (suffix, kind, amount)
SHOOT = {
    "building": [("a", "orig", 0), ("b", "blur", 3.0), ("c", "shift", 0.04)],
    "butterfly": [("a", "orig", 0), ("b", "dark", 0.35), ("c", "blur", 2.0)],
    "fruits": [("a", "orig", 0), ("b", "shift", 0.03), ("c", "blur", 5.0)],
    "home": [("a", "orig", 0), ("b", "dark", 0.3)],
    "baboon": [("a", "orig", 0), ("b", "blur", 2.5)],
}


def _frame(img: Image.Image, kind: str, amount: float) -> Image.Image:
    if kind == "blur":
        return img.filter(ImageFilter.GaussianBlur(amount))
    if kind == "dark":
        return ImageEnhance.Brightness(img).enhance(amount)
    if kind == "shift":
        # A slightly reframed shot: crop a few percent off one corner, scale back.
        w, h = img.size
        dx, dy = int(w * amount), int(h * amount)
        return img.crop((dx, dy, w, h)).resize((w, h), Image.LANCZOS)
    return img


def build_shoot(folder: Path, cache: Path) -> dict[str, str]:
    """Write the frames; return {file name: kind}."""
    folder.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    kinds: dict[str, str] = {}
    for name, frames in SHOOT.items():
        src = cache / f"{name}.jpg"
        if not src.exists():
            with urllib.request.urlopen(BASE + src.name, timeout=60) as resp:  # noqa: S310 - fixed host
                src.write_bytes(resp.read())
        img = Image.open(src).convert("RGB")
        for suffix, kind, amount in frames:
            out = folder / f"{name}_{suffix}.jpg"
            _frame(img, kind, amount).save(out, quality=92)
            kinds[out.name] = kind
    return kinds


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True, help="Work folder: photos/, report/ and the fetch cache go here.")
    args = parser.parse_args(argv)
    root = Path(args.out)
    kinds = build_shoot(root / "photos", root / "cache")

    from shootflow.cli import main as cli_main

    code = cli_main(["cull", str(root / "photos"), "--out", str(root / "report"), "--thumbs"])
    if code:
        return code
    report = json.loads((root / "report" / "cull_report.json").read_text())
    bad = []
    for item in report["items"]:
        name = Path(item["path"]).name
        print(f"{name:16} {kinds.get(name, '?'):6} group {item['group']} {item['role']:9} "
              f"score {item['score']:.2f} {', '.join(item.get('reasons', []))}")
        if item["role"] == "keeper" and kinds.get(name) in {"blur", "dark"}:
            bad.append(name)
    print(json.dumps(report["summary"], sort_keys=True))
    if bad:
        print("degraded frame chosen as keeper: " + ", ".join(bad), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
