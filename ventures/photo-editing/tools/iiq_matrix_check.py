"""Does an IIQ's own camera-to-ROMM matrix give the colour LibRaw's per-body matrix gives? One JSON line per file.

``tools/iiq_develop_check.py`` compares a whole develop with LibRaw's render, which needs both full-size images
in memory at once; on the 100-150 MP backs that was killed in a 15 GB container. This check isolates the one
thing the file decides, its matrix: it develops the same sensels twice through ShootFlow, once with the file's
own matrix (the default) and once with LibRaw's matrix for the body as a stand-in ``.dcp``
(``mrw_develop_check.stand_in_profile``), and reports the largest chromaticity gap (r/(r+g+b), b/(r+g+b))
between the two linear-light means over pixels unclipped in both. The gate is 0.02, as in the develop check.

That gap depends on the scene: a saturated sky magnifies a matrix difference that a grey street hides. So each
row also gives a scene-free number, ``patch_de``: the 24 ColorChecker Classic patches (X-Rite's post-November
2014 CIE L*a*b* D50 values, as tabulated by colour-science, BSD-3-Clause,
``colour/characterisation/datasets/colour_checkers/chromaticity_coordinates.py``) are taken to camera space with
LibRaw's matrix (Bradford-adapted D65 to D50, white-balanced so white maps to white) and back to L*a*b* with the
file's matrix, and the CIE76 delta E*ab of each patch is summarised. Neither matrix is ground truth: a gap says
the two calibrations disagree, not which is right. Only a photographed target can say that.

``--rows N`` develops only the first N image rows (the directory's raw and image heights are rewritten in
memory; the row table is untouched, so the rows read are the file's own). LibRaw only supplies its matrix,
read from the unmodified file, so this works for IIQ S too, which LibRaw refuses to read cut short.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src:tests:tools python tools/iiq_matrix_check.py [--rows 3000] FILE.IIQ [...]
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

from shootflow import iiq
from shootflow import raw_develop as rd


def first_rows(data: bytes, n: int) -> bytes:
    """A copy of the IIQ whose directory says the sensor ends ``n`` image rows below the top margin."""

    d = bytearray(data)
    at = struct.unpack_from("<I", d, iiq.BASE + 8)[0] + iiq.BASE
    count = struct.unpack_from("<I", d, at)[0]
    where = {}
    for i in range(count):
        entry = at + 8 + 16 * i
        tag, _typ, _cnt, val = struct.unpack_from("<IIII", d, entry)
        where[tag] = (entry + 12, val)
    top = where[iiq.TAG_TOP][1]
    n = min(n, where[iiq.TAG_H][1])
    struct.pack_into("<I", d, where[iiq.TAG_RAW_H][0], min(where[iiq.TAG_RAW_H][1], 2 * top + n))
    struct.pack_into("<I", d, where[iiq.TAG_H][0], n)
    return bytes(d)


# ColorChecker Classic, after November 2014: CIE L*a*b* under D50 (X-Rite; via colour-science 0.4.4).
CHECKER_LAB = ((37.54, 14.37, 14.92), (64.66, 19.27, 17.5), (49.32, -3.82, -22.54), (43.46, -12.74, 22.72),
               (54.94, 9.61, -24.79), (70.48, -32.26, -0.37), (62.73, 35.83, 56.5), (39.43, 10.75, -45.17),
               (50.57, 48.64, 16.67), (30.1, 22.54, -20.87), (71.77, -24.13, 58.19), (71.51, 18.24, 67.37),
               (28.37, 15.42, -49.8), (54.38, -39.72, 32.27), (42.43, 51.05, 28.62), (81.8, 2.67, 80.41),
               (50.63, 51.28, -14.12), (49.57, -29.71, -28.32), (95.19, -1.03, 2.93), (81.29, -0.57, 0.44),
               (66.89, -0.75, -0.06), (50.76, -0.13, 0.14), (35.63, -0.46, -0.48), (20.64, 0.07, -0.46))
CHECKER_NAMES = ("dark skin", "light skin", "blue sky", "foliage", "blue flower", "bluish green", "orange",
                 "purplish blue", "moderate red", "purple", "yellow green", "orange yellow", "blue", "green", "red",
                 "yellow", "magenta", "cyan", "white", "neutral 8", "neutral 6.5", "neutral 5", "neutral 3.5", "black")
D50 = (0.96422, 1.0, 0.82521)
D65 = (0.95047, 1.0, 1.08883)
BRADFORD = ((0.8951, 0.2664, -0.1614), (-0.7502, 1.7135, 0.0367), (0.0389, -0.0685, 1.0296))


def _lab_to_xyz(lab):
    import numpy as np

    fy = (lab[0] + 16) / 116
    f = np.array([fy + lab[1] / 500, fy, fy - lab[2] / 200])
    t = np.where(f**3 > 216 / 24389, f**3, (116 * f - 16) / (24389 / 27))
    return t * np.array(D50)


def _xyz_to_lab(xyz):
    import numpy as np

    t = np.asarray(xyz) / np.array(D50)
    f = np.where(t > 216 / 24389, np.cbrt(t), (24389 / 27 * t + 16) / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def patch_de(romm, libraw_xyz_to_cam) -> dict:
    """CIE76 delta E*ab between where the file's matrix and LibRaw's put the 24 ColorChecker patches."""
    import numpy as np

    a = np.asarray(libraw_xyz_to_cam, dtype=float)  # XYZ (D65) to camera, dcraw's convention
    br = np.array(BRADFORD)
    adapt = np.linalg.inv(br) @ np.diag((br @ D50) / (br @ D65)) @ br
    theirs = adapt @ np.linalg.inv(a) @ np.diag(a @ np.array(D65))  # white-balanced camera to XYZ D50
    ours = np.array(iiq.ROMM_TO_XYZ) @ np.asarray(romm, dtype=float).reshape(3, 3)
    theirs /= (theirs @ np.ones(3))[1]
    ours /= (ours @ np.ones(3))[1]
    des = np.array([np.linalg.norm(_xyz_to_lab(ours @ np.linalg.solve(theirs, _lab_to_xyz(lab))) - np.array(lab))
                    for lab in CHECKER_LAB])
    worst = int(des.argmax())
    return {"mean": round(float(des.mean()), 2), "max": round(float(des.max()), 2), "worst": CHECKER_NAMES[worst],
            "neutral_max": round(float(des[18:].max()), 2)}


def means(rgb, w, h):
    """ShootFlow's 16-bit sRGB-encoded output as linear light, h x w x 3."""
    import numpy as np

    a = np.frombuffer(rgb, dtype=np.uint16).reshape(h, w, 3).astype(np.float64) / 65535
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def chroma(m):
    s = sum(m)
    return (m[0] / s, m[2] / s) if s else (0.0, 0.0)


