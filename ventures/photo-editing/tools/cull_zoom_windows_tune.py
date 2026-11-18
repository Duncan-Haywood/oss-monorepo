"""Tune the cull's zoom windows on the tune half (2026-11-18, eval/cull-zoom-windows-2026-11-18.md).

Run from ventures/photo-editing after tools/cull_crop_grouping_eval.py has cut the frames:
    PYTHONPATH=src python3 tools/cull_zoom_windows_tune.py WORK [--held]
"""
import itertools
import json
import sys
from pathlib import Path

sys.path.insert(0, "tools")
from cull_crop_grouping_eval import pairs, variants  # noqa: E402
from shootflow.cull import NEAR_DUPLICATE_MAX_DISTANCE, crop_match  # noqa: E402
from shootflow.frame_analysis import (  # noqa: E402
    FRAME_HEIGHT as H, FRAME_WIDTH as W, _integral, _window_dhash, crop_dhashes, dhash_hex)

work = Path(sys.argv[1])
HELD = "--held" in sys.argv
SCALE_SETS = {
    "4": (0.96, 0.94, 0.92, 0.90),
    "2": (0.95, 0.91),
    "3": (0.95, 0.92, 0.89),
    "5": (0.965, 0.95, 0.935, 0.92, 0.905),
}
GRIDS = (3, 5)


def zoom_windows(table, scales, n):
    out = {}
    for s in scales:
        lst = []
        for j in range(n):
            for i in range(n):
                x0 = (1 - s) * W * i / (n - 1)
                y0 = (1 - s) * H * j / (n - 1)
                lst.append(_window_dhash(table, x0, y0, s * W, s * H))
        out[s] = lst
    return out


ids = sorted({p.name.split("_")[0] for p in (work / "frames").iterdir()})
names = [v[0] for v in variants()]
cache = work / "proto_cache.json"
if cache.exists():
    data = json.loads(cache.read_text())
else:
    data = {}
    for ident in ids:
        for name in names:
            f = work / "frames" / f"{ident}_{name}.gray"
            if not f.exists():
                continue
            frame = f.read_bytes()
            table = _integral(frame, W, H)
            rec = {"h": int(dhash_hex(frame), 16), "c": [int(h, 16) for h in crop_dhashes(frame)]}
            for key, scales in SCALE_SETS.items():
                for n in GRIDS:
                    z = zoom_windows(table, scales, n)
                    rec[f"z{key}_{n}"] = [h for s in scales for h in z[s]]
            data[f"{ident}_{name}"] = rec
    cache.write_text(json.dumps(data))


def half(ident):
    return "tune" if int(ident) % 2 == 0 else "held"


want = "held" if HELD else "tune"
pos = [(ident, kind, a, b) for ident in ids if half(ident) == want for kind, a, b in pairs()
       if f"{ident}_{a}" in data and f"{ident}_{b}" in data]
neg = [(x, y) for x, y in itertools.combinations([i for i in ids if half(i) == want], 2)]


def zdist(ra, rb, key):
    best = 64
    for h in rb[key]:
        best = min(best, (ra["h"] ^ h).bit_count())
    for h in ra[key]:
        best = min(best, (rb["h"] ^ h).bit_count())
    return best


def score(key, T, G, L):
    def ok(ra, rb):
        d = (ra["h"] ^ rb["h"]).bit_count()
        if d <= NEAR_DUPLICATE_MAX_DISTANCE or crop_match(d, ra["c"], rb["c"]):
            return True
        if key is None or d > L:
            return False
        zd = zdist(ra, rb, key)
        return zd <= T and zd <= d - G
    rec = sum(ok(data[f"{i}_{a}"], data[f"{i}_{b}"]) for i, _, a, b in pos) / len(pos)
    fm = sum(ok(data[f"{x}_full"], data[f"{y}_full"]) for x, y in neg)
    zoom = [p for p in pos if p[1].startswith("zoom")]
    zrec = sum(ok(data[f"{i}_{a}"], data[f"{i}_{b}"]) for i, _, a, b in zoom) / len(zoom)
    return rec, fm, zrec


base = score(None, 0, 0, 0)
print(want, "shipped:", base)
if len(sys.argv) > 3 and sys.argv[2] == "--pick":
    key, T, G, L = sys.argv[3], *map(int, sys.argv[4:7])
    print(key, T, G, L, score(key, T, G, L))
    raise SystemExit
results = []
for key in [f"z{k}_{n}" for k in SCALE_SETS for n in GRIDS]:
    for T in (4, 5, 6, 7, 8):
        for G in (0, 3, 4, 5, 6):
            for L in (20, 24, 28):
                r = score(key, T, G, L)
                results.append((key, T, G, L, *r))
ok = [r for r in results if r[5] <= base[1] + 2]
ok.sort(key=lambda r: (-r[4], r[5]))
for r in ok[:15]:
    print(r)
json.dump(results, open(work / f"proto_{want}.json", "w"))
