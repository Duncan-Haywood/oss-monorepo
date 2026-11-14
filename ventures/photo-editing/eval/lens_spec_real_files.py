"""Which real raw files name no lens but carry LensSpecification or DNG LensInfo, and what ShootFlow picks.

Reads IFD0 and the EXIF IFD of each file given (DNG, NEF, ARW, PEF, ORF, RW2, SRW: all TIFF-shaped; only the
first few MB are needed), prints make, model, LensModel, the four LensSpecification / LensInfo values and,
with a lensfun database, what ``lens_profiles.correction_for`` would do with the tags alone (lens name
dropped), next to what it does with the file's own name.

Usage: PYTHONPATH=src python3 eval/lens_spec_real_files.py LENSFUN_DB_DIR FILE...
Results: eval/lens-specification-2026-11-14.md
"""

from __future__ import annotations

import os
import sys

from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd


def tags(path: str):
    data = open(path, "rb").read()
    reader = rd._Reader(data)
    ifd0, _ = reader.read_ifd(reader.first_ifd_offset())
    exif = None
    off = ifd0.get(rd.TAG_EXIF_IFD)
    if off:
        exif, _ = reader.read_ifd(int(off[0]))
    return ifd0, exif


def verdict(db, info) -> str:
    try:
        corr = lp.correction_for(db, info, 6000, 4000, vignetting=False)
    except lp.LensProfileError as exc:
        return "refused: " + str(exc)[:150]
    return "-> " + corr.lens.name


def main(db_dir: str, files: list[str]) -> int:
    db = lp.load_db(db_dir)
    for path in files:
        try:
            ifd0, exif = tags(path)
        except Exception as exc:  # a truncated or non-TIFF file
            print(f"{os.path.basename(path)}: unreadable ({type(exc).__name__})")
            continue
        info = lp.shot_info(ifd0, exif)
        hint = info.hint
        spec = "-" if hint is None else f"{hint.short:g}-{hint.long:g} mm, f/{hint.marked}" + f" ({hint.source})"
        line = f"{os.path.basename(path)} | {info.make} {info.model} | lens {info.lens!r} | {spec}"
        if hint is not None:
            bare = lp.ShotInfo(info.make, info.model, None, None, info.focal, info.focal_35mm, info.aperture,
                               info.distance, hint)
            line += f"\n    tags only: {verdict(db, bare)}"
            if info.lens:
                own = lp.ShotInfo(info.make, info.model, info.lens, info.lens_make, info.focal, info.focal_35mm,
                                  info.aperture, info.distance, None)
                line += f"\n    own name : {verdict(db, own)}"
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2:]))
