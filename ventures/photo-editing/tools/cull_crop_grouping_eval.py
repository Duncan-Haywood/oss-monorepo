"""Score the cull's burst grouping on burst-like pairs cut from real photos.

    PYTHONPATH=src python3 tools/cull_crop_grouping_eval.py --corpus DIR --work DIR

DIR holds distinct real photos (2026-11-17: the 332 JPEGs in ``jpg/`` of
github.com/drewnoakes/metadata-extractor-images, one decode failure). Each is
decoded once at 1280x720 grey, then ffmpeg cuts burst-like variants at the
cull's own 320x180 analysis size: pan pairs (two windows of one photo offset
2-10% horizontally, vertically or diagonally), zooms (the whole photo against a
3-10% crop at the centre or a corner) and brightness changes. Positives are
those pairs; negatives are every pair of two different photos. Photos with an
even index are the tune half (where the constants in ``cull.py`` were picked),
odd ones the held-out half.

It reports, per half, burst-pair recall and false merges for the whole-frame
rule alone (distance <= NEAR_DUPLICATE_MAX_DISTANCE), with the equal-size crop
windows (2026-11-17, ``crop_match``) and for the shipped rule (``burst_match``:
those, or the zoom windows of 2026-11-18), then recall by variant kind. Single linkage can
chain merges in a real shoot; this scores pairs only. The pans and zooms are
cut from one exposure, so subject motion, parallax and lens changes between
real burst frames are not in it.
"""

from __future__ import annotations

import argparse
import collections
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from shootflow.cull import NEAR_DUPLICATE_MAX_DISTANCE, burst_match, crop_match
from shootflow.frame_analysis import FRAME_HEIGHT, FRAME_WIDTH, crop_dhashes, dhash_hex, zoom_dhashes, zoom_index

PANS = (0.02, 0.04, 0.06, 0.08, 0.10)
# 0.05, 0.07 and 0.09 added 2026-11-18 after the zoom windows (sizes 0.96-0.90) were picked on the other sizes.
ZOOMS = (0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10)


def variants() -> list[tuple[str, float, float, float, float]]:
    """(name, crop size, x offset, y offset, brightness), all as fractions of the photo."""

    out = [("full", 1.0, 0.0, 0.0, 0.0)]
    for s in PANS:
        w = 1 - s
        out += [
            (f"panL{s}", w, 0, s / 2, 0), (f"panR{s}", w, s, s / 2, 0),
            (f"panU{s}", w, s / 2, 0, 0), (f"panD{s}", w, s / 2, s, 0),
            (f"panTL{s}", w, 0, 0, 0), (f"panBR{s}", w, s, s, 0),
        ]
    for z in ZOOMS:
        w = 1 - z
        out += [(f"zoomC{z}", w, z / 2, z / 2, 0), (f"zoomBR{z}", w, z, z, 0), (f"zoomTL{z}", w, 0, 0, 0)]
        # Off-grid crops (added 2026-11-18, after the zoom windows' 0 / half / whole offsets were chosen):
        # the kept part sits a quarter of the way in on one axis and three quarters on the other.
        out += [(f"zoomQ{z}", w, z / 4, 3 * z / 4, 0), (f"zoomP{z}", w, 3 * z / 4, z / 4, 0)]
    return out + [("dark", 1, 0, 0, -0.15), ("bright", 1, 0, 0, 0.12)]


def pairs() -> list[tuple[str, str, str]]:
    """(kind, frame a, frame b) for every positive pair one photo yields."""

    out = []
    for s in PANS:
        out += [("pan-h", f"panL{s}", f"panR{s}"), ("pan-v", f"panU{s}", f"panD{s}"), ("pan-diag", f"panTL{s}", f"panBR{s}")]
    for z in ZOOMS:
        out += [(f"zoom-{where}", "full", f"zoom{where}{z}") for where in ("C", "BR", "TL")]
        out += [("zoom-off", "full", f"zoom{where}{z}") for where in ("Q", "P")]
    return out + [("brightness", "full", "dark"), ("brightness", "full", "bright")]


def _ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", *args], check=True, timeout=120)


