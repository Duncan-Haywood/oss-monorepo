"""Develop real Phase One IIQs end to end and compare the picture's average colour with LibRaw's own render.

An IIQ carries its own camera-to-ROMM matrix, so it develops with no ``.dcp``: ``shootflow.iiq`` turns that
matrix into a ColorMatrix1 at D50. LibRaw develops the same file with its own per-model matrix (Adobe's,
where its table has the body). Both renders use the as-shot white balance and sRGB primaries; LibRaw's is taken in linear light (``gamma=(1, 1)``). For each file,
prints the develop time and the mean linear-light value per channel over the pixels unclipped in both
renders (every channel under 0.98 encoded), from ours and from
``rawpy.postprocess(use_camera_wb=True, no_auto_bright=True, output_bps=16)``, and the largest gap in
chromaticity (r/(r+g+b), b/(r+g+b)) between the two means; the gate is 0.02, as for the MRW check
(``tools/mrw_develop_check.py``). The two matrices are independent measurements of the same sensor, so a
small gap says the file's matrix, the white balance and the levels are read the way LibRaw reads them. A
second arm develops with LibRaw's matrix as a stand-in ``.dcp`` (as the MRW check does), which isolates the
pipeline from the choice of matrix.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src:tests:tools python tools/iiq_develop_check.py FILE.IIQ [...]
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from shootflow import iiq
from shootflow import raw_develop as rd


def lin(v):
    import numpy as np

    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def chroma(m):
    s = sum(m)
    return (m[0] / s, m[2] / s) if s else (0.0, 0.0)


def _gap(rgb, w, h, theirs, keep_t):
    import numpy as np

    ours = np.frombuffer(rgb, dtype=np.uint16).reshape(h, w, 3).astype(np.float64) / 65535
    keep_o = ours.max(axis=2) < 0.98
    # The crops can differ by a row or a column (LibRaw evens odd margins): compare over the common size.
    hh, ww = min(ours.shape[0], theirs.shape[0]), min(ours.shape[1], theirs.shape[1])
    keep = keep_o[:hh, :ww] & keep_t[:hh, :ww]
    # Ours is sRGB-encoded; LibRaw's is asked for in linear light (its default curve is BT.709, not sRGB,
    # and undoing it with the sRGB curve skewed dark frames: eval/hasselblad-3fr-reader-2026-11-18.md).
    o, t_ = lin(ours[:hh, :ww][keep]), theirs[:hh, :ww][keep]
    m_ours = [float(o[:, c].mean()) for c in range(3)]
    m_theirs = [float(t_[:, c].mean()) for c in range(3)]
    co, ct = chroma(m_ours), chroma(m_theirs)
    return max(abs(co[0] - ct[0]), abs(co[1] - ct[1])), m_ours, m_theirs, float(keep.mean())


def check(path: Path) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    try:
        raw = iiq.parse_iiq(data)
    except rd.DevelopError as exc:
        return {"file": path.name, "refused": str(exc), "ok": None}
    with rawpy.imread(str(path)) as lr:
        theirs = lr.postprocess(use_camera_wb=True, no_auto_bright=True, output_bps=16, gamma=(1, 1))
        matrix = lr.rgb_xyz_matrix[:3].tolist()
    t = time.perf_counter()
    w, h, rgb, report = rd.develop(raw)
    secs = time.perf_counter() - t
    theirs = theirs.astype(np.float64) / 65535
    keep_t = theirs.max(axis=2) < 0.98
    gap, m_ours, m_theirs, share = _gap(rgb, w, h, theirs, keep_t)
    # Second arm: the same develop with LibRaw's own matrix as a stand-in profile, so a gap left in the
    # first arm is the two matrices, not the levels, white balance or crop.
    from mrw_develop_check import stand_in_profile

    w2, h2, rgb2, _ = rd.develop(raw, rd.DevelopSettings(dcp=stand_in_profile(matrix, iiq.camera_model(data))))
    gap2 = _gap(rgb2, w2, h2, theirs, keep_t)[0]
    return {
        "file": path.name,
        "camera": iiq.camera_model(data),
        "size": [w, h],
        "size_libraw": [theirs.shape[1], theirs.shape[0]],
        "develop_s": round(secs, 2),
        "white_xy": report.white_xy,
        "mean_ours": [round(v, 4) for v in m_ours],
        "mean_libraw": [round(v, 4) for v in m_theirs],
        "unclipped_share": round(share, 4),
        "chroma_gap": round(gap, 4),
        "chroma_gap_libraw_matrix": round(gap2, 4),
        "ok": gap < 0.02,
    }


def main(argv=None) -> int:
    bad = 0
    for name in (argv if argv is not None else sys.argv[1:]):
        row = check(Path(name))
        print(json.dumps(row), flush=True)
        bad += row["ok"] is False
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
