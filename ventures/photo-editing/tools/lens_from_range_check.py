"""How often a Canon raw's maker-note focal range and aperture alone pick one lens in lensfun's database.

For every lens lensfun lists on a Canon mount (EF, EF-S, EF-M, RF, RF-S), with a name that states its focal and
f-number range and no teleconverter, this pretends a Canon body sent no lens name: only the range and the
widest f-number at the short end, then at the long end (what CameraSettings index 26 reports, see
``cr2.lens_hint``). ``lens_profiles.find_lenses_by_range`` then runs with a camera on the lens's own mount and a
crop factor its calibrations allow. Each case is one of:

- **picked**: the lens alone fits (ShootFlow corrects with it and says so in a note);
- **tied**: the lens and others fit (refused, the candidates listed: pass --lens);
- **lost**: the lens itself does not fit (should not happen: a bug in the filters).

Usage: python3 tools/lens_from_range_check.py LENSFUN_DATA_DB_DIR
"""

from __future__ import annotations

import collections
import sys

sys.path.insert(0, __file__.rsplit("/tools/", 1)[0] + "/src")

from shootflow import lens_profiles as lp  # noqa: E402

CANON_MOUNTS = ("Canon EF", "Canon EF-S", "Canon EF-M", "Canon RF", "Canon RF-S")


def main(path: str) -> int:
    db = lp.load_db(path)
    counts: collections.Counter = collections.Counter()
    tie_sizes: collections.Counter = collections.Counter()
    by_mount: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    examples: dict[str, list[str]] = collections.defaultdict(list)
    seen: set[str] = set()
    for lens in db.lenses:
        mount = next((m for m in lens.mounts if m in CANON_MOUNTS), None)
        if mount is None or lens.name in seen or lp._with_extender(lens):
            continue
        r = next((x for x in map(lp.name_range, lens.models) if x is not None), None)
        if r is None:
            counts["no range in the name"] += 1
            continue
        seen.add(lens.name)
        lo, hi, a1, a2 = r
        crop = min((cs.crop for cs in lens.calibrations), default=1.0)
        camera = lp.Camera(("Canon",), ("test body",), mount, crop)
        for end, aperture in (("short", a1), ("long", a2)):
            if end == "long" and lo == hi and a1 == a2:
                continue  # a prime: one case
            found = [x.name for x in lp.find_lenses_by_range(db, lo, hi, aperture, camera)]
            kind = "lost" if lens.name not in found else ("picked" if len(found) == 1 else "tied")
            counts[kind] += 1
            by_mount[mount][kind] += 1
            if kind == "tied":
                tie_sizes[len(found)] += 1
            if len(examples[kind]) < 6:
                examples[kind].append(f"{lens.name} at f/{aperture:g}: {', '.join(found[:4]) or '-'}")
    total = counts["picked"] + counts["tied"] + counts["lost"]
    print(f"{len(seen)} Canon-mount lenses with a stated range ({counts['no range in the name']} without); {total} cases")
    for kind in ("picked", "tied", "lost"):
        print(f"  {kind:7s} {counts[kind]:5d}  {100 * counts[kind] / max(total, 1):5.1f}%")
    for mount in CANON_MOUNTS:
        c = by_mount[mount]
        n = sum(c.values())
        if n:
            print(f"  {mount:11s} {n:4d} cases: picked {c['picked']}, tied {c['tied']}, lost {c['lost']}")
    print("  tie sizes:", dict(sorted(tie_sizes.items())))
    for kind in ("picked", "tied", "lost"):
        for e in examples[kind]:
            print(f"  e.g. {kind}: {e}")
    return 1 if counts["lost"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "lensfun/data/db"))
