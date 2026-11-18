"""Tune the cull's wide-pan pass on the tune half (2026-11-18, eval/cull-pan-windows-2026-11-18.md).

Run from ventures/photo-editing after tools/cull_crop_grouping_eval.py has cut the frames:
    PYTHONPATH=src python3 tools/cull_pan_windows_tune.py WORK            # grid on the tune half
    PYTHONPATH=src python3 tools/cull_pan_windows_tune.py WORK --held MODE T G L   # one setting, held out

The crop pass (2026-11-17) compares one frame's centre 88% window with every
window of the other, so it reaches content shifts of up to half the 12% margin.
A pan of s keeps 1 - s of the photo, so the content moves s / (1 - s) of the
frame: 8.7% at s = 0.08, 11.1% at 0.10. This scores comparing the off-centre
window pairs whose offset is beyond that (the same stored crop hashes), either
one pair per offset ("rep") or every pair with that offset ("all").
"""
import itertools
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, "tools")
from cull_crop_grouping_eval import pairs  # noqa: E402
from shootflow.cull import burst_match  # noqa: E402
from shootflow.frame_analysis import (  # noqa: E402
    CROP_STEPS, crop_dhashes, dhash_hex, pan_distance, zoom_dhashes, zoom_index)

N = CROP_STEPS
C = N // 2


def far_pairs(mode):
    """(index in a, index in b) for the window offsets the centre comparison cannot reach."""

    out = []
    for dy in range(-(N - 1), N):
        for dx in range(-(N - 1), N):
            if abs(dx) <= C and abs(dy) <= C:
                continue
            cands = [(ay * N + ax, (ay - dy) * N + (ax - dx))
                     for ay in range(N) for ax in range(N)
                     if 0 <= ay - dy < N and 0 <= ax - dx < N]
            if mode == "all":
                out += cands
            else:
                # the pair nearest the middle of both frames
                out.append(min(cands, key=lambda p: abs(p[0] // N - C) + abs(p[0] % N - C) + abs(p[1] // N - C) + abs(p[1] % N - C)))
    return tuple(out)


def _hash(path):
    frame = Path(path).read_bytes()
    return path, int(dhash_hex(frame), 16), [int(h, 16) for h in crop_dhashes(frame)], [int(h, 16) for h in zoom_dhashes(frame)]


def load(work):
    cache = work / "pan_cache.json"
    if cache.exists():
        return json.loads(cache.read_text())
    files = sorted(str(p) for p in (work / "frames").iterdir())
    data = {}
    with ProcessPoolExecutor() as pool:
        for path, h, c, z in pool.map(_hash, files, chunksize=64):
            data[Path(path).stem] = {"h": h, "c": c, "z": z}
    cache.write_text(json.dumps(data))
    return data


def main():
    work = Path(sys.argv[1])
    data = load(work)
    ids = sorted({k.split("_")[0] for k in data})
    for rec in data.values():
        rec["zi"] = zoom_index(rec["z"])

    def half(ident):
        return "tune" if int(ident) % 2 == 0 else "held"

    want = "held" if "--held" in sys.argv else "tune"
    pos = [(i, kind, a, b) for i in ids if half(i) == want for kind, a, b in pairs()
           if f"{i}_{a}" in data and f"{i}_{b}" in data]
    neg = list(itertools.combinations([i for i in ids if half(i) == want], 2))

    def shipped(ra, rb):
        d = (ra["h"] ^ rb["h"]).bit_count()
        return d, burst_match(d, ra["h"], ra["c"], ra["zi"], rb["h"], rb["c"], rb["zi"])

    # Precompute per pair: whole distance, shipped verdict, far-window distance per mode.
    modes = {"rep": None, "all": far_pairs("all")}

    def row(ra, rb):
        d, ok = shipped(ra, rb)
        ca, cb = ra["c"], rb["c"]
        fp = modes["all"]
        far = {"rep": pan_distance(ca, cb), "all": min((ca[x] ^ cb[y]).bit_count() for x, y in fp)}
        return d, ok, far

    P = [(kind, b, *row(data[f"{i}_{a}"], data[f"{i}_{b}"])) for i, kind, a, b in pos]
    Q = [row(data[f"{x}_full"], data[f"{y}_full"]) for x, y in neg]

    def score(mode, T, G, L):
        def ok(d, base, far):
            return base or (mode is not None and d <= L and far[mode] <= min(T, d - G))
        rec = sum(ok(d, s, f) for _, _, d, s, f in P) / len(P)
        fm = sum(ok(d, s, f) for d, s, f in Q)
        pan = [p for p in P if p[0].startswith("pan") and p[1].endswith(("0.08", "0.1"))]
        prec = sum(ok(d, s, f) for _, _, d, s, f in pan) / len(pan)
        return round(rec, 4), fm, round(prec, 3)

    base = score(None, 0, 0, 0)
    print(want, f"{len(P)} burst pairs, {len(Q)} distinct pairs; shipped (recall, false merges, 8-10% pan recall):", base)
    if len(sys.argv) > 3 and sys.argv[2] == "--held" or "--pick" in sys.argv:
        k = sys.argv.index("--held" if "--held" in sys.argv else "--pick")
        mode, T, G, L = sys.argv[k + 1], *map(int, sys.argv[k + 2:k + 5])
        print(mode, T, G, L, score(mode, T, G, L))
        by = {}
        for kind, b, d, s, f in P:
            size = b.lstrip("panLRUDTBzomCQP")
            if kind.startswith("pan"):
                key = (kind, size)
                n, x, y = by.get(key, (0, 0, 0))
                new = s or (d <= L and f[mode] <= min(T, d - G))
                by[key] = (n + 1, x + s, y + new)
        for (kind, size), (n, x, y) in sorted(by.items()):
            print(f"    {kind:10s} {size:6s} n={n:3d}  {x / n:.2f} -> {y / n:.2f}")
        return
    results = []
    for mode in modes:
        for T in (4, 5, 6, 7, 8):
            for G in (0, 3, 4, 5, 6, 8):
                for L in (20, 24, 28, 32, 36):
                    results.append((mode, T, G, L, *score(mode, T, G, L)))
    good = [r for r in results if r[5] <= base[1] + 2]
    good.sort(key=lambda r: (-r[4], r[5]))
    for r in good[:20]:
        print(r)
    (work / f"pan_{want}.json").write_text(json.dumps(results))


if __name__ == "__main__":
    main()