def check(path: Path, rows: int | None) -> dict:
    import rawpy
    from mrw_develop_check import stand_in_profile

    data = path.read_bytes()
    camera = iiq.camera_model(data)
    with rawpy.imread(str(path)) as lr:
        matrix = lr.rgb_xyz_matrix[:3].tolist()
    fields = iiq.info(data)
    if rows:
        data = first_rows(data, rows)
    try:
        raw = iiq.parse_iiq(data)
    except rd.DevelopError as exc:
        return {"file": path.name, "camera": camera, "refused": str(exc), "ok": None}
    row = {"file": path.name, "camera": camera, "format": fields["format"],
           "romm": [round(v, 4) for v in fields["romm"]] if fields["romm"] else None,
           "matrix_libraw": [[round(v, 4) for v in r] for r in matrix]}
    if not any(any(r) for r in matrix):
        row.update(refused="LibRaw has no matrix for this body", ok=None)
        return row
    if fields["romm"]:
        row["patch_de"] = patch_de(fields["romm"], matrix)
    try:
        w, h, rgb, _ = rd.develop(raw)
    except rd.DevelopError as exc:
        row.update(own_matrix=str(exc))
        rgb = None
    w2, h2, rgb2, _ = rd.develop(raw, rd.DevelopSettings(dcp=stand_in_profile(matrix, camera)))
    b = means(rgb2, w2, h2)
    row["size"] = [w2, h2]
    if rgb is None:
        row.update(ok=None)
        return row
    a = means(rgb, w, h)
    keep = (a.max(axis=2) < 0.98 ** 2.4) & (b.max(axis=2) < 0.98 ** 2.4)  # under 0.98 encoded, roughly
    ma = [float(a[..., c][keep].mean()) for c in range(3)]
    mb = [float(b[..., c][keep].mean()) for c in range(3)]
    ca, cb = chroma(ma), chroma(mb)
    gap = max(abs(ca[0] - cb[0]), abs(ca[1] - cb[1]))
    row.update(mean_own=[round(v, 4) for v in ma], mean_libraw_matrix=[round(v, 4) for v in mb],
               unclipped_share=round(float(keep.mean()), 4), chroma_gap=round(gap, 4), ok=gap < 0.02)
    return row


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--rows", type=int, default=None, help="develop only the first N image rows")
    ap.add_argument("files", nargs="+")
    args = ap.parse_args(argv)
    for name in args.files:
        print(json.dumps(check(Path(name), args.rows)), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