def build_frames(corpus: Path, work: Path) -> list[str]:
    pgm, frames = work / "pgm", work / "frames"
    pgm.mkdir(parents=True, exist_ok=True)
    frames.mkdir(exist_ok=True)
    photos = sorted(p for p in corpus.iterdir() if p.suffix.lower() in (".jpg", ".jpeg"))
    ids = []
    for index, photo in enumerate(photos):
        dst = pgm / f"{index:03d}.pgm"
        if not dst.exists():
            try:
                _ffmpeg(["-i", f"file:{photo}", "-vf", "scale=1280:720:flags=area,format=gray", "-frames:v", "1", "-y", str(dst)])
            except subprocess.CalledProcessError:
                print(f"skip (ffmpeg could not decode): {photo.name}")
                continue
        ids.append(f"{index:03d}")

    def cut(job: tuple[str, tuple[str, float, float, float, float]]) -> None:
        ident, (name, size, x, y, bright) = job
        dst = frames / f"{ident}_{name}.gray"
        if dst.exists():
            return
        vf = f"crop=iw*{size}:ih*{size}:iw*{x}:ih*{y},scale={FRAME_WIDTH}:{FRAME_HEIGHT}:flags=area"
        if bright:
            vf += f",eq=brightness={bright}"
        _ffmpeg(["-i", str(pgm / f"{ident}.pgm"), "-vf", vf + ",format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-y", str(dst)])

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(cut, [(i, v) for i in ids for v in variants()]))
    return ids


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--json", type=Path, help="write per-pair distances here")
    args = parser.parse_args()
    ids = build_frames(args.corpus, args.work)
    hashes: dict[tuple[str, str], tuple[int, tuple[int, ...]]] = {}
    for ident in ids:
        for name, *_ in variants():
            frame = (args.work / "frames" / f"{ident}_{name}.gray").read_bytes()
            hashes[(ident, name)] = (
                int(dhash_hex(frame), 16),
                tuple(int(h, 16) for h in crop_dhashes(frame)),
                zoom_index(tuple(int(h, 16) for h in zoom_dhashes(frame))),
            )

    Hashes = tuple[int, tuple[int, ...], tuple]

    def judge(a: Hashes, b: Hashes) -> tuple[int, bool, bool, bool]:
        """Distance; whole frame only; with crop windows (2026-11-17); shipped (crop and zoom windows)."""

        distance = (a[0] ^ b[0]).bit_count()
        old = distance <= NEAR_DUPLICATE_MAX_DISTANCE
        crops = old or crop_match(distance, a[1], b[1])
        return distance, old, crops, burst_match(distance, a[0], a[1], a[2], b[0], b[1], b[2])

    def half(ident: str) -> str:
        return "tune" if int(ident) % 2 == 0 else "held"

    rows = {"pos": [], "neg": []}
    for ident in ids:
        for kind, a, b in pairs():
            rows["pos"].append((half(ident), kind, b, *judge(hashes[(ident, a)], hashes[(ident, b)])))
    for x, first in enumerate(ids):
        for second in ids[x + 1:]:
            if half(first) == half(second):
                verdict = judge(hashes[(first, "full")], hashes[(second, "full")])
                rows["neg"].append((half(first), first, second, *verdict))
    for name in ("tune", "held"):
        pos = [r for r in rows["pos"] if r[0] == name]
        neg = [r for r in rows["neg"] if r[0] == name]
        print(f"{name}: {len(pos)} burst pairs, {len(neg)} distinct-photo pairs")
        print(f"  whole frame only: recall {sum(r[4] for r in pos) / len(pos):.3f}, false merges {sum(r[4] for r in neg)}")
        print(f"  crop windows:     recall {sum(r[5] for r in pos) / len(pos):.3f}, false merges {sum(r[5] for r in neg)}")
        print(f"  shipped rule:     recall {sum(r[6] for r in pos) / len(pos):.3f}, false merges {sum(r[6] for r in neg)}")
        by = collections.defaultdict(lambda: [0, 0, 0, 0])
        for r in pos:
            size = r[2].lstrip("panLRUDTBzomCQP") or r[2]
            key = (r[1], size)
            by[key][0] += 1
            by[key][1] += r[4]
            by[key][2] += r[5]
            by[key][3] += r[6]
        for (kind, size), (n, old, crops, new) in sorted(by.items()):
            print(f"    {kind:10s} {size:6s} n={n:3d}  {old / n:.2f} -> {crops / n:.2f} -> {new / n:.2f}")
    if args.json:
        args.json.write_text(json.dumps(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
