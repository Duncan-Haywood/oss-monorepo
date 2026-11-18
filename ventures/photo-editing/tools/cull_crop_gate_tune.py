"""Tune the crop pass's whole-frame gate on the tune half (2026-11-18, eval/cull-crop-gate-2026-11-18.md).

Run from ventures/photo-editing after tools/cull_crop_grouping_eval.py has cut the frames:
    PYTHONPATH=src python3 tools/cull_crop_gate_tune.py WORK                 # grid on the tune half
    PYTHONPATH=src python3 tools/cull_crop_gate_tune.py WORK --why 0.06      # why pans of that size miss
    PYTHONPATH=src python3 tools/cull_crop_gate_tune.py WORK --held T G L    # one setting, held out

The 6% pans that the shipped rule missed (0.75-0.86 recall) all line their
centre window up with a window of the other frame to within 0-7 bits; what
stops them is the gate: their whole frames are 25-33 bits apart, past
CROP_CANDIDATE_MAX_DISTANCE (24). The wide-pan pass, gated at 44, compares only
the offsets the crop pass cannot reach, so nothing looked at them. This grid
scores the crop pass's threshold T, gain G and gate L with every other pass as
shipped.
"""
import collections
import itertools
import sys
from pathlib import Path

sys.path.insert(0, "tools")
from cull_crop_grouping_eval import pairs  # noqa: E402
from cull_pan_windows_tune import load  # noqa: E402
from shootflow import cull  # noqa: E402
from shootflow.frame_analysis import crop_distance, pan_pack, zoom_index  # noqa: E402


def others(d, ra, rb):
    """Every pass but the crop pass, as shipped."""

    return (
        d <= cull.NEAR_DUPLICATE_MAX_DISTANCE
        or cull.pan_match(d, ra["p"], rb["p"])
        or cull.zoom_match(d, ra["h"], ra["zi"], rb["h"], rb["zi"])
    )


def main():
    work = Path(sys.argv[1])
    data = load(work)
    for rec in data.values():
        rec["zi"] = zoom_index(rec["z"])
        rec["p"] = pan_pack(rec["c"])
    ids = sorted({k.split("_")[0] for k in data})

    def half(ident):
        return "tune" if int(ident) % 2 == 0 else "held"

    want = "held" if "--held" in sys.argv else "tune"
    pos = [(kind, b, data[f"{i}_{a}"], data[f"{i}_{b}"]) for i in ids if half(i) == want
           for kind, a, b in pairs() if f"{i}_{a}" in data and f"{i}_{b}" in data]
    neg = [(data[f"{x}_full"], data[f"{y}_full"])
           for x, y in itertools.combinations([i for i in ids if half(i) == want], 2)]

    def row(ra, rb):
        d = (ra["h"] ^ rb["h"]).bit_count()
        return d, others(d, ra, rb), crop_distance(ra["c"], rb["c"])

    P = [(kind, b, *row(ra, rb)) for kind, b, ra, rb in pos]
    Q = [row(ra, rb) for ra, rb in neg]

    if "--why" in sys.argv:
        size = sys.argv[sys.argv.index("--why") + 1]
        why = collections.Counter()
        for kind, b, d, rest, cd in P:
            if not kind.startswith("pan") or not b.endswith(size):
                continue
            if rest or (d <= cull.CROP_CANDIDATE_MAX_DISTANCE and cd <= min(cull.CROP_MAX_DISTANCE, d - cull.CROP_MIN_GAIN)):
                why["grouped"] += 1
            elif d > cull.CROP_CANDIDATE_MAX_DISTANCE:
                why[f"whole frames {d} apart > gate; crop windows {cd} apart"] += 1
            elif cd > cull.CROP_MAX_DISTANCE:
                why["crop windows too far"] += 1
            else:
                why["gain too small"] += 1
        for k, v in sorted(why.items(), key=lambda kv: -kv[1]):
            print(f"{v:4d}  {k}")
        return

    def score(T, G, L):
        def ok(d, rest, cd):
            return rest or (d <= L and cd <= min(T, d - G))
        rec = sum(ok(d, r, c) for _, _, d, r, c in P) / len(P)
        fm = sum(ok(*q) for q in Q)
        six = [p for p in P if p[0].startswith("pan") and p[1].endswith("0.06")]
        return round(rec, 4), fm, round(sum(ok(d, r, c) for _, _, d, r, c in six) / len(six), 3)

    shipped = (cull.CROP_MAX_DISTANCE, cull.CROP_MIN_GAIN, cull.CROP_CANDIDATE_MAX_DISTANCE)
    base = score(*shipped)
    print(want, f"{len(P)} burst pairs, {len(Q)} distinct pairs; shipped {shipped} (recall, false merges, 6% pan recall):", base)
    if "--held" in sys.argv:
        k = sys.argv.index("--held")
        T, G, L = map(int, sys.argv[k + 1:k + 4])
        print((T, G, L), score(T, G, L))
        by = {}
        for kind, b, d, r, c in P:
            if not kind.startswith("pan"):
                continue
            key = (kind, b.lstrip("panLRUDTB"))
            n, x, y = by.get(key, (0, 0, 0))
            old = r or (d <= shipped[2] and c <= min(shipped[0], d - shipped[1]))
            new = r or (d <= L and c <= min(T, d - G))
            by[key] = (n + 1, x + old, y + new)
        for (kind, size), (n, x, y) in sorted(by.items()):
            print(f"    {kind:10s} {size:6s} n={n:3d}  {x / n:.2f} -> {y / n:.2f}")
        return
    results = [(T, G, L, *score(T, G, L))
               for T in (3, 4, 5, 6, 7) for G in (3, 5, 6, 8, 10, 12, 16)
               for L in (24, 28, 32, 36, 40, 44)]
    good = sorted((r for r in results if r[4] <= base[1] + 2), key=lambda r: (-r[3], r[4]))
    for r in good[:20]:
        print(r)


if __name__ == "__main__":
    main()
