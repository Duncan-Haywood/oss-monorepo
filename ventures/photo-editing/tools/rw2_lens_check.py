"""Which lens an RW2 names, and which lensfun lens that picks, against two other readers.

For each RW2 given:

- the lens name ``rw2.rw2_exif`` reads from the embedded JPEG's Panasonic maker note (LensType, 0x51),
  and the lens serial (0x52), next to what metadata-extractor printed for the same file (its
  ``metadata/java/<file>.txt`` beside the samples, when present: an independent reader);
- the lens ``lens_profiles.correction_for`` picks from a lensfun database folder (master's data/db), and
  what the compiled lensfun 0.3.4 picks for the same camera and name (``lensfunpy``, its bundled
  database), when lensfunpy is installed.

Usage: python3 tools/rw2_lens_check.py LENSFUN_DATA_DB_DIR FILE.rw2 [...]
Prints one JSON row per file.
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys

sys.path.insert(0, __file__.rsplit("/tools/", 1)[0] + "/src")

from shootflow import lens_profiles as lp  # noqa: E402
from shootflow import raw_develop as rd  # noqa: E402
from shootflow import rw2  # noqa: E402


def extractor_says(path: str) -> dict[str, str]:
    txt = os.path.join(os.path.dirname(path), "metadata", "java", os.path.basename(path) + ".txt")
    out: dict[str, str] = {}
    if not os.path.exists(txt):
        return out
    for line in open(txt, encoding="utf-8", errors="replace"):
        m = re.match(r"\[Panasonic Makernote - 0x(0051|0052)\] [^=]+= (.*)$", line.rstrip("\n"))
        if m:
            out["lens_type" if m.group(1) == "0051" else "lens_serial"] = m.group(2).strip()
    return out


def released_pick(make: str, model: str, name: str | None):
    try:
        import lensfunpy
    except ImportError:
        return None
    db = lensfunpy.Database()
    cams = db.find_cameras(make, model)
    if not cams:
        return "camera not in lensfun 0.3.4"
    lenses = db.find_lenses(cams[0], None, name) if name else db.find_lenses(cams[0])
    return [lens.model for lens in lenses[:3]]


def main(db_dir: str, files: list[str]) -> int:
    db = lp.load_db(sorted(glob.glob(os.path.join(db_dir, "*.xml"))))
    for path in files:
        data = open(path, "rb").read()
        reader = rd._Reader(data)
        ifd0 = rd._all_ifds(reader)[0]
        exif, note = rw2.rw2_exif(data, reader, ifd0)
        _, pana = rw2.embedded_exif(data, ifd0)
        info = lp.shot_info(ifd0, exif)
        row = {
            "file": os.path.basename(path),
            "camera": f"{info.make} {info.model}",
            "ours_lens_type": info.lens,
            "ours_lens_serial": (rw2._text(pana.get(rw2.PANA_NOTE_LENS_SERIAL)) or None) if pana else None,
            "metadata_extractor": extractor_says(path) or None,
            "focal": info.focal, "aperture": info.aperture, "focal_35mm": info.focal_35mm,
            "note": note,
        }
        try:
            corr = lp.correction_for(db, info, 4000, 3000)
            row["ours_lensfun_master"] = corr.lens.name
            row["ours_notes"] = [n for n in corr.notes if "tied" in n or "fixed-lens" in n]
        except lp.LensProfileError as exc:
            row["ours_lensfun_master"] = f"refused: {exc}"
        row["lensfun_0.3.4"] = released_pick(info.make or "", info.model or "", info.lens)
        print(json.dumps(row))
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2:]))
