"""Decodes every JPEG eval/cull-page-previews.mjs extracted and checks its size.

Each file is named NNNN_<w>x<h>.jpg with the size the parser read from the
JPEG's frame header; this opens it with Pillow, forces a full decode, and
counts files that fail or whose decoded size differs.

    python3 eval/cull-page-previews-decode.py OUT
"""

import sys
from pathlib import Path

from PIL import Image


def main(out: str) -> int:
    ok = bad = 0
    for p in sorted(Path(out).glob("*.jpg")):
        want = tuple(int(x) for x in p.stem.split("_")[1].split("x"))
        try:
            with Image.open(p) as im:
                im.load()
                got = im.size
        except Exception as e:  # noqa: BLE001 - report every failure
            print(f"FAIL {p.name}: {e}")
            bad += 1
            continue
        if got != want:
            print(f"SIZE {p.name}: decoded {got}")
            bad += 1
        else:
            ok += 1
    print(f"decoded {ok}, failed {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
