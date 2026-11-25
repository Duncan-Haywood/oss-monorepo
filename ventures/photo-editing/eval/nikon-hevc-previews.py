"""Decode the HEVC previews of Nikon Z8/Z9 NEFs shot in HLG tone mode, for the AF detail check.

The cull page reads JPEG previews. NEFs a Z8 writes in HLG tone mode carry their 320 x 212 and 1620 x 1080
previews as HEVC bitstreams in SubIFDs (Compression 34713, data starting 00 00 00 01 40 01, an HEVC VPS),
so the page falls back to IFD0's 160 x 120 JPEG thumbnail. For eval/cull-nikon-af-*.md this script pulls
the largest HEVC preview out of each NEF and decodes it with ffmpeg into a PNG, then rewrites the
`jpg` field of eval/cull-af-point.mjs's JSON lines to point at it, so eval/cull-af-point-detail.py ranks
detail on a 1620 x 1080 picture instead of a 160 x 120 one. The page itself does not do this.

    python3 eval/nikon-hevc-previews.py OUT/af.jsonl NEF_DIR OUT/hevc > OUT/af-hevc.jsonl
"""

from __future__ import annotations

import json
import struct
import subprocess
import sys
from pathlib import Path


def ifd(b: bytes, off: int, e: str) -> tuple[dict, int]:
    n = struct.unpack_from(e + "H", b, off)[0]
    out = {}
    for i in range(n):
        t, ty, c, v = struct.unpack_from(e + "HHII", b, off + 2 + 12 * i)
        out[t] = (ty, c, v)
    return out, struct.unpack_from(e + "I", b, off + 2 + 12 * n)[0]


def largest_hevc(b: bytes) -> tuple[int, int, int, int] | None:
    e = "<" if b[:2] == b"II" else ">"
    i0, _ = ifd(b, struct.unpack_from(e + "I", b, 4)[0], e)
    if 0x14A not in i0:
        return None
    ty, c, v = i0[0x14A]
    offs = [v] if c == 1 else list(struct.unpack_from(e + "%dI" % c, b, v))
    best = None
    for o in offs:
        d, _ = ifd(b, o, e)
        if d.get(0xFE, (0, 0, 0))[2] != 1 or 0x111 not in d or 0x117 not in d:
            continue
        at, n = d[0x111][2], d[0x117][2]
        if b[at:at + 6] != b"\x00\x00\x00\x01\x40\x01":
            continue
        w, h = d[0x100][2], d[0x101][2]
        if best is None or w * h > best[2] * best[3]:
            best = (at, n, w, h)
    return best


def main(jsonl: str, root: str, out: str) -> None:
    Path(out).mkdir(parents=True, exist_ok=True)
    for line in open(jsonl):
        r = json.loads(line)
        b = Path(root, r["file"]).read_bytes()
        hv = largest_hevc(b)
        if hv:
            at, n, w, h = hv
            src = Path(out, Path(r["file"]).stem + ".hevc")
            png = Path(out, Path(r["file"]).stem + ".png")
            src.write_bytes(b[at:at + n])
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "hevc", "-i", str(src), "-frames:v", "1", str(png)],
                           check=True)
            r["jpg"] = str(png)
            r["preview_from"] = f"HEVC {w}x{h}"
        print(json.dumps(r))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
