"""Tune the cull's fine-offset pass on the tune half (2026-11-18, eval/cull-fine-offsets-2026-11-18.md).

Run from ventures/photo-editing after tools/cull_crop_grouping_eval.py has cut the frames:
    PYTHONPATH=src python3 tools/cull_fine_offsets_tune.py WORK                # grid on the tune half
    PYTHONPATH=src python3 tools/cull_fine_offsets_tune.py WORK --why 0.1      # misses of one pan size
    PYTHONPATH=src python3 tools/cull_fine_offsets_tune.py WORK --held T G L   # one setting, held out

The crop and wide-pan passes compare 88% windows on a 3% grid, so they line up
content shifts that are multiples of 3%. A pan of s moves the content
s / (1 - s): 11.1% for a 10% pan, 7.5% for 7%. The fine pass adds windows at
1% and 2% (``frame_analysis.FINE_MARKS``) and compares one window pair per
whole-percent offset off the 3% lattice. This scores its threshold T, gain G
and whole-frame gate L with every other pass as shipped before it.
"""
import collections
import itertools
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, "tools")
from cull_crop_grouping_eval import pairs  # noqa: E402
from shootflow import cull  # noqa: E402
from shootflow.frame_analysis import (  # noqa: E402
    crop_dhashes, dhash_hex, fine_dhashes, fine_distance, pan_distance, crop_distance, zoom_dhashes, zoom_index)


def _hash(path):
    frame = Path(path).read_bytes()
    ints = lambda hs: [int(h, 16) for h in hs]  # noqa: E731
    return (path, int(dhash_hex(frame), 16), ints(crop_dhashes(frame)), ints(zoom_dhashes(frame)),
            ints(fine_dhashes(frame)))


def load(work):
    cache = work / "fine_cache.json"
    data = json.loads(cache.read_text()) if cache.exists() else {}
    files = sorted(str(p) for p in (work / "frames").iterdir() if p.stem not in data)
    if files:
        with ProcessPoolExecutor() as pool:
            for path, h, c, z, f in pool.map(_hash, files, chunksize=64):
                data[Path(path).stem] = {"h": h, "c": c, "z": z, "f": f}
        cache.write_text(json.dumps(data))
    return data


def before(d, ra, rb):
    """Every pass shipped before the fine one."""

    return cull.burst_match(d, ra["h"], ra["c"], ra["zi"], rb["h"], rb["c"], rb["zi"])


def main():
    work = Path(sys.argv[1])
    data = load(work)
    for rec in data.values():
        rec["zi"] = zoom_index(rec["z"])
    ids = sorted({k.split("_")[0] for k in data})

    def half(ident):
        return "tune" if int(ident) % 2 == 0 else "held"

    want = "held" if "--held" in sys.argv else "tune"
    pos = [(kind, b, data[f"{i}_{a}"], data[f"{i}_{b}"]) for i in ids if half(i) == want
           for kind, a, b in pairs() if f"{i}_{a}" in data and f"{i}_{b}" in data]
    neg = [(data[f"{x}_full"], data[f"{y}_full"])
           for x, y in itertools.combinations([i for i in ids if half(i) == want], 2)
           if f"{x}_full" in data and f"{y}_full" in data]

    def row(ra, rb):
        d = (ra["h"] ^ rb["h"]).bit_count()
        return d, before(d, ra, rb), fine_distance(ra["c"], ra["f"], rb["c"], rb["f"])

    P = [(kind, b, *row(ra, rb)) for kind, b, ra, rb in pos]
    Q = [row(ra, rb) for ra, rb in neg]

    if "--why" in sys.argv:
        size = sys.argv[sys.argv.index("--why") + 1]
        why = collections.Counter()
        for (kind, b, d, old, fd), (_, _, ra, rb) in zip(P, pos):
            if not kind.startswith("pan") or b.lstrip("panLRUDTB") != size:
                continue
            coarse = min(crop_distance(ra["c"], rb["c"]), pan_distance(ra["c"], rb["c"]))
            why["grouped before" if old else f"missed: whole {d // 5 * 5}-{d // 5 * 5 + 4}, coarse {coarse}, fine {fd}"] += 1
        for k, v in sorted(why.items(), key=lambda kv: -kv[1]):
            print(f"{v:4d}  {k}")
        return

    def ok(d, old, fd, T, G, L):
        return old or (d <= L and fd <= min(T, d - G))

    def score(T, G, L):
        rec = sum(ok(d, o, f, T, G, L) for _, _, d, o, f in P) / len(P)
        fm = sum(ok(*q, T, G, L) for q in Q)
        pans = [p for p in P if p[0].startswith("pan")]
        return round(rec, 4), fm, round(sum(ok(d, o, f, T, G, L) for _, _, d, o, f in pans) / len(pans), 4)

    base = score(-1, 99, -1)
    print(want, f"{len(P)} burst pairs, {len(Q)} distinct pairs; before the fine pass "
          "(recall, false merges, pan recall):", base)
    if "--held" in sys.argv:
        k = sys.argv.index("--held")
        T, G, L = map(int, sys.argv[k + 1:k + 4])
        print((T, G, L), score(T, G, L))
        by = {}
        for kind, b, d, o, f in P:
            size = b.lstrip("panLRUDTBzomCQP") or b
            key = (kind, size)
            n, x, y = by.get(key, (0, 0, 0))
            by[key] = (n + 1, x + o, y + ok(d, o, f, T, G, L))
        for (kind, size), (n, x, y) in sorted(by.items()):
            print(f"    {kind:10s} {size:6s} n={n:3d}  {x / n:.2f} -> {y / n:.2f}")
        return
    results = [(T, G, L, *score(T, G, L))
               for T in (2, 3, 4, 5, 6) for G in (4, 6, 8, 10, 12, 16)
               for L in (28, 32, 36, 40, 44)]
    good = sorted((r for r in results if r[4] <= base[1] + 2), key=lambda r: (-r[3], r[4]))
    for r in good[:20]:
        print(r)


if __name__ == "__main__":
    main()
