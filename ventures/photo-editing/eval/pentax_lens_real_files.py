"""Pentax lens numbers read from real files, and what ShootFlow does with them with and without a lens memory.

For each file: the maker note's lens number, the lens codes' focal length and f-numbers next to the EXIF
focal length, then ``lens_profiles.correction_for`` with no memory (a Pentax file names no lens) and with a
memory holding one entry per number, the lens a photographer would name once with ``--lens`` (the names are
lensfun's for the lens ExifTool's table gives for that number; the table is consulted here, not shipped).

Usage: PYTHONPATH=src python3 eval/pentax_lens_real_files.py LENSFUN_DB_DIR FILE...
Results: eval/pentax-lens-memory-2026-11-14.md
"""

from __future__ import annotations

import os
import sys

from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd

# One --lens per lens the photographer owns: number -> lensfun name.
MEMORY = {
    "Pentax lens 8 227": "smc Pentax DA* 60-250mm f/4 [IF] SDM",
    "Pentax lens 4 24": "smc Pentax-FA 77mm f/1.8 Limited",
    "Pentax lens 3 44": "Sigma 10-20mm f/4-5.6 EX DC",
}


def tags(path: str):
    data = open(path, "rb").read()
    if data[:2] == b"\xff\xd8":
        data = data[data.index(b"Exif\0\0") + 6:]
    reader = rd._Reader(data)
    ifd0, _ = reader.read_ifd(reader.first_ifd_offset())
    exif = None
    off = ifd0.get(rd.TAG_EXIF_IFD)
    if off:
        exif, _ = reader.read_ifd(int(off[0]))
    return ifd0, exif


def verdict(db, info, memory=None) -> str:
    try:
        corr = lp.correction_for(db, info, 6000, 4000, vignetting=False, memory=memory)
    except lp.LensProfileError as exc:
        return "refused: " + str(exc)[:160]
    return "-> " + corr.lens.name + (" (remembered)" if corr.remembered else "")


def main(db_dir: str, files: list[str]) -> int:
    db = lp.load_db(db_dir)
    for path in files:
        ifd0, exif = tags(path)
        info = lp.shot_info(ifd0, exif)
        pentax = lp.pentax_lens(ifd0, exif)
        print(f"{os.path.basename(path)} | {info.model} | EXIF lens {info.lens!r}, focal {info.focal}, f/{info.aperture}")
        if pentax is None:
            print("    no Pentax lens number")
            continue
        print(f"    {pentax.key} ({pentax.source}): lens focal {pentax.focal}, widest at shot f/{pentax.max_aperture}, "
              f"nominal widest f/{pentax.nominal_max}")
        print(f"    no memory: {verdict(db, info)}")
        print(f"    memory:    {verdict(db, info, MEMORY)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2:]))
