"""How often a file's LensSpecification (or DNG LensInfo) alone picks one lens in lensfun's database.

For every lens lensfun lists (any mount) with a name that states its focal and f-number range and no
teleconverter, this pretends the body wrote no lens name, only the four LensSpecification values: the focal
range and the widest f-number at each end, read from the lens's own name. ``lens_profiles.find_lenses_by_range``
then runs with a camera on the lens's first mount and a crop factor its calibrations allow, once with both
f-numbers (``marked``, what ShootFlow does for a LensSpecification) and once with only the short end's
(the single aperture a Canon maker note gives), so the two hints can be compared on the same lenses.

- **picked**: the lens alone fits (ShootFlow corrects with it and says so in a note);
- **tied**: the lens and others fit (refused, the candidates listed: pass --lens);
- **lost**: the lens itself does not fit (should not happen: a bug in the filters).

Usage: python3 tools/lens_spec_check.py LENSFUN_DATA_DB_DIR
"""

from __future__ import annotations

import collections
import sys

sys.path.insert(0, __file__.rsplit("/tools/", 1)[0] + "/src")

from shootflow import lens_profiles as lp  # noqa: E402


def brand(mount: str) -> str:
    return mount.split()[0]


def main(path: str) -> int:
    db = lp.load_db(path)
    counts = {k: collections.Counter() for k in ("marked", "single")}
    by_brand: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    examples: dict[str, list[str]] = collections.defaultdict(list)
    seen: set[str] = set()
    skipped = 0
    for lens in db.lenses:
        if not lens.mounts or lens.name in seen or lp._with_extender(lens):
            continue
        r = next((x for x in map(lp.name_range, lens.models) if x is not None), None)
        if r is None:
            skipped += 1
            continue
        seen.add(lens.name)
        lo, hi, a1, a2 = r
        mount = lens.mounts[0]
        crop = min((cs.crop for cs in lens.calibrations), default=1.0)
        camera = lp.Camera((brand(mount),), ("test body",), mount, crop)
        for kind, args in (("marked", dict(aperture=None, marked=(a1, a2))), ("single", dict(aperture=a1))):
            found = [x.name for x in lp.find_lenses_by_range(db, lo, hi, camera=camera, **args)]
            verdict = "lost" if lens.name not in found else ("picked" if len(found) == 1 else "tied")
            counts[kind][verdict] += 1
            if kind == "marked":
                by_brand[brand(mount)][verdict] += 1
                if len(examples[verdict]) < 5:
                    examples[verdict].append(f"{lens.name}: {', '.join(found[:4]) or '-'}")
    print(f"{len(seen)} lenses with a stated range ({skipped} without), one case each")
    for kind, label in (("marked", "both f-numbers (LensSpecification)"), ("single", "short-end f-number only")):
        c = counts[kind]
        n = sum(c.values())
        print(f"  {label}: picked {c['picked']} ({100 * c['picked'] / n:.1f}%), tied {c['tied']}, lost {c['lost']}")
    print("  by mount maker (both f-numbers):")
    for b, c in sorted(by_brand.items(), key=lambda kv: -sum(kv[1].values())):
        n = sum(c.values())
        if n >= 20:
            print(f"    {b:12s} {n:4d}: picked {c['picked']:4d} ({100 * c['picked'] / n:5.1f}%), tied {c['tied']}")
    for kind in ("picked", "tied", "lost"):
        for e in examples[kind]:
            print(f"  e.g. {kind}: {e}")
    return 1 if counts["marked"]["lost"] or counts["single"]["lost"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "lensfun/data/db"))
