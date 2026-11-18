"""Develop real Kodak DCRs end to end and compare the picture's average colour with LibRaw's own render.

No Adobe ``.dcp`` for the DCS Pro bodies is in the tree, so each file is developed with a stand-in profile: a
ColorMatrix1 (D65) equal to LibRaw's ``rgb_xyz_matrix`` for the body (the XYZ-to-camera matrix LibRaw
develops it with). Both renders use the as-shot white balance and sRGB output and turn the frame by its
Orientation tag. For each file, prints the
develop time and the mean linear-light value per channel, over the pixels unclipped in both renders
(every channel under 0.98 encoded), from ours and from
``rawpy.postprocess(use_camera_wb=True, no_auto_bright=True, output_bps=16, gamma=(2.4, 12.92))`` (the sRGB curve,
so undoing it with the sRGB curve gives linear light; the MRW check's first run missed this), with the largest gap in
chromaticity (r/(r+g+b), b/(r+g+b)) between the two means. The two differ in overall brightness (LibRaw scales to its
per-model white level), so the gate is colour: the means' chromaticities within 0.02.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src:tests /tmp/v/bin/python tools/dcr_develop_check.py FILE.DCR [...]
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from shootflow import kodak
from shootflow import raw_develop as rd


def stand_in_profile(matrix, camera: str) -> rd.Ifd:
    from test_dng_profile_tables import make_dcp

    flat = tuple(float(matrix[r][c]) for r in range(3) for c in range(3))
    blob = make_dcp([(50721, 10, flat), (50778, 3, (21,)), (50708, 2, tuple(camera.encode() + b"\0"))])
    return rd.parse_dcp(blob) if hasattr(rd, "parse_dcp") else _read(blob)


def _read(blob: bytes) -> rd.Ifd:
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".dcp") as f:
        f.write(blob)
        f.flush()
        return rd.read_dcp(f.name)


def lin(v):
    import numpy as np

    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def chroma(m):
    s = sum(m)
    return (m[0] / s, m[2] / s) if s else (0.0, 0.0)


def check(path: Path) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    camera = kodak.camera_model(data)
    with rawpy.imread(str(path)) as lr:
        matrix = lr.rgb_xyz_matrix[:3].tolist()
        theirs = lr.postprocess(use_camera_wb=True, no_auto_bright=True, output_bps=16, gamma=(2.4, 12.92))
    raw = kodak.parse_dcr(data)
    t = time.perf_counter()
    w, h, rgb, _report = rd.develop(raw, rd.DevelopSettings(dcp=stand_in_profile(matrix, camera)))
    secs = time.perf_counter() - t
    ours = np.frombuffer(rgb, dtype=np.uint16).reshape(h, w, 3).astype(np.float64)
    theirs = theirs.astype(np.float64)
    ours, theirs = ours / 65535, theirs / 65535
    # Linear light, and only pixels unclipped in both renders: the two treat clipped highlights differently.
    keep = (ours.max(axis=2) < 0.98) & (theirs.max(axis=2) < 0.98)
    ours, theirs = lin(ours[keep]), lin(theirs[keep])
    m_ours = [float(ours[:, c].mean()) for c in range(3)]
    m_theirs = [float(theirs[:, c].mean()) for c in range(3)]
    co, ct = chroma(m_ours), chroma(m_theirs)
    gap = max(abs(co[0] - ct[0]), abs(co[1] - ct[1]))
    return {
        "file": path.name,
        "camera": camera,
        "size": [w, h],
        "develop_s": round(secs, 2),
        "mean_ours": [round(v, 4) for v in m_ours],
        "mean_libraw": [round(v, 4) for v in m_theirs],
        "unclipped_share": round(float(keep.mean()), 4),
        "chroma_gap": round(gap, 4),
        "ok": gap < 0.02,
    }


def main(argv=None) -> int:
    bad = 0
    for name in (argv if argv is not None else sys.argv[1:]):
        row = check(Path(name))
        print(json.dumps(row), flush=True)
        bad += not row["ok"]
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
